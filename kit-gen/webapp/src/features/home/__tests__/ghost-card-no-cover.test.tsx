/* @vitest-environment jsdom */
/**
 * HỒI QUY QA-BLIND §6 — THẺ "MA" TỪ CACHE KHÔNG ĐƯỢC HỎI SERVER.
 *
 * Người test mù #1 mở app lần đầu, `/api/projects` trả `items: []`, mà network log vẫn
 * có `GET /api/projects/hello-368a/cover` → 404 lặp cho một id không có trong cả danh
 * sách lẫn thùng rác.
 *
 * Đường đi: `kitgen.projects.cache.v1` vẽ lưới ngay từ lần sơn đầu (§2.5-4 «agent chưa
 * chạy không phải là màn hình trắng») — đúng chủ ý — nhưng thẻ dựng từ cache lại mount
 * `KitCover` y như thẻ thật, và `KitCover` gửi `#43 GET …/cover` cho mọi dự án từng
 * chạy gen mà chưa có bìa. Dự án đã bị xoá khỏi đĩa ở phiên trước vì thế vẫn gõ cửa
 * server. Thẻ cache là ẢNH CHỤP MÀN HÌNH CŨ; nó chỉ được vẽ lại thứ đã lưu.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@/lib/types";

/* Chỉ thay ba hook đụng tới bìa; phần còn lại của `@/lib/hooks` giữ nguyên bản thật
   (`KitCardMenu` còn dùng `useRevealProject`…). */
vi.mock("@/lib/hooks", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks")>()),
  useProjectCover: vi.fn(() => ({ data: undefined })),
  useRegenerateCover: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/features/projects/lib/agent-blob", () => ({ loadThumb: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/features/projects/lib/feedback", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const { useProjectCover } = await import("@/lib/hooks");
const { KitCard } = await import("../components/KitCard");

/** Dự án ĐÃ TỪNG gen (có ảnh raw) nhưng chưa có bìa — đúng ứng viên của `watchCover`. */
const GHOST = {
  id: "hello-368a", name: "hello", slug: "hello-368a", tags: [], cover: null,
  stats: { rawPresent: 4 }, state: { stale: false, staleReason: [], jobs: {} },
} as unknown as Project;

const GATE = { readOnly: false } as never;
const mount = (fromCache: boolean) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <KitCard project={GHOST} actions={{} as never} gate={GATE} tabIndex={-1} fromCache={fromCache} />
  </QueryClientProvider>,
);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("thẻ dựng từ cache cục bộ", () => {
  it("KHÔNG hỏi bìa — id trong cache có thể là dự án đã bị xoá trên đĩa", () => {
    mount(true);
    expect(vi.mocked(useProjectCover).mock.calls.every(([id]) => id === null)).toBe(true);
  });

  it("thẻ từ danh sách THẬT vẫn hỏi bìa như cũ (không làm tắt tính năng theo dõi bìa)", () => {
    mount(false);
    expect(vi.mocked(useProjectCover).mock.calls.some(([id]) => id === GHOST.id)).toBe(true);
  });
});
