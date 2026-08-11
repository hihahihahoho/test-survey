/**
 * web/js/core/secrets.js — BỘ DÒ SECRET tại chỗ ghi (architecture §4.3 danh sách đen + §4.4 lớp 3).
 * Chặn theo CẢ HAI trục:
 *   (a) TÊN FIELD nghi là secret (token/key/secret/authorization/bearer/password/cookie/auth.json…)
 *   (b) PATTERN GIÁ TRỊ (sk-…, JWT eyJ…, Bearer …, path tuyệt đối chứa tên user, entropy cao)
 * Trúng → throw SecretLeakError, KHÔNG ghi (thà mất tuỳ chọn UI còn hơn rò secret).
 *
 * File này không import gì để có thể test độc lập và không bao giờ tự log giá trị bị chặn.
 */

/** Lỗi rò secret — thông điệp CHỈ nêu đường dẫn field + luật trúng, TUYỆT ĐỐI không kèm giá trị. */
export class SecretLeakError extends Error {
  constructor(path, rule, kind) {
    super(`Chặn ghi: "${path}" trúng luật bảo mật ${rule} (${kind}). Giá trị không được ghi và không được log.`);
    this.name = 'SecretLeakError';
    this.code = 'SECRET_BLOCKED';
    this.path = path;
    this.rule = rule;
    this.kind = kind; // 'field-name' | 'value-pattern' | 'entropy'
  }
}

/** Lỗi vi phạm allowlist key (arch §4.4 lớp 2). */
export class StoreKeyError extends Error {
  constructor(key) {
    super(`Chặn ghi: khoá "${key}" không có trong allowlist localStorage (architecture §4.1).`);
    this.name = 'StoreKeyError';
    this.code = 'STORE_KEY_NOT_ALLOWED';
    this.key = key;
  }
}

/** (a) Tên field bị cấm — khớp không phân biệt hoa/thường, bỏ qua -_ và . */
export const FORBIDDEN_FIELD_PATTERNS = Object.freeze([
  { rule: 'F-TOKEN',      re: /token/i },
  { rule: 'F-KEY',        re: /(^|[^a-z])(api)?_?key(s)?([^a-z]|$)/i },
  { rule: 'F-SECRET',     re: /secret/i },
  { rule: 'F-AUTHZ',      re: /authorization/i },
  { rule: 'F-BEARER',     re: /bearer/i },
  { rule: 'F-PASSWORD',   re: /pass(word|wd|phrase)/i },
  { rule: 'F-COOKIE',     re: /cookie/i },
  { rule: 'F-AUTHJSON',   re: /auth[._-]?json/i },
  { rule: 'F-CREDENTIAL', re: /credential/i },
  { rule: 'F-SESSION',    re: /session[._-]?(id|key)/i },
  { rule: 'F-CODEXAUTH',  re: /^(auth_mode|account_id|last_refresh|id_token|access_token|refresh_token)$/i },
  { rule: 'F-ENV',        re: /^(openai_api_key|codex_home|env)$/i },
  { rule: 'F-CONFIRM',    re: /confirm(ation)?[._-]?code/i },  // mã 4 số huỷ diệt (arch §4.3-7)
]);

/** Field tên hợp lệ dù chứa chữ nhạy cảm — allowlist hẹp, phải có trong schema §4.1. */
const FIELD_NAME_EXCEPTIONS = Object.freeze(new Set([
  'authPresent',   // doctor: boolean existsSync, KHÔNG phải nội dung auth.json
]));

