import * as React from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogBody, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRawHistory, useRestoreRaw } from "@/lib/hooks";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { currentVersion, restoreWarning, sheetVersions, type SheetVersion } from "../../lib/result/sheet-versions";

/**
 * THANH PHIÊN BẢN của một tấm — chọn trong 3 đời ảnh gần nhất rồi khôi phục.
 *
 * ╔══ MỘT SỰ THẬT PHẢI NÓI RA, KHÔNG ĐƯỢC GIẤU ══════════════════════════════╗
 * ║ Bản cũ **KHÔNG XEM TRƯỚC ĐƯỢC**. Ảnh lịch sử nằm ở `.history/raw/…` mà     ║
 * ║ `agent/routes/files.mjs:15` chỉ mở cho `raw, kits, refs, skeleton, prompts,║
 * ║ export, runs, cover` — `.history` không có trong danh sách, xin nó là 400   ║
 * ║ PATH_ESCAPE. Vẽ một khung ảnh rồi để nó hỏng câm là cách tệ nhất; ở đây     ║
 * ║ nói thẳng "chỉ khôi phục được, chưa xem trước được", và chính vì không      ║
 * ║ xem trước được nên nút khôi phục BẮT BUỘC phải hỏi lại trước khi ghi đè.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO PHẢI XÁC NHẬN ══════════════════════════════════════════════════╗
 * ║ `#40` chép đè thẳng lên `raw/<job>.png` — tức đổi ĐẦU VÀO của bước cắt.    ║
 * ║ Ô đã cắt trong `kits/` vẫn là ô của bản cũ cho tới khi cắt lại, nên sau    ║
 * ║ một cú bấm nhầm, tab «Ảnh gốc» và tab «Đã crop» nói hai chuyện khác nhau   ║
 * ║ mà không có gì báo. Một cú bấm không được phép làm chuyện đó.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface SheetVersionBarProps {
  projectId: string;
  /** Tên lượt vẽ của tấm — khoá của `#39`/`#40`. KHÔNG dùng để hiện ra chữ. */
  job: string;
  /**
   * TÊN TẤM để đọc lên trong nhãn trợ năng. Tách khỏi `job` vì hai lý do cùng chiều:
   * tên tấm dễ hiểu hơn tên lượt vẽ nội bộ, và cổng từ cấm §5.4 quét cả biểu thức bên
   * trong chuỗi mẫu — ghép thẳng `${job}` vào câu tiếng Việt là để chữ kỹ thuật lọt ra
   * UI (xem `OnePrompt` ở `CanvasBlock.tsx:300`, cùng cách xử lý).
   * Bỏ trống ⇒ nhãn chỉ nói «tấm này», vẫn đủ nghĩa khi đọc trong ngữ cảnh panel.
   */
  name?: string;
  /**
   * true ⇒ đang có lượt chạy cho tấm này. `#40` trả 409 RUN_ACTIVE khi dự án còn
   * lượt chạy, nên khoá nút từ đây thay vì để người dùng bấm rồi ăn lỗi.
   */
  busy?: boolean;
  /** Gọi sau khi khôi phục xong — panel cha dùng để nạp lại ảnh gốc. */
  onRestored?: () => void;
  className?: string;
}

export function SheetVersionBar({ projectId, job, name, busy = false, onRestored, className }: SheetVersionBarProps) {
  const history = useRawHistory(projectId, job);
  const restore = useRestoreRaw(projectId);
  const versions = React.useMemo(() => sheetVersions(history.data?.items), [history.data?.items]);
  const current = currentVersion(versions);

  /* Chọn mặc định = bản ĐANG DÙNG. Mở panel ra mà con trỏ đã nằm sẵn trên một bản
     cũ là mời người dùng bấm khôi phục nhầm. */
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const picked: SheetVersion | null =
    versions.find((v) => v.id === pickedId) ?? current ?? versions[0] ?? null;
  const [confirming, setConfirming] = React.useState(false);

  /* Tên tấm rút ra TRƯỚC rồi mới ghép câu — xem chú thích ở prop `name`. */
  const label = (name ?? "").trim();
  const pickerLabel = label === "" ? "Phiên bản ảnh gốc của tấm này" : `Phiên bản ảnh gốc của ${label}`;

  if (history.isLoading) {
    return <p className={className} data-testid="version-loading">Đang đọc lịch sử ảnh…</p>;
  }
  /* Chưa gen lần nào (hoặc agent đời cũ không có `#39`) ⇒ không có gì để chọn.
     Hiện một thanh rỗng là thêm nhiễu; im hẳn là đúng. */
  if (versions.length === 0) return null;

  const doRestore = () => {
    if (picked === null || !picked.restorable) return;
    setConfirming(false);
    restore.mutate(
      { job, historyId: picked.id },
      {
        onSuccess: () => {
          toastSuccess("Đã khôi phục ảnh gốc", `Tấm này quay về ${picked.label}. Cắt lại để ô đã crop khớp bản vừa khôi phục.`);
          setPickedId(null);
          onRestored?.();
        },
        onError: (err) => toastError(err, {}),
      },
    );
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <History className="size-4 shrink-0 text-fg-muted" aria-hidden strokeWidth={1.5} />
        <Select value={picked?.id ?? ""} onValueChange={setPickedId}>
          <SelectTrigger className="h-ctl-sm w-auto min-w-28" aria-label={pickerLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}{v.current ? " · đang dùng" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || picked === null || !picked.restorable || restore.isPending}
          loading={restore.isPending}
          onClick={() => setConfirming(true)}
        >
          <RotateCcw aria-hidden strokeWidth={1.5} />
          Khôi phục bản này
        </Button>
        {/* Câu này thay cho một khung xem trước KHÔNG dựng được — xem khối chú thích đầu file. */}
        <span className="text-caption text-fg-muted">
          {picked?.current === true
            ? "Bản đang dùng"
            : "Bản cũ chưa xem trước được — khôi phục rồi mới thấy"}
        </span>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Khôi phục {picked?.label ?? "bản này"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {picked === null ? "" : restoreWarning(picked)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody />
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore}>Khôi phục</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
