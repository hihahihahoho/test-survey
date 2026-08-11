import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useCreateProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { presentError, errorDetail, toastSuccess } from "../lib/feedback";
import { duplicateNameWarning, slugify, validateSlug, variantId } from "../lib/slug";
import type { Gate } from "../lib/gate";
import { InlineError, OfflineNotice } from "./parts";
import { DuplicateNameWarning, FirstVariantFields, TagInput, TemplatePicker, type TemplateId } from "./CreateParts";
import { CreateModePicker } from "./CreateModePicker";
import { BriefIntakeSection } from "./BriefIntakeSection";
import { useBriefIntake } from "../lib/create-mode-brief-state";
import { CreateModePreview } from "./CreateModePreview";
import { CREATE_MODES, DEFAULT_MODE, createIntent, type CreateIntent } from "../lib/create-mode";

/**
 * §4.1 MODAL TẠO PROJECT.
 *
 * NĂM HÀNH VI BẮT BUỘC (§4.1-1..5), thi công đúng:
 *  1. Slug tự sinh từ tên CÓ DẤU ("Xuân 26" → "xuan-26"), có [Sửa], validate
 *     INLINE. Không bao giờ từ chối im lặng — đóng E2 (v1 `return` không nói gì
 *     khi regex slug trượt, user bấm Tạo mà không có gì xảy ra).
 *  2. Trùng tên hiển thị: CHO PHÉP. Chỉ cảnh báo vàng + gợi ý "(2)".
 *  3. 409 `PROJECT_ID_TAKEN` → lỗi INLINE ngay tại ô slug + nút [Dùng gợi ý].
 *  4. Tạo xong: `blank` → S3?tab=sheets · còn lại → S2 (điều hướng ở ProjectDialogs).
 *  5. Agent chưa chạy → nút Tạo disabled + dải vàng GIẢI THÍCH TRƯỚC khi bấm.
 *     (Yêu cầu 3 của brief: không phải bấm rồi mới lỗi.)
 *
 * FE-2·B1 THÊM: hai MODE làm việc (§1.2 UI-SPEC-V2). Ba điều không được quên:
 *  a. Mode **không** vào payload `POST /api/projects` — hợp đồng §6.2 #8 giữ nguyên.
 *     Nó chỉ quyết định FILE CON ĐẦU TIÊN, do B2 tạo qua `docsRepo` sau khi project
 *     thật đã tồn tại. `onCreated` vì vậy trả thêm `CreateIntent`.
 *  b. Mặc định `workflow` (§1.1-3) — đường đã qua QA. Canvas là lựa chọn có chủ ý.
 *  c. Mode và template là HAI câu hỏi khác nhau trong CÙNG một bước (§1.1-2:
 *     "không thêm bước"): mode = *làm việc kiểu gì*, template = *khởi tạo nội dung gì*.
 *
 * FE-2·B2 THÊM: khối «Đọc đầu bài của khách» (§1.3) — `BriefIntakeSection`. Brief chỉ
 * chảy ra ĐÚNG hai thứ và cả hai đều phải do người dùng bấm: tên dự án gợi ý và mode
 * gợi ý. Ranh giới đầy đủ + lý do nằm ở `lib/create-mode-brief.ts` đầu file.
 *
 * `from-project` và `import` KHÔNG gọi API ở đây — chúng chuyển sang luồng riêng
 * (§4.1 bảng template), và nhãn nút chính đổi theo để user biết còn một bước nữa.
 */
const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên dự án để dễ tìm lại sau này.").max(120, "Tên tối đa 120 ký tự."),
  slug: z.string(),
  template: z.enum(["basic", "blank", "from-project", "import"]),
  mode: z.enum(CREATE_MODES),
  variantVi: z.string().trim().min(1, "Đặt tên cho phong cách đầu tiên."),
  bg: z.enum(["magenta", "green"]),
});
type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  name: "",
  slug: "",
  template: "basic",
  mode: DEFAULT_MODE,
  variantVi: "Phong cách 1",
  bg: "magenta",
};

