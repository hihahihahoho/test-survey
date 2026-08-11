import * as React from "react";
import { Link } from "@tanstack/react-router";
import { History, Images, Pencil, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunStatusBadge } from "@/components/common";
import { bytes, count, relTime, absTime } from "@/features/projects/lib/format";
import { progressOf, runStatusOf, runSummary, kindLabel } from "@/features/runs/lib/format";
import type { Gate } from "@/features/projects/lib/gate";
import type { Kit, Project, Run } from "@/lib/types";
import type { ProgressMatrix } from "../lib/matrix";
import { KitStrip } from "./KitStrip";

/**
 * BỐN THẺ PHỤ của S2 (§3-S2 mục 4): Bản thiết kế · Lượt chạy gần đây · Kit đã cắt ·
 * Thống kê nhanh. Tách khỏi màn để `ProjectScreen.tsx` chỉ còn lo bố cục và luồng.
 *
 * Mọi số liệu ưu tiên `contract` (sự thật mới nhất user vừa lưu) rồi mới tới
 * `stats` của agent — hai nguồn này lệch nhau đúng một nhịp sau khi lưu, và hiện
 * số cũ ngay sau khi user vừa sửa là cách nhanh nhất làm họ mất tin.
 */

/** Một dòng "nhãn — giá trị" dùng chung trong các thẻ. */
function StatRow({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-1.5 last:border-0">
      <span className="text-caption text-fg-muted-raised">{label}</span>
      <span className="truncate text-label text-fg-strong" {...(title ? { title } : {})}>
        {value}
      </span>
    </div>
  );
}

export function DesignCard({
  projectId,
  matrix,
  contractVersion,
  updatedAt,
  gate,
  onOpenHistory,
}: {
  projectId: string;
  matrix: ProgressMatrix;
  contractVersion: number | null;
  updatedAt: string | null | undefined;
  gate: Gate;
  onOpenHistory: () => void;
}) {
  const components = matrix.sheets.reduce((n, s) => n + s.components, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Bản thiết kế</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <StatRow label="Trang" value={count(matrix.sheets.length, "trang")} />
          <StatRow label="Thành phần" value={count(components, "thành phần")} />
          <StatRow label="Phong cách" value={count(matrix.variants.length, "phong cách")} />
          <StatRow
            label="Phiên bản"
            value={contractVersion === null ? "chưa lưu lần nào" : `v${contractVersion}`}
            {...(updatedAt ? { title: absTime(updatedAt) } : {})}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/p/$projectId/design" params={{ projectId }} search={{ tab: "sheets" }}>
              <Pencil aria-hidden />
              Mở trình soạn
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : "Lịch sử 50 bản lưu gần nhất"}
            onClick={onOpenHistory}
          >
            <History aria-hidden />
            Lịch sử bản lưu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * "Lượt chạy gần đây" — 3 dòng + [Xem tất cả].
 * ĐÓNG E1 NGAY Ở ĐÂY: `RunStatusBadge` + `runSummary` ⇒ run có lượt lỗi hiện
 * "Xong · có lỗi · 5/8 xong · 3 lỗi", KHÔNG BAO GIỜ dấu ✓ trơn.
 */
export function RunsCard({
  projectId,
  runs,
  unavailable,
  onOpenRun,
}: {
  projectId: string;
  runs: readonly Run[];
  /** true ⇒ chưa đọc được (agent tắt) — nói thật, không hiện "chưa có lượt nào". */
  unavailable: boolean;
  onOpenRun: (runId: string) => void;
}) {
  const shown = runs.slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
        <CardTitle>Lượt chạy gần đây</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/p/$projectId/runs" params={{ projectId }} search={{}}>
            Xem tất cả
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {unavailable ? (
          <p className="text-caption text-fg-muted-raised">
            Chưa đọc được danh sách lượt chạy — nhật ký nằm trên máy bạn.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-caption text-fg-muted-raised">
            Chưa có lượt chạy nào. Mỗi lần bấm Sinh ảnh hoặc Cắt sẽ tạo một lượt có nhật ký riêng.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((r) => {
              const p = progressOf(r);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRun(r.id)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors duration-fast hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    aria-label={`Lượt ${r.id}, ${kindLabel(r.kind)}, ${runSummary(r)}`}
                  >
                    <RunStatusBadge status={runStatusOf(r.status)} progress={`${p.done}/${p.total}`} />
                    <span className="min-w-0 flex-1 truncate text-label text-fg-strong">
                      {kindLabel(r.kind)}
                    </span>
                    <span
                      className="shrink-0 text-caption text-fg-muted-raised"
                      title={absTime(r.finishedAt ?? r.startedAt)}
                    >
                      {relTime(r.finishedAt ?? r.startedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** "Kit đã cắt" — 8 thumbnail + `+N` + [Mở]. Ảnh LUÔN qua `?w=256` (§6.5-5, đóng H4). */
export function KitCard({
  projectId,
  kit,
  offline,
  variantId,
}: {
  projectId: string;
  kit: Kit | null;
  offline: boolean;
  variantId: string | undefined;
}) {
  const files = kit?.files ?? [];
  const totalBytes = files.reduce((n, f) => n + Number(f.bytes ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
        <CardTitle>Bộ kit</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link
            to="/p/$projectId/kit"
            params={{ projectId }}
            search={{ tab: "assets", ...(variantId ? { variant: variantId } : {}) }}
          >
            <Images aria-hidden />
            Mở thư viện
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {files.length === 0 ? (
          <p className="text-caption text-fg-muted-raised">
            Chưa có file nào được cắt. Sau khi sinh ảnh, bước cắt sẽ tách sheet thành từng PNG trong
            suốt.
          </p>
        ) : (
          <>
            <p className="text-caption text-fg-muted-raised">
              {count(files.length, "file")} · {bytes(totalBytes)}
              {kit?.cutAt ? ` · cắt ${relTime(kit.cutAt)}` : ""}
            </p>
            <KitStrip projectId={projectId} files={files} offline={offline} max={8} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** "Thống kê nhanh" (§3-S2 "thống kê nhanh") + lối vào S2b. */
export function StatsCard({ project, projectId }: { project: Project; projectId: string }) {
  const s = project.stats;
  const jobs = Number(s?.jobs ?? 0);
  const rawPresent = Number(s?.rawPresent ?? 0);
  const lastRun = s?.lastRun ?? null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
        <CardTitle>Thống kê nhanh</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/p/$projectId/settings" params={{ projectId }}>
            <Settings2 aria-hidden />
            Cài đặt dự án
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <StatRow label="Lượt sinh ảnh trong thiết kế" value={count(jobs, "lượt")} />
        <StatRow label="Đã có ảnh" value={`${rawPresent}/${jobs}`} />
        <StatRow label="Thành phần đã tách" value={count(Number(s?.kitsCut ?? 0), "file")} />
        <StatRow label="Dung lượng trên đĩa" value={bytes(s?.diskBytes ?? 0)} />
        <StatRow
          label="Lượt chạy cuối"
          value={
            lastRun
              ? `${relTime(lastRun.at)} · ${Number(lastRun.ok ?? 0)} xong${
                  Number(lastRun.fail ?? 0) > 0 ? ` · ${lastRun.fail} lỗi` : ""
                }`
              : "chưa có"
          }
          {...(lastRun?.at ? { title: absTime(lastRun.at) } : {})}
        />
      </CardContent>
    </Card>
  );
}
