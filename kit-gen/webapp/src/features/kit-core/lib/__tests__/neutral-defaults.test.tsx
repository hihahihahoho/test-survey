/* @vitest-environment jsdom */
/**
 * §BUG-1 — BẢN NHÁP MỚI KHÔNG ĐƯỢC MANG DỮ LIỆU CỦA MỘT THƯƠNG HIỆU CÓ THẬT.
 *
 * Hai người kiểm thử mù trên 2.1.17 đều dừng lại ở bước "Phong cách" của một dự án
 * MỚI: dropdown ghi "Không dùng thương hiệu đã lưu", nhưng ô Mô tả phong cách đã có
 * sẵn câu "Vui tươi, 3D bóng nhẹ, màu xanh dương VNPAY và xanh cyan…" và cặp màu
 * #005BAA/#00B0F0. Cả hai phải tự đoán ra rằng mình cần ghi đè; ai không để ý thì
 * tiêu quota để gen ra cả bộ kit lệch tông.
 *
 * Bốn thứ được khoá ở đây:
 *  ① mặc định của store SẠCH — và sạch được phát biểu bằng phép quét CẢ bản nháp,
 *    không phải bằng cách liệt kê tay hai trường (liệt kê tay thì lần rò tiếp theo
 *    ở một trường khác sẽ lại lọt);
 *  ② contract dựng từ bản nháp sạch vẫn có phong cách để gen — bỏ trống KHÔNG được
 *    biến thành "không mô tả gì";
 *  ③ luồng "chọn thương hiệu → điền từ brand" VẪN chạy (đó là cửa hợp lệ duy nhất);
 *  ④ dự án CŨ đã lưu không bị đổi một chữ.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  NEUTRAL_PRIMARY_COLOR, NEUTRAL_SECONDARY_COLOR, STYLE_PROMPT_PLACEHOLDER,
  brandColorPatch, createWorkflowStore, hydrateWorkflowStore, resetWorkflowStores,
  workflowDraftOf,
} from "../model";
import { buildKitsetContract } from "../kitset-to-contract";
import { workflowPatchFromContract } from "../contract-import";
import { contractVariants, type Contract } from "@/lib/types/contract";

/**
 * Dấu vết của thương hiệu đã từng rò vào mặc định. Danh sách này là một CÁI BẪY chứ
 * không phải tài liệu: thêm một brand mới vào mặc định thì thêm một dòng ở đây cũng
 * không cứu được, vì phép quét ở ①ª chạy trên toàn bộ bản nháp.
 */
