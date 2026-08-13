/**
 * LỚP PHỦ TOÀN TRANG + LỜI CHÀO SAU RELOAD — render THẬT (`renderToString`, cùng giới hạn
 * đã nói ở `features/settings/__tests__/update-check.test.tsx`: repo chưa có jsdom).
 *
 * Ca quan trọng nhất KHÔNG phải "lớp phủ hiện đúng chữ" mà là **lớp phủ không tồn tại**
 * khi không cập nhật: một tấm `fixed inset-0` sót lại sẽ nuốt mọi cú bấm của cả app.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { LS_KEYS, _setBackend, memoryBackend, storeGet } from "@/lib/store/persist";
import { MANUAL_UPDATE_CMD, markUpdatePending, readUpdatePending, type UpdatePhase } from "@/lib/update";
import { UpdateOverlayView } from "../UpdateOverlay";

const toasts: { level: string; title: string; description?: string }[] = [];
vi.mock("@/components/ui/sonner", () => ({
  toast: {
    success: (title: string, o?: { description?: string }) => toasts.push({ level: "success", title, ...o }),
    error: (title: string, o?: { description?: string }) => toasts.push({ level: "error", title, ...o }),
    warning: (title: string, o?: { description?: string }) => toasts.push({ level: "warning", title, ...o }),
  },
}));

beforeEach(async () => {
  _setBackend(memoryBackend());
  toasts.length = 0;
  const { _resetUpdateGreeting } = await import("../UpdateResultNotice");
  _resetUpdateGreeting();
});

/**
 * Render phần THUẦN. Vỏ nối store không render được ở đây: `renderToString` đi đường SSR
 * của `useSyncExternalStore`, mà zustand trả `getInitialState()` cho đường đó ⇒ mọi phase
 * đều ra `idle`. Hợp đồng vỏ ⇄ store được khoá ở `lib/update/__tests__/install-flow.test.ts`.
 */
function render(o: { phase: UpdatePhase; targetVersion?: string | null; message?: string | null } ): string {
  return renderToString(
    <UpdateOverlayView
      phase={o.phase}
      targetVersion={o.targetVersion ?? null}
      message={o.message ?? null}
      updateCommand={MANUAL_UPDATE_CMD}
      onDismiss={() => {}}
    />,
  );
}

