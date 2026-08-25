import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { backgroundDoc, mascotDoc, SCAFFOLDS } from "../lib/doc-templates";
import { freeText, type PromptDocNode } from "../lib/serialize";
import type { BlockMode, DocBlock } from "../lib/composer-model";
import { BlockCard, ModeBadge, ModeToggle } from "./BlockCard";
import { BlockEditor } from "./BlockEditor";

/**
 * DocBlockView — card cho block CÓ CÂU CHỮ (Background · Nhân vật).
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

export const DOC_BLOCK_TITLE: Record<DocBlock["kind"], string> = {
  background: "Cảnh nền",
  mascot: "Nhân vật",
};

const TITLE = DOC_BLOCK_TITLE;

const PLACEHOLDER: Record<DocBlock["kind"], string> = {
  background: "Mô tả cảnh nền… (gõ / để chèn pill)",
  mascot: "Mô tả nhân vật… (gõ / để chèn pill)",
};

const FRESH_DOC: Record<DocBlock["kind"], () => JSONContent> = {
  background: backgroundDoc,
  mascot: mascotDoc,
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
   * Ai cần: màn thật sửa `block.doc` mà KHÔNG qua editor (bấm pill [dáng] trên
   * thanh công cụ của thẻ, dán đường dẫn ảnh pose vừa chụp). Không có tín hiệu
   * này thì state đã đổi mà chữ trong ô soạn vẫn là chữ cũ — hai nguồn sự thật
   * lệch nhau ngay trước mắt người dùng.
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
    </>
  );
}

/** Ruột + vỏ `BlockCard` — hình dạng mà route lab `/lab/prompt-composer` dùng. */
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
