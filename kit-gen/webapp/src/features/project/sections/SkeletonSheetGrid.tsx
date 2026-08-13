import { SkeletonPreview } from "@/features/design/preview";
import type { Contract } from "@/lib/types";

/**
 * LƯỚI XEM BỘ KHUNG của từng tấm — một tấm một ô, có số thứ tự và khung an toàn.
 *
 * ══ VÌ SAO NÓ Ở ĐÂY CHỨ KHÔNG CÒN Ở TRANG "ẢNH ĐÃ TẠO" ═════════════════════
 * Trang "Ảnh đã tạo" từng có hai thanh segmented XẾP CHỒNG nhau, và cả hai đều mở
 * đầu bằng đúng một chữ:
 *     ① "Ảnh thật | Skeleton"   ← khung của trang (ImagesSection)
 *     ② "Ảnh thật | Ảnh gốc"    ← khung của thẻ kết quả (GeneratedResults)
 * Hai hàng cách nhau ~8px, cùng hình dạng, cùng nhãn đầu — không cách nào đoán được
 * bấm cái nào ra cái gì. Mà Skeleton ĐÃ có một đích riêng trong sidebar dự án
 * (`?section=skeleton`), nên thanh ① vừa gây rối vừa là lối vào THỨ HAI cho cùng một
 * thứ. Bỏ thanh ①; phần nội dung của nó — lưới xem bộ khung — dọn về đây, dưới trình
 * chỉnh bộ khung, để trang Skeleton UI vừa SỬA được vừa XEM được.
 *
 * Thuần trình bày: không hook, không đọc mạng. `SkeletonPreview` tự chịu ca `sheet`
 * rỗng/null nên ở đây không cần phòng thêm.
 */
export function SkeletonSheetGrid({ sheets }: { sheets: Contract["sheets"] }) {
  if (sheets.length === 0) {
    return (
      <p className="rounded-4 border border-dashed border-line-subtle p-8 text-center text-body text-fg-muted">
        Bản thiết kế chưa có tấm nào để xem bộ khung.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sheets.map((sheet) => (
        <article key={sheet.id} className="overflow-hidden rounded-4 border border-line-subtle bg-surface">
          <div className="border-b border-line-subtle px-4 py-3">
            <h3 className="text-label text-fg-strong">{sheet.id.replaceAll("-", " ")}</h3>
            <p className="text-caption text-fg-muted">
              {sheet.components.filter((component) => component.skel?.shape !== "empty").length} thành phần · {sheet.grid.cols} × {sheet.grid.rows}
            </p>
          </div>
          <div className="p-4"><SkeletonPreview sheet={sheet} showIndex showSafeFrame /></div>
        </article>
      ))}
    </div>
  );
}
