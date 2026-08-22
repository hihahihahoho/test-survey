/* @vitest-environment jsdom */
/**
 * APP PHỤC VỤ ẢNH GỐC — KHÔNG CÒN THU NHỎ Ở PHÍA SERVER.
 *
 * ╔══ BỆNH ĐÃ ĐO, KHÔNG PHẢI SUY ĐOÁN ═════════════════════════════════════════╗
 * ║ Chủ sản phẩm dán blob đang xem trong app: **512×341**, trong khi file trên  ║
 * ║ đĩa là 1536×1024. Khác biệt duy nhất là chuỗi `?w=` trên URL:               ║
 * ║                                                                            ║
 * ║   ?w=512  → agent/lib/thumbs.mjs chạy Pillow `im.thumbnail((w, w*4))`,      ║
 * ║             ghi PNG 512×341 vào .kitgen/cache/thumbs/ rồi TRẢ FILE ĐÓ       ║
 * ║   (trống) → agent trả thẳng file gốc                                       ║
 * ║                                                                            ║
 * ║ Tức pixel mất THẬT trước khi tới trình duyệt. CSS không cứu lại được, và ô  ║
 * ║ đã cắt trông mờ y hệt ca file thật bị hỏng.                                ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * Trần RAM — lý do sinh ra phép thu nhỏ (H4: "v1 nạp PNG 3.1 MB vào lưới") — nay do
 * hai thứ khác lo, và cả hai đều KHÔNG đánh đổi bằng độ nét:
 *   · `KitImage` lazy-load bằng `IntersectionObserver` (v1 chưa có);
 *   · `image-source.ts` có trần cache theo BYTE, `revoke` object URL khi đẩy ra.
 *
 * File này khoá ĐÚNG một điều: đường mặc định KHÔNG kèm `?w`. Bản thu nhỏ vẫn còn,
 * nhưng phải có người CỐ Ý xin — `full={false}`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { KitImage } from "../components/KitImage";

const calls: Array<{ path: string; width: number | null }> = [];
vi.mock("@/features/kit/lib/image-source", () => ({
  loadImage: (_pid: string, path: string, width: number | null) => {
    calls.push({ path, width });
    return { promise: Promise.resolve("blob:x"), cancel: () => {} };
  },
  loadFull: () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} }),
  loadThumb: () => ({ promise: Promise.resolve("blob:x"), cancel: () => {} }),
  filePath: () => "/x",
}));

/* Không có IntersectionObserver ⇒ KitImage tự coi là đã vào khung nhìn (nhánh jsdom
   trong chính component), nên `eager` không cần thiết — nhưng đặt cho rõ ý. */
afterEach(() => { calls.length = 0; cleanup(); });

const at = (path: string) => calls.find((c) => c.path === path);

describe("ảnh trong app = ảnh gốc", () => {
  it("KitImage mặc định xin ảnh GỐC — width null ⇒ URL không có `?w`", async () => {
    render(<KitImage projectId="p1" path="kits/chinh/01-btn.png" alt="nút" backdrop="checker" eager />);
    await waitFor(() => expect(at("kits/chinh/01-btn.png")).toBeTruthy());
    expect(at("kits/chinh/01-btn.png")?.width).toBeNull();
  });

  it("sheet thô cũng vậy — đây là ô từng trả blob 512×341", async () => {
    render(<KitImage projectId="p1" path="raw/chinh-ui.png" alt="sheet" backdrop="checker" eager />);
    await waitFor(() => expect(at("raw/chinh-ui.png")).toBeTruthy());
    expect(at("raw/chinh-ui.png")?.width).toBeNull();
  });

  it("bản thu nhỏ vẫn xin được, nhưng phải CỐ Ý — `full={false}`", async () => {
    render(<KitImage projectId="p1" path="a.png" alt="a" backdrop="checker" eager full={false} width={128} />);
    await waitFor(() => expect(at("a.png")).toBeTruthy());
    expect(at("a.png")?.width).toBe(128);
  });
});
