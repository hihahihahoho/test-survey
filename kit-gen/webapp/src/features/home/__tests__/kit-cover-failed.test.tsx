/**
 * ẢNH BÌA HỎNG PHẢI NÓI LÀ HỎNG — render THẬT (`renderToString`, cùng giới hạn đã
 * ghi ở `update-sidebar-button.test.tsx`: `npm test` chạy môi trường "node").
 *
 * Ca đắt nhất KHÔNG phải "vẽ được ảnh" mà là LỜI NÓI DỐI IM LẶNG: `cover/cover.json`
 * đã `status:"failed"` (thường là `NOT_LOGGED_IN`) nhưng thẻ vẫn hiện «Chưa vẽ ảnh
 * nào» — user ngồi đợi một tấm ảnh sẽ không bao giờ tới, và không có test nào đỏ.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoverStatus } from "@/lib/types";
import { qk } from "@/lib/hooks/keys";
import { KitCover, coverFailReason } from "../components/KitCover";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

const PID = "p1";

function render(cover: CoverStatus | undefined, over: { watchCover?: boolean; offline?: boolean } = {}): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cover) qc.setQueryData(qk.projects.cover(PID), cover);
  return renderToString(
    <QueryClientProvider client={qc}>
      <KitCover
        projectId={PID}
        coverPath={null}
        kitName="Chợ Tết 2027"
        offline={over.offline ?? false}
        watchCover={over.watchCover ?? true}
      />
    </QueryClientProvider>,
  );
}

const failed = (error: string): CoverStatus =>
  ({ status: "failed", path: null, error, updatedAt: null, startedAt: null, titleZone: null, size: null }) as CoverStatus;

describe("Thẻ bộ kit · ảnh bìa", () => {
  it("vẽ bìa HỎNG (chưa đăng nhập) → nói đúng lý do + mời vẽ lại, KHÔNG nói «Chưa vẽ ảnh nào»", () => {
    const html = render(failed("NOT_LOGGED_IN"));
    expect(html).toContain("Vẽ bìa lỗi");
    expect(html).toContain("công cụ tạo ảnh chưa đăng nhập");
    expect(html).toContain("Vẽ lại");
    expect(html).not.toContain("Chưa vẽ ảnh nào");
    // Mã kỹ thuật KHÔNG được lọt ra thân UI (§3.9).
    expect(html).not.toContain("NOT_LOGGED_IN");
  });

  it("mã lỗi lạ vẫn ra một câu tiếng Việt, không phải chuỗi HOA_GẠCH_DƯỚI", () => {
    const html = render(failed("QUANTUM_FLUX"));
    // `renderToString` chèn `<!-- -->` giữa hai text node ⇒ so từng vế, không so cả câu.
    expect(html).toContain("Vẽ bìa lỗi");
    expect(html).toContain("chưa rõ nguyên nhân");
    expect(html).not.toContain("QUANTUM_FLUX");
    expect(coverFailReason("QUANTUM_FLUX")).toBe("chưa rõ nguyên nhân");
    expect(coverFailReason(null)).toBe("chưa rõ nguyên nhân");
    expect(coverFailReason("INTERRUPTED")).toBe("bị cắt ngang giữa chừng");
    expect(coverFailReason("NO_ARTIFACT")).toBe("chạy xong nhưng không có ảnh");
  });

  it("chưa vẽ lần nào → vẫn là «Chưa vẽ ảnh nào» (không doạ người dùng bằng lỗi không có)", () => {
    expect(render(undefined)).toContain("Chưa vẽ ảnh nào");
    const html = render(undefined, { watchCover: false });
    expect(html).toContain("Chưa vẽ ảnh nào");
    expect(html).not.toContain("Vẽ bìa lỗi");
  });

  it("agent tắt → KHÔNG kết luận bìa hỏng: cache cũ không nói được gì về hiện tại", () => {
    const html = render(failed("NOT_LOGGED_IN"), { offline: true });
    expect(html).not.toContain("Vẽ bìa lỗi");
    // …và cũng không mời bấm một cái nút chắc chắn 403.
    expect(html).not.toContain("Vẽ lại");
  });
});
