/**
 * webapp/src/lib/store/persist.ts — CỬA DUY NHẤT ghi localStorage (§6.5-2, arch §4.1/§4.4).
 *
 * Bốn lớp bảo vệ, xếp theo thứ tự chạy:
 *   L1 ALLOWLIST KHOÁ tường minh  → khoá ngoài bảng arch §4.1 ⇒ throw StoreKeyError
 *   L2 SCHEMA loại bỏ field lạ    → field không khai báo KHÔNG BAO GIỜ ra đĩa
 *   L3 BỘ DÒ SECRET               → trúng tên field HOẶC pattern giá trị ⇒ throw, KHÔNG ghi
 *   L4 baseUrl bị giới hạn        → chỉ loopback + cổng trong portCandidates (§6.5-3)
 *
 * Vì sao ở đây khắt khe mà `lib/types/api.ts` khoan dung: hai hướng dữ liệu, hai mức tin
 * cậy. Dữ liệu TỪ agent phải khoan dung (agent mới thêm field thì UI cũ không được vỡ).
 * Dữ liệu GHI RA localStorage phải khắt khe — field lạ ở đây chính là đường mà secret
 * lọt vào đĩa.
 *
 * CHI TIẾT ĐÃ ĐO, KHÔNG ĐOÁN: bản đầu dùng `z.strictObject`. Test `persist.test.ts`
 * "field lạ bị loại, phần hợp lệ vẫn ghi" FAIL và chỉ ra rằng zod v4 `strictObject`
 * **NÉM LỖI** khi gặp field lạ chứ không lược bỏ ⇒ `safeParse` fail ⇒ toàn bộ giá trị
 * rơi về mặc định, tức là một field lạ vô hại làm MẤT luôn tuỳ chọn hợp lệ của user.
 * `z.object` mới là cái lược bỏ field lạ. Đã đổi sang `z.object` và giữ nguyên ca test.
 */
import { z } from "zod";
import { StoreKeyError, assertNoSecret } from "./secrets";
import { PORT_CANDIDATES } from "../api/constants";

/** ALLOWLIST — danh sách ĐẦY ĐỦ, đúng bảng arch §4.1. Không có khoá nào ngoài bảng này. */
export const LS_KEYS = {
  setup: "kitgen.setup.v1",
  agent: "kitgen.agent.v1",
  workspace: "kitgen.workspace.v1",
  projectsCache: "kitgen.projects.cache.v1",
  ui: "kitgen.ui.v1",
  prefs: "kitgen.prefs.v1",
  recent: "kitgen.recent.v1",
  hints: "kitgen.hints.v1",
} as const;

export type LsKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];

const ALLOWED_KEYS: ReadonlySet<string> = new Set(Object.values(LS_KEYS));

export function isAllowedKey(key: string): key is LsKey {
  return ALLOWED_KEYS.has(key);
}
export function allowedKeys(): LsKey[] {
  return [...ALLOWED_KEYS] as LsKey[];
}

/* ═════════════ L2: schema strict cho từng khoá ═════════════ */

const setupSchema = z.object({
  completed: z.boolean().default(false),
  step: z.enum(["download", "run", "connect", "imagegen", "done"]).default("download"),
  agentVersionSeen: z.string().default(""),
  protocolSeen: z.number().default(0),
  imageGenMode: z.enum(["default-home", "img-home", "profile-overlay", "unavailable", "unknown"]).default("unknown"),
  checkedAt: z.string().default(""),
});

const agentSchema = z.object({
  baseUrl: z.string().default(""),
  portCandidates: z.array(z.number()).default([...PORT_CANDIDATES]),
  mode: z.enum(["remote", "mirror"]).default("remote"),
  instanceLabel: z.string().default(""),
  lastOkAt: z.string().default(""),
});

const workspaceSchema = z.object({
  workspaceId: z.string().default(""),
  /** nhãn RÚT GỌN `~/KitGen`, KHÔNG phải path tuyệt đối (arch §4.1 ghi rõ). */
  label: z.string().default(""),
  fingerprint: z.string().default(""),
  knownAt: z.string().default(""),
});

const projectsCacheSchema = z.object({
  fetchedAt: z.string().default(""),
  etag: z.string().default(""),
  workspaceFingerprint: z.string().default(""),
  items: z.array(z.object({
    id: z.string(),
    name: z.string().default(""),
    slug: z.string().default(""),
    description: z.string().default(""),
    updatedAt: z.string().default(""),
    tags: z.array(z.string()).default([]),
    stats: z.record(z.string(), z.unknown()).default({}),
    state: z.record(z.string(), z.unknown()).default({}),
    coverUrlPath: z.string().default(""),
    broken: z.boolean().default(false),
  })).default([]),
});

const uiSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  locale: z.enum(["vi", "en"]).default("vi"),
  density: z.enum(["comfortable", "compact"]).default("comfortable"),
  sidebarWidth: z.number().default(260),
  railCollapsed: z.boolean().default(false),
  projectsView: z.enum(["grid", "list"]).default("grid"),
  sortBy: z.enum(["updated", "name", "size", "created"]).default("updated"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  filterChip: z.enum(["all", "need-gen", "running", "failed", "unfinished"]).default("all"),
  filterTags: z.array(z.string()).default([]),
  filterQuery: z.string().default(""),
  collapsedSections: z.array(z.string()).default([]),
  lastTab: z.record(z.string(), z.string()).default({}),
  kitBackdrop: z.enum(["checker", "dark", "light"]).default("checker"),
  kitZoom: z.number().default(100),
});

const prefsSchema = z.object({
  maxJobs: z.number().int().min(1).max(8).default(4),
  autoSliceAfterGen: z.boolean().default(true),
  confirmDestructive: z.boolean().default(true),
  showEmptyCells: z.boolean().default(true),
  logTail: z.number().int().default(2000),
});

const recentSchema = z.object({
  projectIds: z.array(z.string()).max(10).default([]),
  lastOpenedId: z.string().default(""),
});

const hintsSchema = z.object({ dismissed: z.array(z.string()).default([]) });

export const SCHEMAS = {
  [LS_KEYS.setup]: setupSchema,
  [LS_KEYS.agent]: agentSchema,
  [LS_KEYS.workspace]: workspaceSchema,
  [LS_KEYS.projectsCache]: projectsCacheSchema,
  [LS_KEYS.ui]: uiSchema,
  [LS_KEYS.prefs]: prefsSchema,
  [LS_KEYS.recent]: recentSchema,
  [LS_KEYS.hints]: hintsSchema,
} as const;

export type StoreShape = { [K in LsKey]: z.infer<(typeof SCHEMAS)[K]> };

export function defaultsFor<K extends LsKey>(key: K): StoreShape[K] {
  return SCHEMAS[key].parse({}) as StoreShape[K];
}

/* ═════════════ L4: baseUrl bị giới hạn ═════════════ */

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[?::1\]?)$/;

/** §6.5-3: "Không lưu `baseUrl` do user gõ tự do". */
export function isAllowedBaseUrl(baseUrl: string, ports: readonly number[] = PORT_CANDIDATES): boolean {
  if (typeof baseUrl !== "string" || baseUrl === "") return false;
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "") return false;
  if (u.search !== "" || u.hash !== "") return false;
  if (u.pathname !== "/" && u.pathname !== "") return false;
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!LOOPBACK.test(host) && !LOOPBACK.test(u.hostname)) return false;
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  return ports.includes(port);
}

/* ═════════════ Backend (thay được để test) ═════════════ */

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function detectBackend(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__kitgen_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null; // Safari private / storage bị chặn → chạy bằng RAM, KHÔNG vỡ UI
  }
}

let backend: StorageLike | null = detectBackend();
const memory = new Map<string, string>();

