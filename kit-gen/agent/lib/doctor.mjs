/* doctor.mjs — kiểm môi trường. HỢP ĐỒNG: CHỈ trả enum + boolean + version string.
   TUYỆT ĐỐI KHÔNG đọc/trả nội dung auth.json, config.toml, hay biến môi trường bí mật
   (architecture §4.4-4 + §6.3). Kiểm tra image_gen theo teams/t3-auth/PLAN.md:
   `codex debug prompt-input | grep -cE "image_?gen"` — chỉ ĐẾM, không in nội dung, không tốn quota.
   Codex ≥0.147 đổi tên tool `image_gen` thành skill `imagegen` nên phải khớp cả hai dạng. */
import { execFile } from "node:child_process"
import { homedir, platform, arch, release } from "node:os"
import { join } from "node:path"
import { statfs, readFile } from "node:fs/promises"
import { readEnv } from "../engine/gen.mjs"
import { shortenPath } from "./redact.mjs"
import { winShellOpts, winSpawnOpts } from "./platform.mjs"

const CACHE_MS = 60_000
let cache = { at: 0, data: null }
const CODEX = process.env.KITGEN_CODEX_BIN || "codex"

function run(cmd, args, { timeout = 6000, env = {} } = {}) {
  // winShellOpts/winSpawnOpts trả {} trên darwin/linux ⇒ options y hệt mã cũ.
  // Trên win32, codex do npm cài là `codex.cmd` mà Node ≥18.20 chỉ chạy được khi shell:true.
  const extra = { ...winSpawnOpts(), ...winShellOpts(cmd) }
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, env: { ...process.env, ...env }, maxBuffer: 4 << 20, ...extra },
      (err, stdout, stderr) => resolve({ ok: !err, code: err?.code ?? 0, stdout: stdout ?? "", stderr: stderr ?? "" }))
  })
}

async function firstLineVersion(cmd, args = ["--version"]) {
  const r = await run(cmd, args, { timeout: 5000 })
  if (!r.ok && !r.stdout) return { ok: false, version: null }
  const line = (r.stdout || r.stderr).split("\n").find(l => /\d+\.\d+/.test(l)) ?? ""
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(line)
  return { ok: true, version: m ? m[1] : null }
}

/**
 * ĐƯỜNG THẬT của `codex`, VÀ TERMINAL CỦA NGƯỜI DÙNG CÓ GÕ ĐƯỢC NÓ KHÔNG.
 *
 * ╔══ SỰ CỐ CÓ THẬT, ĐÃ PHẢI LÊN TẬN MÁY KHÁCH ═══════════════════════════════╗
 * ║ Khách cài codex bằng standalone installer (chatgpt.com/codex/install.sh)   ║
 * ║ ⇒ binary nằm ở `~/.local/bin/codex`, mà thư mục đó KHÔNG có trong PATH mặc ║
 * ║ định của macOS. Installer chỉ export cho phiên shell đang chạy rồi ghi thêm║
 * ║ một dòng vào file rc.                                                      ║
 * ║                                                                            ║
 * ║ Agent được khởi động từ ĐÚNG phiên đó ⇒ `execFile("codex")` chạy được ⇒ UI ║
 * ║ báo "đã cài Codex CLI ✓". Khách mở cửa sổ Terminal MỚI, gõ `codex` ⇒        ║
 * ║ **command not found**. Và app còn đưa cho họ lệnh `codex login` chữ trần để ║
 * ║ copy — dán vào là hỏng y hệt.                                              ║
 * ║                                                                            ║
 * ║ Tức "đã cài" của agent và "gõ được" của khách là HAI CÂU KHÁC NHAU. Trước   ║
 * ║ bản này doctor chỉ trả câu thứ nhất, còn màn hình thì nói như thể cả hai.   ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * Trả về nhãn RÚT GỌN (`~/…`) qua `shortenPath` — hợp đồng §4.3-5 cấm path tuyệt
 * đối ra client, và nhãn `~/…` là lối đã được duyệt (xem `codexHomeLabel`).
 *
 * `shellOk` có BA giá trị, và cái thứ ba là quan trọng nhất:
 *   true  — login shell tìm thấy codex ⇒ lệnh Terminal copy ra dùng được
 *   false — login shell KHÔNG thấy ⇒ đúng ca của khách, phải nói ra
 *   null  — KHÔNG DÒ ĐƯỢC (Windows, không có $SHELL, shell treo quá 8s). Im lặng
 *           còn hơn báo "Terminal của bạn hỏng" dựa trên một phép dò thất bại —
 *           đó đúng là kiểu kết luận mà `PROBE_FAILED` của setup.sh đã tránh.
 */
