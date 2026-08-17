/* suite-update-cure.mjs — hồi quy cho bệnh update lần 1/lần 2.
   Ca installer ở đây không chạm máy thật: dựng một runtime tối giản trong tmp,
   giết installer sau activation, rồi chạy lượt kế tiếp để chứng minh journal rollback. */
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { chmod, mkdir, realpath, readFile, symlink, writeFile } from "node:fs/promises"
import { delimiter, dirname, join, relative } from "node:path"
import { describe, it, eq, ok } from "./harness.mjs"

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

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
    const home = join(tmp, "update-kill-home")
    const workspace = join(tmp, "update-kill-workspace")
    const fakeBin = join(tmp, "update-kill-bin")
    const oldRelease = join(home, "releases", "2.1.24")
    const newRelease = join(home, "releases", "2.1.25")
    const launchState = join(tmp, "fake-launchctl-state")
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
    await symlink(oldRelease, join(home, "current"))
    const txn = join(home, ".update-transaction")
    await mkdir(txn, { recursive: true })

    const { archive, sha } = await makeRuntimeFixture(tmp, join(agentDir, "..", "install.sh"))
    const nodeBin = join(home, "tools", "node", "bin")
    const moduleDir = join(home, "tools", "node_modules", "@resvg", "resvg-wasm")
    const venvBin = join(workspace, ".venv", "bin")
    await mkdir(nodeBin, { recursive: true })
    await mkdir(moduleDir, { recursive: true })
    await mkdir(venvBin, { recursive: true })
    await symlink(process.execPath, join(nodeBin, "node"))
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
      FAKE_LAUNCHCTL_STATE: launchState,
    }
    const child = spawn("bash", [join(agentDir, "..", "install.sh"), "--archive", archive, "--sha256", sha, "--workspace", workspace], {
      env, stdio: ["ignore", "pipe", "pipe"], detached: true,
    })
    let output = ""
    child.stdout.on("data", b => { output += b.toString() })
    child.stderr.on("data", b => { output += b.toString() })
    let activated = false
    for (let i = 0; i < 200; i++) {
      try {
        activated = (await readFile(join(txn, "state"), "utf8")).trim() === "activated"
      } catch { /* chưa tới activation */ }
      if (activated) break
      await delay(20)
    }
    ok(activated, `installer phải ghi journal activated trước khi khởi động lại dịch vụ: ${output.slice(-1000)}`)
    const childClosed = new Promise(resolve => child.once("close", resolve))
    if (process.platform === "win32") {
      await new Promise(resolve => {
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore", windowsHide: true,
        })
        killer.once("error", () => {
          try { child.kill("SIGKILL") } catch { /* installer đã chết */ }
          resolve()
        })
        killer.once("close", resolve)
      })
    } else {
      child.kill("SIGKILL")
    }
    await childClosed
    eq(await realpath(join(home, "current")), await realpath(newRelease),
      "SIGKILL để lại đúng hiện trường symlink mới + journal")

    const missing = join(tmp, "missing-runtime.tar.gz")
    const second = spawn("bash", [join(agentDir, "..", "install.sh"), "--archive", missing, "--workspace", workspace], { env, stdio: "ignore" })
    await new Promise(resolve => second.once("close", resolve))
    eq(await realpath(join(home, "current")), await realpath(oldRelease),
      "lượt sau thu hồi symlink mới chưa phục vụ")
    let journalLeft = true
    try { await readFile(join(txn, "state")); } catch { journalLeft = false }
    ok(!journalLeft, "journal đã được thu hồi sau rollback")
  })
}
