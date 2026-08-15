# Message Favorites + Search（动态 Cordis 插件 · 纯客户端）

收藏 AI 回复，并提供一个**可搜索的收藏面板**。

- ⭐ 每条已完成的 AI 回复图标行加收藏星标（可收藏 / 取消）。
- 🗂️ 侧栏底部加「收藏」按钮，点开浮在整页上方的收藏面板。
- 🔍 面板内按**标题 / 正文**搜索；每条可**复制**或**取消收藏**。
- 💾 收藏存浏览器 `localStorage`，纯客户端、无 host、无网络、无凭据。

## 特性

- **每消息星标**：在 `conversation.chat.assistant-actions` 注入，点 ⭐ 收藏当前 AI 回复，
  再点取消；已收藏呈实心 ★。
- **侧栏触发**：`sidebar.footer.action` 加「⭐ 收藏」按钮（带数量角标）。
- **浮层面板**：`shell.overlay`（root/list，整页浮层）承载收藏列表 + 搜索框。
  - 由于 overlay 默认 click-through，面板元素自身 `pointer-events:auto` 以接收交互。
- **搜索**：按标题或正文过滤。
- **复制**：把收藏正文写入剪贴板（`navigator.clipboard`，`execCommand` 回退）。

## 工作原理（三个 slot 同属一个插件）

| 部件 | slot | 作用域 | 说明 |
|---|---|---|---|
| 星标按钮 | `conversation.chat.assistant-actions` | session | 经 `useSession` 按 `messageId` 读 text 块 |
| 收藏按钮 | `sidebar.footer.action` | root | 派发 `dsh:fav-toggle` 事件 |
| 收藏面板 | `shell.overlay` | root | 监听 `dsh:fav-toggle` 切换开关 |

- 收藏数据在模块级共享 store（内存 + `localStorage`，key `dsh.favorites.v1`），并带订阅，
  让星标/角标/面板同步刷新。
- 星标读取文本走与 `copy-format-plugin` 相同的「`useSession` → 按 messageId 定位
  assistant 节点 → 取 `kind:'text'` 块」。

## 安装

见 [`INSTALL.md`](INSTALL.md)。要点：`cordis_define` 只给 `code.client`（无需 host）。

## 文件

| 文件 | 作用 |
|---|---|
| `client.js` | 唯一半边 —— 星标 + 侧栏触发 + overlay 面板 + localStorage + 搜索/复制 |
| `INSTALL.md` | 安装 / 验证指南 |

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与仓库内其它插件同风格。
