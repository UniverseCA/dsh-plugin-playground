# 安装 Workspace RAG（静态宿主插件）

这个插件给会话注册 4 个**模型工具**（`rag_ingest` / `rag_search` / `rag_status` / `rag_eval`），
让 AI 能对本地文件夹做**中文混合检索**（词级 BM25 + 本地语义向量，PDF/DOCX 解析）。

> 它是**宿主工具型静态插件**，安装方式与仓库里其它客户端 UI 插件（`cordis_define` 动态加载）
> 不同：推荐用 **agent preset** 或 **DSH Loader 包**装载。

## 前置条件

1. **工作区放好 `tools/`**：把本目录的 `tools/` 复制到你要检索的工作区（如 `D:\桌面\RAG\tools`），
   然后在其内执行依赖安装（首次需要网络）：

   ```powershell
   cd <工作区>\tools
   npm install --no-audit --no-fund --cache <工作区>\.npm-cache
   ```

2. **首次使用会下载 embedding 模型**（`Xenova/bge-small-zh-v1.5`，约 120MB，缓存于
   `tools\.model-cache`）。直连 HuggingFace 不通时，给 `rag_ingest` 传参：

   ```
   hf_endpoint: https://hf-mirror.com
   hf_proxy:    http://127.0.0.1:7897     # 按你的本地代理调整；不需要就不填
   ```

## 方式 A：Agent preset（推荐）

1. 把 `preset/` 目录复制为 `~/.dsh/.agent-presets/rag-retrieval/`：

   ```powershell
   Copy-Item -Recurse preset\ C:\Users\<你>\.dsh\.agent-presets\rag-retrieval\
   ```

2. 在 DSH 里**新建会话，选择「RAG 工作区检索」预设**——四个 `rag_*` 工具自动可用，
   重启不丢。

3. 验证：让会话跑 `rag_status`（应看到索引信息）或 `rag_eval`。

> 注意：`preset/agent.cordis.yml` 基于 `cordis` 预设复制而来，并**移除了 `tool-cordis`
> 行**（它注册宿主级检查提供者，与 cordis 预设会话并存时会冲突）；如需 cordis 开发工具，
> 请另外开 cordis 预设的会话。

## 方式 B：DSH Loader 包（全局装载，可选）

1. 把 `../loader-packages/workspace-rag/` 复制到 DSH profile 的 `node_modules`，并在
   `cordis.patch.yml` 的 `insert` 列表加一行 `- id: workspace-rag / name: dsh-plugin-workspace-rag`。
2. 该方式对所有会话生效；**每个工作区**可用 `.rag/off` 空文件单独关掉（删文件恢复）。

## 开关（不想用 RAG 时）

- **某工作区禁用**：在该工作区建空文件 `.rag/off` → 即使开着 RAG 预设，工具也不加载；
  删除即恢复。
- **整个会话不用**：开其它预设（standard / code / minimal）的会话天然没有这些工具。

## 使用

- 建索引：把文档放进工作区 → 让 AI 调 `rag_ingest`（默认扫当前工作区，索引存
  `<工作区>/.rag/index.json`）。
- 检索：直接向 AI 提问，它会自动 `rag_search`；也可显式 `mode=semantic/lexical`、
  `hybrid_weight=0.x`、`top_k=n`、`group_by_doc=false`。
- 评估：把问题集写成 `[{query, expected:[子串...]}]` 的 JSON，让 AI 跑 `rag_eval`
  （默认读 `<工作区>/.rag/eval.json`；示例见 `samples/eval.example.json`）。

## 已知边界

- 扫描版 PDF 无法抽取文字（需 OCR，未含）。
- 索引为全量 JSON 重建，适合几百份文档；超大语料建议后续升级二进制向量存储。
- 静态插件不依赖任何 npm 包（工具定义手工构造）；helper 依赖见 `tools/package.json`。