/** (b) Pattern giá trị bị cấm. */
export const FORBIDDEN_VALUE_PATTERNS = Object.freeze([
  { rule: 'V-SK',       re: /\bsk-[A-Za-z0-9_-]{16,}/ },              // OpenAI key (kể cả sk-proj-)
  { rule: 'V-JWT',      re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ }, // JWT
  { rule: 'V-BEARER',   re: /\bbearer\s+[A-Za-z0-9._~+/-]{12,}/i },
  { rule: 'V-AUTHKV',   re: /(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/i },
  { rule: 'V-ABSPATH',  re: /(^|[\s"'(=])(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s"')]+/ }, // PII (arch §4.3-5)
  { rule: 'V-PRIVKEY',  re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: 'V-GHTOKEN',  re: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { rule: 'V-SETCOOKIE',re: /\b(set-cookie|__Secure-|__Host-)/i },
]);

/** Nhãn workspace rút gọn dạng `~/KitGen` là HỢP LỆ (agent trả về, không phải path tuyệt đối). */
const VALUE_EXCEPTION_RE = /^~(\/|$)/;

/** Shannon entropy (bit/ký tự). */
export function shannonEntropy(str) {
  if (!str) return 0;
  const freq = new Map();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / str.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Chuỗi ≥32 ký tự base64/hex có entropy > 4.0 → nghi là secret (arch §4.4 lớp 3). */
const HIGH_ENTROPY_SHAPE = /^[A-Za-z0-9+/=_-]{32,}$/;
export function looksHighEntropy(value) {
  if (typeof value !== 'string' || value.length < 32) return false;
  if (!HIGH_ENTROPY_SHAPE.test(value)) return false;
  return shannonEntropy(value) > 4.0;
}

/** Hash/fingerprint agent trả về là hợp lệ dù entropy cao — phải có tiền tố rõ ràng. */
const ENTROPY_EXCEPTION_RE = /^(sha256:|sha1:|[0-9a-f]{7,64}$)/i;

function checkFieldName(name, path) {
  if (FIELD_NAME_EXCEPTIONS.has(name)) return;
  for (const { rule, re } of FORBIDDEN_FIELD_PATTERNS) {
    if (re.test(name)) throw new SecretLeakError(path, rule, 'field-name');
  }
}

function checkValue(value, path) {
  if (typeof value !== 'string') return;
  if (VALUE_EXCEPTION_RE.test(value)) return;
  for (const { rule, re } of FORBIDDEN_VALUE_PATTERNS) {
    if (re.test(value)) throw new SecretLeakError(path, rule, 'value-pattern');
  }
  if (looksHighEntropy(value) && !ENTROPY_EXCEPTION_RE.test(value)) {
    throw new SecretLeakError(path, 'V-ENTROPY', 'entropy');
  }
}

/**
 * Quét đệ quy value trước khi serialize. Ném SecretLeakError ở vi phạm ĐẦU TIÊN.
 * @param {unknown} value
 * @param {string} path đường dẫn field để báo lỗi (không chứa giá trị)
 */
export function assertNoSecret(value, path = '$') {
  scan(value, path, new WeakSet());
}

/**
 * Tên field có thể CHÍNH LÀ secret (map keyed by token). Khi đó `path` dùng để báo lỗi
 * sẽ chứa luôn giá trị nhạy cảm → phải che trước khi đưa vào message của SecretLeakError,
 * nếu không chính thông điệp lỗi lại làm rò thứ ta vừa chặn (arch §4.3, §4.4 lớp 3).
 */
export function maskPathSegment(name) {
  const s = String(name);
  if (s.length <= 4) return s;
  return `${s.slice(0, 2)}…<redacted:${s.length}>`;
}

function scan(value, path, seen) {
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t === 'string') { checkValue(value, path); return; }
  if (t === 'number' || t === 'boolean') return;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new SecretLeakError(path, 'T-UNSERIALIZABLE', 'field-name');
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`, seen));
      return;
    }
    for (const [k, v] of Object.entries(value)) {
      const p = `${path}.${k}`;
      checkFieldName(k, p);
      // Tên field cũng có thể LÀ secret (vd map keyed by token). Báo lỗi bằng đường dẫn
      // ĐÃ CHE, vì `p` chứa nguyên tên field = chính giá trị nhạy cảm.
      checkValue(k, `${path}.${maskPathSegment(k)}`);
      scan(v, p, seen);
    }
  }
}

/** Kiểm tra không ném — trả về null nếu sạch, hoặc {path, rule, kind}. */
export function findSecret(value, path = '$') {
  try { assertNoSecret(value, path); return null; }
  catch (e) {
    if (e instanceof SecretLeakError) return { path: e.path, rule: e.rule, kind: e.kind };
    throw e;
  }
}
