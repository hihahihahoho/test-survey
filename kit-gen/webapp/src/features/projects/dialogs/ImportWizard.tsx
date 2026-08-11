import * as React from "react";
import { FileUp, FolderSearch } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/common";
import { useCreateProject, useImportPreview, useUpload } from "@/lib/hooks";
import type { ImportReport, Project } from "@/lib/types";
import { count } from "../lib/format";
import { validateName } from "../lib/slug";
import { errorDetail, toastSuccess } from "../lib/feedback";
import type { Gate } from "../lib/gate";
import { InlineError, OfflineNotice } from "./parts";
import { ImportSourceStep, type ImportSource } from "./ImportSourceStep";
import { ReconcileTable } from "./ReconcileTable";
import { ImportDoneStep } from "./ImportDoneStep";

/**
 * §4.6 WIZARD NHẬP — 3 BƯỚC, BƯỚC 2 KHÔNG BỎ QUA ĐƯỢC.
 *
 * Đây là chỗ đóng **issue nghiêm trọng #2 của audit** (import làm mất dữ liệu) và
 * chốt X12 "cấm mọi đường import im lặng". Nút sang bước 3 chỉ bật khi ĐÃ CÓ báo
 * cáo đối chiếu từ `POST /api/import/preview` (`disabled={step===2 && !report}`)
 * — không có đường tắt nào khác trong file này.
 *
 * Web KHÔNG tự đọc file, KHÔNG tự đoán số: mọi con số là của agent.
 *
 * ═══ ĐÃ THỬ THẬT VỚI DỮ LIỆU THẬT (không phải mô phỏng) ═══
 * `teams/t4-tichhop/styles-campaign.json` → agent 1.2.0 @ 127.0.0.1:8811:
 *   POST /api/uploads        → 201 {"uploadId":"up_448e7cd0737680a3","kind":"json","bytes":39058}
 *   POST /api/import/preview → 200
 *   report: sheets 12 · components 78 · variants 3 · unknownComponents 73
 *           · duplicateSheetIds [] · missingRefs []
 *           · warnings ["UNKNOWN_COMPONENTS: 73/78 element không có trong thư viện chuẩn"]
 * Khớp §4.6 ("12 sheet · 78 ô · 73 lạ · không trùng id sheet").
 *
 * MỘT CHỖ LỆCH ĐÃ ĐO: §4.6 ghi "0 dáng nhân vật" nhưng agent trả `poses: 19`,
 * vì `agent/lib/importer.mjs:81` THAY danh sách dáng rỗng bằng 19 dáng mặc định.
 * File gốc đúng là có 0 (`characterPoses: []`). UI hiện SỐ CỦA AGENT (thứ sẽ
 * thật sự được tạo) kèm một dòng giải thích. Xem NEEDS-s1-projects.md N7.
 */
