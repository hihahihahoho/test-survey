import * as React from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "uploading" | "done" | "error";
export interface ImageDropzoneProps {
  label: string;
  description: string;
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  disabled?: boolean;
  state?: UploadState;
  error?: string | null;
  onFiles: (files: File[]) => void;
  showLocalPreview?: boolean;
  /**
   * `block` (mặc định) — băng ngang cao, icon + 3 dòng chữ + nút "Chọn ảnh".
   * `tile`  — Ô VUÔNG nhỏ đứng làm **ô cuối của lưới ảnh** ("+ Thêm ảnh").
   *
   * Chỉ là TRÌNH BÀY: cùng một `acceptFiles` (lọc PNG/JPG/WebP, trần dung lượng,
   * trần số ảnh), cùng kéo-thả, cùng câu lỗi. Tách ra bằng prop chứ không viết một
   * dropzone thứ hai — hai bản sao là hai chỗ để luật định dạng lệch nhau.
   */
  variant?: "block" | "tile";
}
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const size = (n: number) => n >= 1048576 ? `${Math.round(n / 104857.6) / 10} MB` : `${Math.ceil(n / 1024)} KB`;

export function ImageDropzone({ label, description, multiple = false, maxFiles = 8, maxBytes = 20 * 1024 * 1024, disabled, state = "idle", error, onFiles, showLocalPreview = true, variant = "block" }: ImageDropzoneProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [picked, setPicked] = React.useState<File[]>([]);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const acceptFiles = React.useCallback((incoming: FileList | File[]) => {
    const raw = Array.from(incoming).slice(0, multiple ? maxFiles : 1);
    const invalid = raw.find(file => !ACCEPT.includes(file.type) || file.size > maxBytes);
    if (invalid) {
      setLocalError(!ACCEPT.includes(invalid.type) ? "Chỉ nhận PNG, JPG hoặc WebP." : `${invalid.name} vượt quá ${size(maxBytes)}.`);
      return;
    }
    setLocalError(null); setPicked(raw); onFiles(raw);
  }, [maxBytes, maxFiles, multiple, onFiles]);
  /**
   * Bỏ một ảnh khỏi lượt chọn phải BÁO NGƯỢC lên cha.
   * Bản cũ chỉ `setPicked(...)`, tức là ô ảnh biến mất trên màn nhưng file vẫn nằm trong
   * state của cha và vẫn được tải lên khi bấm Lưu — nút ✕ nói dối.
   */
  const removePicked = React.useCallback((file: File) => {
    const next = picked.filter(item => item !== file);
    setPicked(next);
    onFiles(next);
  }, [onFiles, picked]);
  const message = error ?? localError;
  const tile = variant === "tile";
  return <div className="image-upload-shell">
    <button type="button" disabled={disabled || state === "uploading"} className={cn("image-dropzone", tile && "is-tile", drag && "is-dragging", message && "is-error")}
      title={tile ? `${description} · PNG, JPG, WebP · tối đa ${size(maxBytes)}` : undefined}
      onClick={() => input.current?.click()} onDragEnter={e => { e.preventDefault(); setDrag(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); acceptFiles(e.dataTransfer.files); }}>
      <span className="image-drop-icon">{state === "uploading" ? <LoaderCircle className="animate-spin"/> : message ? <TriangleAlert/> : state === "done" ? <CheckCircle2/> : <ImagePlus/>}</span>
      {tile
        /* Ô vuông chỉ mang MỘT dòng chữ: nó đứng cạnh những ô ảnh, nên ba dòng chú
           thích ở đây sẽ đọc như một ô ảnh bị vỡ. Chi tiết định dạng/dung lượng lùi
           về `title` và về câu mô tả của khối bên ngoài. */
        ? <span className="image-drop-copy"><strong>{drag ? "Thả vào đây" : label}</strong></span>
        : <>
            <span className="image-drop-copy"><strong>{drag ? "Thả ảnh vào đây" : label}</strong><span>{description}</span><small>PNG, JPG, WebP · tối đa {size(maxBytes)}{multiple ? ` · ${maxFiles} ảnh` : ""}</small></span>
            <span className="image-drop-action">Chọn ảnh</span>
          </>}
    </button>
    <input ref={input} className="sr-only" type="file" accept={ACCEPT.join(",")} multiple={multiple} disabled={disabled} onChange={e => { if(e.target.files) acceptFiles(e.target.files); e.currentTarget.value=""; }}/>
    {message && <p className="image-upload-error"><TriangleAlert aria-hidden/>{message}</p>}
    {showLocalPreview && picked.length > 0 && <div className="image-picked-list" aria-label={`${picked.length} ảnh đã chọn`}>{picked.map(file => <PickedImage key={`${file.name}-${file.lastModified}`} file={file} onRemove={() => removePicked(file)} />)}</div>}
  </div>;
}

function PickedImage({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div title={file.name}><img src={url} alt="" /><button type="button" aria-label={`Bỏ ảnh ${file.name}`} onClick={onRemove}><X /></button></div>;
}
