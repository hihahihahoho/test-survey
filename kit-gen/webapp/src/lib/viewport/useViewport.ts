/**
 * webapp/src/lib/viewport/useViewport.ts — HOOK PAN/ZOOM DÙNG CHUNG (FE-PLAN §3-B1).
 *
 * Một khái niệm zoom cho cả app: canvas của FE-3 **và** vùng ② của S3 (UI-SPEC-V2 W4)
 * đều gọi hook này, không ai tự viết bản thứ hai.
 *
 * ┌── RANH GIỚI ─────────────────────────────────────────────────────────────────┐
 * │ • KHÔNG import gì từ `features/**` (hook phải trung lập — tiêu chí ② của B1). │
 * │ • KHÔNG vẽ gì. Trả về state + handler + chuỗi `transform`; JSX là của màn.    │
 * │ • KHÔNG gọi API, KHÔNG persist. Muốn nhớ khung nhìn thì màn tự lưu.           │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ TODO (FE-3, xem FE-PLAN §5 câu Q2): thay TOÀN BỘ khối "cử chỉ chuột" bên dưới
 * (`onPointerDown/Move/Up` + listener `wheel`) bằng `@use-gesture/react`. UI-SPEC-V2
 * §7 rủi ro *"tự viết pan/zoom sai trên trackpad macOS (wheel vs pinch)"* nói rõ đây
 * là việc của thư viện. Bản FE-1 dùng event thuần vì thêm dependency là quyết định
 * của FE-3 và CHƯA được chủ dự án duyệt. Ranh giới thay thế: chỉ 3 thứ bị đụng —
 * `bindPointer`, `useEffect` gắn wheel, và cờ `isPanning`. Toàn bộ TOÁN
 * (`viewport.ts`) và BÀN PHÍM (`keys.ts`) giữ nguyên, không phải viết lại.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveViewportCommand } from "./keys";
import type { KeyLike, Point, Rect, Size, Viewport, ViewportCommand } from "./types";
import {
  IDENTITY,
  actualSize as actualSizeOf,
  applyCommand,
  clampScale,
  fitRect,
  panBy as panByPure,
  sameViewport,
  toScreen as toScreenPure,
  toWorld as toWorldPure,
  zoomAt as zoomAtPure,
} from "./viewport";

export interface UseViewportOptions {
  /** Khung nhìn ban đầu. Mặc định 100%, không dời. */
  initial?: Viewport;
  /** Bbox THẾ GIỚI của toàn bộ nội dung — nguồn cho `⌘1`. Trả `null` khi trống. */
  getContentRect?: () => Rect | null;
  /** Bbox THẾ GIỚI của vật đang chọn — nguồn cho `⌘2`. Trả `null` khi chưa chọn gì. */
  getSelectionRect?: () => Rect | null;
  /** Lề khi fit (pixel màn hình). */
  fitPadding?: number;
  /** Báo mỗi lần khung nhìn đổi (để màn tự lưu nháp). Phải ổn định hoặc dùng ref. */
  onChange?: (vp: Viewport) => void;
  /** Tắt cử chỉ chuột nhưng vẫn giữ bàn phím (ví dụ khi đang mở dialog). */
  disabled?: boolean;
}

