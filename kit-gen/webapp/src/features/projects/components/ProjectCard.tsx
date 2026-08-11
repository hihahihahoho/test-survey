import { AlertTriangle, FolderOpen, Info, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/common";
import { cn } from "@/lib/utils";
import { useRevealProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { toastError, toastSuccess } from "../lib/feedback";
import { absTime, bytes, count, relTime } from "../lib/format";
import { projectState, STATE_ROW } from "../lib/view";
import type { Gate } from "../lib/gate";
import { ProjectCover } from "./ProjectCover";
import { ProjectMenu, type ProjectActions } from "./ProjectMenu";

/**
 * THẺ PROJECT — 8 VÙNG BẮT BUỘC, ĐÚNG THỨ TỰ (§3-S1-2):
 *  1 ảnh bìa 16:10 · 2 badge run góc phải · 3 tên (2 dòng) · 4 số liệu 1
 *  · 5 số liệu 2 · 6 dòng trạng thái · 7 tag · 8 footer (thời gian + dung lượng)
 *
 * A11y:
 *  · A12 — tên do user nhập render qua JSX (React tự escape). Tên `Tết "26" <b>`
 *    hiện đúng nguyên văn, không thành thẻ HTML (đóng I6).
 *  · A5/A6 — thẻ là `<article>` có `tabIndex` do lưới cấp (composite widget),
 *    hành động thật nằm ở `<button>` bên trong. Không có `<div onclick>` trần.
 *  · A3 — trạng thái luôn icon + CHỮ, không chỗ nào chỉ màu.
 */
export function ProjectCard({
  project,
  actions,
  gate,
  tabIndex,
  fromCache,
  onNextStep,
  onBrokenDetail,
}: {
  project: Project;
  actions: ProjectActions;
  gate: Gate;
  tabIndex: 0 | -1;
  /** vẽ từ `kitgen.projects.cache.v1` ⇒ xám bớt + nhãn chữ `cache` (§2.5-4) */
  fromCache: boolean;
  onNextStep: (p: Project) => void;
  onBrokenDetail: (p: Project) => void;
}) {
  if (project.broken) {
    return (
      <BrokenCard
        project={project}
        gate={gate}
        tabIndex={tabIndex}
        onDetail={() => onBrokenDetail(project)}
      />
    );
  }

  const st = projectState(project);
  const row = STATE_ROW[st];
  const s = project.stats;
  const active = project.state?.activeRun;
  const running = active?.total ? active : null;

  return (
    <article
      data-project-card
      data-project-id={project.id}
      role="listitem"
      tabIndex={tabIndex}
      aria-label={`Dự án ${project.name}`}
      onClick={() => actions.open(project)}
      onKeyDown={(e) => {
        // Space mở thẻ (Enter do lưới xử lý ở tầng trên để dùng chung một đường).
        if (e.key === " " && e.currentTarget === e.target) {
          e.preventDefault();
          actions.open(project);
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-4 border border-line-subtle bg-surface text-left",
        "transition-[border-color,box-shadow,transform] duration-2 ease-out",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        fromCache && "opacity-80",
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="kg-label-above">Project</p>
          {/* QA-LEAD: h2 chứ không phải h3 — trên màn này h1 là "Project của bạn",
              nhảy thẳng h1→h3 làm đứt cây tiêu đề của trình đọc màn hình. */}
          <h2 className="truncate text-label text-fg-strong" title={project.name}>{project.name}</h2>
        </div>
        <span className="shrink-0 text-caption text-fg-muted">{count(s?.variants ?? 0, "phong cách")}</span>
      </div>

      <div className="relative">
        <ProjectCover
          projectId={project.id}
          coverPath={project.cover}
          projectName={project.name}
          offline={gate.readOnly}
        />
        {running && (
          <Badge tone="running" className="absolute right-2 top-2 shadow-2">
            <Zap className="motion-safe:animate-kg-pulse" aria-hidden />
            <span>
              Đang sinh {running.done}/{running.total}
            </span>
          </Badge>
        )}
        {fromCache && (
          <Badge tone="never" className="absolute left-2 top-2 shadow-2" title="Dữ liệu đã lưu trên máy này">
            <Info aria-hidden />
            <span>cache</span>
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <p className="text-caption text-fg">
          {count(s?.sheets ?? 0, "sheet")} · {count(s?.components ?? 0, "element")}
        </p>
        <p className="text-caption text-fg-muted-raised">
          {count(s?.kitsCut ?? 0, "file đã cắt")}
        </p>

        {/* 6 — trạng thái + nút hành động ngay cạnh khi cần (§5.7) */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <JobStatusBadge status={row.badge} />
          <span className="min-w-0 flex-1 truncate text-caption text-fg">{row.text}</span>
          {row.action && !gate.readOnly && (
            <Button
              variant="link"
              size="sm"
              className="h-auto shrink-0 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onNextStep(project);
              }}
            >
              {row.action}
            </Button>
          )}
        </div>

        {/* 7 */}
        {project.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {project.tags.slice(0, 4).map((t) => (
              <li key={t}>
                <Badge tone="outline">{t}</Badge>
              </li>
            ))}
            {project.tags.length > 4 && (
              <li>
                <Badge tone="outline">+{project.tags.length - 4}</Badge>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* 8 */}
      <footer className="flex items-center justify-between gap-2 border-t border-line-subtle px-4 py-2.5">
        <span className="truncate text-caption text-fg-muted-raised" title={absTime(project.updatedAt)}>
          {st === "empty" ? "tạo" : "sửa"} {relTime(st === "empty" ? project.createdAt : project.updatedAt)}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-caption text-fg-muted-raised">{bytes(s?.diskBytes ?? 0)}</span>
          {/* Hover/focus mới hiện [Mở] để thẻ lúc nghỉ không rối; luôn hiện trên màn chạm */}
          <Button
            variant="secondary"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              actions.open(project);
            }}
          >
            Mở
          </Button>
          <ProjectMenu project={project} actions={actions} gate={gate} />
        </div>
      </footer>
    </article>
  );
}

/**
 * THẺ PROJECT LỖI (§3-S1-4 + arch §2.5): viền đỏ, nêu file + dòng lỗi,
 * 2 nút [Mở thư mục] [Chi tiết]. KHÔNG cho Mở (mở tiếp chỉ làm hỏng thêm).
 * Quan trọng nhất: nó **KHÔNG BIẾN MẤT IM LẶNG** — user phải thấy là có một
 * project ở đó và nó đang hỏng.
 */
function BrokenCard({
  project,
  gate,
  tabIndex,
  onDetail,
}: {
  project: Project;
  gate: Gate;
  tabIndex: 0 | -1;
  onDetail: () => void;
}) {
  const err = project.error;
  const reveal = useRevealProject(project.id);
  const onReveal = () =>
    reveal.mutate(undefined, {
      onSuccess: () => toastSuccess(`Đã mở thư mục của «${project.name}»`),
      onError: (e) => toastError(e),
    });
  const where = [err?.file ?? "project.json", err?.line != null ? `dòng ${err.line}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-project-card
      data-project-id={project.id}
      role="listitem"
      tabIndex={tabIndex}
      aria-label={`Dự án lỗi: ${project.name}`}
      className={cn(
        "flex flex-col gap-3 rounded-3 border border-danger/60 bg-danger/[0.07] p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <p className="text-subtitle text-fg-strong">Không đọc được project</p>
          <p className="truncate text-body text-fg" title={project.name}>
            {project.name}
          </p>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-caption">
        <div className="flex gap-2">
          <dt className="text-fg-muted-raised">Chỗ lỗi</dt>
          <dd className="min-w-0 truncate font-mono text-fg">{where}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-fg-muted-raised">Thư mục</dt>
          <dd className="min-w-0 truncate font-mono text-fg">{project.id}</dd>
        </div>
      </dl>

      <p className="text-caption text-fg-muted-raised">
        Project vẫn nằm nguyên trên máy bạn — không có gì bị xoá.
      </p>

      <div className="mt-auto flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onReveal}
        >
          <FolderOpen aria-hidden />
          Mở thư mục
        </Button>
        <Button variant="ghost" size="sm" onClick={onDetail}>
          Chi tiết
        </Button>
      </div>
    </article>
  );
}
