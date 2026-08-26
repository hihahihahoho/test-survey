/**
 * lib-source.test.ts — THƯ VIỆN ELEMENT: dữ liệu, chuẩn hoá, tìm kiếm, COPY.
 *
 * Ca test đối chiếu với FILE THẬT ở gốc repo, không phải với chính mình:
 *   · bản v2 đóng gói trong bundle phải GIỐNG TỪNG BYTE `teams/t1-chuanhoa/element-lib-v2.json`
 *   · cả hai nguồn phải đủ 42 element và parse sạch bằng schema của R0
 *
 * Chạy:
 *   cd webapp && npx vitest run --config src/features/design/__tests__/vitest.config.ts
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skelSchema } from "@/lib/types/contract";
import {
  buildViews, filterViews, foldVi, fromAgentLib, groupOptions, invalidFileName,
  loadBundledV2, normalizeLib, sourceAvailability, usedByFileMap,
} from "../lib/source";
import { libToComponent, orientFor, suggestedSheetId } from "../lib/contract";
import { NO_GROUP, cellLabel, groupLabel, skelFlags } from "../lib/types";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("bản v2 đóng gói trong bundle KHÔNG được trôi khỏi bản gốc", () => {
  it("giống TỪNG BYTE `teams/t1-chuanhoa/element-lib-v2.json`", () => {
    const goc = read("teams/t1-chuanhoa/element-lib-v2.json");
    const dongGoi = read("webapp/src/features/design/library/data/element-lib-v2.json");
    expect(dongGoi).toBe(goc);
  });

  it("đủ 42 element, parse sạch, không element nào bị bỏ", () => {
    const lib = loadBundledV2();
    expect(lib.elements).toHaveLength(42);
    expect(lib.skipped).toEqual([]);
  });

  it("mọi `skel` hợp lệ theo schema của R0 (vẽ được, và lưu được)", () => {
    for (const e of loadBundledV2().elements) {
      expect(skelSchema.safeParse(e.skel).success, `skel của ${e.file}`).toBe(true);
    }
  });

  it("mọi tên file hợp V-01 ⇒ thêm vào là lưu được ngay, không đỏ", () => {
    for (const e of loadBundledV2().elements) {
      expect(invalidFileName(e), `tên file ${e.file}`).toBe(false);
    }
  });
});

describe("`element-lib.json` thật (bản agent phục vụ) cũng dùng được", () => {
  const raw = JSON.parse(read("element-lib.json")) as unknown;

  it("đủ 42 element và parse sạch", () => {
    const lib = normalizeLib(raw);
    expect(lib.elements).toHaveLength(42);
    expect(lib.skipped).toEqual([]);
  });

  it("hai nguồn có ĐÚNG cùng tập tên file — user đổi nguồn không mất element nào", () => {
    const v1 = normalizeLib(raw).elements.map((e) => e.file).sort();
    const v2 = loadBundledV2().elements.map((e) => e.file).sort();
    expect(v2).toEqual(v1);
  });
});

describe("khoan dung với dữ liệu hỏng (§6.5-6: một dòng sai không giết cả thư viện)", () => {
  it("bỏ RIÊNG element hỏng, giữ phần còn lại, và NÓI RA đã bỏ gì", () => {
    const lib = normalizeLib({
      elements: [
        { file: "01-ok", vi: "Tốt", spec: "x", skel: { shape: "pill", w: 0.8, h: 0.4 } },
        { file: "02-hong", vi: "Hỏng", spec: "x", skel: { shape: "pill", w: 5, h: 0.4 } },
        { file: "03-thieu-skel", vi: "Thiếu skel", spec: "x" },
      ],
    });
    expect(lib.elements.map((e) => e.file)).toEqual(["01-ok"]);
    expect(lib.skipped.map((s) => s.file)).toEqual(["02-hong", "03-thieu-skel"]);
    expect(lib.skipped[0]?.reason).toContain("w");
  });

  it("đầu vào rác (null, không phải mảng) → thư viện rỗng, KHÔNG ném", () => {
    expect(normalizeLib(null).elements).toEqual([]);
    expect(normalizeLib({ elements: "không phải mảng" }).elements).toEqual([]);
    expect(fromAgentLib(undefined).elements).toEqual([]);
  });

  it("shape LẠ vẫn được giữ — client không được hẹp hơn agent", () => {
    const lib = normalizeLib({
      elements: [{ file: "01-la", vi: "", spec: "", skel: { shape: "hexagon", w: 0.5, h: 0.5 } }],
    });
    expect(lib.elements).toHaveLength(0); // `skelSchema` của R0 dùng enum ⇒ shape lạ bị loại
    expect(lib.skipped[0]?.reason).toContain("shape");
  });
});

describe("nhóm + tìm kiếm (đóng issue audit «42 ô không tìm kiếm được»)", () => {
  const views = buildViews(loadBundledV2().elements);

  it("gom đủ 12 nhóm thật + rổ «không thuộc nhóm», và rổ đó nằm CUỐI", () => {
    const gs = groupOptions(views);
    expect(gs.filter((g) => g.key !== NO_GROUP)).toHaveLength(12);
    expect(gs.at(-1)?.key).toBe(NO_GROUP);
    expect(gs.reduce((n, g) => n + g.count, 0)).toBe(42);
  });

  it("gõ KHÔNG DẤU vẫn ra kết quả có dấu — «nut do» → «Nút đỏ (CTA)»", () => {
    const hit = filterViews(views, { query: "nut do", group: "all" });
    expect(hit.map((v) => v.file)).toContain("01-btn-pill-red");
  });

  it("tìm được theo tên file, theo nhãn VI, và theo mô tả", () => {
    expect(filterViews(views, { query: "42-btn-back", group: "all" })).toHaveLength(1);
    expect(filterViews(views, { query: "huy chương", group: "all" }).length).toBeGreaterThanOrEqual(3);
    /* ĐỪNG ĐÓNG ĐINH MỘT TỪ CỦA `spec` VÀO ĐÂY. Bản trước gõ thẳng "capsule" và ca
       đỏ ngay ngày spec được dọn (26/08/2026: spec đổi từ mô tả vật liệu sang DANH
       TỪ thuần — "the primary action button" thay cho "glossy 3D candy-red capsule
       button"). Thứ ca này phải chứng minh là ĐƯỜNG TÌM có đọc tới `spec`, không
       phải là thư viện có chứa đúng chữ nào. Nên lấy một từ RA TỪ CHÍNH dữ liệu rồi
       tìm ngược lại — luôn đúng, và vẫn đỏ nếu ai đó cắt `spec` khỏi phép tìm. */
    const target = loadBundledV2().elements.find((e) => e.file === "48-rank-row")!;
    const word = target.spec.split(/\s+/).find((w) => w.length > 6 && !/[^a-z]/i.test(w))!;
    expect(word, "spec của 48-rank-row phải còn ít nhất một từ tìm được").toBeTruthy();
    expect(filterViews(views, { query: word, group: "all" }).map((v) => v.file)).toContain("48-rank-row");
  });

  it("lọc nhóm cắt đúng, và lọc + tìm cộng dồn được", () => {
    expect(filterViews(views, { query: "", group: "medal" })).toHaveLength(3);
    expect(filterViews(views, { query: "#1", group: "medal" })).toHaveLength(1);
  });

  it("không khớp gì thì trả mảng rỗng (để UI hiện empty state riêng)", () => {
    expect(filterViews(views, { query: "zzz-khong-co", group: "all" })).toEqual([]);
  });

  it("foldVi bỏ dấu + đ→d", () => {
    expect(foldVi("Nút Đỏ")).toBe("nut do");
  });

  it("nhãn nhóm lạ hiện nguyên khoá thay vì vỡ", () => {
    expect(groupLabel("medal")).toBe("Huy chương");
    expect(groupLabel("nhom-la-hoac-moi")).toBe("nhom-la-hoac-moi");
  });
});

