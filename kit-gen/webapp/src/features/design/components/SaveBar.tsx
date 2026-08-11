import { Redo2, Save, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyboardHint } from "@/components/common";
import { cn } from "@/lib/utils";

/**
 * THANH LƯU & DẤU BẨN (§3-S3.7).
 *
 *  · `v37 ● 3 thay đổi chưa lưu` (chấm cam) / `v37 ✓ đã lưu 12:04`
 *  · [💾 Lưu] DISABLED khi sạch (đóng audit B6) và khi còn lỗi chặn — cả hai ca đều
 *    KÈM TOOLTIP LÝ DO. Nút xám không giải thích là thứ audit đã phê phán.
 *  · Nhãn đổi thành "Lưu (3)" khi bẩn — cho biết còn bao nhiêu thay đổi treo.
 *
 * Undo/Redo nằm ở đây (store của R0 lo stack); [Lịch sử ▾] và banner nháp là slot của
 * R2-P2, cắm vào `extra`.
 */
export interface SaveBarProps {
  version: number;
  dirty: boolean;
  dirtyCount: number;
  savedAt: Date | null;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Lý do KHÔNG lưu được (còn lỗi / agent chưa chạy). `null` = lưu được. */
  blockedReason: string | null;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Slot của R2-P2: [Lịch sử ▾] + banner nháp + modal xung đột. */
  extra?: React.ReactNode;
}

export function SaveBar({
  version, dirty, dirtyCount, savedAt, saving, canUndo, canRedo, undoLabel, redoLabel,
  blockedReason, onUndo, onRedo, onSave, extra,
}: SaveBarProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Dấu bẩn — có CHẤM + CHỮ, không chỉ màu (A3) */}
      <p className="flex items-center gap-1.5 text-caption" aria-live="polite">
        <span className="font-mono text-fg-muted-raised">v{version}</span>
        {dirty ? (
          <>
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            <span className="text-on-tint-warn">
              {dirtyCount} thay đổi chưa lưu
            </span>
          </>
        ) : (
          <span className="text-on-tint-ok">
            ✓ đã lưu{savedAt ? ` ${savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        )}
      </p>

      <div className="ml-2 flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={!canUndo} aria-label="Hoàn tác" onClick={onUndo}>
              <Undo2 aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {canUndo ? (undoLabel ?? "Hoàn tác") : "Chưa có gì để hoàn tác"} · <KeyboardHint keys={["mod", "Z"]} />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={!canRedo} aria-label="Làm lại" onClick={onRedo}>
              <Redo2 aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {canRedo ? (redoLabel ?? "Làm lại") : "Chưa có gì để làm lại"} · <KeyboardHint keys={["mod", "shift", "Z"]} />
          </TooltipContent>
        </Tooltip>
      </div>

      {extra}

      <Tooltip>
        <TooltipTrigger asChild>
          {/* span bọc: nút disabled không phát sự kiện chuột nên tooltip sẽ không bao giờ
              hiện — mà lý do bị khoá LẠI LÀ thứ user cần đọc nhất (§5.4). */}
          <span className={cn(blockedReason || !dirty ? "cursor-not-allowed" : undefined)}>
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              loading={saving}
              disabled={saving || !dirty || blockedReason !== null}
              aria-disabled={saving || !dirty || blockedReason !== null}
              onClick={onSave}
            >
              <Save className="size-3.5" aria-hidden />
              {dirty ? `Lưu (${dirtyCount})` : "Lưu"}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {blockedReason ?? (dirty ? "Lưu bản thiết kế" : "Không có thay đổi nào để lưu")} ·{" "}
          <KeyboardHint keys={["mod", "S"]} />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
