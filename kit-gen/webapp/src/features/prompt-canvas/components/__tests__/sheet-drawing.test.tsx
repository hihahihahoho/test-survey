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
import { cleanup, render, screen, within } from "@testing-library/react";
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
  done: 0, total: 1, jobs: ["chinh-ui2"], requested: ["chinh-ui2"], drawing: ["chinh-ui2"],
  phase: "drawing",
};

/** Panel kết quả của từng tấm, theo thứ tự tấm trên thẻ. */
const panels = () => screen.getAllByRole("region", { name: /^Kết quả tấm / });

/**
 * Nút «Vẽ lại tấm này» CỦA PANEL KẾT QUẢ, theo thứ tự tấm.
 *
 * Cùng một chữ ấy còn nằm ở vạch ranh giới tấm trong tab Soạn (`row-ui.tsx`), nên
 * ca này hỏi TRONG panel chứ không quét cả thẻ — nếu không, một cú đổi nhãn ở nút
 * kia sẽ làm ca này xanh/đỏ vì một lý do chẳng liên quan.
 * Ba mặt nút đều tính: nhãn đổi theo trạng thái, và chính phép đổi ấy là thứ được
 * canh ở đây.
 */
const panelRedrawButtons = () =>
  panels().map((p) => within(p).getByRole("button", { name: /Vẽ lại tấm này|Đang vẽ…|Đang chờ…/ }));

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

  /**
   * ╔══ ĐỔI Ý 15/09/2026: TẤM 1 CŨNG PHẢI KHOÁ ═══════════════════════════════╗
   * ║ Bản trước để nút của tấm 1 bấm được, và ca này canh đúng chuyện đó. Nhưng ║
   * ║ hàng đợi nhận MỘT lượt cho mỗi thẻ (`enqueue` bỏ qua thẻ đã có mặt), nên  ║
   * ║ cú bấm ấy rơi vào hư không: không lượt mới, không khung chờ, không một    ║
   * ║ dòng chữ nào. "Bấm được" mà không có gì xảy ra tệ hơn hẳn "xám kèm lý do" ║
   * ║ — nó dạy người dùng rằng nút này thỉnh thoảng hỏng.                       ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  it("tấm 1 cũng khoá, và tooltip nói rõ chờ gì — hàng đợi chỉ nhận một lượt mỗi thẻ", () => {
    mount(ONLY_SHEET_2);
    const buttons = panelRedrawButtons();
    expect(buttons).toHaveLength(2);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[0]?.getAttribute("title")).toBe("Chờ lượt hiện tại xong");
    /* Tấm ĐANG vẽ thì khoá bằng chính mặt nút — xin thêm một lượt cho đúng tấm
       đang chạy là tiêu tiền cho một kết quả sắp bị chính nó ghi đè. */
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[1]?.textContent).toContain("Đang vẽ…");
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
      done: 1, total: 1, jobs: ["chinh-ui2"], requested: [], drawing: [], phase: "done",
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
      done: 0, total: 1, jobs: ["chinh-ui2"], requested: ["chinh-ui2"], drawing: ["chinh-ui2"], phase: "drawing",
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(rawPaths()).toEqual(["raw/chinh-ui.png"]);
  });

  it("cả hai tấm cùng vẽ ⇒ cả hai cùng hiện khung chờ", () => {
    mount({
      status: "running", message: "Đang vẽ…", runId: "r-0036",
      done: 0, total: 2, jobs: ["chinh-ui", "chinh-ui2"],
      requested: ["chinh-ui", "chinh-ui2"], drawing: ["chinh-ui", "chinh-ui2"], phase: "drawing",
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(2);
  });

  it("tấm vẽ xong giữa chừng thôi quay vòng chờ, dù lượt vẫn đang chạy", () => {
    mount({
      status: "running", message: "Đang vẽ…", runId: "r-0036",
      done: 1, total: 2, jobs: ["chinh-ui", "chinh-ui2"],
      requested: ["chinh-ui2"], drawing: ["chinh-ui2"], phase: "drawing",
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(rawPaths()).toEqual(["runs/r-0036/artifacts/chinh-ui.png"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   BẤM LÚC HÀNG ĐỢI ĐANG BẬN — CÚ BẤM PHẢI CÓ TIẾNG VỌNG NGAY TẠI PANEL
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ HIỆN TRƯỜNG 15/09/2026 ════════════════════════════════════════════════╗
 * ║ Chủ sản phẩm bấm «Vẽ lại tấm này» ở panel kết quả trong lúc một lượt khác ║
 * ║ đang chạy. Panel của tấm ấy KHÔNG hiện gì: lượt chưa phóng được nên chưa   ║
 * ║ có `runId`, mà hai danh sách cũ (`jobs`, `drawing`) chỉ có nội dung khi    ║
 * ║ agent đã mở lượt. Chữ duy nhất nói ra là «Đang vẽ k/N» ở ĐẦU thẻ — phải   ║
 * ║ cuộn ngược lên mới thấy, tức màn hình bắt người dùng đi tìm câu trả lời    ║
 * ║ cho cú bấm của chính họ.                                                  ║
 * ║ `requested` lấp đúng quãng ấy: nó có TỪ LÚC BẤM, không đợi ai trả lời.     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
describe("bấm vẽ lại lúc hàng đợi bận", () => {
  /** Thẻ vừa vào hàng, lượt CHƯA phóng được — `runId` rỗng, `jobs` rỗng. */
  const QUEUED_SHEET_2: GenBlockState = {
    status: "queued", message: "Đang chờ tấm trước", runId: null,
    done: 0, total: 0, jobs: [], requested: ["chinh-ui2"], drawing: [], phase: "waiting",
  };

  it("panel của tấm ấy hiện khung «Đang chờ tới lượt…»", () => {
    mount(QUEUED_SHEET_2);
    const waiting = within(panels()[1]!).getByRole("status");
    expect(waiting.textContent).toContain("Đang chờ tới lượt…");
    /* Chưa tấm nào đang được vẽ ⇒ câu phụ chỉ dám nói tới chỗ ta biết chắc. */
    expect(waiting.textContent).toContain("Đã gửi, chờ máy nhận");
  });

  it("ẢNH CŨ CỦA TẤM ẤY VẪN TRONG DOM — khung chờ đứng trên nó, không thay nó", () => {
    mount(QUEUED_SHEET_2);
    /* Đây là khác biệt sống còn với khung «Đang vẽ»: tấm đang xếp hàng có thể còn
       vài phút nữa mới tới lượt, lấy mất bức ảnh đang có suốt quãng ấy là dựng lại
       đúng con bọ 14/09. */
    expect(rawPaths()).toEqual(["raw/chinh-ui.png", "raw/chinh-ui2.png"]);
  });

  it("tấm KHÔNG được xin thì không có khung chờ nào mọc lên", () => {
    mount(QUEUED_SHEET_2);
    expect(within(panels()[0]!).queryByRole("status")).toBeNull();
  });

  it("nút của tấm ấy đổi mặt thành «Đang chờ…», tấm kia xám kèm lý do", () => {
    mount(QUEUED_SHEET_2);
    const buttons = panelRedrawButtons();
    expect(buttons[1]?.textContent).toContain("Đang chờ…");
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect(buttons[0]?.getAttribute("title")).toBe("Chờ lượt hiện tại xong");
  });

  it("máy cầm tới tấm ấy ⇒ khung chờ đổi hẳn sang «Đang vẽ tấm này…»", () => {
    mount(ONLY_SHEET_2);
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(screen.queryByText("Đang chờ tới lượt…")).toBeNull();
  });

  it("máy đang vẽ tấm khác ⇒ câu phụ nói thẳng là tấm này xếp sau", () => {
    mount({
      status: "running", message: "Đang vẽ…", runId: "r-0040",
      done: 0, total: 2, jobs: ["chinh-ui", "chinh-ui2"],
      /* Agent ghi sẵn mọi job là `queued` lúc mở lượt và chỉ đẩy từng cái sang
         `running` khi thật sự vẽ tới — nên đây là hình dạng THƯỜNG GẶP của một
         lượt hai tấm, không phải ca hiếm. */
      requested: ["chinh-ui", "chinh-ui2"], drawing: ["chinh-ui"], phase: "drawing",
    });
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    const waiting = within(panels()[1]!).getByRole("status");
    expect(waiting.textContent).toContain("Đang chờ tới lượt…");
    expect(waiting.textContent).toContain("Máy đang vẽ tấm khác, tấm này xếp sau");
  });

  it("lượt trả về KHÔNG có tấm ấy (bị giữ nguyên) ⇒ khung chờ biến mất ngay", () => {
    /* Hàng đợi thu `requested` về đúng `jobs` thật lúc agent trả lượt: tấm bị bỏ
       qua vì vân tay chưa đổi thoát khỏi chờ NGAY, không quay vòng tới hết lượt. */
    mount({
      status: "running", message: "Đang vẽ… · Tấm 2 giữ nguyên, chưa đổi gì.", runId: "r-0041",
      done: 0, total: 1, jobs: ["chinh-ui"], requested: ["chinh-ui"], drawing: ["chinh-ui"],
      phase: "drawing",
    });
    expect(screen.queryByText("Đang chờ tới lượt…")).toBeNull();
    expect(screen.getAllByText("Đang vẽ tấm này…")).toHaveLength(1);
    expect(rawPaths()).toEqual(["raw/chinh-ui2.png"]);
  });
});
