import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import type { Skel } from "@/lib/types/contract";
import { Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { foldVi } from "@/features/kit-core/lib/element-lib/source";
import {
  addCustomElement, elementLabel, elementSetKey, elementSets, hasDecorPlacement, usePresets,
} from "../lib/presets-store";
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
import { moveRow, newCell, type BlockMode, type UiCell, type UiKitBlock } from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { BlockEditor } from "./BlockEditor";
import { DragHandle, NoteField, RemoveButton, RowIndex, RowShell, RowTop, type RowDragProps } from "./row-ui";
import {
  OptionPill,
  PillAxis,
  PillButton,
  PillCaret,
  SOURCE_PICKER_MAX_PX,
  useMenuFlip,
} from "./pill-ui";
import { SourcePicker, type SourceGroup } from "./SourcePicker";

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
}: {
  cell: UiCell;
  used: ReadonlySet<string>;
  onChange: (next: UiCell) => void;
  /** Chọn một BỘ trên pill tên — việc này đụng tới CẢ DANH SÁCH, xem `applySetAtRow`. */
  onPickSet: (parts: readonly ElementPreset[]) => void;
  onRemove: () => void;
  drag: RowDragProps;
}) {
  const presets = usePresets();
  const element = presets.elements.find((preset) => preset.id === cell.elementId);
  const label = elementLabel(element, cell.elementId);

  return (
    <RowShell {...drag}>
      <RowTop>
        <DragHandle {...drag} label={label} />
        <RowIndex index={drag.index} />
        <ElementNamePill label={label} used={used} onPick={onPickSet} />
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
}: {
  cell: UiCell;
  used: ReadonlySet<string>;
  onChange: (next: UiCell) => void;
  /** Xem `CellRow` — hai chế độ có CÙNG một hàng 1, nên cùng một cửa đổi bộ. */
  onPickSet: (parts: readonly ElementPreset[]) => void;
  onRemove: () => void;
  drag: RowDragProps;
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
        <ElementNamePill label={label} used={used} onPick={onPickSet} />
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
        {typed && <Pencil aria-hidden className="size-3.5 shrink-0 opacity-60" />}
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
 */
function applySetAtRow(
  cells: readonly UiCell[],
  index: number,
  parts: readonly ElementPreset[],
  presets: PresetBundle,
  mode: BlockMode,
): UiCell[] {
  const row = cells[index];
  const head = parts[0];
  if (!row || !head) return [...cells];
  const current = presets.elements.find((preset) => preset.id === row.elementId);
  if (elementSetKey(current) === elementSetKey(head)) return [...cells];
  return [
    ...cells.slice(0, index),
    swapCellElement(row, head, presets),
    ...parts.slice(1).map((part) => freshCell(part.id, presets, mode)),
    ...cells.slice(index + 1),
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   Bộ chọn element
   ══════════════════════════════════════════════════════════════════════════ */

/** Trần cao của hộp tra danh mục — PHẢI khớp `max-h-96` ở class, xem `dropUp`. */
const PICKER_MAX_PX = 384;

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
 * ╔══ MỘT DANH SÁCH, VÀ MỌI DÒNG LÀ MỘT BỘ — KỂ CẢ Ở «Đổi loại món» ═════════╗
 * ║ Chủ sản phẩm, nhìn hộp của pill trên dòng: *«select cả cụm chứ»*. Bản     ║
 * ║ trước cho nhánh «Đổi loại món» một danh mục PHẲNG (từng phần rời: «Thanh  ║
 * ║ máu · phần đầy», «Hộp thoại · bảng tên»…) với lý lẽ "một dòng chỉ mang    ║
 * ║ được một món". Lý lẽ ấy đúng về dữ liệu và sai về việc người ta đang làm: ║
 * ║ ai đổi một dòng «Panel» thành «Dialog» thì họ muốn CÁI HỘP THOẠI, tức cả  ║
 * ║ khung lẫn bảng tên lẫn nút tiếp — không phải đúng một mảnh của nó rồi tự  ║
 * ║ đi tìm hai mảnh còn lại trong một danh sách 48 dòng.                      ║
 * ║ Nên chọn bộ trên dòng k = dòng k thành phần đầu, các phần còn lại CHÈN    ║
 * ║ ngay sau nó (xem `applySetAtRow`). Ai thật sự cần đúng một phần vẫn còn   ║
 * ║ đường cũ: chọn cả bộ rồi xoá dòng thừa — một cú bấm trên thứ đã hiện ra   ║
 * ║ trước mắt, thay vì một cú bấm đúng trong một danh sách phải học trước.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function ElementCatalogue({
  label,
  dropUp,
  used,
  onPick,
}: {
  label: string;
  dropUp: boolean;
  used: ReadonlySet<string>;
  /** Nhận CẢ BỘ. Món lẻ đi qua đây dưới dạng một bộ có đúng một phần. */
  onPick: (parts: readonly ElementPreset[]) => void;
}) {
  const presets = usePresets();
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);

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
        {hits.length === 0 && (
          <p className="px-2 py-4 text-center text-body text-fg-muted">
            Không có món nào khớp — đặt tên riêng cho nó ở ngay dưới.
          </p>
        )}
        {/* MỘT DANH SÁCH, KHÔNG TIÊU ĐỀ NHÓM: mọi dòng ở đây là một bộ và hành xử
            y hệt nhau (bấm ⇒ lấy đủ các phần), nên một tiêu đề chia đôi chỉ hứa
            một sự khác biệt không có thật. Thứ tự = thứ tự trong danh mục. */}
        <SetPickList sets={hits} used={used} onPick={onPick} />
      </div>

      {/* CỬA TỰ ĐẶT TÊN nằm ở ĐÁY và LUÔN hiện, không phải chỉ khi tìm không ra:
          nó điền sẵn đúng chữ vừa gõ, nên "gõ tên món của mình rồi bấm thêm" là
          một mạch liền — còn nếu nó chỉ xuất hiện lúc danh mục rỗng thì người dùng
          phải học rằng "tìm hụt mới đặt tên được". */}
      <CustomElementRow query={query} onPick={onPick} />
    </div>
  );
}

/**
 * «Tự đặt tên…» — thêm một element KHÔNG có trong danh mục.
 *
 * ╔══ VÌ SAO CHỦ SẢN PHẨM CẦN CỬA NÀY ═══════════════════════════════════════╗
 * ║ *«Bảng nền,… custom element cũng cho điền custom.»* Danh mục hạt giống có ║
 * ║ tám món; một game thật có "khung nhiệm vụ", "ô rương", "huy chương hạng   ║
 * ║ ba". Không có cửa này thì người dùng phải rời màn soạn, sang trang         ║
 * ║ «Quản lý preset», thêm một dòng, rồi quay lại tìm nó — bốn bước cho một    ║
 * ║ việc mà họ đang nghĩ tới ngay lúc này.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Món tạo ra vào THẲNG danh mục (`addCustomElement`), nên nó dùng lại được ở thẻ
 * khác và sửa/xoá được ở trang preset — xem chú thích của hàm ấy để biết vì sao
 * không giữ tên riêng trên từng dòng.
 */
function CustomElementRow({ query, onPick }: {
  query: string;
  /** Cùng cửa với mọi dòng của hộp: một món tự đặt tên là một bộ có đúng một phần. */
  onPick: (parts: readonly ElementPreset[]) => void;
}) {
  const [name, setName] = React.useState("");
  /* Chữ đang gõ ở ô tìm kiếm là ứng viên tốt nhất cho cái tên: người ta gõ "rương"
     để TÌM, không thấy, và thứ họ muốn tiếp theo là một món tên "rương". */
  const value = name || query;
  const add = () => {
    const made = addCustomElement(value);
    if (!made) return;
    onPick([made]);
    setName("");
  };

  return (
    <div className="mt-2 border-t border-line-subtle px-1 pt-2">
      <p className="mb-1 px-1 text-caption font-medium uppercase tracking-label text-fg-muted">Tự đặt tên</p>
      <div className="flex items-center gap-1.5">
        <Input
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
      <p className="mt-1 px-1 text-caption text-fg-muted">
        Gõ tiếng Anh thì chữ đó đi thẳng tới máy vẽ; gõ tiếng Việt cũng được, sửa lại sau ở «Quản lý preset».
      </p>
    </div>
  );
}

function ElementPicker({
  used, onPick,
}: {
  used: ReadonlySet<string>;
  onPick: (parts: readonly ElementPreset[]) => void;
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
 */
function ElementNamePill({
  label,
  used,
  onPick,
}: {
  /** Chữ ĐẦY ĐỦ của dòng — «Dialog · box». Nhãn hiển thị, không phải chỗ chọn phần. */
  label: string;
  used: ReadonlySet<string>;
  /** Nhận CẢ BỘ, y như «+ Element» — xem khối chú thích của `ElementCatalogue`. */
  onPick: (parts: readonly ElementPreset[]) => void;
}) {
  const pop = useCataloguePopover();

  return (
    <span ref={pop.boxRef as React.RefObject<HTMLSpanElement>} className="relative inline-block shrink-0">
      <PillButton
        compact
        active={pop.open}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={`Đổi loại món — đang là ${label}`}
        onClick={pop.toggle}
        className="font-medium"
      >
        <span>{label}</span>
        <PillCaret compact />
      </PillButton>

      {/* ĐÓNG ngay sau khi chọn — ngược với «+ Element». Một dòng chỉ đổi được một
          lần, nên chọn xong là hết việc; để hộp mở lại chỉ mời người dùng bấm nhầm. */}
      {pop.open && (
        <ElementCatalogue
          label="Đổi loại món"
          dropUp={pop.dropUp}
          used={used}
          onPick={(parts) => {
            onPick(parts);
            pop.setOpen(false);
          }}
        />
      )}
    </span>
  );
}

/**
 * DANH SÁCH CỦA CẢ HAI HỘP — mỗi dòng là MỘT BỘ, bấm là lấy ĐỦ các phần.
 *
 * ╔══ VÌ SAO KHÔNG CÓ DÒNG NÀO CHO MỘT PHẦN RIÊNG, Ở BẤT KỲ HỘP NÀO ════════╗
 * ║ Bày cả phần lẫn bộ thì danh sách dài gấp ba và mỗi bộ hiện hai lần dưới  ║
 * ║ hai hình dạng — người dùng phải hiểu sự khác nhau giữa «Health bar» (bộ) ║
 * ║ và «fill» (một phần) TRƯỚC khi bấm được cú đầu tiên.                     ║
 * ║ Nên: chọn bộ là lấy đủ các phần, rồi XOÁ phần không cần — một cú bấm     ║
 * ║ thừa, nhưng là cú bấm trên thứ đã hiện ra trước mắt.                     ║
 * ║ Món KHÔNG đeo nhãn bộ đi chung danh sách này dưới dạng một bộ MỘT PHẦN:  ║
 * ║ nó vẫn bấm ra đúng một ô như trước, nên nó không cần một nhóm riêng và   ║
 * ║ một kiểu dòng riêng để nói điều đó.                                     ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */
function SetPickList({
  sets,
  used,
  onPick,
}: {
  sets: readonly ElementSetView[];
  /** Ô đã có trong thẻ — bộ nào ĐỦ PHẦN nằm trong đây thì dòng của nó nói ra. */
  used: ReadonlySet<string>;
  onPick: (parts: readonly ElementPreset[]) => void;
}) {
  return (
    <>
      {sets.map((set) => {
        const already = set.parts.every((part) => used.has(part.id));
        /* DÒNG PHỤ NÓI RA CÚ BẤM NÀY LẤY VỀ NHỮNG GÌ — với bộ nhiều phần đó là tên
           các phần («box · name plate · next button»). Với bộ MỘT PHẦN mang đúng
           tên của chính nó thì tên phần chỉ là chuỗi vừa đọc ở dòng trên, nên chỗ
           ấy nhường cho DANH TỪ EN — thứ
           THẬT SỰ đi tới máy vẽ, và ẩn nốt nếu nó cũng trùng nhãn Việt (món tự
           đặt tên).
           ⚠️ EN từng là chỗ hiện CÂU MÔ TẢ ("a floating popover panel with a
           title bar") — thứ chủ sản phẩm chỉ mặt: *"không có thuộc tính nhé"*.
           Nếu dòng này lại dài ra thì nguồn đã sai, sửa ở `ElementPreset.en`. */
        const only = set.parts.length === 1 ? set.parts[0]! : undefined;
        const sub =
          only && only.vi === set.vi
            ? only.en.toLowerCase() === only.vi.toLowerCase() ? "" : only.en
            : set.parts.map((part) => part.vi).join(" · ");
        return (
          <button
            /* KHOÁ LẤY TỪ PHẦN ĐẦU, không lấy `set.id`: id món là duy nhất trong cả
               danh mục, còn id bộ và id một món lẻ nằm ở hai không gian tên khác
               nhau và có quyền trùng chữ nhau (xem `elementSets`). */
            key={set.parts[0]!.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPick(set.parts)}
            className={cn(
              "flex w-full flex-col gap-0.5 rounded-1 px-2 py-1.5 text-left",
              "hover:bg-accent/[var(--kg-tint-a)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            )}
          >
            <span className={cn("text-body", already ? "text-fg" : "text-fg-strong")}>
              {set.vi} <span className="text-fg-muted">· {set.parts.length} phần</span>
              {/* Vẫn thêm lại được: một bộ kit có ba cỡ nút là chuyện thường. Chữ
                  này chỉ nói "bạn đã có rồi", không cấm. */}
              {already && <span className="text-caption text-fg-muted"> · đã có trong thẻ</span>}
            </span>
            {sub !== "" && <span className="line-clamp-1 text-caption text-fg-muted">{sub}</span>}
          </button>
        );
      })}
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
    onChange((prev) => ({ ...prev, cells: moveRow(prev.cells, from, to) }));

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
            used={used}
            drag={{ index, count: block.cells.length, onMove: move, dragFrom }}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, cells: prev.cells.map((c) => (c.id === cell.id ? next : c)) }))
            }
            /* Tìm lại vị trí TRONG `prev` chứ không dùng `index` của lượt render:
               giữa lúc hộp mở với lúc bấm, một dòng khác có thể đã bị kéo đi chỗ
               khác — và chèn nhầm chỗ là bộ vừa chọn nằm rải ra hai cụm. */
            onPickSet={(parts) =>
              onChange((prev) => ({
                ...prev,
                cells: applySetAtRow(
                  prev.cells,
                  prev.cells.findIndex((c) => c.id === cell.id),
                  parts,
                  presets,
                  prev.mode,
                ),
              }))
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
        {/* CẢ BỘ NỐI VÀO CUỐI, THEO ĐÚNG THỨ TỰ PHẦN trong danh mục — và mỗi phần
            là một dòng bình thường, xoá được, kéo được, đổi bộ được. Không có
            "dòng gộp" nào ở đây: thứ tự dòng đi thẳng vào `components[]` của
            contract, nên một dòng đại diện cho nhiều ô sẽ là một dòng người dùng
            không sắp xếp nổi. */}
        <ElementPicker
          used={used}
          onPick={(parts) =>
            onChange((prev) => ({
              ...prev,
              cells: [...prev.cells, ...parts.map((part) => freshCell(part.id, presets, prev.mode))],
            }))
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
