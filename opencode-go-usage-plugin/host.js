// OpenCode Go 用量徽标 — Host 半边
// 读取 OPENCODE_GO_API_KEY 凭据，通过 subprocess + curl（走本地代理）
// 调 https://opencode.ai/zen/go/v1/usage，把结果经 harness.handle 暴露给 Client。
//
// 目标：在 cordis_define 中作为 code.host 传入（body），返回一个 Cordis 插件。

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
        return { ok: true, data: data }
      } catch (e) {
        return { ok: false, error: '响应解析失败', out: String(outText).slice(0, 400) }
      }
    }

    harness.handle('fetch-usage', async function (args) {
      return await fetchUsage()
    })
  }
}
