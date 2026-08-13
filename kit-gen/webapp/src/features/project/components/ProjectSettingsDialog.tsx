import * as React from "react";
import { FileText, Palette, Settings } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BriefStep } from "@/features/workflow-v4/steps/BriefStep";
import { StyleStep } from "@/features/workflow-v4/steps/StyleStep";
import type { ProjectSettingsTab } from "@/routes/search-schemas";

const TABS: ReadonlyArray<{ id: ProjectSettingsTab; label: string; icon: typeof FileText }> = [
  { id: "requirements", label: "Yêu cầu", icon: FileText },
  { id: "style", label: "Phong cách", icon: Palette },
  { id: "project", label: "Dự án", icon: Settings },
];

/**
 * DIALOG CÀI ĐẶT DỰ ÁN — **ba** tab, không phải năm.
 *
 * "Mascot" và "Bộ khung UI" đã rời khỏi đây thành hai TRANG trong sidebar dự án. Lý do
 * không phải gọn gàng: hai mục đó là màn làm việc thật (lưới 42 thành phần, 19 dáng, ô
 * kích thước, panel chi tiết) — nhét chúng vào một dialog cao 48rem là bắt người dùng
 * làm việc chính trong một cái cửa sổ nổi, cuộn trong cuộn.
 *
 * ══ FOOTER (lỗi #6) ═════════════════════════════════════════════════════════
 * Hàng nút nằm trong `<DialogFooter>` — anh em ruột của `<DialogBody>`, KHÔNG phải con
 * của nó. Bản cũ đặt một thanh `sticky bottom-0` BÊN TRONG vùng cuộn rồi bù bằng
 * `pb-20`: thanh đó dính theo mép vùng cuộn chứ không dính đáy dialog, nên nó **đè lên**
 * thẻ pose cuối cùng, và chiều cao vùng cuộn bị tính dư đúng phần bù. `DialogContent` đã
 * là `flex flex-col` với `DialogBody` mang `min-h-0 flex-1 overflow-y-auto`, nên footer
 * là anh em thì tự dính đáy và tự trừ chiều cao — không cần một dòng CSS nào.
 */
export function ProjectSettingsDialog({
  open, onOpenChange, projectName, tab, onTabChange, readOnly, projectPanel, footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  tab: ProjectSettingsTab;
  onTabChange: (tab: ProjectSettingsTab) => void;
  readOnly: boolean;
  /** Tab "Dự án" — tên, giới hạn ô/sheet. Dựng ở màn cha vì nó cần các hook của dự án. */
  projectPanel: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[min(48rem,calc(100dvh-2rem))]">
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription>Thông tin và cách tạo hình của dự án «{projectName}».</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid min-h-0 gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
          <nav aria-label="Các mục cài đặt dự án" className="flex gap-1 overflow-x-auto md:flex-col">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-2 px-3 py-2 text-left text-label",
                  tab === id ? "bg-raised text-fg-strong" : "text-fg-muted hover:bg-raised",
                )}
              >
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </nav>
          <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">
            {tab === "requirements" && <BriefStep />}
            {tab === "style" && <StyleStep />}
            {tab === "project" && projectPanel}
          </fieldset>
        </DialogBody>
        <DialogFooter className="border-t border-line-subtle">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
