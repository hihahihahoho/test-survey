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
 */

const TITLE: Record<DocBlock["kind"], string> = {
  background: "Cảnh nền",
  mascot: "Nhân vật",
};

const PLACEHOLDER: Record<DocBlock["kind"], string> = {
  background: "Mô tả cảnh nền… (gõ / để chèn pill)",
  mascot: "Mô tả nhân vật… (gõ / để chèn pill)",
};

const FRESH_DOC: Record<DocBlock["kind"], () => JSONContent> = {
  background: backgroundDoc,
  mascot: mascotDoc,
};

export function DocBlockView({
  block,
  onChange,
  onDelete,
}: {
  block: DocBlock;
  /** Nhận HÀM cập nhật, không nhận giá trị — xem `updateBlock` trong PromptComposerScreen. */
  onChange: (updater: (prev: DocBlock) => DocBlock) => void;
  onDelete: () => void;
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
    <BlockCard title={TITLE[block.kind]} badge={<ModeBadge mode={block.mode} />} onDelete={onDelete}>
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
          resetToken={resetToken}
          placeholder={PLACEHOLDER[block.kind]}
          onChange={(doc) => onChange((prev) => ({ ...prev, doc }))}
        />
      </div>
    </BlockCard>
  );
}
