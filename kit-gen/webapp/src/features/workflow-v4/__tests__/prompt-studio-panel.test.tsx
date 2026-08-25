/* @vitest-environment jsdom */
/**
 * PROMPT STUDIO — panel của bước ⑤, kiểm ở đúng chỗ người dùng đứng.
 *
 * VÌ SAO MOUNT CẢ BƯỚC chứ không unit-test component: thứ dễ hỏng nhất ở đây là CHỖ
 * NỐI DÂY, không phải logic (logic đã có `lib/__tests__/prompt-studio.test.ts`). Ba
 * sợi dây phải đúng cùng lúc mới ra được giá trị của màn:
 *   ① nút bấm gửi CONTRACT ĐANG DỰNG Ở CLIENT (không phải bản đã lưu trên đĩa —
 *      người ta vừa gõ xong là bấm, nhịp autosave 700ms chưa kịp chạy);
 *   ② ô "chỉ đạo" ghi vào ĐÚNG khoá `sheet.id` của tấm đang mở;
 *   ③ lỗi của agent ra thành câu tiếng Việt, không phải một khối im lặng.
 *
 * KHÔNG có lượt sinh ảnh nào trong file này: `prompt-preview` là I/O đĩa phía agent
 * (`agent/routes/contract.mjs:85` dừng trước vòng gọi máy vẽ).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentError } from "@/lib/api/client";
import { contractJobs } from "@/lib/types/contract";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { buildKitsetContract } from "../lib/kitset-to-contract";
import { ContractSyncProvider, type ContractSync } from "../lib/contract-sync";
import { ReviewStep } from "../steps/ReviewStep";

const PID = "kit-prompt-studio-ui";

/* `vi.hoisted`: factory của `vi.mock` bị kéo lên đầu file nên không thấy `const` bên dưới. */
const H = vi.hoisted(() => ({ promptPreview: vi.fn(), copied: [] as string[] }));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, unknown>; [k: string]: unknown };
  const contract = { ...(real.api.contract as object), promptPreview: H.promptPreview };
  const api = { ...real.api, contract };
  return { ...real, api, default: api, contractApi: contract };
});

