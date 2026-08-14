import * as React from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { ItemPrompt } from "../lib/item-prompt";

/**
 * PANEL CHI TIẾT CỦA MỘT Ô — dùng chung cho bộ khung UI và dáng mascot.
 *
 * Ba vùng, đúng thứ tự người ta hỏi: *nó là gì* (header) → *sửa được gì* (children)
 * → *prompt nào sẽ được gửi đi* (`ItemPromptBlock`). Prompt nằm CUỐI và CHỈ ĐỌC vì nó
 * là **hệ quả** của hai vùng trên, không phải một ô nhập thứ ba.
 *
 * Hàng nút do nơi gọi truyền vào (`footer`) — panel không tự biết luật lưu của màn.
 */
export function ItemDetailDialog({
  open, onOpenChange, title, description, prompt, promptEmptyReason, footer, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  prompt: ItemPrompt | null;
  /** Câu giải thích khi ô chưa có trong bản thiết kế (chưa chọn, mascot đang tắt…). */
  promptEmptyReason: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[min(46rem,calc(100dvh-2rem))]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-6">
          {children}
          <ItemPromptBlock prompt={prompt} emptyReason={promptEmptyReason} />
        </DialogBody>
        <DialogFooter className="border-t border-line-subtle">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Prompt CHỈ ĐỌC của một ô. Nguồn: `lib/item-prompt.ts` — rút từ chính contract sẽ được
 * gửi đi, không phải một bản dựng lại song song. Xem chú thích đầu file đó.
 */
export function ItemPromptBlock({ prompt, emptyReason }: { prompt: ItemPrompt | null; emptyReason: string }) {
  const copy = () => {
    if (!prompt) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(prompt.text);
        toast.success("Đã sao chép prompt");
      } catch {
        toast.error("Trình duyệt không cho sao chép", { description: "Bạn có thể bôi đen đoạn prompt rồi copy tay." });
      }
    })();
  };
  return (
    <section aria-label="Prompt sẽ gửi đi" className="rounded-3 border border-line-subtle bg-raised p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-label text-fg-strong">Prompt sẽ gửi đi</p>
          <p className="text-caption text-fg-muted">
            {prompt
              ? `Tấm ${prompt.sheetId} · ô ${prompt.cellNumber}/${prompt.grid.cols * prompt.grid.rows} · ${prompt.cellHint}`
              : "Chưa có trong bản thiết kế"}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={!prompt} onClick={copy}>
          <Copy aria-hidden />Sao chép
        </Button>
      </div>
      {prompt
        ? <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-2 bg-canvas p-3 text-caption text-fg">{prompt.text}</pre>
        : <p className="text-body text-fg-muted">{emptyReason}</p>}
    </section>
  );
}

/**
 * HAI Ô KÍCH THƯỚC của một ô skeleton, tính theo **phần trăm cạnh ô** — cùng đơn vị với
 * `skel.w/h` trong contract (0–1), chỉ đổi cách hiện cho người đọc.
 *
 * Ô trống ⇒ dùng số của thư viện chung, và `placeholder` nói rõ số đó là bao nhiêu. Đây
 * là lý do không điền sẵn giá trị mặc định vào ô: điền sẵn thì không phân biệt được
 * "đang theo thư viện" với "đã chốt đúng bằng số của thư viện".
 *
 * NÓ CHỈ SỐNG TRONG POPUP. Bản trước còn một hình thái `compact` để nhét hai ô này
 * xuống dưới từng thẻ của lưới 42 món; hình thái đó bị bỏ cùng với bức tường control mà
 * chủ sản phẩm bác ("ĐỪNG LỘ RA NGOÀI"). Không còn `compact`/`itemLabel` nghĩa là không
 * còn đường nào dựng lại bức tường ấy mà không phải sửa chính component này.
 */
export function SkelSizeFields({
  idPrefix, w, h, defaults, onChange, disabled = false, className,
}: {
  idPrefix: string;
  w: number | undefined;
  h: number | undefined;
  defaults: { w: number; h: number };
  onChange: (patch: { w?: number | null; h?: number | null }) => void;
  disabled?: boolean;
  className?: string;
}) {
  const pct = (value: number | undefined) => (value === undefined ? "" : String(Math.round(value * 100)));
  const emit = (side: "w" | "h", raw: string) => {
    if (raw.trim() === "") { onChange({ [side]: null } as { w?: null; h?: null }); return; }
    const number = Number(raw);
    if (!Number.isFinite(number)) return;
    onChange({ [side]: Math.min(100, Math.max(5, Math.round(number))) / 100 } as { w?: number; h?: number });
  };
  return (
    <div className={cn("flex items-end gap-2", className)}>
      {(["w", "h"] as const).map((side) => (
        <div key={side} className="min-w-0 flex-1">
          <Label htmlFor={`${idPrefix}-${side}`}>{side === "w" ? "Rộng %" : "Cao %"}</Label>
          <Input
            id={`${idPrefix}-${side}`}
            type="number"
            inputMode="numeric"
            min={5}
            max={100}
            step={1}
            disabled={disabled}
            value={pct(side === "w" ? w : h)}
            placeholder={String(Math.round((side === "w" ? defaults.w : defaults.h) * 100))}
            onChange={(event) => emit(side, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
