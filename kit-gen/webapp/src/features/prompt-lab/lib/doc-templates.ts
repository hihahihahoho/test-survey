import type { JSONContent } from "@tiptap/react";
import { NODE } from "./schema";
import { INHERIT, type PillKind } from "./pill-registry";
import { getPresets, type PresetBundle } from "./presets-store";
import type { ContextRef, UiCell } from "./composer-model";

/**
 * doc-templates.ts — CÂU MAD-LIB của từng loại block, dựng bằng JSON.
 *
 * TipTap nhận cả chuỗi HTML, nhưng lúc đó pill phải được `parseHTML` dựng lại từ
 * `data-*` — thêm một vòng dịch có thể sai mà không báo. JSON đi thẳng vào
 * schema: sai tên node là ProseMirror ném lỗi NGAY LÚC NẠP, không phải lúc copy.
 *
 * ══ SCAFFOLDING LÀ HẰNG SỐ, KHÔNG PHẢI CHỮ RẢI TRONG CODE ══════════════════
 * Phần chữ cố định của mỗi câu ("Vẽ cảnh nền ", ", không khí "…) được khai
 * thành mảng `SCAFFOLD_*` vì nó có việc thứ hai: ở chế độ TỰ DO, bộ serialize
 * cần biết đâu là chữ của template và đâu là chữ NGƯỜI DÙNG viết thêm. Trừ
 * chuỗi khỏi chuỗi thì cần đúng những mẩu này. Rải chữ trong code là đảm bảo
 * hai nơi sẽ lệch nhau sau đúng một lượt sửa câu chữ.
 */

const text = (value: string): JSONContent => ({ type: "text", text: value });

const pill = (kind: PillKind, value: string, custom = ""): JSONContent => ({
  type: NODE.optionPill,
  attrs: { kind, value, custom },
});

/* Pill ảnh RỖNG: chưa có ảnh nào trên đĩa. Ba trường rỗng chứ không phải
   `null` — đúng giá trị mặc định của attr, xem `EMPTY_PILL_IMAGE`. */
const imagePill = (role = ""): JSONContent => ({ type: NODE.imagePill, attrs: { refName: "", path: "", role } });

/* Pill ảnh ĐÃ CÓ tấm trên đĩa — dùng khi dựng lại câu ngữ cảnh từ `contextRefs`.
   `refName` để rỗng: `readPillImage` tự suy nó ra từ `path` khi thiếu, và chép
   một cái tên vào đây là mở đường cho hai chỗ ghi hai tên cho một tệp. */
const refPill = (ref: ContextRef): JSONContent => ({
  type: NODE.imagePill,
  attrs: { refName: "", path: ref.path, role: ref.role },
});

/* ── Block BACKGROUND ─────────────────────────────────────────────────────── */

export const SCAFFOLD_BACKGROUND = ["Vẽ cảnh nền ", ", không khí ", ", tham chiếu ", "."] as const;

export function backgroundDoc(): JSONContent {
  const [a, b, c, d] = SCAFFOLD_BACKGROUND;
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(a),
          pill("scene", "main-menu"),
          text(b),
          pill("mood", "festive"),
          text(c),
          imagePill(),
          text(d),
        ],
      },
    ],
  };
}

/* ── Block MASCOT ─────────────────────────────────────────────────────────── */

