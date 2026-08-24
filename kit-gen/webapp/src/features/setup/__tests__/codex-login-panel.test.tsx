// @vitest-environment jsdom
/**
 * NÚT ĐĂNG NHẬP CODEX — chạy THẬT trong DOM, vì thứ cần kiểm là một MÁY TRẠNG THÁI,
 * không phải một khối HTML tĩnh.
 *
 * Ca đắt nhất ở đây không phải "bấm ra mã" — mà là **mã biến mất đúng lúc**. Một cái
 * mã dùng một lần còn nằm lại trên màn sau khi phiên đã chết trông y hệt mã còn sống:
 * người dùng chép nó sang trang OpenAI, bị từ chối, và kết luận app hỏng. Nên mỗi lối
 * ra khỏi trạng thái chờ (xong · huỷ) đều có một ca riêng khẳng định mã đã rời khỏi
 * màn hình.
 *
 * Ca thứ hai không được bỏ: `startCodexLogin` NÉM (agent tắt) thì nút phải nói ra một
 * câu tiếng Việt và cho bấm lại — không được kẹt vĩnh viễn ở "Đang mở phiên đăng nhập…".
 * Đây đúng là hình dạng của một cái nút chết mà người dùng không có cách nào thoát.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CodexLogin } from "@/lib/api/endpoints";
import { CodexLoginPanel } from "../steps/parts/CodexLoginPanel";

const H = vi.hoisted(() => ({
  start: vi.fn<() => Promise<CodexLogin>>(),
  status: vi.fn<() => Promise<CodexLogin>>(),
  cancel: vi.fn<() => Promise<CodexLogin>>(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const fake = {
    ...(real.api as Record<string, unknown>),
    system: {
      startCodexLogin: H.start,
      codexLoginStatus: H.status,
      cancelCodexLogin: H.cancel,
    },
  };
  return { ...real, api: fake, default: fake };
});

const WAITING: CodexLogin = {
  status: "waiting",
  verificationUrl: "https://auth.openai.com/codex/device",
  userCode: "3P0N-7GY2Q",
  codexHomeLabel: "~/.codex",
  startedAt: "2026-08-21T02:00:00.000Z",
  expiresAt: "2026-08-21T02:15:00.000Z",
  reason: null,
};
const settled = (status: CodexLogin["status"], reason: CodexLogin["reason"] = null): CodexLogin => ({
  ...WAITING, status, verificationUrl: null, userCode: null, expiresAt: null, reason,
});

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CodexLoginPanel /></QueryClientProvider>);
}

beforeEach(() => {
  vi.useRealTimers();
  H.start.mockReset();
  H.status.mockReset();
  H.cancel.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Nút đăng nhập Codex", () => {
  it("chưa bấm ⇒ mời đăng nhập, và nói thẳng là KHÔNG cần Terminal", () => {
    mount();
    expect(screen.getByRole("button", { name: /Đăng nhập Codex/ })).toBeTruthy();
    expect(document.body.textContent).toContain("Không cần mở Terminal");
    // chưa có phiên nào ⇒ tuyệt đối chưa có mã nào trên màn
    expect(document.body.textContent).not.toMatch(/\b[A-Z0-9]{4}-[A-Z0-9]{4,8}\b/);
  });

  it("bấm ⇒ hiện mã + link mở thẳng trang của OpenAI (tab mới, rel an toàn)", async () => {
    H.start.mockResolvedValue(WAITING);
    H.status.mockResolvedValue(WAITING);
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));

    await waitFor(() => expect(document.body.textContent).toContain("3P0N-7GY2Q"));
    const link = screen.getByRole("link", { name: /Mở trang đăng nhập/ }) as HTMLAnchorElement;
    expect(link.href).toBe("https://auth.openai.com/codex/device");
    /* Điều hướng THẬT sang trang OpenAI: người dùng phải nhìn thấy thanh địa chỉ của
       chính trình duyệt mình trước khi gõ mật khẩu. `noreferrer` để trang kia không
       nhận được địa chỉ agent local. */
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noreferrer");
  });

  it("phiên xong ⇒ MÃ RỜI KHỎI MÀN HÌNH, không để lại một mã chết trông như còn sống", async () => {
    H.start.mockResolvedValue(WAITING);
    H.status.mockResolvedValue(settled("done"));
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));
    await waitFor(() => expect(document.body.textContent).toContain("Đã đăng nhập xong"), { timeout: 5000 });
    expect(document.body.textContent).not.toContain("3P0N-7GY2Q");
  }, 10_000);

  it("bấm Huỷ ⇒ mã biến mất ngay, quay về nút mời đăng nhập", async () => {
    H.start.mockResolvedValue(WAITING);
    H.status.mockResolvedValue(WAITING);
    H.cancel.mockResolvedValue(settled("cancelled"));
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));
    await waitFor(() => expect(document.body.textContent).toContain("3P0N-7GY2Q"));

    await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(document.body.textContent).not.toContain("3P0N-7GY2Q"));
    expect(screen.getByRole("button", { name: /Đăng nhập Codex/ })).toBeTruthy();
  });

  it("agent tắt ⇒ nói ra một câu tiếng Việt và CHO BẤM LẠI, không kẹt ở trạng thái đang chờ", async () => {
    H.start.mockRejectedValue(new Error("Failed to fetch"));
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));
    await waitFor(() => expect(document.body.textContent).toContain("Không mở được phiên đăng nhập"));
    const retry = screen.getByRole("button", { name: /Thử lại/ }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });

  /* ── HÌNH DẠNG NÚT ────────────────────────────────────────────────────────
     Hai ca dưới đây khoá lại đúng hai lỗi đã sửa. Chúng nhìn "chỉ là CSS" nhưng
     đều là lỗi mức MÀN, và không ca nào khác bắt được:
       · thẻ này nằm cùng màn với hàng nút kết thúc wizard (`FinishRow`), nên nút
         `primary` ở đây là nút primary THỨ HAI — §5.4 cho tối đa một;
       · nút tự chế spinner thì đổi cả chữ, làm nút nhảy width giữa lúc bấm. */
  it("KHÔNG phải nút primary — màn này đã có nút primary của hàng kết thúc rồi", () => {
    mount();
    const btn = screen.getByRole("button", { name: /Đăng nhập Codex/ });
    expect(btn.className).not.toContain("bg-accent");
  });

  it("đang mở phiên ⇒ nút khoá + aria-busy, NHÃN GIỮ NGUYÊN, câu 'đang chạy' nói ở ngoài nút", async () => {
    // phiên treo mãi ⇒ giữ nguyên trạng thái "đang chạy" để soi
    H.start.mockReturnValue(new Promise<CodexLogin>(() => {}));
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));

    const btn = await screen.findByRole("button", { name: /Đăng nhập Codex/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(document.body.textContent).toContain("Đang mở phiên đăng nhập…");
  });

  it("mã đã quá hạn ⇒ nói rõ là quá hạn, không nói chung chung 'có lỗi'", async () => {
    H.start.mockResolvedValue(WAITING);
    H.status.mockResolvedValue(settled("failed", "EXPIRED"));
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Đăng nhập Codex/ }));
    await waitFor(() => expect(document.body.textContent).toContain("quá hạn 15 phút"), { timeout: 5000 });
    expect(document.body.textContent).not.toContain("3P0N-7GY2Q");
  }, 10_000);
});
