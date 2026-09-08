import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAgentStatus, useTrash } from "@/lib/hooks";
import { useRecentStore } from "@/lib/store";
import type { ScreenProps } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Images, PanelsTopLeft, Search, Settings, Sparkles, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";

import { gateOf, useNarrowViewport } from "./lib/gate";
import { createNav, openProjectWith } from "./lib/nav";
import { useCreateIntent } from "./lib/useCreateIntent";
import { useGridKeys } from "./lib/useGridKeys";
import { useProjectDialogs } from "./lib/useProjectDialogs";
import { ProjectDialogs } from "./ProjectDialogs";
import { HomeSidebar } from "@/features/home/components/HomeSidebar";

import {
  HomeEmpty, HomeError, HomeGrid, HomeHeader, HomeNoMatch, HomeSkeleton,
  useHomeData, type KitActions,
} from "@/features/home";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÀN H — «Bộ kit của bạn» (UX-V3 §1 · FLOW-V3 §1). **FILE = BỘ KIT.**
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ VÌ SAO MÀN MỚI LẠI NẰM Ở FILE TÊN CŨ `ProjectsScreen.tsx` — đọc trước khi "dọn":
 *
 *   ① Đây là **entry lazy-mount**. Đường dẫn + tên export do
 *      `components/layout/screen-contract.ts` chốt, mà file đó thuộc **glob E**.
 *      H1 không được đổi tên file/export; H1 chỉ đổi **thứ được render**.
 *   ② Tôi đã thử để thân màn ở `features/home/HomeScreen.tsx` rồi re-export từ đây.
 *      Kết quả đo được: `src/__tests__/qa-lead-regressions.test.ts` **V-3** đỏ — nó
 *      đọc CHÍNH file này và đòi thấy chuỗi `gateOf(status, narrow)` (mốc <768px là
 *      chỉ-đọc THẬT, audit M5). File đó **vô chủ trong bản đồ glob FE-3**
 *      (`NEEDS-fe3-s0.md` N6) nên tôi không được sửa nó, và cũng KHÔNG NÊN: nó đang
 *      canh một hành vi a11y có thật, không phải một chi tiết trang trí.
 *      ⇒ Giữ thân màn ở đúng file entry là cách duy nhất vừa làm đúng việc được giao,
 *      vừa không đụng file của người khác, vừa không làm giả một cổng kiểm.
 *      (Đã ghi `teams/react/NEEDS-fe3-h.md` **N4**.)
 *
 * Component + logic của màn H nằm trong `features/home/**` (glob H). File này CHỈ ĐIỀU PHỐI.
 *
 * Mở app = danh sách file kit. Hết (FLOW-V3 §0.2). Không sidebar 5 mục, không bảng,
 * không chip lọc, không bộ sắp xếp, không nút đổi grid/list — hành động chính duy nhất
 * là **ô ✚ đầu lưới**.
 *
 * Đã tách khỏi file này:
 *   home/lib/useHomeData    nạp + cache §2.5 (gọi lại `useProjectsData`, KHÔNG nạp lần hai)
 *   home/lib/home-view      lọc theo tên + sắp «sửa gần nhất»
 *   home/components/HomeGrid    lưới + ô CTA + thùng rác
 *   home/components/HomeStates  5 ca hiển thị
 *
 * Bản danh sách project kiểu cũ từng được chép sang `features/home/legacy/` vì lúc đó
 * `webapp/` CHƯA vào Git — không có `git show` để lấy lại (FE3-PLAN §0-N8). Nay repo đã
 * theo dõi `webapp/`, và chín component mà bản chép ấy cần (`components/Projects*.tsx`,
 * `ProjectCard`, `ProjectMenu`…) đã bị xoá ở Đợt 3 vì không ai render, nên thư mục
 * `legacy/` vừa hết lý do tồn tại vừa hết khả năng khôi phục. Đã xoá; lịch sử nằm ở Git.
 *
 * BANNER AGENT: khung (`AppLayout` của R1-P1) đã có `AgentBanner`. Màn vẫn dựng
 * `HomeAgentOffline` vì §6 đòi banner nói ĐÚNG chuyện của Home («Danh sách đang xem là bản
 * lưu lần trước») — thứ khung không biết. Hai khối KHÔNG lặp nội dung: khung nói *tình
 * trạng kết nối*, màn nói *hệ quả lên danh sách*. Thấy thừa thì bỏ ở đây, một dòng
 * (`NEEDS-fe3-h.md` N3).
 *
 * ⚠️ ĐIỀU HƯỚNG CÒN TẠM: `nav.open(id)` vẫn đi `/p/:id`. Route `/k/:id` là việc của **E1**
 * và `lib/nav.ts` là điểm đổi DUY NHẤT — không component nào của tôi ghép chuỗi đường dẫn.
 *
 * ⚠️ DIALOG VẪN LÀ BẢN FE-1 (`ProjectDialogs`): H1 dựng lưới + trạng thái; màn N hai thẻ,
 * copy dialog, toast «Hoàn tác 10s» và ba ca nói thật của C-01 là **H2** (FE3-PLAN §3-H2).
 * Nối vào dialog cũ để nút ⋯ dùng được ngay, còn hơn bấm vào không có gì xảy ra.
 */
