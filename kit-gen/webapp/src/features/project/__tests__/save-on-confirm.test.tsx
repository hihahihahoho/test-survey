/* @vitest-environment jsdom */
/**
 * §BUG-2 — AUTOSAVE RÒ RỈ QUA MỘT CÁI CỬA XÁC NHẬN.
 *
 * ══ TÁI HIỆN CỦA NGƯỜI KIỂM THỬ (2.1.17) ═════════════════════════════════════
 * Dự án đã gen sạch → Cài đặt > Phong cách, đổi màu + mô tả → [Lưu và tạo lại ảnh]
 * → dialog xác nhận sinh ảnh mở ra → ĐÓNG dialog, không bấm Sinh. Kết quả:
 *   (a) thay đổi ĐÃ nằm trên server dù người dùng chưa hoàn tất hành động nào;
 *   (b) mở lại Cài đặt thì cả ba nút tắt — như thể chưa từng sửa gì;
 *   (c) không đâu trong app nói "ảnh đang lệch cấu hình mới".
 *
 * Nguyên nhân: `ProjectScreen.saveAndRegenerate` gọi `await buffer.save()` RỒI mới
 * bật dialog. Mở một hộp thoại xác nhận không phải là một sự đồng ý.
 *
 * ══ LUẬT ĐANG KHOÁ ═══════════════════════════════════════════════════════════
 * "Sửa là buffer — lưu mới là lưu" (`docs/PRODUCT-SITEMAP.md`, 2026-08-13). Cụ thể:
 *  ① `GenerateDialog` chỉ chạy `beforeStart` (= ghi đĩa) khi bấm [Sinh N lượt];
 *     đóng / Huỷ ⇒ KHÔNG một byte nào xuống server;
 *  ② `beforeStart` trả `false` (ghi hỏng) ⇒ KHÔNG chạy run — không đốt quota cho
 *     một bản thiết kế chưa lên đĩa;
 *  ③ buffer chưa được lưu thì `dirty` vẫn true ⇒ ba nút của `SaveBar` vẫn SÁNG;
 *  ④ đã ghi settings mà chưa sinh lại ảnh ⇒ dấu "lệch cấu hình · Cần tạo lại" hiện
 *     ra, và nó BỀN vì nguồn là trạng thái trên đĩa chứ không phải biến trong RAM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { Project } from "@/lib/types";
import { buildMatrix } from "../lib/matrix";
import { staleWarning } from "../lib/next-actions";
import { SaveBar } from "../components/SaveBar";

/* ── Bộ giả lập tối thiểu cho `GenerateDialog` ────────────────────────────────
   Chỉ giả những thứ NÓI CHUYỆN VỚI THẾ GIỚI (agent, router, ổ đĩa). Phần logic
   đang được kiểm — thứ tự "xác nhận rồi mới ghi" — vẫn là mã thật. */
const startRunMutate = vi.fn();
const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/hooks", () => ({
  useDoctor: () => ({ data: { imageGen: { available: true } }, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useRuns: () => ({ data: { items: [] } }),
  useStartRun: () => ({ mutate: startRunMutate, isPending: false }),
  useSaveWorkflowDraft: () => ({ mutateAsync: vi.fn(async () => ({})) }),
}));
vi.mock("@/lib/store", () => ({
  usePrefsStore: (select: (s: unknown) => unknown) =>
    select({ maxJobs: 4, setMaxJobs: vi.fn(), autoSliceAfterGen: false, setAutoSlice: vi.fn() }),
}));
/* Ma trận tick là một lưới checkbox đầy đủ — không phải thứ đang kiểm ở đây, và để
   nguyên thì nó kéo theo cả Radix Checkbox vào một test nói về thứ tự ghi đĩa. */
vi.mock("../../runs/components/JobPickMatrix", () => ({ JobPickMatrix: () => null }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const contract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [{ id: "chinh", vi: "Chính", style: "vui", bg: "magenta", characters: [] }],
  sheets: [{ id: "main", grid: { cols: 2, rows: 1 }, components: [] }],
} as never;

async function mountDialog(beforeStart: (() => Promise<boolean>) | null) {
  const { GenerateDialog } = await import("../../runs/components/GenerateDialog");
  return render(
    <GenerateDialog
      open
      onOpenChange={() => {}}
      projectId="p1"
      contract={contract}
      jobStates={{}}
      initialJobs={["chinh-main"]}
      readOnly={false}
      readOnlyReason=""
      beforeStart={beforeStart}
    />,
  );
}

beforeEach(() => {
  startRunMutate.mockReset();
  navigate.mockReset();
});
afterEach(cleanup);

describe("① đóng dialog xác nhận KHÔNG được ghi gì lên server", () => {
  it("mở dialog rồi bỏ đi: `beforeStart` chưa từng chạy", async () => {
    const beforeStart = vi.fn(async () => true);
    const view = await mountDialog(beforeStart);
    expect(await screen.findByRole("button", { name: /Sinh 1 lượt/ })).toBeTruthy();
    view.unmount();
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startRunMutate).not.toHaveBeenCalled();
  });

  it("bấm [Huỷ] cũng vậy — Huỷ là Huỷ, không phải 'lưu rồi thoát'", async () => {
    const beforeStart = vi.fn(async () => true);
    await mountDialog(beforeStart);
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(beforeStart).not.toHaveBeenCalled();
    expect(startRunMutate).not.toHaveBeenCalled();
  });
});

