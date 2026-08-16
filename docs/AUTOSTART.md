# DSH 持久化插件（随启动自动装载）实施记录

本文记录把插件升级为 **DSH Loader 持久插件**（随 DSH 启动自动装载、在「设置 → 插件」
里可管、不再随会话重启消失）的实施方案、当前进度与回滚方法。

> 状态：**原型验证成功 ✅**（`dsh-plugin-latency-chart` 随 DSH 启动自动装载、boot 图可见、
> 浏览器 `/plugins/.../client.js` 返回 200、header utilities slot 真实渲染出 ⏱️ 耗时按钮、无报错）。

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

## 后续：推广其余 6 个

原型验证成功后，把 `system-monitor / copy-format / prompt-templates /
session-rename / message-favorites / opencode-go-usage` 逐个按同法构建成
`loader-packages/<name>/` 包（各自的 client.js / host.js），用同样方式
junction + 注册进 cordis.patch.yml。

- 纯 client 插件：只用 `lib/client.js` + 空 `lib/index.js`。
- 带 host 的（system-monitor / opencode-go-usage）：还需 node half 实现
  `apply(ctx)` 用 `subprocess`/`credentials`（即把它们原来的 host.js 转成
  ESM `export { apply }`）。
