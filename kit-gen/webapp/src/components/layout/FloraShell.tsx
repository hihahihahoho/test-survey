import * as React from "react";
import { Search, Moon, Sun, FolderOpen, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyboardHint } from "@/components/common";
import { useUiStore, applyTheme } from "@/lib/store";
import type { AgentStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { AgentPill } from "./AgentPill";
import type { ConnectionStatus } from "@/lib/api";
import { RuntimeStatus } from "./RuntimeStatus";
import { FLORA, FOCUS, FLOATBAR } from "./flora";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * KHUNG ỨNG DỤNG — VỎ FLORA (teams/react/FLORA-REF.md §3)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Đây là bản đổi VỎ của `components/common/AppShell` (R0). **Hợp đồng props giữ NGUYÊN
 * VĂN** `AppShellProps` ⇒ `AppLayout` đổi 1 dòng import là quay về bản R0 được, không
 * ràng buộc gì thêm. Vì sao không sửa thẳng file R0: nó không thuộc nhánh tôi và không có
 * prop để đổi cách vẽ (header gắn cứng `h-header`/`bg-surface`/agent pill nền tint).
 * Đã ghi teams/react/NEEDS-rs2.md (N3, N4).
 *
 * KHÁC BIỆT THỊ GIÁC so với bản R0 (và vì sao):
 *  · nền `#000` tuyệt đối thay `bg-canvas` xám than — §2.1 nói đây CHÍNH LÀ nguyên nhân
 *    bản trước bị chê "phẳng và đục".
 *  · header cao 56px thay 40px, chỉ 1 hairline dưới, không nền riêng ⇒ thoáng (§2.8).
 *  · ô ⌘K là PILL viền hairline (§6) thay nút chữ nhật.
 *  · agent status = chấm màu + chữ xám (`AgentPill`).
 *  · rail trái mảnh, nền trong suốt trên `#000` thay khối `bg-surface` (§3).
 *
 * GIỮ NGUYÊN phần nghiệp vụ/a11y của R0 — KHÔNG được rơi mất:
 *  · skip-link §5.8-A13, `<main id="kg-main" tabIndex={-1}>`.
 *  · rail 48px ở md, 168px ở xl (§2.2); `<nav aria-label>`.
 *  · banner sticky dưới header; `workspaceLabel` CHỈ là nhãn (X1: web không đụng path).
 *  · ô ⌘K là `<button>` thật, không phải input giả (A5).
 */
export interface FloraShellProps {
  breadcrumb?: React.ReactNode;
  /**
   * FE-2·E1 — THANH TAB FILE CON, đặt ngay dưới header (và dưới banner) ở **mọi** màn
   * project. Khung chỉ nhận một `ReactNode`: nó không biết file con là gì, không gọi
   * repo, không biết router — đúng như `FileTabsBar` của C cũng không biết router.
   */
  fileTabs?: React.ReactNode;
  /**
   * Khi có thanh tab, vùng nội dung phải là `role="tabpanel"` THẬT — nếu không thì
   * `aria-controls` của tab trỏ vào hư không (đúng lỗi C3 đo được: `getElementById`
   * trả `null`, xem `NEEDS-fe2-c.md` N8). Không truyền ⇒ không có tabpanel, và C sẽ
   * bỏ luôn `aria-controls`; hai bên không bao giờ lệch nhau.
   */
  filePanel?: { id: string; labelledBy?: string };
  rail?: React.ReactNode;
  banner?: React.ReactNode;
  agentStatus: AgentStatus;
  connectionStatus?: ConnectionStatus;
  onRecheck?: () => void;
  onAgentPillClick?: () => void;
  workspaceLabel?: string;
  onWorkspaceClick?: () => void;
  onSettingsClick?: () => void;
  onCommandPaletteOpen?: () => void;
  onHomeClick?: () => void;
  children: React.ReactNode;
}

export function FloraShell({
  breadcrumb,
  fileTabs,
  filePanel,
  rail,
  banner,
  agentStatus,
  connectionStatus,
  onRecheck,
  onAgentPillClick,
  workspaceLabel,
  onWorkspaceClick,
  onSettingsClick,
  onCommandPaletteOpen,
  onHomeClick,
  children,
}: FloraShellProps) {
  /* Dùng store `@/lib/store` (persist có allowlist + chặn secret). Bản R0 của AppShell
     đọc `@/stores/ui` — một store thứ hai, key localStorage khác ⇒ theme lệch nhau.
     Đó là lỗi thật của tầng nền, đã báo ở NEEDS-rs2.md (N5). */
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const isDark = theme !== "light";

  return (
    <div className={cn("flex min-h-dvh flex-col", FLORA.canvas)}>
      <a href="#kg-main" className="kg-skip-link">
        Tới nội dung chính
      </a>

      {/* Header: cao vừa, nền ĐEN, chỉ một hairline dưới (§2.2 + brief mục 1).
          §W2A-2 — hairline PHẢI full-bleed nên nó ở lại thẻ <header>; còn RUỘT
          header vào `.kg-page` để mép trái logo trùng mép trái mọi H1 bên dưới.
          Chỉ thêm `lg:px-10` cho header (như toa gốc) là KHÔNG đủ: ở 1440 nội
          dung trang nằm trong hộp 1280 đã căn giữa ⇒ logo x=40 mà H1 x=120. */}
      <header className={cn("sticky top-0 z-sticky h-14 shrink-0 border-b", FLORA.canvas, FLORA.hair)}>
        <div className="kg-page flex h-full items-center gap-3">
        {/* Logo gọn: dấu vuông bo tròn + chữ. Không icon hộp to, không màu loè. */}
        <button type="button" onClick={onHomeClick} aria-label="Về trang chủ" className={cn("flex shrink-0 items-center gap-2 rounded-2", FOCUS)}>
          <span
            aria-hidden
            /* FE-2·E1 đóng nợ A1 (`NEEDS-fe2-a.md` #2): bo góc arbitrary 6px → `rounded-1`
               (8px), bậc semantic nhỏ nhất của thang. Đây là ĐỔI HÌNH DÁNG THẬT 6→8px trên
               một ô 18px — nhỏ, nhưng là đổi thật, nên nói ra chứ không lặng lẽ.
               `size-[18px]` giữ nguyên: đó là kích thước, không phải bo góc, và thang
               spacing không có bậc 18px.
               (Không viết lại chuỗi class cũ trong comment — chính test ở
               `__tests__/subfile-shell.test.tsx` đã bắt tôi vì điều đó, và nó ĐÚNG: một
               cổng grep không thể phân biệt class thật với class trong lời kể.) */
            className={cn("size-[18px] rounded-1 border", FLORA.accentBorder, "bg-accent/[var(--kg-tint-a)]")}
          />
          <span className="text-subtitle font-medium tracking-[-0.01em] text-fg-strong">kit-gen</span>
        </button>

        {breadcrumb ? (
          <div className="min-w-0 flex-1 truncate">{breadcrumb}</div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Ô tìm ⌘K — PILL viền hairline. Là <button> thật (A5), không input giả.
            Viền dùng `ctlBorder` (3.94:1) vì đây là CONTROL, không phải khối trang trí. */}
        <button
          type="button"
          onClick={onCommandPaletteOpen}
          aria-label="Mở bảng lệnh"
          className={cn(
            "hidden h-9 items-center gap-2 border pl-3.5 pr-2 md:inline-flex",
            FLORA.pill, FLORA.ctlBorder, FLORA.fgMuted, FOCUS,
            "transition-colors duration-fast hover:border-line-strong hover:text-fg",
          )}
        >
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="text-label">Tìm hoặc chạy lệnh</span>
          <KeyboardHint keys={["mod", "K"]} className="ml-3" />
        </button>
        <button
          type="button"
          onClick={onCommandPaletteOpen}
          aria-label="Mở bảng lệnh"
          className={cn(
            "inline-flex size-9 items-center justify-center border md:hidden",
            FLORA.pill, FLORA.ctlBorder, FLORA.fgMuted, FOCUS,
          )}
        >
          <Search className="size-4" aria-hidden />
        </button>

        {workspaceLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onWorkspaceClick}
                className={cn(
                  "hidden h-8 max-w-[200px] items-center gap-1.5 px-2 sm:inline-flex",
                  FLORA.pill, FLORA.fgMuted, FOCUS,
                  "transition-colors duration-fast hover:text-fg",
                )}
              >
                <FolderOpen className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate text-label">{workspaceLabel}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Thư mục làm việc trên máy bạn</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onSettingsClick} aria-label="Mở cài đặt" className={cn("inline-flex size-8 items-center justify-center", FLORA.pill, FLORA.fgMuted, FOCUS)}>
              <Settings className="size-4" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>Cài đặt</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center",
                FLORA.pill, FLORA.fgMuted, FOCUS,
                "transition-colors duration-fast hover:text-fg-strong",
              )}
            >
              {isDark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{isDark ? "Giao diện tối" : "Giao diện sáng"}</TooltipContent>
        </Tooltip>

        {connectionStatus && onRecheck ? <RuntimeStatus status={connectionStatus} onRecheck={onRecheck} /> : <AgentPill status={agentStatus} onOpen={onAgentPillClick} />}
        </div>
      </header>

      {banner && <div className="sticky top-14 z-sticky shrink-0">{banner}</div>}

      {/* Thanh tab file con — KHÔNG sticky. Sticky sẽ ăn thêm 40px chiều cao khả dụng
          trên laptop 13" ở màn S3 (editor 3 cột đã tính chiều cao theo header), và
          thanh tab không phải thứ người ta cần thấy khi đang cuộn giữa nội dung.
          Nó nằm sau banner để thứ tự đọc là: khung → cảnh báo → chọn file → nội dung. */}
      {fileTabs && <div className="shrink-0">{fileTabs}</div>}

      {/* §2.2 mốc <768px: CHỈ ĐỌC THẬT. Cổng khoá nằm ở `gateOf(status, narrow)` +
          `useDesignEditor` (cùng mốc 767.98px), banner này chỉ NÓI RA điều đã được
          thi hành — trước đây nó là lời khuyên suông, đúng lỗi M5 của bản vanilla. */}
      {/* ══ P-SWEEP·15 · DẢI CẢNH BÁO MOBILE: TỪ MẢNG XÁM FULL-BLEED → MỘT DÒNG ══
          Bản trước là một dải nền `surface` chạm sát hai mép màn, không bo góc, tông
          xám khác mọi surface khác trên trang, chữ dài xuống 2 dòng — chiếm gần 1/8
          màn 375px cho một câu (ảnh 29/30). Nay: nền canvas + hairline dưới (giống
          hairline của header ngay trên nó), ruột nằm trong `.kg-page` nên mép trái
          trùng mép nội dung, và câu rút còn 4 chữ.
          Câu ĐẦY ĐỦ không mất — nó chuyển vào `title`, và mỗi control bị khoá vẫn tự
          nói lý do tại chỗ (`gate.reason`), đúng luật §6 "khoá thì phải kèm lý do". */}
      <div
        role="status"
        title="Mọi thao tác sửa bị khoá cho tới khi bạn mở trên màn rộng hơn."
        className={cn("shrink-0 border-b py-2 text-caption md:hidden", FLORA.hair, FLORA.canvas, FLORA.fgMuted)}
      >
        <div className="kg-page">Màn hình nhỏ — chỉ xem</div>
      </div>

      <div className="flex min-h-0 flex-1">
        {rail && (
          <nav
            aria-label="Điều hướng trong project"
            className={cn(
              "sticky top-14 z-rail hidden h-[calc(100dvh-3.5rem)] shrink-0 border-r md:block",
              FLORA.hair,
              // §2.2 giữ nguyên: rail icon 48px, rail chữ 168px từ xl
              "w-rail-collapsed xl:w-rail",
            )}
          >
            {rail}
          </nav>
        )}

        <main id="kg-main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-none">
          {/* `role="tabpanel"` chỉ xuất hiện khi THẬT SỰ có thanh tab. `tabIndex={0}`
              là yêu cầu APG cho panel không chứa phần tử focus được đầu tiên; nhờ nó,
              từ tab bấm `Tab` một lần là vào nội dung của file đang mở.
              KHÔNG đặt `role` này lên chính `<main>`: một phần tử không thể vừa là
              landmark chính vừa là panel của tablist mà không làm rối cây a11y. */}
          {filePanel ? (
            <div
              id={filePanel.id}
              role="tabpanel"
              tabIndex={0}
              {...(filePanel.labelledBy ? { "aria-labelledby": filePanel.labelledBy } : {})}
              className="flex h-full min-h-0 flex-col focus-visible:outline-none"
            >
              {children}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Thanh công cụ NỔI bo pill có backdrop blur (§3) — dùng chung cho S1 và các màn sau.
 * Tách ra đây (không để trong features/) vì đây là thành phần KHUNG, và brief gọi nó
 */
export function FloatBar({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-2 px-2 py-2", FLOATBAR, className)} {...props}>
      {children}
    </div>
  );
}

/**
 * FE-2·E1 — DÒNG "ĐANG LỌC THEO FILE" + ĐƯỜNG RA.
 *
 * §4.5 chốt bất biến *"không bao giờ có sheet tàng hình"*. Một bộ lọc im lặng là cách
 * nhanh nhất để phá bất biến đó **về mặt trải nghiệm**: dữ liệu vẫn còn nhưng người
 * dùng tưởng mất. Nên mỗi màn đang lọc PHẢI hiện dòng này, và dòng này PHẢI có nút
 * mở «Tất cả sheet» — đường ra một bước, không phải đi tìm.
 *
 * Đặt ở tầng khung (không phải trong `features/`) vì bốn màn workflow đều dùng, và vì
 * nó là thành phần KHUNG y như `FloatBar` ngay trên.
 */
export function FileScopeNotice({
  docName,
  hiddenCount,
  unit = "sheet",
  onShowAll,
  className,
}: {
  docName: string;
  /** Số phần tử đang bị ẩn. 0 ⇒ không render gì: một cảnh báo không có nội dung là nhiễu. */
  hiddenCount: number;
  /** Đơn vị đang bị ẩn — S5 ẩn **ảnh**, không phải sheet. Nói sai đơn vị là nói sai sự thật. */
  unit?: "sheet" | "ảnh";
  onShowAll: () => void;
  className?: string;
}) {
  if (hiddenCount <= 0) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2 text-caption",
        FLORA.surface, FLORA.hair, FLORA.r12, FLORA.fg,
        className,
      )}
    >
      <span>
        Đang xem theo file <span className="text-fg-strong">{docName}</span> — {hiddenCount} {unit} của
        project đang tạm ẩn. Chúng không bị xoá.
      </span>
      <button
        type="button"
        onClick={onShowAll}
        className={cn("rounded-1 underline underline-offset-4", FLORA.accentText, FOCUS)}
      >
        Xem tất cả sheet
      </button>
    </div>
  );
}
