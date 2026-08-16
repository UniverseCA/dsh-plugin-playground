// convert.mjs — 把纯 client 插件的 client.js 转成 DSH Loader bundle
// 用法: node convert.mjs <pluginId> <sourceClientJs> <outBundleClientJs>
// 规则（针对本仓库 client.js 的稳定格式）：
//   · 注入 var React = require("react");
//   · 把最后一个顶层 `return {` ... 结尾 } 的 Cordis 对象，改写为 exports.apply 赋值
//   · 包进 window.__ModuleLoader__.load({ id, factory })
import { readFileSync, writeFileSync } from "node:fs";

const [, , pluginId, srcPath, outPath] = process.argv;
if (!pluginId || !srcPath || !outPath) {
  console.error("usage: node convert.mjs <pluginId> <srcClientJs> <outBundleClientJs>");
  process.exit(1);
}

let src = readFileSync(srcPath, "utf8");

// 定位最后一个顶层 `return {`
const marker = "\nreturn {";
const idx = src.lastIndexOf(marker);
if (idx === -1) throw new Error("cannot find '\nreturn {' in " + srcPath);

const before = src.slice(0, idx); // 前置：函数定义 + 常量（不含最后的 return{}）
// 精确提取 apply 函数体：从 `apply(ctx) {` 的 `{` 开始，括号配平找闭合 `}`
const applyStartSearch = src.indexOf("apply(ctx)", idx);
const applyBodyStart = src.indexOf("{", applyStartSearch);
let depth = 0;
let pos = applyBodyStart;
for (; pos < src.length; pos++) {
  const ch = src[pos];
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) { pos++; break; }
  }
}
// applyBody = 从 apply 的 `{` 之后 到 配平的 `}` 闭（含右边内容边界内）
const applyBody = src.slice(applyBodyStart + 1, pos - 1);

// 提取 inject（可选）：从 return{...} 里抓 "inject: [...]"
let injectArr = null;
const injMatch = src.slice(idx).match(/inject\s*:\s*\[([^\]]*)\]/);
if (injMatch) {
  injectArr = injMatch[1].split(",").map((s) => s.trim().replace(/['"]/g, "")).filter(Boolean);
}

const bundle = `// ============================================================================
// ${pluginId} — DSH Loader client 插件（持久化自动装载，自动转换生成）
// 依赖：require("react")（DSH Loader 运行时提供）。
// 关键：register 的 render 必须转发 slot props（useSession/useInput/...）。
// ============================================================================

window.__ModuleLoader__.load({
  id: ${JSON.stringify(pluginId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

${before}

    exports.inject = ${JSON.stringify(injectArr || [])};
    exports.apply = function apply(ctx) {
${applyBody}
    };

    return module.exports;
  }
});
`;

writeFileSync(outPath, bundle, "utf8");
console.log("converted => " + outPath + " (bytes=" + Buffer.byteLength(bundle) + ")");
