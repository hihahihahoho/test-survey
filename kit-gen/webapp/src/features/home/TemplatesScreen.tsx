import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { LayoutTemplate, MoreHorizontal, Pencil, Plus, RefreshCw, Search, SearchX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDestructive, EmptyState, ErrorState, LoadingState } from "@/components/common";
import { CARD } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import { useAgentStatus, useDeleteTemplate, usePatchTemplate, useTemplates } from "@/lib/hooks";
import type { Template } from "@/lib/types";
import { CreateModeDialog } from "@/features/projects/dialogs/CreateModeDialog";
import { InlineError, OfflineNotice } from "@/features/projects/dialogs/parts";
import { forgetTemplateCover } from "@/features/projects/lib/agent-blob";
import { errorDetail, toastSuccess } from "@/features/projects/lib/feedback";
import { gateOf, useNarrowViewport, type Gate } from "@/features/projects/lib/gate";
import { createNav, openCreatedWith } from "@/features/projects/lib/nav";
import {
  TEMPLATE_NAME_MAX, matchesTemplate, templateCaption, templateNameError,
} from "@/features/projects/lib/templates";
import { useTemplateCover } from "@/features/projects/lib/useTemplateCover";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

/**
 * MÀN «TEMPLATE DỰ ÁN» (`/templates`) — nơi QUẢN LÝ template đã lưu.
 *
 * ╔══ VÌ SAO CÓ MÀN NÀY (30/09/2026) ═════════════════════════════════════════╗
 * ║ Chủ sản phẩm, kèm ảnh chụp hộp Tạo dự án: nhiều template là «Bắt đầu từ» ║
 * ║ thành một danh sách dòng to không đáy — và xin một chỗ quản lý template ở ║
 * ║ thanh bên. Hộp Tạo dự án nay chỉ để CHỌN (ô chọn một dòng, không còn nút  ║
 * ║ xoá cạnh từng dòng: chọn và xoá đứng sát nhau là một cú trượt tay ném đi  ║
 * ║ template dựng cả buổi). Đổi tên, viết mô tả, xoá — ở đây, mỗi việc qua    ║
 * ║ một hộp riêng.                                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Nội dung một template BẤT BIẾN sau khi lưu (agent chỉ cho PATCH tên + mô tả): muốn
 * đổi thẻ/ảnh bên trong thì mở dự án, sửa, rồi lưu thành template mới. Nên màn này
 * không có nút «Sửa template» — có thì nó sẽ phải nói dối về việc sửa được gì.
 *
 * NÚT CHÍNH CỦA THẺ LÀ «TẠO DỰ ÁN», không phải «Mở»: không có gì để mở. Nó mở hộp Tạo
 * dự án với template này CHỌN SẴN, rồi điều hướng y như tạo từ danh sách dự án
 * (`openCreatedWith` — MỘT luật cho cả hai màn).
 *
 * CHỈ-ĐỌC khi agent không sẵn sàng / màn hẹp (`gateOf(status, narrow)`, cùng cổng với
 * danh sách dự án): nút ghi KHOÁ kèm lý do, không ẩn (§2.5-2).
 */

/** Trên số này mới hiện ô tìm — tám thẻ vẫn lướt mắt được trong một màn. */
const SEARCH_ABOVE = 8;
/** Tên ngắn cho trần độ dài tên — để chuỗi đếm «n/80 ký tự» không mang chữ «template» trong mã. */
const NAME_MAX = TEMPLATE_NAME_MAX;

/**
 * Chữ của màn. «template» ở đây là TÊN TÍNH NĂNG do chủ sản phẩm đặt («save template»),
 * không phải chữ kỹ thuật lọt ra — mỗi dòng xin miễn cổng từ cấm (`banned-scan.ts`)
 * ngay tại chỗ, để dòng nào thêm sau mà không xin thì cổng vẫn bắt được.
 */
