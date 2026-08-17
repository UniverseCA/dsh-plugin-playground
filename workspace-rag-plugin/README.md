# Workspace RAG — Local Semantic Retrieval for DSH

A **host-side static Cordis plugin** for [DeepSeek Harness (DSH)](https://github.com/Crascit) that turns any workspace folder into a searchable knowledge base: **Chinese-first hybrid retrieval** (word-level BM25 + local semantic vectors) over markdown / code / PDF / DOCX, entirely offline after one model download.

> 与仓库里其它「客户端 UI」插件不同，这个插件是**宿主工具型**的：它不注入页面 UI，
> 而是给会话注册 4 个模型工具（`rag_ingest` / `rag_search` / `rag_status` / `rag_eval`）。
> 安装方式是 **agent preset / DSH Loader 包**（静态装载），不是动态 `cordis_define`。

![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen) ![Platform: host](https://img.shields.io/badge/platform-host-brightgreen)

---

## Features

- 🔍 **Hybrid retrieval** — BM25 (word-level Chinese segmentation + stopwords) fused with
  cosine similarity over local embeddings (`hybrid_weight` tunable, default 0.6).
- 🀄 **Chinese-first** — segmentit word segmentation, Chinese-dedicated embedding model
  `Xenova/bge-small-zh-v1.5` (512-dim), query instruction prefix applied automatically.
- 📄 **Multi-format** — `.txt/.md/code` read directly; `.pdf` via pdf.js v2 engine; `.docx`
  via mammoth. (Scanned PDFs need OCR — not included.)
- 🧱 **Structure-aware chunking** — splits on markdown headings / numbered sections (`4.3`),
  with section-title BM25 boosting and per-document aggregation of multi-evidence hits.
- 🧪 **Built-in eval** — `rag_eval` runs a query set and reports hit@1/3/5 (regression-safe).
- 🔌 **Off switch** — a `.rag/off` marker file disables the tools per workspace.

## Tools

| Tool | Purpose |
|---|---|
| `rag_ingest` | Scan a folder, chunk, build index (BM25 + optional vectors), save JSON |
| `rag_search` | Hybrid / semantic / lexical retrieval, group by doc, tunable weight |
| `rag_status` | Index stats: docs, chunks, embedding model/dim, document list |
| `rag_eval` | Run `eval.json` (`[{query, expected:[substr...]}]`) → hit@1/3/5 |

## Architecture

```
┌──────────── Host (DSH Node process) ───────────────────────────┐
│  rag-plugin.cjs  (static Cordis plugin, registers 4 tools)      │
│      │  ctx.subprocess.spawn                                    │
│      ▼                                                          │
│  tools/rag-helper.js  (long-lived Node daemon)                  │
│      ├─ extract : pdf.js v2 / mammoth → plain text              │
│      ├─ segment : segmentit 词级分词                             │
│      └─ embed   : @xenova/transformers (bge-small-zh) → vectors │
│      │                                                          │
│      ▼                                                          │
│  <workspace>/.rag/index.json  (docs + chunks + postings + vecs)  │
└──────────────────────────────────────────────────────────────────┘
```

Everything runs locally. Models are cached under `tools/.model-cache/`
(first use downloads ~120 MB; use `hf_endpoint` + `hf_proxy` args behind a firewall).

## File Layout

| Path | Role |
|---|---|
| `rag-plugin.cjs` | The static plugin (workspace-agnostic; resolves the session workspace at runtime) |
| `preset/` | Ready-to-copy **agent preset** (`agent.cordis.yml` + `preset.yml`) |
| `tools/` | Node helper: extraction / segmentation / embedding (npm deps + `rag-helper.js`) |
| `samples/` | Demo documents + `eval.example.json` (generic query set) |
| `loader-packages/workspace-rag/` | DSH Loader package form (global install; per-workspace `.rag/off` control) |

## Installing / Running

See **[`INSTALL.md`](INSTALL.md)** (中文). Quick summary: copy `preset/` into
`~/.dsh/.agent-presets/`, put `tools/` in the target workspace (`npm install` inside it),
start a DSH session on the `rag-retrieval` preset — the four `rag_*` tools are available.

## Notes & Known Limits

- Workspace-bound: the plugin derives the workspace from the session's cwd and looks for
  `tools/rag-helper.js` there; a session on a workspace without `tools/` gets clear errors.
- Index is a full JSON rebuild (fine for hundreds of docs; binary vector storage is a roadmap item).
- `rag_eval` example in `samples/eval.example.json` targets the sample docs; for real corpora
  write your own `{query, expected}` set and point `eval_path` at it.

## License

[MIT](../LICENSE)
