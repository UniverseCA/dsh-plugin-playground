# Copy Format Plugin（动态 Cordis 插件 · 纯客户端）

> ## 🚀 安装
> 这是 DSH **动态 Cordis 插件**，安装 = 在支持动态插件的 DSH 会话里用 `cordis_define` / `cordis_run`
> 加载本目录的 `client.js`（纯客户端，无 host）。通用安装教程见
> [仓库根 README](../README.md)，本插件的详细步骤见 **[`INSTALL.md`](INSTALL.md)**。

在 DSH Web GUI 的每条 **AI（assistant）回复** 图标栏右侧增加两个按钮：

- **`MD`** —— 以原始 **Markdown** 复制该条回答
- **`TXT`** —— 以**纯文本**（剥去 Markdown 语法）复制该条回答

与仓库里其它插件同风格，但**只有 Client 半边**（host.js 不需要）。

## 特性

- 📋 每条已完成的 AI 回复旁出现 `MD` / `TXT` 两个小按钮，与 DSH 自带的复制/分支并列。
- 🔎 点击后从**客户端会话快照**读取该消息原文（`useSession` 按 `messageId` 定位
  `AssistantMessageNode.blocks` 里的 `text` 块），即使不依赖网络也即时可用。
- 📝 `MD` 复制模型生成的原始 Markdown；`TXT` 用轻量规则把标题 `#`、粗斜体 `**`、
  代码反引号、引用、列表符号、链接 `[文字](url)` 等剥离成纯文本。
- ✅ 复制后按钮短暂变为「已复制」（绿色反馈），1.2s 恢复。
- ⚪ 被中断（未 finalize）的消息没有稳定 `messageId`，按钮自动置灰。
- 🧹 纯 `client.js`，无需 host、无需凭据、无需网络请求。

## 工作原理

1. `slots.inject('conversation.chat.assistant-actions', …)` —— 这是会话级 list slot，
   其组件的 render 由 UI 引擎调用，并传入 `{ messageId, sessionId, useSession, … }`。
2. 组件内 `useSession(snap => …)` 从 `snap.chat.nodes`（回退 `snap.nodes`）里找到
   `kind==='assistant' && messageId` 匹配的节点，取其 `blocks`。
3. 收集 `kind==='text'` 块的 `text`，拼接即为 Markdown 原文；再正则剥离成纯文本。
4. 点击写入剪贴板（`navigator.clipboard`，失败回退 `execCommand('copy')`）。

## 安装

见 [`INSTALL.md`](INSTALL.md)。要点：`cordis_define` 时只给 `code.client`（本文件的
内容）即可；无需 `code.host`。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 唯一的半边 —— MD/TXT 复制按钮 + 文本提取 + 剪贴板写入 |
| `INSTALL.md` | 安装 / 验证指南 |

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与仓库内其它插件同风格。
