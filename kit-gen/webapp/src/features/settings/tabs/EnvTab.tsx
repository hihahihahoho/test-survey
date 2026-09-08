import * as React from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common";
import { devDetails, presentError, type ConnectionStatus } from "@/lib/api";
import type { useDoctor } from "@/lib/hooks";
import { DoctorChecklist } from "../parts/DoctorChecklist";
import { ImageGenCard } from "../parts/ImageGenCard";
import { ErrorDocsPanel } from "@/features/settings/errors/ErrorDocsPanel";
import { codeFromLocationHash } from "@/features/settings/errors/anchors";

/**
 * TAB "MÔI TRƯỜNG" (§3-S6) — yêu cầu #5.
 *
 * DÙNG LẠI nguyên hai khối của S0 (`ImageGenCard` + `DoctorChecklist` của R1-P2):
 * cùng một dữ liệu doctor, cùng một cách nói. Viết lại ở đây là cách chắc chắn để
 * hai màn nói hai kiểu về cùng một sự thật — đúng bệnh U5 của v1.
 *
 * Doctor CẤM poll (§6.2, nó chạy `codex debug prompt-input` ~1s) ⇒ màn cha chỉ bật
 * query khi user đang xem đúng tab này, và làm mới bằng nút [Kiểm tra lại].
 *
 * 4 trạng thái: loading (skeleton) · error (không kiểm được + [Thử lại], message kỹ
 * thuật CHỈ trong panel dev) · success · agent tắt (nói thẳng là cần công cụ local).
 *
 * TRA CỨU MÃ LỖI: catalog 40+ mã + anchors + panel sống ở `features/settings/errors/`
 * (Đợt 2 dời về đây từ `features/docs/**`, thư mục đó chỉ còn phần này là có người dùng).
 * `errors/anchors.ts` khai đích là `/settings?tab=env#loi-<anchor>` — và nay đó là đích
 * DUY NHẤT: agent đã gỡ hẳn các route `/docs*`. Mọi envelope lỗi của agent vẫn kèm
 * `docs: "/docs/errors#<mã>"`, nên không cắm thì mỗi link trợ giúp dẫn tới hư không.
 */
export function EnvTab({
  doctor,
  status,
}: {
  doctor: ReturnType<typeof useDoctor>;
  status: ConnectionStatus;
}) {
  /* Mã lỗi cần nhảy tới, lấy từ hash — đường mà `error.docs` trỏ về. */
  const [focusCode, setFocusCode] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : codeFromLocationHash(window.location.hash),
  );
  React.useEffect(() => {
    const onHash = () => setFocusCode(codeFromLocationHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** Bảng tra mã lỗi là bảng TĨNH ⇒ đọc được kể cả khi agent tắt. Luôn hiện. */
  const docs = <ErrorDocsPanel focusCode={focusCode} />;

  if (!status.connected) {
    return (
      <div className="flex flex-col gap-5">
        <ErrorState
          title="Chưa kiểm tra được môi trường"
          description="Việc kiểm tra chạy trên máy bạn, nên cần công cụ local đang chạy. Mở Terminal chạy nó rồi bấm Kiểm tra lại."
          actions={
            <Button variant="primary" size="sm" onClick={() => void doctor.refetch()}>
              Thử lại
            </Button>
          }
        />
        {docs}
      </div>
    );
  }

  if (doctor.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <LoadingState count={3} label="Đang kiểm tra môi trường trên máy bạn…" />
        {docs}
      </div>
    );
  }

  if (doctor.error) {
    return (
      <div className="flex flex-col gap-5">
      <ErrorState
        title="Không kiểm tra được môi trường"
        description={presentError(doctor.error).explain}
        detail={devDetails(doctor.error)}
        actions={
          <Button variant="primary" size="sm" onClick={() => void doctor.refetch()}>
            Thử lại
          </Button>
        }
      />
      {docs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ImageGenCard doctor={doctor.data ?? null} />
      <DoctorChecklist doctor={doctor.data ?? null} />
      {docs}
    </div>
  );
}
