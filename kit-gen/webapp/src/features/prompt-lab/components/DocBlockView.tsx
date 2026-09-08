import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { backgroundDoc, SCAFFOLDS } from "../lib/doc-templates";
import { freeText, type PromptDocNode } from "../lib/serialize";
import type { BlockMode, DocBlock } from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { NoteField } from "./row-ui";
import { BlockEditor } from "./BlockEditor";

/**
 * DocBlockView — card cho block CHỈ LÀ MỘT CÂU CHỮ (nay chỉ còn Cảnh nền).
 *
 * Chỗ duy nhất trong lab quản chuyện ĐỔI CHẾ ĐỘ, vì đó là chỗ duy nhất có thể
 * làm mất công sức của người dùng.
 *
 * ╔══ VÌ SAO TÁCH RUỘT (`DocBlockBody`) RA KHỎI VỎ (`BlockCard`) ═════════════╗
 * ║ Màn THẬT (`prompt-canvas`) cần đúng cái ruột này — công tắc chế độ, lời    ║
 * ║ hỏi trước khi reset, một instance TipTap — nhưng nằm trong một cái vỏ KHÁC:║
 * ║ vỏ đó còn phải đeo hai tab "Soạn | Prompt", nút Gen, trạng thái hàng đợi   ║
 * ║ và ô ảnh kết quả. Nhét cả bốn thứ ấy vào `BlockCard` là bắt route lab gánh ║
 * ║ một cái vỏ nó không dùng; chép ruột sang bên kia là hai bản luật đổi chế   ║
 * ║ độ — và luật ấy CHÍNH LÀ chỗ có thể xoá chữ của người dùng.                ║
 * ║ Nên: ruột ở đây, ai cần vỏ nào thì tự bọc. Lab vẫn bọc `BlockCard`.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * «Background», không phải «Cảnh nền».
 *
 * Cùng thanh ngôn ngữ với «Bộ UI» ngay cạnh nó: cả hai là tên GỌI THẲNG thứ mà
 * người làm game gọi hằng ngày, chứ không phải bản dịch sát nghĩa. Đo được lý do
 * ở chỗ khác: câu «Cảnh nền» dịch đúng nhưng người dùng vẫn gõ "background" khi
 * nói về nó — thẻ mang tên họ dùng thì họ tìm ra nó nhanh hơn.
 */
export const DOC_BLOCK_TITLE: Record<DocBlock["kind"], string> = {
  background: "Background",
};

const TITLE = DOC_BLOCK_TITLE;

const PLACEHOLDER: Record<DocBlock["kind"], string> = {
  background: "Mô tả background… (gõ / để chèn pill)",
};

const FRESH_DOC: Record<DocBlock["kind"], () => JSONContent> = {
  background: backgroundDoc,
};

