import * as React from "react";
import { X, ImageIcon } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { useWorkflowProjectId } from "../lib/model";
import type { RefItem } from "@/lib/types/api";

/**
 * Chip ảnh tham khảo — §W3-3.
 *
 * Nguồn dữ liệu là **đĩa** (`GET /api/projects/:id/refs`), không phải bản nháp: đó
 * chính là lý do F5 xong chip vẫn còn. Khi chưa đọc được đĩa (công cụ local chưa
 * chạy) thì `fallback` giữ tên trong bản nháp hiện ra — nhưng KHÔNG có nút xoá, vì
 * lúc đó chẳng có gì trên đĩa để mà xoá.
 *
 * Nút xoá luôn có nhãn đọc được (`aria-label`), không phải một dấu × trơ.
 */
/**
 * ══ Ô XÁM CÂM: MỘT LỖI BỊ NUỐT, KHÔNG PHẢI MỘT TRẠNG THÁI ═══════════════════
 *
 * Bản cũ là `.catch(() => setSrc(null))` — mọi lỗi, từ mất mạng tới huỷ giữa
 * chừng, đều thành đúng một ô xám không chữ. Người test mù #2 vì thế báo "server
 * trả 200 image/png mà UI trống", và không có gì trong console để lần ra.
 *
 * Nguyên nhân thật đã sửa ở tầng dưới (`lib/api/client.ts` — hạn 8 giây của
 * request vẫn đếm trên thân ảnh sau khi header đã về; tái hiện được bằng cách
 * throttle mạng). Nhưng cái khiến nó KHÔNG THỂ CHẨN ĐOÁN là chỗ này, nên chỗ này
 * cũng phải sửa: ghi `console.warn` để lần sau còn có dấu vết, và cho ô hỏng một
 * `title` nói ra rằng nó hỏng — thay vì giả vờ là một ô ảnh đang chờ.
 */
function RefPreview({ name }: { name: string }) {
  const projectId = useWorkflowProjectId();
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setFailed(false);
    api.refs.blob(projectId, name).then(
      (blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn(`[refs] không tải được ảnh tham chiếu "${name}":`, err);
        setSrc(null);
        setFailed(true);
      },
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projectId, name]);

  if (src) return <img src={src} alt="" />;
  return <ImageIcon aria-hidden={!failed} aria-label={failed ? `Không tải được ảnh ${name}` : undefined} />;
}

export function RefChips({
  items,
  ready,
  fallback,
  onRemove,
  emptyHint,
}: {
  items: readonly RefItem[];
  /** Đã đọc được danh sách trên đĩa chưa. */
  ready: boolean;
  /** Tên còn lại trong bản nháp — chỉ dùng khi chưa đọc được đĩa. */
  fallback: readonly { name: string }[];
  onRemove: (name: string) => void;
  emptyHint?: string;
}) {
  if (!ready) {
    if (fallback.length === 0) return null;
    return (
      <div className="ref-chips">
        {fallback.map((r) => (
          <span className="file-chip" key={r.name} title="Chưa lưu lên đĩa — công cụ local chưa chạy">
            {r.name} · chưa lưu
          </span>
        ))}
      </div>
    );
  }
  if (items.length === 0) return emptyHint ? <p className="muted">{emptyHint}</p> : null;
  return (
    <div className="ref-chips">
      {items.map((r) => (
        <span className="ref-preview-card" key={r.name} title={r.name}>
          <RefPreview name={r.name} />
          <button type="button" aria-label={`Xoá ảnh ${r.name}`} onClick={() => onRemove(r.name)}>
            <X aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
