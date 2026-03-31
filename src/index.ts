import http from 'http';
import type {
    PluginModule,
    PluginConfigSchema,
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { sessionManager } from './core/session';
import { messageCache } from './core/cache';
import { convertOB11Event } from './converter/event';
import { createHttpHandler } from './server/http-server';
import { wsServer } from './server/ws-server';
import { reverseWsManager } from './server/reverse-ws';
import { webhookManager } from './server/webhook';
import { registerWebUI } from './webui';
import type { PluginConfig, OB11Event, CachedMessage } from './types';

let httpServer: http.Server | null = null;

export let plugin_config_ui: PluginConfigSchema = [];

export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
    try {
        pluginState.init(ctx);
        ctx.logger.info('Mirai API HTTP plugin initializing...');

        plugin_config_ui = buildConfigSchema(ctx);

        // Register WebUI routes (always, even if plugin disabled – so user can re-enable)
        registerWebUI(ctx);

        if (!pluginState.config.enabled) {
            ctx.logger.info('Plugin disabled by config');
            return;
        }

        sessionManager.start();

        // Start HTTP/WS server if either HTTP or WS is enabled
        if (pluginState.config.enableHttp || pluginState.config.enableWs) {
            const httpHandler = createHttpHandler();
            httpServer = http.createServer(httpHandler);

            if (pluginState.config.enableWs) {
                wsServer.start(httpServer);
            }

            const port = pluginState.config.port;
            httpServer.listen(port, () => {
                ctx.logger.info(`Mirai API HTTP server listening on port ${port}`);
                if (pluginState.config.enableHttp) {
                    ctx.logger.info(`  HTTP: http://localhost:${port}/`);
                }
                if (pluginState.config.enableWs) {
                    ctx.logger.info(`  WS:   ws://localhost:${port}/all?verifyKey=***&qq=***`);
                }
            });

            httpServer.on('error', (err) => {
                ctx.logger.error('HTTP server error:', err);
            });
        }

        // Start Reverse WebSocket if enabled
        if (pluginState.config.enableReverseWs) {
            reverseWsManager.start();
        }

        if (pluginState.config.enableWebhook) {
            ctx.logger.info(`Webhook enabled with ${pluginState.config.webhook.destinations.length} destination(s)`);
        }

        ctx.logger.info('Mirai API HTTP plugin initialized');
    } catch (error) {
        ctx.logger.error('Plugin initialization failed:', error);
    }
};

export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
    if (!pluginState.config.enabled) return;

    const ob11Event = event as OB11Event;
    const miraiEvent = convertOB11Event(ob11Event);
    if (!miraiEvent) return;

    if (pluginState.config.debug) {
        ctx.logger.debug('Converted message event:', JSON.stringify(miraiEvent).slice(0, 200));
    }

    // Cache the message for messageFromId
    if ('messageChain' in miraiEvent && 'sender' in miraiEvent) {
        const chain = miraiEvent.messageChain;
        const source = chain.find((e) => e.type === 'Source');
        if (source && source.type === 'Source') {
            const cached: CachedMessage = {
                messageId: source.id,
                messageChain: chain,
                sender: miraiEvent.sender as CachedMessage['sender'],
                type: miraiEvent.type as CachedMessage['type'],
                target: ob11Event.group_id ? Number(ob11Event.group_id) : undefined,
                timestamp: Date.now(),
            };
            messageCache.store(cached);
        }
    }

    // Push to WS clients
    wsServer.pushEvent(miraiEvent);

    // Push to HTTP session queues
    sessionManager.pushEvent(miraiEvent);

    // Push to reverse WS destinations
    if (pluginState.config.enableReverseWs) {
        reverseWsManager.pushEvent(miraiEvent);
    }

    // Push to webhook destinations
    if (pluginState.config.enableWebhook) {
        webhookManager.pushEvent(miraiEvent);
    }
};

export const plugin_onevent: PluginModule['plugin_onevent'] = async (ctx, event) => {
    if (!pluginState.config.enabled) return;

    const ob11Event = event as OB11Event;

    // Skip message events (handled by plugin_onmessage)
    if (ob11Event.post_type === 'message' || ob11Event.post_type === 'message_sent') return;

    const miraiEvent = convertOB11Event(ob11Event);
    if (!miraiEvent) return;

    if (pluginState.config.debug) {
        ctx.logger.debug('Converted event:', JSON.stringify(miraiEvent).slice(0, 200));
    }

    wsServer.pushEvent(miraiEvent);
    sessionManager.pushEvent(miraiEvent);

    // Push to reverse WS destinations
    if (pluginState.config.enableReverseWs) {
        reverseWsManager.pushEvent(miraiEvent);
    }

    // Push to webhook destinations
    if (pluginState.config.enableWebhook) {
        webhookManager.pushEvent(miraiEvent);
    }
};

export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
    try {
        reverseWsManager.stop();
        wsServer.stop();

        if (httpServer) {
            httpServer.close();
            httpServer = null;
        }

        sessionManager.stop();
        messageCache.clear();
        pluginState.cleanup();

        ctx.logger.info('Mirai API HTTP plugin unloaded');
    } catch (e) {
        ctx.logger.warn('Error during plugin cleanup:', e);
    }
};

export const plugin_get_config: PluginModule['plugin_get_config'] = async (ctx) => {
    return pluginState.config;
};

export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
    pluginState.replaceConfig(config as PluginConfig);
    ctx.logger.info('Config updated via WebUI');
};

export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
    ctx, ui, key, value, currentConfig
) => {
    try {
        pluginState.updateConfig({ [key]: value } as Partial<PluginConfig>);
        ctx.logger.debug(`Config key ${key} updated`);
    } catch (err) {
        ctx.logger.error(`Failed to update config key ${key}:`, err);
    }
};
