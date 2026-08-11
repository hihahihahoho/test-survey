import { ArrowRight, CheckCircle2, Info, Images, Scissors, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/components/common";
import type { Gate } from "@/features/projects/lib/gate";
import type { NextAction, NextActionKind } from "../lib/next-actions";

/**
 * THẺ "VIỆC TIẾP THEO" (§3-S2 mục 2) — thay cho việc user phải đoán.
 *
 * Luật: mỗi dòng = 1 badge trạng thái (§5.7) + 1 câu + ĐÚNG MỘT nút đưa thẳng tới
 * chỗ cần làm. Tối đa 3 dòng. Không có việc gì cần làm ⇒ dòng xanh "Mọi thứ đã
 * đồng bộ" + gợi ý xem kit — chứ không phải thẻ trống.
 *
 * §2.5-2: nút gây thay đổi khi agent chưa chạy thì `disabled` + `aria-disabled` +
 * tooltip nói lý do, và KHÔNG BỊ ẨN. Nút chỉ điều hướng (Xem tiến độ) vẫn bấm được.
 *
 * `degraded` (§7.5-U2): agent chưa trả tiến độ từng lượt ⇒ NÓI THẲNG rằng đây là
 * mức sheet, có thể thô hơn thực tế. Thà thừa một dòng giải thích hơn là để user
 * tin vào ô xanh giả.
 */
const ICONS: Record<NextActionKind, LucideIcon> = {
  "design-sheets": ArrowRight,
  "design-styles": ArrowRight,
  runs: ArrowRight,
  gen: Zap,
  slice: Scissors,
};

export function NextActionsCard({
  actions,
  degraded,
  gate,
  pending,
  onAction,
  onOpenKit,
}: {
  actions: readonly NextAction[];
  degraded: boolean;
  gate: Gate;
  /** true khi đang gửi lệnh cắt — khoá nút để không bấm hai lần. */
  pending: boolean;
  onAction: (action: NextAction) => void;
  onOpenKit: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle>Việc tiếp theo</CardTitle>
        {actions.length > 0 && (
          <span className="text-caption text-fg-muted-raised">
            {actions.length === 1 ? "1 việc đang chờ" : `${actions.length} việc đang chờ`}
          </span>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {degraded && (
          <p role="status" className="flex items-start gap-2 rounded-2 border border-accent/60 bg-accent/[var(--kg-tint-b)] p-3 text-caption text-fg">
            <Info className="mt-0.5 size-4 shrink-0 text-on-tint-accent" aria-hidden />
            <span>
              Công cụ local chưa trả tiến độ của từng lượt. Các trạng thái dưới đây suy ở mức sheet nên
              có thể thô hơn thực tế.
            </span>
          </p>
        )}

        {actions.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2 border border-ok/60 bg-ok/[0.08] p-3">
            <CheckCircle2 className="size-4 shrink-0 text-on-tint-ok" aria-hidden />
            <p className="flex-1 text-body text-fg-strong">
              Mọi thứ đã đồng bộ — không có việc nào đang chờ.
            </p>
            <Button variant="secondary" size="sm" onClick={onOpenKit}>
              <Images aria-hidden />
              Xem kit đã cắt
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {actions.map((a) => {
              const Icon = ICONS[a.kind];
              const blocked = a.needsAgent && gate.readOnly;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 rounded-2 border border-line-subtle bg-canvas p-3"
                >
                  <JobStatusBadge status={a.status} />
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="text-body text-fg-strong">{a.title}</p>
                    {a.detail && (
                      <p className="truncate text-caption text-fg-muted-raised" title={a.detail}>
                        {a.detail}
                      </p>
                    )}
                  </div>
                  <Button
                    // §5.4 "mỗi màn TỐI ĐA 1 nút primary": nút primary của S2 là
                    // [⚡ Sinh ảnh…] ở đầu màn. Ở đây dùng secondary, và nhấn mạnh
                    // bằng badge trạng thái + thứ tự dòng, không bằng thêm màu xanh.
                    variant="secondary"
                    size="sm"
                    disabled={blocked || pending}
                    aria-disabled={blocked || undefined}
                    title={blocked ? gate.reason : undefined}
                    onClick={() => onAction(a)}
                  >
                    <Icon aria-hidden />
                    {a.actionLabel}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
