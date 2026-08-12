import * as React from "react";
import { ClipboardPaste } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BriefPasteDialog } from "@/features/kit-form/components/BriefPasteDialog";
import { briefToForm } from "@/features/kit-form/lib/form-model";
import { toastSuccess } from "@/features/projects/lib/feedback";
import { useWorkflowStore } from "../lib/model";

export function BriefStep() {
  const s = useWorkflowStore();
  const [pasteOpen, setPasteOpen] = React.useState(false);

  /**
   * §W3-10 — nút "Dán brief". `BriefPasteDialog` + `briefToForm` đã viết xong từ lâu
   * và **có test**, chỉ là chưa một màn nào gọi tới. Đây là món rẻ nhất của cả wave:
   * không có gì phải viết mới, chỉ nối.
   *
   * `briefToForm` trả về hình dạng của form CŨ (`KitFormValues`), nên chỗ này dịch
   * sang state của workflow. Chỉ nhận trường mà parser đã cho qua cổng tin cậy —
   * trường "thấp"/"trống" bị để nguyên, KHÔNG đè lên thứ người dùng đã gõ.
   */
  const applyBrief = (result: Parameters<typeof briefToForm>[0], counts: { filled: number; unsure: number }) => {
    const f = briefToForm(result);
    const patch: Parameters<typeof s.set>[0] = {};
    if (f.name) patch.kitName = f.name;
    if (typeof f.hasCharacter === "boolean") patch.mascotEnabled = f.hasCharacter;
    if (f.primary) patch.primaryColor = f.primary;
    if (f.secondary) patch.secondaryColor = f.secondary;
    if (f.avoid) patch.styleAvoid = f.avoid;
    if (f.style) patch.styleAxes = { ...s.styleAxes, ...f.style };
    const species = f.character?.species ?? "";
    const traits = [f.character?.traits, f.character?.costume].filter(Boolean).join(" · ");
    if (species) patch.mascotName = species;
    if (traits) patch.mascotDescription = traits;
    s.set(patch);
    toastSuccess(
      `Đã điền ${counts.filled} mục từ brief`,
      counts.unsure > 0 ? `${counts.unsure} mục chưa chắc nên để trống — bạn kiểm lại giúp.` : "Kiểm lại rồi đi tiếp.",
    );
  };

  return (
    <Step title="Yêu cầu" copy="Mô tả nội dung cần tạo hoặc dán brief có sẵn.">
      <div className="workflow-form-grid">
        <div>
          <Label htmlFor="kit-name">Tên dự án</Label>
          <Input id="kit-name" value={s.kitName} onChange={(e) => s.set({ kitName: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="campaign">Mục tiêu hoặc chiến dịch</Label>
          <Input id="campaign" value={s.campaign} onChange={(e) => s.set({ campaign: e.target.value })} placeholder="Ví dụ: mini-game hè 2026" />
        </div>
      </div>
      <Label htmlFor="brief">Nội dung brief</Label>
      <Textarea
        id="brief"
        rows={7}
        value={s.brief}
        onChange={(e) => s.set({ brief: e.target.value })}
        placeholder={"Ví dụ:\nTên dự án: Quay số may mắn\nCảm giác: vui, màu ấm\nCần có: vòng quay, nút quay, popup phần thưởng"}
      />
      <div className="mt-3 flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste aria-hidden />Dán brief có cấu trúc
        </Button>
      </div>
      <div className="workflow-choice">
        <button
          type="button"
          aria-pressed={s.mascotEnabled}
          className={s.mascotEnabled ? "choice-card selected" : "choice-card"}
          onClick={() => s.set({ mascotEnabled: !s.mascotEnabled })}
        >
          <strong>{s.mascotEnabled ? "Có nhân vật đại diện" : "Không cần nhân vật"}</strong>
          <span>{s.mascotEnabled ? "Bạn sẽ mô tả nhân vật ở bước riêng." : "Bỏ qua bước tạo nhân vật."}</span>
        </button>
      </div>
      <BriefPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} onApply={applyBrief} />
    </Step>
  );
}

export function Step({ title, copy, children }: { title: string; copy: string; children: React.ReactNode }) {
  return (
    <section className="workflow-panel">
      {/* §W2B-4 — eyebrow "BƯỚC TRONG MỘT MẠCH" đã bỏ: nó lặp lại đúng thứ hàng
          stepper ngay phía trên đang nói, bằng chữ nhỏ hơn và mờ hơn. Một dòng
          eyebrow trên MỖI bước là 6 lần nói cùng một câu. */}
      <header className="workflow-heading">
        <h2>{title}</h2>
        <p>{copy}</p>
      </header>
      {children}
    </section>
  );
}
