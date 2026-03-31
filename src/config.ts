import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { PluginConfig } from './types';

import { randomBytes } from 'crypto';

function generateVerifyKey(): string {
    return randomBytes(8).toString('hex');
}

export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    port: 8080,
    verifyKey: generateVerifyKey(),
    debug: false,
    enableHttp: true,
    enableWs: true,
    enableReverseWs: false,
    enableWebhook: false,
    reverseWs: {
        destinations: [],
        reservedSyncId: '-1',
    },
    webhook: {
        destinations: [],
        extraHeaders: {},
        timeout: 10000,
    },
};

export function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
    return ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: #FB7299; border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 600;">Mirai API HTTP</h3>
                <p style="margin: 0; font-size: 13px; opacity: 0.85;">mirai-api-http 协议兼容层，支持 Ariadne 等客户端连接</p>
            </div>
        `),
        ctx.NapCatConfig.boolean('enabled', '启用插件', true, '是否启用 mirai-api-http 服务'),
        ctx.NapCatConfig.number('port', '监听端口', 8080, 'HTTP/WS 服务监听端口'),
        ctx.NapCatConfig.text('verifyKey', '验证密钥', DEFAULT_CONFIG.verifyKey, '客户端连接时使用的 verifyKey'),
        ctx.NapCatConfig.boolean('debug', '调试模式', false, '启用后将输出详细的调试日志'),
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #2d2d2d; border-radius: 8px; margin: 16px 0 8px 0; color: #ccc;">
                <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #FB7299;">适配器开关</h4>
                <p style="margin: 0; font-size: 12px; opacity: 0.7;">控制各协议适配器的启用状态</p>
            </div>
        `),
        ctx.NapCatConfig.boolean('enableHttp', '启用 HTTP', true, '启用 HTTP API 适配器'),
        ctx.NapCatConfig.boolean('enableWs', '启用 WebSocket', true, '启用正向 WebSocket 适配器'),
        ctx.NapCatConfig.boolean('enableReverseWs', '启用反向 WebSocket', false, '启用反向 WebSocket 适配器（插件主动连接远程）'),
        ctx.NapCatConfig.boolean('enableWebhook', '启用 Webhook', false, '启用 Webhook 适配器（POST 事件到远程 URL）'),
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #2d2d2d; border-radius: 8px; margin: 16px 0 8px 0; color: #ccc;">
                <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #FB7299;">反向 WebSocket 配置</h4>
                <p style="margin: 0; font-size: 12px; opacity: 0.7;">JSON 格式，destinations 为数组，每项包含 url, reconnectInterval, extraHeaders</p>
            </div>
        `),
        ctx.NapCatConfig.text('reverseWs', '反向 WS 配置 (JSON)', JSON.stringify(DEFAULT_CONFIG.reverseWs), '格式: {"destinations":[{"url":"ws://...","reconnectInterval":5000,"extraHeaders":{}}],"reservedSyncId":"-1"}'),
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #2d2d2d; border-radius: 8px; margin: 16px 0 8px 0; color: #ccc;">
                <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #FB7299;">Webhook 配置</h4>
                <p style="margin: 0; font-size: 12px; opacity: 0.7;">JSON 格式，destinations 为 URL 数组</p>
            </div>
        `),
        ctx.NapCatConfig.text('webhook', 'Webhook 配置 (JSON)', JSON.stringify(DEFAULT_CONFIG.webhook), '格式: {"destinations":["http://..."],"extraHeaders":{},"timeout":10000}'),
    );
}

function parseJsonField<T>(value: unknown, fallback: T): T {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'object') return value as T;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }
    return fallback;
}

export function sanitizeConfig(raw: unknown): PluginConfig {
    const cfg: PluginConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (raw && typeof raw === 'object') {
        const r = raw as Record<string, unknown>;
        if (typeof r.enabled === 'boolean') cfg.enabled = r.enabled;
        if (typeof r.port === 'number' && r.port > 0 && r.port < 65536) cfg.port = r.port;
        if (typeof r.verifyKey === 'string') cfg.verifyKey = r.verifyKey;
        if (typeof r.debug === 'boolean') cfg.debug = r.debug;
        if (typeof r.enableHttp === 'boolean') cfg.enableHttp = r.enableHttp;
        if (typeof r.enableWs === 'boolean') cfg.enableWs = r.enableWs;
        if (typeof r.enableReverseWs === 'boolean') cfg.enableReverseWs = r.enableReverseWs;
        if (typeof r.enableWebhook === 'boolean') cfg.enableWebhook = r.enableWebhook;

        // Parse reverseWs (may be JSON string from WebUI or object from file)
        const rws = parseJsonField<Record<string, unknown>>(r.reverseWs, {});
        if (rws) {
            if (Array.isArray(rws.destinations)) {
                cfg.reverseWs.destinations = rws.destinations.map((d: unknown) => {
                    const dest = d as Record<string, unknown>;
                    return {
                        url: typeof dest.url === 'string' ? dest.url : '',
                        reconnectInterval: typeof dest.reconnectInterval === 'number' ? dest.reconnectInterval : 5000,
                        extraHeaders: (dest.extraHeaders && typeof dest.extraHeaders === 'object')
                            ? dest.extraHeaders as Record<string, string>
                            : {},
                    };
                }).filter(d => d.url.length > 0);
            }
            if (typeof rws.reservedSyncId === 'string') {
                cfg.reverseWs.reservedSyncId = rws.reservedSyncId;
            }
        }

        // Parse webhook (may be JSON string from WebUI or object from file)
        const wh = parseJsonField<Record<string, unknown>>(r.webhook, {});
        if (wh) {
            if (Array.isArray(wh.destinations)) {
                cfg.webhook.destinations = wh.destinations.filter((d: unknown) => typeof d === 'string' && d.length > 0) as string[];
            }
            if (wh.extraHeaders && typeof wh.extraHeaders === 'object') {
                cfg.webhook.extraHeaders = wh.extraHeaders as Record<string, string>;
            }
            if (typeof wh.timeout === 'number' && wh.timeout > 0) {
                cfg.webhook.timeout = wh.timeout;
            }
        }
    }
    return cfg;
}