/**
 * ╔══ CÂU NÀY ĐÃ NGẮN LẠI CÒN MỘT NỬA, VÀ ĐÓ LÀ CẢ Ý ĐỒ ═════════════════════╗
 * ║ Câu cũ: «Tạo nhân vật [ảnh] với dáng [⌄] (hoặc ảnh dáng [ảnh]), biểu cảm  ║
 * ║ [⌄], trang phục [⌄].» — năm chỗ chọn cho MỘT nhân vật, tức là một thẻ chỉ ║
 * ║ vẽ được đúng một dáng. Chủ sản phẩm bác thẳng: *"mỗi nhân vật 1 pose 1 góc ║
 * ║ camera riêng"*, và *"bỏ cái «hoặc» đi"*.                                   ║
 * ║ Nay câu đầu thẻ chỉ giữ thứ ĐÚNG CHO MỌI Ô: nhân vật này là ai (ảnh) và    ║
 * ║ mặc gì. Dáng · góc · nét mặt xuống từng dòng (`MASCOT_POSE_ROW`).          ║
 * ║ Cụm «(hoặc ảnh dáng [ảnh])» bị BỎ HẲN, không ẩn đi: pill ảnh thứ hai ấy    ║
 * ║ tồn tại để chứa ảnh manơcanh engine tự chụp — một chuyện nội bộ mà người   ║
 * ║ dùng chưa bao giờ cần thấy, và bày ra thì họ tưởng phải tự đi tìm một ảnh. ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export const SCAFFOLD_MASCOT = ["Tạo nhân vật ", ", trang phục ", "."] as const;

export function mascotDoc(): JSONContent {
  const [a, b, c] = SCAFFOLD_MASCOT;
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(a),
          /* `role: "character"` — pill này KHÔNG đổi chỗ đi đâu trong contract (nó
             vẫn là `sheet.ref` của tấm dáng, đúng như trước), nhưng vai trò khai ra
             cho phép menu của nó mời «Mascot của <thương hiệu>». Ảnh của thẻ Cảnh
             nền để rỗng vai trò, nên nó không nhận lời mời ấy — mời một linh vật
             làm ảnh tham chiếu cho một cảnh nền là mời sai chỗ. */
          imagePill("character"),
          text(b),
          /* Rỗng = kế thừa theme tổng ở đầu tài liệu. Mặc định đúng ngay, và
             người dùng vẫn bấm để ghi đè cho riêng nhân vật này. */
          pill("outfit", INHERIT),
          text(c),
        ],
      },
    ],
  };
}

/* ── MỘT DÒNG DÁNG của thẻ NHÂN VẬT ───────────────────────────────────────── */

/**
 * Câu khởi điểm cho MỘT dòng dáng khi thẻ chuyển sang chế độ tự do.
 *
 * Cùng lập luận với `SCAFFOLD_UI_CELL`: câu này đi vào `components[].spec` — nơi
 * bị ghép vào giữa một prompt tiếng Anh — nên khung của nó là tiếng Anh, không
 * phải khung tiếng Việt như hai câu cấp THẺ. Ở đây khung chỉ còn dấu phẩy.
 */
export const SCAFFOLD_MASCOT_POSE = [", "] as const;

/**
 * Dòng dáng → câu tự do khởi điểm.
 *
 * KHÔNG mang chủ ngữ ("the same character…") vào câu: chủ ngữ là chuyện của CẢ
 * THẺ (nó dựng từ ảnh + trang phục ở câu đầu) và bộ dịch tự đặt nó lên trước mọi
 * ô — xem `mascotSheets`. Viết lại chủ ngữ ở từng dòng là mời người dùng sửa
 * danh tính nhân vật ở mười sáu chỗ khác nhau.
 */
export function mascotPoseDoc(row: { pose: string; view: string; expression: string; note: string }): JSONContent {
  const [comma] = SCAFFOLD_MASCOT_POSE;
  const note = row.note.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          /* Thứ tự pill PHẢI khớp `PILL_SLOTS.mascotPose` và khớp thứ tự pill trên
             dòng ở chế độ khuôn — gạt công tắc không được làm lựa chọn nhảy chỗ. */
          pill("pose", row.pose),
          text(comma),
          pill("view", row.view),
          text(comma),
          pill("expression", row.expression),
          ...(note ? [text(`${comma}${note}`)] : []),
        ],
      },
    ],
  };
}

/* ── NGỮ CẢNH CHUNG ───────────────────────────────────────────────────────── */

export const SCAFFOLD_CONTEXT = ["Bộ kit theme ", " phong cách ", ", thương hiệu ", " với màu ", "."] as const;

