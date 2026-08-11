/**
 * Xác định thư mục gốc của bundle, dùng chung cho <base href> và router.
 *
 * VÌ SAO CẦN: `base: "./"` khiến index.html trỏ `./assets/…`. Ở trang gốc thì
 * đúng, nhưng ở DEEP LINK `/app/p/tet26/design` trình duyệt phân giải nó thành
 * `/app/p/tet26/assets/…` → SPA fallback trả về HTML → thẻ <script> nhận HTML
 * → TRANG TRẮNG. Đây đúng là lỗi B2 mà INTEGRATION.md §0 đã ghi, và tôi đã
 * dựng server thật để tái hiện lại nó trước khi vá.
 *
 * CÁCH VÁ: đặt <base href> về đúng thư mục bundle NGAY TRƯỚC khi trình duyệt
 * gặp thẻ <script>. Từ đó mọi đường dẫn tương đối đều neo về gốc bundle, bất kể
 * URL sâu bao nhiêu tầng.
 */

/** Gốc bundle, luôn kết thúc bằng "/" — vd "/" hoặc "/app/". */
export function detectBaseHref(pathname: string): string {
  const i = pathname.indexOf("/app/");
  if (i !== -1) return pathname.slice(0, i + 5); // ".../app/"
  if (pathname === "/app") return "/app/";
  return "/";
}

/** basepath cho TanStack Router — KHÔNG có "/" ở cuối (trừ khi là gốc). */
export function toRouterBasepath(baseHref: string): string {
  return baseHref === "/" ? "/" : baseHref.replace(/\/$/, "");
}