const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("UpdateOverlay", () => {
  it("không cập nhật ⇒ KHÔNG render gì (không có tấm fixed nào nuốt cú bấm)", () => {
    expect(render({ phase: "idle" })).toBe("");
  });

  it("đang cập nhật ⇒ chặn cả trang, nêu đích danh version, dặn đừng đóng tab", () => {
    const html = render({ phase: "installing", targetVersion: "2.2.0" });
    const t = textOf(html);
    expect(t).toContain("Đang cập nhật lên bản 2.2.0");
    expect(t).toContain("Đừng đóng tab này");
    expect(html).toContain("fixed inset-0");
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-busy="true"');
  });

  it("đang cập nhật ⇒ TUYỆT ĐỐI không có đường thoát (thoát cũng không dừng được agent)", () => {
    const html = render({ phase: "waiting", targetVersion: "2.2.0" });
    expect(html).not.toContain("<button");
    expect(textOf(html)).toContain("Đang chờ công cụ local khởi động lại");
  });

  it("quá hạn ⇒ có [Tải lại trang] + lệnh thủ công + đường lùi, không còn spinner", () => {
    const t = textOf(render({
      phase: "timeout", targetVersion: "2.2.0", message: "Công cụ local chưa khởi động lại sau 90 giây.",
    }));
    expect(t).toContain("Chưa xác nhận được bản cập nhật");
    expect(t).toContain("90 giây");
    expect(t).toContain("Tải lại trang");
    expect(t).toContain("~/.kitgen/bin/kitgen update");
    expect(t).toContain("Đóng");
  });

  it("gửi lệnh hỏng ⇒ nói rõ chưa đụng gì tới bản đang chạy", () => {
    const t = textOf(render({
      phase: "failed", message: "Không gửi được yêu cầu cập nhật tới công cụ local — có vẻ nó vừa dừng.",
    }));
    expect(t).toContain("Chưa gửi được yêu cầu cập nhật");
    expect(t).toContain("chưa bị thay đổi");
    expect(t).toContain("~/.kitgen/bin/kitgen update");
  });

  it("KHÔNG bao giờ hiện đường dẫn tuyệt đối của máy user", () => {
    for (const phase of ["installing", "waiting", "timeout", "failed"] as const) {
      const t = textOf(render({ phase, targetVersion: "2.2.0", message: "x" }));
      expect(t).not.toMatch(/\/Users\/|\/home\//);
    }
  });
});

describe("lời chào sau khi tải lại", () => {
  it("đúng bản đích ⇒ 'Đã cập nhật lên bản X' và XOÁ khoá", async () => {
    const { announceUpdateResult } = await import("../UpdateResultNotice");
    markUpdatePending({ targetVersion: "2.2.0", fromVersion: "2.1.13" });
    const pending = readUpdatePending()!;
    announceUpdateResult(pending, "2.2.0");
    expect(toasts[0]).toMatchObject({ level: "success", title: "Đã cập nhật lên bản 2.2.0" });
  });

  it("agent vẫn chạy bản cũ ⇒ nói THẲNG là chưa thành công, kèm lệnh thủ công", async () => {
    const { announceUpdateResult } = await import("../UpdateResultNotice");
    announceUpdateResult({ targetVersion: "2.2.0", fromVersion: "2.1.13", startedAt: new Date().toISOString() }, "2.1.13");
    expect(toasts[0]?.level).toBe("error");
    expect(toasts[0]?.title).toContain("chưa thành công");
    expect(toasts[0]?.description).toContain("~/.kitgen/bin/kitgen update");
  });

  it("agent chưa trả lời ⇒ KHÔNG kết tội cập nhật hỏng", async () => {
    const { announceUpdateResult } = await import("../UpdateResultNotice");
    announceUpdateResult({ targetVersion: "2.2.0", fromVersion: "2.1.13", startedAt: new Date().toISOString() }, null);
    expect(toasts[0]?.level).toBe("warning");
    expect(toasts[0]?.title).toContain("Chưa xác nhận được");
  });

  it("khoá được dọn sau khi chào (không chào lại ở lần mở app sau)", async () => {
    const { clearUpdatePending } = await import("@/lib/update");
    markUpdatePending({ targetVersion: "2.2.0", fromVersion: "2.1.13" });
    clearUpdatePending();
    expect(storeGet(LS_KEYS.update).startedAt).toBe("");
    expect(readUpdatePending()).toBeNull();
  });
});

/**
 * MỘT LUỒNG DUY NHẤT CHO CẢ BA ĐIỂM VÀO. Không render được (lớp phủ nằm ngoài router,
 * và ba nút nằm ở ba màn khác nhau) ⇒ kiểm bằng cách đọc mã, đúng cách
 * `features/settings/__tests__/update-check.test.tsx` đang làm với `useUpdateCheck`.
 */
describe("sidebar · popover · Cài đặt → cùng một luồng, không rẽ ba nhánh", () => {
  const src = (p: string) => readFileSync(resolve(__dirname, "..", "..", "..", p), "utf8");
  const ENTRIES = [
    "features/home/components/UpdateSidebarButton.tsx",
    "components/layout/RuntimeStatus.tsx",
    "features/settings/tabs/AboutTab.tsx",
  ];

  it("cả ba chỉ biết `useInstallUpdateFlow`, không chỗ nào tự hẹn giờ tải lại", () => {
    for (const p of ENTRIES) {
      const code = src(p);
      expect(code).toContain("useInstallUpdateFlow");
      expect(code).not.toContain("location.reload");
      expect(code).not.toContain("setTimeout");
    }
  });

  it("KHÔNG còn cái hẹn giờ mù 5s ở đâu trong luồng cập nhật", () => {
    const flow = [
      "lib/hooks/use-agent.ts",
      "lib/update/install-store.ts",
      "lib/update/restart.ts",
    ].map(src).join("\n")
      // so trên MÃ ĐÃ BỎ COMMENT — phần giải thích có nhắc lại `setTimeout(reload, 5000)` cũ
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Tải lại trang giờ chỉ xảy ra SAU khi `wait()` trả bằng chứng, không theo đồng hồ.
    expect(flow).not.toMatch(/setTimeout\([^)]*reload/);
    expect(flow).toContain("waitForUpdatedAgent");
  });

  it("lớp phủ + lời chào được gắn NGOÀI router (sống qua mọi điều hướng)", () => {
    const app = readFileSync(resolve(__dirname, "..", "..", "..", "App.tsx"), "utf8");
    expect(app).toContain("<UpdateOverlay />");
    expect(app).toContain("<UpdateResultNotice />");
  });
});
