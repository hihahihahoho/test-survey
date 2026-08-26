import { getPresets, type PresetBundle } from "./presets-store";
import { phraseOf } from "./pill-registry";
import { describeBrandColors } from "./brand-colors";
import { gridFor, type Block, type BlockMode, type ComposerState, type UiCell } from "./composer-model";
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
function cellLine(cell: UiCell, index: number, ctx: SerializeContext, mode: BlockMode): string {
  const element = ctx.presets.elements.find((preset) => preset.id === cell.elementId);
  const name = element?.vi ?? cell.elementId;

  /* CHẾ ĐỘ TỰ DO: câu của dòng thay cho cả phần ghép pill. Cùng luật với block
     Cảnh nền/Nhân vật — người dùng đã chọn phá khuôn thì đừng lén dựng lại khuôn
     quanh chữ của họ. Câu rỗng ⇒ rơi về khuôn, y như bên `uiKitSheets`: hai
     đường sinh prompt phải nói CÙNG một điều, nếu không thì bản xem trước và
     bản copy ra ChatGPT là hai thứ khác nhau. */
  if (mode === "free") {
    const line = tidy(serializeDoc(cell.doc as PromptDocNode, ctx));
    if (line) return tidy(`cell ${index + 1} (${name}): ${line}`);
  }

  /* Phong cách của ô: rỗng = theo phong cách chung. Cùng luật với pill `style`
     trong câu mad-lib — xem `pillText()` bên serialize.ts. */
  const style = cell.styleId ? phraseOf("style", cell.styleId, ctx.presets) : ctx.styleEN;
  /* Thứ tự PHẢI khớp `uiCellDoc` (danh từ · phong cách · đục nền · viền · ghi chú):
     prompt copy-dán và câu tự do là hai cửa nhìn vào cùng một ô, và người dùng đối
     chiếu chúng bằng mắt. Cỡ safe zone không có mặt — nó vào `skel`, không vào chữ. */
  const parts = [
    element?.en ?? "",
    style,
    phraseOf("glaze", cell.glazeId, ctx.presets),
    phraseOf("decor", cell.decor, ctx.presets),
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
      ...block.cells.map((cell, index) => cellLine(cell, index, ctx, block.mode)),
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
/**
 * Câu NGỮ CẢNH CHUNG do người dùng tự viết — rỗng khi khối đang ở chế độ khuôn.
 *
 * Xuất ra để CẢ HAI đường tiêu thụ cùng dùng: bản prompt copy được
 * (`serializeComposer` ngay dưới) và `variant.style` của contract
 * (`composer-to-contract.ts`). Hai bản dựng riêng là hai câu sẽ lệch nhau sau
 * đúng một lượt sửa — mà lệch ở đây nghĩa là thứ người dùng ĐỌC không phải thứ
 * máy vẽ NHẬN.
 */
export function contextFreeText(state: ComposerState, presets: PresetBundle = getPresets()): string {
  if (state.contextMode !== "free" || !state.contextDoc) return "";
  return tidy(
    serializeDoc(state.contextDoc as PromptDocNode, {
      /* Pill `style` để trống trong CÂU NGỮ CẢNH không có "cái chung" nào cao hơn
         để kế thừa — nó CHÍNH LÀ cái chung. Nên `styleEN`/`themeEN` để rỗng: bỏ
         trống ở đây nghĩa là thật sự không nói gì về phong cách. */
      styleEN: "",
      themeEN: "",
      presets,
      imageCounter: { count: 0 },
      brandColors: state.brandColors,
    }),
  );
}

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
  /* Người dùng đã tự viết câu ngữ cảnh ⇒ dùng ĐÚNG câu đó, không ghép lại từ ba
     mảnh. Ghép lại là bỏ qua chữ họ viết; ghép THÊM vào là nói hai lần cùng một
     điều bằng hai giọng khác nhau. */
  const free = contextFreeText(state, presets);
  if (free) chunks.push(free.endsWith(".") ? free : `${free}.`);
  else if (themeEN || styleEN || brandEN) chunks.push(`${header}.`);

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
