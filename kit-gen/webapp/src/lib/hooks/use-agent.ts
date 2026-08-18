/**
 * webapp/src/lib/hooks/use-agent.ts — sức khoẻ agent (#1–#4) + chế độ chỉ-đọc §2.5.
 *
 * `/health` là endpoint DUY NHẤT được gọi định kỳ (§6.2). `/api/doctor` CẤM poll vì mỗi
 * lần nó chạy `codex debug prompt-input` (~1s) — nên `useDoctor` mặc định `enabled:false`,
 * màn phải chủ động bật (mở S6, setup, bấm [Kiểm tra lại], trước khi mở modal M1).
 */
import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { diagnose, type BridgeResult, type ConnectionStatus } from "../api/connection";
import { healthProbe } from "../api/health-probe";
import { qk } from "./keys";
import { STALE } from "./query-client";
import { useUpdateInstall } from "../update/install-store";
import { UPDATE_FOCUS_THROTTLE_MS, UPDATE_POLL_INTERVAL_MS } from "../update/watch";

/**
 * Trạng thái kết nối + nhịp probe backoff 1.5→3→6→15s (arch §5.3).
 * Tab ẩn ⇒ DỪNG hẳn: probe khi user không nhìn chỉ tốn pin và log.
 *
 * ĐÂY CHỈ CÒN LÀ CỬA SỔ NHÌN VÀO MỘT VÒNG PROBE DÙNG CHUNG (`lib/api/health-probe.ts`).
 * Bản cũ dựng vòng probe ngay trong `useEffect` này, nên mỗi component gọi hook là thêm
 * một vòng `/health` song song — 9+ chỗ gọi ⇒ hàng trăm request lặp (QA blind). Nay gọi
 * bao nhiêu lần cũng chỉ có MỘT vòng; hook không giữ timer, không giữ AbortController.
 *
 * Shape trả về KHÔNG ĐỔI: 9 chỗ gọi không phải sửa gì.
 */
export function useAgentStatus(opts: { hasActiveRun?: boolean } = {}): {
  status: ConnectionStatus;
  recheck: () => void;
  runBridgeProbe: () => Promise<BridgeResult>;
} {
  const hasActiveRun = opts.hasActiveRun ?? false;
  /* `getStatus` trả CÙNG một object giữa hai lượt probe ⇒ không render vô ích, và
     `useSyncExternalStore` không kêu "getSnapshot should be cached". */
  const status = useSyncExternalStore(healthProbe.subscribe, healthProbe.getStatus, healthProbe.getStatus);

  /* Nhịp 1.5s là thuộc tính của CẢ APP, không của riêng màn nào: còn ≥1 màn khai "đang
     có run chạy" thì vòng chung giữ nhịp dày. Giữ chỗ bằng effect riêng để việc
     `hasActiveRun` đổi không kéo theo đăng ký/huỷ đăng ký cả subscriber. */
  useEffect(() => {
    if (!hasActiveRun) return;
    return healthProbe.holdActiveRun();
  }, [hasActiveRun]);

  return {
    status,
    recheck: healthProbe.recheck,
    /**
     * Cầu dò popup — CHỈ gọi từ cử chỉ user (nút bấm). Sau khi có kết quả thì probe lại
     * để `diagnose()` dùng bằng chứng mới mà kết luận ca 3a → ca 3b hoặc ca 2. Kết quả
     * cầu dò là bằng chứng CHUNG: mọi màn cùng thoát khỏi trạng thái "chưa kết luận".
     */
    runBridgeProbe: healthProbe.runBridgeProbe,
  };
}

/** §2.5: agent không sẵn sàng ⇒ mọi nút gây thay đổi `disabled` + tooltip, KHÔNG ẩn nút. */
export function useReadOnly(status: ConnectionStatus): boolean {
  return status.readOnly || !status.connected;
}

/** #1 — `/health` qua Query, cho những chỗ chỉ cần số liệu (workspace label, activeRuns). */
export function useHealth() {
  return useQuery({
    queryKey: qk.health(),
    queryFn: async () => {
      const s = await diagnose();
      return s.health;
    },
    staleTime: STALE.health,
    refetchInterval: false, // nhịp probe do useAgentStatus lo, không nhân đôi
  });
}

/** #2 — doctor. `enabled` mặc định FALSE: §6.2 cấm poll endpoint này. */
export function useDoctor(opts: { enabled?: boolean; refresh?: boolean } = {}) {
  return useQuery({
    queryKey: qk.doctor(),
    queryFn: () => api.system.doctor({ refresh: opts.refresh ?? false }),
    enabled: opts.enabled ?? false,
    staleTime: STALE.doctor,
    gcTime: STALE.doctor * 2,
  });
}

