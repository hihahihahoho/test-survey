import { Link } from "@tanstack/react-router";
import { LayoutGrid, Pencil, Zap, Images, Settings, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";
import type { ScreenId } from "./screen-contract";

/**
 * §2.2 RAIL TRÁI — 5 mục, chỉ hiện khi đang ở trong một project.
 * Rộng 168px ở ≥1280px, thu về 48px icon ở dưới mốc đó (spec nói 1100px; lớp
 * `xl` của Tailwind = 1280px là mốc gần nhất có sẵn trong thang, và §2.2 cho
 * phép rail-icon ở khoảng 768–1099 — ta thu sớm hơn một chút, không muộn hơn).
 *
 * A11Y (§5.8): `aria-current="page"` + VẠCH chỉ thị bên trái, không chỉ dựa
 * vào màu (đóng audit I1). Ở chế độ icon, chữ vào `sr-only` + tooltip.
 *
 * VỎ FLORA (FLORA-REF §3 "sidebar mảnh"): mục đang mở dùng nền `rgba(255,255,255,.06)`
 * mảnh + chữ trắng thay khối `bg-overlay` đặc; vạch chỉ thị đổi sang accent bạc hà.
 * Cấu trúc, thứ tự 5 mục, badge và toàn bộ a11y GIỮ NGUYÊN.
 */
export interface RailBadges {
  /** Số lượt chạy đang chạy — badge số ở mục "Sinh ảnh". */
  runs?: number;
  /** Có thay đổi chưa lưu — dấu • ở mục "Thiết kế". */
  designDirty?: boolean;
}

interface RailItem {
  screen: ScreenId;
  label: string;
  icon: LucideIcon;
  to: string;
}

const ITEMS: RailItem[] = [
  { screen: "project", label: "Tổng quan", icon: LayoutGrid, to: "/p/$projectId" },
  { screen: "design", label: "Thiết kế", icon: Pencil, to: "/p/$projectId/design" },
  { screen: "runs", label: "Sinh ảnh", icon: Zap, to: "/p/$projectId/runs" },
  { screen: "kit", label: "Thư viện", icon: Images, to: "/p/$projectId/kit" },
  { screen: "project-settings", label: "Cài đặt", icon: Settings, to: "/p/$projectId/settings" },
];

/** `/p/:id/runs/:runId` vẫn làm sáng mục "Sinh ảnh". */
function isCurrent(item: RailItem, screen: ScreenId): boolean {
  if (item.screen === screen) return true;
  return item.screen === "runs" && screen === "run-detail";
}

export function ProjectRail({
  projectId,
  screen,
  badges = {},
}: {
  projectId: string;
  screen: ScreenId;
  badges?: RailBadges;
}) {
  return (
    <ul className="flex flex-col gap-1 p-2 xl:p-3">
      {ITEMS.map((item) => {
        const current = isCurrent(item, screen);
        const runs = item.screen === "runs" ? Number(badges.runs ?? 0) : 0;
        const dot = item.screen === "design" && badges.designDirty === true;
        const Icon = item.icon;

        return (
          <li key={item.screen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  params={{ projectId }}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    /* FE-3·S0 đóng nợ EVIDENCE-FE2 §7-#3 (bo góc arbitrary CUỐI CÙNG của repo).
                       TRƯỚC: `rounded-[10px]` — 10px không có trong thang bán kính FLORA
                       (8·12·16·20·24·999, tailwind.config.ts:69). SAU: `rounded-1` = 8px, đúng
                       tiền lệ E1 đã dùng cho `FloraShell.tsx` (6px → rounded-1) và khuyến nghị
                       A0 §9-R3. Chênh 2px trên mục rail cao 36px: đổi hình dáng thật nhưng
                       không đáng kể, và đây là giá của việc có MỘT thang bán kính duy nhất.
                       `text-[13px]` cố ý GIỮ NGUYÊN — xem S-REPORT §4.3 (đổi sang `text-label`
                       kéo theo font-weight 500, là đổi thị giác ngoài phạm vi nợ #3). */
                    "relative flex h-9 items-center gap-2.5 rounded-1 px-2.5 text-[13px]",
                    "transition-colors duration-fast", FOCUS,
                    current
                      ? "bg-fg-strong/[0.06] text-fg-strong"
                      : cn(FLORA.fgMuted, "hover:bg-fg-strong/[0.04] hover:text-fg-strong"),
                  )}
                >
                  {/* Vạch chỉ thị: thông tin KHÔNG chỉ nằm ở màu (audit I1) */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full",
                      current ? "bg-accent" : "bg-transparent",
                    )}
                  />
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="hidden min-w-0 flex-1 truncate xl:inline">{item.label}</span>
                  <span className="sr-only xl:hidden">{item.label}</span>

                  {runs > 0 && (
                    <Badge tone="running" className="ml-auto hidden xl:inline-flex">
                      {runs}
                    </Badge>
                  )}
                  {runs > 0 && (
                    <span className="absolute right-1 top-1 size-1.5 rounded-full bg-running xl:hidden" aria-hidden />
                  )}
                  {runs > 0 && <span className="sr-only">{`${runs} lượt đang chạy`}</span>}

                  {dot && (
                    <span
                      aria-hidden
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-warn xl:ml-0"
                    />
                  )}
                  {dot && <span className="sr-only">có thay đổi chưa lưu</span>}
                </Link>
              </TooltipTrigger>
              {/* Tooltip chỉ có ích khi rail thu về icon */}
              <TooltipContent side="right" className="xl:hidden">
                {item.label}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
