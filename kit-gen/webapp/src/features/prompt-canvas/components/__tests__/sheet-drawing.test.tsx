/* @vitest-environment jsdom */
/**
 * MỘT LƯỢT VẼ CHẠM TẤM NÀO THÌ CHỈ TẤM ẤY ĐƯỢC NÓI «ĐANG VẼ».
 *
 * ╔══ HIỆN TRƯỜNG 14/09/2026 ════════════════════════════════════════════════╗
 * ║ Thẻ Bộ UI hai tấm. Chủ sản phẩm bấm «Vẽ lại tấm này» ở TẤM 2 ⇒ CẢ HAI ô   ║
 * ║ ảnh hiện «Đang vẽ tấm này… Ảnh sẽ hiện ở đây ngay khi máy vẽ trả về», dù   ║
 * ║ lượt chạy thật (`test-vcb-d6fd/runs/r-0034/run.json`) chỉ có ĐÚNG một job: ║
 * ║ `chinh-ui2`. Hai chỗ nói dối cùng một lúc:                                 ║
 * ║  ① khung chờ mọc trên tấm mà không ai đụng tới — và nó ĐẨY BỨC ẢNH ĐANG    ║
 * ║    CÓ của tấm ấy ra khỏi màn, tức là mất thứ người dùng vừa vẽ xong;       ║
 * ║  ② mã lượt của cả thẻ đi xuống mọi ô, nên ô tấm 1 đọc                      ║
 * ║    `runs/r-0034/artifacts/chinh-ui.png` — file không bao giờ tồn tại, vì   ║
 * ║    lượt ấy không vẽ tấm 1. Ảnh hiện hành `raw/chinh-ui.png` thì nằm ngay    ║
 * ║    trên đĩa.                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Nên bộ ca này soi ĐÚNG hai thứ ấy, ở tầng thật (vỏ thẻ → chỗ cắm → panel), và
 * soi bằng thứ người dùng nhìn thấy: câu chờ, và ĐƯỜNG DẪN mà ô ảnh đi xin.
 * Ca thứ ba khoá đường thứ hai dẫn tới cùng cảnh hỏng: vẽ CẢ THẺ nhưng agent giữ
 * nguyên một tấm (vân tay chưa đổi) — tấm bị bỏ qua cũng không được hiện khung chờ.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import type { Block, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";
import type { GenBlockState } from "../../lib/gen-queue";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}

/* Ô ảnh thật đi qua transport có header; ở đây chỉ cần biết nó XIN ĐƯỜNG NÀO —
   đó chính là thứ quyết định người dùng thấy ảnh hay thấy ô đỏ "Thiếu file". */
vi.mock("@/features/kit/components/KitImage", () => ({
  KitImage: (p: { path: string; alt: string }) => <img alt={p.alt} data-path={p.path} />,
}));
vi.mock("@/features/kit/lib/image-source", () => ({
  loadFull: () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} }),
  forgetProject: vi.fn(),
}));
vi.mock("@/features/kit/lib/download", () => ({
  saveProjectFile: vi.fn(() => Promise.resolve({ fileName: "x.png", bytes: 1 })),
}));
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));
vi.mock("@/features/kit/lib/figma-kit-doc", () => ({
  BOARD_W: 2400,
  packKitDoc: () => ({ groups: [], skipped: [], width: 2400, height: 100 }),
  cellsOf: () => [],
  copyKitDoc: () => Promise.resolve({ html: "", docs: 0, bytes: 0 }),
}));
vi.mock("@/features/kit/lib/figma-board", () => ({
  PHASE_LABEL: { 1: "a", 2: "b", 3: "c", 4: "d" },
  BoardCancelled: class BoardCancelled extends Error {},
  buildFigmaBoard: () => Promise.resolve({ outcome: "clipboard", files: 0, width: 1, height: 1 }),
}));

/** Hai tấm ĐÃ TỪNG được vẽ — nếu không, panel bày lời mời "Chưa vẽ tấm này". */
const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [
    { id: "ui", grid: { cols: 2, rows: 2 }, canvas: "square", components: [] },
    { id: "ui2", grid: { cols: 2, rows: 2 }, canvas: "square", components: [] },
  ],
} as never;

