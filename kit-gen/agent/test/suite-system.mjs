/* suite-system.mjs — §6.2 A (#1 /health, #2 /api/doctor, #3 /api/workspaces)
   + 9 lớp phòng thủ vận chuyển của architecture §3.4 (Host 421, Origin 403, ép preflight,
   không wildcard CORS, chỉ bind loopback). */
import { fstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, eq, ok, includes, stripComments, PAGES, CLIENT } from "./harness.mjs"
import { PROTOCOL_VERSION } from "../server.mjs"
import { readRuntimeVersion } from "../lib/update.mjs"

/* Nhãn lệnh trả ra API ĐỔI THEO HỆ ĐIỀU HÀNH (lib/update.mjs: UPDATE_COMMAND /
   RESTART_COMMAND / UPDATE_LOG_LABEL) — trên Windows không có `~/.kitgen`.
   Ba hằng dưới đây ghim ĐÚNG CHỮ cho từng nền, KHÔNG import hằng của mã sản xuất
   (import vào thì ca kiểm chỉ còn tự nói với chính nó). Nhánh non-win giữ nguyên
   từng ký tự như trước. */
const WIN = process.platform === "win32"
const CMD_UPDATE  = WIN ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd update"  : "~/.kitgen/bin/kitgen update"
const CMD_RESTART = WIN ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd restart" : "~/.kitgen/bin/kitgen restart"
const LOG_UPDATE  = WIN ? "%LOCALAPPDATA%\\KitGen\\update.log"              : "~/.kitgen/update.log"
/* Nhãn home mặc định của Codex. Trên Windows `shortenPath` rút `C:\Users\<ai đó>\.codex`
   thành `~\.codex` — dấu \ là ĐÚNG cho người dùng Windows, nên chỗ sai là ca kiểm ghim
   cứng dấu /. (`~/.codex-img` ở ca trên KHÔNG đổi: nó là chuỗi người dùng tự nhập và
   được lưu nguyên văn trong config, không đi qua phép rút gọn đường dẫn nào.) */
const CODEX_HOME_DEFAULT = WIN ? "~\\.codex" : "~/.codex"

