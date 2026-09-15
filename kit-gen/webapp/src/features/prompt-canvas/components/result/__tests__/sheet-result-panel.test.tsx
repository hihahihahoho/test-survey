/* @vitest-environment jsdom */
/**
 * PANEL KẾT QUẢ DƯỚI CHÂN MỘT BLOCK — hai tab, và không tab nào nói dối.
 *
 * Ba thứ được khoá ở đây, đều là thứ hỏng thì người dùng KHÔNG NHÌN RA:
 *  ① ĐÚNG HAI tab, và tab mặc định là «Ảnh gốc» — vì `sheet.image` về TRƯỚC
 *    `sheet.ready`, mở thẳng vào «Đã crop» là cho xem một khung trống trong khi
 *    ảnh vừa chờ mấy phút đã nằm ngay tab bên cạnh.
 *  ② Tab «Đã crop» chỉ hiện ô CỦA TẤM NÀY. `#42` trả cả bộ kit; panel treo dưới
 *    chân một block mà hiện ô của tấm khác là nói dối về chỗ đứng.
 *  ③ Lưới trống lúc đang cắt phải nói "đang cắt", không nói "chưa có ô nào".
 *
 * ══ VÌ SAO CÓ MỘT CA CANH THỨ ĐÃ BỊ BỎ ═════════════════════════════════════
 * Tab «Khung xương» bị bỏ theo quyết định sản phẩm: engine thôi gửi ảnh khung
 * xương, vùng an toàn đi vào prompt bằng toạ độ số. Một ca chỉ đếm "có 2 tab"
 * sẽ vẫn xanh nếu ai đó thêm lại tab ấy và bỏ đi tab «Đã crop»; nên ca ① gọi
 * ĐÍCH DANH cái đã bỏ. Bỏ một tính năng cũng là một hợp đồng, và hợp đồng nào
 * không có test thì lượt refactor sau sẽ lặng lẽ xé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { kitFileSchema, type KitFile } from "@/lib/types";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}

/** Ghi lại đường dẫn mà panel xin — đó là thứ quyết định người dùng thấy ảnh nào. */
const asked: Array<{ path: string; width?: number; full?: boolean }> = [];
vi.mock("@/features/kit/components/KitImage", () => ({
  KitImage: (p: { path: string; alt: string; width?: number; full?: boolean }) => {
    asked.push({ path: p.path, width: p.width, full: p.full });
    return <img alt={p.alt} data-path={p.path} />;
  },
}));
vi.mock("@/features/kit/lib/image-source", () => ({
  loadFull: () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} }),
  forgetProject: vi.fn(),
}));
vi.mock("@/features/kit/lib/download", () => ({ saveProjectFile: vi.fn(() => Promise.resolve({ fileName: "x.png", bytes: 1 })) }));
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));

/**
 * ══ NÚT FIGMA CHÍNH: HAI ĐƯỜNG, CẢ HAI ĐỀU PHẢI NHẬN ĐÚNG Ô CỦA TẤM NÀY ═════
 *
 * Đường chính (`figma-kit-doc`) dựng mỗi ô một khung; đường lùi (`figma-board`)
 * ghép một ảnh phẳng. Mock cả hai vì cả hai đều cần trình duyệt thật (encoder +
 * bộ nhớ tạm) — thứ ĐÁNG canh ở đây không phải chúng chạy ra gì, mà là panel
 * ĐƯA CHO chúng danh sách nào. Bản trước của nút này dán `raw/<job>.png`; một ca
 * chỉ đếm "có gọi hàm copy" sẽ xanh y hệt cho cả hai bản, nên mọi ca dưới đây
 * soi vào ĐỐI SỐ.
 */
const docCalls: Array<Array<{ file: { file: string } }>> = [];
const packCalls: Array<{ files: KitFile[]; scale?: number | ((f: KitFile) => number | undefined) }> = [];
const boardCalls: Array<{
  files: Array<{ file: string }>;
  variantLabel: string;
  scaleOf?: (f: KitFile) => number | undefined;
}> = [];
/** true ⇒ giả cảnh không ô nào dựng được khung ⇒ panel phải rơi về đường lùi. */
let packEmpty = false;
/** Kết cục của đường lùi: vào bộ nhớ tạm, hay chỉ tải được file về máy. */
let boardOutcome: "clipboard" | "download" = "clipboard";

vi.mock("@/features/kit/lib/figma-kit-doc", () => ({
  /* Mock phải có ĐỦ export mà panel import: một tên thiếu ném ngay lúc truy cập, và
     lỗi ấy bị chính `try/catch` của nút nuốt thành "rơi về đường lùi" — ca sẽ xanh
     nhầm chỗ (nút vẫn hiện «Đã copy N ô» vì đường lùi cũng gọi `setCopied`). */
  BOARD_W: 2400,
  packKitDoc: (
    files: KitFile[],
    _poseFiles: ReadonlySet<string>,
    _boardWidth: number,
    opts?: { scale?: number | ((f: KitFile) => number | undefined) },
  ) => {
    packCalls.push({ files: [...files], scale: opts?.scale });
    return {
      groups: packEmpty ? [] : [{
        category: "ui",
        label: "Giao diện",
        cells: files.map((f) => ({ file: f, name: f.file, group: "ui", spec: {}, left: 0, top: 0 })),
        bytes: 0,
      }],
      skipped: [],
      width: 2400,
      height: 100,
    };
  },
  cellsOf: (groups: Array<{ cells: unknown[] }>) => groups.flatMap((g) => g.cells),
  copyKitDoc: (cells: Array<{ file: { file: string } }>) => {
    docCalls.push(cells);
    return Promise.resolve({ html: "<i></i>", docs: cells.length, bytes: 10 });
  },
}));

