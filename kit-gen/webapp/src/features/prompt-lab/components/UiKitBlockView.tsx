import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import type { Skel } from "@/lib/types/contract";
import { ImagePlus, Pencil, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { foldVi } from "@/features/kit-core/lib/element-lib/source";
import {
  addCustomElement, elementLabel, elementPart, elementSetKey, elementSets, elementTitle,
  hasDecorPlacement, usePresets,
} from "../lib/presets-store";
import type { PillImage } from "@/features/prompt-canvas/lib/pill-image";
import type { ElementPreset, ElementSetView, PresetBundle } from "../lib/presets-store";
import {
  MAX_SIZE_PX,
  MIN_SIZE_PX,
  REFERENCE_CELL_PX,
  SIZE_PRESETS,
  SQUARE_CANVAS_PX,
  customSizeValue,
  defaultSizeOf,
  defaultSizePx,
  parseCustomSize,
  stepSizePx,
  sizeLabel,
  sizePx,
} from "../lib/cell-size";
import { pillValuesOf, retitleCellDoc, uiCellDoc } from "../lib/doc-templates";
import {
  moveRow, newCell, sheetBreaks, sheetSplitNote, uiKitSplit,
  type BlockMode, type UiCell, type UiKitBlock,
} from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { SheetMaxPicker } from "./SheetMaxPicker";
import { BlockEditor } from "./BlockEditor";
import {
  DragHandle, NoteField, RemoveButton, RowIndex, RowShell, RowTop, SheetBreak, type RowDragProps,
} from "./row-ui";
import {
  OptionPill,
  PillAxis,
  PillButton,
  PillCaret,
  SOURCE_PICKER_MAX_PX,
  useMenuFlip,
} from "./pill-ui";
import {
  AssetThumb, ManageRow, SourcePicker, TabButton as SourceTabButton, type SourceGroup,
} from "./SourcePicker";
import { useRefThumb } from "./RefImagePill";
import { uploadPillImage } from "@/features/prompt-canvas/lib/pill-image";

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
 *    (xem `moveRow` trong `composer-model.ts`), nên nó là dữ liệu chứ không
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
   Dòng ở CHẾ ĐỘ TEMPLATE — React thuần, không editor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Một dòng element — HAI TẦNG, không còn là một câu mad-lib.
 *
 * ══ VÌ SAO DÒNG TEMPLATE VẪN LÀ REACT THUẦN ════════════════════════════════
 * Ở khuôn, một dòng cần đúng bốn thứ: tên element (chọn lúc thêm), ba pill, một
 * đoạn ghi chú. Không có chỗ nào để chèn pill GIỮA câu, không có đoạn văn nào.
 * Mount một ProseMirror cho mỗi dòng là trả giá đầy đủ của một editor để lấy về
 * một cái `<input>` — với bộ kit 16 element thì đó là 16 instance trong MỘT
 * block. Ai cần chèn/viết lại thì gạt sang «Tự do», và lúc đó mới trả giá ấy.
 *
 * ╔══ CÂU MAD-LIB ĐÃ BỊ BỎ Ở ĐÂY — VÀ ĐÓ LÀ MỘT QUYẾT ĐỊNH ══════════════════╗
 * ║ Dòng này từng đọc như một câu: «#1 [Button] — phong cách [x], đục nền     ║
 * ║ [y], viền [z], cỡ [t], ghi-chú-thêm…». Đẹp trên một dòng ngắn, vỡ trên    ║
 * ║ dòng dài: bốn cụm chữ nối không co được, nên ô ghi chú bị đẩy xuống hàng  ║
 * ║ dưới ở dòng #3/#4 mà vẫn nằm cùng hàng ở dòng #1/#2 — bốn dòng, bốn chiều ║
 * ║ cao, dấu × mỗi dòng một chỗ. Chủ sản phẩm gọi tên đúng triệu chứng ấy.    ║
 * ║ Nay: hàng 1 = danh tính + pill (nhãn trục nằm TRONG pill, xem `PillAxis`),║
 * ║ hàng 2 = ghi chú full-width, LUÔN LUÔN có mặt, LUÔN LUÔN ở dòng riêng.    ║
 * ║ Đổi lại ta mất chất "một câu đọc được" ở chế độ khuôn. Chỗ để đọc thành   ║
 * ║ câu vẫn còn nguyên và còn đúng hơn: gạt sang «Tự do».                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function CellRow({
  cell,
  used,
  onChange,
  onPickSet,
  onRemove,
  drag,
  projectId,
}: {
  cell: UiCell;
  used: ReadonlySet<string>;
  onChange: (next: UiCell) => void;
  /** Bấm một dòng trong hộp chọn — việc này đụng tới CẢ DANH SÁCH, xem `ElementPick`. */
  onPickSet: (pick: ElementPick) => void;
  onRemove: () => void;
  drag: RowDragProps;
  /** Dự án đang mở — ảnh khung của dòng cần nó để tải lên và để đọc thumbnail. */
  projectId?: string | null;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const label = elementLabel(element, cell.elementId);

  return (
    <RowShell {...drag}>
      <RowTop>
        <DragHandle {...drag} label={label} />
        <RowIndex index={drag.index} />
        <ElementNamePill
          element={element}
          label={label}
          used={used}
          onPick={onPickSet}
          projectId={projectId ?? null}
          shape={shapeOf(cell)}
          onShape={(next) => onChange(withShape(cell, next))}
        />
        {/* Thứ tự pill: phong cách → đục nền → trang trí → bố trí → cỡ.
            «Chất liệu» ĐÃ BỊ BỎ HẲN (không ẩn đi, không đổi tên): nó ăn theo prompt
            tổng phong cách — xem khối chú thích đầu `glaze.ts`.
            Nhãn trục đi VÀO pill (`axis`) thay vì làm chữ nối rời — xem `PillAxis`. */}
        <OptionPill compact axis="Phong cách" kind="style" value={cell.styleId} onChange={(styleId) => onChange({ ...cell, styleId })} />
        <OptionPill compact axis="Đục nền" kind="glaze" value={cell.glazeId} onChange={(glazeId) => onChange({ ...cell, glazeId })} />
        <OptionPill compact axis="Trang trí" kind="decor" value={cell.decor} onChange={(decor) => onChange({ ...cell, decor })} />
        {/* PILL «BỐ TRÍ» BIẾN MẤT KHI Ô ĐỂ «Không».
            Ẩn chứ không làm mờ: một pill mờ vẫn chiếm chỗ trong hàng `flex-nowrap`
            này (sáu pill đã là chật) và vẫn mời người ta bấm vào một câu hỏi không
            còn nghĩa. Giá trị đã chọn KHÔNG bị xoá theo — nó nằm yên trong
            `cell.decorPlace` và hiện lại nguyên vẹn khi kéo trang trí lên. */}
        {hasDecorPlacement(cell.decor) && (
          <OptionPill compact axis="Bố trí" kind="decorPlace" value={cell.decorPlace} onChange={(decorPlace) => onChange({ ...cell, decorPlace })} />
        )}
        <SizePill label={label} element={element} value={cell.sizeId} onChange={(sizeId) => onChange({ ...cell, sizeId })} />
        <RemoveButton what={`element ${label}`} onRemove={onRemove} />
      </RowTop>

      <NoteField
        label={label}
        placeholder="Ghi chú thêm cho món này…"
        value={cell.note}
        onChange={(note) => onChange({ ...cell, note })}
      />
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
 * `resetToken` chỉ nhích khi ĐỔI LOẠI ELEMENT — xem `reload` bên dưới. Mọi thay
 * đổi khác đều do chính editor bắn ra, và nạp lại vì chúng là một đường để con
 * trỏ nhảy về đầu dòng sau mỗi ký tự.
 */
function FreeCellRow({
  cell,
  used,
  onChange,
  onPickSet,
  onRemove,
  drag,
  projectId,
}: {
  cell: UiCell;
  used: ReadonlySet<string>;
  onChange: (next: UiCell) => void;
  /** Xem `CellRow` — hai chế độ có CÙNG một hàng 1, nên cùng một cửa đổi bộ. */
  onPickSet: (pick: ElementPick) => void;
  onRemove: () => void;
  drag: RowDragProps;
  /** Xem `CellRow` — hai chế độ có CÙNG một hàng 1, nên cùng một đường ảnh khung. */
  projectId?: string | null;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const label = elementLabel(element, cell.elementId);
  /* Dòng chưa có `doc` (vừa được thêm khi thẻ đã ở chế độ tự do) ⇒ dựng câu khởi
     điểm NGAY LÚC RENDER, không đợi một effect: đợi effect là một nhịp editor
     rỗng, và `BlockEditor` nhận `content` đúng MỘT lần lúc dựng. */
  const doc = cell.doc ?? uiCellDoc(cell, presets);

  /**
   * Tín hiệu NẠP LẠI cho editor, bật lên mỗi lần đổi loại element.
   *
   * ╔══ VÌ SAO `resetToken={0}` KHÔNG CÒN ĐÚNG ════════════════════════════════╗
   * ║ Trước lượt này dòng tự do không có gì sửa `doc` sau lưng editor, nên      ║
   * ║ "không bao giờ nạp lại" là lựa chọn đúng. Pill TÊN ELEMENT làm đúng việc  ║
   * ║ đó: `swapCellElement` vá cụm EN mở đầu ngay trong tài liệu.               ║
   * ║ Bắt được tận tay trên trình duyệt: đổi "Button" → "Health bar" thì nhãn   ║
   * ║ đổi nhưng câu trong editor VẪN là "a primary action button…" — và cú gõ   ║
   * ║ tiếp theo bắn `onUpdate` mang câu cũ ấy, ghi đè bản vừa vá. Tức là đổi    ║
   * ║ loại xong nó tự quay về, mà không một thông báo nào.                      ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Đếm theo `elementId` chứ không theo `doc`: `doc` đổi sau MỌI phím gõ (chính
   * editor bắn ra), lấy nó làm mốc là editor tự nạp lại mình mỗi ký tự.
   */
  const [reload, setReload] = React.useState(0);
  const [seenElement, setSeenElement] = React.useState(cell.elementId);
  if (seenElement !== cell.elementId) {
    setSeenElement(cell.elementId);
    setReload((n) => n + 1);
  }

  return (
    <RowShell {...drag}>
      {/* CÙNG hàng 1 với dòng khuôn — cố ý giống tới từng vị trí. Gạt công tắc
          không được làm dòng nhảy chỗ: tay nắm, số thứ tự, tên món và dấu × phải
          nằm nguyên chỗ cũ, chỉ TẦNG DƯỚI đổi từ ô ghi chú sang ô soạn. */}
      <RowTop>
        <DragHandle {...drag} label={label} />
        <RowIndex index={drag.index} />
        <ElementNamePill
          element={element}
          label={label}
          used={used}
          onPick={onPickSet}
          projectId={projectId ?? null}
          shape={shapeOf(cell)}
          onShape={(next) => onChange(withShape(cell, next))}
        />
        {/* CỠ Ở NGOÀI EDITOR, kể cả ở chế độ tự do — nó không đi vào prompt một chữ
            nào (nó thành `skel.w`/`skel.h`), nên nó không có chỗ trong một câu văn.
            Cùng lý do với pill tên element đứng ngoài: cả hai là DANH TÍNH/HÌNH HỌC
            của dòng, không phải nội dung của câu. */}
        <SizePill label={label} element={element} value={cell.sizeId} onChange={(sizeId) => onChange({ ...cell, sizeId })} />
        <RemoveButton what={`element ${label}`} onRemove={onRemove} />
      </RowTop>

      {/* Ô soạn ăn TRỌN tầng dưới. Trước đây nó chen cùng hàng với pill và mang
          `basis-64` để tự tìm chỗ xuống dòng — nay không phải đàm phán với ai nữa,
          nên `min-w-0` là thứ duy nhất còn cần (cho phép co trong flex-col). */}
      <div data-prompt-lab="" className="min-w-0">
        <BlockEditor
          doc={doc}
          mode="free"
          /* `row`: dòng element là MỘT DÒNG TRONG DANH SÁCH, không phải cả một
             thẻ. Xem khối chú thích `SCALE` ở `BlockEditor.tsx` — để bậc mặc
             định thì gạt công tắc là chữ trong cùng một thẻ nhảy một bậc. */
          scale="row"
          resetToken={reload}
          placeholder="Viết mô tả riêng cho món này… (gõ / để chèn pill)"
          onChange={(next) => onChange(syncCellFromDoc(cell, next))}
        />
      </div>
    </RowShell>
  );
}

/**
 * Câu tự do vừa đổi ⇒ ĐỒNG BỘ NGƯỢC ba trường có cấu trúc của ô.
 *
 * ╔══ VÌ SAO PHẢI CHẢY NGƯỢC, KHÔNG CHỈ XUÔI ════════════════════════════════╗
 * ║ `uiCellDoc` dựng câu TỪ ô, nhưng khi người dùng bấm một pill TRONG câu thì║
 * ║ `updateAttributes` chỉ đổi tài liệu — `styleId`/`decor`/`materialId` đứng ║
 * ║ nguyên giá trị cũ. Hai nguồn cho cùng một sự thật, và cái lệch ấy đẻ ra ba║
 * ║ hỏng thật:                                                               ║
 * ║  ① Quay về «Theo template» là mất trắng lựa chọn vừa bấm — vì lúc đó chỉ  ║
 * ║    còn ba trường, mà ba trường chưa từng nghe tin.                       ║
 * ║  ② Phép cứu hộ pill (`PILL_SLOTS`) lấy giá trị từ ba trường ấy, nên nó    ║
 * ║    khôi phục về giá trị CŨ thay vì giá trị người dùng đang thấy.          ║
 * ║  ③ `cellEdited` tưởng ô "đã bị sửa" chỉ vì đổi một pill, nên hỏi một câu  ║
 * ║    doạ người dùng trong khi chẳng có chữ nào để mất.                      ║
 * ║ Chảy ngược ở đây làm ba trường luôn là bản sao đọc được của câu — và ba   ║
 * ║ hỏng trên biến mất cùng một lúc.                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function syncCellFromDoc(cell: UiCell, doc: JSONContent): UiCell {
  const pills = pillValuesOf(doc);
  return {
    ...cell,
    doc,
    /* Pill bị xoá khỏi câu ⇒ GIỮ giá trị cũ trong trường, không xoá theo. Người
       ta bỏ pill khỏi một câu tiếng Anh tự viết là bỏ CHỮ, không phải tuyên bố
       "ô này không còn chất liệu" — và nếu gạt về template thì ba trường vẫn là
       thứ duy nhất còn lại để dựng lại ô. */
    styleId: pills.style ?? cell.styleId,
    decor: pills.decor ?? cell.decor,
    decorPlace: pills.decorPlace ?? cell.decorPlace,
    glazeId: pills.glaze ?? cell.glazeId,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Pill CỠ SAFE ZONE — preset hoặc tự điền
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Pill CỠ — cùng một hộp «Chọn sẵn · Gõ riêng» với mọi pill khác.
 *
 * ╔══ *"giống như mấy cái kia có mode select với tự điền đó, nhất quán vào"* ═╗
 * ║ Chủ sản phẩm 07/09/2026. Trước lượt này pill cỡ có hộp RIÊNG: bốn nấc     ║
 * ║ trong một danh sách, rồi một khối «Tự điền…» dán ở đáy — tức là đúng cái  ║
 * ║ hình dạng mà `SourcePicker` sinh ra để thay, và đúng cái bệnh nó chữa:    ║
 * ║ đường tự điền nằm dưới thanh cuộn, ai không cuộn xuống thì không biết nó  ║
 * ║ có. Nay cỡ dùng chung khung, chung thanh nấc, chung luật đóng; chỗ khác   ║
 * ║ nhau duy nhất — hai ô số thay cho một ô văn bản — đi qua khe `renderCustom`║
 * ║ (xem `SourcePicker`).                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG có mục «— theo hệ thống —» nữa: cỡ luôn là một con số cụ thể. Thay vào đó
 * mục ĐẦU TIÊN là «Mặc định của <tên loại> · W×H» — cỡ đo từ hình dạng của chính
 * loại element ấy (`defaultSizeOf`). Nó nói ra con số thay vì hứa suông, và nó khác
 * nhau theo từng loại: thanh máu ra hộp rộng-mỏng, khung avatar ra hộp vuông. Vì
 * sao phải thế, xem khối đo thật ở đầu `cell-size.ts`.
 *
 * Ô tự điền nhận số RỜI (w, h) chứ không nhận chuỗi `"160x120"`: người dùng không
 * phải học một cú pháp, và không có gì để gõ sai. Chuỗi ấy là chuyện của chỗ lưu
 * (`customSizeValue`), không phải chuyện của người đang thiết kế.
 */
/** Câu nhắc «con số này là cỡ ĐẦU RA» — xem `drawBox`: hộp vẽ là max-fit của ô. */
const SIZE_PICKER_NOTE = "Cỡ khi xuất ra Figma/PNG";

function SizePill({ label, element, value, onChange }: {
  label: string;
  /** Loại element của dòng; `undefined` khi id không còn trong danh mục. */
  element: ElementPreset | undefined;
  value: string;
  onChange: (next: string) => void;
}) {
  const flip = useMenuFlip(SOURCE_PICKER_MAX_PX);
  const button = React.useRef<HTMLButtonElement>(null);
  /* CỠ MẶC ĐỊNH đứng RIÊNG một nhóm ở đầu, không trộn vào bốn nấc: nó không phải
     nấc thứ năm của một thang, nó là «để loại element tự quyết». Giá trị của nó là
     một chuỗi cỡ thật (`defaultSizeOf`), nên khi dòng đang dùng đúng cỡ ấy thì dấu
     tick tự về đúng chỗ — không cần một trạng thái "đang mặc định" thứ hai. */
  const fallback = defaultSizeOf(element);
  const fallbackPx = defaultSizePx(element);
  /* Cỡ TỰ ĐIỀN đóng vai «chữ tự gõ» của hộp: nó là thứ không có trong danh sách,
     nên nó bật nấc «Gõ riêng» lúc mở và gỡ dấu tick khỏi mọi nấc preset.
     Cỡ MẶC ĐỊNH cũng là một chuỗi `"<w>x<h>"` (`245x85`), nhưng nó CÓ trong danh
     sách — coi nó là chữ tự gõ thì hộp mở ra ở nấc «Gõ riêng» với danh sách trống,
     và người dùng không thấy đường nào quay về mặc định. */
  const typed = value !== fallback && parseCustomSize(value) ? value : "";
  const close = React.useCallback(() => {
    flip.setOpen(false);
    button.current?.focus();
  }, [flip]);

  /* Con số đi vào `en` — chỗ hộp vẫn dùng để hiện "cái máy sẽ đọc". Với cỡ thì
     con số CHÍNH LÀ câu trả lời, và "L · lớn" một mình không nói được nó lớn
     hơn "M" bao nhiêu. */
  const groups: SourceGroup[] = React.useMemo(
    () => ([
      /* Mặc định ĐỨNG RIÊNG một nhóm ở đầu — trừ khi nó trùng khít một nấc, lúc ấy
         nấc kia đã mang nhãn «(mặc định)» và bày thêm mục nữa là hai dòng cùng số. */
      ...(SIZE_PRESETS.some((preset) => preset.id === fallback)
        ? []
        : [{
          options: [{
            value: fallback,
            vi: `Mặc định của ${label}`,
            en: `${fallbackPx.w}×${fallbackPx.h}px`,
          }],
        }]),
      {
        options: SIZE_PRESETS.map((preset) => {
          const px = stepSizePx(preset.long, element?.skel);
          /* Nấc TRÙNG cỡ mặc định ⇒ gộp làm một, không bày hai mục cùng số. */
          return {
            value: preset.id,
            vi: preset.id === fallback ? `${preset.vi} (mặc định)` : preset.vi,
            en: `${px.w}×${px.h}px`,
          };
        }),
      },
    ] as SourceGroup[])
      /* NHÃN PHỤ, ĐẶT MỘT LẦN Ở ĐẦU DANH SÁCH. Từ khi hộp vẽ là max-fit của ô, con
         số ở đây KHÔNG còn là cỡ máy vẽ — nó là cỡ element phải có khi rời khỏi
         app. Không nói ra thì người dùng chọn "S" rồi mở ảnh sheet ra thấy món đồ
         to bằng cả ô và tưởng pill hỏng. Chỉ nhóm ĐẦU mang nhãn: hai nhóm cùng một
         nhãn là đọc hai lần cùng một câu. */
      .map((group, at) => (at === 0 ? { ...group, title: SIZE_PICKER_NOTE } : group)),
    [element?.skel, fallback, fallbackPx.h, fallbackPx.w, label],
  );

  return (
    <span className="relative inline-block min-w-0">
      <PillButton
        ref={button}
        compact
        active={flip.open}
        onClick={flip.toggle}
        aria-haspopup="listbox"
        aria-expanded={flip.open}
        aria-label={`Cỡ của ${label} — ${sizeLabel(value)}`}
        className="max-w-full"
      >
        <PillAxis>Cỡ</PillAxis>
        <span className="truncate">{sizeLabel(value)}</span>
        {/* Cái bút: cùng quy ước với `OptionPill` — "con số này do bạn gõ, không
            phải một nấc có sẵn". */}
        {typed && <Pencil aria-hidden className="size-3.5 shrink-0 opacity-80" />}
        <PillCaret compact />
      </PillButton>

      {flip.open && (
        <SourcePicker
          label={`cỡ của ${label}`}
          groups={groups}
          value={typed ? "" : value}
          custom={typed}
          image={null}
          dropUp={flip.dropUp}
          onClose={close}
          onChoose={(next) => onChange(next)}
          renderCustom={(done) => (
            <SizeCustomPanel
              label={label}
              skel={element?.skel}
              value={value}
              onApply={(next) => {
                onChange(next);
                done();
              }}
            />
          )}
        />
      )}
    </span>
  );
}

/**
 * Ruột nấc «Gõ riêng» của pill cỡ: W × H, đơn vị pixel.
 *
 * Mở ra với cỡ ĐANG DÙNG, kể cả khi cỡ ấy đến từ một nấc preset: người ta mở
 * «Gõ riêng» để CHỈNH từ chỗ đang đứng, không phải để bắt đầu từ trang trắng.
 */
function SizeCustomPanel({ label, skel, value, onApply }: {
  label: string;
  /** Hình dạng của loại element — cần để đọc ra px của một NẤC (`stepSizePx`). */
  skel: Skel | undefined;
  value: string;
  onApply: (next: string) => void;
}) {
  const current = sizePx(value, skel);
  const [w, setW] = React.useState(String(current?.w ?? REFERENCE_CELL_PX));
  const [h, setH] = React.useState(String(current?.h ?? REFERENCE_CELL_PX));

  const apply = () => {
    const next = parseCustomSize(customSizeValue(Number(w) || 0, Number(h) || 0));
    if (!next) return;
    onApply(customSizeValue(next.w, next.h));
  };

  return (
    <span className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <span className="flex items-center gap-1.5">
        <SizeNumber label={`Bề rộng của ${label}`} value={w} onChange={setW} onEnter={apply} />
        <span aria-hidden className="text-caption text-fg-muted">×</span>
        <SizeNumber label={`Bề cao của ${label}`} value={h} onChange={setH} onEnter={apply} />
        {/* «Dùng cỡ này», cùng lối nói với «Dùng chữ này» của nấc gõ riêng —
            một chữ «Đặt» đứng cạnh hai ô số thì đọc như "đặt lại", ngược nghĩa. */}
        <Button variant="secondary" size="sm" onClick={apply}>Dùng cỡ này</Button>
      </span>
      <span className="text-caption text-fg-muted">
        Pixel trên khung {SQUARE_CANVAS_PX}×{SQUARE_CANVAS_PX} · Enter để chốt
      </span>
    </span>
  );
}

/** Một ô số của phần tự điền. Tách ra vì hai ô giống hệt nhau tới từng class. */
function SizeNumber({ label, value, onChange, onEnter }: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onEnter: () => void;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={MIN_SIZE_PX}
      max={MAX_SIZE_PX}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      /* Enter = «Đặt». Một hộp có ô nhập mà phải rê chuột sang nút mới xong là một
         hộp người ta bỏ dở — và bỏ dở ở đây nghĩa là cỡ vừa gõ không được lưu. */
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onEnter();
      }}
      className="w-20"
    />
  );
}

/**
 * Đổi LOẠI element của một dòng — giữ lại mọi thứ người dùng đã chỉnh tay.
 *
 * Đổi `elementId` là đổi thứ SẼ VẼ (`component.vi` + cụm EN gốc của ô, và qua đó
 * cả tên file trong contract). Nhưng mức viền, chất liệu, ghi chú và câu tự do là
 * CÔNG CHỈNH TAY của người dùng — chúng không thuộc về loại element, chúng thuộc
 * về DÒNG này. Nên chúng đi qua nguyên vẹn, và chỉ cụm EN mở đầu của câu tự do
 * được vá lại (xem `retitleCellDoc`).
 *
 * KHÔNG áp `decor`/`materialId` mặc định của element mới đè lên: preset chỉ là
 * GIÁ TRỊ KHỞI ĐIỂM lúc thêm dòng — dùng nó để ghi đè lúc đổi loại là lấy mặc
 * định của danh mục đắp lên lựa chọn của người dùng, đúng cái sai mà `seedOnce`
 * và `addLibraryPreset` vừa phải đi vòng để tránh.
 */
function swapCellElement(cell: UiCell, next: ElementPreset, presets: PresetBundle): UiCell {
  if (next.id === cell.elementId) return cell;
  /* CỠ LÀ NGOẠI LỆ DUY NHẤT của luật "giữ nguyên mọi thứ người dùng đã chỉnh",
     và chỉ khi nó CHƯA bị chỉnh: một huy hiệu 112px đổi thành bảng nền mà vẫn
     112px là một cái bảng bằng cái tem. Nhưng ai đã tự gõ 240×90 thì con số ấy
     là ý của họ, không phải mặc định sót lại — nên chỉ đổi khi cỡ đang dùng
     ĐÚNG BẰNG cỡ mặc định của loại cũ. */
  const prev = presets.elements.find((preset) => preset.id === cell.elementId);
  const size = cell.sizeId === defaultSizeOf(prev) ? defaultSizeOf(next) : cell.sizeId;
  const swapped: UiCell = { ...cell, elementId: next.id, sizeId: size };
  if (!cell.doc) return swapped;
  const prevEn = presets.elements.find((preset) => preset.id === cell.elementId)?.en ?? cell.elementId;
  return { ...swapped, doc: retitleCellDoc(cell.doc, prevEn, next.en) };
}

/**
 * MỘT CÚ BẤM trong hộp chọn — và hai cú bấm khác nhau ở CHỖ NÀY, không ở đâu khác.
 *
 * ╔══ VÌ SAO CẦN THÊM MỘT LÁ CỜ, KHÔNG CHỈ CẦN MẢNG PHẦN ═══════════════════╗
 * ║ Chủ sản phẩm: *«button có thể primary không, không phụ thuộc vào         ║
 * ║ disabled hoặc pressed»*. Bấm «primary» ở hộp của MỘT DÒNG là bảo «dòng   ║
 * ║ này đổi thành primary» — một dòng vào, một dòng ra. Bấm «Cả bộ» là bảo   ║
 * ║ «cho tôi đủ bốn trạng thái» — một dòng vào, bốn dòng ra. Hai câu ấy đều  ║
 * ║ đi kèm một mảng phần, và mảng của câu đầu dài đúng 1 — y hệt mảng của    ║
 * ║ một BỘ GHÉP một phần («Panel»), thứ vẫn phải đi đường chèn cả cụm.       ║
 * ║ Nên độ dài mảng KHÔNG phân biệt được hai câu, và lá cờ này phải có thật. ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */
export interface ElementPick {
  /** Các phần lấy về, ĐÚNG thứ tự chúng nằm trong danh mục. */
  parts: readonly ElementPreset[];
  /**
   * `true` khi người dùng chỉ mặt ĐÚNG MỘT biến thể của một bộ biến thể.
   *
   * Chỉ nhánh «pill trên dòng» đọc nó: ở «+ Element» thì lấy một biến thể và lấy
   * một bộ một phần đều là «nối các phần này vào cuối», nên không có gì để hỏi.
   */
  one: boolean;
}

/**
 * ĐỔI DÒNG k THÀNH ĐÚNG MỘT MÓN — không chèn, không xoá, không đụng dòng nào khác.
 *
 * Đường của một BIẾN THỂ được bấm lẻ. Khác `applySetAtRow` ở đúng hai chỗ, và cả
 * hai đều là hệ quả của cùng một câu «người dùng xin đúng cái này»:
 *  · không có phần nào chèn thêm sau dòng;
 *  · KHÔNG có cửa "đã ở trong bộ này rồi ⇒ thôi": đổi một dòng «primary» sang
 *    «disabled» là một cú bấm có ý định rõ ràng, dù hai món cùng một bộ. Cửa ấy
 *    tồn tại bên `applySetAtRow` để chặn một cú bấm KHÔNG có ý định nào (bấm tên
 *    bộ trên dòng vốn đã thuộc bộ ấy); ở đây thì mọi cú bấm đều nói ra một món.
 */
function swapOneAtRow(
  cells: readonly UiCell[],
  index: number,
  next: ElementPreset,
  presets: PresetBundle,
): UiCell[] {
  const row = cells[index];
  if (!row) return [...cells];
  return [...cells.slice(0, index), swapCellElement(row, next, presets), ...cells.slice(index + 1)];
}

/**
 * CHỌN MỘT BỘ TRÊN DÒNG k — dòng k thành phần ĐẦU, các phần còn lại chèn sau nó.
 *
 * ╔══ VÌ SAO CHÈN, KHÔNG PHẢI NỐI VÀO CUỐI ═════════════════════════════════╗
 * ║ Thứ tự dòng đi thẳng vào `components[]` của contract, và nó là thứ tự ô  ║
 * ║ trên tấm sheet mà người dùng vừa xếp bằng tay. Đẩy hai phần còn lại của  ║
 * ║ «Dialog» xuống tận cuối danh sách nghĩa là cái hộp thoại vừa chọn nằm    ║
 * ║ rải ra ba chỗ khác nhau của tấm — và người dùng phải kéo chúng về, mỗi   ║
 * ║ lần đổi loại một dòng. Chèn ngay sau dòng k thì cả bộ đứng liền một cụm  ║
 * ║ ở ĐÚNG chỗ họ đang nhìn.                                                ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 *
 * ĐANG LÀ MỘT PHẦN CỦA CHÍNH BỘ ẤY ⇒ KHÔNG ĐỔI GÌ. Bấm «Dialog» trên một dòng vốn
 * đã là «Dialog · name plate» là một cú bấm KHÔNG có ý định nào: nếu ta vẫn chạy
 * thì dòng ấy nhảy về «box» (mất phần họ chọn) và hai phần nữa mọc ra bên dưới
 * (trùng với hai dòng đang có). Trả nguyên mảng cũ, kể cả khi dòng ấy là phần thứ
 * ba — «đã ở trong bộ này rồi» là câu trả lời đủ cho cả ba ca.
 *
 * Phần ĐẦU đi qua `swapCellElement` để giữ nguyên công chỉnh tay của dòng (trang
 * trí, đục nền, ghi chú, câu tự do); các phần CHÈN THÊM là dòng mới tinh, mang
 * đúng mặc định của chính phần ấy — y như khi thêm bộ bằng nút «+ Element».
 *
 * ╔══ VÌ SAO CÁC DÒNG CHÈN THÊM ĐƯỢC DỰNG SẴN Ở NƠI GỌI ════════════════════╗
 * ║ Hàm này chạy TRONG một updater của `setState`, nơi React được phép gọi   ║
 * ║ lại nó (StrictMode gọi hai lần). Dựng dòng mới ở trong ấy nghĩa là sinh  ║
 * ║ `id` ở trong ấy — và cái id cuối cùng nằm trong state KHÁC cái id ta vừa ║
 * ║ thấy. Từ 22/09/2026 việc ấy có hậu quả thật: chọn một món có ẢNH KHUNG   ║
 * ║ thì phép chép ảnh chạy bất đồng bộ rồi mới quay về vá đúng dòng ĐÓ — mà  ║
 * ║ nó chỉ tìm được dòng ấy bằng id. Nên id phải sinh MỘT LẦN, ngoài updater.║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */
function applySetAtRow(
  cells: readonly UiCell[],
  index: number,
  parts: readonly ElementPreset[],
  presets: PresetBundle,
  /** Dòng mới cho các phần SAU phần đầu, dựng sẵn ở nơi gọi — xem khối trên. */
  rest: readonly UiCell[],
): UiCell[] {
  const row = cells[index];
  const head = parts[0];
  if (!row || !head) return [...cells];
  const current = presets.elements.find((preset) => preset.id === row.elementId);
  if (elementSetKey(current) === elementSetKey(head)) return [...cells];
  return [
    ...cells.slice(0, index),
    swapCellElement(row, head, presets),
    ...rest,
    ...cells.slice(index + 1),
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   Bộ chọn element
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Trần cao của hộp tra danh mục — PHẢI khớp `max-h-[30rem]` ở class, xem `dropUp`.
 *
 * ╔══ 384 → 480 (18/09/2026), VÀ ĐÓ LÀ MỘT CON SỐ ĐO ĐƯỢC ═══════════════════╗
 * ║ Chủ sản phẩm, nhìn ảnh chụp hộp của pill trên dòng: vùng cuộn quá nhỏ.    ║
 * ║ Trần 384px trừ đi ô tìm ghim trên (~44px), thanh nấc (~36px) và cả khối    ║
 * ║ «TỰ ĐẶT TÊN» ghim dưới (~90px) thì chỗ còn lại cho DANH SÁCH chỉ quãng     ║
 * ║ 200px — bốn dòng, trong một danh mục hàng chục món. 480px đưa con số ấy    ║
 * ║ lên quãng 300px mà vẫn còn 288px lề ở màn 1366×768 (chiều cao hay gặp      ║
 * ║ nhất của laptop công ty), y hệt cách hộp dáng vừa được nâng lên cùng số.   ║
 * ║ GIỮ NGUYÊN 480px sau khi khối «TỰ ĐẶT TÊN» rời xuống thành một NẤC         ║
 * ║ (22/09/2026): ~90px ấy về hết cho vùng cuộn, tức danh sách dài thêm hai    ║
 * ║ dòng nữa — hạ trần xuống là tiêu mất đúng phần vừa lấy lại được.           ║
 * ║ ⚠️ Con số này KHÔNG chỉ là cái nhìn thấy: `shouldDropUp` đo chỗ trống bằng  ║
 * ║ chính nó. Sửa class mà quên sửa đây là hộp tưởng mình thấp hơn thực tế,    ║
 * ║ mở xuống dưới ở một dòng gần đáy màn, rồi bị cắt mất phần chân — mà phần   ║
 * ║ chân chính là lối tắt «Quản lý element…».                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const PICKER_MAX_PX = 480;

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
function useCataloguePopover() {
  /**
   * MỞ NGƯỢC LÊN khi phía dưới không đủ chỗ.
   *
   * Đo bằng mắt trên trình duyệt: nút «+ Element» nằm ở ĐÁY thẻ, và thẻ cuối cùng
   * của một dự án nằm gần đáy trang — hộp cao 384px mở xuống thì 267px của nó rơi
   * ra ngoài khung nhìn. Cuộn xuống vẫn thấy, nhưng "vừa bấm xong đã phải cuộn đi
   * tìm cái mình vừa mở" là một cú giật mà người dùng phải chịu ở MỌI lần thêm.
   *
   * Phép lật ấy nay ở `pill-ui.useMenuFlip` chứ không ở đây: nó không có gì riêng
   * của danh mục element, và mọi menu khác của màn — kể cả «Thêm thẻ» ở cuối
   * trang, nơi thiếu chỗ nhất — đã phải sống thiếu nó suốt vì luật nằm trong file
   * này. Trần cao thì vẫn là số của RIÊNG hộp này (`max-h-96`), nên nó đi bằng
   * tham số.
   */
  const flip = useMenuFlip(PICKER_MAX_PX);
  const { open, setOpen } = flip;
  /* Hộp tra danh mục TỰ đóng lấy, không như `PillMenu` (đã có sẵn hai đường đóng
     bên trong nó): nó là một `role="dialog"` do file này vẽ, và `boxRef` phải bọc
     CẢ NÚT lẫn hộp — bấm lại vào nút mà tính là "bấm ra ngoài" thì menu đóng rồi
     mở lại ngay trong một cú click. */
  const boxRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!open) return;
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
  }, [open, setOpen]);

  return { ...flip, boxRef };
}

/**
 * HỘP TRA DANH MỤC — phần ruột dùng chung của hai chỗ mở nó.
 *
 * Tách ra vì nút «+ Element» và pill TÊN ELEMENT phải là CÙNG MỘT bộ tra: cùng ô
 * tìm không dấu, cùng cách gom nhóm, cùng thứ tự. Hai bản sao của một danh mục là
 * hai chỗ để lệch nhau, và người dùng thì học hai lần cho một việc.
 *
 * ╔══ MỘT DANH SÁCH CHO CẢ HAI HỘP, VÀ HAI LOẠI BỘ ĐỌC KHÁC NHAU ════════════╗
 * ║ Chủ sản phẩm, nhìn hộp của pill trên dòng: *«select cả cụm chứ»*. Bản     ║
 * ║ trước cho nhánh «Đổi loại món» một danh mục PHẲNG (từng phần rời: «Health ║
 * ║ bar · fill», «Dialog · name plate»…) với lý lẽ "một dòng chỉ mang         ║
 * ║ được một món". Lý lẽ ấy đúng về dữ liệu và sai về việc người ta đang làm: ║
 * ║ ai đổi một dòng «Panel» thành «Dialog» thì họ muốn CÁI HỘP THOẠI, tức cả  ║
 * ║ khung lẫn bảng tên lẫn nút tiếp — không phải đúng một mảnh của nó rồi tự  ║
 * ║ đi tìm hai mảnh còn lại trong một danh sách 48 dòng.                      ║
 * ║ Nên với BỘ GHÉP: chọn trên dòng k = dòng k thành phần đầu, các phần còn   ║
 * ║ lại CHÈN ngay sau nó (`applySetAtRow`).                                   ║
 * ║ BỘ BIẾN THỂ thì lượt sau đã tách ra (chủ sản phẩm: *«button có thể        ║
 * ║ primary không»*): bấm một trạng thái trên dòng k = ĐỔI đúng dòng k        ║
 * ║ (`swapOneAtRow`), không chèn thêm dòng nào; bấm «Cả bộ» thì đi đúng       ║
 * ║ đường của bộ ghép.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function ElementCatalogue({
  label,
  dropUp,
  used,
  onPick,
  projectId,
  shape,
  onShape,
}: {
  label: string;
  dropUp: boolean;
  used: ReadonlySet<string>;
  /** Nhận một CÚ BẤM — cả bộ, hay đúng một biến thể; xem `ElementPick`. */
  onPick: (pick: ElementPick) => void;
  /** Dự án đang mở — cần để tải ảnh khung lên và để đọc thumbnail. */
  projectId?: string | null;
  /** Ảnh khung ĐANG dùng của dòng mở hộp này. */
  shape?: CellShape;
  /**
   * Vắng ⇒ KHÔNG có nấc «Đính ảnh khung».
   *
   * ╔══ VÌ SAO NÚT «+ Element» KHÔNG CÓ NẤC NÀY ═══════════════════════════════╗
   * ║ Ảnh khung là ảnh của MỘT MÓN CỤ THỂ, mà ở «+ Element» thì món ấy chưa tồn ║
   * ║ tại — bày cửa đính ảnh ở đó là hỏi «vẽ cái này theo hình nào» trước khi    ║
   * ║ hỏi «cái này là cái gì». Ai muốn một món chưa có trong danh mục thì đi qua ║
   * ║ nấc «Gõ riêng», rồi mở pill tên của chính dòng vừa hiện ra.                ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   * `null` = bỏ tấm ảnh (và bỏ luôn mô tả — xem `CellShape`).
   */
  onShape?: (next: CellShape | null) => void;
}) {
  const presets = usePresets();
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  /* Mở SẴN ở nấc đang hiệu lực, cùng luật với `SourcePicker.live`: dòng đang mang
     một tấm ảnh khung mà hộp mở ra ở danh mục là hộp nói khác cái pill. */
  const [tab, setTab] = React.useState<CatalogueTab>(shape?.ref ? "shape" : "preset");

  React.useEffect(() => {
    /* Mở ra là gõ được ngay: hộp này tồn tại để TRA, và bắt người dùng bấm thêm
       một nhát vào ô tìm kiếm là bắt họ làm một việc thừa mỗi lần thêm element. */
    searchRef.current?.focus();
  }, []);

  const hits = React.useMemo(() => {
    /* `foldVi` DÙNG CHUNG với màn «Thư viện prompt» và với hộp tra của kho element,
       không phải một hàm bỏ dấu thứ hai viết tại chỗ: bản viết tại chỗ trước đây bỏ
       dấu bằng `\p{Diacritic}` nên nó KHÔNG đụng tới «đ» (chữ ấy không phải dấu tổ
       hợp) — gõ "o ruong" không ra một món người dùng đặt tên "Ô rương", trong khi gõ
       đúng câu ấy ở màn quản lý thì ra. Hai hộp tìm kiếm trả lời khác nhau cho cùng
       một chuỗi là thứ người dùng đọc thành "chỗ này hỏng". Danh mục hạt giống nay
       mang thuật ngữ tiếng Anh nên nó không còn chạm vào «đ», nhưng món tự đặt tên
       thì vẫn — và đó mới là chỗ luật này còn phải đứng. */
    const needle = foldVi(query.trim());
    const hit = (element: ElementPreset) =>
      !needle || foldVi(`${element.vi} ${element.en} ${element.id}`).includes(needle);

    /* MỘT BỘ KHỚP KHI NHÃN BỘ khớp, HOẶC bất kỳ phần nào của nó khớp: gõ "health"
       phải ra bộ «Health bar», mà gõ "fill" cũng phải ra chính nó — người dùng nhớ
       cái phần mình cần chứ không nhớ ta xếp nó vào bộ tên gì. */
    const found = elementSets(presets).filter(
      (set) => !needle || foldVi(set.vi).includes(needle) || set.parts.some(hit),
    );
    /* ĐỦ PHẦN TRONG THẺ RỒI THÌ XUỐNG CUỐI, chứ không biến mất: thêm lại vẫn được
       (một bộ kit có ba cỡ nút là chuyện thường), nhưng thứ chưa có phải nằm trong
       tầm mắt trước. Cùng thứ tự mà hai nhóm đời trước bày ra, nay nói bằng chữ
       trên từng dòng thay vì bằng một tiêu đề. */
    const full = (set: ElementSetView) => set.parts.every((part) => used.has(part.id));
    return [...found.filter((set) => !full(set)), ...found.filter(full)];
  }, [presets, query, used]);

  return (
    <div
      role="dialog"
      aria-label={label}
      className={cn(
        "absolute left-0 z-40 flex max-h-[30rem] w-80 flex-col rounded-2 border border-line-subtle bg-overlay p-2 shadow-2",
        dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
      )}
    >
      {/* THANH NẤC — LUÔN có mặt, kể cả ở «+ Element» (hai nấc thay vì ba).
          Trước lượt này nó chỉ hiện khi có đường đính ảnh, nên cùng một hộp mở ở hai
          chỗ lại có hai hình dạng: một chỗ là hộp-có-nấc, chỗ kia là một danh sách
          với một khối lạ dán ở đáy. `shrink-0` giữ nó đứng yên khi ruột cuộn; cùng
          thành phần `TabButton` với `SourcePicker` để hai hộp trên một màn không có
          hai kiểu tô "đang chọn". */}
      <div role="tablist" aria-label={`Cách chọn ${label}`} className="mb-2 flex shrink-0 gap-1 border-b border-line-subtle pb-2">
        <SourceTabButton active={tab === "preset"} live={!shape?.ref} onPick={() => setTab("preset")}>
          Chọn sẵn
        </SourceTabButton>
        {/* «Đính ảnh khung», KHÔNG phải «Đính ảnh»: cùng họ chữ với nấc của
            `SourcePicker`, nhưng tấm ảnh ở đây trả lời một câu khác hẳn — nó nói
            HÌNH DÁNG của một món, không nói phong cách của cả bộ kit. */}
        {onShape && (
          <SourceTabButton active={tab === "shape"} live={Boolean(shape?.ref)} onPick={() => setTab("shape")}>
            Đính ảnh khung
          </SourceTabButton>
        )}
        <SourceTabButton active={tab === "custom"} live={false} onPick={() => setTab("custom")}>
          Gõ riêng
        </SourceTabButton>
      </div>

      {tab === "shape" && onShape && (
        <ShapeRefPanel
          projectId={projectId ?? null}
          shape={shape ?? EMPTY_CELL_SHAPE}
          onApply={onShape}
        />
      )}

      {tab === "custom" && (
        <CustomElementPanel
          query={query}
          onPick={onPick}
        />
      )}

      {tab === "preset" && (
        <>
          {/* `shrink-0` GHIM Ô TÌM ở đỉnh hộp: nó là anh em của lối tắt «Quản lý
              element…» ghim dưới đáy, và một lối đi trôi khỏi tầm mắt sau ba nhịp
              cuộn thì đúng bằng không có nó. Không có cờ này thì flexbox co CẢ HAI
              đầu để nhường chỗ cho danh sách — càng thấy rõ từ khi trần hộp lên 480px. */}
          <div className="relative shrink-0">
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
            {hits.length === 0 && (
              /* TÌM HỤT ⇒ MỘT CÚ BẤM, không phải một câu chỉ đường. Chữ vừa gõ đã là
                 cái tên người ta muốn; bắt họ đọc «đặt tên riêng ở ngay dưới» rồi tự
                 tìm lấy chỗ ấy là bắt họ làm lại một việc vừa làm xong. Nút này nhảy
                 sang nấc «Gõ riêng» với tên điền sẵn — xem `CustomElementPanel`. */
              <div className="px-2 py-4 text-center">
                <p className="text-body text-fg-muted">Không có món nào khớp chữ bạn gõ.</p>
                {query.trim() !== "" && (
                  <span className="mt-2 inline-block">
                    <Button variant="secondary" size="sm" onClick={() => setTab("custom")}>
                      <Pencil aria-hidden strokeWidth={1.5} />
                      Đặt tên “{query.trim()}”
                    </Button>
                  </span>
                )}
              </div>
            )}
            {/* KHÔNG CÓ TIÊU ĐỀ CHIA ĐÔI DANH SÁCH («Bộ»/«Lẻ» của đời trước): thứ tự
                là thứ tự trong danh mục, và hai loại bộ tự nói ra mình là loại nào
                bằng HÌNH DẠNG của chính mục — một dòng, hay một nhóm có tiêu đề. Một
                tiêu đề chia đôi thì hứa một sự phân loại mà người dùng phải học
                trước cú bấm đầu tiên. */}
            <SetPickList sets={hits} used={used} onPick={onPick} />
          </div>

          {/* LỐI TẮT SANG KHO ELEMENT — cùng thành phần, cùng khuôn với chân hộp của
              mọi pill khác (`SourcePicker.ManageRow`). Đây là chỗ cửa «TỰ ĐẶT TÊN»
              từng đứng, và nó thay đúng một việc: người dùng phát hiện danh mục thiếu
              món ĐÚNG LÚC mở hộp này ra, nên đường tới chỗ sửa danh mục phải nằm ngay
              đây. Việc «gõ một cái tên cho nhanh» thì đã có nấc «Gõ riêng». */}
          <ManageRow href={ELEMENT_LIBRARY_HREF} label="element" />
        </>
      )}
    </div>
  );
}

