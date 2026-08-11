import * as React from "react";
import {
  Palette, Paintbrush, Users, SlidersHorizontal, Settings2, Plus, Sparkles, Scissors, Copy, Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, FloatingToolbar, InlineBanner, LoadingState, CheckerboardImage } from "@/components/common";
import { CARD, CTA, DISPLAY, FOCUS, SERIF } from "@/components/layout/flora";
import { useAgentStatus, useDoctor, useProject, useStartRun, useRawHistory, useRestoreRaw } from "@/lib/hooks";
import { toast } from "@/components/ui/sonner";
import { StudioArtifactImage } from "./StudioArtifactImage";
import { contractJobs, contractVariants, type Contract, type Variant, type Sheet as ContractSheet } from "@/lib/types/contract";
import { devDetails } from "@/lib/api";
import { gateOf } from "@/features/projects/lib/gate";
import { useDesignEditor } from "@/features/design/lib/useDesignEditor";
import { useDesignActions, type ConfirmRequest } from "@/features/design/lib/useDesignActions";
import { Silhouette } from "@/features/design/components/Silhouette";
import { ElementLibraryDrawer } from "@/features/design/library/ElementLibraryDrawer";
import { freeSlotsOf } from "@/features/design/contracts";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";

export function StudioScreen({ projectId = "" }: ScreenProps) {
  const { status } = useAgentStatus();
  const gate = gateOf(status, false);
  const project = useProject(projectId);
  const editor = useDesignEditor(projectId, status, "sheets", () => undefined);
  const [section, setSection] = React.useState<Section | null>(null);
  const [scope, setScope] = React.useState<StudioScope>("overview");
  const [gen, setGen] = React.useState(false);
  const [generateAll, setGenerateAll] = React.useState(false);
  const [library, setLibrary] = React.useState(false);
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [sheetViews, setSheetViews] = React.useState<Record<string, SheetView>>({});
  const start = useStartRun(projectId);
  const doctor = useDoctor({ enabled: gen });
  const contract = editor.api.contract;
  const variant = contract ? contractVariants(contract)[0] : undefined;
  const actions = useDesignActions(editor.api, setConfirm, () => undefined, () => setLibrary(true));
  const jobs = contract ? contractJobs(contract) : [];
  const scopeSheets = new Set(scope === "characters" ? contract?.sheets.filter(s => s.id.startsWith("pose-")).map(s => s.id) : scope === "ui" ? contract?.sheets.filter(s => !s.id.startsWith("pose-") && !s.id.startsWith("bg")).map(s => s.id) : scope === "background" ? contract?.sheets.filter(s => s.id.startsWith("bg") || (s.grid.cols === 1 && s.grid.rows === 1)).map(s => s.id) : contract?.sheets.map(s => s.id));
  const scopedJobs = jobs.filter(({ sheet }) => scopeSheets.has(sheet) && (!picked.size || [...picked].some((key) => key.startsWith(`${sheet}:`)))).map((x) => x.job);
  const selectedJobs = generateAll ? jobs.map(x => x.job) : scopedJobs;
  const draw = () => {
    if (!contract || gate.readOnly || doctor.data?.imageGen?.available === false) return;
    start.mutate({ kind: "gen", jobs: selectedJobs, maxJobs: 4, autoSliceAfterGen: true }, { onSuccess: () => setGen(false) });
  };
  const slice = () => { if (jobs.length && !gate.readOnly) start.mutate({ kind: "slice", jobs: jobs.map((x) => x.job), maxJobs: 4, autoSliceAfterGen: false }); };
  const copy = () => void navigator.clipboard?.writeText(contract?.sheets.flatMap((s) => s.components).map((c) => c.vi || c.file).join("\n") ?? "");

  useRegisterCommands(() => [
    { id: "kit.draw", label: "Bộ kit của bạn · Vẽ", run: () => setGen(true), disabledReason: gate.readOnly ? gate.reason : null },
    { id: "kit.slice", label: "Bộ kit của bạn · Cắt", run: slice, disabledReason: gate.readOnly ? gate.reason : null },
    { id: "kit.copy", label: "Bộ kit của bạn · Copy sang Figma", run: copy },
    { id: "kit.settings.style", label: "Bộ kit của bạn · Cài đặt mục Phong cách", run: () => setSection("style") },
    { id: "kit.settings.brand", label: "Bộ kit của bạn · Cài đặt mục Thương hiệu", run: () => setSection("brand") },
    { id: "kit.settings.ui", label: "Bộ kit của bạn · Cài đặt mục Các món UI", run: () => setSection("ui") },
    { id: "kit.settings.characters", label: "Bộ kit của bạn · Cài đặt mục Nhân vật", run: () => setSection("characters") },
  ], [gate.readOnly, gate.reason, jobs.map((x) => x.job).join(","), picked.size]);

  if (project.isLoading || editor.phase === "loading") return <div className="p-6"><LoadingState count={4} label="Đang mở bộ kit…" /></div>;
  if (project.error || editor.phase === "error" || !contract) return <div className="p-6"><ErrorState title="Chưa mở được bộ kit" description="Thử lại sau. Bản thiết kế trên máy vẫn được giữ nguyên." detail={devDetails(project.error ?? editor.loadError)} actions={<Button onClick={() => void project.refetch()}>Thử lại</Button>} /></div>;

  return <main className="relative min-h-[calc(100vh-var(--kg-header))] pb-28 pt-8">
    {/* P-SWEEP·bảng-4 — `kg-page` bọc NGOÀI banner, không đắp lên chính nó: `kg-page`
        mang padding ngang của TRANG còn banner tự có padding của THẺ; đắp chung thì hai
        padding cộng dồn và thẻ mất mép (đúng cái bẫy `WorkflowScreen` đã ghi lại). */}
    {gate.readOnly && <div className="kg-page mb-8"><InlineBanner tone="warn" title="Công cụ trên máy chưa chạy" description="Bạn vẫn xem được bản thiết kế lần cuối. Thay đổi sẽ lưu khi công cụ chạy lại." /></div>}
    <header className="kg-page mb-6"><p className="eyebrow">Production studio</p><h1 className={DISPLAY}>Điều khiển từng <span className={SERIF}>phần</span></h1><p className="mt-3 max-w-2xl text-body text-fg-muted">Visual chung ở một nơi; UI, mascot và background có inspector, lượt tạo và lịch sử riêng.</p></header>
    <div className="kg-page studio-production-grid">
      <nav className="studio-scope-nav" aria-label="Phạm vi studio">
        <span className="eyebrow">Phạm vi</span>
        {([ ["overview","Tổng thể",Palette], ["ui","UI kit",SlidersHorizontal], ["characters","Mascot",Users], ["background","Background",ImageIcon] ] as const).map(([id,label,Icon]) => <button key={id} className={scope===id?"active":""} onClick={()=>setScope(id)}><Icon aria-hidden/><span>{label}</span><small>{id==="overview"?jobs.length:contract.sheets.filter(sh=>id==="characters"?sh.id.startsWith("pose-"):id==="background"?(sh.id.startsWith("bg")||(sh.grid.cols===1&&sh.grid.rows===1)):!sh.id.startsWith("pose-")&&!sh.id.startsWith("bg")).length}</small></button>)}
        <div className="studio-nav-note"><strong>Visual chung</strong><span>{variant?.style || "Chưa mô tả"}</span><Button variant="ghost" size="sm" onClick={()=>setSection("style")}><Settings2/>Chỉnh toàn cục</Button></div>
      </nav>
      <section className="studio-stage">
        {scope === "overview" && <><Section icon={Palette} title="Visual chung" description="Mọi phần kế thừa art direction và thương hiệu này; override chỉ dùng khi thật cần." onSettings={()=>setSection("style")}><StyleBlock variant={variant} actions={actions}/></Section><Section icon={Paintbrush} title="Thương hiệu" description="Màu và key visual áp dụng xuyên suốt." onSettings={()=>setSection("brand")}><BrandBlock variant={variant}/></Section></>}
        {scope === "ui" && <Section icon={SlidersHorizontal} title="UI kit" description="Chọn sheet hoặc từng món, xem skeleton/generated/cut rồi tạo lại riêng phạm vi này." onSettings={()=>setSection("ui")}><UIBlock projectId={projectId} variantId={variant?.id ?? ""} contract={contract} picked={picked} setPicked={setPicked} onAdd={()=>setLibrary(true)} views={sheetViews} setViews={setSheetViews} projectState={editor.projectState.jobs}/></Section>}
        {scope === "characters" && <Section icon={Users} title="Mascot & pose" description="Ảnh nhận diện, pose sheet và phiên bản ảnh của nhân vật." onSettings={()=>setSection("characters")}><CharacterBlock variant={variant} actions={actions}/></Section>}
        {scope === "background" && <Section icon={ImageIcon} title="Background" description="Các scene nền tách khỏi UI kit để có thể tạo lại độc lập." onSettings={()=>setSection("ui")}><UIBlock projectId={projectId} variantId={variant?.id ?? ""} contract={{...contract,sheets:contract.sheets.filter(sh=>sh.id.startsWith("bg")||(sh.grid.cols===1&&sh.grid.rows===1))}} picked={picked} setPicked={setPicked} onAdd={()=>setLibrary(true)} views={sheetViews} setViews={setSheetViews} projectState={editor.projectState.jobs}/></Section>}
      </section>
      <aside className="studio-inspector"><span className="eyebrow">Inspector</span><h2>{scope === "overview"?"Visual toàn bộ":scope === "ui"?"UI kit":scope === "characters"?"Mascot":"Background"}</h2><p>{selectedJobs.length} job trong phạm vi hiện tại</p><div className="studio-inspector-actions"><Button className={CTA} disabled={gate.readOnly||selectedJobs.length===0} onClick={()=>{setGenerateAll(false);setGen(true)}}><Sparkles/>Generate phần này</Button><Button variant="secondary" disabled={gate.readOnly} onClick={()=>{setGenerateAll(true);setGen(true)}}>Generate toàn bộ</Button></div><div className="studio-version-note"><strong>Version theo từng job</strong><span>Mỗi ảnh giữ tối đa 3 đời raw; có thể khôi phục mà không tốn quota.</span></div></aside>
    </div>
    <div className="fixed inset-x-0 bottom-4 z-floatbar flex justify-center px-4"><FloatingToolbar aria-label="Hành động trên bộ kit" left={<Button size="sm" className={CTA} disabled={gate.readOnly} onClick={() => setGen(true)}><Sparkles aria-hidden />Vẽ</Button>} center={<Button variant="ghost" size="sm" disabled={gate.readOnly} onClick={slice}><Scissors aria-hidden />Cắt</Button>} right={<><Button variant="ghost" size="sm" onClick={copy}><Copy aria-hidden />Copy sang Figma</Button><span className="hidden px-2 text-caption text-fg-muted sm:inline">{editor.api.dirty ? "Đang tự lưu…" : "Đã tự lưu"}</span></>} /></div>
    <DrawDialog open={gen} onOpenChange={(v)=>{setGen(v);if(!v)setGenerateAll(false)}} count={selectedJobs.length} sheets={contract.sheets.length} blocked={doctor.data?.imageGen?.available === false} pending={start.isPending} onDraw={draw} />
    <ElementLibraryDrawer open={library} onOpenChange={setLibrary} targetSheetId={contract.sheets[0]?.id ?? null} targetSheetLabel={contract.sheets[0]?.id ?? null} freeSlots={freeSlotsOf(contract.sheets[0])} existingFiles={contract.sheets[0]?.components.map((c) => c.file) ?? []} readOnly={editor.api.readOnly} readOnlyReason={editor.api.readOnlyReason} onAdd={(items, opts) => actions.addElements(contract.sheets[0]?.id ?? "", items, opts)} />
    <SettingsDrawer section={section} onClose={() => setSection(null)} contract={contract} actions={actions} api={editor.api} />
    <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}><DialogContent><DialogHeader><DialogTitle>{confirm?.title}</DialogTitle><DialogDescription>{confirm?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setConfirm(null)}>Thôi</Button><Button variant="danger" onClick={() => { confirm?.onConfirm(); setConfirm(null); }}>{confirm?.actionLabel}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

