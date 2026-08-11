/**
 * SMOKE TEST BẰNG RENDER THẬT — không phải "đọc code rồi tin là chạy".
 *
 * Bắt đúng loại lỗi mà `tsc` không thấy: hook gọi sai chỗ, component `undefined` do
 * import lệch tên, vòng lặp render, và — quan trọng nhất — chuỗi kỹ thuật/PII lọt ra
 * thân UI.
 *
 * HAI GIỚI HẠN, NÓI THẲNG:
 *
 *  (1) Dùng `renderToString` chứ không phải jsdom, vì `package.json` (chủ sở hữu: R0)
 *      chưa có `jsdom`/`@testing-library/react` và tôi không được thêm phụ thuộc.
 *      ⇒ Test này KHÔNG kiểm được tương tác (bấm nút, gõ phím). Phần đó tôi kiểm bằng
 *      tay trên dev server; xem teams/react/NEEDS-s0-setup.md (N5).
 *
 *  (2) ĐÃ ĐO ĐƯỢC, KHÔNG PHỎNG ĐOÁN: dưới `renderToString`, zustand v5 dùng
 *      `getInitialState()` làm server snapshot, nên `useSetupStore.setState({step})`
 *      KHÔNG ảnh hưởng tới cây render — lần chạy đầu của bộ test này luôn ra bước 1 dù
 *      đã set store. Vì vậy từng bước được render TRỰC TIẾP qua props (các component
 *      `Step*` vốn thuần props), còn `SetupScreen` chỉ kiểm ca mặc định.
 *      Đây hoá ra là cách kiểm mạnh hơn: mỗi bước được ép vào đúng trạng thái cần kiểm.
 *
 * Chạy: npx vitest run --config src/features/setup/vitest.config.ts
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet,
} from "@tanstack/react-router";
import type { ConnectionStatus } from "@/lib/api";
import type { Doctor } from "@/lib/types/api";
import { SetupScreen } from "../SetupScreen";
import { StepConnect } from "../steps/StepConnect";
import { StepImageGen } from "../steps/StepImageGen";
import { StepWorkspace } from "../steps/StepWorkspace";
import { StepInstall } from "../steps/StepInstall";

/** Agent không tồn tại trong môi trường test ⇒ fetch luôn trượt. Đó CHÍNH LÀ ca ta muốn
 *  kiểm mặc định: "agent chưa chạy thì màn vẫn vẽ được, không treo, không trắng trang". */
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});

const noop = () => {};

/**
 * THÂN UI = mọi thứ NGOÀI các panel gập `<details>`.
 *
 * Phân biệt này là cốt lõi của §3.9: `error.message` kỹ thuật BỊ CẤM ở thân UI nhưng
 * ĐƯỢC PHÉP trong panel "Chi tiết cho lập trình viên ▾" (đang gập, user phải chủ động
 * mở). Nếu test chỉ hỏi "chuỗi này có trong HTML không" thì nó vừa bỏ sót vừa báo sai:
 * lần đầu chạy, ca này FAIL vì tìm thấy "ENOENT" — mà chỗ tìm thấy lại đúng là panel
 * dev, tức là code đúng còn phép kiểm mới sai. Đây là bản đã sửa phép kiểm.
 */
function visibleBody(html: string): string {
  return html.replace(/<details[\s\S]*?<\/details>/g, "");
}

/**
 * CHỮ NGƯỜI DÙNG ĐỌC ĐƯỢC — bỏ thẻ và bỏ comment `<!-- -->` mà React SSR chèn vào giữa
 * các đoạn text.
 *
 * VÌ SAO CẦN (sửa phép kiểm, KHÔNG hạ yêu cầu): tiêu đề màn giờ nhấn một từ khoá bằng
 * serif italic theo FLORA-REF §2.5, nên `<h1>` là `<span>Cài đặt </span><em>lần đầu</em>`.
 * Người dùng (và cả screen reader qua accessible name) vẫn đọc đúng "Cài đặt lần đầu",
 * nhưng chuỗi đó KHÔNG còn liền mạch trong HTML thô ⇒ `html.toContain(...)` báo đỏ dù UI
 * đúng. Phép kiểm cũ vô tình khoá cứng cách CHIA THẺ của tiêu đề, chứ không kiểm nội dung.
 * Bản này kiểm đúng thứ cần kiểm: chữ mà người dùng thấy.
 */