/** Ba cách trả lời câu «dòng này là món gì» — thứ tự này là thứ tự nút, và nó cố định. */
type CatalogueTab = "preset" | "shape" | "custom";

/**
 * ĐƯỜNG TỚI KHO ELEMENT — cùng hình dạng với `manageHref()` ở `pill-ui.tsx`.
 *
 * Gõ thẳng chuỗi chứ không gọi hàm ấy: `element` KHÔNG phải một `PillKind` (nó là
 * một `ManagedKind` — danh mục món giao diện không đứng sau pill chọn-một nào), nên
 * nới kiểu của hàm kia ra chỉ để dùng lại một phép nối chuỗi là mở một cửa cho sáu
 * trục khác lọt vào chỗ chúng không có mục nào.
 */
const ELEMENT_LIBRARY_HREF = "/library/prompts?kind=element";

/* ══════════════════════════════════════════════════════════════════════════
   NẤC «ĐÍNH ẢNH KHUNG» — một tấm ảnh hình dáng + một mô tả BẮT BUỘC
   ══════════════════════════════════════════════════════════════════════════ */

/** Ảnh khung của một dòng, đúng cặp trường mà `UiCell` giữ. */
export interface CellShape {
  /** `refs/shape-N.png` — rỗng nghĩa là chưa đính tấm nào. */
  ref: string;
  /** Mô tả bắt buộc đi kèm; xem `UiCell.shapeNote`. */
  note: string;
}