describe("«đã có trong sheet» — cảnh báo trùng tên file TRƯỚC khi thêm", () => {
  it("đánh dấu đúng element đã nằm trong sheet đích", () => {
    const used = usedByFileMap([{ id: "main", files: ["01-btn-pill-red", "04-btn-circle"] }]);
    const views = buildViews(loadBundledV2().elements, { usedByFile: used });
    expect(views.find((v) => v.file === "01-btn-pill-red")?.usedIn).toEqual(["main"]);
    expect(views.find((v) => v.file === "02-btn-pill-blue")?.usedIn).toEqual([]);
  });
});

describe("COPY vào project (chốt X8) — thư viện KHÔNG BAO GIỜ bị ghi ngược", () => {
  it("sửa `skel` của bản copy không đụng tới element trong thư viện", () => {
    const lib = loadBundledV2();
    const goc = lib.elements.find((e) => e.file === "01-btn-pill-red")!;
    const wGoc = goc.skel.w;

    const copy = libToComponent(goc);
    (copy.skel as { w: number }).w = 0.123;

    expect(goc.skel.w).toBe(wGoc);
    expect(loadBundledV2().elements.find((e) => e.file === "01-btn-pill-red")!.skel.w).toBe(wGoc);
  });

  it("copy giữ đủ 4 field mà contract cần", () => {
    const c = libToComponent(loadBundledV2().elements[0]!);
    expect(Object.keys(c).sort()).toEqual(["file", "skel", "spec", "vi"]);
  });
});

