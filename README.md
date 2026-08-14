# OpenCode Go Usage Badge

A **Dynamic Cordis Plugin** for [DeepSeek Harness (DSH)](https://github.com/Crascit) web GUI that shows your **OpenCode Go subscription usage** as a compact badge in the **conversation header (top-right status area)**, with a click-to-open detail card.

![status](https://img.shields.io/badge/dsh-plugin-dynamic-8a2be2) ![platform](https://img.shields.io/badge/platform-browser-brightgreen)

![Screenshot placeholder — add `docs/screenshot.png`](docs/screenshot.png)

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
| `opencode-go-usage-plugin/README.md` | Implementation notes (中文) |

## Installing / Running

The plugin is loaded through DSH's **dynamic Cordis plugin** mechanism, not an npm package:

1. Make sure your DSH credential `OPENCODE_GO_API_KEY` is configured (DSH reads `~/.dsh/.credentials.yaml`), or set it as an environment variable.
2. In a DSH session, define the plugin with `cordis_define` using the bodies of `host.js` and `client.js` as `code.host` / `code.client`, then activate with `cordis_run`.
3. **The badge appears only in the host page that owns the plugin** — refresh / switch into a session and look at the **top-right** of the conversation header.

> A clickable one-command installer (e.g. `dsh install <plugin>`) will be added here once available.

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
