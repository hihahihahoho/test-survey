import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Boxes, Clock } from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/lib/hooks";
import { useRecentStore } from "@/lib/store";

/**
 * ⌘P — NHẢY NHANH GIỮA BỘ KIT (§2.3), fuzzy theo tên + tag.
 *
 * Dùng `kitgen.recent.v1` của R0 để 10 bộ kit mở gần nhất lên đầu khi chưa gõ
 * gì — đóng issue J5 (v1 không có đường quay lại project vừa làm).
 *
 * Agent tắt ⇒ `useProjects` lỗi ⇒ danh sách rỗng. KHÔNG hiện lỗi kỹ thuật ở
 * đây: hộp này chỉ là lối đi tắt, banner §2.5 mới là nơi báo trạng thái agent.
 */
export function ProjectJump({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  // Chỉ gọi API khi hộp mở — ⌘P không được thành một nguồn poll ngầm.
  const { data, isLoading } = useProjects();
  const recentIds = useRecentStore((s) => s.projectIds);

  const items = React.useMemo(() => data?.items ?? [], [data]);
  const recent = React.useMemo(
    () => recentIds.map((id) => items.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [recentIds, items],
  );
  const rest = React.useMemo(
    () => items.filter((p) => !recentIds.includes(p.id)),
    [items, recentIds],
  );

  const openProject = (id: string) => {
    onOpenChange(false);
    setTimeout(() => void navigate({ to: "/k/$projectId", params: { projectId: id } }), 0);
  };

  const row = (p: (typeof items)[number]) => (
    <CommandItem
      key={p.id}
      // gộp tag vào `value` để cmdk tìm được theo tag, đúng §2.3 "fuzzy tên + tag"
      value={`${p.name} ${p.tags.join(" ")} ${p.id}`}
      onSelect={() => openProject(p.id)}
    >
      <Boxes aria-hidden />
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {p.broken && <Badge tone="danger">Không đọc được</Badge>}
      {p.tags.slice(0, 2).map((t) => (
        <Badge key={t} tone="outline">
          {t}
        </Badge>
      ))}
    </CommandItem>
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="Chuyển nhanh giữa các bộ kit"
      description="Tìm theo tên hoặc nhãn"
    >
      <CommandInput placeholder="Tên bộ kit hoặc nhãn… (không cần dấu)" />
      <CommandList>
        <CommandEmpty>
          {isLoading ? "Đang tải danh sách bộ kit…" : "Không có bộ kit nào khớp."}
        </CommandEmpty>
        {recent.length > 0 && (
          <CommandGroup heading="Mở gần đây">
            {recent.map((p) => (
              <React.Fragment key={p.id}>
                <CommandItem
                  value={`${p.name} ${p.tags.join(" ")} ${p.id}`}
                  onSelect={() => openProject(p.id)}
                >
                  <Clock aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.tags.slice(0, 2).map((t) => (
                    <Badge key={t} tone="outline">
                      {t}
                    </Badge>
                  ))}
                </CommandItem>
              </React.Fragment>
            ))}
          </CommandGroup>
        )}
        {rest.length > 0 && <CommandGroup heading="Tất cả bộ kit">{rest.map(row)}</CommandGroup>}
      </CommandList>
    </CommandDialog>
  );
}
