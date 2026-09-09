import * as React from "react";
import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDeleteRawHistory, useRawHistory, useRestoreRaw } from "@/lib/hooks";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import {
  currentVersion, deleteConfirmLabel, sheetVersions, type SheetVersion,
} from "../../lib/result/sheet-versions";

/**
 * THANH PHIÊN BẢN của một tấm — CHỌN LÀ ĐỔI, và xoá được cả bản đang dùng.
 *
 * ╔══ MÔ HÌNH, NÓI BẰNG LỜI CỦA CHỦ SẢN PHẨM (09/09/2026) ═══════════════════╗
 * ║ "ko cần nút khôi phục phiên bản này, user select là được mà, nó chỉ swap  ║
 * ║  hiển thị + copy figma thôi" — và "VẪN KO CÓ NÚT XOÁ PHIÊN BẢN À???".     ║
 * ║ Nên ở đây đúng hai thứ: MỘT ô chọn (chọn xong là đổi ngay, không nút thứ  ║
 * ║ hai, không hộp thoại) và MỘT nút xoá CÓ CHỮ.                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO MỘT CÚ CHỌN NAY ĐƯỢC PHÉP GHI ĐÈ ẢNH GỐC ═══════════════════════╗
 * ║ Bản trước bắt xác nhận vì `#40` chỉ chép đè `raw/<tấm>.png` rồi thôi: ô đã ║
 * ║ cắt trong `kits/` vẫn là ô bản cũ, nên sau một cú bấm nhầm thì tab «Ảnh    ║
 * ║ gốc» và tab «Đã crop» nói hai chuyện khác nhau mà không có gì báo — và cái ║
 * ║ giá đó thì một hộp thoại cũng không trả nổi.                              ║
 * ║ Nay `#40` CẮT LẠI ngay trong cùng request (`lib/sheet-kits.mjs`), nên đổi  ║
 * ║ phiên bản là đổi cả ba bề mặt cùng lúc: ảnh gốc, ô đã crop, nút copy       ║
 * ║ Figma. Việc này không tốn hạn mức (slice là PIL thuần) và LUÔN quay lại    ║
 * ║ được: bản đang dùng được cất vào lịch sử trước khi bị ghi đè, nên nó vẫn   ║
 * ║ nằm trong chính ô chọn này. Một thao tác hoàn tác được bằng đúng thao tác  ║
 * ║ vừa làm thì không đáng một hộp thoại.                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG có khung xem trước cho bản cũ: ảnh lịch sử nằm ở `.history/raw/…` mà
 * `agent/routes/files.mjs` không mở thư mục đó. Nhưng nay điều ấy không còn phải nói
 * thành câu — chọn một mục là thấy nó ngay ở tab bên cạnh, tức là XEM TRƯỚC bằng chính
 * cú chọn, và chọn lại mục cũ thì quay về.
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
   * true ⇒ đang có lượt chạy cho tấm này. `#39.1`/`#40` đều trả 409 RUN_ACTIVE khi dự
   * án còn lượt chạy, nên khoá từ đây thay vì để người dùng bấm rồi ăn lỗi.
   */
  busy?: boolean;
  /** Gọi sau khi ẢNH GỐC ĐANG DÙNG đổi — panel cha dùng để nạp lại ảnh. */
  onSwapped?: () => void;
  className?: string;
}

