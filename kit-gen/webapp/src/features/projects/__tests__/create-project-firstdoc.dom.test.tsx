/** Dialog tạo mới chỉ lấy tên rồi mở wizard. Canvas chưa được chọn ở đây. */
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
const project = projectSchema.parse({ id: "kit-a7f3", name: "Dự án mới" });
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

async function createProject(name = "Tết 2027") {
  fireEvent.change(screen.getByRole("textbox", { name: "Tên dự án" }), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  await waitFor(() => expect(calls).toHaveLength(1));
}

describe("tạo dự án rồi mở wizard", () => {
  it("chỉ hỏi tên dự án và giải thích bước tiếp theo", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Tạo dự án" })).toBeTruthy();
    expect(screen.getByText("Wizard tạo dự án")).toBeTruthy();
    expect(screen.queryByText(/Canvas|Bàn làm việc/)).toBeNull();
  });

  it("chưa có tên thì chưa cho tiếp tục", () => {
    setup();
    expect((screen.getByRole("button", { name: "Tiếp tục" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tạo đúng một dự án trống rồi trả về chế độ wizard", async () => {
    const { onCreated } = setup();
    await createProject();
    expect(onCreated).toHaveBeenCalledWith(project, "workflow");
    expect(calls[0]!.body).toMatchObject({ name: "Tết 2027", template: "blank", tags: ["kg-workflow"] });
    expect(Object.keys(calls[0]!.body).sort()).toEqual(["firstVariant", "name", "tags", "template"]);
  });

  it("Enter trong ô tên cũng tạo dự án", async () => {
    const { onCreated } = setup();
    const input = screen.getByRole("textbox", { name: "Tên dự án" });
    fireEvent.change(input, { target: { value: "Tết 2027" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(project, "workflow"));
  });

  it("lỗi tạo giữ dialog và hiện lỗi tại chỗ", async () => {
    const bad = new Response(JSON.stringify({ error: { code: "PROJECT_BROKEN", message: "stack secret" } }), { status: 500, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" } });
    setup(OK, bad);
    await createProject();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("công cụ local chưa chạy thì nút bị khoá và có lý do", () => {
    setup(OFF);
    fireEvent.change(screen.getByRole("textbox", { name: "Tên dự án" }), { target: { value: "Tết 2027" } });
    expect((screen.getByRole("button", { name: "Tiếp tục" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(OFF.longReason)).toBeTruthy();
  });
});