export async function run({ api, call, agent, agentDir, tmp }) {
  // ─────────────────────────────────────────── 1. HEALTH
  describe("health")
  await it("GET /health trả 200, protocol=1, không lộ đường dẫn tuyệt đối", async () => {
    const r = await api("GET", "/health")
    eq(r.status, 200, "status")
    eq(r.json.app, "kitgen-agent", "app")
    eq(r.json.protocol, 1, "protocol")
    eq(r.headers["x-kitgen-protocol"], "1", "X-KitGen-Protocol header")
    eq(r.json.version, PROTOCOL_VERSION, "version")
    ok(r.json.workspaceId.startsWith("ws_"), "workspaceId opaque")
    ok(!r.text.includes(tmp), `KHÔNG được chứa đường dẫn tuyệt đối: ${r.json.workspaceLabel}`)
    ok(!/\/Users\//.test(r.text), "không chứa /Users/")
  })

  /* P2-12: field `version` là đời KHUNG agent, KHÔNG BAO GIỜ là version bản phát hành.
     Luồng chờ sau update so version release ⇒ phải có field riêng nói đúng số đó,
     nếu không "cập nhật thành công" mãi mãi bị đọc thành "vẫn đang chạy bản 1.2.0". */
  await it("GET /health trả runtimeVersion = version BẢN PHÁT HÀNH, tách khỏi version khung", async () => {
    const r = await api("GET", "/health")
    const real = await readRuntimeVersion()
    ok("runtimeVersion" in r.json, "health phải có field runtimeVersion")
    eq(r.json.runtimeVersion, real, "runtimeVersion đúng bằng readRuntimeVersion()")
    ok(r.json.runtimeVersion !== PROTOCOL_VERSION,
      `runtimeVersion (${r.json.runtimeVersion}) KHÔNG được là version khung (${PROTOCOL_VERSION})`)
    ok(/^\d+\.\d+\.\d+/.test(String(r.json.runtimeVersion)), "trông như một version phát hành")
  })
  await it("webapp cũ 2.1.24 poll lúc quét đĩa/install chậm ⇒ không miss health, rồi nhận bản mới", async () => {
    const ws = agent.registry.active
    const originalCount = ws.countProjects
    const originalVersion = agent.state.runtimeVersion
    try {
      ws.countProjects = async () => {
        await new Promise(resolve => setTimeout(resolve, 1500))
        return 99
      }
      /* Ép một lượt refresh nền đang chậm; request /health chỉ đọc snapshot. */
      agent.healthProjectCount(ws, true)
      const oldPoll = []
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now()
        const r = await api("GET", "/health")
        oldPoll.push({ reachable: r.status === 200, version: r.json.runtimeVersion, ms: Date.now() - t0 })
      }
      ok(oldPoll.every(p => p.reachable), "bốn nhịp của bundle cũ đều còn nhận được /health")
      ok(oldPoll.every(p => p.ms < 1200), `health không được chạm timeout cũ 1200ms: ${JSON.stringify(oldPoll)}`)
      ok(oldPoll.every(p => p.version === originalVersion), "trong lúc cài vẫn báo đúng bản đang chạy")

      /* Mô phỏng đúng nhịp launchd thay agent: bundle cũ không cần thấy miss,
         chỉ cần thấy runtimeVersion đổi là kết luận updated. */
      agent.state.runtimeVersion = "2.1.25"
      const after = await api("GET", "/health")
      ok(after.status === 200 && after.json.runtimeVersion === "2.1.25",
        "bundle cũ thấy bản mới ngay khi agent mới phục vụ")
    } finally {
      ws.countProjects = originalCount
      agent.state.runtimeVersion = originalVersion
    }
  })
  await it("GET /api/doctor chỉ trả enum + boolean, không có nội dung auth", async () => {
    const r = await api("GET", "/api/doctor")
    eq(r.status, 200, "status")
    ok(typeof r.json.imageGen.available === "boolean", "imageGen.available là boolean")
    ok(["default-home", "img-home", "profile-overlay", "unavailable", "unknown"].includes(r.json.imageGen.mode), "mode là enum")
    ok(!/auth_mode|access_token|refresh_token|id_token|sk-/.test(r.text), "không có field auth nào")
    ok(typeof r.json.workspace.writable === "boolean", "workspace.writable")
  })
  // ─────────────────────────────────────────── 1b. HỒ SƠ TẠO ẢNH
  describe("hồ sơ tạo ảnh")

  await it("doctor chỉ còn MỘT hồ sơ: profile default-home, nhãn ~/.codex", async () => {
    const { doctor } = await import("../lib/doctor.mjs")
    const ws = agent.registry.active
    const d = await doctor(ws, { refresh: true })
    eq(d.imageGen.profile, "default-home", "profile duy nhất")
    eq(d.imageGen.codexHomeLabel, CODEX_HOME_DEFAULT, "nhãn rút gọn của home mặc định")
  })

  /* ── MODEL TẠO ẢNH: ĐỌC RA TỪ gen.sh, KHÔNG PHẢI CHÉP LẠI ────────────────────
     Màn Cài đặt nói "sẽ tạo ảnh bằng model X, mức nghĩ Y". Nếu con số đó là bản sao
     gõ tay trong JS thì đổi gen.sh một lần là màn Cài đặt bắt đầu nói dối, mà không
     ca nào đỏ. Nên ca này đối chiếu THẲNG với chuỗi trong gen.sh của engine đang chạy
     — cùng một mẹo mà `item-prompt` đã phải dùng, vì cùng một lý do. */
  await it("doctor đọc model + effort RA TỪ gen.sh, không chép lại", async () => {
    const { doctor } = await import("../lib/doctor.mjs")
    const { resolveEngine } = await import("../lib/engine.mjs")
    const ws = agent.registry.active
    const dir = await resolveEngine(ws)
    ok(dir, "phải tìm được engine để đối chiếu")
    const gen = readFileSync(join(dir, "gen.sh"), "utf8")
    const model = gen.match(/^GEN_MODEL="\$\{KITGEN_GEN_MODEL-([^}"]*)\}"/m)?.[1] ?? null
    const effort = gen.match(/^GEN_EFFORT="\$\{KITGEN_GEN_EFFORT-([^}"]*)\}"/m)?.[1] ?? null
    ok(model, "gen.sh phải khai GEN_MODEL — nếu dòng này đổi hình, sửa CẢ doctor.mjs")

    const d = await doctor(ws, { refresh: true })
    eq(d.imageGen.model.requested, model, "tên model khớp gen.sh")
    eq(d.imageGen.model.effort, effort, "mức nghĩ khớp gen.sh")
    eq(d.imageGen.model.source, "engine", "không có env ghi đè ⇒ nguồn là engine")
  })

  await it('KITGEN_GEN_MODEL="" là CỐ Ý TẮT, không phải "chưa đặt"', async () => {
    const { doctor } = await import("../lib/doctor.mjs")
    const ws = agent.registry.active
    const before = process.env.KITGEN_GEN_MODEL
    process.env.KITGEN_GEN_MODEL = ""
    try {
      const d = await doctor(ws, { refresh: true })
      eq(d.imageGen.model.requested, null, "chuỗi rỗng ⇒ trả engine về model của hồ sơ")
      eq(d.imageGen.model.source, "env", "nguồn là biến môi trường")
      eq(d.imageGen.model.known, null, "không có model nào để tra catalog")
    } finally {
      if (before === undefined) delete process.env.KITGEN_GEN_MODEL
      else process.env.KITGEN_GEN_MODEL = before
    }
  })

  await it("KITGEN_GEN_MODEL đặt tay ⇒ doctor nói đúng cái sẽ chạy, không nói mặc định", async () => {
    const { doctor } = await import("../lib/doctor.mjs")
    const ws = agent.registry.active
    const before = process.env.KITGEN_GEN_MODEL
    process.env.KITGEN_GEN_MODEL = "gpt-model-khong-co-that"
    try {
      const d = await doctor(ws, { refresh: true })
      eq(d.imageGen.model.requested, "gpt-model-khong-co-that", "lấy theo env")
      eq(d.imageGen.model.source, "env", "nguồn là biến môi trường")
    } finally {
      if (before === undefined) delete process.env.KITGEN_GEN_MODEL
      else process.env.KITGEN_GEN_MODEL = before
    }
  })

  // ─────────────────────────────────────────── 1c. QUOTA CÒN LẠI (/api/usage)
  describe("usage / quota")
  {
    /* Fixture = một $CODEX_HOME giả với đúng hình dạng thật của rollout:
       một dòng hội thoại (KHÔNG được lọt ra ngoài) + hai dòng `token_count`, dòng
       sau mới là số đúng. `KITGEN_CODEX_HOME` chỉ tồn tại cho test. */
    const fakeHome = join(tmp, "codex-home")
    const day = join(fakeHome, "sessions", "2026", "08", "13")
    mkdirSync(day, { recursive: true })
    mkdirSync(join(fakeHome, "sessions", "2026", "08", "12"), { recursive: true })
    const evt = (usedPercent, resetsAt) => JSON.stringify({
      timestamp: "2026-08-13T09:00:24.138Z", type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          limit_id: "codex", plan_type: "plus",
          primary: { used_percent: usedPercent, window_minutes: 10080, resets_at: resetsAt },
          secondary: null,
        },
      },
    })
    writeFileSync(join(day, "rollout-2026-08-13T16-19-42-aaa.jsonl"), [
      JSON.stringify({ type: "response_item", payload: { type: "message", content: "MẬT KHẨU NGÂN HÀNG" } }),
      evt(1, 1787207428),
      evt(2, 1787207428),
    ].join("\n") + "\n")

    await it("GET /api/usage đọc rate_limits của lượt gần nhất, trả % CÒN LẠI", async () => {
      process.env.KITGEN_CODEX_HOME = fakeHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(r.status, 200, "status")
        eq(r.json.ok, true, "ok")
        eq(r.json.primary.usedPercent, 2, "lấy bản ghi CUỐI trong file, không phải bản đầu")
        eq(r.json.primary.remainingPercent, 98, "% còn lại")
        eq(r.json.primary.windowMinutes, 10080, "cửa sổ tuần")
        eq(r.json.primary.resetsAt, new Date(1787207428 * 1000).toISOString(), "mốc reset dạng ISO")
        eq(r.json.plan, "plus", "gói cước là enum của server")
        ok(typeof r.json.observedAt === "string", "nói rõ số này quan sát lúc nào")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })
    await it("GET /api/usage KHÔNG mang theo nội dung hội thoại hay đường dẫn tuyệt đối", async () => {
      process.env.KITGEN_CODEX_HOME = fakeHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        ok(!r.text.includes("MẬT KHẨU"), "nội dung rollout KHÔNG được lọt ra client")
        ok(!/\/Users\/|\/private\/|\/tmp\//.test(r.text), `không có path tuyệt đối: ${r.text}`)
        ok(!/access_token|refresh_token|id_token|sk-/.test(r.text), "không có field auth nào")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })
    await it("home không có số liệu ⇒ 200 + ok:false + reason enum (không 500, không bịa số)", async () => {
      process.env.KITGEN_CODEX_HOME = join(tmp, "codex-home-empty")
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(r.status, 200, "status")
        eq(r.json.ok, false, "ok")
        ok(["NO_CODEX_HOME", "NO_SESSIONS", "NO_DATA"].includes(r.json.reason), `reason là enum: ${r.json.reason}`)
        eq(r.json.primary, null, "KHÔNG bịa số phần trăm")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })

    /* ── BẢN GHI CUỐI KHÔNG CÓ WINDOW (bug "thanh đứng im", 07/09/2026) ────────
       Hình dạng THẬT lấy từ `~/.codex/sessions/2026/09/03`: dòng `rate_limits` cuối
       của phiên là `limit_id:"premium"` với primary/secondary = null và chỉ mang
       `credits`. Bản cũ bỏ qua nguyên dòng đó ⇒ `observedAt` trả về là mốc của dòng
       CŨ HƠN, và `credits` thì không bao giờ ra tới UI. */
    const creditsHome = join(tmp, "codex-home-credits")
    {
      const cday = join(creditsHome, "sessions", "2026", "09", "03")
      mkdirSync(cday, { recursive: true })
      const line = (at, rl) => JSON.stringify({ timestamp: at, type: "event_msg", payload: { type: "token_count", rate_limits: rl } })
      writeFileSync(join(cday, "rollout-2026-09-03T00-45-00-bbb.jsonl"), [
        line("2026-09-03T05:40:00.000Z", {
          limit_id: "codex", plan_type: "prolite",
          primary: { used_percent: 100, window_minutes: 10080, resets_at: 1788763415 },
          secondary: null, credits: { has_credits: false, unlimited: false, balance: "0" },
        }),
        line("2026-09-03T05:43:05.955Z", {
          limit_id: "premium", plan_type: "prolite",
          primary: null, secondary: null,
          credits: { has_credits: true, unlimited: false, balance: "12.5" },
        }),
      ].join("\n") + "\n")
    }

    await it("bản ghi CUỐI chỉ có credits ⇒ giữ window của bản có số, nhưng credits + observedAt là của bản MỚI", async () => {
      process.env.KITGEN_CODEX_HOME = creditsHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(r.json.ok, true, "ok")
        eq(r.json.primary.usedPercent, 100, "window vẫn là của bản ghi gần nhất CÓ SỐ")
        eq(r.json.observedAt, "2026-09-03T05:43:05.955Z",
          "mốc quan sát phải là dòng rate_limits MỚI NHẤT — nếu không, UI hiện một mốc đứng im mà không nói vì sao")
        eq(r.json.credits.hasCredits, true, "credits lấy của bản mới")
        eq(r.json.credits.balance, 12.5, "balance là SỐ, không phải chuỗi '12.5'")
        eq(r.json.credits.unlimited, false, "unlimited là boolean")
        eq(r.json.plan, "prolite", "gói cước đi cùng mọi bản ghi")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })

    await it("credits ra ngoài chỉ là số + boolean (hợp đồng bảo mật: không chuỗi tự do)", async () => {
      process.env.KITGEN_CODEX_HOME = creditsHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(typeof r.json.credits.balance, "number", "balance đã đổi sang số ngay ở agent")
        ok(!r.text.includes("\"12.5\""), `chuỗi thô của server KHÔNG được đi ra: ${r.text}`)
        ok(!("limit_id" in r.json), "không bê nguyên khối rate_limits ra ngoài")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })

    await it("cache là THẬT, và invalidateUsageCache() là cửa duy nhất mở nó ra", async () => {
      const { usage, invalidateUsageCache } = await import("../lib/usage.mjs")
      const churn = join(tmp, "codex-home-churn")
      const cday = join(churn, "sessions", "2026", "09", "04")
      mkdirSync(cday, { recursive: true })
      const file = join(cday, "rollout-2026-09-04T00-00-00-ccc.jsonl")
      const evt = used => JSON.stringify({
        timestamp: "2026-09-04T00:00:00.000Z", type: "event_msg",
        payload: { type: "token_count", rate_limits: { limit_id: "codex", plan_type: "prolite", primary: { used_percent: used, window_minutes: 10080, resets_at: 1788763415 }, secondary: null } },
      })
      writeFileSync(file, evt(10) + "\n")
      process.env.KITGEN_CODEX_HOME = churn
      try {
        eq((await usage(null, { refresh: true })).primary.remainingPercent, 90, "số đọc lần đầu")
        writeFileSync(file, evt(10) + "\n" + evt(42) + "\n")
        eq((await usage(null)).primary.remainingPercent, 90, "chưa dọn cache ⇒ vẫn là số cũ (cache có thật)")
        invalidateUsageCache()
        eq((await usage(null)).primary.remainingPercent, 58, "dọn xong ⇒ lần đọc kế tiếp thấy dòng mới")
      } finally { delete process.env.KITGEN_CODEX_HOME; invalidateUsageCache() }
    })
  }

  describe("health")
  await it("GET /api/workspaces trả id đục, không trả path", async () => {
    const r = await api("GET", "/api/workspaces")
    eq(r.status, 200, "status")
    ok(r.json.items.length >= 1, "có ≥1 workspace")
    ok(r.json.items.every(w => !("path" in w) && !("root" in w)), "không có field path/root")
    eq(r.json.activeId, r.json.items.find(w => w.active).id, "activeId khớp")
  })
  await it("GET /api/update đọc manifest tĩnh, không phụ thuộc GitHub API", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "99.0.0", archive: "https://example.test/kitgen-runtime-99.0.0.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.ok, true, "ok")
      eq(r.json.latestVersion, "99.0.0", "latest version")
      eq(r.json.available, true, "update available")
      eq(r.json.updateCommand, CMD_UPDATE, "lệnh cập nhật thủ công")
      ok(!/\/Users\//.test(r.text), "không trả đường dẫn tuyệt đối")
    } finally { globalThis.fetch = original }
  })
  await it("GET /api/update biết version ĐANG CHẠY, không mặc định 0.0.0", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "0.0.1", archive: "https://example.test/kitgen-runtime-0.0.1.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      ok(/^\d+\.\d+\.\d+/.test(r.json.currentVersion), `currentVersion là semver: ${r.json.currentVersion}`)
      ok(r.json.currentVersion !== "0.0.0", "KHÔNG lùi về 0.0.0 (nếu lùi thì lúc nào cũng báo có bản mới)")
      eq(r.json.available, false, "manifest cũ hơn ⇒ không có bản mới")
    } finally { globalThis.fetch = original }
  })
  /* ══════════════════════════════════════════════════════════════════════════
     BACKLOG #23 — CHÀO BẢN MỚI TRONG LÚC CI CÒN ĐANG ĐÓNG GÓI (máy thật 14/08 14:28).
     `release.json` đi cùng commit/tag, tarball chỉ có sau ~15 phút. Cửa sổ ở giữa:
     UI mời cập nhật → installer curl 404 → chết ở bước tải. "Có bản mới" từ nay phải
     có nghĩa "tải về được", nên trước khi chào, agent hỏi thẳng chỗ sẽ tải.
     ══════════════════════════════════════════════════════════════════════════ */
  await it("manifest khai bản mới mà tarball chưa có ⇒ KHÔNG chào (reason ARCHIVE_PENDING)", async () => {
    const original = globalThis.fetch
    const seen = []
    globalThis.fetch = async (url, init = {}) => {
      seen.push({ url: String(url), method: init.method ?? "GET" })
      if ((init.method ?? "GET") === "HEAD") return new Response(null, { status: 404 })
      return new Response(JSON.stringify({
        version: "99.0.0", archive: "https://example.test/kitgen-runtime-99.0.0.tar.gz",
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.ok, true, "manifest vẫn đọc được — KHÁC với mất mạng")
      eq(r.json.latestVersion, "99.0.0", "vẫn nói thật bản mới nhất là bản nào")
      eq(r.json.available, false, "KHÔNG mời cập nhật thứ chưa tải về được")
      eq(r.json.reason, "ARCHIVE_PENDING", "reason là enum, phân biệt được với mất mạng")
      eq(seen.filter(s => s.method === "HEAD").length, 1, "đúng MỘT request HEAD, không tải cả file")
      eq(seen.find(s => s.method === "HEAD").url, "https://example.test/kitgen-runtime-99.0.0.tar.gz",
        "hỏi ĐÚNG cái URL mà installer sẽ tải")
    } finally { globalThis.fetch = original }
  })
  await it("không có bản mới thì KHÔNG bắn thêm request nào ra ngoài", async () => {
    const original = globalThis.fetch
    const seen = []
    globalThis.fetch = async (url, init = {}) => {
      seen.push(init.method ?? "GET")
      return new Response(JSON.stringify({
        version: "0.0.1", archive: "https://example.test/kitgen-runtime-0.0.1.tar.gz",
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    try {
      const r = await api("GET", "/api/update")
      eq(r.json.available, false, "manifest cũ hơn ⇒ không có bản mới")
      eq(seen.filter(m => m === "HEAD").length, 0, "nhịp poll 30 phút không được đẻ thêm request")
    } finally { globalThis.fetch = original }
  })
  await it("HEAD hỏng vì lý do KHÁC 404 ⇒ vẫn chào (không được giấu bản vá vì một cái proxy)", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method ?? "GET") === "HEAD") return new Response(null, { status: 405 })
      return new Response(JSON.stringify({
        version: "99.0.0", archive: "https://example.test/kitgen-runtime-99.0.0.tar.gz",
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    try {
      const r = await api("GET", "/api/update")
      eq(r.json.available, true, "chỉ 403/404/410 mới là bằng chứng 'chưa có file'")
      eq(r.json.reason, undefined, "không bịa ra lý do")
    } finally { globalThis.fetch = original }
  })
  await it("HEAD ném lỗi (timeout/DNS) ⇒ vẫn chào, không kẹt cứng", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method ?? "GET") === "HEAD") throw new TypeError("fetch failed")
      return new Response(JSON.stringify({
        version: "99.0.0", archive: "https://example.test/kitgen-runtime-99.0.0.tar.gz",
      }), { status: 200, headers: { "content-type": "application/json" } })
    }
    try {
      const r = await api("GET", "/api/update")
      eq(r.json.ok, true, "manifest đọc được thì lượt kiểm tra vẫn thành công")
      eq(r.json.available, true, "fail-open có chủ đích")
    } finally { globalThis.fetch = original }
  })

  /* ══════════════════════════════════════════════════════════════════════════
     BACKLOG #20 — CÀI XONG NHƯNG KHÔNG KHỞI ĐỘNG LẠI (máy chủ SP, 14/08).
     Symlink `current` đã trỏ bản mới, tiến trình agent vẫn là bản cũ. /health 200,
     /api/update vẫn "có bản mới" ⇒ user đọc thành "update hỏng", cài lại vô ích.
     Dựng lại đúng hiện trường: đĩa có 9.9.9, tiến trình khai 2.1.20.
     ══════════════════════════════════════════════════════════════════════════ */
  await it("cài xong mà tiến trình vẫn bản cũ ⇒ restartRequired + lệnh khởi động lại", async () => {
    const fakeHome = join(tmp, "kitgen-home-stale")
    mkdirSync(join(fakeHome, "current"), { recursive: true })
    writeFileSync(join(fakeHome, "current", "VERSION"), "9.9.9\n")
    const originalHome = process.env.KITGEN_HOME
    const originalVersion = agent.state.runtimeVersion
    const originalFetch = globalThis.fetch
    process.env.KITGEN_HOME = fakeHome
    agent.state.runtimeVersion = "2.1.20"
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "9.9.9", archive: "https://example.test/kitgen-runtime-9.9.9.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.currentVersion, "2.1.20", "version ĐANG CHẠY là của tiến trình, không phải của đĩa")
      eq(r.json.installedVersion, "9.9.9", "version ĐÃ CÀI đọc qua symlink current")
      eq(r.json.restartRequired, true, "trạng thái lỗi rõ, không im lặng nửa vời")
      eq(r.json.restartCommand, CMD_RESTART, "lệnh chữa, dạng nhãn rút gọn")
      ok(!/\/Users\/|kitgen-home-stale/.test(r.text), "không lộ đường dẫn tuyệt đối")
    } finally {
      globalThis.fetch = originalFetch
      agent.state.runtimeVersion = originalVersion
      if (originalHome === undefined) delete process.env.KITGEN_HOME; else process.env.KITGEN_HOME = originalHome
    }
  })
  await it("restartRequired KHÔNG bật khi đĩa và tiến trình cùng một bản (99,9% số lần)", async () => {
    const fakeHome = join(tmp, "kitgen-home-fresh")
    mkdirSync(join(fakeHome, "current"), { recursive: true })
    writeFileSync(join(fakeHome, "current", "VERSION"), "2.1.20\n")
    const originalHome = process.env.KITGEN_HOME
    const originalVersion = agent.state.runtimeVersion
    const originalFetch = globalThis.fetch
    process.env.KITGEN_HOME = fakeHome
    agent.state.runtimeVersion = "2.1.20"
    globalThis.fetch = async () => { throw new TypeError("fetch failed") }
    try {
      const r = await api("GET", "/api/update")
      eq(r.json.ok, false, "mất mạng")
      eq(r.json.restartRequired, false, "không đổ oan là phải khởi động lại")
      // Mất mạng KHÔNG được che mất ca cài-xong-chưa-restart: số này đọc từ đĩa.
      eq(r.json.installedVersion, "2.1.20", "vẫn đọc được bản đã cài dù manifest hỏng")
    } finally {
      globalThis.fetch = originalFetch
      agent.state.runtimeVersion = originalVersion
      if (originalHome === undefined) delete process.env.KITGEN_HOME; else process.env.KITGEN_HOME = originalHome
    }
  })
  await it("POST /api/update ghi nhật ký ra file và tách hẳn session (không tự giết mình)", async () => {
    const fakeHome = join(tmp, "kitgen-home-spawn")
    mkdirSync(fakeHome, { recursive: true })
    writeFileSync(join(fakeHome, "install.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o700 })
    const calls = []
    const fake = { on() {}, unref() {} }
    const { scheduleUpdate, resetUpdateInstallLock } = await import("../lib/update.mjs")
    const out = scheduleUpdate({
      kitgenHome: fakeHome,
      spawnImpl: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return fake },
    })
    eq(calls.length, 1, "có spawn installer")
    /* POSIX: detached BẮT BUỘC — installer sắp `launchctl bootout` chính job chứa agent,
       không tách session là nó tự giết mình. Windows: NGƯỢC LẠI phải false — DETACHED_PROCESS
       vô hiệu windowsHide (cửa sổ console bật giữa màn hình), và tiến trình con Windows
       vốn không chết theo cha nên không cần detached để sống sót. */
    eq(calls[0].opts.detached, process.platform !== "win32",
      "detached: POSIX tách session để sống sót launchctl; Windows tắt để giữ windowsHide")
    ok(Array.isArray(calls[0].opts.stdio), "stdio đi vào file, KHÔNG còn 'ignore'")
    ok(typeof calls[0].opts.stdio[1] === "number", "stdout là fd của update.log")
    eq(out.logLabel, LOG_UPDATE, "nhãn nhật ký rút gọn cho UI")
    const log = readFileSync(join(fakeHome, "update.log"), "utf8")
    ok(/kitgen update/.test(log), `update.log có dòng mở đầu: ${log}`)
    /* fd PHẢI ĐƯỢC ĐÓNG sau khi spawn (update.mjs ④). Bản trước để mở suốt đời tiến
       trình: trên Windows đó là `update.log` bị chính agent khoá ⇒ installer không ghi
       đè được, và xoá cây thư mục chứa nó trả ENOTEMPTY — đúng thứ đã giết bộ ca trên
       runner Windows lần chạy đầu. Ca này bắt được lỗi đó TRÊN CẢ macOS: fstat một fd
       đã đóng phải ném EBADF. */
    let stillOpen = true
    try { fstatSync(calls[0].opts.stdio[1]) } catch (e) { stillOpen = e.code !== "EBADF" ? true : false }
    ok(!stillOpen, "fd của update.log đã đóng ở tiến trình cha (Windows: file còn bị khoá thì xoá được gì nữa)")
    resetUpdateInstallLock({ kitgenHome: fakeHome })
  })

  /* ══════════════════════════════════════════════════════════════════════════
     LƯỢT SAU KHÔNG ĐƯỢC XOÁ VẾT CỦA LƯỢT TRƯỚC (máy chủ SP, 14/08).
     Người dùng bấm [Cập nhật] hai lần: lượt 1 hỏng, lượt 2 xong. Đi tìm nguyên nhân
     thì update.log chỉ còn ĐÚNG lượt 2 — `openSync(logFile, "w")` của chính lượt chữa
     đã ghi đè bằng chứng của lượt hỏng. Nhật ký của một thao tác lặp lại được thì phải
     cộng dồn; giữ kích thước là việc của `trimUpdateLog`.
     ══════════════════════════════════════════════════════════════════════════ */
  await it("hai lượt update ⇒ update.log GIỮ CẢ HAI, có vạch phân cách", async () => {
    const fakeHome = join(tmp, "kitgen-home-twice")
    mkdirSync(fakeHome, { recursive: true })
    writeFileSync(join(fakeHome, "install.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o700 })
    const { scheduleUpdate, resetUpdateInstallLock } = await import("../lib/update.mjs")
    const calls = []
    const spawnImpl = () => { calls.push(1); return { on() {}, unref() {} } }
    const first = scheduleUpdate({ kitgenHome: fakeHome, spawnImpl })
    eq(first.status, "started", "lượt đầu được nhận")
    // Dấu vết của lượt 1 do CHÍNH INSTALLER ghi qua fd (ở đây giả lập bằng một dòng thật).
    writeFileSync(join(fakeHome, "update.log"), "LƯỢT 1 CHẾT Ở BƯỚC TẢI\n", { flag: "a" })
    const second = scheduleUpdate({ kitgenHome: fakeHome, spawnImpl })
    eq(second.status, "running", "lượt hai không spawn installer chồng lên lượt đầu")
    eq(calls.length, 1, "chỉ spawn một installer")
    resetUpdateInstallLock({ kitgenHome: fakeHome })
    scheduleUpdate({ kitgenHome: fakeHome, spawnImpl })
    eq(calls.length, 2, "lượt mới chỉ chạy sau khi khóa được giải phóng")

    const log = readFileSync(join(fakeHome, "update.log"), "utf8")
    ok(/LƯỢT 1 CHẾT Ở BƯỚC TẢI/.test(log), "vết của lượt hỏng vẫn còn sau khi lượt sau bắt đầu")
    eq(log.match(/kitgen update \(do UI yêu cầu\)/g)?.length, 2, "đủ hai dòng mở đầu")
    ok(/═{10}/.test(log), "có vạch phân cách giữa hai lượt")
  })

  await it("update.log không phình vô hạn — cắt phần ĐẦU, giữ phần gần nhất", async () => {
    const fakeHome = join(tmp, "kitgen-home-trim")
    mkdirSync(fakeHome, { recursive: true })
    const logFile = join(fakeHome, "update.log")
    const { trimUpdateLog } = await import("../lib/update.mjs")
    writeFileSync(logFile, `RẤT CŨ\n${"x".repeat(40_000)}\nGẦN NHẤT\n`)

    eq(trimUpdateLog(logFile, { maxBytes: 100_000 }), false, "dưới trần thì không đụng vào")
    eq(trimUpdateLog(logFile, { maxBytes: 1000, keepBytes: 500 }), true, "vượt trần thì cắt")
    const log = readFileSync(logFile, "utf8")
    ok(/GẦN NHẤT/.test(log), "giữ phần CUỐI — lượt gần đây mới là lượt cần đọc")
    ok(!/RẤT CŨ/.test(log), "phần đầu đã bị cắt")
    ok(/đã cắt bớt/.test(log), "nói ra là đã cắt, không im lặng làm mất dữ liệu")
    ok(log.length < 1000, `kích thước về dưới trần: ${log.length}`)
  })

  await it("mất mạng KHÔNG thành lỗi 500 — trả ok:false + reason enum", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => { throw new TypeError("fetch failed") }
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.ok, false, "ok")
      eq(r.json.reason, "OFFLINE", "reason là enum")
      eq(r.json.latestVersion, null, "không bịa version mới nhất")
      eq(r.json.available, false, "không đổ oan là có bản mới")
      ok(!/fetch failed/.test(r.text), "không lộ chuỗi lỗi thô của Node ra client")
    } finally { globalThis.fetch = original }
  })

  // ─────────────────────────────────────────── 2. CORS / HOST / preflight
  describe("dừng lượt chạy")
  /* HỢP ĐỒNG DỪNG LƯỢT CHẠY TRÊN WINDOWS. Chạy trên CẢ HAI nền vì đây là một quyết
     định, không phải một hành vi phụ thuộc máy: `taskkill` thiếu /F chỉ gửi WM_CLOSE,
     mà bash/python/codex là tiến trình console không có cửa sổ ⇒ không chết. Ba ca
     dừng-run trên runner Windows đỏ vì đúng chỗ này (run 31793695016). */
  await it("taskkill của Windows luôn mang /T và /F (Dừng phải THẬT SỰ dừng)", async () => {
    const { taskkillArgs } = await import("../lib/platform.mjs")
    for (const sig of ["SIGTERM", "SIGKILL"]) {
      const a = taskkillArgs(4242, sig)
      eq(a[0], "/PID", `${sig}: cờ đầu`)
      eq(a[1], "4242", `${sig}: pid dạng chuỗi`)
      ok(a.includes("/T"), `${sig}: /T — codex là tiến trình CHÁU của bash, thiếu /T là nó sống tiếp`)
      ok(a.includes("/F"), `${sig}: /F — thiếu /F thì tiến trình console phớt lờ, Dừng chỉ là lời hứa suông`)
    }
  })

  /* HỢP ĐỒNG ĐỌC OUTPUT CỦA ENGINE. Chạy trên CẢ HAI nền vì đây cũng là một quyết định:
     agent KHÔNG được tin rằng engine in ra dòng sạch. `gen.sh` lấy danh sách job bằng
     `python3 -c "… print(…)"`, mà `print()` trên Windows dịch "\n" thành "\r\n" kể cả khi
     stdout là pipe ⇒ tên job tới tay agent dính \r. Đo thật trên runner (run 31987956355):
       prompt → prompts/tet-main<CR>.txt      OK  tet-main<CR>  8.0K
     Mẫu cũ `(\S+)\.txt` KHÔNG khớp dòng đầu ⇒ job không bao giờ chuyển sang "running" ⇒
     giao diện đứng im ở "đang chờ" suốt lượt gen. Engine cũng phải tự cắt \r
     (WINDOWS-PORT §4.5) nhưng agent phải chịu được kể cả khi nó chưa cắt. */
  await it("tên job dính \\r của Python-trên-Windows vẫn được đọc đúng", async () => {
    const CR = String.fromCharCode(13)
    const { RunStore } = await import("../lib/runs.mjs")
    const store = new RunStore(agent.registry.active)
    const jobs = ["tet-main", "tet-props"].map(job => ({ job, variant: "tet", sheet: job.split("-")[1], status: "queued" }))
    const h = Object.create((await import("../lib/run-handle.mjs")).RunHandle.prototype)
    Object.assign(h, {
      run: { jobs, kind: "gen", progress: { done: 0, failed: 0, total: 2 } },
      durations: [], store, events: [], subs: new Set(),
      emit() {}, persist: async () => {}, eta: () => null, queueSheet() {}, maybeEarlyCover() {},
    })
    h.parseGenLine(`prompt → prompts/tet-main${CR}.txt (+1 ảnh kèm)`)
    eq(jobs[0].status, "running", "job dính CR vẫn chuyển sang running (mẫu prompt chịu được \\r)")
    h.parseGenLine("prompt → prompts/tet-props.txt (+1 ảnh kèm)")
    eq(jobs[1].status, "running", "job sạch vẫn chạy như cũ")
    h.parseGenLine(`OK  tet-main${CR}  8.0K`)
    eq(jobs[0].status, "ok", "OK dính CR vẫn khớp đúng job")
    h.parseGenLine("FAIL tet-props (rc=127)")
    eq(jobs[1].status, "failed", "FAIL sạch vẫn như cũ")
  })

  /* HỢP ĐỒNG BIÊN GIỚI "ĐĨA → WEB". Cũng chạy trên CẢ HAI nền vì cũng là một quyết định:
     mọi đường dẫn tương đối rời agent đi ra web/manifest đều là POSIX, bất kể máy chủ.
     `walkFiles` trả đường dẫn của HỆ ĐIỀU HÀNH; trên Windows đoạn tương đối của
     `kits/tet/tight/01-btn.png` là `tight\01-btn.png`, nên `lastIndexOf("/")` trả -1 và
     khoá đối chiếu manifest thành `tight\01-btn` — KHÔNG khớp `01-btn`. Không có lỗi nào
     nổ: chỉ là `sheet: null` cho toàn bộ bản tight/ (run 31989…, hai ca [112][113] đỏ,
     `["main", null, "tall"]`). Tham số `s` cho phép ép ngữ nghĩa Windows ngay trên Mac. */
  await it("đường dẫn tương đối rời agent luôn là POSIX, kể cả khi đĩa dùng dấu \\", async () => {
    const { relPosix } = await import("../lib/paths.mjs")
    const { sep } = await import("node:path")
    eq(relPosix("C:\\ws\\kits\\tet", "C:\\ws\\kits\\tet\\tight\\01-btn.png", "\\"), "tight/01-btn.png",
      "ngữ nghĩa Windows: thư mục con phải ra dấu / thì manifest mới đối chiếu được")
    eq(relPosix("C:\\ws\\kits\\tet", "C:\\ws\\kits\\tet\\atlas.png", "\\"), "atlas.png",
      "ngữ nghĩa Windows: file ngay trong thư mục vẫn nguyên vẹn")
    eq(relPosix("/ws/kits/tet", "/ws/kits/tet/tight/01-btn.png"), "tight/01-btn.png",
      "ngữ nghĩa POSIX không đổi một ký tự")
    // Trên darwin/linux `sep` là "/", nên hàm là split("/").join("/") — kể cả tên file có
    // chứa dấu \ cũng KHÔNG bị đụng tới. Đây là điều khiến bản vá này an toàn tuyệt đối.
    if (sep === "/") {
      eq(relPosix("/ws", "/ws/ten\\la.png"), "ten\\la.png",
        "tên file chứa dấu \\ trên POSIX phải giữ nguyên — không được 'sửa' hộ")
    }
  })

  describe("bảo mật vận chuyển")
  await it("Origin lạ bị 403 ORIGIN_NOT_ALLOWED (kể cả GET)", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, origin: "https://evil.example.com" } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
    ok(!r.headers["access-control-allow-origin"], "KHÔNG được trả Allow-Origin cho origin lạ")
  })
  await it("KHÔNG BAO GIỜ dùng Access-Control-Allow-Origin: *", async () => {
    const r = await api("GET", "/health")
    eq(r.headers["access-control-allow-origin"], PAGES, "phản chiếu đúng origin đã duyệt")
    ok(!stripComments(readFileSync(join(agentDir, "lib", "security.mjs"), "utf8")).includes('"*"'), "mã nguồn không có wildcard origin")
  })
  await it("Host sai (DNS-rebinding) bị 421 BAD_HOST", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, host: "kitgen.attacker.test" } })
    eq(r.status, 421, "status")
    eq(r.json.error.code, "BAD_HOST", "code")
  })
  await it("Host là tên miền lạ trỏ 127.0.0.1 cũng bị 421", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, host: "rebind.local:8765" } })
    eq(r.status, 421, "status")
  })
  await it("thiếu X-KitGen-Client bị 403 (ép preflight)", async () => {
    const r = await call("GET", "/api/projects", { headers: { host: CLIENT.host, origin: PAGES } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "CLIENT_HEADER_REQUIRED", "code")
  })
  await it("request không có Origin bị 403 khi chưa --allow-cli", async () => {
    const r = await call("GET", "/health", { headers: { host: CLIENT.host, "x-kitgen-client": "1" } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
  })
  await it("OPTIONS preflight trả 204 + đủ header CORS, không credentials", async () => {
    const r = await api("OPTIONS", "/api/projects")
    eq(r.status, 204, "status")
    eq(r.headers["access-control-allow-origin"], PAGES, "allow-origin")
    includes(r.headers["access-control-allow-headers"], "X-KitGen-Client", "allow-headers")
    ok(!r.headers["access-control-allow-credentials"], "KHÔNG có Allow-Credentials")
  })
  await it("agent chỉ bind loopback: mọi listen() có host loopback tường minh, không 0.0.0.0", async () => {
    const src = stripComments(readFileSync(join(agentDir, "server.mjs"), "utf8"))
    const calls = [...src.matchAll(/\.listen\(([^\n]*)/g)].map(m => m[1])
    ok(calls.length >= 2, `phải có ≥2 lời gọi listen, thấy ${calls.length}`)
    for (const c of calls) {
      ok(/host:\s*"(127\.0\.0\.1|::1)"/.test(c), `listen KHÔNG khai host loopback tường minh: ${c}`)
      ok(!c.includes("0.0.0.0"), `listen bind 0.0.0.0: ${c}`)
    }
    ok(calls.some(c => c.includes('"127.0.0.1"')), "có bind 127.0.0.1")
    ok(calls.some(c => c.includes('"::1"')), "có bind [::1]")
  })

}
