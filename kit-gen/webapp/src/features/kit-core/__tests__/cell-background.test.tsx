/**
 * P1-4 — «NỀN TÁCH» CỦA TỪNG Ô: từ lớp đè của dự án tới câu prompt.
 *
 * Cơ chế `skel.matte:"glow"` đi hết đường ống engine — nhưng từ 07/09/2026 nó chỉ còn
 * MỘT vế: `gen.sh` in câu ánh sáng cho đúng ô đó. Vế thứ hai (`slice.py` tách ô ấy khỏi
 * một tấm ĐEN bằng nhánh riêng, rồi ship `blend:"screen"`) đã bị bỏ hẳn: máy vẽ trả
 * alpha thật và dao cắt chỉ crop theo toạ độ. Nghĩa là mọi ca dưới đây nay đo ĐÚNG một
 * thứ — CÂU CHỮ tới máy vẽ — và ca «KHÔNG còn câu NỀN ĐEN» chuyển từ "chốt giữ đề
 * phòng" thành "khoá cái đã bỏ". Thứ dễ hỏng vẫn nằm ở phía webapp, và nó hỏng IM LẶNG:
 *
 *  ② lớp đè của dự án chỉ chép `w`/`h` ⇒ chọn xong, UI hiện đúng, contract TRỐNG;
 *  ③ `item-prompt.ts` không dựng lại câu ánh sáng ⇒ panel "Prompt sẽ gửi đi" nói dối
 *     đúng vào lúc người dùng đang tìm bằng chứng rằng lựa chọn có tác dụng.
 *
 * ══ NHÓM ① ĐÃ RỜI ĐI CÙNG MÀN CỦA NÓ (đợt IA prompt-first) ═════════════════
 * Nhóm ① từng đi qua UI thật: mở popup «Chi tiết» của một món trong lưới thành phần
 * của `steps/KitsetStep`, bấm ba nút «Nền thường / Hiệu ứng phát sáng / Trong suốt»,
 * rồi đọc lớp đè trong store. Cả `KitsetStep` lẫn trang chứa nó (trình quản lý dự án
 * đời wizard) đã bị XOÁ: `/p/:id` nay là màn «Kết quả & xuất kit» chỉ-xem, còn nơi
 * soạn duy nhất là khu soạn prompt. Không còn cái nút nào để bấm ⇒ không còn ca nào
 * để chạy; giữ lại là để test xanh canh một màn không tồn tại.
 *
 * HAI MẮT XÍCH DƯỚI ĐÂY KHÔNG ĐỔI MỘT CHỮ, và chúng mới là phần đắt: `buildKitsetContract`
 * phải chở `matte` ra contract, `itemPromptFor` phải dựng lại ĐÚNG câu của `gen.sh`
 * (so từng chữ với file thật, không so với trí nhớ). Đường merge (②) còn được khoá kỹ
 * hơn ở `lib/__tests__/kitset-to-contract.test.ts` §P1-4.
 */
import { describe, expect, it } from "vitest";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { buildKitsetContract } from "../lib/kitset-to-contract";
import { glassCellPrompt, glowCellPrompt, isGlassCell, isGlowCell, itemPromptFor } from "../lib/item-prompt";

const PID = "kit-nen-o";
/** Ô hiệu ứng của thư viện đóng gói — thư viện ĐÃ khai `matte:"glow"` cho nó. */
const GLOW_FILE = "16-fx-burst";
/** Ô KÍNH — chính món đã đo 325 626 px magenta đục ở dự án `hello-368a`. */
const GLASS_FILE = "22-board-panel";
const LIB = loadBundledV2().elements;

const state = () => {
  resetWorkflowStores();
  return createWorkflowStore(PID).getState();
};