async function codexWhere() {
  /* Test/CI trỏ thẳng binary ⇒ không có chuyện PATH, và cũng không được spawn shell. */
  if (process.env.KITGEN_CODEX_BIN) {
    return { binLabel: shortenPath(process.env.KITGEN_CODEX_BIN), shellOk: null, shellDirLabel: null }
  }
  const win = platform() === "win32"
  const look = win ? await run("where", ["codex"], { timeout: 5000 })
                   : await run("/usr/bin/which", ["codex"], { timeout: 5000 })
  const abs = look.ok ? (look.stdout.split("\n").map(l => l.trim()).find(Boolean) ?? null) : null

  let shellOk = null
  if (!win && process.env.SHELL) {
    /* `-lic`: login + interactive = đúng thứ Terminal.app mở ra, nên nó đọc cả
       `.zprofile` lẫn `.zshrc`. `|| echo __NONE__` để phân biệt "shell chạy và
       KHÔNG thấy" với "shell không chạy nổi" — thiếu nó thì cả hai đều là exit≠0. */
    const probe = await run(process.env.SHELL, ["-lic", "command -v codex || echo __NONE__"], { timeout: 8000 })
    const out = probe.stdout.trim()
    if (out.includes("__NONE__")) shellOk = false
    else if (out !== "") shellOk = true
  }
  return {
    binLabel: abs ? shortenPath(abs) : null,
    shellOk,
    /* Thư mục cần thêm vào PATH — chỉ có nghĩa khi agent thấy mà shell không thấy. */
    shellDirLabel: abs && shellOk === false ? shortenPath(abs.slice(0, abs.lastIndexOf("/"))) : null,
  }
}

/* ══ MỤC «PYTHON 3» + «PILLOW» ĐÃ BỎ (bước ④, 16/09/2026) ═════════════════════
   Chúng có mặt vì engine là `slice.py` (Pillow) và vì thumbnail chạy bằng Pillow.
   Cả hai đường nay là JS trong gói agent, nên một máy KHÔNG CÓ python vẫn cắt được
   sheet và vẫn co được ảnh — hỏi han về python ở đây chỉ còn là dò một thứ mà sản
   phẩm không dùng, rồi bày cho người dùng một dòng đỏ và một lệnh `pip install`
   không chữa gì cả.

   KHOÁ `python` BỊ BỎ KHỎI PAYLOAD, và đó là lựa chọn ÍT DỐI NHẤT trong ba lựa chọn:
     · `ok: true`  — hai dòng checklist hiện ✓ cho một thứ agent KHÔNG hề kiểm, ngay
                     tại màn hình mà cả giá trị của nó là nói thật. Loại.
     · `ok: false` — hiện ✗ đỏ kèm lệnh `pip install pillow` không chữa gì. Loại.
     · `ok: null`  — `lib/types/api.ts` khai `ok: z.boolean()`, null làm HỎNG phép
                     parse của cả payload doctor. Loại (và webapp cấm sửa ở bước này).
   Vắng khoá thì webapp rơi vào nhánh nó ĐÃ CÓ SẴN và đã viết thành lời:
   «agent không khai mục nào ⇒ hiện "chưa kiểm được", KHÔNG bịa ✗» (DoctorChecklist.tsx)
   — `python` khai `.optional()` trong lược đồ nên payload vẫn hợp lệ. Bước ⑤b gỡ hai
   dòng ấy khỏi webapp (đợt ⑤ chia đôi: ⑤a installer/CI/tài liệu, ⑤b webapp); cho tới
   lúc đó chúng nói "Công cụ local chưa báo về mục này", đúng nghĩa đen của việc vừa
   xảy ra. */

