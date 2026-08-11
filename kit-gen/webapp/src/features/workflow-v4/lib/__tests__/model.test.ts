/* @vitest-environment jsdom */
/**
 * WAVE 1 — bằng chứng cho §W1-1 (bản nháp khoá theo bộ kit), §W1-3 (`restoreVersion`
 * khôi phục THẬT), §W1-4 (`dirty` gồm `stylePrompt`), §W1-6 (ô campaign), §W1-7 (pose id).
 *
 * Chạy trong `jsdom` vì thứ đang được kiểm CHÍNH LÀ `localStorage`: bản nháp nằm ở đó,
 * và bệnh cũ ("bộ kit thứ 2 nuốt brief của bộ thứ 1") chỉ nhìn thấy được qua các key.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import {
  LEGACY_DRAFT_KEY, LUCKY_PRESET_FILES, createWorkflowStore, draftKey, dropWorkflowDraft,
  presetKitset, resetWorkflowStores, restoreWorkflowDraft, settingsDirty, trashedDraftKey,
  versionSettingsOf,
} from "../model";

beforeEach(() => {
  localStorage.clear();
  resetWorkflowStores();
});

/** Bản nháp trên đĩa có vỏ của zustand/persist. */
const seed = (key: string, state: Record<string, unknown>) =>
  localStorage.setItem(key, JSON.stringify({ state, version: 0 }));

describe("§W1-1 — mỗi bộ kit một bản nháp", () => {
  it("hai bộ kit KHÔNG dùng chung state, và mỗi bộ có key riêng", () => {
    const p1 = createWorkflowStore("kit-a");
    p1.getState().set({ kitName: "A" });

    const p2 = createWorkflowStore("kit-b");
    expect(p2.getState().kitName).toBe("Dự án mới");
    expect(p2.getState().kitName).not.toBe("A");
    p2.getState().set({ kitName: "B" });

    expect(localStorage.getItem(draftKey("kit-a"))).not.toBeNull();
    expect(localStorage.getItem(draftKey("kit-b"))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(draftKey("kit-a"))!).state.kitName).toBe("A");
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  it("bộ kit thứ 2 mở ra ở BƯỚC 1, không nhảy vào bước 6 của bộ thứ 1", () => {
    const p1 = createWorkflowStore("kit-a");
    p1.getState().addVersion("xong");
    expect(p1.getState().step).toBe(6);

    const p2 = createWorkflowStore("kit-b");
    expect(p2.getState().step).toBe(1);
    expect(p2.getState().versions).toHaveLength(0);
  });

  it("DI TRÚ: bản nháp cũ (key không có projectId) được bộ kit mở đầu tiên nhận, key cũ biến mất", () => {
    seed(LEGACY_DRAFT_KEY, { kitName: "Cũ", brief: "brief cũ" });

    const p1 = createWorkflowStore("kit-a");
    expect(p1.getState().kitName).toBe("Cũ");
    expect(p1.getState().brief).toBe("brief cũ");
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).toBeNull();

    const p2 = createWorkflowStore("kit-b");
    expect(p2.getState().kitName).toBe("Dự án mới");
  });

  it("DI TRÚ không đè lên bản nháp đã có của chính bộ kit đó", () => {
    seed(draftKey("kit-a"), { kitName: "Của riêng A" });
    seed(LEGACY_DRAFT_KEY, { kitName: "Cũ" });

    expect(createWorkflowStore("kit-a").getState().kitName).toBe("Của riêng A");
    // Không nhận thì cũng KHÔNG được vứt — bản nháp cũ còn nguyên cho bộ kit khác.
    expect(localStorage.getItem(LEGACY_DRAFT_KEY)).not.toBeNull();
  });

  it("xoá bộ kit ⇒ dọn key sống; hoàn tác ⇒ trả lại nguyên vẹn", () => {
    createWorkflowStore("kit-a").getState().set({ kitName: "Sắp xoá" });

    dropWorkflowDraft("kit-a");
    expect(localStorage.getItem(draftKey("kit-a"))).toBeNull();
    expect(localStorage.getItem(trashedDraftKey("kit-a"))).not.toBeNull();
    expect(createWorkflowStore("kit-a").getState().kitName).toBe("Dự án mới");

    resetWorkflowStores();
    restoreWorkflowDraft("kit-a");
    expect(localStorage.getItem(trashedDraftKey("kit-a"))).toBeNull();
    expect(createWorkflowStore("kit-a").getState().kitName).toBe("Sắp xoá");
  });

  it("mở lại cùng bộ kit trong một phiên vẫn là MỘT store (factory có cache)", () => {
    expect(createWorkflowStore("kit-a")).toBe(createWorkflowStore("kit-a"));
  });
});

