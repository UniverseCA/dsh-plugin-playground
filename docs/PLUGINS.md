# 插件总览 + 注入点对照表

本仓库是维护 DSH（DeepSeek Harness）Web GUI **动态 Cordis 插件** 的 Playground。
此文档是所有插件的速查索引，重点列出每个插件的**注入点（slot）**、用途、技术要点与
维护注意事项，方便你之后扩展或排查。

> 快速定位：先看 [注入点速览表](#注入点-slot-速览表)，再按插件目录看详情。

---

## 关键背景：动态 Cordis 插件的双半边结构

每个 DSH 动态插件通常有两部分，由 `cordis_define` / `cordis_run` 注入：

| 半边 | 位置 | 能力 | 典型样式 |
|---|---|---|---|
| `host.js` | DSH **宿主 Node 进程** | 受限 `ctx`，可用 `subprocess` / `credentials`；`harness.handle('name')` 暴露给 client | 系统监控、用量抓取 |
| `client.js` | **浏览器页面** | `slots.inject` 注入 UI；React；`host.call('name')` 调 host | 所有 UI 插件 |

**三条铁律（踩坑总结）：**

1. **host 的 `ctx` 是 whitelist guard** —— `ctx.sessions`、`ctx.slots` 等框架内部服务在
   host 半边大多被拒；host 主要用于 subprocess + credentials。
   client 半边也一样：直接 `ctx.xxx` 访问受 `inject` 声明门控（对象形式插件才能声明）。
2. **host 半边不能用 `ctx.sessions.scope(id)`** —— 它返回一个 Cordis `Context`，
   guard 会拒绝（"returned a cordis Context"）。要用 **`ctx.sessions.binding(id)?.session`**。
3. **会话标准 kit** 给所有 `scope:'session'` 的槽组件注入 `useSession / sessionId /
   useInput / inputActions / useProjection / t`；`inputActions.setDraft(text)` 是唯一
   推荐的「写输入框」方式（它走机器事件，text 实时更新）。

---

## 注入点（slot）速览表

> `scope` 说明：`session` = 只在打开的会话内出现；`root` = 全局常驻。

| 注入点 slot | kind | scope | 组件收到的关键 props | 本仓库使用者 |
|---|---|---|---|---|
| `conversation.session.header.utilities` | list | session | 标准 kit（useSession/sessionId/…) | System Monitor、Latency Chart |
| `conversation.session.header.actions` | list | session | 标准 kit | Session Rename |
| `conversation.chat.assistant-actions` | list | session | `{ messageId, useSession, inputActions, … }` | Copy Format、Message Favorites 星标 |
| `conversation.input.dock` | list | session | 标准 kit（含 useInput/inputActions） | Prompt Templates |
| `sidebar.footer.action` | list | root | `{ wide }` + 全局 useSessions/useWorkspaces | Message Favorites 触发按钮 |
| `shell.overlay` | list | root | 全局 useSessions/useWorkspaces（owner 空） | Message Favorites 面板 |

**关键提醒：**

- `conversation.session.header.utilities` / `.actions` 是**会话级** —— 无会话时不渲染。
- 侧栏是 **root 级**、常驻 —— 需要“始终可见”的入口放 `sidebar.footer.action`。
- `shell.overlay` 是整页浮层，**默认 click-through**，自己元素要设 `pointerEvents:'auto'`；
  用 **常注册 + `return null` 条件渲染** 控制显隐（不要按开关反复注册/注销）。
- `conversation.details.tool` 是 `kind:'single'`、仅在选择某个工具调用时挂载 ——
  **不适合**常驻图表/面板。

---

## 各插件详情

按创建顺序（提交号从早到晚）。

### 1. System Monitor Badge — `system-monitor-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **host + client** |
| 注入点 | `conversation.session.header.utilities` |
| 用途 | 会话头部实时显示宿主机的 **CPU / 内存 %**（GPU 仅型号），点击详情卡 |
| 提交 | `7691612` |

- **host**：`subprocess.spawn(powershell.exe -Command <单行>)` 采集。
  PowerShell 字符串内部用**单引号**避免转义损坏计数器路径；作为单一 argv 元素传入。
  CPU 两级回退：`PerformanceCounter` 差值(~150ms) → `Get-Counter`(~1.7s)。
  WMI（Get-CimInstance）每项 try/catch —— host token 受限时内存/GPU/OS 安全降级，CPU 照常。
- **client**：`host.call('fetch-sysinfo')` 每 3s 拉取；胶囊徽标 + 详情卡。
- 维护：刷新间隔在 `client.js`；采样/降级逻辑在 `host.js`；改采集命令注意引号转义。

### 2. Copy Format — `copy-format-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **仅 client** |
| 注入点 | `conversation.chat.assistant-actions` |
| 用途 | 每条 AI 回复图标栏的 `MD`（复制 Markdown）/ `TXT`（复制纯文本）按钮 |
| 提交 | `17d59b1` |