type StudioScope = "overview" | "ui" | "characters" | "background";
type Section = "style" | "brand" | "ui" | "characters";
type SheetView = "skeleton" | "drawn" | "cut";

function Section({ icon: Icon, title, description, onSettings, children }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; onSettings: () => void; children: React.ReactNode }) {
  return <section className={`${CARD} p-6 sm:p-8`}><div className="mb-8 flex items-start gap-4"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-accent-text"><Icon aria-hidden className="size-5" /></div><div className="min-w-0 flex-1"><h2 className="text-title text-fg-strong">{title}</h2><p className="mt-1 max-w-2xl text-body text-fg-muted">{description}</p></div><Button variant="ghost" size="sm" onClick={onSettings}><Settings2 aria-hidden />Cài đặt</Button></div>{children}</section>;
}

function StyleBlock({ variant, actions }: { variant?: Variant; actions: ReturnType<typeof useDesignActions> }) {
  const [tab, setTab] = React.useState(variant?.styleMode === "inspo" ? "inspo" : "prompt");
  if (!variant) return <EmptyState icon={Palette} title="Chưa có phong cách" description="Mở cài đặt để thêm phong cách đầu tiên." />;
  return <Tabs value={tab} onValueChange={(v) => { setTab(v); actions.patchVariant(variant.id, { styleMode: v as "prompt" | "inspo" }); }}><TabsList><TabsTrigger value="prompt"><Paintbrush aria-hidden />Gõ mô tả</TabsTrigger><TabsTrigger value="inspo"><ImageIcon aria-hidden />Ảnh tham khảo</TabsTrigger></TabsList><TabsContent value="prompt" className="mt-5"><Textarea value={variant.style} onChange={(e) => actions.patchVariant(variant.id, { style: e.target.value })} rows={4} placeholder="Ví dụ: vui, chất liệu đất sét, màu ấm…" /></TabsContent><TabsContent value="inspo" className="mt-5"><div className="flex min-h-32 items-center justify-center rounded-3 border border-dashed border-line bg-canvas p-8 text-center text-body text-fg-muted"><ImageIcon className="mr-3 size-5" aria-hidden />Dán ảnh tham khảo hoặc mở Cài đặt để thêm ảnh.</div></TabsContent></Tabs>;
}

