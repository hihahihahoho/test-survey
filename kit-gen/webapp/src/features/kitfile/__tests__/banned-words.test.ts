import { describe, expect, it } from "vitest";
import { groupByFile, scanBannedWords } from "./banned-scan";

/**
 * S1 — CỔNG TỪ CẤM §5.4.
 *
 * 🚩 NÓI THẬT TRƯỚC KHI ĐỌC SỐ: FE3-PLAN §3-S1 đặt tiêu chí "**0 từ cấm** trong `features/**`
 * ngoài `design/**` và ngoài khối `<details>`". Đo thật lúc S1 chạy: **không phải 0**.
 * Toàn bộ số dư nằm ở màn của FE-1/FE-2 mà FE-3 **chưa viết lại** (và S1 **không được sửa** —
 * ngoài glob, FE3-PLAN §1.2-1). Đặt cổng ở "0 ngay bây giờ" nghĩa là S1 đỏ vì việc của người khác,
 * và người sau sẽ xoá cổng thay vì sửa chữ. Nên cổng này làm hai việc:
 *   (1) **0 tuyệt đối** trong vùng S1 sở hữu — kiểm được ngay, không có ngoại lệ;
 *   (2) **BÁNH CÓC** cho phần còn lại: số hiện tại là trần, chỉ được giảm. Nhánh nào viết lại màn
 *       theo UX-V3 sẽ tự kéo số xuống; nhánh nào thêm chữ kỹ thuật mới sẽ đỏ ngay.
 * Số trần dưới đây là **số đo thật** lúc S1 kết thúc, không phải số ước.
 */
const hits = scanBannedWords("src/features");

/**
 * TRẦN = SỐ ĐO THẬT lúc S1 chạy (2026-08-07): **300** chỗ trúng / 89 file.
 * Cố ý viết bằng SỐ CỨNG chứ không phải `hits.length` — nếu lấy `hits.length` thì cổng
 * tự so với chính nó và KHÔNG BAO GIỜ đỏ được, tức là một cổng giả.
 * Ai kéo số xuống thì HẠ luôn trần này (và ghi vào report của mình).
 */
const BASELINE_TOTAL = 300;

describe("§5.4 — vùng S1 sở hữu: 0 từ cấm, không ngoại lệ", () => {
  it("features/kitfile/** hoàn toàn sạch", () => {
    const mine = hits.filter((h) => h.file.includes("src/features/kitfile/"));
    expect(mine.map((h) => `${h.file}: «${h.text}» chứa «${h.word}»`)).toEqual([]);
  });
});

describe("§5.4 — bánh cóc cho phần còn lại của features/**", () => {
  it(`tổng số chỗ trúng không được VƯỢT trần đã đo (${BASELINE_TOTAL})`, () => {
    // Trần này bằng chính số đo hiện tại ⇒ ca duy nhất làm đỏ là ai đó THÊM chữ kỹ thuật mới.
    expect(hits.length).toBeLessThanOrEqual(BASELINE_TOTAL);
  });

  it("bộ quét thật sự chạy và thật sự tìm được thứ gì đó (chống cổng rỗng)", () => {
    // Nếu bộ quét hỏng (đường dẫn sai, regex hỏng) nó sẽ trả 0 và mọi cổng trên đều xanh giả.
    // Ca này bắt đúng tình huống đó.
    expect(hits.length).toBeGreaterThan(0);
    expect(Object.keys(groupByFile(hits)).length).toBeGreaterThan(0);
  });

  it("mọi chỗ trúng đều có đủ file + từ + trích đoạn để người sau sửa được", () => {
    for (const h of hits.slice(0, 50)) {
      expect(h.file).toMatch(/^src\/features\//);
      expect(h.word.length).toBeGreaterThan(0);
      expect(typeof h.text).toBe("string");
    }
  });

  it("KHÔNG quét features/design/** — đó là màn «Nâng cao», được phép dùng chữ kỹ thuật (§0-L3)", () => {
    expect(hits.filter((h) => h.file.includes("/design/"))).toEqual([]);
  });
});
