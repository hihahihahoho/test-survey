import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Trash2, Play, Plus, Settings, FolderOpen, Boxes, Terminal, ChevronRight, Inbox,
  Copy, Frame, Maximize2, MousePointer2, StickyNote, ZoomIn, ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast, KG_TOAST_DURATION } from "@/components/ui/sonner";

import {
  AgentStatusPill, CheckerboardImage, ConfirmDestructive, CopyableCode,
  EmptyState, ErrorState, FloatingToolbar, JobStatusBadge, KeyboardHint, LoadingState, RunStatusBadge, StatusDot,
} from "@/components/common";
import { AGENT_STATUS, JOB_STATUS, RUN_STATUS, type AgentStatus, type JobStatus, type RunStatus } from "@/lib/status";
import { useUiStore } from "@/lib/store";
import { DISPLAY, SERIF, FLOATBAR, DOTGRID } from "@/components/layout/flora";

/* Story do nhánh C/D bàn giao. Q CHỈ GHÉP, không sửa component (FE2-PLAN §2 "Q không sửa
   logic để làm xanh test").

   VÌ SAO `React.lazy` CHỨ KHÔNG PHẢI import tĩnh: lượt đầu tôi import tĩnh, build lại thì
   `dist/assets/canvas-*.js` tụt từ 19.26 kB xuống 1.86 kB còn chunk chung `common-*.js`
   phồng từ 361.92 lên 391.31 kB — Rolldown thấy `features/canvas` được hai điểm vào dùng
   (route thật + trang preview) nên hoisted nó vào chunk chung, làm rỗng ruột việc lazy mà
   E1 vừa dựng. Test đếm chunk của E1 vẫn xanh vì nó chỉ đếm SỐ chunk `canvas-*`, không đo
   kích thước ⇒ đây đúng là loại hồi quy im lặng. `React.lazy` giữ trang preview là điểm
   vào riêng: chunk chung trở lại đúng 361.92 kB (cùng hash với bản E1 bàn giao). */
const SubfilePreview = React.lazy(() =>
  import("@/features/docs/__preview__").then((m) => ({ default: m.SubfilePreview })),
);
const SubfileCrudPreview = React.lazy(() =>
  import("@/features/docs/__preview__").then((m) => ({ default: m.SubfileCrudPreview })),
);
const SubfileA11yPreview = React.lazy(() =>
  import("@/features/docs/__preview__").then((m) => ({ default: m.SubfileA11yPreview })),
);
const CanvasPreview = React.lazy(() =>
  import("@/features/canvas/__preview__").then((m) => ({ default: m.CanvasPreview })),
);

/** Story nạp rời ⇒ phải có lối chờ tử tế, không nhảy layout, không trắng khối. */
function StoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-col gap-2 p-6" aria-busy="true">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      {children}
    </React.Suspense>
  );
}

