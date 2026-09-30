/* @vitest-environment jsdom */
/**
 * MÀN SOẠN Ở CHẾ ĐỘ «SỬA TEMPLATE» — nối thật từ cú gõ tới lời gọi agent.
 *
 * ╔══ VÌ SAO NHỮNG CA NÀY ═══════════════════════════════════════════════════╗
 * ║ ① GHI TRƯỚC, CHÉP SAU — agent chép bản soạn TRÊN ĐĨA của dự án làm việc.  ║
 * ║   Gõ xong rồi bấm «Lưu vào template» trước nhịp tự lưu 600ms mà commit    ║
 * ║   chạy trước PUT ⇒ template thiếu đúng chữ vừa gõ, không lỗi, không báo.  ║
 * ║   Ca dùng `useComposerDoc` THẬT, PUT treo tới khi ca thả.                 ║
 * ║ ② KHÔNG CÓ ĐƯỜNG VẼ — mọi nút tiêu lượt, «Lưu làm template», hàng nút của ║
 * ║   dự án: vắng mặt. Có ca đối chứng ở chế độ thường để "vắng" có nghĩa.   ║
 * ║ ③ HỎNG THÌ Ở LẠI — lỗi commit hiện tại chỗ, màn mở khoá, không đi đâu.   ║
 * ║ ④ PHIÊN MẤT — chỉ còn đường về «Template dự án», không mời thử lại.      ║
 * ║ ⑤ HUỶ — hỏi trước, focus ở nút an toàn, đợi PUT đang bay rồi mới xoá.     ║
 * ║ ⑥ `persist()`/`close()` của kho bản soạn — hai móc mà ① đứng trên.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AgentError } from "@/lib/api/client";

const PID = "game-ui-lam-viec-7f3a";
const TPL_ID = "game-ui-a1b2";
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
  commitEdit: vi.fn(),
  discardEdit: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
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
    templates: { ...real.api.templates, commitEdit: H.commitEdit, discardEdit: H.discardEdit },
  };
  return { ...real, api, default: api };
});

/* Màn dựng NGOÀI router (xem `PromptCanvasScreenProps`) — `useNavigate` được thay bằng
   một hàm ghi lại, để ca nói được "đi đâu" mà không cần dựng cây route. */
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useNavigate: () => H.navigate,
}));

vi.mock("@/features/projects/lib/feedback", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toastSuccess: H.toastSuccess,
}));

/* Cổng ghi ghim ở «đã kết nối» — cùng lý do với save-template-button.test.tsx. */
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAgentStatus: () => ({
    status: { pill: "connected", connected: true, readOnly: false, case: "ok", code: null },
    recheck: vi.fn(),
    runBridgeProbe: vi.fn(),
  }),
}));

const { PromptCanvasScreen } = await import("../PromptCanvasScreen");
const { useComposerDoc, COMPOSER_SAVE_DEBOUNCE_MS } = await import("../lib/composer-doc");
const { useTemplateEditOf } = await import("@/lib/hooks/use-templates");
const { newDocBlock } = await import("@/features/prompt-lab/lib/composer-model");

/* ══════════════════════════════════════════════════════════════════════════
   Đồ dùng chung
   ══════════════════════════════════════════════════════════════════════════ */

const TEMPLATE_EDIT = {
  templateId: TPL_ID,
  templateName: "Game UI",
  startedAt: "2026-09-30T07:55:00.000Z",
  templateUpdatedAt: "2026-09-20T10:00:00.000Z",
};
const WORKING_PROJECT = { id: PID, name: "Game UI", description: "", tags: [], templateEdit: TEMPLATE_EDIT };
const PLAIN_PROJECT = { id: PID, name: "Bộ kit Tết", description: "", tags: [] };

const draftOf = (blocks: unknown[] = []) => ({
  completed: false,
  draft: { docVersion: 1, updatedAt: DISK_AT, composer: { blocks } },
  updatedAt: DISK_AT,
});