const COPY = {
  title: "Template dự án", // kg-allow-jargon: tên tính năng
  intro: "Mỗi template giữ mọi thẻ, cài đặt và ảnh tham chiếu của một dự án, để bắt đầu dự án sau từ đó. Ảnh đã vẽ không đi theo.", // kg-allow-jargon: tên tính năng
  loading: "Đang tải danh sách template…", // kg-allow-jargon: tên tính năng
  errorTitle: "Chưa lấy được danh sách template.", // kg-allow-jargon: tên tính năng
  errorBody: "Template nằm trên máy bạn. Bấm Thử lại, hoặc kiểm tra công cụ trên máy.", // kg-allow-jargon: tên tính năng
  gridLabel: "Danh sách template", // kg-allow-jargon: tên tính năng
  searchLabel: "Tìm template", // kg-allow-jargon: tên tính năng
  searchPlaceholder: "Tìm template…", // kg-allow-jargon: tên tính năng
  noMatch: (q: string) => `Không có template nào tên «${q}»`, // kg-allow-jargon: tên tính năng
  emptyTitle: "Chưa có template nào", // kg-allow-jargon: tên tính năng
  emptyBody: "Template giữ lại phần dựng của một dự án — mọi thẻ, cài đặt và ảnh tham chiếu — để dự án sau bắt đầu từ đó thay vì từ trang trắng.", // kg-allow-jargon: tên tính năng
  emptySteps: [
    "Mở một dự án.",
    "Ở màn soạn, bấm «Lưu làm template». Nút này cũng có trong menu ⋯ của thẻ dự án.", // kg-allow-jargon: tên tính năng
    "Khi tạo dự án mới, chọn template ở ô «Bắt đầu từ».", // kg-allow-jargon: tên tính năng
  ],
  descPlaceholder: "Dùng cho chiến dịch nào, khác các template kia ở đâu…", // kg-allow-jargon: tên tính năng
  deleteTitle: (name: string) => `Xoá template “${name}”?`, // kg-allow-jargon: tên tính năng
  deleteBody: "Template không còn hiện ở «Bắt đầu từ» khi tạo dự án.", // kg-allow-jargon: tên tính năng
  deleteAction: "Xoá template", // kg-allow-jargon: tên tính năng
  deleted: (name: string) => `Đã xoá template «${name}»`, // kg-allow-jargon: tên tính năng
} as const;

