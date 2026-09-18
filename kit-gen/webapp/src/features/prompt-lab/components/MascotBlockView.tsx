import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelOf, pillOptions } from "../lib/pill-registry";
import { usePresets } from "../lib/presets-store";
import { mascotPoseDoc, pillValuesOf, SCAFFOLDS } from "../lib/doc-templates";
import { freeText, type PromptDocNode } from "../lib/serialize";
import {
  mascotSplit,
  moveRow,
  newMascotPose,
  retakePose,
  sheetBreaks,
  sheetSplitNote,
  type BlockMode,
  type MascotBlock,
  type MascotPose,
} from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { SheetMaxPicker } from "./SheetMaxPicker";
import { BlockEditor } from "./BlockEditor";
import {
  DragHandle, NoteField, RemoveButton, RowIndex, RowShell, RowTop, SheetBreak, type RowDragProps,
} from "./row-ui";
import { OptionPill, PillMenu, PillMenuItem, useMenuFlip } from "./pill-ui";
import { PoseRowContext, useRowPoseThumb, type PoseRowPills } from "../lib/pose/use-pose-thumbs";

/**
 * MascotBlockView — thẻ «Nhân vật»: MỘT CÂU DANH TÍNH + MỘT DANH SÁCH DÁNG.
 *
 * ╔══ VÌ SAO THẺ NÀY KHÔNG CÒN LÀ MỘT CÂU ═══════════════════════════════════╗
 * ║ Bản trước: một câu mad-lib «Tạo nhân vật [ảnh] với dáng [⌄] (hoặc ảnh dáng║
 * ║ [ảnh]), biểu cảm [⌄], trang phục [⌄].» ⇒ MỘT tấm, MỘT ô, MỘT dáng. Muốn   ║
 * ║ ba dáng thì phải dựng ba thẻ, và ba thẻ ấy là ba lượt vẽ — trong khi cả ba║
 * ║ dáng vốn thuộc về đúng một tấm turnaround.                                ║
 * ║ Chủ sản phẩm chốt: *"nhân vật cũng nên để sprite sheet nhé, bỏ cái «hoặc»  ║
 * ║ đi vì mỗi nhân vật 1 pose 1 góc camera riêng mà"*.                         ║
 * ║ Nên thẻ này nay có HÌNH DẠNG CỦA THẺ BỘ UI, tới từng chi tiết thao tác:    ║
 * ║ dòng hai tầng, kéo thả đổi thứ tự, nút xoá ghim cuối hàng 1, ô ghi chú     ║
 * ║ full-width, một công tắc chế độ cho cả thẻ. Mã của bốn thứ đó KHÔNG được   ║
 * ║ chép — nó nằm ở `row-ui.tsx`, dùng chung với thẻ Bộ UI.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ CÁI GÌ Ở CÂU ĐẦU, CÁI GÌ Ở DÒNG — MỘT LUẬT DUY NHẤT ═══════════════════
 * Câu đầu giữ thứ ĐÚNG CHO MỌI Ô (nhân vật này là ai, mặc gì); dòng giữ thứ mỗi
 * ô một khác (dáng, góc máy, nét mặt). Đặt nhầm bên nào cũng ra một hỏng nhìn
 * thấy được: trang phục ở dòng ⇒ mười sáu ô mười sáu bộ đồ; dáng ở câu đầu ⇒
 * quay lại đúng cái thẻ một-dáng vừa bỏ.
 *
 * ══ KHÔNG CÒN THANH «Ảnh dáng tự dựng» ════════════════════════════════════
 * Bản trước có một thanh rời phía trên thẻ: «Ảnh dáng tự dựng: [dáng][góc] sẽ
 * dựng khi bấm Vẽ». Chủ sản phẩm hỏi thẳng *"cái này là sao nhỉ, sao ko cho vào
 * trong chọn prompt cho tự nhiên?"* — và câu hỏi ấy đúng: manơcanh 3D là chuyện
 * NỘI BỘ của công cụ (xem `capture-pose-ref.ts`: "người dùng KHÔNG BAO GIỜ thấy
 * bước ③"), còn dáng và góc thì là lựa chọn thiết kế và phải nằm trong câu prompt.
 * Nay hai pill ấy là pill của DÒNG, và không còn một chữ nào nói về ảnh manơcanh.
 */