/* MOCK MỘT PHẦN: vỏ thẻ thật còn kéo theo thư viện món của người dùng
   (`usePresets` → `useUserLibrary`), thứ không liên quan gì tới câu hỏi ở đây.
   Thay cả module là phải đếm hộ mọi hook mà cây component gọi — và thiếu một cái
   thì ca đỏ ở một chỗ chẳng nói gì về con bọ đang truy. */
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useContract: () => ({ data: { version: 1, contract: CONTRACT } }),
  useProject: () => ({ data: { id: "p1", name: "Bộ kit thử", state: { jobs: { "chinh-ui": "ok", "chinh-ui2": "ok" } } } }),
  useKit: () => ({ data: { variant: "chinh", files: [] }, isLoading: false }),
  useRevealProject: () => ({ mutate: vi.fn() }),
  useRuns: () => ({ data: { items: [] } }),
  useRawHistory: () => ({ data: { items: [] }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRawHistory: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { CanvasBlock } = await import("../CanvasBlock");
const { newCell } = await import("@/features/prompt-lab/lib/composer-model");
const { composerBlockSheets } = await import("../../lib/composer-to-contract");

const PRESETS = seedPresets();
const IDS = ["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy"];

/** Sáu món ở nấc mặc định ⇒ ĐÚNG hai tấm (`ui`, `ui2`) — ca thật của con bọ. */
function uiBlock(): UiKitBlock {
  return { id: "u1", kind: "uikit", mode: "template", cells: IDS.map((id) => newCell(id, PRESETS)) };
}

function sheetsOf(block: Block) {
  return composerBlockSheets(
    {
      themeValue: "", styleId: PRESETS.styles[0]!.id, brandColors: [], themeCustom: "", styleCustom: "",
      brandId: "", contextRefs: [], brandAssets: {}, contextMode: "template", blocks: [block],
    },
    { presets: PRESETS },
  )[0]!.sheets;
}

function mount(gen: GenBlockState) {
  const block = uiBlock();
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanvasBlock
        projectId="p1"
        block={block}
        sheets={sheetsOf(block) as never}
        onChange={() => {}}
        onDelete={() => {}}
        gen={gen}
        onGen={() => {}}
        onGenSheet={() => {}}
        onDequeue={() => {}}
        onStop={() => {}}
        stopping={false}
        prompt={{ status: "idle", jobs: [], missing: [], message: "", details: [], hash: "" } as never}
        styleLine=""
        onWantPrompt={() => {}}
        promptBusy={false}
        hash="h1"
        reloadSignal={0}
        onReload={() => {}}
      />
    </QueryClientProvider>,
  );
}

/** Lượt đang chạy chỉ mang ĐÚNG tấm 2 — đúng hình dạng `r-0034` ngoài đời. */
const ONLY_SHEET_2: GenBlockState = {
  status: "running", message: "Đang vẽ…", runId: "r-0034",
  done: 0, total: 1, jobs: ["chinh-ui2"], drawing: ["chinh-ui2"],
};

/**
 * Nút «Vẽ lại tấm này» CỦA PANEL KẾT QUẢ, theo thứ tự tấm.
 *
 * Cùng một chữ ấy còn nằm ở vạch ranh giới tấm trong tab Soạn (`row-ui.tsx`), và
 * nút đó khoá theo CẢ THẺ — đúng như nó nên thế (xin thêm một lượt cho thẻ đang
 * chạy chỉ tổ đẩy nó ra sau hàng). Lọc theo `title` để ca này soi đúng nút đứng
 * cạnh bức ảnh, chứ không đếm nhầm sang nút kia rồi xanh/đỏ vì lý do khác.
 */
const panelRedrawButtons = () =>
  screen.getAllByRole("button", { name: "Vẽ lại tấm này" })
    .filter((el) => (el.getAttribute("title") ?? "").includes("—"));

/** Đường mà từng ô ảnh gốc đi xin, theo thứ tự tấm trên thẻ. */
const rawPaths = () =>
  screen.getAllByRole("img", { name: /^Ảnh gốc tấm / }).map((el) => el.getAttribute("data-path"));

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("vẽ lại tấm 2 ⇒ chỉ tấm 2 hiện khung chờ", () => {
  it("MỘT khung chờ duy nhất, không phải hai", () => {
    mount(ONLY_SHEET_2);
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
  });

  it("tấm 1 vẫn bày ẢNH HIỆN HÀNH của nó, không bị khung chờ đẩy đi", () => {
    mount(ONLY_SHEET_2);
    /* Đúng MỘT ô ảnh còn lại (ô của tấm 2 đã nhường chỗ cho khung chờ), và nó xin
       `raw/…` — bản hiện hành — chứ KHÔNG xin thư mục của lượt `r-0034`: lượt ấy
       không vẽ tấm 1 nên trong đó không có file nào của nó. */
    expect(rawPaths()).toEqual(["raw/chinh-ui.png"]);
  });

  it("tấm 1 giữ nguyên nút «Vẽ lại tấm này» dùng được", () => {
    mount(ONLY_SHEET_2);
    const buttons = panelRedrawButtons();
    expect(buttons).toHaveLength(2);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
    /* Tấm ĐANG vẽ thì khoá — xin thêm một lượt cho đúng tấm đang chạy là tiêu tiền
       cho một kết quả sắp bị chính nó ghi đè. */
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("đầu thẻ đếm theo số tấm THẬT của lượt: «Đang vẽ 0/1», không phải 0/2", () => {
    mount(ONLY_SHEET_2);
    expect(screen.getByText("Đang vẽ 0/1")).toBeTruthy();
  });
});

describe("lượt đã xong vẫn phải trả tấm ngoài lượt về ảnh hiện hành", () => {
  it("tấm trong lượt đọc ảnh BẤT BIẾN của lượt, tấm ngoài lượt đọc bản hiện hành", () => {
    mount({
      status: "done", message: "Tấm 1 giữ nguyên, chưa đổi gì.", runId: "r-0034",
      done: 1, total: 1, jobs: ["chinh-ui2"], drawing: [],
    });
    expect(screen.queryByText("Đang vẽ tấm này…")).toBeNull();
    expect(rawPaths()).toEqual(["raw/chinh-ui.png", "runs/r-0034/artifacts/chinh-ui2.png"]);
  });
});

describe("vẽ CẢ THẺ mà một tấm bị giữ nguyên", () => {
  it("tấm bị bỏ qua không hiện khung chờ — nó có đang được vẽ đâu", () => {
    /* Agent giữ nguyên tấm 1 vì vân tay chưa đổi ⇒ `jobs` của hàng đợi chỉ còn
       tấm 2, dù người dùng bấm nút Vẽ của cả thẻ. */
    mount({
      status: "running", message: "Đang vẽ… · Tấm 1 giữ nguyên, chưa đổi gì.", runId: "r-0035",
      done: 0, total: 1, jobs: ["chinh-ui2"], drawing: ["chinh-ui2"],
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(rawPaths()).toEqual(["raw/chinh-ui.png"]);
  });

  it("cả hai tấm cùng vẽ ⇒ cả hai cùng hiện khung chờ", () => {
    mount({
      status: "running", message: "Đang vẽ…", runId: "r-0036",
      done: 0, total: 2, jobs: ["chinh-ui", "chinh-ui2"], drawing: ["chinh-ui", "chinh-ui2"],
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(2);
  });

  it("tấm vẽ xong giữa chừng thôi quay vòng chờ, dù lượt vẫn đang chạy", () => {
    mount({
      status: "running", message: "Đang vẽ…", runId: "r-0036",
      done: 1, total: 2, jobs: ["chinh-ui", "chinh-ui2"], drawing: ["chinh-ui2"],
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(rawPaths()).toEqual(["runs/r-0036/artifacts/chinh-ui.png"]);
  });
});
