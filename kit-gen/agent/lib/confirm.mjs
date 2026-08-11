/* confirm.mjs — xác nhận NGOÀI BĂNG cho thao tác huỷ diệt (architecture §3.4 lớp 8).
   Mã 4 số được IN RA TERMINAL của agent, không bao giờ trả qua HTTP, không lưu ở đâu khác,
   dùng 1 lần, hết hạn 60s, sai 3 lần → khoá 60s. */
import { randomInt } from "node:crypto"
import { fail } from "./errors.mjs"

const TTL_MS = 60_000
const LOCK_MS = 60_000
const MAX_ATTEMPTS = 3

export class ConfirmCodes {
  constructor(print = console.log) {
    this.print = print
    this.map = new Map()   // scope → {code, expiresAt, attempts, lockedUntil}
  }

  /** POST /api/trash/:trashId/code → in mã ra terminal, response CHỈ có expiresInMs. */
  issue(scope) {
    const prev = this.map.get(scope)
    if (prev?.lockedUntil && prev.lockedUntil > Date.now())
      fail("CONFIRM_LOCKED", "too many wrong codes, locked", { details: { retryInMs: prev.lockedUntil - Date.now() } })
    const code = String(randomInt(1000, 10000))
    this.map.set(scope, { code, expiresAt: Date.now() + TTL_MS, attempts: 0, lockedUntil: 0 })
    this.print(`\n  ⚠  MÃ XÁC NHẬN XOÁ VĨNH VIỄN: ${code}   (hết hạn sau 60 giây, dùng 1 lần)\n     Thao tác: ${scope}\n`)
    return { expiresInMs: TTL_MS }
  }

  /** Kiểm mã do user gõ lại. Thiếu mã → 412 CONFIRM_REQUIRED (không tự phát mã). */
  check(scope, given) {
    const rec = this.map.get(scope)
    if (rec?.lockedUntil && rec.lockedUntil > Date.now())
      fail("CONFIRM_LOCKED", "locked after too many wrong codes", { details: { retryInMs: rec.lockedUntil - Date.now() } })
    if (given === undefined || given === null || given === "")
      fail("CONFIRM_REQUIRED", "X-KitGen-Confirm header is required", {
        details: { issuedTo: "terminal", expiresInMs: TTL_MS },
      })
    if (!rec || rec.expiresAt < Date.now()) {
      this.map.delete(scope)
      fail("CONFIRM_REQUIRED", "no valid code issued (expired)", { details: { issuedTo: "terminal", expiresInMs: TTL_MS } })
    }
    if (String(given).trim() !== rec.code) {
      rec.attempts += 1
      if (rec.attempts >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCK_MS
        rec.code = "-"
        fail("CONFIRM_LOCKED", "3 wrong attempts, locked 60s", { details: { retryInMs: LOCK_MS } })
      }
      fail("CONFIRM_INVALID", "wrong confirmation code", { details: { attemptsLeft: MAX_ATTEMPTS - rec.attempts } })
    }
    this.map.delete(scope)   // dùng một lần
    return true
  }
}