export function ProjectsScreen(_props: ScreenProps) {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createNav(navigate), [navigate]);
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const initialQuery = typeof search.q === "string" ? search.q : "";
  const { status, recheck } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const touchRecent = useRecentStore((s) => s.touch);

  // Ô tìm: state cục bộ cho mượt, đẩy vào bộ lọc sau 120ms.
  const [typed, setTyped] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery);
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQuery(typed);
      const q = typed.trim();
      if ((typeof search.q === "string" ? search.q : "") !== q) {
        void navigate({ to: "/", search: q ? { q } : {}, replace: true });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [navigate, search.q, typed]);

  const data = useHomeData(status, query);
  const trash = useTrash();
  const dialogs = useProjectDialogs(data.all);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const openProject = React.useCallback(
    (p: Project) => {
      // Dự án hỏng file mô tả không mở được — mở tiếp chỉ làm hỏng thêm.
      if (p.broken) {
        dialogs.openDialog("broken", p);
        return;
      }
      touchRecent(p.id);
      /* §B2 — dự án đã có ảnh thì thẻ ở Home mở THẲNG trang kết quả. Trước đây mọi thẻ
         đều đi `/p/:id` rồi để màn dự án tự quyết theo cờ `workflow.completed`; cờ đó
         bị autosave của wizard lật về `false` nên dự án đầy ảnh bị đá sang wizard. */
      openProjectWith(nav, p);
    },
    [dialogs, nav, touchRecent],
  );

  /* §W1-9: ý định "tạo" mang từ ⌘K sang, nằm trên `?action=`. `import` đã bỏ cùng
     wizard nhập .zip; giá trị ấy còn trong schema chỉ để link cũ không rơi vào hư không,
     và ở đây nó mở đúng dialog Tạo. */
  useCreateIntent(
    search,
    () => dialogs.openDialog("create"),
    () => void navigate({ to: "/", search: {}, replace: true }),
  );

  const actions = React.useMemo<KitActions>(
    () => ({
      open: openProject,
      rename: (p) => dialogs.openDialog("rename", p),
      duplicate: (p) => dialogs.openDialog("duplicate", p),
      remove: (p) => dialogs.openForMany("delete", [p]),
    }),
    [dialogs, openProject],
  );

  const byId = React.useCallback(
    (id: string) => data.all.find((p) => p.id === id) ?? null,
    [data.all],
  );
  const ids = React.useMemo(() => data.visible.map((p) => p.id), [data.visible]);
  const grid = useGridKeys(ids, {
    onOpen: (id) => {
      const p = byId(id);
      if (p) openProject(p);
    },
    onDelete: (id) => {
      const p = byId(id);
      if (p && !gate.readOnly) dialogs.openForMany("delete", [p]);
    },
    onRename: (id) => {
      const p = byId(id);
      if (p && !gate.readOnly) dialogs.openDialog("rename", p);
    },
    onDuplicate: (id) => {
      const p = byId(id);
      if (p && !gate.readOnly) dialogs.openDialog("duplicate", p);
    },
  });

  const refreshAll = React.useCallback(() => {
    data.refetch();
    recheck();
  }, [data, recheck]);

  const trashCount = trash.data?.items.length ?? 0;
  const hasKits = data.all.length > 0;
  // Mục "Gần đây" đã bỏ — danh sách luôn là toàn bộ dự án (sau lọc tìm kiếm).
  const viewData = data;
  const clearSearch = () => {
    setTyped("");
    setQuery("");
  };

  /** Ô ✚ mở màn N. H1 chỉ mở dialog tạo SẴN CÓ; màn N hai thẻ là việc của **H2**. */
  const openCreate = () => dialogs.openDialog("create");

  /* §W2B-6 — DOT-GRID rời khỏi trang DANH SÁCH. Mục "phải giữ" #10 nói rõ phạm vi của
     nó: *"ở đúng chỗ của nó thì rất đẹp và rất bàn-làm-việc. Chỉ gỡ khỏi trang form và
     trang danh sách."* Ở đây lưới chấm nằm dưới một lưới THẺ đặc nên chỉ còn thấy ở các
     khe hở — không gợi được không gian, chỉ thêm nhiễu. Canvas
     (`design/components/SheetCanvas.tsx`) GIỮ NGUYÊN. */
  return (
    <div className="relative flex min-h-dvh bg-canvas">
      <HomeSidebar
        active="projects"
        section="all"
        trashCount={trashCount}
        onSection={() => {}}
        onBrands={() => void navigate({ to: "/brands" })}
        onUiLibrary={() => void navigate({ to: "/library/ui" })}
        onMascotLibrary={() => void navigate({ to: "/library/mascot" })}
        onReferences={() => void navigate({ to: "/references" })}
        onTrash={() => nav.openTrash()}
        onSettings={() => void navigate({ to: "/settings", search: { tab: "agent" } })}
      />
      {/* §W2A-2 — TRƯỚC ĐÂY `max-w-[1600px] … lg:px-10` ⇒ H1 ở x=40 trong khi H1 của
          workflow ở x=144 và của Settings ở x=304. Nay dùng `.kg-page`, container
          DUY NHẤT của app. Chỉ còn nhịp dọc là việc riêng của màn này. */}
      <div className="kg-page min-w-0 flex-1 py-8">
        {/* Đang làm mới mà ĐÃ có dữ liệu: vạch 2px ở đỉnh, không che nội dung, không spinner. */}
        {data.isFetching && !data.isLoading && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden" aria-hidden>
            <div className="h-full w-1/3 animate-kg-shimmer bg-accent" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <HomeHeader />
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-label="Tìm dự án"
              placeholder="Tìm dự án…"
              className="h-10 rounded-2 bg-surface pl-9"
            />
          </div>
        </div>

        <nav aria-label="Điều hướng trên màn hình nhỏ" className="mt-3 flex items-center gap-1 overflow-x-auto pb-1 md:hidden">
          <button type="button" onClick={() => void navigate({ to: "/library/ui" })} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 text-label text-fg" aria-label="Bộ khung UI">
            <PanelsTopLeft className="size-4" aria-hidden />UI
          </button>
          <button type="button" onClick={() => void navigate({ to: "/library/mascot" })} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 text-label text-fg" aria-label="Mascot">
            <Sparkles className="size-4" aria-hidden />Mascot
          </button>
          <button type="button" onClick={() => void navigate({ to: "/references" })} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 text-label text-fg" aria-label="Ảnh phong cách">
            <Images className="size-4" aria-hidden />Tham chiếu
          </button>
          <button type="button" onClick={() => nav.openTrash()} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 text-label text-fg" aria-label="Thùng rác">
            <Trash2 className="size-4" aria-hidden />Thùng rác
          </button>
          <button type="button" onClick={() => void navigate({ to: "/settings", search: { tab: "agent" } })} className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-2 px-3 text-label text-fg" aria-label="Cài đặt">
            <Settings className="size-4" aria-hidden />Cài đặt
          </button>
        </nav>

        <div className="mt-7"><HomeBody
          data={viewData}
          gate={gate}
          agentOff={gate.readOnly && !narrow}
          grid={grid}
          actions={actions}
          query={query}
          hasKits={hasKits}
          onCreate={openCreate}
          onRetry={refreshAll}
          onClearSearch={clearSearch}
        /></div>

        <ProjectDialogs
          dialogs={dialogs}
          all={data.all}
          gate={gate}
          nav={nav}
          onDeleted={() => {}}
        />
      </div>
    </div>
  );
}

