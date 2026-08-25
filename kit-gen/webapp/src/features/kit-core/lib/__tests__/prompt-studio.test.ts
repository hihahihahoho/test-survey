/* @vitest-environment jsdom */
/**
 * PROMPT STUDIO — phần THUẦN: state per-tấm, đường vào contract, dịch lỗi.
 *
 * LUẬT CỦA BỘ TEST NÀY: **"không đụng vào thì không đổi MỘT BYTE nào."**
 *
 * Vì sao đó là câu hỏi trung tâm chứ không phải "directive có vào contract không":
 * contract được so bằng `JSON.stringify` để quyết định có ghi đĩa hay không
 * (`contract-sync.ts:sameContract`). Nếu `withSheetPrompts` để rơi một khoá thừa —
 * kể cả `undefined` — thì MỌI dự án cũ vừa mở lên đã "khác bản trên đĩa", và app tự
 * châm một lượt ghi `styles.json` + một bản `.history` cho thứ không ai sửa. Cái đó
 * không hiện ra ở bất kỳ ca test nào khác, nên nó phải hiện ra ở đây.
 *
 * `jsdom` vì store dùng `localStorage` để giữ bản nháp — đúng thứ ca "bản nháp cũ
 * thiếu map mới" đang kiểm.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { AgentError } from "@/lib/api/client";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import {
  createWorkflowStore, draftKey, hydrateWorkflowStore, resetWorkflowStores, workflowDraftOf,
  type WorkflowState,
} from "../model";
import { buildKitsetContract, pickContractInput } from "../kitset-to-contract";
import { isTweaked, promptPreviewProblem, sheetTitle } from "../prompt-studio";

const LIB: LibElement[] = loadBundledV2().elements;
const PID = "kit-prompt-studio";

beforeEach(() => {
  localStorage.clear();
  resetWorkflowStores();
});

const state = (): WorkflowState => createWorkflowStore(PID).getState();
const build = (patch: Partial<WorkflowState> = {}) =>
  buildKitsetContract({ ...state(), ...patch }, { lib: LIB });

/* ══════════════════════════════════════════════════════════════════════════
   1. Contract — hai trường vào ĐÚNG tấm, tấm khác không suy suyển
   ══════════════════════════════════════════════════════════════════════════ */

