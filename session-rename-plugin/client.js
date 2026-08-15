// Session Rename — Client 半边（纯客户端，无 Host 半边）
// 在会话头部标题簇右侧的 actions 区注入「✏️ 重命名」按钮：
//   点开一个内联输入框，可给当前会话设置自定义标题（调用 ISession.rename）。
//   · 显式标题会“钉住( pin )”会话 —— DSH 的自动标题( SessionTitleService )之后不会覆盖它。
//   · 附带「用首条消息命名」快捷按钮：客户端取首条用户消息文本(压行/截断)设为标题，
//     无需 LLM、即时生效。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 说明：
//   · 组件收到会话标准 kit 的 { useSession, sessionId, t, ... }。
//   · apply(ctx) 用 ctx.sessions.binding(sessionId)?.session.rename(title) 执行重命名
//     （binding.session 即 SessionFace，含 rename）。组件不直接持 ctx，因此 apply
//     把 rename 回调经闭包传入组件 —— 稳定做法。
//   · 需要 inject: ['sessions']，因为 Client runner guard 会以 fiber 的 inject 声明
//     门控 ctx.sessions 直访问。

var MAX_TITLE_CHARS = 80

// 从会话快照推首条用户消息标题：取 text 块拼接、压成一行、截断。
function firstTitleFromSnapshot(snap) {
  if (!snap) return ''
  var nodes = Array.isArray(snap.nodes) ? snap.nodes : null
  if (!nodes) {
    // 优先 Chat 端 nodes store（values() 数组）
    if (snap.chat && snap.chat.nodes && typeof snap.chat.nodes.values === 'function') {
      try { nodes = snap.chat.nodes.values() } catch (e) { nodes = null }
    }
  }
  if (!Array.isArray(nodes)) return ''
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i]
    if (!n || n.kind !== 'user') continue
    var text = ''
    if (n.content && Array.isArray(n.content)) {
      text = n.content
        .filter(function (b) { return b && (b.type === 'text' || b.kind === 'text') && typeof b.text === 'string' })
        .map(function (b) { return b.text }).join('')
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue
    if (text.length > MAX_TITLE_CHARS) text = text.slice(0, MAX_TITLE_CHARS) + '…'
    return text
  }
  return ''
}

