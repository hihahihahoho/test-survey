import * as React from "react";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * row-ui.tsx — HÌNH DẠNG CHUNG của MỘT DÒNG trong một thẻ-danh-sách.
 *
 * ╔══ VÌ SAO TÁCH RA KHỎI `UiKitBlockView` ══════════════════════════════════╗
 * ║ Từ 09/2026 có HAI thẻ là danh sách dòng: Bộ UI (mỗi dòng một element) và   ║
 * ║ Nhân vật (mỗi dòng một dáng). Hai thẻ ấy phải giống nhau tới từng toạ độ   ║
 * ║ — tay nắm ⣿ ở đâu, số thứ tự rộng bao nhiêu, dấu × nằm chỗ nào — vì người  ║
 * ║ dùng học cách kéo dòng đúng MỘT lần rồi dùng ở cả hai. Chép sáu mảnh này   ║
 * ║ sang thẻ thứ hai là hẹn trước ngày chúng lệch nhau, và lệch ở đây thì      ║
 * ║ không có cổng nào bắt được: nó chỉ là vài pixel và một câu `aria-label`.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Lịch sử của từng quyết định (vì sao hai tầng, vì sao dấu × bị ghim vào cuối
 * hàng 1, vì sao ô ghi chú có tầng riêng) nằm trong chú thích của từng hàm dưới —
 * chúng được chuyển nguyên văn từ `UiKitBlockView`, nơi chúng đã trả giá một lần.
 */

export interface RowDragProps {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  /** Dòng đang được kéo (để `dragFrom` sống chung cho cả danh sách). */
  dragFrom: React.MutableRefObject<number | null>;
}

/**
 * Tay nắm kéo.
 *
 * ╔══ CHUỘT LÀ LỐI TẮT, BÀN PHÍM LÀ ĐƯỜNG CHÍNH THỨC ════════════════════════╗
 * ║ HTML5 drag-and-drop KHÔNG có đường bàn phím — `dragstart` chỉ đến từ chuột║
 * ║ (và từ cảm ứng thì cũng không). Một tính năng chỉ chuột mới chạm tới là   ║
 * ║ một tính năng có người dùng không dùng được, mà ở đây "không dùng được"   ║
 * ║ nghĩa là không sắp lại được thứ tự món đồ trên tấm ảnh sẽ vẽ.             ║
 * ║ Nên tay nắm là một `<button>` thật: ↑/↓ đổi chỗ dòng, và `aria-label` nói ║
 * ║ ra cả hai đường. Cùng khuôn với lưới ô của màn Thiết kế                   ║
 * ║ (`features/design/components/CellGrid.tsx`) — nơi bài này đã học một lần. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function DragHandle({ index, count, onMove, dragFrom, label }: RowDragProps & { label: string }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => {
        dragFrom.current = index;
      }}
      onDragEnd={() => {
        dragFrom.current = null;
      }}
      onKeyDown={(event) => {
        const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (delta === 0) return;
        /* Chặn cuộn trang: mũi tên trong một danh sách dài mà vẫn cuộn thì dòng
           đang cầm chạy ra khỏi tầm nhìn ngay lần bấm thứ hai. */
        event.preventDefault();
        onMove(index, index + delta);
      }}
      aria-label={`Đổi chỗ ${label} — dòng ${index + 1} trên ${count}. Kéo bằng chuột, hoặc bấm mũi tên lên xuống.`}
      className="inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring active:cursor-grabbing group-hover/cell:opacity-100"
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

/**
 * Nút bỏ một dòng — hình dạng chung của hai chế độ.
 *
 * ╔══ NÓ PHẢI Ở CUỐI HÀNG 1, KHÔNG PHẢI CẠNH Ô GHI CHÚ ══════════════════════╗
 * ║ Chủ sản phẩm: *"dấu × bị lỗi"*. Không phải nút hỏng — nó ĐỨNG SAI CHỖ.    ║
 * ║ Bản trước hàng element là một dải `flex-wrap` gồm pill · ô ghi chú · ×,   ║
 * ║ nên khi hàng pill dài quá thì ô ghi chú tụt xuống dòng dưới và kéo dấu ×  ║
 * ║ theo — dấu xoá của dòng #3 hiện ra ngay cạnh ô ghi chú của dòng #3, thấp  ║
 * ║ hơn dấu × của dòng #1 một tầng. Cùng một nút, ba vị trí, tuỳ độ dài tên.  ║
 * ║ Nay nó bị GHIM vào cuối hàng 1 bằng `ml-auto`, và hàng 1 thì không bao    ║
 * ║ giờ wrap. Một dòng = một chỗ xoá, ở đúng một toạ độ, mọi dòng như nhau.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * `what` là cả cụm danh từ ("element Nút bấm", "dáng Đứng chờ") chứ không chỉ cái
 * tên: người dùng trình đọc màn hình nghe «Bỏ Đứng chờ» thì không biết mình đang
 * bỏ một dòng hay bỏ một lựa chọn.
 */
