# 安装 Request Latency Chart（纯客户端动态 Cordis 插件）

**DSH 动态 Cordis 插件**（非 npm 包），**只有 Client 半边**（无 `host.js`）。
通过 `cordis_define` / `cordis_run` 注入会话。

## 前置条件

- 正在运行、支持动态 Cordis 插件的 **DeepSeek Harness** Web 会话。
- 无需凭据、无需网络。

## 安装步骤

1. **加载 Client 半边** —— `cordis_define`：
   - `plugin.idPrefix`: `ltcy`
   - `code.client`: [`client.js`](client.js) 的内容
   - **不需要** `code.host`。
2. **激活** —— 对返回的 `pluginId` + `packageId` 执行 `cordis_run`。
3. **授权** —— 按提示允许。
4. **刷新 / 打开会话** —— 会话头部应有「⏱️ 耗时」按钮。

## 使用

- 点「⏱️ 耗时」打开面板。
- 顶部「总耗时 / TTFT 首字」切换观察维度。
- 横向条形 = 每条请求耗时；绿色慢、橙色中、红色快；hover 显示对应回答开头。
- 右上角显示平均耗时。

## 验证

- 在会话里跑几次提问后打开面板，应看到与轮次对应的条形。
- 改为 TTFT 应显示更短的条（首字延迟）。
- 颜色随耗时占比变化；无最近数据时提示「还没有已完成的请求」。

## 说明

- **耗时来源**：客户端 `AssistantMessageNode.timing` —— 仅对**已完成**（未中断）的
  assistant 消息有效；窗口外的历史节点可能缺失 timing。
- `RECENT`（默认 12）与 `pxPerSecond` 可在 `client.js` 顶部调整。
- **注入范围**：只渲染在拥有该插件的宿主页面；独立新标签页不显示。

## 文件

- `client.js` → `code.client`
- `README.md` → 功能与实现文档
