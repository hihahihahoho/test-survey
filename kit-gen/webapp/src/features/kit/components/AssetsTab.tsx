import * as React from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, RefreshCw, Scissors, Search, Sparkles, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, InlineBanner, LoadingState } from "@/components/common";
import type { KitFile, Kit } from "@/lib/types";
import { bytes as fmtBytes, relTime } from "@/features/projects/lib/format";
import { AssetsToolbar } from "./AssetsToolbar";
import { AssetCell } from "./AssetCell";
import type { Backdrop } from "../lib/backdrop";
import {
  EMPTY_FILTER, filterFiles, groupBySheet, kitTotals, type AssetFilter, type StaleReason, type StaleSummary,
} from "../lib/kit-model";
import { useCellKeys } from "../lib/useCellKeys";

/**
 * TAB ASSETS (§3-S5 wireframe): lưới thumbnail nền checkerboard, gom theo sheet
 * (gập được), zoom, tìm/lọc, dải cảnh báo, lightbox.
 *
 * ĐỦ 4 TRẠNG THÁI + CA AGENT CHƯA CHẠY (màn cha lo phần chung, tab lo phần của nó):
 *   loading → lưới skeleton ĐÚNG số ô dự kiến (`stats.kitsCut` — biết trước thì đừng đoán)
 *   empty   → 2 nhánh copy khác nhau: đã có ảnh AI (mời Cắt) vs chưa có (mời Sinh ảnh)
 *   error   → do màn cha hiện (banner manifest hỏng); ô lẻ thiếu file thì tự nói tại ô
 *   success → lưới + dải cảnh báo
 *   offline → mọi ô thành "Ảnh nằm trên máy bạn", nút ghi xám kèm lý do
 *
 * HIỆU NĂNG (>500 ảnh): mỗi ô lazy-load bằng IntersectionObserver + hàng đợi 6
 * request (xem `KitImage` và `lib/image-source.ts`). DOM vẫn dựng đủ ô để lưới có
 * chiều cao đúng và `←→↑↓` đi được khắp lưới; chỉ ẢNH là tải theo tầm nhìn.
 * TODO(NEEDS-s5-kit N3): nếu đo thật thấy >2000 ô bị chậm thì thay bằng ảo hoá
 * (`@tanstack/react-virtual` chưa có trong package.json — không tự thêm dependency).
 */
const ZOOM_PX = [80, 104, 136, 176, 224] as const;
const DEFAULT_ZOOM = 2;

export interface AssetsTabProps {
  projectId: string;
  kit: Kit | null;
  loading: boolean;
  /** số ô dự kiến, lấy từ `project.stats.kitsCut` */
  expected: number;
  /** đã có ảnh AI chưa — quyết định copy của empty state */
  hasRaw: boolean;
  offline: boolean;
  backdrop: Backdrop;
  onBackdropChange: (b: Backdrop) => void;
  staleMap: Map<string, StaleReason>;
  stale: StaleSummary;
  poseFiles: ReadonlySet<string>;
  writeDisabledReason: string | null;
  onOpenFile: (files: readonly KitFile[], index: number) => void;
  onSlice: (sheets: string[]) => void;
  onGen: (sheets: string[]) => void;
  onOpenDesign: (sheetId: string | null) => void;
  /** phím 1/2/3 và +/- được màn cha gắn; tab nhận zoom qua props để nhớ giữa các tab */
  zoom: number;
  onZoomChange: (z: number) => void;
}

