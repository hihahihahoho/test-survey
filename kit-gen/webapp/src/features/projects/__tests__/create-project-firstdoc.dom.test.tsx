/**
 * FLOW-V3 replaced project -> first child document with one project-backed kit file.
 * These 14 DOM cases retain the old suite's intent at the new N boundary: a real
 * mount, both modes, one API write, honest failures, offline gating and a11y.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient } from "@/lib/api/client";
import { _setBackend, memoryBackend } from "@/lib/store";
import { checkingStatus } from "@/lib/api";
import { projectSchema } from "@/lib/types";
import { gateOf } from "../lib/gate";
import { CreateModeDialog } from "../dialogs/CreateModeDialog";

const OK = gateOf({ ...checkingStatus(null), pill: "connected", connected: true, readOnly: false, case: "none" });
const OFF = gateOf({ ...checkingStatus(null), pill: "not-found", connected: false, readOnly: true, case: "agent-not-running" });
const project = projectSchema.parse({ id: "kit-a7f3", name: "Bộ kit chưa đặt tên" });
let calls: Array<{ method: string; body: Record<string, unknown> }>;

function setup(gate = OK, response: Response | null = null) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : {} });
    return response ?? new Response(JSON.stringify({ project, warnings: [] }), {
      status: 201, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" },
    });
  });
  vi.stubGlobal("fetch", fetchImpl);
  configureClient({ fetchImpl: fetchImpl as never, base: "http://127.0.0.1:8765" });
  const onCreated = vi.fn();
  render(<QueryClientProvider client={createQueryClient()}><TooltipProvider>
    <CreateModeDialog open onOpenChange={() => {}} gate={gate} onCreated={onCreated} />
  </TooltipProvider></QueryClientProvider>);
  return { onCreated, fetchImpl };
}

beforeEach(() => {
  calls = [];
  _setBackend(memoryBackend());
  _resetClient();
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function choose(button: "Bắt đầu điền form" | "Mở bàn làm việc") {
  fireEvent.click(screen.getByRole("button", { name: button }));
  await waitFor(() => expect(calls).toHaveLength(1));
}

describe("N · tạo một file kit theo FLOW-V3", () => {
  it("mount thật với tiêu đề lựa chọn mới", () => { setup(); expect(screen.getByRole("heading", { name: "Bạn muốn làm kiểu nào?" })).toBeTruthy(); });
  it("dùng radiogroup thật có nhãn", () => { setup(); expect(screen.getByRole("radiogroup", { name: "Bạn muốn làm kiểu nào?" })).toBeTruthy(); });
  it("workflow được chọn mặc định và nhận focus", () => { setup(); const r = screen.getByRole("radio", { name: /Điền form, máy làm/ }); expect(r.getAttribute("aria-checked")).toBe("true"); expect(document.activeElement).toBe(r); });
  it("canvas có copy thân thiện, không dùng tên IA cũ", () => { setup(); expect(screen.getByRole("radio", { name: /Tự tay xếp trên bàn/ })).toBeTruthy(); expect(screen.queryByText(/Bàn làm việc tự do/)).toBeNull(); });
  it("workflow tạo đúng một project nền", async () => { const { onCreated } = setup(); await choose("Bắt đầu điền form"); expect(onCreated).toHaveBeenCalledWith(project, "workflow"); expect(calls).toHaveLength(1); });
  it("workflow dùng template basic và tag hình thái", async () => { setup(); await choose("Bắt đầu điền form"); expect(calls[0]!.body).toMatchObject({ template: "basic", tags: ["kg-workflow"] }); });
  it("canvas tạo đúng một project nền", async () => { const { onCreated } = setup(); await choose("Mở bàn làm việc"); expect(onCreated).toHaveBeenCalledWith(project, "canvas"); expect(calls).toHaveLength(1); });
  it("canvas dùng template blank và tag hình thái", async () => { setup(); await choose("Mở bàn làm việc"); expect(calls[0]!.body).toMatchObject({ template: "blank", tags: ["kg-canvas"] }); });
  it("payload giữ hợp đồng #8, không có mode hay file con", async () => { setup(); await choose("Mở bàn làm việc"); expect(Object.keys(calls[0]!.body).sort()).toEqual(["firstVariant", "name", "tags", "template"]); });
  it("không gọi contract/doc/run/kit phụ sau khi tạo", async () => { setup(); await choose("Bắt đầu điền form"); expect(calls).toHaveLength(1); expect(calls[0]!.method).toBe("POST"); });
  it("Enter trên lựa chọn xác nhận mode đang chọn", async () => { const { onCreated } = setup(); fireEvent.keyDown(screen.getByRole("radio", { name: /Điền form, máy làm/ }), { key: "Enter" }); await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project, "workflow")); });
  it("lỗi tạo giữ dialog và hiện câu người dùng hiểu", async () => { const bad = new Response(JSON.stringify({ error: { code: "PROJECT_BROKEN", message: "stack secret" } }), { status: 500, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" } }); setup(OK, bad); fireEvent.click(screen.getByRole("button", { name: "Mở bàn làm việc" })); expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.getByRole("dialog")).toBeTruthy(); });
  it("lỗi kỹ thuật chỉ nằm trong Chi tiết cho lập trình viên", async () => { const bad = new Response(JSON.stringify({ error: { code: "PROJECT_BROKEN", message: "stack secret" } }), { status: 500, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" } }); setup(OK, bad); fireEvent.click(screen.getByRole("button", { name: "Mở bàn làm việc" })); const alert = await screen.findByRole("alert"); const clone = alert.cloneNode(true) as HTMLElement; clone.querySelector("details")?.remove(); expect(clone.textContent).not.toContain("stack secret"); });
  it("agent chưa chạy vẫn mount đủ hai mode nhưng khoá thao tác có lý do", () => { setup(OFF); expect(screen.getAllByRole("radio")).toHaveLength(2); const b = screen.getByRole("button", { name: "Bắt đầu điền form" }) as HTMLButtonElement; expect(b.disabled).toBe(true); expect(b.title).toBeTruthy(); });
});
