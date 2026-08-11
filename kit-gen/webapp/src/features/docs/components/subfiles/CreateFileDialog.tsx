import * as React from "react";
import { LayoutGrid, PenLine } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { CARD, FLORA, SERIF } from "@/components/layout/flora";
import { checkDocName, suggestDocName } from "../../lib/subfile-actions";
import type { CreateDocInput, Doc, DocKind } from "../../lib";

/**
 * DIALOG «Tạo file mới» (§4.3 + §4.4): hai thẻ mode y hệt §1.2, ô tên, và với kiểu
 * workflow thì thêm *"Bắt đầu từ sheet nào"* (multi-select từ contract).
 *
 * VÌ SAO KHÔNG có "chọn hết/bỏ hết" mặc định tick sẵn: file con là BỘ LỌC (§4.5).
 * Không tick sheet nào = file rỗng, và điều đó **hợp lệ** (người dùng thêm sau) nên
 * ta nói ra bằng dòng gợi ý thay vì chặn. Tab ảo «Tất cả sheet» vẫn bảo đảm không
 * có sheet tàng hình, nên bộ lọc rỗng không giấu mất thứ gì của ai.
 *
 * A11Y: `RadioGroup` của R0 (Radix) cho mũi tên đổi mode; mỗi thẻ có accessible name
 * + description qua `aria-describedby`. Ô tên có lỗi INLINE (`aria-invalid` +
 * `aria-describedby`), không chỉ toast. Enter trong ô tên = gửi form.
 *
 * FLORA: thẻ mode dùng `CARD` (surface + hairline + bo 20px), chọn thì viền accent
 * mảnh; tiêu đề dùng serif italic nhấn ĐÚNG một từ. 0 literal màu/khoảng cách.
 */
export interface CreateFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: readonly Doc[];
  /** id sheet của contract. Agent chưa chạy / chưa có contract ⇒ mảng rỗng, KHÔNG lỗi. */
  sheetIds: readonly string[];
  pending?: boolean;
  /** Câu lỗi đã đời-thường-hoá + chi tiết kỹ thuật (chỉ vào `<details>`). */
  errorTitle?: string | null;
  errorDetail?: string | null;
  onSubmit: (input: CreateDocInput) => void;
}

const MODES: { value: DocKind; title: string; desc: string; Icon: typeof LayoutGrid }[] = [
  {
    value: "workflow",
    title: "Quy trình chuẩn",
    desc: "Đi theo các bước có sẵn: chọn sheet, sinh ảnh, cắt kit.",
    Icon: LayoutGrid,
  },
  {
    value: "canvas",
    title: "Bàn ý tưởng",
    desc: "Mặt phẳng tự do để sắp ý tưởng và ghi chú trước khi làm.",
    Icon: PenLine,
  },
];

