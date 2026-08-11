import * as React from "react";
import { Silhouette as BaseSilhouette } from "../components/Silhouette";
import { elementBox, type AnySkel } from "./geometry";
import { silhouetteMarkup } from "../lib/shapes";

/**
 * webapp/src/features/design/preview/Silhouette.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * HAI CÁCH DÙNG silhouette, CÙNG MỘT NGUỒN HÌNH HỌC (`../lib/shapes.ts` của R2-P1,
 * bản sinh tự động từ `silhouettes.js` + ca test đối chiếu từng ký tự):
 *
 *   `<Silhouette>`       — một element độc lập, có `<svg>` riêng. Dùng ở thẻ xem
 *                          trước trong drawer thư viện. Chỉ là re-export component
 *                          của R2-P1 để `preview/` có một cửa import duy nhất.
 *   `<SilhouetteGroup>`  — `<g>` đặt trong `<svg>` CHUNG của cả sheet. Bắt buộc phải
 *                          có bản này: preview 64 ô mà mỗi ô một `<svg>` thì DOM phình
 *                          và cuộn giật; hơn nữa toạ độ ô phải nằm cùng hệ với lưới kẻ.
 *
 * `dangerouslySetInnerHTML` ở `SilhouetteGroup` an toàn theo đúng lập luận R2-P1 đã
 * ghi trong `components/Silhouette.tsx`: chuỗi do `silhouetteMarkup()` sinh, chỉ gồm
 * SỐ đã tính + màu hằng. Không mẩu nào tới từ dữ liệu user (`shape` qua whitelist,
 * `pose` chỉ dùng để tra bảng, tên file/mô tả không bao giờ vào SVG).
 */

export { type SilhouetteProps } from "../components/Silhouette";
export const Silhouette = BaseSilhouette;

export interface SilhouetteGroupProps {
  skel: AnySkel | null | undefined;
  /** cỡ Ô trong hệ toạ độ của `<svg>` cha */
  boxW: number;
  boxH: number;
  /** id DUY NHẤT trong trang — `puzzle` dùng `<mask id>`, trùng là hai ô ăn chung mask */
  uid: string;
  /** khung SAFE ZONE nét đứt; `free`/`full`/`empty` tự bỏ (đúng skeleton.py dòng 113–115) */
  showSafeFrame?: boolean;
  className?: string;
}

export const SilhouetteGroup = React.memo(function SilhouetteGroup({
  skel, boxW, boxH, uid, showSafeFrame = true, className,
}: SilhouetteGroupProps): React.ReactElement | null {
  const shape = String(skel?.shape ?? "");
  const box = React.useMemo(() => elementBox(skel, boxW, boxH), [skel, boxW, boxH]);
  const markup = React.useMemo(
    () => silhouetteMarkup(shape, box.w, box.h, uid, skel ?? {}),
    [shape, box.w, box.h, uid, skel],
  );

  if (shape === "empty") return null;

  return (
    <g className={className}>
      <g transform={`translate(${box.x.toFixed(2)} ${box.y.toFixed(2)})`} dangerouslySetInnerHTML={{ __html: markup }} />
      {showSafeFrame && box.hasSafeFrame && (
        <rect
          x={box.x.toFixed(2)}
          y={box.y.toFixed(2)}
          width={box.w.toFixed(2)}
          height={box.h.toFixed(2)}
          fill="none"
          stroke="currentColor"
          strokeWidth={Math.max(1, Math.min(boxW, boxH) * 0.012)}
          strokeDasharray="4 4"
          opacity={0.6}
        />
      )}
    </g>
  );
});
