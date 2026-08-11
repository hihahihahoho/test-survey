import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const MANIFEST_URL = process.env.KITGEN_RELEASE_MANIFEST || "https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json"

export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map(x => /^\d+$/.test(x) ? Number(x) : x)
  const pb = String(b).split(/[.-]/).map(x => /^\d+$/.test(x) ? Number(x) : x)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x === y) continue
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1
    return String(x).localeCompare(String(y), undefined, { numeric: true }) < 0 ? -1 : 1
  }
  return 0
}

export async function readRuntimeVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return (await readFile(resolve(here, "../../VERSION"), "utf8")).trim()
  } catch { return null }
}

export async function checkForUpdate({ currentVersion, fetchImpl = fetch } = {}) {
  const current = currentVersion || await readRuntimeVersion() || "0.0.0"
  const res = await fetchImpl(MANIFEST_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`release manifest returned HTTP ${res.status}`)
  const manifest = await res.json()
  if (!manifest || typeof manifest.version !== "string" || typeof manifest.archive !== "string") throw new Error("invalid release manifest")
  return { currentVersion: current, latestVersion: manifest.version, available: compareVersions(current, manifest.version) < 0, checkedAt: new Date().toISOString() }
}

/** Respond first, then let the service installer replace and restart this process. */
export function scheduleUpdate({ kitgenHome = process.env.KITGEN_HOME || join(process.env.HOME || "", ".kitgen") } = {}) {
  const cmd = join(kitgenHome, "bin", "kitgen")
  const child = spawn("sh", ["-c", "sleep 1; exec \"$1\" update", "kitgen-update", cmd], {
    detached: true, stdio: "ignore", env: process.env,
  })
  child.unref()
}
