// Request Latency Chart — Client 半边（纯客户端，无 Host 半边）
// 展示最近若干条 AI 请求的耗时迷你条形图。
//   · 会话头部 utilities 加「⏱️ 耗时」按钮，点开一个面板。
//   · 面板内对会话快照里已完成的 assistant 节点，按 turn 聚合 timing，画最近 N 条
//     请求的耗时柱状图（TTFT 与总耗时），带提示与统计。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 数据来源：useSession(s => s) 的 AssistantMessageNode.timing
//   · timing.stepStartTime      —— 请求开始（可空）
//   · timing.firstTokenTime     —— 首 token 时刻（可空）
//   · timing.completedTime      —— 完成时刻（必有）
//   · TTFT = firstTokenTime - stepStartTime ；总耗时 = completedTime - stepStartTime。
// 说明：
//   · 纯客户端、无需 host/网络/凭据；图表用手写 div/SVG（不依赖额外库）。
//   · conversation.session.header.utilities 目前仅被 log-export 占用，无冲突。

var RECENT = 12 // 显示最近 N 条
var pxPerSecond = 56 // 柱状图每格秒数对应的像素宽度（总耗时用）

function LatencyPanel(props) {
  var useSession = props.useSession
  var snap = useSession(function (s) { return s })
  var [open, setOpen] = React.useState(false)
  var [mode, setMode] = React.useState('total') // 'total' | 'ttft'

  // 收集已完成 assistant 节点的 timing
  var items = []
  if (snap) {
    var nodes = Array.isArray(snap.nodes) ? snap.nodes : null
    if (!nodes && snap.chat && snap.chat.nodes && typeof snap.chat.nodes.values === 'function') {
      try { nodes = snap.chat.nodes.values() } catch (e) {}
    }
    if (Array.isArray(nodes)) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i]
        if (!n || n.kind !== 'assistant' || !n.timing || n.interrupted) continue
        var t = n.timing
        if (typeof t.completedTime !== 'number') continue
        items.push({
          seq: n.seq,
          turn: n.turn,
          step: n.step,
          text: (n.blocks || []).filter(function (b) { return b && b.kind === 'text' && typeof b.text === 'string' }).map(function (b) { return b.text }).join(''),
          totalMs: typeof t.stepStartTime === 'number' && t.completedTime > t.stepStartTime ? (t.completedTime - t.stepStartTime) : null,
          ttftMs: typeof t.stepStartTime === 'number' && typeof t.firstTokenTime === 'number' && t.firstTokenTime >= t.stepStartTime ? (t.firstTokenTime - t.stepStartTime) : null,
          tokens: n.usage && typeof n.usage.outputTokens === 'number' && isFinite(n.usage.outputTokens) && n.usage.outputTokens > 0 ? Math.round(n.usage.outputTokens) : null
        })
      }
    }
    items.reverse() // 新→旧，展示最近在前
  }
  var shown = items.slice(0, RECENT)
  var valueOf = function (it) { return mode === 'total' ? it.totalMs : it.ttftMs }
  var maxMs = 1
  for (var k = 0; k < shown.length; k++) { var v = valueOf(shown[k]); if (typeof v === 'number' && v > maxMs) maxMs = v }
  maxMs = Math.max(maxMs, 1)

  var valid = shown.filter(function (it) { return typeof valueOf(it) === 'number' })
  var avgMs = valid.length ? valid.reduce(function (a, it) { return a + valueOf(it) }, 0) / valid.length : 0

  function fmt(ms) {
    if (typeof ms !== 'number') return '—'
    if (ms < 1000) return Math.round(ms) + 'ms'
    return (ms / 1000).toFixed(1) + 's'
  }
  function preview(it) {
    var s = (it.text || '').replace(/\s+/g, ' ').trim()
    if (s.length > 40) s = s.slice(0, 40) + '…'
    return s
  }

  var btn = {
    display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px',
    borderRadius: 999, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l1,#333)',
    background: 'var(--dsw-alias-bg-primary,#1a1d24)', color: 'var(--dsw-alias-label-primary,#eee)',
    fontSize: 12, fontWeight: 600
  }
  var cardStyle = {
    position: 'fixed', right: 16, top: 58, zIndex: 9999, width: 380, maxWidth: '92vw',
    background: 'var(--dsw-specific-tip,#17191e)', border: '1px solid var(--dsw-alias-border-l1,#2b2f3a)',
    borderRadius: 12, padding: '12px 14px', boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: 'var(--dsw-alias-label-primary,#eee)', fontSize: 13
  }

  return React.createElement('div', { style: { position: 'relative', display: 'inline-flex' } },
    React.createElement('button', { type:'button', style: btn, title: '请求耗时图表', onClick: function(e){ e.preventDefault(); e.stopPropagation(); setOpen(!open) } }, '⏱️ 耗时'),
    open ? React.createElement('div', { style: cardStyle },
      React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 } },
        React.createElement('span', { style:{ fontWeight:700, fontSize:13 } }, '请求耗时'),
        React.createElement('button', { style:{ background:'none', border:'none', color:'var(--dsw-alias-label-tertiary,#8a90a0)', cursor:'pointer', fontSize:13, padding:0 }, onClick:function(){setOpen(false)} }, '✕')),
      React.createElement('div', { style:{ display:'flex', gap:6, marginBottom:10 } },
        React.createElement('button', { style: seg(mode==='total'), onClick:function(){setMode('total')} }, '总耗时'),
        React.createElement('button', { style: seg(mode==='ttft'), onClick:function(){setMode('ttft')} }, 'TTFT 首字')),
      React.createElement('div', { style:{ fontSize:12, color:'var(--dsw-alias-label-tertiary,#8a90a0)', marginBottom:10 } },
        '最近 ' + shown.length + ' 条 · ' + (mode==='total'?'平均 ':'TTFT 均 ') + fmt(avgMs)),
      shown.length === 0
        ? React.createElement('div', { style:{ color:'var(--dsw-alias-label-tertiary,#8a90a0)', padding:'8px 2px' } }, '还没有已完成的请求。')
        : React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:4 } },
            shown.map(function (it, idx) {
              var v = valueOf(it)
              var barW = typeof v === 'number' ? Math.max(2, Math.round(v / maxMs * 100)) : 0
              return React.createElement('div', { key: it.seq, style:{ display:'flex', alignItems:'center', gap:8 } },
                React.createElement('span', { style:{ width:14, flex:'none', textAlign:'right', color:'var(--dsw-alias-label-tertiary,#8a90a0)', fontSize:11, cursor:'default' }, title: preview(it) }, shown.length - idx),
                React.createElement('div', { style:{ flex:1, height:14, background:'var(--dsw-alias-interactive-bg-hover,#24262e)', borderRadius:4, overflow:'hidden', display:'flex' } },
                  React.createElement('div', { title: preview(it), style:{ width: barW + '%', height:'100%', background: barTone(v, maxMs) } })),
                React.createElement('span', { style:{ width:52, flex:'none', textAlign:'right', fontSize:11, color:'var(--dsw-alias-label-tertiary,#8a90a0)' } }, fmt(v)))
            })))
    : null)
}

function seg(active) {
  return { cursor:'pointer', border:'none', borderRadius:8, height:24, padding:'0 10px', fontSize:12,
    background: active ? 'var(--dsw-alias-interactive-bg-primary,#3ecf8e)' : 'var(--dsw-alias-interactive-bg-hover,#24262e)',
    color: active ? '#10141a' : 'var(--dsw-alias-label-secondary,#c9cede)' }
}
function barTone(ms, maxMs) {
  if (typeof ms !== 'number' || maxMs <= 0) return 'var(--dsw-alias-label-tertiary,#8a90a0)'
  var ratio = ms / maxMs
  if (ratio > 0.75) return '#e5484d'
  if (ratio > 0.4) return '#f5a524'
  return '#3ecf8e'
}

return {
  name: 'request-latency-chart',
  inject: ['slots'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'request-latency-chart', label: '请求耗时' },
        function (props) { return React.createElement(LatencyPanel, props) })
    })
  }
}
