import type { CachedMessage, MiraiMessageChainElement } from '../types';

const MAX_CACHE_SIZE = 4096;

class MessageCache {
    private cache: Map<number, CachedMessage> = new Map();
    private order: number[] = [];

    store(msg: CachedMessage): void {
        if (this.cache.has(msg.messageId)) return;
        this.cache.set(msg.messageId, msg);
        this.order.push(msg.messageId);
        while (this.order.length > MAX_CACHE_SIZE) {
            const oldest = this.order.shift();
            if (oldest !== undefined) {
                this.cache.delete(oldest);
            }
        }
    }

    get(messageId: number): CachedMessage | undefined {
        return this.cache.get(messageId);
    }

    clear(): void {
        this.cache.clear();
        this.order = [];
    }
}

export const messageCache = new MessageCache();
