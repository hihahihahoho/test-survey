#!/usr/bin/env node
/* log-run.mjs — Windows Startup supervisor.
   Runs one child, writes stdout/stderr with a bounded rotating log, exits with the
   child's code. No restart loop: a crash is visible and stops instead of respawning
   forever. */
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"

export const MAX_LOG_BYTES = 5 * 1024 * 1024
export const KEEP_LOG_BYTES = 1 * 1024 * 1024
const MAX_CHUNK_BYTES = 64 * 1024

export function appendBoundedLog(path, value, { maxBytes = MAX_LOG_BYTES, keepBytes = KEEP_LOG_BYTES } = {}) {
  const cap = Math.max(1, Number(maxBytes) || MAX_LOG_BYTES)
  const keep = Math.max(0, Math.min(cap, Number(keepBytes) || KEEP_LOG_BYTES))
  let buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ""))
  if (!buf.length) return
  if (buf.length > MAX_CHUNK_BYTES) buf = buf.subarray(buf.length - MAX_CHUNK_BYTES)
  if (buf.length > cap) buf = buf.subarray(buf.length - cap)
  let size = 0
  try { size = statSync(path).size } catch {}
  if (size + buf.length > cap) {
    let raw = Buffer.alloc(0)
    try { raw = readFileSync(path) } catch {}
    const marker = Buffer.from(`[agent.log rotated; keeping newest ${Math.round(keep / 1024)}KB]\n`)
    const room = Math.max(0, cap - marker.length - buf.length)
    let tail = raw.subarray(Math.max(0, raw.length - Math.min(keep, room)))
    const nl = tail.indexOf(0x0a)
    if (nl >= 0) tail = tail.subarray(nl + 1)
    let next = Buffer.concat([marker, tail, buf])
    if (next.length > cap) next = next.subarray(next.length - cap)
    writeFileSync(path, next)
    return
  }
  appendFileSync(path, buf)
}

export function parseArgs(argv) {
  const split = argv.indexOf("--")
  if (split < 0 || !argv[1] || split === argv.length - 1) throw new Error("usage: log-run.mjs --log <file> -- <command> [args]")
  const logIndex = argv.indexOf("--log")
  if (logIndex < 0 || logIndex + 1 >= split) throw new Error("usage: log-run.mjs --log <file> -- <command> [args]")
  return { log: argv[logIndex + 1], cmd: argv[split + 1], args: argv.slice(split + 2) }
}

export async function runLogged({ log, cmd, args, spawnImpl = spawn } = {}) {
  const child = spawnImpl(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: process.platform === "win32",
  })
  const write = chunk => { try { appendBoundedLog(log, chunk) } catch {} }
  child.stdout?.on("data", write)
  child.stderr?.on("data", write)
  return await new Promise(resolve => {
    child.once("error", e => { write(`log-run spawn failed: ${e?.message ?? e}\n`); resolve(1) })
    child.once("close", code => resolve(Number.isInteger(code) ? code : 1))
  })
}

if (import.meta.url === `file://${process.argv[1]}` ||
    (process.platform === "win32" && process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href)) {
  try {
    const code = await runLogged(parseArgs(process.argv.slice(2)))
    process.exit(code)
  } catch (e) {
    process.stderr.write(`${e?.message ?? e}\n`)
    process.exit(2)
  }
}
