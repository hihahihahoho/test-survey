import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
import { useAgentStatus } from "@/lib/hooks";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { createNav } from "@/features/projects/lib/nav";
import { useProjectDialogs } from "@/features/projects/lib/useProjectDialogs";
import { ProjectDialogs } from "@/features/projects/ProjectDialogs";
import { DISPLAY } from "@/components/layout/flora";

import { ProjectError, ProjectLoading, ProjectMissing } from "./components/ScreenStates";
import { DiskCard } from "./settings/DiskCard";
import { InfoForm } from "./settings/InfoForm";
import { useProjectData } from "./lib/useProjectData";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * S2b · CÀI ĐẶT PROJECT (`/p/:id/settings`) — UX-SPEC §3-S2b
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * VIẾT BỞI INTEGRATION LEAD, KHÔNG PHẢI TEAM MÀN. Team S2 (R3-P1) đã nộp đủ 4 khối
 * con (`settings/InfoForm`, `settings/DiskCard`, `settings/CoverPicker`,
 * `settings/TagField`) và cả `settings/schema.ts`, nhưng KHÔNG nộp file màn theo
 * hợp đồng lazy-mount ⇒ route `/p/:id/settings` render `<ScreenPlaceholder>`, tức là
 * ~1000 dòng đã viết KHÔNG có đường nào tới được. File này chỉ làm việc lắp ráp:
 * nối 3 khối của spec (Thông tin · Dung lượng · Vùng nguy hiểm) + 4 trạng thái.
 * KHÔNG có nghiệp vụ mới nào được phát minh ở đây.
 *
 * BA KHỐI theo wireframe §3-S2b, đúng thứ tự:
 *   ① Thông tin      → `InfoForm`  (PATCH #10, slug, ảnh bìa, tag, mở thư mục)
 *   ② Dung lượng     → `DiskCard`  (phân rã `stats.diskBreakdown`, dọn ảnh AI cũ)
 *   ③ Vùng nguy hiểm → viền `--danger`, gom 3 thao tác nặng: nhân bản · xuất · xoá.
 *      Cả ba dùng lại ĐÚNG dialog của S1 (`ProjectDialogs`) — không dựng bản thứ hai,
 *      nhờ đó thừa hưởng luôn lớp chống C-01 (`ActiveRunGuard`) và toast Hoàn tác 10s.
 *
 * ĐỦ 4 TRẠNG THÁI + CA AGENT CHƯA CHẠY:
 *   loading → `ProjectLoading` 3 thẻ (đúng số khối của màn, §5.6)
 *   empty   → §3-S2b nói rõ "không có trạng thái rỗng thật"; project mới thì
 *             `DiskCard` tự hiện 0 B + câu giải thích.
 *   error   → `ProjectMissing` cho NOT_FOUND/IN_TRASH, `ProjectError` cho phần còn lại;
 *             message kỹ thuật CHỈ trong panel "Chi tiết cho lập trình viên".
 *   success → 3 khối.
 *   agent tắt → vẽ từ cache của S1 (`useProjectData` lo), mọi nút ghi disabled KÈM
 *             LÝ DO tại chỗ (`gate`), KHÔNG ẩn nút (§2.5-2). Banner chung là việc của
 *             khung — màn không vẽ lại để tránh hai thông báo chồng nhau.
 *
 * `⌘S` = Lưu: form nằm trong `InfoForm` nên màn giữ `submitRef` để bấm đúng nút Lưu
 * thật, KHÔNG dò bằng selector.
 */
export function ProjectSettingsScreen({ projectId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createNav(navigate), [navigate]);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);

  const data = useProjectData(projectId, status);
  const { project } = data;

  const all = React.useMemo(() => (project ? [project] : []), [project]);
  const dialogs = useProjectDialogs(all);

  const submitRef = React.useRef<(() => void) | null>(null);
  const [dirty, setDirty] = React.useState(false);

  /** ⌘S — chặn "Lưu trang" của trình duyệt (§2.3). Chỉ khi form thật sự bẩn. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !gate.readOnly) submitRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, gate.readOnly]);

  useRegisterCommands(
    () => [
      {
        id: "project-settings.save",
        label: "Lưu thay đổi cài đặt project",
        hint: ["mod", "S"],
        disabledReason: gate.readOnly ? gate.reason : dirty ? null : "Chưa có thay đổi nào để lưu",
        run: () => submitRef.current?.(),
      },
      {
        id: "project-settings.duplicate",
        label: "Nhân bản project này…",
        icon: Copy,
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => project && dialogs.openDialog("duplicate", project),
      },
      {
        id: "project-settings.export",
        label: "Xuất project ra file .zip…",
        icon: Download,
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => project && dialogs.openDialog("export", project),
      },
      {
        id: "project-settings.delete",
        label: "Xoá project này…",
        icon: Trash2,
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => project && dialogs.openDialog("delete", project),
      },
    ],
    [gate.readOnly, gate.reason, dirty, project, dialogs],
  );

  if (data.isLoading && !project) {
    return <ProjectLoading cards={3} label="Đang mở cài đặt project…" />;
  }

  if (!project) {
    if (data.inTrash || data.notFound) return <ProjectMissing inTrash={data.inTrash} />;
    return (
      <ProjectError projectId={projectId} error={data.fatalError} onRetry={data.refetch} onOpenHistory={null} />
    );
  }

  return (
    <div className="kg-page flex w-full flex-col gap-8 py-6 pb-16 sm:py-8">
      <header className="flex flex-col gap-1">
        {/* W2B-1/5 — cỡ về `DISPLAY`; "project" là JARGON (2B-7) nên vừa đổi chữ vừa
            bỏ nhấn serif: "Cài đặt bộ kit" là 3 từ nhưng không từ nào đáng nhấn. */}
        <h1 className={`${DISPLAY} text-fg-strong`}>Cài đặt bộ kit</h1>
        <p className="text-body text-fg-muted">{project.name}</p>
      </header>

      {/* ① Thông tin */}
      <InfoForm
        project={project}
        gate={gate}
        variantId={data.firstVariantId}
        submitRef={submitRef}
        onDirtyChange={setDirty}
      />

      {/* ② Dung lượng */}
      <DiskCard project={project} gate={gate} onOpenClean={() => dialogs.openDialog("clean", project)} />

      {/* ③ Vùng nguy hiểm — §3-S2b đòi viền --danger để tách hẳn khỏi phần trên. */}
      <Card className="border-danger/60">
        <CardHeader>
          <CardTitle className="text-danger">Vùng nguy hiểm</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-line-subtle">
          <DangerRow
            title="Nhân bản project này"
            description="Tạo một bản sao. Chọn được giữ hay bỏ ảnh AI đã sinh."
            action={
              <Button
                variant="secondary"
                disabled={gate.readOnly}
                aria-disabled={gate.readOnly || undefined}
                title={gate.readOnly ? gate.reason : undefined}
                onClick={() => dialogs.openDialog("duplicate", project)}
              >
                <Copy aria-hidden />
                Nhân bản…
              </Button>
            }
          />
          <DangerRow
            title="Xuất ra file .zip"
            description="Đóng gói bản thiết kế, kit đã cắt và ảnh tham khảo thành một file tải về."
            action={
              <Button
                variant="secondary"
                disabled={gate.readOnly}
                aria-disabled={gate.readOnly || undefined}
                title={gate.readOnly ? gate.reason : undefined}
                onClick={() => dialogs.openDialog("export", project)}
              >
                <Download aria-hidden />
                Xuất…
              </Button>
            }
          />
          <DangerRow
            title="Chuyển project vào thùng rác"
            description="Giữ 30 ngày và phục hồi lại được. Ngay sau khi xoá vẫn có 10 giây để hoàn tác."
            action={
              <Button
                variant="danger"
                disabled={gate.readOnly}
                aria-disabled={gate.readOnly || undefined}
                title={gate.readOnly ? gate.reason : undefined}
                onClick={() => dialogs.openDialog("delete", project)}
              >
                <Trash2 aria-hidden />
                Xoá…
              </Button>
            }
          />
        </CardContent>
      </Card>

      <ProjectDialogs
        dialogs={dialogs}
        all={all}
        gate={gate}
        nav={nav}
        /* Xoá xong thì không còn màn nào để ở lại — về danh sách (§4.4). */
        onDeleted={() => void navigate({ to: "/" })}
      />
    </div>
  );
}

/** Một dòng của Vùng nguy hiểm: mô tả hậu quả TRƯỚC, nút ở cuối (§1.1 "nói trước khi làm"). */
function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-subtitle text-fg-strong">{title}</p>
        <p className="max-w-[62ch] text-body text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
