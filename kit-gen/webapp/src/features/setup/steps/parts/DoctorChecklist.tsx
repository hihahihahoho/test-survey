import { Check, Copy, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Doctor } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { StepCard, Note } from "../../components/StepShell";
import { checkRows } from "../../lib/doctor-view";
import { bytes, hhmm } from "../../lib/format";
import { useCopy } from "../../hooks/use-copy";

/**
 * Checklist "Máy của bạn" — từng dòng ✓/✗ (§3-S0 bước 4, các mã CODEX_MISSING/PY_DEPS_MISSING).
 *
 * Ba quy tắc:
 *  · §5.8-A3 — không dùng màu làm dấu hiệu duy nhất: mỗi dòng có ICON + chữ ẩn cho screen
 *    reader ("Đã có:" / "Còn thiếu:" / "Chưa kiểm được:").
 *  · mỗi dòng thiếu nêu HỆ QUẢ bằng tiếng Việt (mất gì) rồi mới tới lệnh sửa. Biết "thiếu
 *    numpy" mà không biết mất gì thì user không quyết định được có cần sửa ngay không.
 *  · agent không khai mục nào ⇒ hiện "chưa kiểm được", KHÔNG bịa ✗. Sai lệch kiểu đó làm
 *    user đi cài lại thứ họ đã có.
 */
export function DoctorChecklist({ doctor }: { doctor: Doctor | null }) {
  const { copy } = useCopy();
  const free = typeof doctor?.workspace?.freeBytes === "number"
    ? `còn ${bytes(doctor.workspace.freeBytes)} trống`
    : "";
  const rows = checkRows(doctor, free);
  const checkedAt = hhmm(doctor?.checkedAt);

  return (
    <StepCard title="Máy của bạn">
      <ul className="flex flex-col">
        {rows.map((r) => {
          const state = !r.known ? "unknown" : r.ok ? "ok" : "missing";
          const Icon = state === "ok" ? Check : state === "missing" ? X : HelpCircle;
          return (
            <li
              key={r.key}
              className="flex items-start gap-3 border-b border-line-subtle py-2 last:border-b-0"
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  state === "ok" && "text-accent-text",
                  state === "missing" && "text-danger",
                  state === "unknown" && "text-fg-muted"
                )}
                aria-hidden
              />
              <span className="sr-only">
                {state === "ok" ? "Đã có:" : state === "missing" ? "Còn thiếu:" : "Chưa kiểm được:"}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body text-fg-strong">
                  {r.label}
                  {r.value && <span className="ml-2 font-mono text-caption text-fg">{r.value}</span>}
                </span>
                {state !== "ok" && (
                  <span className="text-caption text-fg-muted">
                    {state === "unknown"
                      ? "Công cụ local chưa báo về mục này."
                      : r.consequence}
                  </span>
                )}
              </div>
              {state === "missing" && r.cmd && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copy(r.cmd!, "lệnh cài")}
                  aria-label={`Copy lệnh cài ${r.label}`}
                >
                  <Copy aria-hidden />
                  Copy lệnh cài
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {checkedAt && <Note>Kiểm tra lúc {checkedAt}</Note>}
    </StepCard>
  );
}