/* ══════════════════════════════════════════════════════════════════════════
   Dòng ở CHẾ ĐỘ TEMPLATE — React thuần, không editor
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Một dòng dáng ở chế độ khuôn.
 *
 * Ba pill, cùng thứ tự với `mascotPoseDoc` và với `PILL_SLOTS.mascotPose`: dáng →
 * góc → nét mặt. Nhãn trục nằm TRONG pill (`axis`) chứ không làm chữ nối rời —
 * xem `PillAxis` để biết vì sao chữ nối rời làm vỡ bố cục hàng.
 */
function PoseRow({
  row,
  onChange,
  onRemove,
  drag,
}: {
  row: MascotPose;
  onChange: (next: MascotPose) => void;
  onRemove: () => void;
  drag: RowDragProps;
}) {
  const presets = usePresets();
  const label = labelOf("pose", row.pose, presets);

  return (
    <RowShell {...drag}>
      {/* DÒNG NÀY ĐANG Ở DÁNG NÀO · GÓC NÀO — hộp chọn cần biết để vẽ ô xem trước
          cho ĐÚNG dòng này. `PoseRowShot` không sinh thẻ nào, nên bố cục dòng
          không đổi một pixel. */}
      <PoseRowShot pose={row.pose} view={row.view}>
        <RowTop>
          <DragHandle {...drag} label={label} />
          <RowIndex index={drag.index} />
          <RowPoseShot pose={row.pose} view={row.view} />
          {/* `retakePose` chứ không phải `{...row, pose}`: đổi dáng/góc làm ảnh
              manơcanh đã chụp hết hiệu lực, và luật ấy chỉ có MỘT chỗ. */}
          <OptionPill compact axis="Dáng" kind="pose" value={row.pose} onChange={(pose) => onChange(retakePose(row, { pose }))} />
          <OptionPill compact axis="Góc" kind="view" value={row.view} onChange={(view) => onChange(retakePose(row, { view }))} />
          <OptionPill
            compact
            axis="Biểu cảm"
            kind="expression"
            value={row.expression}
            onChange={(expression) => onChange({ ...row, expression })}
          />
          <RemoveButton what={`dáng ${label}`} onRemove={onRemove} />
        </RowTop>
      </PoseRowShot>

      <NoteField
        label={label}
        placeholder="Ghi chú thêm cho dáng này…"
        value={row.note}
        onChange={(note) => onChange({ ...row, note })}
      />
    </RowShell>
  );
}

/**
 * VỎ CONTEXT của một dòng dáng — thứ duy nhất nó làm là nói cho mọi pill bên
 * trong biết dòng này đang ở dáng nào, góc nào.
 *
 * Một component riêng chỉ vì `useMemo`: giá trị context là một object, và một
 * object mới mỗi lần render sẽ bắt MỌI pill trong dòng vẽ lại sau mỗi ký tự gõ
 * vào ô ghi chú. Hai trường này thì cả buổi mới đổi một lần.
 */
function PoseRowShot({ pose, view, children }: PoseRowPills & { children: React.ReactNode }) {
  const pills = React.useMemo<PoseRowPills>(() => ({ pose, view }), [pose, view]);
  return <PoseRowContext.Provider value={pills}>{children}</PoseRowContext.Provider>;
}

