// ============================================================================
// Latency Chart — DSH Loader client 插件原型（单文件手写 bundle，无构建链依赖）
//
// 格式对照 @deepseek-ai/dsh-client-ui-goal/lib/client.js：
//   window.__ModuleLoader__.load({ id, factory: (require) => { ...; return module.exports } })
//
// 依赖解析（运行时由 DSH Loader 的 require 提供）：
//   require("react")
// 你需要其它框架模块（如 slots）时再用 require("@deepseek-ai/...")。
//
// 用 require("react") 取得 React；组件内部用 useSession etc 仍来自 slot props。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-latency-chart",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var reactModule = require("react");

    var RECENT = 12;

    function LatencyPanel(props) {
      var useSession = props.useSession;
      var snap = useSession(function (s) { return s });
      var useState = reactModule.useState;
      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var modeState = useState("total");
      var mode = modeState[0];
      var setMode = modeState[1];

      var items = [];
      if (snap) {
        var nodes = Array.isArray(snap.nodes) ? snap.nodes : null;
        if (!nodes && snap.chat && snap.chat.nodes && typeof snap.chat.nodes.values === "function") {
          try { nodes = snap.chat.nodes.values(); } catch (e) {}
        }
        if (Array.isArray(nodes)) {
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n || n.kind !== "assistant" || !n.timing || n.interrupted) continue;
            var t = n.timing;
            if (typeof t.completedTime !== "number") continue;
            items.push({
              seq: n.seq,
              text: (n.blocks || []).filter(function (b) { return b && b.kind === "text" && typeof b.text === "string" }).map(function (b) { return b.text }).join(""),
              totalMs: typeof t.stepStartTime === "number" && t.completedTime > t.stepStartTime ? (t.completedTime - t.stepStartTime) : null,
              ttftMs: typeof t.stepStartTime === "number" && typeof t.firstTokenTime === "number" && t.firstTokenTime >= t.stepStartTime ? (t.firstTokenTime - t.stepStartTime) : null
            });
          }
        }
        items.reverse();
      }
      var shown = items.slice(0, RECENT);
      var valueOf = function (it) { return mode === "total" ? it.totalMs : it.ttftMs };
      var maxMs = 1;
      for (var k = 0; k < shown.length; k++) { var v = valueOf(shown[k]); if (typeof v === "number" && v > maxMs) maxMs = v; }
      maxMs = Math.max(maxMs, 1);
      var valid = shown.filter(function (it) { return typeof valueOf(it) === "number" });
      var avgMs = valid.length ? valid.reduce(function (a, it) { return a + valueOf(it) }, 0) / valid.length : 0;

      function fmt(ms) {
        if (typeof ms !== "number") return "\u2014";
        if (ms < 1000) return Math.round(ms) + "ms";
        return (ms / 1000).toFixed(1) + "s";
      }
      function preview(it) {
        var s = (it.text || "").replace(/\s+/g, " ").trim();
        if (s.length > 40) s = s.slice(0, 40) + "\u2026";
        return s;
      }

      var btn = {
        display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px",
        borderRadius: 999, cursor: "pointer", border: "1px solid var(--dsw-alias-border-l1,#333)",
        background: "var(--dsw-alias-bg-primary,#1a1d24)", color: "var(--dsw-alias-label-primary,#eee)",
        fontSize: 12, fontWeight: 600
      };
      var card = {
        position: "fixed", right: 16, top: 58, zIndex: 9999, width: 380, maxWidth: "92vw",
        background: "var(--dsw-specific-tip,#17191e)", border: "1px solid var(--dsw-alias-border-l1,#2b2f3a)",
        borderRadius: 12, padding: "12px 14px", boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "var(--dsw-alias-label-primary,#eee)", fontSize: 13
      };

      return reactModule.createElement("div", { style: { position: "relative", display: "inline-flex" } },
        reactModule.createElement("button", { type: "button", style: btn, title: "\u8bf7\u6c42\u8017\u65f6\u56fe\u8868", onClick: function (e) { e.preventDefault(); e.stopPropagation(); setOpen(!open); } }, "\u23f1\ufe0f \u8017\u65f6"),
        open ? reactModule.createElement("div", { style: card },
          reactModule.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
            reactModule.createElement("span", { style: { fontWeight: 700, fontSize: 13 } }, "\u8bf7\u6c42\u8017\u65f6"),
            reactModule.createElement("button", { style: { background: "none", border: "none", color: "var(--dsw-alias-label-tertiary,#8a90a0)", cursor: "pointer", fontSize: 13, padding: 0 }, onClick: function () { setOpen(false); } }, "\u2715")),
          reactModule.createElement("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary,#8a90a0)", marginBottom: 10 } },
            "\u6700\u8fd1 " + shown.length + " \u6761 \u00b7 \u5e73\u5747 " + fmt(avgMs)),
          shown.length === 0
            ? reactModule.createElement("div", { style: { color: "var(--dsw-alias-label-tertiary,#8a90a0)", padding: "8px 2px" } }, "\u8fd8\u6ca1\u6709\u5df2\u5b8c\u6210\u7684\u8bf7\u6c42\u3002")
            : reactModule.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                shown.map(function (it, idx) {
                  var v = valueOf(it);
                  var barW = typeof v === "number" ? Math.max(2, Math.round(v / maxMs * 100)) : 0;
                  return reactModule.createElement("div", { key: it.seq, style: { display: "flex", alignItems: "center", gap: 8 } },
                    reactModule.createElement("span", { style: { width: 14, flex: "none", textAlign: "right", color: "var(--dsw-alias-label-tertiary,#8a90a0)", fontSize: 11 }, title: preview(it) }, shown.length - idx),
                    reactModule.createElement("div", { style: { flex: 1, height: 14, background: "var(--dsw-alias-interactive-bg-hover,#24262e)", borderRadius: 4, overflow: "hidden", display: "flex" } },
                      reactModule.createElement("div", { title: preview(it), style: { width: barW + "%", height: "100%", background: barTone(v, maxMs) } })),
                    reactModule.createElement("span", { style: { width: 52, flex: "none", textAlign: "right", fontSize: 11, color: "var(--dsw-alias-label-tertiary,#8a90a0)" } }, fmt(v)));
                })))
        : null);
    }

    function barTone(ms, maxMs) {
      if (typeof ms !== "number" || maxMs <= 0) return "var(--dsw-alias-label-tertiary,#8a90a0)";
      var ratio = ms / maxMs;
      if (ratio > 0.75) return "#e5484d";
      if (ratio > 0.4) return "#f5a524";
      return "#3ecf8e";
    }

    // ── Cordis 插件对象（同现有 client.js 的 return { inject, apply }）──
    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;
      slots.inject("conversation.session.header.utilities", function () {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "request-latency-chart", label: "\u8bf7\u6c42\u8017\u65f6" },
          function (props) { return reactModule.createElement(LatencyPanel, props); });
      });
    };

    return module.exports;
  }
});
