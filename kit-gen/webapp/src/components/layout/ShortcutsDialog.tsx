import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { KeyboardHint } from "@/components/common";
import { SHORTCUT_TABLE } from "./shortcuts";

/** Modal `?` — §2.3. Nguồn dữ liệu là `SHORTCUT_TABLE`, không gõ tay lần hai. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Phím tắt</DialogTitle>
          <DialogDescription>
            Phím đơn không hoạt động khi con trỏ đang ở trong ô nhập liệu.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          {SHORTCUT_TABLE.map((section) => (
            <section key={section.group} className="flex flex-col gap-2">
              <h3 className="text-caption font-medium text-fg-muted-raised">{section.group}</h3>
              <dl className="flex flex-col gap-1">
                {section.rows.map((r) => (
                  <div key={r.what} className="flex items-center justify-between gap-4 py-0.5">
                    <dt className="min-w-0 flex-1 truncate text-body text-fg">{r.what}</dt>
                    <dd className="shrink-0">
                      <KeyboardHint keys={r.keys} sequence={r.sequence ?? false} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
