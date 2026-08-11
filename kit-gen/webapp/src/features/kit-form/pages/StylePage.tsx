import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CARD } from "@/components/layout/flora";
import { SemanticSlider } from "../components/SemanticSlider";
import { STYLE_AXES } from "../lib/style-phrases";
import type { KitFormValues } from "../lib/form-model";
export function StylePage({ promptEdited, onPromptEdit }: { promptEdited: boolean; onPromptEdit: () => void }) {
  const { control, register } = useFormContext<KitFormValues>();
  return <section aria-labelledby="style-title" className="grid gap-6"><header><h1 id="style-title" className="text-display text-fg-strong">Phong cách trông như <em className="font-serif font-normal italic">thế nào?</em></h1><p className="mt-2 text-body text-fg-muted-raised">Kéo về phía bạn thấy đúng hơn.</p></header>
    <div className={`${CARD} grid gap-7 p-5 sm:p-6`}><div className="grid gap-6 sm:grid-cols-2">{STYLE_AXES.map((axis) => <Controller key={axis.id} control={control} name={`style.${axis.id}`} render={({ field }) => <SemanticSlider axis={axis} value={field.value} onChange={field.onChange}/>}/>)}</div>
      <div className="grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="primary">Màu chính</Label><Input id="primary" {...register("primary")}/></div><div className="grid gap-2"><Label htmlFor="secondary">Màu phụ</Label><Input id="secondary" {...register("secondary")}/></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="avoid">Điều KHÔNG muốn thấy</Label><Input id="avoid" {...register("avoid")} placeholder="Chibi quá trẻ con, viền đen dày"/></div></div>
      <details className="rounded-3 border border-line-subtle bg-raised p-4"><summary className="cursor-pointer text-label text-fg-strong">Máy sẽ nói với AI thế này</summary><p className="mt-2 text-caption text-fg-muted-raised">Đây là bản dịch tự động từ các thanh trượt ở trên. Sửa tay được, sửa xong máy không đổi lại.</p><Controller control={control} name="stylePrompt" render={({ field }) => <Textarea {...field} className="mt-3 min-h-28" onChange={(e) => { onPromptEdit(); field.onChange(e); }} aria-label="Mô tả phong cách cho AI"/>}/>{promptEdited && <p className="mt-2 text-caption text-warn">Bạn đang dùng bản sửa tay.</p>}</details>
    </div></section>;
}
