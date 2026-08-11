import * as React from "react";
import type { LucideIcon } from "lucide-react";

/**
 * REGISTRY LỆNH cho ⌘K (§2.3: "Mọi hành động trong spec này phải gọi được từ đây").
 *
 * Hai nguồn lệnh:
 *   1. Lệnh TOÀN CỤC — do shell khai (điều hướng, project, công cụ local, trợ giúp).
 *   2. Lệnh CỦA MÀN ĐANG MỞ — màn tự đăng ký bằng `useRegisterCommands()`.
 *      Đăng ký khi mount, tự gỡ khi unmount ⇒ bảng lệnh không bao giờ còn sót
 *      lệnh của màn đã rời (bấm vào sẽ chạy handler mồ côi).
 *
 * CÁCH DÙNG CHO TEAM MÀN — 5 dòng, không phụ thuộc gì khác:
 *
 *   import { useRegisterCommands } from "@/components/layout";
 *
 *   useRegisterCommands(
 *     () => [
 *       { id: "design.save", label: "Lưu bản thiết kế", hint: ["mod", "S"], run: save,
 *         disabledReason: readOnly ? "Cần công cụ local đang chạy" : null },
 *     ],
 *     [save, readOnly],   // mảng phụ thuộc như useMemo
 *   );
 *
 * LƯU Ý §2.5-2: lệnh không dùng được thì đặt `disabledReason` — **không** bỏ
 * khỏi danh sách. Ẩn lệnh làm user tưởng tính năng biến mất.
 */

/** Nhóm hiển thị — thứ tự cố định để user học được vị trí. */
export const COMMAND_GROUPS = [
  "Màn hình này",
  "Dự án",
  "Điều hướng",
  "Công cụ local",
  "Trợ giúp",
] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface Command {
  /** Ổn định, duy nhất. Dùng làm key React và để test tìm lệnh. */
  id: string;
  label: string;
  /** Mặc định "Màn hình này" cho lệnh do màn đăng ký. */
  group?: CommandGroup;
  icon?: LucideIcon;
  /** Phím tắt hiển thị, dạng `["mod","K"]` — xem KeyboardHint của R0. */
  hint?: string[];
  /** Phím bấm lần lượt kiểu vim (`g` rồi `p`). */
  hintSequence?: boolean;
  /** Từ khoá phụ giúp tìm (không hiện ra màn). */
  keywords?: string;
  /** Có lý do ⇒ lệnh hiện mờ + nói rõ lý do, KHÔNG bị ẩn (§2.5-2). */
  disabledReason?: string | null;
  run: () => void;
}

export type CommandFactory = () => Command[];

interface Registry {
  add: (factory: CommandFactory) => () => void;
  list: () => Command[];
  subscribe: (fn: () => void) => () => void;
}

function createRegistry(): Registry {
  const factories = new Set<CommandFactory>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  return {
    add(factory) {
      factories.add(factory);
      emit();
      return () => {
        factories.delete(factory);
        emit();
      };
    },
    list() {
      const out: Command[] = [];
      for (const f of factories) {
        try {
          out.push(...f());
        } catch (e) {
          // Một màn khai lệnh lỗi KHÔNG được làm chết bảng lệnh của cả app.
          console.error("[⌘K] màn khai lệnh lỗi:", e);
        }
      }
      return out;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

const registry = createRegistry();

/**
 * Màn đăng ký lệnh riêng. `deps` giống `useMemo`: đổi thì lệnh được tính lại.
 * Tự gỡ khi unmount.
 */
export function useRegisterCommands(factory: CommandFactory, deps: React.DependencyList = []): void {
  // Giữ factory mới nhất trong ref để registry luôn gọi bản có closure mới,
  // mà không phải add/remove liên tục mỗi lần render.
  const ref = React.useRef(factory);
  React.useEffect(() => {
    ref.current = factory;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    const stable: CommandFactory = () => ref.current();
    return registry.add(stable);
  }, []);
}

/** Đọc lệnh do các màn đăng ký. Dùng ở bảng lệnh; tự re-render khi có thay đổi. */
export function useScreenCommands(): Command[] {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => registry.subscribe(force), []);
  return registry.list().map((c) => ({ group: "Màn hình này" as CommandGroup, ...c }));
}

/** Chỉ dùng trong test. */
export const _registry = registry;
