import * as React from "react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common";
import { devDetails, presentError, type ConnectionStatus } from "@/lib/api";
import type { useDoctor } from "@/lib/hooks";
import { DoctorChecklist } from "@/features/setup/steps/parts/DoctorChecklist";
import { ImageGenCard } from "@/features/setup/steps/parts/ImageGenCard";
import { ErrorDocsPanel } from "@/features/docs/components/ErrorDocsPanel";
import { ImageProfileToggle } from "../components/ImageProfileToggle";
import { codeFromLocationHash } from "@/features/docs/lib/anchors";

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
 * TRA CỨU MÃ LỖI (INTEGRATION): `features/docs/**` (1058 dòng: catalog 40+ mã, anchors,
 * panel, dialog) đã được viết đầy đủ nhưng KHÔNG file nào ngoài thư mục đó import —
 * mã chết hoàn toàn. Chính `docs/lib/anchors.ts` khai đích của nó là
 * `/settings?tab=env#loi-<anchor>` (vì route `/docs/errors` chưa có). Mọi envelope lỗi
 * của agent đều kèm `docs: "/docs/errors#<mã>"`, nên không cắm thì mỗi link trợ giúp
 * dẫn tới hư không. Ở đây cắm đúng chỗ tác giả đã thiết kế, KHÔNG sửa file của họ.
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
      {/* Thẻ trên chỉ NÓI trạng thái; thẻ này là chỗ ĐỔI hồ sơ Codex (~/.codex ↔ ~/.codex-img)
          và lưu bền vào `<workspace>/.kitgen/config.json`. */}
      <ImageProfileToggle doctor={doctor} status={status} />
      <DoctorChecklist doctor={doctor.data ?? null} />
      {docs}
    </div>
  );
}
