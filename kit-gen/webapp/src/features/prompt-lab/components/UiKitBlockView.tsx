import { Plus, X } from "lucide-react";
import { usePresets } from "../lib/presets-store";
import { newCell, type UiCell, type UiKitBlock } from "../lib/composer-model";
import { BlockCard } from "./BlockCard";
import { OptionPill } from "./pill-ui";

/**
 * UiKitBlockView — block "Bộ UI": một DANH SÁCH DÒNG, mỗi dòng một element.
 *
 * ╔══ KHÔNG VẼ LƯỚI. ĐÂY LÀ QUYẾT ĐỊNH, KHÔNG PHẢI VIỆC CHƯA LÀM ════════════╗
 * ║ Bản trước có một lưới 3×3 với ô đứt nét mô phỏng spritesheet. Bỏ hẳn, vì  ║
 * ║ nó NÓI SAI: engine KitGen tự dựng skeleton và tự xếp ô: người dùng không  ║
 * ║ chọn vị trí, không chọn khổ, không kéo thả. Một cái lưới nhìn như bảng    ║
 * ║ thì ai cũng tưởng xếp được — và mọi cái ô trống là một lời mời làm một    ║
 * ║ việc mà hệ thống sẽ bỏ qua.                                              ║
 * ║ Danh sách dọc thì nói đúng thứ đang có thật: một TẬP element, có thứ tự   ║
 * ║ thêm vào, không có toạ độ.                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ MỖI DÒNG LÀ MỘT CÂU, KHÔNG PHẢI MỘT FORM ═══════════════════════════════
 * Cùng ngôn ngữ với block Cảnh nền / Nhân vật: chữ chạy thành câu, chỗ nào chọn
 * được thì là pill, chỗ nào viết tự do thì gõ thẳng vào dòng. Ô ghi chú vì thế
 * KHÔNG có viền hộp — nó phải trông như phần đuôi của câu, không như một field
 * thứ tư trong một cái thẻ.
 *
 * ══ VÌ SAO DÒNG LÀ REACT THUẦN, KHÔNG PHẢI MỘT EDITOR TÍ HON ═══════════════
 * Một dòng cần đúng bốn thứ: tên element (chọn lúc thêm), ba pill, một đoạn ghi
 * chú. Không có chỗ nào để chèn pill GIỮA câu, không có đoạn văn nào. Mount một
 * ProseMirror cho mỗi dòng là trả giá đầy đủ của một editor (schema, plugin,
 * node view, vòng transaction) để lấy về một cái `<input>` — với bộ kit 16
 * element thì đó là 16 instance chỉ trong MỘT block. Ghi chú vẫn gõ tự do được,
 * đúng mức tối thiểu mà chế độ tự do cần ở đây.
 */

/** Một dòng element — câu mad-lib thu nhỏ. */
function CellRow({
  cell,
  index,
  onChange,
  onRemove,
}: {
  cell: UiCell;
  index: number;
  onChange: (next: UiCell) => void;
  onRemove: () => void;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);

  return (
    <div className="group/cell flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2 px-2 py-2 text-body hover:bg-raised">
      <span className="text-caption text-fg-muted">#{index + 1}</span>
      <span className="font-medium text-fg-strong">{element?.vi ?? cell.elementId}</span>
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
        aria-label={`Ghi chú cho ${element?.vi ?? cell.elementId}`}
        className="min-w-40 flex-1 border-b border-transparent bg-transparent px-0.5 py-0.5 text-body text-fg placeholder:text-fg-muted focus-visible:border-line focus-visible:outline-none"
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Bỏ element ${element?.vi ?? cell.elementId}`}
        /* Hiện mờ, rõ lên khi trỏ vào dòng hoặc khi chính nút được focus bằng bàn
           phím. `opacity-0` mà thiếu `focus-visible:opacity-100` là một nút bấm
           Tab tới được nhưng không nhìn thấy. */
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover/cell:opacity-100"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function UiKitBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: UiKitBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong PromptComposerScreen. */
  onChange: (updater: (prev: UiKitBlock) => UiKitBlock) => void;
  onDelete: () => void;
}) {
  const presets = usePresets();

  return (
    <BlockCard
      title="Bộ UI (spritesheet)"
      badge={
        <span className="rounded-full border border-line-subtle px-2 py-0.5 text-caption text-fg-muted">
          {block.cells.length} element · hệ thống tự xếp lưới
        </span>
      }
      onDelete={onDelete}
    >
      <div className="flex flex-col">
        {block.cells.map((cell, index) => (
          <CellRow
            key={cell.id}
            cell={cell}
            index={index}
            onChange={(next) => onChange((prev) => ({ ...prev, cells: prev.cells.map((c) => (c.id === cell.id ? next : c)) }))}
            onRemove={() => onChange((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== cell.id) }))}
          />
        ))}
      </div>

      {block.cells.length === 0 && (
        <p className="px-2 py-2 text-body text-fg-muted">Bấm một nút bên dưới để thêm element vào bộ kit.</p>
      )}

      {/* Danh mục element đọc từ KHO PRESET, không đóng cứng trong code — mỗi đội
          game có bộ element riêng. Sửa ở trang "Quản lý preset". Nút nằm DƯỚI
          danh sách vì element mới nối vào cuối: chỗ bấm ngay cạnh chỗ nó hiện ra. */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line-subtle pt-3">
        {presets.elements.map((element) => (
          <button
            key={element.id}
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, cells: [...prev.cells, newCell(element.id, presets)] }))}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-3 py-1 text-label text-fg-strong transition-colors duration-fast hover:border-line-strong hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Plus aria-hidden className="size-3.5" />
            {element.vi}
          </button>
        ))}
      </div>
    </BlockCard>
  );
}
