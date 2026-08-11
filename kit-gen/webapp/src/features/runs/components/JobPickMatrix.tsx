import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { JobStatusBadge } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { JobStatusValue, Sheet, Variant } from "@/lib/types";

/**
 * MA TRẬN "phong cách × sheet" của modal M1 (§4.8 wireframe).
 *
 * Tách khỏi `GenerateDialog` để mỗi file dưới ~400 dòng, và để QA soi riêng phần
 * a11y của bảng này — nó là chỗ đóng NHIỀU issue giao diện nhất của audit:
 *
 *  · I2/I4 + §5.8-A5 — mỗi ô là `<Checkbox>` THẬT có `<Label>`, không phải
 *    `<div onClick>`. Nhãn đầy đủ ("Tết đỏ · main") nằm trong `sr-only` vì trên
 *    màn thì hàng/cột đã nói rõ rồi, nhưng screen reader thì không "nhìn" được
 *    tiêu đề hàng/cột khi nhảy thẳng vào ô.
 *  · I1 — ô đang chọn có NỀN + VIỀN + dấu ✓ của checkbox, không chỉ đổi màu
 *    viền (bản v1 đo được 2.72:1, dưới ngưỡng 3:1 của WCAG 1.4.11).
 *  · §5.7 — mỗi ô kèm badge trạng thái (icon + chữ trong tooltip), để user biết
 *    ô nào đáng sinh lại trước khi tick.
 */
export function JobPickMatrix({
  variants,
  sheets,
  jobs,
  jobStates,
  picked,
  onToggle,
}: {
  variants: readonly Variant[];
  sheets: readonly Sheet[];
  jobs: readonly { job: string; variant: string; sheet: string }[];
  jobStates: Record<string, JobStatusValue>;
  picked: ReadonlySet<string>;
  onToggle: (job: string, on: boolean) => void;
}) {
  if (jobs.length === 0) {
    return (
      <p className="rounded-2 border border-line-subtle bg-canvas p-3 text-caption text-fg">
        Bản thiết kế chưa có phong cách hoặc chưa có sheet nào để sinh ảnh.
      </p>
    );
  }

  return (
    <div className="max-h-64 overflow-auto rounded-2 border border-line-subtle">
      <Table>
        <caption className="sr-only">
          Chọn lượt cần sinh: {variants.length} phong cách × {sheets.length} sheet
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Phong cách</TableHead>
            {sheets.map((sh) => (
              <TableHead key={sh.id} scope="col" className="font-mono">
                {sh.id}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((v) => (
            <TableRow key={v.id}>
              <TableCell scope="row" className="whitespace-nowrap text-fg-strong">
                {v.vi || v.id}
              </TableCell>
              {sheets.map((sh) => {
                const job = jobs.find((j) => j.variant === v.id && j.sheet === sh.id);
                if (!job) {
                  return (
                    <TableCell key={sh.id} className="text-caption text-fg-muted-raised">
                      {/* Sheet không áp cho phong cách này — nói rõ, đừng để ô trống bí ẩn. */}
                      — không áp
                    </TableCell>
                  );
                }
                const st = jobStates[job.job] ?? "never";
                const checked = picked.has(job.job);
                const id = `m1-${job.job}`;
                return (
                  <TableCell key={sh.id}>
                    <div
                      className={cn(
                        "flex w-fit items-center gap-1.5 rounded-1 border px-1.5 py-1 transition-colors duration-fast",
                        checked
                          ? "border-accent bg-accent/[var(--kg-tint-a)]"
                          : "border-transparent hover:border-line-subtle",
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(c) => onToggle(job.job, c === true)}
                      />
                      <Label htmlFor={id} className="cursor-pointer">
                        <span className="sr-only">
                          {v.vi || v.id} · {sh.id}
                        </span>
                        <JobStatusBadge status={st} compact />
                      </Label>
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
