import { Clock3, Folder, LayoutGrid, Settings, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type HomeSection = "recent" | "all" | "starred";
export function HomeSidebar({ section, workspace, trashCount, onSection, onTrash, onSettings }: { section: HomeSection; workspace?: string; trashCount: number; onSection: (s: HomeSection)=>void; onTrash:()=>void; onSettings:()=>void }) {
  const item=(id:HomeSection,label:string,Icon:typeof Clock3)=><button onClick={()=>onSection(id)} className={cn("flex h-9 w-full items-center gap-3 rounded-2 px-3 text-label", section===id?"bg-raised text-fg-strong":"text-fg hover:bg-surface")}><Icon className="size-4"/><span>{label}</span></button>;
  return <aside className="hidden w-60 shrink-0 border-r border-line-subtle bg-surface/60 p-3 md:flex md:flex-col">
    <button onClick={()=>onSection("all")} className="mb-5 flex h-10 items-center gap-2 rounded-2 px-2 text-subtitle text-fg-strong"><span className="size-5 rounded-1 border border-accent bg-accent/[var(--kg-tint-a)]"/>KitGen</button>
    <nav className="space-y-1">{item("recent","Gần đây",Clock3)}{item("all","Tất cả bộ kit",LayoutGrid)}{item("starred","Đã đánh dấu",Star)}</nav>
    <div className="my-4 border-t border-line-subtle"/>
    <button className="flex items-center gap-3 rounded-2 px-3 py-2 text-left text-label text-fg" title={workspace}><Folder className="size-4"/><span className="truncate">{workspace ?? "~/KitGen"}</span></button>
    <button onClick={onTrash} className="mt-1 flex h-9 items-center gap-3 rounded-2 px-3 text-label text-fg hover:bg-raised"><Trash2 className="size-4"/>Thùng rác{trashCount>0&&<span className="ml-auto text-caption text-fg-muted">{trashCount}</span>}</button>
    <button onClick={onSettings} className="mt-auto flex h-9 items-center gap-3 rounded-2 px-3 text-label text-fg hover:bg-raised"><Settings className="size-4"/>Cài đặt</button>
  </aside>;
}