vi.mock("@/features/kit/lib/figma-board", () => ({
  PHASE_LABEL: { 1: "Chuẩn bị danh sách", 2: "Tải ảnh", 3: "Ghép bảng", 4: "Đưa vào bộ nhớ tạm" },
  BoardCancelled: class BoardCancelled extends Error {},
  buildFigmaBoard: (opts: {
    files: Array<{ file: string }>;
    variantLabel: string;
    scaleOf?: (f: KitFile) => number | undefined;
  }) => {
    boardCalls.push({ files: [...opts.files], variantLabel: opts.variantLabel, scaleOf: opts.scaleOf });
    return Promise.resolve({
      outcome: boardOutcome, files: opts.files.length, width: 2400, height: 100,
      ...(boardOutcome === "download" ? { fallbackReason: "bộ nhớ tạm bị khoá" } : {}),
    });
  },
}));

let kitFiles: KitFile[] = [];
let kitLoading = false;
const revealMutate = vi.fn();
/**
 * Trạng thái lượt vẽ của tấm, ĐÚNG hình dạng `#9 GET …/projects/:id` trả về.
 * Mặc định `"ok"` = đã vẽ rồi, vì đó là bối cảnh của gần hết ca dưới đây (chúng
 * hỏi về ẢNH ĐÃ CÓ). Ca "chưa vẽ" tự đặt lại thành `{}` — xem describe cuối file.
 */
let jobStates: Record<string, string> = { "chinh-ui": "ok", "chinh-nen": "ok" };

/**
 * LỊCH SỬ ẢNH + DANH SÁCH LƯỢT — hai nguồn của LỚP PHỦ SOI Ô.
 *
 * Mặc định cả hai rỗng: gần hết ca dưới đây không nói gì về lớp phủ, và một panel
 * không có số đo phải chạy y như trước. Ca lớp phủ tự nạp số thật (`r-0021`).
 */
let rawItems: Array<Record<string, unknown>> = [];
let runItems: Array<Record<string, unknown>> = [];

vi.mock("@/lib/hooks", () => ({
  useContract: () => ({ data: { version: 1, contract: CONTRACT } }),
  useProject: () => ({ data: { id: "p1", name: "Dự án thử", state: { jobs: jobStates } } }),
  useKit: () => ({ data: { variant: "chinh", files: kitFiles }, isLoading: kitLoading }),
  useRevealProject: () => ({ mutate: revealMutate }),
  useRuns: () => ({ data: { items: runItems } }),
  /* Thanh phiên bản dùng chung module hooks; ở đây cho nó im (chưa có lịch sử). */
  useRawHistory: () => ({ data: { items: rawItems }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRawHistory: () => ({ mutate: vi.fn(), isPending: false }),
}));

const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [
    { id: "ui", grid: { cols: 2, rows: 2 }, canvas: "square", components: [] },
    { id: "nen", grid: { cols: 1, rows: 1 }, orient: "landscape", components: [] },
  ],
} as never;

/**
 * SỐ ĐO THẬT của lượt `r-0021` trong `test-vcb-d6fd` — chép nguyên từ
 * `runs/r-0021/artifacts/chinh-ui.geometry.json`. Bốn ô trên lưới 2×2 của một tấm
 * vuông 1254², hai ô đầu bị chấm «cần vẽ lại».
 * Dùng số thật chứ không bịa: ca này khoá phép DỜI TOẠ ĐỘ, và một bộ số tròn trịa
 * sẽ xanh y hệt cho cả một phép dời sai.
 */
const WRITTEN_AT = "2026-09-11T04:41:32.223Z";
const GEOMETRY_CELLS = [
  {
    file: "01-button", cell: 0, status: "regenerate", reasons: ["position", "size"],
    expected: [129.5, 249.5, 368.0, 128.0], actual: [38, 281, 587, 168],
    deviation: { edgesPx: { left: -91.5, top: 31.5, right: 127.5, bottom: 71.5 }, maxEdgePx: 31.5 },
  },
  {
    file: "02-avatar-frame", cell: 1, status: "regenerate", reasons: ["position"],
    expected: [143.0, 143.0, 341.0, 341.0], actual: [49, 134, 538, 461],
    deviation: { edgesPx: { left: -94.0, top: -9.0, right: 103.0, bottom: 111.0 }, maxEdgePx: 0 },
    /* CHỈ MỘT ô có hộp thân, và đó là chủ ý: engine chỉ đoán được thân ở ô nào món
       CÓ trang trí để mà tách. Lớp phủ phải vẽ được ô ấy mà không bịa ra ba ô kia. */
    core_guess: { box: [68, 90, 491, 491], coverage: 0.456 },
  },
  {
    file: "03-progress", cell: 2, status: "ok", reasons: [],
    expected: [144.5, 278.0, 338.0, 71.0], actual: [34, 236, 575, 124],
    deviation: { edgesPx: { left: -110.5, top: -42.0, right: 126.5, bottom: 11.0 }, maxEdgePx: 0 },
  },
  {
    file: "04-progress-fill", cell: 3, status: "ok", reasons: [],
    expected: [91.0, 280.0, 445.0, 67.0], actual: [54, 260, 527, 77],
    deviation: { edgesPx: { left: -37.0, top: -20.0, right: 45.0, bottom: -10.0 }, maxEdgePx: 10.0 },
  },
];

/** Một lượt chạy có số đo, đúng hình dạng `#33` trả về. */
function runWithGeometry(id = "r-0021", writtenAt: string | null = WRITTEN_AT) {
  return {
    id, status: "done",
    jobs: [{
      job: "chinh-ui", status: "ok",
      artifact: {
        path: `runs/${id}/artifacts/chinh-ui.png`,
        ...(writtenAt === null ? {} : { writtenAt }),
        validation: { ok: false, job: "chinh-ui", sheet: "ui", cells: GEOMETRY_CELLS },
      },
    }],
  };
}

/** Bản «đang dùng» của `#39` — mốc của nó phải KHỚP mốc ghi ảnh của lượt. */
const currentRaw = (at: string = WRITTEN_AT) => [{ id: "current", at, bytes: 10, current: true }];

const { SheetResultPanel } = await import("../SheetResultPanel");
const { useUiStore } = await import("@/lib/store");

function cell(file: string, sheet: string, cellIndex: number, over: Partial<KitFile> = {}): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 512, h: 341, bytes: 100, sheet, cellIndex, ...over,
  });
}

