# 安装 System Monitor Badge（动态 Cordis 插件）

这个插件是一个 **DSH 动态 Cordis 插件**（非 npm 包）。通过 DSH 会话内的
`cordis_define` / `cordis_run` 把 `host.js` 与 `client.js` 注入宿主页面和会话。
与 `opencode-go-usage-plugin` 的安装方式完全一致。

## 前置条件

- 正在运行、支持动态 Cordis 插件的 **DeepSeek Harness** Web 会话。
- 无需任何凭据 —— 数据直接来自 **DSH 宿主进程所在机器**的 PowerShell 采集。
- DSH 宿主进程能调用 `powershell.exe`（Windows 自带，路径
  `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`）。

## 步骤

1. **加载 Client 半边** —— `cordis_define`：
   - `plugin.idPrefix`: `symo`（Host 分配合适 id）
   - `code.host`: [`host.js`](host.js) 的内容
   - `code.client`: [`client.js`](client.js) 的内容
2. **激活** —— 对返回的 `pluginId` + `packageId` 执行 `cordis_run`。
3. **授权** —— 按提示允许（单次或始终）。
4. **刷新宿主页 / 打开会话** —— 会话头部右上角出现胶囊徽标：`CPU 12% · MEM 64%`。
   点击弹出详情卡（CPU / 内存 / GPU / OS / 主机名）。

## 验证

- 徽标数值每 3 秒刷新。
- CPU 数字会随负载变化；内存百分比在运行大程序时上升。
- 若 GPU 行隐藏，说明未检测到独显（Intel/AMD 核显或无 GPU）—— 符合预期。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 徽标显示 ✕ 或“采集失败” | DSH 宿主无法 spawn `powershell.exe` —— 检查 PATH 或改 `host.js` 中 ps 路径 |
| CPU 恒为 0 | 采集命令首次 `NextValue()` 返回值可能为 0/空 —— 已用两次采样差值规避，若仍为 0 检查沙箱/权限 |
| 面板只显示一次不刷新 | `ctx.get('timer')` 服务缺失（Guard 回退）—— 首次仍会拉取，不影响 |

## 说明

- **Client 定时器**：不要用全局 `setTimeout`，用 `ctx.get('timer').interval(...)`
  （可选服务访问），否则会触发 Guard 使 slot cell abdicate。
- **注入范围**：Client 半边只渲染在拥有该插件的宿主页面；独立新标签页不显示。
- **刷新间隔**（默认 3 s）在 `client.js`。

## 文件

- `host.js` → `code.host`（采集并对 client 暴露 `fetch-sysinfo`）
- `client.js` → `code.client`（头部徽标 + 详情卡）
- `README.md` → 功能与数据源文档