const EMPTY_CELL_SHAPE: CellShape = { ref: "", note: "" };

const SHAPE_ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Ô đính ảnh khung cho MỘT món.
 *
 * ╔══ VÌ SAO MÔ TẢ LÀ BẮT BUỘC, VÀ VÌ SAO PHẢI NÓI RA LÝ DO ═════════════════╗
 * ║ Một tấm phác nói được HÌNH DÁNG và chỉ hình dáng: máy vẽ thấy ba cạnh, một║
 * ║ cái móc và hai ô tròn — nó không biết mình đang vẽ một tấm biển nhiệm vụ  ║
 * ║ hay một cái khiên, nên nó sẽ ĐOÁN, và đoán sai thì cả lượt vẽ đi luôn.    ║
 * ║ Một nút xám không có lời giải thích thì người dùng đọc thành «hỏng»; nên  ║
 * ║ câu «Ảnh chỉ nói hình dáng, mô tả nói nó là gì» đứng ngay dưới ô gõ, luôn ║
 * ║ hiện, không phải một tooltip phải rê chuột mới thấy.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * TẢI LÊN NGAY LÚC THẢ, chốt thì mới ghi vào dòng: byte phải nằm trên đĩa project
 * trước đã (agent tự đặt tên — luật G1, xem `uploadPillImage`), còn `shapeRef` chỉ
 * được ghi vào ô khi đã có ĐỦ CẶP ảnh + mô tả. Người bỏ dở giữa chừng để lại một
 * tấm mồ côi trong `refs/` chứ không để lại một dòng nửa vời trong bản nháp.
 */
