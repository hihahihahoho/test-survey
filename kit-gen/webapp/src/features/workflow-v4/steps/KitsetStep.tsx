import * as React from "react";
import { Check, ChevronRight, Layers3, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Silhouette } from "@/features/design/preview";
import { useElementLib } from "@/lib/hooks";
import { fromAgentLib, loadBundledV2, foldVi } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { cellLabel, useWorkflowStore, type KitElement } from "../lib/model";
import { Step } from "./BriefStep";

type GroupId = "essential" | "navigation" | "reward" | "popup" | "game" | "form" | "ranking" | "background";
const GROUPS: { id: GroupId; label: string; hint: string; match: (e: LibElement) => boolean }[] = [
  { id: "essential", label: "Nút & trạng thái", hint: "CTA, nút tròn, tiến trình, tab", match: e => /btn|progress|tab|toggle|checkbox|counter/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "popup", label: "Popup & khung", hint: "panel, ribbon và nút đóng", match: e => /popup|ribbon|btn-close/.test(e.file) },
  { id: "reward", label: "Quà & hiệu ứng", hint: "hộp quà, voucher, lì xì, burst", match: e => /reward|gift|envelope|burst|trophy/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "game", label: "Đồ chơi game", hint: "mảnh ghép, túi, khay và vật thể", match: e => /piece|pouch|game-object|board-panel/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "form", label: "Biểu mẫu", hint: "input, select và lựa chọn", match: e => /field|form|checkbox|toggle/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "ranking", label: "Xếp hạng", hint: "huy chương và hàng BXH", match: e => /rank|medal|trophy/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "navigation", label: "Điều hướng", hint: "back, close, tab và chip", match: e => /btn-back|btn-close|tab|chip/.test(`${e.file} ${e.group ?? ""}`) },
  { id: "background", label: "Nền màn", hint: "HOME và màn chơi", match: e => /bg-/.test(e.file) },
];

const SETS = [
  { id: "wheel", label: "Vòng quay may mắn", hint: "CTA, popup thưởng, tiến trình và hai nền", files: ["01-btn-pill-red","04-btn-circle","07-progress-track","08-progress-fill","09-popup-panel-short","10-popup-ribbon","14-reward-voucher","15-reward-giftbox","16-fx-burst","25-bg-home","26-bg-play"] },
  { id: "gift", label: "Giỏ quà & mở hộp", hint: "Túi quà, hộp mở, voucher và popup dọc", files: ["01-btn-pill-red","09-popup-panel-short","10-popup-ribbon","14-reward-voucher","15-reward-giftbox","20-game-object-closed","21-game-object-open","22-board-panel","24-popup-panel-tall","51-reward-giftbox-open","16-fx-burst"] },
  { id: "lixi", label: "Lì xì Tết", hint: "Phong bì, quà, đếm lượt và hiệu ứng", files: ["01-btn-pill-red","10-popup-ribbon","16-fx-burst","50-counter-pill","52-envelope-body","53-envelope-flap","14-reward-voucher","24-popup-panel-tall"] },
  { id: "ranking", label: "Bảng xếp hạng", hint: "Top 3, hàng người chơi, cúp và phần thưởng", files: ["41-btn-close","45-rank-badge-1","46-rank-badge-2","47-rank-badge-3","48-rank-row","49-rank-row-self","54-trophy-cup","15-reward-giftbox","25-bg-home"] },
] as const;

function meta(e: LibElement) { return { label: e.vi, role: e.group ? `Nhóm ${e.group}` : "Món giao diện", cell: cellLabel(e.cell ?? "landscape") }; }

