import { Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CheckerboardImage } from "@/components/common";
import type { Character, Variant } from "@/lib/types/contract";
import { poseOptions } from "../lib/shapes";
import type { ValidationResult } from "../lib/validate";
import { Field, PanelSection } from "./Field";

/**
 * PANEL ③ dạng NHÂN VẬT (§3-S3.4-3).
 *
 * Đóng audit A3: bộ dáng THUỘC PROJECT, không phải cấu hình toàn cục — header nói
 * thẳng điều đó để user không đi tìm "cài đặt dáng chung" (v1 làm họ tưởng vậy).
 *
 * 19 dáng là `<input type=checkbox>` CÓ NHÃN thật (đóng I2/I4: v1 dùng div bấm được,
 * screen reader không đọc ra, bàn phím không tới được).
 */
export interface CharacterPropsProps {
  variant: Variant;
  character: Character;
  validation: ValidationResult;
  readOnly: boolean;
  readOnlyReason: string;
  /** URL ảnh ref (màn cấp qua `api.files.thumbUrl`) — không có thì hiện dropzone rỗng. */
  refUrl?: string | null;
  onPatch: (patch: Partial<Character>, label?: string) => void;
  onTogglePose: (pose: string) => void;
  onPickRef: () => void;
  onDelete: () => void;
}

export function CharacterProps({
  variant, character, validation, readOnly, readOnlyReason, refUrl,
  onPatch, onTogglePose, onPickRef, onDelete,
}: CharacterPropsProps) {
  const t = (field: string) => ({
    kind: "character" as const,
    variantId: variant.id,
    characterId: character.id,
    field,
  });
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};
  const poses = character.poses ?? [];
  const all = poseOptions();

  return (
    <div className="flex flex-col gap-4">
      <PanelSection title="Nhân vật">
        <p className="flex items-start gap-2 rounded-2 bg-raised p-3 text-caption text-fg">
          <Info className="mt-px size-3.5 shrink-0 text-accent-text" aria-hidden />
          <span>
            Nhân vật và bộ dáng này <strong>chỉ áp dụng cho project hiện tại</strong>, nằm trong phong cách «
            {variant.vi || variant.id}». Project khác có bộ riêng.
          </span>
        </p>

        <Field id="ch-id" label="Mã nhân vật" validation={validation} target={t("id")} hint="Chữ thường, số, gạch nối.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={character.id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              className="font-mono"
              {...disProps}
              onChange={(e) => onPatch({ id: e.target.value.trim() }, `Đổi mã nhân vật «${character.id}»`)}
            />
          )}
        </Field>

        <Field id="ch-vi" label="Tên hiển thị" validation={validation} target={t("vi")}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={character.vi}
              aria-describedby={describedBy}
              {...disProps}
              onChange={(e) => onPatch({ vi: e.target.value }, `Đổi tên nhân vật «${character.id}»`)}
            />
          )}
        </Field>

        <Field
          id="ch-ref"
          label="Ảnh tham khảo"
          validation={validation}
          target={t("ref")}
          hint="Ảnh mẫu để AI giữ đúng ngoại hình nhân vật ở mọi dáng."
        >
          {({ describedBy }) => (
            <div className="flex items-center gap-3" aria-describedby={describedBy}>
              <CheckerboardImage
                src={refUrl ?? undefined}
                alt={`Ảnh tham khảo của ${character.vi || character.id}`}
                className="size-20 shrink-0"
                fallbackText="Chưa có ảnh"
              />
              <Button variant="secondary" size="sm" {...disProps} onClick={onPickRef}>
                {character.ref ? "Đổi ảnh…" : "Chọn ảnh…"}
              </Button>
            </div>
          )}
        </Field>
      </PanelSection>

      <PanelSection title={`Dáng · đã chọn ${poses.length}/${all.length}`}>
        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="sr-only">Chọn dáng cho nhân vật {character.vi || character.id}</legend>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2" role="list">
            {all.map((p) => {
              const id = `ch-pose-${character.id}-${p.value}`;
              return (
                <li key={p.value} className="flex items-center gap-2">
                  <Checkbox id={id} checked={poses.includes(p.value)} onCheckedChange={() => onTogglePose(p.value)} />
                  <Label htmlFor={id} className="cursor-pointer truncate text-caption">
                    {p.label}
                  </Label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p className="text-caption text-fg-muted-raised">
          Mỗi dáng là một ô trong sheet dáng — chọn nhiều dáng thì sheet phải đủ ô cho từng dáng.
        </p>
      </PanelSection>

      <PanelSection title="Nguy hiểm">
        <Button variant="secondary" size="sm" className="gap-2 self-start text-danger" {...disProps} onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
          Xoá nhân vật «{character.vi || character.id}»
        </Button>
      </PanelSection>
    </div>
  );
}
