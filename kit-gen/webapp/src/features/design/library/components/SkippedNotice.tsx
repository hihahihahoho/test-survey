import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { NormalizedLib } from "../lib/source";

/**
 * Element trong thư viện bị BỎ vì dữ liệu không parse được.
 *
 * Vì sao phải hiện: thư viện có thể bị thay ở `<workspace>/engine/element-lib.json`.
 * Nếu 3 element hỏng mà UI im lặng bỏ qua, user đếm được 39 thay vì 42 và không hiểu
 * vì sao — đúng kiểu "chìm trong im lặng" mà §3.9 cấm. Tên file nằm trong `<details>`
 * để dòng cảnh báo không chiếm chỗ khi mọi thứ bình thường (thường là 0 element hỏng).
 */
export function SkippedNotice({ skipped }: { skipped: NormalizedLib["skipped"] }): React.ReactElement | null {
  if (skipped.length === 0) return null;

  return (
    <details className="rounded-1 kg-tint-warn px-2 py-1.5 text-caption text-on-tint-warn">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        {skipped.length} element trong thư viện bị bỏ qua vì dữ liệu không đọc được
      </summary>
      <ul className="mt-1.5 flex flex-col gap-0.5 pl-5">
        {skipped.map((s) => (
          <li key={s.file}>
            <code className="font-mono">{s.file}</code> — {s.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}
