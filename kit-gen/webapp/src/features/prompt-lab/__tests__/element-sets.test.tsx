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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { composerToContract } from "@/features/prompt-canvas/lib/composer-to-contract";
import {
  elementLabel, elementPart, elementSets, elementTitle, seedPresets, type ElementPreset,
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

  /* ══ LUẬT RIÊNG CỦA BỘ BIẾN THỂ ═══════════════════════════════════════════
     Chủ sản phẩm: *«button có thể primary không, không phụ thuộc vào disabled
     hoặc pressed»*. Hai trạng thái của một món là hai ảnh THAY ĐƯỢC CHO NHAU lúc
     chạy game — lập trình game đổi ảnh trong cùng một chỗ trên màn. Nên chúng
     phải cùng hình dạng và cùng tỉ lệ; lệch thì cái nút nhảy cỡ lúc bị bấm, và
     không có gì báo cho tới khi nhìn thấy nó nhảy. */
  it("mọi trạng thái của một BỘ BIẾN THỂ dùng chung MỘT hình học", () => {
    const variants = elementSets(PRESETS).filter((set) => set.kind === "variants");
    expect(variants.length).toBeGreaterThan(5);
    for (const set of variants) {
      const head = set.parts[0]!.skel!;
      for (const part of set.parts) {
        expect(part.skel!.shape, `${set.id}/${part.id}`).toBe(head.shape);
        expect(part.skel!.w, `${set.id}/${part.id}`).toBe(head.w);
        expect(part.skel!.h, `${set.id}/${part.id}`).toBe(head.h);
      }
    }
  });

  /* Ngược lại: hai MẢNH của một bộ ghép KHÔNG được trùng hình học hoàn toàn —
     trùng cả hình lẫn tỉ lệ là dấu hiệu chúng thật ra là hai trạng thái bị xếp
     nhầm loại, và người dùng sẽ bị bắt lấy cả cụm cho một thứ chọn lẻ được. */
  it("bộ GHÉP nhiều phần: không phải mọi phần đều trùng khít hình học", () => {
    for (const set of elementSets(PRESETS).filter((view) => view.kind === "composition")) {
      if (set.parts.length < 2) continue;
      const head = set.parts[0]!.skel!;
      const allSame = set.parts.every(
        (part) => part.skel!.shape === head.shape && part.skel!.w === head.w && part.skel!.h === head.h,
      );
      expect(allSame, set.id).toBe(false);
    }
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
    /* Nhãn của bộ một phần LÀ nhãn của chính món ấy — không có chữ nào sinh thêm,
       và `elementLabel` cũng không ghép thêm gì (không có tên bộ để ghép). */
    expect(panel.vi).toBe("Panel");
    expect(panel.id).toBe("panel");
    expect(elementLabel(elementOf("panel"), "?")).toBe("Panel");
    /* Và hai hạng chữ của pill dòng cũng vậy: tiêu đề là chính nó, phần phụ RỖNG
       — không có tên bộ nào để nói thêm, nên không được bịa ra một hạng chữ thứ
       hai chỉ để cho đủ hình dạng. */
    expect(elementTitle(elementOf("panel"), "?")).toBe("Panel");
    expect(elementPart(elementOf("panel"))).toBe("");
  });

  it("phần của một bộ: TIÊU ĐỀ là tên bộ, chữ phụ là tên phần — hai chỗ khác nhau", () => {
    /* `elementLabel` vẫn ghép cả hai thành MỘT chuỗi (contract, `aria-label`);
       chỗ nào vẽ được hai hạng chữ thì đọc riêng. Ba hàm, một nguồn. */
    expect(elementTitle(elementOf("hp-fill"), "?")).toBe("Health bar");
    expect(elementPart(elementOf("hp-fill"))).toBe("fill");
    expect(elementLabel(elementOf("hp-fill"), "?")).toBe("Health bar · fill");
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
    expect(hp.vi).toBe("Health bar");
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

  it("BỘ GHÉP: đúng một dòng cho cả bộ, và dòng ấy nói ra số phần", () => {
    openBox();
    /* Mỗi bộ ghép đóng góp ĐÚNG MỘT dòng chọn được — thừa một dòng nghĩa là một
       phần nào đó đã lọt ra ngoài dưới dạng lựa chọn riêng, đúng thứ chủ sản phẩm
       bảo bỏ với loại bộ này («1 thanh bar thì bắt buộc phải có composition kia»). */
    for (const set of elementSets(PRESETS).filter((view) => view.kind === "composition")) {
      const option = screen.getByRole("option", { name: new RegExp(`^${set.vi} · ${set.parts.length} phần`) });
      expect(option.textContent, set.id).toContain(`${set.parts.length} phần`);
    }
  });

  it("SỐ DÒNG CHỌN ĐƯỢC = bộ ghép + (mỗi biến thể một dòng, cộng một dòng «Cả bộ»)", () => {
    openBox();
    const sets = elementSets(PRESETS);
    const expected = sets.reduce(
      (sum, set) => sum + (set.kind === "variants" && set.parts.length > 1 ? set.parts.length + 1 : 1),
      0,
    );
    expect(screen.getAllByRole("option")).toHaveLength(expected);
  });

  /* ══ ĐÂY LÀ CA CỦA CHÍNH LỜI CHỦ SẢN PHẨM ═════════════════════════════════
     *«button có thể primary không, không phụ thuộc vào disabled hoặc pressed»*.
     Bốn trạng thái là bốn dòng bấm được, và bấm một dòng ra ĐÚNG MỘT ô. */
  it("BỘ BIẾN THỂ mở ra thành nhóm: tiêu đề + từng trạng thái + «Cả bộ»", () => {
    openBox();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "button" } });

    const group = screen.getByRole("group", { name: "Button" });
    /* Tiêu đề KHÔNG bấm được: nếu nó bấm được thì nó và «Cả bộ» là hai cách nói
       cùng một câu, và người dùng phải đoán xem chúng có khác nhau không. */
    expect(within(group).getByText(/^Button/).tagName).toBe("P");
    const rows = within(group).getAllByRole("option").map((node) => node.getAttribute("aria-label"));
    expect(rows).toEqual([
      "Button · primary", "Button · secondary", "Button · pressed", "Button · disabled",
      "Button · Cả bộ (4)",
    ]);
    /* KHÔNG có dòng «Button · 4 phần» nào nữa: đó là dòng vừa bị chỉ mặt. */
    expect(screen.queryByRole("option", { name: /^Button · 4 phần/ })).toBeNull();
  });

  it("bấm MỘT trạng thái ⇒ thêm ĐÚNG MỘT ô, không kéo ba trạng thái kia theo", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.click(screen.getByRole("option", { name: "Button · primary" }));

    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["button"]);
  });

  it("bấm «Cả bộ» ⇒ thêm đủ bốn trạng thái, đúng thứ tự danh mục", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.click(screen.getByRole("option", { name: "Button · Cả bộ (4)" }));

    expect(latest!.cells.map((cell) => cell.elementId))
      .toEqual(["button", "btn-secondary", "btn-pressed", "btn-disabled"]);
  });

  it("«đã có trong thẻ» đánh dấu theo TỪNG trạng thái, không theo cả bộ", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.click(screen.getByRole("option", { name: "Button · primary" }));

    expect(screen.getByRole("option", { name: "Button · primary" }).textContent).toContain("đã có trong thẻ");
    /* Ba dòng kia KHÔNG được ăn theo: chúng là ba món khác, chưa có cái nào trong
       thẻ, và nói ngược lại là nói dối về chính danh sách đang hiện. */
    expect(screen.getByRole("option", { name: "Button · secondary" }).textContent).not.toContain("đã có trong thẻ");
    expect(screen.getByRole("option", { name: "Button · Cả bộ (4)" }).textContent).not.toContain("đã có trong thẻ");
  });

  it("tìm theo TÊN MỘT TRẠNG THÁI ra nhóm của nó, và trạng thái ấy bấm được ngay", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "pressed" } });

    fireEvent.click(screen.getByRole("option", { name: "Button · pressed" }));
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["btn-pressed"]);
  });

  it("dòng của một bộ NÓI RA số phần trước khi người ta bấm", () => {
    openBox();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "health" } });

    const option = screen.getByRole("option", { name: /^Health bar/ });
    expect(option.textContent).toContain("2 phần");
  });

  it("bấm một bộ ⇒ thêm ĐỦ các phần thành từng ô riêng, đúng thứ tự", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "health" } });
    fireEvent.click(screen.getByRole("option", { name: /^Health bar/ }));

    expect(latest).not.toBeNull();
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["healthbar", "hp-fill"]);
    /* MỖI PHẦN MỘT DÒNG RIÊNG, không có "dòng gộp": mỗi dòng vẫn là một dòng bình
       thường — xoá được, kéo được, đổi bộ được. Nhãn của nó là «tên bộ · tên phần»
       (`elementLabel`), nên hai dòng của cùng một bộ phân biệt được với nhau. */
    expect(screen.getByLabelText("Ghi chú cho Health bar · frame")).toBeTruthy();
    expect(screen.getByLabelText("Ghi chú cho Health bar · fill")).toBeTruthy();
  });

  it("tìm bằng tên MỘT PHẦN ra BỘ chứa nó — bộ ghép vẫn là một dòng cả cụm", () => {
    openBox();
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "fill" } });
    /* Ba bộ có phần khớp «fill»: Health bar («fill»), Progress bar («fill») và
       Inventory slot («filled»). Hai bộ đầu là BỘ GHÉP nên chúng hiện ra đúng một
       dòng cả cụm — người ta nhớ cái phần mình cần chứ không nhớ ta xếp nó vào bộ
       tên gì, nhưng thứ bấm được vẫn là cả bộ. Bộ thứ ba là BỘ BIẾN THỂ nên nó mở
       ra thành nhóm, và «filled» ở đó bấm lẻ được. */
    expect(screen.getByRole("option", { name: /^Health bar · 2 phần/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /^Progress bar · 2 phần/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Inventory slot · filled" })).toBeTruthy();
    /* KHÔNG có dòng nào mang một phần RỜI của hai bộ ghép: đó là điều ca này khoá. */
    expect(screen.queryByRole("option", { name: "Health bar · fill" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Progress bar · fill" })).toBeNull();
  });

  it("món lẻ hiện như một BỘ MỘT PHẦN, và bấm ra đúng một ô", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "panel" } });

    const option = screen.getByRole("option", { name: /^Panel/ });
    expect(option.textContent).toContain("1 phần");
    fireEvent.click(option);
    expect(latest!.cells.map((cell) => cell.elementId)).toEqual(["panel"]);
  });

  it("bộ đã có ĐỦ phần trong thẻ thì dòng của nó ghi «đã có trong thẻ»", () => {
    render(<Harness onState={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "health" } });
    expect(screen.getByRole("option", { name: /^Health bar/ }).textContent).not.toContain("đã có trong thẻ");

    fireEvent.click(screen.getByRole("option", { name: /^Health bar/ }));
    expect(screen.getByRole("option", { name: /^Health bar/ }).textContent).toContain("đã có trong thẻ");
  });

  it("xoá bớt một phần ⇒ các phần còn lại ở nguyên, không kéo cả bộ đi theo", () => {
    let latest: UiKitBlock | null = null;
    render(<Harness onState={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "health" } });
    fireEvent.click(screen.getByRole("option", { name: /^Health bar/ }));

    fireEvent.click(screen.getByRole("button", { name: /Bỏ element Health bar · fill/ }));
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
    /* CHỮ ĐẦY ĐỦ đi tới tận contract: `vi` của phần là «fill», và một ô tên «fill»
       đứng trong bảng kết quả thì không ai đọc ra nó là ruột của cái gì. */
    expect(ui.components[1]!.vi).toBe("Health bar · fill");
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
