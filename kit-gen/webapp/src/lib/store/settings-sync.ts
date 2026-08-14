/**
 * webapp/src/lib/store/settings-sync.ts — CÂY CẦU giữa hai store trong RAM và
 * `<workspace>/.kitgen/config.json`.
 *
 * ══ HAI CHIỀU, VÀ THỨ TỰ GIỮA CHÚNG LÀ CẢ VẤN ĐỀ ═════════════════════════════
 * ① ĐĨA → RAM (một lần mỗi lần đọc được đĩa). Nghe được đĩa thì đĩa THẮNG. Đây chính là
 *    thứ chữa sự cố Cmd+F5: mở lại trang là tuỳ chọn về đúng như cũ, kể cả khi
 *    localStorage trống trơn (trình duyệt khác, đường vào khác, vừa xoá dữ liệu duyệt web).
 * ② RAM → ĐĨA (gom nhịp `SETTINGS_SAVE_DELAY_MS`). CHỈ chạy SAU khi ① đã xong ít nhất
 *    một lần — `serverRef` còn `null` nghĩa là "chưa biết trên đĩa đang có gì", và ghi đè
 *    lên một thứ mình chưa đọc là cách chắc chắn nhất để xoá tuỳ chọn của chính người
 *    dùng bằng giá trị mặc định của một localStorage rỗng.
 *
 * ══ AGENT TẮT THÌ SAO ════════════════════════════════════════════════════════
 * Không có gì xảy ra, và đó là chủ ý. Query `retry:false` + im lặng: hỏng ⇒ `data`
 * undefined ⇒ `serverRef` vẫn null ⇒ KHÔNG ghi, KHÔNG toast, KHÔNG banner. App chạy
 * tiếp bằng bộ nhớ đệm localStorage như trước đây. Agent chạy lại thì lần đọc kế tiếp
 * kéo đĩa về, và mọi thứ người dùng chỉnh lúc offline được so với đĩa rồi ghi lên.
 *
 * ══ VÌ SAO PATCH CHỨ KHÔNG PUT ═══════════════════════════════════════════════
 * Xem `diffDiskSettings` ở `disk-settings.ts`: hai tab cùng mở, mỗi tab đổi một thứ.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { qk } from "../hooks/keys";
import { usePrefsStore } from "./prefs";
import { useUiStore } from "./ui";
import { diffDiskSettings, diskSettingsOf, type DiskSettings, type DiskSettingsPatch } from "./disk-settings";

/**
 * 600ms — cùng bậc với nhịp autosave bản nháp workflow (600ms) và contract (700ms), nên
 * ba đường ghi đĩa của app không lệch nhịp nhau. Kéo thanh trượt "số tấm cùng lúc" từ 1
 * lên 8 là 8 lần `set()`; nhịp này gộp chúng thành ĐÚNG MỘT lần ghi file.
 */
export const SETTINGS_SAVE_DELAY_MS = 600;

/** Ảnh chụp phần-sống-trên-đĩa của RAM ngay lúc này. */
export function currentDiskSettings(): DiskSettings {
  return diskSettingsOf(useUiStore.getState(), usePrefsStore.getState());
}

/**
 * Đổ tuỳ chọn từ đĩa vào hai store. Dùng `setState` thẳng (không qua action) vì đây
 * không phải một thao tác của người dùng mà là một lần KHÔI PHỤC — và vì mỗi field có
 * một action riêng, đi qua chúng sẽ là 18 lần `set()` cho một lần mở app.
 *
 * Middleware `persist` vẫn chạy ⇒ localStorage được hâm nóng theo, nên lần mở sau vẽ
 * đúng khung ngay từ frame đầu mà không phải chờ mạng.
 */
export function applyDiskSettings(s: DiskSettings): void {
  useUiStore.setState(s.ui);
  usePrefsStore.setState(s.prefs);
}

/** Đọc tuỳ chọn trên đĩa. Im lặng khi agent chưa chạy — xem khối "AGENT TẮT THÌ SAO". */
export function useDiskSettings() {
  return useQuery({
    queryKey: qk.settings(),
    queryFn: () => api.system.settings(),
    /* Nguồn sự thật chỉ đổi khi CHÍNH app này ghi (và lúc đó ta `setQueryData` tay), nên
       không có lý do gì để hỏi lại theo nhịp hay theo focus. */
    staleTime: Infinity,
    gcTime: Infinity,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useSaveDiskSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: DiskSettingsPatch) => api.system.patchSettings(patch),
    onSuccess: (data) => qc.setQueryData(qk.settings(), data),
  });
}

/**
 * Gắn MỘT LẦN ở gốc app (`App.tsx`). Không vẽ gì.
 *
 * Đặt ở gốc chứ không ở màn Cài đặt: tuỳ chọn bị đổi từ khắp nơi — công tắc chủ đề trên
 * thanh bên, ô "số tấm cùng lúc" trong modal tạo ảnh, nút gập cây thiết kế. Treo cầu vào
 * một màn thì đóng màn đó là mất đường ghi.
 */
export function SettingsSync(): null {
  const q = useDiskSettings();
  const save = useSaveDiskSettings();

  /** Bản trên ĐĨA mà ta đang tin. `null` = chưa đọc được lần nào ⇒ CẤM ghi (xem đầu file). */
  const serverRef = React.useRef<DiskSettings | null>(null);
  const saveRef = React.useRef(save.mutate);
  saveRef.current = save.mutate;

  /* ① ĐĨA → RAM. Băm nội dung làm dep: đổi workspace ⇒ `qc.clear()` ⇒ query nạp lại file
     cấu hình của workspace MỚI, và nhánh này phải chạy lại chứ không chỉ chạy lần đầu. */
  const diskKey = q.data ? JSON.stringify(q.data) : "";
  React.useEffect(() => {
    if (!q.data) return;
    serverRef.current = q.data;
    applyDiskSettings(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diskKey]);

  /* ② RAM → ĐĨA. Đăng ký ĐÚNG MỘT LẦN: `save.mutate` đi qua ref nên mảng dep rỗng là
     đúng, không phải là một lần "quên" dependency. */
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      const server = serverRef.current;
      if (server === null) return; // chưa đọc được đĩa ⇒ chưa có quyền ghi đè lên nó
      const patch = diffDiskSettings(server, currentDiskSettings());
      if (patch === null) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const s = serverRef.current;
        if (s === null) return;
        const fresh = diffDiskSettings(s, currentDiskSettings());
        if (fresh !== null) saveRef.current(fresh);
      }, SETTINGS_SAVE_DELAY_MS);
    };
    const offUi = useUiStore.subscribe(push);
    const offPrefs = usePrefsStore.subscribe(push);
    return () => {
      offUi();
      offPrefs();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return null;
}
