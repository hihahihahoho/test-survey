import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Copy, GripVertical, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { foldVi } from "@/features/kit-core/lib/element-lib/source";
import { GLAZE_SOLID } from "@/features/kit-core/lib/glaze";
import { SKEL_SHAPES, slugify, type Skel } from "@/lib/types/contract";
import { SIZE_PRESETS } from "@/features/prompt-lab/lib/cell-size";
import { POSE_PRESETS } from "@/features/prompt-lab/lib/pose/pose-presets";
import { canAddRow, canDeleteRow } from "@/features/prompt-lab/lib/catalog-seeds";
import {
  MANAGED_ORDER, managedRows, nextRowId, seedRowsOf, SET_KIND_DEFAULT, setManagedRows,
  usePresetSyncError, usePresets,
  type ElementSetKind, type ElementSetRef, type ManagedKind, type ManagedRow,
} from "@/features/prompt-lab/lib/presets-store";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

/**
 * PromptLibraryScreen — MỘT CHỖ ĐỂ SỬA MỌI DANH MỤC ĐI VÀO PROMPT.
 *
 * ╔══ VÌ SAO MÀN NÀY PHẢI TỒN TẠI ═══════════════════════════════════════════╗
 * ║ Màn soạn `/k/:id` hỏi người dùng mười hai câu hỏi bằng mười hai pill, và  ║
 * ║ câu trả lời của mười trong số đó nằm CỨNG trong mã nguồn cho tới lượt     ║
 * ║ này. Chủ sản phẩm: *"đang thiếu khá nhiều mục quản lý"*. Một đội game có  ║
 * ║ chủ đề riêng, khung cảnh riêng, bộ dáng riêng — và nếu muốn thêm một mục  ║
 * ║ thì phải nhờ người viết mã phát hành lại app. Đó không phải công cụ, đó   ║
 * ║ là một bản demo.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ BỐ CỤC: RAIL DANH MỤC · DANH SÁCH DÒNG · PANEL SỬA ════════════════════╗
 * ║ Ba cột, và mỗi cột trả lời đúng một câu hỏi: «sửa danh mục nào», «danh    ║
 * ║ mục ấy có gì», «dòng này viết gì». Vì sao KHÔNG dùng hộp thoại cho việc   ║
 * ║ sửa: người ta sửa một danh mục theo LỐI SO SÁNH — mở câu của «Ít» ra để   ║
 * ║ viết câu của «Vừa» cho khỏi chồng nghĩa. Một hộp thoại che mất danh sách  ║
 * ║ là bắt họ nhớ thay vì nhìn, và bắt họ đóng/mở mười lần cho mười dòng.     ║
 * ║ Panel thì đứng cạnh: sửa xong dòng này, bấm dòng kia, panel đổi nội dung. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ SỬA XONG LÀ PILL ĐỔI NGAY, KHÔNG CẦN TẢI LẠI ═══════════════════════════
 * Kho là một `useSyncExternalStore` dùng chung (`usePresets`), nên một lượt ghi ở
 * đây phát ngay tới mọi màn đang mở — kể cả tab soạn prompt bên cạnh. Việc đẩy lên
 * workspace được gộp và hoãn trong kho; màn này KHÔNG tự gọi API.
 */

/**
 * Chữ của một danh mục: tên trên rail, một câu nói nó điều khiển cái gì, và — từ
 * lượt này — MỘT CÂU CHỈ CHỖ: mục này hiện ra ở đâu trên màn soạn.
 *
 * ══ VÌ SAO THÊM `where` CHỨ KHÔNG VIẾT DÀI THÊM `blurb` ════════════════════
 * Chủ sản phẩm mở màn này ra và hỏi *"cái nào cho món giao diện, cái nào cho nền,
 * cái nào cho nhân vật?"* — tức là câu hỏi đầu tiên KHÔNG phải "danh mục này nghĩa
 * là gì" mà "sửa nó thì cái gì trên màn soạn đổi theo". Rail đã trả lời một nửa
 * bằng bốn nhóm; nửa còn lại phải nói bằng chữ, và phải nói bằng ĐÚNG TÊN người
 * dùng thấy («pill Trang trí», «thẻ Bộ UI»), không phải tên biến.
 */
const CATEGORY: Record<ManagedKind, { label: string; blurb: string; where: string }> = {
  style: {
    label: "Phong cách",
    blurb: "Lối vẽ chung của cả bộ: nét, khối, bảng màu. Câu này đi vào mọi tấm.",
    where: "Pill «Phong cách» ở khối Ngữ cảnh chung, và trên mỗi dòng của thẻ Bộ UI.",
  },
  theme: {
    label: "Chủ đề",
    blurb: "Mô-típ và màu của cả bộ. Mỗi mục có hai câu — một cho cả bộ, một cho bộ đồ nhân vật mặc.",
    where: "Pill «Chủ đề» ở khối Ngữ cảnh chung.",
  },
  scene: {
    label: "Khung cảnh", blurb: "Tấm nền vẽ cảnh gì: màn chính, màn chơi, cửa hàng…",
    where: "Pill khung cảnh trong câu của thẻ Background.",
  },
  layout: {
    label: "Bố cục", blurb: "Chừa chỗ nào trên nền cho các nút bấm đứng lên.",
    where: "Pill bố cục trong câu của thẻ Background.",
  },
  glaze: {
    label: "Đục nền", blurb: "Món này đặc, hay nhìn xuyên qua được.",
    where: "Pill «Đục nền» trên mỗi dòng của thẻ Bộ UI.",
  },
  decor: {
    label: "Trang trí", blurb: "Một món mang bao nhiêu hoa văn.",
    where: "Pill «Trang trí» trên mỗi dòng của thẻ Bộ UI.",
  },
  decorPlace: {
    label: "Bố trí", blurb: "Hoa văn dồn về phía nào.",
    where: "Pill «Bố trí» trên mỗi dòng của thẻ Bộ UI — chỉ hiện khi dòng ấy có hoa văn.",
  },
  element: {
    label: "Món giao diện",
    blurb: "Danh mục món: Button, Popup, Health bar… kèm hình dạng và cỡ. Tên dùng thuật ngữ tiếng Anh của giới làm game UI; nhãn của một phần là tên ngắn của riêng nó (fill, box), tên bộ đứng trước nó trên thẻ Bộ UI.",
    where: "Ô chọn món ở đầu mỗi dòng của thẻ Bộ UI — bày theo BỘ: bộ ghép chọn một lần là có đủ các phần, bộ biến thể thì chọn lẻ từng trạng thái.",
  },
  pose: { label: "Dáng", blurb: "Dáng đứng của nhân vật.", where: "Pill «Dáng» trên mỗi dòng của thẻ Nhân vật." },
  view: {
    label: "Góc máy", blurb: "Nhìn nhân vật từ hướng nào.",
    where: "Pill «Góc» trên mỗi dòng của thẻ Nhân vật.",
  },
  expression: {
    label: "Biểu cảm", blurb: "Nét mặt của nhân vật.",
    where: "Pill «Biểu cảm» trên mỗi dòng của thẻ Nhân vật.",
  },
  outfit: {
    label: "Trang phục", blurb: "Nhân vật mặc gì, khi không lấy theo chủ đề chung.",
    where: "Pill trang phục trong câu của thẻ Nhân vật.",
  },
};