const mount = (props: Partial<React.ComponentProps<typeof SheetResultPanel>> = {}) =>
  render(<SheetResultPanel projectId="p1" sheetId="ui" job="chinh-ui" {...props} />);

beforeEach(() => {
  asked.length = 0;
  docCalls.length = 0;
  packCalls.length = 0;
  boardCalls.length = 0;
  packEmpty = false;
  boardOutcome = "clipboard";
  kitLoading = false;
  jobStates = { "chinh-ui": "ok", "chinh-nen": "ok" };
  revealMutate.mockReset();
  rawItems = [];
  runItems = [];
  localStorage.clear();
  useUiStore.setState({ sheetOverlay: false });
  kitFiles = [
    cell("tight/01-btn-pill", "ui", 0),
    cell("01-btn-pill", "ui", 0),
    cell("tight/02-chip", "ui", 1),
    cell("tight/25-bg-home", "nen", 0),
  ];
});
afterEach(cleanup);

describe("hai tab của panel kết quả", () => {
  it("có ĐÚNG hai tab: Ảnh gốc · Đã crop", () => {
    mount();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toContain("Ảnh gốc");
    expect(tabs[1]).toContain("Đã crop");
  });

  it("tab «Khung xương» ĐÃ BỊ BỎ — không còn đường nào mở nó ra", () => {
    const { container } = mount();
    expect(screen.queryByRole("tab", { name: /Khung xương/ })).toBeNull();
    /* Không chỉ mất cái nút: SVG khung xương cũng không được mount ở đâu, kể cả
       trong một tabpanel đang ẩn. Một component vẫn dựng mà chỉ bị `hidden` là
       một component vẫn tốn máy và vẫn quay lại được bằng một dòng CSS. */
    expect(container.querySelector("svg[role='img']")).toBeNull();
    expect(screen.queryByRole("button", { name: /khung an toàn/i })).toBeNull();
  });

  it("mặc định đứng ở «Ảnh gốc» — vì sheet.image về trước sheet.ready", () => {
    mount();
    expect(screen.getByRole("tab", { name: /Ảnh gốc/ }).getAttribute("aria-selected")).toBe("true");
    expect(asked.some((a) => a.path === "raw/chinh-ui.png")).toBe(true);
  });

  it("có runId ⇒ đọc artifact BẤT BIẾN của lượt đó, không đọc raw/", () => {
    mount({ runId: "r-9" });
    expect(asked.map((a) => a.path)).toContain("runs/r-9/artifacts/chinh-ui.png");
    expect(asked.map((a) => a.path)).not.toContain("raw/chinh-ui.png");
  });

  it("artifactPath do sheet.image báo THẮNG đường tự suy", () => {
    mount({ artifactPath: "raw/chinh-ui-v2.png" });
    expect(asked.map((a) => a.path)).toContain("raw/chinh-ui-v2.png");
  });

  it("hàng nút có Copy từng ô · Copy ảnh gốc · Tải PNG · Mở thư mục", () => {
    mount();
    expect(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy ảnh gốc sang Figma/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tải PNG/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mở thư mục dự án/ }));
    expect(revealMutate).toHaveBeenCalledTimes(1);
  });
});

/**
 * ══ NÚT CHÍNH = TỪNG Ô CỦA ĐÚNG TẤM NÀY ════════════════════════════════════
 *
 * Bệnh đang chữa (chủ sản phẩm báo): nút Figma của panel dán NGUYÊN TẤM THÔ, nên
 * designer nhận về một ảnh chữ nhật phải cắt lại bằng tay. Ba thứ khoá ở đây đều
 * là thứ hỏng lặng lẽ: sai danh sách ô (lẫn ô tấm khác), sai số trên nhãn, và
 * nút bấm được lúc chưa có ô nào.
 */
