import * as React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { FLORA, SERIF } from "@/components/layout/flora";
import type { CreateMode } from "../lib/create-mode";
import type { BriefIntakeState } from "../lib/create-mode-brief-state";
import { BriefIntakePicker } from "./BriefIntakePicker";
import { BriefIntakeSummary } from "./BriefIntakeSummary";

/**
 * KHỐI "✦ TỪ ĐẦU BÀI KHÁCH" trong dialog tạo project (UI-SPEC-V2 §1.3).
 *
 * VÌ SAO LÀ KHỐI BẬT/TẮT CHỨ KHÔNG PHẢI MỘT Ô TEMPLATE THỨ NĂM:
 * wireframe §1.2 vẽ *"( ) ✦ Từ brief khách"* nằm cùng hàng với 4 template. Nhưng
 * `template` là **trường của hợp đồng `POST /api/projects` #8** và chỉ nhận
 * `basic|blank|from-project|import`. Thêm giá trị thứ năm là đổi ruột — FE2-PLAN N3 cấm.
 * Và về nghĩa thì đây cũng là hai câu hỏi khác nhau: *nội dung khởi tạo* (template) vs
 * *có sẵn đầu bài của khách để đọc không*. Nên: giữ nguyên 4 template, thêm khối phụ
 * bật/tắt. Đọc đầu bài chỉ ảnh hưởng **tên dự án gợi ý** và **mode gợi ý**.
 *
 * KHÔNG có dữ liệu nào của brief đi vào payload project ngoài chuỗi tên mà người dùng
 * tự bấm [Dùng tên này] — và tên đó chỉ lấy từ field độ tin cậy `cao` (chặn ở
 * `projectPrefillHint` của C2).
 *
 * A11y: `Switch` có nhãn thật; khi bật, phần thân được `id` hoá để không đọc lộn xộn;
 * hai nút áp dụng là nút thật (bàn phím tới được), không phải chữ bấm được.
 */
export function BriefIntakeSection({
  state,
  mode,
  onUseName,
  onUseMode,
  disabled,
}: {
  state: BriefIntakeState;
  /** mode đang chọn trong form — để biết có cần mời đổi sang mode gợi ý không. */
  mode: CreateMode;
  onUseName: (name: string) => void;
  onUseMode: (mode: CreateMode) => void;
  disabled?: boolean;
}) {
  const bodyId = React.useId();
  const s = state.summary;

  return (
    <section className={cn("flex flex-col gap-3 border border-line-subtle bg-surface p-4", FLORA.r16)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label htmlFor="brief-toggle" className="flex items-center gap-2 text-body text-fg-strong">
            <Sparkles className="size-4 text-fg-muted-raised" aria-hidden />
            Đọc <span className={SERIF}>đầu bài</span> của khách
          </Label>
          <p className="text-caption font-normal text-fg-muted-raised">
            Không bắt buộc. Tệp được đọc ngay trên máy bạn để gợi ý tên dự án và cách bắt đầu.
          </p>
        </div>
        <Switch
          id="brief-toggle"
          checked={state.enabled}
          onCheckedChange={state.setEnabled}
          disabled={disabled}
          aria-controls={bodyId}
        />
      </div>

      {state.enabled && (
        <div id={bodyId} className="flex flex-col gap-3">
          <BriefIntakePicker
            source={state.source}
            onSourceChange={state.setSource}
            fileName={state.fileName}
            pasted={state.pasted}
            onPastedChange={state.setPasted}
            onFileText={(text, name) => state.readText(text, name)}
            onFileError={(msg) => state.failWith(msg, "FileReader.onerror")}
            busy={disabled}
            error={state.error}
          />

          {s && (
            <>
              <BriefIntakeSummary summary={s} />
              <div className="flex flex-wrap gap-2">
                {s.prefillName && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onUseName(s.prefillName!)}
                  >
                    Dùng tên «{s.prefillName}»
                  </Button>
                )}
                {s.suggestedMode !== mode && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onUseMode(s.suggestedMode)}
                  >
                    {s.suggestedMode === "canvas" ? "Chuyển sang bàn làm việc" : "Chuyển sang quy trình chuẩn"}
                  </Button>
                )}
              </div>
              <p className="text-caption text-fg-muted-raised">{s.suggestReason}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