export function TemplatesScreen() {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createNav(navigate), [navigate]);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const templates = useTemplates();

  const [query, setQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createFrom, setCreateFrom] = React.useState<string | null>(null);
  /* Đích của hai hộp là một BẢN CHỤP template, không phải id tra lại: xoá là optimistic
     — thẻ biến khỏi danh sách ngay lúc bấm, trong khi hộp xác nhận còn phải đứng đó để
     báo lỗi nếu agent từ chối. Tra theo id thì hộp mất đích đúng lúc cần nó nhất. */
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<Template | null>(null);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  const all = templates.data?.items ?? [];
  const searchable = all.length > SEARCH_ABOVE;
  const shown = searchable ? all.filter((t) => matchesTemplate(t, query)) : all;

  const body = (() => {
    if (templates.isPending) {
      return <LoadingState className="mt-6" variant="cards" count={3} label={COPY.loading} />;
    }
    if (templates.isError && !templates.data) {
      return (
        <ErrorState
          className="mt-6"
          title={COPY.errorTitle}
          description={COPY.errorBody}
          detail={errorDetail(templates.error)}
          actions={<Button variant="secondary" onClick={() => void templates.refetch()}><RefreshCw aria-hidden />Thử lại</Button>}
        />
      );
    }
    if (all.length === 0) return <TemplatesEmpty onProjects={() => void navigate({ to: "/", search: {} })} />;
    if (shown.length === 0) {
      return (
        <EmptyState
          icon={SearchX}
          title={COPY.noMatch(query.trim())}
          description="Thử từ khoá ngắn hơn, hoặc gõ không dấu."
          className="mt-6 min-h-[320px] rounded-5 border border-line-subtle bg-surface/70"
          action={<Button variant="secondary" onClick={() => setQuery("")}>Xoá từ khoá</Button>}
        />
      );
    }
    return (
      <section
        aria-label={COPY.gridLabel}
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {shown.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            gate={gate}
            onCreate={() => { setCreateFrom(t.id); setCreateOpen(true); }}
            onEdit={() => { setEditing(t); setEditOpen(true); }}
            onRemove={() => { setRemoving(t); setRemoveOpen(true); }}
          />
        ))}
      </section>
    );
  })();

  return (
    <HomeWorkspaceShell active="templates" title={COPY.title}>
      <p className="max-w-2xl text-body text-fg-muted">{COPY.intro}</p>
      {searchable && (
        <div className="relative mt-5 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input
            type="search"
            aria-label={COPY.searchLabel}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={COPY.searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}
      {body}

      {/* Không truyền `onManageTemplates`: đang đứng ở chính màn quản lý, dòng «Quản lý
          template…» trong popover chỉ còn là một cách đóng hộp. */}
      <CreateModeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        gate={gate}
        initialTemplateId={createFrom}
        onCreated={(project, mode) => openCreatedWith(nav, project, mode)}
      />
      <EditTemplateDialog template={editing} open={editOpen} onOpenChange={setEditOpen} gate={gate} />
      <DeleteTemplateDialog template={removing} open={removeOpen} onOpenChange={setRemoveOpen} />
    </HomeWorkspaceShell>
  );
}

/**
 * CHƯA CÓ TEMPLATE NÀO — nói template sinh ra ở ĐÂU. Màn này không tạo được template
 * (template là ảnh chụp một dự án), nên thứ duy nhất có ích là chỉ đúng hai cái nút
 * tạo ra nó và một đường về danh sách dự án.
 */
function TemplatesEmpty({ onProjects }: { onProjects: () => void }) {
  return (
    <EmptyState
      icon={LayoutTemplate}
      title={COPY.emptyTitle}
      description={COPY.emptyBody}
      steps={[...COPY.emptySteps]}
      className="mt-6 min-h-[360px] rounded-5 border border-dashed border-line-subtle bg-surface/40"
      action={<Button variant="secondary" onClick={onProjects}>Mở danh sách dự án</Button>}
    />
  );
}

/**
 * MỘT THẺ TEMPLATE — cùng khung với thẻ dự án (`CARD`, bìa 16:10 bo `rounded-3`) để
 * hai lưới trông là một họ. Thứ tự đọc: bìa → tên → mô tả → số thẻ/ảnh/ngày lưu → gốc
 * từ dự án nào → nút. Dòng «Từ dự án» là thứ phân biệt hai template cùng tên lưu từ
 * hai dự án khác nhau.
 */
function TemplateCard({ template, gate, onCreate, onEdit, onRemove }: {
  template: Template;
  gate: Gate;
  onCreate: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const headingId = React.useId();
  const { name } = template;
  const ro = gate.readOnly;
  const label = (text: string) => (ro ? `${text} — ${gate.reason}` : text);
  const description = template.description.trim();

  return (
    <article
      data-template-card={template.id}
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col gap-3 p-3", CARD)}
    >
      <TemplateCover template={template} />

      <div className="flex min-w-0 items-start justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={headingId} className="truncate text-subtitle text-fg-strong" title={name}>{name}</h2>
          {description && <p className="line-clamp-2 text-caption text-fg" title={description}>{description}</p>}
          <p className="truncate text-caption text-fg-muted">{templateCaption(template)}</p>
          {template.sourceProjectName && (
            <p className="truncate text-caption text-fg-muted" title={template.sourceProjectName}>
              Từ dự án: {template.sourceProjectName}
            </p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={`Thao tác khác cho ${name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem disabled={ro} onSelect={onEdit}>
              <Pencil aria-hidden />
              {label("Đổi tên & mô tả")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive disabled={ro} onSelect={onRemove}>
              <Trash2 aria-hidden />
              {label("Xoá")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-auto px-1 pb-1">
        {/* `secondary`, không `primary`: luật màn TỐI ĐA MỘT nút primary (`button.tsx`),
            mà lưới có N thẻ. Tên đọc lên mang cả tên template — mười nút cùng đọc «Tạo
            dự án» thì người dùng trình đọc màn hình không biết nút nào của thẻ nào. */}
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={ro}
          title={ro ? gate.reason : undefined}
          aria-label={`Tạo dự án từ ${name}`}
          onClick={onCreate}
        >
          <Plus aria-hidden />
          Tạo dự án
        </Button>
      </div>
    </article>
  );
}

/**
 * Bìa 16:10 — `?w=512`: thẻ rộng tới ~300px, màn retina cần gấp đôi; 256 là nhoè.
 * Template ít (không phải trăm dự án), nên giá thêm của ảnh to là nhỏ. Không có bìa
 * ⇒ ô giữ chỗ CÓ CHỮ; có bìa mà chưa về / tải hỏng ⇒ chỉ icon, không hứa gì sai.
 */
function TemplateCover({ template }: { template: Template }) {
  const url = useTemplateCover(template, 512);
  return (
    <div
      data-template-cover
      className="relative aspect-[16/10] w-full overflow-hidden rounded-3 border border-line-subtle bg-raised"
    >
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center">
          <LayoutTemplate className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
          {!template.hasCover && <span className="text-caption text-fg-muted">Chưa có ảnh bìa</span>}
        </div>
      )}
    </div>
  );
}

/**
 * «ĐỔI TÊN & MÔ TẢ» — hai thứ duy nhất agent cho sửa (`PATCH /api/templates/:id`).
 *
 * Kiểm tên TRƯỚC khi gọi (`templateNameError`: trống / quá 80 ký tự — đúng luật agent
 * áp, agent từ chối bằng 400 `INVALID_NAME`). Ô tên CỐ Ý không có `maxLength`: dán một
 * cái tên dài vào ô có trần thì trình duyệt cắt đuôi LẶNG LẼ — người dùng không biết
 * tên mình vừa mất nửa sau. Để nguyên, đếm ra, và nói rõ khi quá.
 */
function EditTemplateDialog({ template, open, onOpenChange, gate }: {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gate: Gate;
}) {
  const patch = usePatchTemplate();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);

  /* Nạp lại ô khi MỞ (hoặc đổi template) — khoá theo id, không theo object: danh sách
     mời lại sau PATCH ra object mới, khoá theo object là xoá chữ đang gõ dở. */
  const templateRef = React.useRef(template);
  templateRef.current = template;
  const templateId = template?.id ?? null;
  React.useEffect(() => {
    const t = templateRef.current;
    if (!open || !t) return;
    setName(t.name);
    setDescription(t.description ?? "");
    setNameError(null);
    setFailure(null);
  }, [open, templateId]);

  if (!template) return null;

  const busy = patch.isPending;
  const length = name.trim().length;

  const submit = async () => {
    if (busy || gate.readOnly) return;
    const err = templateNameError(name);
    setNameError(err);
    if (err) return;
    const nextName = name.trim();
    const nextDescription = description.trim();
    if (nextName === template.name && nextDescription === (template.description ?? "").trim()) {
      onOpenChange(false);
      return;
    }
    setFailure(null);
    try {
      const saved = await patch.mutateAsync({ id: template.id, name: nextName, description: nextDescription });
      onOpenChange(false);
      toastSuccess(`Đã lưu «${saved.name}»`);
    } catch (error) {
      setFailure(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent
        size="sm"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Đổi tên & mô tả</DialogTitle>
          <DialogDescription>
            Chỉ đổi cách nó hiện ra ở «Bắt đầu từ». Thẻ, cài đặt và ảnh bên trong giữ nguyên.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-template-name">Tên template</Label>
            <Input
              id="edit-template-name"
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); setNameError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby="edit-template-name-help"
            />
            {nameError ? (
              <p id="edit-template-name-help" role="alert" className="text-caption text-danger">{nameError}</p>
            ) : (
              <p
                id="edit-template-name-help"
                className={cn("text-caption tabular-nums", length > NAME_MAX ? "text-danger" : "text-fg-muted")}
              >
                {`${length}/${NAME_MAX} ký tự`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-template-description">
              Mô tả <span className="font-normal text-fg-muted">(không bắt buộc)</span>
            </Label>
            {/* Trần 2000 = trần agent (`TEMPLATE_DESCRIPTION_MAX`); quá thì agent cắt
                lặng lẽ, nên chặn ngay ở ô — đúng như hộp «Lưu làm template». */}
            <Textarea
              id="edit-template-description"
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={COPY.descPlaceholder}
            />
          </div>

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Huỷ</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={gate.readOnly}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={() => void submit()}
          >
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * XOÁ — qua hộp xác nhận, không xoá ở cú bấm đầu.
 *
 * Agent xoá MỀM: thư mục template chuyển vào thùng rác của thư mục làm việc
 * (`.kitgen/trash/template-…`), giữ 30 ngày. Nhưng màn «Thùng rác» của app KHÔNG liệt kê
 * template (agent bỏ qua chúng ở `listTrash`) — nên hộp phải nói thẳng điều đó, kẻo người
 * dùng yên tâm «còn trong thùng rác» rồi đi tìm ở một nơi không có.
 *
 * Lỗi hiện NGAY TRONG HỘP (§5.5: toast không phải nơi duy nhất báo lỗi). Hộp giữ bản chụp
 * template nên vẫn đứng được khi thẻ đã biến (xoá optimistic) rồi quay lại (rollback).
 */
function DeleteTemplateDialog({ template, open, onOpenChange }: {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useDeleteTemplate();
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (open) setFailure(null);
  }, [open]);

  if (!template) return null;

  const confirm = async () => {
    setFailure(null);
    try {
      await remove.mutateAsync(template.id);
      forgetTemplateCover(template.id);
      onOpenChange(false);
      toastSuccess(COPY.deleted(template.name));
    } catch (error) {
      setFailure(error);
    }
  };

  return (
    <ConfirmDestructive
      open={open}
      onOpenChange={onOpenChange}
      pending={remove.isPending}
      title={COPY.deleteTitle(template.name)}
      description={COPY.deleteBody}
      actionLabel={COPY.deleteAction}
      onConfirm={() => void confirm()}
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1 rounded-2 border border-line-subtle bg-canvas p-3">
          <li className="text-caption text-fg">
            Các dự án đã tạo từ template này vẫn giữ nguyên — mỗi dự án là một bản riêng.
          </li>
          <li className="text-caption text-fg">
            Bản sao được giữ 30 ngày trong thư mục thùng rác của thư mục làm việc (không hiện ở màn «Thùng rác»), sau đó tự xoá hẳn.
          </li>
        </ul>
        {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
      </div>
    </ConfirmDestructive>
  );
}
