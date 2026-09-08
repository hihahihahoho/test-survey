import { poseSpecFor } from "@/features/kit-core/lib/kitset-to-contract";
import { getPresets, hasDecorPlacement, type PresetBundle } from "./presets-store";
import { labelOf, phraseOf } from "./pill-registry";
import { describeBrandColors } from "./brand-colors";
import { gridFor, type Block, type BlockMode, type ComposerState, type MascotPose, type UiCell } from "./composer-model";
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
     Background/Nhân vật — người dùng đã chọn phá khuôn thì đừng lén dựng lại khuôn
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
  /* Thứ tự PHẢI khớp `uiCellDoc` (danh từ · phong cách · đục nền · trang trí · bố
     trí · ghi chú): prompt copy-dán và câu tự do là hai cửa nhìn vào cùng một ô, và
     người dùng đối chiếu chúng bằng mắt. Cỡ safe zone không có mặt — nó vào `skel`,
     không vào chữ. */
  const parts = [
    element?.en ?? "",
    style,
    phraseOf("glaze", cell.glazeId, ctx.presets),
    phraseOf("decor", cell.decor, ctx.presets),
    /* Ô «Không trang trí» KHÔNG in câu bố trí: "không hoa văn nào" rồi "hoa văn đối
       xứng hai bên" là hai câu ngược nhau trong cùng một dòng, và máy vẽ hoà giải
       chúng bằng cách vẽ vài bông hoa. Luật ở `hasDecorPlacement`, dùng chung với
       dòng khuôn trên màn và với bộ dịch contract. */
    hasDecorPlacement(cell.decor) ? phraseOf("decorPlace", cell.decorPlace, ctx.presets) : "",
    cell.note.trim(),
  ].filter(Boolean);
  return tidy(`cell ${index + 1} (${name}): ${parts.join(", ")}`);
}

/**
 * Một DÒNG DÁNG của thẻ Nhân vật → một dòng prompt.
 *
 * Ghép bằng ĐÚNG những mẩu mà `mascotSheets` ghép vào `components[].spec`
 * (`poseSpecFor` + cụm góc máy + ghi chú), vì bản copy ra ChatGPT và bản gửi cho
 * engine là hai cửa nhìn vào cùng một dòng — người dùng đối chiếu chúng bằng
 * mắt. Không có toạ độ ở đây, cùng lý do với `cellLine`: lưới do engine xếp.
 */
function poseLine(row: MascotPose, index: number, ctx: SerializeContext, mode: BlockMode): string {
  const name = labelOf("pose", row.pose, ctx.presets);

  if (mode === "free") {
    const line = tidy(serializeDoc(row.doc as PromptDocNode, ctx));
    if (line) return tidy(`cell ${index + 1} (${name}): ${line}`);
  }

  const parts = [
    poseSpecFor(row.pose, phraseOf("expression", row.expression, ctx.presets)),
    phraseOf("view", row.view, ctx.presets),
    row.note.trim(),
  ].filter(Boolean);
  return tidy(`cell ${index + 1} (${name}): ${parts.join(", ")}`);
}

