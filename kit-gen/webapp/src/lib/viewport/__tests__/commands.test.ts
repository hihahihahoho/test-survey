/**
 * Test ĐƯỜNG BÀN PHÍM ĐẦY ĐỦ: phím → lệnh → khung nhìn mới.
 * Chạy qua đúng cặp hàm mà `useViewport().onKeyDown` gọi (`resolveViewportCommand` +
 * `applyCommand`), nên nó phủ được logic hook mà KHÔNG cần jsdom (repo chưa có jsdom
 * trong devDependencies — vitest.config.ts nói rõ, không giấu).
 *
 * Giới hạn trung thực: phần CHƯA phủ được ở đây là lớp vỏ React của hook
 * (ResizeObserver, pointer capture, listener `wheel` passive:false). Xem §"Chưa kiểm"
 * trong B1-REPORT.md.
 */
import { describe, expect, it } from "vitest";
import { applyCommand, toScreen, toWorld, MAX_K, MIN_K } from "../viewport";
import { resolveViewportCommand } from "../keys";
import type { KeyLike, Rect, Viewport } from "../types";

const SIZE = { width: 1200, height: 800 };
const CONTENT: Rect = { x: -200, y: -100, width: 2000, height: 1200 };
const SELECTION: Rect = { x: 400, y: 300, width: 200, height: 100 };
const START: Viewport = { x: 30, y: -40, k: 1.5 };

const press = (k: string, mod: Partial<KeyLike> = {}, vp: Viewport = START, ctx = {}) => {
  const cmd = resolveViewportCommand({
    key: k,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mod,
  });
  if (!cmd) return null;
  return applyCommand(vp, cmd, { size: SIZE, contentRect: CONTENT, selectionRect: SELECTION, ...ctx });
};

describe("phím → khung nhìn", () => {
  it("⌘0 về đúng 100%", () => {
    expect(press("0", { metaKey: true })?.k).toBe(1);
  });

  it("⌘1 fit toàn bộ nội dung vào khung", () => {
    const vp = press("1", { metaKey: true })!;
    const tl = toScreen(vp, { x: CONTENT.x, y: CONTENT.y });
    const br = toScreen(vp, { x: CONTENT.x + CONTENT.width, y: CONTENT.y + CONTENT.height });
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(SIZE.width + 1e-9);
    expect(br.y).toBeLessThanOrEqual(SIZE.height + 1e-9);
  });

  it("⌘2 fit vật đang chọn, tâm vật rơi đúng tâm khung", () => {
    const vp = press("2", { metaKey: true })!;
    const c = toScreen(vp, { x: 500, y: 350 });
    expect(c.x).toBeCloseTo(600, 6);
    expect(c.y).toBeCloseTo(400, 6);
  });

  it("⌘2 khi CHƯA CHỌN GÌ ⇒ hành xử như ⌘1 (không có phím chết)", () => {
    const a = press("2", { metaKey: true }, START, { selectionRect: null })!;
    const b = press("1", { metaKey: true })!;
    expect(a).toEqual(b);
  });

  it("⌘1 khi canvas TRỐNG ⇒ về khung nhìn gốc, không NaN", () => {
    const vp = press("1", { metaKey: true }, START, { contentRect: null })!;
    expect(vp).toEqual({ x: 0, y: 0, k: 1 });
  });

  it("⌘= / ⌘- neo tại TÂM KHUNG (không có con trỏ thì tâm là lựa chọn duy nhất đúng)", () => {
    const centerWorld = toWorld(START, { x: 600, y: 400 });
    const zin = press("=", { metaKey: true })!;
    expect(zin.k).toBeCloseTo(START.k * 1.2, 9);
    const after = toScreen(zin, centerWorld);
    expect(Math.abs(after.x - 600)).toBeLessThan(0.5);
    expect(Math.abs(after.y - 400)).toBeLessThan(0.5);
  });

  it("nhấn ⌘= liên tục dừng ở 400%, ⌘- liên tục dừng ở 10%", () => {
    let vp: Viewport = START;
    for (let i = 0; i < 50; i++) vp = press("=", { metaKey: true }, vp)!;
    expect(vp.k).toBe(MAX_K);
    for (let i = 0; i < 100; i++) vp = press("-", { metaKey: true }, vp)!;
    expect(vp.k).toBe(MIN_K);
  });

  it("mũi tên cuộn 40px, ⇧ cuộn 200px, k không đổi", () => {
    const r = press("ArrowRight")!;
    expect(r).toEqual({ x: START.x - 40, y: START.y, k: START.k });
    const d = press("ArrowDown", { shiftKey: true })!;
    expect(d).toEqual({ x: START.x, y: START.y - 200, k: START.k });
  });

  it("phím không thuộc khung nhìn ⇒ không đổi gì (người gọi phải bỏ qua)", () => {
    expect(press("s", { metaKey: true })).toBeNull();
    expect(press("ArrowUp", { altKey: true })).toBeNull();
  });

  it("mọi thao tác chuột trong §2.4 đều có phím tương đương (a11y §5.8)", () => {
    // pan(chuột kéo) · zoom in/out(⌘cuộn) · 100% · fit tất cả · fit vật chọn
    const covered = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].every((k) => press(k) !== null);
    expect(covered).toBe(true);
    for (const k of ["=", "-", "0", "1", "2"]) {
      expect(press(k, { metaKey: true })).not.toBeNull();
    }
  });
});
