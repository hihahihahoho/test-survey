/**
 * features/home/lib/cover-title.ts — HÌNH HỌC VÙNG TIÊU ĐỀ của ảnh bìa tự sinh.
 *
 * ══ VÌ SAO CHỮ KHÔNG NẰM TRONG ẢNH ═══════════════════════════════════════════
 * Ảnh bìa do model sinh; model VẼ CHỮ SAI — sai chính tả, và tiếng Việt có dấu thì
 * gần như luôn hỏng. Tệ hơn: đổi tên dự án là phải sinh lại cả ảnh (mất một lượt
 * quota image-gen cho một việc thuần văn bản).
 * Vì vậy prompt của agent (`agent/lib/cover.mjs`) dặn model CHỪA TRỐNG một hình chữ
 * nhật và app ghép chữ thật vào đúng đó bằng CSS. Đổi tên ⇒ chữ đổi theo, 0 quota.
 *
 * ══ HAI CON SỐ NÀY PHẢI KHỚP AGENT ═══════════════════════════════════════════
 * `TITLE_ZONE` ở đây là BẢN SAO của `TITLE_ZONE` trong `agent/lib/cover.mjs`, tính
 * theo TỈ LỆ ảnh bìa 16:9 cuối cùng. Lệch nhau = chữ đè lên mascot mà không ai thấy
 * lỗi ở đâu, nên `agent/test/suite-cover.mjs` có một ca ĐỌC CẢ HAI FILE và so số.
 * Sửa ở đây thì phải sửa cả bên kia.
 */

/** Đường dẫn ảnh bìa TỰ SINH trong project. Ảnh bìa user tự chọn (`kits/…`) KHÔNG có vùng chừa. */
export const AUTO_COVER_PATH = "cover/cover.png";

/** Tỉ lệ ảnh bìa tự sinh (16:9). */
export const COVER_ASPECT = 16 / 9;

/** Vùng tiêu đề — tỉ lệ so với ảnh bìa: dải trái, rộng 56%, cao 40%, canh giữa dọc. */
export const TITLE_ZONE = { x: 0.06, y: 0.3, w: 0.56, h: 0.4 } as const;

/**
 * Hình dạng một vùng tiêu đề (tỉ lệ 0–1 so với ảnh bìa).
 *
 * Cần khai riêng vì `TITLE_ZONE` là `as const`: để `titleZoneStyle` suy kiểu tham số
 * `zone` từ giá trị mặc định thì kiểu ra là *literal* `{x: 0.06; y: 0.3; …}`, tức tham
 * số đó KHÔNG NHẬN ĐƯỢC vùng nào khác — kể cả `cover.titleZone` mà agent gửi kèm #43,
 * đúng thứ nó sinh ra để nhận.
 */
export interface TitleZone { x: number; y: number; w: number; h: number }

export interface ZoneStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

/** Chỉ ảnh bìa TỰ SINH mới có vùng chừa; ảnh user tự chọn thì không được overlay chữ lên. */
export function isAutoCover(coverPath: string | null | undefined): boolean {
  return coverPath === AUTO_COVER_PATH;
}

function pct(v: number): string {
  return `${(Math.round(v * 100000) / 1000).toString()}%`;
}

/**
 * Vùng tiêu đề quy về toạ độ TRONG Ô ẢNH của thẻ.
 *
 * Ô ảnh của thẻ là 16:10 còn ảnh bìa là 16:9, và ảnh vẽ bằng `object-cover` ⇒ ảnh bị
 * CẮT BỚT HAI BÊN. Lấy thẳng 6%/56% của ô sẽ trượt khỏi vùng model đã chừa. Hàm này
 * làm đúng phép mà `object-cover` làm: tính phần ảnh còn nhìn thấy rồi đổi hệ toạ độ.
 * (16:10 cắt 5% mỗi bên ⇒ dải trái 6%–62% của ẢNH thành ~1.1%–63.3% của Ô.)
 *
 * Kết quả được kẹp trong [0,1]: chữ có thể mất một chút bề rộng khi ô quá hẹp, nhưng
 * KHÔNG BAO GIỜ tràn ra ngoài ô — tràn ra là đè lên chỗ khác của thẻ.
 */
export function titleZoneStyle(boxAspect: number, zone: TitleZone = TITLE_ZONE): ZoneStyle {
  const safe = Number.isFinite(boxAspect) && boxAspect > 0 ? boxAspect : COVER_ASPECT;
  const visX = Math.min(1, safe / COVER_ASPECT);
  const visY = Math.min(1, COVER_ASPECT / safe);
  const offX = (1 - visX) / 2;
  const offY = (1 - visY) / 2;

  const left = (zone.x - offX) / visX;
  const width = zone.w / visX;
  const top = (zone.y - offY) / visY;
  const height = zone.h / visY;

  const l = Math.min(1, Math.max(0, left));
  const t = Math.min(1, Math.max(0, top));
  return {
    left: pct(l),
    top: pct(t),
    width: pct(Math.min(1 - l, Math.max(0, width))),
    height: pct(Math.min(1 - t, Math.max(0, height))),
  };
}