/**
 * Câu Ngữ cảnh chung — bản TipTap của đúng cái câu React đang hiện ở chế độ khuôn.
 *
 * Bốn pill khớp một-một với bốn control của bản khuôn (`theme`, `style`, thương
 * hiệu, dãy màu), nên gạt sang Tự do là thấy CHÍNH câu mình đang đọc, chỉ khác ở
 * chỗ giờ gõ được vào giữa. Đó là điều kiện để công tắc không làm người ta mất
 * phương hướng.
 *
 * ╔══ ẢNH ĐI THEO PILL NÓ MINH HOẠ, KHÔNG DỒN VỀ CUỐI CÂU ═══════════════════╗
 * ║ `contextRefs` mang sẵn vai trò của từng tấm, nên tấm `theme` được đặt ngay ║
 * ║ sau pill theme và tấm `style` ngay sau pill phong cách — đúng chỗ mà mục   ║
 * ║ «Đính ảnh tham chiếu» của chính pill ấy chèn vào ở chế độ tự do. Nhờ vậy   ║
 * ║ gạt công tắc qua lại không làm ảnh nhảy chỗ, và câu vẫn đọc được thành     ║
 * ║ "theme [Tết][🖼]".                                                        ║
 * ║ Ảnh vai `logo` KHÔNG có mặt trong câu: nó không phải một mệnh đề người     ║
 * ║ dùng viết ra mà là tài sản của thương hiệu đang chọn, và pill thương hiệu  ║
 * ║ đã nói ra điều đó rồi. Nó vẫn đi tới `variant.brand.refs` như thường.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function contextDoc(state: {
  themeValue: string;
  styleId: string;
  themeCustom?: string;
  styleCustom?: string;
  contextRefs?: readonly ContextRef[];
}): JSONContent {
  const [a, b, c, d, e] = SCAFFOLD_CONTEXT;
  const refs = state.contextRefs ?? [];
  const shots = (role: ContextRef["role"]) => refs.filter((ref) => ref.role === role && ref.path).map(refPill);
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(a),
          pill("theme", state.themeValue, state.themeCustom ?? ""),
          ...shots("theme"),
          text(b),
          pill("style", state.styleId, state.styleCustom ?? ""),
          ...shots("style"),
          text(c),
          /* Node RỖNG, thương hiệu đọc từ ngữ cảnh — xem `NODE.brandProfilePill`. */
          { type: NODE.brandProfilePill },
          text(d),
          /* Node RỖNG, màu đọc từ ngữ cảnh — xem `NODE.brandPill`. */
          { type: NODE.brandPill },
          text(e),
        ],
      },
    ],
  };
}

/** Scaffolding theo loại block — bộ serialize chế độ TỰ DO dùng để trừ chuỗi. */
export const SCAFFOLDS: Record<"background" | "mascot" | "mascotPose" | "context", readonly string[]> = {
  background: SCAFFOLD_BACKGROUND,
  mascot: SCAFFOLD_MASCOT,
  mascotPose: SCAFFOLD_MASCOT_POSE,
  context: SCAFFOLD_CONTEXT,
};

/* ── MỘT DÒNG element của block BỘ UI ─────────────────────────────────────── */

/**
 * Câu khởi điểm cho MỘT dòng element khi thẻ chuyển sang chế độ tự do.
 *
 * ╔══ CÂU NÀY MỞ ĐẦU BẰNG TIẾNG ANH, KHÁC HẲN HAI CÂU TRÊN ══════════════════╗
 * ║ Câu Cảnh nền / Nhân vật có khung tiếng Việt ("Vẽ cảnh nền …") vì ở chế độ  ║
 * ║ tự do chúng đi vào `sheet.promptOverride` — một dòng chỉ đạo cho cả tấm,   ║
 * ║ và engine đọc được cả tiếng Việt ở đó.                                    ║
 * ║ Dòng element thì đi vào `components[].spec` — nơi mọi mô tả khác trong     ║
 * ║ contract đều là tiếng Anh và câu này bị GHÉP VÀO GIỮA một prompt tiếng Anh.║
 * ║ Chèn "phong cách" / "chất liệu" vào giữa đó là nhiễu (đúng lập luận đã ghi ║
 * ║ ở đầu `composer-to-contract.ts`). Nên khung ở đây chỉ còn dấu phẩy, và     ║
 * ║ chữ mở đầu là chính cụm EN của element.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Hệ quả có lợi: chuyển sang tự do rồi KHÔNG sửa gì thì câu serialize ra gần
 * đúng bằng `spec` của chế độ template — người dùng không bị đổi kết quả chỉ vì
 * gạt công tắc.
 */
export const SCAFFOLD_UI_CELL = [", "] as const;

/**
 * Ô element → câu tự do khởi điểm.
 *
 * KHÔNG mang tên tiếng Việt của element vào câu: tên ấy là DANH TÍNH của dòng
 * (nó đi vào `component.vi` và hiện ở đầu dòng trên màn), không phải mô tả. Nhét
 * nó vào câu là để người dùng xoá được chính cái nhãn đang đứng cạnh mình.
 */
