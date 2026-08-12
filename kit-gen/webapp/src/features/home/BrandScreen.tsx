import * as React from "react";
import { ImagePlus, Palette, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAddBrandProfile, useAddLibraryItem, useLibraryImage, usePatchBrandProfile, useRemoveBrandProfile, useUserLibrary } from "@/lib/hooks";
import type { BrandProfile, LibraryItem } from "@/lib/types";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

type MascotDraft = { id: string; name: string; file: File | null; tags: string };

function AssetRow({ item, selected, onSelected }: { item: LibraryItem; selected: boolean; onSelected: (selected: boolean) => void }) {
  const src = useLibraryImage(item.id);
  return <article className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2 border border-line-subtle bg-raised p-2">
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-1 bg-surface">{src ? <img src={src} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-fg-muted" />}</div>
    <div className="min-w-0"><p className="truncate text-label text-fg-strong">{item.name}</p><p className="truncate text-caption text-fg-muted">{item.kind === "mascot" ? item.tags.join(" · ") || "Nhân vật" : "Style reference"}</p></div>
    <label className="flex items-center gap-2 text-caption text-fg-muted"><span>{selected ? "Đã gắn" : "Chưa gắn"}</span><Switch checked={selected} onCheckedChange={onSelected} aria-label={`${selected ? "Gỡ" : "Gắn"} ${item.name}`} /></label>
  </article>;
}

function BrandDialog({ brand, open, onOpenChange }: { brand: BrandProfile | null; open: boolean; onOpenChange: (value: boolean) => void }) {
  const library = useUserLibrary();
  const add = useAddBrandProfile();
  const patch = usePatchBrandProfile();
  const addAsset = useAddLibraryItem();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [colors, setColors] = React.useState(["#005BAA", "#00B0F0"]);
  const [assetIds, setAssetIds] = React.useState<string[]>([]);
  const [styleFiles, setStyleFiles] = React.useState<File[]>([]);
  const [mascots, setMascots] = React.useState<MascotDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setName(brand?.name ?? "");
    setDescription(brand?.description ?? "");
    setColors(brand?.colors.length ? brand.colors : ["#005BAA", "#00B0F0"]);
    setAssetIds(brand?.assetIds ?? []);
    setStyleFiles([]);
    setMascots([]);
  }, [brand, open]);

  const assets = (library.data?.items ?? []).filter(item => item.kind === "mascot" || item.kind === "reference");
  const existingRefs = assets.filter(item => item.kind === "reference");
  const existingMascots = assets.filter(item => item.kind === "mascot");
  const selectAsset = (id: string, selected: boolean) => setAssetIds(current => selected ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const patchMascot = (id: string, value: Partial<MascotDraft>) => setMascots(current => current.map(row => row.id === id ? { ...row, ...value } : row));

  const save = () => void (async () => {
    try {
      const uploaded: string[] = [];
      for (const file of styleFiles) uploaded.push((await addAsset.mutateAsync({ file, kind: "reference", group: "brand-style", name: file.name.replace(/\.[^.]+$/, "") })).id);
      for (const mascot of mascots) {
        if (!mascot.file || !mascot.name.trim()) continue;
        uploaded.push((await addAsset.mutateAsync({ file: mascot.file, kind: "mascot", group: "brand-mascot", name: mascot.name.trim(), tags: mascot.tags.split(",").map(tag => tag.trim()).filter(Boolean) })).id);
      }
      const input = { name: name.trim(), description: description.trim(), colors, assetIds: [...new Set([...assetIds, ...uploaded])] };
      if (brand) await patch.mutateAsync({ id: brand.id, ...input }); else await add.mutateAsync(input);
      toast.success(brand ? "Đã lưu thương hiệu" : "Đã tạo thương hiệu");
      onOpenChange(false);
    } catch { toast.error("Chưa lưu được thương hiệu"); }
  })();

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg"><DialogHeader><DialogTitle>{brand ? `Sửa ${brand.name}` : "Thêm nhận dạng thương hiệu"}</DialogTitle><DialogDescription>Gom logo, bảng màu, style reference và nhiều nhân vật để dùng lại trong các dự án.</DialogDescription></DialogHeader><DialogBody className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="brand-name">Tên thương hiệu</Label><Input id="brand-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Vietcombank" autoFocus /></div><div className="space-y-2"><Label htmlFor="brand-description">Ghi chú</Label><Textarea id="brand-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} /></div></div>
    <section><div className="mb-3 flex items-center justify-between"><div><Label>Bảng màu</Label><p className="text-caption text-fg-muted">Chọn màu chủ đạo của nhận dạng.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setColors(current => [...current, "#FFFFFF"])}><Plus aria-hidden />Thêm màu</Button></div><div className="space-y-2">{colors.map((color, index) => <div key={`${index}-${color}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2 bg-raised p-2"><Input aria-label={`Màu ${index + 1}`} type="color" value={color} className="h-9 w-12 p-1" onChange={event => setColors(current => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><code className="text-caption text-fg-strong">{color}</code><Button type="button" variant="ghost" size="icon-sm" aria-label={`Xoá màu ${color}`} onClick={() => setColors(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 aria-hidden /></Button></div>)}</div></section>
    <section><Label>Logo và style reference</Label><p className="mb-3 text-caption text-fg-muted">Tải nhiều logo, key visual, moodboard hoặc ảnh tham chiếu cùng lúc.</p><ImageDropzone multiple maxFiles={20} label="Thêm logo và style reference" description="Kéo thả hoặc chọn nhiều ảnh" onFiles={setStyleFiles} /></section>
    {existingRefs.length > 0 ? <section><Label>Style reference trong thư viện</Label><p className="mb-3 text-caption text-fg-muted">Bật để gắn vào thương hiệu, tắt để gỡ. Ảnh gốc vẫn còn trong thư viện.</p><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{existingRefs.map(item => <AssetRow key={item.id} item={item} selected={assetIds.includes(item.id)} onSelected={selected => selectAsset(item.id, selected)} />)}</div></section> : null}
    <section><div className="mb-3 flex items-start justify-between gap-3"><div><Label>Thêm nhân vật mới</Label><p className="text-caption text-fg-muted">Mỗi nhân vật có tên, nhãn và một ảnh reference riêng.</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setMascots(current => [...current, { id: crypto.randomUUID(), name: "", file: null, tags: name.trim() }])}><Plus aria-hidden />Thêm nhân vật</Button></div><div className="space-y-3">{mascots.map((mascot, index) => <article key={mascot.id} className="rounded-3 border border-line-subtle bg-raised p-4"><div className="mb-4 flex items-center justify-between"><strong className="text-label text-fg-strong">Nhân vật {index + 1}</strong><Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ nhân vật ${index + 1}`} onClick={() => setMascots(current => current.filter(row => row.id !== mascot.id))}><X aria-hidden /></Button></div><div className="space-y-4"><div className="space-y-2"><Label htmlFor={`brand-mascot-name-${mascot.id}`}>Tên nhân vật</Label><Input id={`brand-mascot-name-${mascot.id}`} value={mascot.name} onChange={event => patchMascot(mascot.id, { name: event.target.value })} placeholder="Ví dụ: Sóc VCB" /></div><div className="space-y-2"><Label htmlFor={`brand-mascot-tags-${mascot.id}`}>Nhãn tìm kiếm</Label><Input id={`brand-mascot-tags-${mascot.id}`} value={mascot.tags} onChange={event => patchMascot(mascot.id, { tags: event.target.value })} placeholder="Ví dụ: VCB, ngân hàng, Tết" /></div><div><Label>Ảnh reference nhân vật</Label><div className="mt-2"><ImageDropzone label="Chọn ảnh nhân vật" description="Một ảnh rõ mặt và đủ trang phục" onFiles={files => patchMascot(mascot.id, { file: files[0] ?? null })} /></div></div></div></article>)}</div></section>
    {existingMascots.length > 0 ? <section><Label>Nhân vật trong thư viện</Label><p className="mb-3 text-caption text-fg-muted">Bật từng nhân vật cần dùng cho thương hiệu này.</p><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{existingMascots.map(item => <AssetRow key={item.id} item={item} selected={assetIds.includes(item.id)} onSelected={selected => selectAsset(item.id, selected)} />)}</div></section> : null}
  </DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Huỷ</Button><Button disabled={!name.trim() || add.isPending || patch.isPending || addAsset.isPending} onClick={save}>Lưu thương hiệu</Button></DialogFooter></DialogContent></Dialog>;
}