function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrap(node: React.ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function status(over: Partial<ConnectionStatus> = {}): ConnectionStatus {
  return {
    pill: "not-found", code: "AGENT_NOT_RUNNING", case: "agent-not-running",
    readOnly: true, connected: false, entry: "pages", sameOrigin: false, base: null,
    health: null, workspaceLabel: null, agentVersion: null, instanceLabel: null,
    updateCommand: null, needsBridgeProbe: false, ambiguous: false, httpStatus: null,
    mirrorUrl: "http://127.0.0.1:8765/app/", checkedAt: "2026-08-06T05:00:00.000Z",
    ...over,
  };
}

/* ═════════ Cả màn, ca mặc định (agent chưa chạy) ═════════ */

describe("SetupScreen — mount được cả màn khi agent chưa chạy", () => {
  async function renderScreen(): Promise<string> {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const setupRoute = createRoute({
      getParentRoute: () => rootRoute, path: "/setup", component: () => <SetupScreen />,
    });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute, path: "/", component: () => <div>home</div>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([setupRoute, indexRoute]),
      history: createMemoryHistory({ initialEntries: ["/setup"] }),
    });
    // Không `await router.load()` thì renderToString trả chuỗi RỖNG và mọi assertion
    // phủ định sẽ "xanh giả".
    await router.load();
    return wrap(<RouterProvider router={router as never} />);
  }

  it("không trắng trang, có h1 + stepper 4 nhãn chữ", async () => {
    const html = await renderScreen();
    expect(html.length).toBeGreaterThan(2000);
    // Tiêu đề: kiểm CHỮ ĐỌC ĐƯỢC (một từ khoá được bọc <em> serif italic — FLORA-REF §2.5)
    expect(textOf(html)).toContain("Cài đặt lần đầu");
    expect(html).toContain("<h1");
    for (const label of ["Cài công cụ", "Kết nối", "Thư mục", "Tạo ảnh"]) {
      expect(html).toContain(label);
    }
  });

  it("có lối 'Bỏ qua, tôi đã cài rồi' và skip-link a11y", async () => {
    const html = await renderScreen();
    expect(html).toContain("Bỏ qua, tôi đã cài rồi");
    expect(html).toContain("Tới nội dung chính");
  });

  it("KHÔNG rò chuỗi lỗi kỹ thuật ra thân UI (§3.9 điều cấm số 1)", async () => {
    const html = await renderScreen();
    expect(html).not.toContain("Failed to fetch");
    expect(html).not.toContain("TypeError");
  });
});

/* ═════════ Từng bước, ép đúng trạng thái cần kiểm ═════════ */

describe("Bước 1 — cài công cụ", () => {
  it("có nút tải, SHA256, và nói rõ không dùng curl|bash", () => {
    const html = wrap(<StepInstall connected={false} onNext={noop} onTrouble={noop} />);
    expect(html).toContain("kit-gen-setup.sh");
    expect(html).toContain("SHA256");
    expect(html).toContain("curl");
    expect(html).toContain("7 việc");
  });

  it("đã thấy agent ⇒ banner xanh mời sang bước 2, không bắt chạy script nữa", () => {
    const html = wrap(<StepInstall connected onNext={noop} onTrouble={noop} />);
    expect(html).toContain("Đã thấy công cụ local");
    expect(html).not.toContain("Đang chờ công cụ local…");
  });
});

