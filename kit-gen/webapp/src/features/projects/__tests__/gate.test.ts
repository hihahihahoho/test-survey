/**
 * §4.9 MA TRẬN "hành vi khi agent chưa chạy".
 *
 * Bài học QA-UX CAO-01: bản cũ hiện "Trình duyệt đang chặn" cho ca mà THẬT RA
 * chính agent từ chối (403 ORIGIN_NOT_ALLOWED) ⇒ user đi tắt ad-blocker vô ích.
 * Test này khoá lại: mỗi ca kết nối phải ra ĐÚNG câu giải thích của nó.
 */
import { describe, expect, it } from "vitest";
import { checkingStatus, type ConnectionStatus } from "@/lib/api";
import { disabledProps, gateOf } from "../lib/gate";

const st = (over: Partial<ConnectionStatus>): ConnectionStatus =>
  ({ ...checkingStatus(null), ...over }) as ConnectionStatus;

describe("gateOf — khoá đúng và NÓI ĐÚNG lý do", () => {
  it("kết nối tốt ⇒ không khoá gì", () => {
    const g = gateOf(st({ pill: "connected", connected: true, readOnly: false, case: "none" }));
    expect(g.readOnly).toBe(false);
    expect(g.reason).toBe("");
  });

  it("imagegen-unavailable VẪN cho CRUD (chỉ sinh ảnh bị chặn, ở màn khác)", () => {
    const g = gateOf(st({ pill: "imagegen-unavailable", connected: true, readOnly: false, case: "none" }));
    expect(g.readOnly).toBe(false);
  });

  it("agent chưa chạy ⇒ khoá + bảo mở Terminal", () => {
    const g = gateOf(st({ pill: "not-found", connected: false, readOnly: true, case: "agent-not-running" }));
    expect(g.readOnly).toBe(true);
    expect(g.reason).toBe("Cần công cụ local đang chạy");
    expect(g.longReason).toContain("Terminal");
  });

  it("CAO-01: agent TRẢ LỖI ⇒ KHÔNG được đổ tội cho trình duyệt", () => {
    const g = gateOf(
      st({ pill: "not-found", connected: false, readOnly: true, case: "agent-http-error", code: "ORIGIN_NOT_ALLOWED" }),
    );
    expect(g.longReason).toContain("Trình duyệt không chặn gì");
    expect(g.reason).not.toContain("Trình duyệt đang chặn");
  });

  it("trình duyệt CHẶN THẬT (đã có bằng chứng cầu dò) ⇒ mới được nói vậy", () => {
    const g = gateOf(st({ pill: "blocked-by-browser", connected: false, readOnly: true, case: "blocked-by-browser" }));
    expect(g.reason).toBe("Trình duyệt đang chặn kết nối");
    expect(g.longReason).toContain("bản chạy tại máy");
  });

  it("chưa kết luận được ⇒ copy KHÔNG khẳng định bên nào có lỗi", () => {
    const g = gateOf(st({ pill: "not-found", connected: false, readOnly: true, case: "unreachable-ambiguous" }));
    expect(g.longReason).toContain("Chưa rõ");
  });

  it("đang kiểm tra ⇒ khoá tạm, nói rõ là đang kiểm tra", () => {
    const g = gateOf(checkingStatus(null));
    expect(g.readOnly).toBe(true);
    expect(g.reason).toContain("Đang kiểm tra");
  });
});

describe("disabledProps — §2.5-2: disabled + aria-disabled + TOOLTIP, không ẩn nút", () => {
  it("khi khoá: có đủ 3 thứ", () => {
    const p = disabledProps(gateOf(st({ pill: "not-found", readOnly: true, connected: false, case: "agent-not-running" })));
    expect(p.disabled).toBe(true);
    expect(p["aria-disabled"]).toBe(true);
    expect(p.title).toBeTruthy();
  });
  it("khi bình thường: không để lại title rác", () => {
    const p = disabledProps(gateOf(st({ pill: "connected", connected: true, readOnly: false, case: "none" })));
    expect(p.disabled).toBe(false);
    expect(p.title).toBeUndefined();
  });
});

describe("mọi câu lý do đều ≤48 ký tự (§5.5 tooltip)", () => {
  const cases: ConnectionStatus["case"][] = [
    "agent-not-running", "blocked-by-browser", "agent-http-error", "unreachable-ambiguous", "protocol-mismatch",
  ];
  for (const c of cases) {
    it(`«${c}»`, () => {
      const g = gateOf(st({ pill: "not-found", connected: false, readOnly: true, case: c }));
      expect(g.reason.length).toBeLessThanOrEqual(48);
    });
  }
});