export function DocBlockBody({
  block,
  onChange,
  reloadSignal = 0,
}: {
  block: DocBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong PromptComposerScreen. */
  onChange: (updater: (prev: DocBlock) => DocBlock) => void;
  /**
   * Tín hiệu NẠP LẠI đến từ BÊN NGOÀI — cộng thẳng vào `resetToken` nội bộ.
   *
   * Ai cần: màn thật sửa `block.doc` mà KHÔNG qua editor (nạp lại bản nháp từ
   * đĩa, hay một lượt chuẩn bị vẽ ghi đè state). Không có tín hiệu này thì state
   * đã đổi mà chữ trong ô soạn vẫn là chữ cũ — hai nguồn sự thật lệch nhau ngay
   * trước mắt người dùng.
   */
  reloadSignal?: number;
}) {
  /* Tăng lên là ra hiệu cho `BlockEditor` nạp lại nội dung. Xem chú thích
     `resetToken` bên đó để biết vì sao không so sánh `doc`. */
  const [resetToken, setResetToken] = React.useState(0);
  const [askReset, setAskReset] = React.useState(false);

  const pick = (next: BlockMode) => {
    if (next === block.mode) return;

    if (next === "free") {
      /* 1 → 2: chỉ MỞ KHOÁ. Nội dung giữ nguyên tuyệt đối — người dùng đang
         nhìn một câu và bấm "Tự do" để sửa chính câu đó. */
      onChange((prev) => ({ ...prev, mode: "free" }));
      return;
    }

    /* 2 → 1: quay về khuôn. Nếu người dùng đã viết thêm gì ngoài khung template
       thì PHẢI hỏi — reset là xoá chữ của họ. `freeText` sai về phía an toàn:
       nó thà hỏi thừa còn hơn xoá âm thầm (xem chú thích của nó). */
    if (freeText(block.doc as PromptDocNode, SCAFFOLDS[block.kind])) {
      setAskReset(true);
      return;
    }
    onChange((prev) => ({ ...prev, mode: "template" }));
  };

  const confirmReset = () => {
    /* Dựng lại template SẠCH. Giá trị pill KHÔNG được giữ lại ở đây một cách
       thủ công: câu tự do có thể đã bị xoá bớt pill, thêm pill lạ, đảo thứ tự —
       không có phép ánh xạ nào đúng cho mọi ca. Quay về template = quay về đúng
       cái khuôn, và ta đã hỏi trước khi làm. */
    onChange((prev) => ({ ...prev, mode: "template", doc: FRESH_DOC[prev.kind]() }));
    setResetToken((n) => n + 1);
    setAskReset(false);
  };

  return (
    <>
      <div className="mb-3">
        <ModeToggle mode={block.mode} onPick={pick} />
      </div>

      {askReset && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2 border border-warn/40 bg-warn/[var(--kg-tint-a)] px-3 py-2">
          <span className="text-body text-fg-strong">Quay về template sẽ bỏ chỉnh sửa tự do.</span>
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

      <div data-prompt-lab="">
        <BlockEditor
          doc={block.doc}
          mode={block.mode}
          resetToken={resetToken + reloadSignal}
          placeholder={PLACEHOLDER[block.kind]}
          onChange={(doc) => onChange((prev) => ({ ...prev, doc }))}
        />
      </div>

      {/**
       * Ô GHI CHÚ — ngoài câu, và có mặt ở CẢ HAI chế độ.
       *
       * Ngoài câu vì ở chế độ khuôn người dùng không gõ được vào giữa câu, nên mọi
       * thứ template không hỏi tới sẽ không có đường nào tới máy vẽ (xem
       * `DocBlock.note`). Ở cả hai chế độ vì nó KHÔNG phải bản thay thế của chế độ
       * tự do: tự do là viết lại cả câu, còn đây là nói thêm một điều bên cạnh câu
       * — và nó đi vào một ô khác của contract (`sheet.directive`, không phải
       * `promptOverride`). Ẩn nó đi ở chế độ tự do là làm chữ người dùng đã gõ biến
       * mất khỏi màn hình mà vẫn tiếp tục được gửi đi vẽ.
       *
       * Dùng lại `NoteField` của dòng element/dáng: cùng hình dạng, cùng vòng focus,
       * cùng chỗ đứng "một tầng riêng, rộng hết thẻ". Ba ô ghi chú của lab trông
       * khác nhau là ba lần người dùng phải học lại cùng một thứ.
       */}
      <div className="mt-3">
        <NoteField
          label={TITLE[block.kind]}
          placeholder="Ghi chú thêm cho tấm này (tuỳ chọn)…"
          value={block.note}
          onChange={(note) => onChange((prev) => ({ ...prev, note }))}
        />
      </div>
    </>
  );
}

/** Ruột + vỏ `BlockCard` — hình dạng mà màn lab cũ (`/lab/prompt-composer`, xoá
 *  07/09/2026) dùng. Khu soạn `/k/:id` chỉ lấy phần RUỘT, xem `CanvasBlock`. */
export function DocBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: DocBlock;
  onChange: (updater: (prev: DocBlock) => DocBlock) => void;
  onDelete: () => void;
}) {
  return (
    <BlockCard title={TITLE[block.kind]} badge={<ModeBadge mode={block.mode} />} onDelete={onDelete}>
      <DocBlockBody block={block} onChange={onChange} />
    </BlockCard>
  );
}
