/**
 * Test THUẦN LOGIC của hai mode (chạy bằng `npm test`, environment node).
 * Trọng tâm: những điều mà FE2-PLAN §3-B1 gọi là tiêu chí, chứ không phải câu chữ.
 */
import { describe, expect, it } from "vitest";
import {
  CREATE_MODES,
  DEFAULT_MODE,
  LOCAL_DOC_NOTE,
  MODE_COPY,
  MODE_REASSURANCE,
  createIntent,
  createPreview,
  firstDocPlan,
  isCreateMode,
  modeCopy,
} from "../lib/create-mode";

describe("mode — hợp đồng cơ bản", () => {
  it("đúng HAI mode, mặc định là workflow (§1.1-3: đường đã qua QA)", () => {
    expect([...CREATE_MODES]).toEqual(["workflow", "canvas"]);
    expect(DEFAULT_MODE).toBe("workflow");
  });

  it("isCreateMode chặn giá trị lạ (deep-link/localStorage cũ không làm vỡ form)", () => {
    expect(isCreateMode("canvas")).toBe(true);
    expect(isCreateMode("figma")).toBe(false);
    expect(isCreateMode(undefined)).toBe(false);
    expect(isCreateMode(2)).toBe(false);
  });

  it("mỗi mode có đủ tiêu đề + mô tả + dòng «hợp khi…» để dựng accessible name/description", () => {
    expect(MODE_COPY).toHaveLength(2);
    for (const m of MODE_COPY) {
      expect(m.title.length).toBeGreaterThan(3);
      expect(m.body.length).toBeGreaterThan(20);
      expect(m.fit.length).toBeGreaterThan(5);
    }
    expect(modeCopy("canvas").title).toBe("Bàn làm việc tự do");
    expect(modeCopy("workflow").tag).toBe("Mặc định");
  });
});

describe("file con đầu tiên — DỮ LIỆU, không phải hành động", () => {
  it("canvas ⇒ «Bàn ý tưởng» kind canvas · workflow ⇒ «Bộ kit chính» kind workflow (§3-B2)", () => {
    expect(firstDocPlan("canvas")).toMatchObject({ name: "Bàn ý tưởng", kind: "canvas" });
    expect(firstDocPlan("workflow")).toMatchObject({ name: "Bộ kit chính", kind: "workflow" });
  });

  it("intent gói đủ template + mode + kế hoạch doc cho B2/E1 tiêu thụ", () => {
    expect(createIntent("basic", "canvas")).toEqual({
      template: "basic",
      mode: "canvas",
      firstDoc: firstDocPlan("canvas"),
    });
  });

  it("tên file con nằm trong giới hạn 48 ký tự của docNameSchema (types.ts C1)", () => {
    for (const m of CREATE_MODES) expect(firstDocPlan(m).name.length).toBeLessThanOrEqual(48);
  });
});

describe("preview — PHẢI khác nhau giữa hai mode", () => {
  const ids = (t: Parameters<typeof createPreview>[0], m: Parameters<typeof createPreview>[1]) =>
    createPreview(t, m).map((l) => l.id);

  it("cùng template, đổi mode ⇒ dòng «doc» và «open» đổi nội dung", () => {
    const wf = createPreview("basic", "workflow");
    const cv = createPreview("basic", "canvas");
    expect(ids("basic", "workflow")).toEqual(ids("basic", "canvas")); // cùng khung
    const pick = (ls: typeof wf, id: string) => ls.find((l) => l.id === id)!.text;
    expect(pick(wf, "doc")).not.toBe(pick(cv, "doc"));
    expect(pick(wf, "open")).not.toBe(pick(cv, "open"));
    expect(pick(cv, "open")).toMatch(/chưa tốn lượt/);
    expect(pick(wf, "open")).toMatch(/xác nhận số lượt/);
  });

  it("cùng mode, đổi template ⇒ chỉ dòng nội dung khởi tạo đổi", () => {
    const basic = createPreview("basic", "workflow");
    const blank = createPreview("blank", "workflow");
    expect(basic.find((l) => l.id === "tpl")!.text).toMatch(/3 sheet/);
    expect(blank.find((l) => l.id === "tpl")!.text).toMatch(/trống/);
    expect(basic.find((l) => l.id === "doc")!.text).toBe(blank.find((l) => l.id === "doc")!.text);
  });

  it("template phụ thuộc bước sau ⇒ đánh dấu `later`, KHÔNG hứa chắc", () => {
    for (const t of ["from-project", "import"] as const) {
      const l = createPreview(t, "workflow").find((x) => x.id === "tpl")!;
      expect(l.later).toBe(true);
      expect(l.text).toMatch(/bước sau/);
    }
    for (const t of ["basic", "blank"] as const) {
      expect(createPreview(t, "workflow").find((x) => x.id === "tpl")!.later).toBeUndefined();
    }
  });

  it("preview KHÔNG hứa sinh ảnh ở bất kỳ mode nào (L1 — cửa tiền là modal M1)", () => {
    for (const m of CREATE_MODES) {
      const text = createPreview("basic", m).map((l) => l.text).join(" ");
      expect(text).not.toMatch(/sẽ sinh ảnh|bắt đầu sinh|chạy ngay/i);
    }
  });

  it("câu trấn an + ghi chú nháp cục bộ nói đúng ranh giới FE-2", () => {
    expect(MODE_REASSURANCE).toMatch(/Đổi ý lúc nào cũng được/);
    expect(LOCAL_DOC_NOTE).toMatch(/bản nháp cục bộ/);
    expect(LOCAL_DOC_NOTE).toMatch(/Project và ảnh vẫn nằm trong thư mục/);
  });
});
