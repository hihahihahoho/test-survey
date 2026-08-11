import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { FloraShell } from "./FloraShell";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAgentStatus, useProject } from "@/lib/hooks";
import { useRecentStore } from "@/lib/store";
import type { AgentStatus } from "@/lib/status";
import { AgentBanner, AgentDiagnosticBody } from "./AgentBanner";
import { AppBreadcrumb } from "./AppBreadcrumb";
import { CommandPalette } from "./CommandPalette";
import { ProjectJump } from "./ProjectJump";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useGlobalShortcuts } from "./shortcuts";
import {
  ALL_SHEETS_DOC_ID, SCREEN_LABEL, ShellEnvProvider,
  contractSheetIdsOf, runningSheetIdsOf,
  type FileScope, type ScreenId,
} from "./screen-contract";
import { RUN_CMD } from "./agent-commands";
import { api } from "@/lib/api";
import { useDocsList } from "@/features/docs/hooks";
import { buildTabs, resolveActiveId } from "@/features/docs/lib/subfile-model";
import { useContract } from "@/lib/hooks";
import { docPath, withFileParam } from "@/routes/search-schemas";

/**
 * KHUNG ỨNG DỤNG dùng chung cho 8 màn (S0 tự vẽ khung riêng — wizard không có
 * rail, không breadcrumb).
 *
 * Chia việc rõ ràng: `FloraShell` là KHUNG THUẦN (không biết đang ở màn nào);
 * file này là chỗ NỐI khung với router — nó biết màn nào đang mở, project nào
 * đang xem, agent đang ở trạng thái gì, và cung cấp ⌘K/⌘P/`?`.
 *
 * VỎ: `FloraShell` thay `AppShell` của R0 để đạt chuẩn thị giác FLORA-REF §3 (nền #000,
 * header thoáng, ô ⌘K pill, agent status dạng chấm). **Hợp đồng props y nguyên** — đổi lại
 * `import { AppShell } from "@/components/common"` là quay về bản R0. Lý do không sửa
 * thẳng file R0: teams/react/NEEDS-rs2.md (N3).
 *
 * Màn KHÔNG cần tự dựng header/rail/banner. Màn chỉ render nội dung.
 */
export interface AppLayoutProps {
  screen: ScreenId;
  projectId?: string;
  /** Route canvas cũ truyền id; route workflow đọc `?file=`. */
  fileId?: string;
  children: React.ReactNode;
  simplified?: boolean;
}

