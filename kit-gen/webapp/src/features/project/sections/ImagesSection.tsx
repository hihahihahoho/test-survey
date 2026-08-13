import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contractJobs, type Contract, type JobStatusValue, type Project } from "@/lib/types";
import type { Gate } from "@/features/projects/lib/gate";
import { GeneratedResults } from "@/features/workflow-v4/components/GeneratedResults";
import { DownloadKitButton, CopyFigmaButton } from "@/features/workflow-v4/components/KitExits";
import { GroupChips } from "@/features/workflow-v4/components/GroupChips";
import { categoryOfSheet, type ResultGroup } from "@/features/workflow-v4/lib/generated-results";
import type { ProjectImageGroup } from "@/routes/search-schemas";
import { buildMatrix } from "../lib/matrix";
import { staleWarning } from "../lib/next-actions";
import { StaleBanner } from "../components/StaleBanner";

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
  projectId, kitName, group, onGroupChange, contract, project, gate, jobStates, readOnly, onGenerate,
}: {
  projectId: string;
  kitName: string;
  group: ProjectImageGroup;
  onGroupChange: (group: ProjectImageGroup) => void;
  contract: Contract;
  /** Dự án như agent thấy — nguồn của `state.jobs`, tức là của dải "cần tạo lại". */
  project: Project;
  gate: Gate;
  jobStates: Record<string, JobStatusValue>;
  readOnly: boolean;
  onGenerate: (jobs: string[]) => void;
}) {
  const category = groupCategory(group);
  const title = groupLabel(group);
  /**
   * §BUG-2 — DẤU "CẦN TẠO LẠI" BỀN VỮNG.
   *
   * Lưu cài đặt xong mà chưa sinh lại ảnh là một trạng thái HỢP LỆ và có thể kéo dài
   * nhiều ngày; trước đây nó không được nói ra ở đâu cả, nên người dùng tải về một bộ
   * kit cắt từ contract mới nhưng ảnh của contract cũ. Agent đã tính sẵn điều này
   * (`state.jobs[job] === "stale"`: contract mtime > raw mtime) — ở đây chỉ đọc.
   *
   * Nó BỀN vì nguồn là đĩa, không phải một biến trong RAM: F5, đóng tab, mở máy khác
   * đều thấy cùng một dải, và nó chỉ tắt khi ảnh đã thật sự được sinh lại.
   *
   * `StaleBanner` + `staleWarning` vốn đã viết xong cho màn S2 cũ và chưa nơi nào gắn.
   */
  const warning = React.useMemo(
    () => staleWarning(project, buildMatrix(contract, project)),
    [contract, project],
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
          <p className="mt-1 text-body text-fg-muted">Xem ảnh đã cắt, đối chiếu sheet gốc và tạo lại đúng nhóm đang sửa.</p>
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

      <StaleBanner
        warning={warning}
        gate={gate}
        onGen={() => onGenerate(warning.staleJobs)}
        onSlice={null}
      />

      <GroupChips
        groups={GROUPS.map((item) => ({ id: item.id, label: item.label, count: 0 }))}
        value={group}
        onChange={(id) => onGroupChange(id as ProjectImageGroup)}
      />

      {/* ══ MỘT THANH SEGMENTED, KHÔNG PHẢI HAI ═══════════════════════════════
          Ở đây từng có thanh "Ảnh thật | Skeleton" bọc ngoài, đè ngay trên thanh
          "Ảnh thật | Ảnh gốc" của `GeneratedResults`: hai hàng giống hệt nhau cách
          nhau ~8px, cùng mở đầu bằng chữ "Ảnh thật". Skeleton đã có ĐÍCH RIÊNG trong
          sidebar (`?section=skeleton`) nên thanh ngoài vừa rối vừa là lối vào thứ hai
          cho cùng một thứ. Lưới xem bộ khung dọn sang trang Skeleton UI
          (`SkeletonSheetGrid`); trang này chỉ còn nói về ẢNH. */}
      <GeneratedResults projectId={projectId} contract={contract} jobStates={jobStates} category={category} readOnly={readOnly} />
    </section>
  );
}
