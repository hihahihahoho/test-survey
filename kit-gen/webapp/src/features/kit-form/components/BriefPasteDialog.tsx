import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseBriefText } from "@/features/projects/lib/create-mode-brief";
import type { BriefReadResult } from "@/features/docs/lib/brief-read";
export function BriefPasteDialog({ open, onOpenChange, onApply }: { open: boolean; onOpenChange: (v: boolean) => void; onApply: (r: BriefReadResult, counts: { filled: number; unsure: number }) => void }) {
  const [raw, setRaw] = useState(""); const [error, setError] = useState<null | { title: string; hint: string; detail: string }>(null);
  const apply = () => { const out = parseBriefText(raw); if (!out.ok) return setError(out.error); onApply(out.result, { filled: out.summary.usableCount, unsure: out.summary.noteOnlyCount }); onOpenChange(false); setRaw(""); setError(null); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg"><DialogHeader><DialogTitle>Dán brief có cấu trúc</DialogTitle><DialogDescription>Dán brief dạng văn bản hoặc JSON. Các mục nhận diện được sẽ điền vào biểu mẫu; nội dung gốc vẫn nằm trong ô brief để bạn kiểm tra.</DialogDescription></DialogHeader><DialogBody className="grid gap-3"><Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-64 text-body" placeholder={`Ví dụ: Tên dự án: Tết 2026\nPhong cách: vui, màu ấm\nMón cần có: nút bắt đầu, thanh tiến độ…`} aria-invalid={!!error}/>{error && <div role="alert" className="rounded-2 border border-danger/60 bg-danger/10 p-3"><p className="text-body text-fg-strong">{error.title}</p><p className="text-caption text-fg">{error.hint}</p><details className="mt-2 text-caption text-fg-muted-raised"><summary>Chi tiết cho lập trình viên</summary><code>{error.detail}</code></details></div>}</DialogBody><DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Huỷ</Button><Button type="button" variant="primary" onClick={apply}>Điền vào biểu mẫu</Button></DialogFooter></DialogContent></Dialog>;
}
