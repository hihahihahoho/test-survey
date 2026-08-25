/* @vitest-environment jsdom */
/**
 * P1-3 — ASSET PHÁT SÁNG SHIP KÈM BLEND MODE, KHÔNG BAKE ALPHA.
 *
 * `slice.py` tách ô `matte:"glow"` khỏi TẤM ĐEN nên PNG mang alpha = độ sáng, và
 * manifest ghi kèm `blend:"screen"` (research đo: RGBA(α=max) + phép CỘNG giống hệt
 * từng bit nền-đen + additive). Từ đó tới mắt người dùng còn ba mắt xích, mỗi cái
 * hỏng theo một kiểu IM LẶNG:
 *
 *  ① schema web nuốt khoá lạ ⇒ `blend` biến mất ngay khi vừa qua `parse()`;
 *  ② preview vẽ `source-over` trên nền ô-vuông ⇒ quầng sáng bị nền nuốt, người dùng
 *    kết luận "cắt hỏng" đúng vào lúc bản cắt vừa được cứu;
 *  ③ copy sang Figma: payload clipboard KHÔNG mang nổi blend mode, nên nếu web không
 *    NÓI ra thì layer dán vào nằm ở Normal và hỏng y như ②, chỉ là ở nhà người khác.
 *
 * Ba mắt xích ⇒ ba nhóm ca. Phía Python có `tests/test_slice_blend.py` khoá đầu kia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { kitFileSchema, type KitFile } from "@/lib/types";
import { BLEND_SCREEN_CLASS, GLOW_GROUND_CLASS, GLOW_FIGMA_HINT, isGlowAsset } from "../lib/blend";
import { KitImage } from "../components/KitImage";
import { SheetCellGrid } from "@/features/prompt-canvas/components/result";

/**
 * ⚠️ ĐÃ ĐỔI NHÀ, KHÔNG ĐỔI LUẬT (đợt IA prompt-first).
 *
 * Lưới ô đã cắt của nhóm ② và ③ trước đây là `kit-core/components/CutAssetGrid` —
 * ruột của trang "Ảnh đã tạo" trong trình quản lý dự án đời wizard. Trang đó và cả
 * component đó đã bị xoá; lưới ô đã cắt nay là `SheetCellGrid` (tab «Đã crop» của
 * `SheetResultPanel`, dùng ở CẢ khu soạn lẫn màn «Kết quả & xuất kit»).
 * Ba mắt xích được khoá ở đây KHÔNG đổi một chữ nào — chỉ đổi chỗ đo.
 */

/** Ảnh về NGAY, không đi qua transport thật — ở đây đo class, không đo hàng đợi tải. */
vi.mock("@/features/kit/lib/image-source", () => {
  const handle = () => ({ promise: Promise.resolve("blob:glow"), cancel: () => {} });
  // `loadImage` là cửa THẬT của `KitImage` từ P4-1 (nó tự chọn `null` hay `?w=`);
  // `loadFull`/`loadThumb` vẫn còn cho `CutAssetGrid` và `figma-board`.
  return { loadImage: handle, loadFull: handle, loadThumb: handle, filePath: () => "/x" };
});
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));
vi.mock("@/features/kit-core/lib/figma-node", () => ({
  copyAssetAsFigmaNode: vi.fn(async () => ({ frame: { w: 100, h: 80 } })),
}));
vi.mock("@/lib/hooks", () => ({ useKit: vi.fn() }));

const { toastInfo, toastSuccess } = await import("@/features/projects/lib/feedback");
const { copyAssetAsFigmaNode } = await import("@/features/kit-core/lib/figma-node");
const { useKit } = await import("@/lib/hooks");

const PID = "kit-glow";

/** Ô đã cắt như agent trả về (`#42 GET …/kit`). */
function kitFile(file: string, blend?: string): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 200, h: 200, bytes: 1234,
    sheet: "main", cellIndex: null,
    safe: [0, 0, 200, 200], contentAt: [0, 0], content: [200, 200],
    canvas: [200, 200], cell: [200, 200], bleed: [0, 0],
    blend: blend ?? null, empty: false,
  });
}

