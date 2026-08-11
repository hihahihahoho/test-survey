/**
 * features/docs/lib/docs-idb.ts — CỬA LƯU TRỮ TẠM cho file con (store `docs`).
 *
 * ╔═ VÌ SAO CÓ FILE NÀY, VÀ VÌ SAO NÓ LÀ TẠM ════════════════════════════════════════╗
 * ║ UI-SPEC-V2 [REV] §2.9 chốt: file con lưu **IndexedDB**, KHÔNG localStorage       ║
 * ║ (`lib/store/persist.ts` của R0 có allowlist 8 khoá TĨNH ⇒ khoá động              ║
 * ║ `${projectId}/${docId}` không thể nằm trong đó ⇒ `StoreKeyError`).               ║
 * ║ Cửa IndexedDB đã có là `features/design/safety/idb.ts` (DB `kitgen` v1) nhưng nó ║
 * ║ allowlist ĐÚNG 3 store (`drafts`/`thumbs`/`runlog`) và store lạ ⇒ `IdbStoreError`;║
 * ║ thêm store thứ 4 phải bump `IDB_VERSION` — **file của team khác, brief cấm sửa**.║
 * ║ ⇒ Dựng adapter riêng trong nhánh C, **đúng schema và đúng 4 luật của idb.ts**,   ║
 * ║   trên DB riêng `kitgen-docs` v1 để không đụng vòng đời `onupgradeneeded` của họ.║
 * ║ TODO(C1-N1): xoá file này, chuyển sang store `docs` của DB `kitgen` khi R0 nhận  ║
 * ║   đề nghị ở `teams/react/NEEDS-canvas-store.md`. Đổi ĐÚNG file này, KHÔNG đổi     ║
 * ║   `docs-repo.ts` và không đổi component.                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════╝
 *
 * BỐN LUẬT (chép nguyên tinh thần `safety/idb.ts`, arch §4.2/§4.4):
 *  1. Store lạ ⇒ throw. Không có đường ghi ngoài allowlist.
 *  2. Mọi giá trị ghi bị quét secret bằng `assertNoSecret` của R0 (lớp phòng thủ thứ hai).
 *  3. `QuotaExceededError` ⇒ dọn theo luật rồi thử LẠI MỘT LẦN; vẫn hỏng ⇒ trả `false`,
 *     KHÔNG BAO GIỜ ném ra UI.
 *  4. Không có IndexedDB (Safari private, tab bị chặn) ⇒ `docsIdbAvailable()` false,
 *     mọi hàm trả rỗng. App mất chỗ lưu nháp chứ không trắng trang.
 */
import { assertNoSecret } from "@/lib/store";

export const DOCS_IDB_NAME = "kitgen-docs";
export const DOCS_IDB_VERSION = 1;
export const DOCS_STORE = "docs" as const;
const STORE_NAMES: readonly string[] = [DOCS_STORE];

/** Dọn khi quota đầy: giữ tối đa ngần này bản ghi (bản ghi cũ nhất theo khoá bị bỏ trước). */
export const DOCS_IDB_LIMITS = { keepRecords: 200 } as const;

export class DocsIdbStoreError extends Error {
  readonly code = "IDB_STORE_NOT_ALLOWED";
  constructor(readonly store: string) {
    super(`Chặn: store "${store}" không có trong allowlist IndexedDB của file con.`);
    this.name = "DocsIdbStoreError";
  }
}

/** Khoá bản ghi — đúng dạng `${projectId}/${docId}` mà [REV] §2.9 chỉ định. */
export function docKey(projectId: string, docId: string): string {
  return `${projectId}/${docId}`;
}
export function keyPrefix(projectId: string): string {
  return `${projectId}/`;
}

let factory: IDBFactory | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;
let disabled = false;

/** Tiêm IDBFactory (test dùng bản giả; `null` = dùng của trình duyệt). */
export function configureDocsIdb(impl: IDBFactory | null): void {
  factory = impl;
  dbPromise = null;
  disabled = false;
}

function theFactory(): IDBFactory | null {
  if (factory !== null) return factory;
  return typeof indexedDB !== "undefined" ? indexedDB : null;
}

export function docsIdbAvailable(): boolean {
  return !disabled && theFactory() !== null;
}

function assertStore(name: string): void {
  if (!STORE_NAMES.includes(name)) throw new DocsIdbStoreError(name);
}

function open(): Promise<IDBDatabase | null> {
  if (!docsIdbAvailable()) return Promise.resolve(null);
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = theFactory()!.open(DOCS_IDB_NAME, DOCS_IDB_VERSION);
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
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(DOCS_STORE, mode);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const req = fn(tx.objectStore(DOCS_STORE));
    tx.oncomplete = () => resolve(req.result ?? null);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error("IDB transaction lỗi"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB transaction bị huỷ"));
  });
}

/** Đọc. Không có IDB / lỗi ⇒ `null`; KHÔNG bao giờ ném ra UI. */
export async function docsIdbGet<T>(key: string): Promise<T | null> {
  assertStore(DOCS_STORE);
  const db = await open();
  if (db === null) return null;
  try {
    return (await runTx<T>(db, "readonly", (os) => os.get(key) as IDBRequest<T>)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Ghi. Quét secret TRƯỚC.
 * @returns `true` nếu ghi được. Quota đầy ⇒ dọn + thử lại đúng 1 lần rồi `false`.
 * @throws SecretLeakError — CỐ Ý ném: chỗ gọi phải biết mình vừa suýt ghi secret.
 */
export async function docsIdbSet(key: string, value: unknown): Promise<boolean> {
  assertStore(DOCS_STORE);
  assertNoSecret(value, `idb.${DOCS_STORE}`);
  const db = await open();
  if (db === null) return false;
  try {
    await runTx(db, "readwrite", (os) => os.put(value, key));
    return true;
  } catch (e) {
    if ((e as { name?: string })?.name !== "QuotaExceededError") return false;
    await docsIdbPrune(key);
    try {
      await runTx(db, "readwrite", (os) => os.put(value, key));
      return true;
    } catch {
      return false; // vẫn hết chỗ → mất chỗ lưu, KHÔNG vỡ UI
    }
  }
}

export async function docsIdbDel(key: string): Promise<boolean> {
  assertStore(DOCS_STORE);
  const db = await open();
  if (db === null) return false;
  try {
    await runTx(db, "readwrite", (os) => os.delete(key));
    return true;
  } catch {
    return false;
  }
}

export async function docsIdbKeys(prefix?: string): Promise<string[]> {
  assertStore(DOCS_STORE);
  const db = await open();
  if (db === null) return [];
  try {
    const all = await runTx<IDBValidKey[]>(db, "readonly", (os) => os.getAllKeys());
    const keys = (all ?? []).map(String);
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  } catch {
    return [];
  }
}

/**
 * Dọn khi quota đầy. Nháp file con là thứ KHÔNG tái tạo được ⇒ dọn dè dặt:
 * chỉ bỏ bản ghi vượt `keepRecords`, và KHÔNG BAO GIỜ bỏ khoá đang được ghi (`protect`).
 */
export async function docsIdbPrune(protect?: string): Promise<void> {
  const all = await docsIdbKeys();
  const victims = all.filter((k) => k !== protect);
  if (victims.length <= DOCS_IDB_LIMITS.keepRecords) return;
  for (const k of victims.slice(0, victims.length - DOCS_IDB_LIMITS.keepRecords)) {
    await docsIdbDel(k);
  }
}
