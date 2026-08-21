/**
 * NÚT [Cập nhật] TRÊN HEADER — render THẬT (`renderToString`; repo chưa có jsdom, xem
 * `features/setup/__tests__/render-smoke.test.tsx`).
 *
 * Nút này sinh ra vì lối cập nhật cũ chỉ nằm ở sidebar, mà sidebar chỉ có ở Home: đang
 * làm trong một dự án thì phải thoát ra mới thấy nút. Người dùng đã kêu đúng chuyện đó.
 *
 * Ca đắt nhất KHÔNG phải "hiện đúng chữ" mà là **KHÔNG hiện**: nút ẩn trong 99% thời
 * gian, nên hồi quy kiểu "lúc nào cũng thấy nút Cập nhật trên header" sẽ lọt nếu chỉ
 * test ca có bản mới. Ba ca ẩn ở đây là bản sao có chủ ý của bộ ca nút sidebar — hai nút
 * PHẢI cùng một luật, lệch nhau là một trong hai mời người dùng sai lúc.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UpdateCheck } from "@/lib/api";
import { qk } from "@/lib/hooks/keys";
import { UpdateHeaderButton } from "../UpdateHeaderButton";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

const LATEST: UpdateCheck = {
  ok: true, currentVersion: "2.1.36", latestVersion: "2.1.36", tag: "kitgen-v2.1.36",
  available: false, updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-21T02:00:00.000Z",
};
const AVAILABLE: UpdateCheck = { ...LATEST, latestVersion: "2.2.0", tag: "kitgen-v2.2.0", available: true };
const OFFLINE: UpdateCheck = {
  ok: false, currentVersion: "2.1.36", latestVersion: null, tag: null, available: false,
  reason: "OFFLINE", updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-21T02:00:00.000Z",
};

function render(seed?: UpdateCheck): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.update(), seed);
  return renderToString(
    <QueryClientProvider client={qc}>
      <UpdateHeaderButton />
    </QueryClientProvider>
  );
}

describe("Header · nút Cập nhật", () => {
  it("chưa kiểm tra xong → KHÔNG render gì (không chiếm chỗ, không vào thứ tự Tab)", () => {
    expect(render()).toBe("");
  });

  it("đang dùng bản mới nhất → KHÔNG render gì", () => {
    expect(render(LATEST)).toBe("");
  });

  it("kiểm tra thất bại (mất mạng) → KHÔNG mời cập nhật", () => {
    expect(render(OFFLINE)).toBe("");
  });

  it("có bản mới → hiện nút, nêu đích danh version", () => {
    const html = render(AVAILABLE);
    expect(html).toContain("<button");
    expect(html).toContain("Cập nhật 2.2.0");
  });

  it("màn hẹp giấu CHỮ chứ không giấu nút — icon vẫn bấm được, vẫn có tên cho trình đọc màn hình", () => {
    const html = render(AVAILABLE);
    // Chữ nằm trong <span class="hidden sm:inline">, còn aria-label thì luôn có.
    expect(html).toContain("hidden sm:inline");
    expect(html).toContain('aria-label="Cập nhật KitGen lên 2.2.0"');
  });
});