/**
 * BỐN NHÓM CỦA RAIL — và chúng đi theo THỨ TỰ THẺ TRÊN MÀN SOẠN, không theo bảng chữ cái.
 *
 * ╔══ MƯỜI HAI MỤC PHẲNG LÀ MỘT DANH SÁCH KHÔNG TRẢ LỜI ĐƯỢC GÌ ═════════════╗
 * ║ Chủ sản phẩm nhìn rail cũ và hỏi thẳng: *"phải phân ra từng cụm: cái nào  ║
 * ║ cho món giao diện, cái nào cho nền, cái nào cho nhân vật"*. Mười hai nhãn ║
 * ║ xếp thẳng hàng bắt người ta phải BIẾT TRƯỚC «Bố trí» là hoa văn của món   ║
 * ║ giao diện chứ không phải bố cục của nền — tức là bắt họ nhớ chính cái mà  ║
 * ║ màn này lẽ ra phải bày ra.                                               ║
 * ║                                                                          ║
 * ║ Thứ tự nhóm CỐ Ý trùng thứ tự thẻ ở `/k/:id` (khối «Ngữ cảnh chung», rồi  ║
 * ║ ba loại thẻ trong `BLOCK_MENU` của `PromptCanvasScreen`): người ta đi từ  ║
 * ║ màn soạn sang đây với một cái thẻ trong đầu, và tìm nó ở đúng thứ tự họ   ║
 * ║ vừa thấy. Đổi thứ tự thẻ bên kia thì đổi cả ở đây.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * `RAIL_GROUPS` phải phủ ĐÚNG `MANAGED_ORDER` — không thiếu, không thừa, không
 * trùng: một danh mục rơi khỏi đây là một danh mục KHÔNG CÒN ĐƯỜNG NÀO MỞ RA
 * ngoài việc gõ tay `?kind=`. Có ca test canh (`prompt-library.test.tsx` ①).
 */
const RAIL_GROUPS: ReadonlyArray<{ title: string; kinds: readonly ManagedKind[] }> = [
  { title: "Ngữ cảnh chung", kinds: ["style", "theme"] },
  { title: "Background", kinds: ["scene", "layout"] },
  { title: "Bộ UI", kinds: ["element", "glaze", "decor", "decorPlace"] },
  { title: "Nhân vật", kinds: ["pose", "view", "expression", "outfit"] },
];

/**
 * Vì sao MỘT DÒNG bị khoá xoá — chữ hiện ngay trên dòng, không giấu trong tooltip.
 *
 * Một nút mờ đi mà không nói vì sao là một câu đố. Ba dòng dưới đây là GIÁ TRỊ MẶC
 * ĐỊNH mà mã nguồn gọi tên thẳng; xoá chúng là để lại một mặc định không tra ra dòng
 * nào — pill hiện chữ trần, câu rụng khỏi prompt, không ai được báo.
 */
const LOCK_REASON = "Mục mặc định của hệ thống — sửa được câu, nhưng không xoá được.";

/** Vì sao hai trục dáng/góc máy không thêm dòng mới được. */
const FIXED_REASON: Partial<Record<ManagedKind, string>> = {
  pose: "Mỗi dáng gắn một bảng góc khớp của hình nộm 3D, nên chưa thêm dáng mới ở đây được. Sửa chữ, ẩn bớt và đổi thứ tự thì được.",
  view: "Mỗi góc máy gắn một vị trí máy quay để dựng ảnh mẫu, nên chưa thêm góc mới ở đây được. Sửa chữ, ẩn bớt và đổi thứ tự thì được.",
};

/** Bốn nấc trang trí và hình dạng đều là select — nhãn ngắn, đọc trong một dòng. */
const SHAPE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "pill", label: "Viên thuốc (nút ngang)" },
  { id: "bar", label: "Thanh dài" },
  { id: "rrect", label: "Hộp bo góc" },
  { id: "circle", label: "Tròn" },
  { id: "full", label: "Tràn cả ô" },
];

/**
 * BĂNG LỖI ĐỎ «preset kind must be …» KHÔNG PHẢI LỖI CỦA NGƯỜI DÙNG.
 *
 * ╔══ MỘT THÔNG ĐIỆP ĐÚNG MÀ VÔ DỤNG ════════════════════════════════════════╗
 * ║ Kho đẩy danh mục lên máy bằng `POST /api/library/presets`, và bản agent   ║
 * ║ đời cũ chỉ biết bốn loại danh mục. Gặp loại thứ năm nó trả 400 kèm nguyên ║
 * ║ văn câu tiếng Anh của mình. Ta ĐANG in nguyên văn ấy ra — và phải giữ,    ║
 * ║ vì giấu đi thì người sửa lỗi mất manh mối duy nhất. Nhưng với người dùng  ║
 * ║ thì câu ấy chỉ nói "có gì đó sai", không nói PHẢI LÀM GÌ.                 ║
 * ║                                                                          ║
 * ║ Việc phải làm luôn luôn là một việc: khởi động lại KitGen để agent mới    ║
 * ║ lên thay. Nên nhận ra đúng họ lỗi ấy rồi nối thêm một câu chỉ việc — chứ  ║
 * ║ KHÔNG thay câu gốc bằng nó.                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Nhận diện bằng chính chuỗi agent gửi về, không bằng mã HTTP: 400 còn tới từ
 * nhãn rỗng và vài ca khác, mà những ca đó khởi động lại không chữa được gì.
 */
const OLD_AGENT_HINT = "Agent trên máy đang là bản cũ — khởi động lại KitGen rồi thử lại.";

function isOldAgentError(message: string): boolean {
  return message.toLowerCase().includes("preset kind");
}

