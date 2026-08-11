import * as React from "react";
import { AlertTriangle, FileClock, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { diffSentence, summarize } from "./diff";
import { DiffTable, SummaryColumns } from "./DiffTable";
import type { Contract } from "@/lib/types";
import { formatWhen } from "./format-time";
import type { DraftRecord } from "./drafts";
import type { ContractDiff } from "./diff";

/** Dữ liệu banner cần: nháp + có cũ hơn bản đĩa không + khác biệt. */
export interface DraftPrompt {
  draft: DraftRecord;
  /** Nháp cũ hơn bản trên đĩa ⇒ banner đổi sang giọng cảnh báo. */
  stale: boolean;
  diff: ContractDiff;
}

/**
 * BANNER KHÔI PHỤC NHÁP (§3.7): *"Có bản nháp chưa lưu từ 14:32 hôm nay"*
 * + [Khôi phục] [Bỏ nháp] [So sánh].
 *
 * HAI GIỌNG KHÁC NHAU, có lý do:
 *  · nháp MỚI hơn bản đĩa (thường gặp: tab chết giữa chừng) → giọng thông tin,
 *    [Khôi phục] là hành động chính.
 *  · nháp CŨ hơn bản đĩa (`stale`: đã có ai lưu sau lúc bạn rời đi) → giọng cảnh
 *    báo, KHÔNG để [Khôi phục] làm nút primary nữa, và nói thẳng hậu quả. Đây
 *    đúng là ca dễ mất công người khác nhất mà một banner "vô tư" sẽ gây ra.
 */
export function DraftBanner({
  prompt,
  serverContract,
  onRestore,
  onDiscard,
}: {
  prompt: DraftPrompt;
  serverContract: Contract | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const [compareOpen, setCompareOpen] = React.useState(false);
  const when = formatWhen(prompt.draft.savedAt);
  const stale = prompt.stale;

  return (
    <>
      <div
        role="status"
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-2 border p-3",
          stale ? "border-warn/60 bg-warn/[var(--kg-tint-b)]" : "border-accent/60 bg-accent/[var(--kg-tint-b)]",
        )}
      >
        {stale ? (
          <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
        ) : (
          <FileClock className="size-4 shrink-0 text-accent-text" aria-hidden />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-body text-fg-strong">
            Có bản nháp chưa lưu từ {when}
          </p>
          <p className="text-caption text-fg">
            {stale
              ? "Nhưng bản trên đĩa đã được lưu sau đó. Khôi phục nháp sẽ đưa bản thiết kế về trạng thái cũ hơn — hãy so sánh trước."
              : diffSentence(prompt.diff)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCompareOpen(true)}>
            <GitCompare aria-hidden />
            So sánh
          </Button>
          <Button variant={stale ? "secondary" : "primary"} size="sm" onClick={onRestore}>
            Khôi phục
          </Button>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Bỏ nháp
          </Button>
        </div>
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>So sánh nháp với bản trên đĩa</DialogTitle>
            <DialogDescription>
              Khôi phục sẽ thay nội dung đang mở bằng nháp. Bạn vẫn hoàn tác được bằng ⌘Z sau đó.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <SummaryColumns
              leftTitle={`Nháp trên máy (${when})`}
              leftSummary={summarize(prompt.draft.contract)}
              rightTitle="Bản trên đĩa"
              rightSummary={summarize(serverContract)}
            />
            <DiffTable diff={prompt.diff} />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