/* ---------------------------------------------------------------- helpers */

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-line-subtle pt-8">
      <h2 className="text-title text-fg-strong">{title}</h2>
      {note && <p className="mt-1 max-w-3xl text-body text-fg">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle py-3 last:border-0">
      <span className="w-40 shrink-0 text-caption uppercase tracking-label text-fg-muted-raised">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

/**
 * Trang showcase component của R0.
 * Khai route nằm ở `-preview-route.tsx` và nạp file này bằng `lazyRouteComponent`,
 * để 700+ dòng showcase KHÔNG đi vào bundle của người dùng thật (đo bằng
 * `npm run build`: chunk chính 850.78 kB → 611.89 kB).
 */
export function PreviewPage() {
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const [confirmSoft, setConfirmSoft] = React.useState(false);
  const [confirmHard, setConfirmHard] = React.useState(false);
  const [progress, setProgress] = React.useState(38);

  React.useEffect(() => {
    document.title = "Showcase component — kit-gen";
  }, []);

  // ⌘K để mở bảng lệnh (§2.3)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`min-h-dvh bg-canvas ${DOTGRID}`}>
      <header className={`sticky top-4 z-sticky mx-4 flex h-14 items-center gap-3 px-4 ${FLOATBAR}`}>
        <span className="text-label font-semibold text-fg-strong">Showcase component</span>
        <Badge tone="accent">chỉ dành cho dev &amp; QA</Badge>
        <div className="flex-1" />
        <KeyboardHint keys={["mod", "K"]} />
        <Button variant="secondary" size="sm" onClick={toggleTheme}>
          Theme: {theme}
        </Button>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16">
        <div>
          <h1 className={`${DISPLAY} text-fg-strong`}>Thư viện thành phần <span className={SERIF}>kit-gen v2</span></h1>
          <p className="mt-2 max-w-3xl text-body text-fg">
            Mọi component ở mọi trạng thái, để team màn tra cứu và QA soi. Đổi theme bằng nút góc phải
            để kiểm cả hai bảng màu. Số tương phản của token được kiểm bằng{" "}
            <code className="font-mono text-mono text-accent-text">npm run contrast</code>.
          </p>
        </div>

        {/* ---------------------------------------------------------- TOKEN */}
        <Section id="tokens" title="1 · Token màu (§5.3)" note="Cấm dùng hex thô trong component. Chỉ dùng tên semantic dưới đây.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["bg-canvas", "canvas"], ["bg-surface", "surface"], ["bg-raised", "raised"], ["bg-overlay", "overlay"],
            ].map(([cls, name]) => (
              <div key={name} className="rounded-2 border border-line-subtle p-3">
                <div className={`${cls} mb-2 h-12 rounded-1 border border-line-subtle`} />
                <code className="font-mono text-mono text-fg">{name}</code>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-1 rounded-2 border border-line-subtle bg-surface p-4">
            <p className="text-fg-strong">text-fg-strong — tiêu đề, số liệu chính</p>
            <p className="text-fg">text-fg — chữ chính (mặc định)</p>
            <p className="text-fg-muted">text-fg-muted — chỉ trên canvas/surface</p>
            <p className="text-fg-muted-raised">text-fg-muted-raised — dùng khi nền là raised/overlay</p>
            <p className="text-accent-text">text-accent-text — link, id job (KHÔNG dùng text-accent làm chữ)</p>
          </div>
        </Section>

        {/* --------------------------------------------------------- BUTTON */}
        <Section id="button" title="2 · Nút — 5 biến thể × 3 cỡ (§5.4)" note="Mỗi màn TỐI ĐA 1 nút primary. Không có biến thể thứ 6.">
          <Row label="primary">
            <Button variant="primary" size="sm">Nhỏ</Button>
            <Button variant="primary">Vừa</Button>
            <Button variant="primary" size="lg">Lớn</Button>
            <Button variant="primary" loading>Đang chạy</Button>
            <Button variant="primary" disabled>Khoá</Button>
          </Row>
          <Row label="secondary">
            <Button variant="secondary" size="sm">Nhỏ</Button>
            <Button variant="secondary">Vừa</Button>
            <Button variant="secondary" size="lg">Lớn</Button>
            <Button variant="secondary" loading>Đang chạy</Button>
            <Button variant="secondary" disabled>Khoá</Button>
          </Row>
          <Row label="ghost">
            <Button variant="ghost" size="sm">Nhỏ</Button>
            <Button variant="ghost">Vừa</Button>
            <Button variant="ghost" disabled>Khoá</Button>
            <Button variant="ghost" size="icon" aria-label="Cài đặt"><Settings aria-hidden /></Button>
          </Row>
          <Row label="danger">
            <Button variant="danger" size="sm">Xoá</Button>
            <Button variant="danger"><Trash2 aria-hidden />Xoá vĩnh viễn</Button>
            <Button variant="danger" loading>Đang xoá</Button>
          </Row>
          <Row label="link">
            <Button variant="link">Vì sao lại thế?</Button>
          </Row>
          <Row label="icon-only + tooltip">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Sinh ảnh"><Play aria-hidden /></Button>
              </TooltipTrigger>
              <TooltipContent>Sinh ảnh</TooltipContent>
            </Tooltip>
            <span className="text-caption text-fg-muted-raised">icon-only BẮT BUỘC có aria-label + tooltip</span>
          </Row>
        </Section>

        {/* ---------------------------------------------------- JOB STATUS */}
        <Section
          id="status"
          title="3 · Trạng thái job — 7 trạng thái chuẩn (§5.7)"
          note="Icon + chữ LUÔN đi cùng. Không có badge chỉ-màu. Màn không được tự chế nhãn — đọc từ lib/status.ts."
        >
          <div className="flex flex-wrap gap-2">
            {(Object.keys(JOB_STATUS) as JobStatus[]).map((s) => (
              <JobStatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <JobStatusBadge status="running" detail="01:12" />
            <JobStatusBadge status="ok" detail="1m48s · 2.9 MB" />
            <JobStatusBadge status="failed" detail="hết quota" />
          </div>
          <p className="mt-4 text-caption uppercase tracking-label text-fg-muted-raised">Trạng thái lượt chạy (run)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(RUN_STATUS) as RunStatus[]).map((s) => (
              <RunStatusBadge key={s} status={s} progress={s === "running" ? "3/8" : s === "done-with-errors" ? "5/8 · 3 lỗi" : undefined} />
            ))}
          </div>
          <p className="mt-4 text-caption uppercase tracking-label text-fg-muted-raised">StatusDot (§5.6)</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <StatusDot tone="ok" label="Đã kết nối" />
            <StatusDot tone="running" label="Đang sinh ảnh" pulse />
            <StatusDot tone="danger" label="Lỗi" />
          </div>
        </Section>

        {/* -------------------------------------------------- AGENT PILL */}
        <Section id="agent" title="4 · Agent pill — 6 trạng thái (§2.4)" note="Pill LUÔN có chữ, không bao giờ chỉ có màu.">
          <div className="flex flex-wrap gap-2 rounded-2 border border-line-subtle bg-surface p-3">
            {(Object.keys(AGENT_STATUS) as AgentStatus[]).map((s) => (
              <AgentStatusPill key={s} status={s} />
            ))}
          </div>
        </Section>

        {/* ----------------------------------------------------- FORM */}
        <Section id="form" title="5 · Nhập liệu + Form (react-hook-form + zod)">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-input">Input</Label>
                <Input id="pv-input" placeholder="Tết 2026 — VietinBank iPay" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-input-err">Input · lỗi</Label>
                <Input id="pv-input-err" aria-invalid defaultValue="tên trùng" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-input-dis">Input · khoá</Label>
                <Input id="pv-input-dis" disabled defaultValue="Cần công cụ local đang chạy" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-ta">Textarea</Label>
                <Textarea id="pv-ta" placeholder="Mô tả bộ kit…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pv-select">Select</Label>
                <Select>
                  <SelectTrigger id="pv-select"><SelectValue placeholder="Chọn phong cách" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a">Phong cách A — Tết đỏ</SelectItem>
                    <SelectItem value="b">Phong cách B — Hiện đại</SelectItem>
                    <SelectItem value="c">Phong cách C — Tối giản</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Checkbox id="pv-cb" defaultChecked />
                <Label htmlFor="pv-cb">Tự động cắt sau khi sinh ảnh</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pv-cb2" checked="indeterminate" />
                <Label htmlFor="pv-cb2">Chọn một phần (indeterminate)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="pv-sw" defaultChecked />
                <Label htmlFor="pv-sw">Hiện panel dev</Label>
              </div>
              <RadioGroup defaultValue="magenta" className="gap-2">
                <span className="text-label text-fg-strong">Nhóm lựa chọn</span>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="magenta" id="pv-r1" />
                  <Label htmlFor="pv-r1">Magenta</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="green" id="pv-r2" />
                  <Label htmlFor="pv-r2">Xanh lá</Label>
                </div>
              </RadioGroup>
              <div className="flex flex-col gap-2">
                <Label>Slider — số lượt chạy song song</Label>
                <Slider defaultValue={[4]} max={8} min={1} step={1} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Toggle aria-label="Bật lưới">Lưới</Toggle>
                <ToggleGroup type="single" defaultValue="sheets">
                  <ToggleGroupItem value="sheets">Sheet</ToggleGroupItem>
                  <ToggleGroupItem value="styles">Phong cách</ToggleGroupItem>
                  <ToggleGroupItem value="advanced">Nâng cao</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </div>

          <Separator className="my-6" />
          <DemoForm />
        </Section>

        {/* ------------------------------------------------------ OVERLAY */}
        <Section
          id="overlay"
          title="6 · Overlay — modal · drawer · menu · bảng lệnh (§5.5)"
          note="Mở thử rồi bấm Tab để kiểm focus trap, bấm Esc để kiểm đóng. QA soi ở đây."
        >
          <Row label="Dialog">
            <Dialog>
              <DialogTrigger asChild><Button variant="secondary">Mở modal (md)</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bắt đầu sinh ảnh</DialogTitle>
                  <DialogDescription>Cửa duy nhất tiêu quota — luôn hiện số lượt trước khi chạy.</DialogDescription>
                </DialogHeader>
                <DialogBody className="flex flex-col gap-3">
                  <div className="flex justify-between text-body"><span className="text-fg">Số lượt sinh ảnh</span><span className="text-fg-strong">8 lượt</span></div>
                  <div className="flex justify-between text-body"><span className="text-fg">Ước lượng thời gian</span><span className="text-fg-strong">khoảng 12–18 phút</span></div>
                  <div className="rounded-2 kg-tint-warn p-3 text-caption text-on-tint-warn">
                    Mỗi lượt tiêu khoảng 3–5× quota ảnh. Con số là ước lượng nội bộ, không phải cam kết.
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary">Huỷ</Button>
                  <Button variant="primary">Chạy 8 lượt</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="secondary" onClick={() => setConfirmSoft(true)}>Xoá (phục hồi được)</Button>
            <Button variant="danger" onClick={() => setConfirmHard(true)}>Xoá vĩnh viễn (gõ tên)</Button>
          </Row>

          <Row label="Drawer / Sheet">
            <Sheet>
              <SheetTrigger asChild><Button variant="secondary">Drawer phải (480px)</Button></SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Trạng thái công cụ local</SheetTitle>
                  <SheetDescription>Phiên bản, thư mục làm việc, chẩn đoán nhanh.</SheetDescription>
                </SheetHeader>
                <SheetBody className="flex flex-col gap-3">
                  <StatusDot tone="ok" label="Đã kết nối · protocol khớp" />
                  <CopyableCode label="Lệnh chạy công cụ local" value="npx kitgen agent --port 8765" />
                </SheetBody>
              </SheetContent>
            </Sheet>

            <Sheet>
              <SheetTrigger asChild><Button variant="secondary">Drawer log (640px)</Button></SheetTrigger>
              <SheetContent size="wide">
                <SheetHeader><SheetTitle>Log lượt chạy</SheetTitle></SheetHeader>
                <SheetBody>
                  <div className="flex flex-col gap-0.5 font-mono text-mono">
                    <div><span className="text-fg-muted">12:04:01</span> <span className="text-accent-text">tet-hero</span> bắt đầu</div>
                    <div><span className="text-fg-muted">12:04:52</span> <span className="text-accent-text">tet-hero</span> xong · 2.9 MB</div>
                    <div className="rounded-1 bg-danger/10 px-1"><span className="text-fg-muted">12:05:03</span> <span className="text-accent-text">tet-icons</span> <span className="text-danger">lỗi: hết quota</span></div>
                  </div>
                </SheetBody>
              </SheetContent>
            </Sheet>

            <Drawer>
              <DrawerTrigger asChild><Button variant="secondary">Drawer đáy (màn hẹp)</Button></DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Điều hướng</DrawerTitle>
                  <DrawerDescription>Rail thu thành drawer ở mốc 768–1099px.</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 pb-8">
                  <Button variant="ghost" className="w-full justify-start"><Boxes aria-hidden />Tổng quan</Button>
                  <Button variant="ghost" className="w-full justify-start"><Settings aria-hidden />Cài đặt</Button>
                </div>
              </DrawerContent>
            </Drawer>
          </Row>

          <Row label="Menu ⋯ / Popover">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="secondary">Mở menu</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Project</DropdownMenuLabel>
                <DropdownMenuItem>Đổi tên<DropdownMenuShortcut>F2</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem>Nhân bản</DropdownMenuItem>
                <DropdownMenuItem>Xuất .zip</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive><Trash2 aria-hidden />Xoá</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild><Button variant="ghost" size="sm">Popover ⓘ</Button></PopoverTrigger>
              <PopoverContent>
                <p className="text-body">Nội dung dài hơn 48 ký tự phải nằm trong Popover bấm-mới-mở, không nhét vào tooltip.</p>
              </PopoverContent>
            </Popover>

            <Button variant="secondary" onClick={() => setCmdOpen(true)}>Bảng lệnh <KeyboardHint keys={["mod", "K"]} className="ml-1" /></Button>
          </Row>

          <Row label="Toast (§5.5)">
            <Button variant="secondary" size="sm" onClick={() => toast.success("Đã lưu bản thiết kế", { duration: KG_TOAST_DURATION.success })}>success 4s</Button>
            <Button variant="secondary" size="sm" onClick={() => toast("Đã xoá project", { duration: KG_TOAST_DURATION.successWithUndo, action: { label: "Hoàn tác", onClick: () => toast.success("Đã khôi phục") } })}>có Hoàn tác 10s</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info("Đang dùng dữ liệu cache", { duration: KG_TOAST_DURATION.info })}>info 5s</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.warning("Thiết kế đã đổi — cần sinh lại", { duration: KG_TOAST_DURATION.warning })}>warning 8s</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error("Không sinh được ảnh", { duration: KG_TOAST_DURATION.error, description: "Lỗi không tự đóng — phải bấm ✕ hoặc Esc." })}>error (không tự đóng)</Button>
          </Row>
        </Section>

        {/* ------------------------------------------------- DATA DISPLAY */}
        <Section id="data" title="7 · Hiển thị dữ liệu">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tết 2026 — VietinBank iPay</CardTitle>
                <CardDescription>3 phong cách · 8 sheet · 96 element</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <JobStatusBadge status="ok" />
                <JobStatusBadge status="stale" />
                <Badge tone="outline">tết</Badge>
              </CardContent>
              <CardFooter>
                <Button variant="primary" size="sm">Mở</Button>
                <Button variant="ghost" size="sm">Nhân bản</Button>
              </CardFooter>
            </Card>

            <div className="flex flex-col gap-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem><BreadcrumbLink href="#">Projects</BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbPage>Tết 2026</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="flex items-center gap-3">
                <Avatar><AvatarFallback>TN</AvatarFallback></Avatar>
                <Progress value={progress} className="flex-1" aria-label="Tiến độ sinh ảnh" />
                <Button variant="ghost" size="sm" onClick={() => setProgress((p) => (p + 20) % 120)}>+20</Button>
              </div>
              <Tabs defaultValue="sheets">
                <TabsList>
                  <TabsTrigger value="sheets">Sheet &amp; element</TabsTrigger>
                  <TabsTrigger value="styles">Phong cách</TabsTrigger>
                  <TabsTrigger value="advanced">Nâng cao</TabsTrigger>
                </TabsList>
                <TabsContent value="sheets"><p className="text-body text-fg">Nội dung tab Sheet.</p></TabsContent>
                <TabsContent value="styles"><p className="text-body text-fg">Nội dung tab Phong cách.</p></TabsContent>
                <TabsContent value="advanced"><p className="text-body text-fg">Nội dung tab Nâng cao.</p></TabsContent>
              </Tabs>
            </div>
          </div>

          <div className="mt-4 rounded-3 border border-line-subtle bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Phong cách</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Lần cuối</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["hero", "Tết đỏ", "ok", "12:04 hôm nay"],
                  ["icons", "Tết đỏ", "failed", "12:05 hôm nay"],
                  ["buttons", "Hiện đại", "stale", "hôm qua"],
                ].map(([sheet, variant, st, when]) => (
                  <TableRow key={sheet as string}>
                    <TableCell className="font-mono text-mono text-fg-strong">{sheet}</TableCell>
                    <TableCell>{variant}</TableCell>
                    <TableCell><JobStatusBadge status={st as JobStatus} /></TableCell>
                    <TableCell className="text-fg-muted-raised">{when}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-caption uppercase tracking-label text-fg-muted-raised">ScrollArea</p>
              <ScrollArea className="h-32 rounded-2 border border-line-subtle bg-surface p-3">
                <div className="flex flex-col gap-1 text-body text-fg">
                  {Array.from({ length: 20 }).map((_, i) => <span key={i}>Dòng nội dung số {i + 1}</span>)}
                </div>
              </ScrollArea>
            </div>
            <div>
              <p className="mb-2 text-caption uppercase tracking-label text-fg-muted-raised">CheckerboardImage (§5.6 Thumb)</p>
              <div className="flex gap-3">
                <CheckerboardImage alt="Nút bấm chính màu đỏ Tết" className="size-24" />
                <CheckerboardImage alt="Ảnh mẫu" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='40' cy='40' r='30' fill='%234DA9FF'/></svg>" className="size-24" />
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------ RESIZABLE */}
        <Section id="resizable" title="8 · Resizable — editor 3 vùng của S3" note="Handle đổi kích thước được bằng bàn phím: Tab tới thanh chia rồi bấm ← →.">
          <ResizablePanelGroup orientation="horizontal" className="h-56 rounded-3 border border-line-subtle">
            <ResizablePanel defaultSize="25%" minSize="15%">
              <div className="flex h-full flex-col gap-1 bg-surface p-3">
                <span className="text-caption uppercase tracking-label text-fg-muted-raised">① Cây thiết kế</span>
                <span className="text-body text-fg">260px</span>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="50%">
              <div className="flex h-full flex-col gap-1 bg-canvas p-3">
                <span className="text-caption uppercase tracking-label text-fg-muted-raised">② Lưới ô</span>
                <span className="text-body text-fg">co giãn</span>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="25%" minSize="15%">
              <div className="flex h-full flex-col gap-1 bg-surface p-3">
                <span className="text-caption uppercase tracking-label text-fg-muted-raised">③ Thuộc tính</span>
                <span className="text-body text-fg">320px</span>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </Section>

        {/* ------------------------------------------------------- STATES */}
        <Section id="states" title="9 · Trạng thái màn — rỗng · đang tải · lỗi">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3 border border-line-subtle bg-surface">
              <EmptyState
                icon={Inbox}
                title="Chưa có project nào"
                description="Tạo project đầu tiên để bắt đầu dựng bộ kit."
                steps={["Chọn một mẫu có sẵn", "Sửa danh sách sheet & element", "Bấm Sinh ảnh"]}
                action={<Button variant="primary" size="lg"><Plus aria-hidden />Tạo project</Button>}
              />
            </div>
            <div className="flex flex-col gap-4">
              <ErrorState
                variant="inline"
                title="Chưa thấy công cụ local"
                description="Đang hiện dữ liệu bạn xem lần cuối (12:04 hôm nay). Không sửa được ở chế độ này."
                actions={<>
                  <Button variant="secondary" size="sm"><Terminal aria-hidden />Copy lệnh</Button>
                  <Button variant="ghost" size="sm">Thử lại</Button>
                  <Button variant="link" size="sm">Vì sao?</Button>
                </>}
                detail={'GET http://127.0.0.1:8765/health\n→ ERR_CONNECTION_REFUSED (đã thử cổng 8765, 8766, 8767)'}
              />
              <div className="rounded-3 border border-line-subtle bg-surface p-4">
                <p className="mb-3 text-caption uppercase tracking-label text-fg-muted-raised">LoadingState · 3 hàng</p>
                <LoadingState variant="rows" count={3} />
              </div>
              <div className="rounded-3 border border-line-subtle bg-surface p-4">
                <p className="mb-3 text-caption uppercase tracking-label text-fg-muted-raised">Skeleton</p>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- MISC */}
        <Section id="misc" title="10 · CodeBlock · phím tắt">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <CopyableCode label="Lệnh chạy công cụ local" value="npx kitgen agent --port 8765 --workspace ~/KitGen" />
              <p className="text-caption text-fg-muted-raised">Focus vào khối rồi bấm ⌘C để copy toàn bộ.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-3 border border-line-subtle bg-surface p-4">
              {[
                { k: ["mod", "K"], d: "Bảng lệnh", seq: false },
                { k: ["mod", "S"], d: "Lưu bản thiết kế", seq: false },
                { k: ["mod", "enter"], d: "Chạy hành động chính", seq: false },
                { k: ["g", "p"], d: "Về danh sách project", seq: true },
                { k: ["esc"], d: "Đóng overlay trên cùng", seq: false },
              ].map((r) => (
                <div key={r.d} className="flex items-center justify-between gap-4">
                  <span className="text-body text-fg">{r.d}</span>
                  <KeyboardHint keys={r.k} sequence={r.seq} />
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- A11Y */}
        <Section
          id="a11y"
          title="11 · Kiểm chứng a11y (§5.8) — làm tay, đừng tin suông"
          note="Đây là checklist QA phải tự bấm. Không có ô nào tự tick."
        >
          <ol className="flex flex-col gap-2 text-body text-fg">
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Bấm Tab qua cả trang: mọi thứ bấm được phải có vòng focus 2px rõ ràng (A4).</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Mở modal → Tab phải quẩn trong modal, không thoát ra sau lưng (A7).</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Bấm Esc → modal/drawer đóng, focus quay lại đúng nút đã mở nó (A7).</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Modal "Xoá vĩnh viễn": focus KHÔNG được rơi vào nút đỏ khi vừa mở.</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Bật prefers-reduced-motion → pulse/shimmer phải tắt, màu vẫn đổi (A10).</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Zoom 200% và thu cửa sổ còn 320px → không mất nội dung, không cuộn ngang (A11).</li>
            <li className="flex gap-2"><ChevronRight className="mt-1 size-3.5 shrink-0 text-accent-text" aria-hidden />Chạy <code className="font-mono text-mono text-accent-text">npm run contrast</code> → phải PASS toàn bộ ở CẢ hai theme.</li>
          </ol>
          <div className="mt-4 rounded-2 kg-tint-warn p-3 text-body text-on-tint-warn">
            Chưa chạy axe-core và chưa mở trình duyệt thật ở lượt scaffold này — hai việc đó vẫn còn nợ, xem ghi chú bàn giao.
          </div>
        </Section>
        {/* ----------------------------------------------- FLOATING TOOLBAR */}
        <Section
          id="floating-toolbar"
          title="12 · Thanh công cụ nổi (FE-1 · B2) — hạ tầng canvas"
          note="Tab vào MỘT lần cho cả thanh, rồi ← → (hoặc ↑ ↓) di chuyển, Home/End về đầu/cuối, Enter/Space kích hoạt. Nút khoá bị bỏ qua. Không hỗ trợ backdrop-filter hoặc bật prefers-reduced-transparency ⇒ thanh rơi về nền ĐẶC, chữ không mất."
        >
          <div className={`${DOTGRID} flex min-h-52 items-end justify-center rounded-4 border border-line-subtle p-6`}>
            <FloatingToolbar
              aria-label="Công cụ canvas"
              left={
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Chọn đối tượng"><MousePointer2 aria-hidden /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Chọn đối tượng</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Thêm ghi chú"><StickyNote aria-hidden /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Thêm ghi chú</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Khung frame"><Frame aria-hidden /></Button>
                    </TooltipTrigger>
                    <TooltipContent>Khung frame</TooltipContent>
                  </Tooltip>
                </>
              }
              center={
                <>
                  <Button variant="ghost" size="icon-sm" aria-label="Thu nhỏ"><ZoomOut aria-hidden /></Button>
                  <span className="min-w-12 text-center text-caption tabular-nums text-fg-muted-raised">100%</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Phóng to"><ZoomIn aria-hidden /></Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm"><Maximize2 aria-hidden />Vừa khung</Button>
                    </TooltipTrigger>
                    <TooltipContent>Vừa khung nhìn</TooltipContent>
                  </Tooltip>
                </>
              }
              right={
                <>
                  <Button variant="ghost" size="sm" disabled>Chưa chọn gì</Button>
                  <Button variant="secondary" size="sm"><Copy aria-hidden />Copy Figma</Button>
                </>
              }
            />
          </div>
          <p className="mt-3 text-caption text-fg-muted">
            Nút <span className="text-fg">Chưa chọn gì</span> đang khoá — nó KHÔNG nhận focus khi bấm mũi tên,
            đúng khuôn WAI-ARIA toolbar. Ba slot trái/giữa/phải được ngăn bằng <code className="font-mono text-mono text-accent-text">Separator</code> của R0.
          </p>
        </Section>

        {/* ------------------------------------------------ FE-2 · SUB-FILE (nhánh C) */}
        <Section
          id="subfile"
          title="13 · File con — thanh tab, CRUD, thùng rác (FE-2 · C)"
          note="Story do nhánh C bàn giao, Q chỉ ghép vào đây. Dữ liệu tĩnh nên mọi trạng thái hiện tất định; runtime của app vẫn đi qua một cửa duy nhất là kho file con trên máy — vì thế luôn có badge «bản nháp cục bộ»."
        >
          <StoryFrame>
            <SubfilePreview />
            <SubfileCrudPreview />
            <SubfileA11yPreview />
          </StoryFrame>
        </Section>

        {/* -------------------------------------------------- FE-2 · CANVAS (nhánh D) */}
        <Section
          id="canvas-shell"
          title="14 · Khung bàn làm việc — CHƯA phải canvas thật (FE-2 · D)"
          note="Chỉ có khung xem trước: pan/zoom bằng useViewport của FE-1 + thanh công cụ nổi. KHÔNG có node, chọn, kéo, undo hay copy Figma — mọi hành động đó đang khoá kèm nhãn «Sắp có» và thuộc FE-3/FE-5."
        >
          <StoryFrame>
            <CanvasPreview />
          </StoryFrame>
        </Section>

      </main>

      {/* ---- overlay dùng state ---- */}
      <ConfirmDestructive
        open={confirmSoft}
        onOpenChange={setConfirmSoft}
        title="Xoá project này?"
        description={<>Project chuyển vào <strong className="text-fg-strong">Thùng rác</strong> và giữ 30 ngày. Bạn có thể hoàn tác ngay sau khi xoá.</>}
        actionLabel="Chuyển vào thùng rác"
        onConfirm={() => {
          setConfirmSoft(false);
          toast("Đã xoá project", { duration: KG_TOAST_DURATION.successWithUndo, action: { label: "Hoàn tác", onClick: () => toast.success("Đã khôi phục") } });
        }}
      />

      <ConfirmDestructive
        open={confirmHard}
        onOpenChange={setConfirmHard}
        title="Xoá vĩnh viễn project?"
        description="Toàn bộ ảnh đã sinh sẽ mất và KHÔNG lấy lại được. Muốn có lại phải sinh ảnh từ đầu, tốn quota."
        confirmText="tet-2026"
        actionLabel="Xoá vĩnh viễn"
        onConfirm={() => {
          setConfirmHard(false);
          toast.success("Đã xoá vĩnh viễn");
        }}
      />

      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Tìm project hoặc chạy lệnh…" />
        <CommandList>
          <CommandEmpty>Không tìm thấy gì khớp.</CommandEmpty>
          <CommandGroup heading="Điều hướng">
            <CommandItem><FolderOpen aria-hidden />Danh sách project<CommandShortcut>g p</CommandShortcut></CommandItem>
            <CommandItem><Boxes aria-hidden />Thư viện kit<CommandShortcut>g k</CommandShortcut></CommandItem>
            <CommandItem><Settings aria-hidden />Cài đặt<CommandShortcut>g s</CommandShortcut></CommandItem>
          </CommandGroup>
          <CommandGroup heading="Hành động">
            <CommandItem><Plus aria-hidden />Tạo project mới</CommandItem>
            <CommandItem><Play aria-hidden />Bắt đầu sinh ảnh</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

/* ------------------------------------------------------------- demo form */

const demoSchema = z.object({
  ten: z.string().min(1, "Phải có tên project").max(60, "Tối đa 60 ký tự"),
  sheetId: z
    .string()
    .min(1, "Phải có id sheet")
    .regex(/^[a-z0-9-]+$/, "Chỉ dùng chữ thường, số và dấu gạch ngang"),
  moTa: z.string().max(200, "Tối đa 200 ký tự").optional(),
});

function DemoForm() {
  const form = useForm<z.infer<typeof demoSchema>>({
    resolver: zodResolver(demoSchema),
    defaultValues: { ten: "", sheetId: "", moTa: "" },
  });

  return (
    <Form {...form}>
      <form
        className="flex max-w-lg flex-col gap-4"
        onSubmit={form.handleSubmit((v) => toast.success(`Hợp lệ: ${v.ten} / ${v.sheetId}`))}
      >
        <p className="text-caption uppercase tracking-label text-fg-muted-raised">
          Form + zod · bấm Gửi khi để trống để xem lỗi (lỗi có role="alert")
        </p>
        <FormField
          control={form.control}
          name="ten"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tên project</FormLabel>
              <FormControl><Input placeholder="Tết 2026 — VietinBank iPay" {...field} /></FormControl>
              <FormDescription>Hiện trên thẻ ở trang chủ.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sheetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Id sheet</FormLabel>
              <FormControl><Input placeholder="hero" {...field} /></FormControl>
              <FormDescription>Phải duy nhất trong project (V-03).</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" variant="primary">Gửi</Button>
          <Button type="button" variant="ghost" onClick={() => form.reset()}>Xoá form</Button>
        </div>
      </form>
    </Form>
  );
}
