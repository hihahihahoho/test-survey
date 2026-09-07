import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { useSaveWorkflowDraft, useWorkflowDraft } from "@/lib/hooks/use-projects";
import {
  DEFAULT_MASCOT_POSE,
  initialComposer,
  type Block,
  type BlockMode,
  type ComposerState,
  type ContextRef,
  type MascotPose,
  type UiCell,
} from "@/features/prompt-lab/lib/composer-model";
import { glazeFromMaterial } from "@/features/kit-core/lib/glaze";
import { EXPRESSIONS } from "@/features/kit-core/lib/poses";
import { DEFAULT_VIEW } from "@/features/pose-lab/lib/pose-state";
import { getPresets, type PresetBundle } from "@/features/prompt-lab/lib/presets-store";
import { INHERIT } from "@/features/prompt-lab/lib/pill-registry";
import { NODE } from "@/features/prompt-lab/lib/schema";
import {
  PILL_SLOTS,
  docHasBrokenPill,
  mascotDoc,
  pillValuesOf,
  repairPills,
} from "@/features/prompt-lab/lib/doc-templates";

/**
 * composer-doc.ts — TÀI LIỆU COMPOSER LƯU BỀN THEO DỰ ÁN.
 *
 * ╔══ CÁI GÌ ĐƯỢC LƯU, VÀ VÌ SAO CÓ SỐ PHIÊN BẢN ════════════════════════════╗
 * ║ Lab giữ toàn bộ trạng thái trong RAM của một tab: F5 là mất. Khi composer ║
 * ║ thành khu làm việc THẬT thì mỗi dự án phải có tài liệu của riêng nó, nằm  ║
 * ║ trên đĩa, mở máy khác vẫn ra. Chỗ chứa là `workflow-draft.json` của dự án ║
 * ║ (`GET/PUT /api/projects/:id/workflow-draft` — JSON tự do, trần 2MB).      ║
 * ║                                                                          ║
 * ║ `docVersion` KHÔNG phải trang trí: chỗ chứa ấy ĐANG có dữ liệu của một    ║
 * ║ định dạng khác (bản nháp của wizard đời cũ). Không có số phiên bản thì ║
 * ║ mở một dự án cũ là đọc bản nháp wizard như thể nó là composer, và mọi     ║
 * ║ trường đọc ra `undefined` — một màn trống mà không ai biết vì sao trống.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

export const COMPOSER_DOC_VERSION = 1;

/**
 * Định dạng ghi xuống đĩa.
 *
 * `updatedAt` được LƯU TRONG tài liệu chứ không chỉ đọc từ metadata của agent:
 * UI cần câu "đã lưu lúc 14:32" ngay cả khi đang đọc từ cache của TanStack Query,
 * và cần biết bản trong tay CŨ HAY MỚI hơn bản vừa nhận về.
 */
export interface ComposerDoc {
  docVersion: typeof COMPOSER_DOC_VERSION;
  /** ISO 8601, thời điểm lần ghi cuối. Chuỗi rỗng = chưa từng lưu. */
  updatedAt: string;
  composer: ComposerState;
}

/** Tài liệu của một dự án chưa có gì. */
export function emptyComposerDoc(presets: PresetBundle = getPresets()): ComposerDoc {
  return { docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer: initialComposer(presets) };
}

/* ══════════════════════════════════════════════════════════════════════════
   Đọc dữ liệu đã lưu — KHOAN DUNG VỚI RÁC, KHÔNG KHOAN DUNG VỚI ĐOÁN MÒ
   ══════════════════════════════════════════════════════════════════════════ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Ô của lưới UI kit. Ô thiếu `elementId` bị BỎ: một ô không biết vẽ gì là một ô rác. */
