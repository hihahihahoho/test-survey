/**
 * features/gen/lib/gen-kinds.ts — BỐN LỆNH của hộp «✨ Nhờ máy vẽ» (UX-V3 §4.1).
 *
 * NGUỒN: UX-V3 §4.1 (lưới 4 lệnh, hai tầng: chọn lệnh → điền) · BA-V3 §3.2 (bảng ánh xạ:
 *        lệnh → tấm được ghi, lưới, `orient`, chi phí, ràng buộc thật) · FE3-PLAN §3-C2.
 *
 * THUẦN DỮ LIỆU: không React, không DOM, không mạng ⇒ chạy được ở vitest environment "node"
 * và test chữ được mà không phải mount cả popover.
 *
 * ⚠️ CHỮ Ở ĐÂY LÀ CHỮ NGƯỜI DÙNG ĐỌC. Từ điển chung của S1 (`features/kitfile/lib/copy.ts`)
 * có sẵn ba câu chống nói dối và nhãn mock; những chuỗi RIÊNG của hộp GEN (tên 4 lệnh, nhãn ô
 * nhập, gợi ý) thì S1 chưa cấp ⇒ đặt tạm ở đây, một chỗ duy nhất, và đã xin chuyển về `copy.ts`
 * ở `NEEDS-fe3-c.md` N6. Cấm màn tự chế chuỗi thứ hai.
 */

/** Bốn lệnh, đúng thứ tự đọc của wireframe §4.1 (trái→phải, trên→dưới). */
export const GEN_KINDS = ["bg", "pose", "element", "kit"] as const;
export type GenKind = (typeof GEN_KINDS)[number];

export function isGenKind(v: unknown): v is GenKind {
  return typeof v === "string" && (GEN_KINDS as readonly string[]).includes(v);
}

/** Khổ ảnh — chữ hiện ra là «Dọc»/«Ngang», không phải `portrait`/`landscape` (§5.4). */
export const GEN_ORIENTS = ["portrait", "landscape"] as const;
export type GenOrient = (typeof GEN_ORIENTS)[number];

export const ORIENT_LABEL: Readonly<Record<GenOrient, string>> = {
  portrait: "Dọc",
  landscape: "Ngang",
};

export interface GenKindSpec {
  kind: GenKind;
  /**
   * Chữ trên thẻ lệnh và trên tiêu đề panel.
   *
   * P-SWEEP·11 — trường `emoji` (🖼 🧍 🧩 📦) ĐÃ BỎ. Emoji nhiều màu, nét dày và lệch
   * baseline giữa một app dùng icon line 1.5px đơn sắc; tệ nhất là ở ảnh 24, nơi 🖼
   * làm tiêu đề popover ngay cạnh các icon lucide khác. Hình nay là icon lucide, khai
   * ở `GEN_KIND_ICON` (`panels/GenKindGrid.tsx`) — để module này ở lại THUẦN DỮ LIỆU
   * đúng như lời hứa đầu file (chạy được ở vitest environment "node").
   * Bất biến a11y không đổi: hình luôn `aria-hidden` và luôn đi kèm `label` bằng CHỮ.
   */
  label: string;
  /** Một dòng ngắn dưới tên lệnh ở lưới chọn. */
  hint: string;
  /** Nhãn ô mô tả. `null` = lệnh này KHÔNG có ô mô tả (cả bộ kit chỉ vẽ lại thứ đã có). */
  promptLabel: string | null;
  promptPlaceholder: string;
  /** Cho đổi khổ dọc/ngang không. `false` ⇒ hiện câu giải thích khổ cố định. */
  orientEditable: boolean;
  defaultOrient: GenOrient;
  /** Câu giải thích khổ khi không đổi được. */
  orientFixedNote: string;
  /** Cần ảnh nhân vật trước mới bấm được (BA-V3 §3.2 hàng «Gen pose»). */
  needsCharacterRef: boolean;
  /**
   * Câu PHẢI hiện NGAY TRONG PANEL (FE3-PLAN §3-C2: «không giấu trong tooltip»).
   * `null` = lệnh này không có câu bắt buộc cố định (cả bộ kit dựng câu theo số thật).
   */
  truthNote: string | null;
}

/**
 * Ba câu bắt buộc của UX-V3 §4.1 nằm ở: `element.truthNote` (vẽ cả nhóm một lần),
 * `pose` (cần ảnh nhân vật — xem `GEN_NEED_CHARACTER_REF`), và `kit` (dựng theo số tấm
 * thật, xem `wholeKitNote()` trong `gen-cost.ts`).
 */
export const GEN_GROUP_NOTE =
  "Máy vẽ cả nhóm trong một lần. Chọn 1 món hay 9 món cũng tốn ~1 lượt — chọn nhiều một lượt sẽ lợi hơn.";
export const GEN_NEED_CHARACTER_REF =
  "Cần một ảnh nhân vật trước. Kéo ảnh vào bàn rồi đánh dấu «đây là nhân vật».";

export const GEN_KIND_SPEC: Readonly<Record<GenKind, GenKindSpec>> = {
  bg: {
    kind: "bg",
    label: "Ảnh nền",
    hint: "một cảnh phủ kín khung",
    promptLabel: "Tả cảnh bạn muốn",
    promptPlaceholder: "chợ hoa ngày Tết, buổi sáng",
    orientEditable: true,
    defaultOrient: "portrait",
    orientFixedNote: "",
    needsCharacterRef: false,
    truthNote: null,
  },
  pose: {
    kind: "pose",
    label: "Tư thế nhân vật",
    hint: "một bảng nhiều tư thế",
    promptLabel: "Tả tư thế bạn muốn",
    promptPlaceholder: "vẫy tay, chạy, ngồi cười",
    orientEditable: false,
    defaultOrient: "landscape",
    orientFixedNote: "Bảng tư thế luôn vẽ khổ ngang.",
    needsCharacterRef: true,
    truthNote: "Máy nhận dạng nhân vật từ một ảnh mẫu duy nhất, nên hãy chọn ảnh rõ mặt nhất.",
  },
  element: {
    kind: "element",
    label: "Món giao diện",
    hint: "nút, khung, huy hiệu…",
    promptLabel: "Tả nhóm món bạn muốn",
    promptPlaceholder: "nút bấm, khung thưởng, huy hiệu sao",
    orientEditable: false,
    defaultOrient: "landscape",
    orientFixedNote: "Nhóm món luôn vẽ khổ ngang cho đủ chỗ.",
    needsCharacterRef: false,
    truthNote: GEN_GROUP_NOTE,
  },
  kit: {
    kind: "kit",
    label: "Cả bộ kit",
    hint: "vẽ lại mọi thứ trên bàn",
    promptLabel: null,
    promptPlaceholder: "",
    orientEditable: false,
    defaultOrient: "landscape",
    orientFixedNote: "Mỗi thứ giữ đúng khổ bạn đã chọn lúc trước.",
    needsCharacterRef: false,
    truthNote: null,
  },
};

/** Thứ tự hiện ra, tách khỏi `Record` để không phụ thuộc thứ tự khoá của object. */
export const GEN_KIND_LIST: readonly GenKindSpec[] = GEN_KINDS.map((k) => GEN_KIND_SPEC[k]);
