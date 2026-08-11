/* doctor.mjs — kiểm môi trường. HỢP ĐỒNG: CHỈ trả enum + boolean + version string.
   TUYỆT ĐỐI KHÔNG đọc/trả nội dung auth.json, config.toml, hay biến môi trường bí mật
   (architecture §4.4-4 + §6.3). Kiểm tra image_gen theo teams/t3-auth/PLAN.md:
   `codex debug prompt-input | grep -c image_gen` — chỉ ĐẾM, không in nội dung, không tốn quota. */
import { execFile } from "node:child_process"
import { homedir, platform, arch, release } from "node:os"
import { join } from "node:path"
import { statfs } from "node:fs/promises"
import { exists } from "./fsx.mjs"
import { shortenPath } from "./redact.mjs"

const CACHE_MS = 60_000
let cache = { at: 0, data: null }

function run(cmd, args, { timeout = 6000, env = {} } = {}) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout, env: { ...process.env, ...env }, maxBuffer: 4 << 20 },
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

async function pythonInfo() {
  const v = await firstLineVersion("python3")
  if (!v.ok) return { ok: false, version: null, venv: false, deps: {} }
  const probe = await run("python3", ["-c",
    "import importlib.util as u,json;print(json.dumps({m:(u.find_spec(m) is not None) for m in ['PIL','numpy','torch','transformers']}))"])
  let deps = {}
  try {
    const raw = JSON.parse(probe.stdout.trim() || "{}")
    deps = { pillow: !!raw.PIL, numpy: !!raw.numpy, torch: !!raw.torch, transformers: !!raw.transformers }
  } catch { deps = { pillow: false, numpy: false, torch: false, transformers: false } }
  const venvProbe = await run("python3", ["-c", "import sys;print('1' if sys.prefix!=sys.base_prefix else '0')"])
  return { ok: true, version: v.version, venv: venvProbe.stdout.trim() === "1", deps }
}

/** Kiểm đúng profile user đã chọn. Mặc định là Codex hiện tại; không tự chuyển sang
 * ~/.codex-img vì profile riêng chỉ thuộc về người chủ động bật nó. */
async function imageGenInfo(ws) {
  const cfg = await ws.config()
  const out = {
    mode: "unknown", available: false, codexHomeLabel: null, authPresent: false,
    verifiedAt: new Date().toISOString(), reason: null, needsFallbackHome: false,
  }
  const codex = await firstLineVersion("codex")
  if (!codex.ok) { out.mode = "unavailable"; out.reason = "NO_CODEX"; return out }

  const count = async env => {
    const r = await run("codex", ["debug", "prompt-input"], { timeout: 20000, env })
    if (!r.ok && !r.stdout) return -1
    // CHỈ đếm số lần xuất hiện — không bao giờ giữ/log nội dung output
    return (r.stdout.match(/image_gen/g) ?? []).length
  }

  const configured = cfg.imageGen?.mode === "img-home" && cfg.imageGen?.codexHome
  const imgHome = configured ? String(cfg.imageGen.codexHome).replace(/^~/, homedir()) : null
  const nDefault = await count(imgHome ? { CODEX_HOME: imgHome } : {})
  if (nDefault > 0) {
    out.mode = imgHome ? "img-home" : "default-home"
    out.available = true
    const home = imgHome ?? join(homedir(), ".codex")
    out.codexHomeLabel = shortenPath(home)
    out.authPresent = await exists(join(home, "auth.json"))
    return out
  }
  out.mode = "unavailable"
  out.codexHomeLabel = shortenPath(imgHome ?? join(homedir(), ".codex"))
  out.authPresent = await exists(join(imgHome ?? join(homedir(), ".codex"), "auth.json"))
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
    const data = {
      os: `${platform()}-${arch()}`, shell: "unknown", kernel: release(),
      node: { ok: true, version: process.versions.node },
      python: { ok: false, version: null, venv: false, deps: {} },
      playwright: { ok: false, fallback: "skeleton.py (PIL)" },
      codex: { ok: false, version: null },
      imageGen: {
        mode: "unknown", available: false, codexHomeLabel: null, authPresent: false,
        verifiedAt: new Date().toISOString(), reason: "UNKNOWN", needsFallbackHome: true,
      },
      workspace: await workspaceInfo(ws), checkedAt: new Date().toISOString(), lite: true,
    }
    cache = { at: Date.now(), data }
    return data
  }
  const [node, py, codex, pw, img, wsInfo] = await Promise.all([
    firstLineVersion(process.execPath),
    pythonInfo(),
    firstLineVersion("codex"),
    (async () => {
      const r = await run("node", ["-e", "try{require.resolve('playwright');console.log('1')}catch{console.log('0')}"])
      return { ok: r.stdout.trim() === "1", fallback: "skeleton.py (PIL)" }
    })(),
    imageGenInfo(ws),
    workspaceInfo(ws),
  ])
  const data = {
    os: `${platform()}-${arch()}`, shell: (process.env.SHELL ?? "").split("/").pop() || "unknown",
    kernel: release(),
    node: { ok: true, version: process.versions.node },
    python: py,
    playwright: pw,
    codex: { ok: codex.ok, version: codex.version },
    imageGen: img,
    workspace: wsInfo,
    checkedAt: new Date().toISOString(),
  }
  cache = { at: Date.now(), data }
  return data
}

export function invalidateDoctorCache() { cache = { at: 0, data: null } }
