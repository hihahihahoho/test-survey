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
function RefPreview({ name }: { name: string }) {
  const projectId = useWorkflowProjectId();
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => { let alive = true; let url: string | null = null; api.refs.blob(projectId, name).then(blob => { if (alive) { url = URL.createObjectURL(blob); setSrc(url); } }).catch(() => setSrc(null)); return () => { alive = false; if (url) URL.revokeObjectURL(url); }; }, [projectId, name]);
  return src ? <img src={src} alt="" /> : <ImageIcon aria-hidden />;
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
        <span className="file-chip ref-preview-card" key={r.name}>
          <RefPreview name={r.name} /><span title={r.name}>{r.name}</span>
          <button type="button" aria-label={`Xoá ảnh ${r.name}`} onClick={() => onRemove(r.name)}>
            <X aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
