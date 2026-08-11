import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "@/components/layout/flora";
import { STEPS, stepIndex, type WizardStep } from "../lib/steps";

/**
 * Stepper 4 bước của S0 (§3-S0): `①━②──③──④` **CÓ NHÃN CHỮ**, không chỉ số trơn.
 * Bước đã qua có ✓ và **bấm lùi được**; bước chưa tới thì `disabled` + nói rõ lý do.
 *
 * VỎ FLORA (brief mục 2 "stepper MẢNH HƠN theo kiểu FLORA"):
 *  · bỏ viền + nền pill quanh MỌI bước — chỉ bước hiện tại có nền mờ rất nhẹ.
 *  · số bước là chấm/số nhỏ 18px, không phải huy hiệu 20px có nền đặc.
 *  · đường nối là hairline dài, mảnh 1px — thứ tạo cảm giác "mảnh" của FLORA.
 *  · accent xanh VNPAY chỉ xuất hiện ở bước ĐANG mở và các đoạn nối ĐÃ qua.
 *
 * Vì sao không đưa thành primitive dùng chung: chỉ S0 có wizard nhiều bước, §5.6 không
 * khai thành phần này, và một primitive chỉ-một-nơi-dùng là nợ chứ không phải tài sản.
 *
 * A11y (§5.8) GIỮ NGUYÊN: `<ol>` trong `<nav aria-label>`, mỗi bước là `<button>` có nhãn
 * đủ nghĩa, bước hiện tại mang `aria-current="step"`. Đường nối `aria-hidden`.
 * Bàn phím: Tab đi qua từng bước; ← → nhảy giữa các bước ĐÃ MỞ.
 */
export interface WizardStepperProps {
  current: WizardStep;
  visited: readonly WizardStep[];
  onGoto: (s: WizardStep) => void;
}

export function WizardStepper({ current, visited, onGoto }: WizardStepperProps) {
  const curIdx = stepIndex(current);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const reachableIdx = (i: number) => i <= curIdx || visited.includes(STEPS[i]!.id);

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const dir = e.key === "ArrowRight" ? 1 : -1;
    for (let j = i + dir; j >= 0 && j < STEPS.length; j += dir) {
      if (reachableIdx(j)) {
        e.preventDefault();
        refs.current[j]?.focus();
        return;
      }
    }
  };

  return (
    <nav aria-label="Các bước cài đặt">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {STEPS.map((s, i) => {
          const done = i < curIdx || (visited.includes(s.id) && i !== curIdx);
          const isCur = s.id === current;
          const reachable = reachableIdx(i);
          return (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                ref={(el) => {
                  refs.current[i] = el;
                }}
                disabled={!reachable}
                aria-current={isCur ? "step" : undefined}
                aria-label={`${s.long}${done ? " — đã xong" : ""}`}
                onClick={() => reachable && onGoto(s.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 px-2.5 text-label",
                  FLORA.pill, FOCUS, "transition-colors duration-fast",
                  "disabled:cursor-not-allowed disabled:text-fg-muted",
                  isCur
                    ? "bg-fg-strong/[0.06] text-fg-strong"
                    : done
                      ? "text-fg hover:bg-fg-strong/[0.04] hover:text-fg-strong"
                      : "text-fg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-caption font-medium",
                    isCur
                      ? "bg-accent text-fg-on-accent"
                      : done
                        ? "border border-accent/60 text-accent-text"
                        : "border border-line-strong text-fg-muted",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
              {/* Đường nối hairline — mảnh và dài, đây là chi tiết tạo cảm giác FLORA */}
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "h-px w-5 sm:w-10",
                    /* FE-3·S0 đóng nợ EVIDENCE-FE2 §7-#2 (dòng WAIV contrast cuối cùng).
                       TRƯỚC: `bg-accent/50`. Đoạn nối là THÀNH PHẦN ĐỒ HOẠ mang thông tin
                       "bước này đã qua" ⇒ WCAG 1.4.11 đòi ≥3:1 với nền dưới nó. Alpha .5 trộn
                       accent với nền: dark #396842/#000 = 3.23 (đạt) nhưng light #778C7F/#E3E3E5
                       = 2.80 (TRƯỢT) — đó là lý do phải xin miễn trừ.
                       SAU: màu ĐẶC `bg-accent` ⇒ dark 9.06 · light 10.80 (đo bằng
                       scripts/check-contrast.mjs, xấu nhất trong 4 lớp nền). Cùng lối chữa mà
                       tokens.css đã dùng cho accent-hover/active: điều khiển/đồ hoạ mang tin thì
                       dùng token ĐẶC, không dùng alpha. Không thêm token mới, không đổi hình dáng. */
                    i < curIdx ? "bg-accent" : "bg-line-subtle",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
