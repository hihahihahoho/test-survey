import * as React from "react";
import { ImagePlus, Palette, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "@/components/ui/image-dropzone";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/common";
import { errorDetail } from "@/features/projects/lib/feedback";
import { useAddBrandProfile, useAddLibraryItem, useLibraryImage, usePatchBrandProfile, usePatchLibraryItem, useRemoveBrandProfile, useUserLibrary } from "@/lib/hooks";
import type { BrandProfile, LibraryItem } from "@/lib/types";
import { NEUTRAL_PRIMARY_COLOR, NEUTRAL_SECONDARY_COLOR } from "@/lib/types/contract";
import { BRAND_ASSET_LABEL, brandAssetKind } from "./lib/brand-assets";
import { BrandCard } from "./components/BrandCard";
import { HomeWorkspaceShell } from "./components/HomeWorkspaceShell";

type MascotDraft = { id: string; name: string; file: File | null; tags: string };

/**
 * §BUG-1 — hai ô màu của một hồ sơ thương hiệu MỚI bắt đầu bằng mực/xám trung tính của
 * app. Trước đây là `#005BAA`/`#00B0F0`, tức là màu của VNPAY hiện sẵn khi người dùng
 * đang tạo hồ sơ cho một thương hiệu khác — họ phải tự nhận ra để sửa. Nguồn hằng:
 * `lib/types/contract.ts`.
 */
const NEW_BRAND_COLORS = [NEUTRAL_PRIMARY_COLOR, NEUTRAL_SECONDARY_COLOR];

/** Màu mặc định khi bấm «Thêm màu» — lấy màu ĐẦU TIÊN chưa có trong bảng, vì agent gộp
 *  màu trùng khi lưu (`cleanBrand`) nên hai ô cùng mã sẽ âm thầm biến thành một. */
const NEW_COLOR_POOL = ["#FFFFFF", "#000000", "#E30613", "#F5A623", "#00A651", "#7B61FF"];
/** Trần của agent (`cleanBrand` cắt còn 12) — khoá nút thay vì để người dùng mất màu vừa thêm. */
const MAX_COLORS = 12;

function SectionTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {/* h3 chứ KHÔNG phải <Label>: đây là tiêu đề của cả một khu, không gắn với một ô
            nhập nào. `<Label>` không có `htmlFor` là nhãn treo lơ lửng với screen reader. */}
        <h3 className="text-label text-fg-strong">{title}</h3>
        <p className="text-caption text-fg-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

function AssetRow({ item, selected, onSelected }: { item: LibraryItem; selected: boolean; onSelected: (selected: boolean) => void }) {
  const src = useLibraryImage(item.id);
  const patch = usePatchLibraryItem();
  const kind = brandAssetKind(item);
  return <article className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2 border border-line-subtle bg-raised p-2">
    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-1 bg-surface">{src ? <img src={src} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-fg-muted" aria-hidden />}</div>
    <div className="min-w-0">
      <p className="truncate text-label text-fg-strong">{item.name}</p>
      <p className="truncate text-caption text-fg-muted">{kind === "mascot" ? item.tags.join(" · ") || BRAND_ASSET_LABEL.mascot : BRAND_ASSET_LABEL[kind]}</p>
    </div>
    <div className="flex items-center gap-3">
      {/* ĐƯỜNG DI DỜI cho ảnh tải lên TRƯỚC khi tách hai khu: hồi đó mọi thứ vào chung
          `brand-style`, nên logo cũ nằm lẫn trong ảnh phong cách. Đổi tại chỗ, không
          phải xoá đi tải lại. */}
      {kind !== "mascot" ? <Select
        value={item.group === "brand-logo" ? "brand-logo" : "brand-style"}
        onValueChange={value => patch.mutate({ id: item.id, group: value }, { onError: () => toast.error("Chưa đổi được loại ảnh") })}
      >
        <SelectTrigger className="h-ctl-sm w-36 text-label" aria-label={`Loại của ${item.name}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="brand-logo">{BRAND_ASSET_LABEL.logo}</SelectItem>
          <SelectItem value="brand-style">{BRAND_ASSET_LABEL.style}</SelectItem>
        </SelectContent>
      </Select> : null}
      {/* <div> chứ không phải <label>: Switch của Radix là <button>, bọc trong <label>
          thì chữ bên cạnh KHÔNG bấm được — nhãn rời khỏi control. */}
      <div className="flex items-center gap-2 text-caption text-fg-muted">
        <span>{selected ? "Đã gắn" : "Chưa gắn"}</span>
        <Switch checked={selected} onCheckedChange={onSelected} aria-label={`${selected ? "Gỡ" : "Gắn"} ${item.name}`} />
      </div>
    </div>
  </article>;
}

function LibrarySection({ title, description, items, assetIds, onSelect }: {
  title: string; description: string; items: LibraryItem[]; assetIds: string[]; onSelect: (id: string, selected: boolean) => void;
}) {
  if (items.length === 0) return null;
  return <section>
    <SectionTitle title={title} description={description} />
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {items.map(item => <AssetRow key={item.id} item={item} selected={assetIds.includes(item.id)} onSelected={selected => onSelect(item.id, selected)} />)}
    </div>
  </section>;
}

function BrandDialog({ brand, open, onOpenChange }: { brand: BrandProfile | null; open: boolean; onOpenChange: (value: boolean) => void }) {
  const library = useUserLibrary();
  const add = useAddBrandProfile();
  const patch = usePatchBrandProfile();
  const addAsset = useAddLibraryItem();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [colors, setColors] = React.useState(NEW_BRAND_COLORS);
  const [assetIds, setAssetIds] = React.useState<string[]>([]);
  const [logoFiles, setLogoFiles] = React.useState<File[]>([]);
  const [styleFiles, setStyleFiles] = React.useState<File[]>([]);
  const [mascots, setMascots] = React.useState<MascotDraft[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(brand?.name ?? "");
    setDescription(brand?.description ?? "");
    setColors(brand?.colors.length ? brand.colors : NEW_BRAND_COLORS);
    setAssetIds(brand?.assetIds ?? []);
    setLogoFiles([]);
    setStyleFiles([]);
    setMascots([]);
    setSaving(false);
  }, [brand, open]);

  const items = library.data?.items ?? [];
  const existingLogos = items.filter(item => item.kind === "reference" && item.group === "brand-logo");
  const existingRefs = items.filter(item => item.kind === "reference" && item.group !== "brand-logo");
  const existingMascots = items.filter(item => item.kind === "mascot");
  const selectAsset = (id: string, selected: boolean) => setAssetIds(current => selected ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const patchMascot = (id: string, value: Partial<MascotDraft>) => setMascots(current => current.map(row => row.id === id ? { ...row, ...value } : row));
  const addColor = () => setColors(current => current.length >= MAX_COLORS ? current : [...current, NEW_COLOR_POOL.find(color => !current.includes(color)) ?? "#FFFFFF"]);
  /** Nhân vật thiếu tên hoặc thiếu ảnh: TRƯỚC ĐÂY bị `continue` bỏ qua im lặng khi lưu. */
  const incompleteMascots = mascots.filter(mascot => !mascot.file || !mascot.name.trim());

  const save = () => {
    if (incompleteMascots.length > 0) {
      toast.error("Mỗi nhân vật cần có tên và một ảnh — hãy điền nốt hoặc bỏ thẻ trống.");
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        const uploaded: string[] = [];
        for (const file of logoFiles) uploaded.push((await addAsset.mutateAsync({ file, kind: "reference", group: "brand-logo", name: file.name.replace(/\.[^.]+$/, "") })).id);
        for (const file of styleFiles) uploaded.push((await addAsset.mutateAsync({ file, kind: "reference", group: "brand-style", name: file.name.replace(/\.[^.]+$/, "") })).id);
        for (const mascot of mascots) {
          if (!mascot.file) continue;
          uploaded.push((await addAsset.mutateAsync({ file: mascot.file, kind: "mascot", group: "brand-mascot", name: mascot.name.trim(), tags: mascot.tags.split(",").map(tag => tag.trim()).filter(Boolean) })).id);
        }
        const input = { name: name.trim(), description: description.trim(), colors: [...new Set(colors)], assetIds: [...new Set([...assetIds, ...uploaded])] };
        if (brand) await patch.mutateAsync({ id: brand.id, ...input }); else await add.mutateAsync(input);
        toast.success(brand ? "Đã lưu thương hiệu" : "Đã tạo thương hiệu");
        onOpenChange(false);
      } catch { toast.error("Chưa lưu được thương hiệu"); }
      finally { setSaving(false); }
    })();
  };

  return <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next); }}><DialogContent size="lg"><DialogHeader><DialogTitle>{brand ? `Sửa ${brand.name}` : "Thêm nhận dạng thương hiệu"}</DialogTitle><DialogDescription>Gom logo, bảng màu, ảnh phong cách và nhân vật để dùng lại trong các dự án.</DialogDescription></DialogHeader><DialogBody className="space-y-6">
    <div className="space-y-4">
      <div className="space-y-2"><Label htmlFor="brand-name">Tên thương hiệu</Label><Input id="brand-name" value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Vietcombank" autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="brand-description">Ghi chú</Label><Textarea id="brand-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Dùng cho chiến dịch nào, ai duyệt…" /></div>
    </div>

    <section>
      <SectionTitle
        title="Bảng màu"
        description="Chọn màu chủ đạo của nhận dạng."
        action={<Button type="button" variant="secondary" size="sm" disabled={colors.length >= MAX_COLORS} onClick={addColor}><Plus aria-hidden />Thêm màu</Button>}
      />
      {colors.length === 0
        ? <p className="rounded-2 border border-dashed border-line-subtle p-3 text-caption text-fg-muted">Chưa có màu nào. Bấm «Thêm màu» để bắt đầu.</p>
        : <div className="space-y-2">{colors.map((color, index) => <div key={`${index}-${color}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2 bg-raised p-2">
            <Input aria-label={`Màu ${index + 1}`} type="color" value={color} className="h-9 w-12 p-1" onChange={event => setColors(current => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} />
            <code className="text-caption text-fg-strong">{color.toUpperCase()}</code>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Xoá màu ${color}`} onClick={() => setColors(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 aria-hidden /></Button>
          </div>)}</div>}
    </section>

    <section>
      <SectionTitle title="Logo" description="Logo chính, logo phụ, phiên bản đảo màu — thứ luôn phải vẽ đúng." />
      <ImageDropzone multiple maxFiles={8} label="Thêm logo" description="Kéo thả hoặc chọn file logo" onFiles={setLogoFiles} />
    </section>

    <section>
      <SectionTitle title="Ảnh phong cách" description="Key visual, moodboard hoặc ảnh tham chiếu cho không khí chung." />
      <ImageDropzone multiple maxFiles={20} label="Thêm ảnh phong cách" description="Kéo thả hoặc chọn nhiều ảnh" onFiles={setStyleFiles} />
    </section>

    <LibrarySection title="Logo trong thư viện" description="Bật để gắn vào thương hiệu, tắt để gỡ. Ảnh gốc vẫn còn trong thư viện." items={existingLogos} assetIds={assetIds} onSelect={selectAsset} />
    <LibrarySection title="Ảnh phong cách trong thư viện" description="Đổi loại nếu một ảnh vốn là logo nhưng đang nằm nhầm khu." items={existingRefs} assetIds={assetIds} onSelect={selectAsset} />

    <section>
      <SectionTitle
        title="Thêm nhân vật mới"
        description="Mỗi nhân vật có tên, nhãn và một ảnh mẫu riêng."
        action={<Button type="button" variant="secondary" size="sm" onClick={() => setMascots(current => [...current, { id: crypto.randomUUID(), name: "", file: null, tags: name.trim() }])}><Plus aria-hidden />Thêm nhân vật</Button>}
      />
      <div className="space-y-3">{mascots.map((mascot, index) => <article key={mascot.id} className="rounded-3 border border-line-subtle bg-raised p-4">
        <div className="mb-4 flex items-center justify-between"><strong className="text-label text-fg-strong">Nhân vật {index + 1}</strong><Button type="button" variant="ghost" size="icon-sm" aria-label={`Bỏ nhân vật ${index + 1}`} onClick={() => setMascots(current => current.filter(row => row.id !== mascot.id))}><X aria-hidden /></Button></div>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor={`brand-mascot-name-${mascot.id}`}>Tên nhân vật</Label><Input id={`brand-mascot-name-${mascot.id}`} value={mascot.name} onChange={event => patchMascot(mascot.id, { name: event.target.value })} placeholder="Ví dụ: Sóc VCB" /></div>
          <div className="space-y-2"><Label htmlFor={`brand-mascot-tags-${mascot.id}`}>Nhãn tìm kiếm</Label><Input id={`brand-mascot-tags-${mascot.id}`} value={mascot.tags} onChange={event => patchMascot(mascot.id, { tags: event.target.value })} placeholder="Ví dụ: VCB, ngân hàng, Tết" /></div>
          <div className="space-y-2"><h4 className="text-label text-fg-strong">Ảnh mẫu nhân vật</h4><ImageDropzone label="Chọn ảnh nhân vật" description="Một ảnh rõ mặt và đủ trang phục" onFiles={files => patchMascot(mascot.id, { file: files[0] ?? null })} /></div>
          {!mascot.file || !mascot.name.trim() ? <p className="text-caption text-danger">Cần cả tên và một ảnh thì nhân vật này mới được lưu.</p> : null}
        </div>
      </article>)}</div>
    </section>

    <LibrarySection title="Nhân vật trong thư viện" description="Bật từng nhân vật cần dùng cho thương hiệu này." items={existingMascots} assetIds={assetIds} onSelect={selectAsset} />
  </DialogBody><DialogFooter><Button variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>Huỷ</Button><Button loading={saving} disabled={!name.trim() || saving} onClick={save}>Lưu thương hiệu</Button></DialogFooter></DialogContent></Dialog>;
}

export function BrandScreen() {
  const library = useUserLibrary();
  const remove = useRemoveBrandProfile();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BrandProfile | null>(null);
  const brands = library.data?.brands ?? [];
  const items = library.data?.items ?? [];
  /* Mở dialog TẠO: luôn dọn `editing` trước. Bản cũ để nguyên brand đang sửa nên nút ở
     trạng thái rỗng có thể mở lại dialog SỬA của một thương hiệu vừa bị xoá. */
  const create = () => { setEditing(null); setOpen(true); };

  return <HomeWorkspaceShell active="brands" title="Nhận dạng thương hiệu" action={<Button size="sm" onClick={create}><Plus aria-hidden />Thêm thương hiệu</Button>}>
    <p className="max-w-2xl text-body text-fg-muted">Quản lý logo, bảng màu, ảnh phong cách và nhân vật dùng chung. Bạn vẫn có thể sửa riêng trong từng dự án.</p>
    {library.isPending
      ? <LoadingState className="mt-6" variant="cards" count={3} label="Đang tải danh sách thương hiệu…" />
      : library.isError
        ? <ErrorState
            className="mt-6"
            title="Chưa lấy được danh sách thương hiệu."
            description="Dữ liệu nằm trên máy bạn. Bấm Thử lại, hoặc kiểm tra công cụ trên máy."
            detail={errorDetail(library.error)}
            actions={<Button variant="secondary" onClick={() => void library.refetch()}><RefreshCw aria-hidden />Thử lại</Button>}
          />
        : brands.length
          ? <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{brands.map(brand => <BrandCard
              key={brand.id}
              brand={brand}
              items={items}
              removing={remove.isPending}
              onEdit={() => { setEditing(brand); setOpen(true); }}
              onRemove={() => remove.mutate(brand.id, { onSuccess: () => toast.success("Đã xoá thương hiệu"), onError: () => toast.error("Chưa xoá được thương hiệu") })}
            />)}</section>
          : <button type="button" onClick={create} className="mt-6 flex min-h-72 w-full flex-col items-center justify-center rounded-4 border border-dashed border-line-subtle bg-surface/40">
              <Palette className="size-8 text-fg-muted" aria-hidden />
              <strong className="mt-3 text-label">Tạo nhận dạng thương hiệu đầu tiên</strong>
              <span className="mt-1 text-caption text-fg-muted">Ví dụ: VCB, VNPAY hoặc từng nhãn hàng của chiến dịch</span>
            </button>}
    <BrandDialog brand={editing} open={open} onOpenChange={setOpen} />
  </HomeWorkspaceShell>;
}
