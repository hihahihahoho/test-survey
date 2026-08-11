/**
 * CRUD trong DOM: mở modal → điền → gọi API → xử lý lỗi.
 * Trọng tâm là những hành vi mà spec ghi rõ và bản v1 từng làm sai.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient } from "@/lib/api/client";
import { _setBackend, memoryBackend } from "@/lib/store";
import { projectSchema, type Project } from "@/lib/types";
import { gateOf } from "../lib/gate";
import { checkingStatus } from "@/lib/api";
import { CreateProjectDialog } from "../dialogs/CreateProjectDialog";
import { DeleteProjectDialog } from "../dialogs/DeleteProjectDialog";
import { ImportWizard } from "../dialogs/ImportWizard";

const OK_GATE = gateOf({ ...checkingStatus(null), pill: "connected", connected: true, readOnly: false, case: "none" });
const OFF_GATE = gateOf({
  ...checkingStatus(null), pill: "not-found", connected: false, readOnly: true, case: "agent-not-running",
});

const P = (o: Record<string, unknown> & { id: string }): Project => projectSchema.parse({ name: o.id, ...o });

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

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

beforeEach(() => {
  _setBackend(memoryBackend());
  _resetClient();
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ═════════ §4.1 TẠO ═════════ */
describe("§4.1 Tạo project", () => {
  const setup = (onCreated = vi.fn(), existing: Project[] = []) => {
    const r = wrap(
      <CreateProjectDialog
        open
        onOpenChange={() => {}}
        existing={existing}
        gate={OK_GATE}
        onCreated={onCreated}
        onNeedDuplicate={() => {}}
        onNeedImport={() => {}}
      />,
    );
    return { ...r, onCreated };
  };

  it("slug tự sinh từ tên CÓ DẤU và hiện ra cho user xem trước", async () => {
    mockFetch(async () => jsonRes({}));
    setup();
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Xuân 26" } });
    expect(await screen.findByText(/projects\/xuan-26-xxxx/)).toBeTruthy();
  });

  it("§4.1-2 trùng tên: CẢNH BÁO + gợi ý, KHÔNG chặn nút Tạo", async () => {
    mockFetch(async () => jsonRes({}));
    setup(vi.fn(), [P({ id: "a", name: "Candy Lite" })]);
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Candy Lite" } });
    expect(await screen.findByText(/Vẫn tạo được/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Dùng «Candy Lite \(2\)»/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Tạo project" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tên RỖNG ⇒ có CÂU LỖI hiện ra, không im lặng (đóng E2)", async () => {
    mockFetch(async () => jsonRes({}));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));
    expect(await screen.findByText(/Nhập tên project/)).toBeTruthy();
  });

  it("gửi đúng payload §6.2 #8 (template, firstVariant có id/vi/bg)", async () => {
    let body: Record<string, unknown> | null = null;
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/projects") && init?.method === "POST") {
        body = JSON.parse(String(init.body));
        return jsonRes({ project: P({ id: "x-1", name: "Tết 2026" }), warnings: [] }, 201);
      }
      return jsonRes({}, 404);
    });
    const onCreated = vi.fn();
    setup(onCreated);
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Tết 2026" } });
    fireEvent.change(screen.getByLabelText("Phong cách đầu tiên"), { target: { value: "Tết đỏ" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(body).toMatchObject({
      name: "Tết 2026",
      template: "basic",
      firstVariant: { id: "tet-do", vi: "Tết đỏ", bg: "magenta" },
    });
    // Không gửi slug khi user chưa tự sửa ⇒ để agent tự sinh + thêm hex.
    expect(body).not.toHaveProperty("slug");
  });

  it("§4.1-3 409 PROJECT_ID_TAKEN ⇒ lỗi INLINE tại ô slug + nút [Dùng gợi ý]", async () => {
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/projects") && init?.method === "POST") {
        return jsonRes(
          { error: { code: "PROJECT_ID_TAKEN", message: "dir exists", details: { suggestion: "xuan-26-2" } } },
          409,
        );
      }
      return jsonRes({}, 404);
    });
    setup();
    fireEvent.change(screen.getByLabelText("Tên project"), { target: { value: "Xuân 26" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo project" }));
    expect(await screen.findByRole("button", { name: /Dùng «xuan-26-2»/ })).toBeTruthy();

    // Có ĐÚNG 2 chỗ báo lỗi và cả hai đều cần thiết (§5.5: lỗi phải hiện ngay
    // tại chỗ gây ra nó): một ở ô slug, một là khối lỗi chung có panel dev.
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const alert = alerts.find((a) => a.querySelector("details")) ?? alerts[0]!;
    expect(alert.querySelector("details")?.hasAttribute("open")).toBe(false);
    const clone = alert.cloneNode(true) as HTMLElement;
    clone.querySelector("details")?.remove();
    expect(clone.textContent).not.toContain("dir exists");
  });

  it("§4.1-5 agent chưa chạy ⇒ dải vàng GIẢI THÍCH + nút Tạo khoá (không phải bấm rồi mới lỗi)", async () => {
    mockFetch(async () => jsonRes({}));
    wrap(
      <CreateProjectDialog
        open onOpenChange={() => {}} existing={[]} gate={OFF_GATE}
        onCreated={() => {}} onNeedDuplicate={() => {}} onNeedImport={() => {}}
      />,
    );
    expect(screen.getByText(/Cần công cụ local/)).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Tạo project" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Cần công cụ local đang chạy");
  });
});

