/* routes/system.mjs — §6.2 A: #1 /health, #2 /api/doctor, #3 /api/workspaces,
   #4 /api/workspace/activate, #5 /bridge.html. /health là endpoint DUY NHẤT được poll. */
import { IMG_HOME_DEFAULT, invalidateDoctorCache } from "../lib/doctor.mjs"
import { PROTOCOL } from "../lib/security.mjs"
import { checkForUpdateSafe, readRuntimeVersion, scheduleUpdate } from "../lib/update.mjs"

export function register(r) {
  r.get("/health", async ctx => {
    const ws = ctx.registry.active
    return {
      status: 200,
      json: {
        ok: true, app: "kitgen-agent", protocol: PROTOCOL,
        version: ctx.version, buildId: ctx.buildId, instanceLabel: ctx.instanceLabel,
        workspaceId: ws.id, workspaceLabel: ws.label, workspaceFingerprint: ws.fingerprint,
        projects: await ws.countProjects(),
        activeRuns: [...ctx.runs.active.values()].filter(h => !h.finished).length,
        uptimeMs: Math.round(process.uptime() * 1000),
        updateCommand: "npm i -g kitgen-agent",
        appBuildHint: ctx.buildId,
      },
    }
  })

  r.get("/api/doctor", async ctx => {
    const refresh = ctx.url.searchParams.get("refresh") === "1"
    if (refresh) invalidateDoctorCache()
    return { status: 200, json: await ctx.doctor(ctx.registry.active, { refresh }) }
  })

  /** Đổi HỒ SƠ CODEX dùng để tạo ảnh và LƯU BỀN vào `<workspace>/.kitgen/config.json`.
   *  Thứ duy nhất được ghi là enum + nhãn `~/…`; agent KHÔNG đọc auth.json/config.toml
   *  của codex, không log gì của hồ sơ đó (arch §4.4-4).
   *  Chọn "default" thì XOÁ HẲN `codexHome` (patchConfig thay nguyên khối `imageGen`),
   *  để không còn đường nào cho gen.sh nhận IMG_HOME cũ. */
  r.patch("/api/image-profile", async ctx => {
    const { mode } = await ctx.json()
    const profile = mode === "separate" || mode === "img-home" ? "img-home"
      : mode === "default" || mode === "default-home" ? "default-home"
        : null
    if (!profile) {
      return { status: 400, json: { error: { code: "BAD_REQUEST", message: "mode must be default or separate" } } }
    }
    const imageGen = profile === "img-home"
      ? { mode: "img-home", codexHome: IMG_HOME_DEFAULT }
      : { mode: "default-home" }
    await ctx.registry.active.patchConfig({ imageGen })
    // Doctor cache 60s giữ kết quả của hồ sơ CŨ ⇒ phải bỏ, nếu không UI vừa đổi xong
    // vẫn đọc trạng thái cũ suốt một phút.
    invalidateDoctorCache()
    return {
      status: 200,
      json: {
        ok: true,
        mode: profile === "img-home" ? "separate" : "default",
        profile,
        codexHomeLabel: profile === "img-home" ? IMG_HOME_DEFAULT : "~/.codex",
      },
    }
  })

  /** Kiểm tra bản mới. Luôn 200: mất mạng là `ok:false` + `reason`, không phải lỗi agent. */
  r.get("/api/update", async () => ({ status: 200, json: await checkForUpdateSafe() }))

  r.post("/api/update", async () => {
    const before = await readRuntimeVersion()
    scheduleUpdate()
    return { status: 202, json: { ok: true, previousVersion: before, restarting: true } }
  })

  r.get("/api/workspaces", async ctx => ({
    status: 200,
    json: { items: await ctx.registry.list(), activeId: ctx.registry.activeId },
  }))

  r.post("/api/workspace/activate", async ctx => {
    const body = await ctx.json()
    const ws = await ctx.registry.activate(body.workspaceId)
    ctx.onWorkspaceChange?.(ws)
    return {
      status: 200,
      json: { ok: true, workspaceId: ws.id, workspaceLabel: ws.label, workspaceFingerprint: ws.fingerprint },
    }
  })

  r.post("/api/workspace/reveal", async ctx => {
    await ctx.reveal(ctx.registry.active.root)
    return { status: 200, json: { ok: true } }
  })

  /** #5 — cầu dò popup: điều hướng TOP-LEVEL nên không bị mixed-content chặn (architecture §5.3).
   *  Chỉ postMessage tới origin nằm trong allowlist; KHÔNG dùng '*'. */
  r.get("/bridge.html", async ctx => {
    const want = String(ctx.url.searchParams.get("o") ?? "").replace(/\/+$/, "")
    const target = ctx.origins.has(want) ? want : null
    const ws = ctx.registry.active
    const payload = {
      ok: true, app: "kitgen-agent", protocol: PROTOCOL, version: ctx.version,
      workspaceLabel: ws.label, workspaceFingerprint: ws.fingerprint, instanceLabel: ctx.instanceLabel,
    }
    const html = `<!doctype html><html lang="vi"><meta charset="utf-8">
<title>kit-gen · cầu dò công cụ local</title>
<style>body{font:14px/1.5 ui-sans-serif,system-ui;background:#0B0E14;color:#E8ECF4;padding:24px}
code{font:13px ui-monospace,Menlo,monospace;color:#5CE0AE}</style>
<h1>Công cụ local đang chạy ✓</h1>
<p>Phiên bản <code>${escapeHtml(ctx.version)}</code> · thư mục làm việc <code>${escapeHtml(ws.label)}</code>.</p>
<p id="s">${target ? "Đang báo về tab kit-gen…" : "Không có trang nào được phép nhận tín hiệu (origin không nằm trong danh sách cho phép)."}</p>
<script>
const PAYLOAD = ${JSON.stringify(payload)};
const TARGET = ${JSON.stringify(target)};
if (TARGET && window.opener) {
  try { window.opener.postMessage(PAYLOAD, TARGET); document.getElementById("s").textContent = "Đã báo về tab kit-gen. Cửa sổ này sẽ tự đóng."; setTimeout(() => window.close(), 1200) }
  catch (e) { document.getElementById("s").textContent = "Không gửi được tín hiệu về tab kit-gen." }
}
</script></html>`
    return { status: 200, html }
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}
