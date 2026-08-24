/* doctor.mjs — kiểm môi trường. HỢP ĐỒNG: CHỈ trả enum + boolean + version string.
   TUYỆT ĐỐI KHÔNG đọc/trả nội dung auth.json, config.toml, hay biến môi trường bí mật
   (architecture §4.4-4 + §6.3). Kiểm tra image_gen theo teams/t3-auth/PLAN.md:
   `codex debug prompt-input | grep -cE "image_?gen"` — chỉ ĐẾM, không in nội dung, không tốn quota.
   Codex ≥0.147 đổi tên tool `image_gen` thành skill `imagegen` nên phải khớp cả hai dạng. */
import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import { homedir, platform, arch, release } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { statfs, readFile } from "node:fs/promises"
import { resolveEngine } from "./engine.mjs"
import { shortenPath } from "./redact.mjs"
import { pythonCommand, winShellOpts, winSpawnOpts, pythonEnv } from "./platform.mjs"

/* ── Trình render khung xương: @resvg/resvg-wasm ──────────────────────────────
   PHẢI hỏi ĐÚNG CÂU mà render-skeleton.mjs hỏi. Bản trước hỏi câu khác:

     node -e "require.resolve('@resvg/resvg-wasm')"

   `require.resolve` trần neo theo THƯ MỤC LÀM VIỆC của tiến trình agent, mà gói
   này KHÔNG bao giờ nằm ở đó — installer cài vào prefix riêng
   (`npm install --prefix "$KITGEN_HOME/tools"`, install.sh:769). Bản cài chính
   quy sống sót chỉ nhờ launcher có đặt sẵn NODE_PATH (install.sh:830); mọi cách
   khởi động KHÔNG qua launcher (dev chạy `node agent/server.mjs`, hoặc launcher
   bị sửa) đều bị báo **"Thiếu — KHÔNG gen được ảnh"** trong khi gói vẫn nằm yên ở
   `~/.kitgen/tools` và gen THẬT SỰ chạy được. Báo thiếu oan ⇒ khách đi cài lại.

   Nên ở đây dò ĐÚNG danh sách neo của render-skeleton.mjs::resvgAnchors, và làm
   trong tiến trình (createRequire) thay vì spawn: nhanh hơn, và vẫn tôn trọng
   NODE_PATH vì Node gắn Module.globalPaths vào mọi require không tương đối.
   suite-system có ca kiểm ĐỌC render-skeleton.mjs để chặn hai danh sách lệch nhau. */
export function resvgAnchorDirs() {
  const home = process.env.KITGEN_HOME
    || (platform() === "win32"
      ? join(process.env.LOCALAPPDATA || process.env.USERPROFILE || "", "KitGen")
      : join(homedir(), ".kitgen"))
  return [
    process.env.KITGEN_RESVG_DIR,      // thư mục CHỨA node_modules, không phải gói
    join(home, "tools"),
    join(homedir(), ".kitgen", "tools"),
    REPO_DIR,                          // dev: node_modules cạnh repo (≈ HERE của engine)
  ].filter(Boolean)
}

function rendererInfo() {
  // KHÔNG còn khoá `fallback`: cố ý. Thiếu gói này là KHÔNG gen được, không phải
  // "chạy bản dự phòng" — báo sai chỗ này chính là lỗi mà BACKLOG #15 gỡ ra.
  for (const dir of resvgAnchorDirs()) {
    try {
      const req = createRequire(join(dir, "package.json"))
      req.resolve("@resvg/resvg-wasm")
      // render-skeleton.mjs còn ĐỌC file .wasm; gói cài dở phải tính là thiếu.
      req.resolve("@resvg/resvg-wasm/index_bg.wasm")
      return { ok: true, engine: "@resvg/resvg-wasm" }
    } catch { /* thử neo kế tiếp */ }
  }
  return { ok: false, engine: "@resvg/resvg-wasm" }
}

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
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

/** python3 trên Unix; python.exe của venv (KITGEN_PYTHON) trên Windows. */
function runPy(args, opts) { const c = pythonCommand(args); return run(c.cmd, c.args, { ...opts, env: { ...(opts?.env ?? {}), ...pythonEnv() } }) }

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

async function pythonInfo() {
  const v = await firstLineVersion(pythonCommand().cmd)
  if (!v.ok) return { ok: false, version: null, venv: false, deps: {} }
  const probe = await runPy(["-c",
    "import importlib.util as u,json;print(json.dumps({m:(u.find_spec(m) is not None) for m in ['PIL','numpy','torch','transformers']}))"])
  let deps = {}
  try {
    const raw = JSON.parse(probe.stdout.trim() || "{}")
    deps = { pillow: !!raw.PIL, numpy: !!raw.numpy, torch: !!raw.torch, transformers: !!raw.transformers }
  } catch { deps = { pillow: false, numpy: false, torch: false, transformers: false } }
  const venvProbe = await runPy(["-c", "import sys;print('1' if sys.prefix!=sys.base_prefix else '0')"])
  return { ok: true, version: v.version, venv: venvProbe.stdout.trim() === "1", deps }
}

function expandHome(p) { return p.replace(/^~(?=$|\/)/, homedir()) }

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

