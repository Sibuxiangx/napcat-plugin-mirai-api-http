import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from './core/state';
import { sessionManager } from './core/session';
import { wsServer } from './server/ws-server';
import { reverseWsManager } from './server/reverse-ws';
import type { PluginConfig } from './types';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export function registerWebUI(ctx: NapCatPluginContext): void {
    // Write HTML to disk so NapCat's page() can find it
    const webuiDir = join(ctx.pluginPath, 'webui');
    if (!existsSync(webuiDir)) {
        mkdirSync(webuiDir, { recursive: true });
    }
    writeFileSync(join(webuiDir, 'index.html'), getDashboardHtml(), 'utf-8');

    ctx.router.page({
        path: 'dashboard',
        title: 'Mirai API HTTP',
        htmlFile: 'webui/index.html',
        description: 'mirai-api-http 管理面板',
        icon: '🔌',
    });

    registerApiRoutes(ctx);
}

function registerApiRoutes(ctx: NapCatPluginContext): void {
    // Status is safe to expose without auth (no secrets)
    ctx.router.getNoAuth('/status', (_req, res) => {
        res.json({
            code: 0,
            data: {
                enabled: pluginState.config.enabled,
                port: pluginState.config.port,
                httpEnabled: pluginState.config.enableHttp,
                wsEnabled: pluginState.config.enableWs,
                reverseWsEnabled: pluginState.config.enableReverseWs,
                webhookEnabled: pluginState.config.enableWebhook,
                wsClients: wsServer.getClientCount(),
                reverseWsConnections: reverseWsManager.getConnectionCount(),
                webhookDestinations: pluginState.config.webhook.destinations.length,
                uptime: process.uptime(),
                selfId: pluginState.selfId,
            },
        });
    });

    // Config and sessions require NapCat WebUI auth
    ctx.router.get('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    ctx.router.post('/config', async (req, res) => {
        const body = req.body as Record<string, unknown>;
        if (!body) {
            res.status(400).json({ code: -1, message: 'Empty body' });
            return;
        }
        pluginState.updateConfig(body as Partial<PluginConfig>);
        res.json({ code: 0, message: 'ok' });
    });

    ctx.router.get('/sessions', (_req, res) => {
        res.json({ code: 0, data: sessionManager.listSessions() });
    });
}

