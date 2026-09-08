/** Shared compositions built only from the FLORA semantic tokens. */

/** Semantic Flora classes. Keep screen code free of raw visual values. */
export const FLORA = {
  canvas: "bg-canvas",
  surface: "bg-surface",
  raised: "bg-raised",
  overlay: "bg-overlay/90 supports-[backdrop-filter:blur(0px)]:bg-overlay/72 backdrop-blur-xl",
  fgStrong: "text-fg-strong",
  fg: "text-fg",
  fgMuted: "text-fg-muted",
  hair: "border-line-subtle",
  hairHover: "border-line-strong",
  ctlBorder: "border-line",
  hairBg: "bg-line-subtle",
  accentBg: "bg-accent",
  accentText: "text-accent-text",
  accentBorder: "border-accent",
  onAccent: "text-fg-on-accent",
  r12: "rounded-2",
  r16: "rounded-3",
  r20: "rounded-4",
  r24: "rounded-5",
  pill: "rounded-full",
} as const;

/**
 * Serif italic nhấn — dấu ấn nhận diện mạnh nhất của FLORA (§2.5):
 * *"Your **creative** environment."*
 *
 * Playfair Display đã được self-host, nên không phụ thuộc CDN lúc runtime.
 *
 * ══ LUẬT PLAYFAIR (W2B-5) — thành văn, vì trước đây nó làm 5 việc khác nhau ══
 * Chỉ **một** trong năm chỗ đó là đúng. Ba điều kiện, phải đủ cả ba:
 *   ① chỉ xuất hiện trong `<h1><em>` — tiêu đề TRANG, không phải h2/h3 của thẻ;
 *   ② tối đa **1 từ**;
 *   ③ chỉ khi tiêu đề có **≥3 từ** — nếu không, từ nghiêng chiếm nửa tiêu đề và
 *      hết còn là "nhấn".
 * Theo luật: "Bộ kit *của bạn*" ✓ · "Một mạch để *vẽ*" ✓ · "Cài **đặt**" ✗ (2 từ
 * ⇒ đã bỏ nghiêng ở `SettingsScreen`) · `.kitset-summary h3` "8 element" ✗ (serif
 * trang trí đè lên DỮ LIỆU ⇒ đã đổi sang `font-sans tabular-nums`) · `.preview-wheel`
 * Playfair 80px làm nội dung giả ✗ (rule đã xoá cùng markup ở W3-6).
 *
 * `italic` phải viết TƯỜNG MINH: `fonts.css` chỉ nạp face *italic* của Playfair,
 * không có face đứng. Chỗ nào quên `italic` là đang xin một face KHÔNG TỒN TẠI và
 * chỉ nghiêng nhờ UA stylesheet của `<em>` — đúng thứ mong manh mà W2B dọn.
 */
export const SERIF = "font-serif italic font-normal";

/**
 * Tiêu đề TRANG kiểu FLORA — **dùng ở mọi H1, không ngoại lệ** (W2B-1).
 *
 * TRƯỚC: `text-[30px] … sm:text-[38px]` gõ tay, và 3 màn khác lại gõ 34/38/52 ⇒ ba
 * cỡ cho cùng một cấp. NAY hai bậc trên thang (`tailwind.config.ts`), nên đổi nhịp
 * tiêu đề toàn app là đổi ĐÚNG MỘT chỗ.
 */
export const DISPLAY = "text-display-2 sm:text-display-1";

/**
 * Nền dot-grid RẤT MỜ (§2.7) — gợi cảm giác không gian làm việc vô hạn.
 * Chấm 1px, bước 22px, alpha .07: thấy được chất liệu mà không cạnh tranh với nội dung.
 * `bg-fixed` để lưới không "trôi" theo khi cuộn danh sách.
 */
export const DOTGRID = "kg-dotgrid";

/** Focus ring dùng CHUNG — token của R0, không hardcode màu. */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/**
 * Nút CTA accent (§2.3 + §2.4). Dùng cho ĐÚNG 1 nút chính mỗi màn (§5.4 UX-SPEC).
 *
 * P-SWEEP — bo `rounded-1` chứ không `FLORA.pill` nữa: `CTA` luôn được đắp lên một
 * `<Button>`, mà `cn()` dùng tailwind-merge nên `rounded-full` ở đây sẽ THẮNG bo 8px
 * của Button base — tức là mọi nút chính lại là viên thuốc trong khi mọi nút khác đã
 * bo 8px. Đó đúng là sự bất nhất mà lượt này dọn; sửa ở đây mới sửa được tận gốc.
 */
export const CTA = [
  FLORA.accentBg, FLORA.onAccent, "rounded-1",
  "hover:bg-accent-hover active:bg-accent-active",
  "font-medium",
].join(" ");

/** Card nổi kiểu FLORA: surface + hairline + bo lớn. */
export const CARD = `${FLORA.surface} border ${FLORA.hair} ${FLORA.r20}`;
