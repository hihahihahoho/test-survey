import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/** rgb(var(--x) / <alpha-value>) — cho phép `bg-surface/60` vẫn chạy đúng. */
const c = (v: string) => `rgb(var(--kg-${v}) / <alpha-value>)`;

export default {
  darkMode: "class", // dark-mode first: <html class="dark"> là mặc định
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // ---- §5.3 MÀU: chỉ tên semantic. Không có tên màu thô (blue/red/…) ----
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",

      canvas: c("canvas"),
      surface: c("surface"),
      raised: c("raised"),
      overlay: c("overlay"),
      scrim: c("scrim"),

      fg: {
        DEFAULT: c("fg-default"),
        strong: c("fg-strong"),
        muted: c("fg-muted"),
        "muted-raised": c("fg-muted-raised"),
        "on-accent": c("fg-on-accent"),
        "on-danger": c("fg-on-danger"),
      },

      line: {
        DEFAULT: c("line"),
        subtle: c("line-subtle"),
        strong: c("line-strong"),
      },

      /* FE-2·A1: thumb thanh cuộn Radix (`ui/scroll-area.tsx`) phải dùng màu ĐẶC —
         `bg-line/40` sau composite chỉ 1.59:1 (<3:1, WCAG 1.4.11). Biến CSS
         `--kg-scroll-thumb*` đã có trong tokens.css từ FE-1 nhưng CHƯA được khai ở đây
         nên class `bg-scroll-thumb` không sinh ra CSS. Khai đủ cả hai bậc. */
      "scroll-thumb": { DEFAULT: c("scroll-thumb"), hover: c("scroll-thumb-hover") },

      accent: { DEFAULT: c("accent"), text: c("accent-text"), hover: c("accent-hover"), active: c("accent-active") },
      "focus-ring": c("focus-ring"),

      ok: c("ok"),
      warn: c("warn"),
      danger: { DEFAULT: c("danger"), solid: c("danger-solid") },
      running: c("running"),
      stale: c("stale"),
      queued: c("queued"),
      never: c("never"),

      // chữ trên nền tint — BẮT BUỘC cho badge/pill (§5.5)
      "on-tint": {
        never: c("on-tint-never"),
        queued: c("on-tint-queued"),
        running: c("on-tint-running"),
        accent: c("on-tint-accent"),
        ok: c("on-tint-ok"),
        warn: c("on-tint-warn"),
        stale: c("on-tint-stale"),
        danger: c("on-tint-danger"),
      },
    },

    // ---- §5.1 BÁN KÍNH: đúng 4 bậc ----
    borderRadius: {
      none: "0px",
      1: "8px",
      2: "12px",
      3: "16px",
      4: "20px",
      5: "24px",
      full: "999px",
    },

    // ---- §5.2 THANG CHỮ: 7 bậc, sàn tuyệt đối 12px (đóng audit I3) ----
    fontSize: {
      /* ══ W2B-1 · BA BẬC DISPLAY — dựng vì thang cũ KHÔNG CÓ chỗ cho tiêu đề trang.
         Bậc cao nhất trước đây là `display` = 24px, nên **mọi H1 đều phải thoát ra
         bằng giá trị ngoặc vuông** và mỗi màn thoát một kiểu: Home 38 · Settings 34
         · Setup 38 · Workflow 52. Ba cỡ cho CÙNG MỘT CẤP ⇒ sang trang là mắt phải
         học lại cấp bậc.

         `display` (24px) GIỮ NGUYÊN — 20+ chỗ đang dùng nó đúng nghĩa "chữ to trong
         một thẻ" (`CanvasEmptyCard`, avatar…), đổi nó là đổi thứ đang đẹp. Ba bậc
         mới nằm TRÊN nó và chỉ dành cho tiêu đề TRANG.

         Cặp dùng thật: `text-display-2 sm:text-display-1` (= const `DISPLAY`) cho H1,
         `display-3` cho H2 cấp bước. Không bậc nào được gõ thẳng `text-[Npx]` nữa. */
      "display-1": ["44px", { lineHeight: "50px", letterSpacing: "-0.03em", fontWeight: "500" }],
      "display-2": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "500" }],
      "display-3": ["22px", { lineHeight: "30px", letterSpacing: "-0.015em", fontWeight: "600" }],

      display: ["24px", { lineHeight: "32px", fontWeight: "650" }],
      title: ["18px", { lineHeight: "26px", fontWeight: "600" }],
      subtitle: ["15px", { lineHeight: "22px", fontWeight: "600" }],
      body: ["14px", { lineHeight: "21px", fontWeight: "400" }],
      label: ["13px", { lineHeight: "18px", fontWeight: "500" }],
      caption: ["12px", { lineHeight: "16px", fontWeight: "400" }],
      mono: ["13px", { lineHeight: "20px", fontWeight: "400" }],
    },

    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },

      // ---- §5.1 spacing: thang mặc định Tailwind ĐÃ trùng 4px-base.
      // Chỉ thêm các kích thước KHUNG cố định của spec. ----
      spacing: {
        header: "56px", // QA-LEAD: FloraShell dùng h-14 (56px); token cũ 40px làm S3 tính dư 16px
        rail: "168px",
        "rail-collapsed": "48px",
        tree: "260px",
        props: "320px",
        row: "36px",
        "ctl-sm": "28px",
        "ctl-md": "32px",
        "ctl-lg": "40px",
      },
      width: {
        "modal-sm": "400px",
        "modal-md": "520px",
        "modal-lg": "720px",
        "modal-xl": "960px",
        drawer: "480px",
        "drawer-wide": "640px",
        toast: "360px",
      },
      /* QA-LEAD: `dialog.tsx` dùng `sm:max-w-modal-*`. Trước đây 4 cỡ này CHỈ có trong
         nhóm `width` ⇒ class `max-w-modal-*` KHÔNG sinh ra CSS ⇒ prop `size` của mọi
         Dialog vô tác dụng, modal nào cũng rộng gần bằng màn hình. Khai đủ ở `maxWidth`. */
      maxWidth: {
        "modal-sm": "400px",
        "modal-md": "520px",
        "modal-lg": "720px",
        "modal-xl": "960px",
      },
      maxHeight: { modal: "min(90vh, 720px)" },

      letterSpacing: { label: "0.04em" }, // header bảng: uppercase + .04em

      boxShadow: {
        1: "var(--kg-shadow-1)", // thẻ hover
        2: "var(--kg-shadow-2)", // menu, tooltip, toast
        3: "var(--kg-shadow-3)", // modal, drawer
      },

      zIndex: {
        sticky: "100",
        rail: "110",
        floatbar: "200",
        scrim: "500",
        modal: "510",
        drawer: "520",
        /**
         * ⚠️ `dropdown` PHẢI NẰM TRÊN `modal`/`drawer` — trước đây là `400`, tức DƯỚI
         * cả scrim.
         *
         * Hệ quả đo được: mọi `Select` / `Popover` / `DropdownMenu` mở TỪ TRONG một
         * `Dialog` đều vẽ SAU tấm modal ⇒ bấm vào mục trong danh sách thì trúng nội
         * dung của dialog nằm đè lên. Playwright gọi đúng tên nó: *"dialog subtree
         * intercepts pointer events"*. Đây không phải bệnh của riêng một màn: cùng lỗi
         * có sẵn ở `<Select>` trong `EditAssetDialog` (thư viện) và ở nút "Chọn mascot
         * có sẵn" trong modal Thêm nhân vật của wizard.
         *
         * Vì sao nâng lên là AN TOÀN chứ không phải nới bừa: một lớp nổi chỉ có thể
         * được mở bằng cách bấm vào trigger của nó, mà `Dialog` khoá tiêu điểm — nên
         * KHÔNG tồn tại tình huống "dropdown ở ngoài, modal ở trên": hai thứ này chỉ
         * gặp nhau khi dropdown được mở TỪ TRONG modal, và khi đó nó bắt buộc ở trên.
         * Giữ dưới `toast`/`tooltip` để hai lớp báo tin vẫn là lớp trên cùng.
         */
        dropdown: "530",
        toast: "600",
        tooltip: "700",
      },

      transitionTimingFunction: {
        out: "cubic-bezier(0.2, 0.8, 0.3, 1)",
        "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        instant: "80ms",
        fast: "120ms",
        1: "150ms",
        2: "240ms",
      },

      keyframes: {
        "kg-pulse": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        "kg-shimmer": { "100%": { transform: "translateX(100%)" } },
        "kg-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "kg-out": { from: { opacity: "1" }, to: { opacity: "0", transform: "translateY(4px) scale(0.98)" } },
      },
      animation: {
        "kg-pulse": "kg-pulse 1600ms cubic-bezier(0.4,0,0.2,1) infinite",
        "kg-shimmer": "kg-shimmer 1200ms infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
