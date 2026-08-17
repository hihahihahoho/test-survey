import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail } from "../lib/feedback";
import { InlineError, OfflineNotice } from "./parts";
import { modeTags, type KitMode } from "@/features/kitfile";

export function CreateModeDialog({ open, onOpenChange, gate, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; gate: Gate;
  onCreated: (project: Project, mode: KitMode) => void;
}) {
  const create = useCreateProject();
  const [name, setName] = React.useState("");
  const [failure, setFailure] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setName(""); setFailure(null); } }, [open]);

  const submit = async () => {
    if (!name.trim() || gate.readOnly || create.isPending) return;
    setFailure(null);
    try {
      const result = await create.mutateAsync({
        // Wizard là nơi người dùng chọn bộ khung đầu tiên. Khởi tạo bằng template
        // mẫu sẽ khiến dữ liệu mẫu bị hiểu nhầm là một thiết kế nhập từ bên ngoài.
        name: name.trim(), template: "blank",
        firstVariant: { id: "phong-cach-1", vi: "Phong cách 1", bg: "magenta" }, tags: modeTags("workflow"),
      });
      onOpenChange(false); onCreated(result.project, "workflow");
    } catch (error) { setFailure(error); }
  };

  return <Dialog open={open} onOpenChange={create.isPending ? () => {} : onOpenChange}>
    <DialogContent size="sm" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
      <DialogHeader><DialogTitle>Tạo dự án</DialogTitle><DialogDescription>Đặt tên trước, sau đó điền yêu cầu theo từng bước.</DialogDescription></DialogHeader>
      <DialogBody className="space-y-5">
        {gate.readOnly && <OfflineNotice text={gate.longReason} />}
        <div className="space-y-2"><Label htmlFor="new-project-name">Tên dự án</Label><Input ref={inputRef} id="new-project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Chợ Tết 2027" maxLength={120} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} /></div>
        <div className="flex items-start gap-3 rounded-3 border border-line-subtle bg-raised p-3.5">
          <LayoutTemplate className="mt-0.5 size-4 shrink-0" aria-hidden />
          {/* "Wizard" là chữ của lập trình viên, không phải của người dùng — và ở ngay
              dưới tiêu đề "Tạo dự án" thì một cái nhãn "Trình tạo dự án" chỉ nói lại
              đúng câu vừa đọc. Cái thẻ này liệt kê các bước sẽ đi qua, nên nó tự gọi
              đúng tên mình là như vậy. */}
          <span><span className="block text-label text-fg-strong">Các bước tiếp theo</span><span className="mt-0.5 block text-caption text-fg-muted">Yêu cầu, phong cách, bộ khung UI, mascot và ảnh.</span></span>
        </div>
        {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
      </DialogBody>
      <DialogFooter className="pt-2"><Button className="w-full" variant="primary" size="lg" loading={create.isPending} disabled={!name.trim() || gate.readOnly} onClick={() => void submit()}>Tiếp tục</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
