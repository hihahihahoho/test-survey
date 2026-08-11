import * as React from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseDocsLink } from "../lib/anchors";
import { docEntry } from "../lib/catalog";
import { ErrorDocsDialog } from "./ErrorDocsDialog";

/**
 * NÚT [Xem hướng dẫn] cho một lỗi — dùng ở bất kỳ đâu có `error`.
 *
 * Nó giải đúng bài toán mà brief nêu: *"để link trong envelope lỗi dẫn tới nơi có thật"*.
 * Cách lấy mã, theo thứ tự:
 *   1. `error.docs` (agent tự khai, dạng `/docs/errors#contract-conflict`) → chính xác nhất
 *   2. `error.code`
 * Không ra mã nào ⇒ component KHÔNG render gì. Thà không có nút hơn là có một nút mở ra
 * trang trống — nút chết cũng là một cách "thao tác không phản hồi" mà §3.9 cấm.
 *
 * Mã có nhưng chưa có mục giải thích: VẪN render (panel sẽ nói thật là chưa có mục và chỉ
 * cách xử lý chung) — §6.5-6 "mã lạ không được làm vỡ UI".
 */
export function HelpLink({
  error,
  code,
  label = "Xem hướng dẫn",
  variant = "secondary",
  size = "sm",
}: {
  /** Đối tượng lỗi từ `AgentError` / envelope. */
  error?: unknown;
  /** Hoặc truyền thẳng mã, khi chỗ gọi đã biết. */
  code?: string | null;
  label?: string;
  variant?: "secondary" | "ghost" | "link";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = React.useState(false);
  const resolved = code ?? codeOf(error);
  if (!resolved) return null;

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <BookOpen aria-hidden />
        {label}
      </Button>
      <ErrorDocsDialog open={open} onOpenChange={setOpen} code={resolved} />
    </>
  );
}

/** `docs` trước, rồi `code`. Xuất ra để test và để chỗ khác dùng lại. */
export function codeOf(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  const inner = (e.error && typeof e.error === "object" ? e.error : e) as Record<string, unknown>;
  const fromDocs = parseDocsLink(inner.docs);
  if (fromDocs) return fromDocs;
  const c = typeof inner.code === "string" ? inner.code : null;
  if (!c) return null;
  // Trả cả mã chưa có mục: panel tự xử lý ca đó (§6.5-6).
  return docEntry(c)?.code ?? c;
}
