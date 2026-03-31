# napcat-plugin-mirai-api-http

NapCat 插件：实现 [mirai-api-http](https://github.com/project-mirai/mirai-api-http) 协议兼容层，使 [Graia Ariadne](https://github.com/GraiaProject/Ariadne) 等基于 mirai-api-http 的客户端可以直接连接 NapCat。

## ✨ 功能

- **HTTP 适配器** — 完整的 REST API，支持 session 认证（verify → bind → release）
- **WebSocket 适配器** — `/all`、`/message`、`/event` 三个频道，syncId 请求/响应
- **反向 WebSocket** — 主动连接远程 WS 服务端，自动重连
- **Webhook** — 将事件 POST 推送到远程 URL
- **WebUI 仪表盘** — 在 NapCat WebUI 中查看状态、管理配置和会话

### 已实现的 API

涵盖 mirai-api-http 的 35+ 个接口：

| 分类 | 接口 |
|------|------|
| 认证 | verify, bind, release, sessionInfo |
| 消息 | sendFriendMessage, sendGroupMessage, sendTempMessage, sendNudge, recall, roamingMessages, messageFromId |
| 好友 | friendList, friendProfile, deleteFriend |
| 群组 | groupList, memberList, memberInfo, memberProfile, groupConfig, memberAdmin, botProfile |
| 群管理 | mute, unmute, muteAll, unmuteAll, kick, quit, setEssence |
| 文件 | file_list, file_info, file_mkdir, file_delete, file_move, file_rename |
| 其他 | about, getSessionInfo, resp_newFriend, resp_memberJoin, resp_botInvited |

### 已实现的事件

好友消息、群消息、临时消息、入群/退群、禁言、撤回、戳一戳、好友申请、入群申请等 20+ 种事件。

## 📦 安装

### 从 Release 安装

1. 前往 [Releases](https://github.com/Sibuxiangx/napcat-plugin-mirai-api-http/releases) 下载最新 `.zip`
2. 解压到 NapCat 的 `plugins/napcat-plugin-mirai-api-http/` 目录
3. 在 NapCat 配置中启用插件

### 从源码构建

```bash
git clone https://github.com/Sibuxiangx/napcat-plugin-mirai-api-http.git
cd napcat-plugin-mirai-api-http
pnpm install
pnpm run build
```

构建产物在 `dist/` 目录。

## ⚙️ 配置

插件启动后会在 NapCat 配置目录生成默认配置，也可通过 WebUI 仪表盘修改。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 是否启用 |
| `port` | `8080` | HTTP/WS 监听端口 |
| `verifyKey` | 随机生成 | 认证密钥 |
| `enableHttp` | `true` | 启用 HTTP 适配器 |
| `enableWs` | `true` | 启用 WebSocket 适配器 |
| `enableReverseWs` | `false` | 启用反向 WebSocket |
| `enableWebhook` | `false` | 启用 Webhook |
| `debug` | `false` | 调试日志 |

### 反向 WebSocket 配置

```json
{
  "reverseWs": {
    "connections": [
      {
        "url": "ws://127.0.0.1:9000/ws",
        "reconnectInterval": 5000
      }
    ]
  }
}
```

### Webhook 配置

```json
{
  "webhook": {
    "destinations": [
      {
        "url": "http://127.0.0.1:9001/webhook",
        "headers": {}
      }
    ]
  }
}
```

## 🚀 与 Ariadne 配合使用

```python
from graia.ariadne.app import Ariadne
from graia.ariadne.connection.config import (
    HttpClientConfig,
    WebsocketClientConfig,
    config,
)

app = Ariadne(
    connection=config(
        123456789,       # Bot QQ 号
        "your-verify-key",  # verifyKey（见 NapCat WebUI 插件配置）
        HttpClientConfig(host="http://localhost:8080"),
        WebsocketClientConfig(host="http://localhost:8080"),
    ),
)
```

## 🖥️ WebUI

插件在 NapCat WebUI 中注册了管理页面，登录后可以：

- 查看适配器运行状态和连接数
- 修改配置（端口、认证密钥、适配器开关等）
- 查看活跃会话列表

> 状态信息无需登录即可查看，配置和会话管理需要 NapCat WebUI 登录认证。

## 📁 项目结构

```
src/
├── index.ts              # 插件入口，生命周期钩子
├── types.ts              # mirai-api-http 类型定义
├── config.ts             # 默认配置、Schema、校验
├── webui.ts              # WebUI 仪表盘和 API 路由
├── core/
│   ├── state.ts          # 全局状态管理
│   ├── session.ts        # Session 管理（verify/bind/release）
│   └── cache.ts          # 消息缓存
├── converter/
│   ├── message.ts        # mirai 消息链 ↔ OB11 消息段 双向转换
│   └── event.ts          # OB11 事件 → mirai 事件转换
├── server/
│   ├── http-server.ts    # HTTP REST API 服务
│   ├── ws-server.ts      # WebSocket 服务（/all, /message, /event）
│   ├── reverse-ws.ts     # 反向 WebSocket 客户端
│   └── webhook.ts        # Webhook 事件推送
└── api/
    └── handlers.ts       # 35+ API 命令处理器
```

## 📄 许可证

本项目采用 [AGPL-3.0](LICENSE) 许可证，与 [mirai](https://github.com/mamoe/mirai) 及 [mirai-api-http](https://github.com/project-mirai/mirai-api-http) 保持一致。
