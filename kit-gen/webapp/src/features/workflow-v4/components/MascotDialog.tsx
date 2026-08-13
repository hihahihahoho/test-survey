import * as React from "react";
import { ImagePlus, Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/endpoints";
import type { WorkflowMascot } from "../lib/model";
import { useWorkflowProjectId } from "../lib/model";
import { SharedMascotPicker, SharedReferencePicker } from "./SharedReferencePicker";

/**
 * ══ UI-FIX §3b · CỘNG TỪNG NHÂN VẬT MỘT ═════════════════════════════════════
 *
 * Bước Mascot cũ là một form inline cho ĐÚNG MỘT con ([Tên] [Mô tả] [vùng thả ảnh]),
 * trong khi màn Nhận dạng thương hiệu và thư viện Mascot đều đã là "danh sách thẻ +
 * modal". Ba màn nói về cùng một khái niệm bằng ba hình thái là ba thứ phải học.
 *
 * ⚠️ VÌ SAO KHÔNG IMPORT THẲNG `UploadDialog` CỦA `features/home/LibraryScreen`:
 * cái đó ghi vào **thư viện dùng chung** (`useAddLibraryItem` ⇒ `library/items`), còn
 * ở đây nhân vật thuộc về RIÊNG dự án và ảnh phải nằm trong `projects/<id>/refs/`.
 * Hai đích ghi khác nhau ⇒ không phải cùng một component, dù trông giống. Bản wizard
 * này giữ nguyên bố cục và câu chữ của bản kia để hai màn vẫn đọc như một.
 * (Và theo lời dặn của chủ dự án: KHÔNG sửa file của feature brand.)
 */
export function MascotDialog({
  open, onOpenChange, mascot, onSave, uploadRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = thêm mới. */
  mascot: WorkflowMascot | null;
  onSave: (input: { name: string; description: string; ref: { name: string } | null }) => void;
  /** Đưa ảnh lên đĩa dự án và trả về TÊN agent đặt (`char-*.png`). */
  uploadRef: (file: File) => Promise<string | null>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [ref, setRef] = React.useState<{ name: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(mascot?.name ?? "");
    setDescription(mascot?.description ?? "");
    setRef(mascot?.ref ?? null);
    setBusy(false);
  }, [open, mascot]);

  /* Ảnh đi lên đĩa NGAY khi chọn, không đợi bấm Lưu: tên file do agent đặt và ta cần
     chính cái tên đó để gắn cho nhân vật này (§W3-3 — bản nháp chỉ là tiếng vọng). */
  const takeFile = (files: FileList | File[] | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    void uploadRef(file).then((saved) => {
      if (saved) setRef({ name: saved });
      setBusy(false);
    });
  };

  const canSave = name.trim().length > 0 && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{mascot ? "Sửa nhân vật" : "Thêm nhân vật"}</DialogTitle>
          <DialogDescription>Tên, mô tả và một ảnh tham chiếu để giữ nhận diện ở mọi dáng.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-mascot-name">Tên nhân vật</Label>
            <Input id="wizard-mascot-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Mèo bạc hà" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-mascot-description">Mô tả nhân vật</Label>
            <Textarea id="wizard-mascot-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Khuôn mặt, màu, trang phục…" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Ảnh tham chiếu</Label>
              <div className="flex flex-wrap gap-2">
                <SharedMascotPicker onPick={(file, item) => { setName((current) => current || item.name); takeFile([file]); }} />
                <SharedReferencePicker group="mascot-reference" onPick={(file) => takeFile([file])} />
              </div>
            </div>
            <div className="dropfield mascot-dropzone">
              <ImageDropzone
                label="Kéo ảnh nhân vật vào đây"
                description="Một ảnh rõ mặt, đủ trang phục để giữ nhận diện ở mọi dáng"
                state={busy ? "uploading" : ref ? "done" : "idle"}
                onFiles={takeFile}
              />
              {/* §W2B-6 — thứ hiện ra sau khi thả nằm TRONG khung `.dropfield`, không
                  trôi ra dưới nó như rác. Ở đây là ảnh vừa gắn cho riêng nhân vật này. */}
              {ref ? (
                <span className="flex items-center gap-3 text-caption text-fg-muted">
                  <MascotThumb name={ref.name} />
                  <span className="min-w-0 truncate">Đã gắn ảnh <code>{ref.name}</code></span>
                </span>
              ) : null}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave({ name: name.trim(), description: description.trim(), ref });
              onOpenChange(false);
            }}
          >
            {busy ? "Đang tải ảnh…" : mascot ? "Lưu thay đổi" : "Thêm nhân vật"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ảnh ref của dự án — cùng cách đọc như `RefChips` (đĩa là nguồn, không phải bản nháp). */
function MascotThumb({ name }: { name: string | null }) {
  const projectId = useWorkflowProjectId();
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!name || !projectId) { setSrc(null); return; }
    let alive = true;
    let url: string | null = null;
    api.refs.blob(projectId, name)
      .then((blob) => { if (alive) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => setSrc(null));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [projectId, name]);
  return (
    <span className="mascot-card-art">
      {src ? <img src={src} alt="" /> : <User className="size-5" aria-hidden />}
    </span>
  );
}

/** Một nhân vật trong danh sách — có SỬA và có XOÁ, đúng yêu cầu của thẻ. */
export function MascotCard({ mascot, index, onEdit, onRemove }: {
  mascot: WorkflowMascot;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const label = mascot.name.trim() || `Nhân vật ${index + 1}`;
  return (
    <>
      <article className="mascot-card">
        <MascotThumb name={mascot.ref?.name ?? null} />
        <div className="min-w-0 flex-1">
          <strong>{label}</strong>
          <p>{mascot.description.trim() || (mascot.ref ? "Đã có ảnh tham chiếu" : "Chưa có mô tả và ảnh mẫu")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Sửa ${label}`} onClick={onEdit}><Pencil aria-hidden /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Xoá ${label}`} onClick={() => setConfirmOpen(true)}><Trash2 aria-hidden /></Button>
        </div>
      </article>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhân vật “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>Chỉ nhân vật này rời khỏi dự án. Ảnh tham chiếu vẫn nằm trong dự án cho tới khi bạn xoá riêng.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Xoá nhân vật</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Ô rỗng mời thêm con đầu tiên — cùng khuôn với thư viện Mascot. */
export function MascotEmpty({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className="mascot-empty" onClick={onAdd}>
      <ImagePlus className="size-6" aria-hidden />
      <span>Chưa có nhân vật nào — bấm để thêm nhân vật đầu tiên.</span>
    </button>
  );
}
