import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDestructive, InlineBanner } from "@/components/common";
import { allowedKeys, usePrefsStore, useUiStore, type Theme } from "@/lib/store";
import { IDB_STORES } from "@/features/design/safety";
import { toastSuccess } from "@/features/projects/lib/feedback";

/**
 * TAB "ƯU TIÊN" (§3-S6).
 *
 * `maxJobs` và `autoSliceAfterGen` KHÔNG chỉ là chuyện giao diện — chúng đi thẳng vào
 * payload của #32 (bắt đầu lượt sinh ảnh), nên chỉnh ở đây là đổi hành vi thật.
 * Vì vậy ô song song có câu cảnh báo: càng cao càng dễ chạm giới hạn tài khoản.
 *
 * NÚT XOÁ DỮ LIỆU TRÌNH DUYỆT: §3-S6 đòi "kèm liệt kê ĐÚNG các key + store sẽ xoá".
 * Danh sách dưới đây KHÔNG gõ tay — nó đọc thẳng `allowedKeys()` của R0 và
 * `IDB_STORES`, nên không bao giờ lệch với thứ thật sự bị xoá.
 */
const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Tối" },
  { value: "light", label: "Sáng" },
  { value: "system", label: "Theo hệ thống" },
];

export function PrefsTab() {
  const prefs = usePrefsStore();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const keys = allowedKeys();
  const stores = Object.values(IDB_STORES);

  const clearAll = () => {
    for (const k of keys) {
      try { localStorage.removeItem(k); } catch { /* chế độ riêng tư */ }
    }
    for (const s of stores) {
      try { indexedDB.deleteDatabase(s); } catch { /* không chặn được thì thôi */ }
    }
    toastSuccess("Đã xoá dữ liệu ứng dụng trong trình duyệt này", "Dự án trên máy bạn không bị ảnh hưởng.");
    setConfirmClear(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Tạo ảnh</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Label htmlFor="maxJobs">Số tấm tạo cùng lúc: {prefs.maxJobs}</Label>
            <Slider
              id="maxJobs"
              min={1}
              max={8}
              step={1}
              value={[prefs.maxJobs]}
              onValueChange={([v]) => prefs.setMaxJobs(v ?? 4)}
              aria-label="Số tấm tạo cùng lúc"
            />
            <p className="text-caption text-fg-muted">
              Tạo nhiều tấm cùng lúc có thể nhanh hơn, nhưng dễ chạm giới hạn của dịch vụ tạo ảnh.
            </p>
          </div>
          <SwitchRow
            label="Tự tách ảnh sau khi tạo"
            description="Khi tạo xong, tự tách từng thành phần thành ảnh PNG trong suốt."
            checked={prefs.autoSliceAfterGen}
            onChange={prefs.setAutoSlice}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Giao diện</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Label>Chủ đề</Label>
            <ToggleGroup
              type="single"
              value={theme}
              onValueChange={(v) => v && setTheme(v as Theme)}
              size="sm"
            >
              {THEMES.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value}>{t.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <SwitchRow
            label="Luôn hỏi trước khi xoá"
            description="Tắt để bỏ qua xác nhận với các mục có thể khôi phục. Dữ liệu không thể khôi phục vẫn luôn được hỏi."
            checked={prefs.confirmDestructive}
            onChange={prefs.setConfirmDestructive}
          />
          <SwitchRow
            label="Hiện ô trống trong bộ khung"
            description="Ô trống chỉ giữ vị trí, không tạo ra hình ảnh."
            checked={prefs.showEmptyCells}
            onChange={prefs.setShowEmptyCells}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dữ liệu trình duyệt</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InlineBanner
            tone="info"
            title="File dự án không bị xoá"
            description="Thao tác này chỉ xoá dữ liệu KitGen lưu trong trình duyệt hiện tại."
          />
          <p className="text-body text-fg-muted">Xoá tuỳ chọn giao diện, bộ nhớ đệm và bản nháp chưa lưu trên trình duyệt này.</p>
          <div>
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 aria-hidden />
              Xoá dữ liệu trình duyệt
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDestructive
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Xoá dữ liệu trình duyệt?"
        description="Tuỳ chọn giao diện, bộ nhớ đệm và bản nháp chưa lưu sẽ bị xoá. File dự án trên máy không bị ảnh hưởng."
        actionLabel="Xoá dữ liệu"
        onConfirm={clearAll}
      />
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="max-w-[62ch] text-caption text-fg-muted">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