- 通过 `useSession` 按 `messageId` 在会话快照 `snap.nodes` 里定位 assistant 节点，
  取 `kind:'text'` 块的 `text`（即原样 Markdown）。
- `TXT` 用轻量正则剥离 Markdown 语法。
- 剪贴板：`navigator.clipboard.writeText`，失败回落 `execCommand('copy')`。
- 纯客户端、无 host。

### 3. Prompt Templates — `prompt-templates-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **仅 client** |
| 注入点 | `conversation.input.dock` |
| 用途 | composer 上方的「📋 模板」按钮 + 常用 prompt 面板，一键写回输入框 |
| 提交 | `fcbf603` |

- 点模板 → `inputActions.setDraft(body)` 把模板填进输入框。
- 模板存 `localStorage`（key `dsh.prompt-templates.v1`）；新增默认带入当前草稿。
- 纯客户端。

### 4. Session Rename — `session-rename-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **仅 client** |
| 注入点 | `conversation.session.header.actions` |
| 用途 | 会话头部「✏️ 重命名」按钮 + 「用首条消息命名」（pin 标题） |
| 提交 | `eda94c4` |

- **必须**对象形式插件 + `inject: ['sessions', 'slots']` 才能访问 `ctx.sessions`。
- 重命名用 **`ctx.sessions.binding(sessionId)?.session.rename(title)`** —— **不要用**
  `scope()`（guard 拒 Context）。
- 显式标题会 pin 住会话（source=user），DSH 的自动标题不再覆盖。
- 「用首条消息命名」在 `useSession` 快照取首个 `user` 节点 text 块压行截断。

### 5. Message Favorites + Search — `message-favorites-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **仅 client** |
| 注入点 | `conversation.chat.assistant-actions`（星标）+ `sidebar.footer.action`（触发）+ `shell.overlay`（面板）|
| 用途 | 收藏 AI 回复 + 可搜索收藏面板；已收藏消息可「⤓ 插入输入框」 |
| 提交 | `8419697`、`7daec0b`、`8a5d599` |

- 三个 slot 共享一个**模块级 store**（收藏数组 + 面板开关 `isOpen`），带 subscribe，
  不做 DOM CustomEvent（已重构，见 `7daec0b`）。
- 收藏存 `localStorage`（`dsh.favorites.v1`）。
- 已收藏消息旁 `⤓` 用 `inputActions.setDraft(text)` 插入输入框（`8a5d599`）。
- 面板是 `shell.overlay`（root），拿不到 session 的 `inputActions`，故面板内**仅复制**。
- 星标同样走 `useSession` 按 messageId 读 text。

### 6. Latency Chart — `latency-chart-plugin/`

| 项 | 值 |
|---|---|
| 半边 | **仅 client** |
| 注入点 | `conversation.session.header.utilities` |
| 用途 | 最近若干条请求的耗时迷你条形图（总耗时 / TTFT 首字），每请求标输出 token |
| 提交 | `302ef47`、`7daec0b` |

- 数据来自 `AssistantMessageNode.timing`：`stepStartTime` / `firstTokenTime` /
  `completedTime`（epoch ms，前两者可 `null`）。
  - 总耗时 = `completedTime − stepStartTime`
  - TTFT = `firstTokenTime − stepStartTime`
- 从 `snap.nodes`（legacy 顶层数组）折叠 —— 与官方 `deriveStats` 同一来源；
  **不要**用 `snap.chat.nodes`（那是 `ChatConversationViewNode`，无 timing）。
- 每请求 `n.usage?.outputTokens` 显示输出 token。
- 手写 div 条形图（无额外图表库）；`RECENT` 常量控制条数。

---

## 通用维护清单

- **新增一半边**：按需给 `inject` 数组加服务（`slots` 必加；host 常用 `subprocess`/
  `credentials`；client 加 `sessions` 等才可访问对应 `ctx.xxx`）。对象形式插件才能声明
  `inject`。
- **新建插件**：复制任一目录结构（`client.js`(+`host.js`) + `README.md` + `INSTALL.md`），
  在根 `README.md` 的插件表加一行，并在 `.github/workflows/ci.yml` 的文件清单里加新 JS。
- **CI**：仓库自带 `node --check` 语法检查（见 `ci.yml`），push 时会在 GitHub Actions 跑。
- **无法本地实测 UI**：这些插件按 DSH 源码在代码层验证，真实页面渲染（zIndex/定位/图标
  尺寸）可能需要微调 CSS。加载后有问题看本表「注入点」定位到对应插件再改。
- **不许提交**：`.env`、`*.yaml` 凭据（见 `.gitignore`）。CI 也会扫 `sk-live` 等密钥。

---

*维护备忘：注入点/scope/标准 kit 的事实来自 DSH `@deepseek-ai/*` 源码（slot 契约权威台账为
`dsh-cordis-client-runner/lib/client.js` 的内置说明书）。DSH 升级后如槽名变化，据此文档更新。*
