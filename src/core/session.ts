import crypto from 'crypto';
import type { MiraiSession, MiraiEvent } from '../types';

const MAX_QUEUE_SIZE = 200;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

class SessionManager {
    private sessions: Map<string, MiraiSession> = new Map();
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    start(): void {
        this.cleanupTimer = setInterval(() => this.cleanupExpired(), 60_000);
    }

    stop(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.sessions.clear();
    }

    verify(verifyKey: string, expectedKey: string): { code: number; session?: string; msg?: string } {
        if (verifyKey !== expectedKey) {
            return { code: 1, msg: 'Wrong verify key' };
        }
        const sessionKey = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        this.sessions.set(sessionKey, {
            sessionKey,
            qq: null,
            verified: true,
            messageQueue: [],
            lastAccess: Date.now(),
        });
        return { code: 0, session: sessionKey };
    }

    bind(sessionKey: string, qq: number): { code: number; msg: string } {
        const session = this.sessions.get(sessionKey);
        if (!session) {
            return { code: 3, msg: 'Session does not exist or has expired' };
        }
        session.qq = qq;
        session.lastAccess = Date.now();
        return { code: 0, msg: 'success' };
    }

    release(sessionKey: string, qq: number): { code: number; msg: string } {
        const session = this.sessions.get(sessionKey);
        if (!session) {
            return { code: 3, msg: 'Session does not exist or has expired' };
        }
        if (session.qq !== qq) {
            return { code: 2, msg: 'Bot not bound to this session' };
        }
        this.sessions.delete(sessionKey);
        return { code: 0, msg: 'success' };
    }

    getSession(sessionKey: string): MiraiSession | undefined {
        const session = this.sessions.get(sessionKey);
        if (session) {
            session.lastAccess = Date.now();
        }
        return session;
    }

    isAuthenticated(sessionKey: string): boolean {
        const session = this.sessions.get(sessionKey);
        return !!session && session.verified && session.qq !== null;
    }

    getOrCreateSessionForWs(verifyKey: string, expectedKey: string, qq: number): { code: number; session?: string; msg?: string } {
        if (verifyKey !== expectedKey) {
            return { code: 1, msg: 'Wrong verify key' };
        }
        const sessionKey = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        this.sessions.set(sessionKey, {
            sessionKey,
            qq,
            verified: true,
            messageQueue: [],
            lastAccess: Date.now(),
        });
        return { code: 0, session: sessionKey };
    }

    pushEvent(event: MiraiEvent): void {
        for (const session of this.sessions.values()) {
            if (session.qq !== null) {
                session.messageQueue.push(event);
                if (session.messageQueue.length > MAX_QUEUE_SIZE) {
                    session.messageQueue.shift();
                }
            }
        }
    }

    fetchMessages(sessionKey: string, count: number): MiraiEvent[] {
        const session = this.sessions.get(sessionKey);
        if (!session) return [];
        session.lastAccess = Date.now();
        const msgs = session.messageQueue.splice(0, count);
        return msgs;
    }

    fetchLatestMessages(sessionKey: string, count: number): MiraiEvent[] {
        const session = this.sessions.get(sessionKey);
        if (!session) return [];
        session.lastAccess = Date.now();
        const msgs = session.messageQueue.splice(-count);
        return msgs;
    }

    peekMessages(sessionKey: string, count: number): MiraiEvent[] {
        const session = this.sessions.get(sessionKey);
        if (!session) return [];
        session.lastAccess = Date.now();
        return session.messageQueue.slice(0, count);
    }

    peekLatestMessages(sessionKey: string, count: number): MiraiEvent[] {
        const session = this.sessions.get(sessionKey);
        if (!session) return [];
        session.lastAccess = Date.now();
        return session.messageQueue.slice(-count);
    }

    countMessages(sessionKey: string): number {
        const session = this.sessions.get(sessionKey);
        return session ? session.messageQueue.length : 0;
    }

    listSessions(): Array<{ sessionKey: string; qq: number | null; verified: boolean; messageCount: number; lastAccess: number }> {
        const result: Array<{ sessionKey: string; qq: number | null; verified: boolean; messageCount: number; lastAccess: number }> = [];
        for (const session of this.sessions.values()) {
            result.push({
                sessionKey: session.sessionKey,
                qq: session.qq,
                verified: session.verified,
                messageCount: session.messageQueue.length,
                lastAccess: session.lastAccess,
            });
        }
        return result;
    }

    private cleanupExpired(): void {
        const now = Date.now();
        for (const [key, session] of this.sessions) {
            if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
                this.sessions.delete(key);
            }
        }
    }
}

export const sessionManager = new SessionManager();
