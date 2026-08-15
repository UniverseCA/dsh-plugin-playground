# 安装 Prompt Template Drawer（纯客户端动态 Cordis 插件）

**DSH 动态 Cordis 插件**（非 npm 包），**只有 Client 半边**（无 `host.js`）。
通过 `cordis_define` / `cordis_run` 注入会话。

## 前置条件

- 正在运行、支持动态 Cordis 插件的 **DeepSeek Harness** Web 会话。
- 无需凭据、无需网络；模板存浏览器 `localStorage`。

## 安装步骤

1. **加载 Client 半边** —— `cordis_define`：
   - `plugin.idPrefix`: `ptpl`
   - `code.client`: [`client.js`](client.js) 的内容
   - **不需要** `code.host`。
2. **激活** —— 对返回的 `pluginId` + `packageId` 执行 `cordis_run`。
3. **授权** —— 按提示允许。
4. **刷新 / 打开会话** —— composer 上方（dock 区）应有「📋 模板」按钮。

## 使用

- 点「📋 模板」打开面板。
- **新增**：点「+ 新增模板」，填名称与内容（内容默认带入当前输入框文本），保存。
- **插入**：点列表里的某条模板 → 文本自动填入输入框，面板关闭，显示「已插入 ✓」。
- **搜索**：顶部输入框按标题/正文过滤。
- **删除**：每行右侧 🗑。

## 验证

- 保存一个模板后，清空输入框，再点该模板 —— 输入框应立即出现模板文本。
- 刷新页面后模板仍在（localStorage 持久化）。
- 若点击模板无反应并显示「inputActions 不可用」，说明该会话未提供标准输入 kit
  （少见；常见于非典型嵌入场景），此时无法写回输入框。

## 说明

- **注入范围**：只渲染在拥有该插件的宿主页面；独立新标签页不显示。
- **多会话**：面板按当前会话的 `inputActions` 写回，模板清单全局共享（存 localStorage）。
- 模板面板用 CSS 变量适配 DSH 主题（深/浅色均可）。

## 文件

- `client.js` → `code.client`
- `README.md` → 功能与实现文档
