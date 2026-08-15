# DSH 实用插件集 Playground / OpenCode Go Usage Badge

A set of **Dynamic Cordis Plugins** for [DeepSeek Harness (DSH)](https://github.com/Crascit) web GUI.

## 仓库内的插件

| 插件 | 目录 | 作用 |
|---|---|---|
| **OpenCode Go Usage Badge** | [`opencode-go-usage-plugin/`](opencode-go-usage-plugin/) | 会话头部的 OpenCode Go 用量徽标 + Rolling/Weekly/Monthly 详情卡 |
| **System Monitor Badge** | [`system-monitor-plugin/`](system-monitor-plugin/) | 会话头部的宿主 CPU/内存(及 GPU 型号) 实时监控徽标 + 详情卡 |
| **Copy Format** | [`copy-format-plugin/`](copy-format-plugin/) | 每条 AI 回复图标的 `MD`/`TXT` 复制按钮（复制 Markdown 或纯文本） |
| **Prompt Templates** | [`prompt-templates-plugin/`](prompt-templates-plugin/) | composer 上方的「模板」按钮 + 常用 prompt 面板，一键写回输入框 |
| **Session Rename** | [`session-rename-plugin/`](session-rename-plugin/) | 会话头部手动重命名按钮 + 用首条消息快速命名（pin 标题） |
| **Message Favorites** | [`message-favorites-plugin/`](message-favorites-plugin/) | 每条 AI 回复收藏星标 + 可搜索的收藏面板（侧栏触发 + overlay 浮层） |
| **Latency Chart** | [`latency-chart-plugin/`](latency-chart-plugin/) | 请求耗时迷你条形图（总耗时 / TTFT 首字切换） |

> 说明：`copy-format-plugin`、`prompt-templates-plugin` 与 `session-rename-plugin` 均为
> 纯客户端半边（无 `host.js`）；插件是否需要 Host 半边，取决于它能否只用客户端会话
> 快照/标准 kit/客户端服务就满足需求。

每个插件都是 **host.js（宿主进程采集）+ client.js（页面 UI 注入）** 的双半边结构，
安装方式见各自目录里的 `INSTALL.md`。

> 📌 想了解每个插件的注入点（slot）、scope、技术要点与维护陷阱，见
> **[`docs/PLUGINS.md`](docs/PLUGINS.md)**（插件总览 + 注入点对照表）。

---

## OpenCode Go Usage Badge

A **Dynamic Cordis Plugin** for [DeepSeek Harness (DSH)](https://github.com/Crascit) web GUI that shows your **OpenCode Go subscription usage** as a compact badge in the **conversation header (top-right status area)**, with a click-to-open detail card.

![Platform: browser](https://img.shields.io/badge/platform-browser-brightgreen)
![License: MIT](https://img.shields.io/github/license/UniverseCA/opencode-go-usage-badge)
![Stars](https://img.shields.io/github/stars/UniverseCA/opencode-go-usage-badge?style=social)
![Last commit](https://img.shields.io/github/last-commit/UniverseCA/opencode-go-usage-badge)

![Screenshot placeholder — add `docs/screenshot.png`](docs/screenshot.png)

> 徽标效果见 `docs/screenshot.md`：顶部右上角的 `Go X%` 徽标 + 点击展开的 Rolling/Weekly/Monthly 详情卡。放一张真实截图到 `docs/screenshot.png` 后这里会自动显示。

## Features

- 🏷️ **Live badge** in the session header showing the **Rolling (5h)** usage percentage, colored by consumption:
  - 🟢 green < 50%
  - 🟠 amber ≥ 50%
  - 🔴 red ≥ 80%
- 📊 **Detail card** on click showing usage percentage **and reset time** for all three windows:
  - **Rolling (5h)** · **Weekly** · **Monthly**
  - e.g. `4 小时后重置（08-15 06:23）` — local-time aware, with `X 分钟后/小时后/天后重置 (MM-DD HH:MM)`
- ⏱️ Auto-refreshes every **60 seconds**
- 🔐 Uses your existing DSH credential (`OPENCODE_GO_API_KEY`) — no CLI install needed

## Data Source

Uses the **official OpenCode usage API**:

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <OPENCODE_GO_API_KEY>
```

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 0, "resetsAt": "..." },
    "weekly":  { "status": "ok", "percent": 0, "resetsAt": "..." },
    "monthly": { "status": "ok", "percent": 0, "resetsAt": "..." }
  }
}
```

| Window | Meaning |
|---|---|
| `rolling` | Rolling 5-hour window |
| `weekly` | This week (resets Monday 00:00 UTC) |
| `monthly` | Current billing month |

Errors: `401` = key rejected · `403 EntitlementError` = no Go subscription.

> This window/percent representation comes from the official `/v1/usage` endpoint (discovered via [cc-switch#6433](https://github.com/farion1231/cc-switch/issues/6433), corroborated by [robinebers/openusage](https://raw.githubusercontent.com/robinebers/openusage/main/docs/providers/opencode.md) and [andywang425/opencode-go-usage-api](https://raw.githubusercontent.com/andywang425/opencode-go-usage-api/master/README.md)).

## Architecture

DSH dynamic Cordis plugins run in **two halves**:

```
┌────────────── Host (DSH Node process) ──────────────┐
│  credentials.resolve('OPENCODE_GO_API_KEY')         │
│         │                                           │
│  subprocess.run(curl -x PROXY -H "Bearer <key>"     │
│                  https://opencode.ai/zen/go/v1/usage)│
│         │                                           │
│  harness.handle('fetch-usage')  ← client calls this │
└─────────────────────────────────────────────────────┘
                    │  Package-private JSON-RPC
┌────────────── Client (browser page) ────────────────┐
│  slots.inject('conversation.session.header.utilities') │
│  → <Go 0%> badge + detail card                       │
│  ctx.get('timer').interval(load, 60000)  // refresh  │
└─────────────────────────────────────────────────────┘
```

## File Layout

| File | Role |
|---|---|
| `opencode-go-usage-plugin/host.js` | Host half — credential + fetch logic |
| `opencode-go-usage-plugin/client.js` | Client half — badge + detail-card UI |
| `opencode-go-usage-plugin/INSTALL.md` | Step-by-step install / build guide (中英) |
| `opencode-go-usage-plugin/README.md` | Implementation notes (中文) |

## Installing / Running

This is a **dynamic Cordis plugin**, not an npm package — you load `host.js`
and `client.js` through DSH's dynamic-plugin mechanism. Follow the full guide
in **[`opencode-go-usage-plugin/INSTALL.md`](opencode-go-usage-plugin/INSTALL.md)**.

Quick summary: make sure `OPENCODE_GO_API_KEY` is configured → `cordis_define`
with `code.host`/`code.client` from those files → `cordis_run` → authorize →
refresh & open a session → the badge appears top-right of the header.

## Configuration

- **API key**: provided automatically via DSH `credentials.resolve('OPENCODE_GO_API_KEY')`.
- **Proxy**: the fetch runs `curl -x http://127.0.0.1:7897` in this build (the source endpoint is behind Cloudflare and needs a browser User-Agent + a reachable route). If your network doesn't need a proxy, remove the `-x` flag in `host.js`.
- **Refresh interval**: change `60000` (ms) in `client.js`.

## Why not the Zen balance?

OpenCode has **two products** that are easy to confuse:

- **OpenCode Go** (subscription) → official `/v1/usage` returns usage **percentages** per window. This plugin targets **this**.
- **OpenCode Zen** (pay-as-you-go balance) → has **no official balance JSON endpoint**; it uses the `_server` billing server-function with a login **cookie** (`balance / 1e8` = USD). Not included here.

## License

[MIT](LICENSE)

---

Originally built for the DeepSeek Harness web GUI. Improvements & PRs welcome.