function readCell(raw: unknown, index: number): UiCell | null {
  if (!isRecord(raw)) return null;
  const elementId = str(raw["elementId"]);
  if (!elementId) return null;
  const styleId = str(raw["styleId"]);
  const decor = str(raw["decor"]);
  /**
   * DI TRÚ `materialId` → `glazeId`.
   *
   * Bản nháp đời trước lưu id chất liệu; pill ấy không còn. `glazeFromMaterial` đưa
   * nó về đục nền gần nhất (kính→Kính trong, băng→Băng, lửa/phát sáng→Phát sáng,
   * còn lại→nền đặc) — xem bảng ở `glaze.ts` để biết vì sao gỗ/đá/kim loại rơi về
   * rỗng thay vì được cố giữ.
   *
   * `"glazeId" in raw` chứ không phải `str(...) || fallback`: RỖNG là một lựa chọn
   * ("nền đặc"), không phải "chưa có gì". Hỏi bằng `||` thì người dùng bỏ đục nền
   * của một dòng cũ xong, mở lại dự án là nó tự quay về theo `materialId` còn sót.
   */
  const glazeId = "glazeId" in raw ? str(raw["glazeId"]) : glazeFromMaterial(str(raw["materialId"]));
  return {
    id: str(raw["id"]) || `cell-${index}`,
    elementId,
    styleId,
    decor,
    glazeId,
    sizeId: str(raw["sizeId"]),
    note: str(raw["note"]),
    /* Câu tự do của riêng dòng (chế độ `free`). Thiếu ⇒ để `undefined` chứ KHÔNG
       dựng câu khởi điểm ở đây: dựng ở đây là ghi một tài liệu TipTap vào mọi ô
       của mọi dự án cũ, kể cả những ô sẽ không bao giờ vào chế độ tự do. Chỗ
       dựng đúng là lúc gạt công tắc (`UiKitBlockBody.pick`).

       CỨU HỘ NGAY LÚC ĐỌC: tài liệu đời trước có thể mang pill `{kind: null}` —
       xem `PILL_SLOTS`. Ô element là chỗ cứu được TRỌN VẸN, vì ba giá trị pill
       vẫn còn nguyên trong ba trường có cấu trúc ngay cạnh đây; chúng không đi
       qua ProseMirror nên không dính lượt DOM→doc đã làm hỏng tài liệu. */
    /* Thứ tự `values` PHẢI khớp `PILL_SLOTS.uikit` — ba nơi, một thứ tự (xem bảng
       ấy). Truyền giá trị ĐÃ DI TRÚ (`glazeId`), không phải `materialId` thô: pill
       được cứu hộ mang `kind: "glaze"`, mà một id chất liệu trong pill đục nền là
       một giá trị lạ ⇒ `phraseOf` trả rỗng ⇒ lựa chọn biến mất khỏi prompt. */
    ...(isRecord(raw["doc"])
      ? { doc: healDoc(raw["doc"] as JSONContent, "uikit", [styleId, glazeId, decor]) }
      : {}),
  };
}

/** Chỉ dựng lại tài liệu KHI CÓ pill hỏng — không đụng vào tài liệu lành. */
function healDoc(doc: JSONContent, slot: keyof typeof PILL_SLOTS, values?: readonly string[]): JSONContent {
  return docHasBrokenPill(doc) ? repairPills(doc, PILL_SLOTS[slot], values) : doc;
}

/** Một dòng dáng ĐÃ Ở ĐỊNH DẠNG MỚI. Thiếu `pose` ⇒ bỏ: dòng không biết vẽ gì. */
function readPose(raw: unknown, index: number, view: string, expression: string): MascotPose | null {
  if (!isRecord(raw)) return null;
  const pose = str(raw["pose"]);
  if (!pose) return null;
  const row: MascotPose = {
    id: str(raw["id"]) || `pose-${index}`,
    pose,
    /* Thiếu góc/nét mặt ⇒ mặc định dùng được ngay, không để rỗng: một ô không có
       góc máy nào trong câu là một ô để máy vẽ tự chọn góc, và mười sáu ô như thế
       thì không còn là một tấm turnaround. */
    view: str(raw["view"]) || view,
    expression: str(raw["expression"]) || expression,
    note: str(raw["note"]),
    ...(str(raw["refPath"]) ? { refPath: str(raw["refPath"]) } : {}),
  };
  /* Cứu hộ pill NGAY LÚC ĐỌC, cùng luật với ô element: ba giá trị pill của dòng
     vẫn còn nguyên trong ba trường có cấu trúc ngay cạnh đây, nên dòng dáng cứu
     được TRỌN VẸN — xem `PILL_SLOTS`. */
  return isRecord(raw["doc"])
    ? { ...row, doc: healDoc(raw["doc"] as JSONContent, "mascotPose", [row.pose, row.view, row.expression]) }
    : row;
}