describe("nút «Copy N ô sang Figma»", () => {
  const openCut = () => fireEvent.mouseDown(screen.getByRole("tab", { name: /Đã crop/ }));

  it("đưa cho đường copy ĐÚNG ô của tấm này — không lẫn ô tấm khác", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ }));
    expect(await screen.findByRole("button", { name: /Đã copy 2 ô/ })).toBeTruthy();
    expect(docCalls).toHaveLength(1);
    const names = (docCalls[0] ?? []).map((c) => c.file.file);
    expect(names).toEqual(["tight/01-btn-pill", "tight/02-chip"]);
    expect(names.join("|")).not.toContain("25-bg-home");
  });

  it("tấm khác ⇒ nhãn đếm số ô của chính nó", () => {
    mount({ sheetId: "nen" });
    expect(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ })).toBeTruthy();
  });

  it("chưa cắt ra ô nào ⇒ nút vô hiệu và nói «chờ cắt», không hứa suông", () => {
    kitFiles = [];
    mount({ cutting: true });
    const btn = screen.getByRole("button", { name: /chờ cắt/ });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(btn);
    expect(docCalls).toHaveLength(0);
    expect(boardCalls).toHaveLength(0);
  });

  /* Đường lùi PHẢI nhận cùng danh sách ô: tệ nhất người dùng cũng còn bảng các ô đã
     cắt, không bao giờ tụt về nguyên tấm thô — đó chính là lỗi đang chữa. */
  it("dựng khung hỏng ⇒ rơi về bảng ảnh phẳng, VẪN đúng ô của tấm này", async () => {
    packEmpty = true;
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ }));
    expect(await screen.findByRole("button", { name: /Đã copy 2 ô/ })).toBeTruthy();
    expect(docCalls).toHaveLength(0);
    expect(boardCalls).toHaveLength(1);
    expect((boardCalls[0]?.files ?? []).map((f) => f.file)).toEqual(["tight/01-btn-pill", "tight/02-chip"]);
  });

  it("bộ nhớ tạm từ chối ⇒ KHÔNG khoe «đã copy», chỉ báo đã tải file về", async () => {
    packEmpty = true;
    boardOutcome = "download";
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ }));
    await screen.findByRole("button", { name: /Copy 2 ô sang Figma/ });
    expect(boardCalls).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Đã copy/ })).toBeNull();
  });

  /**
   * ══ TỈ LỆ ĐI THEO TỪNG Ô, VÀ NÓ PHẢI TỚI ĐƯỢC CẢ HAI ĐƯỜNG ═════════════════
   *
   * Máy vẽ luôn vẽ to hết ô cho nét, nên ô nào cũng lố cỡ đầu ra một kiểu khác
   * nhau. Panel không tự tính lại số nào — nó chỉ phải ĐƯA hàm tỉ lệ xuống đúng
   * hai chỗ dùng (dựng khung, và bảng ảnh phẳng đường lùi). Quên một trong hai là
   * bấm cùng một nút mà ra hai bố cục khác nhau tuỳ hôm đó encoder có chạy không.
   */
  describe("tỉ lệ co theo từng ô", () => {
    /**
     * BA CA DƯỚI ĐÂY ĐO NHÁNH «hộp hứa được chứng thực» — nhánh mà nấc TỰ ĐỘNG
     * chọn khi máy vẽ ngoan. Từ lượt có nút «Khớp khung», nấc mặc định của một thẻ
     * là «Cả món vừa khung» (nấc an toàn), nên ca nào đo nhánh kia phải NÓI RA nấc
     * mình đang đo thay vì mượn mặc định — mượn mặc định là để một cú đổi mặc định
     * ngày mai âm thầm đổi nghĩa cả ba ca.
     */
    const mountAuto = (props: Partial<React.ComponentProps<typeof SheetResultPanel>> = {}) =>
      mount({ fit: { mode: "auto", scale: 100 }, ...props });

    /**
     * Ô «01-button» của `test-e0d4`: cỡ đầu ra 112×39, hộp đã hứa 476×166 (engine xin
     * model vẽ to `drawScale` = 4,25 lần) ⇒ co còn 39/166 ≈ 23%. `safe` ở đây là lõi
     * ĐO ĐƯỢC 556×196 — tràn ra ngoài hộp hứa 40px hai bên và 15px trên dưới, tức
     * TRONG dung sai, nên hộp hứa được chứng thực và làm lõi (xem `contractFramed`).
     */
    const S_FIT = 39 / 166;
    const fitCell = () => cell("tight/01-button", "ui", 0, {
      w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
      safe: [35, 215, 556, 196], contractSafe: [75, 230, 476, 166], outSize: [112, 39],
    });

    /**
     * Ô THẬT của lượt r-0021 (`test-vcb-d6fd`): máy vẽ tràn 91px ra ngoài hộp hứa
     * rộng 368 (dung sai 36,8) ⇒ hộp hứa là hư cấu, cả món bị co vào khung 245×85 và
     * panel PHẢI nói ra — thân nút trong khung sẽ nhỏ hơn cỡ người dùng vừa chọn.
     */
    const wholeCell = () => cell("tight/01-button", "ui", 0, {
      w: 592, h: 176, canvas: [627, 627], content: [592, 176], contentAt: [34, 274],
      safe: [38, 281, 587, 168], contractSafe: [129, 249, 368, 128], outSize: [245, 85],
    });

    it("đưa xuống đường dựng khung một HÀM tỉ lệ, không phải một số chung", async () => {
      kitFiles = [fitCell(), cell("tight/02-chip", "ui", 1)];
      mountAuto();
      fireEvent.click(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ }));
      await screen.findByRole("button", { name: /Đã copy 2 ô/ });
      expect(packCalls).toHaveLength(1);
      const scale = packCalls[0]?.scale;
      expect(typeof scale).toBe("function");
      const fn = scale as (f: KitFile) => number | undefined;
      expect(fn(packCalls[0]!.files[0]!)).toBeCloseTo(S_FIT, 6);
      /* Ô không có số đo nào ⇒ 1, KHÔNG phải quy ước 50% của màn kit cũ. */
      expect(fn(packCalls[0]!.files[1]!)).toBe(1);
    });

    it("đường lùi nhận CÙNG hàm tỉ lệ ⇒ hai đường không thể co khác nhau", async () => {
      packEmpty = true;
      kitFiles = [fitCell()];
      mountAuto();
      fireEvent.click(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }));
      await screen.findByRole("button", { name: /Đã copy 1 ô/ });
      expect(boardCalls).toHaveLength(1);
      const fn = boardCalls[0]?.scaleOf;
      expect(typeof fn).toBe("function");
      expect(fn?.(boardCalls[0]!.files[0] as KitFile)).toBeCloseTo(S_FIT, 6);
    });

    it("nói ra phép co ngay trên nút: cỡ xuất + phần trăm", () => {
      kitFiles = [fitCell()];
      mountAuto();
      const title = screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }).getAttribute("title") ?? "";
      expect(title).toContain("cỡ xuất 112×39");
      expect(title).toContain("23%");
    });

    it("ô phải co CẢ MÓN ⇒ nói thẳng tên ô và lý do, không nuốt", () => {
      kitFiles = [wholeCell()];
      mount();
      const title = screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }).getAttribute("title") ?? "";
      expect(title).toContain("01-button: máy vẽ to hơn hộp đã hứa, đã co cả món vào khung");
      /* Vẫn phải kèm tỉ lệ: hai câu trả lời hai câu hỏi khác nhau (co bao nhiêu, và
         vì sao thân món không lấp kín khung). */
      expect(title).toContain("cỡ xuất 245×85");
    });

    it("ô được chứng thực hộp hứa ⇒ KHÔNG có câu «co cả món»", () => {
      kitFiles = [fitCell()];
      mount();
      const title = screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }).getAttribute("title") ?? "";
      expect(title).not.toContain("co cả món");
    });

    it("không ô nào lệch cỡ ⇒ KHÔNG bịa thêm câu «đã co»", () => {
      mount();
      const title = screen.getByRole("button", { name: /Copy 2 ô sang Figma/ }).getAttribute("title") ?? "";
      expect(title).not.toContain("%");
    });
  });

  it("nút phụ «Copy ảnh gốc» CHỈ sống ở tab «Ảnh gốc»", () => {
    mount();
    expect(screen.getByRole("button", { name: /Copy ảnh gốc sang Figma/ })).toBeTruthy();
    openCut();
    expect(screen.queryByRole("button", { name: /Copy ảnh gốc sang Figma/ })).toBeNull();
    /* Nút chính thì ở lại: tab «Đã crop» là chỗ nó có nghĩa nhất. */
    expect(screen.getByRole("button", { name: /Copy 2 ô sang Figma/ })).toBeTruthy();
  });
});

