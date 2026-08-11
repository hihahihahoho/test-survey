import { CheckCircle2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImportReport, Project } from "@/lib/types";
import { count } from "../lib/format";
import { downloadText } from "../lib/agent-blob";

/**
 * BƯỚC 3 của wizard nhập (§4.6): báo cáo kết quả + danh sách cảnh báo ĐÃ ÁP DỤNG
 * + nút [Tải báo cáo .txt].
 *
 * Báo cáo .txt là bằng chứng để user đối chiếu về sau (bàn giao, migrate v1).
 * Nội dung KHÔNG chứa đường dẫn tuyệt đối (§8.2 checklist riêng tư) — chỉ id
 * thư mục project, đúng thứ đã hiện trên màn.
 */
export function ImportDoneStep({
  project,
  report,
  warnings,
}: {
  project: Project;
  report: ImportReport | null;
  warnings: { code: string; message?: string }[];
}) {
  return (
    <>
      <div className="flex items-start gap-2 rounded-2 border border-ok/60 bg-ok/10 p-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-on-tint-ok" aria-hidden />
        <div>
          <p className="text-body text-fg-strong">Đã nhập vào «{project.name}»</p>
          <p className="text-caption text-fg">
            {count(project.stats?.sheets ?? 0, "sheet")} · {count(project.stats?.components ?? 0, "element")} ·{" "}
            {count(project.stats?.variants ?? 0, "phong cách")}
          </p>
        </div>
      </div>

      <p className="text-caption text-fg-muted-raised">
        Thư mục trên máy: <span className="font-mono text-fg">{project.id}</span>
      </p>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-label text-fg-strong">Cảnh báo đã áp dụng</p>
          <ul className="flex flex-col gap-1.5">
            {warnings.slice(0, 8).map((w, i) => (
              <li key={`${w.code}-${i}`} className="flex items-start gap-2">
                <Badge tone="warn" className="shrink-0">
                  {w.code}
                </Badge>
                <span className="text-caption text-fg">{w.message ?? ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        variant="secondary"
        className="self-start"
        onClick={() => downloadText(`kitgen-import-${project.id}.txt`, buildReport(project, report, warnings))}
      >
        <Download aria-hidden />
        Tải báo cáo .txt
      </Button>
    </>
  );
}

function buildReport(
  project: Project,
  report: ImportReport | null,
  warnings: { code: string; message?: string }[],
): string {
  return [
    "kit-gen · BÁO CÁO NHẬP PROJECT",
    `Thời điểm: ${new Date().toISOString()}`,
    `Dự án: ${project.name} (thư mục ${project.id})`,
    "",
    `Sheet: ${report?.sheets ?? 0}`,
    `Element: ${report?.components ?? 0}`,
    `Phong cách: ${report?.variants ?? 0}`,
    `Dáng nhân vật: ${report?.poses ?? 0}`,
    `Element không có trong thư viện chuẩn: ${report?.unknownComponents ?? 0} (được GIỮ NGUYÊN)`,
    `Sheet trùng mã: ${(report?.duplicateSheetIds ?? []).join(", ") || "không có"}`,
    "",
    "Cảnh báo:",
    ...(warnings.length > 0 ? warnings.map((w) => `  - [${w.code}] ${w.message ?? ""}`) : ["  (không có)"]),
  ].join("\n");
}
