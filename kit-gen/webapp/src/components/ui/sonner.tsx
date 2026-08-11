import { Toaster as Sonner, toast } from "sonner";

/**
 * §5.5 Toast — góc DƯỚI-PHẢI, rộng 360px, tối đa 3 cái xếp dọc.
 * Thời gian: success 4s · info 5s · warning 8s · error KHÔNG tự đóng.
 * A11y (A8): sonner render trong region có aria-live; lỗi dùng role="alert".
 *
 * LUẬT §5.5: toast KHÔNG BAO GIỜ là nơi duy nhất báo lỗi của thao tác đang
 * ở trên màn — chỗ nào gây lỗi thì chỗ đó phải hiện inline.
 */
type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * ══ W2B-6 · HAI SẠN CỦA TOAST — và một chỗ CỐ Ý KHÔNG làm theo toa ═══════════
 *
 * ① **Nút ✕ treo NGOÀI góc** (ảnh 24, 26). Không phải lỗi của ta: `sonner/dist/
 *    styles.css` đặt mặc định `--toast-close-button-start: 0` +
 *    `transform: translate(-35%,-35%)` ⇒ nút bị đẩy RA NGOÀI mép trên-trái và đè
 *    lên viền toast. Sửa bằng chính ba biến CSS mà sonner mở ra: về góc trên-PHẢI
 *    và dịch vào TRONG. Đổi vị trí, không đổi hành vi.
 *
 *    ⚠️ **LỆCH CÓ CHỦ Ý so với TOA 10b** — toa bảo *bỏ hẳn prop `closeButton`* với
 *    lý do "toast đã tự tắt theo `KG_TOAST_DURATION`". Điều đó KHÔNG đúng với toast
 *    lỗi: `KG_TOAST_DURATION.error = Infinity` (ngay dưới đây, và §5.5 cố ý đặt thế
 *    — lỗi không được tự biến mất). Bỏ nút ✕ nghĩa là mọi toast lỗi **nằm lì trên
 *    màn vĩnh viễn**, không có cách nào đóng. Toa dọn một sạn thị giác; làm đúng
 *    chữ của nó ở đây sẽ mở một cái bẫy UX. Giữ nút, sửa chỗ nó đứng.
 *
 * ② **Nút hành động khai `bg-accent` nhưng render ra TRẮNG.** CSS built-in của
 *    sonner là `[data-sonner-toast][data-styled='true'] [data-button]` — độ ưu tiên
 *    (0,3,0), đặt `background: var(--normal-text)`. Class Tailwind `bg-accent` chỉ
 *    (0,1,0) nên THUA, và kết quả là một kiểu nút THỨ SÁU trong hệ 5 biến thể, lại
 *    `rounded-2` trong khi mọi `Button` của repo là `rounded-full`. Cách duy nhất
 *    thắng mà không viết CSS ngoài Tailwind là `!` (important) — dùng đúng ở đây,
 *    nơi ta đang ghi đè thư viện thứ ba, chứ không dùng trong code của mình.
 */
/**
 * ══ P-SWEEP·5 · TOAST THÔI ĐÈ LÊN ĐÚNG THỨ ĐANG CẦN BẤM ══════════════════════
 *
 * Ba ảnh bắt cùng một lỗi: toast phủ nút "Tiếp theo" (12), nằm đè thanh công cụ
 * canvas (25), phủ nút "Thùng rác (1)" (27). Nguyên nhân là hình học, không phải
 * nội dung: sonner mặc định `offset` 32px, mà cả ba bề mặt đều GHIM hành động ở
 * đáy-phải.
 *
 * SỐ 128 LÀ ĐO ĐƯỢC, KHÔNG PHẢI ƯỚC: vòng 1 đặt 96px và ảnh 12 chụp lại vẫn thấy
 * toast liếm nút "Tiếp theo". Đo trên chính ảnh đó (viewport 1440×900 của
 * `shots.spec.mjs`): hàng `.workflow-actions` nằm ở y ∈ [780, 816] — thân trang cao
 * 880 < 900 nên hàng KHÔNG cuộn đi đâu được, thêm padding dưới cũng không đẩy nó
 * lên. Toast cao ~56px, nên `offset` phải ≥ 96+36+8 = 128 thì mép dưới toast (900−128
 * = 772) mới đứng trên mép trên nút (780) và còn 8px thở. Thanh nổi canvas (đỉnh
 * ~y=840) đương nhiên cũng lọt.
 *
 * Icon: bộ mặc định của sonner là vòng check XANH LÁ và chấm info XANH DƯƠNG ĐẶC —
 * hai màu không có trong bảng màu của app. Thay bằng CHẤM 6px lấy đúng token trạng
 * thái: vẫn phân biệt được loại, mà không kéo hai màu lạ vào hệ.
 */
const Dot = ({ tone }: { tone: string }) => (
  <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
);