beforeEach(() => {
  H.promptPreview.mockReset();
  H.copied.length = 0;
  localStorage.clear();
  resetWorkflowStores();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (t: string) => { H.copied.push(t); } },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

/** Contract THẬT của state mặc định — id tấm trong test phải là id màn thật sẽ gặp. */
const kitsetContract = () => buildKitsetContract(createWorkflowStore(PID).getState());

const mount = () => {
  const contract = kitsetContract();
  const sync = {
    state: "saved", contract, jobCount: contractJobs(contract).length, version: 1,
    savedAt: null, note: null, conflict: null,
    sourceContract: contract, adoptForeign: () => {},
    resolveConflict: (async () => null) as ContractSync["resolveConflict"],
    dismissConflict: () => {}, saveNow: async () => true,
  } satisfies ContractSync;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <WorkflowStoreProvider projectId={PID}>
          <ContractSyncProvider value={sync}>
            <ReviewStep />
          </ContractSyncProvider>
        </WorkflowStoreProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

/** Hai job đầu của contract thật, kèm prompt giả nhưng ĐÚNG hình dạng agent trả về. */
function fakeJobs() {
  const c = kitsetContract();
  const [a, b] = contractJobs(c);
  return [
    { job: a!.job, variant: a!.variant, sheet: a!.sheet, prompt: "Canvas orientation: PORTRAIT 1024x1536.\nSheet nền của bộ kit.", attachments: ["skeleton/nen.png", "refs/inspo-1.png"] },
    { job: b!.job, variant: b!.variant, sheet: b!.sheet, prompt: "Canvas orientation: LANDSCAPE 1536x1024.\nSheet thứ hai.", attachments: [] },
  ];
}

const clickPreview = () => fireEvent.click(screen.getByRole("button", { name: /Xem prompt sẽ gửi/ }));

/**
 * Hàng của MỘT tấm. `\b…\b` chứ không phải `RegExp(sheet)` trần: id tấm là một họ
 * (`nen`, `nen2`), nên tìm bằng chuỗi con thì "nen" trúng cả hai hàng và ca test đỏ vì
 * chính cách nó hỏi, không vì mã sai.
 */
const rowFor = (sheet: string) => screen.getByRole("button", { name: new RegExp(`\\b${sheet}\\b`) });
const findRow = (sheet: string) => screen.findByRole("button", { name: new RegExp(`\\b${sheet}\\b`) });

describe("Prompt Studio — xem trước", () => {
  it("bấm nút thì gửi CONTRACT ĐANG DỰNG Ở CLIENT (không để agent tự đọc bản trên đĩa)", async () => {
    H.promptPreview.mockResolvedValue({ jobs: fakeJobs(), missing: [] });
    mount();
    clickPreview();
    await waitFor(() => expect(H.promptPreview).toHaveBeenCalledTimes(1));
    const [projectId, contract] = H.promptPreview.mock.calls[0]!;
    expect(projectId).toBe(PID);
    expect(JSON.stringify(contract)).toBe(JSON.stringify(kitsetContract()));
  });

  it("hiện đủ danh sách tấm: tên đọc được + id + nhãn phong cách", async () => {
    const jobs = fakeJobs();
    H.promptPreview.mockResolvedValue({ jobs, missing: [] });
    mount();
    clickPreview();
    await screen.findByText(jobs[0]!.sheet);
    for (const j of jobs) expect(screen.getByText(j.sheet)).toBeTruthy();
    // Nhãn phong cách = tên dự án người dùng đặt, không phải id kỹ thuật `chinh`.
    expect(screen.getAllByText(/Dự án mới/).length).toBeGreaterThan(0);
  });

  it("mở một tấm ra thì thấy PROMPT NGUYÊN VĂN + chip ảnh đính kèm, và copy được", async () => {
    const jobs = fakeJobs();
    H.promptPreview.mockResolvedValue({ jobs, missing: [] });
    mount();
    clickPreview();
    const row = await findRow(jobs[0]!.sheet);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");

    const block = screen.getByLabelText(`Prompt của tấm ${jobs[0]!.sheet}`);
    expect(block.textContent).toBe(jobs[0]!.prompt);
    for (const a of jobs[0]!.attachments) expect(screen.getByText(a)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    await waitFor(() => expect(H.copied).toEqual([jobs[0]!.prompt]));
  });

  it("nút đổi thành 'Xem lại' sau lần xem đầu — sửa xong còn đường chạy lại", async () => {
    H.promptPreview.mockResolvedValue({ jobs: fakeJobs(), missing: [] });
    mount();
    clickPreview();
    const again = await screen.findByRole("button", { name: /Xem lại/ });
    fireEvent.click(again);
    await waitFor(() => expect(H.promptPreview).toHaveBeenCalledTimes(2));
  });

  it("tấm engine không dựng nổi prompt được NÓI RA, không im lặng bỏ bớt", async () => {
    H.promptPreview.mockResolvedValue({ jobs: fakeJobs(), missing: ["chinh-ui9"] });
    mount();
    clickPreview();
    expect((await screen.findByText(/Chưa xem trước được/)).textContent).toContain("chinh-ui9");
  });
});

describe("Prompt Studio — sửa theo từng tấm", () => {
  it("gõ chỉ đạo: vào ĐÚNG khoá `sheet.id`, và dấu ✎ hiện lên", async () => {
    const jobs = fakeJobs();
    H.promptPreview.mockResolvedValue({ jobs, missing: [] });
    mount();
    clickPreview();
    fireEvent.click(await findRow(jobs[0]!.sheet));

    expect(screen.queryByText("đã chỉnh")).toBeNull();
    fireEvent.change(screen.getByLabelText("Chỉ đạo riêng cho sheet này"), { target: { value: "viền vàng dày hơn" } });

    expect(createWorkflowStore(PID).getState().sheetPrompts).toEqual({
      [jobs[0]!.sheet]: { directive: "viền vàng dày hơn" },
    });
    // Dấu ✎ đúng MỘT cái — của tấm vừa sửa, không lây sang tấm bên cạnh.
    expect(screen.getAllByText("đã chỉnh")).toHaveLength(1);
    const row = rowFor(jobs[0]!.sheet);
    expect(within(row).getByText("đã chỉnh")).toBeTruthy();
  });

  it("nút khôi phục trả tấm ấy về prompt engine tự dựng", async () => {
    const jobs = fakeJobs();
    H.promptPreview.mockResolvedValue({ jobs, missing: [] });
    mount();
    clickPreview();
    fireEvent.click(await findRow(jobs[0]!.sheet));
    fireEvent.change(screen.getByLabelText("Chỉ đạo riêng cho sheet này"), { target: { value: "thêm tuyết" } });
    fireEvent.click(screen.getByRole("button", { name: /Khôi phục/ }));
    expect(createWorkflowStore(PID).getState().sheetPrompts).toEqual({});
    expect(screen.queryByText("đã chỉnh")).toBeNull();
  });

  it("tự soạn trọn prompt: NẰM SAU toggle, có cảnh báo, prefill = prompt đang xem", async () => {
    const jobs = fakeJobs();
    H.promptPreview.mockResolvedValue({ jobs, missing: [] });
    mount();
    clickPreview();
    fireEvent.click(await findRow(jobs[0]!.sheet));

    const box = screen.getByLabelText(`Prompt tự soạn cho tấm ${jobs[0]!.sheet}`) as HTMLTextAreaElement;
    // Phải nằm trong khối gập — người dùng không vấp phải nó khi chỉ muốn xem.
    expect(box.closest("details")).toBeTruthy();
    expect(box.value).toBe(jobs[0]!.prompt);
    expect(screen.getByText(/BỎ QUA mọi thiết lập/)).toBeTruthy();

    fireEvent.change(box, { target: { value: "tôi tự viết trọn prompt" } });
    // Gõ THÔI thì chưa ghi gì — đây là quyết định phải cố ý.
    expect(createWorkflowStore(PID).getState().sheetPrompts).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: /Dùng prompt tự soạn/ }));
    expect(createWorkflowStore(PID).getState().sheetPrompts).toEqual({
      [jobs[0]!.sheet]: { promptOverride: "tôi tự viết trọn prompt" },
    });
    expect(screen.getAllByText("đã chỉnh")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Bỏ prompt tự soạn/ }));
    expect(createWorkflowStore(PID).getState().sheetPrompts).toEqual({});
  });
});

