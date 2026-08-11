import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAgentStatus, useTrash } from "@/lib/hooks";
import { useRecentStore } from "@/lib/store";
import type { ScreenProps } from "@/components/layout";
import type { Project } from "@/lib/types";

import { gateOf, useNarrowViewport } from "./lib/gate";
import { createNav, openKitWith } from "./lib/nav";
import { useCreateIntent } from "./lib/useCreateIntent";
import { useGridKeys } from "./lib/useGridKeys";
import { useProjectDialogs } from "./lib/useProjectDialogs";
import { ProjectDialogs } from "./ProjectDialogs";

import {
  HomeAgentOffline, HomeEmpty, HomeError, HomeGrid, HomeHeader, HomeNoMatch, HomeSkeleton,
  shouldShowSearch, useHomeData, type KitActions,
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
 * Bản danh sách project kiểu cũ được lưu ở `features/home/legacy/` — không xoá
 * (FE3-PLAN §0-N8), không import, không vào bundle. Mọi file nó cần vẫn nguyên trên đĩa.
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
  const { status, recheck } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const touchRecent = useRecentStore((s) => s.touch);

  // Ô tìm: state cục bộ cho mượt, đẩy vào bộ lọc sau 120ms.
  const [typed, setTyped] = React.useState("");
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQuery(typed), 120);
    return () => clearTimeout(t);
  }, [typed]);

  const data = useHomeData(status, query);
  const trash = useTrash();
  const dialogs = useProjectDialogs(data.all);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const openKit = React.useCallback(
    (p: Project) => {
      // Bộ kit hỏng file mô tả KHÔNG mở được — mở tiếp chỉ làm hỏng thêm.
      if (p.broken) {
        dialogs.openDialog("broken", p);
        return;
      }
      touchRecent(p.id);
      /* §W1-8: thẻ 🎨 phải mở BÀN LÀM VIỆC. `openKitWith` đọc hình thái từ tag
         (`kg-canvas`), mặc định an toàn là workflow — xem `lib/nav.ts`. */
      openKitWith(nav, p);
    },
    [dialogs, nav, touchRecent],
  );

  /* §W1-9: ý định "tạo/nhập" mang từ wizard cài đặt hoặc ⌘K sang, nằm trên `?action=`. */
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  useCreateIntent(
    search,
    (intent) => (intent === "import" ? dialogs.openImport() : dialogs.openDialog("create")),
    () => void navigate({ to: "/", search: {}, replace: true }),
  );

  const actions = React.useMemo<KitActions>(
    () => ({
      open: openKit,
      rename: (p) => dialogs.openDialog("rename", p),
      duplicate: (p) => dialogs.openDialog("duplicate", p),
      exportZip: (p) => dialogs.openForMany("export", [p]),
      remove: (p) => dialogs.openForMany("delete", [p]),
    }),
    [dialogs, openKit],
  );

  const byId = React.useCallback(
    (id: string) => data.all.find((p) => p.id === id) ?? null,
    [data.all],
  );
  const ids = React.useMemo(() => data.visible.map((p) => p.id), [data.visible]);
  const grid = useGridKeys(ids, {
    onOpen: (id) => {
      const p = byId(id);
      if (p) openKit(p);
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
  const showSearch = shouldShowSearch(data.all.length);
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
    <div className="relative min-h-[calc(100dvh-3.5rem)] bg-canvas">
      {/* §W2A-2 — TRƯỚC ĐÂY `max-w-[1600px] … lg:px-10` ⇒ H1 ở x=40 trong khi H1 của
          workflow ở x=144 và của Settings ở x=304. Nay dùng `.kg-page`, container
          DUY NHẤT của app. Chỉ còn nhịp dọc là việc riêng của màn này. */}
      <div className="kg-page flex flex-col gap-8 py-10 sm:py-14">
        {/* Đang làm mới mà ĐÃ có dữ liệu: vạch 2px ở đỉnh, không che nội dung, không spinner. */}
        {data.isFetching && !data.isLoading && (
          <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden" aria-hidden>
            <div className="h-full w-1/3 animate-kg-shimmer bg-accent" />
          </div>
        )}

        <HomeHeader
          showSearch={showSearch}
          query={typed}
          onQueryChange={setTyped}
          searchRef={searchRef}
        />

        {/* §6: banner DƯỚI header, TRÊN nội dung. Không overlay, không chặn màn. */}
        {gate.readOnly && !narrow && (
          <HomeAgentOffline hasCache={data.fromCache && hasKits} onRetry={refreshAll} />
        )}

        <HomeBody
          data={data}
          gate={gate}
          agentOff={gate.readOnly && !narrow}
          grid={grid}
          actions={actions}
          trashCount={trashCount}
          query={query}
          hasKits={hasKits}
          onCreate={openCreate}
          onOpenTrash={() => nav.openTrash()}
          onRetry={refreshAll}
          onClearSearch={clearSearch}
        />

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
  trashCount,
  query,
  hasKits,
  onCreate,
  onOpenTrash,
  onRetry,
  onClearSearch,
}: {
  data: ReturnType<typeof useHomeData>;
  gate: ReturnType<typeof gateOf>;
  /** agent chưa chạy — ca RIÊNG của §6, KHÔNG phải ca `error`. */
  agentOff: boolean;
  grid: ReturnType<typeof useGridKeys>;
  actions: KitActions;
  trashCount: number;
  query: string;
  hasKits: boolean;
  onCreate: () => void;
  onOpenTrash: () => void;
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
      trashCount={trashCount}
      onCreate={onCreate}
      onOpenTrash={onOpenTrash}
    />
  );
}

export default ProjectsScreen;
