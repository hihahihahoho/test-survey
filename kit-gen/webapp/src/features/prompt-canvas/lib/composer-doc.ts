import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { useSaveWorkflowDraft, useWorkflowDraft } from "@/lib/hooks/use-projects";
import {
  initialComposer,
  type Block,
  type BlockMode,
  type ComposerState,
  type UiCell,
} from "@/features/prompt-lab/lib/composer-model";
import { getPresets, type PresetBundle } from "@/features/prompt-lab/lib/presets-store";
import { PILL_SLOTS, docHasBrokenPill, repairPills } from "@/features/prompt-lab/lib/doc-templates";

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
  const materialId = str(raw["materialId"]);
  return {
    id: str(raw["id"]) || `cell-${index}`,
    elementId,
    styleId,
    decor,
    materialId,
    note: str(raw["note"]),
    /* Câu tự do của riêng dòng (chế độ `free`). Thiếu ⇒ để `undefined` chứ KHÔNG
       dựng câu khởi điểm ở đây: dựng ở đây là ghi một tài liệu TipTap vào mọi ô
       của mọi dự án cũ, kể cả những ô sẽ không bao giờ vào chế độ tự do. Chỗ
       dựng đúng là lúc gạt công tắc (`UiKitBlockBody.pick`).

       CỨU HỘ NGAY LÚC ĐỌC: tài liệu đời trước có thể mang pill `{kind: null}` —
       xem `PILL_SLOTS`. Ô element là chỗ cứu được TRỌN VẸN, vì ba giá trị pill
       vẫn còn nguyên trong ba trường có cấu trúc ngay cạnh đây; chúng không đi
       qua ProseMirror nên không dính lượt DOM→doc đã làm hỏng tài liệu. */
    ...(isRecord(raw["doc"])
      ? { doc: healDoc(raw["doc"] as JSONContent, "uikit", [styleId, decor, materialId]) }
      : {}),
  };
}

/** Chỉ dựng lại tài liệu KHI CÓ pill hỏng — không đụng vào tài liệu lành. */
function healDoc(doc: JSONContent, slot: keyof typeof PILL_SLOTS, values?: readonly string[]): JSONContent {
  return docHasBrokenPill(doc) ? repairPills(doc, PILL_SLOTS[slot], values) : doc;
}

/**
 * Một block. Trả `null` khi không đọc nổi — và block hỏng bị BỎ RIÊNG nó, không
 * làm hỏng cả tài liệu (cùng tinh thần §6.5-6 của thư viện element).
 */
function readBlock(raw: unknown, index: number): Block | null {
  if (!isRecord(raw)) return null;
  const kind = str(raw["kind"]);
  const id = str(raw["id"]) || `block-${index}`;
  if (kind === "uikit") {
    const cells = Array.isArray(raw["cells"])
      ? (raw["cells"] as unknown[]).map(readCell).filter((c): c is UiCell => c !== null)
      : [];
    /* Dự án lưu TRƯỚC khi block Bộ UI có hai chế độ ⇒ `template`, đúng thứ nó
       đang là. Đoán sang `free` là bật một cơ chế người dùng chưa từng chọn. */
    return { id, kind: "uikit", mode: raw["mode"] === "free" ? "free" : "template", cells };
  }
  if (kind !== "background" && kind !== "mascot") return null;
  if (!isRecord(raw["doc"])) return null;
  const mode: BlockMode = raw["mode"] === "free" ? "free" : "template";
  /* Bảng ảnh dáng đọc PHÒNG THỦ từng ô: một khoá trỏ vào chuỗi rác chỉ làm mất
     đúng một lần chụp lại, còn ném cả block đi là mất câu chữ người dùng viết. */
  const poseRefs: Record<string, string> = {};
  if (isRecord(raw["poseRefs"])) {
    for (const [key, value] of Object.entries(raw["poseRefs"])) {
      if (typeof value === "string" && value) poseRefs[key] = value;
    }
  }
  return {
    id,
    kind,
    mode,
    /* Cùng phép cứu hộ, nhưng KHÔNG có giá trị để trả lại: câu Cảnh nền / Nhân
       vật không lưu lựa chọn ở đâu ngoài chính tài liệu. Nên chỉ khôi phục được
       pill ĐÓ LÀ GÌ (đúng nhãn, đúng danh sách khi bấm), còn NÓ ĐANG CHỌN GÌ thì
       đã mất thật — và để rỗng là nói đúng điều đó. Xem `repairPills`. */
    doc: healDoc(raw["doc"] as JSONContent, kind),
    ...(str(raw["poseView"]) ? { poseView: str(raw["poseView"]) } : {}),
    ...(Object.keys(poseRefs).length ? { poseRefs } : {}),
  };
}

function readComposer(raw: unknown, presets: PresetBundle): ComposerState {
  const base = initialComposer(presets);
  if (!isRecord(raw)) return base;
  const brand = Array.isArray(raw["brandColors"])
    ? (raw["brandColors"] as unknown[]).filter((c): c is string => typeof c === "string")
    : base.brandColors;
  return {
    themeValue: typeof raw["themeValue"] === "string" ? (raw["themeValue"] as string) : base.themeValue,
    styleId: typeof raw["styleId"] === "string" ? (raw["styleId"] as string) : base.styleId,
    brandColors: brand,
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
