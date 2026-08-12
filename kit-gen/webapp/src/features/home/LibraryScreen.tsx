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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { poseOptions, poseSvgMarkup, Silhouette } from "@/features/design/preview";
import { fromAgentLib, loadBundledV2, foldVi } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import {
  useAddLibraryItem, useAddPoseTemplate, useElementLib, useLibraryImage, usePatchLibrarySettings,
  usePatchLibraryItem, usePatchPoseTemplate, useRemoveLibraryItem, useRemovePoseTemplate, useUserLibrary,
} from "@/lib/hooks";
import type { LibraryItem, LibrarySettings, PoseTemplate } from "@/lib/types";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

type UiGroup = "background" | "popup" | "small";

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

function LibraryTabs<T extends string>({ items, value, onChange }: {
  items: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (value: T) => void;
}) {
  return <Tabs value={value} onValueChange={(next) => onChange(next as T)}><TabsList>{items.map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList></Tabs>;
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
  group: UiGroup | "mascot" | "style";
  title: string;
}) {
  const add = useAddLibraryItem();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [preset, setPreset] = React.useState<SafeZonePreset>(() => initialPreset(group));

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setName("");
      setDescription("");
      setTags("");
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
            <Input id={`library-name-${group}`} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "mascot" ? "Ví dụ: Sóc VCB" : "Ví dụ: Popup phần thưởng"} autoFocus />
          </div>
          <ImageDropzone multiple={kind === "reference"} label={kind === "reference" ? "Kéo các ảnh vào đây" : "Kéo ảnh vào đây"} description="PNG, JPG hoặc WebP · xem trước trước khi thêm" onFiles={(picked) => setFiles(Array.from(picked))} />

          {kind === "mascot" && <>
            <div className="space-y-2"><Label htmlFor="mascot-tags">Nhãn</Label><Input id="mascot-tags" value={tags} onChange={event => setTags(event.target.value)} placeholder="Ví dụ: VCB, ngân hàng, Tết" /><p className="text-caption text-fg-muted">Phân cách bằng dấu phẩy để tìm và lọc mascot.</p></div>
            <p className="rounded-2 bg-raised px-3 py-2 text-caption text-fg-muted">Khung pose được quản lý riêng ở tab “Quản lý khung pose”.</p>
          </>}
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
                for (const file of files) await add.mutateAsync({ file, kind, group, name: kind === "reference" ? file.name.replace(/\.[^.]+$/, "") : name.trim(), ...(kind === "mascot" ? { tags: tags.split(",").map(tag=>tag.trim()).filter(Boolean) } : {}), ...(kind === "ui" ? { description: description.trim(), cell: geometry.cell, skel: geometry.skel } : {}) });
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
  const [tags, setTags] = React.useState(item.tags.join(", "));
  const [preset, setPreset] = React.useState<SafeZonePreset>(() => presetFor(item));

  React.useEffect(() => {
    if (!open) return;
    setName(item.name);
    setDescription(item.description);
    setTags(item.tags.join(", "));
    setPreset(presetFor(item));
  }, [item, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{item.kind === "mascot" ? "Sửa nhân vật" : "Đổi tên"}</DialogTitle>
          <DialogDescription>{item.kind === "mascot" ? "Tên và nhãn giúp tìm đúng mascot khi tạo dự án." : "Tên này dùng khi chọn ảnh trong dự án."}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`edit-library-name-${item.id}`}>Tên</Label>
            <Input id={`edit-library-name-${item.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </div>
          {item.kind === "mascot" && (
            <div className="space-y-2">
              <Label htmlFor={`edit-library-tags-${item.id}`}>Nhãn</Label>
              <Input id={`edit-library-tags-${item.id}`} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="VCB, ngân hàng, Tết" />
              <p className="text-caption text-fg-muted">Phân cách bằng dấu phẩy.</p>
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
                ...(item.kind === "mascot" ? { tags: tags.split(",").map(value => value.trim()).filter(Boolean) } : {}),
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
        <LibraryTabs items={GROUPS} value={group} onChange={setGroup} />
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
  const [tab, setTab] = React.useState<"characters" | "poses">("characters");
  const [characterOpen, setCharacterOpen] = React.useState(false);
  const [poseOpen, setPoseOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState("all");
  const [poseStatus, setPoseStatus] = React.useState("all");
  const all = (library.data?.items ?? []).filter((item) => item.kind === "mascot");
  const tags = [...new Set(all.flatMap(item => item.tags))].sort((a,b)=>a.localeCompare(b,"vi"));
  const q = foldVi(query);
  const items = all.filter(item => (tag === "all" || item.tags.includes(tag)) && (!q || foldVi(`${item.name} ${item.description} ${item.tags.join(" ")}`).includes(q)));
  const poses = (library.data?.poseTemplates ?? []).filter(pose => (poseStatus === "all" || (poseStatus === "on" ? pose.enabled : !pose.enabled)) && (!q || foldVi(`${pose.name} ${pose.description}`).includes(q)));
  const addLabel = tab === "characters" ? "Thêm nhân vật" : "Thêm khung pose";
  return (
    <HomeWorkspaceShell active="mascot-library" title="Mascot" action={<Button size="sm" onClick={() => tab === "characters" ? setCharacterOpen(true) : setPoseOpen(true)}><Plus aria-hidden />{addLabel}</Button>}>
      <Tabs value={tab} onValueChange={(value) => { setTab(value as typeof tab); setQuery(""); }}>
        <TabsList aria-label="Quản lý mascot">
          <TabsTrigger value="characters">Quản lý nhân vật</TabsTrigger>
          <TabsTrigger value="poses">Quản lý khung pose</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-5 flex flex-wrap items-center gap-2 rounded-3 bg-surface p-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden/><Input type="search" aria-label={tab === "characters" ? "Tìm nhân vật" : "Tìm khung pose"} value={query} onChange={event=>setQuery(event.target.value)} placeholder={tab === "characters" ? "Tìm theo tên hoặc nhãn…" : "Tìm khung pose…"} className="pl-9"/></div>
        {tab === "characters" ? <>
          <Select value={tag} onValueChange={setTag}><SelectTrigger className="w-44" aria-label="Lọc nhân vật theo nhãn"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả nhãn</SelectItem>{tags.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
          <MaxPerSheet setting="mascot" fallback={4} />
        </> : <Select value={poseStatus} onValueChange={setPoseStatus}><SelectTrigger className="w-44" aria-label="Lọc trạng thái khung pose"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="on">Đang sử dụng</SelectItem><SelectItem value="off">Đã tắt</SelectItem></SelectContent></Select>}
      </div>
      {tab === "characters" ? <>
        <p className="mt-4 text-caption text-fg-muted">{items.length} nhân vật · mỗi nhân vật có tên, ảnh tham chiếu và nhãn riêng.</p>
        {items.length ? <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{items.map(item=><MascotCard key={item.id} item={item}/>)}</section> : <button type="button" onClick={()=>setCharacterOpen(true)} className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40 text-center hover:border-line-strong"><ImagePlus className="size-7 text-fg-muted" aria-hidden/><span className="mt-3 text-label text-fg-strong">{all.length ? "Không tìm thấy nhân vật" : "Thêm nhân vật đầu tiên"}</span></button>}
      </> : <>
        <p className="mt-4 text-caption text-fg-muted">{poses.length} khung pose · skeleton được lấy trực tiếp từ prototype silhouettes.js.</p>
        <section className="mt-4 space-y-2" aria-label="Danh sách khung pose">{poses.map(pose => <PoseTemplateRow key={pose.id} pose={pose} />)}</section>
      </>}
      <UploadDialog open={characterOpen} onOpenChange={setCharacterOpen} kind="mascot" group="mascot" title="Thêm nhân vật" />
      <PoseTemplateDialog open={poseOpen} onOpenChange={setPoseOpen} pose={null} />
    </HomeWorkspaceShell>
  );
}

function MascotCard({ item }: { item: LibraryItem }) {
  const image = useLibraryImage(item.id);
  const remove = useRemoveLibraryItem();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return <><article className="rounded-3 border border-line-subtle bg-surface p-3"><div className="aspect-square overflow-hidden rounded-2 bg-raised">{image?<img src={image} alt="" className="size-full object-contain"/>:<ImagePlus className="m-auto size-6 text-fg-muted"/>}</div><div className="mt-3 min-w-0"><h2 className="truncate text-label text-fg-strong">{item.name}</h2><div className="mt-2 flex min-h-5 flex-wrap gap-1">{item.tags.map(tag=><span key={tag} className="rounded-full bg-raised px-2 py-0.5 text-caption text-fg-muted">{tag}</span>)}</div></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-subtle pt-3"><Button variant="secondary" size="sm" onClick={()=>setEditOpen(true)}><Pencil aria-hidden/>Sửa</Button><Button variant="ghost" size="sm" onClick={()=>setConfirmOpen(true)}><Trash2 aria-hidden/>Xoá</Button></div></article><EditAssetDialog item={item} open={editOpen} onOpenChange={setEditOpen}/><AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xoá nhân vật “{item.name}”?</AlertDialogTitle><AlertDialogDescription>Chỉ nhân vật này bị xoá khỏi thư viện. Các project khác không bị xoá.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Huỷ</AlertDialogCancel><AlertDialogAction onClick={()=>remove.mutate(item.id,{onSuccess:()=>toast.success("Đã xoá nhân vật")})}>Xoá nhân vật</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

function PoseTemplateRow({ pose }: { pose: PoseTemplate }) {
  const patch = usePatchPoseTemplate();
  const remove = useRemovePoseTemplate();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return <><article className="grid items-center gap-3 rounded-3 border border-line-subtle bg-surface p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
    <div className="flex h-20 items-center justify-center rounded-2 bg-raised p-2" aria-hidden dangerouslySetInnerHTML={{__html:`<svg viewBox="0 0 60 84" class="h-full w-auto">${poseSvgMarkup(pose.sourcePose,60,84)}</svg>`}} />
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-label text-fg-strong">{pose.name}</h2>{pose.builtIn ? <span className="rounded-full bg-raised px-2 py-0.5 text-caption text-fg-muted">Prototype</span> : null}</div><p className="mt-1 line-clamp-2 text-caption text-fg-muted">{pose.description || "Khung skeleton tái sử dụng cho mascot."}</p></div>
    <div className="flex items-center justify-end gap-2"><label className="flex items-center gap-2 text-caption text-fg-muted"><Switch checked={pose.enabled} onCheckedChange={enabled=>patch.mutate({id:pose.id,enabled})} aria-label={`${pose.enabled ? "Tắt" : "Bật"} ${pose.name}`}/><span className="hidden lg:inline">{pose.enabled ? "Đang dùng" : "Đã tắt"}</span></label><Button variant="ghost" size="icon-sm" onClick={()=>setEditOpen(true)} aria-label={`Sửa ${pose.name}`}><Pencil aria-hidden/></Button><Button variant="ghost" size="icon-sm" onClick={()=>setConfirmOpen(true)} aria-label={`Xoá ${pose.name}`}><Trash2 aria-hidden/></Button></div>
  </article><PoseTemplateDialog open={editOpen} onOpenChange={setEditOpen} pose={pose}/><AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xoá khung pose “{pose.name}”?</AlertDialogTitle><AlertDialogDescription>Chỉ khung skeleton này bị xoá; nhân vật và project không bị xoá.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Huỷ</AlertDialogCancel><AlertDialogAction onClick={()=>remove.mutate(pose.id,{onSuccess:()=>toast.success("Đã xoá khung pose")})}>Xoá khung pose</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

function PoseTemplateDialog({ open, onOpenChange, pose }: { open: boolean; onOpenChange: (open: boolean) => void; pose: PoseTemplate | null }) {
  const add = useAddPoseTemplate();
  const patch = usePatchPoseTemplate();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [sourcePose, setSourcePose] = React.useState("idle");
  React.useEffect(()=>{if(!open)return;setName(pose?.name??"");setDescription(pose?.description??"");setSourcePose(pose?.sourcePose??"idle")},[open,pose]);
  const selected = poseOptions().find(item=>item.value===sourcePose);
  const save = () => {
    const input = { name: name.trim(), description: description.trim(), sourcePose };
    const options = { onSuccess: () => { toast.success(pose ? "Đã lưu khung pose" : "Đã thêm khung pose"); onOpenChange(false); }, onError: () => toast.error("Chưa lưu được khung pose") };
    if (pose) patch.mutate({ id: pose.id, ...input }, options);
    else add.mutate(input, options);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="sm"><DialogHeader><DialogTitle>{pose?"Sửa khung pose":"Thêm khung pose"}</DialogTitle><DialogDescription>Chọn một skeleton chuẩn từ prototype và đặt tên theo cách đội của bạn sử dụng.</DialogDescription></DialogHeader><DialogBody className="space-y-4"><div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]"><div className="flex aspect-[3/4] items-center justify-center rounded-3 bg-raised p-3" aria-label={`Xem trước ${selected?.label??sourcePose}`} dangerouslySetInnerHTML={{__html:`<svg viewBox="0 0 60 84" class="h-full w-full">${poseSvgMarkup(sourcePose,60,84)}</svg>`}}/><div className="space-y-4"><div className="space-y-2"><Label htmlFor="pose-template-name">Tên khung pose</Label><Input id="pose-template-name" value={name} onChange={event=>setName(event.target.value)} placeholder="Ví dụ: Chào chiến dịch" autoFocus/></div><div className="space-y-2"><Label htmlFor="pose-template-source">Skeleton prototype</Label><Select value={sourcePose} onValueChange={setSourcePose}><SelectTrigger id="pose-template-source"><SelectValue/></SelectTrigger><SelectContent>{poseOptions().map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></div></div><div className="space-y-2"><Label htmlFor="pose-template-description">Ghi chú sử dụng</Label><Textarea id="pose-template-description" value={description} onChange={event=>setDescription(event.target.value)} rows={3} placeholder="Dùng ở CTA, màn chào…"/></div></DialogBody><DialogFooter><Button variant="secondary" onClick={()=>onOpenChange(false)}>Huỷ</Button><Button disabled={!name.trim()||add.isPending||patch.isPending} onClick={save}>{pose?"Lưu thay đổi":"Thêm khung pose"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function ReferencesLibraryScreen() {
  const library=useUserLibrary(); const [uploadOpen,setUploadOpen]=React.useState(false); const [query,setQuery]=React.useState("");
  const q=foldVi(query); const items=(library.data?.items??[]).filter(item=>item.kind==="reference" && ["style","brand-style","brand-logo"].includes(item.group) && (!q || foldVi(`${item.name} ${item.description}`).includes(q)));
  return <HomeWorkspaceShell active="references" title="Style reference" action={<Button size="sm" onClick={()=>setUploadOpen(true)}><Plus aria-hidden/>Thêm ảnh</Button>}><div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden/><Input type="search" aria-label="Tìm style reference" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm style reference…" className="pl-9"/></div>{items.length?<section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{items.map(item=><UserAssetCard key={item.id} item={item}/>)}</section>:<button type="button" onClick={()=>setUploadOpen(true)} className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40"><ImagePlus className="size-7 text-fg-muted"/><span className="mt-3 text-label text-fg-strong">Thêm style reference đầu tiên</span></button>}<UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} kind="reference" group="style" title="Thêm style reference"/></HomeWorkspaceShell>;
}
