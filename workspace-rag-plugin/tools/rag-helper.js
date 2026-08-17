#!/usr/bin/env node
'use strict';

/**
 * rag-helper: local tooling for the workspace RAG plugin.
 *   node rag-helper.js extract <file1> [<file2> ...] [--out out.json]
 *       -> {file,text|error}[] written to --out (or stdout)
 *   node rag-helper.js embed --in chunks.json --out vectors.json [--model M]
 *       -> [{id,vector}[]]  (one-shot; mainly used for isolated testing)
 *   node rag-helper.js serve [--model M]
 *       -> persistent daemon: stdin JSON-lines {id,cmd:'embed',inputs:[{id,text}]}
 *          stdout JSON-lines {id,cmd,ok,vectors|error}; logs go to stderr.
 */

const path = require('path');
const fs = require('fs');

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' || a === '--out' || a === '--model') {
      flags[a.slice(2)] = argv[i + 1];
      i++;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function extractOne(file) {
  const lower = String(file).toLowerCase();
  if (lower.endsWith('.pdf')) {
    // pdf-parse 默认引擎 (pdf.js 1.10.100) 在 Node 22 上损坏（bad XRef entry），
    // 改用其自带的 v2.0.550 引擎直接抽取文本。
    const pdfjs = require('pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js');
    const data = await fs.promises.readFile(file);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    const parts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let lastY, text = '';
      for (const item of tc.items) {
        if (lastY === item.transform[5] || lastY === undefined) text += item.str;
        else text += '\n' + item.str;
        lastY = item.transform[5];
      }
      parts.push(text);
      page.cleanup();
    }
    await doc.destroy();
    return { file, text: parts.join('\n\n') };
  }
  if (lower.endsWith('.docx')) {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: file });
    return { file, text: (result && result.value) || '' };
  }
  return { file, error: 'unsupported extension: ' + path.extname(file) };
}

async function cmdExtract(flags, positional) {
  let inputs = positional;
  if (inputs.length === 0 && flags.in) {
    inputs = JSON.parse(await fs.promises.readFile(flags.in, 'utf8'));
  }
  const out = [];
  for (const inp of inputs) {
    const file = typeof inp === 'string' ? inp : inp.path;
    try {
      const r = await extractOne(file);
      out.push(r);
      console.error(`extract ok: ${path.basename(file)} (${(r.text || '').length} chars)`);
    } catch (e) {
      out.push({ file, error: String((e && e.message) || e) });
      console.error(`extract fail: ${path.basename(file)}: ${(e && e.message) || e}`);
    }
  }
  const payload = JSON.stringify(out);
  if (flags.out) await fs.promises.writeFile(flags.out, payload, 'utf8');
  else process.stdout.write(payload + '\n');
}

async function loadExtractor(model) {
  const { pipeline, env } = require('@xenova/transformers');
  env.cacheDir = path.join(__dirname, '.model-cache');
  if (process.env.RAG_HF_ENDPOINT) {
    env.remoteHost = process.env.RAG_HF_ENDPOINT;
    console.error('[rag-helper] using model mirror: ' + env.remoteHost);
  }
  if (process.env.RAG_PROXY) {
    try {
      const { setGlobalDispatcher, ProxyAgent } = require('undici');
      setGlobalDispatcher(new ProxyAgent(process.env.RAG_PROXY));
      console.error('[rag-helper] model downloads via proxy: ' + process.env.RAG_PROXY);
    } catch (e) {
      console.error('[rag-helper] proxy setup failed: ' + ((e && e.message) || e));
    }
  }
  // keep stderr clean for the daemon protocol
  return await pipeline('feature-extraction', model, { quantized: true });
}

async function embedTexts(extractor, inputs) {
  const vectors = [];
  for (const x of inputs) {
    const out = await extractor(x.text, { pooling: 'mean', normalize: true });
    vectors.push({ id: x.id, vector: Array.from(out.data) });
  }
  return vectors;
}

async function cmdEmbedOnce(flags) {
  const model = flags.model || 'Xenova/multilingual-e5-small';
  const input = JSON.parse(await fs.promises.readFile(flags.in, 'utf8'));
  const extractor = await loadExtractor(model);
  const vectors = await embedTexts(extractor, input);
  await fs.promises.writeFile(flags.out, JSON.stringify(vectors), 'utf8');
  console.error(`embed done: ${vectors.length} vectors`);
}

// ---------- 中文分词（segmentit，词级） ----------
let segInst = null;
function getSegmenter() {
  if (!segInst) {
    const { Segment, useDefault } = require('segmentit');
    segInst = useDefault(new Segment());
  }
  return segInst;
}

function segmentOne(text) {
  return getSegmenter()
    .doSegment(String(text))
    .map((w) => w.w)
    .filter((t) => t && t.trim().length > 0);
}

async function segmentTexts(inputs) {
  const out = [];
  for (const x of inputs) {
    out.push({ id: x.id, tokens: segmentOne(x.text) });
  }
  return out;
}

async function cmdSegmentOnce(flags) {
  const input = JSON.parse(await fs.promises.readFile(flags.in, 'utf8'));
  const segments = await segmentTexts(input.inputs || input);
  await fs.promises.writeFile(flags.out, JSON.stringify(segments), 'utf8');
  console.error(`segment done: ${segments.length} texts`);
}

async function cmdServe(flags) {
  const model = flags.model || 'Xenova/multilingual-e5-small';
  console.error(`[rag-helper] loading model ${model} ...`);
  const extractor = await loadExtractor(model);
  console.error('[rag-helper] model ready');
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  rl.on('line', async (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      return;
    }
    try {
      if (msg.cmd === 'embed') {
        const vectors = await embedTexts(extractor, msg.inputs || []);
        send({ id: msg.id, cmd: 'embed', ok: true, vectors });
      } else if (msg.cmd === 'segment') {
        const segments = await segmentTexts(msg.inputs || []);
        send({ id: msg.id, cmd: 'segment', ok: true, segments });
      } else if (msg.cmd === 'ping') {
        send({ id: msg.id, cmd: 'ping', ok: true });
      } else {
        send({ id: msg.id, cmd: msg.cmd, ok: false, error: 'unknown cmd' });
      }
    } catch (e) {
      send({ id: msg.id, cmd: msg.cmd, ok: false, error: String((e && e.message) || e) });
    }
  });
  const exit = () => process.exit(0);
  rl.on('close', exit);
  process.stdin.on('end', exit);
}

const { flags, positional } = parseFlags(process.argv.slice(2));
const cmd = positional.shift();
const run = (p) => p.catch((e) => {
  console.error('[rag-helper] fatal: ' + ((e && e.message) || e));
  process.exit(1);
});
switch (cmd) {
  case 'extract':
    run(cmdExtract(flags, positional));
    break;
  case 'embed':
    run(cmdEmbedOnce(flags));
    break;
  case 'segment':
    run(cmdSegmentOnce(flags));
    break;
  case 'serve':
    run(cmdServe(flags));
    break;
  default:
    console.error('usage: rag-helper.js <extract|embed|serve> [flags]');
    process.exit(2);
}