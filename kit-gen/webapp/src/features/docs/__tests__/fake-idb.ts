/**
 * IDBFactory giả cho `docs-idb.ts`. Bản riêng của nhánh C — KHÔNG import
 * `features/design/safety/__tests__/fake-idb.ts` (file test của team khác; mượn chéo
 * làm hai nhánh khoá chân nhau khi một bên đổi). Cùng khuôn, thêm hai công tắc mà
 * test C1 cần: `_failQuotaAlways` (quota đầy vĩnh viễn) và `_openFails` (trình duyệt chặn IDB).
 */
type Store = Map<string, unknown>;

class FakeRequest<T> {
  result!: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

export interface FakeIdb extends IDBFactory {
  _dump: () => Record<string, unknown>;
  /** quota đầy N lần đầu (`Infinity` = luôn đầy). */
  _failQuota: (times: number) => void;
  /** `open()` ném ⇒ mô phỏng Safari private / tab bị chặn storage. */
  _openFails: (on: boolean) => void;
  /** ghi thẳng giá trị RÁC vào store, không qua schema — để test bản ghi hỏng. */
  _poke: (key: string, value: unknown) => void;
}

export function createFakeIdb(): FakeIdb {
  const stores = new Map<string, Store>();
  let quotaLeft = 0;
  let openFails = false;

  const factory = {
    open(_name: string, _version?: number) {
      const req: any = new FakeRequest<any>();
      req.onupgradeneeded = null;
      if (openFails) throw new Error("IDB bị chặn");
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

  factory._dump = () => Object.fromEntries(stores.get("docs") ?? new Map());
  factory._failQuota = (times) => {
    quotaLeft = times;
  };
  factory._openFails = (on) => {
    openFails = on;
  };
  factory._poke = (key, value) => {
    const s = stores.get("docs") ?? new Map();
    stores.set("docs", s);
    s.set(key, value);
  };

  function makeDb() {
    return {
      objectStoreNames: { contains: (n: string) => stores.has(n) },
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
              if (quotaLeft > 0) {
                quotaLeft--;
                const err: any = new Error("quota");
                err.name = "QuotaExceededError";
                throw err;
              }
              store.set(key, structuredClone(value));
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
