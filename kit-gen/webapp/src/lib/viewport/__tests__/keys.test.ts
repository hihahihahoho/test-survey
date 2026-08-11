/**
 * Test đường BÀN PHÍM (a11y §5.8 — 100% thao tác chuột phải có phím tương đương).
 * Bảng gốc: UI-SPEC-V2 §2.4.
 */
import { describe, expect, it } from "vitest";
import { PAN_STEP, PAN_STEP_FAST, VIEWPORT_SHORTCUTS, resolveViewportCommand } from "../keys";
import type { KeyLike } from "../types";

const key = (k: string, mod: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mod,
});

describe("zoom bằng phím", () => {
  it("⌘0 / ⌘1 / ⌘2 đúng lệnh", () => {
    expect(resolveViewportCommand(key("0", { metaKey: true }))).toEqual({ type: "actualSize" });
    expect(resolveViewportCommand(key("1", { metaKey: true }))).toEqual({ type: "fitAll" });
    expect(resolveViewportCommand(key("2", { metaKey: true }))).toEqual({ type: "fitSelection" });
  });

  it("Ctrl thay được ⌘ (người dùng Windows/Linux không phải học phím Mac)", () => {
    expect(resolveViewportCommand(key("1", { ctrlKey: true }))).toEqual({ type: "fitAll" });
  });

  it("⌘= và ⌘- (kèm biến thể + và _ khi giữ ⇧)", () => {
    expect(resolveViewportCommand(key("=", { metaKey: true }))).toEqual({ type: "zoomStep", direction: 1 });
    expect(resolveViewportCommand(key("+", { metaKey: true, shiftKey: true }))).toEqual({ type: "zoomStep", direction: 1 });
    expect(resolveViewportCommand(key("-", { metaKey: true }))).toEqual({ type: "zoomStep", direction: -1 });
    expect(resolveViewportCommand(key("_", { metaKey: true, shiftKey: true }))).toEqual({ type: "zoomStep", direction: -1 });
  });
});

describe("pan bằng mũi tên", () => {
  it("bước 40px, giữ ⇧ là 200px", () => {
    expect(resolveViewportCommand(key("ArrowRight"))).toEqual({ type: "pan", dx: -PAN_STEP, dy: 0 });
    expect(resolveViewportCommand(key("ArrowLeft", { shiftKey: true }))).toEqual({
      type: "pan",
      dx: PAN_STEP_FAST,
      dy: 0,
    });
    expect(PAN_STEP).toBe(40);
    expect(PAN_STEP_FAST).toBe(200);
  });

  it("hướng đúng: mũi tên xuống = nhìn xuống dưới = nội dung dịch lên", () => {
    expect(resolveViewportCommand(key("ArrowDown"))).toEqual({ type: "pan", dx: 0, dy: -PAN_STEP });
    expect(resolveViewportCommand(key("ArrowUp"))).toEqual({ type: "pan", dx: 0, dy: PAN_STEP });
  });
});

describe("không tranh phím với người khác", () => {
  it("⌥+mũi tên thuộc về CellGrid (di chuyển ô) ⇒ trả null", () => {
    expect(resolveViewportCommand(key("ArrowRight", { altKey: true }))).toBeNull();
  });

  it("phím thường / ⌘S / ⌘Z không phải việc của khung nhìn", () => {
    expect(resolveViewportCommand(key("a"))).toBeNull();
    expect(resolveViewportCommand(key("s", { metaKey: true }))).toBeNull();
    expect(resolveViewportCommand(key("z", { metaKey: true }))).toBeNull();
    expect(resolveViewportCommand(key("Tab"))).toBeNull();
    expect(resolveViewportCommand(key("3", { metaKey: true }))).toBeNull();
  });
});

describe("bảng phím tắt ⌘K (§9.3)", () => {
  it("mọi lệnh khung nhìn đều có một dòng mô tả tiếng Việt", () => {
    const text = VIEWPORT_SHORTCUTS.map((s) => s.keys).join(" ");
    for (const k of ["⌘ 0", "⌘ 1", "⌘ 2", "⌘ =", "⌘ -", "↑ ↓ ← →"]) {
      expect(text).toContain(k);
    }
    expect(VIEWPORT_SHORTCUTS.every((s) => s.label.trim().length > 0)).toBe(true);
  });
});
