import * as React from "react";
import { Copy, Maximize2, Minus, Package, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatingToolbar } from "@/components/common";
import { MAX_K, MIN_K, type UseViewportResult } from "@/lib/viewport";
import { SoonAction } from "./SoonAction";
import { toast } from "@/components/ui/sonner";

/**
 * THANH CÔNG CỤ NỔI của bàn làm việc — dùng `FloatingToolbar` của R0 (FE-1·B2),
 * KHÔNG tự dựng thanh thứ hai. R0 lo: pill 999px, hairline, blur có 2 đường lùi,
 * và vòng di chuyển bàn phím APG (một điểm dừng Tab, ←/→/Home/End, bỏ qua nút khoá).
 * Việc của file này chỉ là chọn ĐÚNG món và nối vào `useViewport`.
 *
 * Bốn món zoom là toàn bộ những gì FE-2 được phép làm chạy thật (§3-D1: «zoom −/+/100%/fit»).
 * Mọi công cụ soạn thảo là của FE-3 ⇒ nằm ở rail, disabled, có lý do.
 *
 * ══ ĐỔI Ở C1 (UX-V3 §4.1) ══
 * Thanh nổi nay mang ĐÚNG bốn cụm của wireframe: **✨ Nhờ máy vẽ** · zoom · **⧉ Copy sang
 * Figma** · **📦 Đóng gói**. Thẻ empty chỉ tay xuống «✨ Nhờ máy vẽ ở thanh dưới», nên món
 * đó BẮT BUỘC phải nhìn thấy ở đây — nếu không, câu chữ trỏ vào hư không.
 *
 * ⚠️ TRUNG THỰC VỀ PHẠM VI: hộp GEN thật (`GenPopover`, nút accent) là việc của **C2**
 * (`features/gen/**`, ngoài glob C1). C1 chỉ mở **chỗ cắm** `genSlot` và điền tạm một nút
 * KHOÁ có lý do. Vì thế lúc này trên màn C1 **chưa có nút accent nào** — L1 («đúng ≤1 chỗ
 * dùng `CTA`») vẫn đúng, nhưng theo hướng thiếu chứ không thừa. Ghi rõ: `NEEDS-fe3-c.md` N3.
 */
export interface CanvasToolbarProps {
  vp: UseViewportResult;
  /** `false` khi canvas rỗng ⇒ «vừa khít tất cả» không có gì để fit. */
  canFit: boolean;
  /** Slot trái (rail thu gọn cho màn hẹp). */
  left?: React.ReactNode;
  /**
   * CHỖ CẮM của hộp GEN — C2 truyền `<GenPopover />` vào đây, không phải sửa file này.
   * Bỏ trống ⇒ hiện nút khoá có lý do, KHÔNG bao giờ hiện thanh thiếu món.
   */
  genSlot?: React.ReactNode;
  /**
   * Mở lớp phủ «Đóng gói» (C2). Bỏ trống ⇒ giữ nút khoá có lý do — thanh không bao giờ
   * thiếu món, và cũng không bao giờ có nút bấm vào chẳng làm gì.
   */
  onPack?: () => void;
  canCopy?: boolean;
}

export function CanvasToolbar({ vp, canFit, left, genSlot, onPack, canCopy = false }: CanvasToolbarProps) {
  const { zoomPercent } = vp;

  return (
    <FloatingToolbar
      aria-label="Công cụ bàn làm việc"
      left={
        <>
          {left}
          {genSlot ?? (
            <SoonAction
              icon={Sparkles}
              label="Nhờ máy vẽ"
              reason="Hộp nhờ máy vẽ đang được dựng ở bản cập nhật sau. Bàn làm việc vẫn kéo và phóng to bình thường."
            />
          )}
        </>
      }
      center={
        <>
          <ToolButton
            label="Thu nhỏ"
            hint="Thu nhỏ (⌘−)"
            icon={Minus}
            onClick={() => vp.zoomBy(1 / 1.2)}
            disabled={vp.viewport.k <= MIN_K + 1e-6}
          />
          {/*
            Nút, không phải chữ trơ: bấm là về 100%. `tabular-nums` để con số không
            làm thanh giật khi đổi từ 100% sang 25%.
          */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={vp.actualSize}
                aria-label={`Mức phóng ${zoomPercent} phần trăm. Bấm để về 100%.`}
                className="min-w-14 tabular-nums"
              >
                {zoomPercent}%
              </Button>
            </TooltipTrigger>
            <TooltipContent>Về 100% (⌘0)</TooltipContent>
          </Tooltip>
          <ToolButton
            label="Phóng to"
            hint="Phóng to (⌘+)"
            icon={Plus}
            onClick={() => vp.zoomBy(1.2)}
            disabled={vp.viewport.k >= MAX_K - 1e-6}
          />
          <ToolButton
            label="Xem vừa khít tất cả"
            hint={canFit ? "Vừa khít tất cả (⌘1)" : "Chưa có gì trên bàn làm việc"}
            icon={Maximize2}
            onClick={vp.fitAll}
            disabled={!canFit}
          />
        </>
      }
      right={
        <>
          {canCopy ? <Button variant="ghost" size="sm" /* P-SWEEP·5 — một dòng là đủ; dòng mô tả thứ hai chỉ làm toast cao thêm và
                 đè xuống chính thanh công cụ này (ảnh 25). */
              onClick={() => toast.info("Copy sang Figma sẽ mở ở bản cập nhật sau.")}><Copy aria-hidden strokeWidth={1.5} />Copy sang Figma</Button> : <SoonAction icon={Copy} label="Copy sang Figma" reason="Thêm nội dung vào bàn để bật thao tác này." />}
          {onPack ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={onPack}>
                  <Package aria-hidden strokeWidth={1.5} />
                  Đóng gói
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-normal">
                Chọn những thứ trên bàn để đưa vào bộ kit.
              </TooltipContent>
            </Tooltip>
          ) : (
            <SoonAction
              icon={Package}
              label="Đóng gói"
              reason="Đóng những thứ trên bàn thành một bộ kit sẽ mở ở bản cập nhật sau."
            />
          )}
        </>
      }
    />
  );
}

function ToolButton({
  label, hint, icon: Icon, onClick, disabled,
}: {
  label: string;
  hint: string;
  icon: typeof Plus;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      {/*
        `span` bọc: nút `disabled` không phát pointer event nên Radix Tooltip sẽ không
        bao giờ mở — mà lý do khoá lại đúng là thứ người dùng cần đọc nhất.
      */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
            <Icon aria-hidden strokeWidth={1.5} />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
