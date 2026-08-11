import { cn } from "@/lib/utils";
const STEPS = ["Chủ thể", "Phong cách", "Cần những gì", "Xem lại"];
export function StepHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  /* §W2A-2/§W2A-5 — `max-w-content` là class CHẾT (không có bậc `content` trong
     `maxWidth` của tailwind.config) ⇒ hàng bước này vẫn trải hết bề ngang. Nay dùng
     `.kg-page`: hairline ở lại thẻ <nav> để full-bleed, ruột vào lưới chung. */
  return <nav aria-label="Các bước tạo bộ kit" className="border-b border-line-subtle bg-canvas py-4">
    <ol className="kg-page grid grid-cols-4 gap-2">
      {STEPS.map((label, i) => <li key={label} className={cn("flex items-center gap-2 text-caption", i + 1 <= step ? "text-fg-strong" : "text-fg-muted-raised")} aria-current={i + 1 === step ? "step" : undefined}>
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", i + 1 <= step ? "border-accent" : "border-line-subtle")}>{i + 1}</span>
        <span className="hidden sm:inline">{label}</span>
      </li>)}
    </ol>
  </nav>;
}
