import * as React from "react";
import { Box, Search, Moon, Sun, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AgentStatusPill } from "./AgentStatusPill";
import { KeyboardHint } from "./KeyboardHint";
import { useUiStore, applyTheme } from "@/lib/store";
import type { AgentStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * §2.2 Khung điều hướng.
 * Header cao 40px, sticky, LUÔN hiện: logo → breadcrumb → ô lệnh ⌘K →
 * workspace pill → agent pill (§2.4).
 * Rail trái 168px (thu 48px < 1100px) CHỈ khi ở trong project; S1/S6 full width.
 *
 * Component này là KHUNG. Nội dung breadcrumb / rail / banner do team màn
 * truyền vào qua props — AppShell không tự biết đang ở màn nào.
 */
export interface AppShellProps {
  /** Breadcrumb: `Projects ▸ <tên project> ▾` — team màn tự dựng. */
  breadcrumb?: React.ReactNode;
  /** Rail trái. Không truyền = màn full width (S1/S6). */
  rail?: React.ReactNode;
  /** Banner sticky dưới header: chế độ chỉ-đọc §2.5, nháp chưa lưu… */
  banner?: React.ReactNode;
  agentStatus: AgentStatus;
  onAgentPillClick?: () => void;
  /** Nhãn workspace — CHỈ là nhãn. Web không bao giờ nhận/gửi đường dẫn tự do (X1). */
  workspaceLabel?: string;
  onWorkspaceClick?: () => void;
  /** Mở bảng lệnh ⌘K */
  onCommandPaletteOpen?: () => void;
  children: React.ReactNode;
}

export function AppShell({
  breadcrumb,
  rail,
  banner,
  agentStatus,
  onAgentPillClick,
  workspaceLabel,
  onWorkspaceClick,
  onCommandPaletteOpen,
  children,
}: AppShellProps) {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {/* §5.8-A13 skip-link */}
      <a href="#kg-main" className="kg-skip-link">
        Tới nội dung chính
      </a>

      <header className="sticky top-0 z-sticky flex h-header shrink-0 items-center gap-2 border-b border-line-subtle bg-surface px-3">
        <div className="flex items-center gap-2 text-label font-semibold text-fg-strong">
          <Box className="size-4 text-accent-text" aria-hidden />
          <span>kit-gen</span>
        </div>

        {breadcrumb && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="min-w-0 flex-1 truncate">{breadcrumb}</div>
          </>
        )}
        {!breadcrumb && <div className="flex-1" />}

        {/* Ô lệnh ⌘K — là <button>, không phải input giả (A5) */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onCommandPaletteOpen}
          className="hidden gap-2 text-fg-muted-raised md:inline-flex"
          aria-label="Mở bảng lệnh"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="text-caption">Tìm hoặc chạy lệnh</span>
          <KeyboardHint keys={["mod", "K"]} className="ml-2" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCommandPaletteOpen}
          className="md:hidden"
          aria-label="Mở bảng lệnh"
        >
          <Search aria-hidden />
        </Button>

        {workspaceLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onWorkspaceClick} className="hidden gap-1.5 lg:inline-flex">
                <FolderOpen className="size-3.5" aria-hidden />
                <span className="max-w-[160px] truncate text-caption">{workspaceLabel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Thư mục làm việc trên máy bạn</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}>
              {theme === "dark" ? <Moon aria-hidden /> : <Sun aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Giao diện tối" : "Giao diện sáng"}</TooltipContent>
        </Tooltip>

        <AgentStatusPill status={agentStatus} onOpen={onAgentPillClick} />
      </header>

      {banner && <div className="sticky top-header z-sticky shrink-0">{banner}</div>}

      <div className="flex min-h-0 flex-1">
        {rail && (
          <nav
            aria-label="Điều hướng trong project"
            className={cn(
              "sticky top-header z-rail hidden h-[calc(100dvh-var(--kg-header,40px))] shrink-0 border-r border-line-subtle bg-surface md:block",
              // ≥1100px: rail chữ 168px · 768–1099px: rail icon 48px (§2.2)
              "w-rail-collapsed xl:w-rail"
            )}
          >
            {rail}
          </nav>
        )}

        <main id="kg-main" tabIndex={-1} className="min-w-0 flex-1 focus-visible:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