export interface UseViewportResult {
  viewport: Viewport;
  /** % để hiện trên thanh công cụ: `Math.round(k * 100)`. */
  zoomPercent: number;
  containerSize: Size;
  /** Gắn vào phần tử BỌC NGOÀI (phần tử bị cắt), không phải lớp nội dung. */
  containerRef: (node: HTMLElement | null) => void;
  /** `transform` CSS cho lớp nội dung; nhớ đặt `transform-origin: 0 0`. */
  transform: string;
  isPanning: boolean;
  /** Space đang giữ ⇒ màn đổi con trỏ sang `grab` (gợi ý thị giác). */
  isSpaceHeld: boolean;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (nextK: number, anchor: Point) => void;
  zoomBy: (factor: number, anchor?: Point) => void;
  /** Về 100%, giữ tâm khung (⌘0). */
  actualSize: () => void;
  /** Fit một bbox bất kỳ; `null`/rỗng được xử lý an toàn (không NaN, không ném lỗi). */
  fit: (rect: Rect | null) => void;
  fitAll: () => void;
  fitSelection: () => void;
  /** Về đúng khung nhìn ban đầu. */
  reset: () => void;
  setViewport: (vp: Viewport) => void;
  toWorld: (screen: Point) => Point;
  toScreen: (world: Point) => Point;
  /** Chạy một lệnh bàn phím đã giải mã (dùng cho nút trên thanh công cụ). */
  run: (cmd: ViewportCommand) => void;
  /** Gắn vào `onKeyDown` của khung; trả `true` nếu đã xử lý (đã preventDefault). */
  onKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Cử chỉ chuột — ⚠️ khối sẽ bị `@use-gesture` thay ở FE-3. */
  bindPointer: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

const ZERO_SIZE: Size = { width: 0, height: 0 };

/** Chuột giữa (button 1) hoặc chuột trái khi đang giữ Space ⇒ đây là thao tác PAN. */
const isPanGesture = (e: React.PointerEvent, spaceHeld: boolean) =>
  e.button === 1 || (e.button === 0 && spaceHeld);

export function useViewport(options: UseViewportOptions = {}): UseViewportResult {
  const { initial = IDENTITY, disabled = false } = options;

  const [viewport, setViewportState] = useState<Viewport>(() => ({
    ...initial,
    k: clampScale(initial.k),
  }));
  const [containerSize, setContainerSize] = useState<Size>(ZERO_SIZE);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const elRef = useRef<HTMLElement | null>(null);
  const vpRef = useRef(viewport);
  vpRef.current = viewport;
  // Giữ callback trong ref: người gọi hiếm khi memo hoá, không thể để chúng
  // làm hỏng danh sách phụ thuộc của effect gắn `wheel`.
  const optRef = useRef(options);
  optRef.current = options;
  const spaceRef = useRef(false);
  spaceRef.current = isSpaceHeld;
  const sizeRef = useRef(containerSize);
  sizeRef.current = containerSize;

  const commit = useCallback((next: Viewport) => {
    const cur = vpRef.current;
    if (sameViewport(cur, next)) return; // chặn re-render vô ích
    vpRef.current = next;
    setViewportState(next);
    optRef.current.onChange?.(next);
  }, []);

  /* ── Đo khung chứa ─────────────────────────────────────────────────────────
   * ResizeObserver được gắn NGAY trong callback ref (không dùng useEffect) vì effect
   * chạy sau khi ref đã set nhưng ta cần huỷ observer cũ đúng lúc node bị thay.
   * Môi trường không có ResizeObserver (test node, trình duyệt rất cũ) ⇒ vẫn đo được
   * một lần, KHÔNG ném lỗi làm trắng trang. */
  const roRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((node: HTMLElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    elRef.current = node;
    if (!node) {
      setContainerSize(ZERO_SIZE);
      return;
    }
    const measure = () => {
      const r = node.getBoundingClientRect();
      setContainerSize((prev) =>
        prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      roRef.current = ro;
    }
  }, []);

  useEffect(() => () => roRef.current?.disconnect(), []);

  /** Đổi toạ độ trang → toạ độ trong khung chứa (mọi phép neo đều dùng hệ này). */
  const localPoint = useCallback((clientX: number, clientY: number): Point => {
    const node = elRef.current;
    if (!node) return { x: clientX, y: clientY };
    const r = node.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  const panBy = useCallback((dx: number, dy: number) => commit(panByPure(vpRef.current, dx, dy)), [commit]);
  const zoomAt = useCallback(
    (nextK: number, anchor: Point) => commit(zoomAtPure(vpRef.current, nextK, anchor)),
    [commit],
  );
  const centerAnchor = useCallback(
    (): Point => ({ x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }),
    [],
  );
  const zoomBy = useCallback(
    (factor: number, anchor?: Point) => zoomAt(vpRef.current.k * factor, anchor ?? centerAnchor()),
    [zoomAt, centerAnchor],
  );
  const actualSize = useCallback(
    () => commit(actualSizeOf(vpRef.current, sizeRef.current)),
    [commit],
  );
  const fit = useCallback(
    (rect: Rect | null) => commit(fitRect(rect, sizeRef.current, optRef.current.fitPadding)),
    [commit],
  );
  /**
   * Thi hành lệnh khung nhìn. Toàn bộ quyết định nằm ở `applyCommand` (thuần, test được
   * không cần DOM); ở đây chỉ gom bối cảnh và commit.
   */
  const run = useCallback(
    (cmd: ViewportCommand) => {
      const o = optRef.current;
      commit(
        applyCommand(vpRef.current, cmd, {
          size: sizeRef.current,
          contentRect: o.getContentRect?.() ?? null,
          selectionRect: o.getSelectionRect?.() ?? null,
          fitPadding: o.fitPadding,
        }),
      );
    },
    [commit],
  );

  const reset = useCallback(
    () => commit({ ...(optRef.current.initial ?? IDENTITY), k: clampScale((optRef.current.initial ?? IDENTITY).k) }),
    [commit],
  );
  const setViewport = useCallback(
    (vp: Viewport) => commit({ x: vp.x, y: vp.y, k: clampScale(vp.k) }),
    [commit],
  );

  const fitAll = useCallback(() => run({ type: "fitAll" }), [run]);
  const fitSelection = useCallback(() => run({ type: "fitSelection" }), [run]);

  /* ── Bàn phím: 100% thao tác có đường bàn phím (a11y §5.8) ───────────────── */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (e.key === " " || e.code === "Space") {
        if (!spaceRef.current) setIsSpaceHeld(true);
        e.preventDefault(); // không để trang cuộn
        return true;
      }
      const cmd = resolveViewportCommand(e as unknown as KeyLike);
      if (!cmd) return false;
      e.preventDefault();
      run(cmd);
      return true;
    },
    [run],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const up = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") setIsSpaceHeld(false);
    };
    // Nhả Space ngoài khung / mất focus tab ⇒ vẫn phải bỏ chế độ kéo, nếu không
    // con trỏ kẹt ở "grab" mãi mãi.
    const blur = () => setIsSpaceHeld(false);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  /* ── ⚠️ CỬ CHỈ CHUỘT — khối sẽ bị @use-gesture thay ở FE-3 ────────────────── */
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const bindPointer = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (disabled || !isPanGesture(e, spaceRef.current)) return;
        dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        setIsPanning(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.preventDefault();
      },
      onPointerMove: (e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.id !== e.pointerId) return;
        panBy(e.clientX - d.x, e.clientY - d.y);
        dragRef.current = { id: d.id, x: e.clientX, y: e.clientY };
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (dragRef.current?.id !== e.pointerId) return;
        dragRef.current = null;
        setIsPanning(false);
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      },
      onPointerCancel: () => {
        dragRef.current = null;
        setIsPanning(false);
      },
    }),
    [disabled, panBy],
  );

  // `wheel` phải gắn tay với `passive: false` — React đặt onWheel ở mức document
  // dạng passive nên `preventDefault()` trong JSX prop KHÔNG chặn được zoom của trình duyệt.
  useEffect(() => {
    const node = elRef.current;
    if (!node || disabled) return;
    const onWheel = (e: WheelEvent) => {
      const anchor = localPoint(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) {
        // ctrlKey do trình duyệt tự đặt khi pinch trackpad ⇒ ca pinch chạy đúng đường này.
        e.preventDefault();
        zoomAt(vpRef.current.k * Math.exp(-e.deltaY / 300), anchor);
        return;
      }
      e.preventDefault();
      panBy(-e.deltaX, -e.deltaY);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [disabled, localPoint, panBy, zoomAt, containerSize.width, containerSize.height]);

  const transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`;

  return {
    viewport,
    zoomPercent: Math.round(viewport.k * 100),
    containerSize,
    containerRef,
    transform,
    isPanning,
    isSpaceHeld,
    panBy,
    zoomAt,
    zoomBy,
    actualSize,
    fit,
    fitAll,
    fitSelection,
    reset,
    setViewport,
    toWorld: useCallback((p: Point) => toWorldPure(vpRef.current, p), []),
    toScreen: useCallback((p: Point) => toScreenPure(vpRef.current, p), []),
    run,
    onKeyDown,
    bindPointer,
  };
}
