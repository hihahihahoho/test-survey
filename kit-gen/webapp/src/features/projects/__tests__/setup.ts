/**
 * Vá những API mà jsdom KHÔNG có nhưng Radix cần.
 *
 * Không phải "làm cho test xanh": nếu thiếu, Radix ném `ResizeObserver is not
 * defined` NGAY LÚC MOUNT — nghĩa là ta không mount nổi component để kiểm gì
 * cả. Trình duyệt thật có sẵn cả ba API này.
 */
import { vi } from "vitest";

if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!("DOMRect" in globalThis)) {
  class FakeDOMRect {
    top = 0; left = 0; right = 0; bottom = 0;
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
    static fromRect() { return new FakeDOMRect(); }
    toJSON() { return {}; }
  }
  (globalThis as Record<string, unknown>).DOMRect = FakeDOMRect;
}

// Radix Dialog/Select gọi các API này khi mở overlay.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom in "Not implemented: Window's scrollTo()" ra stderr mỗi lần Radix khoá
// cuộn khi mở modal — vô hại nhưng làm log test không đọc được.
(window as unknown as Record<string, unknown>).scrollTo = vi.fn();
