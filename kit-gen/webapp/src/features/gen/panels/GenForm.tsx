import * as React from "react";
import { ChevronLeft, Info } from "lucide-react";
import { GEN_KIND_ICON } from "./GenKindGrid";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { FLORA } from "@/components/layout/flora";
import { BTN } from "@/features/kitfile";
import { cn } from "@/lib/utils";
import { GEN_ORIENTS, ORIENT_LABEL, type GenKindSpec, type GenOrient } from "../lib/gen-kinds";

/**
 * TẦNG 2 CỦA HỘP GEN — panel điền của một lệnh (UX-V3 §4.1, khung dưới của wireframe).
 *
 * Nút Vẽ phát yêu cầu về màn cha. Màn cha lưu contract rồi gọi agent run thật; panel này
 * chỉ quản lý prompt, khổ, ảnh mẫu và trạng thái đang xếp lượt.
 *
 * ══ BA CÂU PHẢI HIỆN NGAY TRONG PANEL ══
 * `truthNote` (nhóm món vẽ cả nhóm · cần ảnh nhân vật · cả bộ kit ~N lượt) hiện thành một
 * khối chữ thường trong thân panel, **không** nhét vào tooltip (FE3-PLAN §3-C2).
 */
export interface GenFormProps {
  spec: GenKindSpec;
  prompt: string;
  onPromptChange: (v: string) => void;
  orient: GenOrient;
  onOrientChange: (v: GenOrient) => void;
  /** Tên ảnh mẫu đang chọn trên bàn. Rỗng ⇒ hiện câu "chưa chọn ảnh nào". */
  refNames: readonly string[];
  /** «Tốn ~1 lượt hỏi · khoảng 1–2 phút» — dựng ở `gen-cost.ts`, panel không tự ghép. */
  costLine: string;
  /** Câu nói thật riêng của lệnh (nhóm món / cả bộ kit). Rỗng = không có. */
  truthNote: string;
  onBack: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
}

/** Lý do nút Vẽ chưa bấm được — một chỗ duy nhất, dùng cho cả chữ lẫn tooltip. */
export function GenForm(props: GenFormProps) {
  const { spec, prompt, onPromptChange, orient, onOrientChange, refNames, costLine, truthNote, onBack, onSubmit, submitting = false, submitDisabled = false } = props;
  const promptId = React.useId();
  const orientLabelId = React.useId();
  const KindIcon = GEN_KIND_ICON[spec.kind];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Quay lại danh sách">
          <ChevronLeft aria-hidden strokeWidth={1.5} />
        </Button>
        {/* P-SWEEP·12 — mũi tên back và tiêu đề nay CANH GIỮA THEO NHAU: icon 14px
            `strokeWidth 1.5`, cùng nét với mọi icon còn lại của panel. */}
        <h3 className="flex items-center gap-2 text-subtitle text-fg-strong">
          <KindIcon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          {spec.label}
        </h3>
      </div>

      {spec.promptLabel && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={promptId}>{spec.promptLabel}</Label>
          <Textarea
            id={promptId}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={spec.promptPlaceholder}
            rows={2}
          />
        </div>
      )}

      {spec.orientEditable ? (
        <div className="flex flex-col gap-1.5">
          <span id={orientLabelId} className="text-label text-fg">Khổ</span>
          <RadioGroup
            aria-labelledby={orientLabelId}
            value={orient}
            onValueChange={(v) => onOrientChange(v as GenOrient)}
            className="flex gap-4"
          >
            {GEN_ORIENTS.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-body text-fg-strong">
                <RadioGroupItem value={o} />
                {ORIENT_LABEL[o]}
              </label>
            ))}
          </RadioGroup>
        </div>
      ) : (
        <p className="text-caption text-fg-muted-raised">{spec.orientFixedNote}</p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-label text-fg">Ảnh mẫu</span>
        <p className="text-caption text-fg-muted-raised">
          {refNames.length === 0
            ? "Chưa chọn ảnh nào trên bàn — máy sẽ vẽ mới hoàn toàn."
            : `Đang dùng ${refNames.length} ảnh đang chọn trên bàn.`}
        </p>
      </div>

      {truthNote !== "" && (
        <p className={cn("flex gap-2 p-3 text-caption text-fg", FLORA.r12, "bg-raised")}>
          <Info aria-hidden strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0 text-fg-muted-raised" />
          <span>{truthNote}</span>
        </p>
      )}

      <Separator />

      {/* ══ P-SWEEP·12 · BA LỚP GIẢI THÍCH QUANH MỘT NÚT KHÔNG BẤM ĐƯỢC → CÒN HAI ══
          Nút «Vẽ (sắp có)» trước đây được bọc thêm một `Tooltip`. Vì popover chỉ rộng
          320px và tooltip neo mặc định, khối chữ đen hai dòng TRÀN RA NGOÀI mép phải
          popover và đè lên chính nội dung nó đang giải thích: che dòng "Chưa chọn ảnh
          nào trên bàn…" và che luôn badge "Chưa lưu" (ảnh 24).
          Bỏ tooltip, không thay bằng `collisionPadding`: chữ trên nút ĐÃ nói "(sắp
          có)" — nhìn là biết, không cần rê chuột. Dòng chi phí bên trái vẫn còn, nên
          lời hứa của FE3-PLAN §3-C2 ("xem trước được sẽ tốn bao nhiêu lượt") vẫn giữ
          nguyên. `DRAW_SOON_REASON` chuyển xuống `title` — ai muốn biết thêm vẫn đọc
          được, mà nó không vẽ thêm một khối nào lên màn. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-caption text-fg-muted-raised">{costLine}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={submitDisabled || submitting}
          onClick={onSubmit}
          aria-label={BTN.GEN_CONFIRM}
        >
          {submitting ? "Đang xếp lượt…" : BTN.GEN_CONFIRM}
        </Button>
      </div>
    </div>
  );
}
