import { Controller, useFormContext } from "react-hook-form";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CARD } from "@/components/layout/flora";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { KitFormValues } from "../lib/form-model";
import { scopeSentence } from "../lib/scope-model";

export function ScopePage() {
  const { control, watch, setValue } = useFormContext<KitFormValues>();
  const count = watch("backgroundCount"); const poses = watch("poseCount"); const items = watch("items"); const hasCharacter = watch("hasCharacter");
  const choices = loadBundledV2().elements.slice(0, 42);
  return <section aria-labelledby="scope-title" className="grid gap-6"><header><h1 id="scope-title" className="text-display text-fg-strong">Bộ kit cần <em className="font-serif font-normal italic">những gì?</em></h1><p className="mt-2 text-body text-fg-muted-raised">Chọn vừa đủ cho lần vẽ đầu tiên. Bạn thêm sau được.</p></header>
    <div className={`${CARD} grid gap-7 p-5 sm:p-6`}>
      <div className="grid gap-5 sm:grid-cols-2"><div><Label>Màn nền</Label><div className="mt-2 flex items-center gap-3"><Button type="button" variant="secondary" size="icon" aria-label="Bớt một màn nền" onClick={() => setValue("backgroundCount", Math.max(0, count - 1))}><Minus aria-hidden/></Button><output className="min-w-8 text-center text-subtitle text-fg-strong">{count}</output><Button type="button" variant="secondary" size="icon" aria-label="Thêm một màn nền" onClick={() => setValue("backgroundCount", Math.min(8, count + 1))}><Plus aria-hidden/></Button><span className="text-caption text-fg-muted-raised">ảnh nền toàn màn</span></div></div>
      {hasCharacter && <fieldset><legend className="text-label text-fg-strong">Tư thế nhân vật</legend><div className="mt-3 flex gap-3">{([4, 16] as const).map((n) => <Button key={n} type="button" variant={poses === n ? "secondary" : "ghost"} aria-pressed={poses === n} onClick={() => setValue("poseCount", n)}>{n} ảnh</Button>)}</div></fieldset>}</div>
      <fieldset className="border-t border-line-subtle pt-5"><legend className="text-label text-fg-strong">Thành phần giao diện</legend><p className="mt-1 text-caption text-fg-muted-raised">Có thể chọn nhiều món.</p><Controller control={control} name="items" render={({ field }) => <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{choices.map((item) => { const checked = field.value.includes(item.file); return <label key={item.file} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-3 border px-3 py-2 text-body text-fg transition-colors ${checked ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line-subtle bg-raised hover:border-line-strong"}`}><Checkbox aria-label={`Chọn ${item.vi}`} checked={checked} onCheckedChange={(on) => field.onChange(on ? [...field.value, item.file].slice(0, 16) : field.value.filter((x) => x !== item.file))}/><span>{item.vi}</span></label>; })}</div>}/><p className="mt-4 text-caption text-fg-muted-raised">{scopeSentence(items.length)}</p></fieldset>
    </div></section>;
}
