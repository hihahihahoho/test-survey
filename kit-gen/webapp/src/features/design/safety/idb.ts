/**
 * features/design/safety/idb.ts — CỬA DUY NHẤT tới IndexedDB (architecture §4.2).
 *
 * DB `kitgen` v1, đúng 3 store của arch §4.2 — KHÔNG có store thứ tư:
 *   drafts  key=projectId  {contract, baseVersion, savedAt, dirtyFields}  nháp editor tự lưu 2s
 *   thumbs  key=`${projectId}/${relPath}@${mtimeMs}`  Blob PNG ≤256px
 *   runlog  key=runId      {projectId, lines[≤5000], updatedAt}           log xem lại khi agent tắt
 *
 * ╔═ VÌ SAO FILE NÀY NẰM Ở ĐÂY (nợ kỹ thuật, đã khai báo) ══════════════════════╗
 * ║ §6.5-2 nói "MỘT cửa lưu trữ duy nhất". `lib/store/persist.ts` của R0 mới chỉ ║
 * ║ làm localStorage; IndexedDB CHƯA CÓ ai dựng (đã grep toàn `webapp/src`: 0    ║
 * ║ kết quả cho `indexedDB`). Hai hạng mục MUST của tôi đều cần nó (nháp editor  ║
 * ║ §3.7 + log run §3-S4-5), mà brief cấm sửa file của team khác ⇒ dựng tạm      ║
 * ║ trong nhánh mình, đúng schema arch §4.2, sẵn sàng chuyển sang `lib/store/`.  ║
 * ║ TODO(N1): xoá file này khi R0 nộp `lib/store/idb.ts` — teams/react/NEEDS-safety-runs.md ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * BỐN LUẬT (arch §4.2 + §4.4):
 *  1. Store lạ ⇒ throw. Không có đường ghi vào store ngoài allowlist.
 *  2. Mọi giá trị ghi vào `drafts`/`runlog` bị QUÉT SECRET (`assertNoSecret` của R0).
 *     Agent đã redact log rồi; đây là lớp phòng thủ THỨ HAI, vì log codex là nơi
 *     token dễ lọt nhất (arch §4.3-6). Trúng luật ⇒ KHÔNG ghi + cảnh báo một dòng đã
 *     che giá trị + trả `false` (fail-soft, xem `idbSet`) — bộ dò không được phép làm
 *     vỡ luồng gọi nó.
 *  3. `QuotaExceededError` ⇒ dọn theo luật rồi thử LẠI MỘT LẦN; vẫn hỏng thì tắt
 *     cache và trả `false`. KHÔNG BAO GIỜ ném ra UI (arch §4.2 câu cuối).
 *  4. Không có IndexedDB (Safari private, tab bị chặn storage) ⇒ `available()` false,
 *     mọi hàm trả rỗng. App mất cache chứ không mất tính năng.
 */
import { SecretLeakError, assertNoSecret, warnSecretBlocked } from "@/lib/store";

export const IDB_NAME = "kitgen";
export const IDB_VERSION = 1;

export const IDB_STORES = {
  drafts: "drafts",
  thumbs: "thumbs",
  runlog: "runlog",
} as const;
export type IdbStore = (typeof IDB_STORES)[keyof typeof IDB_STORES];

const STORE_NAMES: readonly string[] = Object.values(IDB_STORES);

/** Giữ 20 run gần nhất (arch §4.2); mỗi run ≤5000 dòng (§3-S4-5). */
export const IDB_LIMITS = { runlogKeepRuns: 20, runlogMaxLines: 5000 } as const;

export class IdbStoreError extends Error {
  readonly code = "IDB_STORE_NOT_ALLOWED";
  constructor(readonly store: string) {
    super(`Chặn: store "${store}" không có trong allowlist IndexedDB (architecture §4.2).`);
    this.name = "IdbStoreError";
  }
}

/* ═════════════ Kết nối ═════════════ */

let factory: IDBFactory | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let disabled = false;

/** Tiêm IDBFactory (test dùng bản giả; `null` = dùng của trình duyệt). */
export function configureIdb(impl: IDBFactory | null): void {
  factory = impl;
  dbPromise = null;
  disabled = false;
}

function theFactory(): IDBFactory | null {
  if (factory !== null) return factory;
  return typeof indexedDB !== "undefined" ? indexedDB : null;
}

export function idbAvailable(): boolean {
  return !disabled && theFactory() !== null;
}

function assertStore(name: string): asserts name is IdbStore {
  if (!STORE_NAMES.includes(name)) throw new IdbStoreError(name);
}

function open(): Promise<IDBDatabase | null> {
  if (!idbAvailable()) return Promise.resolve(null);
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = theFactory()!.open(IDB_NAME, IDB_VERSION);
    } catch {
      disabled = true;
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      disabled = true;
      resolve(null);
    };
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function runTx<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(store, mode);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result ?? null);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error("IDB transaction lỗi"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB transaction bị huỷ"));
  });
}

/* ═════════════ Thao tác thô ═════════════ */

