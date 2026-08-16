// ============================================================================
// dsh-plugin-message-favorites — DSH Loader client 插件（持久化自动装载，自动转换生成）
// 依赖：require("react")（DSH Loader 运行时提供）。
// 关键：register 的 render 必须转发 slot props（useSession/useInput/...）。
// ============================================================================

window.__ModuleLoader__.load({
  id: "dsh-plugin-message-favorites",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

// Message Favorites + Search — Client 半边（纯客户端，无 Host 半边）
// 收藏 AI 回复 + 一个可搜索的收藏面板。
//   · 每条已完成的 AI 回复图标行加「⭐/⭐」收藏按钮（conversation.chat.assistant-actions）。
//   · 侧栏底部加「收藏」触发按钮（sidebar.footer.action）打开收藏面板。
//   · 收藏面板浮在整页上方（shell.overlay），列出收藏、支持按标题/正文搜索，并可
//     复制正文。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 说明：
//   · 收藏存 localStorage（key dsh.favorites.v1）：[{id, title, text, ts}]。
//   · 收藏面板在 shell.overlay（root/list，叠层默认 click-through，故面板元素自身
//     需 pointer-events:auto）。触发按钮在 sidebar.footer.action；二者 root 作用域。
//   · 每消息星标在 assistant-actions（session 作用域），经 useSession 按 messageId
//     读 text 块（同 copy-format 插件方案）。

var STORAGE_KEY = 'dsh.favorites.v1'
var MAX_TITLE = 60

// ---- 共享 store：localStorage + 内存 + 订阅 ----
var _favorites = load()
var _listeners = [] // Set 之外用数组以防 Set 未垫片
function load() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    var arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(function (f) { return f && typeof f.text === 'string' }).map(function (f) { return { id: f.id, title: f.title || '', text: f.text, ts: f.ts || 0 } })
  } catch (e) { return [] }
}
function persist() { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_favorites)) } catch (e) {} }
function notify() { for (var i = 0; i < _listeners.length; i++) { try { _listeners[i]() } catch (e) {} } }
function hasFav(id) { return _favorites.some(function (f) { return f.id === id }) }
function addFav(f) { _favorites = [_favorites.filter(function (x) { return x.id !== f.id }), f].reduce(function (a, b) { return a.concat(b) }, []); persist(); notify() }
function removeFav(id) { _favorites = _favorites.filter(function (f) { return f.id !== id }); persist(); notify() }
function subscribe(fn) { _listeners.push(fn); return function () { var i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1) } }

// 面板开合状态（共享 store；trigger 与 panel 都订阅，取代 CustomEvent 协调）
var _open = false
function isOpen() { return _open }
function setOpenPanel(v) { _open = v; notify() }
function togglePanel() { _open = !_open; notify() }

// 从会话快照按 messageId 取文本（assistant 节点的 text 块）
function textForMessage(snap, messageId) {
  if (!snap || !messageId) return ''
  var nodes = Array.isArray(snap.nodes) ? snap.nodes : null
  if (!nodes && snap.chat && snap.chat.nodes && typeof snap.chat.nodes.values === 'function') {
    try { nodes = snap.chat.nodes.values() } catch (e) {}
  }
  if (!Array.isArray(nodes)) return ''
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i]
    if (!n || n.kind !== 'assistant' || n.messageId !== messageId) continue
    var text = ''
    if (n.blocks && Array.isArray(n.blocks)) {
      text = n.blocks.filter(function (b) { return b && b.kind === 'text' && typeof b.text === 'string' }).map(function (b) { return b.text }).join('')
    }
    return text
  }
  return ''
}
function titleFromText(text) {
  var s = text.replace(/\s+/g, ' ').trim()
  if (s.length > MAX_TITLE) s = s.slice(0, MAX_TITLE) + '…'
  return s
}

