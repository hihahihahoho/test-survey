import { ArrowLeft, Scissors, Square, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RunStatusBadge } from "@/components/common";
import { cn } from "@/lib/utils";
import { SERIF } from "@/components/layout/flora";
import type { Run } from "@/lib/types";
import {
  approxTime, clock, elapsedSeconds, etaSeconds, isRunFinished, kindLabel,
  progressOf, runStatusOf, runSummary,
} from "../lib/format";

/**
 * HEADER + TIẾN ĐỘ + DẢI PHA của màn chi tiết lượt chạy (§3-S4, thành phần 1–3).
 * Đóng D1 (không có tiến độ), D6 (không huỷ được), H1 (pha cắt đứng im).
 *
 * BA ĐIỀU KHÔNG ĐƯỢC LÀM SAI Ở ĐÂY:
 *
 * ① §5.7 + E1: có lượt lỗi thì badge là `done-with-errors` — **không dấu ✓, không
 *    chữ "Xong" trơn**. `runStatusOf`/`RunStatusBadge` của R0 đã lo, ta chỉ phải
 *    không tự chế badge riêng.
 *
 * ② Thanh tiến độ đếm CẢ lượt lỗi (`done + failed`). Nếu chỉ đếm `done`, một run
 *    8 lượt có 3 lỗi sẽ đứng mãi ở 62% dù đã chạy hết — user ngồi chờ một thanh
 *    không bao giờ đầy.
 *
 * ③ `aria-live` của tiến độ để `polite` và chỉ đọc MỐC CHÍNH (§5.8-A8: "cập nhật
 *    ≤1 lần/5s để không spam"). Đồng hồ giây thì `aria-hidden` — đọc mỗi giây là
 *    tra tấn.
 */
export function RunHeader({
  run,
  projectId,
  now,
  onCancel,
  cancelling,
  readOnly,
  readOnlyReason,
}: {
  run: Run;
  projectId: string;
  now: number;
  onCancel: () => void;
  cancelling: boolean;
  readOnly: boolean;
  readOnlyReason: string;
}) {
  const p = progressOf(run);
  const finished = isRunFinished(run.status);
  const eta = finished ? null : etaSeconds(run);
  const elapsed = elapsedSeconds(run, now);
  const phase = run.phase;
  const hasPhases = Boolean(phase && phase.total > 1);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/p/$projectId/runs" params={{ projectId }} aria-label="Về danh sách lượt chạy">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>

        <h1 className="text-title text-fg-strong">
          Lượt <span className={SERIF}>chạy</span>
        </h1>
        <span className="font-mono text-body text-accent-text">{run.id}</span>

        <RunStatusBadge status={runStatusOf(run.status)} progress={runSummary(run)} />

        <Badge tone="never">
          {run.kind === "slice" ? <Scissors aria-hidden /> : <Sparkles aria-hidden />}
          <span>{kindLabel(run.kind)}</span>
        </Badge>

        {elapsed !== null && (
          <span className="font-mono text-body text-fg" aria-hidden>
            {clock(elapsed)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!finished && (
            <Button
              variant="secondary"
              loading={cancelling}
              disabled={readOnly}
              aria-disabled={readOnly || undefined}
              title={readOnly ? readOnlyReason : "Dừng lượt chạy (⌘.)"}
              onClick={onCancel}
            >
              <Square aria-hidden />
              Dừng
            </Button>
          )}
        </div>
      </div>

      {/* ── Thanh tiến độ + ETA ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Progress
          value={p.percent}
          aria-label="Tiến độ lượt chạy"
          indicatorClassName={cn(
            p.failed > 0 && "bg-warn",
            run.status === "env-failed" && "bg-danger",
            run.status === "cancelled" && "bg-never",
          )}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg">
          {/* Đọc lên cho screen reader ở mốc chính, không đọc từng giây. */}
          <span role="status" aria-live="polite">
            {p.done}/{p.total} xong
            {p.failed > 0 && ` · ${p.failed} lỗi`}
          </span>
          {!finished && (
            <>
              <span aria-hidden>·</span>
              <span>còn {approxTime(eta)}</span>
              <span aria-hidden>·</span>
              <span>{run.maxJobs ?? 4} lượt song song</span>
            </>
          )}
          {finished && elapsed !== null && (
            <>
              <span aria-hidden>·</span>
              <span>tổng {clock(elapsed)}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Dải pha 1/2 → 2/2 (chốt X9, đóng H1) ────────────────────────── */}
      {hasPhases && phase && (
        <div className="flex flex-wrap items-center gap-2 rounded-2 border border-line-subtle bg-surface px-3 py-2">
          <PhaseChip index={1} total={phase.total} label="Sinh ảnh" current={phase.index} />
          <span className="text-fg-muted-raised" aria-hidden>
            →
          </span>
          <PhaseChip index={2} total={phase.total} label="Cắt ảnh" current={phase.index} />
          <span className="text-caption text-fg-muted-raised">
            {phase.index === 2
              ? "Đang cắt ảnh vừa sinh thành từng file PNG trong suốt."
              : "Cắt sẽ tự chạy sau khi sinh ảnh xong."}
          </span>
        </div>
      )}
    </header>
  );
}

function PhaseChip({
  index,
  total,
  label,
  current,
}: {
  index: number;
  total: number;
  label: string;
  current: number;
}) {
  const done = current > index;
  const active = current === index;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption",
        active && "kg-tint-running text-on-tint-running",
        done && "kg-tint-ok text-on-tint-ok",
        !active && !done && "kg-tint-never text-on-tint-never",
      )}
    >
      {/* Chữ đi kèm số pha — không dựa vào màu để phân biệt (§5.8-A3). */}
      <span className="font-mono">
        {index}/{total}
      </span>
      <span>{label}</span>
      <span className="sr-only">{done ? "đã xong" : active ? "đang chạy" : "chưa tới"}</span>
    </span>
  );
}
