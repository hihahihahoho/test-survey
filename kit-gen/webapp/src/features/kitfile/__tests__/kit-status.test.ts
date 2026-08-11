/**
 * S1 — `deriveStatus`. Tiêu chí FE3-PLAN §3-S1: "phủ CẢ 5 CA + ca dữ liệu thiếu trường
 * (không được ném lỗi)". Chuỗi hiển thị so với UX-V3 §1.3.
 */
import { describe, expect, it } from "vitest";
import { KIT_STATUSES, deriveStatus, hasStatus, type KitStatusInput } from "../lib/kit-status";

/** Mốc thời gian cố định để chuỗi tương đối không phụ thuộc đồng hồ máy chạy test. */
const NOW = Date.parse("2026-08-07T12:00:00.000Z");
const HOURS_AGO_2 = "2026-08-07T10:00:00.000Z";

const drawn: KitStatusInput = { stats: { rawPresent: 4, lastRun: { at: HOURS_AGO_2 } } };

describe("5 ca của UX-V3 §1.3", () => {
  it("1 · đang vẽ ⇒ «Đang vẽ 2/6»", () => {
    const v = deriveStatus({ ...drawn, state: { activeRun: { done: 2, total: 6 } } }, NOW);
    expect(v.status).toBe("dang-ve");
    expect(v.label).toBe("Đang vẽ 2/6");
    expect(v.tone).toBe("running");
    expect(v.needsAction).toBe(false);
  });

  it("2 · xong ⇒ «Xong · 2 giờ trước»", () => {
    const v = deriveStatus(drawn, NOW);
    expect(v.status).toBe("xong");
    expect(v.label).toBe("Xong · 2 giờ trước");
    expect(v.tone).toBe("ok");
  });

  it("3 · chưa vẽ (rawPresent = 0) ⇒ «Chưa vẽ»", () => {
    const v = deriveStatus({ stats: { rawPresent: 0, jobs: 5 } }, NOW);
    expect(v.status).toBe("chua-ve");
    expect(v.label).toBe("Chưa vẽ");
    expect(v.needsAction).toBe(true);
  });

  it("4 · cần vẽ lại (stale) ⇒ «Cần vẽ lại»", () => {
    const v = deriveStatus({ ...drawn, state: { stale: true } }, NOW);
    expect(v.status).toBe("can-ve-lai");
    expect(v.label).toBe("Cần vẽ lại");
    expect(v.long).toBe("Bạn vừa sửa thiết kế, ảnh đang là bản cũ.");
  });

  it("5 · vẽ lỗi ⇒ «Vẽ lỗi 1 tấm» / «Vẽ lỗi 3 tấm»", () => {
    const one = deriveStatus({ ...drawn, state: { jobs: { "a-main": "failed" } } }, NOW);
    expect(one.status).toBe("ve-loi");
    expect(one.label).toBe("Vẽ lỗi 1 tấm");
    const three = deriveStatus(
      { ...drawn, state: { jobs: { a: "failed", b: "failed", c: "failed", d: "ok" } } },
      NOW
    );
    expect(three.label).toBe("Vẽ lỗi 3 tấm");
    expect(three.failedJobs).toBe(3);
  });

  it("mọi ca đều trả `status` nằm trong 5 giá trị đã chốt", () => {
    const samples: KitStatusInput[] = [
      {}, drawn,
      { ...drawn, state: { stale: true } },
      { ...drawn, state: { activeRun: { done: 0, total: 3 } } },
      { ...drawn, state: { jobs: { x: "failed" } } },
      { broken: true },
    ];
    for (const s of samples) expect(KIT_STATUSES).toContain(deriveStatus(s, NOW).status);
  });
});

describe("thứ tự ưu tiên đúng BA-V3 §1.4 (activeRun → chưa vẽ → stale → lỗi → xong)", () => {
  it("đang vẽ THẮNG stale và lỗi", () => {
    const v = deriveStatus(
      { ...drawn, state: { stale: true, jobs: { x: "failed" }, activeRun: { done: 1, total: 4 } } },
      NOW
    );
    expect(v.status).toBe("dang-ve");
    // ...nhưng KHÔNG giấu số tấm lỗi: màn vẫn hiện thêm ⚠ được.
    expect(v.failedJobs).toBeGreaterThan(0);
  });
  it("chưa vẽ THẮNG stale (chưa có ảnh thì nói «Chưa vẽ», không nói «Cần vẽ lại»)", () => {
    expect(deriveStatus({ stats: { rawPresent: 0 }, state: { stale: true } }, NOW).status).toBe("chua-ve");
  });
  it("stale THẮNG lỗi cũ", () => {
    expect(deriveStatus({ ...drawn, state: { stale: true, jobs: { x: "failed" } } }, NOW).status).toBe("can-ve-lai");
  });
  it("broken THẮNG tất cả và luôn có việc cần làm", () => {
    const v = deriveStatus({ broken: true, state: { activeRun: { done: 1, total: 2 } } }, NOW);
    expect(v.status).toBe("ve-loi");
    expect(v.needsAction).toBe(true);
  });
});