describe("② + ③ contract nhận field, và prompt preview nói đúng sự thật", () => {
  const contractWith = (file: string, matte: "glow" | "glass" | "none") => {
    const s = state();
    return buildKitsetContract(
      { ...s, elements: s.elements.map((e) => (e.file === file ? { ...e, selected: true, skel: { matte } } : e)) },
      { lib: LIB },
    );
  };

  it("ô hiệu ứng ⇒ prompt của ô CÓ câu ánh sáng, chép nguyên văn gen.sh", () => {
    const prompt = itemPromptFor(contractWith(GLOW_FILE, "glow"), GLOW_FILE)!;
    expect(prompt.line).toContain(glowCellPrompt());
    expect(prompt.text).toContain("LIGHT EFFECT");
    /* Câu đã ngắn lại cùng lượt dựng khung prompt theo section (09/2026): luật
       "không vẽ ô cờ" nay nói MỘT lần ở `## Transparency` cho cả tấm, nên dòng của
       ô chỉ còn nhắc gọn. Chữ còn lại vẫn phải là chữ của `gen.sh` từng ký tự. */
    expect(prompt.text).toContain("no checkerboard");
  });

  /* NỀN ĐEN ĐÃ BỎ HẲN, và ca này là chốt giữ. Nó từng là cách duy nhất lấy quầng
     sáng (vẽ cộng sáng trên đen ⇒ C = α·F ⇒ đọc alpha ra từ độ sáng). Nền sheet nay
     là alpha thật nên quầng nằm sẵn trong kênh α — giữ nền đen chỉ tổ nướng một mảng
     đen vào asset. Chữ đó bò về prompt là hỏng lặng lẽ: ảnh vẫn ra, chỉ là có tấm
     đen phía sau. */
  it("KHÔNG còn câu NỀN ĐEN ở bất cứ ô nào", () => {
    for (const matte of ["glow", "glass", "none"] as const) {
      const file = matte === "glass" ? GLASS_FILE : GLOW_FILE;
      const prompt = itemPromptFor(contractWith(file, matte), file)!;
      expect(prompt.text).not.toContain("PURE BLACK");
      expect(prompt.text).not.toContain("SPECIAL CELL BACKGROUND");
      expect(prompt.text).not.toContain("chroma");
    }
  });

  it("TẮT hiệu ứng ⇒ câu đó BIẾN MẤT khỏi prompt (preview không được kẹt ở trạng thái cũ)", () => {
    const prompt = itemPromptFor(contractWith(GLOW_FILE, "none"), GLOW_FILE)!;
    expect(prompt.line).not.toContain("LIGHT EFFECT");
    expect(prompt.text).not.toContain("LIGHT EFFECT");
  });

  it("ô thường không bị dính câu ánh sáng của hàng xóm", () => {
    const contract = contractWith(GLOW_FILE, "glow");
    const others = contract.sheets
      .flatMap((sh) => sh.components)
      .filter((cp) => cp.file !== GLOW_FILE && cp.skel.shape !== "empty" && !isGlowCell(cp.skel));
    expect(others.length).toBeGreaterThan(0);
    for (const cp of others) {
      expect(itemPromptFor(contract, cp.file)?.line ?? "").not.toContain("LIGHT EFFECT");
    }
  });

  it("ô KÍNH ⇒ prompt có câu trong suốt, và KHÔNG có câu nền đen", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "glass"), GLASS_FILE)!;
    expect(prompt.line).toContain(glassCellPrompt());
    expect(prompt.text).toContain("SEE-THROUGH ELEMENT");
    expect(prompt.text).toContain("LOW ALPHA");
    // Kính KHÔNG phải hiệu ứng ánh sáng — khoá lại kẻo ai đó "thống nhất" hai nhánh.
    expect(prompt.text).not.toContain("LIGHT EFFECT");
  });

  it("TẮT trong suốt ⇒ câu đó biến mất, ô về nền thường", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "none"), GLASS_FILE)!;
    expect(prompt.line).not.toContain("SEE-THROUGH ELEMENT");
  });

  it("một ô chỉ nhận ĐÚNG MỘT câu phụ — glow thắng, đúng thứ tự if/elif của gen.sh", () => {
    const prompt = itemPromptFor(contractWith(GLASS_FILE, "glow"), GLASS_FILE)!;
    expect(prompt.line).toContain("LIGHT EFFECT");
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

  it("câu ÁNH SÁNG khớp TỪNG CHỮ với `gen.sh` (đọc file thật, không đọc trí nhớ)", async () => {
    const gen = await genSh();
    expectMirrored(gen, glowCellPrompt());
  });

  it("câu TRONG SUỐT khớp TỪNG CHỮ với `gen.sh`", async () => {
    const gen = await genSh();
    expectMirrored(gen, glassCellPrompt());
    // Nhánh của kính phải là `elif` sau nhánh glow — nếu ai đó đổi thành `if` rời thì
    // một ô có thể ăn cả hai câu, và ca "đúng một câu phụ" ở trên sẽ không đủ để bắt.
    // (Vòng lặp đổi từ `for r in range(rows) / comps[i]` sang `for i, comp in
    //  enumerate(comps)` khi bỏ tiêu đề hàng "Row r, left to right:" — 27/08/2026.)
    expect(gen).toMatch(/elif comp\["skel"\]\.get\("matte"\) == "glass":/);
  });

  it("`isGlassCell` đọc đúng `matte` của contract, không đoán theo tên file", () => {
    const contract = contractWith(GLASS_FILE, "glass");
    const cells = contract.sheets.flatMap((sh) => sh.components).filter((cp) => isGlassCell(cp.skel));
    expect(cells.map((cp) => cp.file)).toContain(GLASS_FILE);
  });
});