/**
 * TẤM ẢNH CỦA CHÍNH DÒNG NÀY — dáng đang chọn, ở góc đang chọn, 40×40 ngay cạnh
 * số thứ tự.
 *
 * ╔══ VÌ SAO NÓ ĐỨNG Ở ĐẦU DÒNG, KHÔNG PHẢI TRONG PILL ══════════════════════╗
 * ║ Người dùng quét một bản nháp 12 dòng bằng cách chạy mắt DỌC theo cột trái  ║
 * ║ (⣿ · #1 · #2 · …). Đặt tấm ảnh vào đúng cột ấy thì mười hai dáng đọc được  ║
 * ║ trong một lượt mắt; nhét nó vào trong pill «Dáng» thì mỗi tấm nằm ở một     ║
 * ║ hoành độ khác (pill co giãn theo độ dài chữ), và cột duy nhất còn lại để    ║
 * ║ chạy mắt là cột chữ — tức là không có gì thay đổi so với trước.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO Ô GIỮ CHỖ CHỈ XUẤT HIỆN SAU KHI DÒNG ĐÃ TỪNG CÓ ẢNH ════════════╗
 * ║ Hàng 1 KHÔNG ĐƯỢC PHÉP WRAP và mọi dòng phải cao BẰNG NHAU (xem `RowTop`). ║
 * ║ Hai luật ấy đá nhau ở đây: bày ô 40px khi có dáng rồi bỏ hẳn khi xoá dáng   ║
 * ║ là dòng ấy TỤT một bậc chiều cao ngay dưới ngón tay người vừa bấm «— để     ║
 * ║ trống —», kéo theo mọi dòng bên dưới nhảy lên. Mà chừa sẵn ô cho MỌI dòng   ║
 * ║ thì một thẻ ở chế độ tự do — nơi dáng có thể chưa bao giờ được đặt — mang    ║
 * ║ một cột ô rỗng suốt đời.                                                   ║
 * ║ Nên cái chốt là MỘT CHIỀU: dòng nào đã từng hiện được ảnh thì giữ chỗ vĩnh  ║
 * ║ viễn (ô trống TÀNG HÌNH, không viền — nó là khoảng trống, không phải một    ║
 * ║ tấm ảnh hỏng), dòng chưa từng có thì không bao giờ mọc thêm ô. Chiều cao    ║
 * ║ của một dòng vì thế chỉ đổi đúng một lần, ở nhịp nó có ảnh lần đầu.        ║
 * ║ (Khác hẳn ô giữ chỗ CÓ VIỀN trong hộp chọn: ở đó 19 dòng nằm cạnh nhau     ║
 * ║ trong một danh sách và cần một cột thẳng; ở đây mỗi dòng là một thẻ riêng.) ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * CÂM, CỐ Ý. Nó không bấm được: `OptionPill` tự giữ trạng thái mở/đóng hộp của
 * mình (`useMenuFlip`), nên biến tấm ảnh thành cửa thứ hai mở hộp «Dáng» đòi mở
 * API của pill ra cho người ngoài điều khiển — một cái cửa dùng chung cho BẢY
 * trục pill, đổi vì một tấm ảnh trang trí thì không đáng. Pill «Dáng» đứng cách
 * nó đúng 6px và vẫn là cửa duy nhất.
 * `alt=""` + `aria-hidden` cùng lý do với ô trong hộp chọn: tên dáng đã nằm ngay
 * bên cạnh bằng chữ, đọc hai lần là thừa. Ảnh ở đây để NHÌN.
 */
