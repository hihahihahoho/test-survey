/* routes/system.mjs — §6.2 A: #1 /health, #2 /api/doctor, #3 /api/workspaces,
   #4 /api/workspace/activate, #5 /bridge.html. /health là endpoint DUY NHẤT được poll. */
import { IMG_HOME_DEFAULT, invalidateDoctorCache } from "../lib/doctor.mjs"
import { invalidateUsageCache, usage } from "../lib/usage.mjs"
import { PROTOCOL } from "../lib/security.mjs"
import { checkForUpdateSafe, readRuntimeVersion, scheduleUpdate } from "../lib/update.mjs"
import { cancelLogin, loginStatus, startLogin } from "../lib/codex-login.mjs"
import { codexAccount, codexLogout } from "../lib/codex-account.mjs"

export function register(r) {
  r.get("/health", async ctx => {
    const ws = ctx.registry.active
    return {
      status: 200,
      json: {
        ok: true, app: "kitgen-agent", protocol: PROTOCOL,
        /* HAI SỐ KHÁC NHAU, CỐ Ý KHÔNG GỘP:
           · `version` — đời của bộ khung agent (PROTOCOL_VERSION, "1.2.0"), giữ nguyên
             tên field vì bundle web CŨ đang đọc nó và bundle cũ chính là bên đứng chờ
             trong lượt update kế tiếp;
           · `runtimeVersion` — version BẢN PHÁT HÀNH đang chạy (2.1.x), thứ duy nhất
             đối chiếu được với `latestVersion` của /api/update. `null` = chạy từ source. */
        version: ctx.version, runtimeVersion: ctx.runtimeVersion ?? null,
        buildId: ctx.buildId, instanceLabel: ctx.instanceLabel,
        workspaceId: ws.id, workspaceLabel: ws.label, workspaceFingerprint: ws.fingerprint,
        /* Snapshot, KHÔNG await quét đĩa trong endpoint duy nhất được poll. */
        projects: ctx.healthProjectCount ? ctx.healthProjectCount(ws) : await ws.countProjects(),
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

  /* ── ĐĂNG NHẬP CODEX BẰNG MÃ THIẾT BỊ ──────────────────────────────────────
     Ba endpoint dưới đây KHÔNG nới hợp đồng bảo mật, lý do đầy đủ ở đầu
     `lib/codex-login.mjs`. Tóm tắt phần liên quan tới tầng HTTP:
       · thứ duy nhất trả ra là link công khai của OpenAI + mã 8 ký tự sống 15 phút
         + nhãn `~/…` + enum trạng thái. Không token, không path tuyệt đối;
       · stdout/stderr của `codex login` KHÔNG được giữ ở bất kỳ đâu, nên cũng
         không có `errorTail` để lọt ra ngoài;
       · `userCode` chỉ đi kèm khi trạng thái là `waiting` và biến mất ngay sau đó
         — nó không nằm trong agent.log, không nằm trong chẩn đoán. */
  r.post("/api/codex/login", async ctx => {
    const cfg = await ctx.registry.active.config()
    return { status: 202, json: startLogin(cfg) }
  })

  r.get("/api/codex/login", async () => {
    const s = loginStatus()
    /* Vừa đăng nhập xong mà doctor còn giữ kết quả cũ 60s thì UI hiện "chưa đăng
       nhập" thêm một phút nữa — đúng thứ khiến người dùng bấm nút lần hai. */
    if (s.status === "done") { invalidateDoctorCache(); invalidateUsageCache() }
    return { status: 200, json: s }
  })

  r.delete("/api/codex/login", async () => ({ status: 200, json: cancelLogin() }))

  /* ── TÀI KHOẢN & ĐĂNG XUẤT ─────────────────────────────────────────────────
     Hợp đồng hiển thị của `lib/codex-account.mjs`: chỉ email · tên · enum gói
     cước · enum auth_mode · nhãn `~/…` · boolean. Token không có đường ra. */
  r.get("/api/codex/account", async ctx => {
    const cfg = await ctx.registry.active.config()
    return { status: 200, json: await codexAccount(cfg) }
  })

  r.post("/api/codex/logout", async ctx => {
    const cfg = await ctx.registry.active.config()
    const result = await codexLogout(cfg)
    invalidateDoctorCache()
    invalidateUsageCache()
    /* Câu trả lời cuối cùng là trạng thái THẬT sau khi codex làm xong việc của nó
       — không phải mã thoát: `codex logout` lúc vốn chưa đăng nhập thoát khác 0
       mà kết cục thì vẫn là "đã đăng xuất". */
    const account = await codexAccount(cfg)
    return { status: 200, json: { ok: !account.loggedIn, ran: result.ran !== false, account } }
  })

  /** Quota còn lại của tài khoản Codex — đọc lại con số mà lượt chạy gần nhất đã nhận
   *  (chi tiết nguồn + hợp đồng bảo mật ở đầu `lib/usage.mjs`). Rẻ: không spawn codex,
   *  không gọi mạng, không tốn quota; cache 5 phút, `?refresh=1` để ép đọc lại.
   *  LUÔN 200 — không có số thì `ok:false` + `reason` enum, UI tự ẩn thanh. */
  r.get("/api/usage", async ctx => {
    const refresh = ctx.url.searchParams.get("refresh") === "1"
    if (refresh) invalidateUsageCache()
    return { status: 200, json: await usage(ctx.registry.active, { refresh }) }
  })

  /** Kiểm tra bản mới. Luôn 200: mất mạng là `ok:false` + `reason`, không phải lỗi agent.
   *  Kèm `installedVersion`/`restartRequired`: bản nằm trên đĩa có thể MỚI HƠN tiến trình
   *  đang trả lời request này (cài xong mà bước khởi động lại không xảy ra — BACKLOG #20).
   *  Không có cặp field đó thì UI chỉ thấy "vẫn có bản mới" và đoán bừa là cài hỏng.
   *  `available:true` còn có nghĩa "tarball ĐÃ tải về được": manifest khai bản mới mà CI
   *  chưa upload xong ⇒ `available:false` + `reason:"ARCHIVE_PENDING"` (BACKLOG #23). */
  r.get("/api/update", async ctx => ({
    status: 200,
    json: await checkForUpdateSafe({ currentVersion: ctx.runtimeVersion ?? undefined, kitgenHome: ctx.kitgenHome }),
  }))

  const installUpdate = async ctx => {
    const before = ctx.runtimeVersion ?? await readRuntimeVersion()
    const result = scheduleUpdate({ kitgenHome: ctx.kitgenHome })
    const started = result.status === "started"
    const accepted = started || result.status === "running"
    return {
      status: 202,
      json: {
        ok: result.status !== "failed",
        status: result.status,
        accepted,
        previousVersion: before,
        restarting: accepted,
        logLabel: result.logLabel,
      },
    }
  }
  /* `/api/update` giữ tương thích với webapp cũ; tên đầy đủ giúp bundle mới phân biệt
     rõ đây là lệnh cài, đồng thời cả hai đi chung khóa idempotent. */
  r.post("/api/update", installUpdate)
  r.post("/api/update/install", installUpdate)

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