export function CreateFileDialog(props: CreateFileDialogProps) {
  const { open, onOpenChange, docs, sheetIds, pending, errorTitle, errorDetail, onSubmit } = props;
  const [kind, setKind] = React.useState<DocKind>("workflow");
  const [name, setName] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const nameId = React.useId();
  const errId = React.useId();

  // Mở lại = trạng thái sạch. Tên gợi ý theo mode, đã tránh trùng.
  React.useEffect(() => {
    if (!open) return;
    setKind("workflow");
    setName(suggestDocName("workflow", docs));
    setTouched(false);
    setPicked([]);
  }, [open, docs]);

  const pickMode = (k: DocKind) => {
    setKind(k);
    // Chưa tự gõ tên ⇒ tên gợi ý đi theo mode. Đã gõ rồi thì KHÔNG đè chữ của người ta.
    if (!touched) setName(suggestDocName(k, docs));
  };

  const check = checkDocName(name, docs);
  const blocked = !check.ok || pending === true;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) {
      setTouched(true);
      return;
    }
    onSubmit({
      name: check.value,
      kind,
      ...(kind === "workflow" ? { view: { sheetIds: picked, variantIds: [] } } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={pending ? () => {} : onOpenChange}>
      <DialogContent size="md" onEscapeKeyDown={(e) => pending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            Tạo <span className={SERIF}>file</span> mới
          </DialogTitle>
          <DialogDescription>
            File con là một góc làm việc riêng trong dự án. Sheet, ảnh và kit vẫn dùng chung.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <DialogBody className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="pb-2 text-label text-fg-strong">Kiểu file</legend>
              <RadioGroup
                value={kind}
                onValueChange={(v) => pickMode(v as DocKind)}
                className="grid gap-3 sm:grid-cols-2"
              >
                {MODES.map((m) => (
                  <ModeCard key={m.value} mode={m} checked={kind === m.value} />
                ))}
              </RadioGroup>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Tên file</Label>
              <Input
                id={nameId}
                value={name}
                autoFocus
                disabled={pending}
                maxLength={64}
                autoComplete="off"
                onChange={(e) => {
                  setTouched(true);
                  setName(e.target.value);
                }}
                aria-invalid={touched && !check.ok}
                aria-describedby={touched && check.error ? errId : undefined}
              />
              {touched && check.error && (
                <p id={errId} role="alert" className="text-caption text-danger">
                  {check.error}
                </p>
              )}
            </div>

            {kind === "workflow" && (
              <SheetPicker sheetIds={sheetIds} picked={picked} setPicked={setPicked} disabled={pending} />
            )}

            {errorTitle && (
              <div role="alert" className={cn(CARD, "flex flex-col gap-1 p-3")}>
                <p className="text-body text-fg-strong">{errorTitle}</p>
                {errorDetail && (
                  <details>
                    <summary className="cursor-pointer list-none text-caption text-fg-muted-raised">
                      Chi tiết cho lập trình viên
                    </summary>
                    <code className="mt-1 block font-mono text-caption text-fg-muted-raised">{errorDetail}</code>
                  </details>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" variant="primary" loading={pending} aria-disabled={blocked}>
              Tạo file
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({
  mode, checked,
}: { mode: (typeof MODES)[number]; checked: boolean }) {
  const id = React.useId();
  const descId = `${id}-d`;
  const { Icon } = mode;
  return (
    <Label
      htmlFor={id}
      className={cn(
        CARD, "flex cursor-pointer items-start gap-3 p-3 transition-colors duration-fast",
        checked ? FLORA.accentBorder : "hover:border-line",
      )}
    >
      <RadioGroupItem id={id} value={mode.value} aria-describedby={descId} className="mt-0.5" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2 text-label text-fg-strong">
          <Icon className="size-4 shrink-0" aria-hidden strokeWidth={1.5} />
          {mode.title}
        </span>
        <span id={descId} className="text-caption font-normal text-fg">
          {mode.desc}
        </span>
      </span>
    </Label>
  );
}

/** «Bắt đầu từ sheet nào» — multi-select từ contract (§4.3). Rỗng là hợp lệ. */
function SheetPicker({
  sheetIds, picked, setPicked, disabled,
}: {
  sheetIds: readonly string[];
  picked: string[];
  setPicked: (v: string[]) => void;
  disabled?: boolean;
}) {
  const groupId = React.useId();
  if (sheetIds.length === 0) {
    return (
      <p className="text-caption text-fg-muted-raised">
        Dự án chưa có sheet nào để chọn. Tạo file trước cũng được — thêm sheet vào sau.
      </p>
    );
  }
  const toggle = (id: string) =>
    setPicked(picked.includes(id) ? picked.filter((s) => s !== id) : [...picked, id]);

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend id={groupId} className="pb-1 text-label text-fg-strong">
        Bắt đầu từ sheet nào
      </legend>
      <p className="text-caption text-fg-muted-raised">
        Đây chỉ là bộ lọc hiển thị. Sheet không chọn vẫn còn nguyên trong dự án và luôn thấy ở «Tất cả sheet».
      </p>
      <ScrollArea className="max-h-40">
        <div role="group" aria-labelledby={groupId} className="flex flex-col gap-1 pr-2">
          {sheetIds.map((id) => {
            const cid = `${groupId}-${id}`;
            return (
              <Label
                key={id}
                htmlFor={cid}
                className="flex cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5 font-normal hover:bg-raised"
              >
                <Checkbox id={cid} checked={picked.includes(id)} onCheckedChange={() => toggle(id)} />
                <span className="truncate text-body text-fg-strong">{id}</span>
              </Label>
            );
          })}
        </div>
      </ScrollArea>
      <p className="text-caption text-fg-muted-raised">
        {picked.length === 0 ? "Chưa chọn sheet nào — file sẽ trống, thêm sau cũng được." : `Đã chọn ${picked.length} sheet.`}
      </p>
    </fieldset>
  );
}
