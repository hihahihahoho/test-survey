import * as React from "react";
import { cellAspect, silhouetteMarkup, type SkelLike } from "../lib/shapes";

/**
 * Vẽ khung xương của MỘT element bằng đúng hình học của `silhouettes.js`.
 *
 * `dangerouslySetInnerHTML` ở đây là an toàn và có chủ đích: chuỗi đến từ
 * `silhouetteMarkup()` — hàm thuần, chỉ ghép SỐ đã tính vào template cố định. Không
 * có mẩu nào của chuỗi bắt nguồn từ dữ liệu user: `shape` đã qua whitelist, `pose`
 * chỉ dùng để TRA BẢNG (`POSE_META.find`), giá trị lạ rơi về `idle`. Tên file/mô tả
 * của user không bao giờ đi vào SVG (đóng A12/I6).
 * Cách khác — dựng từng phần tử React cho 11 shape — sẽ tạo bản sao thứ hai của hình
 * học, đúng thứ mà `INTEGRATION.md §1.6` chứng minh là sẽ lệch âm thầm.
 */
export interface SilhouetteProps {
  skel: SkelLike | null | undefined;
  orient?: string | undefined;
  /** id duy nhất trong trang — `puzzle` dùng `<mask id>`, trùng là hai ô ăn chung mask. */
  uid: string;
  className?: string;
}

export const Silhouette = React.memo(function Silhouette({ skel, orient, uid, className }: SilhouetteProps) {
  const shape = String(skel?.shape ?? "");
  const aspect = cellAspect(orient);
  // Hệ toạ độ nội bộ: 100 rộng × (100/aspect) cao. Element chiếm w×h phần của ô,
  // căn giữa (hoặc dính đáy) — ĐÚNG cách skeleton.py đặt element trong ô.
  const CW = 100;
  const CH = 100 / aspect;
  const full = shape === "full";
  const ew = full ? CW : CW * clamp01(skel?.w ?? 0.8);
  const eh = full ? CH : CH * clamp01(skel?.h ?? 0.6);
  const ex = (CW - ew) / 2;
  const ey = skel?.anchor === "bottom" ? CH - eh - CH * 0.04 : (CH - eh) / 2;

  const markup = React.useMemo(
    () => silhouetteMarkup(shape, ew, eh, uid, skel ?? {}),
    [shape, ew, eh, uid, skel],
  );
  if (markup === "") return null;

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className={className}
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`translate(${ex} ${ey})`} dangerouslySetInnerHTML={{ __html: markup }} />
    </svg>
  );
});

function clamp01(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
}
