/**
 * B2 — DOM test: khối «Đọc đầu bài của khách» trong dialog tạo project (§1.3).
 *
 * Chạy (jsdom + @testing-library cài ngoài repo — xem README của thư mục này):
 *   NODE_PATH=/tmp/domtest/node_modules npx vitest run \
 *     --config src/features/projects/__tests__/vitest.dom.config.ts
 *
 * Dùng DỮ LIỆU THẬT: đọc `teams/brief-intake/prefill-vcb.json` và fixture 22-câu-trống
 * từ đĩa rồi bơm vào ô "Dán JSON" — không mock parser, không stub hook.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient } from "@/lib/api/client";
import { _setBackend, memoryBackend } from "@/lib/store";
import { projectSchema, type Project } from "@/lib/types";
import { checkingStatus } from "@/lib/api";
import { gateOf } from "../lib/gate";
import { CreateProjectDialog } from "../dialogs/CreateProjectDialog";

/* Trong môi trường jsdom, Vite phục vụ module qua tiền tố `/@fs` nên `import.meta.url`
   ra `/@fs/Users/...`. Cắt tiền tố đó đi mới thành đường dẫn đọc được bằng `node:fs`. */
const WEBAPP = new URL("../../../../", import.meta.url).pathname.replace(/^\/@fs/, "");
const MISSING22 = readFileSync(join(WEBAPP, "fixtures/brief-intake-vcb-missing22.json"), "utf8");
const PREFILL_REAL = readFileSync(join(WEBAPP, "../teams/brief-intake/prefill-vcb.json"), "utf8");

const OK_GATE = gateOf({ ...checkingStatus(null), pill: "connected", connected: true, readOnly: false, case: "none" });
const P = (o: Record<string, unknown> & { id: string }): Project => projectSchema.parse({ name: o.id, ...o });
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" } });

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(typeof input === "string" ? input : (input as Request).url ?? input), init),
  );
  vi.stubGlobal("fetch", f);
  configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  return f;
}

function setup() {
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>
        <CreateProjectDialog
          open
          onOpenChange={() => {}}
          existing={[]}
          gate={OK_GATE}
          onCreated={onCreated}
          onNeedDuplicate={() => {}}
          onNeedImport={() => {}}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onCreated };
}

/** Bật khối brief, chọn nguồn "dán", bơm nội dung. */
function pasteBrief(text: string) {
  fireEvent.click(screen.getByRole("switch", { name: /Đọc đầu bài của khách/ }));
  fireEvent.click(screen.getByRole("radio", { name: /Dán nội dung JSON/ }));
  fireEvent.change(screen.getByLabelText("Nội dung answers.json"), { target: { value: text } });
}

