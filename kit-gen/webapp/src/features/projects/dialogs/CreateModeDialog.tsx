import * as React from "react";
import { LayoutTemplate, Sparkles } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useCreateProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail } from "../lib/feedback";
import { InlineError, OfflineNotice } from "./parts";
import { modeTags, type KitMode } from "@/features/kitfile";

const OPTIONS = [
  { id: "workflow", icon: LayoutTemplate, title: "Điền form, máy làm", body: "Máy dựng bộ kit từ brief và lựa chọn của bạn." },
  { id: "canvas", icon: Sparkles, title: "Bàn làm việc trống", body: "Tự gọi máy vẽ từng phần rồi sắp xếp theo ý mình." },
] as const;

export function CreateModeDialog({ open, onOpenChange, gate, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; gate: Gate;
  onCreated: (project: Project, mode: KitMode) => void;
}) {
  const create = useCreateProject();
  const [name, setName] = React.useState("");
  const [mode, setMode] = React.useState<KitMode>("workflow");
  const [failure, setFailure] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setName(""); setMode("workflow"); setFailure(null); } }, [open]);

  const submit = async () => {
    if (!name.trim() || gate.readOnly || create.isPending) return;
    setFailure(null);
    try {
      const result = await create.mutateAsync({
        name: name.trim(), template: mode === "workflow" ? "basic" : "blank",
        firstVariant: { id: "phong-cach-1", vi: "Phong cách 1", bg: "magenta" }, tags: modeTags(mode),
      });
      onOpenChange(false); onCreated(result.project, mode);
    } catch (error) { setFailure(error); }
  };

  return <Dialog open={open} onOpenChange={create.isPending ? () => {} : onOpenChange}>
    <DialogContent size="sm" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
      <DialogHeader><DialogTitle>Tạo bộ kit mới</DialogTitle><DialogDescription>Đặt tên trước, cách làm có thể đổi sau.</DialogDescription></DialogHeader>
      <DialogBody className="space-y-5">
        {gate.readOnly && <OfflineNotice text={gate.longReason} />}
        <div className="space-y-2"><Label htmlFor="new-kit-name">Tên bộ kit</Label><Input ref={inputRef} id="new-kit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chợ Tết 2027" maxLength={120} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} /></div>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as KitMode)} className="grid gap-2">
          {OPTIONS.map((o) => { const Icon=o.icon; const selected=mode===o.id; return <Label key={o.id} htmlFor={`kit-mode-${o.id}`} className={cn("flex cursor-pointer items-start gap-3 rounded-3 border p-3.5", selected ? "border-line-strong bg-raised" : "border-line-subtle bg-surface hover:bg-raised")}>
            <RadioGroupItem id={`kit-mode-${o.id}`} value={o.id} className="mt-0.5"/><Icon className="mt-0.5 size-4 shrink-0" aria-hidden/><span><span className="block text-label text-fg-strong">{o.title}</span><span className="mt-0.5 block text-caption font-normal text-fg-muted-raised">{o.body}</span></span>
          </Label>; })}
        </RadioGroup>
        {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
      </DialogBody>
      <DialogFooter className="pt-2"><Button className="w-full" variant="primary" size="lg" loading={create.isPending} disabled={!name.trim() || gate.readOnly} onClick={() => void submit()}>{mode === "workflow" ? "Tạo và điền form" : "Tạo bàn làm việc"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
