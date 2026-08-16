# Prompt Template Drawer（动态 Cordis 插件 · 纯客户端）

> ## 🚀 安装
> 这是 DSH **动态 Cordis 插件**，安装 = 在支持动态插件的 DSH 会话里用 `cordis_define` / `cordis_run`
> 加载本目录的 `client.js`（纯客户端，无 host）。通用安装教程见
> [仓库根 README](../README.md)，本插件的详细步骤见 **[`INSTALL.md`](INSTALL.md)**。

在 DSH Web GUI 的 **composer 上方 dock 区**注入一个「📋 模板」按钮：

- 打开一个模板面板，保存并管理你的**常用 prompt**。
- 点任意模板 → 一键把文本**填进输入框**（`setDraft`，与手打一致）。
- 支持**新增**（可用当前输入框内容作初始值）、**删除**、**按名称/内容搜索**。
- 数据存在浏览器 `localStorage`，**纯客户端**、无 host、无网络、无需凭据。

## 特性

- 📋 composer 上方出现「模板」按钮；未保存模板时显示 `模板 0`，随数量变化。
- ➕ 新增模板：名称 + 内容；「新增」时自动用当前输入框草稿作为初始内容。
- 🔍 搜索：按标题或正文筛选。
- 🗑 每行右侧删除按钮，删除即时生效并持久化。
- ⚡ 点击模板即 `inputActions.setDraft(body)`，文本进入输入框草稿（机器事件驱动，
  textarea 实时更新），随后面板关闭并显示「已插入 ✓」。

## 工作原理

1. `slots.inject('conversation.input.dock', …)` —— 这是 composer 上方的 list/session slot
   （DSH 自带的 Plan/Todo strip 也注册在这里，是稳定注入点）。
2. 会话标准 kit 为这类 slot 提供 `{ inputActions, useInput, useSession, sessionId, t, … }`。
3. 点模板 → `inputActions.setDraft(t.body)` → 写进 composer（与 DSH 草稿恢复 path 一致，
   `SessionInputShell.actions.setDraft`）。
4. 模板清单读/写 `localStorage`（key `dsh.prompt-templates.v1`）。

## 安装

见 [`INSTALL.md`](INSTALL.md)。要点：`cordis_define` 只给 `code.client`，无需
`code.host`。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 唯一半边 —— 模板按钮 + 面板 + localStorage + setDraft 写回 |
| `INSTALL.md` | 安装 / 验证指南 |

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与仓库内其它插件同风格。
