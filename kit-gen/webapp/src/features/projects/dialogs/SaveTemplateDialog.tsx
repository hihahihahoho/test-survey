import * as React from "react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRefs, useSaveTemplate } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail, toastSuccess } from "../lib/feedback";
import { InfoNotice, InlineError, OfflineNotice } from "./parts";

/**
 * «LƯU LÀM TEMPLATE» — chụp phần dựng của dự án (mọi thẻ, cài đặt, ảnh tham chiếu) để
 * mở dự án mới từ đó ở hộp Tạo dự án.
 *
 * Chủ sản phẩm (30/09/2026): «…sẽ có nút save template (bao gồm cả save ảnh,
 * setting...), khi tạo mới 1 project -> sẽ có thể chọn template sẵn».
 *
 * ╔══ CHỤP BẢN MỚI NHẤT, KHÔNG PHẢI BẢN CỦA 600ms TRƯỚC ═════════════════════╗
 * ║ Agent chụp `workflow-draft.json` TRÊN ĐĨA. Màn soạn tự lưu sau 600ms im   ║
 * ║ phím, nên người vừa gõ xong một chữ rồi bấm «Lưu template» sẽ có một     ║
 * ║ template THIẾU đúng chữ ấy — không lỗi, không báo, chỉ lộ ra khi mở dự án ║
 * ║ mới. Nên trước khi gọi agent: `flush()` bản soạn, rồi ĐỢI tới khi không   ║
 * ║ còn gì bẩn / đang bay. Ghi hỏng ⇒ dừng và nói ra, không chụp bản cũ.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `composer` chỉ có khi mở từ màn soạn (nơi bản soạn đang sống trong RAM). Mở từ menu
 * thẻ ở trang chủ thì dự án không mở ở đâu cả — bản trên đĩa là bản mới nhất.
 */
export interface ComposerSnapshotState {
  dirty: boolean;
  saving: boolean;
  saveError: unknown;
  loadError: unknown;
  conflict: { updatedAt: string | null } | null;
  /** Ô nhớ còn bản nháp wizard cũ chưa được thay ⇒ agent sẽ từ chối. */
  legacyDraft?: boolean;
  flush: () => void;
}

/** Đợi bản soạn ghi xong tối đa bao lâu trước khi bỏ cuộc và nói ra. */
export const FLUSH_WAIT_MS = 20_000;

/** Lý do KHÔNG lưu được lúc này — `null` = lưu được. Dùng chung cho nút ở màn soạn. */
export function saveTemplateBlockReason(composer: ComposerSnapshotState | undefined): string | null {
  if (!composer) return null;
  // kg-allow-jargon: «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt («save template»), không phải chữ kỹ thuật lọt ra.
  if (composer.loadError) return "Chưa đọc được bản soạn của dự án từ máy — chưa lưu làm template được.";
  if (composer.conflict) return "Bản soạn đã được lưu ở tab hoặc máy khác — tải bản mới nhất trước đã.";
  if (composer.legacyDraft) return "Dự án còn bản nháp kiểu cũ — trả lời câu hỏi «Thay bản nháp cũ» trước đã.";
  return null;
}

