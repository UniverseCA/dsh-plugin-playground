# DSH Plugin Playground

> 一个 [DeepSeek Harness (DSH)](https://github.com/Crascit) Web GUI 的**动态 Cordis 插件集**：
> 在页面各处加实用的小功能 —— 系统监控、用量徽标、一键复制、模板、重命名、收藏、耗时统计。

![License: MIT](https://img.shields.io/github/license/UniverseCA/dsh-plugin-playground)
![Stars](https://img.shields.io/github/stars/UniverseCA/dsh-plugin-playground?style=social)
![Last commit](https://img.shields.io/github/last-commit/UniverseCA/dsh-plugin-playground)

---

## ✅ 快速了解：这里有什么

| 插件 | 目录 | 效果 |
|---|---|---|
| **System Monitor** | [`system-monitor-plugin/`](system-monitor-plugin/) | 会话头部实时显示 **CPU / 内存 %**（GPU 型号），点击看详情卡 |
| **OpenCode Go Usage** | [`opencode-go-usage-plugin/`](opencode-go-usage-plugin/) | 会话头部 **OpenCode Go 套餐用量**徽标 + Rolling/Weekly/Monthly 详情 |
| **Copy Format** | [`copy-format-plugin/`](copy-format-plugin/) | 每条 AI 回复旁 **MD / TXT** 一键复制（Markdown 或纯文本） |
| **Prompt Templates** | [`prompt-templates-plugin/`](prompt-templates-plugin/) | 输入框上方 **📋 模板**面板，常用 prompt 一键写回输入框 |
| **Session Rename** | [`session-rename-plugin/`](session-rename-plugin/) | 会话头部 **✏️ 重命名** +「用首条消息命名」 |
| **Message Favorites** | [`message-favorites-plugin/`](message-favorites-plugin/) | 收藏 AI 回复 **⭐ + 可搜索收藏面板** |
| **Latency Chart** | [`latency-chart-plugin/`](latency-chart-plugin/) | 最近请求的**耗时迷你条形图**（总耗时 / TTFT） |
| **Workspace RAG** | [`workspace-rag-plugin/`](workspace-rag-plugin/) | 工作区本地**中文混合检索**（词级 BM25 + 语义向量）：4 个模型工具 + PDF/DOCX 解析 |

> **Workspace RAG 与其它插件不同**：它是宿主**工具型**静态插件（不注入页面 UI，而是给会话
> 注册 `rag_ingest` 等模型工具），装载方式是 **agent preset / DSH Loader 包**而非动态
> `cordis_define`，详见其目录内 [`README.md`](workspace-rag-plugin/README.md) 与
> [`INSTALL.md`](workspace-rag-plugin/INSTALL.md)。

每个插件的完整说明、安装步骤、维护要点都在它自己的目录里（`README.md` + `INSTALL.md`）。

---

## 🚀 如何安装 / 卸载插件

这些插件是 **DSH「动态 Cordis 插件」**，不是 npm 包。安装 = 在**支持动态插件的 DSH 会话**里告诉 AI 用 `cordis_define` + `cordis_run` 两个工具加载。

**两种方式任选一种：**

> ## 持久化（Loader）插件已内置
> 本仓库的 7 个插件都已做成 **DSH Loader 持久包**（`loader-packages/`），
> 随 DSH 启动**自动装载**、不再随会话/重启消失、可在「设置 → 插件」清单开关。
> 具体实施见 [`docs/AUTOSTART.md`](docs/AUTOSTART.md)。下面两种方式是「手动/临时加载」
> 的备选，适用于未启用持久包的环境。

### 方式 A：让 AI 帮你装（推荐，简单）

1. 打开任意一个 **DSH 会话**（就是在界面上和 AI 对话的窗口）。
2. 把下文整段发给会话里的 AI（`AI` 就是那个会话里的模型）：

   > 请读取本仓库的 **[`docs/INSTALL-ALL.md`](docs/INSTALL-ALL.md)**，
   > 并按里面写的 `cordis_define` 参数，用 `cordis_define` / `cordis_run` 逐个加载插件。

3. 也可以把 `docs/INSTALL-ALL.md` 的内容直接粘贴给 AI。
4. 每次 `cordis_run` 后，在界面左下角的 **Cordis 面板** 点「允许」授权。
5. **刷新页面 / 重新进入会话** —— 插件效果就会出现。

### 方式 B：手动指定（想装某一个）

对照下表，把对应目录里的 `host.js` / `client.js` 内容交给 AI 定义：

| 想装哪个 | idPrefix | 目录里的文件 |
|---|---|---|
| System Monitor | `symo` | `host.js` + `client.js` |
| OpenCode Go Usage | `ocgq` | `host.js` + `client.js` |
| Copy Format | `cpf` | `client.js`（无 host）|
| Prompt Templates | `ptpl` | `client.js` |
| Session Rename | `srn` | `client.js` |
| Message Favorites | `mfav` | `client.js` |
| Latency Chart | `ltcy` | `client.js` |

对每个插件，对 AI 说一句模板（以 System Monitor 为例）：

> 用 `cordis_define` 定义插件：`plugin.idPrefix` 填 **symo**，`name` 填名称，
> `code.host` 填仓库里 `system-monitor-plugin/host.js` 的内容，
> `code.client` 填同目录下 `client.js` 的内容。定义后 `cordis_run` 激活。

**卸载**：在 Cordis 面板里对对应插件点「停止」或「移除」。

---

## 📋 常见问题

**Q：装完没看到效果？**
客户端插件只渲染在**加载它的那个宿主页面**。装完后**刷新页面 / 重开一个会话**再找：
- System Monitor / OpenCode Go / Latency → 会话头部右上角
- Copy Format / 收藏星标 → 每条 AI 回复的图标栏
- Prompt Templates → 输入框上方
- Session Rename → 会话头部
- Message Favorites 触发按钮 → 左侧栏底部

**Q：需要什么前置环境？**
- 能运行动态 Cordis 插件的 **DSH Web 会话**。
- **System Monitor** 需要 DSH 宿主进程所在机器（Windows）能调用 `powershell.exe`。
- **OpenCode Go Usage** 需要 DSH 已配置 `OPENCODE_GO_API_KEY` 凭据（一般你的 opencode-go 模型已经在用），以及能访问 `https://opencode.ai`（代码默认走本地代理 `127.0.0.1:7897`）。

**Q：会不会有安全风险？**
纯客户端插件只在你浏览器里工作；会写 Host 的插件（System Monitor、OpenCode Go）只调用本机 `powershell`/`curl` 读取系统信息或用量，**不修改任何数据**。凭据不会被打包进源码（见 `.gitignore`）。

---

## 🛠 开发者 / 维护者

想了解插件怎么写的、每个插件的注入点（slot）、scope、技术要点，见
[**`docs/PLUGINS.md`**](docs/PLUGINS.md)（插件总览 + 注入点对照表 + 踩坑清单）。

仓库自带 CI（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）：push 时对每个
插件的 `host.js` / `client.js` 做 `node --check` 语法检查 + 密钥扫描守护。

## 📄 许可证

[MIT](LICENSE)

---

Built for the DeepSeek Harness web GUI. Improvements & PRs welcome.
