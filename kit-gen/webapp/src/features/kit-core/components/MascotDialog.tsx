import * as React from "react";
import { ImagePlus, Pencil, RefreshCw, Trash2, User } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/endpoints";
import type { LibraryItem } from "@/lib/types";
import type { WorkflowMascot } from "../lib/model";
import { useWorkflowProjectId } from "../lib/model";
import { EXPRESSIONS, OUTFIT_THEMES, isPresetPhrase, poseLabel, type PhraseOption } from "../lib/poses";
import { normalizedPoseIds } from "../lib/user-library";
import { SharedMascotPicker, SharedReferencePicker } from "./SharedReferencePicker";

/**
 * ══ MỘT Ô "CHỌN PRESET HOẶC TỰ GÕ", DÙNG BA CHỖ ═════════════════════════════
 *
 * Biểu cảm của từng dáng · trang phục riêng của một con · trang phục chung của cả bộ —
 * ba chỗ, cùng một hình dạng dữ liệu (một cụm TIẾNG ANH đi thẳng vào prompt, chọn sẵn
 * hoặc tự viết). Chép ra ba bản là ba chỗ để luật "rỗng nghĩa là gì" trôi lệch nhau.
 *
 * Vì sao có `__custom__` mà không phải chỉ một ô nhập tự do: 90% lượt dùng là một trong
 * mấy preset, và bắt người Việt tự nghĩ ra "a determined confident expression" thì họ sẽ
 * gõ tiếng Việt — thứ máy vẽ đọc kém hơn hẳn. Ô tự gõ vẫn còn nguyên cho 10% còn lại.
 *
 * ⚠️ Radix `SelectItem` KHÔNG nhận `value=""` (nó ném) — nên "không đặt" phải mang một
 * sentinel `__none__`, và sentinel đó KHÔNG BAO GIỜ được rò ra ngoài: `onChange` chỉ
 * phát ra chuỗi rỗng hoặc chính cụm tiếng Anh.
 */
const NONE = "__none__";
const CUSTOM = "__custom__";

