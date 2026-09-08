/**
 * webapp/src/lib/hooks/query-client.ts — cấu hình TanStack Query cho agent LOCAL.
 *
 * Agent chạy trên loopback: rất nhanh (sub-ms) nhưng có thể TẮT bất cứ lúc nào.
 * Hai đặc điểm đó dẫn tới các lựa chọn sau, mỗi cái có lý do:
 *
 *  · `networkMode: "always"` — `navigator.onLine` nói về Internet, không nói gì về
 *    127.0.0.1. Tin nó thì app sẽ từ chối gọi agent khi user rút mạng, dù agent vẫn chạy.
 *  · `retry` tuỳ mã lỗi — retry một lỗi 403 ORIGIN_NOT_ALLOWED là vô nghĩa (lần sau vẫn 403)
 *    và làm màn hình treo 3× lâu hơn trước khi hiện banner §2.5. Chỉ retry lỗi tạm thời.
 *  · `staleTime` phân tầng: xem `STALE` bên dưới.
 *  · Mutation KHÔNG retry — §6.1: "POST tạo/sửa KHÔNG retry tự động (tránh nhân bản đôi)".
 *    Lớp transport cũng đã chặn, đây là lớp thứ hai.
 */
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { AgentError } from "../api/client";

/**
 * staleTime theo bản chất dữ liệu, không phải theo cảm tính:
 *  · health   — 2s: pill phải phản ứng nhanh khi agent tắt/bật.
 *  · doctor   — 60s: §6.2 CẤM poll (mỗi lần chạy `codex debug prompt-input` ~1s).
 *  · projects — 10s: quét đĩa, đổi khi user thao tác (đã có invalidate chủ động).
 *  · contract — 30s: chỉ đổi khi chính user lưu, hoặc sửa ngoài (agent báo qua stream).
 *  · run đang chạy — 0: luôn coi là cũ, nguồn thật là stream/poll.
 *  · elementLib — 1 giờ: catalogue chỉ đọc, ETag dài hạn (#28).
 */
export const STALE = {
  health: 2_000,
  doctor: 60_000,
  projects: 10_000,
  projectDetail: 5_000,
  contract: 30_000,
  refs: 30_000,
  runsList: 5_000,
  runActive: 0,
  kit: 30_000,
  elementLib: 60 * 60_000,
  trash: 30_000,
} as const;

/** gcTime: giữ cache đủ lâu để §2.5 "vẽ từ cache khi agent tắt" có gì mà vẽ. */
export const GC = {
  default: 10 * 60_000,
  projects: 30 * 60_000,
  contract: 15 * 60_000,
  runFinished: 30 * 60_000,
} as const;

/** Mã lỗi mà thử lại chắc chắn cũng ra kết quả cũ ⇒ đừng phí thời gian của user. */
const NO_RETRY_CODES = new Set([
  "ORIGIN_NOT_ALLOWED", "BAD_HOST", "AGENT_PROTOCOL_OLD", "AGENT_PROTOCOL_NEW",
  "PROJECT_NOT_FOUND", "PROJECT_IN_TRASH", "PROJECT_BROKEN", "CONTRACT_BROKEN",
  "CONTRACT_CONFLICT", "CONTRACT_INVALID", "RUN_CONFLICT", "RUN_NOT_FOUND",
  "UNKNOWN_JOB", "LOG_NOT_FOUND", "KIT_NOT_CUT", "TOO_LARGE", "BAD_TYPE",
  "REF_IN_USE", "PROJECT_ID_TAKEN", "CONFIRM_REQUIRED", "CONFIRM_INVALID",
  "CONFIRM_LOCKED", "IMPORT_INVALID", "PATH_ESCAPE", "IF_MATCH_REQUIRED",
]);

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false; // §6.1: GET retry đúng 1 lần
  if (error instanceof AgentError) {
    if (NO_RETRY_CODES.has(error.code)) return false;
    // 4xx (trừ 429) là lỗi của yêu cầu, không phải lỗi tạm thời.
    if (error.status >= 400 && error.status < 500 && error.status !== 429) return false;
  }
  return true;
}

/**
 * Nơi duy nhất bắt lỗi toàn cục. Cố ý KHÔNG hiện toast ở đây: nhiều lỗi có UI riêng
 * (409 CONTRACT_CONFLICT → modal so sánh; RUN_CONFLICT → toast có nút [Xem lượt đó]).
 * Toast tự động ở tầng này sẽ đá nhau với chúng và làm user thấy 2 thông báo cho 1 lỗi.
 * Màn hình tự quyết định, dùng `presentError()` để lấy copy.
 */
export function createQueryClient(handlers: {
  onQueryError?: (error: unknown) => void;
  onMutationError?: (error: unknown) => void;
} = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => handlers.onQueryError?.(error),
    }),
    mutationCache: new MutationCache({
      onError: (error) => handlers.onMutationError?.(error),
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: 400,
        staleTime: STALE.projects,
        gcTime: GC.default,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        networkMode: "always",
      },
      mutations: {
        retry: 0, // §6.1 — không bao giờ retry thao tác ghi
        networkMode: "always",
      },
    },
  });
}

export const queryClient = createQueryClient();