function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mirai API HTTP - Dashboard</title>
<style>
:root {
    --bg: #0f0f0f;
    --surface: #1a1a1a;
    --surface2: #242424;
    --border: #333;
    --text: #e0e0e0;
    --text-muted: #888;
    --accent: #FB7299;
    --accent-dim: rgba(251,114,153,0.15);
    --green: #4ade80;
    --yellow: #facc15;
    --red: #f87171;
    --blue: #60a5fa;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 24px;
    max-width: 960px;
    margin: 0 auto;
}
h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.subtitle { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
.card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
}
.card-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
}
.stat-item {
    background: var(--surface2);
    border-radius: 8px;
    padding: 14px 16px;
}
.stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; }
.badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
}
.badge-on { background: rgba(74,222,128,0.15); color: var(--green); }
.badge-off { background: rgba(248,113,113,0.15); color: var(--red); }
.adapters-row { display: flex; flex-wrap: wrap; gap: 8px; }
.adapter-chip {
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 500;
    background: var(--surface2);
    border: 1px solid var(--border);
}
.adapter-chip.on { border-color: var(--green); color: var(--green); }
.adapter-chip.off { border-color: var(--border); color: var(--text-muted); }
.config-section { margin-top: 8px; }
.field-group { margin-bottom: 12px; }
.field-label {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 4px;
    display: block;
}
input[type="text"], input[type="number"], textarea {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    padding: 8px 12px;
    font-size: 13px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    outline: none;
    transition: border-color 0.2s;
}
input:focus, textarea:focus { border-color: var(--accent); }
textarea { min-height: 80px; resize: vertical; }
.toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
}
.toggle-row:last-child { border-bottom: none; }
.toggle-label { font-size: 13px; }
.toggle {
    position: relative;
    width: 40px;
    height: 22px;
    cursor: pointer;
}
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle .slider {
    position: absolute;
    inset: 0;
    background: var(--surface2);
    border-radius: 11px;
    border: 1px solid var(--border);
    transition: 0.3s;
}
.toggle .slider:before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    bottom: 2px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: 0.3s;
}
.toggle input:checked + .slider { background: var(--accent-dim); border-color: var(--accent); }
.toggle input:checked + .slider:before { transform: translateX(18px); background: var(--accent); }
.btn {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.2s;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { opacity: 0.85; }
.btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--accent); }
.btn-row { display: flex; gap: 8px; margin-top: 16px; }
.sessions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
.sessions-table th {
    text-align: left;
    padding: 8px 12px;
    color: var(--text-muted);
    font-weight: 500;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
}
.sessions-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
}
.empty-state {
    text-align: center;
    color: var(--text-muted);
    padding: 24px;
    font-size: 13px;
}
.toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: #fff;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 1000;
}
.toast.show { opacity: 1; }
.toast-success { background: #16a34a; }
.toast-error { background: #dc2626; }
.refresh-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    border-radius: 4px;
    transition: 0.2s;
}
.refresh-btn:hover { color: var(--accent); }
</style>
</head>
<body>
<h1>🔌 Mirai API HTTP</h1>
<p class="subtitle">mirai-api-http 协议兼容层管理面板</p>

<!-- Status -->
<div class="card">
    <div class="card-title">
        📊 服务状态
        <button class="refresh-btn" onclick="loadStatus()" title="刷新">🔄</button>
    </div>
    <div class="stats-grid" id="statusGrid">
        <div class="stat-item"><div class="stat-label">加载中...</div></div>
    </div>
</div>

<!-- Adapters -->
<div class="card">
    <div class="card-title">🔗 适配器状态</div>
    <div class="adapters-row" id="adaptersRow"></div>
</div>

<!-- Config -->
<div class="card">
    <div class="card-title">⚙️ 配置</div>
    <div class="config-section" id="configSection">
        <div class="empty-state">加载中...</div>
    </div>
</div>

<!-- Sessions -->
<div class="card">
    <div class="card-title">
        🔑 会话列表
        <button class="refresh-btn" onclick="loadSessions()" title="刷新">🔄</button>
    </div>
    <div id="sessionsContainer">
        <div class="empty-state">加载中...</div>
    </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function() {
    const pathMatch = window.location.pathname.match(/\\/plugin\\/([^/]+)\\//);
    const pluginId = pathMatch ? pathMatch[1] : 'napcat-plugin-mirai-api-http';
    const noAuthBase = '/plugin/' + pluginId + '/api';
    const authBase = '/api/Plugin/ext/' + pluginId;

    let currentConfig = null;

    function showToast(msg, type) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast toast-' + type + ' show';
        setTimeout(function() { t.className = 'toast'; }, 2500);
    }

    function formatUptime(s) {
        var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
            m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
        var parts = [];
        if (d > 0) parts.push(d + '天');
        if (h > 0) parts.push(h + '时');
        if (m > 0) parts.push(m + '分');
        parts.push(sec + '秒');
        return parts.join('');
    }

    async function apiFetch(path, opts, needAuth) {
        try {
            var base = needAuth ? authBase : noAuthBase;
            var res = await fetch(base + path, opts);
            if (res.status === 401 || res.status === 403) {
                showToast('需要登录 NapCat WebUI', 'error');
                return null;
            }
            return await res.json();
        } catch (e) {
            showToast('请求失败: ' + e.message, 'error');
            return null;
        }
    }

    async function loadStatus() {
        var resp = await apiFetch('/status');
        if (!resp || resp.code !== 0) return;
        var d = resp.data;
        var grid = document.getElementById('statusGrid');
        grid.innerHTML = [
            statItem('Bot QQ', d.selfId || '未知'),
            statItem('监听端口', d.port),
            statItem('WS 客户端', d.wsClients),
            statItem('反向 WS 连接', d.reverseWsConnections),
            statItem('Webhook 目标', d.webhookDestinations),
            statItem('运行时间', formatUptime(d.uptime)),
        ].join('');

        var adapters = document.getElementById('adaptersRow');
        adapters.innerHTML = [
            adapterChip('HTTP', d.httpEnabled),
            adapterChip('WebSocket', d.wsEnabled),
            adapterChip('反向 WS', d.reverseWsEnabled),
            adapterChip('Webhook', d.webhookEnabled),
        ].join('');
    }

    function statItem(label, value) {
        return '<div class="stat-item"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '</div></div>';
    }

    function adapterChip(name, on) {
        return '<div class="adapter-chip ' + (on ? 'on' : 'off') + '">' + (on ? '● ' : '○ ') + name + '</div>';
    }

    async function loadConfig() {
        var resp = await apiFetch('/config', null, true);
        if (!resp || resp.code !== 0) return;
        currentConfig = resp.data;
        renderConfig(currentConfig);
    }

    function renderConfig(cfg) {
        var sec = document.getElementById('configSection');
        sec.innerHTML = ''
            + toggleRow('enabled', '启用插件', cfg.enabled)
            + toggleRow('enableHttp', '启用 HTTP', cfg.enableHttp)
            + toggleRow('enableWs', '启用 WebSocket', cfg.enableWs)
            + toggleRow('enableReverseWs', '启用反向 WebSocket', cfg.enableReverseWs)
            + toggleRow('enableWebhook', '启用 Webhook', cfg.enableWebhook)
            + toggleRow('debug', '调试模式', cfg.debug)
            + '<div style="margin-top:16px"></div>'
            + fieldGroup('port', '监听端口', cfg.port, 'number')
            + fieldGroup('verifyKey', '验证密钥', cfg.verifyKey, 'text')
            + textareaGroup('reverseWs', '反向 WS 配置 (JSON)', JSON.stringify(cfg.reverseWs, null, 2))
            + textareaGroup('webhook', 'Webhook 配置 (JSON)', JSON.stringify(cfg.webhook, null, 2))
            + '<div class="btn-row">'
            + '<button class="btn btn-primary" onclick="window._saveConfig()">保存配置</button>'
            + '<button class="btn btn-secondary" onclick="window._loadConfig()">重新加载</button>'
            + '</div>';
    }

    function toggleRow(key, label, val) {
        return '<div class="toggle-row"><span class="toggle-label">' + label + '</span>'
            + '<label class="toggle"><input type="checkbox" data-key="' + key + '"' + (val ? ' checked' : '') + '><span class="slider"></span></label></div>';
    }

    function fieldGroup(key, label, val, type) {
        return '<div class="field-group"><label class="field-label">' + label + '</label>'
            + '<input type="' + type + '" data-key="' + key + '" value="' + escapeHtml(String(val)) + '"></div>';
    }

    function textareaGroup(key, label, val) {
        return '<div class="field-group"><label class="field-label">' + label + '</label>'
            + '<textarea data-key="' + key + '">' + escapeHtml(val) + '</textarea></div>';
    }

    function escapeHtml(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    window._saveConfig = async function() {
        var cfg = {};
        document.querySelectorAll('#configSection input[type=checkbox]').forEach(function(el) {
            cfg[el.dataset.key] = el.checked;
        });
        document.querySelectorAll('#configSection input[type=text]').forEach(function(el) {
            cfg[el.dataset.key] = el.value;
        });
        document.querySelectorAll('#configSection input[type=number]').forEach(function(el) {
            cfg[el.dataset.key] = Number(el.value);
        });
        document.querySelectorAll('#configSection textarea').forEach(function(el) {
            try { cfg[el.dataset.key] = JSON.parse(el.value); } catch(e) {
                showToast(el.dataset.key + ' JSON 格式错误', 'error');
                return;
            }
        });
        var resp = await apiFetch('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg),
        }, true);
        if (resp && resp.code === 0) {
            showToast('配置已保存', 'success');
            loadStatus();
        } else {
            showToast('保存失败', 'error');
        }
    };

    window._loadConfig = function() { loadConfig(); };

    async function loadSessions() {
        var resp = await apiFetch('/sessions', null, true);
        var container = document.getElementById('sessionsContainer');
        if (!resp || resp.code !== 0 || !resp.data || resp.data.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无活跃会话</div>';
            return;
        }
        var rows = resp.data.map(function(s) {
            var ago = Math.floor((Date.now() - s.lastAccess) / 1000);
            return '<tr><td>' + s.sessionKey + '</td><td>' + (s.qq || '-') + '</td>'
                + '<td><span class="badge ' + (s.verified ? 'badge-on' : 'badge-off') + '">' + (s.verified ? '已验证' : '未验证') + '</span></td>'
                + '<td>' + s.messageCount + '</td><td>' + ago + '秒前</td></tr>';
        }).join('');
        container.innerHTML = '<table class="sessions-table"><thead><tr>'
            + '<th>Session Key</th><th>QQ</th><th>状态</th><th>消息队列</th><th>最后活跃</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    loadStatus();
    loadConfig();
    loadSessions();

    // Auto-refresh status every 10s
    setInterval(loadStatus, 10000);
})();
</script>
</body>
</html>`;
}