// ---- 每消息收藏星标（conversation.chat.assistant-actions）----
function FavStar(props) {
  var useSession = props.useSession
  var inputActions = props.inputActions
  var messageId = props.messageId
  var snap = useSession(function (s) { return s })
  var text = textForMessage(snap, messageId)
  var [active, setActive] = React.useState(hasFav(messageId))
  var [flash, setFlash] = React.useState(null)

  React.useEffect(function () {
    var unsub = subscribe(function () { setActive(hasFav(messageId)) })
    return unsub
  }, [messageId])

  function toggle(e) {
    e.preventDefault(); e.stopPropagation()
    if (!messageId || !text) return
    if (hasFav(messageId)) removeFav(messageId)
    else addFav({ id: messageId, title: titleFromText(text), text: text, ts: Date.now() })
  }
  // 把收藏正文插入输入框（assistant-actions 是 session 作用域，inputActions 由标准 kit 提供）
  function insertText(e) {
    e.preventDefault(); e.stopPropagation()
    if (!inputActions || typeof inputActions.setDraft !== 'function' || !text) { setFlash('noinput'); return }
    inputActions.setDraft(text)
    setFlash('inserted')
    window.setTimeout(function () { setFlash(null) }, 1500)
  }

  var starBtn = React.createElement('button', {
    type: 'button', disabled: !messageId || !text,
    title: active ? '取消收藏' : '收藏该回答',
    'aria-label': active ? '取消收藏' : '收藏该回答',
    'aria-pressed': active,
    dataActive: active || undefined,
    onClick: toggle,
    style: {
      width: 28, height: 28, color: 'var(--dsw-alias-label-tertiary,#9aa0aa)',
      cursor: !messageId || !text ? 'default' : 'pointer', background: '0 0', border: 'none',
      borderRadius: 14, justifyContent: 'center', alignItems: 'center', display: 'inline-flex', fontSize: 14,
      opacity: active ? 1 : undefined, padding: 0
    }
  }, active ? '★' : '☆')

  return React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 0 } },
    starBtn,
    active && text ? React.createElement('button', {
      type: 'button', title: '把该回答插入输入框',
      'aria-label': '把该回答插入输入框',
      onClick: insertText,
      style: {
        width: 26, height: 28, background: '0 0',
        border: 'none', borderRadius: 14, justifyContent: 'center', alignItems: 'center', display: 'inline-flex',
        fontSize: 11, cursor: 'pointer', padding: '0 4px',
        color: flash === 'inserted' ? '#3ecf8e' : 'var(--dsw-alias-label-tertiary,#9aa0aa)'
      }
    }, flash === 'inserted' ? '✓' : '⤓') : null,
    flash === 'noinput' ? React.createElement('span', { style: { fontSize: 10, color: '#e5484d', marginLeft: 4 } }, '不可插入') : null)
}

// ---- 收藏面板触发按钮（sidebar.footer.action，root）----
function FavTrigger(props) {
  var [count, setCount] = React.useState(_favorites.length)
  var [open, setOpenLocal] = React.useState(isOpen())
  React.useEffect(function () {
    var unsub = subscribe(function () { setCount(_favorites.length); setOpenLocal(isOpen()) })
    return unsub
  }, [])

  return React.createElement('button', {
    type: 'button', title: open ? '关闭收藏面板' : '打开收藏面板',
    'aria-label': '收藏面板',
    'aria-pressed': open,
    dataActive: open || undefined,
    onClick: function () { togglePanel() },
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px',
      borderRadius: 999, cursor: 'pointer', border: 'none',
      background: 'var(--dsw-alias-interactive-bg-hover,#24262e)',
      color: 'var(--dsw-alias-label-primary,#eee)', fontSize: 12, fontWeight: 600, marginLeft: 6
    }
  }, '⭐' + (count ? ' ' + count : ''))
}