describe("§W1-3 — restoreVersion nạp settings thật, không chỉ đổi nhãn", () => {
  it("khôi phục v1 thì chroma và stylePrompt quay về đúng của v1", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().set({ stylePrompt: "A" });
    s.getState().addVersion("A");
    s.getState().set({ chroma: "green", stylePrompt: "B" });
    s.getState().addVersion("B");

    s.getState().restoreVersion("v1");
    expect(s.getState().activeVersion).toBe("v1");
    expect(s.getState().chroma).toBe("magenta");
    expect(s.getState().stylePrompt).toBe("A");
  });

  it("khôi phục cũng trả lại trạng thái mascot (nghịch đảo đúng của lúc chụp)", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().set({ mascotEnabled: true, mascotName: "Mèo bạc hà" });
    s.getState().addVersion("v có mascot");
    s.getState().set({ mascotEnabled: false });
    s.getState().addVersion("v không mascot");

    s.getState().restoreVersion("v1");
    expect(s.getState().mascotEnabled).toBe(true);
    expect(s.getState().mascotName).toBe("Mèo bạc hà");
  });

  it("id không tồn tại thì chỉ đổi nhãn, không ném và không xoá state", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().set({ stylePrompt: "giữ nguyên" });
    s.getState().restoreVersion("v99");
    expect(s.getState().stylePrompt).toBe("giữ nguyên");
  });

  /* ── Bản nháp CŨ / hỏng: version thiếu trường trong `settings` ─────────────
     Không phải ca giả định. Probe playwright (2026-08-08) tái hiện được: một
     version có `settings: {}` nằm trong localStorage ⇒ bấm đổi phiên bản làm
     `s.mascotName` thành `undefined` ⇒ `buildKitsetContract` gọi
     `.trim()` ⇒ TypeError trong useMemo ⇒ error boundary nuốt CẢ MÀN bước ⑥.
     Luật nay: thiếu trường thì GIỮ giá trị đang chạy, tuyệt đối không ghi
     `undefined` đè lên một trường có kiểu đặc. */
  it("version thiếu settings KHÔNG ghi undefined đè state (không làm sập màn)", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().set({
      chroma: "green", kitsetSummary: "tóm tắt thật", sliceThreshold: 99,
      mascotEnabled: true, mascotName: "Mèo",
    });
    // đúng thứ nằm trong localStorage của bản build cũ: settings rỗng, không label
    s.setState({ versions: [{ id: "v1", label: "v1", prompt: "P", createdAt: "x", status: "mock", settings: {} as never }] });

    expect(() => s.getState().restoreVersion("v1")).not.toThrow();
    const st = s.getState();
    expect(st.activeVersion).toBe("v1");
    expect(st.stylePrompt).toBe("P");            // rơi về `v.prompt`
    for (const [k, v] of Object.entries({
      chroma: st.chroma, kitsetSummary: st.kitsetSummary,
      sliceThreshold: st.sliceThreshold, mascotName: st.mascotName,
    })) expect(v, `${k} không được là undefined`).not.toBeUndefined();
    expect(st.mascotName).toBe("Mèo");           // mascot giữ nguyên, không đoán bừa
    expect(st.chroma).toBe("green");
  });
});

describe("§W1-4 — dirty và snapshot dùng CÙNG một bộ trường", () => {
  it("sửa mô tả phong cách là đủ để 'Cần render lại'", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().addVersion(s.getState().stylePrompt);
    const v = s.getState().versions.at(-1)!;

    expect(settingsDirty(v, s.getState())).toBe(false);
    s.getState().set({ stylePrompt: "khác hẳn" });
    expect(settingsDirty(v, s.getState())).toBe(true);
  });

  it("snapshot của addVersion có stylePrompt (bộ trường không lệch với phép so)", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().addVersion("prompt của lượt này");
    const v = s.getState().versions.at(-1)!;
    expect(v.settings.stylePrompt).toBe("prompt của lượt này");
    expect(Object.keys(v.settings).sort()).toEqual(Object.keys(versionSettingsOf(s.getState())).sort());
  });

  it("không có phiên bản nào thì không bao giờ 'dirty'", () => {
    expect(settingsDirty(undefined, createWorkflowStore("kit-a").getState())).toBe(false);
  });
});

