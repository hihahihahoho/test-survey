import * as React from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode, StatusDot } from "@/components/common";
import { toast } from "@/components/ui/sonner";
import { presentError } from "@/lib/api";
import { useActivateWorkspace, useWorkspaces } from "@/lib/hooks";
import type { ConnectionStatus } from "@/lib/api";
import type { Doctor } from "@/lib/types/api";
import { InlineBanner } from "../components/InlineBanner";
import { StepCard, StepShell, Note } from "../components/StepShell";
import { WorkspacePicker } from "./parts/WorkspacePicker";
import { ADD_WORKSPACE_CMD } from "../lib/commands";
import { bytes, count } from "../lib/format";
import { safeHomeLabel } from "../lib/doctor-view";

/**
 * S0 · BƯỚC 3 — THƯ MỤC LÀM VIỆC (yêu cầu #6, chốt X1).
 *
 * "Chọn folder workspace" ở đây KHÔNG phải là hộp thoại chọn thư mục của hệ điều hành.
 * Chốt X1 của spec nói rõ vì sao và tôi thi công đúng thế:
 *   (a) HIỂN THỊ nhãn rút gọn + ghi được ✓ + dung lượng trống, đọc từ /health + /api/doctor;
 *   (b) CHỌN giữa các thư mục agent đã biết — `GET /api/workspaces` rồi
 *       `POST /api/workspace/activate {workspaceId}`, web gửi **id đục**, không gửi path;
 *   (c) muốn thêm chỗ mới → hiện LỆNH copy-1-nút; agent là bên tạo thư mục nếu chưa có
 *       (script bước 1 đã `mkdir -p`), web không tự tạo được và không giả vờ là tạo được.
 * Lựa chọn được nhớ ở trình duyệt: `useActivateWorkspace` của R0 xoá sạch cache query cũ
 * (dữ liệu của workspace cũ là SAI, không phải "cũ").
 *
 * Ca KHÔNG GHI ĐƯỢC hiện thành banner đỏ có lệnh khắc phục, và **vẫn cho đi tiếp** —
 * chặn cứng ở đây chỉ làm user kẹt trong wizard mà không hiểu vì sao.
 */
export interface StepWorkspaceProps {
  status: ConnectionStatus;
  doctor: Doctor | null;
  doctorLoading: boolean;
  onRecheck: () => void;
  onNext: () => void;
  onWorkspaceChanged: () => void;
}

export function StepWorkspace({
  status, doctor, doctorLoading, onRecheck, onNext, onWorkspaceChanged,
}: StepWorkspaceProps) {
  const connected = status.connected;
  const list = useWorkspaces({ enabled: connected });
  const activate = useActivateWorkspace();

  const lead =
    "Đây là nơi mọi project được lưu trên máy bạn. Trang web không bao giờ nhận đường dẫn bạn gõ — " +
    "nó chỉ chọn giữa những thư mục mà công cụ local đã biết.";

  const onActivate = React.useCallback(
    (id: string) => {
      activate.mutate(id, {
        onSuccess: (res) => {
          toast.success(`Đã chuyển sang ${res.workspaceLabel ?? "thư mục đã chọn"}`, {
            description: "Danh sách project sẽ được tải lại theo thư mục mới.",
          });
          onWorkspaceChanged();
        },
        onError: (e) => {
          // §5.5: toast KHÔNG phải nơi duy nhất báo lỗi — WorkspacePicker cũng hiện inline.
          const v = presentError(e);
          toast.error(v.title, { description: v.explain });
        },
      });
    },
    [activate, onWorkspaceChanged]
  );

  /* ── CA AGENT CHƯA CHẠY: không treo, không trắng trang ─────────────────── */
  if (!connected) {
    return (
      <StepShell title="Thư mục làm việc" lead={lead}>
        <InlineBanner
          tone="warning"
          title="Cần công cụ local đang chạy mới đọc được danh sách thư mục"
          description="Quay lại bước 2 để chạy nó, hoặc bấm kiểm tra lại nếu bạn vừa chạy xong."
          actions={
            <Button variant="secondary" onClick={onRecheck}>
              <RefreshCw aria-hidden />
              Kiểm tra lại
            </Button>
          }
        />
        <StepCard title="Muốn dùng thư mục khác?">
          <p className="text-body text-fg">
            Chạy lệnh này trong Terminal (đổi đường dẫn theo ý bạn). Công cụ local sẽ tạo thư mục
            nếu chưa có:
          </p>
          <CopyableCode value={ADD_WORKSPACE_CMD} label="Lệnh thêm thư mục làm việc" />
        </StepCard>
      </StepShell>
    );
  }

  const ws = doctor?.workspace;
  const wsLabel = safeHomeLabel(ws?.label) ?? status.workspaceLabel ?? "—";
  const unwritable = ws?.writable === false;

  return (
    <StepShell title="Thư mục làm việc" lead={lead}>
      <StepCard title="Đang dùng">
        <p className="inline-flex items-center gap-2 text-title font-medium text-fg-strong">
          <HardDrive className="size-4 text-accent-text" aria-hidden />
          {wsLabel}
        </p>
        {doctorLoading && !doctor ? (
          <Note>Đang đọc dung lượng và quyền ghi…</Note>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <StatusDot
              tone={ws?.writable === true ? "ok" : unwritable ? "danger" : "never"}
              label={
                ws?.writable === true
                  ? "ghi được"
                  : unwritable
                    ? "KHÔNG ghi được"
                    : "chưa kiểm được quyền ghi"
              }
            />
            <Note>
              {[
                typeof ws?.freeBytes === "number" ? `còn ${bytes(ws.freeBytes)} trống` : null,
                typeof status.health?.projects === "number"
                  ? count(status.health.projects, "project")
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Chưa đọc được dung lượng trống."}
            </Note>
          </div>
        )}

        {unwritable && (
          <InlineBanner
            tone="danger"
            title="Không ghi được vào thư mục này"
            description="Kiểm tra quyền của thư mục hoặc dung lượng ổ đĩa. Chưa sửa thì sẽ không tạo được project nào — bạn vẫn xem được phần còn lại."
            actions={
              <Button variant="secondary" size="sm" onClick={onRecheck}>
                <RefreshCw aria-hidden />
                Kiểm tra lại
              </Button>
            }
          />
        )}
      </StepCard>

      <WorkspacePicker
        items={list.data?.items ?? []}
        activeId={list.data?.activeId ?? null}
        loading={list.isPending}
        error={list.error}
        activating={activate.isPending}
        activateError={activate.error}
        onRetry={() => void list.refetch()}
        onActivate={onActivate}
      />

      <StepCard title="Muốn dùng thư mục khác?">
        <p className="text-body text-fg">
          Chạy lệnh này trong Terminal (đổi đường dẫn theo ý bạn) rồi bấm Kiểm tra lại. Công cụ
          local sẽ tạo thư mục nếu chưa có và tự kiểm tra quyền ghi:
        </p>
        <CopyableCode value={ADD_WORKSPACE_CMD} label="Lệnh thêm thư mục làm việc" />
        <Note>Lựa chọn của bạn được ghi nhớ trong trình duyệt này.</Note>
      </StepCard>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" onClick={onNext} data-kg-primary="">
          Tiếp: kiểm tra môi trường tạo ảnh →
        </Button>
        <Button variant="ghost" onClick={onRecheck} loading={doctorLoading}>
          <RefreshCw aria-hidden />
          Kiểm tra lại
        </Button>
      </div>
    </StepShell>
  );
}
