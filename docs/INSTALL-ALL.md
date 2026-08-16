# 一次安装全部插件（给 DSH 会话里的 AI 的复制即用清单）

> 用途：把本文内容（或逐条）给 **支持动态 Cordis 插件的 DSH 会话** 里的 AI，
> 它会用 `cordis_define` / `cordis_run` 逐个定义并激活下面的插件。
>
> 每个插件安装后都会请求授权：在界面左下角的 **Cordis 面板** 点「允许」。
> 全部装完后**刷新 DSH 页面 / 重新进入会话**，效果才会出现。

---

## 说明

- 每个插件一段 `cordis_define` 参数；**纯 client 插件只传 `code.client`**。
- **带 host 的插件**（System Monitor、OpenCode Go）把 `host.js` 作为 `code.host`、
  `client.js` 作为 `code.client`。
- 定义完一个就用 `cordis_run` 激活，再下一个。

---

## 1. System Monitor —— `system-monitor-plugin/`

```
cordis_define：
- plugin: { kind: "new", idPrefix: "symo" }
- name: "System Monitor Badge"
- purpose: "会话头部显示宿主 CPU/内存(及 GPU 型号)实时监控徽标 + 详情卡"
- code.host:   system-monitor-plugin/host.js   的内容
- code.client: system-monitor-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：会话头部右上角 `CPU % · MEM %` 徽标（含 GPU/OS/主机名详情卡）。

## 2. Copy Format —— `copy-format-plugin/`（纯 client）

```
cordis_define：
- plugin: { kind: "new", idPrefix: "cpf" }
- name: "Copy Format"
- purpose: "每条 AI 回复图标栏的 MD/TXT 复制按钮（复制 Markdown 或纯文本）"
- code.client: copy-format-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：每条 AI 回复旁 `MD` / `TXT` 按钮。

## 3. Prompt Templates —— `prompt-templates-plugin/`（纯 client）

```
cordis_define：
- plugin: { kind: "new", idPrefix: "ptpl" }
- name: "Prompt Templates"
- purpose: "composer 上方的常用 prompt 模板面板，一键写回输入框"
- code.client: prompt-templates-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：输入框上方 `📋 模板` 面板。

## 4. Session Rename —— `session-rename-plugin/`（纯 client）

```
cordis_define：
- plugin: { kind: "new", idPrefix: "srn" }
- name: "Session Rename"
- purpose: "会话头部的重命名按钮 + 用首条消息快速命名"
- code.client: session-rename-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：会话头部 `✏️ 重命名` 按钮。

## 5. Message Favorites —— `message-favorites-plugin/`（纯 client）

```
cordis_define：
- plugin: { kind: "new", idPrefix: "mfav" }
- name: "Message Favorites"
- purpose: "收藏 AI 回复 + 可搜索收藏面板（侧栏触发 + overlay 浮层）"
- code.client: message-favorites-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：AI 回复旁 `⭐` 收藏 + 侧栏底部触发 + 收藏面板。

## 6. Latency Chart —— `latency-chart-plugin/`（纯 client）

```
cordis_define：
- plugin: { kind: "new", idPrefix: "ltcy" }
- name: "Latency Chart"
- purpose: "最近若干条请求的耗时迷你条形图（总耗时/TTFT）"
- code.client: latency-chart-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：会话头部 `⏱️ 耗时` 按钮。

## 7. OpenCode Go Usage —— `opencode-go-usage-plugin/`

```
cordis_define：
- plugin: { kind: "new", idPrefix: "ocgq" }
- name: "OpenCode Go Usage Badge"
- purpose: "会话头部显示 OpenCode Go 套餐用量徽标 + Rolling/Weekly/Monthly 详情卡"
- code.host:   opencode-go-usage-plugin/host.js   的内容
- code.client: opencode-go-usage-plugin/client.js 的内容
然后 cordis_run 激活。
```
效果：会话头部右上角 `Go X%` 用量徽标。需要 DSH 已配置 `OPENCODE_GO_API_KEY` 凭据。

---

## 若某个加载失败

- `cordis_define` 报语法/形状错 → 把报错贴给维护者排查。
- `cordis_run` 报授权/客户端失败 → 刷新页面后重试。
- 纯 client 插件报缺 `inject` 声明 → 这些插件都是**对象形式返回且自带 `inject`**
  （session-rename 带 `['slots','sessions']`，其余带 `['slots']`），一般无需改动。
