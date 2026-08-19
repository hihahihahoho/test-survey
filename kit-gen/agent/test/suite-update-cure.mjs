/* suite-update-cure.mjs — hồi quy cho bệnh update lần 1/lần 2.
   Darwin/Linux giết installer thật sau activation; Git Bash dựng dead-state trên đĩa
   vì PID MSYS và PID Win32 không phải một hợp đồng có thể giả vờ kiểm bằng taskkill. */
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { chmod, mkdir, realpath, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { delimiter, dirname, join, relative } from "node:path"
import { describe, it, eq, includes, ok } from "./harness.mjs"
import { bashEnv, findBash, toBashPath } from "../lib/platform.mjs"

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const IS_WIN = process.platform === "win32"

const CASE_167_BUDGET_MS = 20_000
const BASH_REALPATH_TIMEOUT_MS = 10_000

function msysPath(path) {
  return IS_WIN ? toBashPath(path) : String(path)
}

/* Python riêng của KitGen (GIẢ) + venv trỏ vào nó.

   Từ bản "mang theo Python riêng", installer không dùng bừa `python3` của máy nữa: nó
   chỉ chấp nhận phiên bản nằm trong dải chắc chắn có wheel (3.11-3.13) và tự TẢI bản
   pin cứng nếu không có. Runner macOS mặc định là 3.9 ⇒ nếu không dựng sẵn bản riêng
   ở đây thì test này sẽ ra mạng thật tải 24 MB (và hỏng khi không có mạng).

   `sys.base_prefix` của venv phải khớp bản riêng, nếu không installer coi venv là đồ
   thừa của một Python khác, dựng lại rồi chạy pip thật. */
async function writeFakePython(home, workspace) {
  const pyBin = join(home, "tools", "python", "bin")
  const venvBin = join(workspace, ".venv", "bin")
  const base = join(home, "tools", "python")
  await mkdir(pyBin, { recursive: true })
  await mkdir(venvBin, { recursive: true })
  const answers = [
    "#!/bin/sh",
    "case \"$*\" in",
    "  *'sys.version_info[:3]'*) printf '3.13.15\\n' ;;",
    "  *'sys.version_info[:2]'*) printf '3.13\\n' ;;",
    `  *sys.base_prefix*) printf '%s\\n' '${base}' ;;`,
    "  *) exit 0 ;;",
    "esac",
  ].join("\n") + "\n"
  await writeFile(join(pyBin, "python3"), answers)
  await chmod(join(pyBin, "python3"), 0o755)
  await writeFile(join(venvBin, "python"), answers)
  await chmod(join(venvBin, "python"), 0o755)
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
  const result = await childClose(child, BASH_REALPATH_TIMEOUT_MS, "bash realpath")
  if (result.code !== 0) throw new Error(`bash realpath rc=${result.code}: ${error.trim()}`)
  return msysPath(output.trim())
}

function fromBashPath(path) {
  const value = String(path ?? "")
  if (!IS_WIN) return value
  const drive = /^\/([A-Za-z])\/(.*)$/.exec(value)
  return drive ? `${drive[1].toUpperCase()}:\\${drive[2].replaceAll("/", "\\")}` : value
}

function comparablePath(path) {
  const value = String(path ?? "").trim()
  if (!value) return ""
  return toBashPath(value).replace(/[\\/]+$/, "").toLowerCase()
}

function stagedSpawnPath(spawned) {
  if (!IS_WIN) return spawned?.args?.[4]
  const args = Array.isArray(spawned?.args) ? spawned.args : []
  const direct = args
    .map(value => String(value ?? "").trim().replace(/^"|"$/g, ""))
    .find(path => /[\\/]install\.(?:sh|ps1)$/i.test(path))
  if (direct) return direct
  const command = String(args[3] ?? "")
  return [...command.matchAll(/"([^"]+)"/g)]
    .map(match => match[1])
    .find(path => /[\\/]install\.(?:sh|ps1)$/i.test(path))
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

async function makeRuntimeFixture(tmp, repoInstall, { version = "2.1.25", installerSuffix = "" } = {}) {
  const root = join(tmp, "fixture", `kitgen-runtime-${version}`)
  await mkdir(join(root, "agent"), { recursive: true })
  await mkdir(join(root, "engine"), { recursive: true })
  await mkdir(join(root, "app"), { recursive: true })
  await mkdir(join(root, "runtime", "bin"), { recursive: true })
  await mkdir(join(root, "runtime", "service"), { recursive: true })
  await writeFile(join(root, "VERSION"), `${version}\n`)
  await writeFile(join(root, "agent", "server.mjs"), "export {}\n")
  await writeFile(join(root, "engine", "gen.sh"), "#!/bin/sh\nexit 0\n")
  await writeFile(join(root, "app", "index.html"), "<!doctype html>\n")
  const sourceServiceDir = join(dirname(repoInstall), "runtime", "service")
  await writeFile(join(root, "runtime", "service", "com.kitgen.agent.plist.in"),
    await readFile(join(sourceServiceDir, "com.kitgen.agent.plist.in")))
  await writeFile(join(root, "runtime", "service", "kitgen-agent.service.in"),
    await readFile(join(sourceServiceDir, "kitgen-agent.service.in")))
  await writeFile(join(root, "install.sh"), `${await readFile(repoInstall)}${installerSuffix}`)
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

  const archive = join(tmp, `kitgen-runtime-${version}.tar.gz`)
  await new Promise((resolve, reject) => {
    const c = spawn("tar", ["-C", join(tmp, "fixture"), "-czf", archive, `kitgen-runtime-${version}`], { stdio: "ignore" })
    c.once("error", reject); c.once("close", code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)))
  })
  const sha = createHash("sha256").update(await readFile(archive)).digest("hex")
  return { root, archive, sha }
}

