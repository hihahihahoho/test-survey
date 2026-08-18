/* @vitest-environment jsdom */
/**
 * TÊN DỰ ÁN KHÔNG ĐƯỢC HIỆN HAI LẦN TRÊN MỘT TẤM BÌA.
 *
 * Bản vá 18/08 (agent `lib/cover.mjs` § quyết định ③) cho model KẺ THẲNG tên dự án vào
 * artwork. Overlay CSS cũ vẫn còn trong `KitCover` — nó phải còn, vì ảnh bìa vẽ TRƯỚC
 * bản vá đang nằm sẵn trên máy người dùng và trong đó không có chữ nào. Hai thứ cùng bật
 * là tên dự án chồng lên chính nó, ngay trên màn hình đầu tiên của app.
 *
 * `cover-title.test.ts` đã khoá phần QUYẾT ĐỊNH (`shouldOverlayTitle`, hàm thuần). File
 * này khoá phần NỐI DÂY, thứ hàm thuần không nói được:
 *  ① thẻ ĐÃ CÓ bìa tự sinh vẫn phải hỏi `#43` — không hỏi thì cờ không bao giờ tới;
 *  ② cờ về `true` ⇒ chip tên biến mất khỏi DOM; cờ thiếu (agent cũ) ⇒ chip còn nguyên.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoverStatus } from "@/lib/types";

vi.mock("@/lib/hooks", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks")>()),
  useProjectCover: vi.fn(() => ({ data: undefined, isPending: false })),
  useRegenerateCover: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
/* Ảnh bìa phải VẼ ĐƯỢC thì mới có chỗ cho overlay: `KitCover` hiện khung «Chưa vẽ ảnh
   nào» chừng nào `loadThumb` chưa trả URL. Trả một blob URL giả là đủ. */
vi.mock("@/features/projects/lib/agent-blob", () => ({
  loadThumb: vi.fn(() => Promise.resolve("blob:fake-cover")),
}));
vi.mock("@/features/projects/lib/feedback", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const { useProjectCover } = await import("@/lib/hooks");
const { KitCover } = await import("../components/KitCover");

const PID = "cho-tet-368a";
const NAME = "Chợ Tết Bính Ngọ";
const AUTO = "cover/cover.png";

const ok = (over: Partial<CoverStatus> = {}): CoverStatus =>
  ({ status: "ok", path: AUTO, error: null, updatedAt: null, startedAt: null,
    titleZone: null, size: null, ...over }) as CoverStatus;

function mount(
  data: CoverStatus | undefined,
  over: { coverPath?: string | null; offline?: boolean; watchCover?: boolean; isPending?: boolean } = {},
) {
  vi.mocked(useProjectCover).mockReturnValue({ data, isPending: over.isPending ?? false } as never);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <KitCover
        projectId={PID}
        coverPath={over.coverPath === undefined ? AUTO : over.coverPath}
        kitName={NAME}
        offline={over.offline ?? false}
        watchCover={over.watchCover ?? true}
      />
    </QueryClientProvider>,
  );
}

const titleChip = (c: ReturnType<typeof render>) => c.container.querySelector("[data-cover-title]");
const coverImg = async (c: ReturnType<typeof render>) =>
  waitFor(() => {
    const img = c.container.querySelector("img");
    expect(img).not.toBeNull();
    return img!;
  });

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("KitCover · tên dự án đã nằm trong ảnh", () => {
  it("thẻ ĐÃ CÓ bìa tự sinh vẫn hỏi #43 — nếu không thì không bao giờ biết có chữ hay chưa", () => {
    mount(ok({ titleEmbedded: true }));
    expect(vi.mocked(useProjectCover).mock.calls.some(([id]) => id === PID)).toBe(true);
  });

  it("titleEmbedded=true → KHÔNG dán chip tên đè lên nữa (ảnh vẫn hiện bình thường)", async () => {
    const c = mount(ok({ titleEmbedded: true }));
    await coverImg(c);
    expect(titleChip(c)).toBeNull();
  });

  it("bìa CŨ (agent không gửi cờ) → chip tên còn nguyên, tên dự án không biến mất", async () => {
    const c = mount(ok());
    await coverImg(c);
    const chip = titleChip(c);
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toContain(NAME);
  });

  it("agent báo CHƯA kẻ được tên (dự án không có tên dùng được) → vẫn dán như cũ", async () => {
    const c = mount(ok({ titleEmbedded: false }));
    await coverImg(c);
    expect(titleChip(c)).not.toBeNull();
  });

  it("#43 còn đang bay → chưa dán, để chip tên không nháy lên rồi biến mất", async () => {
    const c = mount(undefined, { isPending: true });
    await coverImg(c);
    expect(titleChip(c)).toBeNull();
  });

  it("ảnh bìa USER TỰ CHỌN: không hỏi #43 và không bao giờ dán chữ lên ô họ chọn", async () => {
    const c = mount(ok({ titleEmbedded: true }), { coverPath: "kits/chinh/01-btn-pill-red.png" });
    await coverImg(c);
    expect(titleChip(c)).toBeNull();
    expect(vi.mocked(useProjectCover).mock.calls.every(([id]) => id === null)).toBe(true);
  });

  it("thẻ dựng từ cache cục bộ (watchCover=false) KHÔNG gõ cửa server dù đã có bìa", () => {
    mount(undefined, { watchCover: false });
    expect(vi.mocked(useProjectCover).mock.calls.every(([id]) => id === null)).toBe(true);
  });
});