const GLOW = kitFile("tight/16-fx-burst", "screen");
const PLAIN = kitFile("tight/01-btn-pill-red");

beforeEach(() => {
  vi.mocked(useKit).mockReturnValue({
    data: { variant: "chinh", files: [GLOW, PLAIN], sheets: {}, cutAt: null },
    isLoading: false,
  } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("① khoá `blend` sống sót qua schema", () => {
  it("agent gửi `blend:\"screen\"` ⇒ đọc được ở KitFile", () => {
    expect(GLOW.blend).toBe("screen");
    expect(isGlowAsset(GLOW)).toBe(true);
  });

  it("ô thường: agent gửi `null` ⇒ `undefined`, KHÔNG phải chuỗi \"null\"", () => {
    expect(PLAIN.blend).toBeUndefined();
    expect(isGlowAsset(PLAIN)).toBe(false);
  });

  it("giá trị lạ (slice.py mới hơn web) không được vẽ bừa một phép mình không hiểu", () => {
    expect(isGlowAsset(kitFile("tight/99-x", "multiply"))).toBe(false);
  });
});

describe("② preview vẽ bằng phép CỘNG, trên nền đo tối", () => {
  const img = async (alt: string) => (await screen.findByAltText(alt)) as HTMLImageElement;

  it("ô glow: ảnh có mix-blend-mode, khung đổi sang nền đo (tắt ô vuông alpha)", async () => {
    render(<KitImage projectId={PID} path={GLOW.path} alt="burst" backdrop="checker" blend={GLOW.blend} />);
    const el = await img("burst");
    expect(el.className).toContain(BLEND_SCREEN_CLASS);
    expect(el.parentElement?.className).toContain(GLOW_GROUND_CLASS);
  });

  it("nền đo THẮNG cả ba chế độ nền của người dùng — screen trên nền trắng là ô trắng trơn", async () => {
    render(<KitImage projectId={PID} path={GLOW.path} alt="burst-light" backdrop="light" blend="screen" />);
    const el = await img("burst-light");
    expect(el.parentElement?.className).toContain(GLOW_GROUND_CLASS);
    expect(el.parentElement?.className).not.toContain("bg-fg-strong");
  });

  it("ô thường KHÔNG đổi một class nào: vẫn ô vuông alpha, không blend", async () => {
    render(<KitImage projectId={PID} path={PLAIN.path} alt="btn" backdrop="checker" blend={PLAIN.blend} />);
    const el = await img("btn");
    expect(el.className).not.toContain(BLEND_SCREEN_CLASS);
    expect(el.parentElement?.className).not.toContain(GLOW_GROUND_CLASS);
    expect(el.parentElement?.className).toContain("kg-checkerboard");
  });

  it("lưới ô đã cắt truyền `blend` xuống từng ô", async () => {
    render(<SheetCellGrid projectId={PID} cells={[GLOW, PLAIN]} />);
    const burst = await screen.findByAltText("16-fx-burst");
    const btn = await screen.findByAltText("01-btn-pill-red");
    expect(burst.className).toContain(BLEND_SCREEN_CLASS);
    expect(btn.className).not.toContain(BLEND_SCREEN_CLASS);
  });
});

describe("③ copy sang Figma phải NÓI rằng blend không đi theo", () => {
  const copyCell = async (name: string) => {
    render(<SheetCellGrid projectId={PID} cells={[GLOW, PLAIN]} />);
    (await screen.findByRole("button", { name: `Copy ${name} sang Figma` })).click();
  };

  it("ô glow: sau khi copy node, hiện nhắc chỉnh Linear Dodge (Add)/Screen", async () => {
    await copyCell("16-fx-burst");
    await waitFor(() => expect(copyAssetAsFigmaNode).toHaveBeenCalled());
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("Asset phát sáng", GLOW_FIGMA_HINT));
    /* Nhắc là LỚP PHỤ, không thay lời báo copy thành công. */
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("ô thường: không nhắc gì cả — cảnh báo vô cớ là nhiễu", async () => {
    await copyCell("01-btn-pill-red");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastInfo).not.toHaveBeenCalled();
  });
});