async function makeSelfClobberFixture(tmp, name) {
  const root = join(tmp, name)
  await mkdir(root, { recursive: true })
  const filler = Array.from({ length: 120 }, (_, i) =>
    `# offset filler ${String(i).padStart(3, "0")} ${"x".repeat(24)}`).join("\n")
  const prefix = [
    "#!/usr/bin/env bash",
    "PS4='+ self-clobber: '",
    "set -eux",
    "home=\"${KITGEN_HOME:?}\"",
    `printf 'started\\n' >> \"$home/trace\"`,
    filler,
    `cp \"$home/new-install.sh\" \"$home/install.sh\"`,
  ].join("\n") + "\n"
  const oldScript = prefix + `printf 'finished\\n' >> \"$home/trace\"\n`
  const newScript = prefix + "inheriting\n" +
    Array.from({ length: 140 }, (_, i) => `# newer release line ${i}`).join("\n") +
    "\nprintf 'finished\\n' >> \"$home/trace\"\n"
  await writeFile(join(root, "install.sh"), oldScript)
  await writeFile(join(root, "new-install.sh"), newScript)
  await writeFile(join(root, "trace"), "")
  await chmod(join(root, "install.sh"), 0o700)
  await chmod(join(root, "new-install.sh"), 0o700)
  return { root, oldScript, newScript }
}

async function runFixtureScript(script, env, args = []) {
  const child = spawnInstaller(script, args, env)
  let stdout = "", stderr = ""
  child.stdout.on("data", b => { stdout += b.toString() })
  child.stderr.on("data", b => { stderr += b.toString() })
  const result = await childClose(child, 8_000, "fixture installer")
  return { ...result, stdout, stderr }
}

