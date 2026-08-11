/**
 * features/design/safety/useLeaveGuard.ts — CHẶN RỜI MÀN KHI CÒN THAY ĐỔI (B5).
 *
 * ╔═ HAI ĐƯỜNG RỜI MÀN, CHỈ MỘT ĐƯỜNG ĐƯỢC TRÌNH DUYỆT LO ══════════════════════╗
 * ║  (a) đóng tab / F5 / gõ URL khác  → `beforeunload` của trình duyệt          ║
 * ║  (b) bấm sang màn khác TRONG APP  → trình duyệt IM LẶNG. Router tự đổi màn, ║
 * ║      editor unmount, thay đổi chưa lưu bốc hơi.                             ║
 * ║                                                                             ║
 * ║  Bản vanilla chỉ lo (a). Ca (b) mới là ca hay xảy ra: đang sửa thì bấm       ║
 * ║  "Sinh ảnh" ở rail bên trái. `contracts.ts` của R2-P1 nhận phần (a) —        ║
 * ║  file này lo phần (b) và KHÔNG giành phần (a) trừ khi được yêu cầu.          ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * `bindBeforeUnload` mặc định `false` đúng theo contracts.ts ("MÀN đã gắn, đừng
 * gắn lần hai"). Nhưng nếu ai đó bật nó lên trong khi màn cũng gắn, kết quả VẪN
 * đúng: có một sổ đăng ký ở tầng module, chỉ MỘT listener thật được cài, và nó
 * chỉ hỏi khi có ít nhất một người đăng ký còn bẩn. Thiết kế phòng hờ như vậy vì
 * "hai nơi cùng quản một hành vi" là mầm bug lúc một bên gỡ đi.
 */
import * as React from "react";
import { useBlocker } from "@tanstack/react-router";

/* ── Sổ đăng ký beforeunload dùng chung ─────────────────────────────────── */

const dirtyOwners = new Set<object>();
let installed: ((e: BeforeUnloadEvent) => void) | null = null;

function syncBeforeUnload(): void {
  const need = dirtyOwners.size > 0;
  if (need && installed === null) {
    installed = (e: BeforeUnloadEvent) => {
      // Trình duyệt hiện đại bỏ qua chuỗi tuỳ biến; chỉ cần preventDefault.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", installed);
    return;
  }
  if (!need && installed !== null) {
    window.removeEventListener("beforeunload", installed);
    installed = null;
  }
}

/** Chỉ dùng trong test. */
export function _beforeUnloadInstalled(): boolean {
  return installed !== null;
}

export interface LeaveGuardApi {
  /** Khác `null` ⇒ user vừa định rời màn: mở `LeaveGuardDialog` với 3 lối ra. */
  blocked: { proceed: () => void; reset: () => void } | null;
  /** [Lưu rồi đi tiếp]: lưu xong mới cho đi; lưu hỏng thì Ở LẠI (không mất gì). */
  saveAndLeave: () => Promise<void>;
}

export function useLeaveGuard({
  dirty,
  save,
  bindBeforeUnload = false,
}: {
  dirty: boolean;
  /** Trả `true` nếu đã lưu xong. `undefined` ⇒ ẩn nút [Lưu rồi đi tiếp]. */
  save?: () => Promise<boolean>;
  /** Mặc định FALSE — R2-P1 đang giữ phần này (contracts.ts). */
  bindBeforeUnload?: boolean;
}): LeaveGuardApi {
  const tokenRef = React.useRef<object>({});

  React.useEffect(() => {
    if (!bindBeforeUnload) return;
    const token = tokenRef.current;
    if (dirty) dirtyOwners.add(token);
    else dirtyOwners.delete(token);
    syncBeforeUnload();
    return () => {
      dirtyOwners.delete(token);
      syncBeforeUnload();
    };
  }, [dirty, bindBeforeUnload]);

  // Đọc `dirty` từ closure mới nhất qua ref: `shouldBlockFn` được router giữ lâu,
  // đọc biến cũ sẽ chặn nhầm (hoặc tệ hơn: không chặn) sau vài lần render.
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;

  const blocker = useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: false, // đã có sổ đăng ký ở trên, không để hai nơi cùng làm
    withResolver: true,
  });

  const blocked = React.useMemo(
    () => (blocker.status === "blocked" ? { proceed: blocker.proceed, reset: blocker.reset } : null),
    [blocker],
  );

  const saveAndLeave = React.useCallback(async () => {
    if (!save) return;
    const ok = await save();
    // Lưu hỏng ⇒ KHÔNG đi. Đi tiếp lúc này là mất trắng đúng thứ user vừa bảo "hãy giữ".
    if (ok && blocker.status === "blocked") blocker.proceed();
  }, [save, blocker]);

  return { blocked, saveAndLeave };
}
