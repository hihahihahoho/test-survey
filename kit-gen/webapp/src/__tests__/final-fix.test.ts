/**
 * ĐỘI SỬA CUỐI — khoá lại 3 lỗi mà ACCEPT-FINAL.md bắt được trên ẢNH, để chúng
 * không quay lại bằng một lần refactor nào đó.
 *
 * Cả ba đều là lỗi **tĩnh** (một luật CSS thiếu, một class thiếu, một thẻ đứng sai
 * chỗ trong HTML) nên test tĩnh trên nguồn là thứ duy nhất bắt được — cùng lối mà
 * `w2a-system-beauty.test.ts` / `w2b-dosage.test.ts` đã dùng và đã có tác dụng.
 *
 * Bằng chứng THẬT của cả ba nằm ở ảnh chụp (`teams/react/eye-qa/suite/shots`), và
 * riêng N1 còn có một phép đo chạy trong trình duyệt thật: `shots.spec.mjs` khẳng
 * định `document.scrollWidth <= 380` ở viewport 375 TRƯỚC khi bấm máy ảnh. Test ở
 * đây canh cái nguyên nhân; ảnh + phép đo kia chứng cái kết quả.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(new URL(".", import.meta.url).pathname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Bóc chú thích: cổng phải đo LUẬT, không đo văn xuôi giải thích luật. */
const stripCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");

const GLOBALS = stripCss(read("src/styles/globals.css"));
const SONNER = read("src/components/ui/sonner.tsx");
const INDEX = read("index.html");

/* ══════════════════════════════════════════════════════════════════════════════
   N1 · MOBILE BƯỚC ⑥ TRÀN NGANG — `.workflow-actions` phải xuống dòng ở màn hẹp
   Ảnh 30 cũ: PNG rộng 622px trên viewport 375 (full-page lấy theo scrollWidth).
   Bốn nút cửa ra + 3 gap không co được, mà hàng thì `flex` nowrap.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("N1 · hàng nút cửa ra không được làm vỡ trang ngang", () => {
  /** Khối `@media (max-width: 639px)` chứa `.workflow-actions` — cắt ra để soi. */
  const narrowBlocks = GLOBALS.match(/@media\s*\(max-width:\s*639px\)\s*\{[\s\S]*?\n\s{2}\}/g) ?? [];
  const block = narrowBlocks.find((b) => b.includes(".workflow-actions"));

  it("có một khối @media hẹp nói về `.workflow-actions`", () => {
    expect(block).toBeTruthy();
  });

  /* P-SWEEP·15 nới HÌNH THÁI, không nới ĐIỀU KIỆN. Bệnh N1 canh là: dưới 640px hàng
     vẫn là MỘT HÀNG NGANG `flex` nowrap ⇒ 4 nút + 3 gap = 622px trên viewport 375 ⇒
     cả trang cuộn ngang. Thuốc cũ là `flex-col`; thuốc mới là `grid grid-cols-2` +
     nút chính `col-span-2` — vì bốn thanh full-width xếp chồng, ba cái xám y hệt
     nhau, không đọc ra cái nào là cửa ra (POLISH-SWEEP mục 15).
     Cả hai đều thoả điều kiện thật: bỏ trục ngang một-hàng, mọi con full-width. Nên
     ca này nhận cả hai hình thái và vẫn ĐỎ nếu ai trả hàng về `flex` nowrap.
     Bằng chứng kết quả không đổi: `shots.spec.mjs` vẫn đo `document.scrollWidth <=
     380` ở viewport 375 TRƯỚC khi chụp ảnh 30. */
  it("dưới 640px hàng bỏ trục ngang một-hàng, và mọi con full-width", () => {
    expect(block).toMatch(/\.workflow-actions\s*\{\s*@apply[^}]*\b(flex-col|grid)\b/);
    expect(block).toMatch(/\.workflow-actions\s*\{\s*@apply[^}]*items-stretch/);
    expect(block).toMatch(/\.workflow-actions\s*>\s*\*\s*\{\s*@apply[^}]*w-full/);
  });

  it("spacer `flex-1` bị ẩn ở cột — nếu không nó giãn theo CHIỀU DỌC", () => {
    expect(block).toMatch(/\.workflow-action-spacer\s*\{\s*@apply[^}]*hidden/);
  });

  it("hàng ở bề ngang thường vẫn `flex-wrap` — lưới an toàn cho bậc trung gian", () => {
    const base = GLOBALS.match(/\n\s*\.workflow-actions\s*\{\s*@apply([^}]*)\}/)?.[1] ?? "";
    expect(base).toMatch(/\bflex-wrap\b/);
    expect(base).toMatch(/\bflex\b/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   V1 · NÚT ✕ ĐÈ LÊN TIÊU ĐỀ TOAST (ảnh 25)
   `[data-close-button]` là position:absolute ⇒ không đẩy được chữ. Tiêu đề phải
   tự chừa chỗ.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("V1 · tiêu đề toast chừa chỗ cho nút đóng", () => {
  it("class `title` của Toaster có padding phải", () => {
    const title = SONNER.match(/\n\s*title:\s*"([^"]+)"/)?.[1] ?? "";
    expect(title).toMatch(/\bpr-\d/);
  });

  it("nút ✕ vẫn còn (toast lỗi không tự đóng — bỏ nút là bẫy UX)", () => {
    expect(SONNER).toMatch(/\bcloseButton\b/);
    expect(SONNER).toMatch(/error:\s*Infinity/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   V7 · PRELOAD FONT 404 TRÊN ROUTE LỒNG
   `vite base:"./"` viết href thành `./fonts/…`; ở `/app/k/<id>` nó ra
   `/app/k/fonts/…`. `<base>` đặt SAU thì đã muộn — nó chỉ đổi cách phân giải của
   phần tử phân tích sau nó.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("V7 · preload font phải là đường tuyệt đối theo base app", () => {
  it("không còn thẻ <link rel=preload> tĩnh trỏ font bằng đường tương đối/gốc", () => {
    expect(INDEX).not.toMatch(/<link[^>]*rel="preload"[^>]*fonts\//);
  });

  it("preload do script dựng, href ghép từ `base` (⇒ tuyệt đối)", () => {
    expect(INDEX).toMatch(/link\.rel\s*=\s*"preload"/);
    expect(INDEX).toMatch(/link\.href\s*=\s*base\s*\+\s*"fonts\/"/);
    expect(INDEX).toMatch(/geist-latin\.woff2/);
    expect(INDEX).toMatch(/playfair-latin\.woff2/);
  });

  it("khối <base> đứng TRƯỚC <title> và trước script module của Vite", () => {
    const baseAt = INDEX.indexOf('el.setAttribute("href", base)');
    // `<title>` cũng xuất hiện trong chú thích dòng 2 — neo vào thẻ THẬT.
    const titleAt = INDEX.indexOf("<title>kit-gen");
    const viteAt = INDEX.indexOf('<script type="module"');
    expect(baseAt).toBeGreaterThan(-1);
    expect(baseAt).toBeLessThan(titleAt);
    expect(baseAt).toBeLessThan(viteAt);
  });
});
