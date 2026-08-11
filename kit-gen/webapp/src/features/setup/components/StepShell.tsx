import * as React from "react";
import { cn } from "@/lib/utils";
import { CARD, DISPLAY, FLORA, SERIF } from "@/components/layout/flora";

/**
 * Khung chung của một bước: tiêu đề `h2` + câu dẫn + nội dung.
 *
 * Lý do có file này thay vì lặp markup 4 lần: giữ **đúng một** cấp tiêu đề cho cả wizard
 * (§5.8-A13 — thứ tự heading phải liền mạch: h1 của màn → h2 của bước → h3 của từng thẻ),
 * và để 4 bước không tự trôi mỗi bước một khoảng cách khác nhau.
 *
 * VỎ FLORA: tiêu đề bước to hơn/mảnh hơn, câu dẫn hẹp lại (~62ch) và dùng xám `#B4B4B4`
 * ⇒ mật độ chữ thấp, nhịp thở lớn (§2.8). Khoảng cách trong bước nới từ gap-4 lên gap-6.
 */
export function StepShell({
  title,
  lead,
  children,
  className,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-6", className)} aria-labelledby="kg-setup-step-title">
      <div className="flex flex-col gap-2">
        {/* W2B-1 — 22px gõ tay nay là bậc `display-3` của thang; đoạn dẫn chuyển sang
            `text-body` (14/21): cùng cỡ chữ, nhưng nay CÓ line-height + weight của token. */}
        <h2 id="kg-setup-step-title" className="text-display-3 text-fg-strong">
          {title}
        </h2>
        {lead && (
          <p className={cn("max-w-[62ch] text-body", FLORA.fg)}>{lead}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Thẻ con trong một bước — luôn có tiêu đề `h3` để screen reader nhảy được.
 * VỎ FLORA: surface `#131416`, bo 20px, viền hairline (§2.1–2.3), padding rộng hơn.
 */
export function StepCard({
  title,
  step,
  children,
  className,
}: {
  title?: string;
  /** số thứ tự nhỏ trước tiêu đề, vd "1" trong "1 · Tải script" */
  step?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-5", CARD, className)}>
      {title && (
        <h3 className="text-subtitle font-medium text-fg-strong">
          {step && <span className={cn("mr-2 font-mono text-label", FLORA.accentText)}>{step} ·</span>}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

/** Chú thích nhỏ dưới một khối. 12px là bậc nhỏ nhất được phép (§5.2 sàn 12px). */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-caption", FLORA.fgMuted, className)}>{children}</p>;
}

/**
 * Tiêu đề trang kiểu FLORA: sans + **một từ khoá serif italic** (§2.5).
 * Đây là dấu ấn nhận diện mạnh nhất của FLORA (*"Your **creative** environment."*),
 * nên nó được tách thành component để mọi màn nhấn cùng một cách.
 *
 * `accent` là từ được in nghiêng serif — truyền ĐÚNG 1 từ/ngữ ngắn, không phải cả câu.
 */
export function DisplayTitle({
  lead,
  accent,
  trail,
  className,
  id,
}: {
  lead?: string;
  accent: string;
  trail?: string;
  className?: string;
  id?: string;
}) {
  return (
    <h1 id={id} className={cn(DISPLAY, "text-balance text-fg-strong", className)}>
      {lead && <span>{lead} </span>}
      {/* W2B-5 — `whitespace-nowrap` để từ nhấn không bị bẻ đôi (ảnh 29: "vẽ" mồ côi
          một mình xuống dòng 2 trên mobile). */}
      <em className={cn(SERIF, "whitespace-nowrap text-fg-strong")}>{accent}</em>
      {trail && <span> {trail}</span>}
    </h1>
  );
}