function ShapeRefPanel({
  projectId,
  shape,
  onApply,
}: {
  projectId: string | null;
  shape: CellShape;
  onApply: (next: CellShape | null) => void;
}) {
  const [path, setPath] = React.useState(shape.ref);
  const [note, setNote] = React.useState(shape.note);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [over, setOver] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const thumb = useRefThumb(projectId, path);

  const upload = async (file: File) => {
    if (!projectId) {
      setErr("Chưa mở dự án nào nên chưa có chỗ cất ảnh.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const image = await uploadPillImage(projectId, file, { kind: "shape", hintName: `shape-${file.name}` });
      setPath(image.path);
    } catch (error) {
      /* NÓI RA, không nuốt: hộp này đóng lại sau khi chốt, nên một lỗi im lặng ở
         đây là người dùng bấm «Thêm» hoài mà không hiểu vì sao không có gì xảy ra. */
      setErr(error instanceof Error ? error.message : "Không tải được ảnh lên.");
    } finally {
      setBusy(false);
    }
  };

  const ready = path !== "" && note.trim() !== "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-1">
      {path !== "" && (
        <div className="flex items-center gap-3">
          {thumb ? (
            <img src={thumb} alt="" aria-hidden className="size-16 shrink-0 rounded-1 border border-line-subtle object-contain" />
          ) : (
            <span aria-hidden className="size-16 shrink-0 rounded-1 border border-line-subtle bg-raised" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-caption text-fg-muted" title={path}>
              {path.slice("refs/".length)}
            </span>
            {/* BỎ ẢNH XOÁ CẢ MÔ TẢ, trong một cú bấm: hai trường ấy chỉ có nghĩa khi
                đi cùng nhau, và để lại một dòng mô tả không ảnh là để lại chữ mà
                không cửa nào đọc. */}
            <span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPath("");
                  setNote("");
                  onApply(null);
                }}
              >
                <X aria-hidden strokeWidth={1.5} />
                Bỏ ảnh khung
              </Button>
            </span>
          </div>
        </div>
      )}

      {/* Kéo thả VÀ bấm, cùng lý do với `RefPanel` của `SourcePicker`: kéo thả là
          đường nhanh của người đang mở sẵn ảnh bên cạnh, hộp chọn tệp là đường duy
          nhất của người dùng bàn phím. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cn(
          "flex flex-col items-center gap-1 rounded-2 border border-dashed px-3 py-5 text-center",
          "transition-colors duration-fast ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          over ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line hover:border-line-strong",
        )}
      >
        <ImagePlus aria-hidden className="size-5 text-fg-muted" />
        <span className="text-body text-fg-strong">
          {busy ? "Đang tải ảnh lên…" : path ? "Đổi ảnh khung" : "Thả ảnh khung vào đây, hoặc bấm để chọn tệp"}
        </span>
        <span className="text-caption text-fg-muted">PNG · JPG · WebP</span>
      </button>

      <input
        ref={input}
        type="file"
        accept={SHAPE_ACCEPT}
        className="hidden"
        aria-label="Chọn tệp ảnh khung"
        onChange={(event) => {
          const file = event.target.files?.[0];
          /* Xoá value để chọn LẠI ĐÚNG tấm vừa chọn vẫn bắn `change`. */
          event.target.value = "";
          if (file) void upload(file);
        }}
      />

      {err !== "" && <p className="text-caption text-danger">{err}</p>}

      <div>
        <textarea
          rows={2}
          value={note}
          aria-label="Mô tả món trong ảnh khung"
          placeholder="Món này là gì? Ví dụ «khung nhiệm vụ ba cạnh, có dải ruy băng trên đỉnh»"
          onChange={(event) => setNote(event.target.value)}
          className={cn(
            "w-full resize-none rounded-1 border border-line bg-raised px-2 py-1.5 text-body text-fg-strong",
            "outline-none placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
          )}
        />
        <p className="mt-1 text-caption text-fg-muted">Ảnh chỉ nói hình dáng, mô tả nói nó là gì.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!ready || busy}
          onClick={() => onApply({ ref: path, note: note.trim() })}
        >
          Thêm
        </Button>
        {/* Nói RA điều kiện còn thiếu, đúng cái đang thiếu: một nút xám không lời
            là một nút hỏng trong mắt người bấm. */}
        {!ready && (
          <span className="text-caption text-fg-muted">
            {path === "" ? "Chọn một tấm ảnh trước." : "Viết mô tả rồi mới thêm được."}
          </span>
        )}
      </div>

      {/* ══ CỬA RA CHO TẤM ẢNH DÙNG ĐƯỢC NHIỀU LẦN ═══════════════════════════
          Tấm đính ở đây sống trong `refs/` của ĐÚNG dự án này và chết cùng nó: mở
          dự án thứ hai là phải thả lại đúng tấm ấy. Người dùng không có cách nào
          biết điều đó cho tới lần thứ hai — nên nói ra tại chỗ, kèm đường đi.
          MỘT LINK TRẦN, KHÔNG ĐIỀN SẴN GÌ: điền sẵn nghĩa là đẩy tấm ảnh này lên
          KHO DÙNG CHUNG (một vòng tải lên nữa, vào một nhóm khác) trước khi người
          dùng nói rằng họ muốn thế — và nếu họ đóng tab ấy thì ta để lại một tấm
          mồ côi trong kho mà không ai xin. Kho element ở tab kia có đủ cửa nhận ảnh. */}
      <a
        href={ELEMENT_LIBRARY_HREF}
        target="_blank"
        rel="noreferrer"
        className="text-caption text-fg-muted underline-offset-2 hover:text-fg-strong hover:underline"
      >
        Dùng lại nhiều lần? Lưu vào kho element
      </a>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   NẤC «GÕ RIÊNG» — thêm một element KHÔNG có trong danh mục
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ô đặt tên một món chưa có trong danh mục.
 *
 * ╔══ VÌ SAO CHỦ SẢN PHẨM CẦN CỬA NÀY ═══════════════════════════════════════╗
 * ║ *«Bảng nền,… custom element cũng cho điền custom.»* Danh mục hạt giống có ║
 * ║ tám món; một game thật có "khung nhiệm vụ", "ô rương", "huy chương hạng   ║
 * ║ ba". Không có cửa này thì người dùng phải rời màn soạn, sang trang         ║
 * ║ «Quản lý preset», thêm một dòng, rồi quay lại tìm nó — bốn bước cho một    ║
 * ║ việc mà họ đang nghĩ tới ngay lúc này.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO NÓ THÀNH MỘT NẤC, THÔI DÁN Ở ĐÁY DANH SÁCH (22/09/2026) ════════╗
 * ║ Chủ sản phẩm, nhìn hộp này cạnh hộp của mọi pill khác: *«phần này cũng    ║
 * ║ nên bỏ cái Tự đặt tên… tức là thêm 1 tab gõ riêng như mấy chỗ khác?»*.    ║
 * ║ Khối ghim ở đáy là một CÁCH TRẢ LỜI đứng lẫn trong danh sách CÂU TRẢ LỜI  ║
 * ║ — đúng cái lỗi hạng mục mà `SourcePicker` sinh ra để chữa (xem khối «VÌ   ║
 * ║ SAO PHẢI GOM LẠI» ở đầu file ấy). Nó cũng ăn ~90px của vùng cuộn trên MỌI ║
 * ║ lần mở hộp, kể cả khi người dùng chỉ đang tra danh mục.                   ║
 * ║ Cái mất: cửa này thôi nằm trong tầm mắt lúc danh sách rỗng. Cái bù: nút   ║
 * ║ «Đặt tên “…”» ngay chỗ tìm hụt, nhảy sang đây với tên điền sẵn.           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Món tạo ra vào THẲNG danh mục (`addCustomElement`), nên nó dùng lại được ở thẻ
 * khác và sửa/xoá được ở trang preset — xem chú thích của hàm ấy để biết vì sao
 * không giữ tên riêng trên từng dòng.
 */