describe("tab «Đã crop» — chỉ ô của ĐÚNG tấm này", () => {
  const openCut = () => fireEvent.mouseDown(screen.getByRole("tab", { name: /Đã crop/ }));

  it("bỏ ô của tấm khác, và mỗi ô đúng một lần (bản tight/ thắng)", () => {
    mount();
    openCut();
    const names = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names).toHaveLength(2);
    expect(names.join("|")).toContain("01-btn-pill");
    expect(names.join("|")).toContain("02-chip");
    expect(names.join("|")).not.toContain("25-bg-home");
  });

  it("số trên nhãn tab đếm đúng số ô của tấm", () => {
    mount();
    expect(screen.getByRole("tab", { name: /Đã crop/ }).textContent).toContain("(2)");
  });

  it("tấm khác ⇒ lưới khác", () => {
    mount({ sheetId: "nen" });
    openCut();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")[0]?.textContent).toContain("25-bg-home");
  });

  it("chưa cắt xong ⇒ nói «đang cắt», KHÔNG nói «chưa có ô nào»", () => {
    kitFiles = [];
    mount({ cutting: true });
    openCut();
    expect(screen.getByText(/Đang cắt…/)).toBeTruthy();
  });

  it("cắt xong mà không ra ô nào ⇒ nói thẳng là chưa có", () => {
    kitFiles = [];
    mount();
    openCut();
    expect(screen.getByText(/Chưa có ô nào được cắt/)).toBeTruthy();
  });
});

describe("không còn ĐƯỜNG NÀO tới ảnh khung xương", () => {
  /* `skeleton/<id>.png` là thư mục mà agent vẫn mở (`routes/files.mjs`), nên một
     lượt xin nhầm sẽ THÀNH CÔNG và không ai thấy gì bất thường — trừ việc panel
     tải một ảnh mà máy vẽ không còn dùng. Ca này canh đúng lượt xin ấy. */
  it("panel KHÔNG xin một byte nào từ thư mục skeleton/", () => {
    mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Đã crop/ }));
    expect(asked.every((a) => !a.path.startsWith("skeleton/"))).toBe(true);
  });

  it("tấm lạ ⇒ vẫn dựng được panel, không rơi vào nhánh «chưa tìm thấy tấm»", () => {
    /* Trước đây panel tra contract để lấy sheet mà vẽ khung xương, nên một
       `sheetId` không có trong contract cho ra một câu lỗi. Nay panel chỉ cần
       `sheetId` để LỌC ô đã cắt: tấm lạ = không có ô nào, không phải một lỗi. */
    mount({ sheetId: "khong-co" });
    expect(screen.queryByText(/Chưa tìm thấy tấm/)).toBeNull();
    expect(screen.getByRole("tab", { name: /Ảnh gốc/ })).toBeTruthy();
  });
});

