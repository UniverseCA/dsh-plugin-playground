// ============================================================================
// dsh-plugin-prompt-templates — DSH Loader client 插件（持久化自动装载，自动转换生成）
// 依赖：require("react")（DSH Loader 运行时提供）。
// 关键：register 的 render 必须转发 slot props（useSession/useInput/...）。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-prompt-templates",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

// Prompt Template Drawer — Client 半边（纯客户端，无 Host 半边）
// 在 composer 上方的 dock 区（conversation.input.dock）注入一个「模板」按钮：
//   点开一个面板，列出你保存的常用 prompt 模板；点任一项即可一键 fill 进输入框。
//   支持：新增（把当前输入/自定义文本存成模板）、删除、按名称搜索。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 数据来源：localStorage（纯浏览器本地），无需 host、无需网络、无需凭据。
// 写回输入框：会话标准 kit 提供 `inputActions` prop —— 其 `setDraft(text)` 会走
//   草稿变更事件，把文本填进 composer（与 DSH 自带的 draft 恢复一致，见
//   ui-conversation 的 SessionInputShell.actions.setDraft）。
//
// 说明：
//   · conversation.input.dock 是 list 类型、session 作用域 slot；
//     组件会收到 { inputActions, useInput, useSession, sessionId, t, ... }。
//   · 模板存 localStorage key: 'dsh.prompt-templates.v1'，形如 [{title, body, tag}]。
//   · setDraft 被调用后 textarea 会同步更新（草稿机器事件驱动）。

var STORAGE_KEY = 'dsh.prompt-templates.v1'

function loadTemplates() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    var arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(function (t) { return t && typeof t.body === 'string' }).map(function (t) { return { title: t.title || '', body: t.body } })
  } catch (e) { return [] }
}
function saveTemplates(list) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch (e) {}
}

