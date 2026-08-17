/* @vitest-environment jsdom */
/**
 * P1-4 — «NỀN TÁCH» CỦA TỪNG Ô, TỪ CÚ BẤM TỚI PROMPT.
 *
 * Cơ chế `skel.matte:"glow"` vốn đã đi hết đường ống engine (`gen.sh:273–281` in câu
 * nền đen cho đúng ô đó, `slice.py:740–798` tách bằng nhánh riêng); thứ thiếu là ba
 * mắt xích ở phía webapp, và mỗi mắt xích hỏng theo một kiểu IM LẶNG khác nhau:
 *
 *  ① trang Skeleton UI không có chỗ nào chọn ⇒ tính năng coi như không tồn tại;
 *  ② lớp đè của dự án chỉ chép `w`/`h` ⇒ chọn xong, UI hiện đúng, contract TRỐNG;
 *  ③ `item-prompt.ts` không dựng lại câu nền đen ⇒ panel "Prompt sẽ gửi đi" nói dối
 *     đúng vào lúc người dùng đang tìm bằng chứng rằng cái nút có tác dụng.
 *
 * Ba mắt xích ⇒ ba nhóm ca. Đường merge (②) được khoá kỹ hơn ở
 * `lib/__tests__/kitset-to-contract.test.ts` §P1-4; ở đây khoá đường ĐI QUA UI thật.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { buildKitsetContract } from "../lib/kitset-to-contract";
import { glassCellPrompt, glowCellPrompt, isGlassCell, isGlowCell, itemPromptFor } from "../lib/item-prompt";
import { KitsetStep } from "../steps/KitsetStep";

const PID = "kit-nen-o";
/** Ô hiệu ứng của thư viện đóng gói — thư viện ĐÃ khai `matte:"glow"` cho nó. */
const GLOW_FILE = "16-fx-burst";
const GLOW_LABEL = "Hiệu ứng nổ sáng";
/** Ô KÍNH — chính món đã đo 325 626 px magenta đục ở dự án `hello-368a`. */
const GLASS_FILE = "22-board-panel";
const GLASS_LABEL = "Khay đựng túi";
const LIB = loadBundledV2().elements;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider><WorkflowStoreProvider projectId={PID}><KitsetStep variant="manage" /></WorkflowStoreProvider></TooltipProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