/**
 * NGOẠI LỆ CÓ CHỦ ĐÍCH với kỷ luật "không tự gọi mạng ngoài": nút [Cập nhật] ở sidebar
 * phải TỰ hiện khi có bản mới, nên lần kiểm tra đầu của phiên chạy im lặng lúc app mở.
 * Chỉ endpoint NÀY được miễn; `/api/doctor` và mọi API khác giữ nguyên luật cũ.
 *
 * "Im lặng" là hợp đồng, không phải mô tả: `retry:false` ⇒ mất mạng KHÔNG thử lại,
 * không toast, không banner — lỗi chỉ làm `data` undefined và nút vẫn ẩn.
 *
 * KHÔNG CÒN "đúng một lần mỗi phiên": app này mở cả ngày, và bản vá phát hành lúc 10h
 * mà chỉ tới tay người dùng khi họ tình cờ bấm F5 thì coi như không phát hành. Chính
 * sách hỏi lại (nhịp 30 phút · sàn 5 phút cho lần quay lại tab) và lý do từng con số
 * nằm ở `lib/update/watch.ts` — ở đây chỉ CẮM nó vào query.
 *
 * Ba thứ vẫn giữ nguyên vì chúng là cái giữ cho "im lặng" đúng là im lặng:
 *  · `retry:false` — mất mạng KHÔNG thử lại, không toast, không banner;
 *  · `refetchOnMount:false` — đổi màn/mở popover KHÔNG sinh request; freshness là việc
 *    của nhịp + focus, không phải của việc điều hướng trong app;
 *  · `refetchIntervalInBackground` để mặc định (false) — tab ẩn/máy ngủ thì nhịp không
 *    tick, không có chuyện thức dậy nhận một tràng request dồn.
 * Nút [Kiểm tra cập nhật] ở Cài đặt → Giới thiệu vẫn ép được bằng `refetch()`.
 */
export function useUpdateCheck(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.update(),
    queryFn: () => api.system.checkUpdate(),
    enabled: opts.enabled ?? true,
    /* staleTime CHÍNH LÀ sàn chống dội của refetch-on-focus: react-query chỉ hỏi lại khi
       dữ liệu đã cũ, nên alt-tab qua lại liên tục cũng chỉ tốn 1 request mỗi 5 phút. */
    staleTime: UPDATE_FOCUS_THROTTLE_MS,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: UPDATE_POLL_INTERVAL_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

/**
 * Luồng cài bản mới, dùng CHUNG cho cả ba chỗ mời cập nhật (sidebar · popover trạng
 * thái · Cài đặt → Giới thiệu) để ba nơi không trôi khỏi nhau. Đây chỉ là cái CÔNG TẮC;
 * toàn bộ máy trạng thái nằm ở `lib/update/install-store` vì nó phải sống lâu hơn
 * component đã bấm nó (đóng popover = unmount, xem ghi chú trong file đó).
 *
 * Bấm xong, cái user thấy KHÔNG phải là nút này đổi chữ mà là lớp phủ toàn trang do
 * `App.tsx` gắn — nên `pending` ở đây chỉ còn dùng để nút không nhận cú bấm thứ hai.
 */
export function useInstallUpdateFlow(): { pending: boolean; start: (latestVersion?: string | null) => Promise<void> } {
  const phase = useUpdateInstall((s) => s.phase);
  const start = useUpdateInstall((s) => s.start);
  return {
    pending: phase !== "idle",
    start: (latestVersion?: string | null) => start(latestVersion),
  };
}

/**
 * Đổi hồ sơ Codex dùng để tạo ảnh. Agent ghi bền vào `<workspace>/.kitgen/config.json`
 * và tự bỏ cache doctor 60s của nó, nên chỉ cần đọc lại doctor là ra trạng thái hồ sơ MỚI.
 *
 * `invalidateQueries` chỉ ĐÁNH DẤU cũ rồi để observer tự nạp — người gọi lại thường
 * `refetch()` ngay sau đó để biết CHÍNH XÁC lúc nào xong (còn giữ nút ở trạng thái đang
 * đổi). Hai đường cùng chạy là hai lượt `codex debug prompt-input` (~1s/lượt) cho một
 * hành động ⇒ ở đây chỉ dọn cache, KHÔNG tự nạp lại; việc nạp là của màn đang mở.
 */
export function useSetImageProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "default" | "separate") => api.system.setImageProfile(mode),
    onSuccess: () => qc.removeQueries({ queryKey: qk.doctor(), type: "inactive" }),
  });
}

/**
 * Quota Codex còn lại. KHÔNG cùng loại với `/api/doctor`: endpoint này chỉ đọc file
 * trạng thái local (không spawn `codex`, không gọi mạng, không tốn quota) nên gọi
 * được lúc app mở mà không vi phạm §6.2.
 *
 * `staleTime` 5 phút khớp đúng cache phía agent — nạp dày hơn cũng chỉ nhận lại y
 * hệt con số cũ, vì nguồn của nó là lượt chạy Codex gần nhất chứ không phải hiện tại.
 *
 * `retry:false` + im lặng: đây là số liệu THAM KHẢO. Agent tắt ⇒ `data` undefined ⇒
 * thanh usage tự ẩn; không toast, không banner, không làm hỏng màn vì một thứ phụ.
 */
export function useUsage(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.usage(),
    queryFn: () => api.system.usage(),
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/** #3 */
export function useWorkspaces(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.workspaces(),
    queryFn: () => api.system.workspaces(),
    enabled: opts.enabled ?? true,
    staleTime: STALE.projects,
  });
}

/** #4 — đổi workspace: id ĐỤC, không path (chốt X1). Đổi xong thì MỌI dữ liệu cũ đều sai. */
export function useActivateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.system.activateWorkspace(workspaceId),
    onSuccess: () => {
      // Workspace khác = tập project khác hoàn toàn. Xoá sạch cache thay vì invalidate,
      // để không có một khoảnh khắc nào màn hình trộn project của hai workspace.
      qc.clear();
    },
  });
}

/** #19/#20 — upload + đối chiếu trước khi nhập (wizard §4.6). */
export function useUpload() {
  return useMutation({ mutationFn: (file: File) => api.uploads.create(file) });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (payload: { source: "zip" | "stylesJson" | "folder"; uploadId?: string; path?: string }) =>
      api.import.preview(payload),
  });
}