/** Cây if/else của 5 ca — gom một chỗ để QA soi được từng nhánh. */
function HomeBody({
  data,
  gate,
  agentOff,
  grid,
  actions,
  query,
  hasKits,
  onCreate,
  onRetry,
  onClearSearch,
}: {
  data: ReturnType<typeof useHomeData>;
  gate: ReturnType<typeof gateOf>;
  /** agent chưa chạy — ca RIÊNG của §6, KHÔNG phải ca `error`. */
  agentOff: boolean;
  grid: ReturnType<typeof useGridKeys>;
  actions: KitActions;
  query: string;
  hasKits: boolean;
  onCreate: () => void;
  onRetry: () => void;
  onClearSearch: () => void;
}) {
  /* 1. LỖI — và CHỈ khi agent CÓ trả lời. Ca «agent chưa chạy» KHÔNG rơi vào đây:
        §6 tách hai ca ra hai dòng khác nhau, và gộp chúng là lặp lại đúng lỗi mà
        QA-UX bắt ở bản vanilla (TRUNG BÌNH-01: đổ tội sai nguyên nhân ⇒ user đi sửa
        nhầm chỗ). Agent tắt mà không có cache thì màn phải là: banner nói việc cần làm
        + ô ✚ khoá kèm lý do — chứ không phải một khối đỏ «Chưa lấy được danh sách».
        Tôi phát hiện chỗ này vì test `§6 — ô ✚ bị KHOÁ KÈM LÝ DO` đỏ; đã sửa MÃ,
        không sửa test (H1-REPORT §3.4). */
  if (data.fatalError && !agentOff) return <HomeError error={data.fatalError} onRetry={onRetry} />;
  // 2. Lần đầu, chưa có cache.
  if (data.isLoading) return <HomeSkeleton />;
  /* 3. Chưa có bộ kit nào — GỘP luôn ca «agent tắt, không có cache»: cả hai đều là
        «màn chưa có gì để xem», và ô ✚ tự khoá kèm lý do theo `gate`. */
  if (!hasKits) return <HomeEmpty gate={gate} onCreate={onCreate} />;
  // 4. Tìm ra 0 kết quả.
  if (data.visible.length === 0) return <HomeNoMatch query={query} onClear={onClearSearch} />;
  // 5. Lưới.
  return (
    <HomeGrid
      items={data.visible}
      actions={actions}
      gate={gate}
      grid={grid}
      fromCache={data.fromCache}
      onCreate={onCreate}
    />
  );
}

export default ProjectsScreen;