/**
 * Thẻ Nhân vật — đọc được CẢ hình dạng mới lẫn hình dạng một-dáng đời trước.
 *
 * ╔══ HAI ĐỊNH DẠNG, PHÂN BIỆT BẰNG SỰ CÓ MẶT CỦA `poses` ═══════════════════╗
 * ║ Bản cũ là một `DocBlock`: một câu mad-lib chứa [ảnh][dáng][ảnh dáng]      ║
 * ║ [biểu cảm][trang phục], cộng `poseView` và bảng `poseRefs` nằm rời.       ║
 * ║ Dịch sang bản mới là một phép ánh xạ CÓ KIỂM CHỨNG ĐƯỢC, không phải đoán  ║
 * ║ mò — mỗi mảnh cũ có đúng một chỗ mới để đi tới:                           ║
 * ║   ảnh #1 → pill ảnh của câu đầu · trang phục → pill outfit của câu đầu    ║
 * ║   dáng + `poseView` + biểu cảm → MỘT dòng dáng · `poseRefs[dáng|góc]` →   ║
 * ║   `refPath` của chính dòng ấy.                                            ║
 * ║ Ảnh #2 (ô «hoặc ảnh dáng») bị BỎ có chủ ý: nó chứa ảnh manơcanh engine tự ║
 * ║ chụp, và ảnh ấy nay được ghép lại theo lưới ở `ensurePoseRefs` — mang một ║
 * ║ tấm chụp riêng lẻ sang là mang một ảnh sai bố cục.                        ║
 * ║ CÂU ĐẦU ĐƯỢC DỰNG LẠI TỪ TEMPLATE MỚI chứ không vá câu cũ: câu cũ có năm  ║
 * ║ chỗ chọn và ba trong số đó nay thuộc về dòng — cắt bớt một câu ProseMirror║
 * ║ tại chỗ là một phép chỉnh cây mà không có cách nào kiểm được nó đúng.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
function readMascotBlock(raw: Record<string, unknown>, id: string, mode: BlockMode): Block | null {
  if (!isRecord(raw["doc"])) return null;
  const fallbackView = DEFAULT_VIEW;
  const fallbackExpression = EXPRESSIONS[0]?.value ?? "";

  if (Array.isArray(raw["poses"])) {
    const poses = (raw["poses"] as unknown[])
      .map((row, i) => readPose(row, i, fallbackView, fallbackExpression))
      .filter((row): row is MascotPose => row !== null);
    const sheet = raw["poseSheet"];
    return {
      id,
      kind: "mascot",
      mode,
      /* `withImageRole`: bản nháp lưu TRƯỚC 09/2026 có pill ảnh không khai vai
         trò. Vai trò ấy không đổi chỗ tấm ảnh trong contract (nó vẫn là
         `sheet.ref` của tấm dáng) — nó chỉ mở menu «Mascot của <thương hiệu>».
         Thiếu nó thì mọi thẻ Nhân vật đã có sẵn im lặng không nhận được gợi ý,
         và người dùng thấy tính năng chỉ chạy trên thẻ mới tạo. */
      doc: withImageRole(healDoc(raw["doc"] as JSONContent, "mascot"), "character"),
      poses,
      ...(isRecord(sheet) && Array.isArray(sheet["paths"]) && typeof sheet["key"] === "string"
        ? {
            poseSheet: {
              key: sheet["key"],
              paths: (sheet["paths"] as unknown[]).map((p) => (typeof p === "string" ? p : "")),
            },
          }
        : {}),
    };
  }

  /* ── Bản MỘT DÁNG đời trước ──────────────────────────────────────────────── */
  const old = raw["doc"] as JSONContent;
  const pills = pillValuesOf(old);
  const view = str(raw["poseView"]) || fallbackView;
  const pose = pills.pose || DEFAULT_MASCOT_POSE;
  const refs = isRecord(raw["poseRefs"]) ? raw["poseRefs"] : {};
  const cached = refs[`${pose}|${view}`];

  const row: MascotPose = {
    id: `${id}-pose-1`,
    pose,
    view,
    expression: pills.expression ?? fallbackExpression,
    note: "",
    ...(typeof cached === "string" && cached ? { refPath: cached } : {}),
  };

  return {
    id,
    kind: "mascot",
    mode,
    /* Ảnh nhân vật là thứ DUY NHẤT của câu cũ không dựng lại được từ template —
       nó là một tệp người dùng đã tải lên. Nên nó được bê sang từng attr một. */
    doc: withHeadImage(mascotDoc(), firstImageAttrs(old), pills.outfit ?? INHERIT),
    poses: [row],
  };
}

