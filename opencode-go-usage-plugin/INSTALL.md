# Installing the OpenCode Go Usage Badge (Dynamic Cordis Plugin)

This plugin runs in **DeepSeek Harness (DSH)** as a **dynamic Cordis plugin** —
it is *not* an npm package. You load its two halves (`host.js`, `client.js`)
through the DSH dynamic-plugin tooling, which injects them into the current
session and the host page.

> 这是一个**动态 Cordis 插件**：通过 DSH 会话内的 `cordis_define` / `cordis_run`
> 把 `host.js` 与 `client.js` 注入运行。它不是 npm 包，也不需要安装到 node_modules。

## Prerequisites

- A running **DeepSeek Harness** web session that supports dynamic Cordis plugins.
- The DSH credential **`OPENCODE_GO_API_KEY`** configured (DSH reads
  `~/.dsh/.credentials.yaml`, or set it as an environment variable).
  This is the same key that already drives your `opencode-go` model provider.
- A network route to `https://opencode.ai` — this build uses
  `curl -x http://127.0.0.1:7897` to go through a local proxy (edit `host.js`
  to change the proxy or drop `-x`).

## Steps

1. **Load the client half** — `cordis_define` with:
   - `plugin.idPrefix`: `ocgq` (Host assigns the full id)
   - `code.host`: contents of [`host.js`](host.js)
   - `code.client`: contents of [`client.js`](client.js)

2. **Activate** — `cordis_run` on the returned `pluginId` + `packageId`.

3. **Authorize** in the UI when prompted (single-run or always).

4. **Refresh** the host page / open a session. The badge appears in the
   **top-right of the conversation header**: a colored `Go X%` pill.
   Click it to expand the Rolling / Weekly / Monthly detail card with reset times.

## Verification

- Badge shows a percentage that updates every 60 s.
- Detail card shows three windows with their local-time reset times.
- If you see `OPENCODE_GO_API_KEY 未配置` — the credential isn't reachable.
- If `curl 退出码 …` — the proxy/route to `opencode.ai` failed.

## Notes / Gotchas

- **Client timers**: do not use global `setTimeout`; use `ctx.get('timer').interval(...)`
  (optional-service access). Directly touching `ctx.interval` without declaring
  `inject` trips the Guard and makes the slot cell abdicate.
- **Injection scope**: the Client half only renders in the **host page that owns
  the plugin**. An independent browser tab hitting the same URL will not show it.
- **Refresh interval** (`60000` ms) lives in `client.js`.

## Files

- `host.js` → `code.host` (credential + fetch via `harness.handle('fetch-usage')`)
- `client.js` → `code.client` (header badge + detail card, 60 s refresh)
- `../README.md` — feature & data-source docs (English)
