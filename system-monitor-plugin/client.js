// System Monitor Badge — Client 半边（完整版）
// 注册到会话标题栏右侧 conversation.session.header.utilities：
// 显示胶囊徽标（CPU % · 内存 %），点击弹出详情卡（CPU/内存/GPU/OS/主机名），
// 每 3s 通过 host.call('fetch-sysinfo') 刷新。
//
// 目标：在 cordis_define 中作为 code.client 传入（body），返回一个 Cordis 插件。
// 说明：动态插件 Client half 只注入到宿主该 Plugin 的 DSH 页面会话（非任意新标签页）。
//
// 数据模型（host 返回）：
//   { ok:true, data:{ system:{ cpuPct, memTotalMB, memFreeMB, memUsedPct, gpu, gpuPresent, hostname, os } } }
//   { ok:false, error:"..." }

function SysBadge(props) {
  const intervalFn = (props && props.interval) || null
  const [state, setState] = React.useState(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(function () {
    let alive = true
    let unsub = null
    function load() {
      host.call('fetch-sysinfo', {}).then(function (res) {
        if (!alive) return
        setState(res || { ok: false, error: '无响应' })
      }).catch(function (e) {
        if (!alive) return
        setState({ ok: false, error: String((e && e.message) || e) })
      })
    }
    load()
    if (typeof intervalFn === 'function') unsub = intervalFn(load, 3000)
    return function () { alive = false; if (unsub) { try { unsub() } catch (e) {} } }
  }, [intervalFn])

  const sys = (state && state.ok && state.data && state.data.system) ? state.data.system : null
  const cpu = sys && typeof sys.cpuPct === 'number' ? sys.cpuPct : null
  const mem = sys && typeof sys.memUsedPct === 'number' ? sys.memUsedPct : null

  function toneXY(v) {
    if (typeof v !== 'number') return '#8a8f98'
    if (v >= 80) return '#e5484d'
    if (v >= 50) return '#f5a524'
    return '#3ecf8e'
  }
  const cpuTone = toneXY(cpu)
  const memTone = toneXY(mem)

  function mb(m) {
    if (typeof m !== 'number' || m <= 0) return null
    // MB -> 可读（GB 优先）
    if (m >= 1024) return (m / 1024).toFixed(1) + ' GB'
    return Math.round(m) + ' MB'
  }

  const Dot = (t) => React.createElement('span', { style: { width: 8, height: 8, borderRadius: 8, background: t || '#333', display: 'inline-block' } })
  const Lbl = (t) => React.createElement('span', { style: { color: '#9aa0aa' } }, t)
  const Val = (v, t) => React.createElement('span', { style: { fontWeight: 700, color: t || '#e8eaf0' } }, v)

  function Row(label, value, tone) {
    return React.createElement('div', { style: { padding: '6px 0', borderBottom: '1px solid #24262e', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      Lbl(label), Val(value, tone))
  }

  // 详情卡：固定定位在徽标下方
  const card = React.createElement('div', { style: {
    position: 'fixed', right: 16, top: 58, zIndex: 9999,
    background: '#17191e', border: '1px solid #2b2f3a', borderRadius: 12,
    padding: '12px 14px', width: 300, boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#e8eaf0', fontSize: 13 } },
    React.createElement('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      React.createElement('span', null, '系统监控'),
      React.createElement('button', { onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(false) }, style: { background: 'none', border: 'none', color: '#8a90a0', cursor: 'pointer', fontSize: 13, padding: 0 } }, '✕')),
    sys ? React.createElement('div', null,
      Row('CPU', typeof cpu === 'number' ? cpu.toFixed(1) + '%' : '—', cpuTone),
      Row('内存', typeof mem === 'number' ? mem.toFixed(1) + '%' : '—', memTone),
      React.createElement('div', { style: { fontSize: 11, color: '#6b7280', marginTop: 1, marginBottom: 4 } },
        (typeof sys.memUsedPct === 'number' ? ((sys.memTotalMB ? '已用 ' + mb(sys.memTotalMB - sys.memFreeMB) + ' / 共 ' + mb(sys.memTotalMB) : '')).trim() : '')),
      // GPU：仅当检测到独显时显示
      sys.gpuPresent && sys.gpu ? Row('GPU', sys.gpu, '#9aa0aa') : null,
      Row('主机', sys.hostname || '—', '#9aa0aa'),
      sys.os ? Row('系统', sys.os, '#9aa0aa') : null)
      : React.createElement('div', { style: { color: '#e5484d', padding: '6px 0' } }, (state && state.error) || '加载失败'))

  const badge = React.createElement('button', {
    onClick: function (ev) { ev.preventDefault(); ev.stopPropagation(); setOpen(!open) },
    title: '系统监控 · 点击开关详情',
    style: { display: 'inline-flex', alignItems: 'center', gap: 7, height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid #333', background: '#1a1d24', color: '#eee', fontSize: 12, fontWeight: 600 }
  },
    Dot(cpuTone),
    React.createElement('span', null, 'CPU ' + (typeof cpu === 'number' ? cpu.toFixed(0) + '%' : '…')),
    React.createElement('span', { style: { color: '#3a3f4a' } }, '·'),
    Dot(memTone),
    React.createElement('span', null, 'MEM ' + (typeof mem === 'number' ? mem.toFixed(0) + '%' : '…')))

  return React.createElement('div', { style: { position: 'relative', display: 'inline-flex' } }, badge, open ? card : null)
}

return {
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    const timerSvc = ctx.get('timer')
    const intervalClosure = function (fn, ms) {
      if (timerSvc && typeof timerSvc.interval === 'function') return timerSvc.interval(fn, ms)
      return null
    }
    slots.inject('conversation.session.header.utilities', function () {
      return slots.register(
        { name: 'conversation.session.header.utilities', id: 'system-monitor', label: 'System Monitor' },
        function () { return React.createElement(SysBadge, { interval: intervalClosure }) })
    })
  }
}