/**
 * Gán vai trò cho những pill ảnh CHƯA KHAI vai trò — không đụng pill đã khai.
 *
 * Không dựng lại tài liệu khi không có gì để sửa (trả về đúng object cũ), cùng
 * luật với `healDoc`: một lượt dựng lại thừa là một lượt `onUpdate` thừa của
 * editor, và lượt ấy đóng dấu xuống đĩa ở MỌI lần mở dự án.
 */
function withImageRole(doc: JSONContent, role: string): JSONContent {
  let changed = false;
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === NODE.imagePill && !str(node.attrs?.["role"])) {
      changed = true;
      return { ...node, attrs: { ...node.attrs, role } };
    }
    if (!node.content) return node;
    const kids = node.content.map(walk);
    return changed ? { ...node, content: kids } : node;
  };
  const next = walk(doc);
  return changed ? next : doc;
}

/** Attrs của pill ảnh ĐẦU TIÊN trong một tài liệu — ảnh nhân vật của câu cũ. */
function firstImageAttrs(doc: JSONContent): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const walk = (node: JSONContent): void => {
    if (found) return;
    if (node.type === NODE.imagePill) {
      found = node.attrs ?? {};
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return found;
}

/** Đổ ảnh + trang phục cũ vào câu đầu thẻ vừa dựng từ template mới. */
function withHeadImage(doc: JSONContent, image: Record<string, unknown> | null, outfit: string): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === NODE.imagePill && image) return { ...node, attrs: { ...node.attrs, ...image } };
    if (node.type === NODE.optionPill && node.attrs?.["kind"] === "outfit") {
      return { ...node, attrs: { ...node.attrs, value: outfit } };
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return walk(doc);
}

/**
 * Một block. Trả `null` khi không đọc nổi — và block hỏng bị BỎ RIÊNG nó, không
 * làm hỏng cả tài liệu (cùng tinh thần §6.5-6 của thư viện element).
 */
function readBlock(raw: unknown, index: number): Block | null {
  if (!isRecord(raw)) return null;
  const kind = str(raw["kind"]);
  const id = str(raw["id"]) || `block-${index}`;
  /* Dự án lưu TRƯỚC khi block có hai chế độ ⇒ `template`, đúng thứ nó đang là.
     Đoán sang `free` là bật một cơ chế người dùng chưa từng chọn. */
  const mode: BlockMode = raw["mode"] === "free" ? "free" : "template";
  if (kind === "uikit") {
    const cells = Array.isArray(raw["cells"])
      ? (raw["cells"] as unknown[]).map(readCell).filter((c): c is UiCell => c !== null)
      : [];
    return { id, kind: "uikit", mode, cells };
  }
  if (kind === "mascot") return readMascotBlock(raw, id, mode);
  if (kind !== "background") return null;
  if (!isRecord(raw["doc"])) return null;
  return {
    id,
    kind,
    mode,
    /* Cùng phép cứu hộ, nhưng KHÔNG có giá trị để trả lại: câu Cảnh nền không lưu
       lựa chọn ở đâu ngoài chính tài liệu. Nên chỉ khôi phục được pill ĐÓ LÀ GÌ
       (đúng nhãn, đúng danh sách khi bấm), còn NÓ ĐANG CHỌN GÌ thì đã mất thật —
       và để rỗng là nói đúng điều đó. Xem `repairPills`. */
    doc: healDoc(raw["doc"] as JSONContent, kind),
  };
}

/**
 * Một tấm ảnh của câu ngữ cảnh. Thiếu `path` hoặc vai trò lạ ⇒ BỎ.
 *
 * Không "sửa cho hợp lệ": một tấm không biết mình nói về cái gì thì bộ dịch chỉ
 * còn cách đoán nó đi vào `inspo` hay `brand.refs` — và đoán sai ở đây là đính
 * một cái logo vào chỗ dạy máy vẽ lối vẽ.
 */
