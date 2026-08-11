/**
 * features/design/slots.tsx — NẠP PHẦN CỦA ĐỒNG ĐỘI MÀ KHÔNG PHỤ THUỘC CỨNG.
 *
 * VẤN ĐỀ: `safety/` (R2-P2) và `library/` (R2-P3) đang được viết SONG SONG với file
 * này. `import "./safety/SafetyPanel"` là đường dẫn TĨNH — Rollup phân giải lúc build,
 * file chưa có là **build gãy cho cả ba người**, try/catch không cứu được (nó chỉ bắt
 * lỗi lúc chạy). Bản vanilla đã chết đúng bệnh này: `teams/qa-web/qa-func.md` C-02
 * "thiếu import ⇒ vỡ màn".
 *
 * GIẢI PHÁP: y hệt cách R1 làm cho 9 màn (`components/layout/lazy-screen.tsx`) —
 * `import.meta.glob` liệt kê file CÓ THẬT. Chưa nộp ⇒ khoá không có trong bảng ⇒
 * màn dùng bản tạm và ghi rõ "phần này do R2-P2 làm". Nộp rồi ⇒ tự lên, KHÔNG ai
 * phải sửa file này.
 *
 * ĐƯỜNG DẪN LÀ CỐ ĐỊNH (đã khai ở `contracts.ts`):
 *   features/design/safety/SafetyPanel.tsx            → SafetyPanel
 *   features/design/library/ElementLibraryDrawer.tsx  → ElementLibraryDrawer
 */
import * as React from "react";
import { History, LibraryBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import type {
  ElementLibraryDrawerComponent, ElementLibraryDrawerProps, SafetyPanelComponent, SafetyPanelProps,
} from "./contracts";

const SAFETY = import.meta.glob("./safety/SafetyPanel.tsx") as Record<string, () => Promise<unknown>>;
const LIBRARY = import.meta.glob("./library/ElementLibraryDrawer.tsx") as Record<string, () => Promise<unknown>>;

function pick<T>(mod: unknown, named: string): T | null {
  const m = mod as Record<string, unknown> | null;
  const hit = m?.[named] ?? m?.default;
  return typeof hit === "function" ? (hit as T) : null;
}

function lazySlot<P extends object>(
  table: Record<string, () => Promise<unknown>>,
  key: string,
  named: string,
  Fallback: React.ComponentType<P>,
): React.ComponentType<P> {
  const loader = table[key];
  if (!loader) return Fallback;
  const Lazy = React.lazy(async () => {
    const comp = pick<React.ComponentType<P>>(await loader(), named);
    // File có mà export sai tên: KHÔNG ném lỗi làm vỡ màn — rơi về bản tạm và
    // báo ở console cho người viết. Editor của user quan trọng hơn sự nghiêm khắc.
    if (!comp) {
      console.error(`[S3] ${key} tồn tại nhưng không export "${named}" — dùng bản tạm.`);
      return { default: Fallback };
    }
    return { default: comp };
  });
  const Wrapped = (props: P) => (
    <React.Suspense fallback={null}>
      {/* `React.lazy` mất kiểu props generic; ép ở đúng MỘT dòng này thay vì bắt mọi
          nơi dùng phải ép. Kiểu đối ngoại (`SafetyPanelComponent`…) vẫn chặt. */}
      {React.createElement(Lazy as unknown as React.ComponentType<P>, props)}
    </React.Suspense>
  );
  Wrapped.displayName = `Slot(${named})`;
  return Wrapped;
}

/* ═══════════ Bản tạm khi đồng đội chưa nộp ═══════════ */

/**
 * Bản tạm của [Lịch sử ▾]. CỐ Ý không tự dựng drawer lịch sử đầy đủ:
 * `.history/contract/` là địa phận R2-P2, làm song song hai bản là chắc chắn lệch.
 * Nút vẫn HIỆN (§2.5-2: không ẩn tính năng), bấm vào nói thật là chưa có.
 */
function SafetyFallback({ api }: SafetyPanelProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <History className="size-3.5" aria-hidden />
        Lịch sử
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Lịch sử bản thiết kế</SheetTitle>
            <SheetDescription>50 bản lưu gần nhất của project này.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <EmptyState
              icon={History}
              title="Phần lịch sử chưa lắp xong"
              description={
                <>
                  Thay đổi của bạn <strong>vẫn an toàn</strong>: mỗi lần lưu, công cụ local đều giữ một bản trên máy
                  (50 bản gần nhất). Chỉ có màn xem lại là chưa dựng.
                </>
              }
              action={
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Đóng
                </Button>
              }
              steps={[
                `Bản hiện tại: v${api.baseVersion}`,
                "Muốn quay lui ngay bây giờ: dùng Hoàn tác (⌘Z) — giữ được ≥50 bước trong phiên này.",
              ]}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Bản tạm của drawer thư viện: vẫn thêm được element trống để không kẹt việc. */
function LibraryFallback({ open, onOpenChange, targetSheetLabel, readOnly, readOnlyReason, onAdd }: ElementLibraryDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Thư viện element</SheetTitle>
          <SheetDescription>Catalogue 42 element dùng chung, thêm vào sheet đang mở.</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <EmptyState
            icon={LibraryBig}
            title="Thư viện chưa lắp xong"
            description={
              targetSheetLabel
                ? `Trong lúc chờ, bạn vẫn thêm được một element trống vào sheet «${targetSheetLabel}» rồi tự điền mô tả.`
                : "Hãy chọn một sheet trước."
            }
            action={
              <Button
                variant="primary"
                disabled={readOnly || !targetSheetLabel}
                {...(readOnly ? { title: readOnlyReason, "aria-disabled": true } : {})}
                onClick={() => {
                  onAdd([{ vi: "Element mới", spec: "" }]);
                  onOpenChange(false);
                }}
              >
                Thêm 1 element trống
              </Button>
            }
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export const SafetySlot: SafetyPanelComponent = lazySlot<SafetyPanelProps>(
  SAFETY,
  "./safety/SafetyPanel.tsx",
  "SafetyPanel",
  SafetyFallback,
);

export const LibrarySlot: ElementLibraryDrawerComponent = lazySlot<ElementLibraryDrawerProps>(
  LIBRARY,
  "./library/ElementLibraryDrawer.tsx",
  "ElementLibraryDrawer",
  LibraryFallback,
);

/** Đồng đội đã nộp chưa — dùng để không hiện hai lần cùng một thông báo. */
export const hasSafetyPanel = (): boolean => Object.hasOwn(SAFETY, "./safety/SafetyPanel.tsx");
export const hasElementLibrary = (): boolean => Object.hasOwn(LIBRARY, "./library/ElementLibraryDrawer.tsx");