describe("Prompt Studio — `directive` / `promptOverride` vào contract", () => {
  it("KHÔNG set gì thì contract giống hệt bản chưa có tính năng này (từng byte)", () => {
    const base = JSON.stringify(build());
    expect(JSON.stringify(build({ sheetPrompts: {} }))).toBe(base);
    // …và không tấm nào mọc thêm khoá, kể cả khoá mang giá trị `undefined`.
    for (const sh of build().sheets) {
      expect(Object.keys(sh), sh.id).not.toContain("directive");
      expect(Object.keys(sh), sh.id).not.toContain("promptOverride");
    }
  });

  it("chỉ đạo gắn vào ĐÚNG tấm mang id ấy; mọi tấm khác giữ nguyên từng byte", () => {
    const before = build();
    const target = before.sheets[0]!.id;
    const after = build({ sheetPrompts: { [target]: { directive: "viền vàng dày hơn" } } });

    expect(after.sheets).toHaveLength(before.sheets.length);
    for (const [i, sh] of after.sheets.entries()) {
      const old = before.sheets[i]!;
      if (sh.id === target) {
        expect(sh.directive).toBe("viền vàng dày hơn");
        expect(sh.promptOverride).toBeUndefined();
        // Phần còn lại của chính tấm ấy cũng không được đổi.
        const { directive: _d, ...rest } = sh;
        expect(JSON.stringify(rest)).toBe(JSON.stringify(old));
      } else {
        expect(JSON.stringify(sh), sh.id).toBe(JSON.stringify(old));
      }
    }
  });

  it("prompt tự soạn gắn được cho tấm mascot (khoá `pose-*` cũng là khoá hợp lệ)", () => {
    const pose = build().sheets.find((sh) => sh.id.startsWith("pose-"))!;
    expect(pose).toBeTruthy();
    const after = build({ sheetPrompts: { [pose.id]: { promptOverride: "tôi tự viết trọn prompt" } } });
    const hit = after.sheets.find((sh) => sh.id === pose.id)!;
    expect(hit.promptOverride).toBe("tôi tự viết trọn prompt");
    expect(hit.directive).toBeUndefined();
  });

  it("hai trường cùng lúc, và chuỗi được TRIM trước khi vào contract", () => {
    const target = build().sheets[0]!.id;
    const sh = build({
      sheetPrompts: { [target]: { directive: "  thêm tuyết  ", promptOverride: "  trọn prompt  " } },
    }).sheets[0]!;
    expect(sh.directive).toBe("thêm tuyết");
    expect(sh.promptOverride).toBe("trọn prompt");
  });

  it("chuỗi chỉ có khoảng trắng = KHÔNG nói gì — contract không mọc khoá", () => {
    const target = build().sheets[0]!.id;
    expect(JSON.stringify(build({ sheetPrompts: { [target]: { directive: "   " } } }))).toBe(JSON.stringify(build()));
  });

  it("khoá lạ (tấm đã bị bỏ khỏi kitset) bị bỏ qua, không sinh tấm ma", () => {
    const after = build({ sheetPrompts: { "tam-khong-ton-tai": { directive: "gì đó" } } });
    expect(JSON.stringify(after)).toBe(JSON.stringify(build()));
  });

  it("contract có hai trường này vẫn qua được `contractSchema` (đường ghi đĩa)", () => {
    // `buildKitsetContract` kết thúc bằng `contractSchema.parse` — ca này đỏ nghĩa là
    // schema webapp chặt hơn `agent/lib/validate.mjs:42`, tức lưu KHÔNG NỔI.
    const target = build().sheets[0]!.id;
    expect(() => build({ sheetPrompts: { [target]: { directive: "a", promptOverride: "b" } } })).not.toThrow();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. Khoá memo — quên dòng này thì màn "không chạy"
   ══════════════════════════════════════════════════════════════════════════ */

describe("`pickContractInput` phải thấy `sheetPrompts`", () => {
  it("map rỗng ⇒ khoá memo y hệt dự án cũ (không có trường mới)", () => {
    const s = state();
    expect(JSON.stringify(pickContractInput(s))).toBe(JSON.stringify(pickContractInput({ ...s, sheetPrompts: {} })));
    expect(Object.keys(pickContractInput(s))).not.toContain("sheetPrompts");
  });

  it("gõ một câu chỉ đạo ⇒ khoá memo ĐỔI (nếu không, contract đứng im sau mỗi lần sửa)", () => {
    const s = state();
    const before = JSON.stringify(pickContractInput(s));
    const after = JSON.stringify(pickContractInput({ ...s, sheetPrompts: { nen: { directive: "x" } } }));
    expect(after).not.toBe(before);
    // …và đổi tiếp khi sửa chính câu đó.
    const again = JSON.stringify(pickContractInput({ ...s, sheetPrompts: { nen: { directive: "y" } } }));
    expect(again).not.toBe(after);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Store + bản nháp
   ══════════════════════════════════════════════════════════════════════════ */

describe("state per-tấm sống đúng vòng đời của nó", () => {
  it("`setSheetPrompt` patch từng trường, không xoá trường kia", () => {
    const s = state();
    s.setSheetPrompt("nen", { directive: "câu một" });
    s.setSheetPrompt("nen", { promptOverride: "trọn prompt" });
    expect(state().sheetPrompts.nen).toEqual({ directive: "câu một", promptOverride: "trọn prompt" });
  });

  it("trim ra rỗng = XOÁ trường; hết trường thì tấm rời hẳn map", () => {
    const s = state();
    s.setSheetPrompt("nen", { directive: "câu một", promptOverride: "trọn prompt" });
    s.setSheetPrompt("nen", { promptOverride: "   " });
    expect(state().sheetPrompts.nen).toEqual({ directive: "câu một" });
    s.setSheetPrompt("nen", { directive: "" });
    expect(state().sheetPrompts.nen).toBeUndefined();
    expect(state().sheetPrompts).toEqual({});
  });

  it("`clearSheetPrompt` bỏ trọn một tấm và KHÔNG đụng tấm khác", () => {
    const s = state();
    s.setSheetPrompt("nen", { directive: "a" });
    s.setSheetPrompt("ui", { directive: "b" });
    const before = state().sheetPrompts;
    s.clearSheetPrompt("nen");
    expect(state().sheetPrompts).toEqual({ ui: { directive: "b" } });
    // Tấm không có trong map: không sinh state mới (một `set` rỗng = một nhịp ghi đĩa thừa).
    const stable = state().sheetPrompts;
    s.clearSheetPrompt("tam-la");
    expect(state().sheetPrompts).toBe(stable);
    expect(before).not.toBe(stable);
  });

  it("bản nháp GIỮ chữ người dùng gõ (thiếu là mất khi đổi bước)", () => {
    const s = state();
    s.setSheetPrompt("nen", { directive: "giữ giúp tôi" });
    expect(workflowDraftOf(state()).sheetPrompts).toEqual({ nen: { directive: "giữ giúp tôi" } });
    const onDisk = JSON.parse(localStorage.getItem(draftKey(PID))!) as { state: Record<string, unknown> };
    expect(onDisk.state.sheetPrompts).toEqual({ nen: { directive: "giữ giúp tôi" } });
  });

  it("BẢN NHÁP CŨ (không có map này) mở lên vẫn chạy — map về `{}`, không `undefined`", () => {
    localStorage.setItem(
      draftKey("kit-nhap-cu"),
      JSON.stringify({ state: { kitName: "Bộ kit đời trước", campaign: "Tết" }, version: 0 }),
    );
    const old = createWorkflowStore("kit-nhap-cu").getState();
    expect(old.kitName).toBe("Bộ kit đời trước");
    expect(old.sheetPrompts).toEqual({});
    // Và contract dựng từ nó không mọc khoá nào.
    expect(() => buildKitsetContract(old, { lib: LIB })).not.toThrow();
    for (const sh of buildKitsetContract(old, { lib: LIB }).sheets) {
      expect(Object.keys(sh), sh.id).not.toContain("directive");
    }
    // Đường nạp thủ công (`hydrateWorkflowStore`) cũng vậy.
    const store = createWorkflowStore("kit-nhap-tay");
    hydrateWorkflowStore(store, { kitName: "Nạp tay" });
    expect(store.getState().sheetPrompts).toEqual({});
  });

  it("bản nháp CÓ map thì nạp lại đúng nội dung", () => {
    const store = createWorkflowStore("kit-nap-lai");
    hydrateWorkflowStore(store, { sheetPrompts: { ui: { promptOverride: "tôi tự viết" } } });
    expect(store.getState().sheetPrompts).toEqual({ ui: { promptOverride: "tôi tự viết" } });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Tên tấm + dấu "đã chỉnh"
   ══════════════════════════════════════════════════════════════════════════ */

describe("`sheetTitle` — dịch được thì dịch, không thì nói nguyên id", () => {
  it.each([
    ["nen", "Nền"],
    ["nen2", "Nền 2"],
    ["ui-doc", "UI nhỏ dọc"],
    ["dao-cu", "Đạo cụ"],
    ["pose-nhan-vat", "Dáng nhân vật"],
    ["pose-nhan-vat-2", "Dáng nhân vật"],
  ])("%s → %s", (id, want) => expect(sheetTitle(id)).toBe(want));

  it("id lạ (contract nhập từ dự án khác) KHÔNG bị gán tên bịa", () => {
    expect(sheetTitle("campaign-hero")).toBe("campaign-hero");
  });

  it("mọi tấm của contract THẬT đều có tên đọc được (không rơi về id)", () => {
    for (const sh of build().sheets) expect(sheetTitle(sh.id), sh.id).not.toBe(sh.id);
  });
});

describe("`isTweaked` — nguồn duy nhất của dấu ✎", () => {
  it.each([
    [undefined, false],
    [{}, false],
    [{ directive: "   " }, false],
    [{ directive: "có" }, true],
    [{ promptOverride: "có" }, true],
  ])("%o → %s", (t, want) => expect(isTweaked(t)).toBe(want));
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Dịch lỗi của endpoint
   ══════════════════════════════════════════════════════════════════════════ */

const agentError = (code: string, status: number, details: unknown) =>
  new AgentError({ code, status, transport: "http-error", message: "kỹ thuật, không được ra thân UI", details });

describe("`promptPreviewProblem` — bốn ngách lỗi, bốn việc phải làm", () => {
  it("409 RUN_ACTIVE: nói CHỜ, không nói người dùng vừa làm hỏng gì", () => {
    const p = promptPreviewProblem(agentError("RUN_ACTIVE", 409, { runId: "r-77" }));
    expect(p.message).toBe("Đang có lượt vẽ chạy — chờ xong rồi xem prompt.");
    expect(p.details).toEqual(["runId: r-77"]);
  });

  it("422 CONTRACT_INVALID: đếm lỗi ở câu chính, chi tiết nằm trong panel gập", () => {
    const p = promptPreviewProblem(agentError("CONTRACT_INVALID", 422, {
      errors: [
        { code: "V-04", path: "sheets[1].components", message: "grid 2x2 needs 4 cells, got 3" },
        { code: "V-03", path: "sheets[2].id", message: "duplicate sheet id ui" },
      ],
    }));
    expect(p.message).toContain("2 lỗi");
    expect(p.details).toEqual([
      "sheets[1].components — grid 2x2 needs 4 cells, got 3",
      "sheets[2].id — duplicate sheet id ui",
    ]);
    // §3.9 luật ①: `error.message` kỹ thuật KHÔNG được lọt vào câu chính.
    expect(p.message).not.toContain("kỹ thuật");
  });

  it.each([
    ["ENGINE_MISSING", /cài lại KitGen/],
    ["TIMEOUT", /lâu quá/],
    ["ENGINE_FAILED", /dừng giữa chừng/],
  ])("422 PROMPT_PREVIEW_FAILED · %s nói đúng việc phải làm", (reason, want) => {
    const p = promptPreviewProblem(agentError("PROMPT_PREVIEW_FAILED", 422, {
      reason, exitCode: 3, output: "gen.sh: dòng cuối của engine",
    }));
    expect(p.message).toMatch(want);
    expect(p.details).toEqual([`reason: ${reason}`, "exitCode: 3", "gen.sh: dòng cuối của engine"]);
  });

  it("app local tắt: câu LẤY TỪ BẢNG CHUNG, không có phiên bản thứ hai của cùng câu", () => {
    const p = promptPreviewProblem(new AgentError({
      code: "AGENT_NOT_RUNNING", transport: "unreachable", message: "fetch failed",
    }));
    expect(p.message).toContain("Chưa thấy công cụ local");
    expect(p.message).toContain("kitgen-agent");
    expect(p.details).toEqual([]);
  });
});
