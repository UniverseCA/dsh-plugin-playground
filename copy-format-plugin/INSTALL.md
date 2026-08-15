# 安装 Copy Format Plugin（纯客户端动态 Cordis 插件）

这个插件是 **DSH 动态 Cordis 插件**（非 npm 包），并且**只有 Client 半边**
（`host.js` 不是必需的 —— 文本直接读客户端会话快照即可）。通过 `cordis_define` /
`cordis_run` 注入会话。

## 前置条件

- 正在运行、支持动态 Cordis 插件的 **DeepSeek Harness** Web 会话。
- 无需凭据、无需网络、无需安装额外软件。

## 安装步骤

1. **加载 Client 半边** —— `cordis_define`：
   - `plugin.idPrefix`: `cpf`
   - `code.client`: [`client.js`](client.js) 的内容
   - **不需要** `code.host`。
2. **激活** —— 对返回的 `pluginId` + `packageId` 执行 `cordis_run`。
3. **授权** —— 按提示允许。
4. **刷新 / 打开会话** —— 找到任意一条已完成的 AI 回复，图标栏右侧会多出
   `MD` 和 `TXT` 两个小按钮。
   - 点 `MD` → 复制该回答的原始 Markdown。
   - 点 `TXT` → 复制该回答的纯文本。

## 验证

- 会话里出现一条 AI 回答后，其图标行应有 `MD` / `TXT`。
- 点 `MD` 后按钮短暂变绿并显示「已复制」，粘贴出来的内容是带 `#`、`` ` ``、
  `**` 的 Markdown。
- 点 `TXT` 后粘贴出来的内容不含 Markdown 语法符号。
- 若该消息在“历史窗口外”未加载，或为被中断的 partial，按钮呈灰色 —— 符合预期。

## 说明

- **只作用于 assistant 消息**：DSH 没有用户消息级的等价 slot，所以只给 AI 回复加复制。
- **Client 半边注入范围**：只渲染在拥有该插件的宿主页面；独立新标签页不显示。
- **历史窗口**：会话快照只物化当前已加载的历史节点；更早的消息需窗口加载后才可取到文本。
- 纯文本剥离是**轻量启发式正则**，覆盖常见 Markdown 符号；复杂嵌套（表格、脚注）可能
  不完全干净，但日常回答已够用。

## 文件

- `client.js` → `code.client`
- `README.md` → 功能与实现文档
