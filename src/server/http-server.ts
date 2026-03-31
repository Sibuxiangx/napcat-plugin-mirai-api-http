import http from 'http';
import { URL } from 'url';
import { pluginState } from '../core/state';
import { sessionManager } from '../core/session';
import {
    routeCommand,
    handleVerify,
    handleBind,
    handleRelease,
    handleSessionInfo,
    handleAbout,
    handleBotList,
    handleSendFriendMessage,
    handleSendGroupMessage,
    handleSendTempMessage,
    handleRecall,
    handleSendNudge,
    handleMessageFromId,
    handleCountMessage,
    handleFetchMessage,
    handleFetchLatestMessage,
    handlePeekMessage,
    handlePeekLatestMessage,
    handleFriendList,
    handleGroupList,
    handleMemberList,
    handleBotProfile,
    handleFriendProfile,
    handleMemberProfile,
    handleUserProfile,
    handleMute,
    handleUnmute,
    handleKick,
    handleQuit,
    handleMuteAll,
    handleUnmuteAll,
    handleSetEssence,
    handleGetGroupConfig,
    handleSetGroupConfig,
    handleGetMemberInfo,
    handleSetMemberInfo,
    handleMemberAdmin,
    handleRespNewFriendRequest,
    handleRespMemberJoinRequest,
    handleRespBotInvitedJoinGroup,
} from '../api/handlers';
import type { MiraiResponse } from '../types';
import { MiraiStatusCode } from '../types';

type RouteHandler = (params: Record<string, unknown>) => MiraiResponse | Promise<MiraiResponse>;

// Route table: method+path -> handler
const GET_ROUTES: Record<string, RouteHandler> = {
    '/about': () => handleAbout(),
    '/botList': () => handleBotList(),
    '/sessionInfo': (p) => handleSessionInfo(p),
    '/messageFromId': (p) => handleMessageFromId(p),
    '/countMessage': (p) => handleCountMessage(p),
    '/fetchMessage': (p) => handleFetchMessage(p),
    '/fetchLatestMessage': (p) => handleFetchLatestMessage(p),
    '/peekMessage': (p) => handlePeekMessage(p),
    '/peekLatestMessage': (p) => handlePeekLatestMessage(p),
    '/friendList': () => handleFriendList(),
    '/groupList': () => handleGroupList(),
    '/memberList': (p) => handleMemberList(p),
    '/botProfile': () => handleBotProfile(),
    '/friendProfile': (p) => handleFriendProfile(p),
    '/memberProfile': (p) => handleMemberProfile(p),
    '/userProfile': (p) => handleUserProfile(p),
    '/groupConfig': (p) => handleGetGroupConfig(p),
    '/memberInfo': (p) => handleGetMemberInfo(p),
};

const POST_ROUTES: Record<string, RouteHandler> = {
    '/verify': (p) => handleVerify(p),
    '/auth': (p) => handleVerify(p),
    '/bind': (p) => handleBind(p),
    '/release': (p) => handleRelease(p),
    '/sendFriendMessage': (p) => handleSendFriendMessage(p),
    '/sendGroupMessage': (p) => handleSendGroupMessage(p),
    '/sendTempMessage': (p) => handleSendTempMessage(p),
    '/recall': (p) => handleRecall(p),
    '/sendNudge': (p) => handleSendNudge(p),
    '/mute': (p) => handleMute(p),
    '/unmute': (p) => handleUnmute(p),
    '/kick': (p) => handleKick(p),
    '/quit': (p) => handleQuit(p),
    '/muteAll': (p) => handleMuteAll(p),
    '/unmuteAll': (p) => handleUnmuteAll(p),
    '/setEssence': (p) => handleSetEssence(p),
    '/groupConfig': (p) => handleSetGroupConfig(p),
    '/memberInfo': (p) => handleSetMemberInfo(p),
    '/memberAdmin': (p) => handleMemberAdmin(p),
    '/resp/newFriendRequestEvent': (p) => handleRespNewFriendRequest(p),
    '/resp/memberJoinRequestEvent': (p) => handleRespMemberJoinRequest(p),
    '/resp/botInvitedJoinGroupRequestEvent': (p) => handleRespBotInvitedJoinGroup(p),
    '/resp_newFriendRequestEvent': (p) => handleRespNewFriendRequest(p),
    '/resp_memberJoinRequestEvent': (p) => handleRespMemberJoinRequest(p),
    '/resp_botInvitedJoinGroupRequestEvent': (p) => handleRespBotInvitedJoinGroup(p),
};

// Session-less endpoints (don't require auth)
const SESSION_FREE_PATHS = new Set(['/verify', '/auth', '/bind', '/about', '/botList']);

function extractSessionKey(req: http.IncomingMessage, params: Record<string, unknown>): string {
    // 1. From JSON body
    if (params.sessionKey) return String(params.sessionKey);

    const headers = req.headers;

    // 2. From header: sessionKey
    if (headers.sessionkey) return String(headers.sessionkey);

    // 3. From Authorization header
    const auth = headers.authorization;
    if (auth) {
        const parts = auth.split(' ');
        if (parts.length >= 2) {
            const prefix = parts[0].toLowerCase();
            if (prefix === 'session' || prefix === 'sessionkey') {
                return parts[1];
            }
        }
    }

    // 4. From URL query
    return '';
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });
}

function sendJson(res: http.ServerResponse, data: unknown, statusCode = 200): void {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
}

export function createHttpHandler(): (req: http.IncomingMessage, res: http.ServerResponse) => void {
    return async (req: http.IncomingMessage, res: http.ServerResponse) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            });
            res.end();
            return;
        }

        try {
            const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
            const pathname = url.pathname;
            const method = (req.method ?? 'GET').toUpperCase();

            // Parse params from URL query
            const queryParams: Record<string, unknown> = {};
            for (const [key, value] of url.searchParams) {
                queryParams[key] = value;
            }

            // Parse JSON body for POST
            let bodyParams: Record<string, unknown> = {};
            if (method === 'POST') {
                try {
                    const body = await readBody(req);
                    if (body) {
                        bodyParams = JSON.parse(body);
                    }
                } catch {
                    // ignore parse errors
                }
            }

            // Merge params: body takes priority
            const params = { ...queryParams, ...bodyParams };

            // Extract session key from various sources
            const sessionKey = extractSessionKey(req, params);
            if (sessionKey) {
                params.sessionKey = sessionKey;
            }

            // Check authentication for non-free endpoints
            if (!SESSION_FREE_PATHS.has(pathname)) {
                if (!sessionKey || !sessionManager.isAuthenticated(sessionKey)) {
                    sendJson(res, {
                        code: MiraiStatusCode.NotAuthenticated,
                        msg: 'Session not authenticated. Please verify and bind first.',
                    });
                    return;
                }
            }

            // Route to handler
            let handler: RouteHandler | undefined;
            if (method === 'GET') {
                handler = GET_ROUTES[pathname];
            } else if (method === 'POST') {
                handler = POST_ROUTES[pathname];
                // Fall back to GET route for POST (some endpoints support both)
                if (!handler) handler = GET_ROUTES[pathname];
            }

            if (!handler) {
                sendJson(res, {
                    code: MiraiStatusCode.BadRequest,
                    msg: `Unknown endpoint: ${method} ${pathname}`,
                }, 404);
                return;
            }

            const result = await handler(params);
            sendJson(res, result);

        } catch (e) {
            pluginState.logger.error('HTTP handler error:', e);
            sendJson(res, {
                code: MiraiStatusCode.BadRequest,
                msg: `Internal error: ${e}`,
            }, 500);
        }
    };
}