/* ═════════ §4.4 XOÁ ═════════ */
describe("§4.4 Xoá mềm + Hoàn tác", () => {
  const proj = P({
    id: "tet26", name: "Tết 2026",
    stats: { sheets: 5, components: 42, rawPresent: 8, kitsCut: 96, diskBytes: 176_000_000 },
    state: { jobs: { "tet-main": "running" }, activeRun: { runId: "r-31", done: 2, total: 8 } },
  });

  it("chốt X6: KHÔNG bắt gõ tên project (thao tác phục hồi được)", () => {
    mockFetch(async () => jsonRes({}));
    wrap(
      <DeleteProjectDialog projects={[proj]} open onOpenChange={() => {}} onDeleted={() => {}} onOpenTrash={() => {}} />,
    );
    expect(screen.queryByLabelText(/Gõ .* để xác nhận/)).toBeNull();
    expect((screen.getByRole("button", { name: "Cho vào thùng rác" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("XEM TRƯỚC hậu quả từ stats THẬT, phân loại đúng theo §1.2", () => {
    mockFetch(async () => jsonRes({}));
    wrap(
      <DeleteProjectDialog projects={[proj]} open onOpenChange={() => {}} onDeleted={() => {}} onOpenTrash={() => {}} />,
    );
    expect(screen.getByText(/không tái tạo được/)).toBeTruthy();
    expect(screen.getByText(/sinh lại sẽ tốn quota/)).toBeTruthy();
    expect(screen.getByText(/cắt lại được/)).toBeTruthy();
    expect(screen.getByText(/Tổng 168 MB/)).toBeTruthy();
  });

  it("project ĐANG CHẠY ⇒ cảnh báo lượt sẽ bị dừng", () => {
    mockFetch(async () => jsonRes({}));
    wrap(
      <DeleteProjectDialog projects={[proj]} open onOpenChange={() => {}} onDeleted={() => {}} onOpenTrash={() => {}} />,
    );
    expect(screen.getByText(/sẽ bị dừng/)).toBeTruthy();
  });

  it("gọi DELETE thật và báo cho màn biết id đã xoá", async () => {
    const calls: string[] = [];
    mockFetch(async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "DELETE") return jsonRes({ ok: true, trashId: "T1", cancelledRuns: ["r-31"] });
      return jsonRes({}, 404);
    });
    const onDeleted = vi.fn();
    wrap(
      <DeleteProjectDialog projects={[proj]} open onOpenChange={() => {}} onDeleted={onDeleted} onOpenTrash={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cho vào thùng rác" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(["tet26"]));
    expect(calls.some((c) => c.startsWith("DELETE") && c.includes("/api/projects/tet26"))).toBe(true);
  });

  it("xoá NHIỀU: modal gộp, liệt kê tên + tổng dung lượng", () => {
    mockFetch(async () => jsonRes({}));
    const b = P({ id: "candy", name: "Candy Lite", stats: { diskBytes: 42_000_000 } });
    wrap(
      <DeleteProjectDialog projects={[proj, b]} open onOpenChange={() => {}} onDeleted={() => {}} onOpenTrash={() => {}} />,
    );
    expect(screen.getByText("Xoá 2 bộ kit?")).toBeTruthy();
    expect(screen.getByText(/Tổng 208 MB/)).toBeTruthy();
  });
});

/* ═════════ §4.6 NHẬP ═════════ */
describe("§4.6 Wizard nhập — bước 2 KHÔNG bỏ qua được (chốt X12)", () => {
  const REPORT = {
    sheets: 12, components: 78, variants: 3, poses: 19,
    unknownComponents: 73, duplicateSheetIds: [], missingRefs: [],
    willCreate: { sheets: 12, components: 78, variants: 3, raw: 0, kits: 0 },
    warnings: [
      { code: "UNKNOWN_COMPONENTS", message: "73/78 element không có trong thư viện chuẩn", items: ["a.png", "b.png"] },
    ],
  };

  it("bắt đầu ở bước 1, nút chính là «Tiếp: đối chiếu →» (không phải «Nhập»)", () => {
    mockFetch(async () => jsonRes({}));
    wrap(<ImportWizard open onOpenChange={() => {}} gate={OK_GATE} onImported={() => {}} />);
    expect(screen.getByText("Bước 1/3 · Chọn nguồn")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tiếp: đối chiếu/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Nhập \d+ sheet/ })).toBeNull();
  });

  it("chưa chọn file ⇒ KHÔNG sang bước 2, và có lỗi hiện ra (không im lặng)", async () => {
    mockFetch(async () => jsonRes({}));
    wrap(<ImportWizard open onOpenChange={() => {}} gate={OK_GATE} onImported={() => {}} />);
    fireEvent.change(screen.getByLabelText("Tên project sẽ tạo"), { target: { value: "styles-campaign (nhập)" } });
    fireEvent.click(screen.getByRole("button", { name: /Tiếp: đối chiếu/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Bước 1/3 · Chọn nguồn")).toBeTruthy();
  });

  it("upload → preview → BẢNG ĐỐI CHIẾU hiện đủ số liệu THẬT của agent", async () => {
    mockFetch(async (url, init) => {
      if (url.endsWith("/api/uploads")) return jsonRes({ uploadId: "up_1", kind: "json", bytes: 39058 }, 201);
      if (url.endsWith("/api/import/preview") && init?.method === "POST") return jsonRes({ report: REPORT });
      return jsonRes({}, 404);
    });
    wrap(<ImportWizard open onOpenChange={() => {}} gate={OK_GATE} onImported={() => {}} />);

    const file = new File(['{"sheets":[]}'], "styles-campaign.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Chọn file"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/đã nhận/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Tiếp: đối chiếu/ }));

    // Bảng đối chiếu — 3 cột nghĩa vụ: thêm / ghi đè / bỏ qua
    expect(await screen.findByText("Bước 2/3 · Đối chiếu (bắt buộc xem)")).toBeTruthy();
    expect(screen.getByText(/12 sheet · 78 element · 3 phong cách/)).toBeTruthy();
    expect(screen.getByText("Không ghi đè")).toBeTruthy();
    expect(screen.getByText(/73\/78 element không có trong thư viện chuẩn/)).toBeTruthy();
    expect(screen.getByText(/Bản Studio cũ sẽ xoá chúng đi. Bản này giữ nguyên./)).toBeTruthy();
    // Nút chính đổi thành nhãn có SỐ SHEET thật
    expect(screen.getByRole("button", { name: "Nhập 12 sheet vào project mới" })).toBeTruthy();
  });

  it("§3.9: preview lỗi ⇒ nói bằng tiếng Việt, KHÔNG lộ message kỹ thuật, KHÔNG tạo project nửa vời", async () => {
    const posts: string[] = [];
    mockFetch(async (url, init) => {
      if (init?.method === "POST") posts.push(url);
      if (url.endsWith("/api/uploads")) return jsonRes({ uploadId: "up_1", kind: "json" }, 201);
      if (url.endsWith("/api/import/preview")) {
        return jsonRes({ error: { code: "IMPORT_INVALID", message: "Unexpected token } at line 40" } }, 422);
      }
      return jsonRes({}, 404);
    });
    wrap(<ImportWizard open onOpenChange={() => {}} gate={OK_GATE} onImported={() => {}} />);
    const file = new File(["{bad"], "x.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Chọn file"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/đã nhận/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Tiếp: đối chiếu/ }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("File nhập không đọc được")).toBeTruthy();

    // §3.9 luật 1: `error.message` kỹ thuật CHỈ được nằm trong panel GẬP LẠI
    // "Chi tiết cho lập trình viên" — không được ở thân thông báo.
    const details = alert.querySelector("details");
    expect(details).toBeTruthy();
    expect(details!.textContent).toContain("Unexpected token");
    expect(details!.hasAttribute("open")).toBe(false); // mặc định GẬP
    // Gỡ panel dev ra thì phần còn lại KHÔNG được chứa chuỗi kỹ thuật nào.
    const clone = alert.cloneNode(true) as HTMLElement;
    clone.querySelector("details")?.remove();
    expect(clone.textContent).not.toContain("Unexpected token");
    // KHÔNG có POST /api/projects nào ⇒ không tạo project nửa vời
    expect(posts.some((u) => u.endsWith("/api/projects"))).toBe(false);
  });
});
