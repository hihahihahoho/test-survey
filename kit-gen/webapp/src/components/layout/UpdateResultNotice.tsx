import * as React from "react";
import { toast } from "@/components/ui/sonner";
import { api } from "@/lib/api/endpoints";
import {
  MANUAL_RESTART_CMD, MANUAL_UPDATE_CMD, clearUpdatePending, probeAgentVersion, readUpdatePending,
  resolveUpdateResult, type PendingUpdate,
} from "@/lib/update";

/**
 * LỜI CHÀO SAU KHI TỰ TẢI LẠI — "Đã cập nhật lên bản X".
 *
 * Không có nó thì lượt cập nhật kết thúc bằng một cú trắng màn hình rồi app hiện ra như
 * cũ: user không biết bản mới đã vào chưa, và ca **cài hỏng** (agent bật lại với version
 * cũ) trông y hệt ca thành công.
 *
 * KHÔNG dựng hệ thống notification mới — app đã có toast dùng chung (`sonner`), và một
 * dòng chào sau reload không đáng để đẻ thêm một feed thông báo phải tự bảo trì.
 *
 * Component KHÔNG vẽ gì. 99,9% số lần mở app nó thoát ngay ở dòng `readUpdatePending()`
 * mà không chạm mạng — chỉ khi có ý định cập nhật đang treo mới hỏi `/health`.
 */

/** Đã chào ở phiên này chưa. Module-level để StrictMode gọi effect hai lần cũng chỉ chào một. */
let greeted = false;

/** Chỉ dùng trong test. */
export function _resetUpdateGreeting(): void {
  greeted = false;
}

/**
 * `restart` là câu trả lời cho ca ĐÃ CÀI XONG MÀ TIẾN TRÌNH CŨ VẪN CHẠY: nhìn từ phía
 * web, ca đó giống hệt ca cài hỏng (agent sống, version y nguyên) — và lời khuyên cho
 * hai ca thì ngược nhau. "Cập nhật lại" ở ca này là bảo user tải lại 200MB để rồi hỏng
 * y như cũ; thứ họ cần là một lệnh `restart`. Chỉ agent phân biệt được, nên phải HỎI
 * (`GET /api/update` → `restartRequired`) thay vì đoán từ hai con số version.
 */
export function announceUpdateResult(
  pending: PendingUpdate,
  runningVersion: string | null,
  cmd: string = MANUAL_UPDATE_CMD,
  restart?: { required?: boolean; command?: string; installedVersion?: string | null } | null,
): void {
  const r = resolveUpdateResult(pending, runningVersion);
  if (r.kind === "success") {
    toast.success(`Đã cập nhật lên bản ${r.runningVersion}`);
    return;
  }
  if (r.kind === "unknown") {
    toast.warning("Chưa xác nhận được bản cập nhật", {
      description: "Công cụ local chưa trả lời. Mở lại nó rồi kiểm tra phiên bản ở Cài đặt → Giới thiệu.",
    });
    return;
  }
  if (restart?.required) {
    toast.warning(`Đã cài bản ${restart.installedVersion ?? r.targetVersion} — cần khởi động lại`, {
      description: `Công cụ local vẫn đang chạy bản ${r.runningVersion}. Chạy lệnh ${restart.command || MANUAL_RESTART_CMD} trong Terminal rồi tải lại trang.`,
    });
    return;
  }
  toast.error("Cập nhật chưa thành công", {
    description: `Công cụ local vẫn đang chạy bản ${r.runningVersion}. Chạy lệnh ${cmd} trong Terminal rồi thử lại.`,
  });
}

export function UpdateResultNotice() {
  React.useEffect(() => {
    if (greeted) return;
    const pending = readUpdatePending();
    if (!pending) return;
    greeted = true;

    /* CỐ Ý KHÔNG có cờ huỷ theo vòng đời component: toast là thứ toàn cục, và nếu bỏ dở
       khi unmount thì StrictMode (mount → cleanup → mount) sẽ nuốt mất lời chào — lần
       gắn thứ hai đã bị `greeted` chặn, còn lần thứ nhất thì vừa bị huỷ. */
    void (async () => {
      /* Trang vừa tải lại NGAY khi agent sống lại, nên nó có thể còn đang dựng workspace.
         Chờ ngắn (20s) rồi mới kết luận — và `null` không bao giờ bị đọc thành "thất bại". */
      const version = await probeAgentVersion();
      clearUpdatePending();
      /* Chỉ hỏi thêm khi sắp phải nói "chưa thành công" — đường thành công (99% số lần)
         vẫn không sinh thêm request nào. */
      const failing = resolveUpdateResult(pending, version).kind === "failed";
      const s = failing ? await api.system.checkUpdate().catch(() => null) : null;
      announceUpdateResult(pending, version, MANUAL_UPDATE_CMD, s && {
        required: s.restartRequired, command: s.restartCommand, installedVersion: s.installedVersion,
      });
    })();
  }, []);

  return null;
}