export function ImportWizard({
  open,
  onOpenChange,
  gate,
  preset,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gate: Gate;
  preset?: { name: string; tags: string[] };
  onImported: (project: Project) => void;
}) {
  const upload = useUpload();
  const preview = useImportPreview();
  const create = useCreateProject();

  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [source, setSource] = React.useState<ImportSource>("stylesJson");
  const [uploadId, setUploadId] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [fileBytes, setFileBytes] = React.useState(0);
  const [folderPath, setFolderPath] = React.useState("");
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [copyHeavy, setCopyHeavy] = React.useState(true);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [created, setCreated] = React.useState<Project | null>(null);
  const [warnings, setWarnings] = React.useState<{ code: string; message?: string }[]>([]);
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setSource("stylesJson");
    setUploadId(null);
    setFileName("");
    setFileBytes(0);
    setFolderPath("");
    setName(preset?.name ?? "");
    setNameError(null);
    setCopyHeavy(true);
    setReport(null);
    setCreated(null);
    setWarnings([]);
    setFailure(null);
  }, [open, preset]);

  const busy = upload.isPending || preview.isPending || create.isPending;

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    void (async () => {
      setFailure(null);
      setUploadId(null);
      setFileName(file.name);
      setFileBytes(file.size);
      if (name.trim() === "") setName(`${file.name.replace(/\.(zip|json)$/i, "")} (nhập)`);
      try {
        const res = await upload.mutateAsync(file);
        setUploadId(res.uploadId);
      } catch (e) {
        setFailure(e);
        setFileName("");
      }
    })();
  };

  const sourcePayload = () =>
    source === "folder"
      ? { source: "folder" as const, path: folderPath.trim() }
      : { source, uploadId: uploadId ?? undefined };

  const goPreview = async () => {
    const err = validateName(name);
    setNameError(err);
    if (err) return;
    if (source === "folder" ? folderPath.trim() === "" : !uploadId) {
      setFailure({ code: "IMPORT_INVALID" });
      return;
    }
    setFailure(null);
    try {
      setReport(await preview.mutateAsync(sourcePayload()));
      setStep(2);
    } catch (e) {
      setFailure(e);
    }
  };

  const doImport = async () => {
    setFailure(null);
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        template: "import",
        firstVariant: { vi: "Phong cách 1", bg: "magenta" },
        tags: preset?.tags ?? [],
        import: sourcePayload(),
      });
      setCreated(res.project);
      setWarnings(res.warnings);
      setStep(3);
      toastSuccess(`Đã nhập «${res.project.name}»`);
    } catch (e) {
      setFailure(e);
    }
  };

  const stepLabel =
    step === 1 ? "Bước 1/3 · Chọn nguồn"
    : step === 2 ? "Bước 2/3 · Đối chiếu (bắt buộc xem)"
    : "Bước 3/3 · Xong";

  const primaryLabel =
    step === 1 ? "Tiếp: đối chiếu →"
    : step === 2 ? `Nhập ${count(report?.sheets ?? 0, "sheet")} vào project mới`
    : "Mở project";

  const onPrimary = () => {
    if (step === 1) return void goPreview();
    if (step === 2) return void doImport();
    onOpenChange(false);
    if (created) onImported(created);
  };

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent size="lg" onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Nhập project</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gate.readOnly && (
            <OfflineNotice text={`${gate.longReason} Cần công cụ local để đọc file và tạo project.`} />
          )}

          {step === 1 && (
            <ImportSourceStep
              source={source}
              onSourceChange={(s) => {
                setSource(s);
                setUploadId(null);
                setFileName("");
              }}
              fileName={fileName}
              fileBytes={fileBytes}
              uploading={upload.isPending}
              uploaded={Boolean(uploadId)}
              onPickFile={pickFile}
              folderPath={folderPath}
              onFolderPathChange={setFolderPath}
              name={name}
              nameError={nameError}
              onNameChange={(v) => {
                setName(v);
                setNameError(null);
              }}
              disabled={gate.readOnly || busy}
            />
          )}

          {step === 2 &&
            (preview.isPending || !report ? (
              <div className="py-6">
                <LoadingState
                  count={4}
                  variant="rows"
                  label="Đang đọc file và đối chiếu — chưa tạo gì trên máy bạn…"
                />
              </div>
            ) : (
              <ReconcileTable
                report={report}
                sourceLabel={fileName || folderPath || "nguồn đã chọn"}
                copyHeavy={copyHeavy}
                onCopyHeavyChange={setCopyHeavy}
              />
            ))}

          {step === 3 && created && (
            <ImportDoneStep project={created} report={report} warnings={warnings} />
          )}

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter className="border-t border-line-subtle sm:justify-between">
          <div className="flex gap-2">
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                ← Quay lại
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              {step === 3 ? "Đóng" : "Huỷ"}
            </Button>
            <Button
              variant="primary"
              loading={busy}
              /* Bước 2 chưa có báo cáo ⇒ KHÔNG cho đi tiếp. Đây là chốt X12. */
              disabled={gate.readOnly || (step === 2 && !report)}
              aria-disabled={gate.readOnly || undefined}
              title={gate.readOnly ? gate.reason : undefined}
              onClick={onPrimary}
            >
              {step === 1 && <FileUp aria-hidden />}
              {step === 3 && <FolderSearch aria-hidden />}
              {primaryLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
