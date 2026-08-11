import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Controller, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CARD } from "@/components/layout/flora";
import { useAddRef } from "@/lib/hooks";
import type { KitFormValues } from "../lib/form-model";

export function SubjectPage({ projectId }: { projectId?: string }) {
  const { register, control, watch, setValue, formState: { errors } } = useFormContext<KitFormValues>();
  const has = watch("hasCharacter");
  const picker = useRef<HTMLInputElement>(null);
  const upload = useAddRef(projectId ?? "");
  const [fileName, setFileName] = useState("");

  const addFile = (file?: File) => {
    if (!file || !projectId) return;
    upload.mutate({ file, kind: "character" }, { onSuccess: () => { setFileName(file.name); setValue("characterRefUploaded", true); } });
  };

  return <section aria-labelledby="subject-title" className="grid gap-6">
    <header><h1 id="subject-title" className="text-display text-fg-strong">Bộ kit này cho <em className="font-serif font-normal italic">việc gì?</em></h1><p className="mt-2 text-body text-fg-muted-raised">Trả lời ngắn thôi, sửa sau được.</p></header>
    <div className={`${CARD} grid gap-6 p-5 sm:p-6`}>
      <div className="grid gap-2"><Label htmlFor="kit-name">Tên bộ kit</Label><Input id="kit-name" autoFocus {...register("name")} aria-invalid={!!errors.name}/>{errors.name && <p role="alert" className="text-caption text-danger">{errors.name.message}</p>}</div>
      <fieldset className="grid gap-3"><legend className="text-label text-fg-strong">Có nhân vật không?</legend><Controller control={control} name="hasCharacter" render={({ field }) => <RadioGroup value={field.value ? "yes" : "no"} onValueChange={(v) => field.onChange(v === "yes")} className="flex gap-6"><label className="flex items-center gap-2 text-body text-fg"><RadioGroupItem value="no"/>Không</label><label className="flex items-center gap-2 text-body text-fg"><RadioGroupItem value="yes"/>Có</label></RadioGroup>}/></fieldset>
      {has && <div className="grid gap-4 border-t border-line-subtle pt-5 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="char-species">Nhân vật là gì?</Label><Input id="char-species" {...register("character.species")} placeholder="Chú heo đất mặc áo dài"/></div>
        <div className="grid gap-2"><Label htmlFor="char-traits">Tính cách</Label><Input id="char-traits" {...register("character.traits")} placeholder="Vui vẻ, hài hước"/></div>
        <div className="grid gap-2 sm:col-span-2"><Label htmlFor="char-costume">Trang phục</Label><Input id="char-costume" {...register("character.costume")} placeholder="Áo dài xanh, khăn đóng"/></div>
        <div className="rounded-3 border border-dashed border-line bg-raised p-5 sm:col-span-2" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFile(e.dataTransfer.files[0]); }}>
          <input ref={picker} className="sr-only" type="file" accept="image/png,image/jpeg" onChange={(e) => addFile(e.target.files?.[0])}/>
          <div className="flex items-center gap-3"><ImagePlus className="size-5 text-fg-muted-raised" aria-hidden/><div className="min-w-0 flex-1"><p className="text-body text-fg-strong">Ảnh nhân vật</p><p className="text-caption text-fg-muted-raised">{fileName || (projectId ? "Kéo 1 ảnh vào đây hoặc chọn PNG/JPG." : "Lưu tên bộ kit trước khi tải ảnh; bạn vẫn có thể đi tiếp bằng mô tả chữ.")}</p></div><Button type="button" variant="ghost" disabled={!projectId || upload.isPending} onClick={() => picker.current?.click()}>{upload.isPending ? "Đang tải…" : "Chọn ảnh"}</Button></div>
          {upload.isError && <p role="alert" className="mt-3 text-caption text-danger">Chưa tải được ảnh. Kiểm tra máy hỗ trợ đang chạy rồi thử lại.</p>}
        </div>
      </div>}
    </div>
  </section>;
}
