/**
 * features/projects/lib/useTemplateCover.ts — URL hiển thị được cho ảnh bìa một template.
 *
 * Hai nơi vẽ ảnh bìa template (ô nhỏ của «Bắt đầu từ», thẻ to của màn «Template dự
 * án») cùng một vòng đời: không có bìa ⇒ KHÔNG hỏi agent (agent trả 404 thật, hỏi là
 * phí một vòng mạng mỗi lần mở); tải hỏng ⇒ `null` để nơi vẽ tự hiện ô giữ chỗ; đổi
 * template giữa chừng ⇒ kết quả cũ về muộn không được đè lên ảnh của template mới.
 * Viết hai lần là hai bản lệch nhau ở đúng một trong ba chỗ đó.
 */
import * as React from "react";
import type { Template } from "@/lib/types";
import { loadTemplateCover, type TemplateCoverWidth } from "./agent-blob";

export function useTemplateCover(
  template: Pick<Template, "id" | "createdAt" | "hasCover">,
  width: TemplateCoverWidth = 128,
): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  const { id, createdAt, hasCover } = template;
  React.useEffect(() => {
    setUrl(null);
    if (!hasCover) return;
    let alive = true;
    loadTemplateCover(id, createdAt ?? "", width)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [id, createdAt, hasCover, width]);
  return url;
}
