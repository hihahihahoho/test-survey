/* @vitest-environment jsdom */
/**
 * NẤC «TỐI ĐA MỖI TẤM» TRÊN MẶT THẺ — và cái đuôi của nó ở tầng kết quả.
 *
 * ╔══ BA THỨ ĐƯỢC KHOÁ, VÀ VÌ SAO KHÔNG THỨ NÀO THỪA ═══════════════════════╗
 * ║ ① DÒNG ĐẾM NÓI ĐÚNG PHÉP CHIA. Chủ sản phẩm bấm nấc rồi đọc dòng ấy để   ║
 * ║   quyết định có bấm Vẽ hay không — nó là toàn bộ lời báo trước về số lượt ║
 * ║   sắp tiêu. Một dòng đếm dựng bằng phép chia thứ hai là một dòng có       ║
 * ║   quyền lệch khỏi thứ sắp chạy.                                          ║
 * ║ ② BẤM LÀ GHI XUỐNG THẺ. Nấc sống trong tài liệu; một nút bấm vào không    ║
 * ║   có gì xảy ra là ca hỏng câm nhất của cả tính năng này.                  ║
 * ║ ③ MỖI TẤM MỘT PANEL KẾT QUẢ RIÊNG, mang ĐÚNG id tấm của nó. Panel là nơi ║
 * ║   xem ảnh · chọn phiên bản · xoá · copy sang Figma; hai tấm dùng chung    ║
 * ║   một panel là hai tấm đè lên nhau ở mọi thao tác ấy.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import type { Block, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";

/* Panel thật kéo theo TanStack Query + bộ encoder Figma; thứ ĐÁNG canh ở đây là
   màn dựng RA MẤY chỗ cắm và đưa cho mỗi chỗ id nào. */
vi.mock("../SheetResultSlot", () => ({
  SheetResultSlot: ({ sheetId }: { sheetId: string }) => <div data-testid="slot" data-sheet={sheetId} />,
}));

const { CanvasBlock } = await import("../CanvasBlock");
const { newCell } = await import("@/features/prompt-lab/lib/composer-model");
const { composerBlockSheets } = await import("../../lib/composer-to-contract");
const { jobIdOf } = await import("../../lib/block-jobs");

const PRESETS = seedPresets();
const IDS = ["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy"];

function uiBlock(n: number, maxPerSheet?: number): UiKitBlock {
  return {
    id: "u1",
    kind: "uikit",
    mode: "template",
    cells: IDS.slice(0, n).map((id) => newCell(id, PRESETS)),
    ...(maxPerSheet ? { maxPerSheet } : {}),
  };
}

/** Tấm THẬT của thẻ — đúng thứ màn tính rồi truyền xuống vỏ thẻ. */
function sheetsOf(block: Block) {
  return composerBlockSheets(
    {
      themeValue: "", styleId: PRESETS.styles[0]!.id, brandColors: [], themeCustom: "", styleCustom: "",
      brandId: "", contextRefs: [], brandAssets: {}, contextMode: "template", blocks: [block],
    },
    { presets: PRESETS },
  )[0]!.sheets;
}

/* `usePresets` của badge đi qua TanStack Query — vỏ thẻ thật luôn nằm trong một
   provider, nên ca test phải dựng đúng chỗ đứng ấy. */
function mount(block: Block, onChange: (updater: (prev: Block) => Block) => void = () => {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CanvasBlock
      projectId="p1"
      block={block}
      sheets={sheetsOf(block) as never}
      onChange={onChange}
      onDelete={() => {}}
      gen={{ status: "idle", message: "", runId: null, done: 0, total: 0, jobs: [], requested: [], drawing: [], phase: "idle" }}
      onGen={() => {}}
      onGenSheet={() => {}}
      onDequeue={() => {}}
      onStop={() => {}}
      stopping={false}
      prompt={{ status: "idle", jobs: [], missing: [], message: "", details: [], hash: "" } as never}
      styleLine=""
      onWantPrompt={() => {}}
      promptBusy={false}
      hash="h1"
      reloadSignal={0}
      onReload={() => {}}
    />
    </QueryClientProvider>,
  );
}

const slots = () => screen.getAllByTestId("slot").map((el) => el.getAttribute("data-sheet"));
const nac = (value: string) => screen.getByRole("radio", { name: value });

afterEach(cleanup);

describe("dòng đếm trên thẻ nói đúng phép chia", () => {
  it("sáu món ở nấc mặc định ⇒ «6 element · 2 tấm (4 + 2)»", () => {
    mount(uiBlock(6));
    expect(screen.getByText("6 element · 2 tấm (4 + 2)")).toBeTruthy();
  });

  it("bốn món ⇒ một tấm, và không bày dấu ngoặc rỗng", () => {
    mount(uiBlock(4));
    expect(screen.getByText("4 element · 1 tấm")).toBeTruthy();
  });

  it("đổi nấc lên 9 ⇒ dòng đếm gộp lại còn một tấm", () => {
    mount(uiBlock(6, 9));
    expect(screen.getByText("6 element · 1 tấm")).toBeTruthy();
  });

  it("nấc 1 ⇒ mỗi món một tấm", () => {
    mount(uiBlock(3, 1));
    expect(screen.getByText("3 element · 3 tấm (1 + 1 + 1)")).toBeTruthy();
  });
});

describe("ba nấc là ba nút thật, và bấm là ghi xuống thẻ", () => {
  it("bày đủ 1 · 4 · 9, và nấc đang dùng được đánh dấu", () => {
    mount(uiBlock(6));
    expect(screen.getAllByRole("radio").map((el) => el.textContent)).toEqual(["1", "4", "9"]);
    expect(nac("4").getAttribute("aria-checked")).toBe("true");
    expect(nac("9").getAttribute("aria-checked")).toBe("false");
  });

  it("bấm «9» ⇒ thẻ mang `maxPerSheet: 9`, KHÔNG đụng tới ô nào", () => {
    const onChange = vi.fn();
    const block = uiBlock(6);
    mount(block, onChange);
    fireEvent.click(nac("9"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0](block) as UiKitBlock;
    expect(next.maxPerSheet).toBe(9);
    expect(next.cells).toBe(block.cells);
  });

  it("thẻ đã ở nấc 1 thì nút «1» là nút đang chọn", () => {
    mount(uiBlock(2, 1));
    expect(nac("1").getAttribute("aria-checked")).toBe("true");
  });
});

describe("mỗi tấm một chỗ cắm kết quả riêng", () => {
  it("sáu món · nấc 4 ⇒ HAI panel, mang hai id tấm khác nhau", () => {
    mount(uiBlock(6));
    expect(slots()).toEqual(["ui", "ui2"]);
    /* Tên job là thứ đặt tên `raw/<job>.png`, tên file tải về và tên node dán ra
       Figma — hai tấm cùng thẻ phải ra hai tên, nếu không chúng đè nhau. */
    expect(slots().map((id) => jobIdOf(id!))).toEqual(["chinh-ui", "chinh-ui2"]);
    expect(new Set(slots()).size).toBe(2);
  });

  it("gộp về một tấm ⇒ chỉ còn MỘT panel", () => {
    mount(uiBlock(6, 9));
    expect(slots()).toEqual(["ui"]);
  });

  it("nấc 1 ⇒ ba món ra ba panel, ba tên job", () => {
    mount(uiBlock(3, 1));
    expect(slots()).toEqual(["ui", "ui2", "ui3"]);
    expect(slots().map((id) => jobIdOf(id!))).toEqual(["chinh-ui", "chinh-ui2", "chinh-ui3"]);
  });
});
