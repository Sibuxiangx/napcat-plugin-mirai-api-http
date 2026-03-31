import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { URL } from 'url';
import { pluginState } from '../core/state';
import { sessionManager } from '../core/session';
import { routeCommand } from '../api/handlers';
import type { MiraiEvent, WsIncomingMessage, WsOutgoingMessage } from '../types';

interface WsClient {
    ws: WebSocket;
    sessionKey: string;
    qq: number;
    channel: 'all' | 'message' | 'event';
}

class WsServerManager {
    private wss: WebSocketServer | null = null;
    private clients: Set<WsClient> = new Set();

    start(server: http.Server): void {
        this.wss = new WebSocketServer({ server });

        this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
            this.handleConnection(ws, req);
        });

        pluginState.logger.info('WebSocket server started');
    }

    stop(): void {
        for (const client of this.clients) {
            try {
                client.ws.close(1000, 'Server shutting down');
            } catch {
                // ignore
            }
        }
        this.clients.clear();

        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }

    private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const pathname = url.pathname;
        const verifyKey = url.searchParams.get('verifyKey') ?? '';
        const qq = Number(url.searchParams.get('qq') ?? 0);

        // Determine channel from path
        let channel: 'all' | 'message' | 'event' = 'all';
        if (pathname === '/message') channel = 'message';
        else if (pathname === '/event') channel = 'event';

        // One-step auth for WebSocket
        const result = sessionManager.getOrCreateSessionForWs(
            verifyKey,
            pluginState.config.verifyKey,
            qq
        );

        if (result.code !== 0) {
            const errorMsg: WsOutgoingMessage = {
                syncId: '',
                data: { code: result.code, msg: result.msg },
            };
            ws.send(JSON.stringify(errorMsg));
            ws.close(4001, result.msg);
            return;
        }

        // Send auth success
        const successMsg: WsOutgoingMessage = {
            syncId: '',
            data: { code: 0, session: result.session },
        };
        ws.send(JSON.stringify(successMsg));

        const client: WsClient = {
            ws,
            sessionKey: result.session!,
            qq,
            channel,
        };
        this.clients.add(client);

        pluginState.logger.debug(`WS client connected: qq=${qq} channel=${channel}`);

        ws.on('message', async (data: Buffer | string) => {
            await this.handleMessage(client, data);
        });

        ws.on('close', () => {
            this.clients.delete(client);
            pluginState.logger.debug(`WS client disconnected: qq=${qq}`);
        });

        ws.on('error', (err) => {
            pluginState.logger.error('WS client error:', err);
            this.clients.delete(client);
        });
    }

    private async handleMessage(client: WsClient, rawData: Buffer | string): Promise<void> {
        try {
            const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
            const msg = JSON.parse(text) as WsIncomingMessage;

            const syncId = msg.syncId ?? '';
            const command = msg.command ?? '';
            const content = msg.content ?? {};

            // Inject session key into params
            const params: Record<string, unknown> = { ...content, sessionKey: client.sessionKey };

            const result = await routeCommand(command, params);

            const response: WsOutgoingMessage = {
                syncId,
                data: result,
            };

            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(response));
            }
        } catch (e) {
            pluginState.logger.error('WS message handler error:', e);
            try {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify({
                        syncId: '',
                        data: { code: 400, msg: `Error: ${e}` },
                    }));
                }
            } catch {
                // ignore
            }
        }
    }

    /**
     * Get the number of connected WS clients.
     */
    getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Push a mirai event to all connected WS clients.
     */
    pushEvent(event: MiraiEvent): void {
        const isMessage = 'messageChain' in event;

        for (const client of this.clients) {
            // Filter by channel
            if (client.channel === 'message' && !isMessage) continue;
            if (client.channel === 'event' && isMessage) continue;

            const msg: WsOutgoingMessage = {
                syncId: '-1',
                data: event,
            };

            try {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(JSON.stringify(msg));
                }
            } catch {
                // ignore send errors
            }
        }
    }
}

export const wsServer = new WsServerManager();
