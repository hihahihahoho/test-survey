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
const boardCalls: Array<{ files: Array<{ file: string }>; variantLabel: string }> = [];
/** true ⇒ giả cảnh không ô nào dựng được khung ⇒ panel phải rơi về đường lùi. */
let packEmpty = false;
/** Kết cục của đường lùi: vào bộ nhớ tạm, hay chỉ tải được file về máy. */
let boardOutcome: "clipboard" | "download" = "clipboard";

vi.mock("@/features/kit/lib/figma-kit-doc", () => ({
  packKitDoc: (files: Array<{ file: string }>) => ({
    groups: packEmpty ? [] : [{
      category: "ui",
      label: "Giao diện",
      cells: files.map((f) => ({ file: f, name: f.file, group: "ui", spec: {}, left: 0, top: 0 })),
      bytes: 0,
    }],
    skipped: [],
    width: 2400,
    height: 100,
  }),
  cellsOf: (groups: Array<{ cells: unknown[] }>) => groups.flatMap((g) => g.cells),
  copyKitDoc: (cells: Array<{ file: { file: string } }>) => {
    docCalls.push(cells);
    return Promise.resolve({ html: "<i></i>", docs: cells.length, bytes: 10 });
  },
}));

vi.mock("@/features/kit/lib/figma-board", () => ({
  PHASE_LABEL: { 1: "Chuẩn bị danh sách", 2: "Tải ảnh", 3: "Ghép bảng", 4: "Đưa vào bộ nhớ tạm" },
  BoardCancelled: class BoardCancelled extends Error {},
  buildFigmaBoard: (opts: { files: Array<{ file: string }>; variantLabel: string }) => {
    boardCalls.push({ files: [...opts.files], variantLabel: opts.variantLabel });
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

vi.mock("@/lib/hooks", () => ({
  useContract: () => ({ data: { version: 1, contract: CONTRACT } }),
  useProject: () => ({ data: { id: "p1", name: "Dự án thử", state: { jobs: jobStates } } }),
  useKit: () => ({ data: { variant: "chinh", files: kitFiles }, isLoading: kitLoading }),
  useRevealProject: () => ({ mutate: revealMutate }),
  /* Thanh phiên bản dùng chung module hooks; ở đây cho nó im (chưa có lịch sử). */
  useRawHistory: () => ({ data: { items: [] }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: vi.fn(), isPending: false }),
}));

const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [
    { id: "ui", grid: { cols: 2, rows: 2 }, orient: "landscape", components: [] },
    { id: "nen", grid: { cols: 1, rows: 1 }, orient: "landscape", components: [] },
  ],
} as never;

const { SheetResultPanel } = await import("../SheetResultPanel");

function cell(file: string, sheet: string, cellIndex: number): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 512, h: 341, bytes: 100, sheet, cellIndex,
  });
}

const mount = (props: Partial<React.ComponentProps<typeof SheetResultPanel>> = {}) =>
  render(<SheetResultPanel projectId="p1" sheetId="ui" job="chinh-ui" {...props} />);

beforeEach(() => {
  asked.length = 0;
  docCalls.length = 0;
  boardCalls.length = 0;
  packEmpty = false;
  boardOutcome = "clipboard";
  kitLoading = false;
  jobStates = { "chinh-ui": "ok", "chinh-nen": "ok" };
  revealMutate.mockReset();
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