describe("ô ảnh gốc khi CHƯA CÓ FILE — ba câu trả lời cho ba hoàn cảnh", () => {
  /* Hiện trường 10/09/2026: thẻ đang «Đang vẽ 0/1» mà ô ảnh đỏ "Thiếu file · Thử
     lại". Thiếu file lúc đang vẽ là đương nhiên, và không có gì để thử lại. */
  it("chưa vẽ lần nào ⇒ khối mời bấm Vẽ, không xin ảnh", () => {
    jobStates = {};
    mount();
    expect(screen.getByText("Chưa vẽ tấm này")).toBeTruthy();
    expect(asked.some((a) => a.path.startsWith("raw/"))).toBe(false);
  });

  it("đang vẽ mà lượt chưa báo ảnh ⇒ khung «Đang vẽ», KHÔNG xin ảnh (nên không có «Thiếu file»)", () => {
    jobStates = {};
    mount({ busy: true });
    expect(screen.getByRole("status").textContent).toContain("Đang vẽ tấm này");
    expect(screen.queryByText("Chưa vẽ tấm này")).toBeNull();
    expect(asked.some((a) => a.path.startsWith("raw/"))).toBe(false);
  });

  it("đang vẽ và lượt ĐÃ báo ảnh ⇒ hiện ảnh đó, thôi khung chờ", () => {
    mount({ busy: true, artifactPath: "runs/r1/chinh-ui.png" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(asked.some((a) => a.path === "runs/r1/chinh-ui.png")).toBe(true);
  });
});

/**
 * ══ LỚP PHỦ SOI Ô ══════════════════════════════════════════════════════════
 *
 * Chủ sản phẩm hỏi «món này lệch — do máy vẽ hay do thông số?». Lớp phủ trả lời
 * bằng cách vẽ ra hai hình vốn vô hình: hộp vùng an toàn prompt đã hứa, và hộp
 * thân món máy vẽ ra. Bốn thứ khoá ở đây đều hỏng LẶNG LẼ nếu không canh:
 *  ① mặc định phải TẮT — bật sẵn là đổ một rừng đường kẻ lên ảnh của mọi người;
 *  ② số hộp phải đúng số ô, và toạ độ phải ĐÃ DỜI ra hệ của cả tấm (hộp của ô
 *    thứ tư mà vẫn nằm ở góc trên-trái là một lớp phủ nói dối);
 *  ③ thiếu số đo ⇒ nút xám kèm lý do, KHÔNG vẽ lưới của một lượt khác;
 *  ④ ảnh đã đổi sang bản cũ ⇒ số đo của lượt mới nhất KHÔNG còn thuộc về nó.
 */
describe("lớp phủ soi ô trên ảnh gốc", () => {
  const toggle = () => screen.getByRole("button", { name: /Lưới ô/ });

  it("mặc định TẮT — có nút, chưa có lớp phủ nào", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const { container } = mount();
    expect(toggle().hasAttribute("disabled")).toBe(false);
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[data-testid='sheet-overlay']")).toBeNull();
  });

  it("bật ⇒ mỗi ô một hộp đã hứa + một hộp đo được, kèm chú giải một dòng", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const { container } = mount();
    fireEvent.click(toggle());
    expect(container.querySelectorAll("[data-testid='overlay-cell']")).toHaveLength(4);
    expect(container.querySelectorAll("[data-testid='overlay-expected']")).toHaveLength(4);
    expect(container.querySelectorAll("[data-testid='overlay-actual']")).toHaveLength(4);
    expect(screen.getByText(
      /Nét đứt: hộp prompt đã hứa · nét liền: hộp máy vẽ ra · nét chấm: thân máy đoán\./,
    )).toBeTruthy();
  });

  it("hộp THÂN máy đoán vẽ bằng nét chấm, và chỉ ở ô nào engine đoán được", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const { container } = mount();
    fireEvent.click(toggle());
    const cores = container.querySelectorAll("[data-testid='overlay-core']");
    expect(cores).toHaveLength(1);
    /* Ô số 1 nằm ở cột 2 của tấm vuông 1254² ⇒ hộp trong ô [68, 90] dời thành (695, 90). */
    expect(cores[0]?.getAttribute("x")).toBe("695");
    expect(cores[0]?.getAttribute("y")).toBe("90");
    expect(cores[0]?.getAttribute("width")).toBe("491");
    /* Ba nét phải phân biệt được bằng KIỂU nét, không chỉ bằng màu. */
    const kieu = (el: Element | null | undefined) =>
      (el as HTMLElement | null)?.style.strokeDasharray ?? "";
    expect(kieu(cores[0])).not.toBe(kieu(container.querySelector("[data-testid='overlay-expected']")));
    expect(kieu(container.querySelector("[data-testid='overlay-actual']"))).toBe("");
  });

  it("toạ độ ĐÃ DỜI ra hệ của cả tấm — ô thứ tư không nằm ở góc trên-trái", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const { container } = mount();
    fireEvent.click(toggle());
    const svg = container.querySelector("[data-testid='sheet-overlay']");
    /* Tấm vuông 1254² chia 2×2 ⇒ ô số 3 bắt đầu ở (627, 627). Hộp đã hứa của nó là
       [91, 280, …] TRONG ô, nên trên tấm phải là (718, 907). */
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1254 1254");
    const last = container.querySelectorAll("[data-testid='overlay-expected']")[3];
    expect(last?.getAttribute("x")).toBe("718");
    expect(last?.getAttribute("y")).toBe("907");
    expect(last?.getAttribute("width")).toBe("445");
  });

  it("nhãn góc ô nói tên món + cạnh lệch xa nhất, và ô cần vẽ lại thì tô đỏ", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const { container } = mount();
    fireEvent.click(toggle());
    const texts = [...container.querySelectorAll("text")].map((t) => t.textContent ?? "");
    /* Cạnh xa nhất của ô 0 là 127,5px (mép phải) ⇒ làm tròn 128. */
    expect(texts[0]).toBe("01-button · lệch 128px");
    expect(texts[3]).toBe("04-progress-fill · lệch 45px");
    const hot = container.querySelectorAll("text")[0] as SVGTextElement;
    const cool = container.querySelectorAll("text")[3] as SVGTextElement;
    expect(hot.getAttribute("style") ?? "").toContain("--kg-danger");
    expect(cool.getAttribute("style") ?? "").not.toContain("--kg-danger");
  });

  it("không lượt nào có số đo ⇒ nút XÁM kèm lý do, và không vẽ gì dù đang bật", () => {
    useUiStore.setState({ sheetOverlay: true });
    runItems = [];
    rawItems = currentRaw();
    const { container } = mount();
    expect(toggle().hasAttribute("disabled")).toBe(true);
    expect(toggle().getAttribute("title")).toBe("Bản này không có số đo");
    expect(container.querySelector("[data-testid='sheet-overlay']")).toBeNull();
    expect(screen.queryByText(/Nét đứt/)).toBeNull();
  });

  it("đã đổi sang một bản ảnh khác ⇒ số đo của lượt cũ KHÔNG được đem ra vẽ", () => {
    useUiStore.setState({ sheetOverlay: true });
    runItems = [runWithGeometry()];
    /* Chọn một bản ở thanh phiên bản = ghi đè ảnh gốc ⇒ mốc ghi đổi. */
    rawItems = currentRaw("2026-09-14T06:30:35.370Z");
    const { container } = mount();
    expect(toggle().hasAttribute("disabled")).toBe(true);
    expect(container.querySelector("[data-testid='sheet-overlay']")).toBeNull();
  });

  it("xem ảnh BẤT BIẾN của một lượt ⇒ lấy số đo của đúng lượt đó, không cần so mốc", () => {
    useUiStore.setState({ sheetOverlay: true });
    runItems = [runWithGeometry("r-0030", null), runWithGeometry("r-0021")];
    rawItems = currentRaw("2026-09-14T06:30:35.370Z");
    const { container } = mount({ runId: "r-0021" });
    expect(container.querySelectorAll("[data-testid='overlay-cell']")).toHaveLength(4);
  });

  it("trạng thái bật/tắt SỐNG QUA lần mở sau — nó là thói quen, không phải state của một lần xem", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    const first = mount();
    fireEvent.click(toggle());
    expect(first.container.querySelector("[data-testid='sheet-overlay']")).toBeTruthy();
    cleanup();
    const again = mount();
    expect(again.container.querySelector("[data-testid='sheet-overlay']")).toBeTruthy();
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });

  it("tab «Đã crop» không bày nút này — ở đó không có tấm nào để phủ", () => {
    runItems = [runWithGeometry()];
    rawItems = currentRaw();
    mount();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Đã crop/ }));
    expect(screen.queryByRole("button", { name: /Lưới ô/ })).toBeNull();
  });
});

