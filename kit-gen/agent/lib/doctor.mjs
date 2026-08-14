/* doctor.mjs — kiểm môi trường. HỢP ĐỒNG: CHỈ trả enum + boolean + version string.
   TUYỆT ĐỐI KHÔNG đọc/trả nội dung auth.json, config.toml, hay biến môi trường bí mật
   (architecture §4.4-4 + §6.3). Kiểm tra image_gen theo teams/t3-auth/PLAN.md:
   `codex debug prompt-input | grep -cE "image_?gen"` — chỉ ĐẾM, không in nội dung, không tốn quota.
   Codex ≥0.147 đổi tên tool `image_gen` thành skill `imagegen` nên phải khớp cả hai dạng. */
import { execFile } from "node:child_process"
import { homedir, platform, arch, release } from "node:os"
import { join } from "node:path"
import { statfs } from "node:fs/promises"
import { exists } from "./fsx.mjs"
import { shortenPath } from "./redact.mjs"
import { pythonCommand, winShellOpts, winSpawnOpts } from "./platform.mjs"

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
function runPy(args, opts) { const c = pythonCommand(args); return run(c.cmd, c.args, opts) }

async function firstLineVersion(cmd, args = ["--version"]) {
  const r = await run(cmd, args, { timeout: 5000 })
  if (!r.ok && !r.stdout) return { ok: false, version: null }
  const line = (r.stdout || r.stderr).split("\n").find(l => /\d+\.\d+/.test(l)) ?? ""
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(line)
  return { ok: true, version: m ? m[1] : null }
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

/** Home mặc định của hồ sơ ảnh riêng khi config chỉ khai `mode` mà quên `codexHome`. */
export const IMG_HOME_DEFAULT = "~/.codex-img"

/** Hồ sơ ĐANG ĐƯỢC CHỌN trong `.kitgen/config.json` — thuần đọc enum, không đọc secret. */
export function configuredProfile(cfg) {
  return cfg?.imageGen?.mode === "img-home" ? "img-home" : "default-home"
}
function codexHomeOf(cfg) {
  const raw = cfg?.imageGen?.codexHome
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : IMG_HOME_DEFAULT
}
function expandHome(p) { return p.replace(/^~(?=$|\/)/, homedir()) }

/** Kiểm đúng profile user đã chọn. Mặc định là Codex hiện tại; không tự chuyển sang
 * ~/.codex-img vì profile riêng chỉ thuộc về người chủ động bật nó. */
async function imageGenInfo(ws) {
  const cfg = await ws.config()
  const profile = configuredProfile(cfg)
  const imgHome = profile === "img-home" ? expandHome(codexHomeOf(cfg)) : null
  const home = imgHome ?? join(homedir(), ".codex")
  const out = {
    mode: "unknown",
    /** Hồ sơ user ĐÃ CHỌN (persist ở `.kitgen/config.json`) — khác `mode` là KẾT QUẢ dò.
     *  Toggle trên UI phải bám `profile`, nếu bám `mode` thì hồ sơ chọn xong mà chưa
     *  đăng nhập sẽ tự nhảy về "mặc định" (mode = "unavailable"). */
    profile,
    available: false,
    // Nhãn RÚT GỌN (~/…) — không bao giờ là path tuyệt đối (arch §4.3-5).
    codexHomeLabel: shortenPath(home),
    authPresent: false,
    verifiedAt: new Date().toISOString(), reason: null, needsFallbackHome: false,
  }
  const codex = await firstLineVersion(CODEX)
  if (!codex.ok) { out.mode = "unavailable"; out.reason = "NO_CODEX"; return out }

  const count = async env => {
    const r = await run(CODEX, ["debug", "prompt-input"], { timeout: 20000, env })
    if (!r.ok && !r.stdout) return -1
    // CHỈ đếm số lần xuất hiện — không bao giờ giữ/log nội dung output
    // Codex ≥0.147: skill `imagegen`; bản cũ: tool `image_gen` — đếm cả hai dạng
    return (r.stdout.match(/image_?gen/gi) ?? []).length
  }

  const nDefault = await count(imgHome ? { CODEX_HOME: imgHome } : {})
  out.authPresent = await exists(join(home, "auth.json"))
  if (nDefault > 0) {
    out.mode = imgHome ? "img-home" : "default-home"
    out.available = true
    return out
  }
  out.mode = "unavailable"
  out.reason = nDefault < 0 ? "UNKNOWN" : (out.authPresent ? "FEATURE_OFF" : "NOT_LOGGED_IN")
  out.needsFallbackHome = false
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
    // LITE bỏ mọi spawn, nhưng hồ sơ ảnh là ĐỌC FILE config (không spawn) nên vẫn trả
    // đúng lựa chọn của user — toggle không được "quên" mình đã chọn gì khi chạy test.
    const liteCfg = await ws.config()
    const liteProfile = configuredProfile(liteCfg)
    const data = {
      os: `${platform()}-${arch()}`, shell: "unknown", kernel: release(),
      node: { ok: true, version: process.versions.node },
      python: { ok: false, version: null, venv: false, deps: {} },
      renderer: { ok: false, engine: "@resvg/resvg-wasm" },
      codex: { ok: false, version: null },
      imageGen: {
        mode: "unknown", profile: liteProfile, available: false,
        codexHomeLabel: shortenPath(expandHome(liteProfile === "img-home" ? codexHomeOf(liteCfg) : join(homedir(), ".codex"))),
        authPresent: false,
        verifiedAt: new Date().toISOString(), reason: "UNKNOWN", needsFallbackHome: true,
      },
      workspace: await workspaceInfo(ws), checkedAt: new Date().toISOString(), lite: true,
    }
    cache = { at: Date.now(), data }
    return data
  }
  const [node, py, codex, renderer, img, wsInfo] = await Promise.all([
    firstLineVersion(process.execPath),
    pythonInfo(),
    firstLineVersion(CODEX),
    (async () => {
      const r = await run("node", ["-e", "try{require.resolve('@resvg/resvg-wasm');console.log('1')}catch{console.log('0')}"])
      // KHÔNG còn khoá `fallback`: cố ý. Thiếu gói này là KHÔNG gen được, không phải
      // "chạy bản dự phòng" — báo sai chỗ này chính là lỗi mà BACKLOG #15 gỡ ra.
      return { ok: r.stdout.trim() === "1", engine: "@resvg/resvg-wasm" }
    })(),
    imageGenInfo(ws),
    workspaceInfo(ws),
  ])
  const data = {
    os: `${platform()}-${arch()}`, shell: (process.env.SHELL ?? "").split("/").pop() || "unknown",
    kernel: release(),
    node: { ok: true, version: process.versions.node },
    python: py,
    renderer,
    codex: { ok: codex.ok, version: codex.version },
    imageGen: img,
    workspace: wsInfo,
    checkedAt: new Date().toISOString(),
  }
  cache = { at: Date.now(), data }
  return data
}

export function invalidateDoctorCache() { cache = { at: 0, data: null } }
