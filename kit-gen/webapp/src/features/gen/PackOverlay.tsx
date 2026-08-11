import * as React from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InlineBanner } from "@/components/common";
import { CARD, CTA, FLORA, SERIF } from "@/components/layout/flora";
import { BTN, EMPTY, MSG } from "@/features/kitfile";
import { cn } from "@/lib/utils";
import { PackList } from "./panels/PackList";
import {
  PACK_WHILE_RUNNING,
  packSummary,
  selectAllPackable,
  toggleSelection,
  type PackItem,
} from "./lib/pack-model";

/**
 * C2 — «Chọn những thứ muốn đưa vào bộ kit» (UX-V3 §4.2).
 *
 * LỚP PHỦ MỎNG TRÊN C1, không rời màn: user vẫn thấy bàn của mình phía sau. Vì vậy nó
 * **không** phải một route riêng và **không** dùng `Dialog` toàn màn — nó là một lớp
 * `absolute` trong khung canvas, nền `overlay` + blur (đúng ngôn ngữ FLORA: thanh/panel
 * nổi có backdrop blur).
 *
 * ══ HAI ĐIỀU KHÔNG ĐƯỢC PHÉP SAI ══
 * 1. **FE tuyệt đối không tự huỷ lượt vẽ** (C-01, BA-V3 §3.4). Đang có lượt vẽ ⇒ hiện
 *    dải vàng **trước** khi chuyển màn và **vẫn cho đi tiếp**. Không có nút huỷ, không có
 *    lời gọi huỷ nào trong file này — có test khẳng định.
 * 2. **Ghi chú không đóng gói được**, tick bị khoá kèm lý do đọc được (`pack-model`).
 *
 * A11y: `role="dialog"` + `aria-modal` + `aria-labelledby`; Esc đóng; focus vào tiêu đề
 * khi mở và trả về nút mở khi đóng (chỗ gọi lo việc trả focus — xem `CanvasPackLayer`).
 */
export interface PackOverlayProps {
  items: readonly PackItem[];
  /** Có lượt vẽ đang chạy không — chỉ để hiện cảnh báo, KHÔNG để chặn. */
  runActive?: boolean;
  /** Công cụ trên máy chưa chạy ⇒ khoá nút đóng gói, có lý do (UX-V3 §6 hàng C2). */
  agentOffline?: boolean;
  /**
   * Lý do khác khiến chưa đóng gói được (ví dụ: màn kết quả chưa được nối dây).
   * Có chuỗi ⇒ nút khoá và **hiện đúng câu này**, không khoá im lặng.
   */
  disabledReason?: string;
  agentCommand?: string;
  /** Lỗi lần đóng gói trước. Câu đời thường, KHÔNG phải `error.message`. */
  errorTitle?: string;
  onRetry?: () => void;
  /** Đóng gói: chỗ gọi điều hướng sang W3 với bộ lọc = tập id này. */
  onPack: (ids: string[]) => void;
  onClose: () => void;
}

export function PackOverlay(props: PackOverlayProps) {
  const { items, runActive, agentOffline, agentCommand, disabledReason, errorTitle, onRetry, onPack, onClose } = props;
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => selectAllPackable(items));
  const titleId = React.useId();
  const headRef = React.useRef<HTMLHeadingElement | null>(null);

  React.useEffect(() => {
    headRef.current?.focus();
  }, []);

  const sum = packSummary(items, selected);
  const packable = items.filter((i) => i.selectable);

  /** Một chỗ duy nhất quyết định nút mint có bấm được không — và LÝ DO khi không. */
  const blockedReason = agentOffline
    ? "Công cụ trên máy chưa chạy nên chưa đóng gói được."
    : (disabledReason ?? "");
  const blocked = blockedReason !== "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="pack-overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className={cn("absolute inset-0 z-40 flex flex-col", FLORA.overlay)}
    >
      <header className={cn("flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4", FLORA.hair)}>
        <h2 id={titleId} ref={headRef} tabIndex={-1} className="text-title text-fg-strong outline-none">
          Chọn những thứ muốn đưa vào <em className={SERIF}>bộ kit</em>
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {BTN.EXIT}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {agentOffline && (
          <InlineBanner
            tone="warning"
            title={MSG.AGENT_OFF_TITLE}
            description={
              <span>
                {MSG.AGENT_OFF_BODY} {agentCommand ? <code>{agentCommand}</code> : null}
              </span>
            }
          />
        )}

        {/* Dải vàng của BA-V3 §3.4 — hiện TRƯỚC khi chuyển màn, KHÔNG chặn, KHÔNG huỷ. */}
        {runActive && <InlineBanner tone="warning" title="Đang có tấm được vẽ" description={PACK_WHILE_RUNNING} />}

        {errorTitle && (
          <InlineBanner
            tone="danger"
            title={errorTitle}
            actions={
              onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry}>
                  {BTN.RETRY}
                </Button>
              )
            }
          />
        )}

        {packable.length === 0 ? (
          <div className={cn("flex flex-col items-center gap-2 px-6 py-10 text-center", CARD)}>
            <h3 className="text-subtitle text-fg-strong">{EMPTY.c2.title}</h3>
            <p className="max-w-[46ch] text-body text-fg">{EMPTY.c2.body}</p>
          </div>
        ) : (
          <PackList
            items={items}
            selected={selected}
            onToggle={(id) => setSelected((s) => toggleSelection(s, id))}
            previewBadge={MSG.GEN_MOCK_BADGE}
          />
        )}
      </div>

      <Separator />

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body text-fg-strong">{sum.line || EMPTY.c2.body}</span>
          {sum.undrawnNote !== "" && (
            <span className="text-caption text-fg-muted-raised">{sum.undrawnNote}</span>
          )}
          {/* Khoá thì phải NÓI RA ngay cạnh nút, không giấu trong tooltip. */}
          {blocked && <span className="text-caption text-warn">{blockedReason}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {BTN.CANCEL}
          </Button>
          {/* Nút phát sáng duy nhất của lớp phủ C2. */}
          <Button
            size="sm"
            className={cn(CTA)}
            disabled={!sum.canPack || blocked}
            aria-label={blocked ? `${BTN.PACK_CONFIRM} — ${blockedReason}` : BTN.PACK_CONFIRM}
            onClick={() => onPack([...selected].filter((id) => packable.some((i) => i.id === id)))}
          >
            {BTN.PACK_CONFIRM}
          </Button>
        </div>
      </footer>
    </div>
  );
}
