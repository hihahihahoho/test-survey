/* @vitest-environment jsdom */
/**
 * CHÉP ẢNH KHUNG TỪ KHO DÙNG CHUNG VÀO `refs/` — ba chỗ hỏng câm.
 *
 * ╔══ VÌ SAO ĐÚNG BA ═══════════════════════════════════════════════════════╗
 * ║ ① KHÔNG NHỚ ⇒ mỗi lần chọn lại cùng một món là một vòng tải xuống + một  ║
 * ║   vòng tải lên, và `refs/` của dự án đầy những bản sao y hệt nhau mang    ║
 * ║   tên khác nhau. Không có gì báo: nó chỉ chậm dần và phình dần.          ║
 * ║ ② NHỚ NHẦM BẢNG (đổ vào `brandAssets`) ⇒ `swapBrandRefs` gỡ tấm ấy đi ở  ║
 * ║   lần người dùng đổi thương hiệu, và dòng element mất ảnh mà không ai     ║
 * ║   đụng vào nó.                                                          ║
 * ║ ③ ẢNH ĐÃ BỊ XOÁ KHỎI KHO mà nuốt lỗi ⇒ người dùng chọn một món VÌ tấm    ║
 * ║   phác của nó, nhận về một dòng trống, và không có câu nào giải thích.   ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { initialComposer, type ComposerState } from "@/features/prompt-lab/lib/composer-model";
import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { useUserLibrary } from "@/lib/hooks/use-library";

const blob = vi.fn(async (..._args: unknown[]) => new Blob(["x"], { type: "image/png" }));
const libraryGet = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    library: {
      get: (...args: unknown[]) => libraryGet(...args),
      blob: (...args: unknown[]) => blob(...args),
    },
  },
}));
vi.mock("@/lib/api/endpoints", () => ({
  api: {
    library: {
      get: (...args: unknown[]) => libraryGet(...args),
      blob: (...args: unknown[]) => blob(...args),
    },
  },
}));

const upload = vi.fn(async (..._args: unknown[]) => ({ refName: "shape-quest.png", path: "refs/shape-quest.png" }));
vi.mock("../pill-image", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  uploadPillImage: (...args: unknown[]) => upload(...args),
}));

const { useShapeBinding } = await import("../shape-binding");

const ITEM = {
  id: "asset_quest", kind: "reference", group: "element-shape", name: "Khung nhiệm vụ",
  description: "", tags: [], filename: "quest.png", poses: [],
};

/** Vỏ đọc hook và bày ra đúng hai thứ ca cần: kết quả chép, và bảng nhớ sau đó. */
function Harness({ onCopy }: { onCopy: (copy: (assetId: string) => Promise<{ path: string }>) => void }) {
  const [composer, setComposer] = React.useState<ComposerState>(() => initialComposer(seedPresets()));
  const library = useUserLibrary();
  const copy = useShapeBinding("p1", composer, (updater) => setComposer(updater));
  React.useEffect(() => { onCopy(copy); }, [copy, onCopy]);
  return (
    <>
      {/* Kho đã về tới nơi chưa — hook chép ảnh tra `items` của CHÍNH lượt render
          này, nên gọi nó trước lúc kho về là gọi vào một danh sách rỗng. */}
      <output data-testid="loaded">{library.data ? "co" : "chua"}</output>
      <output data-testid="cache">{JSON.stringify(composer.shapeAssets ?? {})}</output>
    </>
  );
}

async function mount() {
  let copy: ((assetId: string) => Promise<{ path: string }>) | null = null;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <Harness onCopy={(next) => { copy = next; }} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("loaded").textContent).toBe("co"));
  return {
    call: (assetId: string) => copy!(assetId),
    cache: () => JSON.parse(screen.getByTestId("cache").textContent || "{}") as Record<string, string>,
  };
}

beforeEach(() => {
  blob.mockClear();
  upload.mockClear();
  libraryGet.mockResolvedValue({
    version: 4, brands: [], items: [ITEM], presets: [],
    settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 },
  });
});
afterEach(cleanup);

describe("chép ảnh khung của một món", () => {
  it("đọc byte từ kho rồi ĐẨY vào `refs/` của dự án, với phân loại `shape`", async () => {
    const box = await mount();

    const image = await box.call("asset_quest");
    expect(image.path).toBe("refs/shape-quest.png");
    expect(blob).toHaveBeenCalledWith("asset_quest");
    /* `kind: "shape"` phải khớp ô đính ảnh tay của một dòng (`ShapeRefPanel`): hai
       đường vào cùng một ô của contract mà xếp ảnh vào hai thư mục là hai chỗ để
       agent tìm hụt. */
    expect(upload.mock.calls[0]![2] as Record<string, unknown>).toMatchObject({ kind: "shape" });
  });

  it("GHI VÀO `shapeAssets`, KHÔNG vào `brandAssets` — hai bảng trả lời hai câu khác nhau", async () => {
    const box = await mount();
    await box.call("asset_quest");

    await waitFor(() => expect(box.cache()).toEqual({ asset_quest: "refs/shape-quest.png" }));
  });

  it("CHỌN LẠI CÙNG MỘT MÓN ⇒ dùng bảng nhớ, KHÔNG đi mạng lần nữa", async () => {
    const box = await mount();
    await box.call("asset_quest");
    await waitFor(() => expect(box.cache()["asset_quest"]).toBe("refs/shape-quest.png"));

    const again = await box.call("asset_quest");
    expect(again.path).toBe("refs/shape-quest.png");
    /* Một vòng tải xuống + một vòng tải lên, ĐÚNG MỘT LẦN cho cả hai cú bấm. */
    expect(blob).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("ảnh ĐÃ BỊ XOÁ khỏi kho ⇒ NÉM, không trả về một tấm rỗng", async () => {
    const box = await mount();
    await expect(box.call("asset_khong-co")).rejects.toThrow(/không còn trong kho dùng chung/);
    expect(upload).not.toHaveBeenCalled();
  });
});