describe("Bước 2 — kết nối: 3 ca lỗi phải nói ĐÚNG thủ phạm", () => {
  const base = { bridgeResult: null, probing: false, onProbe: noop, onRecheck: noop, onNext: noop };

  it("ca agent-chưa-chạy: hiện lệnh chạy, KHÔNG đổ tội trình duyệt", () => {
    const html = wrap(<StepConnect status={status()} {...base} />);
    expect(html).toContain("kitgen-agent");
    expect(html).not.toContain("Trình duyệt đang chặn");
  });

  it("ca agent-trả-lỗi (403): nói THỦ PHẠM LÀ AGENT — đúng bài học QA TRUNG BÌNH-01", () => {
    const html = wrap(
      <StepConnect
        status={status({ case: "agent-http-error", code: "ORIGIN_NOT_ALLOWED", httpStatus: 403 })}
        {...base}
      />
    );
    expect(html).toContain("Công cụ local từ chối trang này");
    expect(html).toContain("Trình duyệt không chặn gì");
    // TUYỆT ĐỐI không được nói câu này ở ca 403
    expect(html).not.toContain("Trình duyệt đang chặn kết nối tới máy bạn");
  });

  it("ca chưa-kết-luận-được: KHÔNG khẳng định bên nào, mời chạy cầu dò", () => {
    const html = wrap(
      <StepConnect
        status={status({ case: "unreachable-ambiguous", code: "AGENT_UNREACHABLE_AMBIGUOUS", ambiguous: true })}
        {...base}
      />
    );
    expect(html).toContain("chưa kết luận");
    expect(html).toContain("Chưa gọi được công cụ local");
  });

  it("ca trình-duyệt-chặn (đã có bằng chứng từ cầu dò): nút chính = Mở bản chạy tại máy", () => {
    const html = wrap(
      <StepConnect
        status={status({ case: "blocked-by-browser", code: "AGENT_BLOCKED_BY_BROWSER", pill: "blocked-by-browser" })}
        {...base}
        bridgeResult={{ alive: true }}
      />
    );
    expect(html).toContain("Mở bản chạy tại máy");
    expect(html).toContain("http://127.0.0.1:8765/app/");
    expect(html).toContain("Vì sao lại thế?");
  });

  it("ca kết nối được: thẻ xanh + số liệu thật từ /health", () => {
    const html = wrap(
      <StepConnect
        status={status({
          connected: true, pill: "connected", code: null, case: "none", readOnly: false,
          workspaceLabel: "~/KitGen", agentVersion: "1.2.0", instanceLabel: "gray-otter",
          health: { ok: true, protocol: 1, projects: 7 } as never,
        })}
        {...base}
      />
    );
    expect(html).toContain("Đã kết nối");
    expect(html).toContain("~/KitGen");
    expect(html).toContain("gray-otter");
    expect(html).toContain("7 project");
  });
});

describe("Bước 3 — thư mục làm việc (chốt X1)", () => {
  const base = { doctorLoading: false, onRecheck: noop, onNext: noop, onWorkspaceChanged: noop };

  it("KHÔNG có ô nhập đường dẫn tự do — web chỉ chọn id đục", () => {
    const html = wrap(<StepWorkspace status={status({ connected: true })} doctor={null} {...base} />);
    expect(/<input[^>]+type="text"/.test(html)).toBe(false);
    expect(html).toContain("không bao giờ nhận đường dẫn bạn gõ");
  });

  it("agent chưa chạy ⇒ nói rõ cần gì, vẫn có lệnh khắc phục, không treo", () => {
    const html = wrap(<StepWorkspace status={status()} doctor={null} {...base} />);
    expect(html).toContain("Cần công cụ local đang chạy");
    expect(html).toContain("kitgen-agent --workspace");
  });

  it("không ghi được ⇒ banner đỏ nêu hệ quả thật", () => {
    const doctor = { workspace: { label: "~/KitGen", writable: false } } as Doctor;
    const html = wrap(<StepWorkspace status={status({ connected: true })} doctor={doctor} {...base} />);
    expect(html).toContain("Không ghi được vào thư mục này");
    expect(html).toContain("không tạo được project");
  });
});

