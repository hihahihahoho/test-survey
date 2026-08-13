/**
 * webapp/src/lib/hooks/use-agent.ts — sức khoẻ agent (#1–#4) + chế độ chỉ-đọc §2.5.
 *
 * `/health` là endpoint DUY NHẤT được gọi định kỳ (§6.2). `/api/doctor` CẤM poll vì mỗi
 * lần nó chạy `codex debug prompt-input` (~1s) — nên `useDoctor` mặc định `enabled:false`,
 * màn phải chủ động bật (mở S6, setup, bấm [Kiểm tra lại], trước khi mở modal M1).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { bridgeProbe, checkingStatus, createProbeSchedule, diagnose, type BridgeResult, type ConnectionStatus } from "../api/connection";
import { qk } from "./keys";
import { STALE } from "./query-client";

/**
 * Trạng thái kết nối + nhịp probe backoff 1.5→3→6→15s (arch §5.3).
 * Tab ẩn ⇒ DỪNG hẳn: probe khi user không nhìn chỉ tốn pin và log.
 */
export function useAgentStatus(opts: { hasActiveRun?: boolean } = {}): {
  status: ConnectionStatus;
  recheck: () => void;
  runBridgeProbe: () => Promise<BridgeResult>;
} {
  const [status, setStatus] = useState<ConnectionStatus>(() => checkingStatus());
  const [tick, setTick] = useState(0);
  const bridgeRef = useRef<BridgeResult | null>(null);
  const schedule = useRef(createProbeSchedule());
  const hasActiveRun = opts.hasActiveRun ?? false;

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(run, 5000); // tab ẩn: chỉ ngó lại sau 5s, không probe
        return;
      }
      try {
        const s = await diagnose({ signal: ac.signal, bridgeResult: bridgeRef.current });
        if (!cancelled) setStatus(s);
        const wait = schedule.current.next({ hasActiveRun, connected: s.connected });
        timer = setTimeout(run, wait);
      } catch {
        if (!cancelled) timer = setTimeout(run, 3000);
      }
    };
    void run();

    const onVisible = () => {
      if (!document.hidden) {
        schedule.current.reset();
      }
    };
    document?.addEventListener?.("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      ac.abort();
      if (timer !== null) clearTimeout(timer);
      document?.removeEventListener?.("visibilitychange", onVisible);
    };
  }, [tick, hasActiveRun]);

  return {
    status,
    recheck: () => setTick((t) => t + 1),
    /**
     * Cầu dò popup — CHỈ gọi từ cử chỉ user (nút bấm). Sau khi có kết quả thì probe lại
     * để `diagnose()` dùng bằng chứng mới mà kết luận ca 3a → ca 3b hoặc ca 2.
     */
    runBridgeProbe: async () => {
      const r = await bridgeProbe();
      bridgeRef.current = r;
      setTick((t) => t + 1);
      return r;
    },
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
 * ĐÚNG MỘT LẦN MỖI PHIÊN: `staleTime` 12h giữ dữ liệu "còn tươi", `gcTime` 24h giữ nó
 * sống qua lúc mọi component dùng hook unmount (đổi màn), và `refetchOnMount`/
 * `refetchOnWindowFocus` tắt để quay lại tab không sinh request mới. Nút [Kiểm tra
 * cập nhật] ở Cài đặt → Giới thiệu vẫn ép được bằng `refetch()`.
 */
export function useUpdateCheck(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.update(),
    queryFn: () => api.system.checkUpdate(),
    enabled: opts.enabled ?? true,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useInstallUpdate() {
  return useMutation({ mutationFn: () => api.system.installUpdate() });
}

/**
 * Luồng cài bản mới, dùng CHUNG cho cả ba chỗ mời cập nhật (sidebar · popover trạng
 * thái · Cài đặt → Giới thiệu) để ba nơi không trôi khỏi nhau.
 *
 * Cập nhật làm công cụ local KHỞI ĐỘNG LẠI, tức là cắt ngang việc user đang làm ⇒ luôn
 * hỏi trước. Agent trả 202 rồi mới tự thay mình, nên trang chờ 5s rồi tải lại.
 */
export function useInstallUpdateFlow() {
  const install = useInstallUpdate();
  const start = async (latestVersion?: string | null) => {
    const target = latestVersion ? `lên ${latestVersion}` : "lên bản mới";
    if (!window.confirm(`Cập nhật KitGen ${target}? Công cụ local sẽ khởi động lại sau khi cài.`)) return;
    await install.mutateAsync();
    window.setTimeout(() => window.location.reload(), 5000);
  };
  return { pending: install.isPending, start };
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
