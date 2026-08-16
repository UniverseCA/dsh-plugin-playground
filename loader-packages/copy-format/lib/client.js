// ============================================================================
// Copy Format — DSH Loader client 插件（持久化自动装载）
// 在每条 AI 回复图标栏 conversation.chat.assistant-actions 注入 MD（复制 Markdown）
// 与 TXT（复制纯文本）两个按钮。
//
// 依赖：require("react")（DSH Loader 运行时提供）。
// 关键：register 的 render 必须接收并转发 slot props（含 useSession/messageId）。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-copy-format",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    function CopyFormatActions(props) {
      var useSession = props.useSession;
      var messageId = props.messageId;
      var blocks = useSession(function (snap) {
        var node = null;
        if (snap && snap.chat && snap.chat.nodes && typeof snap.chat.nodes.get === "function") {
          var vals = snap.chat.nodes.values();
          for (var i = 0; i < vals.length; i++) {
            if (vals[i] && vals[i].kind === "assistant" && vals[i].messageId === messageId) { node = vals[i]; break; }
          }
        }
        if (!node && snap && Array.isArray(snap.nodes)) {
          for (var j = 0; j < snap.nodes.length; j++) {
            if (snap.nodes[j] && snap.nodes[j].kind === "assistant" && snap.nodes[j].messageId === messageId) { node = snap.nodes[j]; break; }
          }
        }
        return node ? node.blocks : null;
      });

      var md = (blocks || []).filter(function (b) { return b && b.kind === "text" && typeof b.text === "string"; }).map(function (b) { return b.text; }).join("");

      function toPlain(mdText) {
        if (!mdText) return "";
        var s = mdText
          .replace(/```[^\n]*\n?/g, "")
          .replace(/`([^`]*)`/g, "$1")
          .replace(/(\*\*|__)(.*?)\1/g, "$2")
          .replace(/(\*|_)([^*_\n]+)\1/g, "$2")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/^[ \t]*>[ \t]?/gm, "")
          .replace(/^[ \t]*[-*+][ \t]+/gm, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/!\s*/g, "");
        s = s.replace(/[ \t]+/g, " ")
          .replace(/\n[ \t]*\n+/g, "\n\n")
          .replace(/^\s+|\s+$/g, "");
        return s;
      }
      var plain = toPlain(md);

      var copiedState = React.useState(null);
      var copied = copiedState[0];
      var setCopied = copiedState[1];
      var pending = React.useRef(false);
      var copiedRef = React.useRef("md");

      function doCopy(text) {
        if (!text) return;
        if (pending.current) return;
        pending.current = true;
        var done = function (ok, which) {
          pending.current = false;
          if (!ok) { setCopied("fail"); window.setTimeout(function () { setCopied(null); }, 1500); return; }
          setCopied(which);
          window.setTimeout(function () { setCopied(null); }, 1200);
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(text).then(function () { done(true, copiedRef.current); }, function () { fallbackCopy(text, done); });
        } else {
          fallbackCopy(text, done);
        }
      }
      function onCopy(which) {
        copiedRef.current = which;
        var text = which === "md" ? md : plain;
        if (!text) return;
        doCopy(text);
      }
      function fallbackCopy(text, done) {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          done(ok, copiedRef.current);
        } catch (e) { done(false, copiedRef.current); }
      }

      var hasText = md.length > 0;
      var btnStyle = {
        width: 34, height: 28, color: "var(--dsw-alias-label-tertiary, #9aa0aa)",
        cursor: hasText ? "pointer" : "default", background: "0 0", border: "none",
        borderRadius: 14, justifyContent: "center", alignItems: "center",
        display: "inline-flex", fontSize: 12, fontWeight: 600, padding: "0 6px"
      };
      var activeBtn = function (c) {
        return c === null ? btnStyle : Object.assign({}, btnStyle, { color: "#3ecf8e" });
      };

      var mdLabel = copied === "md" ? "\u5df2\u590d\u5236" : "MD";
      var txtLabel = copied === "txt" ? "\u5df2\u590d\u5236" : "TXT";

      return React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 2, marginLeft: -4 } },
        React.createElement("button", {
          type: "button", disabled: !hasText || copied === "fail",
          title: "\u590d\u5236\u4e3a Markdown", "aria-label": "\u590d\u5236\u4e3a Markdown",
          style: activeBtn(copied === "md" ? "md" : null),
          onClick: function () { onCopy("md"); }
        }, mdLabel),
        React.createElement("button", {
          type: "button", disabled: !hasText || copied === "fail",
          title: "\u590d\u5236\u4e3a\u7eaf\u6587\u672c", "aria-label": "\u590d\u5236\u4e3a\u7eaf\u6587\u672c",
          style: activeBtn(copied === "txt" ? "txt" : null),
          onClick: function () { onCopy("txt"); }
        }, txtLabel));
    }

    exports.inject = [];
    exports.apply = function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;
      slots.inject("conversation.chat.assistant-actions", function () {
        return slots.register(
          {
            name: "conversation.chat.assistant-actions",
            id: "copy-format",
            label: "Copy as MD/TXT",
            order: 5
          },
          function (props) { return React.createElement(CopyFormatActions, props); });
      });
    };

    return module.exports;
  }
});