/* join() chứ không replace chuỗi: trên Windows homedir() dùng backslash, ghép "~/x"
   bằng replace sẽ ra "C:\Users\a/x" — path lai hai kiểu ngăn cách, so sánh/label sai. */
function expandHome(p) {
  if (p === "~") return homedir()
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p
}

/* ── MỘT CODEX, MỘT HOME ──────────────────────────────────────────────────────
   Quyết định của chủ sản phẩm 24/08/2026: BỎ HẲN "hồ sơ ảnh riêng" (~/.codex-img).
   Người dùng dùng codex như một công cụ bình thường: cài, `codex login` vào
   ~/.codex, xong. Hai-home từng là nguồn của cả họ lỗi "đèn xanh mà 0 ảnh":
   đăng nhập nhầm home, doctor soi home này gen chạy home kia, dev toàn dùng
   img-home nên nhánh mặc định chỉ nổ trên máy người dùng.

   `KITGEN_CODEX_HOME` là CỬA THOÁT DUY NHẤT còn lại — cho máy dev có ~/.codex
   trỏ provider không trả ảnh về máy, và cho test trỏ fixture. Người dùng thường
   không bao giờ đặt biến này. */
export function resolveCodexHome() {
  const override = process.env.KITGEN_CODEX_HOME
  if (typeof override === "string" && override.trim() !== "") return expandHome(override.trim())
  return join(homedir(), ".codex")
}

/** Kiểm ĐÚNG home mà lượt gen sẽ dùng — cùng một phép giải `resolveCodexHome`. */
async function imageGenInfo(ws) {
  const home = resolveCodexHome()
  const out = {
    mode: "unknown",
    /** Chỉ còn một hồ sơ; field giữ nguyên cho bundle web cũ đang đứng chờ update. */
    profile: "default-home",
    available: false,
    // Nhãn RÚT GỌN (~/…) — không bao giờ là path tuyệt đối (arch §4.3-5).
    codexHomeLabel: shortenPath(home),
    authPresent: false,
    verifiedAt: new Date().toISOString(), reason: null, needsFallbackHome: false,
    /* Gắn TRƯỚC mọi lối thoát sớm bên dưới: máy chưa có codex thì càng cần nói ra
       "sẽ chạy bằng model nào", chứ không phải im lặng. */
    model: await genModelInfo(ws),
  }
  const codex = await firstLineVersion(CODEX)
  if (!codex.ok) { out.mode = "unavailable"; out.reason = "NO_CODEX"; return out }

  /* ĐĂNG NHẬP THẬT — hỏi chính codex, không đoán qua auth.json: credential có thể
     nằm trong keychain (codex user tự cài từ trước), khi đó auth.json không tồn tại
     mà đăng nhập vẫn là thật. Chỉ đọc MÃ THOÁT, không giữ output. Bug cũ: doctor
     tính `authPresent` xong… vứt đi, đèn vẫn xanh khi chưa đăng nhập. */
  const login = await run(CODEX, ["login", "status"], { timeout: 10000, env: { CODEX_HOME: home } })
  out.authPresent = login.ok

  /* CHỈ đếm số lần xuất hiện — không bao giờ giữ/log nội dung output.
     Codex ≥0.147: skill `imagegen`; bản cũ: tool `image_gen` — đếm cả hai dạng.
     CODEX_HOME đặt TƯỜNG MINH: để hở là probe trả lời theo env thừa kế của tiến
     trình agent (máy dev export CODEX_HOME) — đúng ca "dev xanh, user nổ". */
  const r = await run(CODEX, ["debug", "prompt-input"], { timeout: 20000, env: { CODEX_HOME: home } })
  const n = !r.ok && !r.stdout ? -1 : (r.stdout.match(/image_?gen/gi) ?? []).length

  if (n > 0 && out.authPresent) {
    out.mode = "default-home"
    out.available = true
    return out
  }
  out.mode = "unavailable"
  out.reason = n < 0 ? "UNKNOWN" : (!out.authPresent ? "NOT_LOGGED_IN" : "FEATURE_OFF")
  return out
}