/** Khuôn của cột thứ ba — dùng chung cho panel sửa và cho panel rỗng, xem `EmptyEditor`. */
const PANEL = "shrink-0 self-start rounded-3 border border-line-subtle bg-surface p-4 lg:sticky lg:top-6 lg:w-80";

/** Nhãn tạm của một dòng vừa thêm — xem khối chú thích ở `add()`. */
const NEW_LABEL = "Mục mới";

/**
 * Hai giá trị KHÔNG PHẢI ID BỘ của ô chọn «Thuộc bộ».
 *
 * Chúng bắt đầu bằng `__` còn id bộ thì đi qua `slugify` (chỉ chữ thường, số và
 * gạch nối) — nên không có cách nào một bộ thật đụng hàng với chúng.
 */
const NO_SET = "__none";
const NEW_SET = "__new";

/**
 * CHỮ CỦA HAI LOẠI BỘ — một chỗ, vì ô chọn và dòng giải thích phải nói cùng một thứ.
 *
 * Nhãn NGẮN, câu giải thích nói ra HẬU QUẢ TRÊN CÚ BẤM chứ không định nghĩa lại
 * khái niệm: người dùng ở đây đang phân loại một bộ, và thứ họ cần biết là «chọn ở
 * thẻ Bộ UI thì ra mấy ô».
 */
const SET_KIND_COPY: Record<ElementSetKind, { label: string; hint: string }> = {
  composition: {
    label: "Bộ ghép",
    hint: "Các phần chỉ có nghĩa khi đi cùng nhau — chọn ở thẻ Bộ UI là lấy cả cụm. Ví dụ: khung và phần đầy của một thanh máu.",
  },
  variants: {
    label: "Bộ biến thể",
    hint: "Mỗi phần là một trạng thái đứng riêng được — chọn lẻ từng cái, hoặc bấm «Cả bộ» để lấy hết. Ví dụ: nút primary · secondary · pressed.",
  },
};

/** Phần đuôi của một dòng «Món giao diện» khi chưa ai đặt gì — MỘT chỗ, bốn nơi đọc.
 *  `glazeId` là nấc MẶC ĐỊNH của sản phẩm (`GLAZE_SOLID`), không phải một chuỗi gõ
 *  tay: đổi mặc định ở `glaze.ts` là chỗ này đi theo. */
const ELEMENT_ROW_DEFAULTS: NonNullable<ManagedRow["element"]> = { decor: "medium", glazeId: GLAZE_SOLID, sizeId: "" };

/** Dáng nào đã có bảng góc khớp để dựng ảnh mẫu. Xem `pose-presets.ts`. */
const POSED = new Set(POSE_PRESETS.map((preset) => preset.id));

function isManagedKind(value: unknown): value is ManagedKind {
  return typeof value === "string" && (MANAGED_ORDER as readonly string[]).includes(value);
}

/* ══════════════════════════════════════════════════════════════════════════
   MÀN
   ══════════════════════════════════════════════════════════════════════════ */