export function SaveTemplateDialog({
  project, open, onOpenChange, gate, composer, onSaved,
}: {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gate: Gate;
  composer?: ComposerSnapshotState;
  onSaved?: () => void;
}) {
  const save = useSaveTemplate(project?.id ?? "");
  const refs = useRefs(open && project ? project.id : null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);
  const [stuck, setStuck] = React.useState(false);
  /** `flushing` = đã bảo bản soạn ghi, đang đợi nó xong rồi mới gọi agent. */
  const [phase, setPhase] = React.useState<"idle" | "flushing" | "saving">("idle");

  /* Nạp lại ô khi MỞ (hoặc đổi dự án) — khoá theo `project.id`, KHÔNG theo object
     `project`: lượt tự lưu mà chính `flush()` bắn ra sẽ mời lại chi tiết dự án, ra một
     object mới, và khoá theo object là xoá sạch ô + huỷ ngang lượt đang đợi. */
  const projectRef = React.useRef(project);
  projectRef.current = project;
  const projectId = project?.id ?? null;
  React.useEffect(() => {
    const p = projectRef.current;
    if (!open || !p) return;
    setName(p.name.slice(0, 80));
    setDescription(p.description ?? "");
    setNameError(null);
    setFailure(null);
    setStuck(false);
    setPhase("idle");
  }, [open, projectId]);

  const blocked = saveTemplateBlockReason(composer);

  const post = React.useCallback(async () => {
    if (!project) return;
    setPhase("saving");
    try {
      const tpl = await save.mutateAsync({ name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) });
      setPhase("idle");
      onOpenChange(false);
      // kg-allow-jargon: tên tính năng «template», như trên.
      toastSuccess(`Đã lưu template "${tpl.name}"`, "Chọn nó ở «Bắt đầu từ» khi tạo dự án mới.");
      onSaved?.();
    } catch (error) {
      setPhase("idle");
      setFailure(error);
    }
  }, [project, save, name, description, onOpenChange, onSaved]);

  /* Cửa đợi: chạy lại mỗi lần trạng thái ghi của bản soạn đổi. Hết bẩn và không còn
     lượt nào đang bay ⇒ bản trên đĩa là bản trên màn ⇒ gọi agent. Lượt ghi hỏng
     (còn bẩn, không còn bay, có lỗi) ⇒ dừng, KHÔNG chụp bản cũ. */
  const postRef = React.useRef(post);
  postRef.current = post;
  const hasComposer = Boolean(composer);
  const dirty = composer?.dirty ?? false;
  const saving = composer?.saving ?? false;
  const saveError = composer?.saveError ?? null;
  React.useEffect(() => {
    if (phase !== "flushing") return;
    if (hasComposer && saving) return;
    if (hasComposer && dirty) {
      if (saveError) { setPhase("idle"); setFailure(saveError); }
      return;
    }
    void postRef.current();
  }, [phase, hasComposer, dirty, saving, saveError]);

  React.useEffect(() => {
    if (phase !== "flushing") return;
    const t = setTimeout(() => { setPhase("idle"); setStuck(true); }, FLUSH_WAIT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (!project) return null;

  const refCount = refs.data?.items.length;
  const busy = phase !== "idle";
  const why = gate.readOnly ? gate.reason : blocked;

  const submit = () => {
    if (busy || why) return;
    const n = name.trim();
    // kg-allow-jargon: tên tính năng «template», như trên.
    if (!n) { setNameError("Đặt tên cho template."); return; }
    setFailure(null);
    setStuck(false);
    setPhase("flushing");
    composer?.flush();
  };

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent size="sm" onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Lưu làm template</DialogTitle>
          <DialogDescription>Tạo dự án mới từ template này ở hộp «Tạo dự án».</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}
          {!gate.readOnly && blocked && <OfflineNotice text={blocked} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">Tên template</Label>
            <Input
              id="tpl-name"
              value={name}
              autoFocus
              maxLength={80}
              onChange={(e) => { setName(e.target.value); setNameError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              aria-invalid={Boolean(nameError) || undefined}
            />
            {nameError && <p role="alert" className="text-caption text-danger">{nameError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-description">Mô tả <span className="font-normal text-fg-muted">(không bắt buộc)</span></Label>
            <Textarea id="tpl-description" rows={2} value={description} maxLength={2000}
              onChange={(e) => setDescription(e.target.value)} />
          </div>

          <InfoNotice>
            {typeof refCount === "number"
              ? `Lưu mọi thẻ, cài đặt và ${refCount} ảnh tham chiếu. Ảnh đã vẽ không đi theo.`
              : "Lưu mọi thẻ, cài đặt và ảnh tham chiếu. Ảnh đã vẽ không đi theo."}
          </InfoNotice>

          {stuck && (
            <p role="alert" className="text-caption text-danger">
              Bản soạn chưa lưu xong nên chưa chụp được template. Đợi dòng «Đã lưu» rồi thử lại.
            </p>
          )}
          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Huỷ</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={Boolean(why)}
            title={why ?? undefined}
            onClick={submit}
          >
            {phase === "flushing" ? "Đang lưu bản soạn…" : "Lưu template" /* kg-allow-jargon: tên tính năng, xem trên */}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
