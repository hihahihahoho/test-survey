import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DISPLAY, SERIF, FLORA } from "@/components/layout/flora";
import { SUBTITLE, TITLE } from "@/features/kitfile";
import { HOME_COPY } from "../lib/home-copy";

/**
 * ĐẦU MÀN H (UX-V3 §1.1): tiêu đề + ĐÚNG MỘT dòng phụ. Hết.
 *
 * Màn cũ có ở đây: 3 nút (Tạo/Nhập/Làm mới) trong một hộp pill, dòng «N project · quét lúc
 * hh:mm», 5 chip lọc, ô tìm, bộ sắp xếp, nút đổi grid/list. Tất cả biến mất khỏi tầng đầu —
 * nút Tạo dời xuống **ô đầu tiên của lưới** (§1.2 «mắt rơi vào ô accent»), phần còn lại là
 * thứ FLOW-V3 §4 gọi là «lằng nhằng».
 *
 * ⚠️ MỘT THỨ TÔI CỐ Ý GIỮ LẠI, KHÔNG PHẢI QUÊN DỌN: **ô tìm**, và chỉ khi có ≥7 bộ kit
 * (`SEARCH_THRESHOLD`). Wireframe §1.1 không vẽ nó. Nhưng «Recent files của Figma» mà
 * FLOW-V3 §0.2 lấy làm chuẩn thì có tìm, và 30 bộ kit không có ô tìm là bắt người ta cuộn.
 * Ngưỡng 7 giữ cho màn của người mới (≤6 bộ kit) đúng y wireframe: không ô nhập nào.
 * Nếu chủ dự án muốn bỏ hẳn, xoá `shouldShowSearch` là xong — đã ghi NEEDS-fe3-h N1.
 *
 * Tiêu đề dùng công thức FLORA «nhấn ĐÚNG MỘT TỪ» (§5.2): *Bộ kit **của bạn***.
 * Chữ được nhấn lấy từ `TITLE.H` của S — màn không tự chọn từ nào được in nghiêng.
 */
export function HomeHeader({
  showSearch,
  query,
  onQueryChange,
  searchRef,
}: {
  showSearch: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-2">
        {/* W2B-1 — H1 dùng const `DISPLAY` (thang `display-1/2`), thôi gõ `text-[Npx]`. */}
        <h1 className={cn(DISPLAY, "text-balance text-fg-strong")}>
          <span>{TITLE.H.lead} </span>
          <em className={cn(SERIF, "whitespace-nowrap text-fg-strong")}>{TITLE.H.accent}</em>
        </h1>
        <p className={cn("text-body", FLORA.fgMuted)}>{SUBTITLE.H}</p>
      </div>

      <div className="flex items-center gap-3">
        {showSearch && (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              aria-hidden
            />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label={HOME_COPY.SEARCH_LABEL}
              placeholder={HOME_COPY.SEARCH_PLACEHOLDER}
              className="w-56 rounded-full pl-9"
            />
          </div>
        )}
      </div>

    </div>
  );
}
