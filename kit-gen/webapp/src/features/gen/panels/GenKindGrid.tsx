import * as React from "react";
import { Image, PersonStanding, Puzzle, Package, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "@/components/layout/flora";
import { GEN_KIND_LIST, type GenKind, type GenKindSpec } from "../lib/gen-kinds";

/**
 * P-SWEEP·11 — hình của bốn lệnh, thay cho bộ emoji 🖼 🧍 🧩 📦 cũ.
 *
 * Ở đây chứ không ở `lib/gen-kinds.ts` vì file đó tự khai «THUẦN DỮ LIỆU: không React»
 * và được test chạy ở environment "node"; kéo component React vào là phá đúng lời hứa
 * ấy. Panel `GenForm` import lại từ đây nên vẫn chỉ có MỘT bảng ánh xạ.
 *
 * Luôn `aria-hidden` + luôn đứng cạnh `spec.label` bằng chữ — bất biến §5.8-A3 mà bộ
 * emoji cũ đã theo, giữ nguyên.
 */
export const GEN_KIND_ICON: Readonly<Record<GenKind, LucideIcon>> = {
  bg: Image,
  pose: PersonStanding,
  element: Puzzle,
  kit: Package,
};

/**
 * TẦNG 1 CỦA HỘP GEN — lưới 4 lệnh (UX-V3 §4.1).
 *
 * A11y: đây là một **danh sách nút**, không phải radio — bấm là đi tiếp sang tầng 2 chứ
 * không phải chọn một giá trị. Vì thế dùng `role="group"` + `button`, và tự lo ←/→/↑/↓
 * theo APG «grid of buttons»: một điểm dừng Tab, mũi tên đi trong lưới, Home/End về đầu/cuối.
 * Nút bị khoá (thiếu ảnh nhân vật) **vẫn nằm trong vòng di chuyển** — khác toolbar — vì
 * người dùng cần đọc được LÝ DO khoá; nếu loại khỏi vòng thì bàn phím không bao giờ tới
 * được câu giải thích đó.
 *
 * 0 literal màu/khoảng cách: dùng `FLORA`/`FOCUS` của R0.
 */
export interface GenKindGridProps {
  onPick: (kind: GenKind) => void;
  /** Lệnh bị khoá kèm lý do đọc được. Khoá thì bấm không đi tiếp. */
  lockedReason: Partial<Record<GenKind, string>>;
  /** Dòng chi phí ngắn dưới tên lệnh, ví dụ «~1 lượt» / «~5 lượt». */
  costHint: Record<GenKind, string>;
}

export function GenKindGrid({ onPick, lockedReason, costHint }: GenKindGridProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  const items = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[data-gen-kind]") ?? []);

  const move = (delta: number | "first" | "last") => {
    const list = items();
    if (list.length === 0) return;
    const cur = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (delta === "last") next = list.length - 1;
    else if (typeof delta === "number") next = (Math.max(cur, 0) + delta + list.length) % list.length;
    list.forEach((el, i) => el.setAttribute("tabindex", i === next ? "0" : "-1"));
    list[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Lưới 2 cột: ←/→ đi 1 bước, ↑/↓ đi 2 bước (đúng hình lưới người dùng nhìn thấy).
    const step =
      e.key === "ArrowRight" ? 1
      : e.key === "ArrowLeft" ? -1
      : e.key === "ArrowDown" ? 2
      : e.key === "ArrowUp" ? -2
      : e.key === "Home" ? ("first" as const)
      : e.key === "End" ? ("last" as const)
      : null;
    if (step === null) return;
    e.preventDefault();
    move(step);
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Chọn thứ muốn máy vẽ"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-2"
    >
      {GEN_KIND_LIST.map((spec, i) => (
        <KindTile
          key={spec.kind}
          spec={spec}
          tabIndex={i === 0 ? 0 : -1}
          cost={costHint[spec.kind]}
          locked={lockedReason[spec.kind] ?? ""}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function KindTile({
  spec, cost, locked, tabIndex, onPick,
}: {
  spec: GenKindSpec;
  cost: string;
  locked: string;
  tabIndex: number;
  onPick: (kind: GenKind) => void;
}) {
  const hintId = React.useId();
  const isLocked = locked !== "";
  const Icon = GEN_KIND_ICON[spec.kind];
  return (
    <button
      type="button"
      data-gen-kind={spec.kind}
      tabIndex={tabIndex}
      aria-describedby={hintId}
      aria-disabled={isLocked || undefined}
      onClick={() => {
        if (!isLocked) onPick(spec.kind);
      }}
      className={cn(
        "flex min-h-24 flex-col items-start gap-1 border p-3 text-left",
        FLORA.r16,
        FLORA.hair,
        FOCUS,
        isLocked
          ? "cursor-not-allowed bg-raised text-fg-muted"
          : "bg-raised text-fg-strong hover:border-line-strong",
      )}
    >
      <span className="flex items-center gap-2 text-subtitle">
        <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        {spec.label}
      </span>
      <span id={hintId} className="text-caption text-fg-muted-raised">
        {isLocked ? locked : `${spec.hint} · ${cost}`}
      </span>
    </button>
  );
}
