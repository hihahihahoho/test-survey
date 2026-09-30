import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateProject, useTemplates } from "@/lib/hooks";
import type { Project, Template } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { errorDetail } from "../lib/feedback";
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
 *
 * 30/09/2026 (lượt 2) — «Bắt đầu từ» thành một ô chọn một dòng (xem `TemplatePicker`),
 * nút xoá rời khỏi đây sang màn «Template dự án». Hộp nhận thêm hai thứ từ màn ấy:
 *  · `initialTemplateId` — nút «Tạo dự án» trên thẻ template mở hộp với template đó
 *    CHỌN SẴN, đi qua đúng đường `nameAfterPick` như một cú chọn tay (ô tên tự điền
 *    «<tên> (mới)», và vẫn không bao giờ đè chữ người dùng gõ);
 *  · `onManageTemplates` — dòng «Quản lý template…» ở chân popover: đóng hộp rồi để
 *    nơi mở hộp tự điều hướng (hộp không biết router, như `onCreated`).
 */
export function CreateModeDialog({ open, onOpenChange, gate, onCreated, initialTemplateId = null, onManageTemplates }: {
  open: boolean; onOpenChange: (open: boolean) => void; gate: Gate;
  onCreated: (project: Project, mode: KitMode) => void;
  /** Template chọn sẵn khi hộp MỞ ra. Đổi prop lúc hộp đang mở thì không có tác dụng. */
  initialTemplateId?: string | null;
  /** Có ⇒ popover «Bắt đầu từ» có dòng «Quản lý template…». */
  onManageTemplates?: () => void;
}) {
  const create = useCreateProject();
  const templates = useTemplates({ enabled: open });
  const [name, setName] = React.useState("");
  /** Chữ mà CHÍNH hộp này vừa điền vào ô tên (xem `nameAfterPick`). */
  const [autoName, setAutoName] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const items = templates.data?.items ?? [];
  const chosen: Template | null = source ? (items.find((t) => t.id === source) ?? null) : null;

  /** Chọn nguồn, tính ô tên từ `base` — tách ra để lượt chọn sẵn lúc mở hộp tính từ ô
   *  TRỐNG, không từ chữ còn sót của lần mở trước (state ấy chưa kịp dọn trong cùng lượt). */
  const settle = (id: string | null, base: { name: string; autoName: string | null }) => {
    const t = id ? (items.find((x) => x.id === id) ?? null) : null;
    const next = nameAfterPick(base.name, base.autoName, t);
    setSource(t ? t.id : null);
    setName(next.name);
    setAutoName(next.autoFilled);
  };
  const pick = (id: string | null) => settle(id, { name, autoName });
  const pickRef = React.useRef(pick);
  pickRef.current = pick;
  const settleRef = React.useRef(settle);
  settleRef.current = settle;
  const initialRef = React.useRef(initialTemplateId);
  initialRef.current = initialTemplateId;
  const loadedRef = React.useRef(false);
  loadedRef.current = Boolean(templates.data);
  /** Template chọn sẵn đang đợi danh sách về (mở hộp khi cache còn lạnh). */
  const waitingRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFailure(null);
    const want = initialRef.current ?? null;
    /* Danh sách đã có (ca thường gặp: mở từ màn «Template dự án», cache còn nóng) ⇒
       chọn NGAY trong lượt mở. Chưa có ⇒ mở ở «Dự án trống» và đợi (hiệu ứng dưới). */
    const now = want && !loadedRef.current ? null : want;
    waitingRef.current = want && !loadedRef.current ? want : null;
    settleRef.current(now, { name: "", autoName: null });
  }, [open]);

  React.useEffect(() => {
    const want = waitingRef.current;
    if (!open || !want || !templates.data) return;
    waitingRef.current = null;
    /* Về muộn: người dùng có thể đã gõ tên trong lúc đợi ⇒ đi đúng đường chọn tay,
       `nameAfterPick` giữ nguyên chữ của họ. */
    pickRef.current(want);
  }, [open, templates.data]);

  /* Template đang chọn biến khỏi danh sách (vừa xoá ở màn «Template dự án» trong tab
     khác, danh sách mời lại sau một lần 404) ⇒ về «Dự án trống» — LỰA CHỌN HIỆN RA TRÊN MÀN, không
     phải một dự án trống được tạo lén dưới tên một template đã mất. */
  React.useEffect(() => {
    if (source && templates.data && !templates.data.items.some((t) => t.id === source)) pickRef.current(null);
  }, [source, templates.data]);

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
          onManage={onManageTemplates ? () => { onOpenChange(false); onManageTemplates(); } : undefined}
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