export function uiCellDoc(cell: UiCell, presets: PresetBundle = getPresets()): JSONContent {
  const [comma] = SCAFFOLD_UI_CELL;
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const note = cell.note.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(`${element?.en ?? cell.elementId}${comma}`),
          /* Rỗng = kế thừa phong cách chung — cùng luật `INHERIT` với pill trong
             câu mad-lib, nên gạt công tắc không làm đổi nghĩa của ô. */
          pill("style", cell.styleId || INHERIT),
          text(comma),
          /* Thứ tự pill ở đây PHẢI khớp `PILL_SLOTS.uikit` — xem chú thích của bảng
             ấy. Nó cũng khớp thứ tự pill trên dòng ở chế độ khuôn, để gạt công tắc
             không làm các lựa chọn nhảy chỗ dưới tay người dùng.
             CỠ (`sizeId`) KHÔNG có mặt: nó không đi vào prompt, xem `UiCell.sizeId`. */
          pill("glaze", cell.glazeId),
          text(comma),
          pill("decor", cell.decor),
          ...(note ? [text(`${comma}${note}`)] : []),
        ],
      },
    ],
  };
}

/**
 * Đổi LOẠI element của một dòng đã có câu tự do: thay đúng cụm EN mở đầu.
 *
 * ╔══ VÌ SAO VÁ ĐÚNG MỘT MẨU, KHÔNG DỰNG LẠI CẢ CÂU ═════════════════════════╗
 * ║ Dựng lại câu từ ô mới thì mọi chữ người dùng đã viết bay sạch — mà đổi    ║
 * ║ loại element thường xảy ra CHÍNH VÌ họ đã viết xong phần mô tả và chỉ     ║
 * ║ chọn nhầm loại. Nên chỉ thay phần mà `uiCellDoc` tự đặt vào: cụm EN mở    ║
 * ║ đầu. Ta biết chính xác nó là gì vì chính ta vừa viết nó ra.               ║
 * ║ Người dùng đã sửa cụm ấy (nó không còn khớp `prevEn`) ⇒ KHÔNG đụng vào:   ║
 * ║ chữ của họ thắng chữ của template, luôn luôn.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function retitleCellDoc(doc: JSONContent, prevEn: string, nextEn: string): JSONContent {
  if (prevEn === nextEn) return doc;
  let done = false;
  const walk = (node: JSONContent): JSONContent => {
    if (done) return node;
    if (node.type === "text") {
      done = true;
      const value = node.text ?? "";
      return value.startsWith(prevEn) ? { ...node, text: nextEn + value.slice(prevEn.length) } : node;
    }
    if (!node.content) return node;
    return { ...node, content: node.content.map(walk) };
  };
  return walk(doc);
}

/* ══════════════════════════════════════════════════════════════════════════
   CỨU HỘ PILL MẤT ATTRS
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Thứ tự pill mà mỗi câu khởi điểm sinh ra — bảng tra để GÁN LẠI `kind` đã mất.
 *
 * ╔══ VÌ SAO CẦN CỨU HỘ, CHỨ KHÔNG CHỈ CẦN "ĐÃ VÁ NGUỒN" ═══════════════════╗
 * ║ Node view của pill từng không mang `data-kind`/`data-value` trên DOM, nên ║
 * ║ mọi lượt dựng lại tài liệu TỪ DOM (một nhịp HMR giữa phiên dev, một cú    ║
 * ║ dán) đọc ra pill KHÔNG CÓ attrs và ghi `{kind: null, value: null}` xuống  ║
 * ║ `workflow-draft.json`. Nguồn đã vá ở Wave 6 — nhưng vá nguồn KHÔNG chữa   ║
 * ║ những tài liệu đã hỏng nằm sẵn trên đĩa, và `OptionPillView` lại lặng lẽ  ║
 * ║ quy `null` về mặc định `"style"`/`""`. Kết quả người dùng thấy: cả ba     ║
 * ║ pill của mọi dòng đều là "theo phong cách chung" — mất dữ liệu đội lốt    ║
 * ║ một giá trị hợp lệ, thứ hỏng câm khó chịu nhất.                          ║
 * ║ Đo tận nơi trên dự án `kit-thu-nghiem-wave-6`: 12/12 pill mang attrs null.║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * VÌ SAO GÁN THEO VỊ TRÍ: pill hỏng không còn MỘT BIT thông tin nào về chính nó,
 * nên thứ duy nhất còn nói được nó là gì chính là CHỖ NÓ ĐỨNG trong câu — mà chỗ
 * ấy do các hàm `*Doc()` ngay trên file này đặt ra. Đó là lý do bảng này nằm cạnh
 * chúng: sửa câu khởi điểm mà quên bảng thì cứu hộ gán sai, và hai thứ ở cạnh
 * nhau thì khó quên hơn.
 */
