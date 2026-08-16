/**
 * dsh-plugin-system-monitor — node (host) half.
 * 通过 webServer 注册 /__dsh_sysmon 前缀 JSON route，采集宿主机 CPU/内存/GPU/OS。
 * client 半边用同源 fetch 调用该 route。
 */
export const inject = ["webServer"];

const PS_LINE = [
  "try{$pc=New-Object System.Diagnostics.PerformanceCounter '\\Processor(_Total)','% Processor Time','_Total';$null=$pc.NextValue();Start-Sleep -Milliseconds 120;$cpu=[math]::Round($pc.NextValue(),1)}catch{$cpu=$null};",
  "if($null -eq $cpu){$cpu=[math]::Round((Get-Counter '\\Processor(_Total)\\% Processor Time' -MaxSamples 1).CounterSamples[0].CookedValue,1)};",
  "if($null -eq $cpu){$cpu=-1};",
  "$mt=0;$mf=0;$osv='';",
  "try{$os=Get-CimInstance Win32_OperatingSystem;$mt=[int64]$os.TotalVisibleMemorySize;$mf=[int64]$os.FreePhysicalMemory;$osv=[string]$os.Caption}catch{};",
  "$mup=if($mt){[math]::Round(($mt-$mf)*100/[double]$mt,1)}else{0};",
  "$gpu='none';try{$g=(Get-CimInstance Win32_VideoController|Select-Object -First 1 -ExpandProperty Name);if($g){$gpu=[string]$g}}catch{};",
  'Write-Output "cpu=$cpu";Write-Output "memTotalMB=$mt";Write-Output "memFreeMB=$mf";Write-Output "memUsedPct=$mup";',
  'Write-Output "gpu=$gpu";Write-Output "hostname=$env:COMPUTERNAME";Write-Output "os=$osv"'
].join("");

function parse(outText) {
  const sys = { cpuPct: null, memTotalMB: 0, memFreeMB: 0, memUsedPct: null, gpu: "none", gpuPresent: false, hostname: null, os: null };
  const lines = String(outText || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([a-zA-Z0-9_]+)=(.*)$/.exec(lines[i].trim());
    if (!m) continue;
    const k = m[1], v = m[2];
    if (k === "cpu" && isFinite(parseFloat(v))) sys.cpuPct = Math.round(parseFloat(v) * 10) / 10;
    else if (k === "memTotalMB" && isFinite(parseFloat(v))) sys.memTotalMB = parseInt(v, 10);
    else if (k === "memFreeMB" && isFinite(parseFloat(v))) sys.memFreeMB = parseInt(v, 10);
    else if (k === "memUsedPct" && isFinite(parseFloat(v))) sys.memUsedPct = Math.round(parseFloat(v) * 10) / 10;
    else if (k === "gpu" && v) sys.gpu = v;
    else if (k === "hostname" && v) sys.hostname = v;
    else if (k === "os" && v) sys.os = v;
  }
  if (sys.gpu && String(sys.gpu).toUpperCase().indexOf("BASIC DISPLAY") === -1) sys.gpuPresent = true;
  if (sys.cpuPct === null && sys.memUsedPct === null) return null;
  return sys;
}

async function collectSysinfo(ctx) {
  const subprocess = ctx.get("subprocess");
  if (!subprocess) return { ok: false, error: "subprocess unavailable" };
  let ps = "powershell.exe";
  try {
    if (typeof subprocess.resolveExecutable === "function") {
      const p = await subprocess.resolveExecutable("powershell.exe", { SYS: "1" });
      if (p) ps = p;
    }
  } catch (e) {}
  const argv = [ps, "-NoProfile", "-NonInteractive", "-Command", PS_LINE];
  const handle = subprocess.spawn({
    argv,
    cwd: "C:\\",
    stdio: { stdin: "ignore", stdout: { maxBytes: 8000 }, stderr: { maxBytes: 4000 } },
    graceMs: 8000
  });
  const outcome = await handle.done;
  let outText = "";
  try { if (handle.collected && handle.collected.stdout) outText = handle.collected.stdout.readFrom(0).text; } catch (e) {}
  const s = parse(outText);
  if (s) return { ok: true, data: { system: s } };
  return { ok: false, error: "collect failed exit=" + outcome.exitCode, out: String(outText).slice(0, 300) };
}

function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (!webServer) return;
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: "/__dsh_sysmon",
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") { res.writeHead(405); res.end("method not allowed"); return; }
        const result = await collectSysinfo(ctx);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      }
    }
  }), "system-monitor: route");
}

export { apply };
