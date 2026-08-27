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

  it("hàng nút có Copy Figma cả tấm · Tải PNG · Mở thư mục", () => {
    mount();
    expect(screen.getByRole("button", { name: /Copy cả tấm sang Figma/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tải PNG/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mở thư mục dự án/ }));
    expect(revealMutate).toHaveBeenCalledTimes(1);
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
