import * as React from "react";
import { GripVertical, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePresets } from "../lib/presets-store";
import type { ElementPreset, PresetBundle } from "../lib/presets-store";
import { uiCellDoc } from "../lib/doc-templates";
import { moveCell, newCell, type BlockMode, type UiCell, type UiKitBlock } from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { BlockEditor } from "./BlockEditor";
import { OptionPill } from "./pill-ui";

/**
 * UiKitBlockView — block "Bộ UI": một DANH SÁCH DÒNG, mỗi dòng một element.
 *
 * ╔══ KHÔNG VẼ LƯỚI. ĐÂY LÀ QUYẾT ĐỊNH, KHÔNG PHẢI VIỆC CHƯA LÀM ════════════╗
 * ║ Bản trước có một lưới 3×3 với ô đứt nét mô phỏng spritesheet. Bỏ hẳn, vì  ║
 * ║ nó NÓI SAI: engine KitGen tự dựng skeleton và tự xếp ô: người dùng không  ║
 * ║ chọn vị trí, không chọn khổ. Một cái lưới nhìn như bảng thì ai cũng tưởng ║
 * ║ xếp được — và mọi cái ô trống là một lời mời làm một việc mà hệ thống sẽ  ║
 * ║ bỏ qua.                                                                  ║
 * ║ Danh sách dọc thì nói đúng thứ đang có thật: một DÃY element CÓ THỨ TỰ,   ║
 * ║ không có toạ độ.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ BA THỨ ĐÃ ĐỔI SAU KHI CHỦ SẢN PHẨM XEM TẬN MẮT ═════════════════════════
 *  ① KÉO THẢ ĐỔI THỨ TỰ. Thứ tự dòng đi thẳng vào `components[]` của contract
 *    (xem `moveCell` trong `composer-model.ts`), nên nó là dữ liệu chứ không
 *    phải trang trí — và trước đây không có cách nào sửa ngoài xoá rồi thêm lại.
 *  ② MỘT NÚT «+ Element» THAY CHO DÃY CHIP. Dãy chip liệt kê CẢ danh mục ngay
 *    dưới block: với 8 element nó đã tràn hai hàng, với danh mục 42 element
 *    (cỡ `element-lib-v2.json` thật) nó dài hơn cả nội dung thẻ. Danh mục là
 *    thứ để TRA, không phải thứ để trưng.
 *  ③ CÔNG TẮC «Theo template | Tự do» — cùng cơ chế hai chế độ với block Cảnh
 *    nền / Nhân vật. Xem khối chú thích của `UiCell.doc` để biết vì sao trước
 *    đây block này bị bỏ quên một nửa cơ chế, và vì sao editor CHỈ mount ở chế
 *    độ tự do.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Kéo thả / bàn phím — phần dùng chung của mọi dòng
   ══════════════════════════════════════════════════════════════════════════ */

interface RowDragProps {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  /** Dòng đang được kéo (để `dragFrom` sống chung cho cả danh sách). */
  dragFrom: React.MutableRefObject<number | null>;
}

/**
 * Tay nắm kéo.
 *
 * ╔══ CHUỘT LÀ LỐI TẮT, BÀN PHÍM LÀ ĐƯỜNG CHÍNH THỨC ════════════════════════╗
 * ║ HTML5 drag-and-drop KHÔNG có đường bàn phím — `dragstart` chỉ đến từ chuột║
 * ║ (và từ cảm ứng thì cũng không). Một tính năng chỉ chuột mới chạm tới là   ║
 * ║ một tính năng có người dùng không dùng được, mà ở đây "không dùng được"   ║
 * ║ nghĩa là không sắp lại được thứ tự món đồ trên tấm ảnh sẽ vẽ.             ║
 * ║ Nên tay nắm là một `<button>` thật: ↑/↓ đổi chỗ dòng, và `aria-label` nói ║
 * ║ ra cả hai đường. Cùng khuôn với lưới ô của màn Thiết kế                   ║
 * ║ (`features/design/components/CellGrid.tsx`) — nơi bài này đã học một lần. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function DragHandle({ index, count, onMove, dragFrom, label }: RowDragProps & { label: string }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => {
        dragFrom.current = index;
      }}
      onDragEnd={() => {
        dragFrom.current = null;
      }}
      onKeyDown={(event) => {
        const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (delta === 0) return;
        /* Chặn cuộn trang: mũi tên trong một danh sách dài mà vẫn cuộn thì dòng
           đang cầm chạy ra khỏi tầm nhìn ngay lần bấm thứ hai. */
        event.preventDefault();
        onMove(index, index + delta);
      }}
      aria-label={`Đổi chỗ ${label} — dòng ${index + 1} trên ${count}. Kéo bằng chuột, hoặc bấm mũi tên lên xuống.`}
      className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring active:cursor-grabbing group-hover/cell:opacity-100"
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