export const PILL_SLOTS: Record<"uikit" | "background" | "mascot" | "mascotPose" | "context", readonly PillKind[]> = {
  /* Đổi 08/2026: ô thứ ba `material` → `glaze`, và nó lên đứng thứ hai cùng lượt
     `uiCellDoc` đổi thứ tự. Bảng và câu khởi điểm phải đi CÙNG NHAU (xem khối chú
     thích trên) — nhưng ở ĐÂY còn một điều kiện thứ hai, dễ quên hơn: `values`
     truyền vào `repairPills` (từ `composer-doc.readCell`) cũng phải đổi thứ tự
     theo. Ba nơi, một thứ tự. */
  uikit: ["style", "glaze", "decor"],
  background: ["scene", "mood"],
  /* Đổi 09/2026 cùng lượt tách thẻ Nhân vật thành sprite sheet: câu ĐẦU THẺ nay
     chỉ còn pill trang phục, còn dáng/góc/nét mặt xuống dòng (`mascotPose`). Tài
     liệu đời trước có ba pill ở câu đầu — nhưng chúng KHÔNG đi qua bảng này nữa:
     `readMascotBlock` dựng lại câu đầu từ template mới, nên bảng chỉ phải đúng
     cho hình dạng HIỆN TẠI. */
  mascot: ["outfit"],
  mascotPose: ["pose", "view", "expression"],
  context: ["theme", "style"],
};

/** Pill này có còn tự mô tả được không. `null`/thiếu ⇒ đã mất attrs. */
function pillBroken(node: JSONContent): boolean {
  if (node.type !== NODE.optionPill) return false;
  const attrs = node.attrs ?? {};
  /* `custom` CỐ Ý không nằm trong phép kiểm: mọi tài liệu lưu trước 09/2026 đều
     thiếu nó, và chúng không hỏng — thiếu `custom` nghĩa là "chưa gõ chữ riêng",
     đúng thứ chúng đang là. Coi nó là hỏng thì mỗi lần mở một dự án cũ là một
     lượt dựng lại toàn bộ tài liệu, không sửa được gì mà lại đóng dấu xuống đĩa. */
  return typeof attrs["kind"] !== "string" || typeof attrs["value"] !== "string";
}

/** Có ít nhất một pill hỏng trong tài liệu này không — để chỉ dựng lại khi cần. */
export function docHasBrokenPill(doc: unknown): boolean {
  let found = false;
  const walk = (node: JSONContent) => {
    if (found) return;
    if (pillBroken(node)) { found = true; return; }
    for (const child of node.content ?? []) walk(child);
  };
  if (typeof doc === "object" && doc !== null) walk(doc as JSONContent);
  return found;
}

/**
 * Gán lại `kind`/`value` cho những pill đã mất attrs.
 *
 * `slots` là thứ tự pill của câu khởi điểm; `values` (tuỳ chọn) là giá trị lấy
 * lại được từ nơi khác. Pill thứ i trong tài liệu ⇒ ô thứ i của bảng.
 *
 * ══ GIỚI HẠN, NÓI THẲNG ═══════════════════════════════════════════════════
 * Phép gán theo vị trí chỉ đúng khi tài liệu CÒN GIỮ bố cục pill của template.
 * Người dùng chèn thêm pill bằng `/` rồi mới dính hỏng thì vị trí lệch. Chấp
 * nhận, vì (1) hỏng thật xảy ra theo kiểu CẢ tài liệu cùng lúc — một lượt
 * DOM→doc đọc lại toàn bộ, không đọc lẻ một pill, nên "vừa lệch vừa hỏng" gần
 * như không có thật; (2) hết ô trong bảng thì pill được để NGUYÊN ở mặc định
 * an toàn, không đoán bừa — cùng lắm là không cứu được, chứ không gán sai.
 */
export function repairPills(
  doc: JSONContent,
  slots: readonly PillKind[],
  values: readonly string[] = [],
): JSONContent {
  let seen = 0;
  const walk = (node: JSONContent): JSONContent => {
    const kids = node.content?.map(walk);
    const rebuilt: JSONContent = kids ? { ...node, content: kids } : node;
    if (rebuilt.type !== NODE.optionPill) return rebuilt;
    const index = seen++;
    if (!pillBroken(rebuilt)) return rebuilt;
    const kind = slots[index];
    if (!kind) return rebuilt;
    const attrs = rebuilt.attrs ?? {};
    return {
      ...rebuilt,
      attrs: {
        ...attrs,
        kind,
        /* `value` hỏng ⇒ lấy giá trị cứu được, không có thì để RỖNG. Rỗng là
           "chưa chọn" — pill hiện placeholder đúng loại và bấm ra đúng danh
           sách. Bịa một giá trị mặc định vào đây là đặt một lựa chọn người dùng
           chưa từng bấm vào prompt sắp gửi đi vẽ. */
        value: typeof attrs["value"] === "string" ? attrs["value"] : (values[index] ?? INHERIT),
      },
    };
  };
  return walk(doc);
}

