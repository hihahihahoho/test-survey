import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { contractJobs, type Contract, type JobStatusValue, type Project } from "@/lib/types";
import type { Gate } from "@/features/projects/lib/gate";
import { GeneratedResults } from "@/features/workflow-v4/components/GeneratedResults";
import { DownloadKitButton, CopyFigmaButton } from "@/features/workflow-v4/components/KitExits";
import { DemoScreenButton } from "@/features/demo";
import { groupAnchorId, type ResultGroup } from "@/features/workflow-v4/lib/generated-results";
import type { ProjectImageGroup } from "@/routes/search-schemas";
import { useRuns } from "@/lib/hooks";
import { buildMatrix } from "../lib/matrix";
import { staleWarning } from "../lib/next-actions";
import { StaleBanner } from "../components/StaleBanner";
import { RunFailBanner } from "../components/RunFailBanner";

/**
 * ẢNH ĐÃ TẠO — mục đầu tiên của sidebar dự án, và là nơi wizard đổ người dùng vào ngay
 * sau khi bấm "Tạo ảnh".
 *
 * ══ MỘT TRANG CUỘN DỌC, KHÔNG CÒN HÀNG CHIP ═════════════════════════════════
 * Sáu nhóm (Tất cả · Mascot · Nền · Popup · UI nhỏ · Đạo cụ) từng là sáu MỤC SIDEBAR,
 * rồi xuống làm hàng chip trong trang. Chủ sản phẩm bỏ luôn hàng chip đó ("BỎ CÁI ĐOẠN
 * BUTTON PILL Ở TẤT CẢ THÀNH PHẨM"), và lý do đứng vững: một hàng sáu chip nghĩa là
 * NĂM nhóm luôn bị giấu sau một cú bấm, trong khi tất cả chúng cộng lại vẫn vừa một dải
 * cuộn. Nay trang là một dải cuộn dọc, mỗi nhóm một khối có tiêu đề riêng.
 *
 * `?group=` KHÔNG bị bỏ: link cũ (và `?section=props` đời trước nữa) vẫn resolve, chỉ
 * đổi nghĩa từ "lọc" sang "CUỘN TỚI khối đó" — xem `scrollToGroup` bên dưới. Không có
 * đường nào làm gãy một bookmark cũ.
 *
 * ⚠️ RANH GIỚI: file này KHÔNG chạm vào ruột thẻ kết quả. `GeneratedResults` lo hàng
 * tab, trạng thái từng ô và các khối theo nhóm; ở đây chỉ có khung và hai cửa ra.
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

/**
 * `?group=` → cuộn tới khối tương ứng.
 *
 * Khối chỉ tồn tại SAU khi `/api/projects/:id/kit` (hoặc `/runs`) về, nên một lần thử
 * duy nhất lúc mount gần như luôn trượt. Thử lại theo vài nhịp ngắn rồi bỏ cuộc — thà
 * người dùng đứng ở đầu trang (vẫn thấy đủ mọi nhóm khi cuộn) còn hơn một vòng lặp
 * quan sát DOM sống mãi trong nền.
 */
const SCROLL_RETRIES = [0, 150, 400, 900, 1600] as const;