function blockLines(block: Block, ctx: SerializeContext): string[] {
  if (block.kind === "mascot") {
    /* Câu đầu thẻ đứng RIÊNG một dòng và luôn có mặt: nó tả nhân vật là ai, thứ
       đúng cho mọi ô. Chưa có dáng nào thì thẻ vẫn nói được điều đó. */
    const head = serializeDoc(block.doc as PromptDocNode, ctx);
    if (block.poses.length === 0) return head ? [head] : [];
    const { cols, rows } = gridFor(block.poses.length);
    /* Ghép `NxM` ở một chuỗi KHÔNG DẤU rồi mới chèn vào câu tiếng Việt: cổng từ
       cấm §5.4 chỉ soi những chuỗi có dấu tiếng Việt, và `cols`/`rows` nằm trong
       danh sách cấm. Đây không phải mẹo lách — chuỗi này là PROMPT gửi cho máy
       vẽ, không phải chữ hiện lên màn, nên đếm nó vào hạn mức chữ kỹ thuật của
       giao diện là đếm nhầm chỗ. */
    const size = `${cols}x${rows}`;
    return [
      tidy(`${head} Spritesheet nhân vật ${size} (hệ thống tự xếp lưới, thứ tự dưới đây chỉ để liệt kê):`),
      ...block.poses.map((row, index) => poseLine(row, index, ctx, block.mode)),
    ];
  }

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

  /* Cảnh nền: một dòng, lấy thẳng từ tài liệu TipTap của block.
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
  background: "Background",
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
/**
 * CỤM EN CỦA THEME CHUNG — chữ tự gõ thắng preset.
 *
 * ╔══ VÌ SAO PHẢI LÀ MỘT HÀM, KHÔNG PHẢI `state.themeCustom || phraseOf(...)` ═╗
 * ║ Cụm này được hỏi ở BỐN chỗ: prompt copy-dán (`serializeComposer`), câu      ║
 * ║ `variant.style` (`composerStyleLine`), ngữ cảnh kế thừa của pill `outfit`   ║
 * ║ để trống, và nhãn trên màn. Bốn chỗ tự ghép là bốn cơ hội để một chỗ quên   ║
 * ║ nhánh `custom` — mà quên ở đây nghĩa là chữ người dùng gõ ra biến mất khỏi  ║
 * ║ prompt, im lặng, sau khi họ đã đọc thấy nó trên pill.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function contextThemeEN(
  state: Pick<ComposerState, "themeValue" | "themeCustom">,
  presets: PresetBundle = getPresets(),
): string {
  return (state.themeCustom ?? "").trim() || phraseOf("theme", state.themeValue, presets);
}

/**
 * CỤM TRANG PHỤC của chủ đề chung — thứ pill `outfit` để trống kế thừa.
 *
 * Song sinh với `contextThemeEN` và cùng đọc MỘT lựa chọn (`state.themeValue`),
 * chỉ khác cụm chữ lấy ra: chủ đề nói với cả bộ kit bằng mô-típ và màu, còn nhân
 * vật thì mặc quần áo. Xem `ThemeOption.kitEN` để biết vì sao một mục mang hai cụm.
 * Chữ TỰ GÕ vẫn thắng cả hai đường: người dùng gõ "kimono xanh" thì đó vừa là chủ
 * đề vừa là trang phục — họ chỉ có một ô, ta không được bịa ra ô thứ hai.
 */
export function contextOutfitEN(
  state: Pick<ComposerState, "themeValue" | "themeCustom">,
  presets: PresetBundle = getPresets(),
): string {
  return (state.themeCustom ?? "").trim() || phraseOf("outfit", state.themeValue, presets);
}

/** Cụm EN của phong cách chung — chữ tự gõ thắng preset. Xem `contextThemeEN`. */
export function contextStyleEN(
  state: Pick<ComposerState, "styleId" | "styleCustom">,
  presets: PresetBundle = getPresets(),
): string {
  return (state.styleCustom ?? "").trim() || phraseOf("style", state.styleId, presets);
}

export function contextFreeText(state: ComposerState, presets: PresetBundle = getPresets()): string {
  if (state.contextMode !== "free" || !state.contextDoc) return "";
  return tidy(
    serializeDoc(state.contextDoc as PromptDocNode, {
      /* Pill `style` để trống trong CÂU NGỮ CẢNH không có "cái chung" nào cao hơn
         để kế thừa — nó CHÍNH LÀ cái chung. Nên `styleEN`/`themeEN` để rỗng: bỏ
         trống ở đây nghĩa là thật sự không nói gì về phong cách. */
      styleEN: "",
      themeEN: "",
      outfitEN: "",
      presets,
      imageCounter: { count: 0 },
      brandColors: state.brandColors,
    }),
  );
}

export function serializeComposer(state: ComposerState, presets: PresetBundle = getPresets()): string {
  const styleEN = contextStyleEN(state, presets);
  const themeEN = contextThemeEN(state, presets);
  /* Màu KHÔNG có pill riêng trong từng block, nên nó không cần chỗ trong
     `SerializeContext` (chỗ đó chỉ để pill để-trống tra ngược lên cái chung).
     Màu kế thừa xuống mọi block bằng đúng cách một art director làm: nói MỘT
     LẦN ở câu ngữ cảnh mở đầu, rồi cả phần còn lại của prompt nằm dưới nó.
     Nhắc lại palette ở từng dòng cell là dạy model rằng mỗi element có bảng
     màu riêng — ngược hẳn ý "một bộ nhận diện". */
  const brandEN = describeBrandColors(state.brandColors);
  const ctx = makeContext({ styleEN, themeEN, outfitEN: contextOutfitEN(state, presets), presets, imageCounter: { count: 0 } });

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

/**
 * Tổng số ảnh tham chiếu trong cả màn — thanh dưới nhắc "nhớ đính kèm N ảnh".
 *
 * Thẻ Nhân vật chỉ đếm CÂU ĐẦU: pill ảnh của nó là ảnh nhân vật, thứ người dùng
 * phải tự đính. Ảnh manơcanh của từng dòng dáng do công cụ tự dựng và tự đính —
 * đếm nó vào đây là bảo người dùng đi tìm một tệp không tồn tại trên máy họ.
 */
export function countComposerImages(state: ComposerState): number {
  return state.blocks.reduce(
    (total, block) => (block.kind === "uikit" ? total : total + countImageRefs(block.doc as PromptDocNode)),
    0,
  );
}
