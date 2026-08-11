import { AlertTriangle, CircleHelp, FileJson, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { FLORA, SERIF } from "@/components/layout/flora";
import { BRIEF_LIMIT_NOTE, type BriefSummary } from "../lib/create-mode-brief";

/**
 * KẾT QUẢ ĐỌC ĐẦU BÀI (UI-SPEC-V2 §1.3) — bảng "Sẽ tạo / Từ câu / Tin cậy" của wireframe,
 * dựng lại theo đúng thứ dữ liệu THẬT có: số field, phân bố tin cậy, câu còn trống,
 * điểm mâu thuẫn NGUYÊN VĂN, và ghi chú theo trang.
 *
 * BA ĐIỀU KHỐI NÀY CỐ Ý **KHÔNG** LÀM:
 *  · không hứa "sẽ tạo phong cách/nhân vật/3 sheet" — bước ánh xạ field→contract
 *    (INTAKE-SPEC bước 7a) CHƯA TỒN TẠI, hứa là bịa;
 *  · không hiện giá trị của field `thap`/`trong` như thể nó là dữ liệu — chúng nằm ở
 *    mục "Chỉ ghi chú lại" kèm nguồn, người dùng tự hỏi khách;
 *  · không tóm tắt hay sửa chữ của 5 điểm mâu thuẫn (LUẬT 2 của `brief-read.ts`).
 *
 * FLORA: khối surface + hairline bo 16px, nhãn nhỏ CHỮ HOA phía trên, mật độ chữ thấp,
 * accent chỉ dùng cho MỘT con số (số câu dùng được). 0 literal màu / khoảng cách.
 */
export function BriefIntakeSummary({ summary }: { summary: BriefSummary }) {
  const s = summary;
  return (
    <section
      aria-label="Kết quả đọc đầu bài khách"
      className={cn("flex flex-col gap-4 border border-line-subtle bg-surface p-4", FLORA.r16)}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-label uppercase tracking-label text-fg-muted-raised">
          <FileJson className="size-3.5" aria-hidden />
          {s.fileName ?? "Nội dung đã dán"}
        </p>
        <p className="text-caption text-fg-muted-raised">
          mã form <span className="font-mono text-fg">{s.formId}</span>
        </p>
      </header>

      <p className="text-body text-fg">
        Đọc được <span className={cn(SERIF, "text-title text-fg-strong")}>{s.total}</span> câu ·{" "}
        <span className="text-accent-text">{s.usableCount}</span> câu dùng được ngay ·{" "}
        {s.noteOnlyCount} câu chỉ ghi chú lại.
      </p>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tally label="Tin cậy cao" value={s.tally.cao} />
        <Tally label="Trung bình" value={s.tally.tb} />
        <Tally label="Thấp" value={s.tally.thap} />
        <Tally label="Chưa trả lời" value={s.missingCount} />
      </dl>

      <p className="text-caption text-fg-muted-raised">{s.summaryLine}</p>

      {s.skippedCount > 0 && (
        <p role="status" className="flex items-start gap-2 text-caption text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Bỏ qua {s.skippedCount} bản ghi không đúng khuôn của form. Những câu còn lại vẫn đọc được bình thường.
        </p>
      )}

      {s.conflicts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-label uppercase tracking-label text-fg-muted-raised">
            {s.conflicts.length} điểm cần chốt lại với khách
          </h4>
          <ul className="flex flex-col gap-2">
            {s.conflicts.map((c) => (
              <li
                key={c.index}
                className={cn("flex flex-col gap-1 border border-line-subtle bg-raised p-3", FLORA.r12)}
              >
                <span className="flex items-start gap-2 text-caption text-fg">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
                  {c.text}
                </span>
                <span className="pl-5 text-caption text-fg-muted-raised">nguồn: {c.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.noteGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-label uppercase tracking-label text-fg-muted-raised">
            Chỉ ghi chú lại — {s.noteOnlyCount} câu chưa đủ chắc để dùng
          </h4>
          <ScrollArea className={cn("max-h-56 border border-line-subtle bg-raised", FLORA.r12)}>
            <ul className="flex flex-col gap-3 p-3">
              {s.noteGroups.map((g) => (
                <li key={g.section} className="flex flex-col gap-1.5">
                  <span className="text-caption text-fg-strong">{g.label}</span>
                  <ul className="flex flex-col gap-1">
                    {g.items.map((n) => (
                      <li key={n.id} className="flex items-start gap-2">
                        <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-fg-muted-raised" aria-hidden />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-caption text-fg">{n.question}</span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={n.blocking ? "warn" : "outline"}>
                              {n.blocking ? "chưa trả lời" : `tin cậy ${n.confidence}`}
                            </Badge>
                            {n.source && (
                              <span className="text-caption text-fg-muted-raised">nguồn: {n.source}</span>
                            )}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      <p className="flex items-start gap-2 text-caption text-fg-muted-raised">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {BRIEF_LIMIT_NOTE}
      </p>
    </section>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn("flex flex-col gap-0.5 border border-line-subtle bg-raised px-3 py-2", FLORA.r12)}>
      <dt className="text-caption text-fg-muted-raised">{label}</dt>
      <dd className="text-subtitle text-fg-strong">{value}</dd>
    </div>
  );
}
