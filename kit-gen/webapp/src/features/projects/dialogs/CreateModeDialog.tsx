import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useDeleteTemplate, useTemplates } from "@/lib/hooks";
import type { Project, Template } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail } from "../lib/feedback";
import { forgetTemplateCover } from "../lib/agent-blob";
import { nameAfterPick } from "../lib/templates";
import { TemplatePicker } from "../components/TemplatePicker";
import { InlineError, OfflineNotice } from "./parts";
import { modeTags, type KitMode } from "@/features/kitfile";

/**
 * HỘP TẠO DỰ ÁN — tên + «Bắt đầu từ» (dự án trống, hoặc một template đã lưu).
 *
 * Chủ sản phẩm (30/09/2026): «…khi tạo mới 1 project -> sẽ có thể chọn template sẵn».
 * Chọn template ⇒ gửi `fromTemplate`; agent vẫn tạo dự án bằng đúng một đường như cũ
 * (bản thiết kế trống, `template: "blank"`) rồi đổ bản soạn + ảnh tham chiếu vào. Sau
 * đó điều hướng y như dự án trống: `onCreated` → màn soạn, và màn soạn mở ra thấy
 * ngay các thẻ của template (bản soạn mang `docVersion: 1` nên không có câu hỏi «thay
 * bản nháp cũ»).
 */
export function CreateModeDialog({ open, onOpenChange, gate, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; gate: Gate;
  onCreated: (project: Project, mode: KitMode) => void;
}) {
  const create = useCreateProject();
  const templates = useTemplates({ enabled: open });
  const removeTemplate = useDeleteTemplate();
  const [name, setName] = React.useState("");
  /** Chữ mà CHÍNH hộp này vừa điền vào ô tên (xem `nameAfterPick`). */
  const [autoName, setAutoName] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) { setName(""); setAutoName(null); setSource(null); setFailure(null); }
  }, [open]);

  const items = templates.data?.items ?? [];
  const chosen: Template | null = source ? (items.find((t) => t.id === source) ?? null) : null;

  const pick = (id: string | null) => {
    const t = id ? (items.find((x) => x.id === id) ?? null) : null;
    const next = nameAfterPick(name, autoName, t);
    setSource(t ? t.id : null);
    setName(next.name);
    setAutoName(next.autoFilled);
  };
  const pickRef = React.useRef(pick);
  pickRef.current = pick;

  /* Template đang chọn biến khỏi danh sách (vừa xoá ở đây hay ở tab khác, danh sách
     mời lại sau một lần 404) ⇒ về «Dự án trống» — LỰA CHỌN HIỆN RA TRÊN MÀN, không
     phải một dự án trống được tạo lén dưới tên một template đã mất. */
  React.useEffect(() => {
    if (source && templates.data && !templates.data.items.some((t) => t.id === source)) pickRef.current(null);
  }, [source, templates.data]);

  const deleteOne = async (t: Template) => {
    setFailure(null);
    try {
      await removeTemplate.mutateAsync(t.id);
      forgetTemplateCover(t.id);
    } catch (error) { setFailure(error); }
  };

  const submit = async () => {
    if (!name.trim() || gate.readOnly || create.isPending) return;
    setFailure(null);
    try {
      const result = await create.mutateAsync({
        // Wizard là nơi người dùng chọn bộ khung đầu tiên. Khởi tạo bằng template
        // mẫu sẽ khiến dữ liệu mẫu bị hiểu nhầm là một thiết kế nhập từ bên ngoài.
        name: name.trim(), template: "blank",
        firstVariant: { id: "phong-cach-1", vi: "Phong cách 1" }, tags: modeTags("workflow"),
        /* Template NGƯỜI DÙNG tự lưu thì khác hẳn "dữ liệu mẫu" ở trên: đó là thiết kế
           của chính họ, họ chọn nó ở ngay hộp này. */
        ...(chosen ? { fromTemplate: chosen.id } : {}),
      });
      onOpenChange(false); onCreated(result.project, "workflow");
    } catch (error) {
      setFailure(error);
      /* Template vừa biến mất ⇒ mời lại danh sách; hiệu ứng ở trên đưa lựa chọn về
         «Dự án trống» một cách NHÌN THẤY ĐƯỢC. */
      if (chosen) void templates.refetch();
    }
  };

  const busy = create.isPending;

  return <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
    <DialogContent size="sm" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
      <DialogHeader>
        <DialogTitle>Tạo dự án</DialogTitle>
        <DialogDescription>
          {chosen
            ? `Dự án mới mở ra với mọi thẻ, cài đặt và ảnh tham chiếu của «${chosen.name}». Ảnh đã vẽ không đi theo.`
            : "Đặt tên trước, sau đó điền yêu cầu theo từng bước."}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5">
        {gate.readOnly && <OfflineNotice text={gate.longReason} />}
        <div className="space-y-2">
          <Label htmlFor="new-project-name">Tên dự án</Label>
          <Input ref={inputRef} id="new-project-name" value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="Ví dụ: Chợ Tết 2027" maxLength={120}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }} />
        </div>
        <TemplatePicker
          templates={items}
          loading={templates.isLoading}
          failed={templates.isError}
          value={chosen ? chosen.id : null}
          onChange={pick}
          onDelete={(t) => void deleteOne(t)}
          deletingId={removeTemplate.isPending ? (removeTemplate.variables ?? null) : null}
          disabled={busy || gate.readOnly}
        />
        {!chosen && (
          <div className="flex items-start gap-3 rounded-3 border border-line-subtle bg-raised p-3.5">
            <LayoutTemplate className="mt-0.5 size-4 shrink-0" aria-hidden />
            {/* "Wizard" là chữ của lập trình viên, không phải của người dùng — và ở ngay
                dưới tiêu đề "Tạo dự án" thì một cái nhãn "Trình tạo dự án" chỉ nói lại
                đúng câu vừa đọc. Cái thẻ này liệt kê các bước sẽ đi qua, nên nó tự gọi
                đúng tên mình là như vậy. Chọn template thì không còn "bước" nào để kể —
                dự án mở ra đã có sẵn thẻ — nên thẻ này lui đi. */}
            <span><span className="block text-label text-fg-strong">Các bước tiếp theo</span><span className="mt-0.5 block text-caption text-fg-muted">Yêu cầu, phong cách, bộ khung UI, mascot và ảnh.</span></span>
          </div>
        )}
        {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
      </DialogBody>
      <DialogFooter className="pt-2"><Button className="w-full" variant="primary" size="lg" loading={busy} disabled={!name.trim() || gate.readOnly} onClick={() => void submit()}>Tiếp tục</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
