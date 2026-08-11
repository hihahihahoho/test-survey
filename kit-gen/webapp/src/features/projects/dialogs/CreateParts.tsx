import * as React from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { AlertTriangle, Copy, FileUp, FilePlus2, Package, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { slugify } from "../lib/slug";

/** 4 template của §4.1 — NỘI DUNG CHỐT trong spec, không để dev tự nghĩ. */
export type TemplateId = "basic" | "blank" | "from-project" | "import";

export const TEMPLATES: {
  id: TemplateId;
  title: string;
  icon: LucideIcon;
  lines: string[];
  badge?: string;
}[] = [
  { id: "basic", title: "Kit cơ bản", icon: Package, lines: ["3 sheet · 25 ô", "24 element + 1 nền"], badge: "Khuyến nghị" },
  { id: "blank", title: "Trống", icon: FilePlus2, lines: ["0 sheet", "tự chọn từ thư viện"] },
  { id: "from-project", title: "Từ dự án đang có", icon: Copy, lines: ["chọn phần muốn sao chép"] },
  { id: "import", title: "Nhập file", icon: FileUp, lines: [".zip hoặc styles.json cũ"] },
];

/**
 * Bộ chọn template. Là `<RadioGroup>` THẬT của Radix (§5.8-A5: không `<div onclick>`),
 * nên mũi tên di chuyển được và screen reader đọc đúng "1 trong 4".
 */
export function TemplatePicker({
  value,
  onChange,
}: {
  value: TemplateId;
  onChange: (v: TemplateId) => void;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as TemplateId)}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {TEMPLATES.map((t) => {
        const Icon = t.icon;
        const on = value === t.id;
        return (
          <Label
            key={t.id}
            htmlFor={`tpl-${t.id}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-2 border p-3 transition-colors duration-fast",
              on ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle bg-raised hover:bg-overlay",
            )}
          >
            <RadioGroupItem id={`tpl-${t.id}`} value={t.id} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-body text-fg-strong">
                <Icon className="size-4 text-fg-muted-raised" aria-hidden />
                {t.title}
                {t.badge && <Badge tone="accent">{t.badge}</Badge>}
              </span>
              <span className="text-caption font-normal text-fg-muted-raised">{t.lines.join(" · ")}</span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

/**
 * Ô nhập tag. Enter hoặc dấu phẩy để thêm; tag được chuẩn hoá bằng cùng thuật
 * toán slug (không dấu, chữ thường) để lọc theo tag không bao giờ trượt vì dấu.
 * Trần 8 tag — nhiều hơn thì thẻ project không còn chỗ hiện.
 */
export function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const t = slugify(draft, { max: 24 });
    if (t !== "" && !tags.includes(t) && tags.length < 8) onChange([...tags, t]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="tag-input">Tag (không bắt buộc)</Label>
      <Input
        id="tag-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="tet, banking… Enter để thêm"
        autoComplete="off"
        aria-describedby="tag-help"
      />
      <p id="tag-help" className="text-caption text-fg-muted-raised">
        Tag dùng để lọc nhanh ở danh sách. Tối đa 8 tag.
      </p>
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1 pt-1">
          {tags.map((t) => (
            <li key={t}>
              <Badge tone="outline">
                {t}
                <button
                  type="button"
                  onClick={() => onChange(tags.filter((x) => x !== t))}
                  aria-label={`Bỏ tag ${t}`}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Chọn màu nền tách cho phong cách đầu tiên (§3-S3.6). */
export function BgPicker({
  value,
  onChange,
}: {
  value: "magenta" | "green";
  onChange: (v: "magenta" | "green") => void;
}) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as "magenta" | "green")} className="flex gap-2 pt-1">
      {(["magenta", "green"] as const).map((bg) => (
        <Label
          key={bg}
          htmlFor={`bg-${bg}`}
          className={cn(
            "flex flex-1 cursor-pointer items-center gap-2 rounded-2 border p-2.5",
            value === bg ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle bg-raised hover:bg-overlay",
          )}
        >
          <RadioGroupItem id={`bg-${bg}`} value={bg} />
          <span className="text-body text-fg-strong">{bg === "magenta" ? "Magenta" : "Green"}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}

/**
 * §4.1-2 TRÙNG TÊN HIỂN THỊ: cho phép, chỉ cảnh báo + gợi ý "(2)".
 * Tách khỏi `CreateProjectDialog` (FE-2·B1) để file dialog ở dưới trần 400 dòng
 * sau khi thêm khối chọn mode; hành vi và câu chữ KHÔNG đổi.
 */
export function DuplicateNameWarning({
  warn,
  suggestion,
  onUse,
}: {
  warn: string;
  suggestion: string;
  onUse: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="text-caption text-fg-strong">{warn}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onUse}>
          Dùng «{suggestion}»
        </Button>
      </div>
    </div>
  );
}

/**
 * Hai ô của PHONG CÁCH ĐẦU TIÊN (§3-S3.6) — chỉ hiện với template `basic`/`blank`.
 *
 * Tách khỏi `CreateProjectDialog` (FE-2·B2) để file dialog ở dưới trần ~400 dòng sau khi
 * thêm khối đọc đầu bài. **Hành vi, câu chữ và tên field KHÔNG đổi** — đây thuần tuý là
 * di chuyển JSX; test payload `firstVariant` hiện có là cổng kiểm chuyện đó.
 *
 * Generic theo kiểu form của chỗ gọi (KHÔNG `as any`, KHÔNG ép kiểu): `tsc` vẫn kiểm
 * rằng form thật sự có hai field `variantVi`/`bg`.
 */
export function FirstVariantFields<T extends FieldValues & { variantVi: string; bg: "magenta" | "green" }>({
  control,
}: {
  control: Control<T>;
}) {
  const c = control;
  const nVariant = "variantVi" as Path<T>;
  const nBg = "bg" as Path<T>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={c}
        name={nVariant}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Phong cách đầu tiên</FormLabel>
            <FormControl>
              <Input maxLength={60} {...field} />
            </FormControl>
            <FormDescription>Cùng bộ element, khác art style / màu brand.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={c}
        name={nBg}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Màu nền tách</FormLabel>
            <FormControl>
              <BgPicker
                value={field.value as "magenta" | "green"}
                onChange={(v) => field.onChange(v)}
              />
            </FormControl>
            <FormDescription>Nền đơn sắc để máy tách trong suốt.</FormDescription>
          </FormItem>
        )}
      />
    </div>
  );
}
