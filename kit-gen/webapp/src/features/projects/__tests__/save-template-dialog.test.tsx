/* @vitest-environment jsdom */
/**
 * «LƯU LÀM TEMPLATE» — chụp BẢN MỚI NHẤT, không phải bản của 600ms trước.
 *
 * Agent chụp `workflow-draft.json` TRÊN ĐĨA, còn màn soạn tự lưu sau 600ms im phím.
 * Người vừa gõ xong một chữ rồi bấm «Lưu template» mà hộp gọi agent ngay thì template
 * THIẾU đúng chữ ấy — không lỗi, không báo, chỉ lộ ra khi mở dự án mới từ nó. Các ca
 * dưới khoá thứ tự: `flush()` TRƯỚC, đợi hết bẩn/hết bay, RỒI mới POST; ghi hỏng thì
 * DỪNG; bản soạn chưa đọc được / đang xung đột thì không cho bấm.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@/lib/types";

const H = vi.hoisted(() => ({
  save: vi.fn(),
  refs: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    templates: { ...real.api.templates, saveFromProject: H.save },
    refs: { ...real.api.refs, list: H.refs },
  };
  return { ...real, api, default: api };
});

vi.mock("@/features/projects/lib/feedback", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  toastSuccess: H.toastSuccess,
}));

const { SaveTemplateDialog, saveTemplateBlockReason, FLUSH_WAIT_MS } = await import("../dialogs/SaveTemplateDialog");
type Snapshot = import("../dialogs/SaveTemplateDialog").ComposerSnapshotState;

const GATE = { readOnly: false, reason: "", longReason: "", code: null };
const PROJECT = { id: "game-7f3a", name: "Game ăn xu", description: "Bộ UI game casual", tags: [] } as unknown as Project;
const SAVED = {
  id: "game-an-xu-a1b2", name: "Game ăn xu", description: "", tags: [], createdAt: "2026-09-30T10:00:00.000Z",
  updatedAt: "2026-09-30T10:00:00.000Z", sourceProjectId: "game-7f3a", sourceProjectName: "Game ăn xu",
  stats: { blocks: 3, refs: 2, bytes: 10 }, hasCover: true,
};

type ComposerFields = Omit<Snapshot, "flush">;
const CLEAN: ComposerFields = { dirty: false, saving: false, saveError: null, loadError: null, conflict: null, legacyDraft: false };

/**
 * Bàn thử: trạng thái bản soạn nằm NGOÀI hộp, ca test tự lái nó — đúng như màn soạn
 * thật, nơi `flush()` chỉ BẮT ĐẦU một lượt ghi và kết quả tới sau qua props.
 */
let drive: (patch: Partial<ComposerFields>) => void = () => {};
function Harness({ initial, flush, withComposer = true, onOpenChange }: {
  initial: ComposerFields; flush: () => void; withComposer?: boolean; onOpenChange: (o: boolean) => void;
}) {
  const [state, setState] = React.useState(initial);
  drive = (patch) => setState((s) => ({ ...s, ...patch }));
  const composer: Snapshot | undefined = withComposer ? { ...state, flush } : undefined;
  return <SaveTemplateDialog project={PROJECT} open onOpenChange={onOpenChange} gate={GATE} composer={composer} />;
}

function mount(initial: Partial<ComposerFields> = {}, opts: { withComposer?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const flush = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <Harness initial={{ ...CLEAN, ...initial }} flush={flush} onOpenChange={onOpenChange} withComposer={opts.withComposer} />
    </QueryClientProvider>,
  );
  return { flush, onOpenChange };
}

const saveButton = () => screen.getByRole("button", { name: /Lưu template|Đang lưu bản soạn/ }) as HTMLButtonElement;

beforeEach(() => {
  for (const fn of Object.values(H)) fn.mockReset();
  H.save.mockResolvedValue(SAVED);
  H.refs.mockResolvedValue({ items: [{ name: "a.png" }, { name: "b.png" }] });
});

afterEach(cleanup);

describe("hộp «Lưu làm template» — mở ra", () => {
  it("tên + mô tả điền sẵn từ dự án; câu tóm tắt đếm đúng số ảnh tham chiếu", async () => {
    mount();
    expect((screen.getByLabelText("Tên template") as HTMLInputElement).value).toBe("Game ăn xu");
    expect((screen.getByLabelText(/Mô tả/) as HTMLTextAreaElement).value).toBe("Bộ UI game casual");
    expect(await screen.findByText("Lưu mọi thẻ, cài đặt và 2 ảnh tham chiếu. Ảnh đã vẽ không đi theo.")).toBeTruthy();
  });

  it("tên trống ⇒ nói ra, không gọi gì", () => {
    const { flush } = mount();
    fireEvent.change(screen.getByLabelText("Tên template"), { target: { value: "   " } });
    fireEvent.click(saveButton());
    expect(screen.getByRole("alert").textContent).toContain("Đặt tên cho template.");
    expect(flush).not.toHaveBeenCalled();
    expect(H.save).not.toHaveBeenCalled();
  });
});

