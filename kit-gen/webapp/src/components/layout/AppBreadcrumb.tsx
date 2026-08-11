import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { KeyboardHint } from "@/components/common";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";
import type { ScreenId } from "./screen-contract";

/**
 * §2.2 breadcrumb header: `Projects ▸ <tên project> ▾` — dấu ▾ mở ⌘P.
 *
 * Tên project luôn đi qua `{children}` của React ⇒ được escape sẵn; đây là
 * cách đóng audit I6 (bản v1 nhét tên vào innerHTML).
 *
 * VỎ FLORA: chữ xám mảnh, mật độ thấp; nút ▾ là pill hover mờ thay nút ghost vuông.
 * Cấu trúc breadcrumb + a11y giữ nguyên.
 */
export function AppBreadcrumb({
  screen,
  projectId,
  projectName,
  onJump,
}: {
  screen: ScreenId;
  projectId?: string;
  projectName?: string;
  onJump?: () => void;
}) {
  const inProject = Boolean(projectId);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem>
          {inProject ? (
            <BreadcrumbLink asChild>
              <Link to="/">Bộ kit của bạn</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Bộ kit của bạn</BreadcrumbPage>
          )}
        </BreadcrumbItem>

        {inProject && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={onJump}
                className={cn(
                  "min-w-0 gap-1 px-2", FLORA.pill,
                  "hover:bg-fg-strong/[0.06]", FOCUS,
                )}
                aria-label="Chuyển nhanh sang bộ kit khác"
              >
                {/* Chưa tải xong tên thì hiện id — không để trống, không hiện "undefined" */}
                <span className="max-w-[28ch] truncate text-label text-fg-strong">
                  {projectName ?? projectId}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
                <KeyboardHint keys={["mod", "P"]} className="ml-1 hidden lg:inline-flex" />
              </Button>
            </BreadcrumbItem>
          </>
        )}

        {!inProject && screen === "settings" && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Cài đặt</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