/* ══ MODEL DÙNG ĐỂ TẠO ẢNH — HỎI ENGINE, KHÔNG CHÉP LẠI ═════════════════════════
 *
 * `engine/gen.mjs::readEnv` là nơi DUY NHẤT quyết định model/effort:
 *     genModel:         dashDefault(env.KITGEN_GEN_MODEL, "gpt-6-luna")
 *     genModelFallback: dashDefault(env.KITGEN_GEN_MODEL_FALLBACK, "gpt-5.6-luna")
 *     genEffort:        dashDefault(env.KITGEN_GEN_EFFORT, "medium")
 * Chép hai giá trị đó sang đây là tạo một bản sao thứ hai để lệch dần — đúng họ bug
 * mà `item-prompt.ts` đã phải dựng một test đọc engine từ đĩa để canh. Trước bước ④
 * doctor phải BÓC HAI DÒNG BASH của `gen.sh` bằng regex; nay engine là JS nên nó gọi
 * thẳng chính cái hàm mà lượt gen sẽ gọi. Không còn gì để lệch.
 *
 * `dashDefault` (tức `-` chứ không `:-` trong bash): đặt `KITGEN_GEN_MODEL=""` là CỐ Ý
 * TẮT (trả engine về model của hồ sơ), khác hẳn với không đặt gì — `readEnv` giữ đúng
 * phân biệt ấy, ở đây chỉ dịch nó sang `null`.
 */
async function genModelInfo(ws, { probe = true } = {}) {
  void ws
  const out = {
    requested: null, fallback: null, effort: null,
    known: null, fallbackKnown: null, effective: null, source: "unknown",
  }
  const cfg = readEnv(process.env)
  out.source = process.env.KITGEN_GEN_MODEL !== undefined ? "env" : "engine"
  out.requested = cfg.genModel === "" ? null : cfg.genModel
  out.fallback = cfg.genModelFallback && cfg.genModelFallback !== cfg.genModel ? cfg.genModelFallback : null
  out.effort = cfg.genEffort === "" ? null : cfg.genEffort
  if (out.requested === null || !probe) return out

  /* CỔNG CỦA ENGINE, chạy y nguyên: catalog TĨNH nằm sẵn trên máy (~0,03s, không gọi
     mạng). Nó chỉ chứng minh bản codex này BIẾT tên model — không chứng minh provider
     chịu phục vụ; engine còn một nhánh tự chữa nữa khi provider từ chối, và nhánh đó
     chỉ lộ ra trong log của lượt chạy. Vì vậy UI phải nói "sẽ yêu cầu", không nói
     "chắc chắn chạy bằng".
     CODEX_HOME đặt TƯỜNG MINH theo `resolveCodexHome` — cùng home mà gen dùng.
     Bug cũ (một-home-hai-hồ-sơ): cổng này soi home mặc định trong khi ảnh gen
     bằng hồ sơ riêng ⇒ MODEL_ARGS rỗng, gen âm thầm rơi về model của profile.

     `effective` = cái `pickModel` của engine SẼ gửi bằng `-m`: model chính nếu codex
     biết, không thì model dự phòng nếu codex biết, không thì null (= model của hồ sơ).
     Màn Cài đặt phải nói CÁI SẼ CHẠY — nói "gpt-6-luna" trên một máy codex 0.154 là
     nói dối, vì bản ấy chưa biết tên đó. */
  const r = await run(CODEX, ["debug", "models"], { timeout: 8000, env: { CODEX_HOME: resolveCodexHome() } })
  return r.ok || r.stdout ? applyModelCatalog(out, r.stdout) : out
}