function readContextRef(raw: unknown): ContextRef | null {
  if (!isRecord(raw)) return null;
  const path = str(raw["path"]);
  const role = str(raw["role"]);
  if (!path) return null;
  if (role !== "theme" && role !== "style" && role !== "logo") return null;
  const assetId = str(raw["assetId"]);
  return { path, role, ...(assetId ? { assetId } : {}) };
}

function readComposer(raw: unknown, presets: PresetBundle): ComposerState {
  const base = initialComposer(presets);
  if (!isRecord(raw)) return base;
  const brand = Array.isArray(raw["brandColors"])
    ? (raw["brandColors"] as unknown[]).filter((c): c is string => typeof c === "string")
    : base.brandColors;
  /* Bảng cache asset: chỉ nhận cặp chuỗi-chuỗi. Một giá trị không phải chuỗi ở
     đây sẽ đi thẳng vào `sheet.ref` của contract dưới dạng `undefined`. */
  const assets: Record<string, string> = {};
  if (isRecord(raw["brandAssets"])) {
    for (const [id, path] of Object.entries(raw["brandAssets"])) {
      if (typeof path === "string" && path) assets[id] = path;
    }
  }
  return {
    themeValue: typeof raw["themeValue"] === "string" ? (raw["themeValue"] as string) : base.themeValue,
    styleId: typeof raw["styleId"] === "string" ? (raw["styleId"] as string) : base.styleId,
    brandColors: brand,
    /* BỐN TRƯỜNG DƯỚI ĐÂY LÀ MỚI (09/2026) và mọi bản nháp đang nằm trên đĩa đều
       thiếu chúng. Mặc định phải là "chưa có gì", KHÔNG phải một giá trị đoán:
       một `brandId` bịa ra là đổ màu của một thương hiệu vào bộ kit người dùng
       chưa từng chọn, và họ chỉ phát hiện sau khi đã vẽ. */
    themeCustom: str(raw["themeCustom"]),
    styleCustom: str(raw["styleCustom"]),
    brandId: str(raw["brandId"]),
    contextRefs: Array.isArray(raw["contextRefs"])
      ? (raw["contextRefs"] as unknown[]).map(readContextRef).filter((r): r is ContextRef => r !== null)
      : [],
    brandAssets: assets,
    /* Dự án lưu TRƯỚC khi khối Ngữ cảnh có hai chế độ ⇒ `template`, đúng thứ nó
       đang là — cùng luật với block Bộ UI ở `readBlock`. */
    contextMode: raw["contextMode"] === "free" ? "free" : "template",
    ...(isRecord(raw["contextDoc"])
      ? { contextDoc: healDoc(raw["contextDoc"] as JSONContent, "context") }
      : {}),
    blocks: Array.isArray(raw["blocks"])
      ? (raw["blocks"] as unknown[]).map(readBlock).filter((b): b is Block => b !== null)
      : [],
  };
}

