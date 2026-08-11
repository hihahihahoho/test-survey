/**
 * web/js/core/schemas.js — SCHEMA cho từng khoá localStorage (architecture §4.1, bảng ĐẦY ĐỦ).
 * Vai trò: allowlist field (kiểu `.strict()` — field lạ bị LOẠI BỎ, không chỉ cảnh báo, arch §4.4 lớp 2).
 * Không dùng zod/valibot vì luật cứng "không npm install" → validator viết tay, nhỏ và tường minh.
 */

import { IMAGE_GEN_MODES, LS_KEYS, PORT_CANDIDATES } from './constants.js';

/** Bộ dựng field nguyên thuỷ. */
const str = (opts = {}) => ({ t: 'string', ...opts });
const num = (opts = {}) => ({ t: 'number', ...opts });
const bool = (def = false) => ({ t: 'boolean', def });
const enun = (values, def) => ({ t: 'enum', values, def });
const arr = (of, opts = {}) => ({ t: 'array', of, ...opts });
const obj = (fields, opts = {}) => ({ t: 'object', fields, ...opts });
const iso = () => ({ t: 'iso' });

/**
 * SCHEMAS: khoá → định nghĩa. Key KHÔNG có trong object này ⇒ store.set throw StoreKeyError.
 * Mọi giá trị phải serialize được sang JSON và không được chứa PII/secret (secrets.js kiểm sau).
 */
export const SCHEMAS = Object.freeze({
  [LS_KEYS.setup]: obj({
    completed: bool(false),
    /* QA-UX TB-A · enum PHẢI khớp `screens/setup/stepper.js` STEPS.
       Bản cũ thiếu 'workspace' (bước 3) và còn giá trị chết 'run' (bước đã đổi tên).
       `enun()` gặp giá trị lạ thì rơi về mặc định ⇒ `saveSetup({step:'workspace'})`
       ghi thành 'download' ⇒ tắt tab ở bước 3, mở lại bị LÙI về bước 2 (im lặng).
       Có ca test khoá: mỗi id trong STEPS ghi rồi đọc phải ra chính nó. */
    step: enun(['download', 'connect', 'workspace', 'imagegen', 'done'], 'download'),
    agentVersionSeen: str(),
    protocolSeen: num(),
    imageGenMode: enun(IMAGE_GEN_MODES, 'unknown'),
    checkedAt: iso(),
  }),

  [LS_KEYS.agent]: obj({
    // §6.5-3: KHÔNG lưu baseUrl do user gõ tự do — chỉ loopback + cổng trong portCandidates,
    // hoặc origin same-origin của bản mirror. store.js kiểm bằng assertAllowedBaseUrl().
    baseUrl: str(),
    portCandidates: arr(num(), { def: [...PORT_CANDIDATES] }),
    mode: enun(['remote', 'mirror'], 'remote'),
    instanceLabel: str(),
    lastOkAt: iso(),
  }),

  [LS_KEYS.workspace]: obj({
    label: str(),           // NHÃN rút gọn `~/KitGen` — không phải path tuyệt đối (arch §4.1)
    fingerprint: str(),     // `sha256:…12`
    knownAt: iso(),
    workspaceId: str(),     // id đục do agent cấp (chốt X1) — web không bao giờ gửi path
  }),

  [LS_KEYS.projectsCache]: obj({
    fetchedAt: iso(),
    etag: str(),
    workspaceFingerprint: str(),
    items: arr(obj({
      id: str(), name: str(), updatedAt: iso(), tags: arr(str()),
      slug: str({ max: 48 }),
      description: str({ max: 200 }),
      stats: obj({
        variants: num(), sheets: num(), components: num(), jobs: num(),
        rawPresent: num(), kitsCut: num(), diskBytes: num(),
      }, { loose: true }),
      // §2.5-4 buộc vẽ danh sách từ cache khi agent chưa chạy, mà thẻ project phải có
      // DÒNG TRẠNG THÁI + badge (§3-S1, §5.7) — tính từ state.jobs. Không có field này
      // thì thẻ cache không hiện được trạng thái (NEEDS-setup-projects.md N2).
      // `jobs` là map job→trạng thái nên dùng `loose`; giá trị chỉ là enum ngắn của §5.7.
      state: obj({
        stale: bool(false),
        staleReason: arr(str({ max: 40 }), { max: 10 }),
        jobs: obj({}, { loose: true }),
        activeRun: obj({
          runId: str({ max: 40 }), kind: str({ max: 16 }),
          done: num(), total: num(), failed: num(),
        }),
      }),
      coverUrlPath: str(),  // đường dẫn TƯƠNG ĐỐI trong project
      broken: bool(false),
    })),
  }),

  [LS_KEYS.ui]: obj({
    theme: enun(['dark', 'light', 'system'], 'dark'),
    locale: enun(['vi', 'en'], 'vi'),
    density: enun(['comfortable', 'compact'], 'comfortable'),
    sidebarWidth: num({ min: 48, max: 480, def: 168 }),
    projectsView: enun(['grid', 'list'], 'grid'),
    sortBy: enun(['updatedAt', 'name', 'createdAt', 'diskBytes'], 'updatedAt'),
    // §3-S1-1 "toàn bộ lưu ở kitgen.ui.v1" (NEEDS-setup-projects.md N4)
    sortDir: enun(['asc', 'desc'], 'desc'),
    filterChip: enun(['all', 'need-gen', 'running', 'error', 'unfinished'], 'all'),
    filterTags: arr(str({ max: 40 }), { max: 10 }),
    filterQuery: str({ max: 200 }),
    collapsedSections: arr(str()),
    lastTab: str({ max: 40 }),
  }),

  [LS_KEYS.prefs]: obj({
    maxJobs: num({ min: 1, max: 8, def: 4 }),
    autoSliceAfterGen: bool(true),      // chốt X9: bật mặc định
    confirmDestructive: bool(true),
    showEmptyCells: bool(false),
    logTail: num({ min: 200, max: 5000, def: 2000 }),
  }),

  [LS_KEYS.recent]: obj({
    projectIds: arr(str(), { max: 10 }),
    lastOpenedId: str(),
  }),

  [LS_KEYS.hints]: obj({
    dismissed: arr(str(), { max: 200 }),
  }),
});

