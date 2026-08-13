import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { contractJobs, type Contract, type JobStatusValue } from "@/lib/types";
import { SkeletonPreview } from "@/features/design/preview";
import { GeneratedResults } from "@/features/workflow-v4/components/GeneratedResults";
import { DownloadKitButton, CopyFigmaButton } from "@/features/workflow-v4/components/KitExits";
import { GroupChips } from "@/features/workflow-v4/components/GroupChips";
import { categoryOfSheet, type ResultGroup } from "@/features/workflow-v4/lib/generated-results";
import type { ProjectImageGroup } from "@/routes/search-schemas";

/**
 * ẢNH ĐÃ TẠO — mục đầu tiên của sidebar dự án, và là nơi wizard đổ người dùng vào ngay
 * sau khi bấm "Tạo ảnh".
 *
 * Sáu nhóm (Tất cả · Mascot · Nền · Popup · UI nhỏ · Đạo cụ) trước đây là SÁU MỤC
 * SIDEBAR. Chúng bị kéo xuống thành hàng chip trong chính trang này, vì sidebar nay phải
 * chứa bốn ĐÍCH ĐẾN khác nhau (Ảnh đã tạo · Skeleton UI · Mascot · Cài đặt) chứ không
 * phải sáu bộ lọc của cùng một trang. URL vẫn giữ nguyên khả năng deep-link: nhóm nằm ở
 * `?group=`, và link cũ dạng `?section=props` vẫn mở đúng nhóm Đạo cụ
 * (`resolveProjectView` trong `routes/search-schemas.ts`).
 *
 * ⚠️ RANH GIỚI: file này KHÔNG chạm vào ruột thẻ kết quả. `GeneratedResults` lo trạng
 * thái từng ô (đang chờ / đang tạo / lỗi), copy và tải ảnh; ở đây chỉ có khung, bộ lọc
 * và hai cửa ra của cả dự án.
 */
const GROUPS: ReadonlyArray<{ id: ProjectImageGroup; label: string; category: ResultGroup }> = [
  { id: "all", label: "Tất cả thành phẩm", category: "all" },
  { id: "mascot", label: "Mascot", category: "mascot" },
  { id: "background", label: "Nền", category: "background" },
  { id: "popup", label: "Popup", category: "popup" },
  { id: "ui", label: "UI nhỏ", category: "ui" },
  { id: "props", label: "Đạo cụ", category: "prop" },
];

export function groupLabel(group: ProjectImageGroup): string {
  return GROUPS.find((item) => item.id === group)?.label ?? GROUPS[0]!.label;
}

export function groupCategory(group: ProjectImageGroup): ResultGroup {
  return GROUPS.find((item) => item.id === group)?.category ?? "all";
}

export function ImagesSection({
  projectId, kitName, group, onGroupChange, contract, jobStates, readOnly, onGenerate,
}: {
  projectId: string;
  kitName: string;
  group: ProjectImageGroup;
  onGroupChange: (group: ProjectImageGroup) => void;
  contract: Contract;
  jobStates: Record<string, JobStatusValue>;
  readOnly: boolean;
  onGenerate: (jobs: string[]) => void;
}) {
  const category = groupCategory(group);
  const title = groupLabel(group);
  const sheets = React.useMemo(
    () => contract.sheets.filter((sheet) => category === "all" || categoryOfSheet(sheet.id) === category),
    [category, contract.sheets],
  );
  const jobs = React.useMemo(
    () => contractJobs(contract)
      .filter((job) => category === "all" || categoryOfSheet(job.sheet) === category)
      .map((job) => job.job),
    [category, contract],
  );

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Ảnh đã tạo</p>
          <h1 className="text-display text-fg-strong">{title}</h1>
          <p className="mt-1 text-body text-fg-muted">Xem ảnh thật, kiểm tra skeleton và tạo lại đúng nhóm đang sửa.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* §W3-7 — hai cửa ra MANG PHẦN THƯỞNG. Nhà cũ của chúng là bước ⑥ của wizard,
              nơi chưa có một ảnh nào được cắt nên cả hai luôn khoá. Đây mới là chỗ chúng
              có nghĩa. Cả hai vẫn 0 đồng: `.zip` là đọc đĩa, Copy Figma là canvas + clipboard. */}
          <DownloadKitButton projectId={projectId} />
          <CopyFigmaButton projectId={projectId} kitName={kitName} />
          <Button type="button" disabled={readOnly || jobs.length === 0} onClick={() => onGenerate(jobs)}>
            <RefreshCw aria-hidden />{group === "all" ? "Tạo lại toàn bộ" : `Tạo lại ${title.toLowerCase()}`}
          </Button>
        </div>
      </header>

      <GroupChips
        groups={GROUPS.map((item) => ({ id: item.id, label: item.label, count: 0 }))}
        value={group}
        onChange={(id) => onGroupChange(id as ProjectImageGroup)}
      />

      <Tabs defaultValue="images">
        <TabsList>
          <TabsTrigger value="images">Ảnh thật</TabsTrigger>
          <TabsTrigger value="skeleton">Skeleton</TabsTrigger>
        </TabsList>
        <TabsContent value="images">
          <GeneratedResults projectId={projectId} contract={contract} jobStates={jobStates} category={category} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="skeleton">
          <div className="grid gap-4 lg:grid-cols-2">
            {sheets.map((sheet) => (
              <article key={sheet.id} className="overflow-hidden rounded-4 border border-line-subtle bg-surface">
                <div className="border-b border-line-subtle px-4 py-3">
                  <h2 className="text-label text-fg-strong">{sheet.id.replaceAll("-", " ")}</h2>
                  <p className="text-caption text-fg-muted">
                    {sheet.components.filter((component) => component.skel?.shape !== "empty").length} thành phần · {sheet.grid.cols} × {sheet.grid.rows}
                  </p>
                </div>
                <div className="p-4"><SkeletonPreview sheet={sheet} showIndex showSafeFrame /></div>
              </article>
            ))}
          </div>
          {sheets.length === 0
            ? <p className="rounded-4 border border-dashed border-line-subtle p-8 text-center text-body text-fg-muted">Nhóm này chưa có skeleton trong bản thiết kế.</p>
            : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
