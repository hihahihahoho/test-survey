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
import { STYLE_AXIS_IDS } from "@/features/kit-form/lib/form-model";
import { buildStylePrompt } from "@/features/kit-form/lib/style-phrases";
import {
  LAST_STEP, LEGACY_DRAFT_KEY, LUCKY_PRESET_FILES, STYLE_AXIS_MID, createWorkflowStore, draftKey, dropWorkflowDraft,
  hydrateWorkflowStore, normalizeStyleAxes, presetKitset, resetWorkflowStores, restoreWorkflowDraft, settingsDirty,
  trashedDraftKey, versionSettingsOf,
} from "../model";
import { POSES, allPoseIds, defaultPoseIds } from "../poses";

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

  /* Bước "Kết quả" đã bỏ ⇒ `addVersion` dừng ở `LAST_STEP` (5). Hợp đồng của ca test
     không đổi: bộ kit thứ 2 phải mở ở BƯỚC 1 chứ không thừa hưởng bước cuối của bộ 1. */
  it("bộ kit thứ 2 mở ra ở BƯỚC 1, không nhảy vào bước cuối của bộ thứ 1", () => {
    const p1 = createWorkflowStore("kit-a");
    p1.getState().addVersion("xong");
    expect(p1.getState().step).toBe(LAST_STEP);

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
  it("khôi phục v1 thì stylePrompt quay về đúng của v1", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().set({ stylePrompt: "A" });
    s.getState().addVersion("A");
    s.getState().set({ stylePrompt: "B" });
    s.getState().addVersion("B");

    s.getState().restoreVersion("v1");
    expect(s.getState().activeVersion).toBe("v1");
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
      kitsetSummary: "tóm tắt thật", sliceThreshold: 99,
      mascotEnabled: true, mascotName: "Mèo",
    });
    // đúng thứ nằm trong localStorage của bản build cũ: settings rỗng, không label
    s.setState({ versions: [{ id: "v1", label: "v1", prompt: "P", createdAt: "x", status: "mock", settings: {} as never }] });

    expect(() => s.getState().restoreVersion("v1")).not.toThrow();
    const st = s.getState();
    expect(st.activeVersion).toBe("v1");
    expect(st.stylePrompt).toBe("P");            // rơi về `v.prompt`
    for (const [k, v] of Object.entries({
      kitsetSummary: st.kitsetSummary,
      sliceThreshold: st.sliceThreshold, mascotName: st.mascotName,
    })) expect(v, `${k} không được là undefined`).not.toBeUndefined();
    expect(st.mascotName).toBe("Mèo");           // mascot giữ nguyên, không đoán bừa
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

  /**
   * ⚠️ HỢP ĐỒNG ĐỔI LẦN HAI (2026-08, đè UI-FIX §3a) — **mặc định 12 dáng = 3 sheet**,
   * không còn chọn hết 19.
   *
   * Chọn hết 19 dáng = 5 sheet mascot mỗi lần gen — nhiều hơn cả phần UI, và chủ sản
   * phẩm chốt trần ~3 sheet cho mặc định. Quy tắc mới: trọn nhóm "Cơ bản" trước, rồi
   * dáng thông dụng theo thứ tự prototype tới đúng 12 (= 3 sheet × 4 ô). Điều §W1-7
   * khoá vẫn nguyên — store giữ **id tiếng Anh**, không giữ nhãn tiếng Việt. "Chọn
   * tất cả" (`allPoseIds`) vẫn phải rộng hơn mặc định: mặc định là điểm bắt đầu,
   * không phải trần của người dùng.
   */
  it("mascotPoses mặc định là 12 dáng (3 sheet): trọn nhóm Cơ bản + dáng thông dụng, toàn ID tiếng Anh", () => {
    const poses = createWorkflowStore("kit-a").getState().mascotPoses;
    expect(poses).toEqual(defaultPoseIds());
    expect(poses).toHaveLength(12); // = 3 sheet × 4 ô (DEFAULT_SHEET_LIMITS.mascot)
    for (const pose of POSES.filter((p) => p.group === "Cơ bản")) {
      expect(poses, `nhóm Cơ bản phải nằm trọn trong mặc định (thiếu ${pose.id})`).toContain(pose.id);
    }
    expect(poses.every((p) => /^[a-z0-9-]+$/.test(p))).toBe(true);
    // Không dáng nào là bịa: tất cả phải có trong danh mục, và không trùng nhau.
    expect(poses.every((p) => allPoseIds().includes(p))).toBe(true);
    expect(new Set(poses).size).toBe(poses.length);
    // Mặc định KHÔNG phải toàn bộ — "Chọn tất cả" vẫn còn việc để làm.
    expect(poses.length).toBeLessThan(allPoseIds().length);
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
    const src = readFileSync(resolve(process.cwd(), "src/features/kit-core/lib/model.ts"), "utf8");
    // Dấu hiệu của dữ liệu element chép tay: một object có cả `file:` lẫn `role:`.
    // Ngoại lệ DUY NHẤT được phép là `PRESET_MISSING_DESIGN` (wheel-board — plan §C3).
    const literals = src.match(/\{\s*file:\s*"[^"]+",[^}]*role:/g) ?? [];
    expect(literals.length, `còn ${literals.length} element chép tay`).toBe(1);
    expect(src).toContain("PRESET_MISSING_DESIGN");
  });

  /**
   * ⚠️ HỢP ĐỒNG ĐỔI Ở UI-FIX §2 — **KITSET KHỞI TẠO LÀ CẢ THƯ VIỆN, ĐÃ TICK SẴN**.
   *
   * §W3-5 đặt kitset khởi tạo = 7 món preset "quay số may mắn", nên 35 món còn lại mang
   * dấu `+` và người dùng phải cộng từng cái. Việc họ thật sự làm là *bớt*. Nay
   * `defaultKitset()` tick sẵn toàn bộ bản đóng gói; `presetKitset()` vẫn còn (ca trên
   * vẫn kiểm nó) nhưng không còn là điểm khởi đầu của wizard.
   */
  it("kitset khởi tạo tick sẵn TOÀN BỘ thư viện đóng gói (mặc định chọn hết)", () => {
    const s = createWorkflowStore("kit-a");
    const lib = loadBundledV2().elements;
    const kitset = s.getState().elements;
    for (const element of lib) {
      expect(kitset.find((item) => item.file === element.file)?.selected, element.file).toBe(true);
    }
    expect(kitset.filter((item) => item.selected)).toHaveLength(lib.length + 1); // +1 = wheel-board (mock)
    expect(s.getState().kitsetTouched).toBe(false);
  });

  it("bấm món CHƯA có trong kitset (bộ khung người dùng tự thêm) ⇒ THÊM vào và bật cờ đã-đụng", () => {
    const s = createWorkflowStore("kit-a");
    const before = s.getState().elements.length;
    expect(s.getState().elements.some((i) => i.file === "90-custom-abc")).toBe(false);
    s.getState().toggleElement("90-custom-abc", { label: "Khung riêng", role: "Element giao diện", cell: "ngang" });
    expect(s.getState().elements.find((item) => item.file === "90-custom-abc")?.selected).toBe(true);
    expect(s.getState().elements).toHaveLength(before + 1);
    expect(s.getState().kitsetTouched).toBe(true);
  });

  it("`adoptCatalogue` tick món kho mới, KHÔNG đụng món người dùng vừa bỏ tick", () => {
    const s = createWorkflowStore("kit-a");
    s.getState().toggleElement("01-btn-pill-red"); // người dùng bỏ tick
    s.getState().adoptCatalogue([
      { file: "01-btn-pill-red", label: "Nút đỏ (CTA)", role: "x", cell: "ngang" },
      { file: "90-custom-xyz", label: "Khung riêng", role: "x", cell: "ngang" },
    ]);
    expect(s.getState().elements.find((i) => i.file === "01-btn-pill-red")?.selected).toBe(false);
    expect(s.getState().elements.find((i) => i.file === "90-custom-xyz")?.selected).toBe(true);
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

/**
 * TRỤC THỨ 8 (`ornament`, 24/08) — BẢN NHÁP CŨ KHÔNG ĐƯỢC THỦNG MỘT LỖ.
 *
 * `styleAxes` là một OBJECT trong bản nháp, mà `persist` trộn NÔNG: object 7 trục trên
 * đĩa thay thế nguyên cục object 8 trục của `initialState()`. Nên mọi bộ kit đã lưu
 * trước hôm nay sẽ mở lại với `ornament === undefined` — thanh trượt trống, và
 * `buildStylePrompt` nhét chuỗi "undefined" vào prompt gửi `gen.sh`. Cùng họ bug với
 * `stateFromVersion` ở §W1-3: dữ liệu từ `localStorage` LUÔN có thể mang hình dạng của
 * một bản build cũ hơn, và kiểu TypeScript không chặn được gì cả.
 */
describe("trục phong cách mới — bản nháp cũ nhận mặc định, không nhận `undefined`", () => {
  const OLD_AXES = { age: 6, energy: 2, lux: 3, era: 4, gender: 5, detail: 7, outline: 1 };

  it("bản nháp 7 trục mở bằng build 8 trục: giữ 7 nấc cũ, trục mới về nấc giữa", () => {
    seed(draftKey("kit-cu"), { kitName: "Bộ kit cũ", styleAxes: OLD_AXES });
    const axes = createWorkflowStore("kit-cu").getState().styleAxes;

    expect(axes.ornament).toBe(STYLE_AXIS_MID);
    expect(axes.ornament).not.toBeUndefined();
    for (const [id, value] of Object.entries(OLD_AXES)) expect(axes[id as keyof typeof axes], id).toBe(value);
    // Và prompt gửi máy vẽ đủ 8 mệnh đề, không mẩu "undefined" nào.
    const prompt = buildStylePrompt(axes);
    expect(prompt.split(", ")).toHaveLength(STYLE_AXIS_IDS.length);
    expect(prompt).not.toContain("undefined");
  });

  it("`hydrateWorkflowStore` (đường nạp thủ công) vá cùng một lỗ", () => {
    const store = createWorkflowStore("kit-hydrate");
    hydrateWorkflowStore(store, { kitName: "Nạp tay", styleAxes: OLD_AXES });
    expect(store.getState().styleAxes.ornament).toBe(STYLE_AXIS_MID);
    expect(store.getState().styleAxes.age).toBe(6);
  });

  it("`normalizeStyleAxes` dọn cả rác thật: nấc ngoài dải, sai kiểu, trục đã bỏ", () => {
    const axes = normalizeStyleAxes({ ...OLD_AXES, age: 99, energy: "3", lux: null, mau_cu: 5 });
    expect(axes.age).toBe(STYLE_AXIS_MID);
    expect(axes.energy).toBe(STYLE_AXIS_MID);
    expect(axes.lux).toBe(STYLE_AXIS_MID);
    expect(axes.detail).toBe(7);
    expect(Object.keys(axes).sort()).toEqual([...STYLE_AXIS_IDS].sort());
  });

  it("bản nháp KHÔNG có `styleAxes` (bộ kit tạo trước cả bước Phong cách) vẫn ra đủ 8 trục", () => {
    seed(draftKey("kit-trong"), { kitName: "Không có trục nào" });
    const axes = createWorkflowStore("kit-trong").getState().styleAxes;
    expect(Object.keys(axes).sort()).toEqual([...STYLE_AXIS_IDS].sort());
    expect(Object.values(axes).every((v) => v === STYLE_AXIS_MID)).toBe(true);
  });
});
