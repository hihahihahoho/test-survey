import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { PencilLine, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import type { ScreenProps } from "@/components/layout";
import { DISPLAY } from "@/components/layout/flora";
import { useAgentStatus } from "@/lib/hooks";
import { contractJobs } from "@/lib/types";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { createNav } from "@/features/projects/lib/nav";
import { useProjectDialogs } from "@/features/projects/lib/useProjectDialogs";
import { ProjectDialogs } from "@/features/projects/ProjectDialogs";
import { CopyFigmaButton, DownloadKitButton } from "@/features/kit/components/KitExits";
import { DemoScreenButton } from "@/features/demo";
import { SheetResultPanel } from "@/features/prompt-canvas/components/result";
import { Route as ProjectRoute } from "@/routes/p.$projectId";
import { ProjectError, ProjectLoading, ProjectMissing } from "./components/ScreenStates";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog";
import { useProjectData } from "./lib/useProjectData";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * `/p/:projectId` — KẾT QUẢ & XUẤT KIT. Nơi XEM và LẤY HÀNG, không phải nơi soạn.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ╔══ VÌ SAO MÀN NÀY BỊ VIẾT LẠI TỪ ĐẦU ═════════════════════════════════════╗
 * ║ Bản trước là "trình quản lý dự án": sidebar 4 mục, hai trang sửa được với  ║
 * ║ 4 tab mỗi trang, một bản nháp trong RAM (`useProjectBuffer`), hàng nút Lưu ║
 * ║ ở sáu chỗ, dialog Cài đặt chở `BriefStep`/`StyleStep`. Toàn bộ khối đó là  ║
 * ║ NƠI SOẠN thứ hai của app — dựng cho thời wizard, khi `/k/:id` chỉ là sáu   ║
 * ║ bước điền form. Từ khi `/k/:id` thành khu soạn prompt (PromptCanvasScreen),║
 * ║ hai nơi soạn cùng ghi vào một `contract.json` là hai bản dịch của cùng một ║
 * ║ dự án — và người dùng không có cách nào biết bản nào đang thắng.           ║
 * ║                                                                            ║
 * ║ Nên IA mới cắt dứt khoát theo ĐỘNG TỪ, không theo dữ liệu:                 ║
 * ║   · `/k/:id` — SOẠN (gõ chữ, chọn pill, bấm Vẽ từng thẻ)                   ║
 * ║   · `/p/:id` — XEM + XUẤT (ảnh đã ra, tải về, copy sang Figma)             ║
 * ║ Ở đây KHÔNG có một control nào ghi vào bản thiết kế. Muốn sửa ⇒ một nút    ║
 * ║ nổi bật đưa sang khu soạn, và đó là đường DUY NHẤT.                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ RUỘT THẺ KẾT QUẢ LÀ ĐỒ ĐI MƯỢN, CÓ CHỦ Ý ══════════════════════════════
 * Mỗi tấm được vẽ bằng ĐÚNG `SheetResultPanel` mà khu soạn đang treo dưới chân
 * từng thẻ (3 tab «Ảnh gốc · Đã crop · Khung xương» + chọn phiên bản + Copy Figma
 * + Tải PNG). Không nhân bản một biến thể riêng cho màn này: hai bản của cùng một
 * thứ sẽ lệch nhau ở lần sửa thứ nhất, và bản không ai đo là bản người dùng gặp.
 * Panel tự đọc `#42 GET …/kit` và `useContract` nên nó KHÔNG cần prop dữ liệu nào
 * ngoài `sheetId` + `job`.
 *
 * ══ VÌ SAO DANH SÁCH TẤM ĐI QUA `contractJobs` ════════════════════════════
 * `contractJobs(contract)` là chỗ DUY NHẤT trong app biết luật ghép tên lượt vẽ
 * (`${variant.id}-${sheet.id}`, khớp `agent/lib/contract.mjs`) và biết cả bộ lọc
 * `sheet.variants`. Ghép tay `chinh-<id>` ở đây thì dự án nhiều phong cách sẽ mất
 * tấm trong im lặng — và một ô ảnh trống không tự tố cáo nguyên nhân.
 */
export function ProjectScreen({ projectId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createNav(navigate), [navigate]);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);

  const search = ProjectRoute.useSearch();
  const data = useProjectData(projectId, status);
  const { project, contract } = data;

  const all = React.useMemo(() => (project ? [project] : []), [project]);
  const dialogs = useProjectDialogs(all);

  /**
   * `?settings=` CHỈ CÒN NGHĨA «dialog đang mở», không còn là tên tab.
   *
   * Dialog cũ có ba tab vì hai trong số đó chở `BriefStep`/`StyleStep` — hai nơi
   * soạn nay đã chuyển hẳn sang khu soạn. Giá trị cũ (`requirements`, `style`)
   * vẫn nằm trong bookmark và trong bảng lệnh đời trước, nên schema vẫn nhận
   * chúng: một link cũ mở đúng cái cửa còn lại thay vì rơi vào hư không.
   */
  const settingsOpen = search.settings !== undefined;
  const setSettings = React.useCallback((open: boolean) => {
    void navigate({
      to: "/p/$projectId",
      params: { projectId },
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        settings: open ? "project" : undefined,
      })) as never,
      replace: !open,
    });
  }, [navigate, projectId]);

  /* Tấm của dự án = bản ĐÃ LƯU trên đĩa. Bản soạn dở nằm ở khu soạn và chỉ ở đó:
     màn này hứa "đây là thứ đã ra", nên nó không được vẽ theo một bản nháp. */
  const jobs = React.useMemo(() => (contract ? contractJobs(contract) : []), [contract]);

  if (data.isLoading && !project) return <ProjectLoading cards={3} label="Đang mở dự án…" />;
  if (!project) {
    if (data.inTrash || data.notFound) return <ProjectMissing inTrash={data.inTrash} />;
    return <ProjectError projectId={projectId} error={data.fatalError} onRetry={data.refetch} onOpenHistory={null} />;
  }

  return (
    <div className="kg-page flex w-full flex-col gap-6 py-6 pb-16 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Kết quả &amp; xuất kit</p>
          <h1 className={`${DISPLAY} text-fg-strong`}>{project.name}</h1>
          <p className="mt-1 text-body text-fg-muted">
            {jobs.length > 0
              ? `${jobs.length} tấm trong bộ kit. Mỗi tấm xem được ảnh gốc, ô đã crop và khung xương.`
              : "Dự án chưa có tấm nào — sang khu soạn để đặt thẻ đầu tiên."}
          </p>
        </div>

        {/* NÚT SANG KHU SOẠN là `primary` và đứng một mình ở mép phải: nó là hành
            động DUY NHẤT ở màn này làm đổi bộ kit, nên mọi nút khác phải nhẹ hơn
            nó về thị giác, kể cả hai cửa ra bên dưới. */}
        <Button variant="primary" onClick={() => nav.openWizard(projectId)}>
          <PencilLine aria-hidden />
          Mở khu soạn
        </Button>
      </header>

      {/* ── Hàng cửa ra ──────────────────────────────────────────────────────
          Ba nút đầu đều 0 đồng (đọc đĩa · canvas + clipboard), nút Cài đặt mở
          phần meta của dự án. Không nút nào ở đây tiêu một lượt tạo ảnh, nên
          hàng này KHÔNG cần `gate` — trừ Cài đặt, nơi có thao tác ghi thật. */}
      <div className="flex flex-wrap items-center gap-2">
        <DownloadKitButton projectId={projectId} />
        <CopyFigmaButton projectId={projectId} kitName={project.name} />
        <DemoScreenButton projectId={projectId} />
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => setSettings(true)}>
          <Settings aria-hidden />
          Cài đặt dự án
        </Button>
        <Button
          variant="ghost"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={() => dialogs.openDialog("delete", project)}
        >
          <Trash2 aria-hidden />
          Xoá dự án
        </Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={PencilLine}
          title="Chưa có tấm nào để xem"
          description="Bộ kit của dự án này còn trống. Khu soạn là nơi đặt thẻ, gõ mô tả và bấm Vẽ cho từng tấm."
          action={
            <Button variant="primary" onClick={() => nav.openWizard(projectId)}>
              <PencilLine aria-hidden />
              Mở khu soạn
            </Button>
          }
        />
      ) : (
        /* MỘT CỘT dưới 1280px: panel kết quả có ảnh cao tới 420px cộng ba tab —
           nhét hai cái cạnh nhau ở màn hẹp là hai cột ảnh bé xíu không đọc được. */
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {jobs.map(({ job, sheet }) => (
            <SheetResultPanel key={job} projectId={projectId} sheetId={sheet} job={job} />
          ))}
        </div>
      )}

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettings}
        project={project}
        gate={gate}
        variantId={data.firstVariantId}
        onDuplicate={() => { setSettings(false); dialogs.openDialog("duplicate", project); }}
        onExport={() => { setSettings(false); dialogs.openDialog("export", project); }}
        onDelete={() => { setSettings(false); dialogs.openDialog("delete", project); }}
      />

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