describe("Prompt Studio — lỗi nói được thành câu", () => {
  it("409 RUN_ACTIVE: chờ lượt vẽ, không phải một khối im lặng", async () => {
    H.promptPreview.mockRejectedValue(new AgentError({
      code: "RUN_ACTIVE", status: 409, transport: "http-error",
      message: "project p1 has active run r-77", details: { runId: "r-77" },
    }));
    mount();
    clickPreview();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Đang có lượt vẽ chạy");
    // §3.9 luật ①: chuỗi kỹ thuật chỉ được nằm trong panel gập.
    expect(alert.querySelector("p")!.textContent).not.toContain("active run");
  });

  it("422 CONTRACT_INVALID: đếm lỗi ở thân, `details.errors` trong panel gập", async () => {
    H.promptPreview.mockRejectedValue(new AgentError({
      code: "CONTRACT_INVALID", status: 422, transport: "http-error", message: "contract has 1 error(s)",
      details: { errors: [{ code: "V-04", path: "sheets[1].components", message: "grid 2x2 needs 4 cells, got 3" }] },
    }));
    mount();
    clickPreview();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("1 lỗi");
    expect(within(alert).getByText(/sheets\[1\].components/)).toBeTruthy();
  });

  it("app local tắt: chỉ đường bật công cụ, KHÔNG đổ lỗi cho bản thiết kế", async () => {
    H.promptPreview.mockRejectedValue(new AgentError({
      code: "AGENT_NOT_RUNNING", transport: "unreachable", message: "fetch failed",
    }));
    mount();
    clickPreview();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Chưa thấy công cụ local");
    expect(alert.textContent).not.toContain("bản thiết kế");
  });
});
