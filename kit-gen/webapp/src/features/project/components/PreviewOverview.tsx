import * as React from "react";
import { ProjectCover } from "@/features/projects/components/ProjectCover";
import { cutAssets } from "@/features/kit-core/components/CutAssetGrid";
import { groupLabel, RESULT_GROUP_ORDER } from "@/features/kit-core/lib/generated-results";
import { useKit } from "@/lib/hooks";
import type { Contract, Project } from "@/lib/types";

/**
 * ══ PREVIEW TỔNG QUAN — khối nhỏ ở SIDEBAR TRÁI của dự án ═══════════════════
 *
 * Chủ sản phẩm: "TRONG DỰ ÁN, SIDEBAR TRÁI SẼ CÓ PHẦN PREVIEW TỔNG QUAN". Nó trả lời
 * đúng một câu hỏi mà bốn mục điều hướng không trả lời được: *dự án này hiện đang có
 * gì rồi* — một ảnh đại diện và số ô đã cắt theo từng nhóm.
 *
 * BA GIỚI HẠN TỰ ĐẶT, để nó không phình thành màn thứ năm:
 *  ① chỉ ĐỌC — không có nút tạo lại, không có bộ lọc, không mở dialog nào;
 *  ② một đích duy nhất — bấm vào bất kỳ đâu trong khối là sang trang "Ảnh đã tạo";
 *  ③ ảnh lấy theo thứ tự ảnh bìa dự án → ô đã cắt mới nhất; không có thì hiện khung
 *    trống có chữ, không bao giờ là một ô xám bí ẩn (`ProjectCover` lo cả ba ca).
 *
 * Vùng bấm là MỘT `<button>` phủ toàn khối (`absolute inset-0`) chứ không phải một
 * `<button>` bọc ngoài: `ProjectCover` trả về `<div><img></div>`, mà `<div>` trong
 * `<button>` là content model sai.
 */
export function PreviewOverview({ projectId, project, contract, onOpen }: {
  projectId: string;
  project: Project;
  contract: Contract | null;
  onOpen: () => void;
}) {
  const kit = useKit(projectId);
  const assets = React.useMemo(
    () => cutAssets(kit.data?.files ?? [], contract),
    [contract, kit.data?.files],
  );
  const counts = React.useMemo(
    () => RESULT_GROUP_ORDER
      .map((group) => ({ group, count: assets.filter((asset) => asset.category === group).length }))
      .filter((row) => row.count > 0),
    [assets],
  );
  /* Ảnh bìa do người dùng chọn thắng; chưa chọn thì mượn ô đã cắt đầu tiên để khối
     không rỗng ở đúng lúc dự án đã có ảnh. */
  const thumb = project.cover ?? assets[0]?.file.path ?? null;

  return (
    <section aria-label="Preview tổng quan" className="relative mt-4 rounded-3 border border-line-subtle bg-surface p-3">
      <p className="eyebrow mb-2">Preview tổng quan</p>
      <ProjectCover
        projectId={projectId}
        coverPath={thumb}
        projectName={project.name}
        offline={false}
        className="mx-0 w-full"
      />
      {counts.length > 0 ? (
        <dl className="mt-3 space-y-1">
          {counts.map(({ group, count }) => (
            <div key={group} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-caption text-fg-muted">{groupLabel(group)}</dt>
              <dd className="text-caption tabular-nums text-fg">{count}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-2 border-t border-line-subtle pt-1">
            <dt className="text-caption text-fg">Tổng</dt>
            <dd className="text-caption tabular-nums text-fg-strong">{assets.length}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-caption text-fg-muted">Chưa có ảnh nào được cắt.</p>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <span className="sr-only">Mở Ảnh đã tạo</span>
      </button>
    </section>
  );
}
