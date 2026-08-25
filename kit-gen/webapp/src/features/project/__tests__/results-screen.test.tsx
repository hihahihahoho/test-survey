/* @vitest-environment jsdom */
/**
 * `/p/:projectId` — MÀN «KẾT QUẢ & XUẤT KIT» SAU KHI ĐỔI IA.
 *
 * ╔══ BỐN THỨ ĐƯỢC KHOÁ, MỖI THỨ ỨNG VỚI MỘT CÁCH HỎNG IM LẶNG ══════════════╗
 * ║ ① LƯỚI TẤM DỰNG TỪ CONTRACT ĐÃ LƯU, và đi qua `contractJobs` — nếu ai đó   ║
 * ║   ghép tay `chinh-<id>` thì dự án nhiều phong cách MẤT TẤM mà không báo gì.║
 * ║ ② NÚT «Mở khu soạn» TRỎ ĐÚNG `/k/:id`. Đây là đường DUY NHẤT rời màn xem   ║
 * ║   để đi sửa; trỏ sai thì người dùng kẹt trong một màn chỉ-đọc.             ║
 * ║ ③ DIALOG CÀI ĐẶT KHÔNG CÒN MẢNH SOẠN NÀO (`BriefStep`/`StyleStep`). Hai    ║
 * ║   tab đó ghi vào cùng `contract.json` mà khu soạn đang là chủ — để lại là   ║
 * ║   dựng lại đúng cái cảnh "hai bản dịch chồng nhau, không ai biết bản nào    ║
 * ║   thắng" mà cả đợt này sinh ra để chấm dứt.                                ║
 * ║ ④ DỰ ÁN TRẮNG KHÔNG ĐƯỢC TRẮNG MÀN: phải có khối rỗng kèm lối đi tiếp.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Ca "màn không tự điều hướng đi đâu" nằm ở
 * `features/projects/__tests__/open-kit-intent.test.tsx` — nó thuộc chùm ca về Ý ĐỊNH
 * mở dự án, và để cạnh nhau thì người sau đọc được cả hai chiều của cùng một luật.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}
if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((q: string) => ({
    matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as never;
}

const navigate = vi.fn();
const search: { settings?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  /* `ProjectDialogs` thật kéo theo 7 dialog + wizard nhập; nó không phải chủ đề ở đây. */
  Link: (p: { children?: unknown }) => <a href="#">{p.children as never}</a>,
}));
vi.mock("@/routes/p.$projectId", () => ({ Route: { useSearch: () => search } }));
vi.mock("@/features/projects/ProjectDialogs", () => ({
  ProjectDialogs: () => <div data-testid="project-dialogs" />,
}));
vi.mock("@/features/demo", () => ({ DemoScreenButton: () => <button type="button">Lắp thử màn game</button> }));
/* Panel kết quả có bộ ca RIÊNG (`prompt-canvas/components/result/__tests__`). Ở đây chỉ
   cần biết màn cắm ĐÚNG BAO NHIÊU cái và với `sheetId`/`job` nào — mock để ca này không
   phải dựng lại cả tầng ảnh, và để nó đỏ vì đúng lý do của nó. */
vi.mock("@/features/prompt-canvas/components/result", () => ({
  SheetResultPanel: (p: { sheetId: string; job: string }) => (
    <section data-testid="sheet-panel" data-sheet={p.sheetId} data-job={p.job} />
  ),
}));

const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [
    { id: "nen", grid: { cols: 1, rows: 1 }, orient: "landscape", components: [] },
    { id: "ui2", grid: { cols: 2, rows: 2 }, orient: "landscape", components: [] },
  ],
  characterPoses: [],
} as never;

const PROJECT = { id: "kit-a", name: "Bộ quay may mắn", slug: "quay-may-man", tags: [], stats: {} } as never;

let contract: unknown = CONTRACT;
let project: unknown = PROJECT;