export function KitsetStep() {
  const s = useWorkflowStore();
  const libQ = useElementLib();
  const catalogue = React.useMemo(() => { const a = libQ.data ? fromAgentLib(libQ.data).elements : []; return a.length ? a : loadBundledV2().elements; }, [libQ.data]);
  const [mode, setMode] = React.useState<"sets"|"elements">("sets");
  const [group, setGroup] = React.useState<GroupId>("essential");
  const [query, setQuery] = React.useState("");
  const selected = React.useMemo(() => new Set(s.elements.filter(e => e.selected).map(e => e.file)), [s.elements]);
  const shown = React.useMemo(() => { const q=foldVi(query); const g=GROUPS.find(x=>x.id===group)!; return catalogue.filter(e => g.match(e) && (!q || foldVi(`${e.vi} ${e.file}`).includes(q))); }, [catalogue,group,query]);
  const applySet = (files: readonly string[]) => {
    const wanted = new Set(files);
    const existing = new Map(s.elements.map(e => [e.file,e]));
    const next: KitElement[] = catalogue.filter(e=>wanted.has(e.file)).map(e => ({ file:e.file,...meta(e),selected:true }));
    for (const e of existing.values()) if (e.mock && e.selected) next.push(e);
    s.set({ elements: next, kitsetSummary: SETS.find(x=>x.files===files)?.label ?? "Bộ tuỳ chỉnh" });
  };
  return <Step title="Kitset UI" copy="Bắt đầu bằng một bộ hoàn chỉnh, hoặc đi theo nhóm để chọn từng món cần thiết.">
    <div className="kitset-mode-tabs" role="tablist" aria-label="Cách chọn kitset">
      <button role="tab" aria-selected={mode==="sets"} onClick={()=>setMode("sets")}><Layers3 aria-hidden/><span><strong>Bộ mẫu nâng cao</strong><small>Chọn nhanh theo loại mini-game</small></span></button>
      <button role="tab" aria-selected={mode==="elements"} onClick={()=>setMode("elements")}><Plus aria-hidden/><span><strong>Tự chọn từng món</strong><small>Chọn nhóm rồi thêm từng món</small></span></button>
      <span className="kitset-count">{selected.size} món đã chọn</span>
    </div>
    {mode === "sets" ? <div className="advanced-set-grid">{SETS.map(set => { const count=set.files.filter(x=>selected.has(x)).length; const active=count===set.files.length; return <article key={set.id} className={active?"advanced-set-card selected":"advanced-set-card"}>
      <div><span className="eyebrow">{set.files.length} món · {active?"đang dùng":`${count} đã có`}</span><h3>{set.label}</h3><p>{set.hint}</p></div>
      <div className="set-preview">{set.files.slice(0,6).map(f=><span key={f}>{catalogue.find(e=>e.file===f)?.vi ?? f}</span>)}</div>
      <Button variant={active?"ghost":"secondary"} onClick={()=>applySet(set.files)}>{active?<><Check/>Đang dùng bộ này</>:<>Dùng bộ này<ChevronRight/></>}</Button>
    </article>})}</div> : <div className="element-picker-layout">
      <nav className="element-groups" aria-label="Nhóm món giao diện">{GROUPS.map(g=>{const n=catalogue.filter(g.match).length; return <button key={g.id} className={group===g.id?"active":""} onClick={()=>setGroup(g.id)}><span><strong>{g.label}</strong><small>{g.hint}</small></span><b>{n}</b></button>})}</nav>
      <section><div className="column-heading"><div><span className="eyebrow">{GROUPS.find(x=>x.id===group)?.label}</span><h3>{shown.length} món trong nhóm</h3></div><div className="kitset-search"><Search/><Input aria-label="Tìm món" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm trong nhóm…"/></div></div>
      <div className="compact-element-grid">{shown.map(e=><button key={e.file} className={selected.has(e.file)?"compact-element selected":"compact-element"} aria-pressed={selected.has(e.file)} onClick={()=>s.toggleElement(e.file,meta(e))}><span className="compact-element-art"><Silhouette skel={e.skel} orient={e.cell==="portrait"?"portrait":"landscape"} uid={`pick-${e.file}`}/></span><span><strong>{e.vi}</strong><small>{cellLabel(e.cell??"landscape")}</small></span>{selected.has(e.file)?<Check/>:<Plus/>}</button>)}</div></section>
    </div>}
  </Step>;
}
