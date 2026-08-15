# Session Rename（动态 Cordis 插件 · 纯客户端）

在 DSH Web GUI 的 **会话头部标题簇旁**加一个「✏️ 重命名」按钮，用于手动设置/更改
当前会话标题。

> 说明：DSH **本身已经会**给会话自动命名（`SessionTitleService`：从首条用户消息做
> 确定性 fallback，或经可选 LLM provider 生成更智能标题）。因此这个插件**不是**再写一个
> 自动命名器，而是提供两个互补价值：
> - **手动重命名** → 显式标题会“钉住”会话，DSH 之后不再自动覆盖。
> - **「用首条消息命名」** → 客户端取首条用户消息文本（压行 + 截断）立即命名，不依赖
>   LLM、即时生效。

## 特性

- ✏️ 会话头部「重命名」按钮，点开一个内联输入框（自动带入当前标题），输入新标题回车或
  点「保存」即设置。
- 📌 显式标题会 **pin** 会话（`ISession.rename`，source=`user`）—— 自动标题不再覆盖它，
  即使后续有更多用户消息。
- ⚡ **「用首条消息命名」**：用首条用户消息文本（去掉换行、压成一行、截断到 80 字符）
  作为标题，一次点击、无需 LLM 请求。
- 💾 纯客户端；通过 `ctx.sessions.binding(id)?.session.rename(title)` 调官方客户端
  `rename`，无需 host、无需凭据。

## 工作原理

1. `slots.inject('conversation.session.header.actions', …)` —— 会话头部标题簇旁的
   actions 区（agent-preset / job-list 等同一区），标准 kit 提供 `sessionId`/`useSession`/`t`。
2. `apply(ctx)` 声明 `inject: ['slots', 'sessions']`，从而可访问 `ctx.sessions`。
3. 组件点「保存」→ `ctx.sessions.binding(sessionId)?.session.rename(title)` 执行重命名。
4. 「用首条消息命名」→ 组件经 `useSession(s => s)` 在会话快照首个 `kind:'user'` 节点的
   `content`/`blocks` 里取 text 块，压行截断后调用 rename。

## 安装

见 [`INSTALL.md`](INSTALL.md)。要点：`cordis_define` 只给 `code.client`（无需 host）。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 唯一半边 —— 重命名按钮 + 内联编辑 + 首条消息命名 + rename 调用 |
| `INSTALL.md` | 安装 / 验证指南 |

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与仓库内其它插件同风格。