const Toaster = (props: ToasterProps) => (
  <Sonner
    position="bottom-right"
    offset={128}
    visibleToasts={3}
    closeButton
    icons={{
      success: <Dot tone="bg-ok" />,
      info: <Dot tone="bg-accent" />,
      warning: <Dot tone="bg-warn" />,
      error: <Dot tone="bg-danger" />,
    }}
    style={{
      "--toast-close-button-start": "unset",
      "--toast-close-button-end": "0",
      "--toast-close-button-transform": "translate(-50%, 50%)",
      /* Chỗ trống bên phải cho nút hành động — cùng lý do `pr-6` của tiêu đề, khác
         hàng: khi toast CÓ nút hành động, nút đứng cuối hàng ngang nên mép phải của
         nó ở W−16 (`p-4`), mà đĩa ✕ chiếm x ∈ [W−30, W−10] ⇒ chồng đúng 14px lên
         chữ (ảnh 27 vòng 2: gạch chân "Hoàn tác" chạy thẳng vào ✕).
         Phải đặt bằng BIẾN chứ không bằng class `mr-4`: sonner khai
         `[data-sonner-toast][data-styled='true'] [data-button] { margin-right: var(
         --toast-button-margin-end) }` ở (0,3,0) — y hệt cái bẫy đã ăn `bg-accent` ở
         khối ② phía trên, nên class Tailwind (0,1,0) thua im lặng. Biến là API
         sonner mở ra sẵn cho đúng việc này. */
      "--toast-button-margin-end": "16px",
    } as React.CSSProperties}
    toastOptions={{
      classNames: {
        /* P-SWEEP·5 (vòng 2, phát hiện TRÊN ẢNH 25) — cả THÂN toast cũng phải `!`.
           Cùng bệnh với nút hành động ở dưới, chỉ khác chỗ: sonner đặt nền/chữ/viền
           bằng `[data-sonner-toast][data-styled='true'] { background: var(--normal-bg) }`
           — độ ưu tiên (0,2,0), thắng `bg-overlay` (0,1,0) của ta. Và `--normal-bg`
           của sonner mặc định là TRẮNG (prop `theme` mặc định `"light"`), nên trên
           nền canvas tối toast hiện ra một khối trắng chói: đúng "lạc tông" mà giám
           khảo bắt, và là vật sáng nhất màn hình cho một thông báo phụ.
           Ba `!` này ghi đè thư viện thứ ba (đúng chỗ được phép dùng `!`), và vì
           chúng trỏ token nên toast tự đúng ở CẢ hai theme, không cần đồng bộ prop
           `theme` với theme app. */
        toast: "group w-toast rounded-2 border !border-line-subtle !bg-overlay !text-fg-strong shadow-2 gap-3 p-4 text-body",
        /* V1 · nút ✕ ĐÈ LÊN CHỮ TIÊU ĐỀ (ảnh 25). ① đưa ✕ vào trong góc trên-phải
           nhưng KHÔNG chừa chỗ cho nó: `[data-close-button]` là `position:absolute`
           nên nó không đẩy được chữ nào — với biến ta đặt (`end:0` +
           `translate(-50%,50%)`) đĩa 20px nằm ở dải x ∈ [W−30, W−10], liếm vào 14px
           vùng chữ (toast `p-4` ⇒ mép chữ ở W−16). Tiêu đề một dòng thì không ai
           thấy; tiêu đề DÀI xuống dòng thì chữ chui thẳng xuống dưới đĩa.
           `pr-6` (24px) là chỗ trống cho 14px liếm + 10px thở, đặt trên TIÊU ĐỀ chứ
           không trên cả toast: mô tả nằm dưới đĩa rồi, thu hẹp nó là phí bề ngang. */
        title: "text-body font-medium text-fg-strong pr-6",
        /* `[data-sonner-toast] [data-description]` khai `color: inherit` ở (0,2,0) ⇒
           thắng `text-fg` (0,1,0) và mô tả bị kéo lên cùng độ đậm với tiêu đề, mất
           bậc phân cấp. `!` trả lại thứ bậc chữ. */
        description: "text-caption !text-fg",
        /* P-SWEEP·5 — "Hoàn tác" từng là pill nền accent ĐẶC: nút nổi nhất màn hình
           lại là nút PHỤ của một thông báo phụ. Nay là một liên kết chữ gạch chân.
           Ba chỗ `!` vẫn bắt buộc và vẫn đúng lý do cũ: CSS built-in của sonner
           (`[data-sonner-toast][data-styled='true'] [data-button]`, độ ưu tiên 0,3,0)
           đặt `background: var(--normal-text)` — không có `!` thì nút ra màu TRẮNG
           dù ta khai gì đi nữa. Đổi cái ta ghi đè thành, không đổi việc phải ghi đè. */
        /* Lề phải của nút này đặt bằng `--toast-button-margin-end` ở khối `style`
           phía trên — không đặt được bằng class, xem chú thích ở đó. */
        actionButton: "!rounded-1 !bg-transparent px-0 h-ctl-sm text-label !text-accent-text underline underline-offset-4",
        cancelButton: "!rounded-1 !bg-raised border !border-line px-3 h-ctl-sm text-label !text-fg-strong",
        closeButton: "!border-line-subtle !bg-overlay !text-fg",
      },
    }}
    {...props}
  />
);

/** Thời lượng chuẩn theo §5.5 — dùng các helper này thay vì tự đặt số. */
const KG_TOAST_DURATION = {
  success: 4000,
  successWithUndo: 10_000, // có [Hoàn tác] → 10s
  info: 5000,
  warning: 8000,
  error: Infinity, // không tự đóng
} as const;

export { Toaster, toast, KG_TOAST_DURATION };
