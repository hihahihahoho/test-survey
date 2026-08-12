import * as React from "react";
import { ImagePlus, Palette, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAddBrandProfile, useLibraryImage, usePatchBrandProfile, useRemoveBrandProfile, useUserLibrary } from "@/lib/hooks";
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
  const [name, setName] = React.useState(""); const [description, setDescription] = React.useState("");
  const [colors, setColors] = React.useState(["#005BAA", "#00B0F0"]); const [assetIds, setAssetIds] = React.useState<string[]>([]);
  React.useEffect(() => { if (!open) return; setName(brand?.name ?? ""); setDescription(brand?.description ?? ""); setColors(brand?.colors.length ? brand.colors : ["#005BAA", "#00B0F0"]); setAssetIds(brand?.assetIds ?? []); }, [brand, open]);
  const assets = (library.data?.items ?? []).filter(item => item.kind === "mascot" || item.kind === "reference");
  const save = () => { const input = { name: name.trim(), description: description.trim(), colors, assetIds }; const options = { onSuccess: () => { toast.success(brand ? "Đã lưu thương hiệu" : "Đã tạo thương hiệu"); onOpenChange(false); }, onError: () => toast.error("Chưa lưu được thương hiệu") }; if (brand) patch.mutate({ id: brand.id, ...input }, options); else add.mutate(input, options); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg"><DialogHeader><DialogTitle>{brand ? `Sửa ${brand.name}` : "Thêm nhận dạng thương hiệu"}</DialogTitle><DialogDescription>Gom logo, bảng màu, ảnh phong cách và nhiều mascot để tái sử dụng cho các dự án.</DialogDescription></DialogHeader><DialogBody className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="brand-name">Tên thương hiệu</Label><Input id="brand-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Vietcombank" autoFocus /></div><div><Label htmlFor="brand-description">Ghi chú</Label><Textarea id="brand-description" rows={2} value={description} onChange={e=>setDescription(e.target.value)} /></div></div>
    <section><div className="mb-2 flex items-center justify-between"><Label>Bảng màu</Label><Button variant="secondary" size="sm" onClick={()=>setColors([...colors,"#FFFFFF"])}>Thêm màu</Button></div><div className="flex flex-wrap gap-2">{colors.map((color,i)=><label key={i} className="color-field"><Input type="color" value={color} onChange={e=>setColors(colors.map((v,j)=>j===i?e.target.value:v))}/><code>{color}</code></label>)}</div></section>
    <section><Label>Logo, ảnh nhận diện, phong cách và mascot</Label><p className="mb-3 text-caption text-fg-muted">Chọn nhiều mascot hoặc ảnh đã có trong thư viện. Bạn vẫn có thể tải ảnh riêng trong wizard.</p>{assets.length ? <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4">{assets.map(item=><AssetChoice key={item.id} item={item} checked={assetIds.includes(item.id)} onChange={()=>setAssetIds(assetIds.includes(item.id)?assetIds.filter(id=>id!==item.id):[...assetIds,item.id])}/>)}</div> : <p className="rounded-3 border border-dashed border-line-subtle p-8 text-center text-caption text-fg-muted">Thêm mascot và ảnh tham chiếu vào thư viện trước, sau đó gắn chúng vào thương hiệu tại đây.</p>}</section>
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
