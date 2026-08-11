import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { bytes } from "../lib/format";
import { InfoNotice } from "./parts";

/** BƯỚC 1 của wizard nhập (§4.6): 3 nguồn. */
export type ImportSource = "zip" | "stylesJson" | "folder";

export const SOURCES: { id: ImportSource; label: string; hint: string; accept?: string }[] = [
  {
    id: "stylesJson",
    label: "styles.json của bản cũ",
    hint: "Bản Studio v1 — giữ nguyên mọi sheet, không lọc bớt",
    accept: ".json,application/json",
  },
  {
    id: "zip",
    label: "File .zip của project",
    hint: "Bản xuất từ kit-gen (tối đa 200 MB)",
    accept: ".zip,application/zip",
  },
  {
    id: "folder",
    label: "Thư mục có sẵn trong thư mục làm việc",
    hint: "Công cụ local quét thấy project chưa có trong danh sách",
  },
];

export function ImportSourceStep({
  source,
  onSourceChange,
  fileName,
  fileBytes,
  uploading,
  uploaded,
  onPickFile,
  folderPath,
  onFolderPathChange,
  name,
  nameError,
  onNameChange,
  disabled,
}: {
  source: ImportSource;
  onSourceChange: (s: ImportSource) => void;
  fileName: string;
  fileBytes: number;
  uploading: boolean;
  uploaded: boolean;
  onPickFile: (f: File | undefined) => void;
  folderPath: string;
  onFolderPathChange: (v: string) => void;
  name: string;
  nameError: string | null;
  onNameChange: (v: string) => void;
  disabled: boolean;
}) {
  const accept = SOURCES.find((s) => s.id === source)?.accept;

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1 text-label text-fg-strong">Nhập từ đâu?</legend>
        <RadioGroup value={source} onValueChange={(v) => onSourceChange(v as ImportSource)}>
          {SOURCES.map((s) => (
            <Label
              key={s.id}
              htmlFor={`src-${s.id}`}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-2 border p-3",
                source === s.id ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle bg-raised hover:bg-overlay",
              )}
            >
              <RadioGroupItem id={`src-${s.id}`} value={s.id} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-body text-fg-strong">{s.label}</span>
                <span className="text-caption font-normal text-fg-muted-raised">{s.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </fieldset>

      {source === "folder" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="imp-folder">Tên thư mục trong thư mục làm việc</Label>
          <Input
            id="imp-folder"
            value={folderPath}
            onChange={(e) => onFolderPathChange(e.target.value)}
            placeholder="candy-old-11b2"
            className="font-mono"
            disabled={disabled}
          />
          <p className="text-caption text-fg-muted-raised">
            Thư mục phải nằm trong <span className="font-mono">projects/</span> của thư mục làm việc. Web không
            nhận đường dẫn tuyệt đối.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="imp-file">Chọn file</Label>
          <div
            className="flex flex-col items-center gap-2 rounded-2 border border-dashed border-line p-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
            <p className="text-caption text-fg-muted-raised">Kéo file vào đây hoặc chọn từ máy</p>
            <input
              id="imp-file"
              type="file"
              accept={accept}
              disabled={disabled}
              onChange={(e) => onPickFile(e.target.files?.[0])}
              className="block w-full text-caption text-fg file:mr-3 file:h-ctl-sm file:cursor-pointer file:rounded-2 file:border file:border-line file:bg-raised file:px-3 file:text-label file:text-fg-strong"
            />
            {fileName && (
              <p className="text-caption text-fg" aria-live="polite">
                {fileName} · {bytes(fileBytes)} ·{" "}
                {uploading ? "đang gửi tới công cụ local…" : uploaded ? "đã nhận" : "chưa gửi được"}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="imp-name">Tên project sẽ tạo</Label>
        <Input
          id="imp-name"
          value={name}
          maxLength={120}
          onChange={(e) => onNameChange(e.target.value)}
          aria-invalid={Boolean(nameError) || undefined}
        />
        {nameError && (
          <p role="alert" className="text-caption text-danger">
            {nameError}
          </p>
        )}
      </div>

      <InfoNotice>File gốc của bạn KHÔNG bị thay đổi hay xoá. Nhập là một chiều.</InfoNotice>
    </>
  );
}
