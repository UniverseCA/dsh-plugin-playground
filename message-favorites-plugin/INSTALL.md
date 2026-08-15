# 安装 Message Favorites + Search（纯客户端动态 Cordis 插件）

**DSH 动态 Cordis 插件**（非 npm 包），**只有 Client 半边**（无 `host.js`）。
通过 `cordis_define` / `cordis_run` 注入会话。

## 前置条件

- 正在运行、支持动态 Cordis 插件的 **DeepSeek Harness** Web 会话。
- 无需凭据、无需网络；收藏存浏览器 `localStorage`。

## 安装步骤

1. **加载 Client 半边** —— `cordis_define`：
   - `plugin.idPrefix`: `mfav`
   - `code.client`: [`client.js`](client.js) 的内容
   - **不需要** `code.host`。
2. **激活** —— 对返回的 `pluginId` + `packageId` 执行 `cordis_run`。
3. **授权** —— 按提示允许。
4. **刷新 / 打开会话**：
   - 侧栏底部应有「⭐ 收藏」按钮。
   - 任意 AI 回复图标行应有收藏星标。

## 使用

- **收藏**：在一条 AI 回复旁点 `☆` → 变 `★`（已收藏）。
- **插入输入框**：已收藏消息旁的 `⤓` 按钮，把该条回答正文填进输入框。
- **打开面板**：点侧栏「⭐ 收藏」（数字为收藏数）。
- **搜索**：面板顶部输入框按标题 / 正文过滤。
- **复制**：点条目的「复制」→ 正文进剪贴板，短时显示 ✓。
- **取消收藏**：点条目右侧 🗑，或回到消息旁再点一下 ★。

## 验证

- 收藏几条后，侧栏按钮数字随之变化。
- 打开面板能看到收藏列表；搜索能过滤。
- 刷新页面后收藏仍在（localStorage）。
- 点「复制」粘贴出来的正文正确。

## 说明

- **星标只作用于已完成的 assistant 消息**（有稳定 `messageId`）；被中断 partial 置灰。
- **历史窗口**：更早消息需窗口加载后星标才可读取文本。
- **overlay 坐标**：面板在 `shell.overlay`（root 叠层），位置为右侧固定浮层；若与其它
  浮层重叠，可调 `client.js` 里的 `right/top`。
- **注入范围**：只渲染在拥有该插件的宿主页面；独立新标签页不显示。

## 文件

- `client.js` → `code.client`
- `README.md` → 功能与实现文档