function RowPoseShot({ pose, view }: PoseRowPills) {
  const src = useRowPoseThumb(pose, view);
  /* Chốt một chiều "dòng này đã từng có ảnh". Ghi trong effect chứ không giữa
     lúc render — render phải thuần, và nhịp duy nhất cần nó đúng thì cũng là
     nhịp đang có `src` để bày. */
  const everShown = React.useRef(false);
  React.useEffect(() => {
    if (src) everShown.current = true;
  }, [src]);

  if (!src) return everShown.current ? <span aria-hidden className="size-10 shrink-0" /> : null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      /* `object-contain`: dáng «Nhảy» cao hơn dáng «Ngồi», và `cover` sẽ xén đúng
         chỗ khác biệt giữa hai dáng — thứ duy nhất tấm ảnh này sinh ra để cho thấy. */
      className="size-10 shrink-0 rounded-1 border border-line-subtle bg-raised object-contain"
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Dòng ở CHẾ ĐỘ TỰ DO — một TipTap thật cho mỗi dòng
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Dòng tự do: số thứ tự + tay nắm đứng ngoài, câu chữ nằm trong editor.
 *
 * Cùng khuôn với `FreeCellRow` của thẻ Bộ UI, kể cả `scale="row"` — gạt công tắc
 * không được làm chữ trong cùng một thẻ nhảy một bậc.
 */
function FreePoseRow({
  row,
  onChange,
  onRemove,
  drag,
}: {
  row: MascotPose;
  onChange: (next: MascotPose) => void;
  onRemove: () => void;
  drag: RowDragProps;
}) {
  const presets = usePresets();
  const label = labelOf("pose", row.pose, presets);
  /* Dòng chưa có `doc` (vừa thêm khi thẻ đã ở chế độ tự do) ⇒ dựng câu khởi điểm
     NGAY LÚC RENDER: đợi một effect là một nhịp editor rỗng, và `BlockEditor` nhận
     `content` đúng MỘT lần lúc dựng. */
  const doc = row.doc ?? mascotPoseDoc(row);

  return (
    <RowShell {...drag}>
      {/* CÙNG hàng 1 với dòng khuôn — cố ý giống tới từng vị trí. */}
      <RowTop>
        <DragHandle {...drag} label={label} />
        <RowIndex index={drag.index} />
        {/* CÙNG chỗ với dòng khuôn, và đọc CÙNG hai trường: `syncPoseFromDoc` giữ
            `row.pose`/`row.view` đúng với câu chữ, nên gạt công tắc chế độ không
            làm tấm ảnh đầu dòng đổi. */}
        <RowPoseShot pose={row.pose} view={row.view} />
        <RemoveButton what={`dáng ${label}`} onRemove={onRemove} />
      </RowTop>

      {/* CÙNG vỏ context với dòng khuôn: ở chế độ tự do pill là node ProseMirror
          nằm giữa câu, không có đường prop nào tới nó — và `row.pose`/`row.view`
          vẫn được `syncPoseFromDoc` giữ đúng với câu, nên ô xem trước ở hai chế
          độ nói cùng một thứ. */}
      <PoseRowShot pose={row.pose} view={row.view}>
        <div data-prompt-lab="" className="min-w-0">
          <BlockEditor
            doc={doc}
            mode="free"
            scale="row"
            /* KHÔNG nạp lại: mọi thay đổi của dòng này đều do chính editor bắn ra,
               và nạp lại vì chúng là một đường để con trỏ nhảy về đầu dòng sau mỗi
               ký tự. (Thẻ Bộ UI phải nạp lại vì pill TÊN ELEMENT sửa `doc` sau lưng
               editor; ở đây không có pill nào đứng ngoài câu.) */
            resetToken={0}
            placeholder="Viết mô tả riêng cho dáng này… (gõ / để chèn pill)"
            onChange={(next) => onChange(syncPoseFromDoc(row, next))}
          />
        </div>
      </PoseRowShot>
    </RowShell>
  );
}

/**
 * Câu tự do vừa đổi ⇒ ĐỒNG BỘ NGƯỢC ba trường có cấu trúc của dòng.
 *
 * Cùng lập luận với `syncCellFromDoc` bên thẻ Bộ UI: bấm một pill TRONG câu chỉ
 * đổi tài liệu, còn `pose`/`view`/`expression` đứng nguyên — hai nguồn cho một sự
 * thật. Ở đây cái lệch còn đắt hơn: `view` quyết định GÓC MÁY của ảnh manơcanh sẽ
 * chụp, nên câu nói một góc mà ảnh chụp một góc khác là hai chỉ thị đá nhau gửi
 * thẳng tới máy vẽ.
 *
 * Đi qua `retakePose` để đổi dáng/góc trong câu cũng làm ảnh cũ hết hiệu lực —
 * đúng như bấm pill ở chế độ khuôn.
 */
function syncPoseFromDoc(row: MascotPose, doc: JSONContent): MascotPose {
  const pills = pillValuesOf(doc);
  /* Pill bị xoá khỏi câu ⇒ GIỮ giá trị cũ trong trường. Người ta bỏ pill khỏi một
     câu tự viết là bỏ CHỮ, không phải tuyên bố "dòng này không có góc máy" — và
     nếu gạt về khuôn thì ba trường là thứ duy nhất còn lại để dựng lại dòng. */
  const next = retakePose(row, { pose: pills.pose ?? row.pose, view: pills.view ?? row.view });
  return { ...next, doc, expression: pills.expression ?? row.expression };
}

/* ══════════════════════════════════════════════════════════════════════════
   «+ Dáng»
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Nút thêm dòng — một menu chọn DÁNG, không phải một nút câm.
 *
 * ╔══ VÌ SAO CÓ MENU, TRONG KHI MỘT NÚT TRỐNG CŨNG ĐỦ ═══════════════════════╗
 * ║ Thêm một dòng rồi mới đi tìm pill để đổi dáng là hai thao tác cho một ý    ║
 * ║ định ("tôi muốn thêm dáng vẫy tay"). Danh mục dáng lại ĐÓNG và ngắn (19    ║
 * ║ mục của `POSES`), nên nó vào vừa một `PillMenu` — không cần cả bộ tra có ô ║
 * ║ tìm kiếm như danh mục element (danh mục ấy người dùng tự thêm được nên nó  ║
 * ║ dài không giới hạn).                                                      ║
 * ║ Góc máy và nét mặt thì KHÔNG hỏi ở đây: chúng có mặc định dùng được ngay,  ║
 * ║ và hỏi ba câu trước khi cho thấy dòng đầu tiên là một cái phễu.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
function PosePicker({ onPick }: { onPick: (pose: string) => void }) {
  const presets = usePresets();
  const flip = useMenuFlip();
  const options = React.useMemo(() => pillOptions("pose", presets), [presets]);

  return (
    <span className="relative inline-block">
      <Button variant="secondary" size="sm" aria-haspopup="listbox" aria-expanded={flip.open} onClick={flip.toggle}>
        <Plus aria-hidden strokeWidth={1.5} />
        Dáng
      </Button>

      {flip.open && (
        <PillMenu label="Chọn dáng" dropUp={flip.dropUp} onClose={() => flip.setOpen(false)}>
          {options.map((option) => (
            <PillMenuItem
              key={option.value}
              onSelect={() => {
                onPick(option.value);
                flip.setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg-strong">{option.vi}</span>
                <span className="block truncate text-caption text-fg-muted">{option.en}</span>
              </span>
            </PillMenuItem>
          ))}
        </PillMenu>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Vỏ + ruột
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Nhãn chung của thẻ Nhân vật — vỏ nào bọc nó cũng phải gọi đúng một tên.
 *
 * «nhiều dáng» chứ không «sprite sheet»: chữ trong ngoặc ở đây để nói cho người
 * dùng biết một thẻ ra MẤY hình, và họ đọc "nhiều dáng" hiểu ngay — trong khi
 * "sprite sheet" là tên kỹ thuật của cùng cái đó (§5.4 cấm chữ ấy trong chữ hiện
 * ra màn hình, và cổng từ cấm bắt được).
 */
export const MASCOT_BLOCK_TITLE = "Nhân vật (nhiều dáng)";

/** Badge đếm dáng + nấc «tối đa mỗi tấm» — cùng hình dạng với badge của thẻ Bộ UI. */
export function MascotBlockBadge({
  block,
  onChange,
}: {
  block: MascotBlock;
  onChange?: (updater: (prev: MascotBlock) => MascotBlock) => void;
}) {
  const sizes = mascotSplit(block).map((chunk) => chunk.length);
  return (
    <>
      <span className="rounded-full border border-line-subtle px-2 py-0.5 text-caption text-fg-muted">
        {block.poses.length} dáng · {sheetSplitNote(sizes)}
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

/** Dòng này đã bị NGƯỜI DÙNG sửa trong chế độ tự do chưa — xem `cellEdited`. */
function poseEdited(row: MascotPose): boolean {
  if (!row.doc) return false;
  return JSON.stringify(row.doc) !== JSON.stringify(mascotPoseDoc(row));
}

/** Bỏ câu tự do khỏi một dòng — các trường có cấu trúc không hề bị đụng tới. */
function dropDoc(row: MascotPose): MascotPose {
  const { doc: _dropped, ...rest } = row;
  return rest;
}

/** Dòng mới. Thêm khi thẻ ĐANG ở chế độ tự do ⇒ có câu ngay, không phải gạt lại. */
function freshPose(pose: string, mode: BlockMode): MascotPose {
  const row = newMascotPose(pose);
  return mode === "free" ? { ...row, doc: mascotPoseDoc(row) } : row;
}

/**
 * RUỘT của thẻ Nhân vật, không có vỏ.
 *
 * Tách ra cùng lý do với `DocBlockBody` / `UiKitBlockBody` — xem khối chú thích ở
 * `DocBlockView.tsx`.
 */
export function MascotBlockBody({
  block,
  onChange,
  reloadSignal = 0,
  onRedrawSheet,
  redrawBusy = false,
}: {
  block: MascotBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong màn. */
  onChange: (updater: (prev: MascotBlock) => MascotBlock) => void;
  /** Tín hiệu nạp lại CÂU ĐẦU THẺ khi nó bị sửa từ ngoài editor (ảnh vừa tải lên). */
  reloadSignal?: number;
  /** Vẽ lại RIÊNG một tấm — cùng hợp đồng với `UiKitBlockBody`, xem chú thích ở đó. */
  onRedrawSheet?: (sheetIndex: number) => void;
  redrawBusy?: boolean;
}) {
  const [askReset, setAskReset] = React.useState(false);
  /* MỘT ref cho cả danh sách: `dragstart` xảy ra ở dòng này còn `drop` ở dòng kia. */
  const dragFrom = React.useRef<number | null>(null);

  const pick = (next: BlockMode) => {
    if (next === block.mode) return;

    if (next === "free") {
      /* 1 → 2: chỉ MỞ KHOÁ, và dựng câu khởi điểm cho dòng nào chưa có. Dòng đã
         từng viết tự do thì GIỮ NGUYÊN câu cũ — gạt qua gạt lại không được là một
         đường xoá chữ. Câu ĐẦU THẺ không phải dựng lại: nó vốn đã là một tài liệu
         thật, mở khoá là gõ được ngay (cùng luật với thẻ Background). */
      onChange((prev) => ({
        ...prev,
        mode: "free",
        poses: prev.poses.map((row) => (row.doc ? row : { ...row, doc: mascotPoseDoc(row) })),
      }));
      return;
    }

    /* 2 → 1: quay về khuôn. Hỏi khi CÓ GÌ ĐỂ MẤT — chữ người dùng viết thêm ở câu
       đầu thẻ, hoặc câu tự do của một dòng. Hỏi thừa mỗi lần gạt là dạy người dùng
       bấm "Đồng ý" mà không đọc. */
    if (freeText(block.doc as PromptDocNode, SCAFFOLDS.mascot) || block.poses.some(poseEdited)) {
      setAskReset(true);
      return;
    }
    onChange((prev) => ({ ...prev, mode: "template", poses: prev.poses.map(dropDoc) }));
  };

  const confirmReset = () => {
    /* Câu đầu thẻ KHÔNG bị dựng lại từ template ở đây, khác thẻ Cảnh nền: nó mang
       ẢNH NHÂN VẬT — thứ người dùng đã tải lên và không có đường nào lấy lại từ
       một template sạch. Chữ thừa họ gõ vào đó chỉ đi vào `directive`, nên giữ
       nguyên là mất ít hơn hẳn so với xoá mất ảnh. */
    onChange((prev) => ({ ...prev, mode: "template", poses: prev.poses.map(dropDoc) }));
    setAskReset(false);
  };

  const move = (from: number, to: number) =>
    onChange((prev) => ({ ...prev, poses: moveRow(prev.poses, from, to) }));

  const Row = block.mode === "free" ? FreePoseRow : PoseRow;

  /* Cùng nguồn chia với badge của thẻ và với bộ dịch contract — xem `UiKitBlockBody`. */
  const breaks = sheetBreaks(mascotSplit(block).map((chunk) => chunk.length));
  const breakAt = new Map(breaks.length > 1 ? breaks.map((b) => [b.at, b]) : []);

  return (
    <>
      <div className="mb-3">
        <ModeToggle mode={block.mode} onPick={pick} />
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/60 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">Quay về template sẽ bỏ câu tự do của các dòng dáng.</span>
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

      {/* CÂU ĐẦU THẺ — danh tính của nhân vật, dùng chung cho mọi ô. */}
      <div data-prompt-lab="">
        <BlockEditor
          doc={block.doc}
          mode={block.mode}
          /* Chỉ nạp lại theo tín hiệu TỪ NGOÀI: khác thẻ Cảnh nền, ở đây không có
             nút «Quay về template» nào dựng lại câu đầu, nên không cần một bộ đếm
             nội bộ thứ hai. */
          resetToken={reloadSignal}
          placeholder="Nhân vật này là ai… (gõ / để chèn pill)"
          onChange={(doc) => onChange((prev) => ({ ...prev, doc }))}
        />
      </div>

      <div className="mt-3 flex flex-col border-t border-line-subtle pt-3">
        {block.poses.map((row, index) => (
          <React.Fragment key={row.id}>
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
            row={row}
            drag={{ index, count: block.poses.length, onMove: move, dragFrom }}
            onChange={(next) =>
              onChange((prev) => ({ ...prev, poses: prev.poses.map((p) => (p.id === row.id ? next : p)) }))
            }
            onRemove={() => onChange((prev) => ({ ...prev, poses: prev.poses.filter((p) => p.id !== row.id) }))}
          />
          </React.Fragment>
        ))}
      </div>

      {block.poses.length === 0 && (
        <p className="px-2 py-2 text-body text-fg-muted">Bấm «+ Dáng» để thêm dáng đầu tiên cho nhân vật này.</p>
      )}

      {/* Nút nằm DƯỚI danh sách vì dòng mới nối vào CUỐI: chỗ bấm ngay cạnh chỗ nó
          hiện ra. Kéo lên đầu là việc của tay nắm ⣿ trên từng dòng. */}
      <div className="mt-3">
        <PosePicker
          /* Thêm dòng KHÔNG đụng tới câu đầu thẻ, nên không có lượt nạp lại nào ở
             đây: một lượt nạp thừa là một lần con trỏ của người đang gõ dở câu ấy
             bị ném về đầu dòng. */
          onPick={(pose) => onChange((prev) => ({ ...prev, poses: [...prev.poses, freshPose(pose, prev.mode)] }))}
        />
      </div>
    </>
  );
}

/** Ruột + vỏ `BlockCard` — hình dạng mà màn lab cũ (`/lab/prompt-composer`, xoá
 *  07/09/2026) dùng. Khu soạn `/k/:id` chỉ lấy phần RUỘT, xem `CanvasBlock`. */
export function MascotBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: MascotBlock;
  onChange: (updater: (prev: MascotBlock) => MascotBlock) => void;
  onDelete: () => void;
}) {
  return (
    <BlockCard
      title={MASCOT_BLOCK_TITLE}
      badge={
        <>
          <MascotBlockBadge block={block} onChange={onChange} />
          <ModeBadge mode={block.mode} />
        </>
      }
      onDelete={onDelete}
    >
      <MascotBlockBody block={block} onChange={onChange} />
    </BlockCard>
  );
}
