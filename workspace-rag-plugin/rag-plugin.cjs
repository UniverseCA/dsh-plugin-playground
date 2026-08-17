'use strict';
/**
 * workspace-rag 静态版 —— 供 agent preset 永久加载。
 * 与动态版等价：rag_ingest / rag_search / rag_status / rag_eval。
 * 依赖：会话工作区下的 tools/rag-helper.js（embedding + 分词 daemon）与本地模型缓存。
 * 注意：不依赖任何 npm 包（工具定义手工构造），只使用宿主服务。
 */

module.exports = {
  inject: ['fs', 'tools', 'sandboxPolicy', 'workspaceRegistry', 'agents', 'subprocess'],

  async apply(ctx) {
    const fs = ctx.fs;

    // ---------- 常量 ----------
    const SUPPORTED_EXT = new Set([
      '.txt', '.md', '.markdown', '.mdx', '.rst', '.adoc',
      '.py', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
      '.java', '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.go',
      '.rb', '.php', '.swift', '.kt', '.rs', '.sh', '.bat', '.ps1',
      '.sql', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
      '.html', '.css', '.scss', '.csv', '.xml', '.log',
      '.pdf', '.docx'
    ]);
    const HELPER_EXTS = new Set(['.pdf', '.docx']);
    const DENY_DIRS = new Set([
      '.git', '.hg', '.svn', 'node_modules', 'venv', '.venv', 'env',
      '__pycache__', 'dist', 'build', '.next', '.nuxt', '.cache', 'target',
      '.rag', '.npm-cache', 'tools', 'py'
    ]);
    const MAX_FILE_BYTES = 5 * 1024 * 1024;
    const MAX_FILES = 2000;
    const DEFAULT_MODEL = 'Xenova/bge-small-zh-v1.5';
    const STOPWORDS = new Set([
      '的', '了', '是', '在', '与', '和', '及', '等', '可', '应', '为', '对', '其', '或', '中', '有',
      '也', '都', '将', '由', '于', '被', '从', '向', '以', '之', '而', '这', '那', '且', '并', '但',
      '就', '又', '很', '更', '最', '则', '若', '如', '上', '下', '内', '外', '后', '前', '时', '年',
      '月', '日', '较', '均', '需', '该', '要', '会', '能', '可以', '可能', '进行', '通过', '采用',
      '给予', '有关', '相关', '以及', '其中', '包括', '具有', '对于', '根据', '按照', '由于', '因为',
      '所以', '如果', '然后', '或者', '并且', '而且', '不仅', '同时', '主要', '需要', '应该', '是否',
      '哪些', '什么', '怎么', '如何', '多少', '一个', '一种'
    ]);
    const TITLE_BOOST = 1.35;

    // ---------- 路径/文本工具 ----------
    const toPosix = (p) => String(p).replace(/\\/g, '/');
    const joinPosix = (...parts) => parts.filter(Boolean).map(toPosix).join('/').replace(/\/+/g, '/');
    const dirnamePosix = (p) => { const s = toPosix(p); const i = s.lastIndexOf('/'); return i > 0 ? s.slice(0, i) : s; };

    function isSupportedFile(name) {
      const dot = name.lastIndexOf('.');
      return dot > 0 && SUPPORTED_EXT.has(name.slice(dot).toLowerCase());
    }
    function needsHelper(name) {
      const dot = name.lastIndexOf('.');
      return dot > 0 && HELPER_EXTS.has(name.slice(dot).toLowerCase());
    }

    function isPureSymbol(t) { return /^[^\p{L}\p{N}]+$/u.test(t); }

    function tokenizeFallback(text) {
      const out = [];
      const words = String(text).toLowerCase().split(/[^\p{L}\p{N}]+/u);
      for (const w of words) {
        if (!w || w.length === 0) continue;
        if (STOPWORDS.has(w) || isPureSymbol(w)) continue;
        out.push(w);
        if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(w) && w.length >= 2) {
          for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
        }
      }
      return out;
    }

    function isSectionStart(t) {
      if (!t || t.length > 60) return false;
      if (/^#{1,6}\s/.test(t)) return true;
      if (/^[（(][一二三四五六七八九十百]+[）)]/.test(t)) return true;
      if (/^[一二三四五六七八九十百]+[、．.]/.test(t)) return true;
      if (/^\d+(\.\d+)*[、.．]/.test(t)) return true;
      if (/^\d+(\.\d+)+\s/.test(t)) return true;
      if (/^\d{1,2}\s\S/.test(t) && !/\d\s[hHdD]/.test(t)) return true;
      return false;
    }

    function chunkText(text, target = 500, overlap = 120) {
      const norm = String(text).replace(/\r\n/g, '\n');
      const lines = norm.split('\n');
      const sections = [];
      let cur = [];
      for (const line of lines) {
        if (isSectionStart(line.trim()) && cur.length) {
          sections.push(cur.join('\n'));
          cur = [line];
        } else {
          cur.push(line);
        }
      }
      if (cur.length) sections.push(cur.join('\n'));
      const chunks = [];
      let acc = '';
      for (const s of sections) {
        if (acc && acc.length + s.length + 1 > target) {
          chunks.push(acc);
          acc = acc.length > overlap ? acc.slice(-overlap) : acc;
        }
        acc = acc ? acc + '\n' + s : s;
        while (acc.length > target * 1.5) {
          const cut = acc.lastIndexOf('\n\n', target);
          const at = cut > target * 0.5 ? cut : target;
          chunks.push(acc.slice(0, at));
          acc = acc.slice(at);
        }
      }
      if (acc) chunks.push(acc);
      return chunks.filter((c) => c.trim().length > 0);
    }

    // ---------- 建索引（BM25，词级分词） ----------
    async function buildIndex(files, target, overlap, tokenizerForTexts) {
      const docs = [];
      const chunks = [];
      for (const file of files) {
        const docId = docs.length;
        docs.push({ id: docId, path: file.path });
        for (const text of chunkText(file.text, target, overlap)) {
          chunks.push({ id: chunks.length, docId, text });
        }
      }
      let tokenLists;
      if (tokenizerForTexts) {
        try { tokenLists = await tokenizerForTexts(chunks.map((c) => c.text)); }
        catch (e) { tokenLists = null; }
      }
      if (!tokenLists) tokenLists = chunks.map((c) => tokenizeFallback(c.text));
      for (const c of chunks) {
        const first = (c.text.split('\n').map((s) => s.trim()).find((s) => s.length > 0)) || '';
        c.headingTokens = isSectionStart(first) ? tokenizeFallback(first) : [];
      }
      const postings = {};
      const docFreqs = {};
      const chunkLens = [];
      let totalLen = 0;
      for (let i = 0; i < chunks.length; i++) {
        const tokens = tokenLists[i] || [];
        const tf = {};
        const seen = new Set();
        for (const t of tokens) {
          tf[t] = (tf[t] || 0) + 1;
          if (!seen.has(t)) { seen.add(t); docFreqs[t] = (docFreqs[t] || 0) + 1; }
        }
        chunkLens.push(tokens.length);
        totalLen += tokens.length;
        for (const t of Object.keys(tf)) {
          let m = postings[t];
          if (!m) { m = {}; postings[t] = m; }
          m[i] = tf[t];
        }
      }
      const totalChunks = chunks.length;
      return {
        docs, chunks, postings, docFreqs, chunkLens,
        avgLen: totalChunks ? totalLen / totalChunks : 0,
        totalChunks, k1: 1.5, b: 0.75,
        builtAt: new Date().toISOString()
      };
    }

    function scoreQuery(queryTokens, state) {
      const { postings, docFreqs, chunkLens, avgLen, totalChunks, k1, b } = state;
      const N = totalChunks || 1;
      const qtf = {};
      for (const t of queryTokens) qtf[t] = (qtf[t] || 0) + 1;
      const scores = {};
      for (const t of Object.keys(qtf)) {
        const df = docFreqs[t] || 0;
        if (!df) continue;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const m = postings[t];
        if (!m) continue;
        for (const key of Object.keys(m)) {
          const chunkId = Number(key);
          const tf = m[key];
          const dl = chunkLens[chunkId] || 1;
          const denom = tf + k1 * (1 - b + b * (dl / (avgLen || 1)));
          scores[chunkId] = (scores[chunkId] || 0) + idf * ((tf * (k1 + 1)) / denom);
        }
      }
      if (Object.keys(qtf).length > 0) {
        for (const key of Object.keys(scores)) {
          const chunk = state.chunks[Number(key)];
          if (chunk && chunk.headingTokens && chunk.headingTokens.length) {
            for (const t of queryTokens) {
              if (chunk.headingTokens.indexOf(t) >= 0) { scores[key] *= TITLE_BOOST; break; }
            }
          }
        }
      }
      return scores;
    }

    function cosine(a, b) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
      return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    }

    function prefixFor(model) {
      const m = String(model).toLowerCase();
      if (m.includes('bge')) return { query: '为这个句子生成表示以用于检索相关文章：', passage: '' };
      if (m.includes('e5')) return { query: 'query: ', passage: 'passage: ' };
      return { query: '', passage: '' };
    }

    // ---------- 会话/工作区 ----------
    function sessionWorkspace() {
      try {
        const agent = ctx.agents.currentInitiator();
        if (agent && agent.session) {
          const cwd = (agent.session.header && agent.session.header.cwd) || (agent.session.meta && agent.session.meta.cwd);
          if (cwd) return toPosix(cwd);
        }
      } catch (e) { }
      return '';
    }

    function writePolicy() {
      try {
        const agent = ctx.agents.currentInitiator();
        return agent ? ctx.sandboxPolicy.resolve({ session: agent.session }) : ctx.sandboxPolicy.resolve();
      } catch (e) {
        return ctx.sandboxPolicy.resolve();
      }
    }

    async function defaults() {
      let ws = sessionWorkspace();
      if (!ws) {
        try {
          const list = await ctx.workspaceRegistry.list();
          if (list && list.length > 0 && list[0].path) ws = toPosix(list[0].path);
        } catch (e) { ws = ''; }
      }
      if (!ws) {
        try {
          const p = ctx.sandboxPolicy.resolve();
          if (p && p.workspaceRoot) ws = toPosix(p.workspaceRoot);
        } catch (e2) { ws = ''; }
      }
      return {
        folder: ws,
        store: ws ? joinPosix(ws, '.rag', 'index.json') : '',
        work: ws ? joinPosix(ws, '.rag', 'work') : '',
        helper: ws ? joinPosix(ws, 'tools', 'rag-helper.js') : '',
        evalFile: ws ? joinPosix(ws, '.rag', 'eval.json') : ''
      };
    }

    // ── 工作区级开关：存在 <workspace>/.rag/off 文件则不加载 RAG 工具 ──
    // 用途：在其他工作区（或暂时不用 RAG 的目录）开 rag-retrieval 预设会话时，
    // 建一个 .rag/off 空文件即可让 RAG 工具完全不出现在该会话；删除文件即恢复。
    // 工作区无法解析时 fail-open（默认启用），避免误关。
    try {
      const d = await defaults();
      if (d.folder) {
        try {
          await fs.readText(await fs.resolve(joinPosix(d.folder, '.rag', 'off')));
          return; // 已禁用：不注册任何工具
        } catch (e) { /* 无 off 文件 → 启用 */ }
      }
    } catch (e) { /* 工作区未知 → 启用 */ }

    // ---------- helper（Node 子进程） ----------
    async function helperEnv(envOpts) {
      const env = {};
      if (envOpts && envOpts.hfEndpoint) env.RAG_HF_ENDPOINT = envOpts.hfEndpoint;
      if (envOpts && envOpts.hfProxy) env.RAG_PROXY = envOpts.hfProxy;
      return env;
    }

    async function runHelper(argsList, opts = {}) {
      const def = await defaults();
      if (!def.helper) throw new Error('无法定位 tools/rag-helper.js（会话工作区未知），请显式传入路径');
      let nodePath;
      try { nodePath = await ctx.subprocess.resolveExecutable('node'); }
      catch (e) { throw new Error('找不到 node 可执行文件: ' + String((e && e.message) || e)); }
      const handle = ctx.subprocess.spawn({
        argv: [nodePath, def.helper, ...argsList],
        cwd: dirnamePosix(def.helper),
        stdio: {
          stdin: opts.stdin ? 'pipe' : 'ignore',
          stdout: { maxBytes: 1024 * 1024, spill: { maxBytes: 8 * 1024 * 1024 } },
          stderr: { maxBytes: 400 * 1024, spill: { maxBytes: 2 * 1024 * 1024 } }
        },
        graceMs: 8000,
        env: await helperEnv(opts.envOpts)
      });
      const outcome = await handle.done;
      if (outcome.exitCode !== 0) {
        const stderr = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : '';
        throw new Error('rag-helper 退出码 ' + outcome.exitCode + ': ' + String(stderr).slice(-1500));
      }
      return handle;
    }

    // ---------- embedding + 分词 daemon ----------
    let daemon = null;
    let daemonSeq = 0;

    async function ensureDaemon(model, envOpts) {
      if (daemon && daemon.alive && daemon.model === model) return daemon;
      if (daemon && daemon.handle) { try { daemon.handle.terminate(); } catch (e) { } }
      const def = await defaults();
      if (!def.helper) throw new Error('无法定位 tools/rag-helper.js');
      let nodePath;
      try { nodePath = await ctx.subprocess.resolveExecutable('node'); }
      catch (e) { throw new Error('找不到 node 可执行文件'); }
      const handle = ctx.subprocess.spawn({
        argv: [nodePath, def.helper, 'serve', '--model', model],
        cwd: dirnamePosix(def.helper),
        stdio: {
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: { maxBytes: 400 * 1024, spill: { maxBytes: 2 * 1024 * 1024 } }
        },
        graceMs: 8000,
        env: await helperEnv(envOpts)
      });
      const pending = new Map();
      let alive = true;
      let buf = '';
      let lastStderr = '';
      handle.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          let msg;
          try { msg = JSON.parse(line); } catch (e) { continue; }
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            if (msg.ok) p.resolve(msg); else p.reject(new Error(msg.error || 'helper 错误'));
          }
        }
      });
      handle.done.then((outcome) => {
        alive = false;
        try { lastStderr = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''; } catch (e) { }
        const why = outcome.exitCode === 0 ? '已退出' : '异常退出(码 ' + outcome.exitCode + ') ' + String(lastStderr).slice(-800);
        for (const p of pending.values()) p.reject(new Error('embedding 服务 ' + why));
        pending.clear();
      });
      daemon = { handle, pending, alive, model, lastStderr: () => lastStderr };
      return daemon;
    }

    async function daemonCall(cmd, payload, model, envOpts) {
      const d = await ensureDaemon(model, envOpts);
      const id = (cmd === 'embed' ? 'e' : 's') + (daemonSeq++);
      const result = new Promise((resolve, reject) => d.pending.set(id, { resolve, reject }));
      d.handle.stdin.write(JSON.stringify(Object.assign({ id, cmd }, payload)) + '\n');
      return await result;
    }

    async function embedInputs(inputs, model, envOpts) {
      return await daemonCall('embed', { inputs }, model, envOpts);
    }

    async function segmentViaDaemon(texts, model, envOpts) {
      const inputs = texts.map((t, i) => ({ id: i, text: t }));
      const r = await daemonCall('segment', { inputs }, model, envOpts);
      const map = {};
      for (const s of r.segments || []) map[s.id] = s.tokens || [];
      return texts.map((_, i) => (map[i] || []).filter((t) => t && !STOPWORDS.has(t) && !isPureSymbol(t)));
    }

    async function embedQuery(query, model, envOpts) {
      const pre = prefixFor(model);
      const r = await embedInputs([{ id: 'q0', text: pre.query + query }], model, envOpts);
      return r.vectors && r.vectors[0] && r.vectors[0].vector;
    }

    // ---------- 索引持久化 ----------
    async function loadState(storePath) {
      try {
        const target = await fs.resolve(storePath);
        const raw = JSON.parse(await fs.readText(target));
        const postings = {};
        for (const t of Object.keys(raw.postings || {})) {
          const m = {};
          for (const k of Object.keys(raw.postings[t])) m[Number(k)] = raw.postings[t][k];
          postings[t] = m;
        }
        return {
          docs: raw.docs || [],
          chunks: raw.chunks || [],
          postings,
          docFreqs: raw.docFreqs || {},
          chunkLens: raw.chunkLens || [],
          avgLen: raw.avgLen || 0,
          totalChunks: raw.totalChunks || 0,
          k1: raw.k1 || 1.5,
          b: raw.b || 0.75,
          builtAt: raw.builtAt || null,
          embedding: raw.embedding || null
        };
      } catch (e) {
        return null;
      }
    }

    async function saveState(storePath, state) {
      const payload = {
        docs: state.docs,
        chunks: state.chunks,
        postings: state.postings,
        docFreqs: state.docFreqs,
        chunkLens: state.chunkLens,
        avgLen: state.avgLen,
        totalChunks: state.totalChunks,
        k1: state.k1,
        b: state.b,
        builtAt: state.builtAt,
        embedding: state.embedding || null
      };
      const target = await fs.resolve(storePath);
      await fs.writeText(target, JSON.stringify(payload), undefined, undefined, writePolicy());
      return target;
    }

    // ---------- 共享检索核心 ----------
    async function searchCore(state, query, mode, topK, hw, groupByDoc, envOpts) {
      const hasVec = !!(state.embedding && state.embedding.vectors && Object.keys(state.embedding.vectors).length > 0);
      const effectiveMode = mode || (hasVec ? 'hybrid' : 'lexical');
      if (effectiveMode !== 'lexical' && !hasVec) throw new Error('索引没有语义向量，请用 rag_ingest(embed=true) 重建，或改用 mode=lexical');
      const model = state.embedding ? state.embedding.model : '';
      const qText = String(query || '');
      let qtokens;
      if (hasVec && model) {
        try { qtokens = (await segmentViaDaemon([qText], model, envOpts))[0]; }
        catch (e) { qtokens = tokenizeFallback(qText); }
      } else {
        qtokens = tokenizeFallback(qText);
      }

      let semantic = null;
      let lexical = null;
      if (effectiveMode === 'semantic') {
        const qv = await embedQuery(qText, model, envOpts);
        semantic = {};
        for (const k of Object.keys(state.embedding.vectors)) semantic[Number(k)] = cosine(qv, state.embedding.vectors[k]);
      } else if (effectiveMode === 'lexical') {
        lexical = scoreQuery(qtokens, state);
      } else {
        lexical = scoreQuery(qtokens, state);
        let qv = null;
        try { qv = await embedQuery(qText, model, envOpts); } catch (e) { qv = null; }
        if (qv) {
          semantic = {};
          for (const k of Object.keys(state.embedding.vectors)) semantic[Number(k)] = cosine(qv, state.embedding.vectors[k]);
        }
      }

      const idSet = new Set();
      for (const k of Object.keys(lexical || {})) idSet.add(Number(k));
      for (const k of Object.keys(semantic || {})) idSet.add(Number(k));
      let maxLex = 0, maxCos = 0;
      for (const id of idSet) {
        if (lexical && (lexical[id] || 0) > maxLex) maxLex = lexical[id];
        if (semantic && (semantic[id] || 0) > maxCos) maxCos = semantic[id];
      }
      const cands = [];
      for (const id of idSet) {
        const lv = lexical ? (lexical[id] || 0) : 0;
        const cv = semantic ? (semantic[id] || 0) : 0;
        const lexN = maxLex > 0 ? lv / maxLex : 0;
        const cosN = maxCos > 0 ? cv / maxCos : 0;
        let score = effectiveMode === 'semantic' ? cosN : effectiveMode === 'lexical' ? lexN : hw * cosN + (1 - hw) * lexN;
        if (!Number.isFinite(score)) score = 0;
        cands.push({ id, score, cos: cv, lex: lv });
      }

      let hits;
      if (groupByDoc) {
        const byDoc = new Map();
        for (const c of cands) {
          const chunk = state.chunks[c.id];
          const docId = chunk ? chunk.docId : -1;
          if (!byDoc.has(docId)) byDoc.set(docId, []);
          byDoc.get(docId).push(c);
        }
        const docRows = [];
        for (const [docId, list] of byDoc) {
          list.sort((a, b) => b.score - a.score);
          const best = list[0];
          const second = list[1] ? list[1].score : 0;
          docRows.push({ docId, docScore: best.score + 0.2 * second, best, hits: list.length });
        }
        docRows.sort((a, b) => b.docScore - a.docScore);
        hits = docRows.slice(0, topK).map((r, i) => {
          const chunk = state.chunks[r.best.id];
          const doc = state.docs[r.docId];
          return {
            rank: i + 1,
            score: Math.round(r.docScore * 10000) / 10000,
            cos: Math.round(r.best.cos * 10000) / 10000,
            lex: Math.round(r.best.lex * 10000) / 10000,
            docHits: r.hits,
            path: doc ? doc.path : '(unknown)',
            text: chunk ? chunk.text : ''
          };
        });
      } else {
        cands.sort((a, b) => b.score - a.score);
        hits = cands.slice(0, topK).map((c, i) => {
          const chunk = state.chunks[c.id];
          const doc = chunk ? state.docs[chunk.docId] : null;
          return {
            rank: i + 1,
            score: Math.round(c.score * 10000) / 10000,
            cos: Math.round(c.cos * 10000) / 10000,
            lex: Math.round(c.lex * 10000) / 10000,
            docHits: 1,
            path: doc ? doc.path : '(unknown)',
            text: chunk ? chunk.text : ''
          };
        });
      }
      return { mode: effectiveMode, hits };
    }

    // ---------- 工具构造（手工 ToolDefinition，无 npm 依赖） ----------
    function buildTool(spec) {
      return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        output: {
          schema: spec.outputSchema,
          render: (args, value) => spec.render(args, value)
        },
        execute: async (args, exec) => spec.execute(args, exec)
      };
    }

    const txt = (s) => [{ type: 'text', text: s }];

    // ---------- 工具：rag_ingest ----------
    const ingest = buildTool({
      name: 'rag_ingest',
      description: '扫描文件夹里的文本/PDF/Word 文档，结构化切块（按标题/小节）后建立索引（词级 BM25 + 可选本地语义向量），保存为 JSON。之后可用 rag_search 检索。默认扫描当前工作区，索引存到 <workspace>/.rag/index.json。',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string', description: '要索引的文件夹绝对路径；省略时默认当前工作区。' },
          store_path: { type: 'string', description: '索引文件保存路径；省略时默认 <workspace>/.rag/index.json。' },
          embed: { type: 'boolean', description: '是否计算语义向量（默认 true；首次会下载本地模型）。' },
          embedding_model: { type: 'string', description: '本地 embedding 模型，默认 ' + DEFAULT_MODEL + '（中文检索专用）。' },
          chunk_size: { type: 'integer', description: '切块目标字符数，默认 500。' },
          chunk_overlap: { type: 'integer', description: '相邻块重叠字符数，默认 120。' },
          hf_endpoint: { type: 'string', description: '模型下载地址（如 https://hf-mirror.com）；默认官方源。' },
          hf_proxy: { type: 'string', description: '模型下载用的 HTTP 代理（如 http://127.0.0.1:7897）；默认不走代理。' }
        },
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          storePath: { type: 'string' },
          folder: { type: 'string' },
          filesIndexed: { type: 'integer' },
          filesSkipped: { type: 'integer' },
          chunks: { type: 'integer' },
          docs: { type: 'integer' },
          embeddingModel: { type: 'string' },
          embeddedChunks: { type: 'integer' },
          note: { type: 'string' }
        },
        required: ['storePath', 'folder', 'filesIndexed', 'filesSkipped', 'chunks', 'docs'],
        additionalProperties: false
      },
      render: (args, value) => txt([
        `RAG 索引完成 -> ${value.storePath}`,
        `文件夹: ${value.folder}`,
        `文件: ${value.filesIndexed} 个（跳过 ${value.filesSkipped} 个），文档: ${value.docs} 份，切块: ${value.chunks} 块`,
        value.embeddingModel ? `语义向量: ${value.embeddedChunks} 块（${value.embeddingModel}）` : '语义向量: 未生成',
        value.note ? `提示: ${value.note}` : '',
        '现在可以用 rag_search 检索。'
      ].filter(Boolean).join('\n')),
      execute: async (args) => {
        const def = await defaults();
        const folderPath = args.folder ? toPosix(args.folder) : def.folder;
        if (!folderPath) throw new Error('未提供 folder，且无法推断当前工作区，请显式传入 folder 参数');
        const storePath = args.store_path ? toPosix(args.store_path) : def.store;
        if (!storePath) throw new Error('未提供 store_path，且无法推断当前工作区，请显式传入 store_path 参数');
        const wantEmbed = args.embed !== false;
        const model = args.embedding_model || DEFAULT_MODEL;
        const envOpts = { hfEndpoint: args.hf_endpoint || '', hfProxy: args.hf_proxy || '' };
        const chunkSize = Math.max(100, Math.min(2000, Number(args.chunk_size) || 500));
        const chunkOverlap = Math.max(0, Math.min(800, Number(args.chunk_overlap) || 120));
        const pre = prefixFor(model);

        const root = await fs.resolve(folderPath);
        const info = await fs.stat(root);
        if (!info || info.type !== 'directory') throw new Error(`folder 不是目录: ${folderPath}`);

        const found = [];
        async function walk(target, rel) {
          if (found.length >= MAX_FILES) return;
          let entries;
          try { entries = await fs.listDir(target); } catch (e) { return; }
          for (const e of entries) {
            if (found.length >= MAX_FILES) return;
            if (e.type === 'directory') {
              if (DENY_DIRS.has(e.name)) continue;
              await walk(e.target, rel ? rel + '/' + e.name : e.name);
            } else if (e.type === 'file' && isSupportedFile(e.name)) {
              if (e.size !== undefined && e.size > MAX_FILE_BYTES) continue;
              let abs = '';
              try { abs = fs.processPath(e.target); } catch (err) { abs = ''; }
              found.push({ entry: e, path: abs || (rel ? rel + '/' + e.name : e.name), name: e.name });
            }
          }
        }
        await walk(root, '');

        const files = [];
        let skipped = 0;
        let totalBytes = 0;
        const binary = found.filter((f) => needsHelper(f.name));
        const textFiles = found.filter((f) => !needsHelper(f.name));
        for (const f of textFiles) {
          try {
            const text = await fs.readText(f.entry.target);
            if (text && text.trim()) { files.push({ path: f.path, text }); totalBytes += text.length; }
            else skipped += 1;
          } catch (e) { skipped += 1; }
        }
        if (binary.length) {
          const inFile = joinPosix(def.work, 'extract-in.json');
          const outFile = joinPosix(def.work, 'extract-out.json');
          await fs.writeText(await fs.resolve(inFile), JSON.stringify(binary.map((f) => f.path)), undefined, undefined, writePolicy());
          await runHelper(['extract', '--in', inFile, '--out', outFile], { envOpts });
          let extracted;
          try {
            extracted = JSON.parse(await fs.readText(await fs.resolve(outFile)));
          } catch (e) {
            throw new Error('读取 helper 抽取结果失败: ' + String((e && e.message) || e));
          }
          const byFile = {};
          for (const r of extracted) byFile[r.file] = r;
          for (const f of binary) {
            const r = byFile[f.path];
            if (r && r.text && r.text.trim()) { files.push({ path: f.path, text: r.text }); totalBytes += r.text.length; }
            else { skipped += 1; }
          }
        }

        const tokenizerForTexts = wantEmbed
          ? async (texts) => segmentViaDaemon(texts, model, envOpts)
          : null;
        const state = await buildIndex(files, chunkSize, chunkOverlap, tokenizerForTexts);
        let embeddingModel = null;
        let embeddedChunks = 0;
        let note = '';
        if (wantEmbed && state.totalChunks > 0) {
          try {
            const inputs = state.chunks.map((c) => ({ id: c.id, text: pre.passage + c.text }));
            const res = await embedInputs(inputs, model, envOpts);
            const vectors = {};
            const dim = res.vectors && res.vectors[0] ? res.vectors[0].vector.length : 0;
            for (const v of res.vectors || []) vectors[v.id] = v.vector.map((x) => Math.round(x * 1e6) / 1e6);
            if (dim > 0 && Object.keys(vectors).length > 0) {
              state.embedding = { model, dim, vectors, hfEndpoint: envOpts.hfEndpoint, hfProxy: envOpts.hfProxy };
              embeddingModel = model;
              embeddedChunks = Object.keys(vectors).length;
            }
          } catch (e) {
            note = '语义向量生成失败（' + String((e && e.message) || e).slice(0, 300) + '），已回退为纯词法索引';
          }
        }

        await saveState(storePath, state);
        return {
          storePath,
          folder: folderPath,
          filesIndexed: files.length,
          filesSkipped: skipped,
          chunks: state.totalChunks,
          docs: state.docs.length,
          embeddingModel,
          embeddedChunks,
          note
        };
      }
    });

    // ---------- 工具：rag_search ----------
    const search = buildTool({
      name: 'rag_search',
      description: '检索 RAG 索引，返回最相关的文本块（默认按文档归并，优先多证据命中的文档）。默认混合检索（词级 BM25 + 语义余弦）。有向量时 mode=hybrid/semantic，无向量自动回退 lexical。hybrid_weight 控制语义占比。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索问题或关键词（中文/英文均可）。' },
          top_k: { type: 'integer', description: '返回 top-N 个结果（默认按文档计），默认 5，最大 10。' },
          mode: { type: 'string', enum: ['hybrid', 'semantic', 'lexical'], description: 'hybrid=混合(默认)；semantic=纯语义；lexical=纯词法。' },
          hybrid_weight: { type: 'number', description: '混合模式中语义得分占比（0~1），默认 0.6。' },
          group_by_doc: { type: 'boolean', description: '按文档归并结果（默认 true）；false 则返回纯文本块。' },
          store_path: { type: 'string', description: '索引文件路径；省略时默认 <workspace>/.rag/index.json。' }
        },
        required: ['query'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          storePath: { type: 'string' },
          totalChunks: { type: 'integer' },
          query: { type: 'string' },
          mode: { type: 'string' },
          hits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                score: { type: 'number' },
                cos: { type: 'number' },
                lex: { type: 'number' },
                docHits: { type: 'integer' },
                path: { type: 'string' },
                text: { type: 'string' }
              },
              additionalProperties: false
            }
          }
        },
        required: ['storePath', 'totalChunks', 'query', 'mode', 'hits'],
        additionalProperties: false
      },
      render: (args, value) => {
        const lines = [`RAG 检索 "${value.query}"（${value.mode}）-> ${value.storePath}（命中 ${value.hits.length} 条）`];
        for (const h of value.hits) {
          lines.push(`\n【${h.rank}】score=${h.score} (cos=${h.cos}, lex=${h.lex}, docHits=${h.docHits}) 文件: ${h.path}\n${h.text}`);
        }
        return txt(lines.join('\n'));
      },
      execute: async (args) => {
        const def = await defaults();
        const storePath = args.store_path ? toPosix(args.store_path) : def.store;
        if (!storePath) throw new Error('未提供 store_path，且无法推断当前工作区，请显式传入 store_path 参数');
        const state = await loadState(storePath);
        if (!state || !state.totalChunks) throw new Error(`索引不存在或为空: ${storePath}。请先调用 rag_ingest 建立索引。`);
        const topK = Math.min(Math.max(Number(args.top_k) || 5, 1), 10);
        const hwRaw = args.hybrid_weight;
        const hw = hwRaw === undefined || hwRaw === null ? 0.6 : Math.min(Math.max(Number(hwRaw), 0), 1);
        const groupByDoc = args.group_by_doc !== false;
        const envOpts = state.embedding ? { hfEndpoint: state.embedding.hfEndpoint || '', hfProxy: state.embedding.hfProxy || '' } : {};
        const res = await searchCore(state, args.query, args.mode, topK, hw, groupByDoc, envOpts);
        return { storePath, totalChunks: state.totalChunks, query: String(args.query || ''), mode: res.mode, hits: res.hits };
      }
    });

    // ---------- 工具：rag_status ----------
    const status = buildTool({
      name: 'rag_status',
      description: '查看 RAG 索引状态：是否存在、文档/切块数、语义向量信息、构建时间、文档清单。',
      parameters: {
        type: 'object',
        properties: {
          store_path: { type: 'string', description: '索引文件路径；省略时默认 <workspace>/.rag/index.json。' }
        },
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          exists: { type: 'boolean' },
          storePath: { type: 'string' },
          docs: { type: 'integer' },
          chunks: { type: 'integer' },
          embeddingModel: { type: 'string' },
          embeddingDim: { type: 'integer' },
          embeddedChunks: { type: 'integer' },
          builtAt: { type: 'string' },
          documents: { type: 'array', items: { type: 'string' } }
        },
        required: ['exists', 'storePath', 'docs', 'chunks', 'documents'],
        additionalProperties: false
      },
      render: (args, value) => {
        if (!value.exists) return txt(`索引不存在: ${value.storePath}。先运行 rag_ingest 建立索引。`);
        const lines = [
          `RAG 索引: ${value.storePath}`,
          `构建时间: ${value.builtAt}`,
          `文档: ${value.docs} 份，切块: ${value.chunks} 块`,
          value.embeddingModel ? `语义向量: ${value.embeddedChunks} 块（${value.embeddingModel}, dim=${value.embeddingDim}）` : '语义向量: 无（仅词法检索）',
          '文档清单:'
        ];
        for (const d of value.documents) lines.push('  - ' + d);
        return txt(lines.join('\n'));
      },
      execute: async (args) => {
        const def = await defaults();
        const storePath = args.store_path ? toPosix(args.store_path) : def.store;
        if (!storePath) throw new Error('未提供 store_path，且无法推断当前工作区，请显式传入 store_path 参数');
        const state = await loadState(storePath);
        if (!state || !state.totalChunks) return { exists: false, storePath, docs: 0, chunks: 0, documents: [] };
        return {
          exists: true,
          storePath,
          docs: state.docs.length,
          chunks: state.totalChunks,
          embeddingModel: state.embedding ? state.embedding.model : null,
          embeddingDim: state.embedding ? state.embedding.dim : 0,
          embeddedChunks: state.embedding ? Object.keys(state.embedding.vectors).length : 0,
          builtAt: state.builtAt || '',
          documents: state.docs.map((d) => d.path).slice(0, 500)
        };
      }
    });

    // ---------- 工具：rag_eval ----------
    const evalTool = buildTool({
      name: 'rag_eval',
      description: '跑评估集（默认 <workspace>/.rag/eval.json，格式 [{query, expected:[子串...]}]），对每条查询执行检索并计算 hit@1/3/5，输出汇总指标和逐条明细。',
      parameters: {
        type: 'object',
        properties: {
          store_path: { type: 'string', description: '索引文件路径；省略时默认 <workspace>/.rag/index.json。' },
          eval_path: { type: 'string', description: '评估集 JSON 路径；省略时默认 <workspace>/.rag/eval.json。' },
          mode: { type: 'string', enum: ['hybrid', 'semantic', 'lexical'], description: '检索模式，默认 hybrid。' },
          top_k: { type: 'integer', description: '每条查询的召回数，默认 5。' },
          hybrid_weight: { type: 'number', description: '混合模式语义占比，默认 0.6。' },
          group_by_doc: { type: 'boolean', description: '是否按文档归并（默认 true）。' }
        },
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          hit1: { type: 'integer' },
          hit3: { type: 'integer' },
          hit5: { type: 'integer' },
          hit1Rate: { type: 'number' },
          cases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                hit1: { type: 'boolean' },
                hit3: { type: 'boolean' },
                hit5: { type: 'boolean' },
                topPath: { type: 'string' }
              },
              additionalProperties: false
            }
          }
        },
        required: ['total', 'hit1', 'hit3', 'hit5', 'hit1Rate', 'cases'],
        additionalProperties: false
      },
      render: (args, value) => {
        const lines = [
          `RAG 评估（${args.mode || 'hybrid'}，top_k=${args.top_k || 5}）: 共 ${value.total} 条`,
          `hit@1 = ${value.hit1}/${value.total} (${(value.hit1Rate * 100).toFixed(0)}%)  hit@3 = ${value.hit3}/${value.total}  hit@5 = ${value.hit5}/${value.total}`
        ];
        for (const c of value.cases) {
          const mark = c.hit1 ? '1' : c.hit3 ? '3' : c.hit5 ? '5' : '-1';
          lines.push(`  [${mark}] ${c.query} -> ${c.topPath}`);
        }
        return txt(lines.join('\n'));
      },
      execute: async (args) => {
        const def = await defaults();
        const storePath = args.store_path ? toPosix(args.store_path) : def.store;
        if (!storePath) throw new Error('未提供 store_path，且无法推断当前工作区，请显式传入 store_path 参数');
        const evalPath = args.eval_path ? toPosix(args.eval_path) : def.evalFile;
        if (!evalPath) throw new Error('未提供 eval_path，且无法推断当前工作区');
        const state = await loadState(storePath);
        if (!state || !state.totalChunks) throw new Error(`索引不存在或为空: ${storePath}`);
        let cases;
        try {
          cases = JSON.parse(await fs.readText(await fs.resolve(evalPath)));
        } catch (e) {
          throw new Error('读取评估集失败: ' + String((e && e.message) || e));
        }
        const topK = Math.min(Math.max(Number(args.top_k) || 5, 1), 10);
        const hwRaw = args.hybrid_weight;
        const hw = hwRaw === undefined || hwRaw === null ? 0.6 : Math.min(Math.max(Number(hwRaw), 0), 1);
        const groupByDoc = args.group_by_doc !== false;
        const envOpts = state.embedding ? { hfEndpoint: state.embedding.hfEndpoint || '', hfProxy: state.embedding.hfProxy || '' } : {};
        const out = [];
        let hit1 = 0, hit3 = 0, hit5 = 0;
        for (const cs of cases) {
          const expected = (cs.expected || []).map((s) => String(s).toLowerCase());
          const res = await searchCore(state, cs.query, cs.mode || args.mode, Math.max(topK, 5), hw, groupByDoc, envOpts);
          const paths = res.hits.map((h) => String(h.path).toLowerCase());
          const matchAt = (n) => paths.slice(0, n).some((p) => expected.some((e) => e && p.indexOf(e) >= 0));
          const h1 = matchAt(1);
          const h3 = matchAt(3);
          const h5 = matchAt(5);
          if (h1) hit1 += 1;
          if (h3) hit3 += 1;
          if (h5) hit5 += 1;
          out.push({
            query: cs.query,
            hit1: h1,
            hit3: h3,
            hit5: h5,
            topPath: res.hits[0] ? res.hits[0].path : '(无结果)'
          });
        }
        const total = cases.length;
        return {
          total,
          hit1,
          hit3,
          hit5,
          hit1Rate: total ? hit1 / total : 0,
          cases: out
        };
      }
    });

    // ---------- 注册工具 + 清理 ----------
    const disposers = [
      ctx.tools.register(ingest),
      ctx.tools.register(search),
      ctx.tools.register(status),
      ctx.tools.register(evalTool)
    ];
    return () => {
      for (const d of disposers) { try { d(); } catch (e) { } }
      if (daemon && daemon.handle) { try { daemon.handle.terminate(); } catch (e) { } }
    };
  }
};
