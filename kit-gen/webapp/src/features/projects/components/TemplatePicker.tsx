import * as React from "react";
import { FilePlus2, LayoutTemplate, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Template } from "@/lib/types";
import { loadTemplateCover } from "../lib/agent-blob";
import { templateCaption } from "../lib/templates";

/**
 * «BẮT ĐẦU TỪ» — chọn nguồn cho dự án mới trong hộp Tạo dự án: «Dự án trống» hoặc
 * một template người dùng đã lưu (nút «Lưu làm template» ở màn soạn / menu thẻ).
 *
 * A11y: `role="radiogroup"`, mỗi lựa chọn là `<button role="radio">` — MỘT tabstop cho
 * cả nhóm (lựa chọn đang chọn), mũi tên lên/xuống vừa di chuyển vừa chọn (mẫu WAI-ARIA
 * của radiogroup, cùng cách `CoverPicker` đã làm). Nút xoá của từng dòng là nút
 * THƯỜNG nằm CẠNH radio chứ không lồng trong nó: nút trong nút là HTML sai, và trình
 * đọc màn hình sẽ đọc gộp tên template với chữ «Xoá».
 *
 * XOÁ HAI CHẠM, không `confirm()` của trình duyệt: chạm đầu biến nút thành «Xoá thật?»,
 * chạm hai mới xoá. Rời nút (blur) hoặc đợi 4 giây là thôi. Một cú trượt tay trong
 * danh sách chọn không được ném đi một template người ta dựng cả buổi.
 *
 * KHÔNG `max-h` + cuộn riêng: danh sách nằm trong `DialogBody`, vốn đã là ổ cuộn của
 * dialog — hai tầng cuộn lồng nhau là lăn chuột bị khựng (xem `CoverPicker`).
 */
export function TemplatePicker({
  templates,
  loading,
  failed,
  value,
  onChange,
  onDelete,
  deletingId,
  disabled,
}: {
  templates: readonly Template[];
  loading: boolean;
  /** Tải danh sách hỏng (KHÔNG phải agent đời cũ — ca đó đã là danh sách rỗng). */
  failed: boolean;
  /** Id template đang chọn; `null` = «Dự án trống». */
  value: string | null;
  onChange: (id: string | null) => void;
  onDelete: (template: Template) => void;
  deletingId: string | null;
  disabled?: boolean;
}) {
  const groupRef = React.useRef<HTMLDivElement>(null);
  const ids = React.useMemo<(string | null)[]>(() => [null, ...templates.map((t) => t.id)], [templates]);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!confirmId) return;
    const t = setTimeout(() => setConfirmId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmId]);

  const move = (dir: 1 | -1 | "first" | "last") => {
    const idx = Math.max(0, ids.indexOf(value));
    const next = dir === "first" ? 0 : dir === "last" ? ids.length - 1 : (idx + dir + ids.length) % ids.length;
    const id = ids[next] ?? null;
    onChange(id);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-source="${id ?? ""}"]`)?.focus();
  };

  const empty = !loading && !failed && templates.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <span id="create-source-label" className="text-label text-fg-strong">Bắt đầu từ</span>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby="create-source-label"
        aria-disabled={disabled || undefined}
        className="flex flex-col gap-1.5"
        onKeyDown={(e) => {
          if (disabled || !(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "radio") return;
          const key = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: "first", End: "last" } as const;
          const dir = key[e.key as keyof typeof key];
          if (dir === undefined) return;
          e.preventDefault();
          move(dir);
        }}
      >
        <SourceRow
          source=""
          checked={value === null}
          disabled={disabled}
          onSelect={() => onChange(null)}
          thumb={<ThumbBox><FilePlus2 aria-hidden className="size-5 text-fg-muted" /></ThumbBox>}
          title="Dự án trống"
          caption="Bắt đầu từ trang trắng"
        />
        {templates.map((t) => {
          const confirming = confirmId === t.id;
          // kg-allow-jargon: «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt («save template»), không phải chữ kỹ thuật lọt ra.
          const deleteLabel = confirming ? `Xác nhận xoá template ${t.name}` : `Xoá template ${t.name}`;
          // kg-allow-jargon: tên tính năng «template», như trên.
          const deleteHint = confirming ? "Bấm lần nữa để xoá" : "Xoá template";
          return (
            <SourceRow
              key={t.id}
              source={t.id}
              checked={value === t.id}
              disabled={disabled || deletingId === t.id}
              onSelect={() => onChange(t.id)}
              thumb={<TemplateThumb template={t} />}
              title={t.name}
              caption={templateCaption(t)}
              trailing={
                <button
                  type="button"
                  disabled={disabled || deletingId === t.id}
                  aria-label={deleteLabel}
                  title={deleteHint}
                  onBlur={() => setConfirmId((c) => (c === t.id ? null : c))}
                  onClick={() => {
                    if (confirming) {
                      setConfirmId(null);
                      onDelete(t);
                    } else {
                      setConfirmId(t.id);
                    }
                  }}
                  className={cn(
                    "inline-flex h-ctl-sm shrink-0 items-center gap-1 rounded-1 px-2 text-label transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                    /* Khoá = màu TRUNG TÍNH ĐẶC, không `opacity-*`: chữ nhoè theo nền là rớt
                       tương phản (scripts/check-contrast.mjs ③, cùng luật với `button.tsx`). */
                    "disabled:cursor-not-allowed disabled:bg-transparent disabled:text-fg-muted",
                    confirming
                      ? "bg-danger-solid text-fg-on-danger hover:bg-danger-solid/90"
                      : "text-fg-muted hover:bg-raised hover:text-danger",
                  )}
                >
                  <Trash2 aria-hidden className="size-4" />
                  {confirming && <span>Xoá thật?</span>}
                </button>
              }
            />
          );
        })}
      </div>
      {loading && <p className="text-caption text-fg-muted">Đang tải template…</p>}
      {failed && <p className="text-caption text-fg-muted">Chưa tải được danh sách template — vẫn tạo được dự án trống.</p>}
      {empty && (
        <p className="text-caption text-fg-muted">
          Mở một dự án và bấm «Lưu làm template» để dùng lại nó ở đây.
        </p>
      )}
    </div>
  );
}

function SourceRow({
  source, checked, disabled, onSelect, thumb, title, caption, trailing,
}: {
  source: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  thumb: React.ReactNode;
  title: string;
  caption: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-3 border p-1.5 pr-2 transition-colors",
        checked ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle hover:bg-raised",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        data-source={source}
        tabIndex={checked ? 0 : -1}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-3 rounded-2 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          "disabled:cursor-not-allowed",
        )}
      >
        {thumb}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-label text-fg-strong group-disabled:text-fg-muted">{title}</span>
          <span className="block truncate text-caption text-fg-muted">{caption}</span>
        </span>
      </button>
      {trailing}
    </div>
  );
}

function ThumbBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2 border border-line-subtle bg-raised">
      {children}
    </span>
  );
}

/** Ảnh bìa 48px của template (`?w=128` cho màn retina). Không bìa / tải hỏng ⇒ ô giữ chỗ. */
function TemplateThumb({ template }: { template: Template }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!template.hasCover) return;
    let alive = true;
    loadTemplateCover(template.id, template.createdAt ?? "")
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [template.id, template.createdAt, template.hasCover]);
  return (
    <ThumbBox>
      {url
        ? <img src={url} alt="" className="size-full object-cover" />
        : <LayoutTemplate aria-hidden className="size-5 text-fg-muted" />}
    </ThumbBox>
  );
}
