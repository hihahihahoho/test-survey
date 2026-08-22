/* @vitest-environment jsdom */
/**
 * TAB TÊN LÀ "ẢNH GỐC" THÌ PHẢI XEM ĐƯỢC ẢNH GỐC.
 *
 * Chủ sản phẩm mở tab đó soi sheet vừa gen và báo "ảnh gốc nó bé tí". Đúng, và
 * không phải chuyện file trên đĩa — file vẫn 1536×1024. Chuyện nằm ở đường phục vụ:
 *
 *   thẻ sheet  → <KitImage width={512}>  → GET …/files/raw/x.png?w=512 → 512×341
 *   ảnh thật   → (không có ?w)           → GET …/files/raw/x.png      → 1536×1024
 *
 * Đo trên agent đang chạy: 136 KB so với 1504 KB. Và trước bản này tab "Ảnh gốc"
 * KHÔNG có cửa nào ra bản thứ hai — thẻ không bấm được, không popup, không nút.
 * Lưới ô ĐÃ CẮT có `AssetZoomDialog` từ lâu; sheet thô thì bị bỏ quên.
 *
 * Vì sao đáng một file test riêng: sheet thô 1536px là nơi DUY NHẤT soi ra được model
 * vẽ đúng lưới chưa, chừa đúng khe chưa, nền có thật sự trong suốt không. Xem qua bản
 * thu nhỏ gấp ba thì mọi lỗi cỡ vài pixel đều bị phép resize xoá mất — tức là mất
 * đúng công dụng của tab này.
 *
 * Ca ③ là ca đắt nhất: `full` phải nằm trên `KitImage` TRONG dialog. Thiếu nó thì
 * popup vẫn mở ra, vẫn có ảnh, chỉ là vẫn 512px — hỏng y hệt mà nhìn thì như đã sửa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RawSheetsPanel } from "../components/RawSheetsPanel";

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

/** Hình dạng ĐÚNG như `generatedRuns` đọc: `kind:"gen"`, và đường ảnh nằm ở
 *  `job.artifact.path` chứ không phải `job.path`. */
const RUN = {
  id: "r1",
  kind: "gen",
  status: "done",
  startedAt: "2026-08-22T03:00:00.000Z",
  finishedAt: "2026-08-22T03:05:00.000Z",
  jobs: [{
    job: "chinh-ui",
    sheet: "ui",
    variant: "chinh",
    status: "done",
    diagnosis: null,
    artifact: { path: "raw/chinh-ui.png", validation: null },
  }],
};

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
  it("thẻ trong lưới vẫn dùng bản thu nhỏ 512 — mở kit lớn không nuốt hết RAM", () => {
    mount();
    expect(mounted.some((m) => m.width === 512 && !m.full)).toBe(true);
  });

  it("thẻ sheet BẤM ĐƯỢC — trước bản này nó là một khối chữ nhật chết", () => {
    mount();
    expect(screen.getByRole("button", { name: /Xem ảnh gốc/ })).toBeTruthy();
  });

  it("bấm vào ⇒ popup dựng `KitImage` có `full` (KHÔNG kèm ?w) — đây mới là bản vá", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Xem ảnh gốc/ }));
    const full = mounted.filter((m) => m.full === true);
    expect(full.length).toBeGreaterThan(0);
    expect(full[0]?.path).toBe("raw/chinh-ui.png");
    expect(full[0]?.width).toBeUndefined();
  });

  it("chưa bấm thì KHÔNG tải ảnh gốc — 1,5 MB mỗi sheet, không nạp sẵn", () => {
    mount();
    expect(mounted.some((m) => m.full === true)).toBe(false);
  });
});