/**
 * Dữ liệu thô trong `workflow-draft.json` → `ComposerDoc`.
 *
 * ╔══ THIẾU `docVersion` ⇒ TÀI LIỆU RỖNG. KHÔNG CỐ DỊCH. ═════════════════════╗
 * ║ Thứ nằm sẵn trong ô nhớ đó ở phần lớn dự án là BẢN NHÁP WIZARD (6 bước,   ║
 * ║ `kitName`/`styleAxes`/`elements`/`mascotPoses`…). Dịch nó sang composer    ║
 * ║ nghe có vẻ tử tế, nhưng nó là một phép dịch KHÔNG KIỂM CHỨNG ĐƯỢC: wizard  ║
 * ║ mô tả bộ kit bằng danh sách element có sẵn, composer mô tả bằng câu chữ    ║
 * ║ người dùng viết. Đoán ra "câu chữ" từ "danh sách" là bịa nội dung rồi đặt  ║
 * ║ vào miệng người dùng — và họ sẽ bấm Vẽ trên một bản nháp không phải của họ.║
 * ║                                                                          ║
 * ║ Bản NÀO cao hơn `COMPOSER_DOC_VERSION` cũng ra tài liệu rỗng: đọc một định ║
 * ║ dạng của tương lai bằng luật của hôm nay là cách chắc chắn nhất để GHI ĐÈ  ║
 * ║ mất dữ liệu mới hơn. (Bản nháp wizard vẫn nằm nguyên trên đĩa cho tới lần  ║
 * ║ ghi đầu tiên của composer — wave UI phải hỏi trước khi ghi đè, đó là việc  ║
 * ║ của màn hình, không phải của hàm này.)                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function migrateComposerDoc(raw: unknown, presets: PresetBundle = getPresets()): ComposerDoc {
  if (!isRecord(raw)) return emptyComposerDoc(presets);
  if (raw["docVersion"] !== COMPOSER_DOC_VERSION) return emptyComposerDoc(presets);
  return {
    docVersion: COMPOSER_DOC_VERSION,
    updatedAt: str(raw["updatedAt"]),
    composer: readComposer(raw["composer"], presets),
  };
}

/**
 * `true` khi ô nhớ đang chứa MỘT THỨ KHÁC mà lần ghi đầu của composer sẽ ĐÈ MẤT.
 *
 * ╔══ VÌ SAO MÀN HÌNH PHẢI HỎI, VÀ VÌ SAO PHÉP KIỂM NẰM Ở ĐÂY ═══════════════╗
 * ║ `migrateComposerDoc` cố ý trả tài liệu RỖNG cho mọi thứ không mang đúng   ║
 * ║ `docVersion` (xem khối chú thích của nó). Rỗng là ĐÚNG để đọc — nhưng nếu ║
 * ║ màn cứ thế cho gõ thì cú `setComposer` đầu tiên PUT đè lên `workflow-draft`║
 * ║ .json, và bản nháp wizard 6 bước của người dùng biến mất không một lời báo.║
 * ║ Phép kiểm là LOGIC THUẦN nên nó ở cạnh hàm di trú (test được, không cần    ║
 * ║ DOM); còn CÂU HỎI là việc của màn — hai chuyện khác nhau, hai chỗ khác nhau.║
 * ║                                                                          ║
 * ║ `{}` và `null` KHÔNG tính: dự án chưa từng lưu gì thì không có gì để mất, ║
 * ║ và hỏi thừa ở đây là bắt mọi dự án mới trả lời một câu vô nghĩa.          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function isLegacyWizardDraft(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (raw["docVersion"] === COMPOSER_DOC_VERSION) return false;
  return Object.keys(raw).length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   Hook — nạp, sửa, tự lưu
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Khoảng chờ trước khi ghi. Sàn của yêu cầu là 600ms và ở đúng 600ms:
 * gõ một câu prompt là chuỗi phím liên tục, mỗi phím một PUT thì mỗi câu là vài
 * chục lượt ghi đĩa. Chờ lâu hơn thì "đã lưu lúc…" tụt lại quá xa cảm giác của
 * người đang gõ.
 */
export const COMPOSER_SAVE_DEBOUNCE_MS = 600;

export interface ComposerDocStore {
  /** Trạng thái ĐANG SỬA — luôn là thứ mới nhất, kể cả khi chưa kịp ghi. */
  composer: ComposerState;
  /** Thời điểm ghi thành công gần nhất (ISO). Rỗng = chưa từng lưu. */
  updatedAt: string;
  /** Chưa nạp xong bản trên đĩa — UI đừng cho sửa vội, sửa lúc này là ghi đè mù. */
  loading: boolean;
  /**
   * Ô nhớ đang giữ BẢN NHÁP WIZARD CŨ ⇒ màn PHẢI hỏi trước khi cho gõ chữ đầu
   * tiên. Xem `isLegacyWizardDraft`. `false` khi chưa nạp xong (chưa biết thì
   * chưa doạ người dùng).
   */
  legacyDraft: boolean;
  /** Có thay đổi chưa ghi (đang đợi debounce hoặc đang bay). */
  dirty: boolean;
  saving: boolean;
  /** Lỗi của lần ghi gần nhất — UI phải NÓI RA, không được nuốt. */
  saveError: unknown;
  setComposer: (next: ComposerState | ((prev: ComposerState) => ComposerState)) => void;
  /** Ghi NGAY, bỏ qua debounce (rời màn, bấm "Vẽ"). */
  flush: () => void;
}