/** Đọc. Không có IDB / lỗi ⇒ `null`; KHÔNG bao giờ ném ra UI. */
export async function idbGet<T>(store: IdbStore, key: string): Promise<T | null> {
  assertStore(store);
  const db = await open();
  if (db === null) return null;
  try {
    return (await runTx<T>(db, store, "readonly", (os) => os.get(key) as IDBRequest<T>)) ?? null;
  } catch {
    return null;
  }
}

/**
 * FIELD CHỨA ID DO APP SINH — khai theo TỪNG STORE, cùng nguyên tắc với `ID_FIELDS`
 * của `lib/store/persist.ts` (xem chú thích ở đó cho lý do đầy đủ).
 *
 * Vì sao cần ở đây: id của app là `<slug>-<hex>` lấy từ tên do user đặt, nên id dài
 * ≥32 ký tự và nhiều ký tự khác nhau ⇒ entropy Shannon vượt ngưỡng 4.0 của luật
 * V-ENTROPY dù đây là id CÔNG KHAI, không phải secret. Cụ thể ở hai store này:
 *   · `runlog.projectId` — project id (≤48 ký tự, `agent/lib/paths.mjs RE_PROJECT_ID`);
 *   · `drafts` → `contract.sheets[].id` / `variants[].id` / `characters[].id` — mã sheet
 *     tới 32 ký tự (`RE_SHEET_ID`), cũng do slugify tên mà ra.
 * Không khai thì một dự án tên dài làm hỏng nháp editor và cache log của chính nó.
 *
 * KHÔNG khai `lines`/`text` của runlog: log codex CHÍNH LÀ nơi token dễ lọt nhất
 * (arch §4.3-6) ⇒ phần đó phải chịu đủ mọi luật, không có ngoại lệ nào.
 */
const ID_FIELDS: Partial<Record<IdbStore, ReadonlySet<string>>> = {
  [IDB_STORES.drafts]: new Set(["id", "projectId"]),
  [IDB_STORES.runlog]: new Set(["projectId"]),
};

/**
 * Ghi. Quét secret trước (trừ `thumbs` — Blob ảnh, quét vô nghĩa).
 *
 * FAIL-SOFT: trúng luật ⇒ KHÔNG ghi, cảnh báo một dòng đã che giá trị, trả `false` —
 * ĐÚNG mã trả về của "hết chỗ / không ghi được" mà mọi chỗ gọi đã xử lý sẵn. Trước đây
 * hàm này ném `SecretLeakError`; vì nó `async`, cú ném đó thành **unhandled rejection**
 * ở những chỗ gọi kiểu `void (async () => …)()` (nháp editor tự lưu) — tức là bộ dò
 * bảo vệ dữ liệu bằng cách làm hỏng luồng, đúng loại lỗi vừa vỡ ở bản 2.1.17. Dữ liệu
 * KHÔNG rò ra đĩa ở cả hai cách; khác biệt chỉ là app còn chạy tiếp hay không.
 * @returns `true` nếu đã ghi được. Quota đầy ⇒ dọn + thử lại 1 lần.
 */
export async function idbSet(store: IdbStore, key: string, value: unknown): Promise<boolean> {
  assertStore(store);
  if (store !== IDB_STORES.thumbs) {
    const idFields = ID_FIELDS[store];
    try {
      assertNoSecret(value, `idb.${store}`, idFields ? { idFields } : {});
    } catch (e) {
      if (!(e instanceof SecretLeakError)) throw e;
      warnSecretBlocked(`idb.${store}`, e);
      return false;
    }
  }
  const db = await open();
  if (db === null) return false;
  try {
    await runTx(db, store, "readwrite", (os) => os.put(value, key));
    return true;
  } catch (e) {
    if ((e as { name?: string })?.name !== "QuotaExceededError") return false;
    await idbPrune(store);
    try {
      await runTx(db, store, "readwrite", (os) => os.put(value, key));
      return true;
    } catch {
      return false; // vẫn hết chỗ → tắt cache, KHÔNG vỡ UI
    }
  }
}

export async function idbDel(store: IdbStore, key: string): Promise<boolean> {
  assertStore(store);
  const db = await open();
  if (db === null) return false;
  try {
    await runTx(db, store, "readwrite", (os) => os.delete(key));
    return true;
  } catch {
    return false;
  }
}

export async function idbKeys(store: IdbStore): Promise<string[]> {
  assertStore(store);
  const db = await open();
  if (db === null) return [];
  try {
    const all = await runTx<IDBValidKey[]>(db, store, "readonly", (os) => os.getAllKeys());
    return (all ?? []).map(String);
  } catch {
    return [];
  }
}

/** Dọn theo arch §4.2: `runlog` giữ 20 run; `thumbs` bỏ nửa cũ. `drafts` KHÔNG tự dọn. */
export async function idbPrune(store: IdbStore): Promise<void> {
  assertStore(store);
  if (store === IDB_STORES.drafts) return; // nháp là thứ DUY NHẤT không tái tạo được
  const all = await idbKeys(store);
  if (store === IDB_STORES.runlog && all.length > IDB_LIMITS.runlogKeepRuns) {
    for (const k of all.slice(0, all.length - IDB_LIMITS.runlogKeepRuns)) await idbDel(store, k);
    return;
  }
  if (store === IDB_STORES.thumbs && all.length > 0) {
    for (const k of all.slice(0, Math.ceil(all.length / 2))) await idbDel(store, k);
  }
}
