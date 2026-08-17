/* suite-update-cure.mjs — hồi quy cho bệnh update lần 1/lần 2.
   Darwin/Linux giết installer thật sau activation; Git Bash dựng dead-state trên đĩa
   vì PID MSYS và PID Win32 không phải một hợp đồng có thể giả vờ kiểm bằng taskkill. */
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { chmod, mkdir, realpath, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { delimiter, dirname, join, relative } from "node:path"
import { describe, it, eq, ok } from "./harness.mjs"
import { findBash, toBashPath } from "../lib/platform.mjs"

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const IS_WIN = process.platform === "win32"

const CASE_167_BUDGET_MS = 20_000

function msysPath(path) {
  return IS_WIN ? toBashPath(path) : String(path)
}

function msysPathList(value, bashExe) {
  if (!IS_WIN) return String(value ?? "")
  const entries = String(value ?? "").split(delimiter).filter(Boolean)
  if (bashExe && /^[A-Za-z]:[\\/]/.test(bashExe)) {
    const gitRoot = dirname(dirname(bashExe))
    const gitDirs = [join(gitRoot, "usr", "bin"), join(gitRoot, "mingw64", "bin"), join(gitRoot, "bin")]
    entries.splice(entries.length ? 1 : 0, 0, ...gitDirs)
  }
  return entries.map(msysPath).join(":")
}

/* Node tạo fixture bằng đường dẫn Win32; Git Bash phải nhận toàn bộ path dạng
   MSYS. Không dùng shell quoting để đổi path: truyền từng arg/env trực tiếp. */
function bashEnv(env, bashExe) {
  if (!IS_WIN) return env
  const out = { ...env }
  for (const key of [
    "HOME", "KITGEN_HOME", "KITGEN_WORKSPACE", "KITGEN_UPDATE_LOCK", "KITGEN_UPDATE_TXN",
    "FAKE_LAUNCHCTL_STATE", "TMPDIR", "TEMP", "TMP",
  ]) {
    if (out[key]) out[key] = msysPath(out[key])
  }
  out.PATH = msysPathList(out.PATH, bashExe)
  out.MSYS = "winsymlinks:nativestrict"
  return out
}

function bashForTest() {
  return IS_WIN ? (findBash() || "bash") : "bash"
}

function installerArgs(script, args) {
  if (!IS_WIN) return [script, ...args]
  const out = [msysPath(script), ...args]
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1] === "--archive" || out[i - 1] === "--workspace") out[i] = msysPath(out[i])
  }
  return out
}

function spawnInstaller(script, args, env) {
  const bash = bashForTest()
  return spawn(bash, installerArgs(script, args), {
    env: bashEnv(env, bash),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    ...(IS_WIN ? { windowsHide: true } : {}),
  })
}

async function fixtureRealpath(path, env) {
  if (!IS_WIN) return realpath(path)
  const bash = bashForTest()
  const child = spawn(bash, ["-lc", 'CDPATH= cd -- "$1" && pwd -P', "kitgen-test-realpath", msysPath(path)], {
    env: bashEnv(env, bash),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  let output = ""
  let error = ""
  child.stdout.on("data", b => { output += b.toString() })
  child.stderr.on("data", b => { error += b.toString() })
  const result = await childClose(child, 3_000, "bash realpath")
  if (result.code !== 0) throw new Error(`bash realpath rc=${result.code}: ${error.trim()}`)
  return msysPath(output.trim())
}

async function symlinkDir(target, link) {
  await symlink(target, link, IS_WIN ? "dir" : undefined)
}

async function symlinkFile(target, link) {
  await symlink(target, link, IS_WIN ? "file" : undefined)
}

function redacted(text, paths = []) {
  let out = String(text ?? "")
  for (const p of paths.filter(Boolean)) {
    const variants = new Set([p, p.replaceAll("\\", "/"), p.replaceAll("/", "\\")])
    for (const v of variants) if (v) out = out.split(v).join("<fixture>")
  }
  return out.replace(/(?:[A-Za-z]:[\\/]|\/)(?:Users|home|private|tmp|var[\\/]folders)[^\s\r\n]*/g, "<path>")
}

async function tailFile(path, lines = 80, paths = []) {
  try {
    const text = await readFile(path, "utf8")
    const tail = text.replaceAll("\r\n", "\n").split("\n").slice(-lines).join("\n")
    return redacted(tail, paths) || "(rỗng)"
  } catch (e) {
    return `(không có: ${e?.code ?? e?.message ?? e})`
  }
}

async function childClose(child, timeoutMs, label) {
  if (!child) return { code: null, signal: null }
  let timer
  const closed = new Promise((resolve, reject) => {
    child.once("close", (code, signal) => resolve({ code, signal }))
    child.once("error", reject)
  })
  try {
    return await Promise.race([
      closed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} chưa đóng sau ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally { clearTimeout(timer) }
}

async function stopChild(child, mark, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true
  if (process.platform === "win32") {
    mark(`${label}: taskkill bắt đầu`, `child.pid=${child.pid}`)
    let killer
    try {
      killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      })
      let output = ""
      killer.stdout?.on("data", b => { output += b.toString() })
      killer.stderr?.on("data", b => { output += b.toString() })
      const result = await childClose(killer, 3_000, "taskkill")
      mark(`${label}: taskkill xong`, `rc=${result.code ?? "?"} ${redacted(output).trim().slice(-240)}`)
    } catch (e) {
      mark(`${label}: taskkill lỗi`, e?.message ?? e)
    }
    if (child.exitCode === null && child.signalCode === null) {
      mark(`${label}: fallback child.kill(SIGKILL)`)
      try { child.kill("SIGKILL") } catch { /* đã chết */ }
    }
  } else {
    mark(`${label}: SIGKILL thật`, `pid=${child.pid}`)
    try { child.kill("SIGKILL") } catch { /* đã chết */ }
  }
  try {
    const result = await childClose(child, 5_000, `${label}/child`)
    mark(`${label}: child đóng`, `rc=${result.code ?? "?"} signal=${result.signal ?? "-"}`)
    return true
  } catch (e) {
    mark(`${label}: child chưa đóng`, e?.message ?? e)
    child.stdout?.destroy()
    child.stderr?.destroy()
    return false
  }
}

async function filesUnder(root, dir = root) {
  const { readdir } = await import("node:fs/promises")
  const out = []
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) out.push(...await filesUnder(root, p))
    else out.push(p)
  }
  return out.sort()
}

