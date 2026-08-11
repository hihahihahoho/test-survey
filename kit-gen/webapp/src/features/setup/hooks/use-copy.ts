/**
 * features/setup/hooks/use-copy.ts — copy một chuỗi + phản hồi thấy được.
 *
 * `CopyableCode` của R0 đã tự lo copy cho các khối lệnh. Hook này dành cho những nút
 * [Copy lệnh cài] nằm gọn trong một hàng checklist, nơi không đủ chỗ cho cả khối lệnh.
 *
 * Hai chi tiết cố ý:
 *  · clipboard bị từ chối (không phải secure context, user chưa cấp quyền) ⇒ NÓI THẬT
 *    "không copy được, bạn gõ tay nhé" kèm chính chuỗi lệnh, thay vì im lặng thất bại
 *    (§3.9 "thao tác thất bại mà không phản hồi gì" là một trong ba điều tuyệt đối cấm).
 *  · KHÔNG log chuỗi ra console. Ở đây chỉ có lệnh cài đặt, nhưng thói quen log-để-debug
 *    là đường mà secret rò ra ở các màn khác.
 */
import * as React from "react";
import { toast } from "@/components/ui/sonner";

export function useCopy(): { copy: (text: string, what?: string) => Promise<boolean> } {
  const copy = React.useCallback(async (text: string, what = "lệnh") => {
    let ok = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (ok) {
      toast.success(`Đã copy ${what}`, { description: text, duration: 4000 });
    } else {
      toast.info("Trình duyệt không cho copy — bạn gõ tay giúp nhé", {
        description: text,
        duration: 8000,
      });
    }
    return ok;
  }, []);

  return { copy };
}
