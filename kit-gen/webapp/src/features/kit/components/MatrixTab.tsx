import * as React from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import { devDetails, presentError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { KitImage } from "./KitImage";
import type { Backdrop } from "../lib/backdrop";
import { buildMatrix, filterMatrix, type VariantOption } from "../lib/kit-model";
import { useAllKits } from "../lib/useKitData";

/**
 * TAB "MA TRẬN SO SÁNH" (§3-S5) — thay `preview.html`, đóng issue J1.
 *
 * VIẾT BỞI INTEGRATION LEAD: team S5 đã nộp `buildMatrix`/`filterMatrix`/`useAllKits`
 * (tầng logic đầy đủ, có test) nhưng KHÔNG nộp component tab ⇒ logic không có mặt tiền.
 * Ở đây chỉ dựng bảng, KHÔNG có luật nghiệp vụ mới.
 *
 * LUẬT QUAN TRỌNG NHẤT (J1 — "không bao giờ 404 câm"): ô THIẾU ảnh phải nói thẳng
 * "chưa có" kèm nút [Sinh], chứ không để một khung ảnh vỡ im lặng. Bản v1 có 18/78
 * ảnh 404 mà không ai biết — đó là lý do màn này tồn tại.
 *
 * Một phong cách chưa cắt (404 KIT_NOT_CUT) KHÔNG phải lỗi và KHÔNG được làm chết cả
 * bảng — `useAllKits` đã tách sẵn ca đó thành `kits.get(id) === null`.
 */
export interface MatrixTabProps {
  projectId: string;
  variants: readonly VariantOption[];
  backdrop: Backdrop;
  offline: boolean;
  writeDisabledReason: string | null;
  onGen: (sheets: string[]) => void;
  onOpenDesign: (sheetId: string | null) => void;
}

export function MatrixTab(p: MatrixTabProps) {
  const [query, setQuery] = React.useState("");
  const [diffOnly, setDiffOnly] = React.useState(false);

  const all = useAllKits(p.projectId, p.variants, true);
  const rows = React.useMemo(() => buildMatrix(p.variants, all.kits), [p.variants, all.kits]);
  const visible = React.useMemo(() => filterMatrix(rows, { diffOnly, query }), [rows, diffOnly, query]);

  if (all.loading && rows.length === 0) {
    return <LoadingState count={4} label="Đang đọc kit của mọi phong cách…" />;
  }

  if (all.error && rows.length === 0) {
    const v = presentError(all.error);
    return (
      <ErrorState
        title="Không đọc được kit để so sánh"
        description={v.explain}
        detail={devDetails(all.error)}
        actions={
          <Button variant="primary" size="sm" onClick={all.refetch}>
            Thử lại
          </Button>
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Chưa có ảnh nào để so sánh"
        description="Ma trận so sánh cần ít nhất một phong cách đã sinh ảnh và đã cắt."
        action={
          <Button
            variant="primary"
            disabled={p.writeDisabledReason !== null}
            aria-disabled={p.writeDisabledReason !== null || undefined}
            title={p.writeDisabledReason ?? undefined}
            onClick={() => p.onGen([])}
          >
            <Sparkles aria-hidden />
            Sinh ảnh…
          </Button>
        }
      />
    );
  }

  const missing = rows.filter((r) => r.differs).length;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Thanh công cụ ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm element theo tên…"
            aria-label="Tìm element trong ma trận"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-body text-fg">
          <Switch checked={diffOnly} onCheckedChange={setDiffOnly} aria-label="Chỉ hiện chỗ khác nhau" />
          Chỉ hiện chỗ khác nhau
        </label>
        <span className="text-caption text-fg-muted">
          {visible.length}/{rows.length} element · {missing} element chưa đủ ảnh ở mọi phong cách
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có element nào khớp"
          description="Thử bỏ bớt từ khoá, hoặc tắt “Chỉ hiện chỗ khác nhau”."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body">
            <caption className="sr-only">
              Ma trận so sánh element theo phong cách. Hàng là element, cột là phong cách.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-canvas p-3 text-left text-label uppercase tracking-label text-fg-muted">
                  Element
                </th>
                {p.variants.map((v) => (
                  <th key={v.id} scope="col" className="p-3 text-left text-label uppercase tracking-label text-fg-muted">
                    {v.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.name} className="border-t border-line-subtle align-top">
                  <th scope="row" className="sticky left-0 z-10 max-w-64 bg-canvas p-3 text-left font-normal">
                    <span className="block truncate font-mono text-caption text-fg-strong" title={row.name}>
                      {row.name}
                    </span>
                    {row.sheet && <span className="block text-caption text-fg-muted">{row.sheet}</span>}
                  </th>
                  {p.variants.map((v) => {
                    const f = row.byVariant.get(v.id);
                    /* J1: THIẾU thì NÓI, không để khung vỡ im lặng. */
                    if (!f || f.empty) {
                      return (
                        <td key={v.id} className="p-3">
                          <div
                            className={cn(
                              "flex aspect-square w-28 flex-col items-center justify-center gap-2",
                              "rounded-3 border border-dashed border-line text-center",
                            )}
                          >
                            <span className="text-caption text-fg-muted">
                              {f?.empty ? "file rỗng" : "chưa có"}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={p.writeDisabledReason !== null}
                              aria-disabled={p.writeDisabledReason !== null || undefined}
                              title={p.writeDisabledReason ?? undefined}
                              aria-label={`Sinh ảnh cho ${row.name} ở phong cách ${v.label}`}
                              onClick={() => p.onGen(row.sheet ? [row.sheet] : [])}
                            >
                              <Sparkles aria-hidden />
                              Sinh
                            </Button>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={v.id} className="p-3">
                        <KitImage
                          projectId={p.projectId}
                          path={f.path}
                          alt={`${row.name} — phong cách ${v.label}`}
                          backdrop={p.backdrop}
                          blend={f.blend}
                          offline={p.offline}
                          className="aspect-square w-28"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
