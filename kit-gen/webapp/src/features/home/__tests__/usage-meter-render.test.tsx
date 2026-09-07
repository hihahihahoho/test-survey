/**
 * THANH HẠN MỨC — render THẬT (`renderToString`; repo chưa có jsdom, xem
 * `update-sidebar-button.test.tsx` cho cùng giới hạn đó).
 *
 * Ca đáng tiền ở đây là ca đã sập ngoài đời (07/09/2026): thanh hiện "còn 0% · số đọc
 * lúc 03/09 12:43" và ĐỨNG IM cả ngày. Con số 0% là thật; cái sai là người dùng không
 * có cách nào bắt nó nói lại, và cũng không biết còn đường nào khác (ví trả thêm)
 * hay không. Nên bộ này canh đúng ba thứ:
 *   1. cả thanh là một `<button>` bấm được — không phải chữ chết;
 *   2. nhãn cho screen reader mang ĐỦ sự thật: %, mốc đặt lại, gói cước, ví, và
 *      "số đọc lúc …" (thứ không bao giờ được cắt);
 *   3. chưa có số ⇒ vẫn KHÔNG bịa 0% (luật 1 của `usage-meter.ts` không bị bản vá này phá).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Usage } from "@/lib/types/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { qk } from "@/lib/hooks/keys";
import { UsageMeter } from "../components/UsageMeter";

beforeEach(() => {
  /* Không một request nào được đi ra trong ca này: mọi số đều được gieo vào cache. */
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

/** Hình dạng THẬT của `/api/usage` trên máy đã báo bug: tuần cạn, ví cũng cạn. */
const CAN_SACH: Usage = {
  ok: true,
  codexHomeLabel: "~/.codex",
  plan: "prolite",
  primary: { usedPercent: 100, remainingPercent: 0, windowMinutes: 10080, resetsAt: "2026-09-07T06:43:35.000Z" },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: 0 },
  observedAt: "2026-09-03T05:43:05.955Z",
  checkedAt: "2026-09-03T05:43:10.000Z",
};

function render(seed?: Usage, variant: "sidebar" | "compact" = "sidebar"): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.usage(), seed);
  return renderToString(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <UsageMeter variant={variant} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe("UsageMeter · bấm được, và nói đủ sự thật", () => {
  it("có số ⇒ cả thanh là NÚT (bấm để đọc lại), cả hai dáng", () => {
    expect(render(CAN_SACH)).toContain("<button");
    expect(render(CAN_SACH, "compact")).toContain("<button");
  });

  it("hạn mức cạn: vẫn hiện «còn 0%» thành CHỮ, không chỉ bằng màu (A3)", () => {
    expect(render(CAN_SACH)).toContain("còn 0%");
  });

  it("nhãn trợ năng mang gói cước + ví + mốc quan sát — trả lời «còn đường nào không»", () => {
    const html = render(CAN_SACH);
    expect(html).toContain("Gói prolite");
    expect(html).toContain("Số dư mua thêm: 0");
    expect(html).toContain("số đọc lúc");
  });

  it("agent CŨ không trả credits ⇒ bỏ dòng ví, thanh vẫn render bình thường", () => {
    const html = render({ ...CAN_SACH, credits: undefined });
    expect(html).toContain("<button");
    expect(html).not.toContain("Số dư mua thêm");
  });

  it("CHƯA có số ⇒ không vẽ 0% và không dựng nút giả (dáng compact ẩn hẳn)", () => {
    expect(render(undefined, "compact")).toBe("");
    expect(render({ ok: false, reason: "NO_DATA", primary: null, secondary: null }, "compact")).toBe("");
  });
});
