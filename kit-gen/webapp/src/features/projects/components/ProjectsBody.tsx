import { RUN_CMD } from "@/components/layout";
import type { ConnectionStatus } from "@/lib/api";
import type { Project } from "@/lib/types";
import type { ProjectsView } from "@/lib/store";
import { ProjectCard } from "./ProjectCard";
import { ProjectsListView } from "./ProjectsListView";
import {
  EmptyNoMatch, EmptyNoProjects, ErrorLoadFailed, ErrorNoAgent, ProjectsSkeleton,
} from "./ProjectsStates";
import type { ProjectActions } from "./ProjectMenu";
import type { Gate } from "../lib/gate";
import type { ProjectsData } from "../lib/useProjectsData";
import type { GridKeysApi } from "../lib/useGridKeys";
import { toastSuccess } from "../lib/feedback";

/**
 * Chọn giữa 7 CA HIỂN THỊ của S1. Tách ra khỏi màn để cây if/else nằm gọn một
 * chỗ và QA soi được từng nhánh:
 *
 *   1 lỗi chặn + agent không sẵn sàng  → khối "chưa thấy công cụ local"
 *   2 lỗi chặn + agent CÓ trả lời      → khối lỗi + [Thử lại] (copy từ §3.9)
 *   3 loading lần đầu, chưa cache      → 6 thẻ skeleton
 *   4 chưa có project nào              → hướng dẫn tạo cái đầu tiên
 *   5 lọc ra 0 kết quả                 → nói rõ từ khoá + [Xoá bộ lọc]
 *   6 danh sách (list)                 → bảng + chọn nhiều
 *   7 danh sách (grid)                 → lưới thẻ
 *
 * Ca "agent tắt NHƯNG có cache" KHÔNG rơi vào nhánh 1: `useProjectsData` chỉ đặt
 * `fatalError` khi không còn gì để vẽ. Có cache thì §2.5 buộc phải vẽ danh sách
 * (thẻ đeo nhãn `cache`), chứ không phải một màn lỗi trắng trơn.
 */
export function ProjectsBody({
  data,
  gate,
  status,
  view,
  actions,
  grid,
  selected,
  onSelectedChange,
  query,
  onClearFilters,
  onRetry,
  onCreate,
  onImport,
  onNextStep,
  onBrokenDetail,
}: {
  data: ProjectsData;
  gate: Gate;
  status: ConnectionStatus;
  view: ProjectsView;
  actions: ProjectActions;
  grid: GridKeysApi;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  query: string;
  onClearFilters: () => void;
  onRetry: () => void;
  onCreate: () => void;
  onImport: () => void;
  onNextStep: (p: Project) => void;
  onBrokenDetail: (p: Project) => void;
}) {
  if (data.fatalError) {
    if (gate.readOnly) {
      return (
        <ErrorNoAgent
          gate={gate}
          blockedByBrowser={status.case === "blocked-by-browser"}
          mirrorUrl={status.mirrorUrl}
          runCommand={RUN_CMD}
          onCopyCommand={() => {
            void navigator.clipboard?.writeText(RUN_CMD).then(
              () => toastSuccess("Đã copy lệnh", "Dán vào Terminal rồi Enter."),
              // Clipboard bị từ chối (không HTTPS / chưa cấp quyền) — lệnh vẫn
              // hiện nguyên văn trên màn để user bôi đen. KHÔNG im lặng.
              () => toastSuccess("Lệnh đang hiện trên màn hình", "Bôi đen và copy thủ công."),
            );
          }}
          onRetry={onRetry}
          detail={[
            `case=${status.case}`,
            `pill=${status.pill}`,
            `entry=${status.entry}`,
            `base=${status.base ?? "(chưa dò được cổng)"}`,
            `httpStatus=${status.httpStatus ?? "-"}`,
          ].join("\n")}
        />
      );
    }
    return <ErrorLoadFailed error={data.fatalError} onRetry={onRetry} />;
  }

  if (data.isLoading) return <ProjectsSkeleton />;

  if (data.all.length === 0) {
    return <EmptyNoProjects gate={gate} onCreate={onCreate} onImport={onImport} />;
  }

  if (data.visible.length === 0) {
    return <EmptyNoMatch query={query} onClear={onClearFilters} />;
  }

  if (view === "list") {
    return (
      <div ref={grid.containerRef} className="overflow-hidden rounded-3 border border-line-subtle bg-surface">
        <ProjectsListView
          items={data.visible}
          actions={actions}
          gate={gate}
          selected={selected}
          onSelectedChange={onSelectedChange}
          tabIndexFor={grid.tabIndexFor}
          onBrokenDetail={onBrokenDetail}
        />
      </div>
    );
  }

  return (
    <div
      ref={grid.containerRef}
      /* `list` + `listitem` (thẻ tự khai) — cấu trúc HỢP LỆ và đủ nghĩa.
         Cố ý KHÔNG dùng `role="grid"`: grid của WAI-ARIA đòi tầng `role="row"`
         ở giữa, mà lưới này là CSS grid auto-fill nên không có hàng thật để bọc.
         Khai `grid` mà thiếu `row` là cấu trúc SAI — tệ hơn là không khai.
         Điều hướng 2 chiều bằng mũi tên (§5.8-A6) vẫn chạy qua roving tabindex
         của `useGridKeys`, và nó KHÔNG phụ thuộc vào role. */
      role="list"
      aria-label="Danh sách project"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    >
      {data.visible.map((p, i) => (
        <ProjectCard
          key={p.id}
          project={p}
          actions={actions}
          gate={gate}
          fromCache={data.fromCache}
          tabIndex={grid.tabIndexFor(i)}
          onNextStep={onNextStep}
          onBrokenDetail={onBrokenDetail}
        />
      ))}
    </div>
  );
}
