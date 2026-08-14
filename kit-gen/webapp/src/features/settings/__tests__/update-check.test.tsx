/**
 * NÚT "KIỂM TRA CẬP NHẬT" (Cài đặt → Giới thiệu) — render THẬT, không đọc code rồi tin.
 *
 * Nguồn sự thật của "bản mới nhất" là `kit-gen/release.json` được publish trên nhánh
 * phát hành. Trình duyệt KHÔNG tự fetch được nó (raw.githubusercontent.com không trả
 * CORS cho origin loopback), nên công cụ local đọc hộ qua `GET /api/update`. Ở đây ta
 * kiểm phần UI của hợp đồng đó; phần agent được kiểm ở `agent/test/suite-system.mjs`.
 *
 * Giới hạn giống `features/setup/__tests__/render-smoke.test.tsx`: `renderToString`
 * chứ không phải jsdom (repo chưa có `jsdom`/`@testing-library`), nên test này kiểm
 * TỪNG TRẠNG THÁI bằng cách nạp sẵn cache của query `["update"]` — mạnh hơn bấm nút,
 * vì mỗi trạng thái được ép vào đúng ca cần kiểm.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConnectionStatus, UpdateCheck } from "@/lib/api";
import { qk } from "@/lib/hooks/keys";
import { AboutTab } from "../tabs/AboutTab";

beforeEach(() => {
  vi.stubGlobal("__APP_VERSION__", "2.1.13");
  // Nếu UI lỡ tự gọi mạng, ca "không tự kiểm tra" bên dưới sẽ bắt được.
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

const CONNECTED = {
  pill: "connected", code: null, case: "ok", readOnly: false, connected: true,
  entry: "app", sameOrigin: true, base: "http://127.0.0.1:8765",
  health: { protocol: 1 }, workspaceLabel: "~/KitGen", agentVersion: "1.2.0",
  instanceLabel: "gray-otter", updateCommand: null, needsBridgeProbe: false,
  ambiguous: false, httpStatus: null, mirrorUrl: "http://127.0.0.1:8765/app/",
  checkedAt: "2026-08-13T02:00:00.000Z",
} as unknown as ConnectionStatus;

const OFFLINE_AGENT = { ...CONNECTED, connected: false, pill: "not-found", agentVersion: null } as ConnectionStatus;

const LATEST: UpdateCheck = {
  ok: true, currentVersion: "2.1.13", latestVersion: "2.1.13", tag: "kitgen-v2.1.13",
  available: false, updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-13T02:00:00.000Z",
};
const AVAILABLE: UpdateCheck = { ...LATEST, latestVersion: "2.2.0", tag: "kitgen-v2.2.0", available: true };
/** BACKLOG #23: bản mới CÓ THẬT nhưng CI chưa upload xong ⇒ chưa tải về được.
 *  `reason` ép kiểu vì union trong `endpoints.ts` chưa liệt kê giá trị này (xem
 *  `lib/update/watch.ts` · `isArchivePending`). */
const PACKAGING = {
  ...LATEST, latestVersion: "2.2.0", tag: "kitgen-v2.2.0", available: false, reason: "ARCHIVE_PENDING",
} as unknown as UpdateCheck;
const OFFLINE: UpdateCheck = {
  ok: false, currentVersion: "2.1.13", latestVersion: null, tag: null, available: false,
  reason: "OFFLINE", updateCommand: "~/.kitgen/bin/kitgen update", checkedAt: "2026-08-13T02:00:00.000Z",
};

/** Render tab Về với cache `["update"]` đã nạp sẵn (hoặc rỗng = chưa kiểm tra lần nào). */
function render(status: ConnectionStatus, seed?: UpdateCheck): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) qc.setQueryData(qk.update(), seed);
  return renderToString(
    <QueryClientProvider client={qc}>
      <AboutTab status={status} />
    </QueryClientProvider>
  );
}

