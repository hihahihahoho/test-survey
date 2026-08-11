import * as React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema } from "@/features/docs/lib";
import { GenPopover } from "./GenPopover";
import { PackOverlay } from "./PackOverlay";
import { packItems } from "./lib/pack-model";

/**
 * STORY ĐỘC LẬP của hộp GEN + lớp phủ «Đóng gói» (FE3-PLAN §1 cấp
 * `features/gen/**` cho nhánh C).
 *
 * **KHÔNG sửa `routes/__preview.tsx`** — Q là chủ trang preview tổng và sẽ ghép
 * `<GenPreview />` vào sau. Đây là bài học ownership của B2 ở FE-1, lặp lại ở FE-2.
 *
 * Story dựng dữ liệu SẴN, không repo, không query ⇒ mọi ca hiện ra tất định, kể cả ca khó
 * dựng thật (chưa có ảnh nhân vật, đang có lượt vẽ, công cụ trên máy tắt).
 */
const BOARD = packItems(
  canvasDocSchema.parse({
    nodes: [
      { id: "mock-bg-1", type: "frame", x: 0, y: 0, w: 320, h: 420 },
      { id: "mock-pose-1", type: "frame", x: 0, y: 0, w: 420, h: 320 },
      { id: "note-1", type: "note", x: 0, y: 0, w: 200, h: 100, text: "nhớ đổi màu nền" },
      { id: "mock-element-1", type: "frame", x: 0, y: 0, w: 420, h: 320, bind: { kind: "sheet", id: "s1" } },
    ],
  }),
);

function Case({ title, note, children, height }: {
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
      <div
        style={height ? { height } : undefined}
        className="relative overflow-hidden rounded-3 border border-line-subtle bg-canvas p-4"
      >
        {children}
      </div>
    </section>
  );
}

/** Ghép vào preview tổng bằng: `import { GenPreview } from "@/features/gen/__preview__"`. */
export function GenPreview() {
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-8 p-6">
        <Case
          title="hộp GEN — bàn có 5 thứ, đã có ảnh nhân vật"
          note="Bấm để mở hai tầng: lưới 4 lệnh → panel điền. Nút Vẽ gửi yêu cầu tới local agent."
        >
          <GenPopover hasCharacterRef selectedComponentCount={4} boardItemCount={5} />
        </Case>

        <Case
          title="hộp GEN — CHƯA có ảnh nhân vật"
          note="Lệnh «Tư thế nhân vật» khoá, lý do hiện ngay dưới tên lệnh (không chỉ tooltip)."
        >
          <GenPopover hasCharacterRef={false} selectedComponentCount={0} boardItemCount={2} />
        </Case>

        <Case title="hộp GEN — bàn trống" note="«Cả bộ kit» khoá: chưa có gì để vẽ lại.">
          <GenPopover hasCharacterRef selectedComponentCount={0} boardItemCount={0} />
        </Case>

        <Case title="hộp GEN — công cụ trên máy chưa chạy" note="Nút mở khoá, có lý do đọc được.">
          <GenPopover hasCharacterRef selectedComponentCount={0} boardItemCount={3} agentOffline />
        </Case>

        <Case
          title="đóng gói — ca thường"
          note="Ghi chú bị khoá tick kèm lý do; thứ chưa vẽ mang nhãn «bản xem trước — chưa gọi máy vẽ»."
          height={520}
        >
          <PackOverlay items={BOARD} onPack={() => {}} onClose={() => {}} />
        </Case>

        <Case
          title="đóng gói — đang có tấm được vẽ"
          note="Dải vàng hiện TRƯỚC khi chuyển màn. Vẫn cho đi tiếp; tuyệt đối không tự huỷ lượt vẽ (C-01)."
          height={520}
        >
          <PackOverlay items={BOARD} runActive onPack={() => {}} onClose={() => {}} />
        </Case>

        <Case
          title="đóng gói — công cụ trên máy chưa chạy + lỗi lần trước"
          note="Nút khoá và NÓI RÕ lý do bằng chữ, không khoá im lặng."
          height={560}
        >
          <PackOverlay
            items={BOARD}
            agentOffline
            agentCommand="npm run agent"
            errorTitle="Chưa đóng gói được."
            onRetry={() => {}}
            onPack={() => {}}
            onClose={() => {}}
          />
        </Case>

        <Case title="đóng gói — bàn chưa có gì tick được" height={360}>
          <PackOverlay items={[]} onPack={() => {}} onClose={() => {}} />
        </Case>
      </div>
    </TooltipProvider>
  );
}