vi.mock("@/lib/hooks", () => ({
  useAgentStatus: () => ({ status: { case: "ok", health: {} } }),
  useProject: () => ({ data: project, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
  useContract: () => ({ data: contract ? { version: 3, contract } : undefined, isFetching: false, error: null, refetch: vi.fn() }),
  useRuns: () => ({ data: { items: [] }, isFetching: false, refetch: vi.fn() }),
  useKit: () => ({ data: { variant: "chinh", files: [] }, isLoading: false, refetch: vi.fn() }),
  useRevealProject: () => ({ mutate: vi.fn(), isPending: false }),
  usePatchProject: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectCover: () => ({ data: null }),
  useRegenerateCover: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { ProjectScreen } = await import("../ProjectScreen");

const mount = () => render(<ProjectScreen projectId="kit-a" />);

beforeEach(() => {
  navigate.mockReset();
  contract = CONTRACT;
  project = PROJECT;
  delete search.settings;
});
afterEach(cleanup);

describe("① lưới tấm dựng từ bản thiết kế ĐÃ LƯU", () => {
  it("mỗi tấm của contract một panel kết quả, không thừa không thiếu", () => {
    mount();
    const panels = screen.getAllByTestId("sheet-panel");
    expect(panels.map((el) => el.dataset.sheet)).toEqual(["nen", "ui2"]);
  });

  it("tên lượt vẽ ghép theo `contractJobs`, không ghép tay ở màn", () => {
    mount();
    const panels = screen.getAllByTestId("sheet-panel");
    // `${variant.id}-${sheet.id}` — đúng luật của `agent/lib/contract.mjs`.
    expect(panels.map((el) => el.dataset.job)).toEqual(["chinh-nen", "chinh-ui2"]);
  });

  it("hàng cửa ra có đủ ba lối lấy hàng, và không lối nào tiêu lượt tạo", () => {
    mount();
    expect(screen.getByRole("button", { name: /Tải \.zip|Mở sau khi/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy sang Figma|Mở sau khi/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lắp thử màn game" })).toBeTruthy();
    // Không có nút nào mở cửa tiêu quota ở màn XEM.
    expect(screen.queryByRole("button", { name: /Tạo lại|Sinh|Gen/ })).toBeNull();
  });
});

describe("② lối sang khu soạn", () => {
  it("nút «Mở khu soạn» điều hướng tới `/k/:projectId`", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Mở khu soạn" }));
    expect(navigate).toHaveBeenCalledWith({ to: "/k/$projectId", params: { projectId: "kit-a" } });
  });
});

describe("③ dialog Cài đặt chỉ còn meta của dự án", () => {
  it("mở ra là khối Thông tin + Vùng nguy hiểm, KHÔNG có tab soạn nào", () => {
    search.settings = "project";
    mount();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Thông tin");
    expect(dialog.textContent).toContain("Vùng nguy hiểm");
    /* Hai tab của bản cũ. Tìm theo NHÃN người dùng đọc chứ không theo tên component:
       đổi tên `BriefStep` mà giữ nguyên nội dung thì ca này vẫn phải đỏ. */
    expect(screen.queryByRole("button", { name: "Yêu cầu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Phong cách" })).toBeNull();
    expect(dialog.textContent).not.toContain("Brief thô");
  });

  it("ba việc nặng vẫn tới được, và tới bằng dialog dùng chung của màn danh sách", () => {
    search.settings = "project";
    mount();
    const dialog = screen.getByRole("dialog");
    for (const name of ["Nhân bản…", "Xuất…", "Xoá…"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
    expect(dialog.textContent).toContain("10 giây để hoàn tác");
  });
});

describe("④ dự án chưa có tấm nào", () => {
  it("khối rỗng nói việc tiếp theo thay vì để màn trắng", () => {
    contract = { schemaVersion: 4, variants: [], sheets: [], characterPoses: [] };
    mount();
    expect(screen.queryAllByTestId("sheet-panel")).toHaveLength(0);
    expect(screen.getByText("Chưa có tấm nào để xem")).toBeTruthy();
    // Lối đi tiếp phải là một CÚ BẤM có thật, không phải một câu khuyên.
    expect(screen.getAllByRole("button", { name: "Mở khu soạn" }).length).toBeGreaterThan(0);
  });

  it("agent chưa trả bản thiết kế ⇒ vẫn vẽ được khung màn, không nổ", () => {
    contract = null;
    expect(() => mount()).not.toThrow();
    expect(screen.getByText("Chưa có tấm nào để xem")).toBeTruthy();
  });
});
