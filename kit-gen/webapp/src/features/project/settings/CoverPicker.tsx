import * as React from "react";
import { ImageOff, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckerboardImage, EmptyState, ErrorState, LoadingState } from "@/components/common";
import { devDetails, presentError } from "@/lib/api";
import { useKit } from "@/lib/hooks";
import { loadThumb } from "@/features/projects/lib/agent-blob";
import type { KitFile } from "@/lib/types";

/**
 * CHỌN ẢNH BÌA (§3-S2b: `Ảnh bìa [▨ … ▾] (•) Tự chọn ( ) Tự động`).
 *
 * NGUỒN ẢNH LÀ DANH SÁCH FILE THẬT trong `kits/` (#42) — KHÔNG có ô nhập đường dẫn
 * tự do. Đây là chốt bảo mật, không phải lựa chọn UX: v1 nhận `path` từ client và
 * bị `refs/../gen.sh` xuyên qua (audit G1), nên §6.5 ghi "client không bao giờ gửi
 * path". User chỉ chọn được thứ agent đã liệt kê.
 *
 * `KIT_NOT_CUT` KHÔNG phải lỗi: nó nghĩa là "chưa cắt lần nào". Hiện `EmptyState`
 * nói việc tiếp theo, không phải khối đỏ.
 *
 * A11y: lưới là `role="radiogroup"`, mỗi ô là `<button role="radio">` — một tabstop,
 * mũi tên di chuyển (mẫu WAI-ARIA cho radiogroup), `aria-checked` cho lựa chọn.
 */
export function CoverPicker({
  open,
  onOpenChange,
  projectId,
  variantId,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  /** Phong cách để hỏi #42; `undefined` ⇒ agent tự lấy phong cách đầu. */
  variantId: string | undefined;
  /** Đường dẫn đang chọn ("" = Tự động). */
  current: string;
  onPick: (relPath: string) => void;
}) {
  const kit = useKit(open ? projectId : null, variantId);
  const [chosen, setChosen] = React.useState(current);
  const gridRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) setChosen(current);
  }, [open, current]);

  const files = (kit.data?.files ?? []).filter((f) => !f.empty).slice(0, 200);
  const kitError = kit.error != null ? presentError(kit.error) : null;
  const notCut = kitError?.code === "KIT_NOT_CUT";

  const move = (dir: 1 | -1) => {
    const idx = files.findIndex((f) => f.path === chosen);
    const next = Math.max(0, Math.min(files.length - 1, (idx < 0 ? 0 : idx) + dir));
    const f = files[next];
    if (!f) return;
    setChosen(f.path);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cover="${cssEscape(f.path)}"]`)?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Chọn ảnh bìa</DialogTitle>
          <DialogDescription>
            Ảnh bìa lấy từ các file đã cắt của project này. Bỏ chọn để dùng chế độ tự động.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {kit.isLoading ? (
            <LoadingState count={8} variant="cards" label="Đang đọc danh sách file kit…" />
          ) : notCut || files.length === 0 ? (
            <EmptyState
              icon={Images}
              title="Chưa có file kit nào để làm ảnh bìa"
              description="Sinh ảnh rồi cắt xong, các file PNG sẽ hiện ở đây để bạn chọn."
            />
          ) : kitError ? (
            <ErrorState
              variant="inline"
              title={kitError.title}
              description={kitError.explain}
              detail={devDetails(kit.error)}
              actions={
                <Button variant="secondary" size="sm" onClick={() => void kit.refetch()}>
                  Thử lại
                </Button>
              }
            />
          ) : (
            <>
              <p className="text-caption text-fg-muted-raised">
                {files.length} file trong kit đã cắt. Dùng mũi tên để di chuyển.
              </p>
              <div
                ref={gridRef}
                role="radiogroup"
                aria-label="Ảnh bìa của project"
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  }
                }}
                /* KHÔNG `max-h` + `overflow-y-auto` ở đây: lưới nằm trong `DialogBody`,
                   mà body đã là ổ cuộn của dialog. Hai tầng cuộn lồng nhau thì lăn
                   chuột trên lưới là dialog khựng — đúng lỗi đã sửa ở trang Mascot. */
                className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6"
              >
                {files.map((f, i) => (
                  <CoverOption
                    key={f.path}
                    projectId={projectId}
                    file={f}
                    checked={chosen === f.path}
                    tabbable={chosen === f.path || (chosen === "" && i === 0)}
                    onSelect={() => setChosen(f.path)}
                  />
                ))}
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onPick("");
              onOpenChange(false);
            }}
          >
            <ImageOff aria-hidden />
            Dùng chế độ tự động
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            disabled={chosen === "" || chosen === current}
            aria-disabled={chosen === "" || chosen === current || undefined}
            title={chosen === "" ? "Chọn một file trước" : undefined}
            onClick={() => {
              onPick(chosen);
              onOpenChange(false);
            }}
          >
            Dùng ảnh này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoverOption({
  projectId,
  file,
  checked,
  tabbable,
  onSelect,
}: {
  projectId: string;
  file: KitFile;
  checked: boolean;
  tabbable: boolean;
  onSelect: () => void;
}) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    loadThumb(projectId, file.path).then(
      (u) => {
        if (alive) setUrl(u);
      },
      () => {
        /* CheckerboardImage tự vẽ khung thay thế */
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, file.path]);

  return (
    <button
      type="button"
      role="radio"
      data-cover={file.path}
      aria-checked={checked}
      tabIndex={tabbable ? 0 : -1}
      onClick={onSelect}
      className={
        "flex flex-col gap-1 rounded-2 border p-1 text-left transition-colors duration-fast " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-raised " +
        (checked ? "border-2 border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle hover:border-line-strong")
      }
    >
      <CheckerboardImage
        className="aspect-square w-full"
        alt={`Element ${file.file}`}
        {...(url ? { src: url } : {})}
      />
      <span className="truncate text-caption text-fg" title={file.file}>
        {checked ? "✓ " : ""}
        {file.file}
      </span>
    </button>
  );
}

/** Thoát ký tự cho selector thuộc tính — `CSS.escape` không có trong mọi môi trường test. */
function cssEscape(v: string): string {
  return v.replace(/["\\]/g, "\\$&");
}
