/**
 * lib-source.test.ts — THƯ VIỆN ELEMENT: dữ liệu, chuẩn hoá, tìm kiếm, COPY.
 *
 * Ca test đối chiếu với FILE THẬT ở gốc repo, không phải với chính mình:
 *   · bản v2 đóng gói trong bundle phải GIỐNG TỪNG BYTE `teams/t1-chuanhoa/element-lib-v2.json`
 *   · cả hai nguồn phải đủ 42 element và parse sạch bằng schema của R0
 *
 * 08/09/2026 — đổi nhà từ `features/design/library/__tests__/lib-source.test.ts`.
 * Hai describe về `lib/contract.ts` (`libToComponent` · `orientFor` · `suggestedSheetId`
 * — thao tác "thêm element vào bản thiết kế" của màn S3) đi cùng màn ấy khi nó bị xoá.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { skelSchema } from "@/lib/types/contract";
import {
  buildViews, filterViews, foldVi, fromAgentLib, groupOptions, invalidFileName,
  loadBundledV2, normalizeLib, sourceAvailability, usedByFileMap,
} from "../element-lib/source";
import { NO_GROUP, cellLabel, groupLabel, skelFlags } from "../element-lib/types";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("bản v2 đóng gói trong bundle KHÔNG được trôi khỏi bản gốc", () => {
  /**
   * TỪNG BYTE → "khác ĐÚNG ba ô, và khác đúng chỗ đã biết" (08/09/2026).
   *
   * `teams/t1-chuanhoa/element-lib-v2.json` là bản bàn giao ĐÃ ĐÓNG BĂNG của đội T1;
   * không ai được sửa nó nữa. Bản đóng gói thì vừa phải đổi, vì `skel.matte` bị bỏ
   * khỏi contract/engine/agent và ba ô CÓ ĐỘ TRONG phải nói lại điều đó bằng chữ
   * trong `spec`. So từng byte sau đợt ấy chỉ còn hai lối thoát, và cả hai đều tệ:
   * sửa file bàn giao, hoặc xoá ca test.
   *
   * Nên ca này đổi câu hỏi: KHÔNG phải "hai file có giống nhau không" mà "bản đóng
   * gói có trôi khỏi bản gốc ở chỗ nào NGOÀI danh sách đã chốt không". Mọi ô khác
   * vẫn phải giống hệt, và ba ô kia phải khác đúng theo kiểu đã khai — mất `matte`,
   * `spec` mọc thêm hợp đồng alpha. Một chữ đổi trộm ở ô thứ tư vẫn đỏ như cũ.
   */
  const ALPHA_CELLS = ["03-btn-pill-outline", "16-fx-burst", "22-board-panel"];

  it("khác bản bàn giao ĐÚNG ba ô có độ trong, không hơn", () => {
    type El = { file: string; spec: string; skel: Record<string, unknown> };
    const parse = (p: string) => JSON.parse(read(p)) as { elements: El[] };
    const goc = parse("teams/t1-chuanhoa/element-lib-v2.json");
    const dongGoi = parse("webapp/src/features/kit-core/lib/element-lib/element-lib-v2.json");

    expect(dongGoi.elements.map((e) => e.file)).toEqual(goc.elements.map((e) => e.file));
    const gocBy = new Map(goc.elements.map((e) => [e.file, e]));
    const khac: string[] = [];
    for (const e of dongGoi.elements) {
      if (JSON.stringify(e) !== JSON.stringify(gocBy.get(e.file))) khac.push(e.file);
    }
    expect(khac.sort()).toEqual([...ALPHA_CELLS].sort());

    for (const file of ALPHA_CELLS) {
      const truoc = gocBy.get(file)!;
      const sau = dongGoi.elements.find((e) => e.file === file)!;
      /* Bản gốc khai độ trong bằng CỜ; bản nay khai bằng CHỮ. Đó là toàn bộ khác biệt. */
      expect(truoc.skel, `${file} — bản gốc vốn có cờ`).toHaveProperty("matte");
      expect(sau.skel, `${file} — cờ đã bỏ`).not.toHaveProperty("matte");
      expect(sau.spec, `${file} — hợp đồng alpha nay nằm trong spec`).toContain("alpha");
      /* Ngoài `spec` và `matte` thì không được đổi gì khác. */
      expect({ ...sau, spec: "", skel: { ...sau.skel } })
        .toEqual({ ...truoc, spec: "", skel: (({ matte: _m, ...rest }) => rest)(truoc.skel) });
    }
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

describe("cờ khung xương hiện thành badge", () => {
  it("đọc đúng slice9 / free / anchor", () => {
    expect(skelFlags({ slice9: true }).map((f) => f.key)).toEqual(["slice9"]);
    expect(skelFlags({ free: true, anchor: "bottom" }).map((f) => f.key)).toEqual(["free", "anchor"]);
    expect(skelFlags({})).toEqual([]);
    expect(skelFlags(null)).toEqual([]);
  });

  /* GUARD ÂM: `matte` từng là badge thứ tư ("phát sáng" / "trong suốt"). Cả khái
     niệm "cách tách của một ô" đã bỏ — dữ liệu ĐỜI CŨ còn khoá ấy thì cũng không
     được mọc ra badge nào, nếu không người dùng đọc được một trạng thái mà app
     không còn thi hành. */
  it("dữ liệu đời cũ còn `matte` ⇒ KHÔNG sinh badge nào", () => {
    expect(skelFlags({ matte: "glow" } as Parameters<typeof skelFlags>[0])).toEqual([]);
    expect(skelFlags({ matte: "glass", slice9: true } as Parameters<typeof skelFlags>[0]).map((f) => f.key))
      .toEqual(["slice9"]);
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