function BrandBlock({ variant }: { variant?: Variant }) {
  const primary = variant?.brand?.primary;
  const secondary = variant?.brand?.secondary;
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-32 min-w-48 overflow-hidden rounded-4 border border-line" aria-label="Xem trước bảng màu"><div className="flex-1 bg-raised" style={primary ? { backgroundColor: primary } : undefined} /><div className="flex-1 bg-overlay" style={secondary ? { backgroundColor: secondary } : undefined} /></div><div><div className="flex flex-wrap gap-2 text-subtitle text-fg-strong"><span>{primary ?? "Chưa chọn màu"}</span><span>{secondary ?? "Chưa chọn màu phụ"}</span></div><p className="mt-1 text-body text-fg-muted">Màu chính và màu phụ của bộ kit.</p></div></div>;
}

function UIBlock({ projectId, variantId, contract, picked, setPicked, onAdd, views, setViews, projectState }: { projectId: string; variantId: string; contract: Contract; picked: Set<string>; setPicked: React.Dispatch<React.SetStateAction<Set<string>>>; onAdd: () => void; views: Record<string, SheetView>; setViews: React.Dispatch<React.SetStateAction<Record<string, SheetView>>>; projectState: Record<string, string> }) {
  const items = contract.sheets.flatMap((s) => s.components.filter((c) => c.skel.shape !== "empty").map((c) => ({ ...c, sheet: s.id })));
  return <div className="flex flex-col gap-8"><div className="grid items-start gap-6 md:grid-cols-2">{contract.sheets.map((sheet, sheetIndex) => <SheetCard key={sheet.id} projectId={projectId} job={`${variantId}-${sheet.id}`} sheet={sheet} index={sheetIndex} picked={picked} setPicked={setPicked} view={views[sheet.id] ?? "skeleton"} setView={(view) => setViews((old) => ({ ...old, [sheet.id]: view }))} hasResult={Object.keys(projectState).some((job) => job.endsWith(`-${sheet.id}`))} />)}</div><div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-subtle pt-5"><p className="text-caption text-fg-muted">{items.length} món trong {contract.sheets.length} tấm · {picked.size ? `${picked.size} món đang chọn` : "đang chọn tất cả"}</p><Button variant="secondary" size="sm" onClick={onAdd}><Plus aria-hidden />Thêm món</Button></div></div>;
}

