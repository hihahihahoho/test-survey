import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { BlockEditor } from "@/features/prompt-lab/components/BlockEditor";
import { ModeToggle } from "@/features/prompt-lab/components/BlockCard";
import { BrandColorPills } from "@/features/prompt-lab/components/BrandColorPills";
import { BrandColorsProvider } from "@/features/prompt-lab/extensions/BrandPill";
import { OptionPill } from "@/features/prompt-lab/components/pill-ui";
import { SCAFFOLD_CONTEXT, contextDoc, pillValuesOf } from "@/features/prompt-lab/lib/doc-templates";
import { freeText } from "@/features/prompt-lab/lib/serialize";
import type { BlockMode, ComposerState } from "@/features/prompt-lab/lib/composer-model";
import { CARD, SECTION_LABEL } from "../lib/ui";

/**
 * ContextSection — khối NGỮ CẢNH CHUNG, nay có đủ hai chế độ như mọi block khác.
 *
 * ╔══ VÌ SAO KHỐI NÀY XỨNG ĐÁNG CÓ CHẾ ĐỘ TỰ DO ═════════════════════════════╗
 * ║ Câu ở đây đi vào `variant.style` — mệnh đề mà `gen.sh` chèn vào MỌI tấm    ║
 * ║ của bộ kit. Nó là câu có sức nặng lớn nhất trong cả tài liệu, và cho tới   ║
 * ║ lượt này nó là câu DUY NHẤT người dùng không được viết lại: hai dropdown   ║
 * ║ và một dãy màu, hết. Ai muốn nói "phong cách như poster phim thập niên 80, ║
 * ║ nhưng tiết chế" thì không có chỗ nào để gõ.                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Tách thành file riêng vì nó nay có state riêng (hộp hỏi khi quay về khuôn) và
 * một cây JSX gấp ba lần bản cũ — nhét cả vào `PromptCanvasScreen` là đẩy một màn
 * vốn đã dài thêm 60 dòng nữa.
 */
export function ContextSection({
  composer,
  edit,
}: {
  composer: ComposerState;
  edit: (updater: (prev: ComposerState) => ComposerState) => void;
}) {
  const [askReset, setAskReset] = React.useState(false);

  const doc = composer.contextDoc ?? contextDoc(composer);

  const pick = (next: BlockMode) => {
    if (next === composer.contextMode) return;
    if (next === "free") {
      /* Dựng câu khởi điểm TỪ trạng thái hiện tại, nên gạt công tắc là thấy đúng
         câu vừa đọc — chỉ khác ở chỗ giờ gõ được vào giữa. */
      edit((prev) => ({
        ...prev,
        contextMode: "free",
        contextDoc: prev.contextDoc ?? contextDoc(prev),
      }));
      return;
    }
    /* Quay về khuôn thì câu tự do bị bỏ ⇒ hỏi, nhưng CHỈ khi có chữ để mất. Hỏi
       thừa mỗi lần gạt là dạy người dùng bấm "Đồng ý" mà không đọc — cùng luật
       với block Bộ UI và block có câu chữ. */
    if (freeText(doc as never, SCAFFOLD_CONTEXT)) {
      setAskReset(true);
      return;
    }
    edit((prev) => ({ ...prev, contextMode: "template", contextDoc: undefined }));
  };

  return (
    <section className={CARD} aria-labelledby="kg-ctx-label">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 id="kg-ctx-label" className={SECTION_LABEL}>Ngữ cảnh chung</h2>
        <div className="ml-auto">
          <ModeToggle mode={composer.contextMode} onPick={pick} />
        </div>
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">Quay về template sẽ bỏ câu ngữ cảnh bạn đã viết.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAskReset(false)}>
              Huỷ
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                edit((prev) => ({ ...prev, contextMode: "template", contextDoc: undefined }));
                setAskReset(false);
              }}
            >
              Quay về template
            </Button>
          </div>
        </div>
      )}

      {composer.contextMode === "free" ? (
        /* Provider PHẢI bọc ngoài `BlockEditor`: node view của `brandPill` đọc màu
           qua context, và portal của TipTap là con của `EditorContent` trong cây
           React — xem khối chú thích ở `BrandPill.tsx`. */
        <BrandColorsProvider
          colors={composer.brandColors}
          onChange={(updater) => edit((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
        >
          <div data-prompt-lab="">
            <BlockEditor
              doc={doc}
              mode="free"
              /* KHÔNG nạp lại từ ngoài: ở khối này không có thanh công cụ nào sửa
                 `doc` sau lưng editor — pill nằm TRONG câu, và chúng tự cập nhật
                 tài liệu qua `updateAttributes`. */
              resetToken={0}
              placeholder="Viết câu tả cả bộ kit… (gõ / để chèn pill)"
              onChange={(next) => edit((prev) => adoptContextDoc(prev, next))}
            />
          </div>
        </BrandColorsProvider>
      ) : (
        /* `text-prose` (20px): CÙNG bậc mà editor của từng thẻ dùng. Trước lượt
           này khối ngữ cảnh là 24px còn nhãn của nó là 13px — hai đầu của thang
           chữ cạnh nhau trong một khối cao 120px. */
        <p className="flex flex-wrap items-center gap-x-2 gap-y-3 text-prose text-fg-strong">
          <span>Bộ kit theme</span>
          <OptionPill kind="theme" value={composer.themeValue} onChange={(themeValue) => edit((prev) => ({ ...prev, themeValue }))} />
          <span>phong cách</span>
          <OptionPill kind="style" value={composer.styleId} onChange={(styleId) => edit((prev) => ({ ...prev, styleId }))} />
          <span>, màu thương hiệu</span>
          <BrandColorPills
            colors={composer.brandColors}
            onChange={(updater) => edit((prev) => ({ ...prev, brandColors: updater(prev.brandColors) }))}
          />
          <span>.</span>
        </p>
      )}

      <p className="mt-3 text-caption text-fg-muted">
        Mọi thẻ bên dưới kế thừa ngữ cảnh này; theme và phong cách thì từng thẻ vẫn ghi đè riêng được.
      </p>
    </section>
  );
}

/**
 * Nhận câu vừa gõ VÀ rút hai pill về lại `themeValue`/`styleId`.
 *
 * Cùng lý do với `syncCellFromDoc` của block Bộ UI: pill bấm trong chế độ tự do
 * chỉ đổi tài liệu, nên nếu không chảy ngược thì (1) quay về khuôn là mất lựa
 * chọn vừa bấm, và (2) mọi thẻ bên dưới vẫn kế thừa phong cách CŨ — vì chúng đọc
 * `styleId`, không đọc tài liệu này.
 */
function adoptContextDoc(prev: ComposerState, next: JSONContent): ComposerState {
  const pills = pillValuesOf(next);
  return {
    ...prev,
    contextDoc: next,
    themeValue: pills.theme ?? prev.themeValue,
    styleId: pills.style ?? prev.styleId,
  };
}
