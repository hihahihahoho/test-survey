import { Grid3x3, Trash2, Wand2, Zap, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { contractVariants, sheetVariantFilter, slugify, type Contract, type Sheet } from "@/lib/types/contract";
import { sheetPixels } from "../lib/shapes";
import { cellCount, jobCountOfSheet, realCount } from "../lib/ops";
import type { ValidationResult } from "../lib/validate";
import { Field, PanelSection } from "./Field";

/**
 * PANEL ③ dạng SHEET (§3-S3.4-2).
 *
 * `variants[]` là checkbox thật, KHÔNG phải multi-select giả (§5.8-A5/I4), và ô
 * "áp cho mọi phong cách" nói rõ ngữ nghĩa "rỗng = tất cả" của engine — nếu không,
 * user bỏ tick hết rồi tưởng sheet bị tắt, trong khi thực tế nó chạy cho TẤT CẢ.
 */
export interface SheetPropsProps {
  contract: Contract;
  sheet: Sheet;
  validation: ValidationResult;
  readOnly: boolean;
  readOnlyReason: string;
  onPatch: (patch: Partial<Sheet>, label?: string) => void;
  onRename: (newId: string) => void;
  onSetVariants: (ids: string[]) => void;
  onResize: () => void;
  onDelete: () => void;
  onGenSheet: () => void;
  onSliceSheet: () => void;
}

export function SheetProps({
  contract, sheet, validation, readOnly, readOnlyReason,
  onPatch, onRename, onSetVariants, onResize, onDelete, onGenSheet, onSliceSheet,
}: SheetPropsProps) {
  const t = (field: string) => ({ kind: "sheet" as const, sheetId: sheet.id, field });
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};
  const only = sheetVariantFilter(sheet);
  const variants = contractVariants(contract);
  const px = sheetPixels(sheet.orient);
  const suggestion = slugify(sheet.id) || "sheet";

  return (
    <div className="flex flex-col gap-4">
      <PanelSection title="Sheet">
        <Field
          id="sh-id"
          label="Mã sheet"
          validation={validation}
          target={t("id")}
          hint="Chữ thường, số, gạch nối. Đây cũng là tên file ảnh sinh ra."
        >
          {({ id, describedBy, invalid }) => (
            <div className="flex gap-2">
              <Input
                id={id}
                value={sheet.id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="font-mono"
                {...disProps}
                onChange={(e) => onRename(e.target.value)}
              />
              {invalid && suggestion !== sheet.id && (
                <Button variant="secondary" className="shrink-0 gap-1.5" {...disProps} onClick={() => onRename(suggestion)}>
                  <Wand2 className="size-3.5" aria-hidden />
                  {suggestion}
                </Button>
              )}
            </div>
          )}
        </Field>

        <Field
          id="sh-grid"
          label="Lưới"
          validation={validation}
          target={t("grid")}
          hint={`Ảnh sinh ra ${px.w}×${px.h} px · ${realCount(sheet)}/${cellCount(sheet)} ô đang có element.`}
        >
          {({ id, describedBy }) => (
            <Button id={id} variant="secondary" className="justify-start gap-2" aria-describedby={describedBy} {...disProps} onClick={onResize}>
              <Grid3x3 className="size-3.5" aria-hidden />
              {sheet.grid.cols} cột × {sheet.grid.rows} hàng — đổi lưới…
            </Button>
          )}
        </Field>

        <Field id="sh-orient" label="Hướng ảnh" validation={validation} target={t("orient")}>
          {({ id, describedBy }) => (
            <Select
              value={sheet.orient ?? "landscape"}
              disabled={readOnly}
              onValueChange={(v) =>
                onPatch(
                  { orient: v as "landscape" | "portrait", cell_hint: v === "portrait" ? "portrait 2:3 cell" : "landscape 3:2 cell" },
                  `Đổi hướng sheet «${sheet.id}»`,
                )
              }
            >
              <SelectTrigger id={id} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">Ngang — ô 3:2 (1536×1024)</SelectItem>
                <SelectItem value="portrait">Dọc — ô 2:3 (1024×1536)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field id="sh-note" label="Ghi chú" validation={validation} target={t("note")}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              rows={2}
              value={sheet.note ?? ""}
              aria-describedby={describedBy}
              {...disProps}
              onChange={(e) => onPatch({ note: e.target.value }, `Sửa ghi chú sheet «${sheet.id}»`)}
            />
          )}
        </Field>
      </PanelSection>

      <PanelSection title={`Áp cho phong cách · ${jobCountOfSheet(contract, sheet)} lượt sinh ảnh`}>
        {variants.length === 0 ? (
          <p className="text-caption text-fg-muted-raised">
            Project chưa có phong cách nào. Sheet này chưa sinh được ảnh — thêm phong cách ở tab «Phong cách».
          </p>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <Checkbox
                id="sh-all-variants"
                checked={only.length === 0}
                disabled={readOnly}
                className="mt-0.5"
                onCheckedChange={(v) => onSetVariants(v === true ? [] : variants.map((x) => x.id))}
              />
              <div className="flex min-w-0 flex-col">
                <Label htmlFor="sh-all-variants" className="cursor-pointer">
                  Áp cho mọi phong cách
                </Label>
                <span className="text-caption text-fg-muted-raised">
                  Kể cả phong cách thêm sau này. Bỏ tick để chọn thủ công.
                </span>
              </div>
            </div>

            {only.length > 0 && (
              <ul className="flex flex-col gap-2 border-l border-line-subtle pl-3" role="list">
                {variants.map((v) => (
                  <li key={v.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`sh-v-${v.id}`}
                      checked={only.includes(v.id)}
                      disabled={readOnly}
                      onCheckedChange={(checked) =>
                        onSetVariants(checked === true ? [...only, v.id] : only.filter((x) => x !== v.id))
                      }
                    />
                    <Label htmlFor={`sh-v-${v.id}`} className="cursor-pointer truncate">
                      {v.vi || v.id}
                    </Label>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PanelSection>

      {/* HAI NÚT, HAI GIÁ TIỀN — và nhãn phải nói ra điều đó.
          Tiêu đề cũ ("Sinh ảnh sheet này") gộp cả hai dưới chữ "sinh", nên nút cắt đọc
          như một biến thể của sinh ảnh. Chúng KHÔNG cùng loại: một cái gọi model (tốn
          lượt, có modal xác nhận — dấu "…" báo trước điều đó), cái kia chỉ tách ảnh sẵn
          có trên máy. Người dùng phải phân biệt được TRƯỚC khi bấm, không phải sau. */}
      <PanelSection title="Ảnh của sheet này">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5" {...disProps} onClick={onGenSheet}>
            <Zap className="size-3.5" aria-hidden />
            Sinh sheet này…
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" {...disProps} onClick={onSliceSheet}>
            <Scissors className="size-3.5" aria-hidden />
            Cắt sheet này
          </Button>
        </div>
        <p className="text-caption text-fg-muted-raised">
          <strong className="font-medium text-fg">Sinh</strong> vẽ lại ảnh bằng AI — tiêu lượt, nên có bước xác nhận.{" "}
          <strong className="font-medium text-fg">Cắt</strong> chỉ tách ảnh đã vẽ thành từng element — chạy ngay, không tiêu lượt.
        </p>
        <p className="text-caption text-fg-muted-raised">
          Lưu bản thiết kế trước — engine đọc file trên đĩa, không đọc màn hình.
        </p>
      </PanelSection>

      <PanelSection title="Nguy hiểm">
        <Button variant="secondary" size="sm" className="gap-2 self-start text-danger" {...disProps} onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
          Xoá sheet «{sheet.id}»
        </Button>
        <p className="text-caption text-fg-muted-raised">
          Xoá {realCount(sheet)} element trong sheet này. Hoàn tác được bằng ⌘Z (nếu chưa lưu) hoặc khôi phục từ lịch sử.
        </p>
      </PanelSection>
    </div>
  );
}