function sheetLabel(sheet: ContractSheet, index: number): string {
  if (sheet.grid.cols === 1 && sheet.grid.rows === 1) return sheet.note || "Nền màn hình chính";
  if (sheet.orient === "portrait") return `Tấm ${index + 1} · dọc`;
  return `Tấm ${index + 1} · ngang`;
}

function SheetCard({ projectId, job, sheet, index, picked, setPicked, view, setView, hasResult }: { projectId: string; job: string; sheet: ContractSheet; index: number; picked: Set<string>; setPicked: React.Dispatch<React.SetStateAction<Set<string>>>; view: SheetView; setView: (view: SheetView) => void; hasResult: boolean }) {
  const realItems = sheet.components.filter((c) => c.skel.shape !== "empty");
  return <article className="rounded-4 border border-line-subtle bg-canvas p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="kg-label-above">{sheetLabel(sheet, index)}</p><h3 className="mt-1 text-subtitle text-fg-strong">{realItems.length} món</h3></div>{hasResult ? <span className="rounded-full bg-accent/[var(--kg-tint-a)] px-2 py-1 text-caption text-accent-text">Có ảnh</span> : <span className="rounded-full bg-raised px-2 py-1 text-caption text-fg-muted">Chưa vẽ</span>}</div><div className="mb-4">{view === "skeleton" ? <div className="grid grid-cols-4 gap-2 rounded-3 bg-raised p-3">{sheet.components.map((item, itemIndex) => <button type="button" key={`${item.file}-${itemIndex}`} aria-label={`${item.vi || "Ô trống"} trong ${sheet.id}`} aria-pressed={!picked.size || picked.has(`${sheet.id}:${item.file}`)} onClick={() => setPicked((old) => { const key = `${sheet.id}:${item.file}`; const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })} className={`${FOCUS} flex aspect-square items-center justify-center rounded-2 border border-line-subtle bg-surface p-2`}><Silhouette skel={item.skel} orient={sheet.orient} uid={`studio-${index}-${itemIndex}`} className="size-full text-fg-muted" /></button>)}</div> : view === "drawn" ? <StudioArtifactImage projectId={projectId} path={`raw/${job}.png`} alt={`${sheet.id} — ảnh đã vẽ`} /> : <CutPreview projectId={projectId} job={job} sheet={sheet} />}</div><ToggleGroup type="single" value={view} onValueChange={(next) => next && setView(next as SheetView)} variant="outline" size="sm" aria-label={`Kết quả của ${sheet.id}`} className="w-full"><ToggleGroupItem value="skeleton" className="flex-1 text-caption">Khung xương</ToggleGroupItem><ToggleGroupItem value="drawn" className="flex-1 text-caption">Ảnh đã vẽ</ToggleGroupItem><ToggleGroupItem value="cut" className="flex-1 text-caption">Đã cắt</ToggleGroupItem></ToggleGroup><ArtifactVersions projectId={projectId} job={job} /></article>;
}

