import { Frame, Image, Link2, MousePointer2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TOOLS = [
  { icon: MousePointer2, label: "Chọn (V)", key: "select" },
  { icon: Frame, label: "Khung (F)", key: "frame" },
  { icon: Image, label: "Ảnh (I)", key: "image" },
  { icon: StickyNote, label: "Ghi chú (N)", key: "note" },
  { icon: Link2, label: "Link (L)", key: "link" },
] as const;
export function CanvasRail({ onTool }: { onTool?: (tool: typeof TOOLS[number]["key"]) => void }) {
  return <div role="group" aria-label="Công cụ bàn làm việc — sắp có" className="z-rail flex w-rail-collapsed shrink-0 flex-col items-center gap-0.5 border-r border-line-subtle bg-canvas py-2">
    {TOOLS.map(t=><Tooltip key={t.key}><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t.label} onClick={()=>onTool?.(t.key)} disabled={!onTool || t.key === "link"}><t.icon aria-hidden strokeWidth={1.5}/></Button></TooltipTrigger><TooltipContent side="right">{t.key === "link" ? "Chọn một món trước để nối" : t.label}</TooltipContent></Tooltip>)}
  </div>;
}
