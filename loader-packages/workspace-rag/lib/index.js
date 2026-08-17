/**
 * dsh-plugin-workspace-rag — node (host) half.
 *
 * 静态宿主插件：注册 rag_ingest / rag_search / rag_status / rag_eval 四个模型工具，
 * 经工作区 tools/rag-helper.js（子进程 daemon）做 PDF/DOCX 抽取、中文分词与本地向量。
 *
 * 单一事实源：插件本体在 ../../workspace-rag-plugin/rag-plugin.cjs。
 * 本 loader 包只是 ESM 转发壳；若脱离仓库单独复制使用，请把 rag-plugin.cjs 一起带上
 * （或把它整体内联到本文件）。
 */
import plugin from "../../workspace-rag-plugin/rag-plugin.cjs";

export const inject = plugin.inject;

export function apply(ctx, config) {
  return plugin.apply(ctx, config);
}
