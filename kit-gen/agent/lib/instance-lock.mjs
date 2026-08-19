/* instance-lock.mjs — khóa liên tiến trình cho agent local.
   Một process đang giữ file descriptor; process thứ hai thoát ngay, không dò cổng.
   Lock stale sau kill -9 được thu hồi một lần theo PID, không retry vô hạn. */
import {
  closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"

export const INSTANCE_LOCK_NAME = "agent.lock"

function pidAlive(pid) {
  if (!/^\d+$/.test(String(pid))) return false
  try { process.kill(Number(pid), 0); return true }
  catch (e) { return e?.code === "EPERM" }
}

function ownerPid(path) {
  try {
    const m = /^pid:(\d+)\s*$/m.exec(readFileSync(path, "utf8"))
    return m ? Number(m[1]) : null
  } catch { return null }
}

export class InstanceAlreadyRunningError extends Error {
  constructor(path, pid = null) {
    super(pid
      ? `KitGen agent da chay (PID ${pid}); khong khoi dong ban thu hai.`
      : "KitGen agent dang co mot ban khac chay; khong khoi dong ban thu hai.")
    this.name = "InstanceAlreadyRunningError"
    this.code = "KITGEN_INSTANCE_RUNNING"
    this.lockPath = path
    this.ownerPid = pid
  }
}

/** Acquire exactly once. Returns a held fd; caller must release it on shutdown. */
export function acquireInstanceLock({ kitgenHome, pid = process.pid } = {}) {
  if (!kitgenHome) throw new TypeError("kitgenHome is required")
  const path = join(resolve(kitgenHome), INSTANCE_LOCK_NAME)
  mkdirSync(dirname(path), { recursive: true })

  for (let staleRecovery = 0; staleRecovery < 2; staleRecovery++) {
    let fd
    try {
      fd = openSync(path, "wx", 0o600)
      try { writeSync(fd, `pid:${pid}\nstartedAt:${new Date().toISOString()}\n`) }
      catch (e) { try { closeSync(fd) } catch {} ; try { unlinkSync(path) } catch {} ; throw e }
      return { fd, path, pid }
    } catch (e) {
      if (e?.code !== "EEXIST") throw e
      const owner = ownerPid(path)
      if (owner && pidAlive(owner)) throw new InstanceAlreadyRunningError(path, owner)
      /* Empty/unknown owner is treated as busy. Removing it would race a process
         between mkdir/open and owner write. Only a known-dead PID is recoverable. */
      if (!owner) throw new InstanceAlreadyRunningError(path)
      try { unlinkSync(path) } catch { throw new InstanceAlreadyRunningError(path, owner) }
    }
  }
  throw new InstanceAlreadyRunningError(path)
}

export function releaseInstanceLock(lock) {
  if (!lock) return false
  try { closeSync(lock.fd) } catch {}
  try { unlinkSync(lock.path); return true } catch { return false }
}