/** Mở popup Chi tiết của MỘT món: đổi nhóm → tìm theo tên → bấm nút trên thẻ. */
function openDetail(container: HTMLElement, group: string, label: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${group}`) }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: label } });
  const grid = container.querySelector(".compact-element-grid") as HTMLElement;
  fireEvent.click(within(grid).getByRole("button", { name: `Chi tiết ${label}` }));
  return screen.getByRole("dialog");
}

const state = () => createWorkflowStore(PID).getState();
const skelOf = (file: string) => state().elements.find((e) => e.file === file)?.skel;

describe("① control «Nền tách» nằm trong popup Chi tiết, không trần ra lưới", () => {
  it("popup có đúng hai lựa chọn, và ô hiệu ứng mở ra đã ở «nền đen» theo thư viện", () => {
    const { container } = mount();
    const dialog = openDetail(container, "Đạo cụ", GLOW_LABEL);
    const chroma = within(dialog).getByRole("button", { name: "Chroma thường" });
    const black = within(dialog).getByRole("button", { name: "Đen cho hiệu ứng phát sáng" });
    // Nghĩa nằm ở `aria-pressed`, không ở màu (§5.8-A3).
    expect(black.getAttribute("aria-pressed")).toBe("true");
    expect(chroma.getAttribute("aria-pressed")).toBe("false");
  });

  it("lưới thành phần KHÔNG mọc thêm control nào vì tính năng này", () => {
    const { container } = mount();
    const grid = container.querySelector(".compact-element-grid")!;
    expect(grid.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(within(grid as HTMLElement).queryByRole("button", { name: /Nền tách|phát sáng/ })).toBeNull();
  });

  it("bấm hai nút ⇒ lớp đè của dự án đổi theo, và bấm lại về đúng chỗ cũ", () => {
    const { container } = mount();
    const dialog = openDetail(container, "Đạo cụ", GLOW_LABEL);
    fireEvent.click(within(dialog).getByRole("button", { name: "Chroma thường" }));
    expect(skelOf(GLOW_FILE)?.matte).toBe("none");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đen cho hiệu ứng phát sáng" }));
    expect(skelOf(GLOW_FILE)?.matte).toBe("glow");
  });

  it("ô KÍNH của thư viện mở ra đã ở «Trong suốt», và ba nút loại trừ nhau", () => {
    const { container } = mount();
    const dialog = openDetail(container, "Popup", GLASS_LABEL);
    const pressed = ["Chroma thường", "Đen cho hiệu ứng phát sáng", "Trong suốt nhìn xuyên qua"]
      .map((name) => within(dialog).getByRole("button", { name }).getAttribute("aria-pressed"));
    expect(pressed).toEqual(["false", "false", "true"]);
  });

  it("chọn «Trong suốt» cho một ô thường ⇒ lớp đè ghi `glass`, bỏ ra thì xoá sạch", () => {
    const plain = LIB.find((e) => e.skel.matte === undefined && !isPropOrBg(e.file))!;
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", plain.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Trong suốt nhìn xuyên qua" }));
    expect(skelOf(plain.file)?.matte).toBe("glass");
    fireEvent.click(within(dialog).getByRole("button", { name: "Chroma thường" }));
    expect(skelOf(plain.file)).toBeUndefined();
  });

  it("ô vốn là KÍNH: chọn «Chroma thường» ghi `none` TƯỜNG MINH để đè được thư viện", () => {
    const { container } = mount();
    const dialog = openDetail(container, "Popup", GLASS_LABEL);
    fireEvent.click(within(dialog).getByRole("button", { name: "Chroma thường" }));
    expect(skelOf(GLASS_FILE)?.matte).toBe("none");
  });

  it("ô vốn là chroma: chọn «Chroma thường» XOÁ lớp đè thay vì ghi một giá trị thừa", () => {
    const plain = LIB.find((e) => e.skel.matte === undefined && !isPropOrBg(e.file))!;
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", plain.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Đen cho hiệu ứng phát sáng" }));
    expect(skelOf(plain.file)?.matte).toBe("glow");
    fireEvent.click(within(dialog).getByRole("button", { name: "Chroma thường" }));
    expect(skelOf(plain.file)).toBeUndefined(); // không còn lớp đè nào cả
  });
});

/** Món chắc chắn KHÔNG rơi vào nhóm "Đạo cụ"/"Nền" — để mở đúng thẻ trong nhóm "UI nhỏ". */
function isPropOrBg(file: string): boolean {
  return /(^|[-\s])(prop|item|decor|gift|coin|reward|voucher|game-object|board-panel|pouch|medal|envelope|trophy|piece|fx)([-\s]|$)|bg|popup|modal|panel|ribbon/.test(file);
}

describe("② + ③ contract nhận field, và prompt preview nói đúng sự thật", () => {
  const contractWith = (file: string, matte: "glow" | "glass" | "none") => {
    const s = state();
    return buildKitsetContract(
      { ...s, elements: s.elements.map((e) => (e.file === file ? { ...e, selected: true, skel: { matte } } : e)) },
      { lib: LIB },
    );
  };

  it("ô nền đen ⇒ prompt của ô CÓ câu nền đen, chép nguyên văn gen.sh", () => {
    const prompt = itemPromptFor(contractWith(GLOW_FILE, "glow"), GLOW_FILE)!;
    expect(prompt.line).toContain(glowCellPrompt("magenta"));
    expect(prompt.text).toContain("PURE BLACK #000000");
    expect(prompt.text).toContain("drawn ADDITIVELY on black");
  });

  it("TẮT nền đen ⇒ câu đó BIẾN MẤT khỏi prompt (preview không được kẹt ở trạng thái cũ)", () => {
    const prompt = itemPromptFor(contractWith(GLOW_FILE, "none"), GLOW_FILE)!;
    expect(prompt.line).not.toContain("SPECIAL CELL BACKGROUND");
    expect(prompt.text).not.toContain("PURE BLACK");
  });

  it("ô thường không bị dính câu nền đen của hàng xóm", () => {
    const contract = contractWith(GLOW_FILE, "glow");
    const others = contract.sheets
      .flatMap((sh) => sh.components)
      .filter((cp) => cp.file !== GLOW_FILE && cp.skel.shape !== "empty" && !isGlowCell(cp.skel));
    expect(others.length).toBeGreaterThan(0);
    for (const cp of others) {
      expect(itemPromptFor(contract, cp.file)?.line ?? "").not.toContain("SPECIAL CELL BACKGROUND");
    }
  });

  it("ô KÍNH ⇒ prompt có câu trong suốt, và KHÔNG có câu nền đen", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "glass"), GLASS_FILE)!;
    expect(prompt.line).toContain(glassCellPrompt("magenta"));
    expect(prompt.text).toContain("SEE-THROUGH ELEMENT");
    expect(prompt.text).toContain("IS the transparency");
    // Kính KHÔNG đổi nền ô — đây là điểm khác căn bản với glow, khoá lại kẻo ai đó
    // "thống nhất" hai nhánh thành một rồi đẩy kính lên nền đen (docs §2).
    expect(prompt.text).not.toContain("PURE BLACK");
  });

  it("TẮT trong suốt ⇒ câu đó biến mất, ô về chroma thường", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "none"), GLASS_FILE)!;
    expect(prompt.line).not.toContain("SEE-THROUGH ELEMENT");
  });

  it("một ô chỉ nhận ĐÚNG MỘT câu phụ — glow thắng, đúng thứ tự if/elif của gen.sh", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "glow"), GLASS_FILE)!;
    expect(prompt.line).toContain("PURE BLACK");
    expect(prompt.line).not.toContain("SEE-THROUGH ELEMENT");
  });

  /* `gen.sh` nối chuỗi qua NHIỀU literal python xuống dòng, có cái mang tiền tố `f`
     (`"…at the" f" cell borders…"`), nên giữa các mảnh còn `f`, dấu nháy và thụt lề.
     Bỏ tiền tố `f`, rồi bỏ khoảng trắng + dấu nháy ở cả hai bên: cái phải khớp là
     CHỮ, không phải cách xuống dòng của bash. */
  const flat = (s: string) => s.replace(/\bf"/g, '"').replace(/["\s]+/g, "");
  const genSh = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), "..", "gen.sh"), "utf8");
  };
  /* `gen.sh` dựng câu bằng f-string có `{key_name}` ⇒ so TỪNG MẢNH quanh mỗi chỗ chèn:
     mảnh nào lệch một chữ là preview đã nói khác thứ máy vẽ nhận. */
  const expectMirrored = (gen: string, sentence: string) => {
    for (const piece of sentence.replace(/^\s*—\s*/, "").split("§KEY§")) {
      if (piece.trim()) expect(flat(gen)).toContain(flat(piece));
    }
  };

  it("câu NỀN ĐEN khớp TỪNG CHỮ với `gen.sh` (đọc file thật, không đọc trí nhớ)", async () => {
    const gen = await genSh();
    expectMirrored(gen, glowCellPrompt("§KEY§"));
    // …và chỗ chèn đúng là biến tên key của gen.sh, không phải một chữ cứng.
    expect(gen).toMatch(/cell borders \(the \{key_name\} chroma-key/);
  });

  it("câu TRONG SUỐT khớp TỪNG CHỮ với `gen.sh`", async () => {
    const gen = await genSh();
    expectMirrored(gen, glassCellPrompt("§KEY§"));
    expect(gen).toMatch(/\{key_name\} chroma-key background stays VISIBLE THROUGH/);
    // Nhánh của kính phải là `elif` sau nhánh glow — nếu ai đó đổi thành `if` rời thì
    // một ô có thể ăn cả hai câu, và ca "đúng một câu phụ" ở trên sẽ không đủ để bắt.
    expect(gen).toMatch(/elif comps\[i\]\["skel"\]\.get\("matte"\) == "glass":/);
  });

  it("`isGlassCell` đọc đúng `matte` của contract, không đoán theo tên file", () => {
    const contract = contractWith(GLASS_FILE, "glass");
    const cells = contract.sheets.flatMap((sh) => sh.components).filter((cp) => isGlassCell(cp.skel));
    expect(cells.map((cp) => cp.file)).toContain(GLASS_FILE);
  });
});
