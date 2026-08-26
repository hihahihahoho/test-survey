import * as React from "react";
import { MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKit } from "@/lib/hooks";
import { DemoScreenDialog } from "./DemoScreenDialog";

/**
 * CỬA RA THỨ BA ở header "Ảnh đã tạo", cạnh `Tải .zip` và `Copy sang Figma`.
 *
 * Cùng một điều kiện mở với hai nút kia — `useKit(projectId)` có file
 * (`KitExits.tsx:31-32`, `:72-73`) — và cùng một câu khoá, để ba cửa ra nói cùng một
 * giọng. Nhãn theo bảng wording của sitemap (`PRODUCT-SITEMAP.md:388-401`): **"Xem màn
 * demo"**, không dùng "preview"/"scene"/"mockup".
 */
export function DemoScreenButton({ projectId }: { projectId: string }) {
  const kit = useKit(projectId);
  const [open, setOpen] = React.useState(false);
  const files = kit.data?.files ?? [];
  const ready = files.length > 0;

  return (
    <>
      {/* `size="sm"` — cùng lý do với hai nút cạnh nó ở `KitExits.tsx`. */}
      <Button
        variant="secondary"
        size="sm"
        disabled={!ready}
        title={ready ? "Lắp thử một màn game từ ảnh đã cắt rồi copy sang Figma" : "Mở sau khi dự án có ảnh đã cắt"}
        onClick={() => setOpen(true)}
      >
        <MonitorPlay aria-hidden />Xem màn demo
      </Button>
      {/* Dựng dialog CHỈ khi mở: nó tải ảnh gốc (vài MB) ngay lúc mount. */}
      {open && <DemoScreenDialog open={open} onOpenChange={setOpen} projectId={projectId} />}
    </>
  );
}