/**
 * Giá trị hiện tại của các pill trong một câu, tra THEO `kind`.
 *
 * Dùng cho đường NGƯỢC LẠI với `uiCellDoc`: người dùng bấm pill trong chế độ tự
 * do thì `updateAttributes` chỉ đổi tài liệu, còn `styleId`/`decor`/`materialId`
 * của ô đứng yên. Hai nguồn lệch nhau kéo theo hai hỏng thật: quay về template
 * là mất lựa chọn vừa bấm, và bảng cứu hộ ở trên lấy lại giá trị CŨ.
 * Tra theo `kind` chứ không theo vị trí vì ở đây tài liệu còn lành — `kind` là
 * câu trả lời trực tiếp, vị trí chỉ là suy đoán.
 */
export function pillValuesOf(doc: JSONContent): Partial<Record<PillKind, string>> {
  const out: Partial<Record<PillKind, string>> = {};
  const walk = (node: JSONContent) => {
    if (node.type === NODE.optionPill) {
      const attrs = node.attrs ?? {};
      const kind = attrs["kind"];
      const value = attrs["value"];
      /* Chỉ nhận pill LÀNH: một pill hỏng mà ghi đè lên trường có cấu trúc là
         lấy rác đắp lên dữ liệu còn tốt — đúng chiều ngược với việc đang làm. */
      if (typeof kind === "string" && typeof value === "string" && !(kind in out)) {
        out[kind as PillKind] = value;
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}

/**
 * CHỮ TỰ GÕ của các pill trong một câu, tra theo `kind` — song sinh với
 * `pillValuesOf`.
 *
 * Hai hàm chứ không một hàm trả cặp: chỗ gọi cũ chỉ hỏi `value` và không được
 * phải sửa vì một trường mới; còn chỗ nào cần cả hai thì gọi cả hai, rẻ như nhau
 * (cùng một phép duyệt cây trên một câu dài vài chục node).
 * Chuỗi rỗng KHÔNG được ghi vào bảng: "chưa gõ gì" phải phân biệt được với "pill
 * này không có trong câu", nếu không thì đọc ngược sẽ XOÁ chữ đang có ở trường
 * có cấu trúc mỗi lần người dùng lỡ xoá pill khỏi câu.
 */
export function pillCustomOf(doc: JSONContent): Partial<Record<PillKind, string>> {
  const out: Partial<Record<PillKind, string>> = {};
  const walk = (node: JSONContent) => {
    if (node.type === NODE.optionPill) {
      const attrs = node.attrs ?? {};
      const kind = attrs["kind"];
      const custom = attrs["custom"];
      if (typeof kind === "string" && typeof custom === "string" && custom !== "" && !(kind in out)) {
        out[kind as PillKind] = custom;
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}

/**
 * ẢNH CÓ VAI TRÒ trong một câu → `ContextRef[]`, theo thứ tự xuất hiện.
 *
 * Đường ĐỌC NGƯỢC của `contextDoc`: ở chế độ tự do, câu chữ là nguồn sự thật, nên
 * mỗi nhịp gõ phải rút ảnh trong câu về `ComposerState.contextRefs` — cùng lý do
 * mà `pillValuesOf` rút `themeValue`/`styleId` về. Không rút thì bộ dịch contract
 * phải rẽ nhánh theo chế độ, và hai nhánh ấy sẽ lệch nhau.
 *
 * Ảnh KHÔNG khai vai trò (`role: ""`) bị bỏ qua: đó là pill ảnh của một thẻ, và
 * ở câu ngữ cảnh thì nó không có ô nào trong contract để đi tới. Ảnh vai `logo`
 * cũng không đến từ đây — nó không bao giờ được đặt vào câu (xem `contextDoc`).
 */
export function contextRefsOf(doc: JSONContent): ContextRef[] {
  const out: ContextRef[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === NODE.imagePill) {
      const attrs = node.attrs ?? {};
      const path = attrs["path"];
      const role = attrs["role"];
      if (typeof path === "string" && path && (role === "theme" || role === "style")) {
        out.push({ path, role });
      }
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}
