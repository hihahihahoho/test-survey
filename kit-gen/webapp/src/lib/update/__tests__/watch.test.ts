/**
 * CHÍNH SÁCH TỰ DÒ BẢN MỚI — hai luật dễ bị "sửa cho tiện" nhất được khoá ở đây:
 *  ① hỏi lại thường xuyên ≠ nhắc lại thường xuyên (mỗi bản nói ĐÚNG MỘT LẦN mỗi phiên);
 *  ② "chưa kiểm tra được" (mất mạng) KHÔNG BAO GIỜ được biến thành một câu thông báo.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { UpdateCheck } from "../../api/endpoints";
import {
  UPDATE_FOCUS_THROTTLE_MS, UPDATE_POLL_INTERVAL_MS,
  _resetUpdateWatch, markUpdateAnnounced, shouldAnnounceUpdate,
} from "../watch";

const check = (o: Partial<UpdateCheck> = {}): UpdateCheck => ({
  ok: true,
  currentVersion: "2.1.18",
  latestVersion: "2.1.19",
  tag: "kitgen-v2.1.19",
  available: true,
  updateCommand: "~/.kitgen/bin/kitgen update",
  checkedAt: new Date().toISOString(),
  ...o,
});

beforeEach(() => {
  _resetUpdateWatch();
});

describe("nhịp hỏi lại", () => {
  it("30 phút cho nhịp nền, 5 phút cho sàn quay-lại-tab", () => {
    expect(UPDATE_POLL_INTERVAL_MS).toBe(30 * 60 * 1000);
    expect(UPDATE_FOCUS_THROTTLE_MS).toBe(5 * 60 * 1000);
    // Sàn focus PHẢI nhỏ hơn nhịp nền, nếu không quay lại tab chẳng bao giờ hỏi được.
    expect(UPDATE_FOCUS_THROTTLE_MS).toBeLessThan(UPDATE_POLL_INTERVAL_MS);
  });
});

describe("shouldAnnounceUpdate", () => {
  it("có bản mới ⇒ nói, và chỉ nói MỘT LẦN cho mỗi bản", () => {
    const c = check();
    expect(shouldAnnounceUpdate(c)).toBe(true);
    markUpdateAnnounced(c.latestVersion);
    // 30 phút sau query hỏi lại và trả về đúng dữ liệu đó — KHÔNG được nhắc lần hai.
    expect(shouldAnnounceUpdate(check())).toBe(false);
  });

  it("bản mới HƠN NỮA ra sau đó thì lại nói (đây là tin mới, không phải nhắc lại)", () => {
    markUpdateAnnounced("2.1.19");
    expect(shouldAnnounceUpdate(check({ latestVersion: "2.2.0" }))).toBe(true);
  });

  it("đang mới nhất ⇒ im", () => {
    expect(shouldAnnounceUpdate(check({ available: false, latestVersion: "2.1.18" }))).toBe(false);
  });

  it("mất mạng (`ok:false`) ⇒ im — 'chưa kiểm tra được' không phải tin tức", () => {
    expect(shouldAnnounceUpdate(check({ ok: false, available: false, latestVersion: null, reason: "OFFLINE" })))
      .toBe(false);
  });

  it("chưa hỏi xong ⇒ im", () => {
    expect(shouldAnnounceUpdate(undefined)).toBe(false);
  });

  it("`available` mà không có số hiệu bản ⇒ im (câu thông báo sẽ rỗng nghĩa)", () => {
    expect(shouldAnnounceUpdate(check({ latestVersion: null }))).toBe(false);
  });

  it("đang cài dở ⇒ im: đã có lớp phủ toàn trang, toast chỉ là nhiễu", () => {
    expect(shouldAnnounceUpdate(check(), { installing: true })).toBe(false);
  });

  it("nhận `seen` tiêm vào được ⇒ luật kiểm được mà không phụ thuộc state module", () => {
    expect(shouldAnnounceUpdate(check(), { seen: new Set(["2.1.19"]) })).toBe(false);
    expect(shouldAnnounceUpdate(check(), { seen: new Set() })).toBe(true);
  });
});