/* ══ MODEL DÙNG ĐỂ TẠO ẢNH — ĐỌC RA TỪ ENGINE, KHÔNG CHÉP LẠI ═══════════════════
 *
 * `gen.sh` mới là nơi quyết định model/effort:
 *     GEN_MODEL="${KITGEN_GEN_MODEL-gpt-5.6-luna}"
 *     GEN_EFFORT="${KITGEN_GEN_EFFORT-medium}"
 * Chép hai giá trị đó sang JS là tạo ra một bản sao thứ hai để lệch dần — đúng họ bug
 * mà `item-prompt.ts` đã phải dựng một test đọc gen.sh từ đĩa để canh. Nên ở đây ĐỌC
 * THẲNG file engine đang thật sự được chạy: sửa gen.sh là màn Cài đặt đổi theo, không
 * ai phải nhớ sửa hai chỗ.
 *
 * Đọc gen.sh KHÔNG vi phạm hợp đồng §4.4-4: nó là script của chính sản phẩm, không
 * phải `auth.json` / `config.toml`. Thứ trả ra vẫn chỉ là tên model + một enum effort.
 *
 * `-` chứ không `:-` trong bash: đặt `KITGEN_GEN_MODEL=""` là CỐ Ý TẮT (trả engine về
 * model của hồ sơ), khác hẳn với không đặt gì. JS phải phân biệt đúng như vậy, nên
 * dùng `!== undefined` chứ không dùng `||`.
 */
const MODEL_LINE = /^GEN_MODEL="\$\{KITGEN_GEN_MODEL-([^}"]*)\}"/m
const EFFORT_LINE = /^GEN_EFFORT="\$\{KITGEN_GEN_EFFORT-([^}"]*)\}"/m

/** Giá trị hiệu lực của một biến: env của agent (gen.sh là tiến trình con) hoặc mặc định của engine. */
function envOr(name, fallback) {
  const raw = process.env[name]
  return raw !== undefined ? raw : fallback
}

async function genModelInfo(ws, { probe = true } = {}) {
  const out = { requested: null, effort: null, known: null, source: "unknown" }
  let text = null
  try {
    const dir = await resolveEngine(ws)
    if (dir) text = await readFile(join(dir, "gen.sh"), "utf8")
  } catch { /* không đọc được engine ⇒ nói "chưa rõ", không đoán bừa */ }
  if (text === null) return out

  const defModel = text.match(MODEL_LINE)?.[1] ?? null
  const defEffort = text.match(EFFORT_LINE)?.[1] ?? null
  if (defModel === null) return out

  const model = envOr("KITGEN_GEN_MODEL", defModel)
  const effort = envOr("KITGEN_GEN_EFFORT", defEffort ?? "")
  out.source = process.env.KITGEN_GEN_MODEL !== undefined ? "env" : "engine"
  out.requested = model === "" ? null : model
  out.effort = effort === "" ? null : effort
  if (out.requested === null || !probe) return out

  /* CỔNG CỦA gen.sh, chạy y nguyên: catalog TĨNH nằm sẵn trên máy (~0,03s, không gọi
     mạng). Nó chỉ chứng minh bản codex này BIẾT tên model — không chứng minh provider
     chịu phục vụ; gen.sh còn một nhánh tự chữa nữa khi provider từ chối, và nhánh đó
     chỉ lộ ra trong log của lượt chạy. Vì vậy UI phải nói "sẽ yêu cầu", không nói
     "chắc chắn chạy bằng".
     CODEX_HOME đặt TƯỜNG MINH theo `resolveCodexHome` — cùng home mà gen dùng.
     Bug cũ (một-home-hai-hồ-sơ): cổng này soi home mặc định trong khi ảnh gen
     bằng hồ sơ riêng ⇒ MODEL_ARGS rỗng, gen âm thầm rơi về model của profile. */
  const r = await run(CODEX, ["debug", "models"], { timeout: 8000, env: { CODEX_HOME: resolveCodexHome() } })
  out.known = r.ok || r.stdout ? r.stdout.includes(`"${out.requested}"`) : null
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
      python: { ok: false, version: null, venv: false, deps: {} },
      renderer: { ok: false, engine: "@resvg/resvg-wasm" },
      codex: { ok: false, version: null, binLabel: null, shellOk: null, shellDirLabel: null },
      imageGen: {
        mode: "unknown", profile: "default-home", available: false,
        codexHomeLabel: shortenPath(resolveCodexHome()),
        authPresent: false,
        verifiedAt: new Date().toISOString(), reason: "UNKNOWN", needsFallbackHome: true,
        /* LITE cấm spawn ⇒ không hỏi catalog được. Vẫn ĐỌC được gen.sh (thuần I/O file)
           nên tên model là thật; `known` để null đúng nghĩa "chưa kiểm". */
        model: await genModelInfo(ws, { probe: false }),
      },
      workspace: await workspaceInfo(ws), checkedAt: new Date().toISOString(), lite: true,
    }
    cache = { at: Date.now(), data }
    return data
  }
  const [node, py, codex, where, renderer, img, wsInfo] = await Promise.all([
    firstLineVersion(process.execPath),
    pythonInfo(),
    firstLineVersion(CODEX),
    codexWhere(),
    rendererInfo(),
    imageGenInfo(ws),
    workspaceInfo(ws),
  ])
  const data = {
    os: `${platform()}-${arch()}`, shell: (process.env.SHELL ?? "").split("/").pop() || "unknown",
    kernel: release(),
    node: { ok: true, version: process.versions.node },
    python: py,
    renderer,
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
