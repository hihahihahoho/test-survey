/**
 * DOM test cho dialog tạo project HAI MODE (FE-2·B1).
 *
 * Chạy (jsdom + @testing-library cài ngoài repo, xem README của thư mục này):
 *   NODE_PATH=/tmp/domtest/node_modules npx vitest run \
 *     --config src/features/projects/__tests__/vitest.dom.config.ts
 *
 * Chỉ kiểm những điều FE2-PLAN §3-B1 gọi là tiêu chí nghiệm thu. Không kiểm câu chữ
 * trang trí — câu chữ đã có test logic riêng ở `create-mode.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient } from "@/lib/api/client";
import { _setBackend, memoryBackend } from "@/lib/store";
import { projectSchema, type Project } from "@/lib/types";
import { checkingStatus } from "@/lib/api";
import { gateOf } from "../lib/gate";
import { CreateProjectDialog } from "../dialogs/CreateProjectDialog";

const OK_GATE = gateOf({ ...checkingStatus(null), pill: "connected", connected: true, readOnly: false, case: "none" });
const OFF_GATE = gateOf({
  ...checkingStatus(null), pill: "not-found", connected: false, readOnly: true, case: "agent-not-running",
});

const P = (o: Record<string, unknown> & { id: string }): Project => projectSchema.parse({ name: o.id, ...o });

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" },
  });

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(typeof input === "string" ? input : (input as Request).url ?? input), init),
  );
  vi.stubGlobal("fetch", f);
  configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  return f;
}

function setup(opts: { gate?: typeof OK_GATE; onCreated?: ReturnType<typeof vi.fn> } = {}) {
  const onCreated = opts.onCreated ?? vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>
        <CreateProjectDialog
          open
          onOpenChange={() => {}}
          existing={[P({ id: "cu", name: "Cũ" })]}
          gate={opts.gate ?? OK_GATE}
          onCreated={onCreated}
          onNeedDuplicate={() => {}}
          onNeedImport={() => {}}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onCreated };
}

const modeRadio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;

beforeEach(() => {
  _setBackend(memoryBackend());
  _resetClient();
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("§1.2 hai thẻ mode", () => {
  it("là radiogroup THẬT, có tên nhóm, mặc định workflow được chọn", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    const group = screen.getByRole("radiogroup", { name: "Bắt đầu bằng" });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: /Bàn làm việc tự do|Quy trình chuẩn/ })).toHaveLength(2);
    expect(modeRadio(/Quy trình chuẩn/).getAttribute("data-state")).toBe("checked");
    expect(modeRadio(/Bàn làm việc tự do/).getAttribute("data-state")).toBe("unchecked");
  });

  it("mỗi thẻ có accessible description (mô tả + dòng «hợp khi…»)", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    const canvas = modeRadio(/Bàn làm việc tự do/);
    const descId = canvas.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc?.textContent).toMatch(/Kéo ảnh tham khảo/);
    expect(desc?.textContent).toMatch(/hợp khi ý tưởng còn mờ/);
  });

  it("MŨI TÊN chuyển tiêu điểm giữa hai thẻ, Space chọn (roving focus của RadioGroup)", async () => {
    mockFetch(async () => jsonRes({}));
    const user = userEvent.setup();
    setup();
    const wf = modeRadio(/Quy trình chuẩn/);
    wf.focus();
    await user.keyboard("{ArrowLeft}");
    // Roving focus: mũi tên đưa tiêu điểm sang thẻ kia.
    expect(document.activeElement).toBe(modeRadio(/Bàn làm việc tự do/));
    await user.keyboard(" ");
    expect(modeRadio(/Bàn làm việc tự do/).getAttribute("aria-checked")).toBe("true");
    expect(modeRadio(/Quy trình chuẩn/).getAttribute("aria-checked")).toBe("false");

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(modeRadio(/Quy trình chuẩn/));
    await user.keyboard(" ");
    expect(modeRadio(/Quy trình chuẩn/).getAttribute("aria-checked")).toBe("true");
  });

  it("mode là câu hỏi RIÊNG với template — cả hai cùng tồn tại trong MỘT bước (§1.1-2)", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    expect(screen.getByRole("radiogroup", { name: "Bắt đầu bằng" })).toBeTruthy();
    expect(screen.getByText("Nội dung khởi tạo")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Kit cơ bản/ })).toBeTruthy();
  });
});

describe("preview khác biệt theo mode", () => {
  it("đổi mode ⇒ khối «Bấm Tạo sẽ có» đổi nội dung, không phải chữ tĩnh", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    expect(screen.getByText(/«Bộ kit chính»/)).toBeTruthy();
    fireEvent.click(modeRadio(/Bàn làm việc tự do/));
    expect(screen.getByText(/«Bàn ý tưởng»/)).toBeTruthy();
    expect(screen.queryByText(/«Bộ kit chính»/)).toBeNull();
  });

  it("đổi template ⇒ dòng nội dung khởi tạo đổi theo, mode giữ nguyên", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    // Đo TRONG khối preview: chuỗi "3 sheet · 25 ô" cũng xuất hiện trên thẻ template.
    const preview = () => within(screen.getByRole("region", { name: /Sẽ tạo gì/ }));
    expect(preview().getByText(/3 sheet · 25 ô/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Trống/ }));
    expect(preview().getByText(/Bản thiết kế trống/)).toBeTruthy();
    expect(modeRadio(/Quy trình chuẩn/).getAttribute("data-state")).toBe("checked");
  });

  it("nói THẬT rằng file con mới chỉ là bản nháp cục bộ (FE-2 chưa có API /docs)", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    expect(screen.getByText(/bản nháp cục bộ/)).toBeTruthy();
  });
});

describe("mode KHÔNG rò vào hợp đồng API #8", () => {
  it("payload POST /api/projects không có trường `mode`, nhưng onCreated nhận intent", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/projects") && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return jsonRes({ project: P({ id: "x-1", name: "Tết 2026" }), warnings: [] }, 201);
      }
      return jsonRes({}, 404);
    });
    const { onCreated } = setup();
    fireEvent.click(modeRadio(/Bàn làm việc tự do/));
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Tết 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(body).not.toHaveProperty("mode");
    expect(Object.keys(body!).sort()).toEqual(["firstVariant", "name", "tags", "template"]);
    expect(onCreated.mock.calls[0]![2]).toEqual({
      template: "basic",
      mode: "canvas",
      firstDoc: { name: "Bàn ý tưởng", kind: "canvas", note: "bàn làm việc trống, chưa sinh ảnh" },
    });
  });

  it("⏎ trong ô tên vẫn submit được (không bị RadioGroup nuốt phím)", async () => {
    const onCreated = vi.fn();
    mockFetch(async (url, init) =>
      url.endsWith("/api/projects") && init?.method === "POST"
        ? jsonRes({ project: P({ id: "x-2", name: "Enter" }), warnings: [] }, 201)
        : jsonRes({}, 404),
    );
    setup({ onCreated });
    const name = screen.getByLabelText("Tên project");
    fireEvent.change(name, { target: { value: "Enter" } });
    fireEvent.submit(name.closest("form")!);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});

describe("bốn trạng thái + agent chưa chạy vẫn đúng sau khi thêm mode", () => {
  it("loading: field bị KHOÁ nhưng dialog KHÔNG đóng và mode vẫn đọc được", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/projects") && init?.method === "POST") {
        await new Promise<void>((r) => { gate.release = r; });
        return jsonRes({ project: P({ id: "x-3", name: "Chậm" }), warnings: [] }, 201);
      }
      return jsonRes({}, 404);
    });
    setup();
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Chậm" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));

    // Radio bị khoá THẬT (thuộc tính có mặt, không chỉ nhờ `fieldset` cha).
    await waitFor(() => expect(modeRadio(/Quy trình chuẩn/).hasAttribute("disabled")).toBe(true));
    // Dialog KHÔNG đóng: cả radiogroup lẫn ô tên vẫn còn trong DOM.
    expect(screen.getByRole("radiogroup", { name: "Bắt đầu bằng" })).toBeTruthy();
    const name = screen.getByLabelText("Tên project");
    /* Ô nhập nằm trong `<fieldset disabled>`. jsdom KHÔNG tính "actually disabled" của
       fieldset vào IDL `.disabled` (chỉ phản chiếu thuộc tính), nên ở đây kiểm đúng thứ
       kiểm được: field nằm trong fieldset đang disabled. Trình duyệt thật khoá theo HTML
       spec §form-associated "actually disabled" — điều đó CHƯA được kiểm ở jsdom. */
    const fs = name.closest("fieldset")!;
    expect(fs.disabled).toBe(true);
    gate.release?.();
  });

  it("agent chưa chạy: vẫn CHỌN được mode và điền form; chỉ nút Tạo bị khoá kèm lý do", () => {
    mockFetch(async () => jsonRes({}));
    setup({ gate: OFF_GATE });
    fireEvent.click(modeRadio(/Bàn làm việc tự do/));
    expect(modeRadio(/Bàn làm việc tự do/).getAttribute("data-state")).toBe("checked");
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Ngoại tuyến" } });
    expect((screen.getByLabelText("Tên project") as HTMLInputElement).value).toBe("Ngoại tuyến");

    const btn = screen.getByRole("button", { name: "Tạo project" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Cần công cụ local đang chạy");
    expect(screen.getByText(/Cần công cụ local/)).toBeTruthy();
  });

  it("409 khi đang ở mode canvas: lỗi inline + gợi ý, mode KHÔNG bị reset", async () => {
    mockFetch(async (url, init) =>
      url.endsWith("/api/projects") && init?.method === "POST"
        ? jsonRes({ error: { code: "PROJECT_ID_TAKEN", message: "dir exists", details: { suggestion: "tet-2" } } }, 409)
        : jsonRes({}, 404),
    );
    setup();
    fireEvent.click(modeRadio(/Bàn làm việc tự do/));
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Tết" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));

    expect(await screen.findByRole("button", { name: /Dùng «tet-2»/ })).toBeTruthy();
    expect(modeRadio(/Bàn làm việc tự do/).getAttribute("data-state")).toBe("checked");
    // Thân UI không được chứa `error.message` kỹ thuật ngoài panel <details>.
    const alert = screen.getAllByRole("alert").find((a) => a.querySelector("details"))!;
    const clone = alert.cloneNode(true) as HTMLElement;
    clone.querySelector("details")?.remove();
    expect(clone.textContent).not.toContain("dir exists");
  });

  it("mở lại dialog ⇒ mode quay về mặc định workflow (draft chỉ trong memory)", () => {
    mockFetch(async () => jsonRes({}));
    setup();
    fireEvent.click(modeRadio(/Bàn làm việc tự do/));
    cleanup();
    setup();
    expect(modeRadio(/Quy trình chuẩn/).getAttribute("data-state")).toBe("checked");
  });
});