describe("② đúng cú bấm xác nhận mới ghi", () => {
  it("[Sinh N lượt] ⇒ ghi TRƯỚC, rồi mới chạy run", async () => {
    const order: string[] = [];
    const beforeStart = vi.fn(async () => { order.push("save"); return true; });
    startRunMutate.mockImplementation(() => order.push("run"));

    await mountDialog(beforeStart);
    fireEvent.click(screen.getByRole("button", { name: /Sinh 1 lượt/ }));

    await waitFor(() => expect(startRunMutate).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["save", "run"]);
  });

  it("ghi HỎNG ⇒ không chạy run: không đốt quota cho bản thiết kế chưa lên đĩa", async () => {
    const beforeStart = vi.fn(async () => false);
    await mountDialog(beforeStart);
    fireEvent.click(screen.getByRole("button", { name: /Sinh 1 lượt/ }));

    await waitFor(() => expect(beforeStart).toHaveBeenCalledTimes(1));
    expect(startRunMutate).not.toHaveBeenCalled();
  });

  it("không có `beforeStart` (màn khác) thì hành vi cũ giữ nguyên", async () => {
    await mountDialog(null);
    fireEvent.click(screen.getByRole("button", { name: /Sinh 1 lượt/ }));
    await waitFor(() => expect(startRunMutate).toHaveBeenCalledTimes(1));
  });
});

describe("③ chưa lưu ⇒ buffer vẫn bẩn ⇒ ba nút vẫn SÁNG", () => {
  const saveNow = vi.fn(async () => true);
  const noopSync = { saveNow } as unknown as import("@/features/workflow-v4/lib/contract-sync").ContractSync;

  it("`useProjectBuffer`: bỏ dở chuỗi 'Lưu và tạo lại' thì `dirty` không tự về false", async () => {
    const { useProjectBuffer } = await import("../lib/useProjectBuffer");
    const { createWorkflowStore, resetWorkflowStores } = await import("@/features/workflow-v4/lib/model");
    resetWorkflowStores();
    localStorage.clear();
    const store = createWorkflowStore("bug2-buffer");

    const { result, rerender } = renderHook(() =>
      useProjectBuffer({ projectId: "p1", store, state: store.getState(), sync: noopSync, ready: true }),
    );
    expect(result.current.dirty).toBe(false);

    act(() => { store.setState({ stylePrompt: "màu mới, mô tả mới" }); });
    rerender();
    expect(result.current.dirty).toBe(true);

    /* Đóng dialog sinh ảnh = KHÔNG gọi `save()`. Không có đường nào khác ghi đĩa
       (màn dự án chạy `autosave: false`), nên `dirty` phải đứng yên. */
    rerender();
    expect(result.current.dirty).toBe(true);
    expect(saveNow).not.toHaveBeenCalled();

    await act(async () => { await result.current.save(); });
    rerender();
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(false);
  });

  it("`dirty` ⇒ [Lưu và tạo lại ảnh] còn bấm được (đây là điều (b) đã hỏng)", () => {
    render(<SaveBar dirty saving={false} onSave={() => {}} onSaveAndRegenerate={() => {}} onRevert={() => {}} />);
    expect(screen.getByRole("button", { name: /Lưu và tạo lại ảnh/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: /Lưu cài đặt/ }).hasAttribute("disabled")).toBe(false);
  });
});

describe("④ đã lưu mà chưa sinh lại ⇒ dấu 'Cần tạo lại' hiện ra và ở lại", () => {
  const project = (jobs: Record<string, string>, reasons: string[]): Project => ({
    id: "p1", name: "Dự án", tags: [], broken: false,
    state: { stale: reasons.length > 0, staleReason: reasons, jobs },
  } as unknown as Project);

  it("contract mới hơn ảnh ⇒ cảnh báo mang đúng chữ 'lệch cấu hình · Cần tạo lại'", () => {
    const p = project({ "chinh-main": "stale" }, ["contract>raw"]);
    const warning = staleWarning(p, buildMatrix(contract, p));
    expect(warning.stale).toBe(true);
    expect(warning.message).toContain("lệch cấu hình");
    expect(warning.message).toContain("Cần tạo lại");
    expect(warning.staleJobs).toEqual(["chinh-main"]);
  });

  it("sinh lại xong ⇒ cảnh báo TẮT (nếu không thì nó là tiếng ồn vĩnh viễn)", () => {
    const p = project({ "chinh-main": "ok" }, []);
    expect(staleWarning(p, buildMatrix(contract, p)).stale).toBe(false);
  });

  it("dự án MỚI chưa gen tấm nào KHÔNG bị coi là lệch — agent gộp 'never' vào `contract>raw`", () => {
    /* `agent/lib/projects.mjs:computeState` đẩy "contract>raw" cho cả lượt chưa sinh
       lần nào. Tin thẳng vào nó thì mọi dự án mới đều đeo dải cảnh báo, và một cảnh
       báo kêu ở mọi nơi sẽ nuốt luôn ca THẬT mà mục ④ này cần nói ra. */
    const p = project({ "chinh-main": "never" }, ["contract>raw"]);
    expect(staleWarning(p, buildMatrix(contract, p)).stale).toBe(false);
  });

  it("thiếu `state.jobs` (agent cũ) ⇒ vẫn cảnh báo, chỉ là không có con số", () => {
    const p = project({}, ["contract>raw"]);
    const warning = staleWarning(p, buildMatrix(contract, p));
    expect(warning.stale).toBe(true);
    expect(warning.staleJobs).toEqual([]);
  });
});
