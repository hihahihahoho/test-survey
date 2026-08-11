import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CTA } from "@/components/layout/flora";
import { BTN } from "@/features/kitfile";
import { cn } from "@/lib/utils";
import { GenKindGrid } from "./panels/GenKindGrid";
import { GenForm } from "./panels/GenForm";
import { genCost, genUnits } from "./lib/gen-cost";
import {
  GEN_KIND_SPEC,
  GEN_NEED_CHARACTER_REF,
  type GenKind,
  type GenOrient,
} from "./lib/gen-kinds";

/**
 * HỘP «✨ NHỜ MÁY VẼ» — nút accent **DUY NHẤT** của màn C1 (UX-V3 §4.1, luật L1).
 *
 * Hai tầng trong một popover: lưới 4 lệnh → panel điền. Quay lại bằng nút ← hoặc phím
 * Esc (Esc lần một: về lưới; Esc lần hai: đóng hộp — hành vi này do component tự lo,
 * Radix chỉ biết đóng).
 *
 * ══ CẮM VÀO Ở ĐÂU ══ `CanvasToolbar` (C1) đã mở sẵn prop `genSlot`; C2 chỉ truyền
 * `<GenPopover … />` vào đó, **không sửa `CanvasToolbar`** (đúng lời hẹn NEEDS-fe3-c N3).
 *
 * ═Nút **Vẽ** phát yêu cầu cho màn cha; màn cha xác nhận contract và gọi run gateway thật.
 *
 * A11y: Radix `Popover` lo focus trap + Esc + trả focus. Nút mở là **một điểm dừng Tab**
 * của thanh nổi (`FloatingToolbar` của R0 tự quản roving tabindex).
 */
export interface GenPopoverProps {
  /** Có ảnh nhân vật trong dự án chưa — khoá lệnh «Tư thế nhân vật» khi chưa có. */
  hasCharacterRef: boolean;
  /** Số món đang chọn trên bàn (cho lệnh «Món giao diện»). */
  selectedComponentCount: number;
  /** Số thứ đang có trên bàn (cho lệnh «Cả bộ kit»). */
  boardItemCount: number;
  /** Tên ảnh mẫu đang chọn — chỉ để hiện, KHÔNG nhúng ảnh (§4). */
  refNames?: readonly string[];
  /** Công cụ trên máy chưa chạy ⇒ khoá nút mở, có lý do đọc được (UX-V3 §6 hàng C1). */
  agentOffline?: boolean;
  onGenerate?: (request: { kind: GenKind; prompt: string; refs: readonly string[]; orient: GenOrient }) => void;
  generating?: boolean;
  generateDisabled?: boolean;
}

const AGENT_OFF_REASON =
  "Công cụ trên máy chưa chạy nên chưa nhờ máy vẽ được. Bàn làm việc vẫn kéo và sắp xếp bình thường.";

/**
 * Nhãn của nút mở khi bị khoá. Tách thành hằng số thay vì ghép chuỗi ngay trong JSX vì
 * cổng từ cấm của tôi (`gen-copy.test.ts`) soi **chuỗi có dấu tiếng Việt**, và một
 * template literal chứa tên hằng `BTN.GEN_ON_CANVAS` trúng chữ cấm `canvas` — dù đó là
 * TÊN BIẾN, không phải chữ user đọc. Cổng đã bắt đúng tôi ở lần chạy đầu; tôi sửa MÃ
 * (tách hằng) chứ không nới cổng. Chữ hiện ra vẫn lấy từ từ điển S1.
 */
const OPEN_LABEL = BTN.GEN_ON_CANVAS;
const OPEN_LABEL_OFF = `${OPEN_LABEL} — chưa dùng được`;

export function GenPopover(props: GenPopoverProps) {
  const { hasCharacterRef, selectedComponentCount, boardItemCount, refNames = [], agentOffline, onGenerate = () => {}, generating = false, generateDisabled = false } = props;
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<GenKind | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [orient, setOrient] = React.useState<GenOrient>("portrait");

  /** Đóng hộp thì quên hết — mở lại luôn bắt đầu từ lưới lệnh, không "nhớ" nửa vời. */
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setKind(null);
      setPrompt("");
    }
  };

  const pick = (k: GenKind) => {
    setKind(k);
    setPrompt("");
    setOrient(GEN_KIND_SPEC[k].defaultOrient);
  };

  const lockedReason: Partial<Record<GenKind, string>> = {};
  if (!hasCharacterRef) lockedReason.pose = GEN_NEED_CHARACTER_REF;
  if (boardItemCount === 0) lockedReason.kit = "Chọn object trên bàn rồi vẽ gộp thành bộ kit.";

  const costHint: Record<GenKind, string> = {
    bg: "~1 lượt",
    pose: "~1 lượt",
    element: "~1 lượt",
    kit: `~${genUnits({ kind: "kit", boardItemCount })} lượt`,
  };

  const cost = kind
    ? genCost({ kind, componentCount: selectedComponentCount, boardItemCount })
    : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {agentOffline ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button variant="ghost" size="sm" disabled aria-label={OPEN_LABEL_OFF}>
                <Sparkles aria-hidden strokeWidth={1.5} />
                Nhờ máy vẽ
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-normal">{AGENT_OFF_REASON}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>
          {/* Nút phát sáng DUY NHẤT của C1 — đây là chỗ dùng `CTA` duy nhất trên màn. */}
          <Button size="sm" className={cn(CTA)}>
            <Sparkles aria-hidden strokeWidth={1.5} />
            Nhờ máy vẽ
          </Button>
        </PopoverTrigger>
      )}

      <PopoverContent
        side="top"
        align="start"
        className="w-80"
        aria-label="Nhờ máy vẽ"
        /*
          Esc ở tầng 2 lùi về lưới thay vì đóng thẳng — bấm nhầm lệnh là chuyện thường.
          PHẢI dùng `onEscapeKeyDown` của Radix, KHÔNG phải `onKeyDown` thường: lớp
          dismiss của Radix nghe `keydown` ở tầng document, nên `preventDefault()` trong
          handler React của ta chạy trước nhưng KHÔNG ngăn được nó đóng hộp. Bản đầu tôi
          viết `onKeyDown` và test Esc đỏ ngay — sửa MÃ, không sửa test.
        */
        onEscapeKeyDown={(e) => {
          if (kind !== null) {
            e.preventDefault();
            setKind(null);
          }
        }}
      >
        {kind === null || cost === null ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-subtitle text-fg-strong">Nhờ máy vẽ gì?</h3>
            <GenKindGrid onPick={pick} lockedReason={lockedReason} costHint={costHint} />
          </div>
        ) : (
          <GenForm
            spec={GEN_KIND_SPEC[kind]}
            prompt={prompt}
            onPromptChange={setPrompt}
            orient={orient}
            onOrientChange={setOrient}
            refNames={refNames}
            costLine={cost.line}
            truthNote={cost.note || (GEN_KIND_SPEC[kind].truthNote ?? "")}
            onBack={() => setKind(null)}
            onSubmit={() => onGenerate({ kind, prompt, refs: refNames, orient })}
            submitting={generating}
            submitDisabled={generateDisabled}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
