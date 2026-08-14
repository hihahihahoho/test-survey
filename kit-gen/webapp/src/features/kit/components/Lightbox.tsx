import * as React from "react";
import {
  ArrowLeft, ArrowRight, Copy, Download, Grid2x2, LayoutGrid, Ruler, Sparkles, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { KeyboardHint } from "@/components/common";
import type { KitFile } from "@/lib/types";
import { bytes as fmtBytes } from "@/features/projects/lib/format";
import { BackdropPicker } from "./BackdropPicker";
import { KitImage } from "./KitImage";
import type { Backdrop } from "../lib/backdrop";
import { saveProjectFile } from "../lib/download";
import { exportSize } from "../lib/export-scale";

/**
 * LIGHTBOX (§3-S5): "ảnh 1:1, tên, kích thước, dung lượng, sheet nguồn, ô số mấy,
 * [⬇ Tải] [Copy tên] [Xem trong sheet gốc] [Sinh lại sheet này]. ←→ chuyển file."
 *
 * BA THỨ BRIEF ĐÒI THÊM SO VỚI BẢN VANILLA:
 *  · ZOOM 25→800% — nút, phím `+`/`-`, và `0` về 100%.
 *  · XEM PIXEL — ở zoom ≥200% bật `image-rendering: pixelated` để thấy từng pixel biên
 *    (đúng việc cần làm khi soi chất lượng tách alpha; nội suy mượt sẽ che mất răng cưa).
 *  · KÍCH THƯỚC THẬT — nói rõ cả cỡ pixel gốc VÀ cỡ khi xuất (mascot 1:1 / UI 50%).
 *
 * Ảnh ở đây là bản GỐC (`full`), đúng §6.5-5: lưới dùng `?w=256`, lightbox dùng full.
 * A11y: Radix Dialog lo focus trap + Esc + trả focus (§5.8-A7).
 */
const ZOOMS = [25, 50, 100, 200, 400, 800] as const;

export interface LightboxProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  files: readonly KitFile[];
  index: number;
  onIndexChange: (i: number) => void;
  backdrop: Backdrop;
  onBackdropChange: (b: Backdrop) => void;
  poseFiles: ReadonlySet<string>;
  offline: boolean;
  isStale: (f: KitFile) => boolean;
  onOpenSheet: (f: KitFile) => void;
  onRegenSheet: (f: KitFile) => void;
  regenDisabledReason: string | null;
}

