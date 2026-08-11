import { useNavigate } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableCode, InlineBanner, StatusDot } from "@/components/common";
import { ADD_WORKSPACE_CMD } from "@/components/layout";
import type { ConnectionStatus } from "@/lib/api";
import { AGENT_STATUS } from "@/lib/status";
import { useActivateWorkspace, useWorkspaces } from "@/lib/hooks";
import { LS_KEYS } from "@/lib/store";
import { WorkspacePicker } from "@/features/setup/steps/parts/WorkspacePicker";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";

/**
 * TAB "CÔNG CỤ LOCAL" (§3-S6) — yêu cầu #6.
 *
 * CHỐT X1: web CHỈ chọn giữa các workspace agent đã khai, và gửi `workspaceId`
 * (id đục kiểu `ws_8f2c`), KHÔNG BAO GIỜ gửi đường dẫn. Muốn thêm thư mục khác thì
 * chạy lệnh ở máy — đó là lý do có khối [Copy] lệnh bên dưới thay vì một ô nhập path.
 *
 * Đổi workspace ⇒ xoá `kitgen.projects.cache.v1` rồi về S1: cache đó là danh sách
 * project của thư mục CŨ; giữ lại thì S1 sẽ vẽ project không còn tồn tại và gắn nhãn
 * "dữ liệu đã lưu trên máy này" — nói dối về nơi dữ liệu đang nằm.
 *
 * DÙNG LẠI `WorkspacePicker` của S0 (R1-P2), không dựng bản thứ hai.
 */
export function AgentTab({ status, onRecheck }: { status: ConnectionStatus; onRecheck: () => void }) {
  const navigate = useNavigate();
  const ws = useWorkspaces({ enabled: status.connected });
  const activate = useActivateWorkspace();
  const meta = AGENT_STATUS[status.pill];
  /* `StatusMeta.tone` có 8 giá trị (dùng chung cho badge job), `StatusDot` chỉ nhận 6.
     `queued`/`stale` không bao giờ là tone của agent, nhưng quy đổi tường minh vẫn hơn
     ép kiểu — ép kiểu là chỗ lỗi sẽ nằm im cho tới lúc chạy. */
  const dotTone = meta.tone === "queued" ? "never" : meta.tone === "stale" ? "warn" : meta.tone;

  const items = ws.data?.items ?? [];
  const activeId = ws.data?.activeId ?? null;

  const onActivate = (id: string) => {
    const target = items.find((w) => w.id === id);
    activate.mutate(id, {
      onSuccess: () => {
        // Cache của thư mục CŨ không còn đúng ⇒ bỏ đi trước khi rời màn.
        try { localStorage.removeItem(LS_KEYS.projectsCache); } catch { /* riêng tư mode */ }
        toastSuccess(`Đã chuyển sang ${target?.label ?? "thư mục đã chọn"}`);
        void navigate({ to: "/" });
      },
      onError: (e: unknown) => toastError(e),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Kết nối</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusDot tone={dotTone} label={meta.label} />
            <span className="text-caption text-fg-muted">
              {[
                status.base,
                status.agentVersion ? `công cụ local v${status.agentVersion}` : null,
                status.instanceLabel,
              ].filter(Boolean).join(" · ") || "chưa có thông tin kết nối"}
            </span>
          </div>
          <p className="text-body text-fg-muted">
            Chế độ:{" "}
            {status.entry === "mirror" ? "bản chạy tại máy" : "gọi trực tiếp từ trang web"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRecheck}>Kiểm tra lại</Button>
            {!status.connected && (
              <Button variant="secondary" size="sm" asChild>
                <a href={status.mirrorUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  Mở bản chạy tại máy
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status.connected ? (
        <WorkspacePicker
          items={items}
          activeId={activeId}
          loading={ws.isLoading}
          error={ws.error}
          activating={activate.isPending}
          activateError={activate.error}
          onRetry={() => void ws.refetch()}
          onActivate={onActivate}
        />
      ) : (
        <InlineBanner
          tone="warning"
          title="Chưa thấy công cụ local"
          description="Danh sách thư mục làm việc do công cụ local trên máy bạn cung cấp. Chạy nó rồi bấm Kiểm tra lại."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Thêm thư mục khác</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="max-w-[62ch] text-body text-fg-muted">
            Trang web không tự chọn được thư mục trên máy bạn — đó là chủ đích để nó không
            đọc được gì ngoài phạm vi bạn cho phép. Chạy lệnh này ở Terminal rồi bấm Kiểm tra lại.
          </p>
          <CopyableCode label="Lệnh thêm thư mục làm việc" value={ADD_WORKSPACE_CMD} />
          <p className="text-caption text-fg-muted">
            Lựa chọn thư mục được ghi nhớ trong trình duyệt này.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