export function AppLayout({ screen, projectId, fileId, children, simplified = false }: AppLayoutProps) {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [jumpOpen, setJumpOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [agentSheetOpen, setAgentSheetOpen] = React.useState(false);
  const [probing, setProbing] = React.useState(false);

  const project = useProject(projectId);
  const activeRuns = project.data?.state?.activeRun?.runId ? 1 : 0;
  // Nhịp probe nhanh hơn khi có lượt đang chạy (arch §5.3).
  const { status, recheck, runBridgeProbe } = useAgentStatus({ hasActiveRun: activeRuns > 0 });

  const touchRecent = useRecentStore((s) => s.touch);
  React.useEffect(() => {
    if (projectId) touchRecent(projectId);
  }, [projectId, touchRecent]);

  // §5.8-A13: <title> đổi theo màn. Tên project ưu tiên hơn tên màn vì đó là
  // thứ user phân biệt được khi mở nhiều tab.
  React.useEffect(() => {
    const parts = [project.data?.name, SCREEN_LABEL[screen], "kit-gen"].filter(Boolean);
    document.title = parts.join(" · ");
  }, [screen, project.data?.name]);

  const goto = React.useCallback(
    (key: string) => {
      if (key === "p") return void navigate({ to: "/" });
      if (!projectId) return;
      const params = { projectId };
      if (key === "d") return void navigate({ to: "/p/$projectId/design", params, search: { tab: "sheets" } });
      if (key === "r") return void navigate({ to: "/p/$projectId/runs", params });
      if (key === "k") return void navigate({ to: "/p/$projectId/kit", params, search: { tab: "assets" } });
      if (key === "s") return void navigate({ to: "/p/$projectId/settings", params });
    },
    [navigate, projectId],
  );

  useGlobalShortcuts({
    onCommandPalette: () => setPaletteOpen((v) => !v),
    onJumpProject: () => setJumpOpen((v) => !v),
    onShortcutsHelp: () => setShortcutsOpen(true),
    onGoto: goto,
  });

  const onBridgeProbe = React.useCallback(async () => {
    setProbing(true);
    try {
      await runBridgeProbe();
    } finally {
      setProbing(false);
    }
  }, [runBridgeProbe]);

  /**
   * "Tạo project" / "Nhập project" gọi được từ ⌘K ở MỌI màn, nhưng modal thuộc
   * S1 (chủ sở hữu: R1-P3). Shell KHÔNG dựng modal của màn khác — nó đưa user
   * về S1 kèm Ý ĐỊNH.
   *
   * Ý định đi bằng ĐÚNG MỘT đường: search param `?action=create|import`. Nó nằm lại
   * trên URL nên S1 đọc lúc nào cũng thấy, kể cả khi mount chậm (import động), F5 vẫn
   * còn, và không phụ thuộc thứ tự gắn listener.
   *
   * (§W1-9) Đường thứ hai — `CustomEvent("kg:create-project")` — ĐÃ BỎ: trong suốt thời
   * gian tồn tại nó **không có ai nghe**, nên nó không phải dự phòng mà là một lời hứa
   * suông. Bên đọc param là `features/projects/lib/useCreateIntent.ts`.
   */
  const goCreateOrImport = React.useCallback(
    (action: "create" | "import") => void navigate({ to: "/", search: { action } }),
    [navigate],
  );

  /* ══════════ ĐÔNG LẠNH: THANH TAB FILE CON + PROJECT RAIL ══════════
     (§W1-13 · chờ chủ dự án chốt hướng file con — xem UPGRADE-PLAN §Đ3)

     `showRail` và `showTabs` trước đây tính ra **`false` ở cả 6 chỗ gọi `AppLayout`**
     trong production (hai route có `projectId` thì lại `simplified`). Nghĩa là hai nhánh
     đó mô tả một ứng dụng KHÔNG TỒN TẠI, đồng thời kéo `ProjectRail` + `subfiles/**`
     (~106KB) vào bundle của mọi màn.

     Đã gỡ HAI NHÁNH, **KHÔNG xoá file**: hướng sản phẩm "file con kiểu Figma" là quyết
     định của chủ dự án, không phải của đội thi công. `ProjectRail.tsx`,
     `features/docs/components/subfiles/**` và `useFileWiring` (ngay dưới file này) vẫn
     nguyên vẹn, vẫn còn test riêng, chờ được bật lại bằng một dòng.
     ⚠️ `fileId`/`simplified` vẫn nằm trong `AppLayoutProps` vì 6 route đang truyền chúng;
     đổi chữ ký là đụng 6 file của nhánh khác cho một thay đổi không ai thấy. */
  void fileId;
  void simplified;

  const shellEnv = React.useMemo(() => ({ agentOffline: !status.connected, agentCommand: RUN_CMD }), [status.connected]);

  const body = (
    <>
      <FloraShell
        agentStatus={status.pill as AgentStatus}
        connectionStatus={status}
        onRecheck={recheck}
        onAgentPillClick={() => setAgentSheetOpen(true)}
        workspaceLabel={status.workspaceLabel ?? undefined}
        onWorkspaceClick={() => void api.system.revealWorkspace()}
        onSettingsClick={() => void navigate({ to: "/settings", search: { tab: "agent" } })}
        onCommandPaletteOpen={() => setPaletteOpen(true)}
        onHomeClick={() => void navigate({ to: "/" })}
        breadcrumb={
          <AppBreadcrumb
            screen={screen}
            projectId={projectId}
            projectName={project.data?.name}
            onJump={() => setJumpOpen(true)}
          />
        }
        banner={
          <AgentBanner
            status={status}
            onRecheck={recheck}
            onBridgeProbe={() => void onBridgeProbe()}
            probing={probing}
            onOpenAgentSheet={() => setAgentSheetOpen(true)}
          />
        }
      >
        {children}
      </FloraShell>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        {...(projectId ? { projectId } : {})}
        readOnly={status.readOnly}
        onJumpProject={() => setJumpOpen(true)}
        onRecheckAgent={recheck}
        onShortcutsHelp={() => setShortcutsOpen(true)}
        onCreateProject={() => goCreateOrImport("create")}
        onImportProject={() => goCreateOrImport("import")}
      />
      <ProjectJump open={jumpOpen} onOpenChange={setJumpOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* §2.1: bấm vào pill trạng thái mở Sheet "Trạng thái công cụ local" */}
      <Sheet open={agentSheetOpen} onOpenChange={setAgentSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Công cụ local</SheetTitle>
            <SheetDescription>Chương trình chạy trên máy bạn để đọc file và gọi AI.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <AgentDiagnosticBody status={status} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );

  /* Không màn nào có thanh tab ⇒ KHÔNG bọc `FileScopeProvider`: mọi màn thấy
     `useFileScope() === null`, tức là "xem tất cả sheet" — đúng hành vi đang chạy
     hôm nay, vì `showTabs` vốn đã luôn `false`. */
  return <ShellEnvProvider value={shellEnv}>{body}</ShellEnvProvider>;
}

/* ══════════════════════════════════════════════════════════════════════════
   FE-2 · E1 — NỐI DÂY: `?file=` ⇄ danh sách file con ⇄ URL
   ══════════════════════════════════════════════════════════════════════════

   Hook này là chỗ DUY NHẤT dịch giữa URL và tầng file con. Ba luật nó thi hành:

   ① **Không remount nội dung khi đổi file.** Không đổi `key`, không đưa `docId` vào
      `resetKey` của boundary màn. Đổi `?file=` chỉ đổi giá trị context.
   ② **Id lạ / đã xoá không crash VÀ không im lặng.** Khung đưa id THÔ cho C; C rơi về tab
      ảo và tự nói ra. Khung KHÔNG dọn URL — xem ghi chú "CỐ Ý KHÔNG TỰ DỌN" ở dưới.
   ③ **`?file=` chỉ tồn tại khi có nghĩa.** Tab ảo «Tất cả sheet» là mặc định ⇒ mở nó thì
      XOÁ param, không ghi `?file=f-all-sheets`.

   VÌ SAO GỌI `useContract` Ở TẦNG KHUNG: `contractSheetIds` là đầu vào bắt buộc của
   `SubfileTabs` (tab ảo phải biết có bao nhiêu sheet). Key là `qk.contract.current` của R0 —
   **cùng key** mà S2/S3/S5 dùng ⇒ TanStack trả cùng cache, không có request thứ hai. Agent
   chưa chạy ⇒ `[]`, và đó KHÔNG phải lỗi của thanh tab (file con nằm trên máy).
*/
/* ⚠️ ĐÔNG LẠNH (§W1-13): từ đây xuống cuối file là bộ nối dây của thanh tab file con.
   KHÔNG còn ai gọi `useFileWiring` — giữ lại NGUYÊN VẸN vì hướng "file con kiểu Figma"
   chưa bị chủ dự án bỏ. Bật lại = gọi lại hook này và trả hai prop `fileTabs`/`rail`
   cho `FloraShell`. Xoá là quyết định của chủ dự án, không phải của đội review. */
export interface FileWiring {
  scope: FileScope;
  /**
   * Id THÔ mà URL yêu cầu (chưa qua `resolveActiveId`). `SubfileTabs` cần đúng giá trị này
   * để biết có phải người dùng đang yêu cầu một file không tồn tại — xem ghi chú ở chỗ
   * truyền prop `activeId` bên trên.
   */
  wantedId: string | undefined;
  /** id sheet của contract — `SubfileTabs` cần để dựng tab ảo và dialog tạo file. */
  contractSheetIds: string[];
  runningSheetIds: string[];
  /** Đổi file đang mở: canvas → route riêng, workflow → `?file=` trên màn hiện tại. */
  activate: (docId: string) => void;
  /** URL cho mục «Sao chép liên kết» (NEEDS-fe2-c N8). */
  linkForDoc: (docId: string) => string;
}

export function useFileWiring(input: {
  projectId: string;
  /** Route canvas truyền `fileId` của nó; màn workflow truyền `?file=`. */
  wantedId: string | undefined;
  /** `true` khi đang ở route canvas ⇒ không dọn URL bằng search param. */
  onCanvasRoute: boolean;
  jobs: Readonly<Record<string, import("@/lib/status").JobStatus>> | undefined | null;
  pathname: string;
  /** `false` ở S0/S1/S6 ⇒ KHÔNG gọi query nào (khung dùng chung cho cả 9 màn). */
  enabled: boolean;
}): FileWiring {
  const { projectId, wantedId, onCanvasRoute, jobs, pathname, enabled } = input;
  const navigate = useNavigate();

  const on = enabled && projectId !== "";
  const contract = useContract(on ? projectId : null);
  const contractSheetIds = React.useMemo(
    () => contractSheetIdsOf(contract.data?.contract),
    [contract.data],
  );

  const docs = useDocsList(on ? projectId : null);
  const docList = docs.data ?? [];

  /* Dựng tab bằng CHÍNH read model của C1 — không tự lọc `trashedAt`, không tự thêm
     tab ảo. Hai bản luật song song là cách chắc chắn nhất để thanh tab và khung nói
     hai điều khác nhau về cùng một file. */
  const tabs = React.useMemo(
    () => buildTabs({ docs: docList, contractSheetIds }),
    [docList, contractSheetIds],
  );
  const activeId = resolveActiveId(tabs, wantedId ?? null);
  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const activeDoc = docList.find((d) => d.id === activeId) ?? null;

  const scope: FileScope = React.useMemo(() => {
    const all = activeId === ALL_SHEETS_DOC_ID;
    return {
      docId: activeId,
      docName: activeTab?.name ?? "Tất cả sheet",
      kind: activeTab?.kind ?? "workflow",
      all,
      sheetIds: all || activeTab?.kind === "canvas" ? null : activeDoc?.view?.sheetIds ?? null,
      resolving: docs.isPending,
      openAllSheets: () => activateRef.current(ALL_SHEETS_DOC_ID),
    };
  }, [activeId, activeTab, activeDoc, docs.isPending]);

  const linkForDoc = React.useCallback(
    (docId: string) =>
      docPath({
        projectId,
        docId,
        kind: docList.find((d) => d.id === docId)?.kind ?? "workflow",
        currentPath: pathname,
        virtualId: ALL_SHEETS_DOC_ID,
      }),
    [projectId, docList, pathname],
  );

  const activate = React.useCallback(
    (docId: string) => {
      const kind = docList.find((d) => d.id === docId)?.kind ?? "workflow";

      /* File canvas ⇒ route riêng. Đây cũng là đường ra khỏi màn canvas: bấm một tab
         workflow trong lúc đang ở `/p/:id/f/:fileId` phải rời route canvas, không thể
         chỉ gắn `?file=` vào một URL không có màn workflow nào. */
      if (kind === "canvas") {
        void navigate({ to: "/p/$projectId/f/$fileId", params: { projectId, fileId: docId } });
        return;
      }
      if (onCanvasRoute) {
        void navigate({
          to: "/p/$projectId",
          params: { projectId },
          search: docId === ALL_SHEETS_DOC_ID ? {} : { file: docId },
        });
        return;
      }
      /* Cùng màn, chỉ đổi search ⇒ KHÔNG remount (đây là cả lý do dùng `?file=`).
         `replace: false`: đổi file là một bước điều hướng có nghĩa, nút Back của
         trình duyệt phải quay về file trước — §4.3 "deep link phải hoạt động". */
      void navigate({
        to: ".",
        search: ((prev: Record<string, unknown>) =>
          withFileParam(prev, docId, ALL_SHEETS_DOC_ID)) as never,
      } as never);
    },
    [docList, navigate, projectId, onCanvasRoute],
  );

  /* `scope.openAllSheets` được dựng trước `activate` (thứ tự khai báo), nên đi qua ref
     để không phải sắp lại thứ tự và không tạo vòng phụ thuộc giữa hai `useMemo`. */
  const activateRef = React.useRef(activate);
  activateRef.current = activate;

  /**
   * ⚠️ CỐ Ý **KHÔNG** TỰ DỌN `?file=` khi id không tồn tại. Tôi đã làm sai điều này trước,
   * test bắt được, và lý do rất dễ làm lại: `useFileTabs` của C1 suy ra `activeFallback`
   * TỪ CHÍNH `?file=`, nên dọn param = xoá bằng chứng ⇒ dòng *"Không tìm thấy file bạn vừa
   * mở"* biến mất sau vài chục ms và link cũ mở ra «Tất cả sheet» KHÔNG kèm giải thích nào
   * (§3.9 cấm "thất bại không phản hồi gì"). Số đo PROBE + phân tích: `fe2/E1-REPORT.md` §4.
   *
   * Ca "xoá đúng file đang mở" KHÔNG cần effect này: C2 đã gọi
   * `onActivate(safeIdAfterDelete(...))` ⇒ đi qua `activate()` ⇒ URL đổi thật.
   */

  return {
    scope,
    wantedId,
    contractSheetIds,
    runningSheetIds: runningSheetIdsOf(jobs, contractSheetIds),
    activate,
    linkForDoc,
  };
}
