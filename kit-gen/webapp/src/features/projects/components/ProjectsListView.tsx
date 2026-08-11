import * as React from "react";
import { AlertTriangle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { JobStatusBadge } from "@/components/common";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import { absTime, bytes, relTime } from "../lib/format";
import { projectState, STATE_ROW } from "../lib/view";
import type { Gate } from "../lib/gate";
import { ProjectMenu, type ProjectActions } from "./ProjectMenu";

/**
 * VIEW DANH SÁCH (§3-S1 wireframe "list", cho >12 project).
 *
 * Chọn nhiều bằng checkbox → thanh hành động nổi (BulkBar). MUST của spec chỉ là
 * **xuất nhiều + xoá nhiều**; đổi tên/nhân bản cố ý CHỈ làm 1 project một lần —
 * đổi tên hàng loạt không có nghĩa gì và nhân bản hàng loạt thì tốn đĩa mù quáng.
 *
 * `⇧`+click chọn DẢI (§3-S1 phím tắt) — mốc neo là dòng bấm gần nhất.
 *
 * A11y: hàng KHÔNG phải `<div onclick>`; ô đầu là `<Checkbox>` thật có nhãn ẩn,
 * tên project là `<button>` mở project. Hàng vẫn nhận focus để mũi tên của
 * `useGridKeys` chạy chung một đường với view lưới.
 */
export function ProjectsListView({
  items,
  actions,
  gate,
  selected,
  onSelectedChange,
  tabIndexFor,
  onBrokenDetail,
}: {
  items: readonly Project[];
  actions: ProjectActions;
  gate: Gate;
  selected: readonly string[];
  onSelectedChange: (ids: string[]) => void;
  tabIndexFor: (index: number) => 0 | -1;
  onBrokenDetail: (p: Project) => void;
}) {
  const anchor = React.useRef<number | null>(null);
  const selectable = React.useMemo(() => items.map((p) => p.id), [items]);
  const allOn = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const someOn = selected.length > 0 && !allOn;

  const toggle = (index: number, id: string, shift: boolean) => {
    if (shift && anchor.current !== null) {
      const [a, b] = [anchor.current, index].sort((x, y) => x - y) as [number, number];
      const range = items.slice(a, b + 1).map((p) => p.id);
      const merged = new Set([...selected, ...range]);
      onSelectedChange([...merged]);
      return;
    }
    anchor.current = index;
    onSelectedChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allOn ? true : someOn ? "indeterminate" : false}
              onCheckedChange={(v) => onSelectedChange(v === true ? [...selectable] : [])}
              aria-label={allOn ? "Bỏ chọn tất cả" : "Chọn tất cả project đang hiện"}
            />
          </TableHead>
          <TableHead>Project</TableHead>
          <TableHead className="w-24 text-right">Phong cách</TableHead>
          <TableHead className="w-20 text-right">Sheet</TableHead>
          <TableHead className="w-24 text-right">Element</TableHead>
          <TableHead className="w-56">Trạng thái</TableHead>
          <TableHead className="w-36">Sửa</TableHead>
          <TableHead className="w-28 text-right">Dung lượng</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((p, i) => {
          const st = projectState(p);
          const row = STATE_ROW[st];
          const on = selected.includes(p.id);
          const active = p.state?.activeRun;
          return (
            <TableRow
              key={p.id}
              data-project-card
              data-project-id={p.id}
              tabIndex={tabIndexFor(i)}
              aria-label={`Project ${p.name}`}
              data-state={on ? "selected" : undefined}
              className={cn(
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
                p.broken && "bg-danger/[0.06]",
              )}
            >
              <TableCell>
                <Checkbox
                  checked={on}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(i, p.id, (e as React.MouseEvent).shiftKey);
                  }}
                  aria-label={`Chọn ${p.name}`}
                />
              </TableCell>
              <TableCell className="max-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {p.broken && <AlertTriangle className="size-3.5 shrink-0 text-danger" aria-hidden />}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto min-w-0 justify-start truncate p-0 text-body text-fg-strong"
                    onClick={() => (p.broken ? onBrokenDetail(p) : actions.open(p))}
                  >
                    <span className="truncate">{p.name}</span>
                  </Button>
                  {p.tags.slice(0, 2).map((t) => (
                    <Badge key={t} tone="outline" className="shrink-0">
                      {t}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-caption">{p.stats?.variants ?? 0}</TableCell>
              <TableCell className="text-right font-mono text-caption">{p.stats?.sheets ?? 0}</TableCell>
              <TableCell className="text-right font-mono text-caption">{p.stats?.components ?? 0}</TableCell>
              <TableCell>
                {p.broken ? (
                  <Badge tone="danger">
                    <AlertTriangle aria-hidden />
                    <span>Không đọc được</span>
                  </Badge>
                ) : active?.total ? (
                  <Badge tone="running">
                    <Zap className="motion-safe:animate-kg-pulse" aria-hidden />
                    <span>
                      Đang sinh {active.done}/{active.total}
                    </span>
                  </Badge>
                ) : (
                  <JobStatusBadge status={row.badge} />
                )}
              </TableCell>
              <TableCell className="text-caption text-fg-muted-raised" title={absTime(p.updatedAt)}>
                {relTime(p.updatedAt)}
              </TableCell>
              <TableCell className="text-right font-mono text-caption text-fg-muted-raised">
                {bytes(p.stats?.diskBytes ?? 0)}
              </TableCell>
              <TableCell>
                <ProjectMenu project={p} actions={actions} gate={gate} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
