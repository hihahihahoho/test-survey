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
 *  3. `QuotaExceededError` ⇒ dọn theo luật rồi thử LẠI MỘT LẦN; vẫn hỏng ⇒ trả kết quả
 *     hỏng KÈM LÝ DO (`DocsIdbWriteOutcome`), KHÔNG BAO GIỜ ném ra UI.
 *  4. Không có IndexedDB (Safari private, tab bị chặn) ⇒ `docsIdbAvailable()` false,
 *     mọi hàm trả rỗng. App mất chỗ lưu nháp chứ không trắng trang.
 */
import { SecretLeakError, assertNoSecret, warnSecretBlocked } from "@/lib/store";

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
 * FIELD CHỨA ID DO APP SINH (cùng nguyên tắc với `ID_FIELDS` của `lib/store/persist.ts`).
 *
 * `doc.id` là `f-<slug>` cắt 34 ký tự (`agent/lib/docs.mjs newId`, khớp `RE_DOC_ID` ở
 * `types.ts`), slug lấy từ TÊN FILE do user đặt. Một tên tiếng Việt đủ dài cho ra id kiểu
 * `f-mau-6-nhan-vat-quy-4-2025-b7k3ws`: 34 ký tự, entropy 4.07 > ngưỡng 4.0 ⇒ trúng
 * V-ENTROPY dù đây chỉ là mã file hiện ngay trên tab. `view.sheetIds`/`view.variantIds`
 * là id sheet/phong cách của contract, cùng bản chất. `canvas.nodes[].id` và `bind.id`
 * cũng do app sinh.
 *
 * KHÔNG khai `name`/`text`: đó là chữ NGƯỜI DÙNG gõ, phải chịu đủ mọi luật. Và như mọi
 * chỗ khác, miễn trừ này chỉ bỏ qua luật entropy cho giá trị đúng hình dạng id — token
 * thật đặt vào `doc.id` vẫn bị chặn bởi các pattern V-SK/V-JWT/V-BEARER/V-ABSPATH.
 */
const ID_FIELDS: ReadonlySet<string> = new Set(["id", "sheetIds", "variantIds"]);

/**
 * VÌ SAO KHÔNG CÒN LÀ `boolean`.
 *
 * `false` trần trả lời được "ghi hụt" nhưng KHÔNG trả lời được "vì sao", nên
 * `docs-repo-local.ts` phải đoán — và nó đoán *hết chỗ lưu* cho mọi ca. Người dùng gõ
 * một đường dẫn máy vào ghi chú rồi bị báo **"Máy đã hết chỗ lưu nháp. Xoá bớt file cũ
 * rồi thử lại"** sẽ đi xoá file của chính mình, xong thử lại, xong vẫn hỏng.
 *
 * Ba lý do là ba việc khác hẳn nhau ở phía người dùng:
 *  · `blocked` — giá trị trúng luật bảo mật ⇒ **sửa nội dung**, xoá bớt chẳng ích gì;
 *  · `full`    — quota đầy sau khi đã dọn + thử lại ⇒ **xoá bớt**;
 *  · `unavailable` — không mở được IndexedDB ⇒ **không có gì để làm**, chỉ cần biết là
 *    nháp sẽ không được giữ.
 */
export type DocsIdbWriteOutcome =
  | { ok: true }
  | { ok: false; reason: "blocked" | "full" | "unavailable" };

const WRITE_OK: DocsIdbWriteOutcome = { ok: true };

/**
 * Ghi. Quét secret TRƯỚC.
 *
 * FAIL-SOFT: trúng luật ⇒ KHÔNG ghi, cảnh báo một dòng đã che giá trị, trả kết quả hỏng
 * — KHÔNG ném. Bản trước ném `SecretLeakError` từ một hàm `async` ⇒ unhandled rejection
 * ở chỗ gọi không `catch`; bộ dò không được phép làm vỡ luồng nó đang bảo vệ (bài học
 * 2.1.17).
 * @returns `{ok:true}` nếu ghi được; quota đầy ⇒ dọn + thử lại đúng 1 lần rồi `full`.
 */
export async function docsIdbSet(key: string, value: unknown): Promise<DocsIdbWriteOutcome> {
  assertStore(DOCS_STORE);
  try {
    assertNoSecret(value, `idb.${DOCS_STORE}`, { idFields: ID_FIELDS });
  } catch (e) {
    if (!(e instanceof SecretLeakError)) throw e;
    warnSecretBlocked(`idb.${DOCS_STORE}`, e);
    return { ok: false, reason: "blocked" };
  }
  const db = await open();
  if (db === null) return { ok: false, reason: "unavailable" };
  try {
    await runTx(db, "readwrite", (os) => os.put(value, key));
    return WRITE_OK;
  } catch (e) {
    if ((e as { name?: string })?.name !== "QuotaExceededError") return { ok: false, reason: "unavailable" };
    await docsIdbPrune(key);
    try {
      await runTx(db, "readwrite", (os) => os.put(value, key));
      return WRITE_OK;
    } catch {
      return { ok: false, reason: "full" }; // vẫn hết chỗ → mất chỗ lưu, KHÔNG vỡ UI
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