export function ImagesSection({
  projectId, kitName, group, contract, project, gate, jobStates, readOnly, onGenerate, onSlice,
}: {
  projectId: string;
  kitName: string;
  /** Nhóm muốn CUỘN TỚI (từ `?group=` hoặc `?section=` đời cũ). `all` ⇒ đứng ở đầu. */
  group: ProjectImageGroup;
  contract: Contract;
  /** Dự án như agent thấy — nguồn của `state.jobs`, tức là của dải "cần tạo lại". */
  project: Project;
  gate: Gate;
  jobStates: Record<string, JobStatusValue>;
  readOnly: boolean;
  onGenerate: (jobs: string[]) => void;
  /**
   * Chạy CẮT cho đúng tập lượt "có ảnh mới nhưng chưa cắt".
   *
   * Tách hẳn khỏi `onGenerate` vì hai việc KHÁC GIÁ TIỀN: `onGenerate` mở modal tiêu
   * quota, còn đường này là PIL thuần trên máy — không modal, chỉ toast. Trước đây chỗ
   * này bị đóng cứng `null` nên dải cảnh báo hiện đúng câu "chưa cắt" mà không đưa ra
   * được nút nào để làm việc đó (`59e59e3` xoá handler ở màn cha, `2048593` mắc lại dải).
   */
  onSlice: (jobs: string[]) => void;
}) {
  const category = groupCategory(group);

  React.useEffect(() => {
    if (category === "all") return;
    const timers = SCROLL_RETRIES.map((delay) => window.setTimeout(() => {
      document.getElementById(groupAnchorId(category))?.scrollIntoView({ block: "start", behavior: delay === 0 ? "auto" : "smooth" });
    }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [category]);

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
   */
  const warning = React.useMemo(
    () => staleWarning(project, buildMatrix(contract, project)),
    [contract, project],
  );
  const jobs = React.useMemo(() => contractJobs(contract).map((job) => job.job), [contract]);

  /**
   * §BACKLOG-22 — LƯỢT GEN CHẾT PHẢI NÓI RA Ở ĐẦU TRANG.
   *
   * Chỉ lấy MỘT lượt gần nhất (`limit=1`): dải cảnh báo nói về "lần vừa rồi", không
   * phải về lịch sử — lịch sử đã có trang S4 riêng. Query này dùng chung `queryKey`
   * với danh sách lượt chạy nên nó KHÔNG dựng thêm một nguồn sự thật thứ hai; sau khi
   * bấm "Tạo lại toàn bộ", `useStartRun` invalidate đúng khoá đó và dải tự biến mất.
   */
  const runs = useRuns(projectId, 1);
  const lastRun = runs.data?.items?.[0] ?? null;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Ảnh đã tạo</p>
          <h1 className="text-display text-fg-strong">Tất cả thành phẩm</h1>
          <p className="mt-1 text-body text-fg-muted">Cuộn xuống để xem từng nhóm: mascot, nền, popup, UI nhỏ và đạo cụ.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* §W3-7 — hai cửa ra MANG PHẦN THƯỞNG. Nhà cũ của chúng là bước ⑥ của wizard,
              nơi chưa có một ảnh nào được cắt nên cả hai luôn khoá. Đây mới là chỗ chúng
              có nghĩa. Cả hai vẫn 0 đồng: `.zip` là đọc đĩa, Copy Figma là canvas + clipboard. */}
          <DownloadKitButton projectId={projectId} />
          <CopyFigmaButton projectId={projectId} kitName={kitName} />
          {/* Cửa ra THỨ BA (#21): lắp thử một màn game từ chính những ảnh này rồi bắn
              sang Figma. Cả tính năng nằm trong dialog của nó — không route mới, không
              nút sidebar, đúng luật "để hết trong 1 cái popup". */}
          <DemoScreenButton projectId={projectId} />
          <Button type="button" disabled={readOnly || jobs.length === 0} onClick={() => onGenerate(jobs)}>
            <RefreshCw aria-hidden />Tạo lại toàn bộ
          </Button>
        </div>
      </header>

      {/* Dải LỖI đứng TRÊN dải "ảnh cũ hơn thiết kế": một lượt vừa chết thì việc ảnh cũ
          là hệ quả, không phải nguyên nhân — nói ngược thứ tự là chỉ sai đường chữa. */}
      <RunFailBanner
        run={lastRun}
        gate={readOnly ? { ...gate, readOnly: true, reason: gate.reason || "Dự án đang ở chế độ chỉ đọc" } : gate}
        onRegenerate={() => onGenerate(jobs)}
      />

      <StaleBanner
        warning={warning}
        gate={gate}
        onGen={() => onGenerate(warning.staleJobs)}
        onSlice={() => onSlice(warning.uncutJobs)}
      />

      {/* MỘT thanh segmented cho cả trang ("Ảnh thật | Ảnh gốc"); các khối theo nhóm nằm
          BÊN TRONG từng tab, nên không có hàng tab thứ hai nào lặp lại nhãn đầu. */}
      <GeneratedResults projectId={projectId} contract={contract} jobStates={jobStates} sectioned readOnly={readOnly} />
    </section>
  );
}
