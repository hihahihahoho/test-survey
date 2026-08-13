import * as React from "react";
import { ImagePlus, Palette, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLibraryImage } from "@/lib/hooks";
import type { BrandProfile, LibraryItem } from "@/lib/types";
import { brandAssetSummary, brandAssets, brandPreview } from "../lib/brand-assets";

/**
 * Ô vuông xem trước trên thẻ thương hiệu — cùng bo góc/viền với ô ảnh của thẻ thư viện.
 * Ảnh chưa về (hoặc agent chưa chạy) thì giữ nguyên khung, chỉ đổi ruột thành icon: ô
 * không được co lại rồi bung ra làm nhảy cả lưới thẻ.
 */
function BrandThumb({ item }: { item: LibraryItem }) {
  const src = useLibraryImage(item.id);
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2 border border-line-subtle bg-raised"
      title={item.name}
    >
      {src ? <img src={src} alt="" className="size-full object-contain" /> : <ImagePlus className="size-4 text-fg-muted" aria-hidden />}
    </div>
  );
}

/**
 * Một thẻ trong lưới «Nhận dạng thương hiệu».
 *
 * Thứ tự đọc của thẻ đi từ NHẬN RA tới HÀNH ĐỘNG: tên → ghi chú → bảng màu → **ảnh xem
 * trước** → dòng đếm → nút. Ảnh nằm NGAY DƯỚI hàng chấm màu vì hai thứ đó trả lời cùng
 * một câu hỏi «đây có phải thương hiệu mình đang tìm không»; dòng đếm là chi tiết, đứng sau.
 *
 * Xoá thương hiệu ĐI QUA hộp xác nhận: bản cũ xoá thẳng khi bấm thùng rác, không hỏi,
 * không hoàn tác được.
 */
export function BrandCard({ brand, items, onEdit, onRemove, removing = false }: {
  brand: BrandProfile;
  /** Toàn bộ kho dùng chung — thẻ tự nối `assetIds` với kho để không đếm id đã chết. */
  items: readonly LibraryItem[];
  onEdit: () => void;
  onRemove: () => void;
  removing?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const assets = brandAssets(brand, items);
  const { shown, overflow } = brandPreview(assets);

  return (
    <>
      <article className="rounded-4 border border-line-subtle bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-subtitle text-fg-strong">{brand.name}</h2>
            <p className="mt-1 line-clamp-2 text-caption text-fg-muted">{brand.description || "Chưa có ghi chú"}</p>
          </div>
          <Palette className="size-5 shrink-0 text-fg-muted" aria-hidden />
        </div>
        {brand.colors.length > 0 && (
          /* key có index: hai ô CÙNG mã màu là chuyện thường khi đang sửa dở, key trùng
             sẽ làm React nhầm hai ô với nhau. */
          <div className="mt-4 flex flex-wrap gap-1">
            {brand.colors.map((color, index) => (
              <span key={`${index}-${color}`} className="size-7 rounded-full border border-line-subtle" style={{ background: color }} title={color} />
            ))}
          </div>
        )}
        {shown.length > 0 && (
          /* role="group": `aria-label` trên một <div> trần KHÔNG được screen reader đọc —
             phải có role thì nhãn mới thành tên của vùng. */
          <div role="group" className="mt-3 flex flex-wrap items-center gap-2" aria-label={`Ảnh của ${brand.name}`}>
            {shown.map(item => <BrandThumb key={item.id} item={item} />)}
            {overflow > 0 && (
              /* Chuỗi ghép sẵn, KHÔNG `+{overflow}`: hai node text cạnh nhau khiến React
                 chèn `<!-- -->` vào giữa, dấu cộng và con số không còn copy được liền. */
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2 border border-line-subtle bg-raised text-caption text-fg-muted">
                {`+${overflow}`}
              </span>
            )}
          </div>
        )}
        <p className="mt-4 text-caption text-fg-muted">{brandAssetSummary(assets)}</p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>Chỉnh sửa</Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Xoá ${brand.name}`} disabled={removing} onClick={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      </article>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá “{brand.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ nhận dạng này bị xoá. Logo, ảnh phong cách và nhân vật vẫn còn trong thư viện dùng chung.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
