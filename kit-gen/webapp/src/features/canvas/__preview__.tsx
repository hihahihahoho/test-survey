import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema, type CanvasDoc, type DraftBadge } from "@/features/docs/lib";
import { CanvasShell } from "./components/CanvasShell";
import type { CanvasPhase, CanvasSaveState } from "./lib/canvas-state";

/**
 * STORY ĐỘC LẬP của khung bàn làm việc (FE2-PLAN §1 cấp `features/canvas/__preview__.tsx`).
 * **KHÔNG sửa `routes/__preview.tsx`** — Q là chủ trang preview tổng và sẽ ghép
 * `<CanvasPreview />` vào sau. Đây chính là bài học ownership của B2 ở FE-1.
 *
 * Story dựng dữ liệu SẴN, không repo, không query ⇒ mọi trạng thái hiện ra tất định,
 * kể cả những ca khó dựng thật (quá hạn 20s, kho lưu bị chặn, agent tắt).
 * Runtime của app vẫn đi qua `CanvasFileView → useCanvasDoc → docsRepo`.
 */
const LOCAL: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "Bàn làm việc này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};
const NO_STORAGE: DraftBadge = {
  level: "warn", label: "không lưu được", tone: "amber",
  explain: "Trình duyệt đang không cho lưu trên máy này, nên thay đổi của bạn sẽ mất khi đóng tab.",
};

const EMPTY_CANVAS: CanvasDoc = canvasDocSchema.parse({});

/**
 * `height` đổi được vì C1 phải trưng ĐÚNG ca gây lỗi: khung thấp. Mặc định 384px (h-96)
 * là khung THẤP HƠN ngưỡng 520px ⇒ story mặc định hiện thẻ **thu gọn**; ca «khung cao»
 * bên dưới dựng 640px để so hai dạng cạnh nhau.
 */
function Case({
  title, note, children, height = 384,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-label text-fg-strong">{title}</h3>
        {note && <p className="text-caption text-fg-muted-raised">{note}</p>}
      </div>
      <div style={{ height }} className="flex overflow-hidden rounded-3 border border-line-subtle">
        {children}
      </div>
    </section>
  );
}

function Shell(over: Partial<React.ComponentProps<typeof CanvasShell>> = {}) {
  const base: React.ComponentProps<typeof CanvasShell> = {
    docName: "Bàn ý tưởng Tết",
    phase: "empty" as CanvasPhase,
    canvas: EMPTY_CANVAS,
    errorTitle: "",
    onRetry: () => {},
    saveState: "idle" as CanvasSaveState,
    badge: LOCAL,
  };
  return <CanvasShell {...base} {...over} />;
}

/** Ghép vào preview tổng bằng: `import { CanvasPreview } from "@/features/canvas/__preview__"`. */
export function CanvasPreview() {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8 p-6">
        <Case
          title="empty · khung CAO (≥520px) — thẻ đầy đủ, ba tầng tách bạch"
          note="Ca chính của C1: thẻ «Bàn còn trống» căn giữa VÙNG AN TOÀN (khung trừ 160px đáy), dải trạng thái ở hàng riêng bottom-88px, thanh nổi bottom-16px. Không tầng nào đè tầng nào."
          height={640}
        >
          {Shell()}
        </Case>

        <Case
          title="empty · khung THẤP (<520px) — thẻ tự thu gọn, vẫn không tràn"
          note="Bỏ dòng gợi ý, giữ tiêu đề + 1 câu. Đây là ca mà bản cũ vỡ: thẻ tràn xuống đè floatbar và chữ trạng thái rơi vào thân thẻ."
        >
          {Shell()}
        </Case>

        <Case title="loading — skeleton, không spinner giữa màn">{Shell({ phase: "loading" })}</Case>

        <Case title="timeout — quá 20 giây, đổi sang lối có [Thử lại]">
          {Shell({ phase: "timeout" })}
        </Case>

        <Case
          title="error — câu đời thường, mã lỗi gập trong «Chi tiết cho lập trình viên»"
          note="Thân UI không bao giờ chứa chuỗi kỹ thuật."
        >
          {Shell({
            phase: "error",
            errorTitle: "Nội dung file lưu trên máy bị hỏng nên không mở được. Bản gốc trong dự án không bị ảnh hưởng.",
            errorDetail: "DOC_BROKEN: canvas f-y-tuong-tet lệch schema",
            onOpenWorkflow: () => {},
          })}
        </Case>

        <Case
          title="success/ready — đã có nội dung (dựng sẵn cho FE-3)"
          note="FE-2 chưa vẽ node; ca này chứng minh khung nhìn và nút «vừa khít tất cả» bật lên khi bbox khác rỗng."
        >
          {Shell({
            phase: "ready",
            canvas: canvasDocSchema.parse({
              nodes: [{ id: "n1", type: "note", x: 40, y: 40, w: 220, h: 120, z: 0, text: "" }],
              viewport: { x: 0, y: 0, k: 1 },
            }),
            saveState: "saved",
          })}
        </Case>

        <Case title="agent chưa chạy — vẫn xem và kéo được, không khoá màn">
          {Shell({ agentOffline: true, agentCommand: "npx kitgen agent" })}
        </Case>

        <Case title="kho lưu bị chặn + ghi hỏng — badge cảnh báo và dòng trạng thái khẩn">
          {Shell({ badge: NO_STORAGE, saveState: "error" })}
        </Case>
      </div>
    </TooltipProvider>
  );
}
