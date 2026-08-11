/**
 * IDBFactory giả, đủ cho `safety/idb.ts` — không cần `fake-indexeddb` (một phụ
 * thuộc mới trong `package.json` của R0, mà tôi không được sửa).
 *
 * Chỉ hiện thực đúng phần mà `idb.ts` dùng: open + onupgradeneeded + transaction
 * + get/put/delete/getAllKeys. Có công tắc `failOn` để mô phỏng QuotaExceededError.
 */
type Store = Map<string, unknown>;

class FakeRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

export interface FakeIdb extends IDBFactory {
  _dump: () => Record<string, Record<string, unknown>>;
  /** Đặt tên store để mọi lần `put` vào đó ném QuotaExceededError. */
  _failQuotaOn: (store: string | null) => void;
}

export function createFakeIdb(): FakeIdb {
  const stores = new Map<string, Store>();
  let quotaFail: string | null = null;

  const factory = {
    open(_name: string, _version?: number) {
      const req: any = new FakeRequest<any>();
      req.onupgradeneeded = null;
      queueMicrotask(() => {
        const db = makeDb();
        req.result = db;
        req.onupgradeneeded?.call(req);
        req.onsuccess?.call(req);
      });
      return req;
    },
    deleteDatabase() {
      stores.clear();
      return new FakeRequest<undefined>() as unknown as IDBOpenDBRequest;
    },
    cmp: (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0),
    databases: async () => [],
  } as unknown as FakeIdb;

  factory._dump = () => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [name, s] of stores) out[name] = Object.fromEntries(s);
    return out;
  };
  factory._failQuotaOn = (s) => {
    quotaFail = s;
  };

  function makeDb() {
    return {
      objectStoreNames: {
        contains: (n: string) => stores.has(n),
      },
      createObjectStore: (n: string) => {
        if (!stores.has(n)) stores.set(n, new Map());
        return {};
      },
      transaction(name: string, _mode?: string) {
        const store = stores.get(name) ?? new Map();
        stores.set(name, store);
        const tx: any = { oncomplete: null, onerror: null, onabort: null, error: null };
        const finish = (fn: () => void) =>
          queueMicrotask(() => {
            try {
              fn();
              tx.oncomplete?.();
            } catch (e) {
              tx.error = e;
              tx.onerror?.();
            }
          });
        tx.objectStore = () => ({
          get(key: string) {
            const req: any = new FakeRequest<unknown>();
            finish(() => {
              req.result = store.get(key) ?? undefined;
            });
            return req;
          },
          put(value: unknown, key: string) {
            const req: any = new FakeRequest<unknown>();
            finish(() => {
              if (quotaFail === name) {
                const err: any = new Error("quota");
                err.name = "QuotaExceededError";
                throw err;
              }
              store.set(key, value);
            });
            return req;
          },
          delete(key: string) {
            const req: any = new FakeRequest<unknown>();
            finish(() => void store.delete(key));
            return req;
          },
          getAllKeys() {
            const req: any = new FakeRequest<IDBValidKey[]>();
            finish(() => {
              req.result = [...store.keys()];
            });
            return req;
          },
        });
        return tx;
      },
    } as unknown as IDBDatabase;
  }

  return factory;
}
