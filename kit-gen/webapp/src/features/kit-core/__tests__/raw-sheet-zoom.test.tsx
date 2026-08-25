/* @vitest-environment jsdom */
/**
 * TAB TÊN LÀ "ẢNH GỐC" THÌ PHẢI XEM ĐƯỢC ẢNH GỐC — CẢ TRONG LƯỚI LẪN KHI PHÓNG TO.
 *
 * Chủ sản phẩm mở tab đó soi sheet vừa gen và báo "ảnh gốc nó bé tí", rồi dán thẳng
 * cái blob đang xem: **512×341**. File trên đĩa vẫn 1536×1024 — chỗ mất pixel nằm ở
 * đường phục vụ, và ĐÓ LÀ AGENT THU NHỎ THẬT chứ không phải CSS thu nhỏ:
 *
 *   có `?w=512` → `agent/lib/thumbs.mjs` ghi ra PNG 512×341 (136 KB) rồi trả file đó
 *   không `?w`  → trả thẳng file gốc 1536×1024 (1504 KB)
 *
 * Vì sao chuyện này đáng một file test riêng: sheet thô 1536px là nơi DUY NHẤT soi ra
 * được model vẽ đúng lưới chưa, chừa đúng khe chưa, nền có trong suốt thật không. Xem
 * qua bản thu nhỏ gấp ba thì mọi lỗi cỡ vài pixel đều bị phép resize xoá mất — và ô đã
 * cắt thì trông mờ ĐÚNG NHƯ file thật bị hỏng. Hai bệnh khác hẳn nhau mà nhìn giống
 * hệt nhau, nên người xem không thể phân biệt được.
 *
 * ══ SỬA LẠI 25/08: "XEM ĐƯỢC ẢNH GỐC" ≠ "MỌI Ô ĐỀU TẢI ẢNH GỐC" ═══════════════════
 * Bản trước đóng đinh `full` cho CẢ HAI chỗ, và cái giá lộ ra ở lượt gen thật: mười thẻ
 * cùng kéo mười file 1–3 MB qua đúng cái agent đang bận vẽ tấm thứ mười một ⇒ thẻ nào về
 * trước hiện trước ("lưới lác lác"), và thẻ cuối đợi hàng chục giây sau khi ảnh đã nằm
 * sẵn trên đĩa. Mà thẻ chỉ rộng ~400px: mọi pixel vượt quá đó bị vứt ngay ở khâu vẽ.
 * Nên chia đúng theo chỗ dùng — và ĐÓ MỚI LÀ Ý ĐỊNH GỐC (xem chú thích "HAI CỠ, VÀ PHẢI
 * CÓ CẢ HAI" trong RawSheetsPanel, vốn đã tả đúng thế trong khi mã thì không):
 *   · THẺ trong lưới → `?w=512` (ô ~400px, chỉ để nhận ra tấm nào là tấm nào);
 *   · POPUP phóng to → ảnh GỐC 1536×1024, không `?w` — chỗ soi lưới/khe/alpha.
 * Lời hứa của bài báo lỗi cũ ("bé tí") KHÔNG mất: nó được giữ ở popup, và popup thì bản
 * đó chưa có — nay có. Ca ① và ca ③ khoá HAI NỬA ấy, đừng sửa nửa nào mà bỏ nửa kia.
 *
 * Ca ③ vẫn là ca đắt nhất: popup phóng to là thứ trước bản vá KHÔNG TỒN TẠI — thẻ
 * sheet là một khối chữ nhật chết, không bấm được, trong khi lưới ô ĐÃ CẮT đã có
 * `AssetZoomDialog` từ lâu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RawSheetsPanel } from "../components/RawSheetsPanel";
import { DONE_GEN_RUN } from "@/features/runs/__tests__/fixtures/done-gen-run";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  } as never;
}

/** Ghi lại MỌI lượt `KitImage` được dựng, kèm `width`/`full` — đó là thứ quyết định
 *  URL đi ra, và cũng là thứ ca ③ phải đọc được. */
const mounted: Array<{ path: string; width?: number; full?: boolean }> = [];
vi.mock("@/features/kit/components/KitImage", () => ({
  KitImage: (props: { path: string; alt: string; width?: number; full?: boolean }) => {
    mounted.push({ path: props.path, width: props.width, full: props.full });
    return <img alt={props.alt} data-full={props.full ? "1" : "0"} data-width={props.width ?? "full"} />;
  },
}));
vi.mock("@/features/runs", () => ({ GenerateDialog: () => null }));
vi.mock("@/lib/hooks", () => ({
  useRun: () => ({ data: null }),
  useRuns: () => ({ data: { items: [RUN] } }),
  useRunStream: () => ({}),
}));

/** Hình dạng run lấy từ fixture chung — cổng check-no-gen.mjs cấm chuỗi kind gen
 *  viết thẳng trong vùng kit-core, kể cả ở test (xem chú thích trong fixture). */
const RUN = DONE_GEN_RUN;

const CONTRACT = {
  schemaVersion: 4,
  variants: [{ id: "chinh", vi: "Chính", style: "x" }],
  sheets: [{ id: "ui", grid: { cols: 4, rows: 4 }, orient: "landscape", components: [] }],
} as never;

const mount = () =>
  render(<RawSheetsPanel projectId="p1" contract={CONTRACT} jobStates={{}} />);

beforeEach(() => { mounted.length = 0; });
afterEach(cleanup);

describe("tab «Ảnh gốc» — đường tới ảnh ở độ nét thật", () => {
  it("thẻ trong lưới xin ĐÚNG bản 512 — không kéo 1–3 MB vào một ô rộng 400px", () => {
    mount();
    expect(mounted.length).toBeGreaterThan(0);
    /* `full === false` + `width` ⇒ URL có `?w=512` ⇒ agent trả bản đã co (≈136 KB).
       Đây là thứ chặn "lưới lác lác": mười thẻ × 1–3 MB đi qua agent đang bận gen thì
       ô nào về trước hiện trước. Ảnh thật vẫn tới được — bằng popup ở ca ③. */
    expect(mounted.every((m) => m.full === false && m.width === 512)).toBe(true);
  });

  it("thẻ sheet BẤM ĐƯỢC — trước bản này nó là một khối chữ nhật chết", () => {
    mount();
    expect(screen.getByRole("button", { name: /Xem ảnh gốc/ })).toBeTruthy();
  });

  it("bấm vào ⇒ popup dựng thêm một `KitImage` cho ĐÚNG sheet đó, vẫn không `?w`", () => {
    mount();
    const truoc = mounted.length;
    fireEvent.click(screen.getByRole("button", { name: /Xem ảnh gốc/ }));
    expect(mounted.length).toBeGreaterThan(truoc);
    const trongPopup = mounted[mounted.length - 1];
    expect(trongPopup?.path).toBe("raw/chinh-ui.png");
    expect(trongPopup?.width).toBeUndefined();
    expect(trongPopup?.full).not.toBe(false);
  });

  it("chưa bấm thì popup CHƯA dựng — khung xem lớn không nằm sẵn trong DOM", () => {
    mount();
    expect(screen.queryByTestId("sheet-preview-frame")).toBeNull();
  });
});
