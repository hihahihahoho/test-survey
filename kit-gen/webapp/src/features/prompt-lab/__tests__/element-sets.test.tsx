/* @vitest-environment jsdom */
/**
 * BỘ MÓN GIAO DIỆN — «chọn 1 được 2», và bốn chỗ nó có thể hỏng CÂM.
 *
 *  ① HÌNH HỌC CỦA MỘT BỘ. Khung và phần đầy của cùng một thanh phải cùng hình
 *    dạng và phần đầy phải NHỎ HƠN khung. Lệch thì không có gì báo: hai tấm PNG
 *    vẫn ra, vẫn đẹp, và chỉ tới lúc lập trình game xếp chúng lên nhau mới thấy
 *    cái ruột thò ra ngoài cái vỏ.
 *  ② DANH SÁCH BỘ PHẢI PHỦ KÍN DANH MỤC. Từ 09/2026 hộp «+ Element» CHỈ bày bộ
 *    (chủ sản phẩm: *«lúc pick thì select theo SET, chứ không select lẻ»*), nên
 *    một món không rơi vào bộ nào là một món biến mất khỏi hộp chọn mà vẫn nằm
 *    trong danh mục — người dùng thấy nó ở màn quản lý và không tài nào thêm
 *    được vào thẻ.
 *  ③ CHỌN BỘ PHẢI RA ĐỦ Ô. Ra thiếu một ô thì tấm vẽ ra thiếu một món, và người
 *    ta chỉ phát hiện sau khi đã trả tiền cho lượt vẽ.
 *  ④ CÂU CỦA MỘT PHẦN PHẢI TỚI ĐƯỢC `spec`. `gen.sh` in mỗi ô một dòng độc lập
 *    và `chunkBySize` có quyền cắt một bộ sang hai tấm — nên quan hệ "cái này nằm
 *    trong cái kia" chỉ sống sót nếu nó nằm TRONG CHÍNH CÂU của phần ấy.
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { composerToContract } from "@/features/prompt-canvas/lib/composer-to-contract";
import { elementSets, seedPresets, type ElementPreset } from "../lib/presets-store";
import { newCell, type ComposerState, type UiCell, type UiKitBlock } from "../lib/composer-model";
import { UiKitBlockBody } from "../components/UiKitBlockView";

const PRESETS = seedPresets();

/* Cùng khuôn với `uikit-block.test.tsx`: ca ở đây nói về BỘ, không về đường tải
   danh mục, nên `usePresets` trả thẳng hạt giống — một bộ dữ liệu cho cả hai nửa. */
vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

const elementOf = (id: string): ElementPreset =>
  PRESETS.elements.find((element) => element.id === id)!;

afterEach(cleanup);

/* ══════════════════════════════════════════════════════════════════════════
   ① HÌNH HỌC VÀ HÌNH DẠNG DỮ LIỆU CỦA MỘT BỘ
   ══════════════════════════════════════════════════════════════════════════ */

