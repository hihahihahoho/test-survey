import * as React from "react";
import { ArrowDownToLine, Download, Filter, Radio, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hhmmss } from "../lib/format";
import { logToText, type LogLine } from "../lib/runlog";
import type { RunLogApi } from "../lib/useRunLog";
import { downloadText } from "../lib/download";

/**
 * PANEL NHẬT KÝ (§3-S4-5). Bốn hành vi bắt buộc, cả bốn đều dễ làm sai:
 *
 * ① NỐI THÊM, KHÔNG GHI ĐÈ (đóng D2) — lo ở `runlog.ts`, ở đây chỉ render.
 *
 * ② TỰ CUỘN THÔNG MINH: cuộn xuống khi có dòng mới, NHƯNG dừng ngay khi user
 *    cuộn lên, và hiện nút [⏬ Về cuối]. Vì sao quan trọng: log đang chạy mà tự
 *    kéo xuống trong lúc user đang đọc dòng lỗi ở giữa là thứ khiến người ta
 *    phải chụp màn hình để đọc. Ngưỡng 48px cho phép lệch một dòng vẫn coi là
 *    "đang ở cuối" — cuộn mượt của trình duyệt hay dừng lệch vài pixel.
 *
 * ③ `aria-live` CHỈ ĐỌC DÒNG LỖI (§5.8-A8). Đọc cả nghìn dòng info lên là tra
 *    tấn người dùng screen reader; nhưng im lặng hoàn toàn thì họ không biết
 *    có lỗi. Vùng `sr-only` riêng, chỉ nhận dòng `error` cuối cùng.
 *
 * ④ CHẾ ĐỘ POLL hiện thành badge nhỏ (X10), không đổi bố cục — spec đòi "UI
 *    phải giống nhau ở cả hai chế độ".
 */
const NEAR_BOTTOM_PX = 48;

export function LogPanel({
  log,
  runId,
  jobs,
  className,
}: {
  log: RunLogApi;
  runId: string;
  /** Danh sách lượt để lọc [Chỉ lượt này]. */
  jobs: readonly string[];
  className?: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  const onScroll = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    setAutoScroll(nearBottom);
  }, []);

  React.useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.lines, autoScroll]);

  const lastError = React.useMemo(() => {
    for (let i = log.lines.length - 1; i >= 0; i -= 1) {
      const l = log.lines[i]!;
      if (l.level === "error") return l;
    }
    return null;
  }, [log.lines]);

  const filtering = log.filter.errorsOnly || log.filter.job !== null;

  return (
    <section className={cn("flex min-h-0 flex-col rounded-3 border border-line-subtle bg-surface", className)}>
      {/* ── Thanh công cụ ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2">
        <h2 className="text-label text-fg-strong">Nhật ký</h2>

        {log.fromCache ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge tone="never">
                <WifiOff aria-hidden />
                <span>bản lưu tạm</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Công cụ local không chạy — đây là nhật ký đã lưu trên máy này, có thể chưa đủ.
            </TooltipContent>
          </Tooltip>
        ) : log.polling ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge tone="warn">
                <Radio aria-hidden />
                <span>chế độ poll</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Kết nối trực tiếp bị gián đoạn — đang hỏi lại mỗi 2 giây. Nội dung vẫn đúng, chỉ chậm hơn vài giây.
            </TooltipContent>
          </Tooltip>
        ) : log.connected ? (
          <Badge tone="ok">
            <Radio aria-hidden />
            <span>trực tiếp</span>
          </Badge>
        ) : null}

        <span className="text-caption text-fg-muted-raised">
          {filtering ? `${log.lines.length}/${log.total} dòng` : `${log.total} dòng`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant={log.filter.errorsOnly ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={log.filter.errorsOnly}
            onClick={() => log.setFilter({ errorsOnly: !log.filter.errorsOnly })}
          >
            <Filter aria-hidden />
            Chỉ lỗi
          </Button>

          {jobs.length > 0 && (
            <label className="flex items-center gap-1 text-caption text-fg">
              <span className="sr-only">Lọc theo lượt sinh ảnh</span>
              <select
                value={log.filter.job ?? ""}
                onChange={(e) => log.setFilter({ job: e.target.value === "" ? null : e.target.value })}
                className={cn(
                  "h-ctl-sm rounded-1 border border-line bg-raised px-2 text-caption text-fg-strong",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                )}
              >
                <option value="">Mọi lượt</option>
                {jobs.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={log.total === 0}
            onClick={() => downloadText(`kitgen-${runId}.log`, logToText(log.allLines()))}
          >
            <Download aria-hidden />
            Tải log
          </Button>
        </div>
      </header>

      {/* ── Danh sách dòng ────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          role="log"
          tabIndex={0}
          aria-label="Nhật ký lượt chạy"
          className={cn(
            "h-full min-h-[200px] overflow-y-auto px-3 py-2 font-mono text-mono",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
          )}
        >
          {log.lines.length === 0 ? (
            <p className="py-6 text-center font-sans text-caption text-fg-muted-raised">
              {log.total === 0
                ? "Chưa có dòng nhật ký nào."
                : "Không có dòng nào khớp bộ lọc đang bật."}
            </p>
          ) : (
            log.lines.map((l, i) => <LogRow key={`${l.seq}-${i}`} line={l} />)
          )}
        </div>

        {!autoScroll && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              className="shadow-2"
              onClick={() => {
                setAutoScroll(true);
                const el = listRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
            >
              <ArrowDownToLine aria-hidden />
              Về cuối
            </Button>
          </div>
        )}
      </div>

      {/* §5.8-A8: chỉ đọc dòng LỖI cho screen reader, không đọc cả nghìn dòng info. */}
      <div className="sr-only" role="status" aria-live="polite">
        {lastError ? `Lỗi: ${lastError.job ? `${lastError.job} — ` : ""}${lastError.text}` : ""}
      </div>
    </section>
  );
}

const LogRow = React.memo(function LogRow({ line }: { line: LogLine }) {
  const isErr = line.level === "error";
  const isWarn = line.level === "warn";
  return (
    <div
      className={cn(
        "flex gap-2 rounded-1 px-1 py-0.5",
        isErr && "bg-danger/10",
        isWarn && "bg-warn/10",
      )}
    >
      <span className="shrink-0 text-fg-muted-raised">{hhmmss(line.t)}</span>
      {line.job && <span className="shrink-0 text-accent-text">{line.job}</span>}
      <span className={cn("min-w-0 whitespace-pre-wrap break-words", isErr ? "text-danger" : "text-fg")}>
        {isErr && <span className="sr-only">Lỗi: </span>}
        {line.text}
      </span>
    </div>
  );
});
