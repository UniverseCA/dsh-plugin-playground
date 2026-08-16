# DSH 持久化插件（随启动自动装载）实施记录

本文记录把插件升级为 **DSH Loader 持久插件**（随 DSH 启动自动装载、在「设置 → 插件」
里可管、不再随会话重启消失）的实施方案、当前进度与回滚方法。

> 状态：**全部 7 个插件已持久化成功 ✅**（latency-chart / copy-format / prompt-templates /
> session-rename / message-favorites / system-monitor / opencode-usage 均随 DSH 启动自动装载、
> boot 图可见、浏览器渲染 UI 无报错。带 host 的两个用 webServer JSON API 方案——见下方「方案 B」）。

---

## 为什么现在不行 / 目标

- **现在**：用 `cordis_define`/`cordis_run` 加载的是**动态插件**，只活在当前进程，**重启即消失**。
- **目标**：做成 **Loader 插件包**，随 DSH 启动自动装载，出现在「设置 → 插件」。

DSH 机制（源码核实）：一个带 `dsh.client` + `exports["./client"]` 的 npm 包，
注册进 profile 的 `cordis.patch.yml`（Loader insert），它就会进 Loader；其浏览器半边被
`dsh-client-modules` 扫描进 `window.__DSH_BOOT__` 自动装载（扫描缓存重启才更新）。

---

## 原型：dsh-plugin-latency-chart

第一个被转成持久包的插件（Latency Chart，请求耗时迷你条形图）。

**包结构**（`D:\桌面\插件\loader-packages\latency-chart\`）：
```
package.json  ← name, exports["./client"], dsh.client={platform:web}
lib/index.js         ← node half：空 apply()（让它在"设置→插件"有名字）
lib/client.js        ← browser bundle：window.__ModuleLoader__.load({ id, factory })
```

**已验证**（node 模拟 Loader 加载）：语法 OK、`__ModuleLoader__.load` 被捕获、
factory 执行成功、`exports.apply` 是函数、`exports.inject=["slots"]`。

**依赖解析**：`require("react")` 由 DSH Loader 运行时提供；react 已存在于
`~/.dsh/profiles/node_modules/react`。

---

## 已做的部署改动

### 1）包放进 profile 可解析位置（junction）
```
C:\Users\32193\.dsh\profiles\node_modules\dsh-plugin-latency-chart  (Junction)
        └──> D:\桌面\插件\loader-packages\latency-chart
```
这样 `require.resolve('dsh-plugin-latency-chart/package.json')` 可解析。

### 2）`C:\Users\32193\.dsh\profiles\web\cordis.patch.yml`
在顶层数组加了一个 insert 项：
```yaml
- insert:
    - id: latency-chart
      name: 'dsh-plugin-latency-chart'
```

> 未改 profile 的 `package.json`（其 dependencies 本为空，Loader entry 由
> cordis.patch.yml 驱动；包已 junction 到 node_modules 可被 resolve）。

---

## 待你做的验证（择机重启 DSH）

1. **重启 DSH web**（会中断当前会话，请选合适时机）。
2. 重启后确认两点：
   - 「设置 → 插件」清单里出现 **latency-chart** 条目，可开关。
   - 打开一个会话，标题栏右侧出现 **⏱️ 耗时** 按钮，点击能看请求耗时条形图。
3. 结果告诉我：
   - 成功 → 我推广到其余 6 个插件。
   - 失败/没出现 → 把「设置→插件」面板、DSH 日志、报错信息发我排查。

---

## 回滚方法（如有问题）

配置改动都有备份，可随时还原：

| 改动 | 还原方式 |
|---|---|
| junction | 删除 `~/.dsh/profiles/node_modules/dsh-plugin-latency-chart`（`rd` 即可） |
| cordis.patch.yml | 删除新增的 `insert` 块，或从备份恢复 |
| 备份 | `D:\桌面\插件\loader-packages\_backup-profile-*/`（含原 package.json / cordis.patch.yml / cordis.yml）|

还原后重启 DSH 即回到原状（动态插件方式不受影响）。

---

## 全部完成 ✅（7 个插件）

已把 7 个插件全部转成 `loader-packages/<name>/` 的 Loader 持久包并注册：

| 持久包 | 目录 | host/client |
|---|---|---|
| `dsh-plugin-latency-chart` | `loader-packages/latency-chart` | 纯 client |
| `dsh-plugin-copy-format` | `loader-packages/copy-format` | 纯 client |
| `dsh-plugin-prompt-templates` | `loader-packages/prompt-templates` | 纯 client |
| `dsh-plugin-session-rename` | `loader-packages/session-rename` | 纯 client |
| `dsh-plugin-message-favorites` | `loader-packages/message-favorites` | 纯 client |
| `dsh-plugin-system-monitor` | `loader-packages/system-monitor` | **host + client** |
| `dsh-plugin-opencode-usage` | `loader-packages/opencode-usage` | **host + client** |

## 两个带 host 插件的 RPC 方案（方案 B：webServer JSON API）

带 host 的插件**不能用**动态插件的 `harness.handle`/`host.call`（持久插件里没有那套）。
改用 **webServer JSON API**：

- **host 半**：`inject: ['webServer']`，在 `apply(ctx)` 里
  `ctx.get('webServer').register({ kind:'prefix', path:'/__dsh_xxx', handler: async (req,res)=>{...} })`
  处理器中做取数（subprocess / credentials），`res.end(JSON.stringify(result))`。
- **client 半**：同源 `fetch('/__dsh_xxx', { method:'GET', cache:'no-store' })` 取 JSON 显示。

已实现：
- `dsh-plugin-system-monitor` → route `/__dsh_sysmon`（subprocess + powershell 采 CPU/内存/GPU/OS）
- `dsh-plugin-opencode-usage` → route `/__dsh_opencode_usage`（credentials 取 OPENCODE_GO_API_KEY + curl 走代理调 usage API）

已验证：路由返回真实 JSON，client `fetch` 正常，UI 渲染无报错。

## 转换工具

`loader-packages/convert.mjs` 把纯 client 的 `client.js` 自动转成
`window.__ModuleLoader__.load({...})` bundle。
