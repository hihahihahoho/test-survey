/**
 * NÚT [Cập nhật] Ở SIDEBAR — render THẬT (`renderToString`, cùng giới hạn đã nói ở
 * `features/setup/__tests__/render-smoke.test.tsx`: repo chưa có jsdom).
 *
 * Ca đắt nhất ở đây KHÔNG phải "nút hiện đúng chữ" mà là **nút KHÔNG hiện**: nó ẩn
 * trong 99% thời gian, nên hồi quy kiểu "lúc nào cũng thấy nút Cập nhật" sẽ lọt nếu
 * chỉ test ca có bản mới.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UpdateCheck } from "@/lib/api";
import { qk } from "@/lib/hooks/keys";
import { UpdateSidebarButton } from "../components/UpdateSidebarButton";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

const LATEST: UpdateCheck = {
  ok: true, currentVersion: "2.1.13", latestVersion: "2.1.13", tag: "kitgen-v2.1.13",
  available: false, updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-13T02:00:00.000Z",
};
const AVAILABLE: UpdateCheck = { ...LATEST, latestVersion: "2.2.0", tag: "kitgen-v2.2.0", available: true };
const OFFLINE: UpdateCheck = {
  ok: false, currentVersion: "2.1.13", latestVersion: null, tag: null, available: false,
  reason: "OFFLINE", updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-13T02:00:00.000Z",
};

function render(seed?: UpdateCheck): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.update(), seed);
  return renderToString(
    <QueryClientProvider client={qc}>
      <UpdateSidebarButton />
    </QueryClientProvider>
  );
}

describe("Sidebar · nút Cập nhật", () => {
  it("chưa kiểm tra xong → KHÔNG render gì (không chiếm chỗ, không vào thứ tự Tab)", () => {
    expect(render()).toBe("");
  });

  it("đang dùng bản mới nhất → KHÔNG render gì", () => {
    expect(render(LATEST)).toBe("");
  });

  it("kiểm tra thất bại (mất mạng) → KHÔNG mời cập nhật", () => {
    expect(render(OFFLINE)).toBe("");
  });

  it("có bản mới → hiện nút gọn, nêu đích danh version", () => {
    const html = render(AVAILABLE);
    expect(html).toContain("Cập nhật 2.2.0");
    expect(html).toContain("<button");
  });
});
