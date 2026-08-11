import * as React from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { Sheet } from "@/lib/types/contract";
import { cellCount, overflowOf, realCount, type OverflowMode } from "../lib/ops";

/**
 * ĐỔI LƯỚI + XỬ LÝ HỆ QUẢ — yêu cầu §3 của brief, và là thao tác dễ mất dữ liệu nhất
 * của cả màn.
 *
 * Nguyên tắc §1 của spec ("thấy trước hậu quả"): user phải BIẾT mất gì TRƯỚC khi bấm.
 * Vì vậy dialog tính sẵn `overflowOf()` và hiện ĐÍCH DANH tên element sẽ bị bỏ, chứ
 * không nói chung chung "một số element có thể bị mất".
 *
 * Ba lối ra khi lưới nhỏ đi (mặc định là lối AN TOÀN, không phải lối phá huỷ):
 *   · grow — nới thêm hàng cho vừa hết element (KHÔNG mất gì)   ← mặc định
 *   · move — chuyển phần thừa sang sheet mới                     (KHÔNG mất gì)
 *   · drop — bỏ hẳn                                              (mất, phải chọn có ý thức)
 * Lưới to ra thì không hỏi gì: tự bù ô trống.
 */
export interface ResizeGridDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheet: Sheet;
  onConfirm: (cols: number, rows: number, overflow: OverflowMode) => void;
}

export function ResizeGridDialog({ open, onOpenChange, sheet, onConfirm }: ResizeGridDialogProps) {
  const [cols, setCols] = React.useState(sheet.grid.cols);
  const [rows, setRows] = React.useState(sheet.grid.rows);
  const [mode, setMode] = React.useState<OverflowMode>("grow");

  React.useEffect(() => {
    if (open) {
      setCols(sheet.grid.cols);
      setRows(sheet.grid.rows);
      setMode("grow");
    }
  }, [open, sheet.grid.cols, sheet.grid.rows]);

  const valid = Number.isInteger(cols) && Number.isInteger(rows) && cols >= 1 && cols <= 8 && rows >= 1 && rows <= 8;
  const nextTotal = valid ? cols * rows : 0;
  const curTotal = cellCount(sheet);
  const lost = valid ? overflowOf(sheet, cols, rows) : [];
  const added = Math.max(0, nextTotal - curTotal);
  const changed = valid && (cols !== sheet.grid.cols || rows !== sheet.grid.rows);

  const growRows = Math.ceil(realCountUpTo(sheet) / Math.max(1, cols)) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-modal-md">
        <DialogHeader>
          <DialogTitle>Đổi lưới sheet «{sheet.id}»</DialogTitle>
          <DialogDescription>
            Lưới quyết định bố cục ảnh sinh ra. Số ô phải luôn bằng số cột × số hàng.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rg-cols">Số cột</Label>
              <Input
                id="rg-cols"
                type="number"
                min={1}
                max={8}
                value={cols}
                className="w-24"
                onChange={(e) => setCols(Number(e.target.value))}
              />
            </div>
            <span className="pb-2 text-fg-muted" aria-hidden>
              ×
            </span>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rg-rows">Số hàng</Label>
              <Input
                id="rg-rows"
                type="number"
                min={1}
                max={8}
                value={rows}
                className="w-24"
                onChange={(e) => setRows(Number(e.target.value))}
              />
            </div>
            <p className="flex items-center gap-2 pb-2 text-caption text-fg-muted-raised">
              <span className="font-mono">{curTotal} ô</span>
              <ArrowRight className="size-3" aria-hidden />
              <span className={cn("font-mono", valid ? "text-fg-strong" : "text-danger")}>
                {valid ? `${nextTotal} ô` : "không hợp lệ"}
              </span>
            </p>
          </div>

          {!valid && (
            <p role="alert" className="text-caption text-danger">
              Số cột và số hàng phải là số nguyên từ 1 đến 8.
            </p>
          )}

          {valid && added > 0 && (
            <p className="rounded-2 bg-raised p-3 text-caption text-fg">
              Thêm <strong>{added} ô trống</strong> vào cuối sheet. Không element nào bị ảnh hưởng.
            </p>
          )}

          {valid && lost.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2 kg-tint-warn p-3">
              <p className="flex items-start gap-2 text-caption text-on-tint-warn">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  Lưới nhỏ hơn số element đang có. <strong>{lost.length} element</strong> không còn chỗ:{" "}
                  {lost.slice(0, 4).map((c) => c.vi || c.file).filter(Boolean).join(", ")}
                  {lost.length > 4 ? `, và ${lost.length - 4} cái nữa` : ""}.
                </span>
              </p>

              <RadioGroup value={mode} onValueChange={(v) => setMode(v as OverflowMode)} className="flex flex-col gap-2">
                <Choice
                  value="grow"
                  id="rg-grow"
                  title={`Giữ tất cả — nới thành ${cols}×${growRows}`}
                  desc="Không mất element nào. Lưới cao hơn số hàng bạn gõ."
                />
                <Choice
                  value="move"
                  id="rg-move"
                  title={`Chuyển ${lost.length} element sang sheet mới «${sheet.id}-2»`}
                  desc="Không mất element nào. Sheet mới sinh thêm lượt ảnh riêng."
                />
                <Choice
                  value="drop"
                  id="rg-drop"
                  title={`Bỏ hẳn ${lost.length} element`}
                  desc="Mất nội dung của các element đó. Hoàn tác được bằng ⌘Z nếu chưa lưu."
                  danger
                />
              </RadioGroup>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant={lost.length > 0 && mode === "drop" ? "danger" : "primary"}
            disabled={!valid || !changed}
            {...(!changed ? { title: "Lưới chưa thay đổi" } : {})}
            onClick={() => {
              onConfirm(cols, rows, mode);
              onOpenChange(false);
            }}
          >
            {lost.length > 0 && mode === "drop" ? `Đổi lưới và bỏ ${lost.length} element` : "Đổi lưới"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  value, id, title, desc, danger,
}: {
  value: string;
  id: string;
  title: string;
  desc: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroupItem value={value} id={id} className="mt-0.5" />
      <div className="flex min-w-0 flex-col">
        <Label htmlFor={id} className={cn("cursor-pointer", danger && "text-danger")}>
          {title}
        </Label>
        <span className="text-caption text-fg-muted-raised">{desc}</span>
      </div>
    </div>
  );
}

/** Vị trí element THẬT cuối cùng + 1 — số ô tối thiểu để không mất gì. */
function realCountUpTo(sheet: Sheet): number {
  let last = -1;
  sheet.components.forEach((c, i) => {
    if (String(c.skel?.shape ?? "") !== "empty") last = i;
  });
  return Math.max(1, last + 1, realCount(sheet));
}
