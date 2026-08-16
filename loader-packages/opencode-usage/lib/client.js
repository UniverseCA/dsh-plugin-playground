// ============================================================================
// OpenCode Go 用量徽标 — DSH Loader client 插件（持久化自动装载）
// 通过同源 fetch GET /__dsh_opencode_usage 取 rolling/weekly/monthly 用量。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-opencode-usage",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    function UsageBadge(props) {
      var useState = React.useState;
      var useEffect = React.useEffect;
      var stateAll = useState(null);
      var state = stateAll[0];
      var setState = stateAll[1];
      var openAll = useState(false);
      var open = openAll[0];
      var setOpen = openAll[1];

      // 互斥协调：打开时广播；其它浮层收到后关闭自己
      var PANEL_ID = "opencode-usage";
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
            fetch("/__dsh_opencode_usage", { method: "GET", cache: "no-store" })
              .then(function (r) { return r.json(); })
              .then(function (res) { if (alive) setState(res || { ok: false, error: "no response" }); })
              .catch(function (e) { if (alive) setState({ ok: false, error: String((e && e.message) || e) }); });
          } catch (e) { if (alive) setState({ ok: false, error: String(e) }); }
        }
        load();
        if (typeof intervalFn === "function") unsub = intervalFn(load, 60000);
        return function () { alive = false; if (unsub) { try { unsub(); } catch (e) {} } };
      }, [intervalFn]);

      var meta = state && state.ok && state.data && state.data.usage ? state.data.usage : null;
      var rolling = meta ? meta.rolling : null;
      var weekly = meta ? meta.weekly : null;
      var monthly = meta ? meta.monthly : null;
      var pct = rolling && typeof rolling.percent === "number" ? rolling.percent : null;
      var tone = pct === null ? "#8a8f98" : (pct >= 80 ? "#e5484d" : (pct >= 50 ? "#f5a524" : "#3ecf8e"));

      function labelColor(v) {
        if (typeof v !== "number") return "#9aa0aa";
        if (v >= 80) return "#e5484d";
        if (v >= 50) return "#f5a524";
        return "#3ecf8e";
      }

      function fmtWall(d) {
        function p2(x) { return String(x).padStart(2, "0"); }
        return p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
      }
      function formatReset(resetsAt) {
        if (!resetsAt) return null;
        var d = new Date(resetsAt);
        if (isNaN(d.getTime())) return null;
        var now = new Date();
        var diffMs = d.getTime() - now.getTime();
        if (diffMs < 0) return "\u5df2\u91cd\u7f6e\uff08" + fmtWall(d) + "\uff09";
        var diffH = Math.floor(diffMs / 3600000);
        var diffD = Math.floor(diffMs / 86400000);
        var diffMin = Math.floor(diffMs / 60000);
        var remain = "";
        if (diffH < 1) remain = "" + Math.max(diffMin, 1) + " \u5206\u949f\u540e";
        else if (diffD < 1) remain = "" + diffH + " \u5c0f\u65f6\u540e";
        else remain = "" + diffD + " \u5929\u540e";
        return remain + "\u91cd\u7f6e\uff08" + fmtWall(d) + "\uff09";
      }

      function Row(rowProps) {
        var ru = rowProps.ru;
        var reset = ru ? formatReset(ru.resetsAt) : null;
        return React.createElement("div", { style: { padding: "6px 0", borderBottom: "1px solid #24262e" } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } },
            React.createElement("span", { style: { color: "#9aa0aa" } }, rowProps.label),
            React.createElement("span", { style: { fontWeight: 700, color: labelColor(ru.percent) } },
              typeof ru.percent === "number" ? (ru.percent + "%") : "\u2014")),
          reset ? React.createElement("div", { style: { fontSize: 11, color: "#6b7280", marginTop: 2 } }, reset) : null);
      }

      var card = React.createElement("div", { style: {
        position: "fixed", right: 16, top: 58, zIndex: 9999,
        background: "#17191e", border: "1px solid #2b2f3a", borderRadius: 12,
        padding: "12px 14px", width: 280, boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#e8eaf0", fontSize: 13
      } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("span", null, "OpenCode Go \u7528\u91cf"),
          React.createElement("button", { onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(false); }, style: { background: "none", border: "none", color: "#8a90a0", cursor: "pointer", fontSize: 13, padding: 0 } }, "\u2715")),
        meta
          ? React.createElement(React.Fragment, null,
              React.createElement(Row, { label: "Rolling (5h)", ru: rolling }),
              React.createElement(Row, { label: "Weekly", ru: weekly }),
              React.createElement(Row, { label: "Monthly", ru: monthly }))
          : React.createElement("div", { style: { color: "#e5484d", padding: "6px 0" } }, (state && state.error) || "\u52a0\u8f7d\u5931\u8d25"));

      var badge = React.createElement("button", {
        onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); if (open) { setOpen(false); } else { setOpen(true); notifyOpen(); } },
        title: "OpenCode Go \u7528\u91cf \u00b7 \u70b9\u51fb\u5f00\u5173\u8be6\u60c5",
        style: { display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999, cursor: "pointer", border: "1px solid #333", background: "#1a1d24", color: "#eee", fontSize: 12, fontWeight: 600 }
      },
        React.createElement("span", { style: { width: 8, height: 8, borderRadius: 8, background: tone, display: "inline-block" } }),
        React.createElement("span", null, "Go " + (pct === null ? "\u2026" : pct + "%")));

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
          { name: "conversation.session.header.utilities", id: "opencode-go-usage", label: "OpenCode Go" },
          function () { return React.createElement(UsageBadge, { interval: intervalClosure }); });
      });
    };

    return module.exports;
  }
});