beforeEach(() => {
  _setBackend(memoryBackend());
  _resetClient();
  mockFetch(async () => jsonRes({}));
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("khối brief TẮT mặc định, không cản trở luồng tạo project cũ", () => {
  it("mở dialog: switch tắt, không có ô dán, không có bảng kết quả", () => {
    setup();
    const sw = screen.getByRole("switch", { name: /Đọc đầu bài của khách/ });
    expect(sw.getAttribute("data-state")).toBe("unchecked");
    expect(screen.queryByLabelText("Nội dung answers.json")).toBeNull();
    expect(screen.queryByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeNull();
  });

  it("brief KHÔNG phải template thứ năm — 4 template của hợp đồng #8 giữ nguyên", () => {
    setup();
    const tpl = screen.getAllByRole("radio", { name: /Kit cơ bản|Trống|Từ project đang có|Nhập file/ });
    expect(tpl).toHaveLength(4);
  });
});

describe("đọc dữ liệu THẬT và hiện đúng con số", () => {
  it("prefill-vcb.json thật ⇒ 72 câu · 27 cao · 18 tb · 5 thấp · 23 chưa trả lời", () => {
    setup();
    pasteBrief(PREFILL_REAL);
    const box = within(screen.getByRole("region", { name: /Kết quả đọc đầu bài/ }));
    expect(box.getByText(/72/)).toBeTruthy();
    expect(box.getByText("Tin cậy cao").nextElementSibling!.textContent).toBe("27");
    expect(box.getByText("Trung bình").nextElementSibling!.textContent).toBe("18");
    expect(box.getByText("Thấp").nextElementSibling!.textContent).toBe("5");
    expect(box.getByText("Chưa trả lời").nextElementSibling!.textContent).toBe("23");
  });

  it("fixture 22-trống ⇒ hiện đủ 5 điểm mâu thuẫn NGUYÊN VĂN kèm nguồn", () => {
    setup();
    pasteBrief(MISSING22);
    const box = within(screen.getByRole("region", { name: /Kết quả đọc đầu bài/ }));
    expect(box.getByText(/5 điểm cần chốt lại với khách/)).toBeTruthy();
    const raw = JSON.parse(MISSING22) as { conflicts: { text: string; source: string }[] };
    for (const c of raw.conflicts) expect(box.getByText(c.text)).toBeTruthy();
    expect(box.getAllByText(/^nguồn: /)).not.toHaveLength(0);
  });

  it("câu tin cậy thấp/trống chỉ nằm ở mục GHI CHÚ, và nói rõ không tự vào thiết kế", () => {
    setup();
    pasteBrief(MISSING22);
    const box = within(screen.getByRole("region", { name: /Kết quả đọc đầu bài/ }));
    expect(box.getByText(/Chỉ ghi chú lại/)).toBeTruthy();
    expect(box.getByText(/KHÔNG tự tạo bản thiết kế/)).toBeTruthy();
  });
});

describe("brief chỉ chảy ra ĐÚNG hai thứ, và phải do người dùng bấm", () => {
  it("tên dự án KHÔNG tự điền; bấm [Dùng tên …] mới điền, và giá trị là field độ tin cậy cao", () => {
    setup();
    const name = () => screen.getByLabelText("Tên project") as HTMLInputElement;
    pasteBrief(MISSING22);
    expect(name().value).toBe(""); // không tự điền
    fireEvent.click(screen.getByRole("button", { name: /Dùng tên «VCB Look back 2025 & Chợ Tết 2026»/ }));
    expect(name().value).toBe("VCB Look back 2025 & Chợ Tết 2026");
  });

  it("mode KHÔNG tự đổi; có nút gợi ý canvas kèm LÝ DO bằng số thật", () => {
    setup();
    pasteBrief(MISSING22);
    expect(screen.getByRole("radio", { name: /Quy trình chuẩn/ }).getAttribute("data-state")).toBe("checked");
    /* Câu này xuất hiện HAI chỗ có chủ đích: dòng tóm tắt trong bảng kết quả, và câu
       lý do dưới hai nút gợi ý. Kiểm đúng câu lý do (có đuôi "bàn làm việc hợp hơn"). */
    expect(screen.getByText(/còn 23 câu chưa trả lời và 5 điểm cần chốt lại — bàn làm việc hợp hơn/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Chuyển sang bàn làm việc/ }));
    expect(screen.getByRole("radio", { name: /Bàn làm việc tự do/ }).getAttribute("data-state")).toBe("checked");
  });

  it("payload POST /api/projects KHÔNG chứa dữ liệu brief nào ngoài chuỗi tên đã bấm", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/projects") && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return jsonRes({ project: P({ id: "x-1", name: "VCB" }), warnings: [] }, 201);
      }
      return jsonRes({}, 404);
    });
    const { onCreated } = setup();
    pasteBrief(MISSING22);
    fireEvent.click(screen.getByRole("button", { name: /Dùng tên «VCB Look back 2025/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());

    expect(Object.keys(body!).sort()).toEqual(["firstVariant", "name", "tags", "template"]);
    const asText = JSON.stringify(body);
    // Không một mảnh nào của brief lọt vào payload ngoài tên.
    expect(asText).not.toMatch(/confidence|sections|formId|conflicts|brief/i);
    expect(asText).not.toMatch(/#d42a1e|sc_era|style_direction/);
  });
});

describe("bốn trạng thái của khối brief", () => {
  it("empty: bật switch mà chưa đưa dữ liệu ⇒ không có bảng, không có lỗi", () => {
    setup();
    fireEvent.click(screen.getByRole("switch", { name: /Đọc đầu bài của khách/ }));
    expect(screen.queryByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error: JSON hỏng ⇒ câu đời thường; chuỗi kỹ thuật CHỈ trong <details>", () => {
    setup();
    pasteBrief("{ hỏng");
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Nội dung này không phải JSON hợp lệ.")).toBeTruthy();
    const clone = alert.cloneNode(true) as HTMLElement;
    clone.querySelector("details")?.remove();
    expect(clone.textContent).not.toMatch(/SyntaxError|Unexpected|JSON\.parse/);
    expect(alert.querySelector("details")!.textContent).toMatch(/Error|Syntax/);
  });

  it("success rồi xoá sạch ô dán ⇒ bảng biến mất, không giữ dữ liệu cũ", () => {
    setup();
    pasteBrief(MISSING22);
    expect(screen.getByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Nội dung answers.json"), { target: { value: "" } });
    expect(screen.queryByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeNull();
  });

  it("tắt switch ⇒ dữ liệu brief bị bỏ hẳn, bật lại là trống", () => {
    setup();
    pasteBrief(MISSING22);
    const sw = screen.getByRole("switch", { name: /Đọc đầu bài của khách/ });
    fireEvent.click(sw);
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole("radio", { name: /Dán nội dung JSON/ }));
    expect((screen.getByLabelText("Nội dung answers.json") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeNull();
  });
});

describe("ca AGENT CHƯA CHẠY — đọc đầu bài KHÔNG phụ thuộc agent", () => {
  it("agent tắt: vẫn đọc được brief, vẫn bấm được [Dùng tên …]; chỉ nút Tạo bị khoá", () => {
    // Không có agent nào trả lời: mọi lời gọi mạng đều hỏng.
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });

    const OFF = gateOf({
      ...checkingStatus(null), pill: "not-found", connected: false, readOnly: true, case: "agent-not-running",
    });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <CreateProjectDialog
            open onOpenChange={() => {}} existing={[]} gate={OFF}
            onCreated={() => {}} onNeedDuplicate={() => {}} onNeedImport={() => {}}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    pasteBrief(MISSING22);
    expect(screen.getByRole("region", { name: /Kết quả đọc đầu bài/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Dùng tên «VCB Look back 2025/ }));
    expect((screen.getByLabelText("Tên project") as HTMLInputElement).value).toMatch(/^VCB Look back/);
    expect((screen.getByRole("button", { name: "Tạo project" }) as HTMLButtonElement).disabled).toBe(true);
    // Parser chạy hoàn toàn trên máy ⇒ KHÔNG có lời gọi mạng nào phát sinh từ việc đọc brief.
    expect(f).not.toHaveBeenCalled();
  });
});

describe("a11y của khối brief", () => {
  it("switch có nhãn thật và điều khiển đúng vùng thân", () => {
    setup();
    const sw = screen.getByRole("switch", { name: /Đọc đầu bài của khách/ });
    fireEvent.click(sw);
    const id = sw.getAttribute("aria-controls")!;
    expect(document.getElementById(id)).toBeTruthy();
  });

  it("chọn nguồn là radiogroup THẬT có tên nhóm", () => {
    setup();
    fireEvent.click(screen.getByRole("switch", { name: /Đọc đầu bài của khách/ }));
    const g = screen.getByRole("radiogroup", { name: "Nguồn đầu bài" });
    expect(within(g).getAllByRole("radio")).toHaveLength(2);
  });

  it("nút [Chọn tệp…] là nút thật (bàn phím tới được), input file bị ẩn khỏi tab order", () => {
    setup();
    fireEvent.click(screen.getByRole("switch", { name: /Đọc đầu bài của khách/ }));
    expect(screen.getByRole("button", { name: "Chọn tệp…" })).toBeTruthy();
  });
});
