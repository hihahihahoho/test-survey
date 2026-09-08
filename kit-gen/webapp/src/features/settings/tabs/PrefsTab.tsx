import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDestructive, InlineBanner } from "@/components/common";
import { allowedKeys, useUiStore, type Theme } from "@/lib/store";
import { IDB_STORES } from "@/features/kit-core/lib/idb";
import { toastSuccess } from "@/features/projects/lib/feedback";

/**
 * TAB "ƯU TIÊN" (§3-S6) — CÒN ĐÚNG HAI THỨ.
 *
 * Đợt 2 (một màn duy nhất) đã gỡ mọi công tắc còn lại ở đây, và gỡ vì chúng KHÔNG CÒN
 * NỐI VÀO ĐÂU: `maxJobs`/`autoSliceAfterGen` nay là hằng số trong
 * `lib/hooks/use-generate-run.ts` (luồng mới chạy đúng một lượt và luôn tách ảnh), còn
 * "luôn hỏi trước khi xoá" và "hiện ô trống" thuộc những màn đã bị gỡ. Một công tắc
 * không nối vào đâu tệ hơn là không có công tắc: người dùng gạt nó rồi tin là đã đổi.
 *
 * NÚT XOÁ DỮ LIỆU TRÌNH DUYỆT: §3-S6 đòi "kèm liệt kê ĐÚNG các key + store sẽ xoá".
 * Danh sách dưới đây KHÔNG gõ tay — nó đọc thẳng `allowedKeys()` của R0 và
 * `IDB_STORES`, nên không bao giờ lệch với thứ thật sự bị xoá (kể cả các khoá CŨ như
 * `kitgen.prefs.v1` vẫn còn nằm trên máy người dùng bản trước).
 */
const THEMES: { value: Theme; label: string }[] = [
  { value: "dark", label: "Tối" },
  { value: "light", label: "Sáng" },
  { value: "system", label: "Theo hệ thống" },
];

export function PrefsTab() {
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dữ liệu trình duyệt</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InlineBanner
            tone="info"
            title="File dự án và tuỳ chọn không bị xoá"
            description="Thao tác này chỉ xoá dữ liệu KitGen lưu trong trình duyệt hiện tại. Tuỳ chọn nằm trong thư mục làm việc trên máy bạn."
          />
          <p className="text-body text-fg-muted">
            Xoá bộ nhớ đệm và bản nháp chưa lưu trên trình duyệt này. Tuỳ chọn ở trang này được lưu
            trong thư mục làm việc nên sẽ tự trở lại sau khi tải lại trang.
          </p>
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
        description="Bộ nhớ đệm và bản nháp chưa lưu sẽ bị xoá. File dự án và tuỳ chọn trên máy không bị ảnh hưởng."
        actionLabel="Xoá dữ liệu"
        onConfirm={clearAll}
      />
    </div>
  );
}