function CutPreview({ projectId, job, sheet }: { projectId: string; job: string; sheet: ContractSheet }) {
  const first = sheet.components.find(c => c.skel.shape !== "empty");
  return first ? <StudioArtifactImage projectId={projectId} path={`kits/${job.slice(0, Math.max(0, job.length-sheet.id.length-1))}/tight/${first.file}.png`} alt={`${first.vi} — ảnh đã cắt`} /> : <CheckerboardImage alt="" fallbackText="Tấm này chưa có món để cắt" className="aspect-[4/2]" />;
}
function ArtifactVersions({ projectId, job }: { projectId: string; job: string }) {
  const history = useRawHistory(projectId, job);
  const restore = useRestoreRaw(projectId);
  if (!history.data?.items.length) return <p className="mt-3 text-caption text-fg-muted">Chưa có phiên bản ảnh.</p>;
  return <div className="artifact-versions"><span>Phiên bản</span>{history.data.items.map((item, i) => <button key={item.id} disabled={item.current || restore.isPending} onClick={() => restore.mutate({job,historyId:item.id},{onSuccess:()=>toast.success("Đã khôi phục ảnh cũ."),onError:()=>toast.error("Chưa khôi phục được ảnh.")})}>{item.current?"Hiện tại":`v${history.data.items.length-i}`}<small>{item.at ? new Date(item.at).toLocaleString("vi-VN") : ""}</small></button>)}</div>;
}

