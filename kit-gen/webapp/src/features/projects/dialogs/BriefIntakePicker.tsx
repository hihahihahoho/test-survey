import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { CopyableCode } from "@/components/common";
import { cn } from "@/lib/utils";
import { FLORA } from "@/components/layout/flora";
import type { BriefReadFailure, BriefSource } from "../lib/create-mode-brief";

/**
 * CHỌN NGUỒN ĐẦU BÀI (UI-SPEC-V2 §1.3, hàng "Nguồn").
 *
 * V1 đúng hai nguồn, cả hai chạy **100% trên máy người dùng**: chọn tệp `answers.json`
 * (đọc bằng `FileReader`, không upload đi đâu) hoặc dán JSON. Không có nguồn "tải từ link
 * form" — sẽ phải gửi dữ liệu khách ra ngoài, và FE-2 không có endpoint nào cho việc đó.
 *
 * `prefill-vcb.json mẫu` của wireframe bị BỎ khỏi runtime **có chủ ý**: nó là fixture của
 * đội brief, và FE2-PLAN §4 cấm fixture đi vào bundle chạy thật. Người dùng vẫn chọn được
 * chính tệp đó từ máy nếu muốn — cùng kết quả, không phải nhúng dữ liệu khách vào app.
 *
 * A11y: `RadioGroup` Radix (mũi tên đổi nguồn); vùng kéo-thả có nút [Chọn tệp…] thật để
 * đường bàn phím không phụ thuộc kéo-thả; lỗi đọc tệp là `role="alert"`, chi tiết kỹ thuật
 * nằm trong `<details>` chứ không ở thân UI.
 */
export interface BriefIntakePickerProps {
  source: BriefSource;
  onSourceChange: (s: BriefSource) => void;
  fileName: string | null;
  pasted: string;
  onPastedChange: (v: string) => void;
  /** Đọc nội dung tệp/ô dán — chỗ gọi lo parse, khối này chỉ lấy chữ. */
  onFileText: (text: string, fileName: string) => void;
  onFileError: (message: string) => void;
  busy?: boolean;
  error?: BriefReadFailure | null;
}

const SOURCES: { id: BriefSource; label: string; hint: string }[] = [
  { id: "file", label: "Tệp answers.json", hint: "Đọc ngay trên máy bạn, không gửi đi đâu" },
  { id: "paste", label: "Dán nội dung JSON", hint: "Khi bạn chỉ có nội dung chứ không có tệp" },
];

export function BriefIntakePicker(props: BriefIntakePickerProps) {
  const { source, onSourceChange, fileName, pasted, onPastedChange, onFileText, onFileError, busy, error } = props;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const groupId = React.useId();
  const pasteId = React.useId();

  const readFile = (f: File | undefined | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onerror = () =>
      onFileError("Không đọc được tệp này trên máy bạn. Thử chọn lại, hoặc dán nội dung vào ô bên dưới.");
    reader.onload = () => onFileText(String(reader.result ?? ""), f.name);
    reader.readAsText(f);
  };

  return (
    <div className="flex flex-col gap-3">
      <p id={groupId} className="text-label text-fg-strong">
        Nguồn đầu bài
      </p>
      <RadioGroup
        value={source}
        onValueChange={(v) => onSourceChange(v as BriefSource)}
        disabled={busy}
        aria-labelledby={groupId}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {SOURCES.map((s) => (
          <Label
            key={s.id}
            htmlFor={`brief-src-${s.id}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 border p-3 transition-colors duration-fast",
              FLORA.r12,
              source === s.id ? "border-line-strong bg-raised" : "border-line-subtle bg-surface hover:bg-raised",
            )}
          >
            <RadioGroupItem id={`brief-src-${s.id}`} value={s.id} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body text-fg-strong">{s.label}</span>
              <span className="text-caption font-normal text-fg-muted-raised">{s.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>

      {source === "file" ? (
        <div
          className={cn(
            "flex flex-col items-center gap-2 border border-dashed border-line p-6 text-center",
            FLORA.r16,
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) readFile(e.dataTransfer.files[0]);
          }}
        >
          <Upload className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
          <p className="text-caption text-fg-muted-raised">
            {fileName ? `Đang dùng: ${fileName}` : "Kéo tệp vào đây hoặc chọn từ máy"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = ""; // chọn LẠI cùng một tệp vẫn phải kích hoạt onChange
            }}
          />
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            Chọn tệp…
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={pasteId}>Nội dung answers.json</Label>
          <Textarea
            id={pasteId}
            value={pasted}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => onPastedChange(e.target.value)}
            placeholder={'{ "formId": "vcb-brief-intake-2026", "sections": { … } }'}
            className="min-h-32 font-mono text-caption"
            aria-describedby={error ? `${pasteId}-err` : undefined}
            aria-invalid={error ? true : undefined}
          />
        </div>
      )}

      {error && (
        <div
          role="alert"
          id={`${pasteId}-err`}
          className={cn("flex flex-col gap-2 border border-danger/60 bg-danger/10 p-3", FLORA.r12)}
        >
          <p className="text-body text-fg-strong">{error.title}</p>
          <p className="text-caption text-fg">{error.hint}</p>
          <details>
            <summary className="cursor-pointer list-none text-label text-fg-muted-raised hover:text-fg-strong">
              Chi tiết cho lập trình viên
            </summary>
            <CopyableCode className="mt-2" value={error.detail} />
          </details>
        </div>
      )}
    </div>
  );
}
