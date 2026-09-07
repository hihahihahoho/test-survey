import * as React from "react";
import { AlertCircle, Info, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { devDetails, presentError } from "@/lib/api";
import { useElementLib, useSaveContract, useValidateContract } from "@/lib/hooks";
import type { Component, Contract, KitFile } from "@/lib/types";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { fromAgentLib, loadBundledV2 } from "@/features/design/library/lib/source";
import { libToComponent } from "@/features/design/library/lib/contract";
import { KitImage } from "./KitImage";
import { editItem, itemCount, locateItem } from "../lib/item-edit";

const WHOLE_SHEET_TRUTH = "Máy vẽ cả tấm một lần, không vẽ lẻ từng món. Sửa món này thì phải vẽ lại cả tấm";

export function ItemEditPanel(p: {
  open: boolean; onOpenChange: (open: boolean) => void; projectId: string; file: KitFile | null;
  contract: Contract | null; version: number; offline: boolean; readOnlyReason: string; onRedraw: (sheetId: string) => void;
}) {
  const location = React.useMemo(() => locateItem(p.contract, p.file), [p.contract, p.file]);
  const count = itemCount(location);
  const [spec, setSpec] = React.useState("");
  const [replacementFile, setReplacementFile] = React.useState("");
  const [empty, setEmpty] = React.useState(false);
  const [validationText, setValidationText] = React.useState<string | null>(null);
  const [operationError, setOperationError] = React.useState<unknown>(null);
  const library = useElementLib();
  const validate = useValidateContract(p.projectId);
  const save = useSaveContract(p.projectId);
  const elements = React.useMemo(() => {
    const agent = fromAgentLib(library.data).elements;
    return agent.length > 0 ? agent : loadBundledV2().elements;
  }, [library.data]);

  React.useEffect(() => {
    if (!p.open || !location) return;
    setSpec(location.item.spec);
    setReplacementFile("");
    setEmpty(location.item.skel.shape === "empty");
    setValidationText(null);
    setOperationError(null);
  }, [p.open, location]);

  const replacement = elements.find((item) => item.file === replacementFile);
  const changed = location !== null
    ? spec !== location.item.spec || replacementFile !== "" || empty !== (location.item.skel.shape === "empty")
    : false;
  const buildDraft = () => p.contract && location
    ? editItem(p.contract, location, { spec, replacement: replacement ? libToComponent(replacement) as Component : undefined, empty })
    : null;

  const persist = async (): Promise<boolean> => {
    const draft = buildDraft();
    if (!draft) return false;
    setValidationText(null);
    setOperationError(null);
    try {
      const result = await validate.mutateAsync(draft);
      if (result.errors.length > 0) {
        setValidationText("Chỗ sửa này chưa dùng được. Kiểm tra lại mô tả hoặc món đã chọn.");
        return false;
      }
      await save.mutateAsync({ version: p.version, contract: draft });
      if (save.conflict) return false;
      toastSuccess("Đã lưu. Ảnh hiện tại vẫn là bản cũ.");
      return true;
    } catch (error) {
      setOperationError(error);
      const code = presentError(error).code;
      if (code === "CONTRACT_CONFLICT") return false;
      if (code === "CONTRACT_INVALID") {
        setValidationText("Chỗ sửa này chưa dùng được. Kiểm tra lại mô tả hoặc món đã chọn.");
        return false;
      }
      setValidationText("Chưa lưu được thay đổi. Thử lại nhé.");
      toastError(error);
      return false;
    }
  };

  const saveOnly = () => void persist().then((ok) => { if (ok) p.onOpenChange(false); });
  const saveAndRedraw = () => void persist().then((ok) => {
    if (ok && location) { p.onOpenChange(false); p.onRedraw(location.sheet.id); }
  });

  return <Sheet open={p.open} onOpenChange={p.onOpenChange}>
    <SheetContent aria-describedby="item-edit-description">
      <SheetHeader><SheetTitle>{location?.item.vi || p.file?.file || "Sửa món"}</SheetTitle><SheetDescription id="item-edit-description">Sửa mô tả hoặc đổi món trước khi vẽ lại.</SheetDescription></SheetHeader>
      <SheetBody className="flex flex-col gap-6">
        {p.file && <KitImage projectId={p.projectId} path={p.file.path} alt={p.file.file} backdrop="checker" offline={p.offline} empty={p.file.empty} className="aspect-square w-full rounded-4" />}
        <div className="flex flex-col gap-2"><Label htmlFor="item-spec">Mô tả cho máy</Label><Textarea id="item-spec" value={spec} disabled={empty} onChange={(event) => setSpec(event.target.value)} /></div>
        <div className="flex flex-col gap-2"><Label>Hoặc đổi sang món khác</Label><Select value={replacementFile} disabled={empty || library.isLoading} onValueChange={(value) => { setReplacementFile(value); const found = elements.find((item) => item.file === value); if (found) setSpec(found.spec); }}><SelectTrigger aria-label="Chọn từ thư viện có sẵn"><SelectValue placeholder={library.isLoading ? "Đang mở thư viện…" : "Chọn từ thư viện có sẵn"} /></SelectTrigger><SelectContent>{elements.map((item) => <SelectItem key={item.file} value={item.file}>{item.vi || item.file}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="ghost" onClick={() => setEmpty((value) => !value)}>{empty ? "Giữ món này" : "Bỏ trống món này"}</Button>
        <div className="rounded-3 border border-line-subtle bg-surface p-4 text-body text-fg"><p className="flex items-start gap-2"><Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{WHOLE_SHEET_TRUTH} {count} món.</span></p></div>
        {(validationText || save.conflict) && <div role="alert" className="rounded-3 border border-warn bg-warn/10 p-3 text-body text-fg-strong"><p className="flex gap-2"><AlertCircle className="size-4 shrink-0" aria-hidden />{save.conflict !== null ? "Có người vừa sửa, tải lại nhé." : (validationText ?? "")}</p>{operationError !== null && <details className="mt-2 text-caption text-fg-muted"><summary>Chi tiết cho lập trình viên</summary><pre className="mt-2 whitespace-pre-wrap">{devDetails(operationError)}</pre></details>}</div>}
        {changed && <div role="status" className="flex flex-col items-start gap-2"><Badge tone="stale"><RotateCcw aria-hidden />Cần vẽ lại</Badge><p className="text-caption text-fg-muted">Bạn vừa sửa mô tả, ảnh đang là bản cũ.</p></div>}
      </SheetBody>
      <SheetFooter className="sm:flex-col"><Button variant="primary" disabled={p.offline || !location || validate.isPending || save.isPending} title={p.offline ? p.readOnlyReason : undefined} onClick={saveAndRedraw}>Vẽ lại cả tấm ({count} món) · ~1 lượt</Button><Button variant="ghost" disabled={p.offline || !location || validate.isPending || save.isPending} onClick={saveOnly}>Lưu, để vẽ sau</Button></SheetFooter>
    </SheetContent>
  </Sheet>;
}
