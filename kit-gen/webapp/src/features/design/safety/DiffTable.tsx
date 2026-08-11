import { ArrowRight, Minus, Plus, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContractDiff, ContractSummary } from "./diff";
import { cn } from "@/lib/utils";

/**
 * SO SÁNH 2 CỘT dùng chung cho: modal xung đột 409, banner nháp [So sánh],
 * drawer lịch sử [Xem diff]. Một component ⇒ ba chỗ không bao giờ nói khác nhau.
 *
 * A11y: dòng khác biệt có ICON + CHỮ ("thêm"/"bớt"/"sửa"), không chỉ dựa vào
 * màu (§5.8-A3). Bảng có `<caption>` cho screen reader.
 */
const KIND_META = {
  added: { icon: Plus, tone: "ok" as const, word: "thêm" },
  removed: { icon: Minus, tone: "danger" as const, word: "bớt" },
  changed: { icon: PencilLine, tone: "warn" as const, word: "sửa" },
};

export function SummaryColumns({
  leftTitle,
  leftNote,
  leftSummary,
  rightTitle,
  rightNote,
  rightSummary,
}: {
  leftTitle: string;
  leftNote?: string;
  leftSummary: ContractSummary;
  rightTitle: string;
  rightNote?: string;
  rightSummary: ContractSummary;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SummaryCard title={leftTitle} note={leftNote} s={leftSummary} accent />
      <SummaryCard title={rightTitle} note={rightNote} s={rightSummary} />
    </div>
  );
}

function SummaryCard({
  title,
  note,
  s,
  accent = false,
}: {
  title: string;
  note?: string;
  s: ContractSummary;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2 border p-3",
        accent ? "border-accent/60 bg-accent/[var(--kg-tint-b)]" : "border-line-subtle bg-canvas",
      )}
    >
      <p className="text-label text-fg-strong">{title}</p>
      <dl className="flex flex-col gap-0.5 text-caption text-fg">
        <Row k="Sheet" v={s.sheets} />
        <Row k="Element" v={s.components} />
        <Row k="Phong cách" v={s.variants} />
      </dl>
      {note && <p className="text-caption text-fg-muted-raised">{note}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt>{k}</dt>
      <dd className="font-mono text-fg-strong">{v}</dd>
    </div>
  );
}

export function DiffTable({ diff, emptyLabel = "Không có khác biệt nào ở mức sheet, element và phong cách." }: {
  diff: ContractDiff;
  emptyLabel?: string;
}) {
  if (diff.identical) {
    return <p className="text-caption text-fg-muted-raised">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-64 overflow-y-auto rounded-2 border border-line-subtle">
      <table className="w-full border-collapse text-caption">
        <caption className="sr-only">
          Danh sách khác biệt: thêm {diff.added}, bớt {diff.removed}, sửa {diff.changed} mục
        </caption>
        <tbody>
          {diff.rows.map((r, i) => {
            const meta = KIND_META[r.kind];
            const Icon = meta.icon;
            return (
              <tr key={`${r.kind}-${r.what}-${r.label}-${i}`} className="border-b border-line-subtle last:border-0">
                <td className="w-24 py-1.5 pl-2">
                  <Badge tone={meta.tone}>
                    <Icon aria-hidden />
                    <span>{meta.word}</span>
                  </Badge>
                </td>
                <td className="py-1.5 text-fg-muted-raised">{r.what}</td>
                <td className="py-1.5 font-mono text-fg-strong">{r.label}</td>
                <td className="py-1.5 pr-2 text-right text-fg">
                  {r.detail && (
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight className="size-3 text-fg-muted-raised" aria-hidden />
                      {r.detail}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
