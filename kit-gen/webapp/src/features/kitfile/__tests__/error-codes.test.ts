/**
 * S1 — năm mã lỗi mà UX-V3 §6 đòi cho các ca mới của FE-3.
 *
 * 🚩 KẾT QUẢ ĐO TRÁI VỚI KẾ HOẠCH — nói ra thay vì âm thầm làm theo:
 * FE3-PLAN §1.2-2 cấp cho S ngoại lệ được **THÊM** `KIT_NOT_CUT`, `IMAGEGEN_UNAVAILABLE`,
 * `RUN_ACTIVE`, `CONTRACT_INVALID`, `PROJECT_ID_TAKEN` vào `ERROR_TABLE`. Đo thật:
 * **cả 5 mã ĐÃ CÓ SẴN** từ FE-1 (`lib/api/errors.ts`, và `lib/api/__tests__/errors.test.ts`
 * đã liệt kê chúng trong `REQUIRED_CODES`). Vậy nên S1 **KHÔNG sửa một byte nào** của
 * `errors.ts` — thêm entry trùng chỉ để "làm đúng chữ kế hoạch" là đè lên copy đã qua QA.
 *
 * File này là phần việc CÒN LẠI và thật sự có giá trị: khoá 5 mã đó ở đúng thứ FE-3 cần —
 * có entry, có việc-cần-làm, và **không lộ `error.message`** ra thân UI (UX-V3 §6 quy tắc chung).
 */
import { describe, expect, it } from "vitest";
import { ERROR_TABLE, devDetails, isKnownCode, presentError } from "@/lib/api/errors";
import { MSG } from "../lib/copy";

/** Năm mã của UX-V3 §6 «Quy tắc chung». */
const FE3_CODES = [
  "KIT_NOT_CUT",
  "IMAGEGEN_UNAVAILABLE",
  "RUN_ACTIVE",
  "CONTRACT_INVALID",
  "PROJECT_ID_TAKEN",
] as const;

describe("5 mã lỗi FE-3 — đã có entry (không cần thêm mới)", () => {
  for (const code of FE3_CODES) {
    it(`${code} có entry trong ERROR_TABLE`, () => {
      expect(isKnownCode(code)).toBe(true);
      expect(ERROR_TABLE[code]).toBeDefined();
    });
  }

  for (const code of FE3_CODES) {
    it(`${code} ánh xạ ra tiêu đề + việc cần làm`, () => {
      const v = presentError({ code });
      expect(v.known).toBe(true);
      expect(v.title.trim().length).toBeGreaterThan(0);
      expect(v.explain.trim().length).toBeGreaterThan(0);
      expect(v.where.length).toBeGreaterThan(0);
    });
  }
});

describe("LUẬT: thân UI KHÔNG BAO GIỜ chứa error.message", () => {
  const leak = "TypeError: Failed to fetch at http://127.0.0.1:8787/api/projects/x";
  for (const code of FE3_CODES) {
    it(`${code}: presentError không mang message kỹ thuật đi theo`, () => {
      const v = presentError({ code, message: leak });
      expect(JSON.stringify(v)).not.toContain(leak);
      expect(v).not.toHaveProperty("message");
    });
  }

  it("message kỹ thuật CHỈ đọc được qua devDetails — chỗ của panel «Chi tiết cho lập trình viên»", () => {
    expect(devDetails({ code: "RUN_ACTIVE", message: leak })).toContain(leak);
    expect(MSG.DEV_DETAILS).toBe("Chi tiết cho lập trình viên");
  });

  it("mã gốc cũng không lọt vào tiêu đề/giải thích hiện ra UI", () => {
    for (const code of FE3_CODES) {
      const v = presentError({ code });
      expect(`${v.title} ${v.explain}`).not.toContain(code);
    }
  });
});

describe("ca dữ liệu xấu — không màn trắng", () => {
  it("mã lạ vẫn trả object dùng được, KHÔNG ném", () => {
    const v = presentError({ code: "KG_MÃ_KHÔNG_CÓ_THẬT" });
    expect(v.known).toBe(false);
    expect(v.title.length).toBeGreaterThan(0);
  });
});
