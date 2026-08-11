import { FolderPlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyboardHint } from "@/components/common";
import { count } from "../lib/format";
import type { Gate } from "../lib/gate";
import { DisplayTitle } from "@/features/setup/components/StepShell";

/**
 * Đầu màn S1: tiêu đề + số đếm + 3 nút, và dòng "N project · quét lúc hh:mm".
 *
 * §5.4: MỖI MÀN ĐÚNG 1 NÚT `primary`. Ở S1 đó là [Tạo project]; Nhập và Làm mới
 * là secondary/ghost. (Đóng audit §1.1-7: v1 có 4 nút ngang hàng không phân cấp.)
 */
export function ProjectsHeader({
  total,
  shown,
  scannedAt,
  fromCache,
  isFetching,
  trashCount,
  gate,
  onCreate,
  onImport,
  onRefresh,
  onOpenTrash,
}: {
  total: number;
  shown: number;
  scannedAt: string | null;
  fromCache: boolean;
  isFetching: boolean;
  trashCount: number;
  gate: Gate;
  onCreate: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onOpenTrash: () => void;
}) {
  const parts = [shown === total ? count(total, "project") : `${shown}/${total} project`];
  if (fromCache) parts.push("dữ liệu đã lưu trên máy này");
  else if (scannedAt) parts.push(`quét lúc ${String(scannedAt).slice(11, 16)}`);

  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-2">
        {/*
          #7 (SHOTS-FE1-DESCRIBED) — CÔNG THỨC NHẤN ĐÚNG MỘT TỪ.
          Trước: lead="Project" accent="của bạn" ⇒ phần serif italic rơi vào một cụm CHỨC NĂNG
          hai từ, đúng chỗ mắt dừng lại nhưng lại không mang nghĩa gì — nên H1 đọc như bị
          nghiêng bừa. FLORA nhấn DANH TỪ mang nghĩa ("Your *creative* environment").
          Sau: "Bộ *project*" — sans dẫn, serif italic đúng 1 danh từ, và ngắn hơn (bớt chữ,
          đúng FLORA-REF §2.8 "mật độ chữ thấp"). Ba màn kia đã đúng công thức này rồi:
          "Thư viện *kit*" · "Cài *đặt*" · "Cài đặt *project*".
          `DisplayTitle` vẫn nằm ở features/setup/ — FE2-PLAN §3-A2 cấm dời component xuyên
          feature trong đợt này; đề nghị dời lên components/common ở teams/react/NEEDS-fe2-a.md #A2-3.
        */}
        <DisplayTitle lead="Bộ" accent="project" />
        {/* aria-live: đọc lên khi số đổi vì lọc — người dùng screen reader cần biết */}
        <p role="status" aria-live="polite" className="text-caption text-fg-muted-raised">
          {parts.join(" · ")}
          {trashCount > 0 && (
            <>
              {" · "}
              <Button variant="link" size="sm" className="h-auto p-0 text-caption" onClick={onOpenTrash}>
                <Trash2 className="size-3" aria-hidden />
                Thùng rác {count(trashCount, "project")}
              </Button>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-line-subtle bg-overlay/90 p-2 shadow-3 backdrop-blur-xl">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onRefresh} loading={isFetching} aria-label="Làm mới danh sách">
              <RefreshCw aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Làm mới danh sách</TooltipContent>
        </Tooltip>

        <Button
          variant="secondary"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onImport}
        >
          <Upload aria-hidden />
          Nhập
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="primary"
              disabled={gate.readOnly}
              aria-disabled={gate.readOnly || undefined}
              onClick={onCreate}
            >
              <FolderPlus aria-hidden />
              Tạo project
              <KeyboardHint keys={["N"]} className="ml-1" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{gate.readOnly ? gate.reason : "Tạo project mới (phím n)"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
