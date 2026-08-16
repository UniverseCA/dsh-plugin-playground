// ============================================================================
// System Monitor — DSH Loader client 插件（持久化自动装载）
// 密码：通过同源 fetch GET /__dsh_sysmon 取宿主 CPU/内存/GPU/OS（host 半边经
// webServer 暴露）。每 3s 刷新。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-system-monitor",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    function SysBadge(props) {
      var useState = React.useState;
      var useEffect = React.useEffect;
      var stateAll = useState(null);
      var state = stateAll[0];
      var setState = stateAll[1];
      var openAll = useState(false);
      var open = openAll[0];
      var setOpen = openAll[1];

      // 互斥协调：打开时广播；其它浮层收到后关闭自己
      var PANEL_ID = "system-monitor";
      useEffect(function () {
        function onPanelOpen(ev) {
          try { if (ev && ev.detail && ev.detail.id !== PANEL_ID) setOpen(false); } catch (e) {}
        }
        window.addEventListener("dsh:panel-open", onPanelOpen);
        return function () { window.removeEventListener("dsh:panel-open", onPanelOpen); };
      }, []);
      function notifyOpen() {
        try { window.dispatchEvent(new CustomEvent("dsh:panel-open", { detail: { id: PANEL_ID } })); } catch (e) {}
      }

      var intervalFn = props.interval;

      useEffect(function () {
        var alive = true;
        var unsub = null;
        function load() {
          try {
            fetch("/__dsh_sysmon", { method: "GET", cache: "no-store" })
              .then(function (r) { return r.json(); })
              .then(function (res) { if (alive) setState(res || { ok: false, error: "no response" }); })
              .catch(function (e) { if (alive) setState({ ok: false, error: String((e && e.message) || e) }); });
          } catch (e) { if (alive) setState({ ok: false, error: String(e) }); }
        }
        load();
        if (typeof intervalFn === "function") unsub = intervalFn(load, 3000);
        return function () { alive = false; if (unsub) { try { unsub(); } catch (e) {} } };
      }, [intervalFn]);

      var sys = (state && state.ok && state.data && state.data.system) ? state.data.system : null;
      var cpu = sys && typeof sys.cpuPct === "number" ? sys.cpuPct : null;
      var mem = sys && typeof sys.memUsedPct === "number" ? sys.memUsedPct : null;

      function toneXY(v) {
        if (typeof v !== "number") return "#8a8f98";
        if (v >= 80) return "#e5484d";
        if (v >= 50) return "#f5a524";
        return "#3ecf8e";
      }
      var cpuTone = toneXY(cpu);
      var memTone = toneXY(mem);

      function mb(m) {
        if (typeof m !== "number" || m <= 0) return null;
        if (m >= 1024) return (m / 1024).toFixed(1) + " GB";
        return Math.round(m) + " MB";
      }

      function Row(label, value, tone) {
        return React.createElement("div", { style: { padding: "6px 0", borderBottom: "1px solid #24262e", display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
          React.createElement("span", { style: { color: "#9aa0aa" } }, label),
          React.createElement("span", { style: { fontWeight: 700, color: tone || "#e8eaf0" } }, value));
      }

      var card = React.createElement("div", { style: {
        position: "fixed", right: 16, top: 58, zIndex: 9999,
        background: "#17191e", border: "1px solid #2b2f3a", borderRadius: 12,
        padding: "12px 14px", width: 300, boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#e8eaf0", fontSize: 13
      } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("span", null, "\u7cfb\u7edf\u76d1\u63a7"),
          React.createElement("button", { onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(false); }, style: { background: "none", border: "none", color: "#8a90a0", cursor: "pointer", fontSize: 13, padding: 0 } }, "\u2715")),
        sys ? React.createElement("div", null,
          Row("CPU", typeof cpu === "number" ? cpu.toFixed(1) + "%" : "\u2014", cpuTone),
          Row("\u5185\u5b58", typeof mem === "number" ? mem.toFixed(1) + "%" : "\u2014", memTone),
          React.createElement("div", { style: { fontSize: 11, color: "#6b7280", marginTop: 1, marginBottom: 4 } },
            (typeof sys.memUsedPct === "number" ? ((sys.memTotalMB ? "\u5df2\u7528 " + mb(sys.memTotalMB - sys.memFreeMB) + " / \u5171 " + mb(sys.memTotalMB) : "")).trim() : "")),
          sys.gpuPresent && sys.gpu ? Row("GPU", sys.gpu, "#9aa0aa") : null,
          Row("\u4e3b\u673a", sys.hostname || "\u2014", "#9aa0aa"),
          sys.os ? Row("\u7cfb\u7edf", sys.os, "#9aa0aa") : null)
        : React.createElement("div", { style: { color: "#e5484d", padding: "6px 0" } }, (state && state.error) || "\u52a0\u8f7d\u5931\u8d25"));

      var badge = React.createElement("button", {
        onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); if (open) { setOpen(false); } else { setOpen(true); notifyOpen(); } },
        title: "\u7cfb\u7edf\u76d1\u63a7 \u00b7 \u70b9\u51fb\u5f00\u5173\u8be6\u60c5",
        style: { display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, cursor: "pointer", border: "1px solid #333", background: "#1a1d24", color: "#eee", fontSize: 12, fontWeight: 600 }
      },
        React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: cpuTone, display: "inline-block" } }),
        React.createElement("span", null, "CPU " + (typeof cpu === "number" ? cpu.toFixed(0) + "%" : "\u2026")),
        React.createElement("span", { style: { color: "#3a3f4a" } }, "\u00b7"),
        React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: memTone, display: "inline-block" } }),
        React.createElement("span", null, "MEM " + (typeof mem === "number" ? mem.toFixed(0) + "%" : "\u2026")));

      return React.createElement("div", { style: { position: "relative", display: "inline-flex" } }, badge, open ? card : null);
    }

    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;
      var timerSvc = ctx.get("timer");
      var intervalClosure = function (fn, ms) {
        if (timerSvc && typeof timerSvc.interval === "function") return timerSvc.interval(fn, ms);
        return null;
      };
      slots.inject("conversation.session.header.utilities", function () {
        return slots.register(
          { name: "conversation.session.header.utilities", id: "system-monitor", label: "System Monitor" },
          function () { return React.createElement(SysBadge, { interval: intervalClosure }); });
      });
    };

    return module.exports;
  }
});