/** Nút bỏ một dòng — hình dạng chung của hai chế độ. */
function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Bỏ element ${label}`}
      /* Hiện mờ, rõ lên khi trỏ vào dòng hoặc khi chính nút được focus bằng bàn
         phím. `opacity-0` mà thiếu `focus-visible:opacity-100` là một nút bấm
         Tab tới được nhưng không nhìn thấy. */
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover/cell:opacity-100"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}

/** Vỏ chung của một dòng: nó cũng chính là VÙNG THẢ của phép kéo. */
function RowShell({
  index,
  onMove,
  dragFrom,
  children,
}: Omit<RowDragProps, "count"> & { children: React.ReactNode }) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      onDragOver={(event) => {
        /* `preventDefault` là điều kiện BẮT BUỘC để một phần tử nhận `drop` —
           thiếu nó thì con trỏ hiện dấu cấm và không có sự kiện thả nào. */
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
        "group/cell flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2 px-2 py-2 text-body",
        "hover:bg-raised",
        /* Vạch chỉ CHỖ SẼ RƠI. Không có nó thì kéo trên một danh sách dày là
           thả mù — và `count` dòng trông giống hệt nhau. */
        over && "bg-raised ring-1 ring-accent",
      )}
    >
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Dòng ở CHẾ ĐỘ TEMPLATE — React thuần, không editor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Một dòng element — câu mad-lib thu nhỏ.
 *
 * ══ VÌ SAO DÒNG TEMPLATE VẪN LÀ REACT THUẦN ════════════════════════════════
 * Ở khuôn, một dòng cần đúng bốn thứ: tên element (chọn lúc thêm), ba pill, một
 * đoạn ghi chú. Không có chỗ nào để chèn pill GIỮA câu, không có đoạn văn nào.
 * Mount một ProseMirror cho mỗi dòng là trả giá đầy đủ của một editor để lấy về
 * một cái `<input>` — với bộ kit 16 element thì đó là 16 instance trong MỘT
 * block. Ai cần chèn/viết lại thì gạt sang «Tự do», và lúc đó mới trả giá ấy.
 */
function CellRow({
  cell,
  onChange,
  onRemove,
  drag,
}: {
  cell: UiCell;
  onChange: (next: UiCell) => void;
  onRemove: () => void;
  drag: RowDragProps;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const label = element?.vi ?? cell.elementId;

  return (
    <RowShell {...drag}>
      <DragHandle {...drag} label={label} />
      <span className="text-caption text-fg-muted">#{drag.index + 1}</span>
      <span className="font-medium text-fg-strong">{label}</span>
      <span className="text-fg-muted">— phong cách</span>
      <OptionPill compact kind="style" value={cell.styleId} onChange={(styleId) => onChange({ ...cell, styleId })} />
      <span className="text-fg-muted">, viền</span>
      <OptionPill compact kind="decor" value={cell.decor} onChange={(decor) => onChange({ ...cell, decor })} />
      <span className="text-fg-muted">, chất liệu</span>
      <OptionPill
        compact
        kind="material"
        value={cell.materialId}
        onChange={(materialId) => onChange({ ...cell, materialId })}
      />
      <span className="text-fg-muted">,</span>

      {/* Ghi chú: KHÔNG viền, nền trong suốt — nó là phần đuôi của câu. Gạch chân
          chỉ hiện khi focus, đủ để biết đang gõ ở đâu mà không dựng thêm một cái
          hộp giữa dòng văn. `min-w-40 flex-1` để nó ăn hết chỗ còn lại của dòng
          thay vì co lại thành một khe hẹp. */}
      <input
        value={cell.note}
        onChange={(event) => onChange({ ...cell, note: event.target.value })}
        placeholder="ghi chú thêm…"
        aria-label={`Ghi chú cho ${label}`}
        className="min-w-40 flex-1 border-b border-transparent bg-transparent px-0.5 py-0.5 text-body text-fg placeholder:text-fg-muted focus-visible:border-line focus-visible:outline-none"
      />

      <RemoveButton label={label} onRemove={onRemove} />
    </RowShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Dòng ở CHẾ ĐỘ TỰ DO — một TipTap thật cho mỗi dòng
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dòng tự do: tên element đứng ngoài (nó là danh tính), câu chữ nằm trong editor.
 *
 * Dùng lại `BlockEditor` nguyên vẹn thay vì dựng một editor rút gọn: pill bấm
 * được, `/` chèn pill, danh sách extension và luật `editable` phải GIỐNG HỆT
 * block Cảnh nền — nếu không thì "chế độ tự do" ở hai chỗ là hai thứ khác nhau
 * mang chung một cái tên.
 *
 * `resetToken={0}` = KHÔNG BAO GIỜ nạp lại từ ngoài. Ở đây không có thanh công
 * cụ nào sửa `doc` sau lưng editor (khác thẻ Nhân vật với pill [dáng]), nên một
 * tín hiệu nạp lại chỉ là một đường để con trỏ bị nhảy về đầu dòng.
 */
function FreeCellRow({
  cell,
  onChange,
  onRemove,
  drag,
}: {
  cell: UiCell;
  onChange: (next: UiCell) => void;
  onRemove: () => void;
  drag: RowDragProps;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const label = element?.vi ?? cell.elementId;
  /* Dòng chưa có `doc` (vừa được thêm khi thẻ đã ở chế độ tự do) ⇒ dựng câu khởi
     điểm NGAY LÚC RENDER, không đợi một effect: đợi effect là một nhịp editor
     rỗng, và `BlockEditor` nhận `content` đúng MỘT lần lúc dựng. */
  const doc = cell.doc ?? uiCellDoc(cell, presets);

  return (
    <RowShell {...drag}>
      <DragHandle {...drag} label={label} />
      <span className="text-caption text-fg-muted">#{drag.index + 1}</span>
      <span className="shrink-0 font-medium text-fg-strong">{label}</span>
      {/* `min-w-0` để ô soạn co được trong flex — thiếu nó thì một câu dài đẩy cả
          dòng tràn ngang khỏi thẻ. `basis-64` là ĐÁY chứ không phải chiều rộng:
          một câu ngắn vẫn được cả hàng, còn khi phải xuống dòng thì nó xuống ở
          một bề rộng đọc được, không co thành một khe hẹp cạnh nhãn. */}
      <div data-prompt-lab="" className="min-w-0 flex-1 basis-64">
        <BlockEditor
          doc={doc}
          mode="free"
          /* `row`: dòng element là MỘT DÒNG TRONG DANH SÁCH, không phải cả một
             thẻ. Xem khối chú thích `SCALE` ở `BlockEditor.tsx` — để bậc mặc
             định thì gạt công tắc là chữ trong cùng một thẻ nhảy một bậc. */
          scale="row"
          resetToken={0}
          placeholder="Viết mô tả riêng cho món này… (gõ / để chèn pill)"
          onChange={(next) => onChange({ ...cell, doc: next })}
        />
      </div>
      <RemoveButton label={label} onRemove={onRemove} />
    </RowShell>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Bộ chọn element
   ══════════════════════════════════════════════════════════════════════════ */

/** Trần cao của hộp tra danh mục — PHẢI khớp `max-h-96` ở class, xem `dropUp`. */
const PICKER_MAX_PX = 384;
/** Khe giữa nút và hộp — khớp `calc(100%+8px)`. */
const PICKER_GAP_PX = 8;

/** Bỏ dấu tiếng Việt + hạ chữ thường — để gõ "nut bam" tìm ra "Nút bấm". */
function fold(value: string): string {
  /* `\p{Diacritic}` khớp mọi dấu tổ hợp mà `NFD` vừa tách ra khỏi chữ cái.
     Gọi bằng TÊN LỚP KÝ TỰ chứ không dán một dải mã vào regex: dấu tổ hợp là ký
     tự VÔ HÌNH, và một regex nhìn không ra nội dung là một regex không ai sửa nổi. */
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * «+ Element» — một nút, một hộp tra danh mục.
 *
 * ╔══ VÌ SAO GOM NHÓM THEO "ĐÃ CÓ / CHƯA CÓ", KHÔNG PHẢI THEO LOẠI ══════════╗
 * ║ Vì danh mục element của composer (`presets.elements`) KHÔNG có trường     ║
 * ║ loại — nó là danh mục người dùng tự sửa ở trang Preset, chỉ có `vi`/`en`/ ║
 * ║ mức viền/chất liệu. Bịa ra một bảng "nút · bảng · biểu tượng…" ở đây là   ║
 * ║ dựng NGUỒN SỰ THẬT THỨ HAI cho một danh mục mà người dùng sửa được: họ    ║
 * ║ thêm một element mới và nó rơi vào nhóm "khác" mãi mãi, không hiểu vì sao.║
 * ║ Nhóm duy nhất có DỮ LIỆU THẬT đỡ lưng là "element này đã có trong thẻ     ║
 * ║ chưa" — và tình cờ đó cũng là câu người đang thêm cần trả lời nhất.       ║
 * ║ Muốn nhóm theo loại thì việc phải làm là thêm trường loại vào preset, ở   ║
 * ║ trang Preset. Đó là một wave khác, và nó nên là một wave có thật.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function ElementPicker({ used, onPick }: { used: ReadonlySet<string>; onPick: (element: ElementPreset) => void }) {
  const presets = usePresets();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  /**
   * MỞ NGƯỢC LÊN khi phía dưới không đủ chỗ.
   *
   * Đo bằng mắt trên trình duyệt: nút «+ Element» nằm ở ĐÁY thẻ, và thẻ cuối cùng
   * của một dự án nằm gần đáy trang — hộp cao 384px mở xuống thì 267px của nó rơi
   * ra ngoài khung nhìn. Cuộn xuống vẫn thấy, nhưng "vừa bấm xong đã phải cuộn đi
   * tìm cái mình vừa mở" là một cú giật mà người dùng phải chịu ở MỌI lần thêm.
   */
  const [dropUp, setDropUp] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    /* Mở ra là gõ được ngay: hộp này tồn tại để TRA, và bắt người dùng bấm thêm
       một nhát vào ô tìm kiếm là bắt họ làm một việc thừa mỗi lần thêm element. */
    searchRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as globalThis.Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const hits = React.useMemo(() => {
    const needle = fold(query.trim());
    const match = presets.elements.filter(
      (element) => !needle || fold(`${element.vi} ${element.en} ${element.id}`).includes(needle),
    );
    return {
      fresh: match.filter((element) => !used.has(element.id)),
      again: match.filter((element) => used.has(element.id)),
    };
  }, [presets.elements, query, used]);

  const total = hits.fresh.length + hits.again.length;

  return (
    <div ref={boxRef} className="relative inline-block">
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          /* Đo NGAY LÚC BẤM, trên chính cái nút vừa bấm — không đo trong effect
             sau khi hộp đã render: lúc đó hộp đã đẩy chiều cao trang và phép đo
             "còn bao nhiêu chỗ phía dưới" trả lời cho một trang khác. */
          const rect = event.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - rect.bottom;
          setDropUp(below < PICKER_MAX_PX + PICKER_GAP_PX && rect.top > below);
          setOpen((v) => !v);
        }}
      >
        <Plus aria-hidden strokeWidth={1.5} />
        Element
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Thêm món vào bộ kit"
          className={cn(
            "absolute left-0 z-40 flex max-h-96 w-80 flex-col rounded-2 border border-line-subtle bg-overlay p-2 shadow-2",
            dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
          )}
        >
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm trong danh mục…"
              aria-label="Tìm trong danh mục"
              className="pl-8"
            />
          </div>

          <div role="listbox" aria-label="Danh mục món giao diện" className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {total === 0 && (
              <p className="px-2 py-4 text-center text-body text-fg-muted">
                Không có món nào khớp. Thêm mới ở trang «Quản lý preset».
              </p>
            )}
            <PickGroup title="Chưa có trong thẻ" items={hits.fresh} onPick={onPick} />
            {/* Vẫn thêm lại được: một bộ kit có ba cỡ nút là chuyện thường. Nhóm
                này chỉ nói "bạn đã có rồi", không cấm. */}
            <PickGroup title="Đã có trong thẻ" items={hits.again} onPick={onPick} muted />
          </div>
        </div>
      )}
    </div>
  );
}

function PickGroup({
  title,
  items,
  onPick,
  muted,
}: {
  title: string;
  items: readonly ElementPreset[];
  onPick: (element: ElementPreset) => void;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="px-2 pb-1 pt-2 text-caption font-medium uppercase tracking-label text-fg-muted">{title}</p>
      {items.map((element) => (
        <button
          key={element.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(element)}
          className={cn(
            "flex w-full flex-col gap-0.5 rounded-1 px-2 py-1.5 text-left",
            "hover:bg-accent/[var(--kg-tint-a)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          )}
        >
          <span className={cn("text-body", muted ? "text-fg" : "text-fg-strong")}>{element.vi}</span>
          {/* Cụm EN là thứ THẬT SỰ đi tới máy vẽ — cho nhìn thấy trước khi chọn. */}
          <span className="line-clamp-1 text-caption text-fg-muted">{element.en}</span>
        </button>
      ))}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Vỏ + ruột
   ══════════════════════════════════════════════════════════════════════════ */

/** Nhãn chung của block UI kit — vỏ nào bọc nó cũng phải gọi đúng một tên. */
export const UI_KIT_BLOCK_TITLE = "Bộ UI (spritesheet)";

/** Badge đếm ô — dùng chung cho vỏ lab và vỏ của màn thật. */
export function UiKitBlockBadge({ block }: { block: UiKitBlock }) {
  return (
    <span className="rounded-full border border-line-subtle px-2 py-0.5 text-caption text-fg-muted">
      {block.cells.length} element · hệ thống tự xếp lưới
    </span>
  );
}

/**
 * Dòng này đã bị NGƯỜI DÙNG sửa trong chế độ tự do chưa.
 *
 * So JSON với câu khởi điểm dựng LẠI TỪ chính các trường có cấu trúc của ô, chứ
 * không trừ chuỗi như `freeText()` của block có câu chữ. Ở đây so được chính xác
 * vì câu khởi điểm là hàm thuần của ô: cùng ô ⇒ cùng câu. Bên kia phải trừ chuỗi
 * vì template ở đó có ảnh và pill do người dùng chèn thêm, không dựng lại được.
 */
function cellEdited(cell: UiCell, presets: PresetBundle): boolean {
  if (!cell.doc) return false;
  return JSON.stringify(cell.doc) !== JSON.stringify(uiCellDoc(cell, presets));
}

/**
 * RUỘT của block UI kit, không có vỏ.
 *
 * Tách ra cùng lý do với `DocBlockBody` — xem khối chú thích ở `DocBlockView.tsx`.
 */
export function UiKitBlockBody({
  block,
  onChange,
}: {
  block: UiKitBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong PromptComposerScreen. */
  onChange: (updater: (prev: UiKitBlock) => UiKitBlock) => void;
}) {
  const presets = usePresets();
  const [askReset, setAskReset] = React.useState(false);
  /* MỘT ref cho cả danh sách: `dragstart` xảy ra ở dòng này còn `drop` ở dòng
     kia, nên chỗ nhớ "đang kéo dòng nào" phải nằm TRÊN cả hai. */
  const dragFrom = React.useRef<number | null>(null);

  const used = React.useMemo(() => new Set(block.cells.map((cell) => cell.elementId)), [block.cells]);

  const pick = (next: BlockMode) => {
    if (next === block.mode) return;

    if (next === "free") {
      /* 1 → 2: chỉ MỞ KHOÁ, và dựng câu khởi điểm cho dòng nào chưa có. Ô nào đã
         từng viết tự do thì GIỮ NGUYÊN câu cũ — gạt qua gạt lại không được là
         một đường xoá chữ. */
      onChange((prev) => ({
        ...prev,
        mode: "free",
        cells: prev.cells.map((cell) => (cell.doc ? cell : { ...cell, doc: uiCellDoc(cell, presets) })),
      }));
      return;
    }

    /* 2 → 1: quay về khuôn. Câu tự do sẽ bị bỏ, nên phải hỏi — nhưng CHỈ khi có
       gì để mất. Hỏi thừa mỗi lần gạt công tắc là dạy người dùng bấm "Đồng ý"
       mà không đọc, và ngày họ thật sự mất chữ thì lời hỏi ấy đã hết tác dụng. */
    if (block.cells.some((cell) => cellEdited(cell, presets))) {
      setAskReset(true);
      return;
    }
    onChange((prev) => ({ ...prev, mode: "template", cells: prev.cells.map(dropDoc) }));
  };

  const confirmReset = () => {
    onChange((prev) => ({ ...prev, mode: "template", cells: prev.cells.map(dropDoc) }));
    setAskReset(false);
  };

  const move = (from: number, to: number) =>
    onChange((prev) => ({ ...prev, cells: moveCell(prev.cells, from, to) }));

  const Row = block.mode === "free" ? FreeCellRow : CellRow;

  return (
    <>
      <div className="mb-3">
        <ModeToggle mode={block.mode} onPick={pick} />
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">Quay về template sẽ bỏ câu tự do của các dòng.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAskReset(false)}>
              Huỷ
            </Button>
            <Button variant="danger" size="sm" onClick={confirmReset}>
              Quay về template
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {block.cells.map((cell, index) => (
          <Row
            key={cell.id}
            cell={cell}
            drag={{ index, count: block.cells.length, onMove: move, dragFrom }}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, cells: prev.cells.map((c) => (c.id === cell.id ? next : c)) }))
            }
            onRemove={() => onChange((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== cell.id) }))}
          />
        ))}
      </div>

      {block.cells.length === 0 && (
        <p className="px-2 py-2 text-body text-fg-muted">Bấm «+ Element» để thêm món đầu tiên vào bộ kit.</p>
      )}

      {/* Nút nằm DƯỚI danh sách vì element mới nối vào CUỐI: chỗ bấm ngay cạnh
          chỗ nó hiện ra. Kéo lên đầu là việc của tay nắm ⣿ trên từng dòng. */}
      <div className="mt-3 border-t border-line-subtle pt-3">
        <ElementPicker
          used={used}
          onPick={(element) =>
            onChange((prev) => ({ ...prev, cells: [...prev.cells, freshCell(element.id, presets, prev.mode)] }))
          }
        />
      </div>
    </>
  );
}

/** Bỏ câu tự do khỏi một ô — các trường có cấu trúc không hề bị đụng tới. */
function dropDoc(cell: UiCell): UiCell {
  const { doc: _dropped, ...rest } = cell;
  return rest;
}

/** Ô mới. Thêm khi thẻ ĐANG ở chế độ tự do ⇒ có câu ngay, không phải gạt lại công tắc. */
function freshCell(elementId: string, presets: PresetBundle, mode: BlockMode): UiCell {
  const cell = newCell(elementId, presets);
  return mode === "free" ? { ...cell, doc: uiCellDoc(cell, presets) } : cell;
}

/** Ruột + vỏ `BlockCard` — hình dạng mà route lab `/lab/prompt-composer` dùng. */
export function UiKitBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: UiKitBlock;
  onChange: (updater: (prev: UiKitBlock) => UiKitBlock) => void;
  onDelete: () => void;
}) {
  return (
    <BlockCard
      title={UI_KIT_BLOCK_TITLE}
      badge={
        <>
          <UiKitBlockBadge block={block} />
          <ModeBadge mode={block.mode} />
        </>
      }
      onDelete={onDelete}
    >
      <UiKitBlockBody block={block} onChange={onChange} />
    </BlockCard>
  );
}
