import WebSocket from 'ws';
import { pluginState } from '../core/state';
import { sessionManager } from '../core/session';
import { routeCommand } from '../api/handlers';
import type { MiraiEvent, ReverseWsDestination, WsOutgoingMessage, WsIncomingMessage } from '../types';

interface Connection {
    dest: ReverseWsDestination;
    ws: WebSocket | null;
    sessionKey: string;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    stopped: boolean;
}

class ReverseWsManager {
    private connections: Connection[] = [];

    start(): void {
        const { destinations } = pluginState.config.reverseWs;
        if (!destinations || destinations.length === 0) {
            pluginState.logger.info('[ReverseWS] No destinations configured');
            return;
        }

        for (const dest of destinations) {
            const conn: Connection = {
                dest,
                ws: null,
                sessionKey: '',
                reconnectTimer: null,
                stopped: false,
            };
            this.connections.push(conn);
            this.connect(conn);
        }

        pluginState.logger.info(`[ReverseWS] Connecting to ${destinations.length} destination(s)`);
    }

    stop(): void {
        for (const conn of this.connections) {
            conn.stopped = true;
            if (conn.reconnectTimer) {
                clearTimeout(conn.reconnectTimer);
                conn.reconnectTimer = null;
            }
            if (conn.ws) {
                try {
                    conn.ws.close(1000, 'Plugin shutting down');
                } catch {
                    // ignore
                }
                conn.ws = null;
            }
        }
        this.connections = [];
        pluginState.logger.info('[ReverseWS] All connections closed');
    }

    pushEvent(event: MiraiEvent): void {
        const syncId = pluginState.config.reverseWs.reservedSyncId || '-1';
        const msg: WsOutgoingMessage = { syncId, data: event };
        const payload = JSON.stringify(msg);

        for (const conn of this.connections) {
            if (conn.ws && conn.ws.readyState === WebSocket.OPEN && conn.sessionKey) {
                try {
                    conn.ws.send(payload);
                } catch {
                    // ignore send errors
                }
            }
        }
    }

    getConnectionCount(): number {
        return this.connections.filter(c => c.ws && c.ws.readyState === WebSocket.OPEN && c.sessionKey).length;
    }

    private connect(conn: Connection): void {
        if (conn.stopped) return;

        try {
            const headers: Record<string, string> = { ...conn.dest.extraHeaders };
            conn.ws = new WebSocket(conn.dest.url, { headers });

            conn.ws.on('open', () => {
                pluginState.logger.info(`[ReverseWS] Connected to ${conn.dest.url}`);
                this.sendVerify(conn);
            });

            conn.ws.on('message', async (data: Buffer | string) => {
                await this.handleMessage(conn, data);
            });

            conn.ws.on('close', (code, reason) => {
                pluginState.logger.info(`[ReverseWS] Disconnected from ${conn.dest.url} (code=${code}, reason=${reason?.toString()})`);
                conn.sessionKey = '';
                conn.ws = null;
                this.scheduleReconnect(conn);
            });

            conn.ws.on('error', (err) => {
                pluginState.logger.error(`[ReverseWS] Error on ${conn.dest.url}:`, err.message);
                // close event will fire after this, triggering reconnect
            });
        } catch (e) {
            pluginState.logger.error(`[ReverseWS] Failed to connect to ${conn.dest.url}:`, e);
            this.scheduleReconnect(conn);
        }
    }

    private sendVerify(conn: Connection): void {
        if (!conn.ws || conn.ws.readyState !== WebSocket.OPEN) return;

        const verifyMsg: WsIncomingMessage = {
            syncId: '1',
            command: 'verify',
            subCommand: null,
            content: {
                verifyKey: pluginState.config.verifyKey,
                sessionKey: '',
                qq: String(pluginState.selfId),
            },
        };

        conn.ws.send(JSON.stringify(verifyMsg));
    }

    private async handleMessage(conn: Connection, rawData: Buffer | string): Promise<void> {
        try {
            const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
            const msg = JSON.parse(text) as Record<string, unknown>;

            // Auth response: check if this is the verify response
            if (!conn.sessionKey) {
                const data = msg.data as Record<string, unknown> | undefined;
                if (data && typeof data.session === 'string') {
                    conn.sessionKey = data.session as string;
                    // Also create a local session for command routing
                    const result = sessionManager.getOrCreateSessionForWs(
                        pluginState.config.verifyKey,
                        pluginState.config.verifyKey,
                        pluginState.selfId
                    );
                    if (result.session) {
                        conn.sessionKey = result.session;
                    }
                    pluginState.logger.info(`[ReverseWS] Authenticated with ${conn.dest.url}, session=${conn.sessionKey}`);
                    return;
                } else if (data && typeof data.code === 'number' && data.code !== 0) {
                    pluginState.logger.error(`[ReverseWS] Auth failed on ${conn.dest.url}: ${JSON.stringify(data)}`);
                    conn.ws?.close(4001, 'Auth failed');
                    return;
                }
            }

            // Command from remote server
            const incoming = msg as WsIncomingMessage;
            if (!incoming.command) return;

            const syncId = incoming.syncId ?? '';
            const params: Record<string, unknown> = { ...incoming.content, sessionKey: conn.sessionKey };
            const result = await routeCommand(incoming.command, params);

            const response: WsOutgoingMessage = { syncId, data: result };
            if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
                conn.ws.send(JSON.stringify(response));
            }
        } catch (e) {
            pluginState.logger.error('[ReverseWS] Message handler error:', e);
        }
    }

    private scheduleReconnect(conn: Connection): void {
        if (conn.stopped) return;
        if (conn.reconnectTimer) return;

        const interval = conn.dest.reconnectInterval || 5000;
        pluginState.logger.debug(`[ReverseWS] Reconnecting to ${conn.dest.url} in ${interval}ms`);

        conn.reconnectTimer = setTimeout(() => {
            conn.reconnectTimer = null;
            this.connect(conn);
        }, interval);
    }
}

export const reverseWsManager = new ReverseWsManager();