export function AssetsTab(p: AssetsTabProps) {
  const [filter, setFilter] = React.useState<AssetFilter>(EMPTY_FILTER);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());

  const files = p.kit?.files ?? [];
  const totals = React.useMemo(() => kitTotals(p.kit), [p.kit]);
  const visible = React.useMemo(() => filterFiles(files, filter, p.staleMap), [files, filter, p.staleMap]);
  const groups = React.useMemo(() => groupBySheet(visible, p.staleMap), [visible, p.staleMap]);
  const sheetIds = React.useMemo(
    () => [...new Set(files.map((f) => f.sheet).filter((s): s is string => typeof s === "string" && s !== ""))].sort(),
    [files],
  );

  /** Thứ tự phẳng của ô đang hiện — lightbox `←→` phải đi đúng thứ tự user thấy. */
  const flat = React.useMemo(() => groups.flatMap((g) => (collapsed.has(g.sheetId) ? [] : g.files)), [groups, collapsed]);
  const keys = useCellKeys(flat.length, (i) => p.onOpenFile(flat, i));

  const zoomPx = ZOOM_PX[Math.min(Math.max(p.zoom, 0), ZOOM_PX.length - 1)] ?? ZOOM_PX[DEFAULT_ZOOM];
  const problemCount = totals.emptyFiles + p.stale.staleFiles;

  /* ── loading: skeleton ĐÚNG số ô dự kiến ─────────────────────────────── */
  if (p.loading) {
    const n = Math.min(Math.max(p.expected, 4), 24);
    return (
      <div className="flex flex-col gap-4">
        <LoadingState count={2} label="Đang đọc danh mục kit…" />
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoomPx}px, 1fr))` }}
          aria-hidden
        >
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2 bg-raised" />
          ))}
        </div>
      </div>
    );
  }

  /* ── empty: 2 nhánh copy, mỗi nhánh nói ĐÚNG việc tiếp theo ──────────── */
  if (files.length === 0) {
    return p.hasRaw ? (
      <EmptyState
        icon={Scissors}
        title="Chưa có file nào được cắt"
        description="Đã có ảnh AI trên máy. Bước cắt tách mỗi sheet thành từng file PNG trong suốt — không tốn quota, chạy lại được bất cứ lúc nào."
        action={
          <Button
            variant="primary"
            size="lg"
            disabled={p.writeDisabledReason !== null}
            aria-disabled={p.writeDisabledReason !== null || undefined}
            title={p.writeDisabledReason ?? undefined}
            onClick={() => p.onSlice([])}
          >
            <Scissors aria-hidden />
            Cắt ngay
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={ImageIcon}
        title="Chưa có file nào được cắt"
        description="Cần ảnh đã sinh mới cắt được."
        steps={[
          "Kiểm bản thiết kế: đủ sheet và element chưa.",
          "Sinh ảnh — mỗi sheet của mỗi phong cách là một lượt gọi AI.",
          "Cắt: tách sheet thành từng PNG trong suốt, rồi quay lại đây.",
        ]}
        action={
          <Button
            variant="primary"
            size="lg"
            disabled={p.writeDisabledReason !== null}
            aria-disabled={p.writeDisabledReason !== null || undefined}
            title={p.writeDisabledReason ?? undefined}
            onClick={() => p.onGen([])}
          >
            <Sparkles aria-hidden />
            Sinh ảnh trước…
          </Button>
        }
      />
    );
  }

  const totalLabel = [
    `${totals.files} file`,
    fmtBytes(totals.bytes),
    totals.cutAt !== null ? `cắt ${relTime(totals.cutAt)}` : null,
    visible.length !== totals.files ? `đang hiện ${visible.length}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <AssetsToolbar
        totalLabel={totalLabel}
        backdrop={p.backdrop}
        onBackdropChange={p.onBackdropChange}
        zoom={p.zoom}
        onZoomChange={p.onZoomChange}
        zoomMin={0}
        zoomMax={ZOOM_PX.length - 1}
        filter={filter}
        onFilterChange={setFilter}
        sheetIds={sheetIds}
        problemCount={problemCount}
      />

      {/* ── Dải cảnh báo: mỗi lý do một nút khác nhau ────────────────────── */}
      {p.stale.needGen.length > 0 && (
        <InlineBanner
          tone="warn"
          icon={RefreshCw}
          title={`${p.stale.needGen.length} sheet đã đổi thiết kế sau lần sinh ảnh cuối`}
          description="Cắt lại KHÔNG sửa được việc này — ảnh AI vẫn là bản cũ. Phải sinh ảnh lại cho các sheet đó."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={p.writeDisabledReason !== null}
              aria-disabled={p.writeDisabledReason !== null || undefined}
              title={p.writeDisabledReason ?? undefined}
              onClick={() => p.onGen(p.stale.needGen)}
            >
              <Sparkles aria-hidden />
              Sinh lại {p.stale.needGen.length} sheet…
            </Button>
          }
        />
      )}

      {p.stale.needSlice.length > 0 && (
        <InlineBanner
          tone="warn"
          icon={Scissors}
          title={`${p.stale.needSlice.length} sheet có ảnh mới nhưng chưa cắt`}
          description="File PNG bạn đang xem cũ hơn ảnh AI trên máy. Cắt lại là khớp — không tốn quota."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={p.writeDisabledReason !== null}
              aria-disabled={p.writeDisabledReason !== null || undefined}
              title={p.writeDisabledReason ?? undefined}
              onClick={() => p.onSlice(p.stale.needSlice)}
            >
              <Scissors aria-hidden />
              Cắt lại {p.stale.needSlice.length} sheet
            </Button>
          }
        />
      )}

      {totals.emptyFiles > 0 && (
        <InlineBanner
          tone="warn"
          icon={Ban}
          title={`${totals.emptyFiles} file cắt ra rỗng`}
          description="Thường là ô trên sheet bị trống, hoặc element bị vẽ trong suốt nên khâu cắt không thấy gì. Mở bản thiết kế để xem ô đó có nội dung chưa."
          actions={
            <Button variant="secondary" size="sm" onClick={() => p.onOpenDesign(null)}>
              Mở bản thiết kế
            </Button>
          }
        />
      )}

      {/* ── Lưới, gom theo sheet ─────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có file nào khớp bộ lọc"
          description="Thử bỏ bớt điều kiện tìm."
          action={
            <Button variant="secondary" onClick={() => setFilter(EMPTY_FILTER)}>
              Xoá bộ lọc
            </Button>
          }
        />
      ) : (
        <div ref={keys.containerRef} className="flex flex-col gap-5">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.sheetId);
            const startIndex = flat.indexOf(g.files[0]!);
            return (
              <section key={g.sheetId || "__unknown__"} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.sheetId)) next.delete(g.sheetId);
                        else next.add(g.sheetId);
                        return next;
                      })
                    }
                  >
                    {isCollapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
                    <span className="font-mono">{g.label}</span>
                    <span className="text-fg-muted-raised">({g.files.length})</span>
                  </Button>
                  {g.reason === "design-changed" && (
                    <Badge tone="stale">
                      <RefreshCw aria-hidden />
                      Cần sinh lại
                    </Badge>
                  )}
                  {g.reason === "uncut" && (
                    <Badge tone="stale">
                      <Scissors aria-hidden />
                      Cần cắt
                    </Badge>
                  )}
                </div>

                {!isCollapsed && (
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoomPx}px, 1fr))` }}
                  >
                    {g.files.map((f, i) => (
                      <AssetCell
                        key={f.path}
                        projectId={p.projectId}
                        file={f}
                        backdrop={p.backdrop}
                        offline={p.offline}
                        staleReason={g.reason}
                        poseFiles={p.poseFiles}
                        tabIndex={keys.tabIndexFor(startIndex + i)}
                        onOpen={() => p.onOpenFile(flat, startIndex + i)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