function CustomElementPanel({ query, onPick }: {
  /** Chữ đang gõ ở ô tìm của nấc «Chọn sẵn» — điền sẵn làm tên. */
  query: string;
  /** Cùng cửa với mọi dòng của hộp: một món tự đặt tên là một bộ ghép có đúng một phần. */
  onPick: (pick: ElementPick) => void;
}) {
  const [name, setName] = React.useState("");
  /* Chữ đang gõ ở ô tìm kiếm là ứng viên tốt nhất cho cái tên: người ta gõ "rương"
     để TÌM, không thấy, và thứ họ muốn tiếp theo là một món tên "rương". */
  const value = name || query;
  const add = () => {
    const made = addCustomElement(value);
    if (!made) return;
    onPick({ parts: [made], one: false });
    setName("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-1">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
          placeholder="Tên món, ví dụ «Khung nhiệm vụ»"
          aria-label="Tên món tự đặt"
        />
        <Button variant="secondary" size="sm" disabled={!value.trim()} onClick={add}>
          Thêm
        </Button>
      </div>
      {/* NÓI THẲNG chuyện gì xảy ra với chữ tiếng Việt: nó đi NGUYÊN VĂN tới máy vẽ.
          Không dịch hộ — dịch máy một danh từ chuyên ngành là đoán, mà đoán sai thì
          máy vẽ ra một món khác hẳn (xem `addCustomElement`). */}
      <p className="px-1 text-caption text-fg-muted">
        Gõ tiếng Anh thì chữ đó đi thẳng tới máy vẽ; gõ tiếng Việt cũng được, sửa lại sau ở «Quản lý preset».
      </p>
    </div>
  );
}

function ElementPicker({
  used, onPick,
}: {
  used: ReadonlySet<string>;
  onPick: (pick: ElementPick) => void;
}) {
  const pop = useCataloguePopover();

  return (
    <div ref={pop.boxRef as React.RefObject<HTMLDivElement>} className="relative inline-block">
      <Button variant="secondary" size="sm" aria-haspopup="dialog" aria-expanded={pop.open} onClick={pop.toggle}>
        <Plus aria-hidden strokeWidth={1.5} />
        Element
      </Button>

      {/* KHÔNG đóng sau khi chọn: thêm vài món liên tiếp là việc thường, và mỗi
          lần đóng là một lần phải bấm lại rồi gõ lại câu tìm. */}
      {pop.open && (
        <ElementCatalogue label="Thêm món vào bộ kit" dropUp={pop.dropUp} used={used} onPick={onPick} />
      )}
    </div>
  );
}

/**
 * TÊN ELEMENT = MỘT PILL CHỌN ĐƯỢC, không phải một nhãn chết.
 *
 * ╔══ VÌ SAO TÊN PHẢI BẤM ĐƯỢC ══════════════════════════════════════════════╗
 * ║ Trước lượt này, đổi "Panel" thành "Button" chỉ có một đường: xoá dòng     ║
 * ║ rồi thêm dòng mới. Đường ấy làm mất ba thứ người dùng đã chỉnh tay — mức  ║
 * ║ viền, chất liệu, ghi chú — và làm mất luôn VỊ TRÍ của dòng trong danh sách║
 * ║ (dòng mới luôn nối vào cuối), mà vị trí thì đi thẳng vào thứ tự           ║
 * ║ `components[]` của contract. Một thao tác "đổi loại" mà phá bốn thứ khác  ║
 * ║ thì người ta sẽ không dùng nó, họ sẽ dựng lại cả thẻ.                     ║
 * ║ Là pill thì nó cũng nói đúng bản chất: loại element là MỘT LỰA CHỌN trong ║
 * ║ danh mục, y như phong cách hay chất liệu — cùng hình dạng, cùng cách bấm. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ PILL HIỆN TIÊU ĐỀ CỦA MỤC, TÊN PHẦN XUỐNG HẠNG PHỤ ═══════════════════╗
 * ║ Chủ sản phẩm, sau khi bấm «Health bar · 2 phần» trong hộp chọn và thấy    ║
 * ║ pill hiện «Thanh máu · phần đầy»: *«nó lấy tên TIÊU ĐỀ chứ, ai lại lấy    ║
 * ║ tên des để thể hiện select»*. Đúng: pill LÀ cái nút mở hộp ấy, nên chữ    ║
 * ║ chính của nó phải là chữ vừa được bấm — dòng TIÊU ĐỀ của mục («Health     ║
 * ║ bar»), không phải dòng mô tả bên dưới (nơi «frame · fill» nằm).           ║
 * ║ Nhưng hai dòng cùng một bộ vẫn phải phân biệt được với nhau, nên tên phần ║
 * ║ ở lại — MỜ và NHỎ, đúng kiểu chữ của dòng mô tả trong hộp chọn. Hai hạng  ║
 * ║ chữ trong một pill nói đúng hai thứ: «bạn đã chọn bộ này» và «dòng này là ║
 * ║ phần nào của nó».                                                        ║
 * ║ KHÔNG chép nguyên «· 2 phần» của dòng tiêu đề vào đây: con số ấy đếm các  ║
 * ║ phần của BỘ TRONG DANH MỤC, còn dòng này là ĐÚNG MỘT phần — dán nó lên    ║
 * ║ mọi dòng là nói sai về chính dòng đang đứng.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Hai hạng chữ ấy đúng cho CẢ HAI loại bộ, và đó là lý do chúng không phải sửa
 * lại ở lượt tách bộ biến thể: «Button» + «primary» đọc ra đúng một câu người
 * dùng vừa bấm trong hộp — tên bộ ở dòng tiêu đề nhóm, tên trạng thái ở dòng họ
 * chọn. Bộ ghép thì cũng thế, chỉ là cả hai nửa đến từ một cú bấm.
 */
function ElementNamePill({
  element,
  label,
  used,
  onPick,
  projectId,
  shape,
  onShape,
}: {
  /** Món của dòng — nguồn của CẢ tiêu đề lẫn tên phần; `undefined` khi id lạ. */
  element: ElementPreset | undefined;
  /** Chữ ĐẦY ĐỦ một dòng («Dialog · box»), cho `aria-label`: trình đọc màn hình
      nghe một chuỗi liền, không nghe được hai hạng chữ. Cũng là chữ rơi về khi
      `element` không tra ra (id trần). */
  label: string;
  used: ReadonlySet<string>;
  /** Cùng hộp với «+ Element», khác ở chỗ ĐỌC `one` — xem `ElementPick`. */
  onPick: (pick: ElementPick) => void;
  /** Dự án đang mở — cần để tải/đọc ảnh khung. */
  projectId?: string | null;
  /** Ảnh khung của dòng; `ref` rỗng ⇒ dòng chưa đính tấm nào. */
  shape: CellShape;
  onShape: (next: CellShape | null) => void;
}) {
  const pop = useCataloguePopover();
  const title = elementTitle(element, label);
  const part = elementPart(element);
  /* Cùng hook thumbnail với mọi pill ảnh khác (`RefImagePill`): một đường đọc ảnh
     thứ hai là một chỗ nữa để cache và luật huỷ blob URL lệch nhau. */
  const thumb = useRefThumb(projectId ?? null, shape.ref);

  return (
    <span ref={pop.boxRef as React.RefObject<HTMLSpanElement>} className="relative inline-block shrink-0">
      <PillButton
        compact
        active={pop.open}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={
          shape.ref ? `Đổi loại món — đang là ${label}, có ảnh khung` : `Đổi loại món — đang là ${label}`
        }
        onClick={pop.toggle}
      >
        {/* TẤM ẢNH ĐỨNG TRƯỚC TÊN, và chỉ khi có thật: pill là chỗ DUY NHẤT trên
            dòng nói ra "món này đang được vẽ theo một tấm khung". Không có ô giữ
            chỗ cho dòng không ảnh — hàng 1 đã chật với sáu pill, và một ô trống
            16px trên mọi dòng là 16px lấy đi của chữ. */}
        {shape.ref !== "" &&
          (thumb ? (
            <img
              src={thumb}
              alt=""
              aria-hidden
              className="size-4 shrink-0 rounded-1 border border-line-subtle object-cover"
            />
          ) : (
            <span aria-hidden className="size-4 shrink-0 rounded-1 border border-line-subtle bg-raised" />
          ))}
        <span className="font-medium">{title}</span>
        {part !== "" && <span className="text-fg-muted">{part}</span>}
        <PillCaret compact />
      </PillButton>

      {/* ĐÓNG ngay sau khi chọn — ngược với «+ Element». Một dòng chỉ đổi được một
          lần, nên chọn xong là hết việc; để hộp mở lại chỉ mời người dùng bấm nhầm. */}
      {pop.open && (
        <ElementCatalogue
          label="Đổi loại món"
          dropUp={pop.dropUp}
          used={used}
          onPick={(pick) => {
            onPick(pick);
            pop.setOpen(false);
          }}
          projectId={projectId ?? null}
          shape={shape}
          onShape={(next) => {
            onShape(next);
            pop.setOpen(false);
          }}
        />
      )}
    </span>
  );
}

/** Ảnh khung của một dòng, đọc từ hai trường rời của ô. */
function shapeOf(cell: UiCell): CellShape {
  return { ref: cell.shapeRef ?? "", note: cell.shapeNote ?? "" };
}

/**
 * Ghi ảnh khung vào ô — hoặc BỎ nó, và bỏ thì bỏ CẢ HAI trường.
 *
 * Xoá khoá chứ không để chuỗi rỗng: `composerToContract` chỉ khai `shapeRef` khi nó
 * CÓ THẬT, và một `""` sót lại trong bản nháp sẽ khiến `readCell` đọc ra "có ảnh"
 * ở lần mở sau — đúng kiểu hỏng câm mà `refPath()` sinh ra để chặn.
 */
function withShape(cell: UiCell, next: CellShape | null): UiCell {
  const { shapeRef: _ref, shapeNote: _note, ...rest } = cell;
  return next && next.ref ? { ...rest, shapeRef: next.ref, shapeNote: next.note } : rest;
}

/**
 * DANH SÁCH CỦA CẢ HAI HỘP — và nó có HAI kiểu mục, vì có hai loại bộ.
 *
 * ╔══ VÌ SAO MỘT KIỂU MỤC LÀ KHÔNG ĐỦ ══════════════════════════════════════╗
 * ║ Chủ sản phẩm, nhìn dòng «Button · 4 phần»: *«button phải tách ra chứ…   ║
 * ║ 1 thanh bar thì bắt buộc phải có composition kia, còn button có thể     ║
 * ║ primary không, không phụ thuộc vào disabled hoặc pressed»*.             ║
 * ║ · BỘ GHÉP giữ nguyên MỘT dòng: khung thanh máu không có phần đầy là một ║
 * ║   cái vỏ rỗng, nên «lấy lẻ một phần» không phải một câu có nghĩa.       ║
 * ║ · BỘ BIẾN THỂ mở ra thành một NHÓM: dòng tiêu đề (tên bộ, không bấm     ║
 * ║   được) rồi từng trạng thái một dòng bấm được, và một dòng «Cả bộ» cho  ║
 * ║   ai muốn đủ. Bốn ô là bốn chỗ trên tấm và một phần của lượt vẽ — bắt   ║
 * ║   người chỉ cần primary lấy đủ bốn rồi xoá ba là bắt họ trả tiền cho ba ║
 * ║   ô không ai xin.                                                       ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 *
 * Món KHÔNG đeo nhãn bộ vẫn đi chung danh sách này dưới dạng một bộ GHÉP một
 * phần: nó bấm ra đúng một ô như trước, nên nó không cần một kiểu mục thứ ba.
 */
function SetPickList({
  sets,
  used,
  onPick,
}: {
  sets: readonly ElementSetView[];
  /** Ô đã có trong thẻ — đánh dấu theo TỪNG PHẦN, không chỉ theo cả bộ. */
  used: ReadonlySet<string>;
  onPick: (pick: ElementPick) => void;
}) {
  return (
    <>
      {sets.map((set) =>
        /* BỘ BIẾN THỂ CHỈ CÒN MỘT PHẦN ⇒ VẼ NHƯ BỘ GHÉP (người dùng đã xoá bớt ở
           màn quản lý). Một dòng tiêu đề, một trạng thái và một dòng «Cả bộ (1)»
           là ba dòng nói đúng một thứ — ba lần đọc cho một cú bấm. */
        set.kind === "variants" && set.parts.length > 1 ? (
          <VariantGroup key={set.parts[0]!.id} set={set} used={used} onPick={onPick} />
        ) : (
          /* KHOÁ LẤY TỪ PHẦN ĐẦU, không lấy `set.id`: id món là duy nhất trong cả
             danh mục, còn id bộ và id một món lẻ nằm ở hai không gian tên khác
             nhau và có quyền trùng chữ nhau (xem `elementSets`). */
          <SetRow key={set.parts[0]!.id} set={set} used={used} onPick={onPick} />
        ),
      )}
    </>
  );
}

/** MỘT DÒNG CỦA MỘT BỘ GHÉP — bấm là lấy ĐỦ các phần, y như trước lượt này. */
function SetRow({
  set, used, onPick,
}: {
  set: ElementSetView;
  used: ReadonlySet<string>;
  onPick: (pick: ElementPick) => void;
}) {
  const already = set.parts.every((part) => used.has(part.id));
  /* DÒNG PHỤ NÓI RA CÚ BẤM NÀY LẤY VỀ NHỮNG GÌ — với bộ nhiều phần đó là tên các
     phần («box · name plate · next button»). Với bộ MỘT PHẦN mang đúng tên của
     chính nó thì tên phần chỉ là chuỗi vừa đọc ở dòng trên, nên chỗ ấy nhường cho
     DANH TỪ EN — thứ THẬT SỰ đi tới máy vẽ, và ẩn nốt nếu nó cũng trùng nhãn Việt
     (món tự đặt tên).
     ⚠️ EN từng là chỗ hiện CÂU MÔ TẢ ("a floating popover panel with a title
     bar") — thứ chủ sản phẩm chỉ mặt: *"không có thuộc tính nhé"*. Nếu dòng này
     lại dài ra thì nguồn đã sai, sửa ở `ElementPreset.en`. */
  const only = set.parts.length === 1 ? set.parts[0]! : undefined;
  const sub =
    only && only.vi === set.vi
      ? only.en.toLowerCase() === only.vi.toLowerCase() ? "" : only.en
      : set.parts.map((part) => part.vi).join(" · ");

  /* ẢNH KHUNG CỦA BỘ = ảnh của phần ĐẦU TIÊN có ảnh. Với một món lẻ (bộ một phần
     — hình dạng của gần như mọi món người dùng tự thêm) đó chính là ảnh của nó. */
  const shapeAssetId = set.parts.find((part) => part.shapeAssetId)?.shapeAssetId;

  return (
    <PickRow
      already={already}
      sub={sub}
      onClick={() => onPick({ parts: set.parts, one: false })}
      {...(shapeAssetId ? { thumb: <AssetThumb id={shapeAssetId} alt="" /> } : {})}
      label={
        <>
          {set.vi} <span className="text-fg-muted">· {set.parts.length} phần</span>
        </>
      }
    />
  );
}

/**
 * MỘT NHÓM CỦA MỘT BỘ BIẾN THỂ — tiêu đề, từng trạng thái, rồi «Cả bộ».
 *
 * TIÊU ĐỀ KHÔNG BẤM ĐƯỢC, có chủ ý: nếu nó bấm được thì nó và dòng «Cả bộ» là hai
 * cách nói cùng một câu, và người dùng phải đoán xem chúng có khác nhau không.
 * Đọc màn hình vẫn nghe đủ ngữ cảnh vì mỗi trạng thái mang `aria-label` đầy đủ
 * («Button · primary») — một dòng chỉ đọc ra «primary» thì đứng một mình là vô nghĩa.
 *
 * «CẢ BỘ» ĐỨNG CUỐI, sau các trạng thái: người tới đây phần lớn đang tìm MỘT
 * trạng thái (đó là lý do nhóm này tồn tại), nên thứ họ tìm phải nằm ngay dưới
 * tiêu đề chứ không bị một dòng tổng đẩy xuống.
 */
function VariantGroup({
  set, used, onPick,
}: {
  set: ElementSetView;
  used: ReadonlySet<string>;
  onPick: (pick: ElementPick) => void;
}) {
  const already = set.parts.every((part) => used.has(part.id));

  return (
    <div role="group" aria-label={set.vi}>
      <p className="px-2 pb-0.5 pt-2 text-body text-fg-strong">
        {set.vi} <span className="text-caption text-fg-muted">· chọn lẻ từng cái</span>
      </p>
      {set.parts.map((part) => (
        <PickRow
          key={part.id}
          indent
          label={part.vi}
          name={`${set.vi} · ${part.vi}`}
          already={used.has(part.id)}
          {...(part.shapeAssetId ? { thumb: <AssetThumb id={part.shapeAssetId} alt="" /> } : {})}
          onClick={() => onPick({ parts: [part], one: true })}
        />
      ))}
      <PickRow
        indent
        label={<span className="text-fg-muted">Cả bộ ({set.parts.length})</span>}
        name={`${set.vi} · Cả bộ (${set.parts.length})`}
        already={already}
        onClick={() => onPick({ parts: set.parts, one: false })}
      />
    </div>
  );
}

/**
 * MỘT DÒNG BẤM ĐƯỢC của hộp — cùng hình dạng cho cả ba kiểu mục.
 *
 * `name` có mặt cho những dòng mà chữ hiện ra KHÔNG đủ để nhận ra chúng: «primary»
 * lặp ở vài bộ, «empty» lặp ở ba bộ. Chữ trên màn ngắn được vì tiêu đề nhóm đứng
 * ngay trên; trình đọc màn hình thì nghe từng dòng rời nhau, nên nó cần cả tên bộ.
 */
function PickRow({
  label, sub, name, already, indent, thumb, onClick,
}: {
  label: React.ReactNode;
  sub?: string;
  name?: string;
  already: boolean;
  indent?: boolean;
  /**
   * Ô ảnh 32px đứng TRƯỚC chữ — chỉ những món CÓ ảnh khung trong kho mới có.
   *
   * KHÔNG chừa ô giữ chỗ cho dòng không ảnh, ngược với ô 72px của hộp dáng: ở đây
   * ảnh là NGOẠI LỆ (đa số món chỉ có tên), nên một ô trống 32px trên mọi dòng là
   * 32px lấy đi của chữ ở cả một danh mục bốn mươi tám món để phục vụ vài dòng.
   * Cùng lý lẽ với pill trên dòng, xem `ElementNamePill`.
   */
  thumb?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      {...(name !== undefined ? { "aria-label": name } : {})}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-1 py-1.5 pr-2 text-left",
        indent === true ? "pl-5" : "pl-2",
        "hover:bg-accent/[var(--kg-tint-a)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      )}
    >
      {thumb}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-body", already ? "text-fg" : "text-fg-strong")}>
          {label}
          {/* Vẫn thêm lại được: một bộ kit có ba cỡ nút là chuyện thường. Chữ này
              chỉ nói "bạn đã có rồi", không cấm. */}
          {already && <span className="text-caption text-fg-muted"> · đã có trong thẻ</span>}
        </span>
        {sub !== undefined && sub !== "" && <span className="line-clamp-1 text-caption text-fg-muted">{sub}</span>}
      </span>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Vỏ + ruột
   ══════════════════════════════════════════════════════════════════════════ */

/** Nhãn chung của block UI kit — vỏ nào bọc nó cũng phải gọi đúng một tên. */
export const UI_KIT_BLOCK_TITLE = "Bộ UI (spritesheet)";

/**
 * Badge đếm ô + nấc «tối đa mỗi tấm» — dùng chung cho vỏ lab và vỏ của màn thật.
 *
 * ╔══ DÒNG NÀY KHÔNG CÒN NÓI «hệ thống tự xếp lưới» ═════════════════════════╗
 * ║ Câu cũ đúng về CƠ CHẾ (người dùng không xếp ô bằng tay) nhưng nó trả lời  ║
 * ║ một câu hỏi không ai hỏi. Câu người ta hỏi là «sáu món này ra mấy tấm, và ║
 * ║ món cuối nằm ở đâu» — và từ lượt này câu trả lời ấy ĐỔI ĐƯỢC ngay cạnh,   ║
 * ║ nên nó phải hiện ra thành số: «6 element · 2 tấm (4 + 2)».                 ║
 * ║ Phép chia lấy từ `uiKitSplit` — CÙNG hàm mà bộ dịch contract gọi, không   ║
 * ║ phải một phép chia thứ hai đọc cùng một cài đặt.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * `onChange` vắng ⇒ chỉ còn dòng đếm, không có chỗ bấm: vỏ nào không sửa được
 * thẻ thì không được bày ra một control bấm vào không có gì xảy ra.
 */
export function UiKitBlockBadge({
  block,
  onChange,
}: {
  block: UiKitBlock;
  onChange?: (updater: (prev: UiKitBlock) => UiKitBlock) => void;
}) {
  const presets = usePresets();
  const sizes = uiKitSplit(block, presets).map((chunk) => chunk.length);
  return (
    <>
      <span className="rounded-full border border-line-subtle px-2 py-0.5 text-caption text-fg-muted">
        {block.cells.length} element · {sheetSplitNote(sizes)}
      </span>
      {onChange && (
        <SheetMaxPicker
          value={block.maxPerSheet}
          onPick={(next) => onChange((prev) => ({ ...prev, maxPerSheet: next }))}
        />
      )}
    </>
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
  onRedrawSheet,
  redrawBusy = false,
  projectId,
  copyShapeAsset,
}: {
  block: UiKitBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong PromptComposerScreen. */
  onChange: (updater: (prev: UiKitBlock) => UiKitBlock) => void;
  /**
   * VẼ LẠI RIÊNG MỘT TẤM (chỉ số đếm từ 0, đúng thứ tự tấm của phép chia).
   *
   * Vắng ở vỏ lab — nơi ấy không có đường nào tiêu lượt tạo, nên bày một nút vẽ
   * ở đó là một nút bấm vào không có gì xảy ra. Vỏ `/k/:id` thì truyền vào.
   */
  onRedrawSheet?: (sheetIndex: number) => void;
  redrawBusy?: boolean;
  /**
   * Dự án đang mở — CHỈ để đính/đọc ảnh khung của từng dòng.
   *
   * Vắng ở vỏ lab (nơi không có project nào trên đĩa) ⇒ nấc «Đính ảnh khung» vẫn
   * bày ra nhưng báo thẳng "chưa mở dự án nào" khi thả ảnh, thay vì im lặng nuốt
   * tấm ảnh người dùng vừa kéo vào.
   */
  projectId?: string | null;
  /**
   * CHÉP ẢNH KHUNG CỦA MỘT MÓN từ kho dùng chung sang `refs/` của dự án.
   *
   * ╔══ VÌ SAO NÓ ĐI BẰNG PROP, KHÔNG PHẢI MỘT HOOK GỌI TẠI CHỖ ══════════════╗
   * ║ Bảng nhớ "đã chép rồi" phải sống trong BẢN NHÁP của dự án               ║
   * ║ (`ComposerState.shapeAssets`), để chọn lại cùng một món ở thẻ khác — hay ║
   * ║ mở lại dự án hôm sau — không trả lại giá một vòng tải xuống + một vòng   ║
   * ║ tải lên. Ruột thẻ này KHÔNG biết gì về `ComposerState`: nó chỉ cầm một    ║
   * ║ `UiKitBlock`. Cho nó biết là mở đường để ba thẻ trên một màn mỗi thẻ giữ  ║
   * ║ một bảng nhớ riêng, và bốn tấm giống nhau nằm trong `refs/`.             ║
   * ║ Nên chủ sở hữu bản nháp (`PromptCanvasScreen`) đưa xuống đúng MỘT hàm,    ║
   * ║ và nó là cùng phép chép mà thương hiệu đã dùng — xem `useShapeBinding`.  ║
   * ╚═════════════════════════════════════════════════════════════════════════╝
   * Vắng (vỏ lab, không có dự án nào) ⇒ chọn món vẫn chạy, chỉ là không có ảnh
   * khung đi kèm — cùng cách xử sự với `ShapeRefPanel` khi thiếu dự án.
   */
  copyShapeAsset?: (assetId: string) => Promise<PillImage>;
}) {
  const presets = usePresets();
  const [askReset, setAskReset] = React.useState(false);
  /**
   * Món nào vừa chép ảnh khung HỎNG — nói ra, không nuốt.
   *
   * Phép chép chạy sau khi hộp đã đóng, nên không còn chỗ nào trong hộp để báo.
   * Im lặng ở đây nghĩa là người dùng chọn một món họ BIẾT là có hình phác, thấy
   * dòng hiện ra không có thumbnail, và không có gì giải thích — rồi họ bấm Vẽ.
   */
  const [shapeError, setShapeError] = React.useState("");
  /* MỘT ref cho cả danh sách: `dragstart` xảy ra ở dòng này còn `drop` ở dòng
     kia, nên chỗ nhớ "đang kéo dòng nào" phải nằm TRÊN cả hai. */
  const dragFrom = React.useRef<number | null>(null);

  const used = React.useMemo(() => new Set(block.cells.map((cell) => cell.elementId)), [block.cells]);

  /**
   * CHÉP ẢNH KHUNG của các món vừa được bấm vào ĐÚNG dòng của chúng.
   *
   * ╔══ DÒNG HIỆN RA NGAY, ẢNH THEO SAU ═══════════════════════════════════════╗
   * ║ Hai việc, hai tốc độ — cùng luật với phép chọn thương hiệu (xem `pick`    ║
   * ║ trong `brand-binding.ts`): «món này là gì» là dữ liệu đã có trong tay nên ║
   * ║ dòng phải hiện ra trong cùng nhịp bấm; tấm ảnh cần hai vòng mạng. Gộp      ║
   * ║ chúng vào một lượt ghi sau khi chép xong thì hộp đóng lại mà màn hình      ║
   * ║ đứng im vài giây, và người dùng bấm lần nữa.                              ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Vá theo `id` DÒNG chứ không theo chỉ số: giữa lúc bấm với lúc chép xong, người
   * dùng có thể đã kéo dòng đi chỗ khác hoặc xoá hẳn nó. Không còn dòng ấy ⇒ `map`
   * đi qua không đổi gì, đúng thứ ta muốn.
   */
  const attachShapes = React.useCallback(
    (made: readonly { preset: ElementPreset; cellId: string }[]) => {
      const copy = copyShapeAsset;
      /* Không có dự án nào (vỏ lab) ⇒ chọn món vẫn chạy, chỉ là không có chỗ cất
         tấm ảnh. Cùng cách xử sự với `ShapeRefPanel` khi thiếu dự án. */
      if (!copy) return;
      for (const { preset, cellId } of made) {
        const assetId = preset.shapeAssetId;
        const note = (preset.shapeNote ?? "").trim();
        /* CẶP KHÔNG ĐỦ ⇒ KHÔNG CHÉP. Một tấm ảnh không mô tả là thứ `ShapeRefPanel`
           cấm người dùng tạo ra bằng tay (máy vẽ sẽ đoán xem khối hình ấy là gì),
           nên nó cũng không được lọt vào bằng cửa danh mục. */
        if (!assetId || !note) continue;
        void (async () => {
          try {
            const image = await copy(assetId);
            onChange((prev) => ({
              ...prev,
              cells: prev.cells.map((cell) =>
                cell.id === cellId ? { ...cell, shapeRef: image.path, shapeNote: note } : cell,
              ),
            }));
          } catch (error) {
            setShapeError(
              `Không chép được ảnh khung của «${preset.vi}»: ${error instanceof Error ? error.message : "lỗi không rõ"}`,
            );
          }
        })();
      }
    },
    [copyShapeAsset, onChange],
  );

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
    onChange((prev) => ({ ...prev, cells: moveRow(prev.cells, from, to) }));

  const Row = block.mode === "free" ? FreeCellRow : CellRow;

  /* PHÉP CHIA THẬT, không phải một phép chia thứ hai dựng lại ở tầng hiển thị:
     cùng `uiKitSplit` mà badge trên thẻ và bộ dịch contract cùng gọi. Vạch ranh
     giới chỉ hiện khi thẻ CÓ nhiều hơn một tấm — một tấm thì không có gì để ngăn,
     và một cái nhãn "Tấm 1" đứng một mình chỉ là chữ thừa trên mọi thẻ nhỏ. */
  const breaks = sheetBreaks(uiKitSplit(block, presets).map((chunk) => chunk.length));
  const breakAt = new Map(breaks.length > 1 ? breaks.map((b) => [b.at, b]) : []);

  return (
    <>
      <div className="mb-3">
        <ModeToggle mode={block.mode} onPick={pick} />
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/60 bg-warn/[var(--kg-tint-a)] px-3 py-2">
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

      {shapeError !== "" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/60 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">{shapeError}</span>
          {/* Món ĐÃ vào dòng rồi, chỉ thiếu tấm ảnh — nên đây là một lời báo đóng
              được, không phải một lỗi chặn đường. Đính tay vẫn còn nguyên ở nấc
              «Đính ảnh khung» của pill tên dòng. */}
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={() => setShapeError("")}>
              Đã hiểu
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {block.cells.map((cell, index) => (
          <React.Fragment key={cell.id}>
          {breakAt.get(index) && (
            <SheetBreak
              no={breakAt.get(index)!.no}
              size={breakAt.get(index)!.size}
              at={index}
              onMove={move}
              dragFrom={dragFrom}
              {...(onRedrawSheet ? { onRedraw: () => onRedrawSheet(breakAt.get(index)!.no - 1) } : {})}
              redrawBusy={redrawBusy}
            />
          )}
          <Row
            cell={cell}
            used={used}
            projectId={projectId ?? null}
            drag={{ index, count: block.cells.length, onMove: move, dragFrom }}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, cells: prev.cells.map((c) => (c.id === cell.id ? next : c)) }))
            }
            onPickSet={(pick) => {
              const head = pick.parts[0];
              if (!head) return;
              /* «ĐÃ Ở TRONG BỘ NÀY RỒI» ⇒ cú bấm không có ý định nào, `applySetAtRow`
                 trả nguyên mảng cũ — nên ở đây cũng không được chép ảnh khung gì.
                 Hỏi TRƯỚC, ngoài updater: bên trong ấy ta không có cách nào nói ra
                 cho phần chép ảnh biết là mình vừa không làm gì. */
              const current = presets.elements.find((preset) => preset.id === cell.elementId);
              const noop = !pick.one && elementSetKey(current) === elementSetKey(head);
              /* Dòng chèn thêm dựng SẴN ở đây, ngoài updater — xem `applySetAtRow`. */
              const rest = pick.one
                ? []
                : pick.parts.slice(1).map((part) => freshCell(part.id, presets, block.mode));
              /* Tìm lại vị trí TRONG `prev` chứ không dùng `index` của lượt render:
                 giữa lúc hộp mở với lúc bấm, một dòng khác có thể đã bị kéo đi chỗ
                 khác — và chèn nhầm chỗ là bộ vừa chọn nằm rải ra hai cụm. */
              onChange((prev) => {
                const at = prev.cells.findIndex((c) => c.id === cell.id);
                /* MỘT BIẾN THỂ BẤM LẺ ⇒ ĐỔI ĐÚNG DÒNG NÀY. «Cả bộ» và mọi bộ ghép
                   ⇒ dòng này thành phần đầu + chèn phần còn lại ngay sau. */
                const cells = pick.one
                  ? swapOneAtRow(prev.cells, at, head, presets)
                  : applySetAtRow(prev.cells, at, pick.parts, presets, rest);
                return { ...prev, cells };
              });
              if (noop) return;
              /* Phần ĐẦU đổi chính dòng này (id giữ nguyên qua `swapCellElement`);
                 các phần sau nằm ở những dòng vừa dựng, theo đúng thứ tự. */
              attachShapes([
                { preset: head, cellId: cell.id },
                ...rest.map((made, at) => ({ preset: pick.parts[at + 1]!, cellId: made.id })),
              ]);
            }}
            onRemove={() => onChange((prev) => ({ ...prev, cells: prev.cells.filter((c) => c.id !== cell.id) }))}
          />
          </React.Fragment>
        ))}
      </div>

      {block.cells.length === 0 && (
        <p className="px-2 py-2 text-body text-fg-muted">Bấm «+ Element» để thêm món đầu tiên vào bộ kit.</p>
      )}

      {/* Nút nằm DƯỚI danh sách vì element mới nối vào CUỐI: chỗ bấm ngay cạnh
          chỗ nó hiện ra. Kéo lên đầu là việc của tay nắm ⣿ trên từng dòng. */}
      <div className="mt-3 border-t border-line-subtle pt-3">
        {/* CẢ BỘ NỐI VÀO CUỐI, THEO ĐÚNG THỨ TỰ PHẦN trong danh mục — và mỗi phần
            là một dòng bình thường, xoá được, kéo được, đổi bộ được. Không có
            "dòng gộp" nào ở đây: thứ tự dòng đi thẳng vào `components[]` của
            contract, nên một dòng đại diện cho nhiều ô sẽ là một dòng người dùng
            không sắp xếp nổi. */}
        <ElementPicker
          used={used}
          onPick={(pick) => {
            /* Dòng dựng SẴN ở đây, ngoài updater: phép chép ảnh khung quay về vá
               đúng dòng này bằng `id`, nên id phải sinh một lần — xem `applySetAtRow`. */
            const made = pick.parts.map((part) => ({ preset: part, cell: freshCell(part.id, presets, block.mode) }));
            onChange((prev) => ({ ...prev, cells: [...prev.cells, ...made.map((entry) => entry.cell)] }));
            attachShapes(made.map((entry) => ({ preset: entry.preset, cellId: entry.cell.id })));
          }}
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

/** Ruột + vỏ `BlockCard` — hình dạng mà màn lab cũ (`/lab/prompt-composer`, xoá
 *  07/09/2026) dùng. Khu soạn `/k/:id` chỉ lấy phần RUỘT, xem `CanvasBlock`. */
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
          <UiKitBlockBadge block={block} onChange={onChange} />
          <ModeBadge mode={block.mode} />
        </>
      }
      onDelete={onDelete}
    >
      <UiKitBlockBody block={block} onChange={onChange} />
    </BlockCard>
  );
}
