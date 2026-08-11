import { QueryClient } from "@tanstack/react-query";

/**
 * Server state = TanStack Query. Client state = Zustand. KHÔNG trộn hai thứ.
 *
 * Mặc định hợp với agent local (mạng loopback, rất nhanh nhưng có thể tắt
 * bất cứ lúc nào):
 *  - retry 1 lần thôi: agent tắt thì thử lại nhiều lần chỉ làm màn treo lâu,
 *    trong khi UI đã có chế độ chỉ-đọc để xử (§2.5).
 *  - staleTime 5s: đủ để không gọi lại khi chuyển tab qua lại.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      networkMode: "always", // agent là loopback; đừng tin navigator.onLine
    },
    mutations: { retry: 0, networkMode: "always" },
  },
});
