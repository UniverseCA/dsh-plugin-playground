// System Monitor Badge — Host 半边
// 在 DSH 宿主进程内，通过 subprocess + powershell.exe 采集宿主 Windows 机器的
// CPU / 内存 / GPU(型号) / OS / 主机名，经 harness.handle('fetch-sysinfo') 暴露给 Client。
//
// 目标：在 cordis_define 中作为 code.host 传入（body），返回一个 Cordis 插件。
// 稳健性（已在真实 Windows PowerShell 5.1 上验证）：
//   · PowerShell 字符串内部一律用单引号 '...'，避免任一中间层改写/吞掉双引号而损坏
//     PerformanceCounter 路径（例如 \Processor(_Total) 被当成命令名）。
//   · 作为 powershell.exe -Command 的单一 argv 元素传入，不额外包引号、不经 shell。
//   · CPU 两级回退：PerformanceCounter 两次采样差值（~150ms）→ Get-Counter（~1.7s）→ -1。
//   · WMI(Get-CimInstance) 每一项都包 try/catch：若宿主进程 token 受限(拒绝访问)则
//     内存/GPU/OS 安全降级，CPU 仍能算出，绝不让整段命令崩掉。

return {
  apply(ctx) {
    const subprocess = ctx.get('subprocess')
    if (subprocess === undefined) console.log('sysmon: subprocess unavailable')

    // 注意 JS 单引号字符串里：\\ 写成 \\ 得到一个反斜杠；'...' 内的单引号须写作 \'。
    const PS_LINE = [
      'try{$pc=New-Object System.Diagnostics.PerformanceCounter \'\\Processor(_Total)\',\'% Processor Time\',\'_Total\';$null=$pc.NextValue();Start-Sleep -Milliseconds 120;$cpu=[math]::Round($pc.NextValue(),1)}catch{$cpu=$null};',
      'if($null -eq $cpu){$cpu=[math]::Round((Get-Counter \'\\Processor(_Total)\\% Processor Time\' -MaxSamples 1).CounterSamples[0].CookedValue,1)};',
      'if($null -eq $cpu){$cpu=-1};',
      '$mt=0;$mf=0;$osv=\'\';',
      'try{$os=Get-CimInstance Win32_OperatingSystem;$mt=[int64]$os.TotalVisibleMemorySize;$mf=[int64]$os.FreePhysicalMemory;$osv=[string]$os.Caption}catch{};',
      '$mup=if($mt){[math]::Round(($mt-$mf)*100/[double]$mt,1)}else{0};',
      '$gpu=\'none\';try{$g=(Get-CimInstance Win32_VideoController|Select-Object -First 1 -ExpandProperty Name);if($g){$gpu=[string]$g}}catch{};',
      'Write-Output "cpu=$cpu";Write-Output "memTotalMB=$mt";Write-Output "memFreeMB=$mf";Write-Output "memUsedPct=$mup";',
      'Write-Output "gpu=$gpu";Write-Output "hostname=$env:COMPUTERNAME";Write-Output "os=$osv"'
    ].join('')

    function parse(outText) {
      const sys = { cpuPct: null, memTotalMB: 0, memFreeMB: 0, memUsedPct: null, gpu: 'none', gpuPresent: false, hostname: null, os: null }
      const lines = String(outText || '').split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const m = /^([a-zA-Z0-9_]+)=(.*)$/.exec(lines[i].trim())
        if (!m) continue
        const k = m[1], v = m[2]
        if (k === 'cpu' && isFinite(parseFloat(v))) sys.cpuPct = Math.round(parseFloat(v) * 10) / 10
        else if (k === 'memTotalMB' && isFinite(parseFloat(v))) sys.memTotalMB = parseInt(v, 10)
        else if (k === 'memFreeMB' && isFinite(parseFloat(v))) sys.memFreeMB = parseInt(v, 10)
        else if (k === 'memUsedPct' && isFinite(parseFloat(v))) sys.memUsedPct = Math.round(parseFloat(v) * 10) / 10
        else if (k === 'gpu' && v) sys.gpu = v
        else if (k === 'hostname' && v) sys.hostname = v
        else if (k === 'os' && v) sys.os = v
      }
      if (sys.gpu && String(sys.gpu).toUpperCase().indexOf('BASIC DISPLAY') === -1) sys.gpuPresent = true
      // 若整段失败或无任何可用指标，返回 null 由调用方报错
      if (sys.cpuPct === null && sys.memUsedPct === null) return null
      return sys
    }

    async function fetchSysinfo() {
      if (!subprocess) return { ok: false, error: 'subprocess 不可用' }
      let ps = 'powershell.exe'
      try {
        if (typeof subprocess.resolveExecutable === 'function') {
          const p = await subprocess.resolveExecutable('powershell.exe', { SYS: '1' })
          if (p) ps = p
        }
      } catch (e) {}
      const argv = [ps, '-NoProfile', '-NonInteractive', '-Command', PS_LINE]
      const handle = subprocess.spawn({
        argv: argv,
        cwd: 'C:\\',
        stdio: { stdin: 'ignore', stdout: { maxBytes: 8000 }, stderr: { maxBytes: 4000 } },
        graceMs: 8000
      })
      const outcome = await handle.done
      let outText = ''
      try {
        if (handle.collected && handle.collected.stdout) outText = handle.collected.stdout.readFrom(0).text
      } catch (e) {}
      if (outcome.exitCode !== 0) {
        const s = parse(outText)
        if (s) return { ok: true, data: { system: s } }
        return { ok: false, error: 'powershell 退出码 ' + outcome.exitCode, out: String(outText).slice(0, 400) }
      }
      const s = parse(outText)
      if (s) return { ok: true, data: { system: s } }
      return { ok: false, error: '未采集到系统指标', out: String(outText).slice(0, 400) }
    }

    harness.handle('fetch-sysinfo', async function (args) {
      return await fetchSysinfo()
    })
  }
}
