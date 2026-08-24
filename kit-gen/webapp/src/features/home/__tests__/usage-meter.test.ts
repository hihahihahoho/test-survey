/**
 * Thanh "quota Codex còn lại" — phần SUY DIỄN.
 *
 * Ba thứ bộ này canh, theo đúng thứ tự quan trọng:
 *  1. KHÔNG bịa số — chưa biết thì trả `null` để UI ẩn hẳn, không vẽ 0%.
 *  2. Chọn ĐÚNG cửa sổ: cái còn ÍT nhất, vì đó mới là cái sắp chặn người dùng.
 *  3. Nói ra sự thật khó chịu: số này cũ bằng lượt chạy Codex gần nhất.
 */
import { describe, expect, it } from "vitest";
import { tightestWindow, usageView } from "../lib/usage-meter";
import type { Usage } from "@/lib/types/api";

/** Hình dạng THẬT của `GET /api/usage` khi tài khoản gói plus, cửa sổ tuần. */
const WEEKLY: Usage = {
  ok: true,
  codexHomeLabel: "~/.codex",
  profile: "default-home",
  plan: "plus",
  primary: { usedPercent: 2, remainingPercent: 98, windowMinutes: 10080, resetsAt: "2026-08-20T06:30:28.000Z" },
  secondary: null,
  observedAt: "2026-08-13T09:00:24.138Z",
  checkedAt: "2026-08-13T09:33:08.309Z",
};

const NOW = Date.parse("2026-08-13T09:05:00.000Z");

describe("usageView — chưa biết thì KHÔNG vẽ gì", () => {
  it("agent chưa trả dữ liệu (undefined) ⇒ null", () => {
    expect(usageView(undefined)).toBeNull();
    expect(usageView(null)).toBeNull();
  });

  it("ok:false (chưa chạy lượt nào / provider không trả rate limit) ⇒ null, KHÔNG phải 0%", () => {
    const v = usageView({ ok: false, reason: "NO_DATA", primary: null, secondary: null });
    expect(v).toBeNull();
  });

  it("ok:true nhưng thiếu cả hai cửa sổ ⇒ vẫn null", () => {
    expect(usageView({ ok: true, primary: null, secondary: null })).toBeNull();
  });
});

describe("usageView — số và chữ", () => {
  it("cửa sổ tuần 98% còn lại: đúng số, đúng danh từ, đúng mốc đặt lại", () => {
    const v = usageView(WEEKLY, NOW)!;
    expect(v.remainingPercent).toBe(98);
    expect(v.remainingLabel).toBe("còn 98%");
    expect(v.windowLabel).toBe("tuần");
    expect(v.title).toBe("Hạn mức tuần");
    expect(v.resetLabel).toContain("đặt lại 20/08/2026");
    expect(v.tone).toBe("ok");
  });

  it("nhãn chi tiết NÓI RA mốc quan sát — số này cũ bằng lượt chạy cuối", () => {
    const v = usageView(WEEKLY, NOW)!;
    expect(v.observedLabel).toContain("số đọc lúc");
    expect(v.detail).toContain(v.observedLabel);
    expect(v.detail).toContain("còn 98%");
  });

  it("không có resetsAt ⇒ bỏ hẳn vế đặt lại, không bịa ngày", () => {
    const v = usageView({ ...WEEKLY, primary: { ...WEEKLY.primary!, resetsAt: null } }, NOW)!;
    expect(v.resetLabel).toBeNull();
    expect(v.detail).not.toContain("đặt lại");
  });

  it("danh từ cửa sổ suy từ SỐ PHÚT, không hardcode", () => {
    const at = (windowMinutes: number) =>
      usageView({ ...WEEKLY, primary: { ...WEEKLY.primary!, windowMinutes } }, NOW)!.windowLabel;
    expect(at(10080)).toBe("tuần");
    expect(at(20160)).toBe("2 tuần");
    expect(at(1440)).toBe("ngày");
    expect(at(300)).toBe("5 giờ");
    expect(at(45)).toBe("45 phút");
  });

  it("phần trăm luôn bị kẹp về [0,100] dù server trả số lạ", () => {
    const at = (remainingPercent: number) =>
      usageView({ ...WEEKLY, primary: { ...WEEKLY.primary!, remainingPercent } }, NOW)!.remainingPercent;
    expect(at(-5)).toBe(0);
    expect(at(140)).toBe(100);
  });

  it("tone theo ngưỡng, nhưng phần trăm LUÔN có mặt thành chữ (A3 — màu không là tin duy nhất)", () => {
    const at = (remainingPercent: number) => usageView({ ...WEEKLY, primary: { ...WEEKLY.primary!, remainingPercent } }, NOW)!;
    expect(at(60).tone).toBe("ok");
    expect(at(25).tone).toBe("warn");
    expect(at(8).tone).toBe("danger");
    for (const p of [60, 25, 8]) expect(at(p).remainingLabel).toBe(`còn ${p}%`);
  });
});

describe("tightestWindow — hiện cái SẮP HẾT, không hiện cái thoáng hơn", () => {
  const both: Usage = {
    ...WEEKLY,
    primary: { usedPercent: 2, remainingPercent: 98, windowMinutes: 10080, resetsAt: null },
    secondary: { usedPercent: 88, remainingPercent: 12, windowMinutes: 300, resetsAt: null },
  };

  it("tuần còn 98% mà 5 giờ chỉ còn 12% ⇒ lấy cửa sổ 5 giờ", () => {
    expect(tightestWindow(both)?.remainingPercent).toBe(12);
    const v = usageView(both, NOW)!;
    expect(v.windowLabel).toBe("5 giờ");
    expect(v.remainingLabel).toBe("còn 12%");
    expect(v.tone).toBe("warn");
  });

  it("chỉ có secondary ⇒ vẫn dùng được, không đòi primary", () => {
    expect(tightestWindow({ ...both, primary: null })?.remainingPercent).toBe(12);
  });
});