export function RemoveButton({ what, onRemove }: { what: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Bỏ ${what}`}
      /* Hiện mờ, rõ lên khi trỏ vào dòng hoặc khi chính nút được focus bằng bàn
         phím. `opacity-0` mà thiếu `focus-visible:opacity-100` là một nút bấm
         Tab tới được nhưng không nhìn thấy. */
      className="ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover/cell:opacity-100"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}

/**
 * Vỏ chung của một dòng: nó cũng chính là VÙNG THẢ của phép kéo.
 *
 * ══ HAI TẦNG CỐ ĐỊNH, KHÔNG PHẢI MỘT DẢI TỰ WRAP ═══════════════════════════
 * `flex-col` chứ không `flex-wrap`: hàng 1 (danh tính + pill + ×) và hàng 2 (ô
 * ghi chú / ô soạn) là HAI TẦNG CÓ TÊN, không phải kết quả ngẫu nhiên của phép
 * xuống dòng. Nhờ vậy mọi dòng cao BẰNG NHAU bất kể tên element dài ngắn ra sao
 * — thứ mà một dải `flex-wrap` không hứa được, và đã không giữ được.
 */
export function RowShell({
  index,
  onMove,
  dragFrom,
  children,
}: Omit<RowDragProps, "count"> & { children: React.ReactNode }) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      onDragOver={(event) => {
        /* `preventDefault` là điều kiện BẮT BUỘC để một phần tử nhận `drop` —
           thiếu nó thì con trỏ hiện dấu cấm và không có sự kiện thả nào. */
        if (dragFrom.current === null) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const from = dragFrom.current;
        dragFrom.current = null;
        if (from !== null && from !== index) onMove(from, index);
      }}
      className={cn(
        "group/cell flex flex-col gap-1.5 rounded-2 px-2 py-2 text-body",
        "hover:bg-raised",
        /* Vạch chỉ CHỖ SẼ RƠI. Không có nó thì kéo trên một danh sách dày là
           thả mù — và `count` dòng trông giống hệt nhau. */
        over && "bg-raised ring-1 ring-accent",
      )}
    >
      {children}
    </div>
  );
}

/**
 * HÀNG 1 của một dòng — danh tính, pill, và dấu × ở mép phải.
 *
 * `flex-nowrap` là điều KHOÁ CỨNG bố cục: mọi con bên trong đều co được
 * (`PillButton` có `min-w-0`, nhãn giá trị có `truncate`), nên hàng này KHÔNG
 * CÓ ĐƯỜNG nào để tràn sang dòng thứ hai. Chật thì chữ trong pill ngắn lại;
 * dấu × không đi đâu cả.
 */
export function RowTop({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-nowrap items-center gap-1.5">{children}</div>;
}

/** Số thứ tự dòng. Bề rộng CỐ ĐỊNH để #1 và #10 không đẩy lệch pill của nhau. */
export function RowIndex({ index }: { index: number }) {
  return <span className="w-6 shrink-0 text-caption tabular-nums text-fg-muted">#{index + 1}</span>;
}

/**
 * HÀNG 2 — ô ghi chú, full-width, LUÔN có mặt.
 *
 * ╔══ VÌ SAO NÓ KHÔNG CÒN LÀ "ĐUÔI CÂU" NỮA ═════════════════════════════════╗
 * ║ Bản trước ô này là một `<input>` không viền, `flex-1`, thả vào giữa chuỗi ║
 * ║ pill để đọc như phần đuôi của một câu. Hai giá phải trả, cả hai đều đo    ║
 * ║ được trên màn: ① nó là thứ ĐẦU TIÊN bị đẩy xuống dòng khi hàng pill dài,  ║
 * ║ nên dòng nào có tên element dài thì cao gấp đôi dòng bên cạnh; ② khi bị   ║
 * ║ đẩy xuống nó kéo theo dấu ×, và người dùng mất chỗ xoá quen thuộc.        ║
 * ║ Nay nó có TẦNG RIÊNG: mọi dòng cao bằng nhau, và ô ghi chú luôn rộng hết  ║
 * ║ thẻ — vốn cũng đúng hơn với thứ người ta gõ vào đó (một câu mô tả, không  ║
 * ║ phải một từ).                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Viền `line-subtle` thay cho gạch chân: nó phải trông như MỘT Ô NHẬP kể cả khi
 * rỗng — một gạch chân mờ dưới chữ mờ là thứ người dùng không nhận ra là gõ được.
 * Vòng focus thì đi theo ngôn ngữ chung của màn (hairline inset + nền raised),
 * đặt ở `prompt-lab.css` cho MỌI ô nhập chứ không dán riêng vào đây.
 */
export function NoteField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={`Ghi chú cho ${label}`}
      className="h-7 w-full rounded-2 border border-line-subtle bg-transparent px-2 text-caption text-fg placeholder:text-fg-muted"
    />
  );
}
