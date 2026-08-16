/**
 * dsh-plugin-opencode-usage — node (host) half.
 * 通过 webServer 注册 /__dsh_opencode_usage JSON route：
 *   解析 OPENCODE_GO_API_KEY 凭据 → subprocess + curl（走代理）调
 *   https://opencode.ai/zen/go/v1/usage → 宽松解析 rolling/weekly/monthly。
 * client 半边用同源 fetch 调用。
 */
export const inject = ["webServer"];

function normWindow(w) {
  if (!w || typeof w !== "object") return null;
  let percent = null;
  if (typeof w.percent === "number") percent = w.percent;
  else if (typeof w.usagePercent === "number") percent = w.usagePercent;
  else if (typeof w.usedPercent === "number") percent = w.usedPercent;
  else if (typeof w.used === "number" && typeof w.limit === "number" && w.limit > 0) {
    percent = Math.round((w.used / w.limit) * 100 * 10) / 10;
  }
  return {
    percent: percent,
    status: w.status || "ok",
    resetsAt: w.resetsAt || (typeof w.resetInSec === "number" ? new Date(Date.now() + w.resetInSec * 1000).toISOString() : null)
  };
}

function parseUsage(payload) {
  let u = payload && typeof payload === "object" ? payload : null;
  if (u && !u.rolling && !u.weekly && !u.monthly && u.usage && typeof u.usage === "object") u = u.usage;
  const rolling = normWindow(u.rolling || u.rollingUsage);
  const weekly = normWindow(u.weekly || u.weeklyUsage);
  const monthly = normWindow(u.monthly || u.monthlyUsage);
  if (!rolling && !weekly && !monthly) return null;
  return { rolling: rolling, weekly: weekly, monthly: monthly };
}

async function fetchUsage(ctx) {
  const credentials = ctx.get("credentials");
  const subprocess = ctx.get("subprocess");
  if (!subprocess) return { ok: false, error: "subprocess unavailable" };

  let key = null;
  if (credentials) {
    try {
      const resolved = await credentials.resolve("OPENCODE_GO_API_KEY");
      if (resolved && resolved.value) key = resolved.value;
    } catch (e) { /* ignore */ }
  }
  if (!key) return { ok: false, error: "OPENCODE_GO_API_KEY not configured" };

  let curlPath = "curl";
  try {
    if (typeof subprocess.resolveExecutable === "function") {
      const p = await subprocess.resolveExecutable("curl", { OPENCODE: "1" });
      if (p) curlPath = p;
    }
  } catch (e) {}

  const argv = [
    curlPath, "-sS", "--max-time", "25",
    "-x", "http://127.0.0.1:7897",
    "-H", "Authorization: Bearer " + key,
    "-H", "Accept: application/json",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    "https://opencode.ai/zen/go/v1/usage"
  ];
  const handle = subprocess.spawn({
    argv: argv,
    cwd: "C:\\",
    stdio: { stdin: "ignore", stdout: { maxBytes: 20000 }, stderr: { maxBytes: 4000 } },
    graceMs: 6000
  });
  const outcome = await handle.done;
  let outText = "";
  try { if (handle.collected && handle.collected.stdout) outText = handle.collected.stdout.readFrom(0).text; } catch (e) {}
  if (outcome.exitCode !== 0) {
    return { ok: false, error: "curl exit " + outcome.exitCode, out: String(outText).slice(0, 300) };
  }
  try {
    const data = JSON.parse(outText);
    const usage = parseUsage(data);
    if (usage) return { ok: true, data: { usage: usage } };
    return { ok: false, error: "no usage windows", out: String(outText).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: "parse failed", out: String(outText).slice(0, 300) };
  }
}

function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (!webServer) return;
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: "/__dsh_opencode_usage",
    handler: async (req, res) => {
      try {
        if (req.method !== "GET") { res.writeHead(405); res.end("method not allowed"); return; }
        const result = await fetchUsage(ctx);
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
      }
    }
  }), "opencode-usage: route");
}

export { apply };
