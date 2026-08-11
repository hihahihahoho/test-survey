import * as React from "react";
import { Boxes, SearchX } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { devDetails, presentError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { AddDestination } from "./components/AddDestination";
import { LibraryItem } from "./components/LibraryItem";
import { LibraryToolbar } from "./components/LibraryToolbar";
import { SkippedNotice } from "./components/SkippedNotice";
import { libToComponent, type ElementLibraryDrawerProps } from "./lib/contract";
import { useLibrary } from "./lib/useLibrary";

export type { ElementLibraryDrawerProps };

/**
 * webapp/src/features/design/library/ElementLibraryDrawer.tsx
 * ════════════════════════════════════════════════════════════════════════════
 * DRAWER "THƯ VIỆN ELEMENT" (§3-S3 cuối · phím tắt ⌘L).
 *
 * Catalogue CHỈ ĐỌC (chốt X8): "thêm" = COPY element vào bản thiết kế của project.
 * Sửa sau đó là sửa bản copy — thư viện không bao giờ bị ghi.
 *
 * ĐỦ 4 TRẠNG THÁI + ca AGENT CHƯA CHẠY:
 *   loading → `LoadingState` đúng 8 dòng (bằng số dòng thấy được lúc mở)
 *   empty   → 2 ca riêng: thư viện rỗng ≠ lọc không ra kết quả
 *   error   → `ErrorState` + [Thử lại] + [Dùng bản chuẩn hoá] (KHÔNG ngõ cụt),
 *             chuỗi kỹ thuật CHỈ nằm trong panel "Chi tiết cho lập trình viên"
 *   success → danh sách + chọn + thêm
 *   agent tắt → tự chuyển sang bản đóng gói trong bundle: user VẪN duyệt và chọn
 *             được; chỉ nút [Thêm] bị khoá KÈM LÝ DO (§2.5: xám + nói rõ, không ẩn).
 *
 * A11y: mỗi dòng là `<label>` bọc checkbox thật (I2/I4); `Sheet` của R0 lo focus
 * trap + Esc + trả focus; vùng đếm kết quả là `aria-live="polite"`.
 */

export function ElementLibraryDrawer({
  open, onOpenChange, targetSheetId, targetSheetLabel, freeSlots, existingFiles, readOnly, readOnlyReason, onAdd,
}: ElementLibraryDrawerProps): React.ReactElement {
  const lib = useLibrary({ targetSheetId, existingFiles, open });
  const [busy, setBusy] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  const count = lib.pickedElements.length;
  const disabledReason = readOnly ? readOnlyReason : count === 0 ? "Chọn ít nhất một element." : null;

  function handleAdd(): void {
    if (count === 0 || readOnly) return;
    setBusy(true);
    try {
      /* Chỉ COPY element sang dạng component rồi giao cho màn (chốt X8 + hợp đồng
         R2-P1): việc chọn ô trống, nới lưới, đặt tên file hợp lệ và đẩy bước undo
         nằm ở `ops.addElements()` — một chỗ duy nhất, không nhân đôi luật. */
      onAdd(lib.pickedElements.map(libToComponent), { toNewSheet: lib.toNewSheet });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="wide"
        className="gap-0"
        onOpenAutoFocus={(e) => {
          /* Focus vào ô tìm thay vì nút đóng: 42 element thì việc đầu tiên gần
             như luôn là gõ tìm. */
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>Thư viện element</SheetTitle>
          <SheetDescription>
            Chọn element rồi thêm vào bản thiết kế. Thư viện chỉ để đọc — element được sao chép vào project, sửa
            sau đó không ảnh hưởng thư viện.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-4">
          <LibraryToolbar
            source={lib.source}
            onSourceChange={lib.setSource}
            sourceAvailable={lib.sourceAvailable}
            query={lib.query}
            onQueryChange={lib.setQuery}
            group={lib.group}
            onGroupChange={lib.setGroup}
            groups={lib.groups}
            total={lib.total}
            searchInputRef={searchRef}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-fg-muted-raised" role="status" aria-live="polite">
              {lib.isLoading
                ? "Đang nạp thư viện…"
                : `${lib.visible.length} element hiển thị · tổng ${lib.total} trong thư viện${count > 0 ? ` · đã chọn ${count}` : ""}`}
            </p>
            <div className="flex items-center gap-1">
              {lib.visible.length > 0 && (
                <Button variant="ghost" size="sm" onClick={lib.pickAllVisible}>
                  Chọn hết đang hiện
                </Button>
              )}
              {count > 0 && (
                <Button variant="ghost" size="sm" onClick={lib.clearPicked}>
                  Bỏ chọn ({count})
                </Button>
              )}
            </div>
          </div>

          <SkippedNotice skipped={lib.skipped} />

          <LibraryBody lib={lib} listId={listId} />
        </SheetBody>

        <SheetFooter className="flex-col items-stretch gap-3 sm:flex-col sm:items-stretch">
          {count > 0 && (
            <AddDestination
              count={count}
              targetSheetLabel={targetSheetLabel}
              freeSlots={freeSlots}
              toNewSheet={lib.toNewSheet}
              onToNewSheetChange={lib.setToNewSheet}
              suggestedNewId={lib.suggestedNewSheetId}
            />
          )}

          {readOnly && (
            <p className="text-caption text-on-tint-warn">
              {readOnlyReason}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={count === 0 || readOnly}
              loading={busy}
              {...(disabledReason !== null ? { title: disabledReason, "aria-disabled": true } : {})}
            >
              {count === 0 ? "Thêm element" : `Thêm ${count} element`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Thân danh sách — tách ra để `ElementLibraryDrawer` không phình quá 200 dòng. */
function LibraryBody({
  lib,
  listId,
}: {
  lib: ReturnType<typeof useLibrary>;
  listId: string;
}): React.ReactElement {
  if (lib.isLoading) {
    return <LoadingState count={8} variant="rows" label="Đang nạp thư viện element…" />;
  }

  /* Lỗi #28 nhưng bản đóng gói vẫn dùng được ⇒ đây là CẢNH BÁO có đường ra,
     không phải màn chết. Chỉ chiếm cả vùng khi không còn nguồn nào. */
  if (lib.error != null && lib.source === "agent") {
    const view = presentError(lib.error);
    return (
      <ErrorState
        title={view.title}
        description={view.explain}
        detail={devDetails(lib.error)}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={lib.refetch}>
              Thử lại
            </Button>
            {lib.sourceAvailable.v2 && (
              <Button variant="primary" size="sm" onClick={() => lib.setSource("v2")}>
                Dùng bản chuẩn hoá
              </Button>
            )}
          </>
        }
      />
    );
  }

  if (lib.total === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Thư viện chưa có element nào"
        description="Công cụ local chưa nạp được element-lib.json. Bạn vẫn có thể dùng bản chuẩn hoá đi kèm ứng dụng."
        action={
          lib.sourceAvailable.v2 ? (
            <Button variant="primary" onClick={() => lib.setSource("v2")}>
              Dùng bản chuẩn hoá
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (lib.visible.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Không có element nào khớp"
        description={
          lib.query !== ""
            ? `Không tìm thấy «${lib.query}». Thử từ khoá ngắn hơn hoặc bỏ lọc nhóm.`
            : "Nhóm này không có element nào."
        }
        action={
          <Button
            variant="secondary"
            onClick={() => {
              lib.setQuery("");
              lib.setGroup("all");
            }}
          >
            Xoá bộ lọc
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-2")} role="group" aria-label="Danh sách element trong thư viện">
      {lib.visible.map((v) => (
        <LibraryItem
          key={v.file}
          id={`${listId}-${v.file}`}
          view={v}
          checked={lib.picked.has(v.file)}
          onCheckedChange={(on) => lib.toggle(v.file, on)}
        />
      ))}
    </div>
  );
}
