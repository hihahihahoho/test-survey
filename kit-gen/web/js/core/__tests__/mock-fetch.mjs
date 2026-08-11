/** fetch giả để test chính sách timeout/retry mà không cần mạng. */

export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  const h = new Map(Object.entries({ 'X-KitGen-Protocol': '1', ...headers })
    .map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

export function ndjsonResponse(chunks, { status = 200, headers = {} } = {}) {
  const h = new Map(Object.entries({ 'X-KitGen-Protocol': '1', ...headers })
    .map(([k, v]) => [k.toLowerCase(), String(v)]));
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { done: false, value: enc.encode(chunks[i++]) }
          : { done: true, value: undefined }),
        cancel: async () => {},
      }),
    },
    json: async () => { throw new Error('không phải json'); },
    text: async () => chunks.join(''),
  };
}

/**
 * Tạo fetch giả có ghi log.
 * @param {(call:{url:string,init:object,n:number}) => object|Error} handler
 */
export function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    const n = calls.length + 1;
    calls.push({ url, init, method: init?.method ?? 'GET', headers: init?.headers ?? {} });
    const r = handler({ url, init, n });
    if (r instanceof Error) throw r;
    return r;
  };
  fn.calls = calls;
  return fn;
}

/** Lỗi mà fetch ném khi bị chặn hoặc agent chưa chạy (không phân biệt được — arch §5.3). */
export function failedToFetch() {
  return new TypeError('Failed to fetch');
}
