/**
 * webapp/src/lib/store/secrets.ts — BỘ DÒ SECRET tại chỗ ghi (arch §4.3 danh sách đen + §4.4 lớp 3).
 *
 * Chặn theo CẢ HAI trục, vì chỉ một trục là không đủ:
 *   (a) TÊN FIELD nghi là secret — `token`/`key`/`secret`/`authorization`/`bearer`/
 *       `password`/`cookie`/`auth` — bắt được ca "lỡ tay spread cả object doctor vào store"
 *   (b) PATTERN GIÁ TRỊ — `sk-…`, JWT `eyJ…`, `Bearer …`, path tuyệt đối chứa tên user,
 *       entropy cao — bắt được ca tên field vô hại nhưng giá trị là secret
 *
 * Trúng ⇒ **throw** `SecretLeakError`, KHÔNG ghi. Thà mất một tuỳ chọn UI còn hơn rò secret.
 *
 * File này KHÔNG import gì (test độc lập được) và TUYỆT ĐỐI không log giá trị bị chặn —
 * kể cả trong message của lỗi. Đó là lỗi mà `teams/qa-web/qa-security.md` §2.2 đã tìm ra ở
 * bản trước: "thông điệp lỗi tự làm rò secret". Xem `maskPathSegment`.
 */

/** Lỗi rò secret. Message CHỈ nêu đường dẫn + luật trúng, KHÔNG BAO GIỜ kèm giá trị. */
export class SecretLeakError extends Error {
  readonly code = "SECRET_BLOCKED";
  constructor(
    readonly path: string,
    readonly rule: string,
    readonly kind: "field-name" | "value-pattern" | "entropy" | "unserializable",
  ) {
    super(`Chặn ghi: "${path}" trúng luật bảo mật ${rule} (${kind}). Giá trị không được ghi và không được log.`);
    this.name = "SecretLeakError";
  }
}

/** Lỗi vi phạm allowlist khoá (arch §4.4 lớp 2). */
export class StoreKeyError extends Error {
  readonly code = "STORE_KEY_NOT_ALLOWED";
  constructor(readonly key: string) {
    super(`Chặn ghi: khoá "${key}" không có trong allowlist localStorage (architecture §4.1).`);
    this.name = "StoreKeyError";
  }
}

/** (a) Tên field bị cấm — 9 nhóm mà brief yêu cầu, cộng nhóm riêng của dự án. */
export const FORBIDDEN_FIELD_PATTERNS: readonly { rule: string; re: RegExp }[] = [
  { rule: "F-TOKEN", re: /token/i },
  { rule: "F-KEY", re: /(^|[^a-z])(api)?_?key(s)?([^a-z]|$)/i },
  { rule: "F-SECRET", re: /secret/i },
  { rule: "F-AUTHZ", re: /authorization/i },
  { rule: "F-BEARER", re: /bearer/i },
  { rule: "F-PASSWORD", re: /pass(word|wd|phrase)/i },
  { rule: "F-COOKIE", re: /cookie/i },
  /** nhóm `auth`: `auth`, `auth.json`, `authMode`, `authData`… */
  { rule: "F-AUTH", re: /(^|[^a-z])auth([^a-z]|$)|auth[._-]?(json|mode|data|state|info)/i },
  { rule: "F-CREDENTIAL", re: /credential/i },
  { rule: "F-SESSION", re: /session[._-]?(id|key)/i },
  /** đúng danh sách field của auth.json mà teams/t3-auth liệt kê (arch §4.3-2). */
  { rule: "F-CODEXAUTH", re: /^(auth_mode|account_id|last_refresh|id_token|access_token|refresh_token)$/i },
  { rule: "F-ENV", re: /^(openai_api_key|codex_home|env)$/i },
  /** mã 4 số huỷ diệt — dùng xong quên ngay (arch §4.3-7). */
  { rule: "F-CONFIRM", re: /confirm(ation)?[._-]?code/i },
];

/**
 * Field tên "có mùi" nhưng HỢP LỆ — allowlist HẸP, mỗi cái phải giải thích được.
 * `authPresent` là boolean từ `existsSync(auth.json)`; agent không bao giờ mở file
 * (arch §4.4-4), nên lưu boolean này không rò gì.
 */
const FIELD_NAME_EXCEPTIONS = new Set(["authPresent"]);

