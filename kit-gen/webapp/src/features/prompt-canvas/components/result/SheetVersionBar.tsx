import * as React from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogBody, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteRawHistory, useRawHistory, useRestoreRaw } from "@/lib/hooks";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import {
  currentVersion, deleteConfirmLabel, restoreWarning, sheetVersions, type SheetVersion,
} from "../../lib/result/sheet-versions";

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
  const remove = useDeleteRawHistory(projectId);
  const versions = React.useMemo(() => sheetVersions(history.data?.items), [history.data?.items]);
  const current = currentVersion(versions);

  /* Chọn mặc định = bản ĐANG DÙNG. Mở panel ra mà con trỏ đã nằm sẵn trên một bản
     cũ là mời người dùng bấm khôi phục nhầm. */
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const picked: SheetVersion | null =
    versions.find((v) => v.id === pickedId) ?? current ?? versions[0] ?? null;
  const [confirming, setConfirming] = React.useState(false);

  /**
   * XÁC NHẬN XOÁ MỘT CHẠM, KHÔNG HỘP THOẠI.
   *
   * ╔══ VÌ SAO XOÁ ĐƯỢC PHÉP NHẸ TAY HƠN KHÔI PHỤC ════════════════════════════╗
   * ║ Khôi phục GHI ĐÈ `raw/<tấm>.png` — nó đổi đầu vào của bước cắt, và sau một ║
   * ║ cú bấm nhầm thì hai tab nói hai chuyện khác nhau mà không có gì báo. Nên   ║
   * ║ nó giữ hộp thoại. Xoá thì chỉ bỏ MỘT bản cũ trong `.history/`: ảnh đang    ║
   * ║ dùng không suy suyển, không bước nào sau đó đổi kết quả. Một hộp thoại cho ║
   * ║ việc ấy là bắt người dùng đọc hai lần cùng một câu.                        ║
   * ║ Vẫn KHÔNG một-chạm-là-mất: nút phải đổi thành «Xoá v1?» rồi mới ăn cú bấm  ║
   * ║ thứ hai — đủ để một cú chạm trượt không xoá mất bản sinh không lấy lại được.║
   * ╚═══════════════════════════════════════════════════════════════════════════╝
   * Khoá theo ID chứ không phải cờ boolean: đổi bản đang chọn giữa chừng thì lời hỏi
   * tự huỷ, không có cách nào để câu «Xoá v1?» còn treo mà cú bấm lại rơi vào v2.
   */
  const [askDeleteId, setAskDeleteId] = React.useState<string | null>(null);
  const asking = picked !== null && askDeleteId === picked.id;

  /** Bản cũ mới xoá được. Bản đang dùng là `raw/<tấm>.png` — agent trả 409 nếu thử. */
  const deletable = picked !== null && !picked.current && picked.restorable;

  const doDelete = () => {
    if (picked === null || !deletable) return;
    if (!asking) { setAskDeleteId(picked.id); return; }
    setAskDeleteId(null);
    const gone = picked.label;
    remove.mutate(
      { job, historyId: picked.id },
      {
        onSuccess: () => {
          setPickedId(null);
          toastSuccess("Đã xoá bản cũ", `${gone} không còn nữa. Các bản còn lại được đánh số lại từ v1.`);
        },
        onError: (err) => toastError(err, {}),
      },
    );
  };

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
        <Select value={picked?.id ?? ""} onValueChange={(v) => { setAskDeleteId(null); setPickedId(v); }}>
          {/* SỐ THỨ TỰ ĐÁNH LẠI SAU MỖI LẦN XOÁ — nói ra, đừng để người dùng tự phát hiện.
              `sheetVersions` đánh v1..vN theo các bản CÒN LẠI, nên xoá v1 xong thì v2 cũ
              trở thành v1. Giữ số cũ thì thanh sẽ có lỗ (v1, v3) và số lớn nhất không còn
              bằng số bản — cũng khó hiểu y như vậy, chỉ khó hiểu theo cách im lặng. */}
          <SelectTrigger
            className="h-ctl-sm w-auto min-w-28"
            aria-label={pickerLabel}
            title="Đánh số theo thứ tự thời gian của các bản còn lại — xoá một bản thì các bản sau được đánh số lại."
          >
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
        {/* Nút xoá CHỈ hiện khi có bản cũ để xoá. Hiện một nút khoá vĩnh viễn bên cạnh
            bản đang dùng là mời người ta bấm thử rồi tự hỏi vì sao không được. */}
        {deletable && (
          <Button
            type="button"
            variant={asking ? "danger" : "ghost"}
            size="sm"
            disabled={busy || remove.isPending}
            loading={remove.isPending}
            aria-label={asking ? deleteConfirmLabel(picked) : `Xoá ${picked.label}`}
            onClick={doDelete}
            onBlur={() => setAskDeleteId(null)}
          >
            <Trash2 aria-hidden strokeWidth={1.5} />
            {asking ? deleteConfirmLabel(picked) : null}
          </Button>
        )}
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
