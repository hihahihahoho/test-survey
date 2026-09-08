import * as React from "react";
import { ImagePlus, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { foldVi } from "@/features/kit-core/lib/element-lib/source";
import {
  useAddLibraryItem, useLibraryImage, usePatchLibraryItem, useRemoveLibraryItem, useUserLibrary,
} from "@/lib/hooks";
import type { LibraryItem } from "@/lib/types";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

/**
 * ReferencesScreen — «Ảnh phong cách», thư viện ẢNH duy nhất còn lại ngoài thương hiệu.
 *
 * ╔══ VÌ SAO FILE NÀY RA ĐỜI (09/2026) ══════════════════════════════════════╗
 * ║ Ba màn thư viện từng ở chung `LibraryScreen.tsx` vì chúng dùng chung một  ║
 * ║ hộp thoại tải ảnh. Hai trong ba — «Bộ khung UI» và «Mascot» — bị gỡ ở     ║
 * ║ lượt này: chủ sản phẩm nói thẳng *"giờ mô tả bằng prompt hết rồi"*, và    ║
 * ║ đo lại thì đúng vậy — không màn prompt-first nào đọc ảnh thư viện loại    ║
 * ║ `ui`/`mascot` nữa. Cái còn lại tự đứng một mình, nên nó ở một file mang   ║
 * ║ đúng tên nó thay vì trong một file «thư viện» chung chỉ còn một cư dân.   ║
 * ║                                                                          ║
 * ║ ⚠️ Ở PHÍA AGENT, hai loại ấy VẪN SỐNG: dữ liệu cũ của người dùng nằm đó,  ║
 * ║ và ảnh thương hiệu/mascot của một thương hiệu (`/brands`) đi qua chính    ║
 * ║ những endpoint đó. Lượt này gỡ MÀN, không gỡ kho.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/** Hộp thoại thêm ảnh — nhiều ảnh một lượt, tên lấy từ tên tệp. */
function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const add = useAddLibraryItem();
  const [files, setFiles] = React.useState<File[]>([]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setFiles([]);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Thêm ảnh phong cách</DialogTitle>
          <DialogDescription>Chọn nhiều ảnh PNG, JPG hoặc WebP.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ImageDropzone
            multiple
            label="Kéo các ảnh vào đây"
            description="PNG, JPG hoặc WebP · xem trước trước khi thêm"
            onFiles={(picked) => setFiles(Array.from(picked))}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => close(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!files.length || add.isPending}
            onClick={() => { void (async () => {
              try {
                for (const file of files) {
                  await add.mutateAsync({
                    file, kind: "reference", group: "style",
                    name: file.name.replace(/\.[^.]+$/, ""),
                  });
                }
                toast.success(`Đã thêm ${files.length} ảnh vào thư viện`);
                close(false);
              } catch { toast.error("Chưa thêm được ảnh"); }
            })(); }}
          >
            {add.isPending ? "Đang thêm…" : "Thêm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Đổi tên một ảnh. Ảnh phong cách chỉ có MỘT thứ sửa được, nên hộp thoại chỉ có một ô. */
function RenameDialog({ item, open, onOpenChange }: { item: LibraryItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const patch = usePatchLibraryItem();
  const [name, setName] = React.useState(item.name);

  React.useEffect(() => {
    if (open) setName(item.name);
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Đổi tên</DialogTitle>
          <DialogDescription>Tên này dùng khi chọn ảnh trong dự án.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-library-name-${item.id}`}>Tên</Label>
            <Input id={`edit-library-name-${item.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!name.trim() || patch.isPending}
            onClick={() => patch.mutate({ id: item.id, name: name.trim() }, {
              onSuccess: () => {
                toast.success("Đã lưu thay đổi");
                onOpenChange(false);
              },
              onError: () => toast.error("Chưa lưu được thay đổi"),
            })}
          >
            {patch.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({ item }: { item: LibraryItem }) {
  const image = useLibraryImage(item.id);
  const remove = useRemoveLibraryItem();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  return (
    <>
      <article className="group rounded-3 border border-line-subtle bg-surface p-3">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2 border border-line-subtle bg-raised p-3">
          {image ? <img src={image} alt="" className="size-full object-contain" /> : <ImagePlus className="size-6 text-fg-muted" aria-hidden />}
        </div>
        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-label text-fg-strong">{item.name}</h2>
            <p className="truncate text-caption text-fg-muted">Ảnh của bạn</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-1 p-1.5 text-fg-muted hover:bg-raised hover:text-fg-strong" aria-label={`Tuỳ chọn ${item.name}`}>
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil aria-hidden />Đổi tên</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}><Trash2 aria-hidden />Xoá</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá “{item.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Ảnh này sẽ bị xoá khỏi thư viện dùng chung.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(item.id, { onSuccess: () => toast.success("Đã xoá ảnh") })}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RenameDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

export function ReferencesLibraryScreen() {
  const library = useUserLibrary();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const q = foldVi(query);
  /* Ba `group` cùng một màn: ảnh người dùng tự thêm ở đây («style») và ảnh đi theo
     một thương hiệu ở `/brands` («brand-style», «brand-logo»). Chúng cùng là ảnh
     tham chiếu nên cùng chỗ tra cứu — thêm mới thì luôn vào «style». */
  const items = (library.data?.items ?? []).filter(
    (item) => item.kind === "reference"
      && ["style", "brand-style", "brand-logo"].includes(item.group)
      && (!q || foldVi(`${item.name} ${item.description}`).includes(q)),
  );

  return (
    <HomeWorkspaceShell
      active="references"
      title="Ảnh phong cách"
      action={<Button size="sm" onClick={() => setUploadOpen(true)}><Plus aria-hidden />Thêm ảnh</Button>}
    >
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          type="search"
          aria-label="Tìm ảnh phong cách"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm ảnh phong cách…"
          className="pl-9"
        />
      </div>
      {items.length ? (
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => <AssetCard key={item.id} item={item} />)}
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40"
        >
          <ImagePlus className="size-7 text-fg-muted" />
          <span className="mt-3 text-label text-fg-strong">Thêm ảnh phong cách đầu tiên</span>
        </button>
      )}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </HomeWorkspaceShell>
  );
}