export function BrandScreen() {
  const library = useUserLibrary();
  const remove = useRemoveBrandProfile();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrandProfile | null>(null);
  const brands = library.data?.brands ?? [];
  return <HomeWorkspaceShell active="brands" title="Nhận dạng thương hiệu" action={<Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus aria-hidden />Thêm thương hiệu</Button>}>
    <p className="max-w-2xl text-body text-fg-muted">Quản lý logo, bảng màu, style reference và nhân vật dùng chung. Wizard chỉ dùng dữ liệu này để điền sẵn; bạn vẫn sửa riêng cho từng dự án.</p>
    {brands.length ? <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{brands.map(brand => <article key={brand.id} className="rounded-4 border border-line-subtle bg-surface p-5"><div className="flex items-start justify-between"><div><h2 className="text-subtitle text-fg-strong">{brand.name}</h2><p className="mt-1 line-clamp-2 text-caption text-fg-muted">{brand.description || "Chưa có ghi chú"}</p></div><Palette className="size-5 text-fg-muted" /></div><div className="mt-4 flex flex-wrap gap-1">{brand.colors.map(color => <span key={color} className="size-7 rounded-full border border-line-subtle" style={{ background: color }} title={color} />)}</div><p className="mt-4 text-caption text-fg-muted">{brand.assetIds.length} ảnh và nhân vật</p><div className="mt-4 flex gap-2"><Button variant="secondary" size="sm" onClick={() => { setEditing(brand); setOpen(true); }}>Chỉnh sửa</Button><Button variant="ghost" size="icon-sm" aria-label={`Xoá ${brand.name}`} onClick={() => remove.mutate(brand.id, { onSuccess: () => toast.success("Đã xoá thương hiệu") })}><Trash2 aria-hidden /></Button></div></article>)}</section> : <button type="button" onClick={() => setOpen(true)} className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40"><Palette className="size-8 text-fg-muted" /><strong className="mt-3 text-label">Tạo nhận dạng thương hiệu đầu tiên</strong><span className="mt-1 text-caption text-fg-muted">Ví dụ: VCB, VNPAY hoặc từng nhãn hàng của chiến dịch</span></button>}
    <BrandDialog brand={editing} open={open} onOpenChange={setOpen} />
  </HomeWorkspaceShell>;
}