async function makeRuntimeFixture(tmp, repoInstall) {
  const root = join(tmp, "fixture", "kitgen-runtime-2.1.25")
  await mkdir(join(root, "agent"), { recursive: true })
  await mkdir(join(root, "engine"), { recursive: true })
  await mkdir(join(root, "app"), { recursive: true })
  await mkdir(join(root, "runtime", "bin"), { recursive: true })
  await mkdir(join(root, "runtime", "service"), { recursive: true })
  await writeFile(join(root, "VERSION"), "2.1.25\n")
  await writeFile(join(root, "agent", "server.mjs"), "export {}\n")
  await writeFile(join(root, "engine", "gen.sh"), "#!/bin/sh\nexit 0\n")
  await writeFile(join(root, "app", "index.html"), "<!doctype html>\n")
  const sourceServiceDir = join(dirname(repoInstall), "runtime", "service")
  await writeFile(join(root, "runtime", "service", "com.kitgen.agent.plist.in"),
    await readFile(join(sourceServiceDir, "com.kitgen.agent.plist.in")))
  await writeFile(join(root, "runtime", "service", "kitgen-agent.service.in"),
    await readFile(join(sourceServiceDir, "kitgen-agent.service.in")))
  await writeFile(join(root, "install.sh"), await readFile(repoInstall))
  await writeFile(join(root, "runtime", "bin", "kitgen"), [
    "#!/bin/sh",
    "case \"${1:-help}\" in",
    "  start) sleep 5 ;;",
    "  status) printf '%s\\n' '{\"runtimeVersion\":\"2.1.24\"}' ;;",
    "  restart|run) exit 0 ;;",
    "esac",
  ].join("\n") + "\n")
  await chmod(join(root, "engine", "gen.sh"), 0o755)
  await chmod(join(root, "runtime", "bin", "kitgen"), 0o755)

  const manifest = []
  for (const p of await filesUnder(root)) {
    const rel = `./${relative(root, p)}`
    const hash = createHash("sha256").update(await readFile(p)).digest("hex")
    manifest.push(`${hash}  ${rel}`)
  }
  await writeFile(join(root, "manifest.sha256"), `${manifest.join("\n")}\n`)

  const archive = join(tmp, "kitgen-runtime-2.1.25.tar.gz")
  await new Promise((resolve, reject) => {
    const c = spawn("tar", ["-C", join(tmp, "fixture"), "-czf", archive, "kitgen-runtime-2.1.25"], { stdio: "ignore" })
    c.once("error", reject); c.once("close", code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)))
  })
  const sha = createHash("sha256").update(await readFile(archive)).digest("hex")
  return { root, archive, sha }
}

