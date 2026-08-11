import * as React from "react";
import { Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { slugify, type Component, type Sheet } from "@/lib/types/contract";
import { MATTE_VALUES, elementPixels, poseOptions, shapeOptions } from "../lib/shapes";
import type { ValidationResult } from "../lib/validate";
import { Field, PanelSection } from "./Field";
import { Silhouette } from "./Silhouette";

/**
 * PANEL ③ dạng ELEMENT (§3-S3.4-1).
 *
 * `spec` (mô tả cho AI) SỬA ĐƯỢC — đóng audit C7: v1 chỉ cho xem, muốn đổi phải mở
 * file JSON bằng tay.
 *
 * KHÔNG dùng react-hook-form ở đây, có lý do: panel này là "sửa tới đâu thấy tới đó"
 * (mỗi lần gõ là một `apply()` vào contract, lưới cập nhật ngay, undo bắt được từng
 * bước). RHF sinh ra để gom một form rồi submit một lần — dùng nó ở đây sẽ phải đồng
 * bộ hai nguồn sự thật (form state ↔ contract) và chắc chắn lệch khi undo/redo hoặc
 * khôi phục nháp đổi contract từ bên ngoài. RHF+zod vẫn được dùng ở các DIALOG
 * (đổi lưới, đổi tên) — nơi có submit thật.
 */
export interface ElementPropsProps {
  sheet: Sheet;
  index: number;
  comp: Component;
  validation: ValidationResult;
  readOnly: boolean;
  readOnlyReason: string;
  extraShapes: readonly string[];
  /** Bản gốc trong thư viện (nếu có) — để hiện badge `✎ đã sửa` + [Trả về bản gốc]. */
  libEntry?: { spec?: string; skel?: Record<string, unknown> } | null;
  onPatch: (patch: Parameters<typeof identity>[0], label?: string) => void;
  onDelete: () => void;
  onResetToLib?: (() => void) | undefined;
}

// chỉ để lấy kiểu patch chuẩn, không dùng lúc chạy
declare function identity(p: { file?: string; vi?: string; spec?: string; skel?: Record<string, unknown> }): void;

export function ElementProps({
  sheet, index, comp, validation, readOnly, readOnlyReason, extraShapes, libEntry,
  onPatch, onDelete, onResetToLib,
}: ElementPropsProps) {
  const skel = (comp.skel ?? {}) as Record<string, unknown>;
  const t = (field: string) => ({ kind: "element" as const, sheetId: sheet.id, index, field });
  const dis = readOnly;
  const disProps = dis ? { disabled: true, title: readOnlyReason } : {};
  const px = elementPixels(sheet.orient, sheet.grid, skel as { w?: number; h?: number; shape?: string });
  const shape = String(skel.shape ?? "");
  const edited = libEntry ? differsFromLib(comp, libEntry) : false;
  const suggestion = React.useMemo(() => suggestFileName(comp, index), [comp, index]);

  return (
    <div className="flex flex-col gap-4">
      <PanelSection
        title={`Element · ô ${index + 1}`}
        action={edited ? <Badge tone="accent">✎ đã sửa</Badge> : null}
      >
        <div className="flex items-center gap-3 rounded-2 border border-line-subtle bg-canvas/40 p-3">
          <Silhouette skel={skel} orient={sheet.orient} uid={`props-${sheet.id}-${index}`} className="h-16 w-24 shrink-0" />
          <p className="text-caption text-fg-muted-raised">
            Trong ảnh sinh ra, element này rộng khoảng{" "}
            <strong className="text-fg">
              {px.w}×{px.h} px
            </strong>{" "}
            (ô {sheet.grid.cols}×{sheet.grid.rows}, {sheet.orient === "portrait" ? "dọc" : "ngang"}).
          </p>
        </div>

        <Field
          id="el-file"
          label="Tên file"
          validation={validation}
          target={t("file")}
          hint="2 số + gạch nối + chữ thường, ví dụ 17-btn-close"
        >
          {({ id, describedBy, invalid }) => (
            <div className="flex gap-2">
              <Input
                id={id}
                value={comp.file}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="font-mono"
                {...disProps}
                onChange={(e) => onPatch({ file: e.target.value.trim() }, `Đổi tên file ô ${index + 1}`)}
              />
              {invalid && suggestion !== comp.file && (
                <Button
                  variant="secondary"
                  size="md"
                  className="shrink-0 gap-1.5"
                  {...disProps}
                  onClick={() => onPatch({ file: suggestion }, `Sửa tên file ô ${index + 1}`)}
                >
                  <Wand2 className="size-3.5" aria-hidden />
                  {suggestion}
                </Button>
              )}
            </div>
          )}
        </Field>

        <Field id="el-vi" label="Nhãn tiếng Việt" validation={validation} target={t("vi")}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={comp.vi}
              aria-describedby={describedBy}
              {...disProps}
              onChange={(e) => onPatch({ vi: e.target.value }, `Đổi nhãn ô ${index + 1}`)}
            />
          )}
        </Field>

        <Field
          id="el-spec"
          label="Mô tả cho AI"
          validation={validation}
          target={t("spec")}
          hint="Câu tiếng Anh mô tả hình dáng, chất liệu, màu. Đây là thứ quyết định ảnh sinh ra."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              rows={6}
              value={comp.spec}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              {...disProps}
              onChange={(e) => onPatch({ spec: e.target.value }, `Sửa mô tả ô ${index + 1}`)}
            />
          )}
        </Field>

        {edited && onResetToLib && (
          <Button variant="secondary" size="sm" className="self-start" {...disProps} onClick={onResetToLib}>
            Trả về bản gốc trong thư viện
          </Button>
        )}
      </PanelSection>

      <PanelSection title="Hình khối (khung xương)">
        <Field
          id="el-shape"
          label="Hình khối"
          validation={validation}
          target={t("shape")}
          hint="Hình này chỉ là khung định vị gửi cho AI, không phải hình cuối cùng."
        >
          {({ id, describedBy }) => (
            <Select
              value={shape || undefined}
              disabled={dis}
              onValueChange={(v) => onPatch({ skel: { shape: v } }, `Đổi hình khối ô ${index + 1}`)}
            >
              <SelectTrigger id={id} aria-describedby={describedBy}>
                <SelectValue placeholder="Chọn hình khối" />
              </SelectTrigger>
              <SelectContent>
                {shapeOptions(extraShapes).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    {!o.drawable && " · engine không vẽ khung"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {shape === "pose" && (
          <Field id="el-pose" label="Dáng" validation={validation} target={t("pose")}>
            {({ id, describedBy }) => (
              <Select
                value={typeof skel.pose === "string" && skel.pose ? skel.pose : undefined}
                disabled={dis}
                onValueChange={(v) => onPatch({ skel: { pose: v } }, `Đổi dáng ô ${index + 1}`)}
              >
                <SelectTrigger id={id} aria-describedby={describedBy}>
                  <SelectValue placeholder="Chọn dáng (mặc định: Đứng thẳng)" />
                </SelectTrigger>
                <SelectContent>
                  {poseOptions().map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id="el-w" label="Rộng (phần của ô)" validation={validation} target={t("w")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="number"
                min={0.05}
                max={1}
                step={0.01}
                value={numText(skel.w)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...disProps}
                onChange={(e) => onPatch({ skel: { w: Number(e.target.value) } }, `Đổi chiều rộng ô ${index + 1}`)}
              />
            )}
          </Field>
          <Field id="el-h" label="Cao (phần của ô)" validation={validation} target={t("h")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="number"
                min={0.05}
                max={1}
                step={0.01}
                value={numText(skel.h)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...disProps}
                onChange={(e) => onPatch({ skel: { h: Number(e.target.value) } }, `Đổi chiều cao ô ${index + 1}`)}
              />
            )}
          </Field>
        </div>

        <Field
          id="el-matte"
          label="Kiểu tách nền"
          validation={validation}
          target={t("matte")}
          hint="Chỉ dùng cho element phát sáng hoặc trong suốt — máy sẽ tách mềm thay vì cắt cứng."
        >
          {({ id, describedBy }) => (
            <Select
              value={typeof skel.matte === "string" && skel.matte ? skel.matte : "__none__"}
              disabled={dis}
              onValueChange={(v) =>
                onPatch({ skel: { matte: v === "__none__" ? undefined : v } }, `Đổi kiểu tách nền ô ${index + 1}`)
              }
            >
              <SelectTrigger id={id} aria-describedby={describedBy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Không (tách theo màu nền)</SelectItem>
                {MATTE_VALUES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "glow" ? "glow — hiệu ứng phát sáng" : "glass — vật liệu trong suốt"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <FlagRow
            id="el-slice9"
            checked={skel.slice9 === true}
            disabled={dis}
            label="slice9 — cắt 9 lát"
            hint="Nút/khung co giãn được mà không méo góc."
            onChange={(v) => onPatch({ skel: { slice9: v } }, `${v ? "Bật" : "Tắt"} slice9 ở ô ${index + 1}`)}
          />
          <FlagRow
            id="el-free"
            checked={skel.free === true}
            disabled={dis}
            label="free — khung tự do"
            hint="Không vẽ khung safe; để AI tự do tràn ra ngoài khung."
            onChange={(v) => onPatch({ skel: { free: v } }, `${v ? "Bật" : "Tắt"} khung tự do ở ô ${index + 1}`)}
          />
          <FlagRow
            id="el-anchor"
            checked={skel.anchor === "bottom"}
            disabled={dis}
            label="Dính đáy ô"
            hint="Dùng cho nhân vật đứng trên nền."
            onChange={(v) => onPatch({ skel: { anchor: v ? "bottom" : undefined } }, `Đổi neo ô ${index + 1}`)}
          />
        </div>
      </PanelSection>

      <PanelSection title="Nguy hiểm">
        <Button variant="secondary" size="sm" className="gap-2 self-start text-danger" {...disProps} onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
          Xoá element khỏi ô này
        </Button>
        <p className="text-caption text-fg-muted-raised">
          Ô sẽ thành ô trống — lưới giữ nguyên {sheet.grid.cols}×{sheet.grid.rows} nên bố cục các ô khác không xô lệch.
          Hoàn tác được bằng ⌘Z.
        </p>
      </PanelSection>
    </div>
  );
}

function FlagRow({
  id, checked, disabled, label, hint, onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <div className="flex min-w-0 flex-col">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <span className="text-caption text-fg-muted-raised">{hint}</span>
      </div>
    </div>
  );
}

const numText = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/** Gợi ý tên file đúng V-01 từ nhãn tiếng Việt (đóng E2: không từ chối im lặng). */
export function suggestFileName(comp: Component, index: number): string {
  const base = slugify(comp.vi || comp.file || "element") || "element";
  return `${String(index + 1).padStart(2, "0")}-${base}`;
}

/** Khác bản gốc trong thư viện ⇒ badge `✎ đã sửa` (chốt X8). */
export function differsFromLib(comp: Component, lib: { spec?: string; skel?: unknown } | null | undefined): boolean {
  if (!lib) return false;
  return (
    JSON.stringify({ spec: comp.spec ?? "", skel: comp.skel ?? {} }) !==
    JSON.stringify({ spec: lib.spec ?? "", skel: lib.skel ?? {} })
  );
}
