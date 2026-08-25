/**
 * shots.ts — DẢI ẢNH CHỤP, dùng chung cho cả hai tab.
 *
 * Vì sao một dải chung chứ không phải mỗi tab một dải: sản phẩm cuối cùng người
 * dùng nộp cho máy vẽ là MỘT TẬP ảnh tham chiếu — vài góc của manơcanh 3D cộng
 * vài bản phác element. Chia hai dải là bắt họ tự ghép lại trong đầu.
 */
import { foldVi } from "@/features/design/library/lib/source";

export type ShotKind = "pose-3d" | "sketch";

export interface Shot {
  id: string;
  kind: ShotKind;
  /** Chữ hiện dưới thumbnail: tên dáng (3D) hoặc tên element (sketch). */
  label: string;
  /** PNG dạng data URL. Lab KHÔNG ghi ổ đĩa — mọi thứ ở đây mất khi F5, và đó là
   *  hành vi đúng của một prototype không đụng workspace. */
  dataUrl: string;
  at: number;
}

/** Trần dải ảnh. Data URL của 1024² PNG là ~1–2 MB base64 trong RAM; 24 tấm là
 *  chỗ để làm việc thoải mái mà vẫn không cho tab ăn nửa GB. */
export const MAX_SHOTS = 24;

export const KIND_LABELS: Record<ShotKind, string> = {
  "pose-3d": "pose-3d",
  sketch: "sketch",
};

let seq = 0;

export function makeShot(kind: ShotKind, label: string, dataUrl: string): Shot {
  seq += 1;
  return { id: `shot-${seq}-${Date.now().toString(36)}`, kind, label, dataUrl, at: Date.now() };
}

/** Ảnh MỚI NHẤT lên đầu — vừa chụp là thấy ngay, không phải cuộn tới cuối dải. */
export function addShot(list: readonly Shot[], shot: Shot): Shot[] {
  return [shot, ...list].slice(0, MAX_SHOTS);
}

export function removeShot(list: readonly Shot[], id: string): Shot[] {
  return list.filter((s) => s.id !== id);
}

/**
 * Tên file khi tải về. Bỏ dấu tiếng Việt bằng `foldVi` của thư viện element (đã
 * có sẵn, đã test) — tên file có dấu vẫn tải được trên macOS nhưng vỡ khi đi qua
 * zip/CI/Windows, mà đích đến của mấy ảnh này chính là một thư mục `refs/`.
 */
export function shotFileName(shot: Shot): string {
  const slug = foldVi(shot.label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shot";
  return `${shot.kind}-${slug}.png`;
}