/**
 * Tài liệu composer của MỘT dự án: nạp + di trú + tự lưu.
 *
 * ══ VÌ SAO CÓ MỘT BẢN TRONG RAM CẠNH CACHE CỦA QUERY ══════════════════════
 * Vì hai đồng hồ chạy khác nhịp: người dùng gõ theo mili-giây, còn `useQuery`
 * chỉ đổi dữ liệu sau một vòng mạng. Nếu ô soạn thảo đọc thẳng `query.data` thì
 * mỗi lần refetch là con trỏ nhảy về chữ của server — thứ mà `BlockEditor` đã
 * phải chống bằng `resetToken`. Bản RAM là nguồn sự thật lúc đang sửa; bản của
 * server chỉ được nhận vào KHI TA CHƯA SỬA GÌ (`adoptedRef`).
 */
export function useComposerDoc(
  projectId: string | null | undefined,
  presets: PresetBundle = getPresets(),
): ComposerDocStore {
  const query = useWorkflowDraft(projectId);
  const save = useSaveWorkflowDraft(projectId ?? "");

  const [composer, setComposerState] = React.useState<ComposerState | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  /* Bản trên đĩa CHỈ được nhận một lần cho mỗi dự án. Nhận lại ở lần refetch thứ
     hai là xoá thẳng thứ người dùng đang gõ. */
  const adoptedRef = React.useRef<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Giữ bản mới nhất ngoài closure của `setTimeout`: hàm hẹn giờ được tạo lúc
     bấm phím đầu tiên, còn thứ phải ghi là trạng thái lúc hết giờ. */
  const pendingRef = React.useRef<ComposerState | null>(null);
  const saveRef = React.useRef(save);
  saveRef.current = save;

  const doc = React.useMemo(
    () => migrateComposerDoc(query.data?.draft, presets),
    [query.data, presets],
  );

  React.useEffect(() => {
    if (!projectId) return;
    if (adoptedRef.current === projectId) return;
    if (query.data === undefined) return;
    adoptedRef.current = projectId;
    setComposerState(doc.composer);
    setUpdatedAt(doc.updatedAt || (query.data.updatedAt ?? ""));
    setDirty(false);
  }, [projectId, query.data, doc]);

  const write = React.useCallback(
    (state: ComposerState) => {
      if (!projectId) return;
      const at = new Date().toISOString();
      const payload: ComposerDoc = { docVersion: COMPOSER_DOC_VERSION, updatedAt: at, composer: state };
      pendingRef.current = null;
      saveRef.current.mutate(
        /* `completed: false` — trường này thuộc bản nháp wizard và không có nghĩa
           gì với composer; gửi `true` là nói với phần còn lại của app rằng wizard
           đã xong. Xem chú thích di trú ở trên. */
        { completed: false, draft: payload as unknown as Record<string, unknown> },
        {
          onSuccess: (data) => {
            setUpdatedAt(data?.updatedAt ?? at);
            /* Chỉ hết "bẩn" khi KHÔNG có thay đổi nào chen vào giữa lúc đang bay
               — nếu có, `pendingRef` đã được đặt lại và một lượt ghi nữa đang chờ. */
            if (pendingRef.current === null) setDirty(false);
          },
        },
      );
    },
    [projectId],
  );

  const setComposer = React.useCallback(
    (next: ComposerState | ((prev: ComposerState) => ComposerState)) => {
      setComposerState((prev) => {
        const base = prev ?? doc.composer;
        const value = typeof next === "function" ? (next as (p: ComposerState) => ComposerState)(base) : next;
        pendingRef.current = value;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          const latest = pendingRef.current;
          if (latest) write(latest);
        }, COMPOSER_SAVE_DEBOUNCE_MS);
        return value;
      });
      setDirty(true);
    },
    [doc.composer, write],
  );

  const flush = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const latest = pendingRef.current;
    if (latest) write(latest);
  }, [write]);

  /* Rời màn giữa chừng KHÔNG được mất chữ: hẹn giờ bị huỷ cùng component, nên
     lượt ghi cuối phải bắn ngay tại đây. */
  React.useEffect(() => flush, [flush]);

  return {
    composer: composer ?? doc.composer,
    updatedAt,
    loading: Boolean(projectId) && query.isLoading,
    legacyDraft: query.data !== undefined && isLegacyWizardDraft(query.data.draft),
    dirty,
    saving: save.isPending,
    saveError: save.error,
    setComposer,
    flush,
  };
}
