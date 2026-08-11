import * as React from "react";
import { FileImage, Frame, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasDoc, CanvasNode } from "@/features/docs/lib";
import { loadImage } from "@/features/kit/lib/image-source";

export function CanvasWorld({ projectId, canvas, onChange }: { projectId?: string; canvas: CanvasDoc; onChange?: (next: CanvasDoc) => void }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const move = (id: string, x: number, y: number) => onChange?.({ ...canvas, nodes: canvas.nodes.map(n => n.id === id ? { ...n, x, y } : n) });
  return <>{canvas.nodes.map(node => <CanvasObject key={node.id} projectId={projectId} node={node} selected={selected === node.id} onSelect={() => setSelected(node.id)} onMove={(x,y)=>move(node.id,x,y)} />)}</>;
}

function CanvasObject({ projectId, node, selected, onSelect, onMove }: { projectId?: string; node: CanvasNode; selected: boolean; onSelect:()=>void; onMove:(x:number,y:number)=>void }) {
  const Icon = node.type === "note" ? StickyNote : node.type === "image-ref" ? FileImage : Frame;
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    const ref = node.type === "image-ref" && node.bind?.kind === "ref" ? node.bind.id : null;
    if (!projectId || !ref) { setImageUrl(null); return; }
    const h = loadImage(projectId, ref.startsWith("refs/") ? ref : `refs/${ref}`, 256);
    void h.promise.then(setImageUrl).catch(() => setImageUrl(null));
    return h.cancel;
  }, [projectId, node.type, node.bind]);
  const drag = React.useRef<{x:number;y:number;left:number;top:number}|null>(null);
  return <button type="button" aria-label={node.text || node.type} aria-pressed={selected}
    onPointerDown={e=>{ e.stopPropagation(); onSelect(); drag.current={x:e.clientX,y:e.clientY,left:node.x,top:node.y}; e.currentTarget.setPointerCapture?.(e.pointerId); }}
    onPointerUp={e=>{ const d=drag.current; if(d) onMove(d.left+(e.clientX-d.x),d.top+(e.clientY-d.y)); drag.current=null; }}
    style={{transform:`translate(${node.x}px, ${node.y}px)`,width:Math.max(120,node.w||240),height:Math.max(80,node.h||140),zIndex:node.z}}
    className={cn("absolute left-0 top-0 flex cursor-move select-none flex-col items-start gap-3 overflow-hidden rounded-3 border bg-surface p-4 text-left shadow-2",selected?"border-accent ring-2 ring-focus-ring":"border-line-subtle hover:border-line") }>
      {imageUrl ? <img src={imageUrl} alt="" draggable={false} className="min-h-0 w-full flex-1 rounded-2 object-contain" /> : <Icon className="size-5 text-accent-text" aria-hidden />}
      <span className="line-clamp-4 text-body text-fg-strong">{node.text || (node.type === "frame" ? "Khung mới" : "Ảnh tham khảo")}</span>
    </button>;
}