export async function run({ tmp, agentDir }) {
  describe("trị dứt điểm update lần 1/lần 2")

  await it("installer cũ tự clobber ⇒ chạy thẳng có thể rc=127, scheduler chạy bản tạm thì trọn lượt", async () => {
    const startedAt = Date.now()
    const milestones = []
    const mark = (label, detail = "") => {
      const m = { ms: Date.now() - startedAt, label, detail: String(detail) }
      milestones.push(m)
      process.stdout.write(`[167] mốc +${m.ms}ms — ${label}${detail ? ` — ${m.detail}` : ""}\n`)
    }
    const pathsToRedact = [tmp]
    let directOutput = "", directError = ""
    let stagedOutput = "", stagedError = ""
    let stagedFixture = null
    let directChild = null
    let spawned = null
    let child = null
    let diagnosticsPrinted = false
    const updateLog = () => stagedFixture && join(stagedFixture.root, "update.log")
    const dumpDiagnostics = async reason => {
      if (diagnosticsPrinted) return
      diagnosticsPrinted = true
      process.stdout.write(`\n[167] TIMEOUT/HIỆN TRƯỜNG — ${reason}\n`)
      process.stdout.write("[167] toàn bộ mốc đã qua:\n")
      for (const m of milestones) {
        process.stdout.write(`  +${m.ms}ms — ${m.label}${m.detail ? ` — ${m.detail}` : ""}\n`)
      }
      process.stdout.write("[167] output direct stdout (đuôi, đã redact):\n")
      process.stdout.write(`${redacted(directOutput, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      process.stdout.write("[167] output direct stderr (đuôi, đã redact):\n")
      process.stdout.write(`${redacted(directError, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      /* scheduleUpdate cố ý nối stdout + stderr vào CÙNG fd update.log. Ghi cả hai
         nhãn, dù cùng một đuôi, để ca không còn một "stdout/stderr rỗng" mơ hồ. */
      process.stdout.write("[167] output scheduler stdout (cùng fd update.log, đuôi):\n")
      process.stdout.write(`${redacted(stagedOutput, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      process.stdout.write("[167] output scheduler stderr (cùng fd update.log, đuôi):\n")
      process.stdout.write(`${redacted(stagedError, pathsToRedact).slice(-4000) || "(rỗng)"}\n`)
      process.stdout.write("[167] update.log fixture (đuôi, đã redact):\n")
      process.stdout.write(`${await tailFile(updateLog(), 80, pathsToRedact)}\n`)
      process.stdout.write("[167] install.log fixture (đuôi, đã redact):\n")
      process.stdout.write(`${await tailFile(stagedFixture && join(stagedFixture.root, "install.log"), 80, pathsToRedact)}\n`)
      process.stdout.write("[167] trace fixture (đuôi, đã redact):\n")
      process.stdout.write(`${await tailFile(stagedFixture && join(stagedFixture.root, "trace"), 80, pathsToRedact)}\n`)
      process.stdout.write("[167] lock owner fixture:\n")
      process.stdout.write(`${await tailFile(stagedFixture && join(stagedFixture.root, ".update-lock", "owner"), 4, pathsToRedact)}\n`)
    }

    const scenario = async () => {
      mark("ca bắt đầu")
      mark("dựng fixture self-clobber trực tiếp")
      const directFixture = await makeSelfClobberFixture(tmp, "self-clobber-direct")
      const directEnv = {
        ...process.env,
        KITGEN_HOME: directFixture.root,
        PATH: process.env.PATH,
      }
      mark("direct fixture xong", `root=${redacted(directFixture.root, pathsToRedact)}`)
      directChild = spawnInstaller(join(directFixture.root, "install.sh"), [], directEnv)
      mark("direct installer spawn", `pid=${directChild.pid}`)
      directChild.stdout.on("data", b => { directOutput += b.toString() })
      directChild.stderr.on("data", b => { directError += b.toString() })
      const direct = await childClose(directChild, 8_000, "direct fixture installer")
      mark("direct installer đóng", `rc=${direct.code ?? "?"} signal=${direct.signal ?? "-"}`)
      /* Bash đọc lazy nên trên Darwin/Linux fixture này tái hiện đúng vùng offset:
         bản mới dài hơn chèn lệnh tiếng Anh `inheriting` ngay sau cp tự-đè. Một số
         shell đọc trước nhiều byte hơn; khi đó vẫn giữ ca cứu hộ phía dưới làm oracle. */
      if (direct.code === 127) {
        includes(directError, "inheriting: command not found", "hiện trường self-clobber")
      } else {
        ok(direct.code !== 0, `fixture cũ không được âm thầm thành công: rc=${direct.code}`)
      }

      mark("dựng fixture self-clobber scheduler")
      stagedFixture = await makeSelfClobberFixture(tmp, "self-clobber-staged")
      mark("scheduler fixture xong", `root=${redacted(stagedFixture.root, pathsToRedact)}`)
      const { scheduleUpdate, resetUpdateInstallLock } = await import("../lib/update.mjs")
      const scheduled = scheduleUpdate({
        kitgenHome: stagedFixture.root,
        spawnImpl: (cmd, args, opts) => {
          spawned = { cmd, args, opts }
          mark("scheduler spawn", `cmd=${cmd} args=${JSON.stringify(args)}`)
          mark("scheduler env/cwd", `cwd=${opts.cwd ?? "(inherit)"} KITGEN_HOME=${opts.env?.KITGEN_HOME ?? "(unset)"} TMPDIR=${opts.env?.TMPDIR ?? "(unset)"} PATH=${String(opts.env?.PATH ?? "").slice(0, 240)}`)
          child = spawn(cmd, args, opts)
          return child
        },
      })
      mark("scheduler trả lời", `status=${scheduled.status}`)
      eq(scheduled.status, "started", "scheduler nhận lượt update")
      ok(spawned, "scheduler phải spawn installer")
      const stagedPath = stagedSpawnPath(spawned)
      const stagedNodePath = fromBashPath(stagedPath)
      mark("snapshot path nhận được", `bash=${stagedPath} node=${stagedNodePath}`)
      ok(stagedPath && comparablePath(stagedPath) !== comparablePath(join(stagedFixture.root, "install.sh")),
        "spawn dùng đường dẫn tạm, không dùng install.sh gốc")
      const [sourceStat, stagedStat] = await Promise.all([
        stat(join(stagedFixture.root, "install.sh")),
        stat(stagedNodePath),
      ])
      ok(sourceStat.ino !== stagedStat.ino, "inode bản spawn tách khỏi inode gốc")
      const stagedHash = createHash("sha256").update(await readFile(stagedNodePath)).digest("hex")
      const sourceHash = createHash("sha256").update(await readFile(join(stagedFixture.root, "install.sh"))).digest("hex")
      eq(stagedHash, sourceHash, "bản tạm là snapshot nguyên vẹn trước khi chạy")
      mark("snapshot nguyên vẹn", `sha256=${stagedHash.slice(0, 12)}`)
      const result = await childClose(child, 8_000, "scheduler installer")
      mark("scheduler installer đóng", `rc=${result.code ?? "?"} signal=${result.signal ?? "-"}`)
      stagedOutput = await readFile(updateLog(), "utf8").catch(() => "")
      stagedError = stagedOutput
      eq(result.code, 0, `installer bản tạm phải sống trọn lượt: rc=${result.code}`)
      includes(await readFile(join(stagedFixture.root, "trace"), "utf8"), "finished", "lượt tạm hoàn tất")
      mark("trace có finished")
      const finalHash = createHash("sha256").update(await readFile(join(stagedFixture.root, "install.sh"))).digest("hex")
      ok(finalHash !== stagedHash, "installer cũ có thể thay file gốc nhưng không phá bản đang chạy")
      mark("install.sh gốc đã đổi inode", `sha256=${finalHash.slice(0, 12)}`)
      let stagedGone = true
      try { await stat(stagedNodePath); stagedGone = false } catch { /* cleanup đúng */ }
      ok(stagedGone, "file tạm được dọn sau khi installer thoát")
      mark("snapshot đã dọn")
      resetUpdateInstallLock({ kitgenHome: stagedFixture.root })
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
      if (stagedFixture && !stagedOutput) stagedOutput = await readFile(updateLog(), "utf8").catch(() => "")
      await dumpDiagnostics(e?.message ?? e)
      throw e
    } finally {
      clearTimeout(timer)
      if (directChild && directChild.exitCode === null && directChild.signalCode === null) await stopChild(directChild, mark, "dọn direct installer")
      if (child && child.exitCode === null && child.signalCode === null) await stopChild(child, mark, "dọn scheduler installer")
    }
  })

  await it("installer đã vá temp+mv ⇒ nâng lên runtime dài hơn vẫn hoàn tất 7/7", async () => {
    const home = join(tmp, "update-mv-home")
    const workspace = join(tmp, "update-mv-workspace")
    const fakeBin = join(tmp, "update-mv-bin")
    const oldRelease = join(home, "releases", "2.1.25")
    await mkdir(oldRelease, { recursive: true })
    await writeFile(join(oldRelease, "VERSION"), "2.1.25\n")
    await mkdir(fakeBin, { recursive: true })
    await writeFile(join(fakeBin, "codex"), "#!/bin/sh\nprintf 'codex-test\\n'\n")
    await chmod(join(fakeBin, "codex"), 0o755)
    await symlinkDir(oldRelease, join(home, "current"))

    const repoInstall = join(agentDir, "..", "install.sh")
    const oldInstaller = await readFile(repoInstall, "utf8")
    await writeFile(join(home, "install.sh"), oldInstaller)
    await chmod(join(home, "install.sh"), 0o700)
    const suffix = "\n" + Array.from({ length: 140 }, (_, i) => `# longer release padding ${i}`).join("\n") + "\n"
    const fixture = await makeRuntimeFixture(tmp, repoInstall, { version: "2.1.26", installerSuffix: suffix })
    const nodeBin = join(home, "tools", "node", "bin")
    const moduleDir = join(home, "tools", "node_modules", "@resvg", "resvg-wasm")
    await mkdir(nodeBin, { recursive: true })
    await mkdir(moduleDir, { recursive: true })
    await symlinkFile(process.execPath, join(nodeBin, "node"))
    await writeFile(join(moduleDir, "package.json"), '{"name":"@resvg/resvg-wasm","main":"index.js"}\n')
    await writeFile(join(moduleDir, "index.js"), "module.exports = {}\n")
    await writeFakePython(home, workspace)
    const env = {
      ...process.env,
      HOME: join(tmp, "update-mv-home-user"),
      PATH: [fakeBin, process.env.PATH].filter(Boolean).join(delimiter),
      KITGEN_HOME: home,
      KITGEN_WORKSPACE: workspace,
      KITGEN_UPDATE_LOCK: join(home, ".update-lock"),
      KITGEN_UPDATE_TXN: join(home, ".update-transaction"),
    }
    const before = await stat(join(home, "install.sh"))
    const result = await runFixtureScript(join(home, "install.sh"), env,
      ["--archive", fixture.archive, "--sha256", fixture.sha, "--workspace", workspace, "--no-start"])
    eq(result.code, 0, `installer temp+mv phải thoát 0: rc=${result.code}\n${result.stdout}\n${result.stderr}`)
    includes(`${result.stdout}\n${result.stderr}`, "[7/7]", "installer phải đi hết 7/7")
    const current = await fixtureRealpath(join(home, "current"), env)
    const installed = await fixtureRealpath(join(home, "releases", "2.1.26"), env)
    eq(current, installed, "current trỏ bản dài hơn sau lượt cài")
    const after = await stat(join(home, "install.sh"))
    ok(after.ino !== before.ino, "install.sh được thay bằng inode mới, không truncate inode đang chạy")
    const installedText = await readFile(join(home, "install.sh"), "utf8")
    eq(installedText, await readFile(join(fixture.root, "install.sh"), "utf8"), "đã ghi đúng installer dài hơn")
  })

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
      await mkdir(nodeBin, { recursive: true })
      await mkdir(moduleDir, { recursive: true })
      await symlinkFile(process.execPath, join(nodeBin, "node"))
      await writeFile(join(moduleDir, "package.json"), '{"name":"@resvg/resvg-wasm","main":"index.js"}\n')
      await writeFile(join(moduleDir, "index.js"), "module.exports = {}\n")
      await writeFakePython(home, workspace)

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
