/**
 * features/canvas/lib/dot-grid.ts — HOA VĂN DOT-GRID của bàn làm việc (FLORA-REF §2.7).
 *
 * VÌ SAO KHÔNG DÙNG `.kg-dotgrid` (globals.css): tiện ích đó có `background-attachment: fixed`
 * — lưới ĐỨNG YÊN khi nội dung cuộn. Đúng cho trang danh sách, SAI cho canvas: kéo khung
 * nhìn mà lưới không nhúc nhích thì mất hẳn cảm giác "không gian làm việc", và zoom 400%
 * vẫn thấy lưới 22px là nói dối về tỉ lệ. FE2-PLAN §3-D1 vì thế yêu cầu **dot-grid local**
 * và cấm `background-attachment: fixed`. `styles/**` thuộc glob nhánh A ⇒ D không sửa ở đó.
 *
 * KHÔNG HARD-CODE MÀU: nền/chấm lấy nguyên biến `--kg-dot-*` và `--kg-canvas` của R0
 * (tokens.css). Chỉ có HÌNH HỌC (bước lưới, vị trí) được tính ở đây vì nó phụ thuộc `k`.
 */
import type { Viewport } from "@/lib/viewport";
import type * as React from "react";

/**
 * Hệ số nhân bước lưới. Zoom nhỏ ⇒ chấm dày đặc thành mảng xám; zoom lớn ⇒ lưới thưa
 * đến vô nghĩa. Nhân/chia đôi cho tới khi bước hiện lên màn nằm trong [12px, 48px].
 * Nhân đôi (không phải một hệ số tuỳ ý) để các mốc lưới cũ luôn là tập con của lưới mới —
 * mắt thấy lưới "thưa dần" chứ không thấy nó nhảy loạn.
 */
export const DOT_STEP_MIN = 12;
export const DOT_STEP_MAX = 48;
/** Bước lưới cơ sở — PHẢI khớp `--kg-dot-step` trong tokens.css (22px). */
export const DOT_BASE_STEP = 22;

export function dotStepMultiple(k: number, baseStep: number = DOT_BASE_STEP): number {
  if (!Number.isFinite(k) || k <= 0 || !Number.isFinite(baseStep) || baseStep <= 0) return 1;
  let m = 1;
  // trần 2^10: chặn vòng lặp vô hạn nếu ai đó truyền k cực đoan.
  for (let i = 0; i < 10 && baseStep * k * m < DOT_STEP_MIN; i++) m *= 2;
  for (let i = 0; i < 10 && baseStep * k * m > DOT_STEP_MAX; i++) m /= 2;
  return m;
}

/**
 * Style của lớp nền. Trả `background-position` = gốc thế giới đã chiếu lên màn hình ⇒
 * lưới trôi ĐÚNG cùng nội dung khi pan, và giãn đúng khi zoom.
 */
/**
 * HAI TẦNG CHẤM (POLISH-RAIL-DOT). Một tầng đều tăm tắp buộc phải chọn giữa hai cái dở:
 * đủ mờ để không ồn ⇒ mắt không có mốc nào bám khi pan; đủ đậm để bám ⇒ nền thành vải kẻ.
 * Tầng CHÍNH (mỗi `--kg-dot-major-every` bước) đậm và to hơn một nấc, cho mắt điểm neo
 * mà KHÔNG phải nâng độ đậm của toàn bộ nền — đúng cách Figma/Sketch làm lưới.
 *
 * Thứ tự lớp: `background-image` vẽ lớp ĐẦU nằm TRÊN, nên tầng chính đứng trước để chấm
 * đậm không bị chấm phụ (cùng toạ độ, vì bước chính là bội số nguyên của bước phụ) đè lên.
 * Cả hai tầng dùng CHUNG `background-position` ⇒ chúng luôn khớp mốc, không trôi lệch nhau.
 */
export function dotGridStyle(vp: Viewport): React.CSSProperties {
  const m = dotStepMultiple(vp.k);
  const scale = (vp.k * m).toFixed(4);
  const size = `calc(var(--kg-dot-step) * ${scale})`;
  const major = `calc(var(--kg-dot-step) * var(--kg-dot-major-every) * ${scale})`;
  return {
    backgroundColor: "rgb(var(--kg-canvas))",
    backgroundImage: [
      "radial-gradient(rgb(var(--kg-dot-color) / var(--kg-dot-major-alpha)) var(--kg-dot-major-size), transparent var(--kg-dot-major-size))",
      "radial-gradient(rgb(var(--kg-dot-color) / var(--kg-dot-alpha)) var(--kg-dot-size), transparent var(--kg-dot-size))",
    ].join(", "),
    backgroundSize: `${major} ${major}, ${size} ${size}`,
    backgroundPosition: `${vp.x.toFixed(2)}px ${vp.y.toFixed(2)}px`,
    // KHÔNG `fixed`: lưới phải đi theo khung nhìn. Ghi thẳng ra đây để lần sau ai định
    // đổi cũng thấy lý do ngay tại chỗ.
    backgroundAttachment: "scroll",
  };
}