function RenameBadge(props) {
  var sessionId = props.sessionId
  var useSession = props.useSession
  var doRename = props.doRename

  // 会话快照：当前标题（title 投影，若有）与首条用户消息文本
  var snap = useSession(function (s) { return s })
  var currentTitle = ''
  if (snap && snap.projections && typeof snap.projections.faceOf === 'function') {
    try { var tv = snap.projections.faceOf('title').get(); if (typeof tv === 'string') currentTitle = tv } catch (e) {}
  }
  var firstTitle = firstTitleFromSnapshot(snap)

  var [open, setOpen] = React.useState(false)
  var [value, setValue] = React.useState('')
  var [busy, setBusy] = React.useState(false)
  var [msg, setMsg] = React.useState(null) // {kind:'ok'|'err', text}

  function openEditor() {
    setValue(currentTitle || '')
    setMsg(null)
    setOpen(true)
  }
  function doSave(title) {
    var next = (title || value).trim()
    if (!next || !sessionId || !doRename) { if (!doRename) setMsg({ kind:'err', text:'此环境无法重命名（sessions 不可用）' }); return }
    setBusy(true); setMsg(null)
    doRename(sessionId, next).then(function (res) {
      setBusy(false)
      if (res && res.ok) { setMsg({ kind:'ok', text:'已设置标题 ✓' }); window.setTimeout(function(){ setOpen(false) }, 600) }
      else { setMsg({ kind:'err', text: (res && res.error) || '重命名失败' }) }
    })
  }

  var btn = {
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px',
    borderRadius: 999, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1,#333)',
    background: 'var(--dsw-alias-bg-primary,#1a1d24)', color: 'var(--dsw-alias-label-primary,#eee)',
    fontSize: 12, fontWeight: 600
  }
  var cardStyle = {
    position: 'fixed', right: 16, top: 58, zIndex: 9999, width: 320,
    background: 'var(--dsw-specific-tip,#17191e)', border: '1px solid var(--dsw-alias-border-l1,#2b2f3a)',
    borderRadius: 12, padding: '12px 14px',
    boxShadow: '0 14px 40px rgba(0,0,0,0.5)', fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    color: 'var(--dsw-alias-label-primary,#eee)', fontSize: 13
  }
  var inputStyle = {
    width: '100%', boxSizing: 'border-box', background: 'var(--dsw-alias-bg-primary,#14161b)',
    border: '1px solid var(--dsw-alias-border-secondary,#2b2f3a)', color: 'inherit',
    borderRadius: 8, padding: '6px 10px', fontSize: 13, marginBottom: 8
  }
  function caption(text) {
    return React.createElement('div', { style:{ fontSize:11, color:'var(--dsw-alias-label-tertiary,#8a90a0)', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, text)
  }

  return React.createElement('div', { style: { position: 'relative', display: 'inline-flex' } },
    React.createElement('button', { type:'button', style: btn, title: '重命名会话', onClick: function(e){ e.preventDefault(); e.stopPropagation(); openEditor() } }, '✏️ 重命名'),
    open ? React.createElement('div', { style: cardStyle },
      React.createElement('div', { style: { fontWeight:700, fontSize:13, marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' } },
        React.createElement('span', null, '重命名会话'),
        React.createElement('button', { style:{ background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:13, padding:0 }, onClick:function(){setOpen(false)} }, '✕')),
      React.createElement('input', { type:'text', value: value, placeholder:'输入新标题…', autoFocus:true, onChange:function(e){ setValue(e.target.value); setMsg(null) }, onKeyDown:function(e){ if(e.key==='Enter') doSave(); if(e.key==='Escape') setOpen(false) }, style: inputStyle }),
      firstTitle ? caption('首条消息：' + firstTitle) : null,
      msg ? React.createElement('div', { style:{ fontSize:12, marginBottom:6, color: msg.kind==='ok' ? '#3ecf8e' : '#e5484d' } }, msg.text) : null,
      React.createElement('div', { style:{ display:'flex', gap:8, justifyContent:'flex-end' } },
        React.createElement('button', { type:'button', style: small(false), onClick:function(){ firstTitle ? doSave(firstTitle) : setMsg({kind:'err',text:'没有可用的首条消息'}) }, disabled: busy }, '用首条消息命名'),
        React.createElement('button', { type:'button', style: small(true), onClick:function(){ doSave() }, disabled: busy }, busy ? '保存中…' : '保存')))
    : null)
}

function small(primary) {
  return { cursor:'pointer', border:'none', borderRadius:8, height:26, padding:'0 10px', fontSize:12,
    background: primary ? 'var(--dsw-alias-interactive-bg-primary,#3ecf8e)' : 'var(--dsw-alias-interactive-bg-hover,#24262e)',
    color: primary ? '#10141a' : 'var(--dsw-alias-label-secondary,#c9cede)' }
}

return {
  name: 'session-rename',
  inject: ['slots', 'sessions'],
  apply(ctx) {
    const slots = ctx.get('slots')
    const sessions = ctx.get('sessions')
    if (slots === undefined) return
    const canRename = sessions !== undefined && typeof sessions.binding === 'function'

    async function renameSession(sessionId, title) {
      try {
        const binding = sessions.binding(sessionId)
        const face = binding && binding.session
        if (!face || typeof face.rename !== 'function') return { ok: false, error: '会话对象不可用' }
        const res = await face.rename(title)
        return res && typeof res.title === 'string'
          ? { ok: true, title: res.title }
          : { ok: false, error: '未返回标题' }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    }

    slots.inject('conversation.session.header.actions', function () {
      return slots.register(
        { name: 'conversation.session.header.actions', id: 'session-rename', label: 'Rename Session', order: 100 },
        function (props) {
          return React.createElement(RenameBadge, Object.assign({}, props, { doRename: canRename ? renameSession : null, sessionId: props.sessionId }))
        })
    })
  }
}
