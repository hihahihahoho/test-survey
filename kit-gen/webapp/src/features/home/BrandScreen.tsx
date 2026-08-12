import * as React from "react";
import { ImagePlus, Palette, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAddBrandProfile, useAddLibraryItem, useLibraryImage, usePatchBrandProfile, useRemoveBrandProfile, useUserLibrary } from "@/lib/hooks";
import type { BrandProfile, LibraryItem } from "@/lib/types";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

function AssetChoice({ item, checked, onChange }: { item: LibraryItem; checked: boolean; onChange: () => void }) {
  const src = useLibraryImage(item.id);
  return <label className="cursor-pointer rounded-3 border border-line-subtle bg-raised p-2">
    <div className="relative aspect-[4/3] overflow-hidden rounded-2 bg-surface">{src ? <img src={src} alt="" className="size-full object-contain" /> : <ImagePlus className="m-auto size-5 text-fg-muted" />}</div>
    <span className="mt-2 flex items-center gap-2"><Checkbox checked={checked} onCheckedChange={onChange} /><span className="truncate text-caption">{item.name}</span></span>
  </label>;
}

function BrandDialog({ brand, open, onOpenChange }: { brand: BrandProfile | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const library = useUserLibrary(); const add = useAddBrandProfile(); const patch = usePatchBrandProfile();
  const addAsset = useAddLibraryItem();
  const [name, setName] = React.useState(""); const [description, setDescription] = React.useState("");
  const [colors, setColors] = React.useState(["#005BAA", "#00B0F0"]); const [assetIds, setAssetIds] = React.useState<string[]>([]);
  const [styleFiles, setStyleFiles] = React.useState<File[]>([]);
  const [mascots, setMascots] = React.useState<Array<{ id: string; name: string; file: File | null; tags: string }>>([]);
  React.useEffect(() => { if (!open) return; setName(brand?.name ?? ""); setDescription(brand?.description ?? ""); setColors(brand?.colors.length ? brand.colors : ["#005BAA", "#00B0F0"]); setAssetIds(brand?.assetIds ?? []); setStyleFiles([]); setMascots([]); }, [brand, open]);
  const assets = (library.data?.items ?? []).filter(item => item.kind === "mascot" || item.kind === "reference");
  const existingMascots = assets.filter(item => item.kind === "mascot");
  const existingRefs = assets.filter(item => item.kind === "reference");
  const save = () => { void (async () => { try { const uploaded: string[] = []; for (const file of styleFiles) uploaded.push((await addAsset.mutateAsync({ file, kind: "reference", group: "brand-style", name: file.name.replace(/\.[^.]+$/, "") })).id); for (const mascot of mascots) { if (!mascot.file || !mascot.name.trim()) continue; uploaded.push((await addAsset.mutateAsync({ file: mascot.file, kind: "mascot", group: "brand-mascot", name: mascot.name.trim(), tags: mascot.tags.split(",").map(tag=>tag.trim()).filter(Boolean), poses: ["idle","wave","cheer","sad"] })).id); } const input = { name: name.trim(), description: description.trim(), colors, assetIds: [...new Set([...assetIds, ...uploaded])] }; if (brand) await patch.mutateAsync({ id: brand.id, ...input }); else await add.mutateAsync(input); toast.success(brand ? "Đã lưu thương hiệu" : "Đã tạo thương hiệu"); onOpenChange(false); } catch { toast.error("Chưa lưu được thương hiệu"); } })(); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg"><DialogHeader><DialogTitle>{brand ? `Sửa ${brand.name}` : "Thêm nhận dạng thương hiệu"}</DialogTitle><DialogDescription>Gom logo, bảng màu, ảnh phong cách và nhiều mascot để tái sử dụng cho các dự án.</DialogDescription></DialogHeader><DialogBody className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="brand-name">Tên thương hiệu</Label><Input id="brand-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Vietcombank" autoFocus /></div><div><Label htmlFor="brand-description">Ghi chú</Label><Textarea id="brand-description" rows={2} value={description} onChange={e=>setDescription(e.target.value)} /></div></div>
    <section><div className="mb-2 flex items-center justify-between"><Label>Bảng màu</Label><Button variant="secondary" size="sm" onClick={()=>setColors([...colors,"#FFFFFF"])}>Thêm màu</Button></div><div className="flex flex-wrap gap-2">{colors.map((color,i)=><label key={i} className="color-field"><Input type="color" value={color} onChange={e=>setColors(colors.map((v,j)=>j===i?e.target.value:v))}/><code>{color}</code></label>)}</div></section>
    <section><Label>Ảnh nhận diện và phong cách</Label><p className="mb-3 text-caption text-fg-muted">Logo, key visual, moodboard và ảnh tham chiếu phong cách.</p><ImageDropzone multiple label="Tải nhiều ảnh nhận diện" description="Kéo thả hoặc chọn nhiều ảnh" onFiles={(files)=>setStyleFiles(Array.from(files))}/></section>
    <section><div className="mb-3 flex items-center justify-between gap-3"><div><Label>Mascot</Label><p className="text-caption text-fg-muted">Thêm từng nhân vật để mỗi mascot có tên, nhãn và ảnh ref riêng.</p></div><Button type="button" variant="secondary" size="sm" onClick={()=>setMascots([...mascots,{id:crypto.randomUUID(),name:"",file:null,tags:name.trim()}])}><Plus aria-hidden/>Thêm mascot</Button></div><div className="space-y-3">{mascots.map((mascot,index)=><div key={mascot.id} className="rounded-3 border border-line-subtle bg-raised p-3"><div className="mb-3 flex items-center justify-between"><strong className="text-label">Mascot {index+1}</strong><button type="button" aria-label={`Bỏ mascot ${index+1}`} onClick={()=>setMascots(mascots.filter(row=>row.id!==mascot.id))} className="rounded-2 p-1 text-fg-muted hover:bg-canvas"><X className="size-4"/></button></div><div className="grid gap-3 sm:grid-cols-2"><Input aria-label={`Tên mascot ${index+1}`} value={mascot.name} onChange={event=>setMascots(mascots.map(row=>row.id===mascot.id?{...row,name:event.target.value}:row))} placeholder="Tên mascot, ví dụ: Sóc VCB"/><Input aria-label={`Nhãn mascot ${index+1}`} value={mascot.tags} onChange={event=>setMascots(mascots.map(row=>row.id===mascot.id?{...row,tags:event.target.value}:row))} placeholder="Nhãn: VCB, ngân hàng"/></div><div className="mt-3"><ImageDropzone label="Chọn ảnh ref cho mascot này" description="Một ảnh rõ mặt và trang phục" onFiles={files=>setMascots(mascots.map(row=>row.id===mascot.id?{...row,file:files[0]??null}:row))}/></div></div>)}</div></section>
    {existingRefs.length > 0 && <section><Label>Style reference đã có</Label><p className="mb-3 text-caption text-fg-muted">Chọn ảnh phong cách hoặc nhận diện từ thư viện.</p><div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">{existingRefs.map(item=><AssetChoice key={item.id} item={item} checked={assetIds.includes(item.id)} onChange={()=>setAssetIds(assetIds.includes(item.id)?assetIds.filter(id=>id!==item.id):[...assetIds,item.id])}/>)}</div></section>}
    {existingMascots.length > 0 && <section><Label>Mascot đã có</Label><p className="mb-3 text-caption text-fg-muted">Mỗi thẻ là một mascot có tên, ảnh ref, nhãn và pose skeleton riêng.</p><div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">{existingMascots.map(item=><AssetChoice key={item.id} item={item} checked={assetIds.includes(item.id)} onChange={()=>setAssetIds(assetIds.includes(item.id)?assetIds.filter(id=>id!==item.id):[...assetIds,item.id])}/>)}</div></section>}
  </DialogBody><DialogFooter><Button variant="secondary" onClick={()=>onOpenChange(false)}>Huỷ</Button><Button disabled={!name.trim() || add.isPending || patch.isPending} onClick={save}>Lưu thương hiệu</Button></DialogFooter></DialogContent></Dialog>;
}

export function BrandScreen() {
  const library = useUserLibrary(); const remove = useRemoveBrandProfile(); const [open,setOpen]=React.useState(false); const [editing,setEditing]=React.useState<BrandProfile|null>(null);
  const brands=library.data?.brands ?? [];
  return <HomeWorkspaceShell active="brands" title="Nhận dạng thương hiệu" action={<Button size="sm" onClick={()=>{setEditing(null);setOpen(true)}}><Plus aria-hidden/>Thêm thương hiệu</Button>}>
    <p className="max-w-2xl text-body text-fg-muted">Quản lý logo, bảng màu, ảnh phong cách và mascot dùng chung. Khi tạo dự án, chọn một thương hiệu để điền sẵn các thông tin này.</p>
    {brands.length ? <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{brands.map(brand=><article key={brand.id} className="rounded-4 border border-line-subtle bg-surface p-5"><div className="flex items-start justify-between"><div><h2 className="text-subtitle text-fg-strong">{brand.name}</h2><p className="mt-1 line-clamp-2 text-caption text-fg-muted">{brand.description || "Chưa có ghi chú"}</p></div><Palette className="size-5 text-fg-muted"/></div><div className="mt-4 flex gap-1">{brand.colors.map(c=><span key={c} className="size-7 rounded-full border border-line-subtle" style={{background:c}} title={c}/>)}</div><p className="mt-4 text-caption text-fg-muted">{brand.assetIds.length} ảnh và mascot</p><div className="mt-4 flex gap-2"><Button variant="secondary" size="sm" onClick={()=>{setEditing(brand);setOpen(true)}}>Chỉnh sửa</Button><Button variant="ghost" size="sm" aria-label={`Xoá ${brand.name}`} onClick={()=>remove.mutate(brand.id,{onSuccess:()=>toast.success("Đã xoá thương hiệu")})}><Trash2 aria-hidden/></Button></div></article>)}</section> : <button onClick={()=>setOpen(true)} className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40"><Palette className="size-8 text-fg-muted"/><strong className="mt-3 text-label">Tạo nhận dạng thương hiệu đầu tiên</strong><span className="mt-1 text-caption text-fg-muted">Ví dụ: VCB, VNPAY hoặc từng nhãn hàng của chiến dịch</span></button>}
    <BrandDialog brand={editing} open={open} onOpenChange={setOpen}/>
  </HomeWorkspaceShell>;
}
