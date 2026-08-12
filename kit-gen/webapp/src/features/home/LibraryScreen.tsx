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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Silhouette } from "@/features/design/preview";
import { fromAgentLib, loadBundledV2, foldVi } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import {
  useAddLibraryItem, useElementLib, useLibraryImage, usePatchLibrarySettings,
  usePatchLibraryItem, useRemoveLibraryItem, useUserLibrary,
} from "@/lib/hooks";
import type { LibraryItem, LibrarySettings } from "@/lib/types";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

type UiGroup = "background" | "popup" | "small";
type ReferenceGroup = "style" | "mascot-reference";

const GROUPS: ReadonlyArray<{ id: UiGroup; label: string; max: number }> = [
  { id: "background", label: "Nền", max: 2 },
  { id: "popup", label: "Popup", max: 4 },
  { id: "small", label: "UI nhỏ & đạo cụ", max: 16 },
];

type SafeZonePreset = "button" | "wide" | "square" | "circle" | "full";

const SAFE_ZONE_PRESETS: ReadonlyArray<{
  id: SafeZonePreset;
  label: string;
  cell: "landscape" | "full";
  skel: Record<string, unknown>;
}> = [
  { id: "button", label: "Nút ngang", cell: "landscape", skel: { shape: "pill", w: 0.78, h: 0.5, slice9: true } },
  { id: "wide", label: "Khung ngang", cell: "landscape", skel: { shape: "rrect", w: 0.82, h: 0.62, slice9: true } },
  { id: "square", label: "Khung vuông", cell: "landscape", skel: { shape: "rrect", w: 0.55, h: 0.82, slice9: true } },
  { id: "circle", label: "Hình tròn", cell: "landscape", skel: { shape: "circle", w: 0.45, h: 0.68 } },
  { id: "full", label: "Toàn màn hình", cell: "full", skel: { shape: "full", w: 1, h: 1 } },
];

function initialPreset(group: string): SafeZonePreset {
  if (group === "background") return "full";
  if (group === "popup") return "wide";
  return "button";
}

function presetFor(item: LibraryItem): SafeZonePreset {
  if (item.cell === "full" || item.skel?.shape === "full") return "full";
  if (item.skel?.shape === "circle") return "circle";
  if (item.skel?.shape === "pill" || item.skel?.shape === "bar") return "button";
  if ((item.skel?.h ?? 0) > (item.skel?.w ?? 1)) return "square";
  return "wide";
}

function groupOf(element: LibElement): UiGroup {
  const key = `${element.file} ${element.group ?? ""}`;
  if (/bg-|background/.test(key)) return "background";
  if (/popup|modal|panel|ribbon/.test(key)) return "popup";
  return "small";
}