/** (b) Pattern giá trị bị cấm. */
export const FORBIDDEN_VALUE_PATTERNS: readonly { rule: string; re: RegExp }[] = [
  { rule: "V-SK", re: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { rule: "V-JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
  { rule: "V-BEARER", re: /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i },
  { rule: "V-AUTHKV", re: /(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i },
  /** PII (arch §4.3-5): path tuyệt đối chứa tên user. Không phải secret nhưng UI không cần. */
  { rule: "V-ABSPATH", re: /(^|[\s"'(=])(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s"')]+/ },
  { rule: "V-PRIVKEY", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: "V-GHTOKEN", re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { rule: "V-SETCOOKIE", re: /\b(set-cookie|__Secure-|__Host-)/i },
];

/** Nhãn workspace rút gọn `~/KitGen` là HỢP LỆ (agent trả về, không phải path thật). */
const VALUE_EXCEPTION_RE = /^~(\/|$)/;

/** Shannon entropy (bit/ký tự). */
export function shannonEntropy(str: string): number {
  if (!str) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / str.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const HIGH_ENTROPY_SHAPE = /^[A-Za-z0-9+/=_-]{32,}$/;

/** Chuỗi ≥32 ký tự base64/hex có entropy > 4.0 ⇒ nghi là secret (arch §4.4 lớp 3). */
export function looksHighEntropy(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 32) return false;
  if (!HIGH_ENTROPY_SHAPE.test(value)) return false;
  return shannonEntropy(value) > 4.0;
}

/** Hash/fingerprint agent trả về là hợp lệ dù entropy cao — phải có tiền tố rõ ràng. */
const ENTROPY_EXCEPTION_RE = /^(sha256:|sha1:|[0-9a-f]{7,64}$)/i;

/**
 * Tên field có thể CHÍNH LÀ secret (vd map keyed by token). Khi đó `path` dùng để báo lỗi
 * sẽ chứa luôn giá trị nhạy cảm ⇒ phải che, nếu không chính thông điệp lỗi lại làm rò
 * thứ ta vừa chặn. (Đúng lỗi qa-security.md §2.2 đã bắt được và đã vá ở bản vanilla.)
 */
export function maskPathSegment(name: unknown): string {
  const s = String(name);
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}…<redacted:${s.length}>`;
}

function checkFieldName(name: string, path: string): void {
  if (FIELD_NAME_EXCEPTIONS.has(name)) return;
  for (const { rule, re } of FORBIDDEN_FIELD_PATTERNS) {
    if (re.test(name)) throw new SecretLeakError(path, rule, "field-name");
  }
}

function checkValue(value: unknown, path: string): void {
  if (typeof value !== "string") return;
  if (VALUE_EXCEPTION_RE.test(value)) return;
  for (const { rule, re } of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(value)) throw new SecretLeakError(path, rule, "value-pattern");
  }
  if (looksHighEntropy(value) && !ENTROPY_EXCEPTION_RE.test(value)) {
    throw new SecretLeakError(path, "V-ENTROPY", "entropy");
  }
}

/** Quét đệ quy TRƯỚC khi serialize. Ném ở vi phạm ĐẦU TIÊN. */
export function assertNoSecret(value: unknown, path = "$"): void {
  scan(value, path, new WeakSet());
}

function scan(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === "string") {
    checkValue(value, path);
    return;
  }
  if (t === "number" || t === "boolean") return;
  if (t === "function" || t === "symbol" || t === "bigint") {
    throw new SecretLeakError(path, "T-UNSERIALIZABLE", "unserializable");
  }
  if (t === "object") {
    const obj = value as object;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`, seen));
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = `${path}.${k}`;
      checkFieldName(k, p);
      // Tên field cũng có thể LÀ secret ⇒ báo lỗi bằng đường dẫn ĐÃ CHE.
      checkValue(k, `${path}.${maskPathSegment(k)}`);
      scan(v, p, seen);
    }
  }
}

/** Kiểm không ném — `null` nếu sạch. */
export function findSecret(value: unknown, path = "$"): { path: string; rule: string; kind: string } | null {
  try {
    assertNoSecret(value, path);
    return null;
  } catch (e) {
    if (e instanceof SecretLeakError) return { path: e.path, rule: e.rule, kind: e.kind };
    throw e;
  }
}
