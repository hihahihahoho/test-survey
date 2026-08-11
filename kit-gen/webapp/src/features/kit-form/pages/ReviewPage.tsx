import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CARD } from "@/components/layout/flora";
import type { Contract } from "@/lib/types/contract";
import type { KitFormValues } from "../lib/form-model";
import { estimateContract } from "../lib/estimate-view";
import { STYLE_AXES, sliderValueText } from "../lib/style-phrases";
export function ReviewPage({ values, contract, onEdit }: { values: KitFormValues; contract: Contract; onEdit?: () => void }) { const e = estimateContract(contract); return <section aria-labelledby="review-title" className="grid gap-6"><header><h1 id="review-title" className="text-display text-fg-strong">Xem lại rồi <em className="font-serif font-normal italic">bắt đầu nhé</em></h1><p className="mt-2 text-body text-fg-muted-raised">Kiểm tra nhanh những gì bạn đã chọn trước khi dùng lượt sinh ảnh.</p></header><div className={`${CARD} grid gap-7 p-5 sm:p-7`}><div className="grid gap-5 md:grid-cols-3"><Summary label="Chủ thể" value={values.name || "Chưa đặt tên"} /><Summary label="Phong cách" value={styleSummary(values)} /><Summary label="Phạm vi" value={`${values.items.length} món · ${values.backgroundCount} ảnh nền${values.hasCharacter ? ` · ${values.poseCount} tư thế` : ""}`} /></div><dl className="grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-3"><div><dt className="text-caption text-fg-muted-raised">Sẽ vẽ</dt><dd className="mt-1 text-subtitle text-fg-strong">{e.sheets} tấm → {e.items} món cắt rời</dd></div><div><dt className="text-caption text-fg-muted-raised">Tốn</dt><dd className="mt-1 text-subtitle text-fg-strong">~{e.quota} lượt</dd><p className="text-caption text-fg-muted-raised">ước lượng, có thể lệch</p></div><div><dt className="text-caption text-fg-muted-raised">Mất</dt><dd className="mt-1 text-subtitle text-fg-strong">~{e.time.replace(/^~/, "")}</dd></div></dl>{values.hasCharacter && !values.characterRefUploaded && <div role="note" className="flex gap-3 rounded-2 border border-line-subtle bg-raised p-4 text-body text-fg"><AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden/><p>Chưa có ảnh nhân vật — tư thế sẽ vẽ theo mô tả chữ, dễ lệch mặt.</p></div>}<div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={onEdit}>Sửa lựa chọn <ArrowRight aria-hidden /></Button></div></div></section>; }

function Summary({ label, value }: { label: string; value: string }) { return <div><p className="kg-label-above">{label}</p><p className="mt-2 line-clamp-2 text-subtitle text-fg-strong">{value}</p></div>; }
function styleSummary(values: KitFormValues): string {
  const phrases = STYLE_AXES.slice(0, 3).map((axis) => sliderValueText(axis, values.style[axis.id]));
  return phrases.join(" · ");
}
