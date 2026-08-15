# Request Latency Chart（动态 Cordis 插件 · 纯客户端）

展示最近若干条 **AI 请求耗时** 的迷你条形图。

- ⏱️ 会话头部加「耗时」按钮，点开面板。
- 📊 面板用横向条形图展示最近 N 条已完成 assistant 请求的耗时，两条指标可切换：
  - **总耗时**：`completedTime − stepStartTime`
  - **TTFT 首字**：`firstTokenTime − stepStartTime`（首 token 延迟）
- 📈 柱色随耗时占比变化（绿 / 橙 / 红），并给出平均耗时。
- 💻 纯前端手写条形图，无需额外图表库；纯客户端、无 host、无网络。

## 特性

- 每次请求耗时即从客户端会话快照的 `AssistantMessageNode.timing` 读取（含
  `stepStartTime` / `firstTokenTime` / `completedTime`）。
- 按 turn 聚合为「一条请求」，取最近 `RECENT`（默认 12）条。
- 平均耗时 / 色阶提示 / 每条 hover 显示对应的回答开头文本。

## 工作原理

1. `slots.inject('conversation.session.header.utilities', …)` 加「⏱️ 耗时」按钮
   （session 作用域，标准 kit 提供 `useSession`）。
2. `useSession(s => s)` 遍历 `snap.nodes`（或 `snap.chat.nodes`）收集 `kind==='assistant'`
   且未中断、带 `timing` 的节点。
3. 计算 `totalMs` / `ttftMs`，取最近 N 条，画横向条形图。

## 安装

见 [`INSTALL.md`](INSTALL.md)。要点：`cordis_define` 只给 `code.client`（无需 host）。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 唯一半边 —— 耗时按钮 + 条形图面板（TTFT/总耗时切换） |
| `INSTALL.md` | 安装 / 验证指南 |

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与仓库内其它插件同风格。
