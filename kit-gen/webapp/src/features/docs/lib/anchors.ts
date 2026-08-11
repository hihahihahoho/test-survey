/**
 * features/docs/lib/anchors.ts — CẦU NỐI giữa `error.docs` của agent và trang trợ giúp thật.
 *
 * VẤN ĐỀ CỤ THỂ ĐANG GIẢI: envelope lỗi (§6.1) luôn kèm
 *     "docs": "/docs/errors#contract-conflict"
 * Chuỗi đó do `agent/lib/errors.mjs` sinh ra, đúng công thức
 *     DOCS + code.toLowerCase().replace(/_/g, "-")
 * (đã đọc file thật, dòng 28 + 41). Nếu web không có gì ở địa chỉ ấy thì mỗi lần lỗi ta lại
 * đưa user tới một trang 404 — đúng kiểu "báo lỗi rồi bỏ đó" mà §3.9 cấm.
 *
 * TRẠNG THÁI THẬT (không nói vống):
 *  · Route `/docs/errors` thuộc `src/routes/**` — chủ sở hữu R1-P1, tôi KHÔNG được thêm.
 *  · Nên đích ĐANG DÙNG ĐƯỢC HÔM NAY là S6: `/settings?tab=env#loi-<anchor>`. Route
 *    `/settings` có thật, tab `env` có thật, và `SettingsScreen` đọc hash để mở đúng mục.
 *  · Khi R1-P1 thêm route `/docs/errors` (đã ghi teams/react/NEEDS-s6-settings.md), chỉ cần
 *    đổi `DOCS_ROUTE_READY = true` trong file này — không sửa chỗ nào khác.
 *
 * Mọi hàm ở đây là hàm THUẦN, có test trong `__tests__/docs.test.ts`.
 */

/** Đường dẫn chính tắc mà agent trỏ tới. */
export const CANONICAL_DOCS_PATH = "/docs/errors";

/**
 * Route `/docs/errors` đã tồn tại trong `routeTree.ts` chưa.
 * ĐỂ `false` cho tới khi R1-P1 khai route — bật sớm là tự tạo link 404.
 */
export const DOCS_ROUTE_READY = false;

/** Nơi trang trợ giúp đang sống khi chưa có route riêng (S6 tab Môi trường). */
export const FALLBACK_DOCS_PATH = "/settings";
export const FALLBACK_DOCS_SEARCH = "?tab=env";
/** Tiền tố hash để không đụng hash của ai khác (`loi` = lỗi, không dấu). */
export const HASH_PREFIX = "loi-";

/** `CONTRACT_CONFLICT` → `contract-conflict`. ĐÚNG công thức của agent, không tự nghĩ khác. */
export function errorAnchor(code: string): string {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

/** `contract-conflict` → `CONTRACT_CONFLICT`. */
export function codeFromAnchor(anchor: string): string {
  return String(anchor ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(new RegExp(`^${HASH_PREFIX}`), "")
    .replace(/^docs\/errors\/?/, "")
    .replace(/-/g, "_")
    .toUpperCase();
}

/**
 * Địa chỉ trong app để mở mục trợ giúp của một mã lỗi.
 * Trả về đường dẫn TƯƠNG ĐỐI với gốc bundle (`<base href>` trong index.html đã neo sẵn),
 * nên dùng được ở cả hai đường vào: Pages `/` và bản chạy tại máy `/app/`.
 */
export function docsHref(code: string): string {
  const a = errorAnchor(code);
  if (DOCS_ROUTE_READY) return `${CANONICAL_DOCS_PATH}#${a}`;
  return `${FALLBACK_DOCS_PATH}${FALLBACK_DOCS_SEARCH}#${HASH_PREFIX}${a}`;
}

/** id của phần tử DOM để `#hash` nhảy tới được. */
export function docsElementId(code: string): string {
  return `${HASH_PREFIX}${errorAnchor(code)}`;
}

/**
 * Đọc `error.docs` (hoặc bất kỳ URL/hash nào) ra mã lỗi.
 *
 * Khoan dung có chủ đích — nhận cả 5 dạng đã thấy hoặc có thể thấy:
 *   "/docs/errors#contract-conflict" · "docs/errors#contract-conflict"
 *   "http://127.0.0.1:8765/docs/errors#contract-conflict"
 *   "#loi-contract-conflict" · "/settings?tab=env#loi-contract-conflict"
 * Không khớp gì ⇒ `null` (người gọi tự quyết định làm gì, KHÔNG bịa mã).
 */
export function parseDocsLink(docs: unknown): string | null {
  if (typeof docs !== "string" || docs.trim() === "") return null;
  const hash = docs.slice(docs.indexOf("#") + 1);
  if (!docs.includes("#") || hash.trim() === "") return null;
  const code = codeFromAnchor(hash);
  return /^[A-Z][A-Z0-9_]*$/.test(code) ? code : null;
}

/**
 * Mã lỗi cần mở trợ giúp, suy từ hash hiện tại của trình duyệt.
 * Nhận cả `#loi-x`, `#docs/errors/x` và `#x` để link cũ/gõ tay đều tới đúng chỗ.
 */
export function codeFromLocationHash(hash: string | null | undefined): string | null {
  if (typeof hash !== "string" || hash.replace(/^#/, "").trim() === "") return null;
  return parseDocsLink(`#${hash.replace(/^#/, "")}`);
}