describe("chụp bản mới nhất — flush TRƯỚC, POST SAU", () => {
  it("bản soạn còn bẩn ⇒ flush, ĐỢI lượt ghi xong, rồi mới POST", async () => {
    const { flush, onOpenChange } = mount({ dirty: true });
    fireEvent.click(saveButton());
    expect(flush).toHaveBeenCalledTimes(1);
    expect(H.save).not.toHaveBeenCalled();
    expect(saveButton().textContent).toContain("Đang lưu bản soạn…");

    // Lượt ghi đang bay: vẫn đợi.
    act(() => drive({ saving: true }));
    expect(H.save).not.toHaveBeenCalled();
    // Ghi xong: hết bẩn, hết bay ⇒ bản trên đĩa là bản trên màn ⇒ POST.
    act(() => drive({ saving: false, dirty: false }));
    await waitFor(() => expect(H.save).toHaveBeenCalledTimes(1));
    expect(flush.mock.invocationCallOrder[0]!).toBeLessThan(H.save.mock.invocationCallOrder[0]!);
    expect(H.save.mock.calls[0]![0]).toBe("game-7f3a");
    expect(H.save.mock.calls[0]![1]).toEqual({ name: "Game ăn xu", description: "Bộ UI game casual" });

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(H.toastSuccess).toHaveBeenCalledWith('Đã lưu template "Game ăn xu"', expect.any(String));
  });

  it("bản soạn đã sạch ⇒ vẫn flush (vô hại), rồi POST ngay", async () => {
    const { flush } = mount();
    fireEvent.click(saveButton());
    await waitFor(() => expect(H.save).toHaveBeenCalledTimes(1));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.invocationCallOrder[0]!).toBeLessThan(H.save.mock.invocationCallOrder[0]!);
  });

  it("lượt ghi HỎNG ⇒ DỪNG, nói ra, KHÔNG chụp bản cũ", async () => {
    mount({ dirty: true });
    fireEvent.click(saveButton());
    act(() => drive({ saving: true }));
    const { AgentError } = await import("@/lib/api/client");
    act(() => drive({ saving: false, saveError: new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }) }));
    await waitFor(() => expect(saveButton().textContent).toContain("Lưu template"));
    expect(H.save).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("đợi quá lâu ⇒ bỏ cuộc và nói ra, không treo nút mãi", async () => {
    vi.useFakeTimers();
    try {
      mount({ dirty: true, saving: true });
      fireEvent.click(saveButton());
      act(() => { vi.advanceTimersByTime(FLUSH_WAIT_MS + 50); });
      expect(screen.getByText(/Bản soạn chưa lưu xong nên chưa chụp được template/)).toBeTruthy();
      expect(H.save).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mở từ menu thẻ (không có bản soạn trong RAM) ⇒ POST thẳng", async () => {
    mount({}, { withComposer: false });
    fireEvent.click(saveButton());
    await waitFor(() => expect(H.save).toHaveBeenCalledTimes(1));
  });

  it("agent từ chối (dự án chưa có bản soạn) ⇒ lỗi tại chỗ, hộp VẪN MỞ", async () => {
    const { AgentError } = await import("@/lib/api/client");
    H.save.mockRejectedValue(new AgentError({ code: "NO_COMPOSER_DRAFT", status: 422, message: "no composer draft" }));
    const { onOpenChange } = mount();
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(H.toastSuccess).not.toHaveBeenCalled();
  });
});

describe("không cho bấm khi bản trên màn KHÔNG phải bản trên đĩa", () => {
  it("chưa đọc được bản soạn ⇒ nút khoá, lý do ở title + trong hộp", () => {
    const { flush } = mount({ loadError: new Error("GET failed") });
    const reason = saveTemplateBlockReason({ ...CLEAN, loadError: true, flush: () => {} })!;
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().title).toBe(reason);
    expect(screen.getByText(reason)).toBeTruthy();
    fireEvent.click(saveButton());
    expect(flush).not.toHaveBeenCalled();
    expect(H.save).not.toHaveBeenCalled();
  });

  it("xung đột với bản ở tab/máy khác ⇒ nút khoá", () => {
    mount({ conflict: { updatedAt: "2026-09-30T09:00:00.000Z" } });
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().title).toMatch(/tab hoặc máy khác/);
  });

  it("còn bản nháp wizard kiểu cũ ⇒ nút khoá (agent sẽ từ chối)", () => {
    mount({ legacyDraft: true });
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().title).toMatch(/bản nháp kiểu cũ/);
  });

  it("chế độ chỉ xem ⇒ nút khoá bằng lý do của cổng", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <SaveTemplateDialog project={PROJECT} open onOpenChange={() => {}}
          gate={{ readOnly: true, reason: "Cần công cụ local đang chạy", longReason: "Mở Terminal…", code: null }} />
      </QueryClientProvider>,
    );
    expect(saveButton().disabled).toBe(true);
    expect(saveButton().title).toBe("Cần công cụ local đang chạy");
  });
});
