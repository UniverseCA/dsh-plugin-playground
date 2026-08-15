# System Monitor Badge (动态 Cordis 插件)

**DSH Web GUI** 顶部实时系统监控条：CPU / 内存（宿主机）/ GPU（可选、自动探测）。

> 与 `opencode-go-usage-plugin` 同款架构与视觉风格：会话头部右上角的胶囊徽标 + 点击展开的详情卡。

![platform-browser](https://img.shields.io/badge/platform-browser-brightgreen)
![license-MIT](https://img.shields.io/github/license/UniverseCA/dsh-plugin-playground)

## 特性

- 🏷️ 会话头部胶囊徽标实时显示 **CPU %** 与 **内存 %**，颜色随负载变化：
  - 🟢 绿 < 50%
  - 🟠 橙 ≥ 50%
  - 🔴 红 ≥ 80%
- 📊 点击展开详情卡：
  - **CPU**：当前使用率 + 主机名
  - **内存**：使用百分比、已用 / 总 MB
  - **GPU**：若检测到独显则显示型号（无负载、仅型号；核显/无 GPU 时该行隐藏）
  - **系统**：OS 版本（如 `Microsoft Windows 11 Pro`）
- ⏱️ 每 **3 秒**自动刷新（可在 `client.js` 调整）。
- 🔒 只在 **DSH 宿主进程内**用 `subprocess` 采集，无需任何凭据、无需安装额外软件。

## 数据来源

在 **DSH 宿主进程**（运行 DSH 的这台 Windows 机器）上，通过 `powershell.exe` 单行脚本采集，非浏览器本地环境。

| 指标 | 来源 |
|---|---|
| CPU | `PerformanceCounter "\Processor(_Total)\% Processor Time"`（两次采样差值）；回退到 `Get-Counter` |
| 内存 | `Get-CimInstance Win32_OperatingSystem`（Total/Free PhysicalMemory）→ 百分比 |
| GPU | `Get-CimInstance Win32_VideoController`（仅型号名，读不到负载） |
| 主机 | `$env:COMPUTERNAME` |
| OS | `Win32_OperatingSystem.Caption` |

> 说明：本机为 AMD/Intel 核显或无 NVIDIA 独显，未安装 `nvidia-smi`，
> 因此 **GPU 只显示型号而不显示占用率**；若将来装了 NVIDIA 驱动有此命令，可扩展读取占用/显存/温度。

## 文件布局

| 文件 | 作用 |
|---|---|
| `host.js` | Host 半边 —— 采集系统指标，经 `harness.handle('fetch-sysinfo')` 暴露 |
| `client.js` | Client 半边 —— 顶部胶囊徽标 + 详情卡 UI，每 3 s 刷新 |
| `INSTALL.md` | 安装 / 重建指南（同仓库 opcode 插件一致） |

## 输出格式（host 返回给 client）

```jsonc
{
  "ok": true,
  "data": {
    "system": {
      "cpuPct": 12.6,          // 当前 CPU 使用率
      "memTotalMB": 16384,     // 总内存 MB
      "memFreeMB":  5954,      // 可用内存 MB
      "memUsedPct": 63.7,      // 已用 %
      "gpu":  "Intel(R) UHD Graphics", // 或 "none"
      "gpuPresent": true,
      "hostname": "MY-PC",
      "os": "Microsoft Windows 11 Pro"
    }
  }
}
```

错误时返回 `{ ok:false, error:"..." }`，UI 显示错误并重试。

## 安装

见 [`INSTALL.md`](INSTALL.md)（中英双语）。

## 配置

- **刷新间隔**：`client.js` 中 `6000 / 3` 秒换行逻辑里的数值（默认每 3 s）。
- **CPU 采样间隔**：`host.js` 中 `_metric` 的 `Start-Sleep -Milliseconds 150`（越大越准，代价是响应略慢）。

---

基于 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI。与 `opencode-go-usage-plugin` 同仓库、同风格。欢迎 PR/改进。