/**
 * ══ NÚT «VẼ LẠI TẤM NÀY» ═══════════════════════════════════════════════════
 *
 * Từ lượt vân tay, nút Vẽ ở đầu thẻ GIỮ NGUYÊN tấm nào mô tả chưa đổi. Nên khi
 * người dùng nhìn một bức ảnh xấu mà mô tả vẫn đúng ý, đây là đường DUY NHẤT
 * còn lại để xin một bức khác — mất nó là tính năng tiết kiệm lượt tạo biến
 * thành một cái khoá không mở được, và không có hộp đỏ nào báo.
 */
describe("nút «Vẽ lại tấm này»", () => {
  it("không ai đưa đường vẽ lại ⇒ KHÔNG bày nút (vỏ lab không tiêu được lượt tạo)", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Vẽ lại tấm này/ })).toBeNull();
  });

  it("có đường vẽ lại ⇒ bấm là gọi ĐÚNG một lần, cho đúng tấm đang xem", () => {
    const onRedraw = vi.fn();
    mount({ onRedraw });
    fireEvent.click(screen.getByRole("button", { name: /Vẽ lại tấm này/ }));
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it("tấm đang chạy ⇒ nút XÁM: bấm thêm lần nữa chỉ xếp thêm một lượt tiêu tiền", () => {
    const onRedraw = vi.fn();
    mount({ onRedraw, busy: true });
    const btn = screen.getByRole("button", { name: /Vẽ lại tấm này/ });
    expect(btn.hasAttribute("disabled")).toBe(true);
    fireEvent.click(btn);
    expect(onRedraw).not.toHaveBeenCalled();
  });
});

/**
 * ══ NÚT «KHỚP KHUNG» — QUYỀN CHỌN PHẢI TỚI ĐƯỢC PHÉP TÍNH ══════════════════
 *
 * Chủ sản phẩm dán tấm ra Figma rồi hỏi cách chỉnh khung và cỡ ảnh bên trong.
 * Một nút đổi được mà phép tính vẫn chạy theo nấc cũ thì tệ hơn không có nút: nó
 * hứa một quyền không tồn tại, và người dùng sẽ đổ cho máy vẽ. Nên ca nặng nhất ở
 * đây KHÔNG phải "nút có hiện không", mà là "đối số xuống tầng dựng khung có đổi
 * theo không".
 */
const feedback = await import("@/features/projects/lib/feedback");

