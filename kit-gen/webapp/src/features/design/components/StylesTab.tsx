import * as React from "react";
import { Copy, Eye, Info, MoreHorizontal, Palette, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common";
import { contractVariants, slugify, type Contract, type Variant } from "@/lib/types/contract";
import { jobCountOfVariant } from "../lib/ops";
import type { ValidationResult } from "../lib/validate";
import { Field } from "./Field";

/**
 * TAB "PHONG CÁCH" — `?tab=styles` (§3-S3.5).
 *
 * ĐÓNG AUDIT C3 (segmented control giấu dữ liệu im lặng): khi user chọn "Gõ mô tả"
 * mà vẫn còn ảnh inspo đã tải, ta KHÔNG im lặng bỏ qua chúng — có dòng
 * `ⓘ N ảnh … đang KHÔNG được dùng` + [Xem]. Đây là chỗ v1 làm user mất công tải ảnh
 * rồi không hiểu vì sao ảnh không ảnh hưởng gì tới kết quả.
 *
 * `styleMode` là `"prompt" | "inspo"` — theo gen.sh:95, KHÔNG phải "image"
 * (R0 đã ghi rõ trong contract.ts vì sao). `brand.mode` mới là "colors" | "image".
 */
export interface StylesTabProps {
  contract: Contract;
  validation: ValidationResult;
  readOnly: boolean;
  readOnlyReason: string;
  selectedVariantId: string | null;
  onSelectVariant: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<Variant>, label?: string) => void;
  onRenameId: (oldId: string, newId: string) => void;
  onPatchBrand: (id: string, patch: Record<string, unknown>, label?: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function StylesTab(props: StylesTabProps) {
  const { contract, readOnly, readOnlyReason } = props;
  const variants = contractVariants(contract);
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};

  if (variants.length === 0) {
    return (
      <EmptyState
        icon={Palette}
        title="Chưa có phong cách nào"
        description="Mỗi phong cách dùng chung bộ element nhưng khác art style, màu brand và nhân vật. Chưa có phong cách thì chưa sinh được ảnh."
        action={
          <Button variant="primary" size="lg" {...disProps} onClick={props.onAdd}>
            Thêm phong cách đầu tiên
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-title text-fg-strong">Phong cách</h2>
        <Badge tone="never">{variants.length}</Badge>
        <Button variant="secondary" size="sm" className="ml-auto gap-1.5" {...disProps} onClick={props.onAdd}>
          <Plus className="size-3.5" aria-hidden />
          Thêm phong cách
        </Button>
      </div>

      {variants.map((v) => (
        <VariantCard key={v.id} variant={v} {...props} />
      ))}
    </div>
  );
}

function VariantCard({
  variant: v, contract, validation, readOnly, readOnlyReason, onPatch, onRenameId, onPatchBrand, onDuplicate, onRemove, onSelectVariant, selectedVariantId,
}: StylesTabProps & { variant: Variant }) {
  const t = (field: string) => ({ kind: "variant" as const, variantId: v.id, field });
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};
  const styleMode = v.styleMode ?? "prompt";
  const brandMode = v.brand?.mode ?? "colors";
  const inspo = v.inspo ?? [];
  const brandRefs = v.brand?.refs ?? [];
  const [showUnused, setShowUnused] = React.useState(false);
  const color = typeof v.brand?.primary === "string" && /^#[0-9a-f]{3,8}$/i.test(v.brand.primary) ? v.brand.primary : null;
  const selected = selectedVariantId === v.id;

  return (
    <Card
      className={selected ? "border-accent" : undefined}
      onFocusCapture={() => onSelectVariant(v.id)}
      aria-label={`Phong cách ${v.vi || v.id}`}
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <span
          className="size-3 shrink-0 rounded-full border border-line"
          style={color ? { background: color } : undefined}
          aria-hidden
        />
        <h3 className="text-subtitle text-fg-strong">{v.vi || v.id}</h3>
        <code className="text-caption text-fg-muted-raised">({v.id})</code>
        <Badge tone="accent" className="ml-auto">
          {jobCountOfVariant(contract, v.id)} lượt sinh ảnh
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Thao tác với phong cách ${v.vi || v.id}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem {...disProps} onSelect={() => onDuplicate(v.id)}>
              <Copy aria-hidden />
              Nhân bản phong cách
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem {...disProps} destructive onSelect={() => onRemove(v.id)}>
              <Trash2 aria-hidden />
              Xoá phong cách…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id={`v-vi-${v.id}`} label="Tên hiển thị" validation={validation} target={t("vi")}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                value={v.vi}
                aria-describedby={describedBy}
                {...disProps}
                onChange={(e) => onPatch(v.id, { vi: e.target.value }, `Đổi tên phong cách «${v.id}»`)}
              />
            )}
          </Field>
          <Field
            id={`v-id-${v.id}`}
            label="Mã phong cách"
            validation={validation}
            target={t("id")}
            hint="Dùng trong tên file ảnh. Đổi mã sẽ cập nhật mọi sheet đang trỏ tới."
          >
            {({ id, describedBy, invalid }) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  value={v.id}
                  className="font-mono"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  {...disProps}
                  onChange={(e) => onRenameId(v.id, e.target.value.trim())}
                />
                {invalid && slugify(v.vi || v.id) !== v.id && (
                  <Button variant="secondary" className="shrink-0" {...disProps} onClick={() => onRenameId(v.id, slugify(v.vi || v.id))}>
                    {slugify(v.vi || v.id)}
                  </Button>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* ── Nguồn art style — segmented control KHÔNG được giấu dữ liệu (C3) ── */}
        <fieldset className="flex flex-col gap-2" disabled={readOnly}>
          <legend className="mb-1 text-label text-fg-strong">Nguồn art style</legend>
          <RadioGroup
            value={styleMode}
            onValueChange={(m) => onPatch(v.id, { styleMode: m as "prompt" | "inspo" }, `Đổi nguồn art style của «${v.id}»`)}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="prompt" id={`v-sm-p-${v.id}`} />
              <Label htmlFor={`v-sm-p-${v.id}`} className="cursor-pointer">Gõ mô tả</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="inspo" id={`v-sm-i-${v.id}`} />
              <Label htmlFor={`v-sm-i-${v.id}`} className="cursor-pointer">Dùng ảnh tham khảo</Label>
            </div>
          </RadioGroup>
        </fieldset>

        {styleMode === "prompt" ? (
          <>
            <Field
              id={`v-style-${v.id}`}
              label="Mô tả art style (tiếng Anh)"
              validation={validation}
              target={t("style")}
              hint="Ví dụ: vibrant Vietnamese Tet, red & gold, glossy 3D candy style"
            >
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={v.style}
                  aria-describedby={describedBy}
                  {...disProps}
                  onChange={(e) => onPatch(v.id, { style: e.target.value }, `Sửa art style của «${v.id}»`)}
                />
              )}
            </Field>
            {inspo.length > 0 && (
              <UnusedNote
                text={`${inspo.length} ảnh tham khảo đã tải đang KHÔNG được dùng (vì đang chọn "Gõ mô tả").`}
                open={showUnused}
                onToggle={() => setShowUnused((s) => !s)}
                items={inspo}
              />
            )}
          </>
        ) : (
          <>
            <p className="text-caption text-fg">
              Đang dùng {inspo.length} ảnh tham khảo làm nguồn art style. Ảnh tải lên ở màn Cài đặt project.
            </p>
            {v.style.trim() !== "" && (
              <UnusedNote
                text='Đoạn mô tả art style đang KHÔNG được dùng (vì đang chọn "Dùng ảnh tham khảo").'
                open={showUnused}
                onToggle={() => setShowUnused((s) => !s)}
                items={[v.style]}
              />
            )}
          </>
        )}

        {/* ── Màu brand ── */}
        <fieldset className="flex flex-col gap-3" disabled={readOnly}>
          <legend className="mb-1 text-label text-fg-strong">Màu brand</legend>
          <RadioGroup
            value={brandMode}
            onValueChange={(m) => onPatchBrand(v.id, { mode: m }, `Đổi nguồn màu brand của «${v.id}»`)}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="colors" id={`v-bm-c-${v.id}`} />
              <Label htmlFor={`v-bm-c-${v.id}`} className="cursor-pointer">Chọn màu</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="image" id={`v-bm-i-${v.id}`} />
              <Label htmlFor={`v-bm-i-${v.id}`} className="cursor-pointer">Dùng ảnh brand</Label>
            </div>
          </RadioGroup>

          {brandMode === "colors" ? (
            <div className="flex flex-wrap items-end gap-3">
              <ColorField
                id={`v-c1-${v.id}`}
                label="Màu chính"
                value={v.brand?.primary ?? "#005BAA"}
                disabled={readOnly}
                onChange={(hex) => onPatchBrand(v.id, { primary: hex }, `Đổi màu chính của «${v.id}»`)}
              />
              <ColorField
                id={`v-c2-${v.id}`}
                label="Màu phụ"
                value={v.brand?.secondary ?? "#00B0F0"}
                disabled={readOnly}
                onChange={(hex) => onPatchBrand(v.id, { secondary: hex }, `Đổi màu phụ của «${v.id}»`)}
              />
              {brandRefs.length > 0 && (
                <UnusedNote
                  className="w-full"
                  text={`${brandRefs.length} ảnh brand đã tải đang KHÔNG được dùng (vì đang chọn "Chọn màu").`}
                  open={showUnused}
                  onToggle={() => setShowUnused((s) => !s)}
                  items={brandRefs}
                />
              )}
            </div>
          ) : (
            <p className="text-caption text-fg">
              Đang lấy màu từ {brandRefs.length} ảnh brand. Ảnh tải lên ở màn Cài đặt project.
            </p>
          )}
        </fieldset>

        {/* ── Nhân vật ── */}
        <div className="flex flex-col gap-2">
          <h4 className="flex items-center gap-1.5 text-label text-fg-strong">
            <Users className="size-3.5" aria-hidden />
            Nhân vật trong phong cách này
          </h4>
          {(v.characters ?? []).length === 0 ? (
            <p className="text-caption text-fg-muted-raised">
              Chưa có nhân vật. Thêm ở cây bên trái — nhân vật và bộ dáng chỉ áp dụng cho project này.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2" role="list">
              {(v.characters ?? []).map((ch) => (
                <li key={ch.id}>
                  <Badge tone="never" className="gap-1">
                    {ch.vi || ch.id} · {(ch.poses ?? []).length} dáng
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-2 text-caption text-fg-muted-raised">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          Màu nền tách của phong cách này: <code className="text-fg">{v.bg}</code>. Đổi ở tab «Nâng cao».
        </p>
      </CardContent>
    </Card>
  );
}

/** Dòng `ⓘ … đang KHÔNG được dùng` + [Xem] — đóng audit C3. */
function UnusedNote({
  text, open, onToggle, items, className,
}: {
  text: string;
  open: boolean;
  onToggle: () => void;
  items: readonly string[];
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="flex items-center gap-2 rounded-2 bg-raised px-3 py-1.5 text-caption text-fg">
        <Info className="size-3.5 shrink-0 text-accent-text" aria-hidden />
        <span className="min-w-0 flex-1">{text}</span>
        <Button variant="ghost" size="sm" className="shrink-0 gap-1" aria-expanded={open} onClick={onToggle}>
          <Eye className="size-3" aria-hidden />
          {open ? "Ẩn" : "Xem"}
        </Button>
      </p>
      {open && (
        <ul className="mt-1 flex flex-col gap-1 pl-8 text-caption text-fg-muted-raised" role="list">
          {items.map((x, i) => (
            <li key={i} className="truncate font-mono">
              {x}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorField({
  id, label, value, disabled, onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (hex: string) => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="size-ctl-md cursor-pointer rounded-1 border border-line bg-raised p-0.5 disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-raised"
        />
        <Input
          value={value}
          disabled={disabled}
          aria-label={`${label} dạng mã hex`}
          className="w-28 font-mono"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
