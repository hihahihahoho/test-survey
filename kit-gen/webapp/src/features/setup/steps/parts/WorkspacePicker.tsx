import * as React from "react";
import { Check, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/common";
import { presentError } from "@/lib/api";
import type { WorkspaceItem } from "@/lib/types/api";
import { cn } from "@/lib/utils";
import { StepCard, Note } from "../../components/StepShell";
import { DevDetails } from "../../components/DevDetails";
import { bytes, count } from "../../lib/format";

/**
 * Chọn GIỮA CÁC THƯ MỤC MÀ AGENT ĐÃ BIẾT (§6.2 #3/#4, chốt X1).
 *
 * Web gửi **id đục** (`ws_8f2c`), KHÔNG BAO GIỜ gửi đường dẫn. Đó là lý do ở đây không
 * có ô nhập path nào — không phải vì lười, mà vì: (a) `showDirectoryPicker` không có
 * trên Firefox/Safari nên UI sẽ gãy một nửa số user; (b) nhận path tự do từ client là
 * đúng lỗ hổng G1 mà bản v1 đã dính (`refs/../gen.sh` xuyên qua).
 *
 * 4 trạng thái: loading (3 skeleton = số dòng thường gặp) · error (có nút thử lại +
 * panel dev) · empty (agent chưa khai thư mục nào) · success (danh sách radio).
 */
export interface WorkspacePickerProps {
  items: readonly WorkspaceItem[];
  activeId: string | null;
  loading: boolean;
  error: unknown;
  activating: boolean;
  activateError: unknown;
  onRetry: () => void;
  onActivate: (id: string) => void;
}

export function WorkspacePicker({
  items, activeId, loading, error, activating, activateError, onRetry, onActivate,
}: WorkspacePickerProps) {
  const [picked, setPicked] = React.useState<string | null>(activeId);

  React.useEffect(() => {
    setPicked((p) => p ?? activeId);
  }, [activeId]);

  if (loading) {
    return (
      <StepCard title="Chọn thư mục làm việc">
        <LoadingState count={2} variant="rows" label="Đang đọc danh sách thư mục làm việc…" />
      </StepCard>
    );
  }

  if (error) {
    const v = presentError(error);
    return (
      <StepCard title="Chọn thư mục làm việc">
        <ErrorState
          variant="inline"
          title={v.title}
          description={v.explain}
          actions={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Thử lại
            </Button>
          }
        />
        <DevDetails error={error} />
      </StepCard>
    );
  }

  if (items.length === 0) {
    return (
      <StepCard title="Chọn thư mục làm việc">
        <p className="text-body text-fg">
          Công cụ local chưa khai thư mục làm việc nào. Chạy lại nó kèm tham số thư mục (lệnh ở
          khối bên dưới) rồi bấm Kiểm tra lại.
        </p>
      </StepCard>
    );
  }

  if (items.length === 1) {
    const only = items[0]!;
    return (
      <StepCard title="Thư mục làm việc">
        <p className="inline-flex items-center gap-2 text-body text-fg">
          <FolderOpen className="size-4 text-accent-text" aria-hidden />
          Công cụ local đang biết đúng 1 thư mục: <strong className="text-fg-strong">{only.label}</strong>
        </p>
        <Note>Muốn dùng chỗ khác thì thêm bằng lệnh ở khối dưới — web không nhận đường dẫn bạn gõ.</Note>
      </StepCard>
    );
  }

  const dirty = picked !== null && picked !== activeId;

  return (
    <StepCard title="Chọn thư mục làm việc">
      <RadioGroup
        value={picked ?? ""}
        onValueChange={setPicked}
        aria-label="Danh sách thư mục làm việc công cụ local đã biết"
      >
        {items.map((w) => {
          const id = `kg-ws-${w.id}`;
          const unwritable = w.writable === false;
          return (
            <div
              key={w.id}
              className={cn(
                "flex items-start gap-3 rounded-2 border p-3",
                picked === w.id ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle bg-raised",
                /* VERIFIER B1-sót: opacity-60 làm nhoè CẢ hàng (chữ phụ còn 3.05:1).
                   Dấu hiệu "không ghi được" đã có ở viền gạch + câu chữ bên dưới. */
                unwritable && "border-dashed"
              )}
            >
              <RadioGroupItem id={id} value={w.id} disabled={unwritable} className="mt-1" />
              <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-body text-fg-strong">
                  {w.label || w.id}
                  {w.active === true && (
                    <span className="inline-flex items-center gap-1 text-caption text-accent-text">
                      <Check className="size-3" aria-hidden />
                      đang dùng
                    </span>
                  )}
                </span>
                <span className="text-caption text-fg-muted">
                  {[
                    typeof w.projects === "number" ? count(w.projects, "project") : null,
                    typeof w.diskBytes === "number" ? bytes(w.diskBytes) : null,
                    unwritable ? "KHÔNG ghi được vào đây" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {activateError !== null && activateError !== undefined && (
        <>
          <ErrorState
            variant="inline"
            title={presentError(activateError).title}
            description={presentError(activateError).explain}
          />
          <DevDetails error={activateError} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={!dirty || activating}
          loading={activating}
          onClick={() => picked && onActivate(picked)}
        >
          Dùng thư mục đã chọn
        </Button>
        {!dirty && <Note>Đang dùng đúng thư mục được chọn.</Note>}
      </div>
    </StepCard>
  );
}
