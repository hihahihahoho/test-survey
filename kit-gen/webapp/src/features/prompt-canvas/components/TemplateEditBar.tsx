import * as React from "react";
import { ArrowLeft, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/common";
import { presentError } from "@/lib/api/errors";
import type { TemplateEditInfo } from "@/lib/types/api";
import { InlineError } from "@/features/projects/dialogs/parts";
import { errorDetail } from "@/features/projects/lib/feedback";
import type { TemplateEditActions } from "../lib/template-edit";

/**
 * BĂNG «ĐANG SỬA TEMPLATE» — đứng dính ngay dưới header suốt lúc cuộn.
 *
 * ╔══ VÌ SAO DÍNH, VÀ VÌ SAO HAI NÚT KẾT PHIÊN Ở ĐÂY ═══════════════════════╗
 * ║ Màn này trông Y HỆT màn soạn một dự án — cố ý, người dùng đã quen nó. Cái ║
 * ║ giá: không có băng này thì không có gì trên màn nói rằng họ đang sửa một  ║
 * ║ TEMPLATE, và rằng thứ họ gõ chỉ tới được template khi họ bấm lưu. Cuộn    ║
 * ║ xuống thẻ thứ năm là băng trôi mất nếu nó không dính. Hai nút kết phiên   ║
 * ║ đứng cạnh tên template vì chúng nói về đúng thứ ấy, và «Lưu vào template» ║
 * ║ là nút primary DUY NHẤT của màn ở chế độ này (nút Vẽ đã rời đi).         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Lỗi của lượt lưu hiện NGAY TRONG BĂNG (§5.5: toast không phải nơi duy nhất báo lỗi) và
 * không động vào chữ trên màn. Phiên biến mất (404) ⇒ băng đổi hẳn thành lời chỉ đường
 * về «Template dự án» — thử lại ở đây không cứu được gì.
 */

/** Chữ của băng. «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt — mỗi dòng tự xin miễn. */
const COPY = {
  heading: (name: string) => `Đang sửa template «${name}»`, // kg-allow-jargon: tên tính năng
  sub: "Mọi chỗ sửa được tự lưu nháp. Bấm «Lưu vào template» để cập nhật template — dự án đã tạo từ nó trước đây không đổi.", // kg-allow-jargon: tên tính năng
  save: "Lưu vào template", // kg-allow-jargon: tên tính năng
  saving: "Đang lưu bản soạn…",
  committing: "Đang lưu vào template…", // kg-allow-jargon: tên tính năng
  discard: "Huỷ thay đổi",
  discardTitle: "Huỷ mọi thay đổi?",
  discardBody: (name: string) => `Mọi chỗ sửa từ lúc mở sẽ bị bỏ. Template «${name}» giữ nguyên như trước khi sửa.`, // kg-allow-jargon: tên tính năng
  keepEditing: "Tiếp tục sửa",
  afterFailure: "Chỗ bạn đã sửa vẫn còn nguyên trên màn và template chưa bị thay. Xử lý chỗ được nêu rồi bấm «Lưu vào template» lần nữa.", // kg-allow-jargon: tên tính năng
  /* Lời chữa RIÊNG cho chế độ này: bảng lỗi chung nói với người đang «Lưu làm template»
     từ một dự án — ở đây không có dự án nào để «mở», chỉ có chính màn đang đứng. */
  noDraft: "Phiên này chưa có bản soạn nào được lưu. Thêm hoặc sửa một thẻ, đợi dòng «Đã lưu» hiện ra, rồi bấm «Lưu vào template» lần nữa.", // kg-allow-jargon: tên tính năng
  goneNote: "Chỗ sửa nào chưa kịp tự lưu ở tab này không còn chỗ để lưu vào.",
  back: "Về Template dự án", // kg-allow-jargon: tên màn
} as const;

export function TemplateEditBar({ info, actions, saveBlocked, discardBlocked, gone }: {
  info: TemplateEditInfo;
  actions: TemplateEditActions;
  /** Lý do chưa lưu được lúc này (công cụ local tắt, bản soạn đang xung đột…) — `null` = được. */
  saveBlocked: string | null;
  discardBlocked: string | null;
  /** Phiên đã biến mất — dự án làm việc 404 hoặc agent nói không còn phiên. */
  gone: boolean;
}) {
  const headingId = React.useId();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { phase } = actions;
  const busy = phase !== "idle";
  const name = info.templateName;

  if (gone) return <TemplateEditGone onBack={actions.toTemplates} />;

  const saveLabel = phase === "saving" ? COPY.saving : phase === "committing" ? COPY.committing : COPY.save;
  const failure = actions.saveFailure;
  const failureCode = failure != null ? presentError(failure).code : null;

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      data-template-edit-bar=""
      /* `bg-surface` ĐẶC, không tint trong suốt: băng dính đè lên nội dung đang cuộn qua,
         và một nền trong suốt là chữ của băng chồng lên chữ của thẻ bên dưới. */
      className="sticky top-14 z-sticky flex flex-col gap-3 rounded-3 border border-accent/60 bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <PencilLine aria-hidden className="size-5 shrink-0 text-accent-text" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-subtitle text-fg-strong" title={name}>{COPY.heading(name)}</h2>
          {/* Không in «mở phiên lúc…» ở đây: vừa bấm vào template mà đọc «Mở phiên vừa xong»
              là một câu thừa. Mốc ấy chỉ có ích khi QUAY LẠI một bản dở — và hộp «Tiếp tục bản
              sửa dở?» ở màn Template dự án đã nói nó đúng lúc ấy. */}
          <p className="text-caption text-fg-muted">{COPY.sub}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || Boolean(discardBlocked)}
            title={discardBlocked ?? undefined}
            onClick={() => { actions.clearDiscardFailure(); setConfirmOpen(true); }}
          >
            {COPY.discard}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={phase === "saving" || phase === "committing"}
            disabled={busy || Boolean(saveBlocked)}
            title={saveBlocked ?? undefined}
            onClick={() => void actions.save()}
          >
            {saveLabel}
          </Button>
        </div>
      </div>

      {failure != null && (
        <div className="flex flex-col gap-2">
          <InlineError error={failure} detail={errorDetail(failure)} />
          <p className="text-caption text-fg-muted">
            {failureCode === "NO_COMPOSER_DRAFT" ? COPY.noDraft : COPY.afterFailure}
          </p>
        </div>
      )}

      <ConfirmDestructive
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={phase === "discarding"}
        title={COPY.discardTitle}
        description={COPY.discardBody(name)}
        actionLabel={COPY.discard}
        cancelLabel={COPY.keepEditing}
        onConfirm={() => void actions.discard()}
      >
        {actions.discardFailure != null && (
          <InlineError error={actions.discardFailure} detail={errorDetail(actions.discardFailure)} />
        )}
      </ConfirmDestructive>
    </section>
  );
}

/**
 * PHIÊN KHÔNG CÒN — dự án làm việc đã bị xoá (lưu/bỏ ở tab khác). Chỉ còn một việc có
 * nghĩa: về «Template dự án» và mở lại. Copy lấy từ bảng lỗi (`TEMPLATE_EDIT_NOT_FOUND`),
 * không viết lời thứ hai cho cùng một chuyện.
 */
export function TemplateEditGone({ onBack }: { onBack: () => void }) {
  const v = presentError({ code: "TEMPLATE_EDIT_NOT_FOUND" });
  return (
    <section
      role="alert"
      aria-label={v.title}
      className="sticky top-14 z-sticky flex flex-wrap items-center gap-4 rounded-3 border border-warn/60 bg-surface px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-subtitle text-fg-strong">{v.title}</p>
        <p className="text-body text-fg-muted">{v.explain} {COPY.goneNote}</p>
      </div>
      <Button variant="primary" size="sm" onClick={onBack}>
        <ArrowLeft aria-hidden />
        {COPY.back}
      </Button>
    </section>
  );
}
