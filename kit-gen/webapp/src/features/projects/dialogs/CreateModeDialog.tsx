import * as React from "react";
import { Settings2, Sparkles } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { CTA, FLORA, SERIF } from "@/components/layout/flora";
import { BTN, TITLE, TITLE_N_TAIL, modeTags, type KitMode } from "@/features/kitfile";
import { useCreateProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail } from "../lib/feedback";
import { InlineError, OfflineNotice } from "./parts";
import { CanvasArt, WorkflowArt } from "./CreateModeArt";

const OPTIONS = [
  {
    id: "workflow", icon: Settings2, title: "Điền form, máy làm",
    body: "Trả lời vài câu về phong cách và số lượng. Máy vẽ cả bộ, bạn sửa lại sau.",
    fit: "Hợp khi: đã có brief", action: BTN.PICK_WORKFLOW, Art: WorkflowArt,
  },
  {
    id: "canvas", icon: Sparkles, title: "Tự tay xếp trên bàn",
    body: "Bàn trống, bạn tự gọi máy vẽ từng thứ rồi xếp lại theo ý mình.",
    fit: "Hợp khi: còn đang mò ý", action: BTN.PICK_CANVAS, Art: CanvasArt,
  },
] as const;

export function CreateModeDialog({ open, onOpenChange, gate, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gate: Gate;
  onCreated: (project: Project, mode: KitMode) => void;
}) {
  const create = useCreateProject();
  const [mode, setMode] = React.useState<KitMode>("workflow");
  const [failure, setFailure] = React.useState<unknown>(null);
  const workflowRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) { setMode("workflow"); setFailure(null); }
  }, [open]);

  const submit = async (picked: KitMode = mode) => {
    setFailure(null);
    try {
      const result = await create.mutateAsync({
        // Màn N không hỏi tên; W1 sẽ hỏi tên thật ở bước kế tiếp.
        name: picked === "workflow" ? "Bộ kit chưa đặt tên" : "Bàn làm việc chưa đặt tên",
        template: picked === "workflow" ? "basic" : "blank",
        firstVariant: { id: "phong-cach-1", vi: "Phong cách 1", bg: "magenta" },
        tags: modeTags(picked),
      });
      onOpenChange(false);
      onCreated(result.project, picked);
    } catch (error) {
      setFailure(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={create.isPending ? () => {} : onOpenChange}>
      <DialogContent
        size="xl"
        onEscapeKeyDown={(e) => create.isPending && e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          workflowRef.current?.focus();
        }}
      >
        <DialogHeader className="items-center text-center">
          <DialogTitle id="create-mode-title" className="text-display">
            {TITLE.N.lead} <em className={SERIF}>{TITLE.N.accent}</em> {TITLE_N_TAIL}
          </DialogTitle>
          <DialogDescription>Đổi kiểu sau cũng được.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5 p-6 sm:p-8">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}
          <RadioGroup
            aria-labelledby="create-mode-title"
            value={mode}
            onValueChange={(value) => setMode(value as KitMode)}
            disabled={create.isPending || gate.readOnly}
            className="grid gap-4 md:grid-cols-2"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !create.isPending && !gate.readOnly) {
                e.preventDefault();
                void submit();
              }
            }}
          >
            {OPTIONS.map((option) => {
              const selected = mode === option.id;
              const Icon = option.icon;
              return (
                <Label key={option.id} htmlFor={`new-${option.id}`} className={cn(
                  "flex min-h-[300px] cursor-pointer flex-col gap-5 border p-5 transition-colors",
                  FLORA.r20,
                  selected ? "border-line-strong bg-raised" : "border-line-subtle bg-surface hover:bg-raised",
                )}>
                  <span className="flex items-center gap-3">
                    <RadioGroupItem
                      ref={option.id === "workflow" ? workflowRef : undefined}
                      id={`new-${option.id}`}
                      value={option.id}
                      aria-describedby={`new-${option.id}-desc`}
                    />
                    <Icon className="size-5 text-fg-strong" aria-hidden />
                    <span className="text-subtitle text-fg-strong">{option.title}</span>
                  </span>
                  <span className="flex h-24 items-center justify-center rounded-3 border border-line-subtle bg-canvas p-3">
                    <option.Art />
                  </span>
                  {/* P-SWEEP·8 — dòng "Hợp khi: đã có brief" / "Hợp khi: còn đang mò ý"
                      ĐÃ BỎ. Ngay trên nó đã có một câu mô tả đầy đủ ("Trả lời vài câu
                      về phong cách và số lượng…"), và câu "hợp khi" chỉ diễn giải lại
                      cùng ý bằng chữ khác — hai câu cho một thẻ, cách nhau 8px (ảnh 06).
                      Hằng số `fit` vẫn còn trong `copy.ts` (chữ của UX-V3 §2, có cổng
                      quét từ cấm), chỉ thôi render. */}
                  <span id={`new-${option.id}-desc`} className="flex flex-1 flex-col gap-2 font-normal">
                    <span className="text-body text-fg">{option.body}</span>
                  </span>
                  <Button
                    className={option.id === "workflow" ? CTA : undefined}
                    variant={option.id === "workflow" ? "primary" : "secondary"}
                    loading={create.isPending && mode === option.id}
                    disabled={gate.readOnly || create.isPending}
                    title={gate.readOnly ? gate.reason : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setMode(option.id);
                      void submit(option.id);
                    }}
                  >
                    {option.action}
                  </Button>
                </Label>
              );
            })}
          </RadioGroup>
          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>Huỷ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