export function SheetVersionBar({ projectId, job, name, busy = false, onSwapped, className }: SheetVersionBarProps) {
  const history = useRawHistory(projectId, job);
  const restore = useRestoreRaw(projectId);
  const remove = useDeleteRawHistory(projectId);
  const versions = React.useMemo(() => sheetVersions(history.data?.items), [history.data?.items]);
  const current = currentVersion(versions);

  /* Chọn mặc định = bản ĐANG DÙNG — đó là thứ mọi bề mặt khác đang hiện, nên ô chọn
     phải nói đúng tên nó. Không có bản đang dùng (ảnh gốc bị cổng alpha loại, chỉ còn
     lịch sử) thì trỏ vào bản mới nhất, và CHỈ TRỎ: đổi ảnh gốc là việc của người dùng,
     không phải của một cú mở panel. */
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const picked: SheetVersion | null =
    versions.find((v) => v.id === pickedId) ?? current ?? versions[0] ?? null;

  /**
   * XÁC NHẬN XOÁ MỘT CHẠM, KHÔNG HỘP THOẠI.
   *
   * Xoá là thao tác KHÔNG lấy lại được (khác hẳn đổi phiên bản), nên nó vẫn phải có một
   * nhịp chặn — nhưng nhịp ấy nằm ngay trên cái nút: bấm lần đầu nút đổi thành «Xoá v2?»,
   * lần thứ hai mới gọi agent. Đủ để một cú chạm trượt không xoá mất một bản sinh không
   * lấy lại được, mà không bắt người dùng đọc hai lần cùng một câu trong một hộp thoại.
   * Khoá theo ID chứ không phải cờ boolean: đổi bản đang chọn giữa chừng thì lời hỏi tự
   * huỷ, không có cách nào để câu «Xoá v1?» còn treo mà cú bấm lại rơi vào v2.
   */
  const [askDeleteId, setAskDeleteId] = React.useState<string | null>(null);
  const asking = picked !== null && askDeleteId === picked.id;
  /* Chữ trên nút, tính TRƯỚC khi vẽ: `asking` đã hàm ý `picked` khác null, nhưng trình
     kiểm kiểu không suy ra được điều đó từ trong JSX. */
  const deleteLabel = asking && picked !== null ? deleteConfirmLabel(picked) : "Xoá bản này";

  /* Tên tấm rút ra TRƯỚC rồi mới ghép câu — xem chú thích ở prop `name`. */
  const label = (name ?? "").trim();
  const pickerLabel = label === "" ? "Phiên bản ảnh gốc của tấm này" : `Phiên bản ảnh gốc của ${label}`;

  const swapping = restore.isPending;
  const working = swapping || remove.isPending;

  /**
   * ĐỔI PHIÊN BẢN = ĐỔI ẢNH GỐC + CẮT LẠI Ô, một request, không hỏi lại.
   *
   * Chọn đúng mục đang dùng thì KHÔNG gọi gì: agent sẽ 404 (không có file lịch sử nào
   * tên `<tấm>@current.png`) cho một thao tác vốn chẳng đổi gì.
   */
  const pick = (id: string) => {
    setAskDeleteId(null);
    const target = versions.find((v) => v.id === id) ?? null;
    if (target === null || target.id === picked?.id) return;
    setPickedId(id);
    if (!target.restorable) return;
    restore.mutate(
      { job, historyId: target.id },
      {
        onSuccess: (res) => {
          /* Bỏ lựa chọn tay: sau khi đổi, bản vừa chọn CHÍNH LÀ bản đang dùng, và
             `#39` đánh số lại theo danh sách mới. Giữ id cũ là ghim con trỏ vào một
             mục lịch sử vừa mang số khác. */
          setPickedId(null);
          onSwapped?.();
          /* Đổi phiên bản là việc thường ngày ⇒ IM LẶNG khi trót lọt. Chỉ lên tiếng
             đúng lúc lời hứa không giữ trọn: ảnh gốc đã đổi mà ô chưa cắt lại được
             (chưa cài engine, python chết) — nếu không nói, tab «Đã crop» và nút copy
             Figma lặng lẽ phát ra ô của bản trước. */
          if (res?.sliced === false) {
            toastInfo("Đã đổi ảnh gốc", "Ô đã crop vẫn là của bản trước — cắt lại để hai bên khớp nhau.");
          }
        },
        onError: (err) => { setPickedId(null); toastError(err, {}); },
      },
    );
  };

  const doDelete = () => {
    if (picked === null || !picked.deletable) return;
    if (!asking) { setAskDeleteId(picked.id); return; }
    setAskDeleteId(null);
    const gone = picked.label;
    const wasCurrent = picked.current;
    remove.mutate(
      { job, historyId: picked.id },
      {
        onSuccess: () => {
          setPickedId(null);
          if (wasCurrent) onSwapped?.();
          toastSuccess(`Đã xoá ${gone}`);
        },
        onError: (err) => toastError(err, {}),
      },
    );
  };

  if (history.isLoading) {
    return <p className={className} data-testid="version-loading">Đang đọc lịch sử ảnh…</p>;
  }
  /* Chưa gen lần nào (hoặc agent đời cũ không có `#39`) ⇒ không có gì để chọn.
     Hiện một thanh rỗng là thêm nhiễu; im hẳn là đúng. */
  if (versions.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <History className="size-4 shrink-0 text-fg-muted" aria-hidden strokeWidth={1.5} />
        <Select value={picked?.id ?? ""} onValueChange={pick} disabled={busy || working}>
          {/* SỐ THỨ TỰ ĐÁNH LẠI SAU MỖI LẦN XOÁ — nói ra, đừng để người dùng tự phát hiện.
              `sheetVersions` đánh v1..vN theo các bản CÒN LẠI, nên xoá v1 xong thì v2 cũ
              trở thành v1. Giữ số cũ thì thanh sẽ có lỗ (v1, v3) và số lớn nhất không còn
              bằng số bản — cũng khó hiểu y như vậy, chỉ khó hiểu theo cách im lặng. */}
          <SelectTrigger
            className="h-ctl-sm w-auto min-w-28"
            aria-label={pickerLabel}
            title="Chọn một bản là đổi ngay ảnh gốc và ô đã crop. Đánh số theo thứ tự thời gian của các bản còn lại — xoá một bản thì các bản sau được đánh số lại."
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
        {/* NÚT XOÁ CÓ CHỮ, và LUÔN CÓ MẶT khi còn bản để xoá. Bản trước là một nút chỉ
            có hình thùng rác, lại còn trốn đi khi đang đứng ở bản đang dùng — đọc ra
            đúng thành "không có nút xoá". */}
        <Button
          type="button"
          variant={asking ? "danger" : "secondary"}
          size="sm"
          disabled={busy || picked === null || !picked.deletable || remove.isPending}
          loading={remove.isPending}
          onClick={doDelete}
          onBlur={() => setAskDeleteId(null)}
        >
          <Trash2 aria-hidden strokeWidth={1.5} />
          {deleteLabel}
        </Button>
        {swapping ? <span className="text-caption text-fg-muted">Đang đổi ảnh gốc…</span> : null}
      </div>
    </div>
  );
}