// ---- 收藏面板（shell.overlay，root）----
function FavPanel(props) {
  var [favs, setFavs] = React.useState(_favorites)
  var [open, setOpenLocal] = React.useState(isOpen())
  var [query, setQuery] = React.useState('')
  var [copied, setCopied] = React.useState(null)

  React.useEffect(function () {
    var unsub = subscribe(function () { setFavs(_favorites); setOpenLocal(isOpen()) })
    return unsub
  }, [])

  if (!open) return null

  var q = query.trim().toLowerCase()
  var shown = q ? favs.filter(function (f) { return (f.title || '').toLowerCase().indexOf(q) !== -1 || (f.text || '').toLowerCase().indexOf(q) !== -1 }) : favs

  function doCopy(id) {
    var f = favs.find(function (x) { return x.id === id })
    if (!f) return
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(f.text).then(function () { setCopied(id); window.setTimeout(function(){setCopied(null)}, 1200) }, function () { fallbackCopy(f.text) })
    } else fallbackCopy(f.text)
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); setCopied('ok'); window.setTimeout(function(){setCopied(null)},1200)
    } catch (e) {}
  }

  return React.createElement('div', {
    style: {
      position: 'fixed', right: 16, top: 58, width: 400, maxWidth: '92vw', maxHeight: '70vh',
      overflowY: 'auto', zIndex: 99999, fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      background: 'var(--dsw-specific-tip,#17191e)', color: 'var(--dsw-alias-label-primary,#eee)',
      border: '1px solid var(--dsw-alias-border-l1,#2b2f3a)', borderRadius: 14, padding: '12px 14px',
      boxShadow: '0 18px 50px rgba(0,0,0,0.5)', fontSize: 13, pointerEvents: 'auto'
    }
  },
    React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 } },
      React.createElement('span', { style:{ fontWeight:700, fontSize:13 } }, '⭐ 收藏 ' + favs.length),
      React.createElement('button', { style:{ background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:13 }, onClick:function(){ setOpenPanel(false) } }, '✕')),
    React.createElement('input', { type:'text', placeholder:'搜索收藏…', value: query, autoFocus:true, onChange:function(e){ setQuery(e.target.value) }, style:{ width:'100%', boxSizing:'border-box', background:'var(--dsw-alias-bg-primary,#14161b)', border:'1px solid var(--dsw-alias-border-secondary,#2b2f3a)', color:'inherit', borderRadius:8, padding:'6px 10px', fontSize:13, marginBottom:8 } }),
    shown.length === 0
      ? React.createElement('div', { style:{ color:'var(--dsw-alias-label-tertiary,#8a90a0)', padding:'8px 2px' } }, q ? '无匹配收藏' : '还没有收藏 —— 在任意 AI 回复旁点 ⭐ 收藏。')
      : shown.map(function (f) {
          return React.createElement('div', { key: f.id, style:{ display:'flex', alignItems:'flex-start', gap:8, padding:'7px 2px', borderBottom:'1px solid var(--dsw-alias-border-l1,#24262e)' } },
            React.createElement('div', { style:{ flex:1, minWidth:0 } },
              React.createElement('div', { style:{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, f.title || '片段'),
              React.createElement('div', { style:{ fontSize:12, color:'var(--dsw-alias-label-tertiary,#8a90a0)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, f.text)),
            React.createElement('div', { style:{ display:'inline-flex', gap:6 } },
              React.createElement('button', { type:'button', style:{ background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:12 }, title:'复制', onClick:function(){ doCopy(f.id) } }, copied === f.id ? '✓' : '复制'),
              React.createElement('button', { type:'button', style:{ background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:12 }, title:'取消收藏', onClick:function(){ removeFav(f.id) } }, '🗑')))
        }))
}


    exports.inject = ["slots"];
    exports.apply = function apply(ctx) {

    const slots = ctx.get('slots')
    if (slots === undefined) return

    // 1) 每消息星标
    slots.inject('conversation.chat.assistant-actions', function () {
      return slots.register(
        { name: 'conversation.chat.assistant-actions', id: 'message-favorites-star', order: 3, label: '收藏' },
        function (props) { return React.createElement(FavStar, props) })
    })

    // 2) 侧栏触发按钮（root）—— togglePanel 经共享 store 通知面板
    slots.inject('sidebar.footer.action', function () {
      return slots.register(
        { name: 'sidebar.footer.action', id: 'message-favorites-trigger', order: 50, label: '收藏' },
        function (props) { return React.createElement(FavTrigger, props) })
    })

    // 3) 收藏面板（root 叠层）
    slots.inject('shell.overlay', function () {
      return slots.register(
        { name: 'shell.overlay', id: 'message-favorites-panel', order: 100 },
        function (props) { return React.createElement(FavPanel, props) })
    })
  
    };

    return module.exports;
  }
});
