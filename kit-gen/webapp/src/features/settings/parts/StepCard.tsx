import * as React from "react";
import { cn } from "@/lib/utils";
import { CARD, DISPLAY, FLORA, SERIF } from "@/components/layout/flora";

/**
 * BA MẢNH VỎ FLORA dùng chung — trước 07/09/2026 file này là
 * `features/setup/components/StepShell.tsx`, khung của wizard cài đặt 4 bước.
 * Wizard đã bị xoá (route `/setup` chỉ còn chuyển hướng từ lâu); ba mảnh dưới đây
 * ở lại vì chúng vẫn được dùng THẬT:
 *   · `StepCard` + `Note` — hai tab của dialog Cài đặt (`tabs/EnvTab`, `tabs/AgentTab`)
 *     qua `DoctorChecklist` / `ImageGenCard` / `WorkspacePicker`;
 *   · `DisplayTitle`      — H1 của màn Danh sách dự án (`features/projects`).
 *
 * `StepShell` (khung `h2` + câu dẫn của MỘT BƯỚC) đi theo wizard: không còn bước
 * nào để bọc. Tên `StepCard`/`step` giữ nguyên để diff của đợt dọn này chỉ là dời
 * chỗ, không phải đổi API — ai muốn đổi tên thì làm ở một lượt riêng.
 *
 * VỎ FLORA: surface `#131416`, bo 20px, viền hairline (§2.1–2.3), padding rộng.
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