describe("§W1-6 / §W1-7 — ô campaign và dáng mascot", () => {
  it("campaign được lưu vào bản nháp (đổi bước rồi quay lại vẫn còn chữ)", () => {
    createWorkflowStore("kit-a").getState().set({ campaign: "mini-game hè 2026" });
    resetWorkflowStores();
    expect(createWorkflowStore("kit-a").getState().campaign).toBe("mini-game hè 2026");
  });

  it("mascotPoses mặc định là ID tiếng Anh — không có chuỗi tiếng Việt nào trong store", () => {
    const poses = createWorkflowStore("kit-a").getState().mascotPoses;
    expect(poses).toEqual(["idle", "cheer", "sad", "present"]);
    expect(poses.every((p) => /^[a-z]+$/.test(p))).toBe(true);
  });
});

/**
 * ⚠️ HỢP ĐỒNG ĐỔI Ở WAVE 3 (§W3-5) — ghi rõ vì sao, không phải nới test cho xanh.
 *
 * Trước: `elements` là CATALOGUE (11 món hardcode) kèm cờ `selected`, nên "toggle
 * không đổi hình dạng catalogue" là phát biểu đúng.
 * Nay: kho là **42 món của `element-lib`** (nguồn duy nhất), còn `elements` là
 * **KITSET** — thứ người dùng đã chọn. Bấm một món chưa có trong kitset là THÊM nó
 * vào, nên độ dài mảng TĂNG là hành vi đúng, không phải hồi quy. Hai ca dưới đây
 * khoá sự thật mới, và thêm một ca khoá điều plan đòi: `model.ts` không còn giữ
 * mảng element literal nào nữa.
 */
describe("preset kitset — §W3-5 một danh sách duy nhất", () => {
  it("preset chọn sẵn 8 món, vòng quay vẫn là mock, và MỌI id còn lại đều có thật trong thư viện", () => {
    const kitset = presetKitset();
    expect(kitset.filter((item) => item.selected).length).toBe(8);
    expect(kitset.find((item) => item.file === "wheel-board")?.mock).toBe(true);
    expect(kitset.some((item) => item.file === "01-btn-pill-red")).toBe(true);

    const lib = new Set(loadBundledV2().elements.map((e) => e.file));
    for (const f of LUCKY_PRESET_FILES) expect(lib, `preset trỏ vào ${f}`).toContain(f);
    // Nhãn phải LẤY TỪ thư viện, không phải chuỗi chép tay trong model.ts.
    const byFile = new Map(loadBundledV2().elements.map((e) => [e.file, e]));
    for (const item of kitset.filter((i) => !i.mock)) {
      expect(item.label).toBe(byFile.get(item.file)?.vi);
    }
  });

  it("`model.ts` KHÔNG còn mảng element literal nào — chỉ còn danh sách id", () => {
    const src = readFileSync(resolve(process.cwd(), "src/features/workflow-v4/lib/model.ts"), "utf8");
    // Dấu hiệu của dữ liệu element chép tay: một object có cả `file:` lẫn `role:`.
    // Ngoại lệ DUY NHẤT được phép là `PRESET_MISSING_DESIGN` (wheel-board — plan §C3).
    const literals = src.match(/\{\s*file:\s*"[^"]+",[^}]*role:/g) ?? [];
    expect(literals.length, `còn ${literals.length} element chép tay`).toBe(1);
    expect(src).toContain("PRESET_MISSING_DESIGN");
  });

  it("bấm món CHƯA có trong kitset ⇒ THÊM vào (kho 42 ≠ kitset)", () => {
    const s = createWorkflowStore("kit-a");
    const before = s.getState().elements.length;
    expect(s.getState().elements.some((i) => i.file === "15-reward-giftbox")).toBe(false);
    s.getState().toggleElement("15-reward-giftbox");
    expect(s.getState().elements.find((item) => item.file === "15-reward-giftbox")?.selected).toBe(true);
    expect(s.getState().elements).toHaveLength(before + 1);
    // Nhãn tự tra từ thư viện dù nơi gọi không truyền `meta`.
    expect(s.getState().elements.find((i) => i.file === "15-reward-giftbox")?.label).toBe("Quà hộp");
  });

  it("bấm lại món ĐÃ có ⇒ lật cờ, không nhân đôi hàng", () => {
    const s = createWorkflowStore("kit-a");
    const before = s.getState().elements.length;
    s.getState().toggleElement("01-btn-pill-red");
    expect(s.getState().elements.find((i) => i.file === "01-btn-pill-red")?.selected).toBe(false);
    expect(s.getState().elements).toHaveLength(before);
  });

  it("mỗi lần render là một phiên bản mới, không ghi đè bản đang chọn", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().addVersion("v1 prompt");
    s.getState().addVersion("v2 prompt");
    const versions = s.getState().versions;
    expect(versions).toHaveLength(2);
    expect(versions.at(-1)?.label).toBe("v2");
    expect(versions.at(-2)?.prompt).toBe("v1 prompt");
  });
});
