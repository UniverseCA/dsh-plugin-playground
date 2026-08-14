// OpenCode Go 用量徽标 — Client 半边（完整版）
// 注册到会话标题栏右侧 conversation.session.header.utilities：
// 显示彩色用量徽标（rolling 5h 百分比），点击弹出详情卡（Rolling/Weekly/Monthly 用量百分比 + 各自的重置时间），
// 每 60s 通过 host.call('fetch-usage') 刷新。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 说明：动态插件 Client half 只注入到宿主该 Plugin 的 DSH 页面会话（非任意新标签页）。

function UsageBadge(props) {
  const intervalFn = (props && props.interval) || null
  const [state, setState] = React.useState(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(function () {
    let alive = true
    let unsub = null
    function load() {
      host.call('fetch-usage', {}).then(function (res) {
        if (!alive) return
        setState(res || { ok: false, error: '无响应' })
      }).catch(function (e) {
        if (!alive) return
        setState({ ok: false, error: String((e && e.message) || e) })
      })
    }
    load()
    if (typeof intervalFn === 'function') unsub = intervalFn(load, 60000)
    return function () { alive = false; if (unsub) { try { unsub() } catch (e) {} } }
  }, [intervalFn])

  const meta = state && state.ok && state.data && state.data.usage ? state.data.usage : null
  const rolling = meta ? meta.rolling : null
  const weekly = meta ? meta.weekly : null
  const monthly = meta ? meta.monthly : null
  const pct = rolling && typeof rolling.percent === 'number' ? rolling.percent : null
  const tone = pct === null ? '#8a8f98' : (pct >= 80 ? '#e5484d' : (pct >= 50 ? '#f5a524' : '#3ecf8e'))

  function labelColor(v) {
    if (typeof v !== 'number') return '#9aa0aa'
    if (v >= 80) return '#e5484d'
    if (v >= 50) return '#f5a524'
    return '#3ecf8e'
  }

  // 把 resetsAt（ISO 时间戳或空）格式化成用户可读的“重置于 …”。
  function formatReset(resetsAt) {
    if (!resetsAt) return null
    var d = new Date(resetsAt)
    if (isNaN(d.getTime())) return null
    var now = Date.now()
    var diffMs = d.getTime() - now
    var diffMin = Math.round(diffMs / 60000)
    var hh = String(d.getHours()).padStart(2, '0')
    var mm = String(d.getMinutes()).padStart(2, '0')
    var dayLbl = ''
    if (d.toDateString() !== new Date(now).toDateString()) {
      dayLbl = '明天 ' // 跨天简化标注
    }
    if (diffMin >= 0 && diffMin < 60) {
      return '重置于 ' + hh + ':' + mm + '（' + (diffMin <= 0 ? 0 : diffMin) + ' 分钟后）'
    }
    var dh = Math.floor(diffMs / 3600000)
    if (dh >= 24) {
      return dayLbl + hh + ':' + mm + ' 重置'
    }
    return '重置于 ' + hh + ':' + mm + '（' + dh + ' 小时后）'
  }

  function Row(rowProps) {
    const ru = rowProps.ru
    const reset = ru ? formatReset(ru.resetsAt) : null
    return React.createElement('div', { style: { padding: '6px 0', borderBottom: '1px solid #24262e' } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        React.createElement('span', { style: { color: '#9aa0aa' } }, rowProps.label),
        React.createElement('span', { style: { fontWeight: 700, color: labelColor(ru.percent) } },
          typeof ru.percent === 'number' ? (ru.percent + '%') : '—')),
      reset
        ? React.createElement('div', { style: { fontSize: 11, color: '#6b7280', marginTop: 2 } }, reset)
        : null)
  }

  const card = React.createElement('div', { style: {
    position: 'fixed', right: 16, top: 58, zIndex: 9999,
    background: '#17191e', border: '1px solid #2b2f3a', borderRadius: 12,
    padding: '12px 14px', width: 280, boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#e8eaf0', fontSize: 13 } },
    React.createElement('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('span', null, 'OpenCode Go 用量'),
      React.createElement('button', { onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(false) }, style: { background: 'none', border: 'none', color: '#8a90a0', cursor: 'pointer', fontSize: 13, padding: 0 } }, '✕')),
    meta
      ? React.createElement(React.Fragment, null,
          React.createElement(Row, { label: 'Rolling (5h)', ru: rolling }),
          React.createElement(Row, { label: 'Weekly', ru: weekly }),
          React.createElement(Row, { label: 'Monthly', ru: monthly }))
      : React.createElement('div', { style: { color: '#e5484d', padding: '6px 0' } }, (state && state.error) || '加载失败'))

  const badge = React.createElement('button', {
    onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(!open) },
    title: 'OpenCode Go 用量 · 点击开关详情',
    style: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid #333', background: '#1a1d24', color: '#eee', fontSize: 12, fontWeight: 600 }
  },
    React.createElement('span', { style: { width: 8, height: 8, borderRadius: 8, background: tone, display: 'inline-block' } }),
    React.createElement('span', null, 'Go ' + (pct === null ? '…' : pct + '%')))

  return React.createElement('div', { style: { position: 'relative', display: 'inline-flex' } }, badge, open ? card : null)
}

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    // timer 是可选服务，用 ctx.get('timer') 读取；不存在时优雅回退为仅首次拉取。
    const timerSvc = ctx.get('timer')
    const intervalClosure = function (fn, ms) {
      if (timerSvc && typeof timerSvc.interval === 'function') return timerSvc.interval(fn, ms)
      return null
    }
    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'opencode-go-usage', label: 'OpenCode Go' },
        function () { return React.createElement(UsageBadge, { interval: intervalClosure }) })
    })
  }
}
