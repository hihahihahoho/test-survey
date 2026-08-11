import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Check, Pencil, Settings2, X, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KeyboardHint } from "@/components/common";
import { usePatchProject } from "@/lib/hooks";
import { absTime, bytes, relTime } from "@/features/projects/lib/format";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { validateName } from "@/features/projects/lib/slug";
import type { Gate } from "@/features/projects/lib/gate";
import type { Project } from "@/lib/types";

/**
 * ĐẦU MÀN S2 (§3-S2 mục 1): tên (SỬA TẠI CHỖ bằng double-click hoặc F2) · tag ·
 * dòng meta · nút chính [⚡ Sinh ảnh…] · lối vào cài đặt project.
 *
 * SỬA TẠI CHỖ, ba chốt của §4.2:
 *  · `projectId` và thư mục KHÔNG đổi ⇒ ghi rõ một dòng nhỏ khi đang sửa, để user
 *    không sợ mất `runs/`, manifest hay đường dẫn ảnh.
 *  · Optimistic + rollback do `usePatchProject` của R0 lo; lỗi thì toast đỏ và
 *    Ô NHẬP MỞ LẠI với giá trị user vừa gõ — không im lặng nuốt công của họ.
 *  · Agent chưa chạy ⇒ không kích hoạt được, tooltip nói lý do (§2.5-2).
 *
 * Đổi SLUG không ở đây (§4.2: "tách ra để đổi tên là thao tác 2 giây") — nó ở S2b.
 *
 * §5.8-A12: tên do user nhập luôn render qua JSX (React tự escape) ⇒ tên
 * `Tết "26" <b>` hiện đúng nguyên văn, không thành thẻ HTML.
 */
export interface ProjectHeaderProps {
  project: Project;
  gate: Gate;
  /** Số lượt gợi ý sinh (để nhãn nút chính nói rõ user sắp làm gì). */
  pendingJobCount: number;
  /** true ⇒ bản thiết kế chưa có sheet nào ⇒ không có gì để sinh. */
  designEmpty: boolean;
  fromCache: boolean;
  onGenerate: () => void;
  /** Đăng ký hàm bật chế độ sửa tên để phím F2 của màn gọi được. */
  renameRef?: React.MutableRefObject<(() => void) | null>;
}

export function ProjectHeader({
  project,
  gate,
  pendingJobCount,
  designEmpty,
  fromCache,
  onGenerate,
  renameRef,
}: ProjectHeaderProps) {
  const patch = usePatchProject(project.id);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(project.name);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const startEdit = React.useCallback(() => {
    if (gate.readOnly) return;
    setDraft(project.name);
    setError(null);
    setEditing(true);
  }, [gate.readOnly, project.name]);

  // Màn giữ phím F2 (§3-S2 phím tắt) nhưng ô nhập sống ở đây ⇒ đưa hàm lên qua ref.
  React.useEffect(() => {
    if (!renameRef) return;
    renameRef.current = startEdit;
    return () => {
      renameRef.current = null;
    };
  }, [renameRef, startEdit]);

  React.useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    const bad = validateName(next);
    if (bad !== null) {
      setError(bad);
      return;
    }
    if (next === project.name) {
      setEditing(false);
      return;
    }
    setEditing(false);
    patch.mutate(
      { name: next },
      {
        onSuccess: () => toastSuccess(`Đã đổi tên thành «${next}»`),
        onError: (err) => {
          // Rollback là việc của hook R0; việc của UI là KHÔNG làm mất chữ user đã gõ.
          toastError(err, { titleOverride: "Chưa đổi được tên" });
          setDraft(next);
          setEditing(true);
        },
      },
    );
  };

  const meta = [
    project.updatedAt ? `sửa ${relTime(project.updatedAt)}` : null,
    bytes(project.stats?.diskBytes ?? 0),
    fromCache ? "dữ liệu đã lưu trên máy này" : null,
  ].filter((x): x is string => x !== null);

  const genDisabled = gate.readOnly || designEmpty;
  const genReason = gate.readOnly
    ? gate.reason
    : designEmpty
      ? "Cần ít nhất 1 sheet trong bản thiết kế"
      : null;

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {editing ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={draft}
                  aria-label="Tên project"
                  aria-invalid={error !== null}
                  className="h-ctl-lg w-[min(28rem,80vw)] text-title"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      setEditing(false);
                    }
                  }}
                />
                <Button variant="primary" size="icon" onClick={commit} aria-label="Lưu tên mới">
                  <Check aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label="Huỷ đổi tên">
                  <X aria-hidden />
                </Button>
              </div>
              {error !== null ? (
                <p role="alert" className="text-caption text-danger">
                  {error}
                </p>
              ) : (
                <p className="text-caption text-fg-muted-raised">
                  Thư mục trên máy vẫn là <span className="font-mono">{project.id}</span> — đổi tên không di
                  chuyển thư mục.
                </p>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1
                className="min-w-0 truncate text-display text-fg-strong"
                onDoubleClick={startEdit}
                title={project.name}
              >
                {project.name}
              </h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={gate.readOnly}
                    aria-disabled={gate.readOnly || undefined}
                    onClick={startEdit}
                    aria-label="Đổi tên project"
                  >
                    <Pencil aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {gate.readOnly ? gate.reason : "Đổi tên (F2 hoặc bấm đôi vào tên)"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {project.description && (
            <p className="max-w-2xl text-body text-fg">{project.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(project.tags ?? []).map((t) => (
              <Badge key={t} tone="outline">
                {t}
              </Badge>
            ))}
            <p className="text-caption text-fg-muted-raised" title={absTime(project.updatedAt)}>
              {meta.join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Lối vào S2b. Rail đã có mục này nhưng dưới 1280px rail chỉ còn icon,
              nên giữ một đường có CHỮ ngay cạnh nút chính (§2.2 responsive). */}
          <Button variant="secondary" size="md" asChild>
            <Link to="/p/$projectId/settings" params={{ projectId: project.id }}>
              <Settings2 aria-hidden />
              Cài đặt
            </Link>
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="primary"
                size="md"
                disabled={genDisabled}
                aria-disabled={genDisabled || undefined}
                onClick={onGenerate}
              >
                <Zap aria-hidden />
                Sinh ảnh…
                <KeyboardHint keys={["mod", "enter"]} className="ml-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {genReason ??
                (pendingJobCount > 0
                  ? `${pendingJobCount} lượt đang cần sinh — mở bảng chọn`
                  : "Chọn lượt cần sinh")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
