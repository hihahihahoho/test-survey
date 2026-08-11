import * as React from "react";

/**
 * §2.3 PHÍM TẮT TOÀN CỤC.
 *
 * LUẬT SỐNG CÒN (§2.3 câu cuối): "Không dùng phím đơn nào khi con trỏ đang ở
 * trong input/textarea/contenteditable". Nếu quên, user gõ chữ "n" vào ô tên
 * project sẽ mở modal Tạo project — lỗi kiểu này rất khó truy.
 * `isTypingTarget()` là cửa duy nhất kiểm việc đó; mọi handler phím ĐƠN phải
 * đi qua nó.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  // cmdk render input trong dialog; role=combobox cũng tính là đang gõ
  return el.getAttribute?.("role") === "combobox";
}

export const isMacLike = (): boolean =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** ⌘ trên macOS, Ctrl ở nơi khác — tránh nói dối người dùng Windows. */
export function hasMod(e: KeyboardEvent): boolean {
  return isMacLike() ? e.metaKey : e.ctrlKey;
}

export interface ChordHandlers {
  /** ⌘K / Ctrl+K */
  onCommandPalette?: () => void;
  /** ⌘P */
  onJumpProject?: () => void;
  /** `?` */
  onShortcutsHelp?: () => void;
  /** chuỗi phím `g` rồi `<phím>` (vim-style, cửa sổ 800ms) */
  onGoto?: (key: string) => void;
}

/**
 * Gắn phím tắt ở tầng khung. Màn tự gắn phím riêng của mình (⌘S, ⌘Enter…) —
 * shell KHÔNG giành, để không có hai nơi cùng nghe một phím.
 */
export function useGlobalShortcuts(h: ChordHandlers): void {
  const ref = React.useRef(h);
  ref.current = h;

  React.useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const clearG = () => {
      pendingG = false;
      if (gTimer !== null) clearTimeout(gTimer);
      gTimer = null;
    };

    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);

      // ⌘K: được phép cả khi đang gõ (đây là lối thoát của bàn phím)
      if (hasMod(e) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        clearG();
        ref.current.onCommandPalette?.();
        return;
      }
      if (hasMod(e) && e.key.toLowerCase() === "p" && !e.shiftKey) {
        e.preventDefault();
        clearG();
        ref.current.onJumpProject?.();
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        ref.current.onShortcutsHelp?.();
        return;
      }

      // chuỗi `g` `<phím>` — 800ms theo §2.3
      if (pendingG) {
        const key = e.key.toLowerCase();
        clearG();
        if ("pdrks".includes(key)) {
          e.preventDefault();
          ref.current.onGoto?.(key);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        pendingG = true;
        gTimer = setTimeout(clearG, 800);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, []);
}

/** Bảng phím tắt hiện ở modal `?` — nguồn duy nhất, khớp §2.3. */
export const SHORTCUT_TABLE: { group: string; rows: { keys: string[]; sequence?: boolean; what: string }[] }[] = [
  {
    group: "Toàn cục",
    rows: [
      { keys: ["mod", "K"], what: "Bảng lệnh — mọi hành động đều gọi được từ đây" },
      { keys: ["mod", "P"], what: "Nhảy nhanh giữa project" },
      { keys: ["?"], what: "Bảng phím tắt này" },
      { keys: ["Esc"], what: "Đóng lớp phủ trên cùng" },
    ],
  },
  {
    group: "Điều hướng",
    rows: [
      { keys: ["g", "p"], sequence: true, what: "Về danh sách project" },
      { keys: ["g", "d"], sequence: true, what: "Bản thiết kế" },
      { keys: ["g", "r"], sequence: true, what: "Theo dõi sinh ảnh" },
      { keys: ["g", "k"], sequence: true, what: "Thư viện kit" },
      { keys: ["g", "s"], sequence: true, what: "Cài đặt project" },
    ],
  },
  {
    group: "Trong màn",
    rows: [
      { keys: ["mod", "S"], what: "Lưu bản thiết kế" },
      { keys: ["mod", "Z"], what: "Hoàn tác" },
      { keys: ["shift", "mod", "Z"], what: "Làm lại" },
      { keys: ["mod", "enter"], what: "Chạy hành động chính của màn" },
      { keys: ["alt", "mod", "L"], what: "Bật/tắt panel nhật ký" },
    ],
  },
];