/** Giá trị mặc định của một khoá (dùng khi chưa có gì trong localStorage). */
export function defaultsFor(key) {
  const schema = SCHEMAS[key];
  return schema ? buildDefault(schema) : undefined;
}

function buildDefault(def) {
  switch (def.t) {
    case 'object': {
      const out = {};
      for (const [k, f] of Object.entries(def.fields)) {
        const d = buildDefault(f);
        if (d !== undefined) out[k] = d;
      }
      return out;
    }
    case 'array': return def.def ? [...def.def] : [];
    case 'enum': return def.def;
    case 'boolean': return def.def ?? false;
    case 'number': return def.def;
    default: return undefined;
  }
}

/**
 * Lọc value theo schema: field lạ bị LOẠI BỎ, kiểu sai bị bỏ, enum sai → về default,
 * số bị kẹp vào [min,max]. Trả về { value, dropped:string[] }.
 */
export function coerce(def, value, path = '$', dropped = []) {
  switch (def.t) {
    case 'string':
      if (typeof value !== 'string') { dropped.push(path); return { value: undefined, dropped }; }
      return { value: def.max ? value.slice(0, def.max) : value, dropped };
    case 'iso':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        dropped.push(path); return { value: undefined, dropped };
      }
      return { value, dropped };
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        dropped.push(path); return { value: def.def, dropped };
      }
      { let n = value;
        if (def.min !== undefined) n = Math.max(def.min, n);
        if (def.max !== undefined) n = Math.min(def.max, n);
        return { value: n, dropped }; }
    case 'boolean':
      if (typeof value !== 'boolean') { dropped.push(path); return { value: def.def, dropped }; }
      return { value, dropped };
    case 'enum':
      if (!def.values.includes(value)) { dropped.push(path); return { value: def.def, dropped }; }
      return { value, dropped };
    case 'array': {
      if (!Array.isArray(value)) { dropped.push(path); return { value: [], dropped }; }
      const out = [];
      value.forEach((v, i) => {
        const r = coerce(def.of, v, `${path}[${i}]`, dropped);
        if (r.value !== undefined) out.push(r.value);
      });
      return { value: def.max ? out.slice(0, def.max) : out, dropped };
    }
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        dropped.push(path); return { value: {}, dropped };
      }
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const f = def.fields[k];
        if (!f) {
          if (def.loose) out[k] = v;      // stats: cho phép field mới của agent (§6.5-6)
          else dropped.push(`${path}.${k}`); // field LẠ → loại bỏ
          continue;
        }
        const r = coerce(f, v, `${path}.${k}`, dropped);
        if (r.value !== undefined) out[k] = r.value;
      }
      return { value: out, dropped };
    }
    default:
      dropped.push(path);
      return { value: undefined, dropped };
  }
}

export function isAllowedKey(key) { return Object.hasOwn(SCHEMAS, key); }
export function allowedKeys() { return Object.keys(SCHEMAS); }
