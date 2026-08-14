// OpenCode Go 用量徽标 — Host 半边
// 读取 OPENCODE_GO_API_KEY 凭据，通过 subprocess + curl（走本地代理）
// 调 https://opencode.ai/zen/go/v1/usage，把结果经 harness.handle 暴露给 Client。
//
// 目标：在 cordis_define 中作为 code.host 传入（body），返回一个 Cordis 插件。
// 稳健性：带浏览器 User-Agent 避免 Cloudflare 反爬拦截；对响应做宽松窗口解析。

return {
  apply(ctx) {
    const credentials = ctx.get('credentials')
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) console.log('ocgq: subprocess unavailable')

    async function resolveKey() {
      if (credentials) {
        try {
          const resolved = await credentials.resolve('OPENCODE_GO_API_KEY')
          if (resolved && resolved.value) return resolved.value
        } catch (e) {
          console.log('ocgq: credentials.resolve error ' + ((e && e.message) || e))
        }
      }
      return undefined
    }

    // 从原始窗口对象归一化出稳定的 percent fields。
    // 官方 /v1/usage 常见两种形状：
    //   { status, percent, resetsAt }             （openusage 文档）
    //   { usagePercent, resetInSec, status }       （CodexBar / opencode-quota 解析）
    function normWindow(w) {
      if (!w || typeof w !== 'object') return null
      let percent = null
      if (typeof w.percent === 'number') percent = w.percent
      else if (typeof w.usagePercent === 'number') percent = w.usagePercent
      else if (typeof w.usedPercent === 'number') percent = w.usedPercent
      else if (typeof w.used === 'number' && typeof w.limit === 'number' && w.limit > 0) {
        percent = Math.round((w.used / w.limit) * 100 * 10) / 10
      }
      return {
        percent: percent,
        status: w.status || 'ok',
        resetsAt: w.resetsAt || (typeof w.resetInSec === 'number' ? new Date(Date.now() + w.resetInSec * 1000).toISOString() : null)
      }
    }

    function parseUsage(payload) {
      // 直接容器：{ rolling, weekly, monthly }
      let u = payload && typeof payload === 'object' ? payload : null
      // 可能是 { usage: { rolling, ... } }
      if (u && !u.rolling && !u.weekly && !u.monthly && u.usage && typeof u.usage === 'object') u = u.usage
      // 兼容 rollingUsage / weeklyUsage / monthlyUsage 命名
      const rolling = normWindow(u.rolling || u.rollingUsage)
      const weekly = normWindow(u.weekly || u.weeklyUsage)
      const monthly = normWindow(u.monthly || u.monthlyUsage)
      if (!rolling && !weekly && !monthly) return null
      return { rolling: rolling, weekly: weekly, monthly: monthly }
    }

    async function fetchUsage() {
      const key = await resolveKey()
      if (!key) return { ok: false, error: 'OPENCODE_GO_API_KEY 未配置' }
      if (!subprocess) return { ok: false, error: 'subprocess 不可用' }

      let curlPath = 'curl'
      try {
        if (typeof subprocess.resolveExecutable === 'function') {
          const p = await subprocess.resolveExecutable('curl', { OPENCODE: '1' })
          if (p) curlPath = p
        }
      } catch (e) {}

      const argv = [
        curlPath, '-sS', '--max-time', '25',
        '-x', 'http://127.0.0.1:7897',
        '-H', 'Authorization: Bearer ' + key,
        '-H', 'Accept: application/json',
        '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'https://opencode.ai/zen/go/v1/usage'
      ]
      const handle = subprocess.spawn({
        argv: argv,
        cwd: 'C:\\',
        stdio: { stdin: 'ignore', stdout: { maxBytes: 20000 }, stderr: { maxBytes: 4000 } },
        graceMs: 6000
      })
      const outcome = await handle.done
      let outText = ''
      try {
        if (handle.collected && handle.collected.stdout) outText = handle.collected.stdout.readFrom(0).text
      } catch (e) {}
      if (outcome.exitCode !== 0) {
        return { ok: false, error: 'curl 退出码 ' + outcome.exitCode, out: String(outText).slice(0, 400) }
      }
      try {
        const data = JSON.parse(outText)
        const usage = parseUsage(data)
        if (usage) return { ok: true, data: { usage: usage } }
        return { ok: false, error: '未识别到用量窗口', out: String(outText).slice(0, 400) }
      } catch (e) {
        return { ok: false, error: '响应解析失败', out: String(outText).slice(0, 400) }
      }
    }

    harness.handle('fetch-usage', async function (args) {
      return await fetchUsage()
    })
  }
}