describe("dữ liệu thiếu/hỏng — KHÔNG ĐƯỢC NÉM, không màn trắng", () => {
  const junk: unknown[] = [
    null, undefined, {}, { stats: null }, { state: null },
    { stats: { rawPresent: -3 } },
    { stats: { rawPresent: "nhiều" } },
    { state: { activeRun: {} } },
    { state: { activeRun: { done: 9, total: 2 } } },
    { state: { jobs: "hỏng" } },
    { stats: { rawPresent: 2, lastRun: { at: "không-phải-ngày" } } },
    { stats: { rawPresent: 2, lastRun: null }, updatedAt: null },
  ];
  for (const [i, j] of junk.entries()) {
    it(`ca rác #${i + 1} không ném và vẫn có nhãn đọc được`, () => {
      expect(() => deriveStatus(j as KitStatusInput, NOW)).not.toThrow();
      const v = deriveStatus(j as KitStatusInput, NOW);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.long.length).toBeGreaterThan(0);
    });
  }

  it("object rỗng ⇒ «Chưa vẽ» (an toàn nhất: chưa có ảnh thì đừng nói đã xong)", () => {
    expect(deriveStatus({}, NOW).label).toBe("Chưa vẽ");
  });

  it("activeRun không có total ⇒ «Đang vẽ» trơn, KHÔNG bịa mẫu số", () => {
    const v = deriveStatus({ stats: { rawPresent: 1 }, state: { activeRun: { done: 3 } } }, NOW);
    expect(v.label).toBe("Đang vẽ");
    expect(v.label).not.toContain("/");
  });

  it("done > total ⇒ kẹp lại, không hiện «Đang vẽ 9/2»", () => {
    expect(deriveStatus({ state: { activeRun: { done: 9, total: 2 } } }, NOW).label).toBe("Đang vẽ 2/2");
  });

  it("xong nhưng không biết thời điểm ⇒ «Xong» trơn, KHÔNG bịa thời gian", () => {
    const v = deriveStatus({ stats: { rawPresent: 3 } }, NOW);
    expect(v.label).toBe("Xong");
    expect(v.label).not.toContain("—");
  });

  it("dùng `updatedAt` khi thiếu `lastRun.at`", () => {
    expect(deriveStatus({ stats: { rawPresent: 1 }, updatedAt: HOURS_AGO_2 }, NOW).label).toBe("Xong · 2 giờ trước");
  });

  it("`lastRun.fail` là nguồn dự phòng khi agent không trả `state.jobs`", () => {
    const v = deriveStatus({ stats: { rawPresent: 2, lastRun: { at: HOURS_AGO_2, fail: 2 } } }, NOW);
    expect(v.status).toBe("ve-loi");
    expect(v.label).toBe("Vẽ lỗi 2 tấm");
  });
});

describe("hasStatus — Home lọc chip mà không viết lại điều kiện", () => {
  it("khớp đúng trạng thái suy ra", () => {
    expect(hasStatus(drawn, "xong", NOW)).toBe(true);
    expect(hasStatus(drawn, "chua-ve", NOW)).toBe(false);
  });
});

describe("nhãn không chứa chữ kỹ thuật (UX-V3 §5.4)", () => {
  const cases: KitStatusInput[] = [
    {}, drawn, { broken: true },
    { ...drawn, state: { stale: true } },
    { ...drawn, state: { jobs: { x: "failed" } } },
    { ...drawn, state: { activeRun: { done: 1, total: 2 } } },
  ];
  it("không có `stale`, `job`, `run`, `project`, `sheet`", () => {
    for (const c of cases) {
      const v = deriveStatus(c, NOW);
      const text = `${v.label} ${v.long}`.toLowerCase();
      for (const w of ["stale", "job", "run", "project", "sheet", "contract", "variant"]) {
        expect(text, `«${text}»`).not.toContain(w);
      }
    }
  });
});
