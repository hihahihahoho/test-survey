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
}
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const size = (n: number) => n >= 1048576 ? `${Math.round(n / 104857.6) / 10} MB` : `${Math.ceil(n / 1024)} KB`;

export function ImageDropzone({ label, description, multiple = false, maxFiles = 8, maxBytes = 20 * 1024 * 1024, disabled, state = "idle", error, onFiles }: ImageDropzoneProps) {
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
  const message = error ?? localError;
  return <div className="image-upload-shell">
    <button type="button" disabled={disabled || state === "uploading"} className={cn("image-dropzone", drag && "is-dragging", message && "is-error")}
      onClick={() => input.current?.click()} onDragEnter={e => { e.preventDefault(); setDrag(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); acceptFiles(e.dataTransfer.files); }}>
      <span className="image-drop-icon">{state === "uploading" ? <LoaderCircle className="animate-spin"/> : message ? <TriangleAlert/> : state === "done" ? <CheckCircle2/> : <ImagePlus/>}</span>
      <span className="image-drop-copy"><strong>{drag ? "Thả ảnh vào đây" : label}</strong><span>{description}</span><small>PNG, JPG, WebP · tối đa {size(maxBytes)}{multiple ? ` · ${maxFiles} ảnh` : ""}</small></span>
      <span className="image-drop-action">Chọn ảnh</span>
    </button>
    <input ref={input} className="sr-only" type="file" accept={ACCEPT.join(",")} multiple={multiple} disabled={disabled} onChange={e => { if(e.target.files) acceptFiles(e.target.files); e.currentTarget.value=""; }}/>
    {message && <p className="image-upload-error"><TriangleAlert aria-hidden/>{message}</p>}
    {picked.length > 0 && <div className="image-picked-list">{picked.map(file => <div key={`${file.name}-${file.lastModified}`}><span><strong>{file.name}</strong><small>{size(file.size)}</small></span><button type="button" aria-label={`Bỏ ${file.name}`} onClick={() => setPicked(xs => xs.filter(x => x !== file))}><X/></button></div>)}</div>}
  </div>;
}