function Tabs<T extends string>({ items, value, onChange }: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          className={`rounded-2 border px-3 py-2 text-label transition-colors ${value === item.id ? "border-accent bg-accent/[var(--kg-tint-a)] text-fg-strong" : "border-line-subtle text-fg hover:bg-raised"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MaxPerSheet({ setting, fallback }: { setting: keyof LibrarySettings; fallback: number }) {
  const library = useUserLibrary();
  const patch = usePatchLibrarySettings();
  const stored = library.data?.settings[setting] ?? fallback;
  const [value, setValue] = React.useState(stored);
  React.useEffect(() => setValue(stored), [stored]);
  return (
    <label className="flex items-center gap-2">
      Mỗi sheet
      <Input
        type="number"
        min={1}
        max={32}
        value={value}
        onChange={(event) => setValue(Math.max(1, Math.min(32, Number(event.target.value) || 1)))}
        onBlur={() => {
          if (value !== stored) patch.mutate({ [setting]: value });
        }}
        className="h-8 w-16 text-center"
        aria-label="Tối đa trên một sheet"
      />
    </label>
  );
}

function UploadDialog({ open, onOpenChange, kind, group, title }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "ui" | "mascot" | "reference";
  group: UiGroup | "mascot" | ReferenceGroup;
  title: string;
}) {
  const add = useAddLibraryItem();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [preset, setPreset] = React.useState<SafeZonePreset>(() => initialPreset(group));

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setName("");
      setDescription("");
      setFiles([]);
      setPreset(initialPreset(group));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{kind === "reference" ? "Chọn nhiều ảnh PNG, JPG hoặc WebP." : "Chọn ảnh PNG, JPG hoặc WebP."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`library-name-${group}`}>Tên</Label>
            <Input id={`library-name-${group}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Popup phần thưởng" autoFocus />
          </div>
          <ImageDropzone multiple={kind === "reference"} label={kind === "reference" ? "Kéo các ảnh vào đây" : "Kéo ảnh vào đây"} description="PNG, JPG hoặc WebP · xem trước trước khi thêm" onFiles={(picked) => setFiles(Array.from(picked))} />
          {kind === "ui" && (
            <>
              <div className="space-y-2">
                <Label htmlFor={`library-description-${group}`}>Mô tả</Label>
                <Textarea id={`library-description-${group}`} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Bề mặt, vai trò và chi tiết cần giữ khi tạo ảnh" />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`library-safe-zone-${group}`}>Vùng an toàn</Label>
                <Select value={preset} onValueChange={(value) => setPreset(value as SafeZonePreset)}>
                  <SelectTrigger id={`library-safe-zone-${group}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{SAFE_ZONE_PRESETS.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => close(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!files.length || (kind !== "reference" && !name.trim()) || add.isPending}
            onClick={() => { void (async () => {
              const geometry = SAFE_ZONE_PRESETS.find((item) => item.id === preset)!;
              try {
                for (const file of files) await add.mutateAsync({ file, kind, group, name: kind === "reference" ? file.name.replace(/\.[^.]+$/, "") : name.trim(), ...(kind === "ui" ? { description: description.trim(), cell: geometry.cell, skel: geometry.skel } : {}) });
                toast.success(`Đã thêm ${files.length} ảnh vào thư viện`); close(false);
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

function EditAssetDialog({ item, open, onOpenChange }: { item: LibraryItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const patch = usePatchLibraryItem();
  const [name, setName] = React.useState(item.name);
  const [description, setDescription] = React.useState(item.description);
  const [poses, setPoses] = React.useState(item.poses.join("\n"));
  const [preset, setPreset] = React.useState<SafeZonePreset>(() => presetFor(item));

  React.useEffect(() => {
    if (!open) return;
    setName(item.name);
    setDescription(item.description);
    setPoses(item.poses.join("\n"));
    setPreset(presetFor(item));
  }, [item, open]);

  const poseList = poses
    .split("\n")
    .map((pose) => pose.trim())
    .filter((pose, index, all) => pose && all.indexOf(pose) === index)
    .slice(0, 32);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{item.kind === "mascot" ? "Sửa bộ khung mascot" : "Đổi tên"}</DialogTitle>
          <DialogDescription>{item.kind === "mascot" ? "Mỗi dòng là một dáng của mascot." : "Tên này dùng khi chọn ảnh trong dự án."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-library-name-${item.id}`}>Tên</Label>
            <Input id={`edit-library-name-${item.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          {item.kind === "mascot" && (
            <div className="space-y-2">
              <Label htmlFor={`edit-library-poses-${item.id}`}>Dáng</Label>
              <Textarea
                id={`edit-library-poses-${item.id}`}
                value={poses}
                onChange={(event) => setPoses(event.target.value)}
                rows={6}
                placeholder={"Đứng yên\nVui\nĂn mừng"}
              />
              <p className="text-caption text-fg-muted">{poseList.length} dáng · tối đa 32</p>
            </div>
          )}
          {item.kind === "ui" && (
            <>
              <div className="space-y-2">
                <Label htmlFor={`edit-library-description-${item.id}`}>Mô tả</Label>
                <Textarea id={`edit-library-description-${item.id}`} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`edit-library-safe-zone-${item.id}`}>Vùng an toàn</Label>
                <Select value={preset} onValueChange={(value) => setPreset(value as SafeZonePreset)}>
                  <SelectTrigger id={`edit-library-safe-zone-${item.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{SAFE_ZONE_PRESETS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            type="button"
            disabled={!name.trim() || patch.isPending}
            onClick={() => {
              const geometry = SAFE_ZONE_PRESETS.find((option) => option.id === preset)!;
              patch.mutate({
                id: item.id,
                name: name.trim(),
                ...(item.kind === "mascot" ? { poses: poseList } : {}),
                ...(item.kind === "ui" ? { description: description.trim(), cell: geometry.cell, skel: geometry.skel } : {}),
              }, {
              onSuccess: () => {
                toast.success("Đã lưu thay đổi");
                onOpenChange(false);
              },
              onError: () => toast.error("Chưa lưu được thay đổi"),
              });
            }}
          >
            {patch.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserAssetCard({ item }: { item: LibraryItem }) {
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
            <p className="truncate text-caption text-fg-muted">{item.kind === "mascot" ? `${item.poses.length} dáng` : "Ảnh của bạn"}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="rounded-1 p-1.5 text-fg-muted hover:bg-raised hover:text-fg-strong" aria-label={`Tuỳ chọn ${item.name}`}>
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil aria-hidden />{item.kind === "mascot" ? "Sửa mascot" : item.kind === "ui" ? "Sửa bộ khung" : "Đổi tên"}</DropdownMenuItem>
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
      <EditAssetDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

export function UiLibraryScreen() {
  const catalogue = useElementLib();
  const userLibrary = useUserLibrary();
  const elements = React.useMemo(() => {
    const agent = catalogue.data ? fromAgentLib(catalogue.data).elements : [];
    return agent.length ? agent : loadBundledV2().elements;
  }, [catalogue.data]);
  const [group, setGroup] = React.useState<UiGroup>("background");
  const [query, setQuery] = React.useState("");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const q = foldVi(query);
  const builtIn = elements.filter((element) => groupOf(element) === group && (!q || foldVi(`${element.vi} ${element.file}`).includes(q)));
  const custom = (userLibrary.data?.items ?? []).filter((item) => item.kind === "ui" && item.group === group && (!q || foldVi(item.name).includes(q)));
  const current = GROUPS.find((item) => item.id === group)!;

  return (
    <HomeWorkspaceShell active="ui-library" title="Bộ khung UI" action={<Button size="sm" onClick={() => setUploadOpen(true)}><Plus aria-hidden />Thêm bộ khung</Button>}>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs items={GROUPS} value={group} onChange={setGroup} />
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bộ khung…" className="h-9 pl-9" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-caption text-fg-muted">
        <span>{custom.length + builtIn.length} bộ khung</span>
        <MaxPerSheet setting={group} fallback={current.max} />
      </div>
      <section aria-label={current.label} className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {custom.map((item) => <UserAssetCard key={item.id} item={item} />)}
        {builtIn.map((element) => (
          <article key={element.file} className="rounded-3 border border-line-subtle bg-surface p-3">
            <div className="flex aspect-[4/3] items-center justify-center rounded-2 border border-line-subtle bg-raised p-4">
              <Silhouette skel={element.skel} orient={element.cell === "portrait" ? "portrait" : "landscape"} uid={`lib-${element.file}`} />
            </div>
            <div className="mt-3 min-w-0">
              <h2 className="truncate text-label text-fg-strong">{element.vi || element.file}</h2>
              <p className="truncate text-caption text-fg-muted">Có sẵn</p>
            </div>
          </article>
        ))}
      </section>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} kind="ui" group={group} title={`Thêm ${current.label.toLowerCase()}`} />
    </HomeWorkspaceShell>
  );
}

export function MascotLibraryScreen() {
  const library = useUserLibrary();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const items = (library.data?.items ?? []).filter((item) => item.kind === "mascot");
  return (
    <HomeWorkspaceShell active="mascot-library" title="Mascot pose" action={<Button size="sm" onClick={() => setUploadOpen(true)}><Plus aria-hidden />Thêm mascot</Button>}>
      <div className="flex items-center justify-between border-b border-line-subtle pb-4 text-caption text-fg-muted">
        <span>{items.length} bộ khung</span>
        <MaxPerSheet setting="mascot" fallback={4} />
      </div>
      {items.length ? (
        <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{items.map((item) => <UserAssetCard key={item.id} item={item} />)}</section>
      ) : (
        <button type="button" onClick={() => setUploadOpen(true)} className="mt-6 flex min-h-[320px] w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40 text-center hover:border-line-strong">
          <ImagePlus className="size-7 text-fg-muted" aria-hidden />
          <span className="mt-3 text-label text-fg-strong">Thêm bộ khung mascot đầu tiên</span>
        </button>
      )}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} kind="mascot" group="mascot" title="Thêm bộ khung mascot" />
    </HomeWorkspaceShell>
  );
}

export function ReferencesLibraryScreen() {
  const library = useUserLibrary();
  const [group, setGroup] = React.useState<ReferenceGroup>("style");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const items = (library.data?.items ?? []).filter((item) => item.kind === "reference" && item.group === group);
  const tabs: ReadonlyArray<{ id: ReferenceGroup; label: string }> = [
    { id: "style", label: "Phong cách" },
    { id: "mascot-reference", label: "Mascot" },
  ];
  return (
    <HomeWorkspaceShell active="references" title="Ảnh tham chiếu" action={<Button size="sm" onClick={() => setUploadOpen(true)}><Plus aria-hidden />Thêm ảnh</Button>}>
      <Tabs items={tabs} value={group} onChange={setGroup} />
      {items.length ? (
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{items.map((item) => <UserAssetCard key={item.id} item={item} />)}</section>
      ) : (
        <button type="button" onClick={() => setUploadOpen(true)} className="mt-6 flex min-h-[320px] w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40 text-center hover:border-line-strong">
          <ImagePlus className="size-7 text-fg-muted" aria-hidden />
          <span className="mt-3 text-label text-fg-strong">Thêm ảnh {group === "style" ? "phong cách" : "mascot"}</span>
        </button>
      )}
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} kind="reference" group={group} title={group === "style" ? "Thêm ảnh phong cách" : "Thêm ảnh mascot"} />
    </HomeWorkspaceShell>
  );
}
