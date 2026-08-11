import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { presentError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { docsElementId, errorAnchor } from "../lib/anchors";
import type { DocEntry } from "../lib/catalog";

/**
 * MỘT MỤC TRỢ GIÚP cho một mã lỗi — đích thật của `error.docs` trong envelope §6.1.
 *
 * Chia nguồn chữ rất rõ, KHÔNG chép qua chép lại:
 *   · tiêu đề + câu 1 dòng  ← `presentError()` (bảng §3.9 của R0). Một nguồn duy nhất.
 *   · "vì sao" + "cách xử lý" ← `DocEntry` (file lib/catalog.ts của tôi).
 *
 * Mã kỹ thuật (`CONTRACT_CONFLICT`) ĐƯỢỢC hiện ở đây — và đây là ngoại lệ duy nhất
 * hợp lệ: trang này tồn tại để tra mã. §1.3 cấm thuật ngữ nội bộ trong LUỒNG LÀM VIỆC,
 * còn ở trang tra cứu thì mã chính là thứ user đang tìm. Nó nằm trong `<Badge>` chữ mono,
 * tách khỏi phần văn xuôi.
 */
export function ErrorDocCard({
  entry,
  highlight = false,
  className,
}: {
  entry: DocEntry;
  /** true ⇒ mục vừa được nhảy tới từ link lỗi: viền accent để mắt bám được. */
  highlight?: boolean;
  className?: string;
}) {
  const p = presentError({ code: entry.code });

  return (
    <section
      id={docsElementId(entry.code)}
      aria-labelledby={`${docsElementId(entry.code)}-title`}
      className={cn(
        "scroll-mt-24 rounded-3 border bg-surface p-4",
        highlight ? "border-accent shadow-1" : "border-line-subtle",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <h3 id={`${docsElementId(entry.code)}-title`} className="text-subtitle text-fg-strong">
          {p.title}
        </h3>
        <Badge tone={p.severity === "danger" ? "danger" : p.severity === "warn" ? "warn" : "accent"}>
          {p.severity === "info" ? <Info aria-hidden /> : <AlertTriangle aria-hidden />}
          <span className="font-mono">{entry.code}</span>
        </Badge>
        {entry.clientSide && (
          <Badge tone="never">
            <Info aria-hidden />
            <span>do giao diện phát hiện</span>
          </Badge>
        )}
      </div>

      <p className="mt-2 text-body text-fg">{entry.why}</p>

      <h4 className="mt-4 text-caption uppercase tracking-label text-fg-muted-raised">Cách xử lý</h4>
      <ol className="mt-1.5 flex flex-col gap-1.5">
        {entry.fix.map((step, i) => (
          <li key={step} className="flex gap-2 text-body text-fg">
            <span className="shrink-0 font-mono text-accent-text" aria-hidden>
              {i + 1}.
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      {entry.commands && entry.commands.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {entry.commands.map((c) => (
            <div key={c.cmd} className="flex flex-col gap-1">
              <span className="text-caption text-fg-muted-raised">{c.label}</span>
              <CopyableCode value={c.cmd} label={c.label} />
            </div>
          ))}
        </div>
      )}

      {entry.related && entry.related.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-caption text-fg-muted-raised">
          <span>Xem thêm:</span>
          {entry.related.map((r) => (
            <Button key={r} variant="link" size="sm" className="h-auto px-0 font-mono text-caption" asChild>
              {/* Hash nội bộ: cùng trang, không cần router — và vẫn hoạt động ở cả /app/. */}
              <a href={`#${docsElementId(r)}`} aria-label={`Xem mục ${errorAnchor(r)}`}>
                {r}
                <ArrowRight aria-hidden />
              </a>
            </Button>
          ))}
        </p>
      )}
    </section>
  );
}