describe("Bước 4 — môi trường & tạo ảnh", () => {
  const base = {
    loading: false, refreshing: false, error: null, agentOffline: false,
    onRecheck: noop, onFinish: noop, onCreateFirst: noop, onImport: noop,
  };

  it("thiếu image_gen ⇒ hướng dẫn Codex mặc định, không có nút tự chạy", () => {
    const doctor = {
      imageGen: { mode: "unavailable", available: false, reason: "NOT_LOGGED_IN" },
    } as Doctor;
    const html = wrap(<StepImageGen doctor={doctor} {...base} />);
    expect(html).toContain("codex login");
    expect(html).not.toContain("CODEX_HOME=~/.codex-img");
    expect(html).toContain("không tự chạy thay bạn");
    // lệnh kiểm chỉ ĐẾM, không in nội dung cấu hình
    expect(html).toContain("grep -c image_gen");
    // dòng cam kết bắt buộc của §3-S0
    expect(html).toContain("không bao giờ đọc hay lưu thông tin đăng nhập");
  });

  it("hiện enum mode của image-gen", () => {
    const doctor = { imageGen: { mode: "img-home", available: true } } as Doctor;
    const html = wrap(<StepImageGen doctor={doctor} {...base} />);
    expect(html).toContain("img-home");
    expect(html).toContain("Sẵn sàng");
  });

  it("doctor lỗi ⇒ copy từ bảng §3.9, KHÔNG hiện message kỹ thuật ở thân UI", () => {
    const err = { code: "AGENT_INTERNAL", message: "ENOENT: no such file /Users/an/.codex" };
    const html = wrap(<StepImageGen doctor={null} {...base} error={err} />);
    const body = visibleBody(html);
    expect(body).toContain("Không kiểm tra được môi trường");
    // Thân UI: TUYỆT ĐỐI không có chuỗi kỹ thuật
    expect(body).not.toContain("ENOENT");
    expect(body).not.toContain("/Users/an");
    // Nhưng vẫn PHẢI có đường cho lập trình viên xem chi tiết — gập lại, không mất
    expect(html).toContain("Chi tiết cho lập trình viên");
    expect(html).toContain("ENOENT");
    // và vẫn có lối vào app — không nhốt user trong wizard
    expect(body).toContain("Tạo project đầu tiên");
  });

  it("agent chưa chạy ⇒ vẫn kết thúc được wizard", () => {
    const html = wrap(<StepImageGen doctor={null} {...base} agentOffline />);
    expect(html).toContain("Chưa hỏi được máy bạn");
    expect(html).toContain("Bỏ qua kiểm tra và vào app");
  });

  it("KHÔNG bao giờ báo 'xong' khi môi trường hỏng (§3.9 điều cấm số 2)", () => {
    const doctor = {
      codex: { ok: false }, imageGen: { mode: "unavailable", available: false, reason: "NO_CODEX" },
    } as Doctor;
    const html = wrap(<StepImageGen doctor={doctor} {...base} />);
    expect(html).toContain("Chưa tạo được ảnh");
    expect(html).not.toContain("Môi trường đã đủ");
  });
});

describe("bảo mật — quét toàn bộ HTML của mọi bước", () => {
  it("không có khoá, JWT hay path tuyệt đối nào lọt ra", () => {
    const dirty = {
      codex: { ok: true, version: "1.0" },
      workspace: { label: "/Users/an/KitGen", writable: true },
      imageGen: { mode: "img-home", available: true, codexHomeLabel: "/Users/an/.codex-img" },
    } as Doctor;
    const htmls = [
      wrap(<StepInstall connected={false} onNext={noop} onTrouble={noop} />),
      wrap(<StepConnect status={status()} bridgeResult={null} probing={false} onProbe={noop} onRecheck={noop} onNext={noop} />),
      wrap(
        <StepImageGen
          doctor={dirty} loading={false} refreshing={false} error={null} agentOffline={false}
          onRecheck={noop} onFinish={noop} onCreateFirst={noop} onImport={noop}
        />
      ),
    ];
    for (const html of htmls) {
      // Khoá/JWT thì cấm ở MỌI chỗ, kể cả panel dev — không có lý do gì để một khoá
      // đi qua màn này.
      expect(/\bsk-[A-Za-z0-9_-]{16,}/.test(html)).toBe(false);
      expect(/\beyJ[A-Za-z0-9_-]{8,}\./.test(html)).toBe(false);
      // PII path tuyệt đối: cấm ở thân UI. Ca kiểm ở đây quan trọng vì `doctor` đầu vào
      // CỐ Ý bẩn (agent trả `/Users/an/...`) — `safeHomeLabel` phải lọc sạch trước khi vẽ.
      const body = visibleBody(html);
      expect(/\/Users\/[a-z]/i.test(body), "rò path tuyệt đối").toBe(false);
      expect(/\/home\/[a-z]+\//i.test(body), "rò path tuyệt đối Linux").toBe(false);
    }
  });
});