/** @deprecated FE3-PLAN §3-E1: màn cũ chỉ còn qua mục Nâng cao hoặc deep link. */
export function CreateProjectDialog({
  open,
  onOpenChange,
  existing,
  gate,
  onCreated,
  onNeedDuplicate,
  onNeedImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: readonly Project[];
  gate: Gate;
  /** `intent` mang mode + kế hoạch file con đầu tiên cho B2/E1 (§1.2). */
  onCreated: (project: Project, template: TemplateId, intent: CreateIntent) => void;
  onNeedDuplicate: () => void;
  onNeedImport: (preset: { name: string; tags: string[] }) => void;
}) {
  const create = useCreateProject();
  const [tags, setTags] = React.useState<string[]>([]);
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [showSlug, setShowSlug] = React.useState(false);
  const [failure, setFailure] = React.useState<unknown>(null);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  const brief = useBriefIntake();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  React.useEffect(() => {
    if (!open) return;
    form.reset(DEFAULTS);
    setTags([]);
    setSlugEdited(false);
    setShowSlug(false);
    setFailure(null);
    setSuggestion(null);
    brief.reset();
    // `brief.reset` ổn định (useCallback không phụ thuộc state) nên không cần vào deps;
    // đưa vào sẽ chạy lại effect mỗi lần đọc brief và xoá đúng thứ vừa đọc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  const name = form.watch("name");
  const slug = form.watch("slug");
  const template = form.watch("template");
  const mode = form.watch("mode");

  // Slug bám theo tên cho tới khi user tự sửa — sửa rồi thì tôn trọng lựa chọn của họ.
  React.useEffect(() => {
    if (!slugEdited) form.setValue("slug", slugify(name));
  }, [name, slugEdited, form]);

  const dup = React.useMemo(() => duplicateNameWarning(name, existing), [name, existing]);
  const slugError = slugEdited ? validateSlug(slug) : null;

  const submitLabel =
    template === "import" ? "Tiếp: chọn nguồn nhập →"
    : template === "from-project" ? "Tiếp: chọn dự án nguồn →"
    : "Tạo dự án";

  const onSubmit = async (v: FormValues) => {
    setFailure(null);
    setSuggestion(null);

    if (v.template === "import") {
      onOpenChange(false);
      onNeedImport({ name: v.name.trim(), tags });
      return;
    }
    if (v.template === "from-project") {
      onOpenChange(false);
      onNeedDuplicate();
      return;
    }
    if (slugEdited) {
      const err = validateSlug(v.slug);
      if (err) {
        setShowSlug(true);
        form.setError("slug", { message: err });
        return;
      }
    }

    try {
      const res = await create.mutateAsync({
        name: v.name.trim(),
        template: v.template,
        firstVariant: { id: variantId(v.variantVi), vi: v.variantVi.trim(), bg: v.bg },
        tags,
        ...(slugEdited ? { slug: v.slug } : {}),
      });
      onOpenChange(false);
      toastSuccess(
        `Đã tạo «${res.project.name}»`,
        res.warnings.length > 0 ? `${res.warnings.length} ghi chú khi khởi tạo` : undefined,
      );
      onCreated(res.project, v.template, createIntent(v.template, v.mode));
    } catch (e) {
      // §5.5: lỗi hiện INLINE trong modal, toast không được là nơi duy nhất.
      setFailure(e);
      const p = presentError(e);
      if (p.code === "PROJECT_ID_TAKEN" || p.code === "INVALID_SLUG") {
        setShowSlug(true);
        setSlugEdited(true);
        const sug = (p.details as { suggestion?: string } | null)?.suggestion ?? null;
        setSuggestion(sug);
        form.setError("slug", { message: sug ? `${p.title}. Gợi ý: ${sug}` : p.explain });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={create.isPending ? () => {} : onOpenChange}>
      <DialogContent
        size="lg"
        onEscapeKeyDown={(e) => create.isPending && e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Tạo dự án</DialogTitle>
          <DialogDescription>Dự án là thư mục làm việc; các bộ kit được quản lý bên trong.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <DialogBody>
              {/* §1.4 loading: field bị KHOÁ nhưng dialog KHÔNG đóng. `fieldset` khoá
                  một lượt toàn bộ input/nút phụ mà không phải nhớ `disabled` ở 9 chỗ. */}
              <fieldset
                disabled={create.isPending}
                className="flex flex-col gap-5 border-0 p-0"
              >
              {gate.readOnly && (
                <OfflineNotice text={`${gate.longReason} Cần công cụ local để tạo thư mục project trên máy bạn.`} />
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên dự án</FormLabel>
                    <FormControl>
                      <Input placeholder="Tết 2026 — VietinBank iPay" autoFocus maxLength={120} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="-mt-2 flex flex-wrap items-center gap-2">
                <p className="text-caption text-fg-muted-raised">
                  {slug === "" ? (
                    "Thư mục sẽ được đặt tên sau khi bạn gõ tên dự án."
                  ) : (
                    <>
                      Thư mục sẽ là <span className="font-mono text-fg">projects/{slug}-xxxx</span>
                    </>
                  )}
                </p>
                {!showSlug && (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setShowSlug(true)}>
                    Sửa
                  </Button>
                )}
              </div>

              {showSlug && (
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tên thư mục</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onChange={(e) => {
                            setSlugEdited(true);
                            field.onChange(e);
                          }}
                          spellCheck={false}
                          autoComplete="off"
                          aria-invalid={Boolean(slugError) || undefined}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormDescription>
                        Công cụ local thêm 4 ký tự ngẫu nhiên để không bao giờ trùng thư mục.
                      </FormDescription>
                      {slugError && (
                        <p role="alert" className="text-caption text-danger">
                          {slugError}
                        </p>
                      )}
                      <FormMessage />
                      {suggestion && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          onClick={() => {
                            form.setValue("slug", suggestion);
                            form.clearErrors("slug");
                            setSuggestion(null);
                          }}
                        >
                          Dùng «{suggestion}»
                        </Button>
                      )}
                    </FormItem>
                  )}
                />
              )}

              {dup && (
                <DuplicateNameWarning
                  warn={dup.warn}
                  suggestion={dup.suggestion}
                  onUse={() => form.setValue("name", dup.suggestion, { shouldValidate: true })}
                />
              )}

              {/* §1.2 — CÂU HỎI MODE. Đặt TRƯỚC template vì nó quyết định màn mở ra
                  sau khi tạo; template chỉ quyết định nội dung khởi tạo bên trong. */}
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    {/* Không dùng `<FormLabel>`: nó sinh `<label for>` trỏ vào một `div`
                        radiogroup — screen reader bỏ qua. Dùng tiêu đề thật + `aria-labelledby`. */}
                    <p id="mode-legend" className="text-label text-fg-strong">
                      Bắt đầu bằng
                    </p>
                    {/* `disabled` truyền THẲNG chứ không chỉ dựa vào `fieldset[disabled]`:
                        Radix render radio bằng `<button>`, và ta cần thuộc tính `disabled`
                        hiện diện thật để cả AT lẫn test đọc được trạng thái khoá. */}
                    <CreateModePicker
                      value={field.value}
                      onChange={field.onChange}
                      disabled={create.isPending}
                      labelledBy="mode-legend"
                    />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nội dung khởi tạo</FormLabel>
                    <FormControl>
                      <TemplatePicker value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {(template === "basic" || template === "blank") && <FirstVariantFields control={form.control} />}

              <TagInput tags={tags} onChange={setTags} />

              {/* §1.3 — khối phụ, TẮT mặc định. Đọc đầu bài chỉ gợi ý tên + mode. */}
              <BriefIntakeSection
                state={brief}
                mode={mode}
                disabled={create.isPending}
                onUseName={(v) => form.setValue("name", v, { shouldValidate: true })}
                onUseMode={(m) => form.setValue("mode", m)}
              />

              <CreateModePreview template={template} mode={mode} />

              {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
              </fieldset>
            </DialogBody>

            <DialogFooter className="border-t border-line-subtle">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                Huỷ
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={create.isPending}
                disabled={gate.readOnly}
                aria-disabled={gate.readOnly || undefined}
                title={gate.readOnly ? gate.reason : undefined}
              >
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