export function PhraseSelect({ id, label, options, value, emptyLabel, placeholder, onChange }: {
  id: string;
  label: string;
  options: readonly PhraseOption[];
  /** Cụm tiếng Anh đang lưu. Rỗng = chưa đặt. */
  value: string;
  /** Câu cho lựa chọn "chưa đặt" — mỗi chỗ gọi nói một nghĩa khác nhau. */
  emptyLabel: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const preset = isPresetPhrase(options, value);
  /* Người dùng vừa bấm "Tự gõ…" nhưng chưa gõ chữ nào ⇒ giá trị vẫn rỗng, mà ô nhập
     phải hiện ra. Không có cờ này thì cú bấm ấy trông như không có tác dụng gì. */
  const [typing, setTyping] = React.useState(false);
  const custom = typing || (value.trim() !== "" && !preset);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={custom ? CUSTOM : value.trim() === "" ? NONE : value}
        onValueChange={(next) => {
          if (next === CUSTOM) { setTyping(true); return; }
          setTyping(false);
          onChange(next === NONE ? "" : next);
        }}
      >
        <SelectTrigger id={id} aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{emptyLabel}</SelectItem>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          <SelectItem value={CUSTOM}>Tự gõ…</SelectItem>
        </SelectContent>
      </Select>
      {custom ? (
        <Input
          aria-label={`${label} — tự gõ`}
          value={preset ? "" : value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}

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
  open, onOpenChange, mascot, poses, onSave, uploadRef, onAdoptPoses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = thêm mới. */
  mascot: WorkflowMascot | null;
  /** Dáng ĐANG ĐƯỢC CHỌN của dự án — mỗi dáng một hàng biểu cảm. */
  poses: readonly string[];
  onSave: (input: Omit<WorkflowMascot, "id">) => void;
  /** Đưa ảnh lên đĩa dự án và trả về TÊN agent đặt (`char-*.png`). */
  uploadRef: (file: File) => Promise<string | null>;
  /**
   * Áp BỘ DÁNG ĐÃ LƯU của một mascot lấy từ thư viện dùng chung.
   *
   * Chỉ được gọi khi mascot ấy THẬT SỰ có bộ dáng riêng — xem `pickFromLibrary`.
   */
  onAdoptPoses: (poses: string[]) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [ref, setRef] = React.useState<{ name: string } | null>(null);
  const [outfitTheme, setOutfitTheme] = React.useState("");
  const [poseExpressions, setPoseExpressions] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  /** Ô chọn file cho nút "Đổi ảnh" — hàng preview không có vùng thả để bấm vào. */
  const replaceInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(mascot?.name ?? "");
    setDescription(mascot?.description ?? "");
    setRef(mascot?.ref ?? null);
    /* Bản nháp ghi từ build cũ KHÔNG có hai trường này — nhận mặc định "chưa đặt" thay
       vì `undefined` chạy tiếp vào ô nhập (React sẽ đổi input từ controlled sang không,
       và cảnh báo ấy là dấu hiệu của một trường sắp rơi mất). */
    setOutfitTheme(mascot?.outfitTheme ?? "");
    setPoseExpressions({ ...(mascot?.poseExpressions ?? {}) });
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

  /**
   * ══ MASCOT TÁI SỬ DỤNG — LẤY CẢ CON, KHÔNG CHỈ LẤY CÁI ẢNH ═════════════════
   *
   * Một mascot trong thư viện dùng chung mang theo BA thứ: tên, ảnh, và **bộ dáng
   * đã lưu của nó**. Bản đầu của modal này chỉ lấy hai thứ đầu ⇒ chọn "Mèo mẫu"
   * (2 dáng) xong vẫn đứng ở 19 dáng mặc định: app lặng lẽ đặt hàng 5 tấm dáng cho
   * một con mà thư viện nói rõ chỉ cần 1. Đó là hồi quy, không phải đơn giản hoá.
   *
   * QUYẾT ĐỊNH khi bộ dáng của mascot đá nhau với mặc định "chọn hết 19" (UI-FIX §3a):
   *   · mascot CÓ bộ dáng đã lưu ⇒ **bộ của nó THẮNG** (nó là dữ liệu cụ thể về đúng
   *     con này; "chọn hết" chỉ là phỏng đoán khi chưa biết gì);
   *   · mascot KHÔNG có bộ dáng nào ⇒ **giữ nguyên lựa chọn đang có**, tuyệt đối không
   *     `set([])` — một mảng rỗng của thư viện không phải lời yêu cầu "xoá hết dáng".
   * Cả hai đường đều để người dùng chỉnh tiếp ngay bên dưới, không khoá gì.
   */
  const pickFromLibrary = (file: File, item: LibraryItem) => {
    setName(item.name);
    setDescription((current) => current || item.description);
    takeFile([file]);
    const poses = normalizedPoseIds(item.poses ?? []);
    if (poses.length > 0) onAdoptPoses(poses);
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
          {/* Ô mô tả GIỮ NGUYÊN vai trò của nó — nhận dạng cố định của con vật: loài,
              khuôn mặt, màu, tỉ lệ. Hai thứ THAY ĐỔI theo ngữ cảnh thì tách ra thành ô
              riêng ngay dưới đây: trang phục đổi theo chiến dịch, nét mặt đổi theo dáng.
              Trộn cả ba vào một ô là lý do bản cũ không có cách nào nói "vẫn con này, mặc
              đồ Tết, dáng buồn thì mặt buồn". */}
          <div className="space-y-2">
            <Label htmlFor="wizard-mascot-description">Mô tả nhân vật</Label>
            <Textarea id="wizard-mascot-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Loài, khuôn mặt, màu, tỉ lệ…" />
          </div>
          <PhraseSelect
            id="wizard-mascot-outfit"
            label="Trang phục riêng"
            options={OUTFIT_THEMES}
            value={outfitTheme}
            emptyLabel="— dùng chủ đề chung —"
            placeholder="a red bomber jacket with a gold zipper"
            onChange={setOutfitTheme}
          />
          {/* Chỉ những dáng ĐANG ĐƯỢC CHỌN mới có hàng — dựng đủ 19 hàng là bắt người
              dùng cuộn qua 7 dáng họ đã bỏ tick để tới dáng thứ 8. */}
          {poses.length > 0 ? (
            <div className="space-y-2">
              <p className="field-label mb-0">Biểu cảm theo dáng</p>
              <p className="text-caption text-fg-muted">
                Bỏ trống là giữ nguyên câu mặc định của dáng đó — dự án cũ không đổi gì.
              </p>
              <div className="space-y-3">
                {poses.map((pose) => (
                  <PhraseSelect
                    key={pose}
                    id={`wizard-mascot-face-${pose}`}
                    label={poseLabel(pose)}
                    options={EXPRESSIONS}
                    value={poseExpressions[pose] ?? ""}
                    emptyLabel="— mặc định —"
                    placeholder="a sleepy half-closed-eyes look"
                    onChange={(next) => setPoseExpressions((current) => {
                      const draft = { ...current };
                      if (next.trim()) draft[pose] = next; else delete draft[pose];
                      return draft;
                    })}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Ảnh tham chiếu</Label>
              <div className="flex flex-wrap gap-2">
                <SharedMascotPicker onPick={pickFromLibrary} />
                <SharedReferencePicker group="mascot-reference" onPick={(file) => takeFile([file])} />
              </div>
            </div>
            {/*
              ══ MỘT HÀNG PREVIEW, KHÔNG PHẢI HAI ═══════════════════════════════
              Bản cũ hiện ĐỒNG THỜI hai thứ nói cùng một điều: (a) thumbnail cục bộ
              do `ImageDropzone` tự vẽ từ `File` vừa chọn (kèm nút ✕), và (b) một
              thumbnail thứ hai + dòng "Đã gắn ảnh <tên>" ngay bên dưới. Hai ảnh
              giống hệt nhau xếp chồng, và nút ✕ của (a) chỉ xoá bản nháp cục bộ
              trong khi ảnh đã nằm trên đĩa dự án ⇒ nó nói dối.

              Nay: có ảnh ⇒ CHỈ hàng preview (nguồn là TÊN AGENT ĐẶT, tức đĩa);
              chưa có ảnh ⇒ CHỈ vùng thả. `showLocalPreview={false}` tắt hẳn bản
              nháp cục bộ để không bao giờ có hai nguồn sự thật cùng lúc.
            */}
            <div className="dropfield mascot-dropzone">
              {ref ? (
                <div className="flex items-center gap-3 rounded-3 border border-line-subtle bg-raised p-2">
                  <MascotThumb name={ref.name} />
                  <span className="min-w-0 flex-1 truncate text-caption text-fg" title={ref.name}>{ref.name}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => replaceInput.current?.click()}>
                    <RefreshCw aria-hidden />{busy ? "Đang tải…" : "Đổi ảnh"}
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Xoá ảnh tham chiếu" disabled={busy} onClick={() => setRef(null)}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ) : (
                <ImageDropzone
                  label="Kéo ảnh nhân vật vào đây"
                  description="Một ảnh rõ mặt, đủ trang phục để giữ nhận diện ở mọi dáng"
                  state={busy ? "uploading" : "idle"}
                  showLocalPreview={false}
                  onFiles={takeFile}
                />
              )}
              <input
                ref={replaceInput}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => { takeFile(event.target.files); event.currentTarget.value = ""; }}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave({
                name: name.trim(),
                description: description.trim(),
                ref,
                outfitTheme: outfitTheme.trim(),
                poseExpressions,
              });
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
