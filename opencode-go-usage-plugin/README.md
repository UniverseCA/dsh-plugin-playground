# OpenCode Go 用量徽标（DSH 动态 Cordis 插件）

在 DSH web GUI 的**会话标题栏右侧（页面顶部状态区）**显示 OpenCode Go 套餐用量徽标：
点击弹出详情卡，展示 **Rolling(5h) / Weekly / Monthly** 三个窗口的用量百分比，并**每 60 秒自动刷新**。

## 数据源

OpenCode 官方用量 API：

- **端点**：`GET https://opencode.ai/zen/go/v1/usage`
- **认证**：`Authorization: Bearer <OPENCODE_GO_API_KEY>`
- **响应**：
  ```json
  {
    "usage": {
      "rolling":  { "status": "ok", "percent": 0, "resetsAt": "..." },
      "weekly":   { "status": "ok", "percent": 0, "resetsAt": "..." },
      "monthly":  { "status": "ok", "percent": 0, "resetsAt": "..." }
    }
  }
  ```
- 语义：rolling = 滚动 5 小时窗口；weekly = 本周（周一 UTC 重置）；monthly = 本月计费周期。均为 account-wide 百分比。
- 错误：401 = key 被拒；403 EntitlementError = 无 Go 订阅。

参考来源：[robinebers/openusage](https://raw.githubusercontent.com/robinebers/openusage/main/docs/providers/opencode.md)、
[andywang425/opencode-go-usage-api](https://raw.githubusercontent.com/andywang425/opencode-go-usage-api/master/README.md)、
[farion1231/cc-switch#6433](https://github.com/farion1231/cc-switch/issues/6433)。

## 凭据

本机 DSH 的凭据存储 `~/.dsh/.credentials.yaml` 中的 `OPENCODE_GO_API_KEY`。
Host 端通过 DSH 的 `credentials.resolve('OPENCODE_GO_API_KEY')` 解析。

本机网络需经本地代理 `http://127.0.0.1:7897` 才能连通源站，插件用 `subprocess` + `curl -x` 调用。

## 代码

- `host.js` → `code.host`（取数：解析凭据 → curl 调 usage API → `harness.handle('fetch-usage')`）
- `client.js` → `code.client`（注册 `conversation.session.header.utilities`，渲染徽标+详情卡，60s 定时刷新）

## 部署

在 DSH 会话中用动态 Cordis 插件机制（`cordis_define` / `cordis_run`）加载：
两者传入 `code.host` 与 `code.client` 的**函数体**（此处文件为便于维护做了包装注释，实际定义时取文件内容即可）。
