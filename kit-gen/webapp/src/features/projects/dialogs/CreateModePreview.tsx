import { ArrowRight, HardDrive, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA } from "@/components/layout/flora";
import type { TemplateId } from "./CreateParts";
import {
  createPreview,
  LOCAL_DOC_NOTE,
  MODE_REASSURANCE,
  modeCopy,
  type CreateMode,
} from "../lib/create-mode";

/**
 * "SẼ CÓ GÌ SAU KHI BẤM TẠO" — khối preview đổi theo mode + template.
 *
 * Vì sao có khối này (không phải trang trí): khác biệt giữa hai mode nằm ở MÀN MỞ RA
 * SAU khi dialog đóng — thứ người dùng không nhìn thấy lúc còn đang ở trong dialog.
 * Nếu không nói trước thì việc chọn mode chỉ là đoán mò.
 *
 * Trung thực: dòng `later` (nội dung phụ thuộc bước sau) hiện chữ mờ hơn + chữ
 * "ở bước sau", không giả vờ chắc chắn. Ghi chú "bản nháp cục bộ" luôn hiện vì
 * FE-2 chưa có API `/docs` (FE2-PLAN §4).
 */
export function CreateModePreview({
  template,
  mode,
}: {
  template: TemplateId;
  mode: CreateMode;
}) {
  const lines = createPreview(template, mode);
  const copy = modeCopy(mode);

  return (
    <section
      aria-label={`Sẽ tạo gì — chế độ ${copy.title}`}
      className={cn("flex flex-col gap-3 border border-line-subtle bg-surface p-4", FLORA.r16)}
    >
      <h3 className="text-label font-medium text-fg-muted-raised">Bấm Tạo sẽ có</h3>

      <ul className="flex flex-col gap-2">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start gap-2">
            <ArrowRight
              className={cn("mt-0.5 size-3.5 shrink-0", l.later ? "text-fg-muted-raised" : "text-accent-text")}
              aria-hidden
            />
            <span className={cn("text-caption", l.later ? "text-fg-muted-raised" : "text-fg")}>{l.text}</span>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-caption text-fg-muted-raised">
        <HardDrive className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {LOCAL_DOC_NOTE}
      </p>
      <p className="flex items-start gap-2 text-caption text-fg-muted-raised">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {MODE_REASSURANCE}
      </p>
    </section>
  );
}
