/**
 * B2 — test THUẦN LOGIC cho file con đầu tiên (`lib/create-mode-firstdoc.ts`).
 *
 * Trọng tâm là quyết định đã chốt (FE2-PLAN §8-2): **doc lỗi ⇒ giữ project + Thử lại**.
 * Câu chữ nằm trong hàm thuần đúng để chỗ này khoá được nó mà không cần dựng DOM.
 */
import { describe, expect, it } from "vitest";
import { createIntent } from "../lib/create-mode";
import {
  FIRST_DOC_DELAY_MS,
  FIRST_DOC_NO_SHEETS_NOTE,
  SHEETS_WAIT_MS,
  firstDocCopy,
  firstDocInput,
  needsSheetIds,
  partialSuccessCopy,
} from "../lib/create-mode-firstdoc";

const wf = createIntent("basic", "workflow");
const cv = createIntent("basic", "canvas");

describe("payload gửi xuống docsRepo.create", () => {
  it("workflow + biết sheet ⇒ view lọc đúng các sheet đó, KHÔNG sao chép contract", () => {
    const input = firstDocInput(wf, ["main", "tall", "bg-home"]);
    expect(input).toEqual({
      name: "Bộ kit chính",
      kind: "workflow",
      view: { sheetIds: ["main", "tall", "bg-home"], variantIds: [] },
    });
    // `view` chỉ chứa ID — không có grid/components/prompt nào bị nhân bản.
    expect(JSON.stringify(input)).not.toMatch(/components|grid|prompt/);
  });

  it("workflow + CHƯA BIẾT sheet (null) ⇒ không bịa id, tạo file không có view", () => {
    const input = firstDocInput(wf, null);
    expect(input).toEqual({ name: "Bộ kit chính", kind: "workflow" });
    expect(input).not.toHaveProperty("view");
  });

  it("workflow + biết chắc RỖNG ([]) khác hẳn CHƯA BIẾT (null)", () => {
    expect(firstDocInput(wf, [])).toEqual({
      name: "Bộ kit chính",
      kind: "workflow",
      view: { sheetIds: [], variantIds: [] },
    });
  });

  it("canvas KHÔNG BAO GIỜ có view, kể cả khi biết sheet", () => {
    expect(firstDocInput(cv, ["main"])).toEqual({ name: "Bàn ý tưởng", kind: "canvas" });
  });

  it("mảng sheet được SAO CHÉP, sửa mảng gốc sau đó không đổi payload", () => {
    const ids = ["main"];
    const input = firstDocInput(wf, ids);
    ids.push("them-vao-sau");
    expect(input.view!.sheetIds).toEqual(["main"]);
  });

  it("chỉ file workflow mới cần đọc bản thiết kế", () => {
    expect(needsSheetIds(wf)).toBe(true);
    expect(needsSheetIds(cv)).toBe(false);
  });

  it("tên file lấy nguyên từ `firstDocPlan` của B1 — không có nguồn tên thứ hai", () => {
    expect(firstDocInput(wf, null).name).toBe(wf.firstDoc.name);
    expect(firstDocInput(cv, null).name).toBe(cv.firstDoc.name);
  });
});

describe("ca PARTIAL SUCCESS — project xong, file lỗi (FE2-PLAN §8-2)", () => {
  const c = partialSuccessCopy("Tết 2026", "Bàn ý tưởng");

  it("điều CHẮC CHẮN ĐÚNG đứng trước: project đã tạo", () => {
    expect(c.title).toBe("Đã tạo project «Tết 2026»");
    expect(c.reassure).toMatch(/không cần tạo lại project/);
  });

  it("nói rõ chỉ FILE hỏng, và nêu đúng tên file", () => {
    expect(c.whatFailed).toContain("«Bàn ý tưởng»");
    expect(c.whatFailed).toMatch(/Chỉ file đầu tiên/);
  });

  it("hai đường đi: thử lại chỉ tạo FILE, và đường lùi mở quy trình chuẩn", () => {
    expect(c.retryLabel).toBe("Thử tạo file lại");
    expect(c.fallbackLabel).toBe("Mở quy trình chuẩn");
  });

  /**
   * Chỉ chấp nhận cụm "tạo lại project" khi nó đi sau "không cần" — tức là câu TRẤN AN.
   * Bản đầu của test này bắt nhầm chính câu trấn an đó; giữ lại ghi chú để người sau
   * không "sửa" câu trấn an cho test xanh.
   */
  it("TUYỆT ĐỐI không hứa xoá / rollback project; nhắc tạo lại project chỉ để PHỦ ĐỊNH", () => {
    const all = [c.title, c.reassure, c.whatFailed, c.retryLabel, c.fallbackLabel].join(" ");
    expect(all).not.toMatch(/xoá project|xoá dự án|hoàn tác project|rollback|khôi phục lại project/i);
    expect(all.replace(/không cần tạo lại project/gi, "")).not.toMatch(/tạo lại project/i);
    expect(c.reassure).toMatch(/không cần tạo lại project/i);
  });

  it("copy KHÔNG chứa từ kỹ thuật (mã lỗi, IndexedDB, stack)", () => {
    const all = [c.title, c.reassure, c.whatFailed].join(" ");
    expect(all).not.toMatch(/IndexedDB|DOC_|STORAGE_|Error|undefined|null/);
  });
});

describe("copy khi thành công", () => {
  it("nói ĐÚNG chỗ file đang nằm, khác nhau giữa hai mode", () => {
    const a = firstDocCopy(cv, "Tết 2026");
    const b = firstDocCopy(wf, "Tết 2026");
    expect(a.successTitle).toBe("Đã tạo «Tết 2026» và file «Bàn ý tưởng»");
    expect(a.successBody).toMatch(/lưu trên máy bạn/);
    expect(a.successBody).toMatch(/Chưa tốn lượt sinh ảnh/); // L1: không hứa sinh ảnh
    expect(b.successBody).not.toBe(a.successBody);
  });

  it("ghi chú «chưa lọc sheet nào» chỉ ra đường an toàn «Tất cả sheet», không doạ người dùng", () => {
    expect(FIRST_DOC_NO_SHEETS_NOTE).toMatch(/Tất cả sheet/);
    expect(FIRST_DOC_NO_SHEETS_NOTE).not.toMatch(/lỗi|hỏng|thất bại/i);
  });
});

describe("hai hằng số thời gian có ý nghĩa, không phải số ngẫu nhiên", () => {
  it("trễ hiện hộp < trần chờ bản thiết kế, và trần chờ dưới 20s của tầng docs", () => {
    expect(FIRST_DOC_DELAY_MS).toBeLessThan(SHEETS_WAIT_MS);
    expect(SHEETS_WAIT_MS).toBeLessThan(20_000);
  });
});
