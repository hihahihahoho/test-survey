/* @vitest-environment jsdom */
/**
 * TRANG "UI ELEMENTS" KHÔNG ĐƯỢC KÉO MASCOT SANG.
 *
 * Trang UI Elements và trang Mascot là hai trang anh em, và mascot ĐÃ có trang riêng.
 * Tab "Ảnh gốc" từ lâu đã tôn trọng chuyện đó bằng `exclude="mascot"` của
 * `RawSheetsPanel`; tab "Ảnh thật" thì trước bản này không hiện thành phẩm nên chưa
 * cần tới. Nay nó hiện, và nếu nó dùng `category="all"` trần thì mascot đổ sang cả hai
 * trang — hai lối vào cho cùng một thứ, đúng cái bẫy mà thanh "Ảnh thật | Skeleton" cũ
 * đã mắc một lần rồi.
 *
 * Ca cuối là ca ngược: `exclude` KHÔNG được lấn sang trang Mascot, nơi mascot chính là
 * nội dung. Một bộ lọc chỉ đúng khi cả hai chiều đều đúng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { kitFileSchema, type KitFile } from "@/lib/types";
import { CutAssetGrid } from "../components/CutAssetGrid";

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
const PID = "kit-ui-elements";

/** `categoryOfSheet` đọc TÊN SHEET, nên tên sheet là thứ quyết định ô thuộc trang nào. */
function kitFile(file: string, sheet: string): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 520, h: 218, bytes: 100,
    sheet, cellIndex: null, empty: false, contractSafe: null, sizeDeviation: null,
  });
}

const NUT = kitFile("tight/01-btn-pill", "ui");
const NEN = kitFile("tight/25-bg-home", "nen");
const DANG = kitFile("tight/28-pose-wave", "pose-idle");

/** Trả về CHỮ của cả lưới — ảnh còn đang tải nên tên ô là thứ đọc được chắc chắn. */
const mount = (props: Partial<React.ComponentProps<typeof CutAssetGrid>> = {}) => {
  vi.mocked(useKit).mockReturnValue({
    data: { variant: "chinh", files: [NUT, NEN, DANG], sheets: {}, cutAt: null },
    isLoading: false,
  } as never);
  return render(<CutAssetGrid projectId={PID} contract={null} {...props} />).container.textContent ?? "";
};

beforeEach(() => vi.mocked(useKit).mockReset());
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("bộ lọc `exclude` của lưới thành phẩm", () => {
  it("KHÔNG có exclude ⇒ hiện đủ cả ba, kể cả dáng mascot", () => {
    expect(mount()).toContain("28-pose-wave");
  });

  it("exclude=\"mascot\" ⇒ dáng mascot BIẾN MẤT, nút và nền ở lại", () => {
    const all = mount({ exclude: "mascot" });
    expect(all).not.toContain("28-pose-wave");
    expect(all).toContain("01-btn-pill");
    expect(all).toContain("25-bg-home");
  });

  it("category=\"mascot\" ⇒ đúng chiều ngược lại: CHỈ còn dáng mascot", () => {
    const all = mount({ category: "mascot" });
    expect(all).toContain("28-pose-wave");
    expect(all).not.toContain("01-btn-pill");
  });
});
