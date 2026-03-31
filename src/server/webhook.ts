import { pluginState } from '../core/state';
import { routeCommand } from '../api/handlers';
import type { MiraiEvent } from '../types';

class WebhookManager {
    pushEvent(event: MiraiEvent): void {
        const config = pluginState.config.webhook;
        if (!config.destinations || config.destinations.length === 0) return;

        for (const url of config.destinations) {
            this.postEvent(url, event, config.extraHeaders, config.timeout).catch((e) => {
                pluginState.logger.error(`[Webhook] Failed to POST to ${url}:`, e);
            });
        }
    }

    private async postEvent(
        url: string,
        event: MiraiEvent,
        extraHeaders: Record<string, string>,
        timeout: number,
    ): Promise<void> {
        const body = JSON.stringify(event);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'qq': String(pluginState.selfId),
            ...extraHeaders,
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout || 10000);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
            });

            if (!response.ok) {
                pluginState.logger.warn(`[Webhook] ${url} responded with status ${response.status}`);
                return;
            }

            // Check if the response contains a command to execute
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                try {
                    const respBody = await response.json() as Record<string, unknown>;
                    if (respBody && typeof respBody.command === 'string') {
                        const command = respBody.command as string;
                        const content = (respBody.content ?? {}) as Record<string, unknown>;
                        pluginState.logger.debug(`[Webhook] Received command from ${url}: ${command}`);
                        await routeCommand(command, content);
                    }
                } catch {
                    // Response wasn't valid JSON command, ignore
                }
            }
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') {
                pluginState.logger.warn(`[Webhook] Request to ${url} timed out after ${timeout}ms`);
            } else {
                throw e;
            }
        } finally {
            clearTimeout(timer);
        }
    }
}

export const webhookManager = new WebhookManager();