export function PromptLibraryScreen() {
  const presets = usePresets();
  const syncError = usePresetSyncError();
  const navigate = useNavigate();
  /* `?kind=` là ĐƯỜNG ĐI TỚI của nút «Mở thư viện prompt» trên menu pill: bấm ở ô
     «Khung cảnh» thì mở ra đúng danh mục khung cảnh, không phải một rail 12 mục để
     người dùng tự đi tìm lại thứ mình vừa đứng cạnh. */
  const search = useSearch({ strict: false }) as { kind?: string };
  const kind: ManagedKind = isManagedKind(search.kind) ? search.kind : "style";

  const [query, setQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [askDeleteId, setAskDeleteId] = React.useState<string | null>(null);
  const [askReset, setAskReset] = React.useState(false);
  const dragFrom = React.useRef<number | null>(null);

  const rows = React.useMemo(() => managedRows(presets, kind), [presets, kind]);
  const q = foldVi(query);
  /* TÊN BỘ NẰM TRONG RỔ TÌM, vì từ 09/2026 nhãn của một PHẦN chỉ là tên ngắn của
     riêng nó («fill», «name plate»). Không có tên bộ ở đây thì gõ "dialog" không
     ra ba dòng của bộ Dialog — trong khi đó đúng là chữ người dùng nhớ. */
  const shown = q
    ? rows.filter((row) => foldVi(`${row.vi} ${row.element?.set?.vi ?? ""} ${row.en} ${row.id}`).includes(q))
    : rows;
  const editing = rows.find((row) => row.id === editingId) ?? null;

  /** Đổi danh mục ⇒ dọn sạch mọi trạng thái tạm: lời hỏi xoá của danh mục cũ mà
      còn treo là một cú bấm rơi vào một dòng người dùng không còn nhìn thấy. */
  const pick = (next: ManagedKind) => {
    setEditingId(null);
    setAskDeleteId(null);
    setAskReset(false);
    setQuery("");
    void navigate({ to: "/library/prompts", search: { kind: next } });
  };

  const write = (next: ManagedRow[]) => setManagedRows(kind, next);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [taken] = next.splice(from, 1);
    if (taken) next.splice(to, 0, taken);
    write(next);
  };

  const add = () => {
    const id = nextRowId(kind, NEW_LABEL, rows.map((row) => row.id));
    /**
     * DÒNG MỚI CÓ NHÃN SẴN, KHÔNG PHẢI MỘT DÒNG RỖNG.
     *
     * Đường kia (tạo dòng rỗng rồi chờ người dùng gõ) nghe sạch hơn nhưng va vào
     * một hàng rào có thật ở đầu kia: agent từ chối `name` rỗng bằng 400, mà kho
     * thì ghi theo từng phím — nên cú bấm «Thêm mục» sẽ kéo theo một dải cảnh báo
     * đỏ trước khi người dùng kịp gõ ký tự đầu tiên. Nhãn tạm + con trỏ đặt sẵn ở
     * ô nhãn là đường ngắn nhất mà không nói dối chỗ nào.
     */
    const row: ManagedRow = {
      id, vi: NEW_LABEL, en: "",
      ...(kind === "element" ? { element: { ...ELEMENT_ROW_DEFAULTS } } : {}),
    };
    write([...rows, row]);
    setEditingId(id);
  };

  const duplicate = (row: ManagedRow) => {
    const id = nextRowId(kind, `${row.vi} 2`, rows.map((item) => item.id));
    const copy: ManagedRow = { ...row, id, vi: `${row.vi} (bản sao)` };
    const at = rows.findIndex((item) => item.id === row.id);
    const next = [...rows];
    next.splice(at + 1, 0, copy);
    write(next);
    setEditingId(id);
  };

  const remove = (row: ManagedRow) => {
    write(rows.filter((item) => item.id !== row.id));
    setAskDeleteId(null);
    if (editingId === row.id) setEditingId(null);
  };

  const patch = (id: string, part: Partial<ManagedRow>) =>
    write(rows.map((row) => (row.id === id ? { ...row, ...part } : row)));

  /**
   * CÁC BỘ ĐANG CÓ trong danh mục món — kể cả bộ mới chỉ có MỘT phần.
   *
   * Cố ý KHÔNG dùng `elementSets()` của kho: hàm ấy đọc bundle ĐÃ LƯU, còn ô chọn
   * này phải bày các bộ theo `rows` — bảng đang sửa, chưa ghi. Gắn một dòng vào
   * "bộ vừa đặt tên ở dòng trên" chỉ chạy được nếu nguồn của hai chỗ là một.
   */
  const setOptions = React.useMemo(() => {
    const out: { id: string; vi: string; kind: ElementSetKind; count: number }[] = [];
    const at = new Map<string, number>();
    for (const row of rows) {
      const ref = row.element?.set;
      if (!ref?.id) continue;
      const seen = at.get(ref.id);
      if (seen === undefined) {
        at.set(ref.id, out.length);
        out.push({ id: ref.id, vi: ref.vi || ref.id, kind: ref.kind, count: 1 });
      } else {
        const hit = out[seen];
        if (hit) hit.count += 1;
      }
    }
    return out;
  }, [rows]);

  /** Gắn / gỡ nhãn bộ của MỘT dòng. `undefined` = món lẻ. */
  const putRowInSet = (row: ManagedRow, set: ElementSetRef | undefined): ManagedRow => {
    const { set: _dropped, ...rest } = row.element ?? ELEMENT_ROW_DEFAULTS;
    return { ...row, element: { ...rest, ...(set ? { set } : {}) } };
  };

  const pickSet = (row: ManagedRow, value: string) => {
    if (value === NO_SET) {
      write(rows.map((item) => (item.id === row.id ? putRowInSet(item, undefined) : item)));
      return;
    }
    if (value === NEW_SET) {
      /* Id bộ đi vào `data.set.id` của MỌI phần, nên nó phải an toàn ngay từ lúc
         sinh và không được đụng hàng với một bộ đã có — cùng luật, cùng hàm với id
         của một dòng danh mục (`nextRowId`). */
      const vi = (row.vi || NEW_LABEL).trim();
      const base = slugify(vi) || "bo";
      const taken = setOptions.map((option) => option.id);
      let id = base;
      for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
      /* Bộ mới sinh ra là BỘ GHÉP — mặc định an toàn, xem `ElementSetRef.kind`.
         Ô chọn «Loại bộ» hiện ra ngay bên dưới, nên đổi nó là một cú bấm. */
      write(rows.map((item) => (item.id === row.id ? putRowInSet(item, { id, vi, kind: SET_KIND_DEFAULT }) : item)));
      return;
    }
    /* Gắn vào một bộ ĐÃ CÓ thì mang luôn loại của bộ ấy: loại là thuộc tính của
       BỘ, nên một phần mới không có quyền đem một loại khác vào cùng một nhãn. */
    const hit = setOptions.find((option) => option.id === value);
    write(rows.map((item) => (item.id === row.id
      ? putRowInSet(item, { id: value, vi: hit?.vi ?? value, kind: hit?.kind ?? SET_KIND_DEFAULT })
      : item)));
  };

  /** Đổi tên bộ = ghi lên MỌI phần cùng lúc — xem `ElementSetRef.vi`. */
  const renameSet = (setId: string, vi: string) =>
    write(rows.map((item) => (item.element?.set?.id === setId
      ? putRowInSet(item, { id: setId, vi, kind: item.element?.set?.kind ?? SET_KIND_DEFAULT })
      : item)));

  /**
   * Đổi LOẠI bộ — cũng ghi lên MỌI phần cùng lúc, cùng lý do với `renameSet`.
   *
   * Loại nằm trên từng bản ghi (xem `ElementSetRef`), nên ghi thiếu một phần là để
   * lại một bộ mà hai phần khai hai loại khác nhau — và hộp chọn ở thẻ Bộ UI đọc
   * PHẦN ĐẦU, tức lỗi ấy hiện ra hay không là tuỳ thứ tự dòng.
   */
  const retypeSet = (setId: string, kind: ElementSetKind) =>
    write(rows.map((item) => (item.element?.set?.id === setId
      ? putRowInSet(item, { id: setId, vi: item.element?.set?.vi ?? setId, kind })
      : item)));

  /** Bỏ bộ: gỡ nhãn khỏi mọi phần, các món ở lại danh mục dưới dạng món lẻ. */
  const dissolveSet = (setId: string) =>
    write(rows.map((item) => (item.element?.set?.id === setId ? putRowInSet(item, undefined) : item)));

  return (
    <HomeWorkspaceShell
      active="prompt-library"
      title="Thư viện prompt"
      action={
        <Button
          size="sm"
          disabled={!canAddRow(kind)}
          onClick={add}
        >
          <Plus aria-hidden />
          Thêm mục
        </Button>
      }
    >
      {syncError !== null && (
        <p className="mb-4 flex items-start gap-2 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
          <span>
            Chưa ghi được thay đổi xuống máy: {syncError}. Chữ bạn vừa sửa vẫn còn trên màn.
            {isOldAgentError(syncError) && ` ${OLD_AGENT_HINT}`}
          </span>
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <CategoryRail active={kind} presets={presets} onPick={pick} />

        {/* TRẦN BỀ NGANG CỦA DANH SÁCH, và đây là một sửa lỗi chứ không phải trang trí:
            một dòng chỉ có nhãn + một câu tiếng Anh, nên khi cột giữa được thả rộng hết
            khổ thì nút ⋯ trôi ra tận mép màn còn giữa dòng là một dải trắng — mắt phải
            đi hết bề ngang để nối một cái tên với cái nút của chính nó. */}
        <section aria-label={CATEGORY[kind].label} className="min-w-0 flex-1 lg:max-w-4xl">
          <header className="border-b border-line-subtle pb-3">
            <h2 className="text-label text-fg-strong">{CATEGORY[kind].label}</h2>
            <p className="mt-1 text-caption text-fg-muted">{CATEGORY[kind].blurb}</p>
            {/* «Hiện ở:» chứ không phải một dòng mờ thứ hai: hai câu cùng cỡ cùng màu
                đứng liền nhau thì mắt đọc thành một đoạn, và câu chỉ chỗ — thứ trả lời
                câu hỏi người ta thật sự mang tới đây — chìm mất trong câu định nghĩa. */}
            <p className="mt-1 text-caption text-fg-muted">
              <span className="text-fg">Hiện ở:</span> {CATEGORY[kind].where}
            </p>
            {FIXED_REASON[kind] !== undefined && (
              <p className="mt-2 rounded-2 bg-raised px-3 py-2 text-caption text-fg-muted">{FIXED_REASON[kind]}</p>
            )}
          </header>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
              <Input
                type="search"
                aria-label={`Tìm trong ${CATEGORY[kind].label.toLowerCase()}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm theo nhãn hoặc câu…"
                className="h-9 pl-9"
              />
            </div>
            <span className="text-caption tabular-nums text-fg-muted">{shown.length}/{rows.length} mục</span>
            {/* Khôi phục cũng hai chạm, cùng khuôn với xoá: nó ném đi mọi câu người
                dùng đã viết cho cả danh mục, tức là nặng tay hơn xoá một dòng. */}
            <Button
              type="button"
              variant={askReset ? "danger" : "ghost"}
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (!askReset) { setAskReset(true); return; }
                write(seedRowsOf(kind));
                setAskReset(false);
                setEditingId(null);
              }}
              onBlur={() => setAskReset(false)}
            >
              <RotateCcw aria-hidden />
              {askReset ? `Bỏ hết và về mặc định?` : "Khôi phục mặc định"}
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 rounded-3 border border-dashed border-line-subtle bg-surface/40 px-4 py-10 text-center text-caption text-fg-muted">
              {rows.length === 0 ? "Danh mục này chưa có mục nào." : "Không có mục nào khớp."}
            </p>
          ) : (
            <ul className="mt-2">
              {shown.map((row) => (
                <RowLine
                  key={row.id}
                  kind={kind}
                  row={row}
                  index={rows.indexOf(row)}
                  count={rows.length}
                  active={editingId === row.id}
                  asking={askDeleteId === row.id}
                  dragFrom={dragFrom}
                  onMove={move}
                  onEdit={() => setEditingId(row.id)}
                  onDuplicate={() => duplicate(row)}
                  onAskDelete={() => setAskDeleteId(row.id)}
                  onDisarm={() => setAskDeleteId(null)}
                  onDelete={() => remove(row)}
                  onToggleHidden={() => patch(row.id, { hidden: !row.hidden })}
                />
              ))}
            </ul>
          )}
        </section>

        {editing !== null ? (
          <RowEditor
            kind={kind}
            row={editing}
            setOptions={setOptions}
            onChange={(part) => patch(editing.id, part)}
            onPickSet={(value) => pickSet(editing, value)}
            onRenameSet={(vi) => renameSet(editing.element?.set?.id ?? "", vi)}
            onRetypeSet={(next) => retypeSet(editing.element?.set?.id ?? "", next)}
            onDissolveSet={() => dissolveSet(editing.element?.set?.id ?? "")}
            onDuplicate={() => duplicate(editing)}
            onDelete={() => remove(editing)}
            onClose={() => setEditingId(null)}
          />
        ) : (
          <EmptyEditor kind={kind} />
        )}
      </div>
    </HomeWorkspaceShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   RAIL DANH MỤC
   ══════════════════════════════════════════════════════════════════════════ */

function CategoryRail({
  active, presets, onPick,
}: {
  active: ManagedKind;
  presets: ReturnType<typeof usePresets>;
  onPick: (kind: ManagedKind) => void;
}) {
  return (
    <nav aria-label="Danh mục prompt" className="shrink-0 lg:w-56">
      {RAIL_GROUPS.map((group) => (
        <div key={group.title} className="mb-4 last:mb-0">
          {/* Tiêu đề nhóm là CHỮ, không phải nút: bấm vào «Bộ UI» không mở được gì
              cả — nhóm chỉ có nghĩa qua bốn danh mục dưới nó. Cho nó dáng nút là
              hứa một cú bấm không tồn tại. */}
          <p className="px-3 pb-1 text-caption font-medium uppercase tracking-wide text-fg-muted">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.kinds.map((kind) => {
              const count = managedRows(presets, kind).length;
              return (
                <li key={kind}>
                  <button
                    type="button"
                    onClick={() => onPick(kind)}
                    aria-current={active === kind ? "page" : undefined}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-2 px-3 text-left text-label",
                      "transition-colors duration-fast",
                      active === kind ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
                    )}
                  >
                    <span className="truncate">{CATEGORY[kind].label}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-caption text-fg-muted">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MỘT DÒNG
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Một dòng của danh sách.
 *
 * ╔══ CÂU TIẾNG ANH HIỆN NGAY TRÊN DÒNG, KHÔNG GIẤU SAU NÚT SỬA ═════════════╗
 * ║ Chữ tiếng Anh CHÍNH LÀ thứ đi tới máy vẽ; nhãn Việt chỉ để người ta bấm   ║
 * ║ đúng mục. Giấu nó đi thì màn này thành một bảng danh sách đẹp mà không    ║
 * ║ trả lời được câu hỏi duy nhất người ta mở nó ra để hỏi: *"mục «Ít» đang   ║
 * ║ nói gì với máy vẽ?"*. Nên nó nằm ngay dưới nhãn, một dòng, cắt bớt khi    ║
 * ║ dài — và mở đủ trong panel sửa.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function RowLine({
  kind, row, index, count, active, asking, dragFrom,
  onMove, onEdit, onDuplicate, onAskDelete, onDisarm, onDelete, onToggleHidden,
}: {
  kind: ManagedKind;
  row: ManagedRow;
  index: number;
  count: number;
  active: boolean;
  asking: boolean;
  dragFrom: React.MutableRefObject<number | null>;
  onMove: (from: number, to: number) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onAskDelete: () => void;
  onDisarm: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const [over, setOver] = React.useState(false);
  const deletable = canDeleteRow(kind, row.id);

  return (
    <li
      onDragOver={(event) => {
        if (dragFrom.current === null) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const from = dragFrom.current;
        dragFrom.current = null;
        if (from !== null && from !== index) onMove(from, index);
      }}
      className={cn(
        "group/row flex items-start gap-2 rounded-2 border-b border-line-subtle px-2 py-2 last:border-b-0",
        active ? "bg-raised" : "hover:bg-raised",
        over && "ring-1 ring-accent",
      )}
    >
      {/* Tay nắm: chuột là lối tắt, mũi tên bàn phím là đường chính thức. Cùng luật
          với tay nắm dòng của thẻ Bộ UI (`row-ui.tsx`) — người dùng học một lần. */}
      <button
        type="button"
        draggable
        onDragStart={() => { dragFrom.current = index; }}
        onDragEnd={() => { dragFrom.current = null; }}
        onKeyDown={(event) => {
          const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
          if (delta === 0) return;
          event.preventDefault();
          onMove(index, index + delta);
        }}
        aria-label={`Đổi chỗ ${row.vi || row.id} — mục ${index + 1} trên ${count}. Kéo bằng chuột, hoặc bấm mũi tên lên xuống.`}
        className="mt-0.5 inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-1 text-fg-muted hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-label", row.hidden === true ? "text-fg-muted" : "text-fg-strong")}>
            {row.vi || "(chưa đặt tên)"}
          </span>
          {row.hidden === true && <span className="shrink-0 text-caption text-fg-muted">đang ẩn</span>}
          {kind === "pose" && !POSED.has(row.id) && (
            <span className="shrink-0 text-caption text-fg-muted">chưa có ảnh mẫu</span>
          )}
        </span>
        {/* `font-mono` cho câu tiếng Anh: nó là chữ MÁY ĐỌC, và một khoảng trắng
            thừa hay một dấu phẩy lạc ở đó đổi hẳn tấm ảnh. Chữ đều nét thì mắt
            thấy được những thứ ấy. */}
        <span className="mt-0.5 block truncate font-mono text-caption text-fg-muted">
          {row.en || "(chưa có câu tiếng Anh — mục này không nói gì với máy vẽ)"}
        </span>
        <RowExtra kind={kind} row={row} />
      </button>

      {asking ? (
        <Button type="button" variant="danger" size="sm" onClick={onDelete} onBlur={onDisarm}>
          <Trash2 aria-hidden />
          Xoá {row.vi || row.id}?
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded-1 p-1.5 text-fg-muted hover:bg-raised hover:text-fg-strong"
              aria-label={`Tuỳ chọn ${row.vi || row.id}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil aria-hidden />Sửa</DropdownMenuItem>
            <DropdownMenuItem onSelect={onDuplicate}><Copy aria-hidden />Nhân bản</DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleHidden}>
              {row.hidden === true ? "Hiện lại trong menu" : "Ẩn khỏi menu"}
            </DropdownMenuItem>
            {deletable && (
              <DropdownMenuItem destructive onSelect={onAskDelete}><Trash2 aria-hidden />Xoá</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** Trường phụ hiện ngay trên dòng — chỉ những trục CÓ trường phụ. */
function RowExtra({ kind, row }: { kind: ManagedKind; row: ManagedRow }) {
  if (kind === "theme" && row.en2) {
    return <span className="mt-0.5 block truncate font-mono text-caption text-fg-muted">mặc: {row.en2}</span>;
  }
  if (kind === "glaze" && row.hint) {
    return <span className="mt-0.5 block truncate text-caption text-fg-muted">{row.hint}</span>;
  }
  if (kind === "element" && row.element) {
    const skel = row.element.skel;
    const shape = SHAPE_OPTIONS.find((option) => option.id === skel?.shape)?.label ?? "Hộp bo góc";
    const size = skel?.w !== undefined && skel.h !== undefined ? ` · ${skel.w.toFixed(2)}×${skel.h.toFixed(2)}` : "";
    /* Nhãn bộ đứng ĐẦU dòng phụ: nó là thứ duy nhất trên dòng nói được vì sao món
       này đứng cạnh mấy món kia, và người ta lướt danh sách bằng mép trái. */
    const set = row.element.set?.vi;
    return (
      <span className="mt-0.5 block truncate text-caption text-fg-muted">
        {set ? `Bộ ${set} · ` : ""}{shape}{size}
      </span>
    );
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   CỘT THỨ BA KHI CHƯA CHỌN DÒNG NÀO
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Panel rỗng — CÙNG KHUÔN, CÙNG CHỖ với panel sửa.
 *
 * ╔══ VÌ SAO KHÔNG ĐỂ CỘT THỨ BA BIẾN MẤT ═══════════════════════════════════╗
 * ║ Trước lượt này, chưa chọn dòng nào thì cột sửa KHÔNG được dựng, và người  ║
 * ║ mở màn lần đầu thấy đúng cái mà chủ sản phẩm mô tả là *"UI có vẻ lỗi"*:   ║
 * ║ một rail hẹp, một danh sách trải hết khổ màn, và một khoảng trống không   ║
 * ║ ai giải thích ở bên phải. Không có gì hỏng cả — nhưng màn KHÔNG NÓI THẾ.  ║
 * ║                                                                          ║
 * ║ Đường kia là tự chọn dòng đầu khi mở danh mục. Bỏ, vì nó mở sẵn một ô     ║
 * ║ nhập có `autoFocus` cho một dòng người dùng chưa hề chỉ vào: cú gõ đầu    ║
 * ║ tiên sẽ rơi vào nhãn của mục ấy và ghi đè nó, im lặng.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function EmptyEditor({ kind }: { kind: ManagedKind }) {
  return (
    <aside aria-label="Chưa chọn mục nào" className={PANEL}>
      <h3 className="text-label text-fg-strong">Chọn một mục để sửa</h3>
      <p className="mt-2 text-caption text-fg-muted">
        Bấm một dòng bên trái để mở nhãn tiếng Việt và câu tiếng Anh của nó ra tại đây.
      </p>
      <p className="mt-3 border-t border-line-subtle pt-3 text-caption text-fg-muted">
        <span className="text-fg">Hiện ở:</span> {CATEGORY[kind].where}
      </p>
      <p className="mt-2 text-caption text-fg-muted">
        Kéo tay nắm bên trái mỗi dòng để đổi thứ tự trong menu, hoặc bấm ⋯ để nhân bản và ẩn bớt.
      </p>
    </aside>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PANEL SỬA
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Panel sửa một dòng.
 *
 * ══ KHÔNG CÓ NÚT LƯU, VÀ ĐÓ LÀ MỘT QUYẾT ĐỊNH CŨ ═══════════════════════════
 * Kho ghi theo từng phím rồi gộp lại và hoãn (`FLUSH_DELAY_MS`) — luật đã có từ
 * bản đầu của kho, chú thích đầy đủ ở `presets-store.ts`. Thêm một nút Lưu ở đây
 * là dựng một trạng thái "đã gõ nhưng chưa lưu" mà kho không có chỗ chứa, và là
 * một cách mới để mất chữ (đóng panel = mất). Nút «Xong» chỉ đóng panel.
 */
function RowEditor({
  kind, row, setOptions, onChange, onPickSet, onRenameSet, onRetypeSet, onDissolveSet,
  onDuplicate, onDelete, onClose,
}: {
  kind: ManagedKind;
  row: ManagedRow;
  /** Các bộ đang có — chỉ trục `element` dùng tới. */
  setOptions: readonly { id: string; vi: string; kind: ElementSetKind; count: number }[];
  onChange: (part: Partial<ManagedRow>) => void;
  onPickSet: (value: string) => void;
  onRenameSet: (vi: string) => void;
  onRetypeSet: (kind: ElementSetKind) => void;
  onDissolveSet: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const locked = !canDeleteRow(kind, row.id);
  /**
   * XÁC NHẬN XOÁ HAI CHẠM, KHÔNG HỘP THOẠI — cùng khuôn với thanh phiên bản ảnh.
   *
   * Khoá theo ID chứ không phải một cờ boolean: bấm sang dòng khác giữa chừng thì
   * lời hỏi «Xoá Ít?» phải tự huỷ, chứ không được treo lại rồi ăn cú bấm tiếp theo
   * cho một dòng khác hẳn.
   */
  const [askId, setAskId] = React.useState<string | null>(null);
  const asking = askId === row.id;
  const element = row.element;
  const skel: Skel = element?.skel ?? { shape: "rrect", w: 0.8, h: 0.6 };
  const setSkel = (part: Partial<Skel>) =>
    onChange({ element: { ...(element ?? ELEMENT_ROW_DEFAULTS), skel: { ...skel, ...part } } });
  const setElement = (part: Partial<NonNullable<ManagedRow["element"]>>) =>
    onChange({ element: { ...(element ?? ELEMENT_ROW_DEFAULTS), ...part } });

  return (
    <aside aria-label={`Sửa ${row.vi || "mục mới"}`} className={PANEL}>
      <div className="flex items-center justify-between gap-2 border-b border-line-subtle pb-3">
        <h3 className="truncate text-label text-fg-strong">Sửa mục</h3>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Xong</Button>
      </div>

      <div className="space-y-4 pt-4">
        {/* «NHÃN HIỂN THỊ», không còn «Nhãn tiếng Việt»: danh mục món nay mang thuật
            ngữ tiếng Anh của giới làm game UI (Dialog, Health bar), nên một cái nhãn
            hứa "tiếng Việt" đứng trên một ô chứa chữ "Dialog" là nói sai ngay trên
            màn. Trường bên dưới vẫn tên `vi` — xem `ElementPreset.vi`. */}
        <Field id={`row-vi-${row.id}`} label="Nhãn hiển thị" hint="Chữ hiện trên nút chọn — không đi vào prompt.">
          <Input
            id={`row-vi-${row.id}`}
            value={row.vi}
            autoFocus
            onChange={(event) => onChange({ vi: event.target.value })}
            placeholder="Ví dụ: Màn thưởng"
          />
        </Field>

        <Field
          id={`row-en-${row.id}`}
          label="Câu tiếng Anh gửi máy vẽ"
          hint={`Đây là chữ THẬT SỰ đi vào prompt. ${row.en.length} ký tự.`}
        >
          <Textarea
            id={`row-en-${row.id}`}
            value={row.en}
            rows={4}
            className="font-mono"
            onChange={(event) => onChange({ en: event.target.value })}
            placeholder="a reward screen background"
          />
        </Field>

        {kind === "theme" && (
          <Field
            id={`row-en2-${row.id}`}
            label="Câu trang phục"
            hint="Dùng khi ô Trang phục của nhân vật để trống — «wearing …»."
          >
            <Textarea
              id={`row-en2-${row.id}`}
              value={row.en2 ?? ""}
              rows={3}
              className="font-mono"
              onChange={(event) => onChange({ en2: event.target.value })}
              placeholder="a Christmas outfit with a red santa hat"
            />
          </Field>
        )}

        {kind === "glaze" && (
          <Field id={`row-hint-${row.id}`} label="Dòng gợi ý" hint="Chữ Việt hiện dưới nhãn trong menu — không vào prompt.">
            <Input
              id={`row-hint-${row.id}`}
              value={row.hint ?? ""}
              onChange={(event) => onChange({ hint: event.target.value })}
            />
          </Field>
        )}

        {kind === "element" && (
          <>
            <Field id={`row-shape-${row.id}`} label="Hình dạng" hint="Quyết định khung mà máy cắt sẽ nắn món này về.">
              <Select
                value={String(skel.shape)}
                onValueChange={(value) => setSkel({ shape: value as Skel["shape"] })}
              >
                <SelectTrigger id={`row-shape-${row.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHAPE_OPTIONS.filter((option) => (SKEL_SHAPES as readonly string[]).includes(option.id))
                    .map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id={`row-w-${row.id}`} label="Bề ngang" hint="Phần của ô, từ 0,05 đến 1.">
                <Input
                  id={`row-w-${row.id}`}
                  type="number" min={0.05} max={1} step={0.01}
                  value={skel.w ?? 0.8}
                  onChange={(event) => setSkel({ w: clamp01(event.target.value, 0.8) })}
                />
              </Field>
              <Field id={`row-h-${row.id}`} label="Bề cao" hint="Phần của ô, từ 0,05 đến 1.">
                <Input
                  id={`row-h-${row.id}`}
                  type="number" min={0.05} max={1} step={0.01}
                  value={skel.h ?? 0.6}
                  onChange={(event) => setSkel({ h: clamp01(event.target.value, 0.6) })}
                />
              </Field>
            </div>

            <Field id={`row-size-${row.id}`} label="Cỡ mặc định" hint="Để «Theo hình dạng» thì cỡ đo từ tỉ lệ ở trên.">
              <Select
                value={element?.sizeId ? element.sizeId : "auto"}
                onValueChange={(value) => setElement({ sizeId: value === "auto" ? "" : value })}
              >
                <SelectTrigger id={`row-size-${row.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Theo hình dạng</SelectItem>
                  {SIZE_PRESETS.map((option) => <SelectItem key={option.id} value={option.id}>{option.vi}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {/* ══ BỘ ══════════════════════════════════════════════════════════
                Ở ĐÂY chứ không phải một màn riêng cho bộ: một bộ KHÔNG phải một
                bản ghi — nó là một nhãn mà vài món cùng đeo (xem `ElementSetRef`).
                Dựng một màn riêng cho nó là dựng một kho thứ hai cho một thứ không
                có dữ liệu riêng, và kèm theo là mọi câu hỏi của một kho: bộ rỗng
                thì sao, bộ trỏ vào món đã xoá thì sao. Một ô chọn trên chính món
                thì mọi câu ấy tự tan. */}
            <Field
              id={`row-set-${row.id}`}
              label="Thuộc bộ"
              hint="Món trong một bộ được thêm cùng nhau: chọn bộ ở thẻ Bộ UI là có đủ các phần."
            >
              <Select
                value={element?.set?.id ?? NO_SET}
                onValueChange={(value) => onPickSet(value)}
              >
                <SelectTrigger id={`row-set-${row.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SET}>Không thuộc bộ nào</SelectItem>
                  {setOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.vi} · {option.count} phần
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_SET}>Bộ mới…</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {element?.set && (
              <>
                <Field
                  id={`row-setvi-${row.id}`}
                  label="Tên bộ"
                  hint="Sửa ở đây thì mọi phần của bộ đổi tên theo — không đi vào prompt."
                >
                  <Input
                    id={`row-setvi-${row.id}`}
                    value={element.set.vi}
                    onChange={(event) => onRenameSet(event.target.value)}
                    placeholder="Ví dụ: Health bar"
                  />
                </Field>
                {/* ══ LOẠI BỘ ═══════════════════════════════════════════════════
                    Chủ sản phẩm: *«button phải tách ra chứ… 1 thanh bar thì bắt
                    buộc phải có composition kia, còn button có thể primary
                    không»*. Hai loại bộ hành xử khác nhau ở ĐÚNG MỘT chỗ — cú bấm
                    trong hộp chọn của thẻ Bộ UI — nên ô chọn này đứng ngay cạnh
                    tên bộ, và câu dưới nó nói ra hậu quả ấy chứ không định nghĩa
                    lại khái niệm.
                    Ô CHỌN chứ không phải công tắc: một công tắc «bấm lẻ được»
                    buộc người đọc phải tự suy ra vế còn lại tên là gì, còn hai
                    dòng có tên thì đọc xong là biết mình đang ở đâu trong hai. */}
                <Field
                  id={`row-setkind-${row.id}`}
                  label="Loại bộ"
                  hint={SET_KIND_COPY[element.set.kind].hint}
                >
                  <Select
                    value={element.set.kind}
                    onValueChange={(value) => onRetypeSet(value as ElementSetKind)}
                  >
                    <SelectTrigger id={`row-setkind-${row.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="composition">{SET_KIND_COPY.composition.label}</SelectItem>
                      <SelectItem value="variants">{SET_KIND_COPY.variants.label}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {/* «BỎ BỘ» GỠ NHÃN, KHÔNG XOÁ MÓN — nên nó không phải một nút đỏ và
                    không hỏi hai lần. Xoá cả một bộ nghĩa là xoá vài món mà người
                    dùng có thể chỉ muốn dùng lẻ; nếu họ thật sự muốn mất chúng thì
                    xoá từng món, ở đúng cái nút xoá đã có sẵn ngay dưới. */}
                <Button type="button" variant="secondary" size="sm" onClick={onDissolveSet}>
                  Bỏ bộ, giữ các món
                </Button>
              </>
            )}

            <Field id={`row-decor-${row.id}`} label="Trang trí mặc định" hint="Áp sẵn khi thêm món này vào một tấm.">
              <Select value={element?.decor ?? "medium"} onValueChange={(value) => setElement({ decor: value })}>
                <SelectTrigger id={`row-decor-${row.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <CatalogItems kind="decor" />
                </SelectContent>
              </Select>
            </Field>

            <Field id={`row-glaze-${row.id}`} label="Đục nền mặc định" hint="Áp sẵn khi thêm món này vào một tấm.">
              <Select value={element?.glazeId || GLAZE_SOLID} onValueChange={(value) => setElement({ glazeId: value })}>
                <SelectTrigger id={`row-glaze-${row.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <CatalogItems kind="glaze" />
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <div className="flex items-center justify-between gap-3 rounded-2 bg-raised px-3 py-2">
          <div className="min-w-0">
            <p className="text-label text-fg-strong">Hiện trong menu</p>
            <p className="text-caption text-fg-muted">Tắt thì mục này biến khỏi nút chọn, nhưng câu cũ vẫn đọc ra đúng chữ.</p>
          </div>
          <Switch
            checked={row.hidden !== true}
            onCheckedChange={(on) => onChange({ hidden: !on })}
            aria-label="Hiện mục này trong menu"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
          <Button type="button" variant="secondary" size="sm" onClick={onDuplicate}>
            <Copy aria-hidden />
            Nhân bản
          </Button>
          {!locked && (
            <Button
              type="button"
              variant={asking ? "danger" : "ghost"}
              size="sm"
              onClick={() => {
                if (!asking) { setAskId(row.id); return; }
                setAskId(null);
                onDelete();
              }}
              onBlur={() => setAskId(null)}
            >
              <Trash2 aria-hidden />
              {asking ? `Xoá ${row.vi || row.id}?` : "Xoá"}
            </Button>
          )}
        </div>

        {locked && <p className="text-caption text-fg-muted">{LOCK_REASON}</p>}
        <p className="text-caption text-fg-muted">Mã mục: <span className="font-mono">{row.id}</span> — không đổi được, vì các bản nháp đã lưu đang trỏ vào nó.</p>
      </div>
    </aside>
  );
}

/** Danh sách mục của một danh mục, dùng cho hai ô chọn mặc định của món giao diện. */
function CatalogItems({ kind }: { kind: ManagedKind }) {
  const presets = usePresets();
  return (
    <>
      {managedRows(presets, kind).map((row) => (
        <SelectItem key={row.id} value={row.id}>{row.vi || row.id}</SelectItem>
      ))}
    </>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint !== undefined && <p className="text-caption text-fg-muted">{hint}</p>}
    </div>
  );
}

/** Ô số của tỉ lệ: kẹp về khoảng luật của contract, rác thì giữ giá trị cũ. */
function clamp01(raw: string, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0.05, Math.round(value * 100) / 100));
}