describe("gợi ý cho sheet mới", () => {
  const byFile = (f: string) => loadBundledV2().elements.find((e) => e.file === f)!;

  it("orient dọc CHỈ khi mọi element đều là ô dọc", () => {
    const portrait = loadBundledV2().elements.filter((e) => e.cell === "portrait");
    expect(orientFor(portrait)).toBe("portrait");
    expect(orientFor([...portrait, byFile("01-btn-pill-red")])).toBe("landscape");
    expect(orientFor([])).toBe("landscape");
  });

  it("tên sheet gợi ý theo `sheetHint` khi cả nhóm cùng hint", () => {
    expect(suggestedSheetId([byFile("25-bg-home")])).toBe("bg-home");
    expect(suggestedSheetId([byFile("25-bg-home"), byFile("26-bg-play")])).toBeUndefined();
    expect(suggestedSheetId([byFile("01-btn-pill-red")])).toBeUndefined();
  });
});

describe("cờ khung xương hiện thành badge", () => {
  it("đọc đúng slice9 / free / matte / anchor", () => {
    expect(skelFlags({ slice9: true }).map((f) => f.key)).toEqual(["slice9"]);
    expect(skelFlags({ matte: "glow" })[0]?.label).toBe("phát sáng");
    expect(skelFlags({ matte: "glass" })[0]?.label).toBe("trong suốt");
    expect(skelFlags({ free: true, anchor: "bottom" }).map((f) => f.key)).toEqual(["free", "anchor"]);
    expect(skelFlags({})).toEqual([]);
    expect(skelFlags(null)).toEqual([]);
  });

  it("nhãn `cell` sang tiếng Việt", () => {
    expect(cellLabel("landscape")).toBe("ô ngang");
    expect(cellLabel("portrait")).toBe("ô dọc");
    expect(cellLabel(undefined)).toBe("ô ngang");
  });
});

describe("chọn nguồn thư viện", () => {
  it("agent rỗng ⇒ chỉ còn bản đóng gói dùng được (UI tự chuyển sang đó)", () => {
    expect(sourceAvailability(null)).toEqual({ agent: false, v2: true });
    expect(sourceAvailability(fromAgentLib({ elements: [] }))).toEqual({ agent: false, v2: true });
  });

  it("agent có dữ liệu ⇒ cả hai nguồn đều chọn được", () => {
    const agent = normalizeLib(JSON.parse(read("element-lib.json")));
    expect(sourceAvailability(agent)).toEqual({ agent: true, v2: true });
  });
});