describe("«Khớp khung» — nấc của thẻ, và nó đi thẳng vào phép dựng khung", () => {
  /** Máy vẽ NGOAN: lõi đo được chỉ tràn trong dung sai ⇒ hai nấc tay ra hai số. */
  const ngoan = () => cell("tight/01-button", "ui", 0, {
    w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
    safe: [35, 215, 556, 196], contractSafe: [75, 230, 476, 166], outSize: [112, 39],
  });
  /** Thân lấp khung: cạnh chặt là chiều cao của hộp đã hứa. */
  const S_THAN = 39 / 166;
  /** Cả món vừa khung: cạnh chặt là chiều cao của hộp đo được. */
  const S_CA_MON = Math.min(112 / 556, 39 / 196);

  const onFitChange = vi.fn();
  beforeEach(() => {
    onFitChange.mockReset();
    vi.mocked(feedback.toastSuccess).mockClear();
    kitFiles = [ngoan()];
  });

  const scaleOfFirstCopy = () => {
    const fn = packCalls[0]?.scale as (f: KitFile) => number | undefined;
    return fn(packCalls[0]!.files[0]!);
  };

  it("bày NẤC ĐANG DÙNG ngay cạnh nút copy, không giấu trong tooltip", () => {
    mount({ fit: { mode: "body", scale: 120 }, onFitChange });
    expect(screen.getByRole("button", { name: /Khớp khung: Thân lấp khung · 120%/ })).toBeTruthy();
  });

  it("vắng đường ghi ⇒ KHÔNG bày nút đổi, vì đổi xong không lưu được đi đâu", () => {
    mount({ fit: { mode: "whole", scale: 100 } });
    expect(screen.queryByRole("button", { name: /Khớp khung/ })).toBeNull();
  });

  it("ba nấc bày ra kèm câu nói hệ quả, không bắt người dùng đoán", () => {
    mount({ fit: { mode: "whole", scale: 100 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Khớp khung/ }));
    const nac = screen.getAllByRole("radio");
    expect(nac.map((n) => n.textContent ?? "")).toHaveLength(3);
    expect(nac[0]?.textContent).toContain("Cả món vừa khung");
    expect(nac[0]?.getAttribute("aria-checked")).toBe("true");
    expect(nac[1]?.textContent).toContain("Thân lấp khung");
    expect(nac[2]?.textContent).toContain("Tự động");
    /* Mỗi nấc phải nói CÁI GIÁ của nó, không chỉ cái lợi. */
    expect(nac[0]?.textContent).toContain("không lấp kín khung");
    expect(nac[1]?.textContent).toContain("tràn ra ngoài khung");
  });

  it("chọn nấc khác ⇒ báo RA NGOÀI (thẻ giữ), panel không tự nhớ", () => {
    mount({ fit: { mode: "whole", scale: 100 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Khớp khung/ }));
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onFitChange).toHaveBeenCalledWith({ mode: "body", scale: 100 });
    /* Mặt nút KHÔNG tự đổi: nấc do thẻ giữ, panel chỉ vẽ lại khi thẻ đưa xuống
       giá trị mới. Tự đổi ở đây là hai nguồn sự thật cho cùng một nấc. */
    expect(screen.getByRole("button", { name: /Khớp khung: Cả món vừa khung · 100%/ })).toBeTruthy();
  });

  it("tỉ lệ thêm đi từng bước 5 và KHÔNG ra khỏi khoảng 50–150", () => {
    mount({ fit: { mode: "whole", scale: 100 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Khớp khung/ }));
    fireEvent.click(screen.getByRole("button", { name: /Phóng ảnh to lên/ }));
    expect(onFitChange).toHaveBeenCalledWith({ mode: "whole", scale: 105 });
    fireEvent.click(screen.getByRole("button", { name: /Thu ảnh nhỏ lại/ }));
    expect(onFitChange).toHaveBeenLastCalledWith({ mode: "whole", scale: 95 });
    cleanup();

    mount({ fit: { mode: "whole", scale: 150 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Khớp khung/ }));
    expect(screen.getByRole("button", { name: /Phóng ảnh to lên/ }).hasAttribute("disabled")).toBe(true);
  });

  it("«thân lấp khung» và «cả món vừa khung» ĐƯA XUỐNG hai tỉ lệ khác nhau", async () => {
    mount({ fit: { mode: "body", scale: 100 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }));
    await screen.findByRole("button", { name: /Đã copy 1 ô/ });
    expect(scaleOfFirstCopy()).toBeCloseTo(S_THAN, 6);
    cleanup();
    packCalls.length = 0;

    mount({ fit: { mode: "whole", scale: 100 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }));
    await screen.findByRole("button", { name: /Đã copy 1 ô/ });
    expect(scaleOfFirstCopy()).toBeCloseTo(S_CA_MON, 6);
  });

  it("tỉ lệ thêm 120% ⇒ ẢNH to thêm 1,2 lần, KHUNG vẫn đúng cỡ đã đặt", async () => {
    mount({ fit: { mode: "whole", scale: 120 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }));
    await screen.findByRole("button", { name: /Đã copy 1 ô/ });
    const s = scaleOfFirstCopy()!;
    expect(s).toBeCloseTo(S_CA_MON * 1.2, 6);
    /* Khung = hộp ảo × tỉ lệ xuất; nó phải ra đúng 112×39 — con số người dùng đặt. */
    const box = packCalls[0]!.files[0]!.safe as number[];
    expect(box[2]! * s).toBeCloseTo(112, 6);
    expect(box[3]! * s).toBeCloseTo(39, 6);
  });

  it("câu báo sau khi copy NÓI RA nấc đang dùng", async () => {
    mount({ fit: { mode: "body", scale: 115 }, onFitChange });
    fireEvent.click(screen.getByRole("button", { name: /Copy 1 ô sang Figma/ }));
    await screen.findByRole("button", { name: /Đã copy 1 ô/ });
    const noiDung = vi.mocked(feedback.toastSuccess).mock.calls[0]?.[1] ?? "";
    expect(noiDung).toContain("Cách khớp: Thân lấp khung · 115%");
  });
});