function PromptTemplates(props) {
  var inputActions = props.inputActions
  var useInput = props.useInput
  // 当前草稿（用于“把当前输入存为模板”的初始值 / 插入时是否追加）
  var draft = null
  if (typeof useInput === 'function') { try { var snap = useInput(function (s) { return s }); draft = (snap && snap.draft) || '' } catch (e) {} }

  var [open, setOpen] = React.useState(false)
  var [list, setList] = React.useState(loadTemplates)
  var [query, setQuery] = React.useState('')
  var [adding, setAdding] = React.useState(false)
  var [newTitle, setNewTitle] = React.useState('模板 ' + (list.length + 1))
  var [newBody, setNewBody] = React.useState('')
  var [flash, setFlash] = React.useState(null) // 'inserted' | 'saved' | 'deleted'

  function commitList(next) { setList(next); saveTemplates(next) }

  function useTemplate(t) {
    if (!inputActions || typeof inputActions.setDraft !== 'function') { setFlash('noactions'); window.setTimeout(function(){setFlash(null)},1400); return }
    inputActions.setDraft(t.body)
    setOpen(false)
    setFlash('inserted')
    window.setTimeout(function(){setFlash(null)},1400)
  }
  function startAdd() {
    setNewTitle('模板 ' + (list.length + 1))
    setNewBody(draft || '')
    setAdding(true)
  }
  function saveNew() {
    var title = newTitle.trim()
    var body = newBody.trim()
    if (!body) return
    commitList(list.concat([{ title: title || '模板', body: body }]))
    setAdding(false)
    setFlash('saved'); window.setTimeout(function(){setFlash(null)},1400)
  }
  function del(i) {
    var next = list.filter(function (_, idx) { return idx !== i })
    commitList(next)
    setFlash('deleted'); window.setTimeout(function(){setFlash(null)},1400)
  }

  var q = query.trim().toLowerCase()
  var shown = q ? list.filter(function (t) { return (t.title || '').toLowerCase().indexOf(q) !== -1 || (t.body || '').toLowerCase().indexOf(q) !== -1 }) : list

  var btn = {
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 28,
    padding: '0 10px', borderRadius: 999, cursor: 'pointer',
    border: '1px solid var(--dsw-alias-border-l1, #2b2f3a)',
    background: 'var(--dsw-alias-bg-primary, #1a1d24)', color: 'var(--dsw-alias-label-primary, #eee)',
    fontSize: 13, fontWeight: 600
  }
  var panelStyle = {
    position: 'fixed', left: '50%', bottom: 'calc(var(--dsh-composer-height, 120px) + 16px)',
    transform: 'translateX(-50%)', zIndex: 9999, width: 480, maxWidth: '92vw',
    background: 'var(--dsw-specific-tip, #17191e)', border: '1px solid var(--dsw-alias-border-l1, #2b2f3a)',
    borderRadius: 14, padding: '12px 14px',
    boxShadow: '0 18px 50px rgba(0,0,0,0.5)', fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    color: 'var(--dsw-alias-label-primary, #eee)', fontSize: 13
  }

  return React.createElement('div', { style: { display: 'inline-flex', position: 'relative' } },
    React.createElement('button', {
      type: 'button', style: btn, title: '常用 Prompt 模板',
      onClick: function (e) { e.preventDefault(); e.stopPropagation(); setOpen(!open) }
    }, '📋 模板' + (list.length ? ' ' + list.length : '')),
    open ? React.createElement('div', { style: panelStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
        React.createElement('span', { style: { fontWeight: 700, fontSize: 13 } }, 'Prompt 模板'),
        React.createElement('button', { style: { background: 'none', border: 'none', color: 'var(--dsw-alias-label-tertiary,#8a90a0)', cursor: 'pointer', fontSize: 13 }, onClick: function(){setOpen(false)} }, '✕')),
      flash ? React.createElement('div', { style: { color: '#3ecf8e', marginBottom: 6, fontSize: 12 } },
        flash === 'noactions' ? '（无法写入输入框：inputActions 不可用）' : flash === 'inserted' ? '已插入输入框 ✓' : flash === 'saved' ? '已保存 ✓' : '已删除') : null,
      React.createElement('input', {
        type: 'text', placeholder: '搜索模板…', value: query,
        onChange: function (e) { setQuery(e.target.value) },
        style: { width: '100%', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-primary,#14161b)', border: '1px solid var(--dsw-alias-border-secondary,#2b2f3a)', color: 'inherit', borderRadius: 8, padding: '6px 10px', fontSize: 13, marginBottom: 8 }
      }),
      adding ? React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 } },
        React.createElement('input', { type:'text', placeholder:'模板名', value:newTitle, onChange:function(e){setNewTitle(e.target.value)}, style: inputInputStyle }),
        React.createElement('textarea', { rows: 3, placeholder:'模板内容', value:newBody, onChange:function(e){setNewBody(e.target.value)}, style: Object.assign({}, inputInputStyle, { resize:'vertical' }) }),
        React.createElement('div', { style: { display:'flex', gap:8, justifyContent:'flex-end' } },
          React.createElement('button', { style: smallBtn(false), onClick:function(){setAdding(false)} }, '取消'),
          React.createElement('button', { style: smallBtn(true), onClick: saveNew }, '保存')))
      : null,
      React.createElement('div', { style: { maxHeight: 300, overflowY: 'auto' } },
        shown.length === 0
          ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary,#6b7280)', padding: '8px 2px' } }, '还没有模板，点下方「+ 新增」创建一个。')
          : shown.map(function (t, i) {
              return React.createElement('div', { key: i }, React.createElement('div', { style: { display:'flex', alignItems:'center', gap:8, padding: '6px 2px', borderBottom: '1px solid var(--dsw-alias-border-l1,#24262e)' } },
                React.createElement('button', { style: { flex:1, textAlign:'left', background:'none', border:'none', color:'inherit', cursor:'pointer', minWidth:0 }, onClick:function(){useTemplate(t)} },
                  React.createElement('div', { style: { fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, t.title ? (t.title + (t.body.length>40 ? '　' : '')) : ('模板 ' + (i+1))),
                  React.createElement('div', { style: { fontSize:12, color:'var(--dsw-alias-label-tertiary,#8a90a0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, t.body)),
                React.createElement('button', { style: { background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:12, padding:'2px 6px' }, title:'删除', onClick:function(){del(i)} }, '🗑')))
            })),
      !adding ? React.createElement('div', { style: { marginTop:8, textAlign:'right' } },
        React.createElement('button', { style: smallBtn(false), onClick: startAdd }, '+ 新增模板')) : null
    ) : null)
}

var inputInputStyle = {
  width:'100%', boxSizing:'border-box', background:'var(--dsw-alias-bg-primary,#14161b)',
  border:'1px solid var(--dsw-alias-border-secondary,#2b2f3a)', color:'inherit',
  borderRadius:8, padding:'6px 10px', fontSize:13, fontFamily:'inherit'
}
function smallBtn(primary) {
  return { cursor:'pointer', border:'none', borderRadius:8, height:26, padding:'0 10px', fontSize:12,
    background: primary ? 'var(--dsw-alias-interactive-bg-primary,#3ecf8e)' : 'var(--dsw-alias-interactive-bg-hover,#24262e)',
    color: primary ? '#10141a' : 'var(--dsw-alias-label-secondary,#c9cede)' }
}


    exports.inject = [];
    exports.apply = function apply(ctx) {

    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('conversation.input.left', function () {
      return slots.register(
        { name: 'conversation.input.left', id: 'prompt-templates', label: 'Prompt Templates', order: 1000 },
        function (props) { return React.createElement(PromptTemplates, props) })
    })
  
    };

    return module.exports;
  }
});