const SAVED_TEMPLATE = {
  id: TPL_ID, name: "Game UI", description: "", tags: [], createdAt: DISK_AT, updatedAt: SAVED_AT,
  sourceProjectId: null, sourceProjectName: null, stats: { blocks: 1, refs: 0, bytes: 0 }, hasCover: false, editing: null,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function hookWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const bar = () => screen.findByRole("region", { name: "Đang sửa template «Game UI»" });
const saveButton = () => screen.getByRole("button", { name: /Lưu vào template|Đang lưu/ }) as HTMLButtonElement;
const addButton = () => screen.getByRole("button", { name: /Thêm thẻ/ }) as HTMLButtonElement;

/** Thêm một thẻ Bộ UI qua menu thật — lượt sửa đi qua cửa `edit` của màn. */
async function addUiKitCard() {
  fireEvent.click(await screen.findByRole("button", { name: /Thêm thẻ/ }));
  fireEvent.click(await screen.findByRole("option", { name: /Bộ UI/ }));
}

/** PUT bản soạn treo tới khi ca gọi `release()` — để thấy commit có ĐỢI nó hay không. */
function holdNextPut() {
  const gate = { release: () => {} };
  H.saveWorkflowDraft.mockImplementationOnce((_id: string, input: { draft: unknown }) =>
    new Promise((resolve) => { gate.release = () => resolve({ completed: false, draft: input.draft, updatedAt: SAVED_AT }); }));
  return gate;
}

beforeEach(() => {
  for (const fn of Object.values(H)) fn.mockReset();
  localStorage.clear();
  H.getContract.mockResolvedValue({ version: 3, contract: { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] } });
  H.saveContract.mockResolvedValue({ version: 4 });
  H.getProject.mockResolvedValue(WORKING_PROJECT);
  H.kit.mockResolvedValue({ files: [], sheets: {} });
  H.refs.mockResolvedValue({ items: [] });
  H.workflowDraft.mockResolvedValue(draftOf());
  H.saveWorkflowDraft.mockImplementation(async (_id: string, input: { draft: unknown }) =>
    ({ completed: false, draft: input.draft, updatedAt: SAVED_AT }));
  H.commitEdit.mockResolvedValue(SAVED_TEMPLATE);
  H.discardEdit.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* ══════════════════════════════════════════════════════════════════════════
   ② Băng + những thứ phải vắng
   ══════════════════════════════════════════════════════════════════════════ */

describe("chế độ sửa template — màn nói rõ mình đang sửa gì, và không có đường vẽ", () => {
  it("băng «Đang sửa template «X»» với đúng hai nút kết phiên; tiêu đề đổi thành «Soạn template»", async () => {
    H.workflowDraft.mockResolvedValue(draftOf([newDocBlock()]));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    expect(within(region).getByRole("button", { name: "Huỷ thay đổi" })).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Lưu vào template" })).toBeTruthy();
    expect(region.textContent).toContain("dự án đã tạo từ nó trước đây không đổi");
    expect(screen.getByRole("heading", { level: 1, name: "Soạn template" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Soạn bộ kit" })).toBeNull();
    // Thẻ vẫn sửa được: tab Prompt còn (xem chữ engine sẽ gửi không tiêu lượt nào).
    expect(addButton().disabled).toBe(false);
    expect(screen.getByRole("tab", { name: "Prompt" })).toBeTruthy();
  });

  it("KHÔNG có Vẽ (thẻ lẫn cả trang), «Lưu làm template», «Cài đặt dự án», «Xoá», tải kit", async () => {
    H.workflowDraft.mockResolvedValue(draftOf([newDocBlock()]));
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    expect(screen.queryByRole("button", { name: /Vẽ · tiêu lượt/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Vẽ tất cả/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu làm template" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cài đặt dự án/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Xoá$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tải/ })).toBeNull();
  });

  it("đối chứng: cùng bản soạn ở dự án THƯỜNG ⇒ các nút ấy có mặt, băng thì không", async () => {
    H.getProject.mockResolvedValue(PLAIN_PROJECT);
    H.workflowDraft.mockResolvedValue(draftOf([newDocBlock()]));
    wrap(<PromptCanvasScreen projectId={PID} />);
    expect(await screen.findByRole("button", { name: /Vẽ · tiêu lượt/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Vẽ tất cả/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu làm template" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cài đặt dự án/ })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Đang sửa template/ })).toBeNull();
  });

  it("dự án chưa về (chế độ chưa rõ) ⇒ CHƯA vẽ nút nào chỉ thuộc về dự án thường", async () => {
    H.getProject.mockReturnValue(new Promise(() => {}));
    H.workflowDraft.mockResolvedValue(draftOf([newDocBlock()]));
    wrap(<PromptCanvasScreen projectId={PID} />);
    expect(await screen.findByRole("heading", { name: "Soạn bộ kit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Vẽ · tiêu lượt/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Vẽ tất cả/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu làm template" })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ① «Lưu vào template»: ghi trước, chép sau
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Lưu vào template»", () => {
  it("thêm thẻ rồi lưu NGAY ⇒ PUT bản soạn đáp xuống TRƯỚC, commit SAU; xong thì báo + về «Template dự án»", async () => {
    const put = holdNextPut();
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    await addUiKitCard();
    // Chưa tới nhịp tự lưu: trên đĩa vẫn là bản CŨ.
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();

    fireEvent.click(saveButton());
    // `persist()` bắn lượt ghi NGAY, không đợi 600ms.
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1));
    const sent = H.saveWorkflowDraft.mock.calls[0]![1] as { draft: { composer: { blocks: unknown[] } }; baseUpdatedAt: string };
    expect(sent.draft.composer.blocks).toHaveLength(1);
    expect(sent.baseUpdatedAt).toBe(DISK_AT);
    // PUT còn bay ⇒ template CHƯA bị chạm, nút nói đúng việc đang làm, khu soạn khoá.
    await new Promise((r) => setTimeout(r, 50));
    expect(H.commitEdit).not.toHaveBeenCalled();
    expect(saveButton().textContent).toContain("Đang lưu bản soạn…");
    expect(saveButton().disabled).toBe(true);
    expect(addButton().disabled).toBe(true);

    await act(async () => { put.release(); });
    await waitFor(() => expect(H.commitEdit).toHaveBeenCalledTimes(1));
    expect(H.commitEdit).toHaveBeenCalledWith(TPL_ID);
    expect(H.saveWorkflowDraft.mock.invocationCallOrder[0]!).toBeLessThan(H.commitEdit.mock.invocationCallOrder[0]!);

    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" }));
    expect(H.toastSuccess).toHaveBeenCalledWith("Đã lưu template «Game UI»", expect.stringContaining("vẫn giữ nguyên"));
    // Phiên đã kết ⇒ không một lượt ghi nào nữa, kể cả khi màn gỡ.
    cleanup();
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
  });

  it("không có gì chờ ghi ⇒ commit thẳng, không PUT thừa", async () => {
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    fireEvent.click(saveButton());
    await waitFor(() => expect(H.commitEdit).toHaveBeenCalledTimes(1));
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" }));
  });

  it("PUT bản soạn HỎNG ⇒ DỪNG, không commit bản cũ; lỗi hiện trong băng, màn mở khoá", async () => {
    H.saveWorkflowDraft.mockRejectedValue(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    await addUiKitCard();
    fireEvent.click(saveButton());
    await waitFor(() => expect(within(region).getByRole("alert")).toBeTruthy());
    expect(H.saveWorkflowDraft).toHaveBeenCalled();
    expect(H.commitEdit).not.toHaveBeenCalled();
    expect(H.navigate).not.toHaveBeenCalled();
    expect(region.textContent).toContain("template chưa bị thay");
    expect(saveButton().disabled).toBe(false);
    expect(addButton().disabled).toBe(false);
  });

  it("commit 413 TEMPLATE_TOO_LARGE ⇒ ở lại, lỗi tại chỗ (chữ từ bảng lỗi), sửa tiếp được, thẻ còn nguyên", async () => {
    H.commitEdit.mockRejectedValue(new AgentError({ code: "TEMPLATE_TOO_LARGE", status: 413, message: "too large" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    await addUiKitCard();
    fireEvent.click(saveButton());
    const alert = await within(region).findByRole("alert");
    expect(alert.textContent).toContain("quá nặng");
    expect(region.textContent).toContain("Chỗ bạn đã sửa vẫn còn nguyên trên màn");
    expect(H.navigate).not.toHaveBeenCalled();
    expect(H.toastSuccess).not.toHaveBeenCalled();
    expect(saveButton().textContent).toBe("Lưu vào template");
    expect(saveButton().disabled).toBe(false);
    expect(addButton().disabled).toBe(false);
    expect(screen.getAllByRole("tab", { name: "Prompt" })).toHaveLength(1);
  });

  it("422 NO_COMPOSER_DRAFT ⇒ lời chữa RIÊNG của chế độ này (không bảo «mở dự án»)", async () => {
    H.commitEdit.mockRejectedValue(new AgentError({ code: "NO_COMPOSER_DRAFT", status: 422, message: "no draft" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    fireEvent.click(saveButton());
    await within(region).findByRole("alert");
    expect(region.textContent).toContain("Phiên này chưa có bản soạn nào được lưu");
    expect(region.textContent).not.toContain("Chỗ bạn đã sửa vẫn còn nguyên");
  });

  it("bấm hai lần liền ⇒ MỘT lượt commit", async () => {
    const put = holdNextPut();
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    await addUiKitCard();
    const button = saveButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1));
    await act(async () => { put.release(); });
    await waitFor(() => expect(H.navigate).toHaveBeenCalled());
    expect(H.commitEdit).toHaveBeenCalledTimes(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ Phiên biến mất
   ══════════════════════════════════════════════════════════════════════════ */

describe("phiên sửa không còn (lưu/bỏ ở tab khác)", () => {
  it("commit 404 TEMPLATE_EDIT_NOT_FOUND ⇒ băng đổi thành lời chỉ đường; khu soạn khoá; «Về Template dự án»", async () => {
    H.commitEdit.mockRejectedValue(new AgentError({ code: "TEMPLATE_EDIT_NOT_FOUND", status: 404, message: "gone" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    fireEvent.click(saveButton());
    const gone = await screen.findByRole("alert", { name: "Phiên sửa template này không còn nữa" });
    expect(screen.queryByRole("region", { name: /Đang sửa template/ })).toBeNull();
    expect(addButton().disabled).toBe(true);
    // «Chưa lưu được — còn trên máy này» là một lời hứa sai khi không còn chỗ để lưu.
    expect(screen.queryByText(/Đã lưu|Chưa lưu/)).toBeNull();
    fireEvent.click(within(gone).getByRole("button", { name: "Về Template dự án" }));
    expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" });
  });

  it("tự lưu nền về 404 PROJECT_NOT_FOUND ⇒ cùng lời chỉ đường đó, không đợi người dùng bấm lưu", async () => {
    H.saveWorkflowDraft.mockRejectedValue(new AgentError({ code: "PROJECT_NOT_FOUND", status: 404, message: "no project" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    await bar();
    await addUiKitCard();
    expect(await screen.findByRole("alert", { name: "Phiên sửa template này không còn nữa" }, { timeout: 3000 })).toBeTruthy();
    expect(H.commitEdit).not.toHaveBeenCalled();
  });

  it("GET bản soạn 404 trên một phiên ⇒ chỉ đường về, KHÔNG phải «Thử lại» (thử lại chắc chắn hỏng)", async () => {
    H.workflowDraft.mockRejectedValue(new AgentError({ code: "PROJECT_NOT_FOUND", status: 404, message: "no project" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const gone = await screen.findByRole("alert", { name: "Phiên sửa template này không còn nữa" });
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
    fireEvent.click(within(gone).getByRole("button", { name: "Về Template dự án" }));
    expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ «Huỷ thay đổi»
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Huỷ thay đổi»", () => {
  it("hỏi trước, focus ở «Tiếp tục sửa»; chọn nó ⇒ không gọi gì, vẫn ở màn", async () => {
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    fireEvent.click(within(region).getByRole("button", { name: "Huỷ thay đổi" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Huỷ mọi thay đổi?" });
    expect(dialog.textContent).toContain("Template «Game UI» giữ nguyên như trước khi sửa");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Tiếp tục sửa"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Tiếp tục sửa" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(H.discardEdit).not.toHaveBeenCalled();
    expect(H.navigate).not.toHaveBeenCalled();
  });

  it("xác nhận ⇒ đợi PUT đang bay đáp xuống, RỒI mới bỏ phiên; báo + về «Template dự án»", async () => {
    const put = holdNextPut();
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    await addUiKitCard();
    fireEvent.click(within(region).getByRole("button", { name: "Huỷ thay đổi" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Huỷ mọi thay đổi?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ thay đổi" }));

    await waitFor(() => expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(H.discardEdit).not.toHaveBeenCalled();
    await act(async () => { put.release(); });

    await waitFor(() => expect(H.discardEdit).toHaveBeenCalledWith(TPL_ID));
    expect(H.saveWorkflowDraft.mock.invocationCallOrder[0]!).toBeLessThan(H.discardEdit.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" }));
    expect(H.toastSuccess).toHaveBeenCalledWith("Đã huỷ thay đổi", expect.stringContaining("Game UI"));
    expect(H.commitEdit).not.toHaveBeenCalled();
  });

  it("bỏ phiên HỎNG ⇒ lỗi trong hộp, hộp vẫn mở, không đi đâu", async () => {
    H.discardEdit.mockRejectedValue(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    wrap(<PromptCanvasScreen projectId={PID} />);
    const region = await bar();
    fireEvent.click(within(region).getByRole("button", { name: "Huỷ thay đổi" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Huỷ mọi thay đổi?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ thay đổi" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
    expect(H.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Huỷ mọi thay đổi?" })).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ `persist()` / `close()` của kho bản soạn
   ══════════════════════════════════════════════════════════════════════════ */

const addDoc = (prev: import("@/features/prompt-lab/lib/composer-model").ComposerState) =>
  ({ ...prev, blocks: [...prev.blocks, newDocBlock()] });

async function adoptedStore() {
  const hook = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useComposerDoc — persist() chỉ xong khi bản mới nhất ĐÃ XUỐNG ĐĨA", () => {
  it("lượt ghi đang hẹn giờ ⇒ bắn NGAY, và persist chỉ xong khi PUT đáp xuống", async () => {
    const put = holdNextPut();
    const { result } = await adoptedStore();
    act(() => result.current.setComposer(addDoc));
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();

    let settled = false;
    let done!: Promise<void>;
    act(() => { done = result.current.persist().then(() => { settled = true; }); });
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);

    await act(async () => { put.release(); await done; });
    expect(settled).toBe(true);
    // Hẹn giờ cũ đã bị huỷ: không có PUT thứ hai 600ms sau.
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
  });

  it("sửa thêm lúc PUT còn bay ⇒ persist ghi NỐT bản ấy (mốc mới) rồi mới xong", async () => {
    const put = holdNextPut();
    const { result } = await adoptedStore();
    act(() => result.current.setComposer(addDoc));
    let done!: Promise<void>;
    act(() => { done = result.current.persist(); });
    act(() => result.current.setComposer(addDoc));
    await act(async () => { put.release(); await done; });
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(2);
    const second = H.saveWorkflowDraft.mock.calls[1]![1] as { draft: { composer: { blocks: unknown[] } }; baseUpdatedAt: string };
    expect(second.draft.composer.blocks).toHaveLength(2);
    expect(second.baseUpdatedAt).toBe(SAVED_AT);
  });

  it("không có gì chờ ghi ⇒ xong ngay, không PUT", async () => {
    const { result } = await adoptedStore();
    await act(async () => { await result.current.persist(); });
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
  });

  it("PUT hỏng ⇒ persist NÉM đúng lỗi ấy (người gọi phải dừng, không chép bản cũ)", async () => {
    const failure = new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" });
    H.saveWorkflowDraft.mockRejectedValue(failure);
    const { result } = await adoptedStore();
    act(() => result.current.setComposer(addDoc));
    let caught: unknown = null;
    await act(async () => { await result.current.persist().catch((e: unknown) => { caught = e; }); });
    expect(caught).toBe(failure);
  });

  it("409 DRAFT_CONFLICT ⇒ persist NÉM xung đột, và lượt persist sau ném ngay, không PUT", async () => {
    H.saveWorkflowDraft.mockRejectedValue(new AgentError({ code: "DRAFT_CONFLICT", status: 409, message: "newer on disk" }));
    const { result } = await adoptedStore();
    act(() => result.current.setComposer(addDoc));
    let first: unknown = null;
    await act(async () => { await result.current.persist().catch((e: unknown) => { first = e; }); });
    expect((first as AgentError).code).toBe("DRAFT_CONFLICT");
    let second: unknown = null;
    await act(async () => { await result.current.persist().catch((e: unknown) => { second = e; }); });
    expect((second as AgentError).code).toBe("DRAFT_CONFLICT");
    expect(H.saveWorkflowDraft).toHaveBeenCalledTimes(1);
  });

  it("bản trên đĩa CHƯA nhận ⇒ persist ném, không PUT (không có gì an toàn để ghi)", async () => {
    H.workflowDraft.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useComposerDoc(PID), { wrapper: hookWrapper() });
    let caught: unknown = null;
    await act(async () => { await result.current.persist().catch((e: unknown) => { caught = e; }); });
    expect(caught).toBeInstanceOf(AgentError);
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
  });

  it("close() ⇒ không một lượt ghi nào nữa: bỏ lượt đang hẹn, bỏ lượt ghi-lúc-gỡ, sửa sau đó là không-làm-gì", async () => {
    const { result, unmount } = await adoptedStore();
    act(() => result.current.setComposer(addDoc));
    act(() => result.current.close());
    act(() => result.current.setComposer(addDoc));
    unmount();
    await new Promise((r) => setTimeout(r, COMPOSER_SAVE_DEBOUNCE_MS + 50));
    expect(H.saveWorkflowDraft).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Chế độ NHỚ: dự án làm việc 404 giữa chừng vẫn là «đang sửa template»
   ══════════════════════════════════════════════════════════════════════════ */

describe("useTemplateEditOf — nhớ chế độ đã thấy", () => {
  it("đã thấy `templateEdit` ⇒ giữ dù dự án biến mất; đổi sang dự án khác ⇒ quên", () => {
    const { result, rerender } = renderHook(
      ({ id, project }: { id: string; project: typeof WORKING_PROJECT | typeof PLAIN_PROJECT | undefined }) =>
        useTemplateEditOf(id, project as never),
      { initialProps: { id: PID, project: WORKING_PROJECT as typeof WORKING_PROJECT | typeof PLAIN_PROJECT | undefined } },
    );
    expect(result.current?.templateId).toBe(TPL_ID);
    rerender({ id: PID, project: undefined });
    expect(result.current?.templateName).toBe("Game UI");
    rerender({ id: "du-an-khac", project: undefined });
    expect(result.current).toBeNull();
    rerender({ id: "du-an-khac", project: { ...PLAIN_PROJECT, id: "du-an-khac" } });
    expect(result.current).toBeNull();
  });
});
