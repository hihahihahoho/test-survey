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
    toastSuccess("Đã xoá dữ liệu ứng dụng trong trình duyệt này", "Project trên máy bạn KHÔNG bị đụng tới.");
    setConfirmClear(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Sinh ảnh</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Label htmlFor="maxJobs">Số lượt chạy song song: {prefs.maxJobs}</Label>
            <Slider
              id="maxJobs"
              min={1}
              max={8}
              step={1}
              value={[prefs.maxJobs]}
              onValueChange={([v]) => prefs.setMaxJobs(v ?? 4)}
              aria-label="Số lượt sinh ảnh chạy song song"
            />
            <p className="text-caption text-fg-muted">
              Càng cao càng nhanh, nhưng càng dễ chạm giới hạn của tài khoản tạo ảnh.
            </p>
          </div>
          <SwitchRow
            label="Tự động cắt sau khi sinh ảnh"
            description="Sinh xong là cắt luôn thành từng PNG trong suốt. Cắt không tốn quota."
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
            description="Tắt đi thì các thao tác xoá nhẹ sẽ chạy ngay. Thao tác không hoàn tác được thì vẫn luôn hỏi."
            checked={prefs.confirmDestructive}
            onChange={prefs.setConfirmDestructive}
          />
          <SwitchRow
            label="Hiện ô trống trên lưới thiết kế"
            description="Ô trống là chỗ giữ chỗ trên sheet, không sinh ra ảnh nào."
            checked={prefs.showEmptyCells}
            onChange={prefs.setShowEmptyCells}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dữ liệu trong trình duyệt này</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InlineBanner
            tone="info"
            title="Project của bạn nằm trên máy, không nằm trong trình duyệt"
            description="Xoá ở đây chỉ xoá tuỳ chọn giao diện, bộ nhớ đệm và bản nháp chưa lưu — không đụng tới file project."
          />
          <div className="flex flex-col gap-2 text-caption text-fg-muted">
            <p className="text-fg">Sẽ xoá đúng {keys.length} mục lưu trữ và {stores.length} kho dữ liệu:</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
              {[...keys, ...stores].map((k) => <li key={k}>{k}</li>)}
            </ul>
          </div>
          <div>
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 aria-hidden />
              Xoá dữ liệu ứng dụng trong trình duyệt này
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDestructive
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Xoá dữ liệu ứng dụng trong trình duyệt này?"
        description={`Sẽ xoá ${keys.length} mục lưu trữ và ${stores.length} kho dữ liệu, gồm cả BẢN NHÁP CHƯA LƯU của trình soạn thiết kế. Project trên máy bạn không bị đụng tới.`}
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
