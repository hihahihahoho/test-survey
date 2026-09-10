/* @vitest-environment jsdom */
/**
 * BỘ MÓN GIAO DIỆN — «chọn 1 được 2», và bốn chỗ nó có thể hỏng CÂM.
 *
 *  ① HÌNH HỌC CỦA MỘT BỘ. Khung và phần đầy của cùng một thanh phải cùng hình
 *    dạng và phần đầy phải NHỎ HƠN khung. Lệch thì không có gì báo: hai tấm PNG
 *    vẫn ra, vẫn đẹp, và chỉ tới lúc lập trình game xếp chúng lên nhau mới thấy
 *    cái ruột thò ra ngoài cái vỏ.
 *  ② PHÂN ĐÔI «Bộ | Lẻ» PHẢI PHỦ KÍN. Một món rơi khỏi cả hai nhóm là một món
 *    biến mất khỏi hộp chọn mà vẫn nằm trong danh mục — người dùng thấy nó ở màn
 *    quản lý và không tài nào thêm được vào thẻ.
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
import {
  MIN_SET_PARTS,
  elementSets,
  looseElements,
  seedPresets,
  type ElementPreset,
} from "../lib/presets-store";
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
  it("mọi bộ có ít nhất hai phần — một phần thì nó là món lẻ, không phải bộ", () => {
    const sets = elementSets(PRESETS);
    expect(sets.length).toBeGreaterThan(10);
    for (const set of sets) {
      expect(set.parts.length, set.id).toBeGreaterThanOrEqual(MIN_SET_PARTS);
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
   ② «Bộ» VÀ «Lẻ» PHỦ KÍN DANH MỤC, KHÔNG CHỒNG NHAU
   ══════════════════════════════════════════════════════════════════════════ */

describe("② phân đôi Bộ | Lẻ", () => {
  it("mỗi món nằm ở ĐÚNG MỘT phía — không món nào rơi khỏi hộp chọn", () => {
    const inSets = elementSets(PRESETS).flatMap((set) => set.parts.map((part) => part.id));
    const loose = looseElements(PRESETS).map((element) => element.id);
    expect(new Set([...inSets, ...loose]).size).toBe(PRESETS.elements.length);
    expect(inSets.filter((id) => loose.includes(id))).toEqual([]);
  });

  it("nhãn bộ chỉ còn MỘT phần ⇒ rơi xuống «Lẻ», nhãn vẫn nằm nguyên trên bản ghi", () => {
    /* Cảnh thật: người dùng xoá bớt phần cho tới khi còn một. */
    const trimmed = {
      ...PRESETS,
      elements: PRESETS.elements.filter((element) => element.id !== "hp-fill"),
    };
    expect(elementSets(trimmed).map((set) => set.id)).not.toContain("hp");
    expect(looseElements(trimmed).map((element) => element.id)).toContain("healthbar");
    expect(elementOf("healthbar").set?.id).toBe("hp");
  });

  it("nhãn bộ của một bộ lấy từ PHẦN ĐẦU TIÊN — hai chữ lệch nhau không làm nhãn nhảy", () => {
    const skewed = {
      ...PRESETS,
      elements: PRESETS.elements.map((element) =>
        element.id === "hp-fill" && element.set ? { ...element, set: { ...element.set, vi: "Chữ lệch" } } : element,
      ),
    };
    expect(elementSets(skewed).find((set) => set.id === "hp")?.vi).toBe("Thanh máu");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ CHỌN MỘT BỘ ⇒ THÊM ĐỦ CÁC PHẦN
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

describe("③ hộp chọn: hai nhóm, và một cú bấm ra đủ ô", () => {
  it("hộp «Thêm món» bày nhóm «Bộ» trước nhóm «Lẻ»", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));

    const box = screen.getByRole("dialog", { name: /Thêm món/ });
    const titles = [...box.querySelectorAll("p")].map((node) => node.textContent);
    expect(titles).toContain("Bộ");
    expect(titles).toContain("Lẻ");
    expect(titles.indexOf("Bộ")).toBeLessThan(titles.indexOf("Lẻ"));
  });

  it("dòng của một bộ NÓI RA số phần trước khi người ta bấm", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
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

  it("tìm bằng tên MỘT PHẦN cũng ra bộ chứa nó — người ta nhớ phần, không nhớ bộ", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "phan day" } });
    expect(screen.getByRole("option", { name: /Thanh máu/ })).toBeTruthy();
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
