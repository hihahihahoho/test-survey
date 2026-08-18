/**
 * features/home/lib/cover-title.ts — HÌNH HỌC VÙNG TIÊU ĐỀ của ảnh bìa tự sinh.
 *
 * ══ CHỮ NẰM TRONG ẢNH, TRỪ HAI CA ════════════════════════════════════════════
 * BẢN VÁ 18/08 — chủ sản phẩm chốt: tên dự án phải là MỘT PHẦN CỦA TRANH, typography
 * ăn theo phong cách artwork, chứ không phải một miếng nhãn chữ nhật app dán đè.
 * Nên agent (`agent/lib/cover.mjs` § quyết định ③) đưa thẳng tên vào prompt, kèm cả
 * một khối ràng buộc chép đúng dấu tiếng Việt, và báo lại bằng cờ `cover.titleEmbedded`.
 *
 * OVERLAY CSS KHÔNG BỊ XOÁ, vì hai ca vẫn cần nó và cả hai đều có thật trên máy người dùng:
 *  ① ẢNH BÌA CŨ — vẽ trước bản vá, trong ảnh không hề có chữ. Xoá overlay là tên dự án
 *    biến mất khỏi tấm bìa của mọi dự án đã tồn tại;
 *  ② dự án KHÔNG có tên dùng được (rỗng / toàn ký tự vô hình sau khi agent lọc) — agent
 *    rơi về prompt "chừa trống + cấm chữ" và trả `titleEmbedded:false`.
 * `shouldOverlayTitle()` ở cuối file là chỗ DUY NHẤT quyết định việc này.
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

/**
 * CÓ DÁN TÊN DỰ ÁN ĐÈ LÊN ẢNH BÌA KHÔNG? — ba điều kiện, mỗi điều kiện một lỗi cụ thể
 * mà nó chặn. Tách thành hàm thuần để test được không cần DOM: `KitCover` chỉ gọi nó.
 *
 * ① `isAutoCover` — ảnh bìa user tự chọn từ kit KHÔNG có chỗ chừa nào, dán chữ lên là
 *    che mất đúng ô họ chọn (luật cũ, giữ nguyên);
 * ② `titleEmbedded !== true` — agent đã kẻ tên VÀO TRANH thì dán thêm một chip tên nữa
 *    là CHỮ ĐÚP, hai lần cùng một cái tên chồng lên nhau. Phải là `=== true`: thiếu khoá
 *    (agent cũ) và giá trị rác đều là "chưa kẻ" ⇒ vẫn overlay, tức về đúng hành vi cũ;
 * ③ `metaPending` — CHƯA BIẾT thì ĐỪNG DÁN. Trong lúc `#43` còn bay, đoán "có dán" sẽ
 *    làm chip tên nháy lên rồi biến mất trên MỌI tấm bìa mới; đoán "không dán" thì cùng
 *    lắm là tên xuất hiện muộn vài trăm ms trên bìa cũ — mà tên dự án vẫn đang nằm ngay
 *    dưới ảnh ở `<h2>` của thẻ, nên người dùng không mất thông tin nào. Chọn cái rẻ hơn.
 */
export function shouldOverlayTitle({
  coverPath,
  cover,
  metaPending,
}: {
  coverPath: string | null | undefined;
  /** Đáp án `#43` của chính dự án này (`undefined` = chưa có/không hỏi). */
  cover: { titleEmbedded?: boolean } | null | undefined;
  /** Query `#43` đang bay và chưa có dữ liệu nào để kết luận. */
  metaPending: boolean;
}): boolean {
  if (!isAutoCover(coverPath)) return false;
  if (metaPending) return false;
  return cover?.titleEmbedded !== true;
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