/** Bỏ thẻ HTML để so chuỗi hiển thị, không dính tên class. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Cài đặt → Giới thiệu · Kiểm tra cập nhật", () => {
  it("có nút [Kiểm tra cập nhật] và KHÔNG tự gọi mạng khi mở tab", () => {
    const html = render(CONNECTED);
    expect(textOf(html)).toContain("Kiểm tra cập nhật");
    expect(textOf(html)).toContain("Chưa kiểm tra lần nào");
    // §quyền riêng tư: đây là lần duy nhất app chạm Internet ⇒ phải do user bấm.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("đang mới nhất → nói đúng câu đó, KHÔNG mời cập nhật", () => {
    const t = textOf(render(CONNECTED, LATEST));
    expect(t).toContain("Đang dùng bản mới nhất");
    expect(t).toContain("2.1.13");
    expect(t).not.toContain("Cập nhật ngay");
    // đang mới nhất thì không cần lệnh thủ công — đừng bày thêm việc
    expect(t).not.toContain("~/.kitgen/bin/kitgen update");
  });

  it("có bản mới → nêu đích danh version, có [Cập nhật ngay] VÀ lệnh thủ công", () => {
    const t = textOf(render(CONNECTED, AVAILABLE));
    expect(t).toContain("Có bản 2.2.0");
    expect(t).toContain("Bản đang chạy là 2.1.13");
    expect(t).toContain("Cập nhật ngay");
    expect(t).toContain("~/.kitgen/bin/kitgen update");
  });

  it("không kiểm tra được ≠ đang mới nhất (§3.9 cấm gộp hai câu)", () => {
    const t = textOf(render(CONNECTED, OFFLINE));
    expect(t).toContain("kiểm tra kết nối mạng");
    expect(t).not.toContain("Đang dùng bản mới nhất");
    expect(t).not.toContain("Cập nhật ngay");
    // vẫn còn đường thủ công
    expect(t).toContain("~/.kitgen/bin/kitgen update");
  });

  /* BACKLOG #23 — `release.json` lên cùng lúc gắn tag, tarball có sau ~15 phút. Trong
     cửa sổ đó agent trả ok:true + available:false + reason ARCHIVE_PENDING. Nếu tab này
     rơi vào nhánh "đang mới nhất" thì nó tự mâu thuẫn với chính dòng "Bản phát hành mới
     nhất: 2.2.0" ngay phía trên. */
  it("bản mới đang được CI đóng gói → nói ra sự thật, KHÔNG mời cập nhật, KHÔNG nói 'mới nhất'", () => {
    const t = textOf(render(CONNECTED, PACKAGING));
    expect(t).toContain("2.2.0");
    expect(t).toContain("đang được đóng gói");
    expect(t).not.toContain("Đang dùng bản mới nhất");
    expect(t).not.toContain("Cập nhật ngay");
  });

  it("công cụ local chưa chạy → nút bị chặn và nói rõ lý do", () => {
    const html = render(OFFLINE_AGENT);
    expect(textOf(html)).toContain("Công cụ local chưa chạy");
    expect(html).toMatch(/disabled[\s>=]/);
  });

  it("KHÔNG bao giờ hiện đường dẫn tuyệt đối của máy user", () => {
    for (const seed of [LATEST, AVAILABLE, OFFLINE]) {
      expect(textOf(render(CONNECTED, seed))).not.toMatch(/\/Users\/|\/home\//);
    }
  });
});

/**
 * Hợp đồng của lần kiểm tra TỰ ĐỘNG. Không render được vì `renderToString` không chạy
 * effect ⇒ kiểm bằng cách đọc mã, đúng cách `settings-overlay.test.ts` đang làm. Ba
 * điều dưới đây là thứ nếu vỡ thì user chịu hậu quả thật (spam request / toast lỗi khi
 * mất mạng / nút không bao giờ hiện), nên đáng khoá lại.
 */
describe("kiểm tra tự động khi mở app — im lặng, một lần mỗi phiên", () => {
  const hooks = readFileSync(resolve(__dirname, "..", "..", "..", "lib", "hooks", "use-agent.ts"), "utf8");

  /** Thân `useUpdateCheck`, cắt tới hook kế tiếp. */
  const updateCheckBlock = hooks.slice(
    hooks.indexOf("export function useUpdateCheck"),
    hooks.indexOf("export function useInstallUpdate"),
  );

  it("nuốt lỗi im lặng: không thử lại, không toast", () => {
    expect(updateCheckBlock).toContain("retry: false");
    // toast/banner là thứ TUYỆT ĐỐI không được có trong đường tự động
    // (so trên mã đã bỏ comment — phần giải thích được nhắc tới hai chữ đó)
    const code = hooks.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\btoast\b/);
  });

  /**
   * ĐỔI HỢP ĐỒNG (14/08): trước đây là "đúng một lần mỗi phiên". App mở cả ngày ⇒ bản
   * vá phát hành lúc 10h chỉ tới tay ai tình cờ bấm F5. Nay query tự hỏi lại theo nhịp
   * và theo lần quay lại tab. Ba thứ dưới đây là cái giữ cho việc đó không thành spam.
   */
  it("tự hỏi lại theo nhịp + khi quay lại tab, nhưng KHÔNG hỏi lại khi chỉ đổi màn", () => {
    const block = updateCheckBlock;
    expect(block).toContain("gcTime");
    // đổi màn / mở popover = remount ⇒ vẫn KHÔNG được sinh request
    expect(block).toContain("refetchOnMount: false");
    expect(block).toContain("refetchOnWindowFocus: true");
    // hai con số + lý do nằm ở lib/update/watch.ts, không rải hằng số ở đây
    expect(block).toContain("refetchInterval: UPDATE_POLL_INTERVAL_MS");
    // staleTime CHÍNH LÀ sàn chống dội của refetch-on-focus
    expect(block).toContain("staleTime: UPDATE_FOCUS_THROTTLE_MS");
  });

  it("một nguồn sự thật: sidebar, popover và Cài đặt cùng đi qua useUpdateCheck", () => {
    const src = (p: string) => readFileSync(resolve(__dirname, "..", "..", "..", p), "utf8");
    for (const p of [
      "features/home/components/UpdateSidebarButton.tsx",
      "components/layout/RuntimeStatus.tsx",
      "features/settings/tabs/AboutTab.tsx",
    ]) {
      expect(src(p)).toContain("useUpdateCheck");
      // không ai được tự gọi endpoint hay tự dựng query key riêng
      expect(src(p)).not.toContain("/api/update");
    }
  });

  it("luồng cài đặt dùng CHUNG một hook, không copy ba bản", () => {
    for (const p of [
      "features/home/components/UpdateSidebarButton.tsx",
      "components/layout/RuntimeStatus.tsx",
      "features/settings/tabs/AboutTab.tsx",
    ]) {
      const src = readFileSync(resolve(__dirname, "..", "..", "..", p), "utf8");
      expect(src).toContain("useInstallUpdateFlow");
      expect(src).not.toContain("window.confirm");
    }
  });
});
