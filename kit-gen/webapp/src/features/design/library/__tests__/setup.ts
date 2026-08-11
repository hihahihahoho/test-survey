/**
 * Vá API mà jsdom thiếu nhưng Radix cần (ResizeObserver, DOMRect, pointer capture).
 * Không có thì component ném ngay lúc mount — tức là không kiểm được gì cả.
 * Nội dung khớp `features/projects/__tests__/setup.ts` của S1 (cùng lý do, cùng nhu cầu);
 * để bản riêng vì brief cấm tôi import xuyên vào thư mục của team khác cho hạ tầng test.
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

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
(window as unknown as Record<string, unknown>).scrollTo = vi.fn();