const BRAND_TRACES = [/VNPAY/i, /#005BAA/i, /#00B0F0/i, /VCB/i];

/**
 * NGÂN SÁCH THỜI GIAN — không phải để che một test chậm.
 *
 * Ca ④ (`ô mô tả TRỐNG…`) `await import("../../steps/StyleStep")` NGAY TRONG thân
 * `it`, nên chi phí transform cả nhánh module bị tính vào mốc 5s mặc định. Chạy một
 * mình: ~0.2s. Chạy chung 122 file song song trên máy đủ tải: thỉnh thoảng vượt 5s và
 * đỏ — quan sát được 1 lần trong 18 lượt chạy full-suite. Mốc đó không khẳng định điều
 * gì về sản phẩm; giữ nó chỉ mua một test đỏ ngẫu nhiên, mà suite đỏ ngẫu nhiên thì
 * không ai còn đọc nữa. (Cùng lý do và cùng cách xử lý với hai file test của đường cắt
 * lại: `features/design/__tests__/slice-wiring.test.tsx`.)
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

describe("① mặc định của bản nháp mới", () => {
  it("ô Mô tả phong cách TRỐNG — không phải câu tả của một brand có thật", () => {
    const store = createWorkflowStore("bug1-fresh");
    expect(store.getState().stylePrompt).toBe("");
  });

  it("cặp màu là màu trung tính của app, không phải nhận diện của ai", () => {
    const s = createWorkflowStore("bug1-colors").getState();
    expect(s.primaryColor).toBe(NEUTRAL_PRIMARY_COLOR);
    expect(s.secondaryColor).toBe(NEUTRAL_SECONDARY_COLOR);
    expect(s.brandProfileId).toBeNull();
  });

  it("①ª QUÉT CẢ bản nháp: không một trường nào mang dấu vết thương hiệu", () => {
    const draft = JSON.stringify(workflowDraftOf(createWorkflowStore("bug1-scan").getState()));
    for (const trace of BRAND_TRACES) expect(draft).not.toMatch(trace);
  });

  it("gợi ý cách viết nằm ở placeholder — nó KHÔNG phải giá trị, nên không đi vào contract", () => {
    const store = createWorkflowStore("bug1-placeholder");
    expect(STYLE_PROMPT_PLACEHOLDER).not.toBe(store.getState().stylePrompt);
    for (const trace of BRAND_TRACES) expect(STYLE_PROMPT_PLACEHOLDER).not.toMatch(trace);
    const contract = buildKitsetContract(store.getState());
    expect(JSON.stringify(contract)).not.toContain(STYLE_PROMPT_PLACEHOLDER);
  });
});

describe("② bản nháp sạch vẫn gen được", () => {
  it("phong cách của contract KHÔNG rỗng — 7 thanh trượt vẫn tả đủ để gửi đi", () => {
    const contract = buildKitsetContract(createWorkflowStore("bug1-contract").getState());
    const style = contractVariants(contract)[0]?.style ?? "";
    expect(style.trim().length).toBeGreaterThan(0);
    for (const trace of BRAND_TRACES) expect(style).not.toMatch(trace);
  });

  it("cả contract dựng từ mặc định không mang tên thương hiệu nào", () => {
    const contract = buildKitsetContract(createWorkflowStore("bug1-contract-2").getState());
    const json = JSON.stringify(contract);
    for (const trace of BRAND_TRACES) expect(json).not.toMatch(trace);
  });
});

describe("③ luồng CHỌN thương hiệu vẫn phải sống", () => {
  const current = { primaryColor: NEUTRAL_PRIMARY_COLOR, secondaryColor: NEUTRAL_SECONDARY_COLOR };

  it("chọn thương hiệu ⇒ màu của brand ghi đè màu trung tính", () => {
    const patch = brandColorPatch({ id: "brand-x", colors: ["#005BAA", "#00B0F0"] }, current);
    expect(patch).toEqual({ brandProfileId: "brand-x", primaryColor: "#005BAA", secondaryColor: "#00B0F0" });
  });

  it("thương hiệu khai thiếu màu ⇒ GIỮ màu đang có, không hạ ngầm về trung tính", () => {
    const patch = brandColorPatch({ id: "brand-y", colors: ["#112233"] }, { primaryColor: "#AAAAAA", secondaryColor: "#BBBBBB" });
    expect(patch.primaryColor).toBe("#112233");
    expect(patch.secondaryColor).toBe("#BBBBBB");
  });

  it("patch đi vào store thật và đi tới tận contract", () => {
    const store = createWorkflowStore("bug1-brandfill");
    store.setState(brandColorPatch({ id: "brand-z", colors: ["#005BAA", "#00B0F0"] }, store.getState()));
    const brand = contractVariants(buildKitsetContract(store.getState()))[0]?.brand;
    expect(brand?.primary).toBe("#005BAA");
    expect(brand?.secondary).toBe("#00B0F0");
  });
});

describe("④ dự án CŨ không đổi", () => {
  it("bản nháp đã lưu giữ nguyên màu và mô tả của nó", () => {
    const store = createWorkflowStore("bug1-legacy");
    hydrateWorkflowStore(store, {
      stylePrompt: "Vui tươi, 3D bóng nhẹ, màu xanh dương VNPAY và xanh cyan.",
      primaryColor: "#005BAA",
      secondaryColor: "#00B0F0",
    });
    const s = store.getState();
    expect(s.stylePrompt).toContain("VNPAY");
    expect(s.primaryColor).toBe("#005BAA");
  });

  it("contract NHẬP có khai màu ⇒ dùng màu của contract; thiếu ⇒ rơi về trung tính", () => {
    const withBrand = {
      schemaVersion: 4, characterPoses: [], sheets: [],
      variants: [{ id: "chinh", vi: "Chính", style: "cũ", bg: "magenta", brand: { mode: "colors", primary: "#123456", secondary: "#654321" }, characters: [] }],
    } as unknown as Contract;
    expect(workflowPatchFromContract(withBrand, "Dự án cũ").primaryColor).toBe("#123456");

    const noBrand = {
      schemaVersion: 4, characterPoses: [], sheets: [],
      variants: [{ id: "chinh", vi: "Chính", style: "cũ", bg: "magenta", characters: [] }],
    } as unknown as Contract;
    expect(workflowPatchFromContract(noBrand, "Dự án cũ").primaryColor).toBe(NEUTRAL_PRIMARY_COLOR);
    expect(workflowPatchFromContract(noBrand, "Dự án cũ").secondaryColor).toBe(NEUTRAL_SECONDARY_COLOR);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ Chính cái màn hai người kiểm thử đã chụp — bước "Phong cách" của dự án MỚI
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock("@/lib/hooks", async (original) => ({
  ...(await original()) as object,
  useUserLibrary: () => ({ data: { brands: [{ id: "b1", name: "Thương hiệu A", colors: ["#005BAA", "#00B0F0"], assetIds: [] }], items: [], settings: undefined } }),
  useLibraryFile: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../refs-sync", () => ({
  useWorkflowRefs: () => ({
    groups: { inspo: [], brand: [], character: [] },
    ready: true, pending: false, add: vi.fn(), remove: vi.fn(),
  }),
}));
vi.mock("../../components/SharedReferencePicker", () => ({ SharedReferencePicker: () => null }));

describe("⑤ bước Phong cách của một dự án mới", () => {
  it("ô mô tả TRỐNG và chỉ có gợi ý cách viết; hai ô màu là màu trung tính", async () => {
    const { StyleStep } = await import("../../steps/StyleStep");
    const { WorkflowStoreProvider } = await import("../model");
    render(
      <WorkflowStoreProvider projectId="bug1-dom">
        <StyleStep />
      </WorkflowStoreProvider>,
    );

    const prompt = screen.getByLabelText("Mô tả phong cách") as HTMLTextAreaElement;
    expect(prompt.value).toBe("");
    expect(prompt.placeholder).toBe(STYLE_PROMPT_PLACEHOLDER);

    expect((screen.getByLabelText("Màu chính") as HTMLInputElement).value.toUpperCase())
      .toBe(NEUTRAL_PRIMARY_COLOR.toUpperCase());
    expect((screen.getByLabelText("Màu phụ") as HTMLInputElement).value.toUpperCase())
      .toBe(NEUTRAL_SECONDARY_COLOR.toUpperCase());

    /* Và toàn bộ chữ NGƯỜI DÙNG ĐỌC ĐƯỢC trên bước này không nhắc tên brand nào —
       kể cả trong `placeholder`, `title` hay `aria-label`. */
    const visible = document.body.innerHTML;
    for (const trace of BRAND_TRACES) expect(visible).not.toMatch(trace);
  });
});
