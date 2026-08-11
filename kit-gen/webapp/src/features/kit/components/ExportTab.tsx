import * as React from "react";
import { ClipboardCopy, Download, FileJson, Grid2x2, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { EmptyState, InlineBanner } from "@/components/common";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { bytes as fmtBytes } from "@/lib/format";
import type { Kit, Project } from "@/lib/types";
import { BoardCancelled, buildFigmaBoard, type BoardProgress } from "../lib/figma-board";
import { breakdown } from "../lib/export-scale";
import { exportZipPath, saveProjectFile, savePath, zipFallbackName } from "../lib/download";
import { kitTotals, type VariantOption } from "../lib/kit-model";

/**
 * TAB "XUẤT" (§3-S5) — 4 khối, mỗi khối MỘT dòng nói rõ AI DÙNG NÓ.
 *
 * VIẾT BỞI INTEGRATION LEAD: team S5 đã nộp đủ tầng dưới (`download.ts`,
 * `figma-board.ts` với 4 pha huỷ được, `export-scale.ts`) nhưng không nộp component
 * tab ⇒ toàn bộ phần đó không có đường nào tới. Ở đây chỉ nối dây.
 *
 * ① Tải .zip kit   — chọn phong cách + có/không atlas · dev tích hợp dùng
 * ② Copy cho Figma — 4 pha CÓ TIẾN TRÌNH, HUỶ ĐƯỢC (đóng H5) · designer dùng
 * ③ atlas.png + atlas.json — engine game (Phaser/Cocos) dùng
 * ④ manifest.json — kiểm kê/ script tự động dùng
 *
 * TRUNG THỰC VỀ FIGMA (chép từ doc-comment của `figma-board.ts`, không giấu):
 * dán ra MỘT ẢNH BITMAP của cả bảng, không phải từng layer rời. Clipboard hỏng ⇒
 * đường lùi tải .png và NÓI THẬT, không báo "đã copy" khi chưa copy được.
 */
export interface ExportTabProps {
  projectId: string;
  project: Project | null;
  kit: Kit | null;
  variantId: string | null;
  variants: readonly VariantOption[];
  poseFiles: ReadonlySet<string>;
  offline: boolean;
  writeDisabledReason: string | null;
}

export function ExportTab(p: ExportTabProps) {
  const [withAtlas, setWithAtlas] = React.useState(false);
  const [allVariants, setAllVariants] = React.useState(false);
  const [zipBusy, setZipBusy] = React.useState(false);
  const [board, setBoard] = React.useState<BoardProgress | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const files = p.kit?.files ?? [];
  const totals = React.useMemo(() => kitTotals(p.kit), [p.kit]);
  const scales = React.useMemo(() => breakdown(files, p.poseFiles), [files, p.poseFiles]);
  const variantLabel = p.variants.find((v) => v.id === p.variantId)?.label ?? p.variantId ?? "kit";

  if (files.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Chưa có gì để xuất"
        description="Cần cắt kit xong mới xuất được. Quay lại tab Assets để bắt đầu."
      />
    );
  }

  /* ── ① .zip ─────────────────────────────────────────────────────────── */
  const downloadZip = () => {
    setZipBusy(true);
    const include = ["kit", ...(withAtlas ? ["atlas"] : [])];
    const path = exportZipPath(p.projectId, include, allVariants ? null : p.variantId);
    savePath(path, zipFallbackName(p.project?.slug ?? "project"))
      .then((r) => toastSuccess("Đã tải xong", `${r.fileName} · ${fmtBytes(r.bytes)}`))
      .catch((e: unknown) => toastError(e))
      .finally(() => setZipBusy(false));
  };

  /* ── ② Figma ────────────────────────────────────────────────────────── */
  const copyFigma = () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setBoard({ phase: 1, label: "Chuẩn bị danh sách", done: 0, total: files.length });
    buildFigmaBoard({
      projectId: p.projectId,
      files,
      poseFiles: p.poseFiles,
      variantLabel,
      onProgress: setBoard,
      signal: ac.signal,
    })
      .then((r) => {
        if (r.outcome === "clipboard") {
          toastSuccess("Đã đưa bảng vào bộ nhớ tạm", `${r.files} element · dán vào Figma bằng ⌘V.`);
        } else {
          // KHÔNG báo "đã copy" khi chưa copy được (§1.1 không nói dối trạng thái).
          toastSuccess("Đã tải bảng thành file .png", "Trình duyệt không cho ghi vào bộ nhớ tạm, nên bảng được lưu thành file để bạn tự kéo vào Figma.");
        }
      })
      .catch((e: unknown) => {
        if (e instanceof BoardCancelled) return;
        toastError(e);
      })
      .finally(() => {
        setBoard(null);
        abortRef.current = null;
      });
  };

  /* ── ③④ file lẻ ─────────────────────────────────────────────────────── */
  const saveOne = (rel: string, what: string) => {
    saveProjectFile(p.projectId, rel)
      .then((r) => toastSuccess(`Đã tải ${what}`, `${r.fileName} · ${fmtBytes(r.bytes)}`))
      .catch((e: unknown) => toastError(e));
  };

  const disabled = p.offline;
  const dis = {
    disabled,
    "aria-disabled": disabled || undefined,
    title: p.writeDisabledReason ?? undefined,
  };

  return (
    <div className="flex flex-col gap-5">
      {p.offline && (
        <InlineBanner
          tone="warning"
          title="Chưa thấy công cụ local"
          description="File kit nằm trên máy bạn, nên phải có công cụ local đang chạy mới tải xuống được."
        />
      )}

      <p className="text-body text-fg-muted">
        {totals.files} file · {fmtBytes(totals.bytes)} · {scales.mascot} ảnh nhân vật giữ 1:1 ·{" "}
        {scales.ui} ảnh giao diện thu 50%
      </p>

      {/* ① */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4 text-fg-muted" aria-hidden />
            Tải .zip kit
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-body text-fg-muted">
            Cho lập trình viên tích hợp: tất cả PNG trong suốt, giữ nguyên cấu trúc thư mục theo sheet.
          </p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-body text-fg">
              <Checkbox checked={withAtlas} onCheckedChange={(v) => setWithAtlas(v === true)} />
              Kèm cả atlas (atlas.png + atlas.json)
            </label>
            <label className="flex items-center gap-2 text-body text-fg">
              <Checkbox checked={allVariants} onCheckedChange={(v) => setAllVariants(v === true)} />
              Xuất mọi phong cách (mặc định chỉ «{variantLabel}»)
            </label>
          </div>
          <div>
            <Button variant="primary" loading={zipBusy} onClick={downloadZip} {...dis}>
              <Download aria-hidden />
              Tải .zip
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ② */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCopy className="size-4 text-fg-muted" aria-hidden />
            Copy cho Figma
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-body text-fg-muted">
            Cho designer: ghép mọi element thành một bảng có nhãn tên, rồi đưa vào bộ nhớ tạm để dán
            thẳng vào Figma. Dán ra <strong className="text-fg-strong">một ảnh bitmap</strong> của cả
            bảng — không phải từng layer rời.
          </p>
          {board ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-caption text-fg-muted">
                <span aria-live="polite">
                  {board.phase}/4 · {board.label} ({board.done}/{board.total})
                </span>
                <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                  <X aria-hidden />
                  Huỷ
                </Button>
              </div>
              <Progress value={board.total > 0 ? Math.round((board.done / board.total) * 100) : 0} />
            </div>
          ) : (
            <div>
              <Button variant="secondary" onClick={copyFigma} {...dis}>
                <ClipboardCopy aria-hidden />
                Copy bảng element
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ③ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid2x2 className="size-4 text-fg-muted" aria-hidden />
            atlas.png + atlas.json
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-body text-fg-muted">
            Cho engine game (Phaser, Cocos, Unity): một ảnh gộp kèm toạ độ từng element.
            Chỉ có khi lượt cắt được bật tuỳ chọn tạo atlas.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => saveOne(`kits/${p.variantId}/atlas.png`, "atlas.png")} {...dis}>
              <Download aria-hidden />
              atlas.png
            </Button>
            <Button variant="secondary" onClick={() => saveOne(`kits/${p.variantId}/atlas.json`, "atlas.json")} {...dis}>
              <Download aria-hidden />
              atlas.json
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ④ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="size-4 text-fg-muted" aria-hidden />
            manifest.json
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-body text-fg-muted">
            Cho script tự động và việc kiểm kê: danh sách mọi file đã cắt kèm kích thước, sheet nguồn
            và vị trí ô.
          </p>
          <div>
            <Button variant="secondary" onClick={() => saveOne("kits/manifest.json", "manifest.json")} {...dis}>
              <Download aria-hidden />
              manifest.json
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
