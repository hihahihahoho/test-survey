import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, ImageIcon, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { CheckerboardImage } from "@/components/common";
import { useProjectCover, usePatchProject, useRegenerateCover, useRevealProject } from "@/lib/hooks";
import { presentError } from "@/lib/api";
import { exportFileName } from "@/features/projects/lib/format";
import { errorDetail, toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { loadThumb } from "@/features/projects/lib/agent-blob";
import { InlineError, OfflineNotice } from "@/features/projects/dialogs/parts";
import type { Gate } from "@/features/projects/lib/gate";
import type { Project } from "@/lib/types";
import { CoverPicker } from "./CoverPicker";
import { TagField } from "./TagField";
import { formDefaults, patchFrom, projectSettingsSchema, type ProjectSettingsForm } from "./schema";

/**
 * KHỐI "THÔNG TIN" của S2b (§3-S2b wireframe khối 1) — react-hook-form + zod.
 *
 * NĂM CHỐT CỦA SPEC, thi công đúng:
 *  1. Nút [Lưu thay đổi] `disabled` khi form còn SẠCH (§3-S2b thành phần UI).
 *     `formState.isDirty` của RHF lo việc này — không tự đếm tay.
 *  2. `409 PROJECT_ID_TAKEN` ⇒ lỗi INLINE ngay tại ô slug + nút [Dùng gợi ý]
 *     lấy từ `details.suggestion` (§3-S2b bảng trạng thái, §3.9).
 *  3. Lưu thất bại ⇒ FORM KHÔNG MẤT DỮ LIỆU. RHF giữ nguyên values; ta chỉ thêm
 *     dải lỗi. Đây là điều §3-S2b nói thẳng: "form **không** mất dữ liệu".
 *  4. Đổi slug chỉ đổi TÊN FILE ZIP, KHÔNG đổi thư mục trên máy ⇒ ghi rõ ngay
 *     dưới ô, kèm ví dụ tên file thật để user thấy hệ quả trước khi lưu.
 *  5. Agent chưa chạy ⇒ dải vàng GIẢI THÍCH TRƯỚC + mọi control disabled (§2.5-2).
 *
 * `⌘S` do màn cha giữ (nó phải chặn "Lưu trang" của trình duyệt ở cấp window);
 * component này chỉ nhận `submitRef` để cha bấm đúng nút Lưu, không đoán bằng selector.
 */
export function InfoForm({
  project,
  gate,
  variantId,
  submitRef,
  onDirtyChange,
}: {
  project: Project;
  gate: Gate;
  /** Phong cách để picker ảnh bìa hỏi #42. */
  variantId: string | undefined;
  /** Cha gọi để lưu bằng ⌘S. */
  submitRef?: React.MutableRefObject<(() => void) | null>;
  /** Cha cần biết form có bẩn để cảnh báo khi rời màn. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const patch = usePatchProject(project.id);
  const reveal = useRevealProject(project.id);
  const coverState = useProjectCover(gate.readOnly ? null : project.id);
  const regenCover = useRegenerateCover(project.id);
  const [failure, setFailure] = React.useState<unknown>(null);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const base = React.useMemo(() => formDefaults(project), [project]);
  const form = useForm<ProjectSettingsForm>({
    resolver: zodResolver(projectSettingsSchema),
    defaultValues: base,
  });

  // Project được nạp lại (agent trở lại, hoặc tab khác vừa sửa): đồng bộ giá trị
  // gốc NHƯNG chỉ khi form còn sạch — ghi đè lúc user đang gõ là xoá công của họ.
  React.useEffect(() => {
    if (!form.formState.isDirty) form.reset(base);
  }, [base, form]);

  const dirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const submit = React.useCallback(
    (values: ProjectSettingsForm) => {
      setFailure(null);
      setSuggestion(null);
      const body = patchFrom(values, base);
      if (Object.keys(body).length === 0) {
        form.reset(values);
        return;
      }
      patch.mutate(body, {
        onSuccess: (updated) => {
          // reset về giá trị VỪA LƯU ⇒ nút Lưu về trạng thái sạch, không phải bấm hai lần.
          form.reset(formDefaults(updated));
          toastSuccess("Đã lưu");
        },
        onError: (err) => {
          const v = presentError(err);
          if (v.code === "PROJECT_ID_TAKEN") {
            const d = v.details as { suggestion?: string } | null;
            form.setError("slug", {
              type: "server",
              message: `${v.title}. ${v.explain}`,
            });
            setSuggestion(typeof d?.suggestion === "string" ? d.suggestion : null);
            form.setFocus("slug");
            return;
          }
          setFailure(err);
          toastError(err, { titleOverride: "Chưa lưu được" });
        },
      });
    },
    [base, form, patch],
  );

  React.useEffect(() => {
    if (!submitRef) return;
    submitRef.current = () => {
      if (!gate.readOnly && form.formState.isDirty) void form.handleSubmit(submit)();
    };
    return () => {
      submitRef.current = null;
    };
  }, [submitRef, form, submit, gate.readOnly]);

  const slugValue = form.watch("slug");
  const coverValue = form.watch("cover");
  const ro = gate.readOnly;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Thông tin</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-4"
          >
            {ro && <OfflineNotice text={gate.longReason} />}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên hiển thị</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={ro} autoComplete="off" className="max-w-xl" />
                  </FormControl>
                  <FormDescription>
                    Hiện trên thẻ ở trang chủ và trên breadcrumb. Đổi tên không di chuyển thư mục.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mô tả</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} disabled={ro} className="max-w-xl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tag</FormLabel>
                  <TagField
                    value={field.value}
                    onChange={(tags) => field.onChange(tags)}
                    disabled={ro}
                    disabledReason={ro ? gate.reason : undefined}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Ảnh bìa ─────────────────────────────────────────────── */}
            <FormItem>
              <FormLabel>Ảnh bìa</FormLabel>
              <div className="flex flex-wrap items-center gap-3">
                <CoverPreview projectId={project.id} cover={coverValue} offline={ro} />
                <div className="flex flex-col gap-1.5">
                  <p className="text-caption text-fg">
                    {coverValue === ""
                      ? "Tự động — lấy file đầu tiên trong kit đã cắt."
                      : coverValue}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={ro}
                      aria-disabled={ro || undefined}
                      title={ro ? gate.reason : undefined}
                      onClick={() => setPickerOpen(true)}
                    >
                      <ImageIcon aria-hidden />
                      Đổi ảnh bìa…
                    </Button>
                    {coverValue !== "" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={ro}
                        onClick={() => form.setValue("cover", "", { shouldDirty: true })}
                      >
                        Về tự động
                      </Button>
                    )}
                    {/* ẢNH BÌA TỰ VẼ — nút nhỏ, đứng đúng chỗ người dùng đang nghĩ về ảnh bìa
                        (không thêm khối mới, không thêm màn mới). Agent tự vẽ một lần sau lượt
                        gen đầu tiên; nút này là đường duy nhất để vẽ LẠI, vì mỗi lần vẽ đốt một
                        lượt quota image-gen — không ai muốn nó tự chạy sau mỗi lần sửa kit. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={regenCover.isPending || coverState.data?.status === "running"}
                      disabled={ro || regenCover.isPending || coverState.data?.status === "running"}
                      aria-disabled={ro || undefined}
                      title={ro ? gate.reason : "Vẽ ảnh bìa mới từ màu thương hiệu và mascot của dự án"}
                      onClick={() =>
                        regenCover.mutate(undefined, {
                          onSuccess: () =>
                            toastSuccess(
                              "Đang vẽ ảnh bìa mới",
                              "Mất khoảng một phút. Ảnh hiện lên thẻ khi xong — bạn cứ làm việc khác.",
                            ),
                          onError: (e) => toastError(e, { titleOverride: "Chưa vẽ được ảnh bìa" }),
                        })
                      }
                    >
                      <Sparkles aria-hidden />
                      {coverState.data?.status === "running" ? "Đang vẽ ảnh bìa…" : "Tạo lại ảnh bìa"}
                    </Button>
                  </div>
                </div>
              </div>
              <FormMessage />
            </FormItem>

            {/* ── Slug ────────────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên file khi xuất</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={ro}
                      autoComplete="off"
                      spellCheck={false}
                      className="max-w-sm font-mono"
                      onChange={(e) => {
                        setSuggestion(null);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    <span className="font-mono text-fg">
                      {exportFileName(slugValue.trim() || project.slug || project.id)}
                    </span>
                    {" — chỉ đổi tên file .zip khi xuất. "}
                    Thư mục trên máy vẫn là{" "}
                    <span className="font-mono text-fg">{project.id}</span>.
                  </FormDescription>
                  <FormMessage />
                  {suggestion !== null && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="w-fit"
                      onClick={() => {
                        form.clearErrors("slug");
                        form.setValue("slug", suggestion, { shouldDirty: true });
                        setSuggestion(null);
                      }}
                    >
                      {`Dùng «${suggestion}»`}
                    </Button>
                  )}
                </FormItem>
              )}
            />

            {/* ── Thư mục trên máy (chỉ đọc) ──────────────────────────── */}
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-2 border border-line-subtle bg-canvas p-3">
              <div className="min-w-0">
                <p className="text-caption text-fg-muted-raised">Thư mục trên máy</p>
                <p className="truncate font-mono text-label text-fg-strong">projects/{project.id}</p>
                <p className="text-caption text-fg-muted-raised">
                  Không đổi được — mọi ảnh, nhật ký và kit đều trỏ vào đường dẫn này.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={reveal.isPending}
                disabled={ro}
                aria-disabled={ro || undefined}
                title={ro ? gate.reason : undefined}
                onClick={() =>
                  reveal.mutate(undefined, {
                    onSuccess: () => toastSuccess("Đã mở thư mục project trên máy"),
                    onError: (e) => toastError(e),
                  })
                }
              >
                <FolderOpen aria-hidden />
                Mở thư mục
              </Button>
            </div>

            {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}

            <div className="flex items-center justify-end gap-3">
              {dirty && !ro && (
                <span role="status" className="text-caption text-on-tint-warn">
                  Có thay đổi chưa lưu
                </span>
              )}
              <Button
                type="submit"
                variant="primary"
                loading={patch.isPending}
                disabled={ro || !dirty}
                aria-disabled={ro || !dirty || undefined}
                title={ro ? gate.reason : !dirty ? "Chưa có thay đổi nào" : undefined}
              >
                <Save aria-hidden />
                Lưu thay đổi
              </Button>
            </div>
          </form>
        </Form>

        <CoverPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          projectId={project.id}
          variantId={variantId}
          current={coverValue}
          onPick={(relPath) => form.setValue("cover", relPath, { shouldDirty: true })}
        />
      </CardContent>
    </Card>
  );
}

/** Ô xem trước ảnh bìa 16:10. Agent tắt ⇒ khung "Ảnh trên máy bạn" (§2.5-3). */
function CoverPreview({
  projectId,
  cover,
  offline,
}: {
  projectId: string;
  cover: string;
  offline: boolean;
}) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setUrl(null);
    if (cover === "" || offline) return;
    let alive = true;
    loadThumb(projectId, cover).then(
      (u) => {
        if (alive) setUrl(u);
      },
      () => {
        /* khung thay thế của CheckerboardImage */
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, cover, offline]);

  return (
    <CheckerboardImage
      className="aspect-[16/10] w-32 shrink-0"
      alt={cover === "" ? "Chưa chọn ảnh bìa" : `Ảnh bìa: ${cover}`}
      {...(url ? { src: url } : {})}
      fallbackText={cover === "" ? "Tự động" : offline ? "Ảnh trên máy bạn" : "Chưa tải được"}
    />
  );
}