describe("① bộ hạt giống: đủ phần, đủ hình, không id trùng", () => {
  it("mọi NHÃN BỘ của hạt giống gom được ít nhất hai phần", () => {
    /* Luật này nói về DỮ LIỆU HẠT GIỐNG, không về `elementSets`: hàm ấy không còn
       ngưỡng nào (bộ một phần vẫn là một dòng bộ). Nhưng một nhãn bộ nằm sẵn trong
       hạt giống mà chỉ đeo đúng một món là một nhãn viết hụt — nó hứa "chọn 1 được
       nhiều" rồi ra đúng một ô. */
    const labelled = elementSets(PRESETS).filter((set) => set.parts[0]!.set?.id === set.id);
    expect(labelled.length).toBeGreaterThan(10);
    for (const set of labelled) {
      expect(set.parts.length, set.id).toBeGreaterThanOrEqual(2);
      expect(set.vi.trim().length, set.id).toBeGreaterThan(0);
    }
  });

  it("id món KHÔNG trùng nhau — id đi thẳng vào tên file của ô trong contract", () => {
    const ids = PRESETS.elements.map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mọi phần của mọi bộ đều KHAI hình dạng, và khai trong khoảng luật V-06", () => {
    for (const set of elementSets(PRESETS)) {
      for (const part of set.parts) {
        expect(part.skel, part.id).toBeTruthy();
        expect(part.skel!.w!, part.id).toBeGreaterThan(0);
        expect(part.skel!.w!, part.id).toBeLessThanOrEqual(1);
        expect(part.skel!.h!, part.id).toBeGreaterThan(0);
        expect(part.skel!.h!, part.id).toBeLessThanOrEqual(1);
      }
    }
  });

  /* ĐÂY LÀ CA CỦA CHÍNH LỜI CHỦ SẢN PHẨM: «thanh máu phải tách ra từng phần nhỏ».
     Phần đầy nằm TRONG khung, nên nó phải cùng hình dạng và nhỏ hơn theo CẢ HAI
     chiều — nhỏ hơn đúng một lề, không phải nhỏ đi tuỳ hứng. */
  it.each([
    ["healthbar", "hp-fill"],
    ["progress", "progress-fill"],
  ])("%s ⇢ %s: cùng hình dạng, phần đầy nhỏ hơn khung ở cả hai chiều", (frameId, fillId) => {
    const frame = elementOf(frameId);
    const fill = elementOf(fillId);
    expect(fill.set?.id).toBe(frame.set?.id);
    expect(fill.skel?.shape).toBe(frame.skel?.shape);
    expect(fill.skel!.w!).toBeLessThan(frame.skel!.w!);
    expect(fill.skel!.h!).toBeLessThan(frame.skel!.h!);
    /* Nhỏ hơn nhưng KHÔNG bé tí: một dải màu bằng nửa cái khung thì nhìn ra ngay
       là hai món khác nhau chứ không phải ruột của nhau. */
    expect(fill.skel!.w! / frame.skel!.w!).toBeGreaterThan(0.85);
  });

  /* Phần đầy không được mọc viền của riêng nó: xếp lên khung thì thành hai lớp
     viền chồng nhau, và cái ở dưới thì không ai nhìn thấy nữa. */
  it.each(["hp-fill", "progress-fill"])("%s để «Không trang trí» sẵn", (id) => {
    expect(elementOf(id).decor).toBe("none");
  });

  it("phong bì: nắp CÙNG BỀ NGANG với thân, để dán lại thành một cái", () => {
    expect(elementOf("envelope-flap").skel?.w).toBe(elementOf("envelope-body").skel?.w);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② MỘT DANH SÁCH BỘ, PHỦ KÍN DANH MỤC, KHÔNG CHỒNG NHAU
   ══════════════════════════════════════════════════════════════════════════ */

describe("② gom danh mục thành bộ", () => {
  it("mỗi món nằm ở ĐÚNG MỘT bộ — không món nào rơi khỏi hộp chọn", () => {
    const parts = elementSets(PRESETS).flatMap((set) => set.parts.map((part) => part.id));
    expect(parts).toHaveLength(PRESETS.elements.length);
    expect(new Set(parts).size).toBe(PRESETS.elements.length);
  });

  it("món KHÔNG đeo nhãn bộ thành một bộ MỘT PHẦN, không thành một loại dòng thứ hai", () => {
    const panel = elementSets(PRESETS).find((set) => set.parts[0]!.id === "panel")!;
    expect(panel.parts.map((part) => part.id)).toEqual(["panel"]);
    /* Nhãn của bộ một phần LÀ nhãn của chính món ấy — không có chữ nào sinh thêm. */
    expect(panel.vi).toBe("Bảng nền");
    expect(panel.id).toBe("panel");
  });

  it("nhãn bộ chỉ còn MỘT phần ⇒ VẪN là một dòng bộ, không rơi xuống dạng khác", () => {
    /* Cảnh thật: người dùng xoá bớt phần cho tới khi còn một. Bản trước đẩy nó
       xuống nhóm «Lẻ»; nay không còn nhóm nào để rơi xuống, và nhãn bộ vẫn nằm
       nguyên trên bản ghi nên phần thứ hai quay lại lúc nào cũng được. */
    const trimmed = {
      ...PRESETS,
      elements: PRESETS.elements.filter((element) => element.id !== "hp-fill"),
    };
    const hp = elementSets(trimmed).find((set) => set.id === "hp")!;
    expect(hp.parts.map((part) => part.id)).toEqual(["healthbar"]);
    expect(hp.vi).toBe("Thanh máu");
    expect(elementOf("healthbar").set?.id).toBe("hp");
  });

  it("một món lẻ mang đúng id của một nhãn bộ KHÔNG bị nuốt vào bộ ấy", () => {
    /* `addCustomElement` lấy id từ `slugify`, nên «Hp» ra đúng chuỗi mà nhãn bộ
       thanh máu đang mang. Gom theo id trần là ghép một món không liên quan vào
       bộ — xem hai tiền tố khoá trong `elementSets`. */
    const clash = {
      ...PRESETS,
      elements: [...PRESETS.elements, { id: "hp", vi: "Hp", en: "hp", decor: "none", glazeId: "", sizeId: "" }],
    };
    const rows = elementSets(clash).filter((set) => set.id === "hp");
    expect(rows).toHaveLength(2);
    expect(rows.map((set) => set.parts.map((part) => part.id))).toEqual([["healthbar", "hp-fill"], ["hp"]]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ HỘP «+ Element» CHỈ CÓ BỘ, VÀ MỘT CÚ BẤM RA ĐỦ Ô
   ══════════════════════════════════════════════════════════════════════════ */

function Harness({ onState }: { onState: (next: UiKitBlock) => void }) {
  const [block, setBlock] = React.useState<UiKitBlock>({ id: "u1", kind: "uikit", mode: "template", cells: [] });
  return (
    <UiKitBlockBody
      block={block}
      onChange={(updater) =>
        setBlock((prev) => {
          const next = updater(prev);
          onState(next);
          return next;
        })
      }
    />
  );
}

describe("③ hộp chọn: một danh sách toàn bộ, và một cú bấm ra đủ ô", () => {
  const openBox = () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
  };

  it("KHÔNG còn tiêu đề nhóm «Bộ»/«Lẻ» — mọi dòng hành xử như nhau", () => {
    openBox();
    const box = screen.getByRole("dialog", { name: /Thêm món/ });
    const titles = [...box.querySelectorAll("p")].map((node) => node.textContent);
    expect(titles).not.toContain("Bộ");
    expect(titles).not.toContain("Lẻ");
  });

  it("mỗi dòng là MỘT BỘ và nói ra số phần — không dòng nào cho một phần riêng", () => {
    openBox();
    const rows = screen.getAllByRole("option").map((node) => node.textContent ?? "");
    /* Đúng bằng số bộ trong kho: thừa một dòng nghĩa là một phần nào đó đã lọt ra
       ngoài dưới dạng lựa chọn riêng — đúng thứ chủ sản phẩm bảo bỏ. */
    expect(rows).toHaveLength(elementSets(PRESETS).length);
    for (const row of rows) expect(row).toMatch(/· \d+ phần/);
  });

  it("dòng của một bộ NÓI RA số phần trước khi người ta bấm", () => {
    openBox();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "thanh mau" } });

    const option = screen.getByRole("option", { name: /Thanh máu/ });
    expect(option.textContent).toContain("2 phần");
  });

  it("bấm một bộ ⇒ thêm ĐỦ các phần thành từng ô riêng, đúng thứ tự", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "thanh mau" } });
    fireEvent.click(screen.getByRole("option", { name: /Thanh máu/ }));

    expect(latest).not.toBeNull();
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["healthbar", "hp-fill"]);
    /* Ô THUỘC BỘ MANG NHÃN CỦA PHẦN, không phải một nhãn gộp: mỗi dòng vẫn là một
       dòng bình thường — xoá được, kéo được, đổi loại được. */
    expect(screen.getByLabelText("Ghi chú cho Thanh máu")).toBeTruthy();
    expect(screen.getByLabelText("Ghi chú cho Thanh máu · phần đầy")).toBeTruthy();
  });

  it("tìm bằng tên MỘT PHẦN ra BỘ chứa nó, chứ không ra chính phần ấy", () => {
    openBox();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "phan day" } });
    /* Hai bộ có phần đầy: thanh máu và thanh tiến trình. Cả hai đều hiện ra dưới
       dạng BỘ — người ta nhớ cái phần mình cần chứ không nhớ ta xếp nó vào bộ tên
       gì, nhưng thứ bấm được vẫn là cả bộ. */
    const rows = screen.getAllByRole("option").map((node) => node.textContent ?? "");
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatch(/· 2 phần/);
    expect(screen.getByRole("option", { name: /Thanh máu/ })).toBeTruthy();
  });

  it("món lẻ hiện như một BỘ MỘT PHẦN, và bấm ra đúng một ô", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "bang nen" } });

    const option = screen.getByRole("option", { name: /Bảng nền/ });
    expect(option.textContent).toContain("1 phần");
    fireEvent.click(option);
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["panel"]);
  });

  it("bộ đã có ĐỦ phần trong thẻ thì dòng của nó ghi «đã có trong thẻ»", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "thanh mau" } });
    expect(screen.getByRole("option", { name: /Thanh máu/ }).textContent).not.toContain("đã có trong thẻ");

    fireEvent.click(screen.getByRole("option", { name: /Thanh máu/ }));
    expect(screen.getByRole("option", { name: /Thanh máu/ }).textContent).toContain("đã có trong thẻ");
  });

  it("xoá bớt một phần ⇒ các phần còn lại ở nguyên, không kéo cả bộ đi theo", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "thanh mau" } });
    fireEvent.click(screen.getByRole("option", { name: /Thanh máu/ }));

    fireEvent.click(screen.getByRole("button", { name: /Bỏ element Thanh máu · phần đầy/ }));
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["healthbar"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ CÂU CỦA MỘT PHẦN ĐI TỚI `spec` CỦA ĐÚNG Ô ẤY
   ══════════════════════════════════════════════════════════════════════════ */

describe("④ prompt của một ô thuộc bộ", () => {
  const state = (cells: UiCell[]): ComposerState => ({
    themeValue: "a Vietnamese Tết festive outfit",
    styleId: PRESETS.styles[0]!.id,
    brandColors: [],
    themeCustom: "",
    styleCustom: "",
    brandId: "",
    contextRefs: [],
    brandAssets: {},
    contextMode: "template",
    blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }],
  });

  it("phần đầy tự nói ra nó nằm trong khung nào và không có khung của riêng nó", () => {
    const cells = [newCell("healthbar", PRESETS), newCell("hp-fill", PRESETS)];
    const ui = composerToContract(state(cells), { presets: PRESETS }).sheets.find((sheet) => sheet.id === "ui")!;

    expect(ui.components[0]!.spec.startsWith("health bar,")).toBe(true);
    const fill = ui.components[1]!.spec;
    /* Ba vế, và cả ba đều phải có mặt trong CÙNG MỘT dòng: nó là cái gì, nó nằm
       trong cái nào, và nó KHÔNG mang cái gì. Thiếu vế cuối thì máy vẽ thêm một
       cái khung nữa quanh phần đầy. */
    expect(fill).toContain("the fill bar");
    expect(fill).toContain("inside the health bar");
    expect(fill).toContain("no track or frame of its own");
    expect(ui.components[1]!.vi).toBe("Thanh máu · phần đầy");
  });

  it("hộp cắt của phần đầy nhỏ hơn hộp cắt của khung — hình học đi tới tận contract", () => {
    const cells = [newCell("healthbar", PRESETS), newCell("hp-fill", PRESETS)];
    const ui = composerToContract(state(cells), { presets: PRESETS }).sheets.find((sheet) => sheet.id === "ui")!;
    const frame = ui.components[0]!;
    const fill = ui.components[1]!;
    expect(fill.out!.w).toBeLessThan(frame.out!.w);
    expect(fill.out!.h).toBeLessThan(frame.out!.h);
    expect(fill.skel.shape).toBe(frame.skel.shape);
  });
});
