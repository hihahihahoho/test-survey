import { getPresets, type PresetBundle } from "./presets-store";
import { phraseOf } from "./pill-registry";
import { describeBrandColors } from "./brand-colors";
import { gridFor, type Block, type ComposerState, type UiCell } from "./composer-model";
import { countImageRefs, makeContext, serializeDoc, tidy, type PromptDocNode, type SerializeContext } from "./serialize";

/**
 * serialize-composer.ts — CẢ MÀN → prompt dán vào ChatGPT.
 *
 * ┌── ĐÂY LÀ TRUNG TÂM CỦA DEMO, KHÔNG PHẢI CÁI EDITOR ──────────────────────┐
 * │ Cả màn hình chỉ để trả lời một câu: "cái người ta dựng ra thì máy đọc    │
 * │ được thành gì". Nên đây là hàm THUẦN: nhận state + kho preset, trả chuỗi.│
 * │ Không `Editor`, không DOM, không localStorage ⇒ test được ở môi trường   │
 * │ `node`, và nếu mai này nối vào KitGen thật thì chỗ nối nằm ĐÚNG Ở ĐÂY —  │
 * │ đổi hàm này thành `composerToContract()` là xong, không phải mổ UI.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Một ô của UI kit → một dòng.
 *
 * KHÔNG có toạ độ trong dòng này, và đó là điều quan trọng nhất của cả hàm:
 * lưới do engine KitGen tự xếp. Ghi "cell 3 ở hàng 1 cột 3" vào prompt là hứa
 * với máy vẽ một thứ mà chính ta không kiểm soát — rồi khi engine xếp khác,
 * prompt và ảnh nói hai điều trái nhau. Số thứ tự ở đây chỉ để ĐẾM và đối chiếu.
 */
function cellLine(cell: UiCell, index: number, ctx: SerializeContext): string {
  const element = ctx.presets.elements.find((preset) => preset.id === cell.elementId);
  const name = element?.vi ?? cell.elementId;
  /* Phong cách của ô: rỗng = theo phong cách chung. Cùng luật với pill `style`
     trong câu mad-lib — xem `pillText()` bên serialize.ts. */
  const style = cell.styleId ? phraseOf("style", cell.styleId, ctx.presets) : ctx.styleEN;
  const parts = [
    element?.en ?? "",
    style,
    phraseOf("decor", cell.decor, ctx.presets),
    phraseOf("material", cell.materialId, ctx.presets),
    cell.note.trim(),
  ].filter(Boolean);
  return tidy(`cell ${index + 1} (${name}): ${parts.join(", ")}`);
}

function blockLines(block: Block, ctx: SerializeContext): string[] {
  if (block.kind === "uikit") {
    if (block.cells.length === 0) return [];
    const { cols, rows } = gridFor(block.cells.length);
    return [
      /* Nói rõ "hệ thống tự xếp lưới" NGAY TRONG PROMPT. Người đọc prompt (và
         model) không được hiểu nhầm rằng thứ tự liệt kê là vị trí trên sheet. */
      `UI kit spritesheet ${cols}x${rows} (hệ thống tự xếp lưới, thứ tự dưới đây chỉ để liệt kê):`,
      ...block.cells.map((cell, index) => cellLine(cell, index, ctx)),
    ];
  }

  /* Background / Mascot: một dòng, lấy thẳng từ tài liệu TipTap của block.
     ══ VÌ SAO HAI CHẾ ĐỘ DÙNG CHUNG MỘT ĐƯỜNG SERIALIZE ═══════════════════
     Ở chế độ `template`, tài liệu CHÍNH LÀ template với các pill đã chọn — nên
     "ghép theo template" và "lấy nguyên văn" ra cùng một kết quả. Viết hai
     nhánh ở đây là tạo ra một cách để chúng lệch nhau, mà lệch ở đây nghĩa là
     panel xem trước nói một đằng, prompt copy ra một nẻo. Chế độ chỉ đổi việc
     SỬA ĐƯỢC HAY KHÔNG, không đổi ý nghĩa của nội dung. */
  const line = serializeDoc(block.doc as PromptDocNode, ctx);
  return line ? [line] : [];
}

/** Nhãn của loại block khi đứng đầu đoạn trong prompt. */
const BLOCK_LABEL: Record<Block["kind"], string> = {
  background: "Cảnh nền",
  uikit: "Bộ UI",
  mascot: "Nhân vật",
};

/**
 * Toàn bộ màn → prompt.
 *
 * Bố cục đầu ra:
 *  · dòng đầu = NGỮ CẢNH CHUNG (theme + phong cách + màu thương hiệu) — mọi
 *    block dưới kế thừa;
 *  · mỗi block một đoạn, mở đầu bằng nhãn loại để người đọc prompt biết đang
 *    đọc phần nào;
 *  · block rỗng (chưa có ô, chưa có chữ) bị bỏ hẳn — một prompt có dòng
 *    "Bộ UI:" trống là một dòng nói dối.
 */
export function serializeComposer(state: ComposerState, presets: PresetBundle = getPresets()): string {
  const styleEN = phraseOf("style", state.styleId, presets);
  const themeEN = phraseOf("theme", state.themeValue, presets);
  /* Màu KHÔNG có pill riêng trong từng block, nên nó không cần chỗ trong
     `SerializeContext` (chỗ đó chỉ để pill để-trống tra ngược lên cái chung).
     Màu kế thừa xuống mọi block bằng đúng cách một art director làm: nói MỘT
     LẦN ở câu ngữ cảnh mở đầu, rồi cả phần còn lại của prompt nằm dưới nó.
     Nhắc lại palette ở từng dòng cell là dạy model rằng mỗi element có bảng
     màu riêng — ngược hẳn ý "một bộ nhận diện". */
  const brandEN = describeBrandColors(state.brandColors);
  const ctx = makeContext({ styleEN, themeEN, presets, imageCounter: { count: 0 } });

  const lead = tidy(
    [
      themeEN || styleEN ? "Bộ kit theme" : "Bộ kit",
      themeEN,
      themeEN && styleEN ? "phong cách" : "",
      styleEN,
    ]
      .filter(Boolean)
      .join(" "),
  );

  /* Nối bằng DẤU PHẨY, không phải xuống dòng hay dấu chấm: theme + phong cách
     + màu là ba mệnh đề của CÙNG một câu tả bộ kit. Tách chúng ra ba dòng là
     mời model xử lý chúng như ba yêu cầu rời nhau. */
  const header = [lead, brandEN].filter(Boolean).join(", ");

  const chunks: string[] = [];
  if (themeEN || styleEN || brandEN) chunks.push(`${header}.`);

  for (const block of state.blocks) {
    const lines = blockLines(block, ctx);
    if (lines.length === 0) continue;
    const [first, ...rest] = lines;
    chunks.push([`${BLOCK_LABEL[block.kind]} — ${first}`, ...rest].join("\n"));
  }

  return chunks.join("\n\n");
}

/** Tổng số ảnh tham chiếu trong cả màn — thanh dưới nhắc "nhớ đính kèm N ảnh". */
export function countComposerImages(state: ComposerState): number {
  return state.blocks.reduce(
    (total, block) => (block.kind === "uikit" ? total : total + countImageRefs(block.doc as PromptDocNode)),
    0,
  );
}