function CharacterBlock({ variant, actions }: { variant?: Variant; actions: ReturnType<typeof useDesignActions> }) { return <div className="flex flex-wrap gap-3"><div className="flex min-h-28 min-w-56 items-center justify-center rounded-3 border border-dashed border-line bg-canvas p-6" aria-label="Minh hoạ nhân vật"><Users className="size-10 text-fg-muted" aria-hidden /><span className="text-caption text-fg-muted">Chưa có nhân vật nào</span></div>{(variant?.characters ?? []).map((c) => <div key={c.id} className="flex min-w-56 items-center gap-3 rounded-3 border border-line-subtle bg-canvas p-3"><div className="flex size-12 items-center justify-center rounded-full bg-raised text-display" aria-hidden>◌</div><div className="min-w-0 flex-1"><p className="truncate text-subtitle text-fg-strong">{c.vi || c.id}</p><p className="text-caption text-fg-muted">{c.poses?.length ?? 0} dáng</p></div><Button variant="ghost" size="icon-sm" aria-label={`Xoá nhân vật ${c.vi || c.id}`} onClick={() => actions.deleteCharacter(variant!.id, c.id)}><Trash2 aria-hidden /></Button></div>)}<Button variant="secondary" size="sm" onClick={actions.addCharacter}><Plus aria-hidden />Thêm nhân vật</Button></div>; }

function SettingsDrawer({ section, onClose, contract, actions, api }: { section: Section | null; onClose: () => void; contract: Contract; actions: ReturnType<typeof useDesignActions>; api: ReturnType<typeof useDesignEditor>["api"] }) {
  const variant = contractVariants(contract)[0];
  const title = section === "style" ? "Cài đặt Phong cách" : section === "brand" ? "Cài đặt Thương hiệu" : section === "ui" ? "Cài đặt Các món UI" : "Cài đặt Nhân vật";
  return <Sheet open={section !== null} onOpenChange={(open) => !open && onClose()}><SheetContent side="right"><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>Chỉnh sâu mục này mà không rời trang studio.</SheetDescription></SheetHeader><SheetBody>{section === "style" && variant && <div className="flex flex-col gap-4"><Input aria-label="Tên phong cách" value={variant.vi} onChange={(e) => actions.patchVariant(variant.id, { vi: e.target.value })} placeholder="Tên phong cách" /><Textarea aria-label="Mô tả phong cách" rows={6} value={variant.style} onChange={(e) => actions.patchVariant(variant.id, { style: e.target.value })} placeholder="Mô tả cho máy…" /></div>}{section === "brand" && variant && <div className="flex flex-col gap-4"><label className="text-label text-fg-strong">Màu chính<Input aria-label="Màu chính" type="color" value={variant.brand?.primary ?? ""} onChange={(e) => actions.patchBrand(variant.id, { primary: e.target.value })} /></label><label className="text-label text-fg-strong">Màu phụ<Input aria-label="Màu phụ" type="color" value={variant.brand?.secondary ?? ""} onChange={(e) => actions.patchBrand(variant.id, { secondary: e.target.value })} /></label></div>}{section === "ui" && <div className="flex flex-col gap-4"><p className="text-body text-fg-muted">Chọn thêm món từ thư viện. Việc bỏ chọn có thể hoàn tác bằng ⌘Z.</p><Button variant="secondary" onClick={() => actions.addSheet("blank")} disabled={api.readOnly}>Thêm tấm trống</Button></div>}{section === "characters" && <CharacterBlock variant={variant} actions={actions} />}</SheetBody></SheetContent></Sheet>;
}

function DrawDialog({ open, onOpenChange, count, sheets, blocked, pending, onDraw }: { open: boolean; onOpenChange: (open: boolean) => void; count: number; sheets: number; blocked: boolean; pending: boolean; onDraw: () => void }) { return <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}><DialogContent><DialogHeader><DialogTitle>Vẽ bộ kit này?</DialogTitle><DialogDescription>Máy sẽ vẽ {count} món trong {sheets} tấm · tốn khoảng {Math.max(1, count)} lượt · ảnh cũ giữ lại.</DialogDescription></DialogHeader><div className="flex flex-col gap-3"><p className="text-body text-fg-muted">Những tấm đã vẽ sẽ không bị mất. Bạn có thể chỉnh tiếp sau khi bắt đầu.</p>{blocked && <div role="alert" className="rounded-3 border border-warn/60 bg-warn/10 p-3 text-body text-fg">Tài khoản chưa bật tạo ảnh. Vào Cài đặt để khắc phục; nút Vẽ luôn sẽ mở lại sau đó.</div>}</div><DialogFooter><Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>Thôi</Button><Button variant="primary" loading={pending} disabled={blocked || count === 0} onClick={onDraw}><Sparkles aria-hidden />Vẽ luôn</Button></DialogFooter></DialogContent></Dialog>; }
