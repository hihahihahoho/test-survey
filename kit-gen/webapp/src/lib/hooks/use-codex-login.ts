/**
 * use-codex-login.ts — VÒNG ĐỜI CỦA PHIÊN ĐĂNG NHẬP BẰNG MÃ THIẾT BỊ.
 *
 * VÌ SAO KHÔNG DÙNG TanStack Query như mọi thứ khác trong `lib/hooks`
 * ─────────────────────────────────────────────────────────────────────────────
 * Query model hoá "một nguồn dữ liệu có thể đọc lại bất cứ lúc nào". Phiên đăng
 * nhập thì ngược lại: nó có ĐIỂM BẮT ĐẦU do người dùng bấm, có hạn 15 phút, và
 * cache lại nó là điều tệ nhất có thể làm — một cái mã đã chết hiện lại ở lần mở
 * màn sau trông y hệt mã còn sống. Nên state ở đây sống và chết cùng component,
 * không có `queryKey`, không `gcTime`, không persist.
 *
 * MÃ DÙNG XONG BỎ. `userCode` chỉ đi qua RAM của tab. Không `localStorage`, không
 * lọt vào báo cáo lỗi — nó không nằm trong bất kỳ object nào được store ghi xuống.
 *
 * NHỊP HỎI: 2s, và CHỈ trong lúc phiên còn chạy (`starting`/`waiting`). Xong hoặc
 * hỏng là dừng hẳn — đây là poll một tiến trình local, không phải health check.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type CodexLogin } from "../api/endpoints";
import { qk } from "./keys";

const POLL_MS = 2000;

const IDLE: CodexLogin = {
  status: "idle", verificationUrl: null, userCode: null,
  codexHomeLabel: null, startedAt: null, expiresAt: null, reason: null,
};

export type CodexLoginFlow = {
  session: CodexLogin;
  /** đang chờ agent trả lời cú bấm đầu tiên — nút phải khoá lại trong khoảnh khắc này */
  starting: boolean;
  /** phiên còn sống: đang dựng mã hoặc đang chờ người dùng xong bên trình duyệt */
  active: boolean;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  /** quên phiên đã kết thúc, để màn quay về trạng thái ban đầu */
  reset: () => void;
};

export function useCodexLogin(): CodexLoginFlow {
  const qc = useQueryClient();
  const [session, setSession] = useState<CodexLogin>(IDLE);
  const [starting, setStarting] = useState(false);
  /* Component có thể unmount giữa lúc một request đang bay (người dùng đóng thẻ
     Cài đặt). Ghi state sau đó là một cảnh báo React và một cái nút "ma". */
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const active = session.status === "starting" || session.status === "waiting";

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const s = await api.system.startCodexLogin();
      if (alive.current) setSession(s);
    } catch {
      /* Agent tắt / không với tới được. KHÔNG bịa ra `reason` của agent — dùng
         `SPAWN_FAILED` đúng nghĩa "không khởi động nổi phiên nào". */
      if (alive.current) setSession({ ...IDLE, status: "failed", reason: "SPAWN_FAILED" });
    } finally {
      if (alive.current) setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    try { const s = await api.system.cancelCodexLogin(); if (alive.current) setSession(s); }
    catch { if (alive.current) setSession(IDLE); }
  }, []);

  const reset = useCallback(() => setSession(IDLE), []);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const id = setInterval(() => {
      void (async () => {
        if (stop) return;
        try {
          const s = await api.system.codexLoginStatus();
          if (stop || !alive.current) return;
          setSession(s);
          /* Đăng nhập xong ⇒ doctor cũ (còn nói "chưa đăng nhập") thành rác ngay
             lập tức. Chỉ DỌN, không tự nạp: `codex debug prompt-input` tốn ~1s và
             màn đang mở sẽ tự đọc lại — cùng một luật với `useSetImageProfile`. */
          if (s.status === "done") qc.removeQueries({ queryKey: qk.doctor() });
        } catch { /* mất kết nối một nhịp — lần sau hỏi lại */ }
      })();
    }, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [active, qc]);

  return { session, starting, active, start, cancel, reset };
}