export async function run({ tmp, agentDir }) {
  describe("trị dứt điểm update lần 1/lần 2")

  await it("installer bị SIGKILL sau activation ⇒ lượt sau rollback journal, không giữ symlink nửa vời", async () => {
    const startedAt = Date.now()
    const milestones = []
    const mark = (label, detail = "") => {
      const m = { ms: Date.now() - startedAt, label, detail: String(detail) }
      milestones.push(m)
      process.stdout.write(`[167] mốc +${m.ms}ms — ${label}${detail ? ` — ${m.detail}` : ""}\n`)
    }
    const home = join(tmp, "update-kill-home")
    const workspace = join(tmp, "update-kill-workspace")
    const fakeBin = join(tmp, "update-kill-bin")
    const oldRelease = join(home, "releases", "2.1.24")
    const newRelease = join(home, "releases", "2.1.25")
    const launchState = join(tmp, "fake-launchctl-state")
    const pathsToRedact = [tmp, home, workspace, fakeBin]
    let firstChild = null
    let secondChild = null
    let firstOutput = ""
    let secondOutput = ""
    let diagnosticsPrinted = false
    const dumpDiagnostics = async reason => {
      if (diagnosticsPrinted) return
      diagnosticsPrinted = true
      process.stdout.write(`\n[167] TIMEOUT/HIỆN TRƯỜNG — ${reason}\n`)
      process.stdout.write("[167] toàn bộ mốc đã qua:\n")
      for (const m of milestones) {
        process.stdout.write(`  +${m.ms}ms — ${m.label}${m.detail ? ` — ${m.detail}` : ""}\n`)
      }
      process.stdout.write("[167] output installer (đuôi, đã redact):\n")
      process.stdout.write(`${redacted(firstOutput, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      process.stdout.write("[167] output lượt 2 (đuôi, đã redact):\n")
      process.stdout.write(`${redacted(secondOutput, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      process.stdout.write("[167] update.log fixture (đuôi, đã redact):\n")
      process.stdout.write(`${await tailFile(join(home, "update.log"), 80, pathsToRedact)}\n`)
      process.stdout.write("[167] install.log fixture (đuôi, đã redact):\n")
      process.stdout.write(`${await tailFile(join(home, "install.log"), 80, pathsToRedact)}\n`)
    }

    const observeOutput = (text, which) => {
      const clean = String(text)
      if (which === 1) firstOutput += clean
      else secondOutput += clean
      for (const m of clean.matchAll(/\[(\d+\/\d+)\]\s+([^\r\n]+)/g)) {
        const stage = `${m[1]} ${m[2].trim()}`
        if (!milestones.some(x => x.label === `installer ${stage}`)) mark(`installer ${stage}`)
      }
    }

    const scenario = async () => {
      mark("fixture bắt đầu")
      await mkdir(join(oldRelease, "agent"), { recursive: true })
      await mkdir(join(newRelease, "agent"), { recursive: true })
      await writeFile(join(oldRelease, "VERSION"), "2.1.24\n")
      await writeFile(join(newRelease, "VERSION"), "2.1.25\n")
      await mkdir(fakeBin, { recursive: true })
      await writeFile(join(fakeBin, "codex"), "#!/bin/sh\necho codex-test\n")
      await writeFile(join(fakeBin, "launchctl"), [
        "#!/bin/sh",
        "case \"${1:-}\" in",
        "  print) exit 1 ;;",
        "  bootout|unload|bootstrap|kickstart) exit 0 ;;",
        "  *) exit 0 ;;",
        "esac",
      ].join("\n") + "\n")
      await writeFile(join(fakeBin, "systemctl"), "#!/bin/sh\nexit 0\n")
      await chmod(join(fakeBin, "codex"), 0o755)
      await chmod(join(fakeBin, "launchctl"), 0o755)
      await chmod(join(fakeBin, "systemctl"), 0o755)
      const txn = join(home, ".update-transaction")
      await mkdir(txn, { recursive: true })
      await symlinkDir(oldRelease, join(home, "current"))

      const { archive, sha } = await makeRuntimeFixture(tmp, join(agentDir, "..", "install.sh"))
      mark("fixture xong", `archive=${redacted(archive, pathsToRedact)}`)
      const nodeBin = join(home, "tools", "node", "bin")
      const moduleDir = join(home, "tools", "node_modules", "@resvg", "resvg-wasm")
      const venvBin = join(workspace, ".venv", "bin")
      await mkdir(nodeBin, { recursive: true })
      await mkdir(moduleDir, { recursive: true })
      await mkdir(venvBin, { recursive: true })
      await symlinkFile(process.execPath, join(nodeBin, "node"))
      await writeFile(join(moduleDir, "package.json"), '{"name":"@resvg/resvg-wasm","main":"index.js"}\n')
      await writeFile(join(moduleDir, "index.js"), "module.exports = {}\n")
      await writeFile(join(venvBin, "python"), "#!/bin/sh\nexit 0\n")
      await chmod(join(venvBin, "python"), 0o755)

      const env = {
        ...process.env,
        HOME: join(tmp, "fake-home"),
        PATH: [fakeBin, process.env.PATH].filter(Boolean).join(delimiter),
        KITGEN_HOME: home,
        KITGEN_WORKSPACE: workspace,
        KITGEN_UPDATE_LOCK: join(home, ".update-lock"),
        KITGEN_UPDATE_TXN: txn,
        FAKE_LAUNCHCTL_STATE: launchState,
      }
      if (IS_WIN) {
        /* Git Bash có hai PID (MSYS và Win32); taskkill chỉ nhận PID Win32. Không
           giả vờ rằng ca này chứng minh được SIGKILL thật. Dựng đúng hiện trường
           sau activation trên đĩa, rồi kiểm recovery bằng installer thật. */
        mark("Git Bash: bỏ qua kill thật", "MSYS/Win32 PID semantics không mô phỏng an toàn")
        await rm(join(home, "current"), { force: true })
        await symlinkDir(newRelease, join(home, "current"))
        await writeFile(join(txn, "previous"), `${toBashPath(oldRelease)}\n`)
        await writeFile(join(txn, "dest"), `${toBashPath(newRelease)}\n`)
        await writeFile(join(txn, "state"), "activated\n")
        mark("dead-state dựng xong", "journal=activated, current=newRelease")
      } else {
        firstChild = spawnInstaller(join(agentDir, "..", "install.sh"),
          ["--archive", archive, "--sha256", sha, "--workspace", workspace], env)
        mark("installer spawn", `pid=${firstChild.pid}`)
        firstChild.stdout.on("data", b => observeOutput(b.toString(), 1))
        firstChild.stderr.on("data", b => observeOutput(b.toString(), 1))
        let seenState = ""
        const deadline = Date.now() + 8_000
        for (;;) {
          let state = ""
          try { state = (await readFile(join(txn, "state"), "utf8")).trim() } catch { /* chưa tới journal */ }
          if (state && state !== seenState) {
            seenState = state
            mark(`journal ${state}`)
          }
          if (state === "activated") break
          if (Date.now() >= deadline) throw new Error("installer không ghi journal activated trong 8000ms")
          await delay(20)
        }
        ok(seenState === "activated", `installer phải ghi journal activated trước khi kill: ${redacted(firstOutput, pathsToRedact).slice(-1000)}`)
        ok(await stopChild(firstChild, mark, "lượt 1"), "installer lượt 1 phải đóng sau SIGKILL")
        eq(await fixtureRealpath(join(home, "current"), env), await fixtureRealpath(newRelease, env),
          "SIGKILL để lại đúng hiện trường symlink mới + journal")
        mark("hiện trường sau SIGKILL đúng", "current=newRelease")
      }

      const missing = join(tmp, "missing-runtime.tar.gz")
      secondChild = spawnInstaller(join(agentDir, "..", "install.sh"),
        ["--archive", missing, "--workspace", workspace], env)
      mark("lượt 2 spawn", `pid=${secondChild.pid}`)
      secondChild.stdout.on("data", b => observeOutput(b.toString(), 2))
      secondChild.stderr.on("data", b => observeOutput(b.toString(), 2))
      try {
        const result = await childClose(secondChild, 8_000, "lượt 2 installer")
        mark("lượt 2 đóng", `rc=${result.code ?? "?"} signal=${result.signal ?? "-"}`)
      } catch (e) {
        await stopChild(secondChild, mark, "lượt 2")
        throw e
      }
      eq(await fixtureRealpath(join(home, "current"), env), await fixtureRealpath(oldRelease, env),
        "lượt sau thu hồi symlink mới chưa phục vụ")
      mark("rollback symlink xong", "current=oldRelease")
      let journalLeft = true
      try { await readFile(join(txn, "state")); } catch { journalLeft = false }
      ok(!journalLeft, "journal đã được thu hồi sau rollback")
      mark("journal đã xóa", "rollback hoàn tất")
    }

    let timer
    try {
      await Promise.race([
        scenario(),
        new Promise((_, reject) => {
          timer = setTimeout(async () => {
            await dumpDiagnostics(`vượt ngân sách nội bộ ${CASE_167_BUDGET_MS}ms`)
            reject(new Error(`ca 167 vượt ngân sách nội bộ ${CASE_167_BUDGET_MS}ms`))
          }, CASE_167_BUDGET_MS)
        }),
      ])
    } catch (e) {
      await dumpDiagnostics(e?.message ?? e)
      throw e
    } finally {
      clearTimeout(timer)
      if (firstChild && firstChild.exitCode === null && firstChild.signalCode === null) await stopChild(firstChild, mark, "dọn lượt 1")
      if (secondChild && secondChild.exitCode === null && secondChild.signalCode === null) await stopChild(secondChild, mark, "dọn lượt 2")
    }
  })
}
