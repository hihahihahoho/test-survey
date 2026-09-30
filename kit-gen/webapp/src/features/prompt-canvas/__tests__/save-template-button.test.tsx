/* @vitest-environment jsdom */
/**
 * NÚT «LƯU LÀM TEMPLATE» Ở ĐẦU MÀN SOẠN — nối thật từ cú gõ tới lời gọi agent.
 *
 * Hộp thoại đã có ca riêng (features/projects/__tests__/save-template-dialog.test.tsx)
 * với một bản soạn GIẢ. Ca ở đây dùng `useComposerDoc` THẬT của màn: thêm một thẻ rồi
 * bấm lưu template ngay, TRƯỚC khi nhịp tự lưu 600ms kịp chạy. Nếu dây `flush` hay cờ
 * `dirty`/`saving` đứt ở đâu đó giữa màn và hộp, template sẽ thiếu đúng thẻ vừa thêm
 * — và không ai thấy cho tới khi mở dự án mới từ nó.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PID = "kit-save-template";
const DISK_AT = "2026-09-30T08:00:00.000Z";
const SAVED_AT = "2026-09-30T08:00:05.000Z";

const H = vi.hoisted(() => ({
  getContract: vi.fn(),
  saveContract: vi.fn(),
  workflowDraft: vi.fn(),
  saveWorkflowDraft: vi.fn(),
  getProject: vi.fn(),
  kit: vi.fn(),
  refs: vi.fn(),
  saveTemplate: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    contract: { ...real.api.contract, get: H.getContract, save: H.saveContract },
    projects: {
      ...real.api.projects,
      get: H.getProject,
      workflowDraft: H.workflowDraft,
      saveWorkflowDraft: H.saveWorkflowDraft,
    },
    files: { ...real.api.files, kit: H.kit },
    refs: { ...real.api.refs, list: H.refs },
    templates: { ...real.api.templates, saveFromProject: H.saveTemplate },
  };
  return { ...real, api, default: api };
});

/* Cổng ghi đọc vòng probe CHUNG của app; ở đây ghim nó ở trạng thái «đã kết nối» —
   một vòng probe thật trong test là request ra mạng + một đồng hồ chạy ngầm. */
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAgentStatus: () => ({
    status: { pill: "connected", connected: true, readOnly: false, case: "ok", code: null },
    recheck: vi.fn(),
    runBridgeProbe: vi.fn(),
  }),
}));

const { PromptCanvasScreen } = await import("../PromptCanvasScreen");

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const headerButton = () => screen.getByRole("button", { name: "Lưu làm template" }) as HTMLButtonElement;

beforeEach(() => {
  for (const fn of Object.values(H)) fn.mockReset();
  localStorage.clear();
  H.getContract.mockResolvedValue({ version: 3, contract: { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] } });
  H.saveContract.mockResolvedValue({ version: 4 });
  H.getProject.mockResolvedValue({ id: PID, name: "Bộ kit Tết", description: "", tags: [] });
  H.kit.mockResolvedValue({ files: [], sheets: {} });
  H.refs.mockResolvedValue({ items: [] });
  H.workflowDraft.mockResolvedValue({
    completed: false,
    draft: { docVersion: 1, updatedAt: DISK_AT, composer: { blocks: [] } },
    updatedAt: DISK_AT,
  });
  H.saveTemplate.mockResolvedValue({
    id: "bo-kit-tet-a1b2", name: "Bộ kit Tết", description: "", tags: [], createdAt: SAVED_AT, updatedAt: SAVED_AT,
    sourceProjectId: PID, sourceProjectName: "Bộ kit Tết", stats: { blocks: 1, refs: 0, bytes: 0 }, hasCover: false,
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("«Lưu làm template» ở đầu màn soạn", () => {
  it("thêm thẻ rồi lưu template NGAY ⇒ bản soạn được ghi TRƯỚC, template chụp SAU", async () => {
    let release: () => void = () => {};
    H.saveWorkflowDraft.mockImplementation((_id: string, input: { draft: unknown }) =>
      new Promise((resolve) => { release = () => resolve({ completed: false, draft: input.draft, updatedAt: SAVED_AT }); }));
    wrap(<PromptCanvasScreen projectId={PID} />);

    fireEvent.click(await screen.findByRole("button", { name: /Thêm thẻ/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Bộ UI/ }));
    // Chưa tới nhịp tự lưu 600ms: bản trên đĩa còn là bản CŨ.
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();

    await waitFor(() => expect(headerButton().disabled).toBe(false));
    fireEvent.click(headerButton());
    fireEvent.click(await screen.findByRole("button", { name: "Lưu template" }));

    // `flush()` bắn lượt ghi ngay; template CHƯA được chụp khi lượt ấy còn bay.
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1));
    const sent = H.saveWorkflowDraft.mock.calls[0]![1] as { draft: { composer: { blocks: unknown[] } } };
    expect(sent.draft.composer.blocks).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(H.saveTemplate).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(H.saveTemplate).toHaveBeenCalledTimes(1));
    expect(H.saveWorkflowDraft.mock.invocationCallOrder[0]!).toBeLessThan(H.saveTemplate.mock.invocationCallOrder[0]!);
    expect(H.saveTemplate.mock.calls[0]![0]).toBe(PID);
    expect(H.saveTemplate.mock.calls[0]![1]).toMatchObject({ name: "Bộ kit Tết" });
  });

  it("dự án còn bản nháp kiểu cũ ⇒ nút khoá và nói lý do (agent sẽ từ chối bản ấy)", async () => {
    H.workflowDraft.mockResolvedValue({
      completed: false,
      draft: { kitName: "Kit Tết", styleAxes: { age: 3 }, elements: [], mascotPoses: ["idle"], completedSteps: 4 },
      updatedAt: null,
    });
    wrap(<PromptCanvasScreen projectId={PID} />);
    await screen.findByRole("alertdialog", { name: "Thay bản nháp cũ" });
    await waitFor(() => expect(headerButton().disabled).toBe(true));
    expect(headerButton().title).toMatch(/bản nháp kiểu cũ/);
  });
});
