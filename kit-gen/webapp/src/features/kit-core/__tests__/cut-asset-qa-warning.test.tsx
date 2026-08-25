/* @vitest-environment jsdom */
/**
 * HỒI QUY QA-BLIND §1 (P0) — TAB "ẢNH THẬT" PHẢI NÓI RA CỜ QA.
 *
 * Ba người test mù độc lập cùng dừng lại ở một chỗ: engine tự chấm `validation.ok:false`
 * (`sizeDeviation.flagged`, lệch tới 70px trên ngưỡng 15) mà tab MẶC ĐỊNH của màn kết
 * quả không có một dấu hiệu nào. Cảnh báo duy nhất nằm ở tab phụ "Ảnh gốc" — nơi phải
 * tự bấm sang mới thấy — nên đường mặc định của người dùng là: nhìn ảnh sạch đẹp, bấm
 * [Tải .zip] / [Copy sang Figma], rồi mang một asset lệch khung ra production.
 *
 * Tab này CHỈ báo, không mọc thêm nút vẽ lại: đường tạo lại đã có đúng một chỗ và nó
 * tiêu quota. Ca cuối khoá đúng điều đó.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { kitFileSchema, type KitFile } from "@/lib/types";
import { CutAssetGrid, deviationOf, flaggedAssets, cutAssets } from "../components/CutAssetGrid";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

vi.mock("@/features/kit/lib/image-source", () => {
  const handle = () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} });
  return { loadImage: handle, loadFull: handle, loadThumb: handle, filePath: () => "/x" };
});
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));
vi.mock("@/lib/hooks", () => ({ useKit: vi.fn() }));

const { useKit } = await import("@/lib/hooks");
const PID = "kit-qa";

/** Ô đã cắt như `agent/routes/files.mjs` trả về, kèm sổ đo của `slice.py`. */
function kitFile(file: string, dev: { maxEdgePx: number | null; flagged: boolean } | null): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 520, h: 218, bytes: 100,
    sheet: "ui", cellIndex: null, empty: false,
    contractSafe: [84, 153, 599, 204],
    sizeDeviation: dev ? { ...dev, threshold: 15, edgesPx: null } : null,
  });
}

const BAD = kitFile("tight/01-btn-pill-red", { maxEdgePx: 70, flagged: true });
const OK = kitFile("tight/04-btn-circle", { maxEdgePx: 4, flagged: false });
const OLD = kitFile("tight/09-popup-panel-short", null);

const mountKit = (files: KitFile[], flaggedCount?: number) => {
  vi.mocked(useKit).mockReturnValue({
    data: {
      variant: "chinh", files, sheets: {}, cutAt: null,
      qa: flaggedCount === undefined ? undefined : { sizeDeviation: { flaggedCount, flagged: true, flaggedAssets: [] } },
    },
    isLoading: false,
  } as never);
  return render(<CutAssetGrid projectId={PID} contract={null} />);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => vi.mocked(useKit).mockReset());

describe("① đọc cờ QA của từng ô", () => {
  it("ô bị gắn cờ ⇒ trả số cạnh lệch đã làm tròn + ngưỡng", () => {
    expect(deviationOf(cutAssets([BAD], null)[0]!)).toEqual({ maxEdgePx: 70, threshold: 15 });
  });

  it("ô đo được nhưng KHÔNG vượt ngưỡng ⇒ không cảnh báo (đo ≠ lỗi)", () => {
    expect(deviationOf(cutAssets([OK], null)[0]!)).toBeNull();
  });

  it("kit cắt bằng bản `slice.py` cũ (không có số đo) ⇒ im lặng, không đoán bừa", () => {
    expect(deviationOf(cutAssets([OLD], null)[0]!)).toBeNull();
  });

  it("chỉ đếm ô bị gắn cờ trong TẬP ĐANG HIỆN", () => {
    expect(flaggedAssets(cutAssets([BAD, OK, OLD], null)).map((a) => a.name)).toEqual(["01-btn-pill-red"]);
  });
});

describe("② tab «Ảnh thật» hiện cảnh báo ngay, không bắt sang tab phụ", () => {
  it("có ô lệch ⇒ dải cảnh báo đầu tab nói SỐ Ô, ĐỘ LỆCH và ĐI ĐÂU để vẽ lại", () => {
    mountKit([BAD, OK]);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("1 ảnh lệch bộ khung");
    expect(banner.textContent).toContain("70px");
    expect(banner.textContent).toContain("Ảnh gốc");
  });

  it("badge nằm trên ĐÚNG ô bị lệch, ô đạt vẫn hiện kích thước như thường", () => {
    mountKit([BAD, OK]);
    expect(screen.getByText(/Lệch bộ khung 70px/)).toBeTruthy();
    expect(screen.getAllByText(/Lệch bộ khung/)).toHaveLength(1);
    expect(screen.getByText("520×218")).toBeTruthy();
  });

  it("mọi ô đều đạt ⇒ KHÔNG có dải cảnh báo nào (không doạ suông)", () => {
    mountKit([OK, OLD]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/Lệch bộ khung/)).toBeNull();
  });

  /* Trang dự án lọc ảnh theo nhóm; ô bị gắn cờ ở nhóm khác không lọt vào khung nhìn.
     `manifest.qa.sizeDeviation.flaggedCount` là nơi DUY NHẤT biết tổng thật. */
  it("còn ô lệch ở nhóm khác ⇒ nói ra, không để người dùng tưởng đã xem hết chỗ hỏng", () => {
    mountKit([BAD, OK], 3);
    expect(screen.getByRole("status").textContent).toContain("còn 2 ô nữa ở nhóm khác");
  });

  it("khung nhìn đã thấy hết ô bị gắn cờ ⇒ không thêm câu thừa", () => {
    mountKit([BAD, OK], 1);
    expect(screen.getByRole("status").textContent).not.toContain("nhóm khác");
  });

  it("dải cảnh báo KHÔNG mọc thêm nút gen — đường tiêu quota vẫn chỉ có một", () => {
    mountKit([BAD]);
    const banner = screen.getByRole("status");
    expect(banner.querySelectorAll("button")).toHaveLength(0);
    expect(banner.textContent).toMatch(/tiêu lượt/);
  });
});