export function Lightbox(props: LightboxProps) {
  const { files, index, onIndexChange } = props;
  const [zoom, setZoom] = React.useState(100);
  const file = files[index] ?? null;

  // Mỗi lần đổi file: về 100% để không "thừa hưởng" zoom 800% của ảnh trước.
  React.useEffect(() => setZoom(100), [file?.path]);

  const move = React.useCallback(
    (d: number) => {
      if (files.length === 0) return;
      onIndexChange((index + d + files.length) % files.length);
    },
    [files.length, index, onIndexChange],
  );

  const stepZoom = React.useCallback((dir: 1 | -1) => {
    setZoom((z) => {
      const i = ZOOMS.findIndex((v) => v >= z);
      const cur = i === -1 ? ZOOMS.length - 1 : i;
      return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, cur + dir))]!;
    });
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      move(1);
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      stepZoom(1);
    } else if (e.key === "-") {
      e.preventDefault();
      stepZoom(-1);
    } else if (e.key === "0") {
      e.preventDefault();
      setZoom(100);
    }
  };

  if (file === null) return null;

  const size = exportSize(file, props.poseFiles);
  const stale = props.isStale(file);
  const pixelated = zoom >= 200;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh]" onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-subtitle">{file.file}</span>
            {stale && (
              <Badge tone="stale">
                <Sparkles aria-hidden />
                Cũ hơn thiết kế
              </Badge>
            )}
            {file.empty && (
              <Badge tone="danger">
                <Ruler aria-hidden />
                File rỗng
              </Badge>
            )}
            <span className="ml-auto text-caption font-normal text-fg-muted-raised">
              {index + 1}/{files.length}
            </span>
          </DialogTitle>
          <DialogDescription>
            {size.srcW !== null && size.srcH !== null
              ? `Ảnh thật ${size.srcW}×${size.srcH} pixel · ${fmtBytes(file.bytes)}`
              : `Dung lượng ${fmtBytes(file.bytes)}`}
            {file.sheet ? ` · sheet ${file.sheet}` : ""}
            {typeof file.cellIndex === "number" ? ` · ô số ${file.cellIndex}` : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {/* Vùng xem: cuộn cả 2 chiều khi zoom lớn — ca "thật sự phải giới hạn", vì
              cuộn ở đây là ĐỂ NGẮM ảnh phóng to, không phải để đọc danh sách.
              `overscroll-contain` để lăn tới mép ảnh thì dừng, không hất cho thân
              dialog trôi mất khung xem đang zoom. */}
          <div className="flex min-h-[280px] items-center justify-center overflow-auto overscroll-contain rounded-2 border border-line-subtle bg-surface p-3">
            <div style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "100%" : "none" }}>
              <KitImage
                projectId={props.projectId}
                path={file.path}
                alt={`${file.file} — xem lớn`}
                backdrop={props.backdrop}
                blend={file.blend}
                full
                eager
                empty={file.empty}
                offline={props.offline}
                className="w-full"
                imgClassName={pixelated ? "[image-rendering:pixelated]" : undefined}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => move(-1)} disabled={files.length < 2}>
              <ArrowLeft aria-hidden />
              Trước
            </Button>
            <Button variant="ghost" size="sm" onClick={() => move(1)} disabled={files.length < 2}>
              Sau
              <ArrowRight aria-hidden />
            </Button>
            <KeyboardHint keys={["←", "→"]} />

            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(-1)} aria-label="Thu nhỏ">
                    <ZoomOut aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Thu nhỏ (phím -)</TooltipContent>
              </Tooltip>
              <button
                type="button"
                onClick={() => setZoom(100)}
                className="min-w-[52px] rounded-1 px-1 text-caption tabular-nums text-fg hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                aria-label={`Phóng ${zoom}%, bấm để về 100%`}
              >
                {zoom}%
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(1)} aria-label="Phóng to">
                    <ZoomIn aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Phóng to (phím +)</TooltipContent>
              </Tooltip>
              {pixelated && (
                <Badge tone="accent" title="Từ 200% trở lên: hiện từng pixel để soi biên alpha">
                  <Grid2x2 aria-hidden />
                  Xem pixel
                </Badge>
              )}
            </div>

            <BackdropPicker value={props.backdrop} onChange={props.onBackdropChange} />
          </div>

          {/* Cỡ khi xuất — quy ước cũ của dự án, nói rõ để designer không đoán. */}
          <p className="flex items-center gap-2 rounded-2 border border-line-subtle bg-surface px-3 py-2 text-caption text-fg">
            <LayoutGrid className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
            <span>
              Khi xuất sang Figma: <strong className="text-fg-strong">{size.label}</strong>
              {size.kind === "mascot"
                ? " — nhân vật giữ nguyên tỉ lệ."
                : " — ảnh AI vẽ ở @2x nên element giao diện thu về 50%."}
            </span>
          </p>
        </DialogBody>

        <DialogFooter className="sm:justify-start">
          <Button
            variant="primary"
            size="sm"
            disabled={props.offline || file.empty}
            title={props.offline ? "Cần công cụ local đang chạy" : undefined}
            onClick={() => {
              void saveProjectFile(props.projectId, file.path).then(
                (r) => toast.success(`Đã tải ${r.fileName}`, { description: fmtBytes(r.bytes) }),
                () => toast.error("Không tải được file này", { description: "Thử lại sau khi kiểm tra công cụ local." }),
              );
            }}
          >
            <Download aria-hidden />
            Tải file
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(file.file).then(
                () => toast.success("Đã copy tên file"),
                () => toast.warning("Không copy được", { description: file.file }),
              );
            }}
          >
            <Copy aria-hidden />
            Copy tên
          </Button>
          {file.sheet && (
            <Button variant="ghost" size="sm" onClick={() => props.onOpenSheet(file)}>
              Xem trong sheet gốc
            </Button>
          )}
          {file.sheet && (
            <Button
              variant="ghost"
              size="sm"
              disabled={props.regenDisabledReason !== null}
              aria-disabled={props.regenDisabledReason !== null || undefined}
              title={props.regenDisabledReason ?? undefined}
              onClick={() => props.onRegenSheet(file)}
            >
              <Sparkles aria-hidden />
              Sinh lại sheet này…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