/** Tra `requested`/`fallback` trong catalog (stdout `codex debug models`) và điền
 *  `known`/`fallbackKnown`/`effective` — y hệt thứ tự của `pickModel` trong engine.
 *  Tách riêng để test được mà không spawn codex (doctor LITE cấm spawn). */
export function applyModelCatalog(info, catalog) {
  const out = { ...info }
  if (!out.requested) return out
  const knows = m => catalog.includes(`"${m}"`)
  out.known = knows(out.requested)
  out.fallbackKnown = out.fallback ? knows(out.fallback) : null
  out.effective = out.known ? out.requested : (out.fallbackKnown ? out.fallback : null)
  return out
}

async function workspaceInfo(ws) {
  let freeBytes = null
  try { const s = await statfs(ws.root); freeBytes = Number(s.bavail) * Number(s.bsize) } catch { /* fs không hỗ trợ */ }
  return { label: ws.label, writable: await ws.writable(), freeBytes }
}

/** LITE = bỏ mọi spawn ra ngoài (dùng cho test tự động, không phụ thuộc máy có codex hay không). */
const LITE = process.env.KITGEN_DOCTOR_LITE === "1"

export async function doctor(ws, { refresh = false } = {}) {
  if (!refresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data
  if (LITE) {
    const data = {
      os: `${platform()}-${arch()}`, shell: "unknown", kernel: release(),
      node: { ok: true, version: process.versions.node },
      codex: { ok: false, version: null, binLabel: null, shellOk: null, shellDirLabel: null },
      imageGen: {
        mode: "unknown", profile: "default-home", available: false,
        codexHomeLabel: shortenPath(resolveCodexHome()),
        authPresent: false,
        verifiedAt: new Date().toISOString(), reason: "UNKNOWN", needsFallbackHome: true,
        /* LITE cấm spawn ⇒ không hỏi catalog được. Vẫn HỎI ĐƯỢC engine (chỉ là đọc
           biến môi trường) nên tên model là thật; `known` để null = "chưa kiểm". */
        model: await genModelInfo(ws, { probe: false }),
      },
      workspace: await workspaceInfo(ws), checkedAt: new Date().toISOString(), lite: true,
    }
    cache = { at: Date.now(), data }
    return data
  }
  const [node, codex, where, img, wsInfo] = await Promise.all([
    firstLineVersion(process.execPath),
    firstLineVersion(CODEX),
    codexWhere(),
    imageGenInfo(ws),
    workspaceInfo(ws),
  ])
  const data = {
    os: `${platform()}-${arch()}`, shell: (process.env.SHELL ?? "").split("/").pop() || "unknown",
    kernel: release(),
    /* NODE: không dò bằng cách spawn một `node --version` nữa — agent ĐANG CHẠY
       bằng chính nó, nên `process.versions.node` là câu trả lời chắc chắn đúng và
       rẻ hơn một tiến trình con. (`firstLineVersion(process.execPath)` vẫn được gọi
       ở trên cho ca hi hữu binary hỏng, nhưng nó không được quyền nói "không ok".) */
    node: { ok: true, version: node.version ?? process.versions.node },
    /* `ok` = AGENT chạy được. `shellOk` = TERMINAL CỦA KHÁCH gõ được. Hai câu khác
       nhau — xem `codexWhere`; gộp chúng lại chính là con bug đã tốn một chuyến
       lên máy khách. */
    codex: { ok: codex.ok, version: codex.version, ...where },
    imageGen: img,
    workspace: wsInfo,
    checkedAt: new Date().toISOString(),
  }
  cache = { at: Date.now(), data }
  return data
}

export function invalidateDoctorCache() { cache = { at: 0, data: null } }