export function memoryBackend(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

/** Chỉ dùng trong test. */
export function _setBackend(b: StorageLike | null): void {
  backend = b;
  memory.clear();
}

function rawGet(key: string): string | null {
  if (backend) {
    try {
      return backend.getItem(key);
    } catch {
      /* quota/chặn */
    }
  }
  return memory.get(key) ?? null;
}

function rawSet(key: string, value: string): void {
  if (backend) {
    try {
      backend.setItem(key, value);
      return;
    } catch {
      /* QuotaExceeded → hạ xuống RAM (arch §4.2 "không vỡ UI") */
    }
  }
  memory.set(key, value);
}

function rawRemove(key: string): void {
  if (backend) {
    try {
      backend.removeItem(key);
    } catch {
      /* noop */
    }
  }
  memory.delete(key);
}

/* ═════════════ API công khai ═════════════ */

/**
 * Ghi một khoá. Chạy đủ L1 → L2 → L3 → L4.
 * @throws {StoreKeyError} khoá không có trong allowlist
 * @throws {SecretLeakError} value có mùi secret
 */
export function storeSet<K extends LsKey>(key: K, value: unknown): StoreShape[K] {
  if (!isAllowedKey(key)) throw new StoreKeyError(String(key)); // L1
  // L3 chạy TRƯỚC L2, trên dữ liệu THÔ. Nếu quét sau khi schema đã lược field lạ thì một
  // secret nằm ở field lạ sẽ bị bỏ đi im lặng — không rò ra đĩa, nhưng người viết code
  // không bao giờ biết mình vừa suýt làm gì. Brief yêu cầu "ném lỗi rõ khi bị chặn".
  assertNoSecret(value, key);
  const parsed = SCHEMAS[key].safeParse(value); // L2 — field lạ bị lược bỏ
  if (!parsed.success) {
    // Dữ liệu không khớp schema ⇒ dùng mặc định thay vì ghi rác. Không ném: một
    // preference lệch không đáng làm cả app dừng.
    const fallback = defaultsFor(key);
    assertNoSecret(fallback, key); // L3
    rawSet(key, JSON.stringify(fallback));
    return fallback;
  }
  const clean = parsed.data as StoreShape[K];
  assertNoSecret(clean, key); // L3 — ném SecretLeakError, KHÔNG ghi
  if (key === LS_KEYS.agent) assertBaseUrl(clean as StoreShape[typeof LS_KEYS.agent]); // L4
  rawSet(key, JSON.stringify(clean));
  return clean;
}

function assertBaseUrl(value: StoreShape[typeof LS_KEYS.agent]): void {
  const base = value.baseUrl;
  if (!base) return;
  const ports = value.portCandidates?.length ? value.portCandidates : [...PORT_CANDIDATES];
  if (!isAllowedBaseUrl(base, ports)) {
    throw new StoreKeyError(`${LS_KEYS.agent}.baseUrl`);
  }
}

/** Đọc một khoá, luôn trả object đủ field (mặc định cho field thiếu). */
export function storeGet<K extends LsKey>(key: K): StoreShape[K] {
  if (!isAllowedKey(key)) throw new StoreKeyError(String(key));
  const raw = rawGet(key);
  if (raw === null) return defaultsFor(key);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return defaultsFor(key);
  }
  const r = SCHEMAS[key].safeParse(parsedJson);
  return (r.success ? r.data : defaultsFor(key)) as StoreShape[K];
}

/** Ghi một phần (merge với giá trị hiện tại). Vẫn chạy đủ 4 lớp. */
export function storePatch<K extends LsKey>(key: K, patch: Record<string, unknown>): StoreShape[K] {
  return storeSet(key, { ...(storeGet(key) as Record<string, unknown>), ...patch });
}

export function storeRemove(key: LsKey): void {
  if (!isAllowedKey(key)) throw new StoreKeyError(String(key));
  rawRemove(key);
}

/**
 * Storage engine cho `zustand/persist`. Bọc quanh `storeSet`/`storeGet` nên middleware
 * persist KHÔNG THỂ đi đường tắt: mọi thứ zustand ghi cũng phải qua allowlist + sanitize.
 *
 * `zustand/persist` bọc state trong `{state, version}`; ta chỉ lưu phần `state` để
 * schema strict soi được từng field, rồi dựng lại vỏ khi đọc.
 */
export function createPersistStorage<K extends LsKey>(key: K, version: number) {
  return {
    getItem: (name: string) => {
      if (name !== key) throw new StoreKeyError(name);
      const raw = rawGet(key);
      if (raw === null) return null;
      let obj: unknown;
      try {
        obj = JSON.parse(raw);
      } catch {
        return null;
      }
      // Chấp nhận cả hai dạng: `{state,version}` (do persist ghi) và phẳng (do storeSet ghi).
      const inner = (obj as { state?: unknown })?.state ?? obj;
      const r = SCHEMAS[key].safeParse(inner);
      if (!r.success) return null;
      return { state: r.data, version };
    },
    setItem: (name: string, value: { state: unknown; version?: number }) => {
      if (name !== key) throw new StoreKeyError(name);
      storeSet(key, value?.state);
    },
    removeItem: (name: string) => {
      if (name !== key) throw new StoreKeyError(name);
      rawRemove(key);
    },
  };
}

/**
 * `partialize` theo ALLOWLIST FIELD TƯỜNG MINH.
 * Cách này khác hẳn "bỏ những field tôi biết là xấu": nếu mai ai thêm field
 * `authToken` vào store, cách blacklist sẽ ghi nó ra đĩa, còn cách này bỏ qua.
 * Field không có trong danh sách ⇒ không bao giờ rời khỏi RAM.
 */
export function pickAllowed<T extends object, F extends keyof T>(state: T, fields: readonly F[]): Pick<T, F> {
  const out = {} as Pick<T, F>;
  for (const f of fields) {
    if (Object.hasOwn(state, f as string)) out[f] = state[f];
  }
  return out;
}

export { SecretLeakError, StoreKeyError } from "./secrets";
