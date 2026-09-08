/* @vitest-environment jsdom */
/**
 * WAVE 1 — bằng chứng cho §W1-8 (thẻ 🎨 mở đúng BÀN LÀM VIỆC) và §W1-9 (nút to nhất
 * cuối wizard + lệnh ⌘K thôi là nút chết).
 *
 * Hai bệnh này giống nhau ở chỗ nguy hiểm nhất: cả hai đều **im lặng**. Không có lỗi,
 * không có toast, chỉ là người dùng bấm rồi rơi vào một màn không phải màn họ muốn.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createNav, hasGeneratedOutput, openKitWith, openProjectWith, type ProjectNav } from "../lib/nav";
import { intentOf, useCreateIntent, type CreateIntent } from "../lib/useCreateIntent";

const SRC = resolve(process.cwd(), "src");

afterEach(cleanup);

const fakeNav = (): ProjectNav => ({
  open: vi.fn(),
  openImages: vi.fn(),
  openWizard: vi.fn(),
  navigateCanvas: vi.fn(),
  openDesign: vi.fn(),
  openStyles: vi.fn(),
  openRuns: vi.fn(),
  openTrash: vi.fn(),
});

describe("§W1-8 — mở bộ kit là vào ĐÚNG PHÒNG của nó", () => {
  it("bộ kit gắn tag `kg-canvas` mở ra BÀN LÀM VIỆC", () => {
    const nav = fakeNav();
    openKitWith(nav, { id: "kit-canvas", tags: ["kg-canvas"] });
    expect(nav.navigateCanvas).toHaveBeenCalledWith("kit-canvas");
    expect(nav.open).not.toHaveBeenCalled();
  });

  it("bộ kit workflow — và bộ kit KHÔNG có tag — vẫn đi đường cũ (mặc định an toàn)", () => {
    for (const tags of [["kg-workflow"], [], undefined, ["kg-canvas", "kg-workflow"]]) {
      const nav = fakeNav();
      openKitWith(nav, { id: "kit-x", tags });
      expect(nav.open, `tags=${JSON.stringify(tags)}`).toHaveBeenCalledWith("kit-x");
      expect(nav.navigateCanvas).not.toHaveBeenCalled();
    }
  });

  /* `/k/:id/canvas` đã thành một route CHỈ CHUYỂN HƯỚNG (bàn làm việc riêng không còn
     là một màn tách biệt). Điều hướng qua nó là bắt người dùng nhảy hai nấc và nhìn
     URL đổi hai lần, nên `navigateCanvas` trỏ thẳng đích cuối. Deep link cũ vẫn sống —
     route ấy còn nguyên, chỉ không còn ai trong app tự đi vào nó. */
  it("`navigateCanvas` trỏ thẳng khu soạn, không đi vòng qua route chuyển hướng", () => {
    const navigate = vi.fn();
    createNav(navigate as never).navigateCanvas("kit-canvas");
    expect(navigate).toHaveBeenCalledWith({ to: "/k/$projectId", params: { projectId: "kit-canvas" } });
  });

  /* §B2 — luật cũ "màn Home LUÔN mở tổng quan dự án" đã bị blind-test 2.1.17 bác bỏ:
     `/p/:id` tự đá về wizard theo cờ `workflow.completed`, mà cờ đó bị autosave của
     wizard lật về false ⇒ dự án đầy ảnh mở ra thành bước "Kiểm tra" trắng trơn. Home
     nay tự chọn đích bằng thứ có thật trên đĩa. Ca ⚙️/🎨 của §W1-8 giữ nguyên. */
  it("màn Home chọn đích bằng `openProjectWith`, không tự ghép đường dẫn", () => {
    const src = readFileSync(join(SRC, "features/projects/ProjectsScreen.tsx"), "utf8");
    expect(src).toContain("openProjectWith(nav, p)");
    expect(src).not.toContain("openKitWith(nav, p)");
  });
});

describe("§B2 — mở dự án ĐÃ CÓ ẢNH phải vào thẳng trang kết quả", () => {
  it("`hasGeneratedOutput` đọc cả ba dấu vết trên đĩa", () => {
    expect(hasGeneratedOutput({ stats: { kitsCut: 12 } })).toBe(true);
    expect(hasGeneratedOutput({ stats: { rawPresent: 5 } })).toBe(true);
    expect(hasGeneratedOutput({ stats: { lastRun: { id: "r-0002" } } })).toBe(true);
    expect(hasGeneratedOutput({ stats: { kitsCut: 0, rawPresent: 0, lastRun: null } })).toBe(false);
    expect(hasGeneratedOutput({})).toBe(false);
    expect(hasGeneratedOutput(null)).toBe(false);
    expect(hasGeneratedOutput(undefined)).toBe(false);
  });

  it("dự án đã gen xong ⇒ `openImages`, KHÔNG phải wizard", () => {
    const nav = fakeNav();
    openProjectWith(nav, { id: "kit-a", tags: ["kg-workflow"], stats: { kitsCut: 12 } });
    expect(nav.openImages).toHaveBeenCalledWith("kit-a");
    expect(nav.open).not.toHaveBeenCalled();
  });

  it("dự án chưa gen bao giờ ⇒ vẫn đi đường cũ `/p/:id`", () => {
    const nav = fakeNav();
    openProjectWith(nav, { id: "kit-moi", tags: [], stats: { kitsCut: 0, rawPresent: 0, lastRun: null } });
    expect(nav.open).toHaveBeenCalledWith("kit-moi");
    expect(nav.openImages).not.toHaveBeenCalled();
  });

  it("bộ kit 🎨 vẫn về bàn làm việc dù đã có ảnh (§W1-8 không bị đè)", () => {
    const nav = fakeNav();
    openProjectWith(nav, { id: "kit-canvas", tags: ["kg-canvas"], stats: { kitsCut: 12 } });
    expect(nav.navigateCanvas).toHaveBeenCalledWith("kit-canvas");
    expect(nav.openImages).not.toHaveBeenCalled();
  });

  /* MỘT MÀN, MỘT ĐÍCH. `openImages` từng trỏ `/p/:id?section=images` — màn «Kết quả
     & xuất kit». Màn ấy đã bị xoá: thành phẩm nay nằm ngay dưới chân từng thẻ của khu
     soạn, nên "xem ảnh đã ra" và "mở dự án" là cùng một chỗ. Cái ca này còn canh là
     `openImages` đi qua ROUTE CÓ KIỂU (`to` + `params`), không tự ghép chuỗi. */
  it("`openImages` trỏ đúng khu soạn `/k/:id`", () => {
    const navigate = vi.fn();
    createNav(navigate as never).openImages("kit-a");
    expect(navigate).toHaveBeenCalledWith({ to: "/k/$projectId", params: { projectId: "kit-a" } });
  });

  /**
   * ĐẢO CHIỀU SAU IA PROMPT-FIRST — và đây mới là bảo đảm mạnh hơn.
   *
   * Bản trước canh rằng `/p/:id` chỉ đá người dùng về wizard KHI dự án chưa có ảnh.
   * Cái đá ngược ấy tồn tại vì `/p` từng vừa là nơi xem vừa là nơi sửa. Đợt "một màn
   * duy nhất" đã gỡ hẳn `/p`: chỉ còn `/k` — khu soạn, với thành phẩm treo ngay dưới
   * chân từng thẻ. Không còn hai phòng thì cũng không còn cửa nào để tự đá qua lại.
   *
   * Vì thế ca này chuyển sang canh PHỦ ĐỊNH: không một `navigate` tự động nào rời khỏi
   * `/p`. Tự-điều-hướng là đúng cái bệnh §B2 đã tốn hai người test mù để tìm ra (cờ
   * `completed` lật ⇒ dự án đầy ảnh bị đá về bước "Kiểm tra"), nên luật giá trị nhất
   * rút ra từ đó là: màn kết quả không tự đi đâu cả.
   */
  it("màn làm việc KHÔNG tự điều hướng đi đâu — vào /k là ở lại /k", () => {
    const src = readFileSync(join(SRC, "features/prompt-canvas/PromptCanvasScreen.tsx"), "utf8");
    expect(src).not.toContain("hasGeneratedOutput");
    expect(src).not.toMatch(/React\.useEffect\([^)]*navigate/);
  });

  /* Ca "wizard của dự án đã gen có đường sang trang kết quả" đã rút (Wave 4·B):
     nó đọc `WorkflowScreen.tsx`, và wizard không còn tồn tại. Ý định mà nó bảo vệ
     — "mở một dự án ĐÃ CÓ ẢNH thì đừng bắt đi lại từ đầu" — vẫn được canh ở ca
     ngay trên, chỗ `ProjectScreen` chỉ đá về khi `!hasGeneratedOutput`. Đó mới là
     nhánh quyết định thật; ca cũ chỉ canh cái lối thoát ở màn đích. */
});

/** Harness bé nhất có thể để chạy hook thật trong DOM thật. */
function IntentHarness({ search, run, clear }: { search: unknown; run: (i: CreateIntent) => void; clear: () => void }) {
  useCreateIntent(search, run, clear);
  return <p>home</p>;
}

describe("§W1-9 — ý định `?action=` được đọc, chạy đúng một lần, rồi dọn param", () => {
  it("đọc được create/import và bỏ qua rác đến từ URL", () => {
    expect(intentOf({ action: "create" })).toBe("create");
    expect(intentOf({ action: "import" })).toBe("import");
    expect(intentOf({ action: "xoá-hết" })).toBeNull();
    expect(intentOf({})).toBeNull();
    expect(intentOf(undefined)).toBeNull();
    expect(intentOf("create")).toBeNull();
  });

  it("`?action=create` mở dialog Tạo và xoá param ngay sau đó", () => {
    const run = vi.fn();
    const clear = vi.fn();
    render(<IntentHarness search={{ action: "create" }} run={run} clear={clear} />);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("create");
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("render lại KHÔNG mở lại dialog người dùng vừa đóng", () => {
    const run = vi.fn();
    const view = render(<IntentHarness search={{ action: "create" }} run={run} clear={() => {}} />);
    view.rerender(<IntentHarness search={{ action: "create" }} run={run} clear={() => {}} />);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("không có `?action=` thì không có gì xảy ra", () => {
    const run = vi.fn();
    const clear = vi.fn();
    render(<IntentHarness search={{ q: "tết" }} run={run} clear={clear} />);
    expect(run).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("màn Home có nối `useCreateIntent`, và đường CustomEvent đã bị bỏ hẳn", () => {
    const home = readFileSync(join(SRC, "features/projects/ProjectsScreen.tsx"), "utf8");
    expect(home).toContain("useCreateIntent(");
    /* `routes/setup.tsx` và `features/setup/hooks/use-setup-exit.ts` đã bị xoá
       07/09/2026 cùng wizard cài đặt — hai nơi từng dispatch CustomEvent. Nơi
       CÒN LẠI mà đường sự kiện cũ có thể mọc lại là khung app. */
    for (const file of ["components/layout/AppLayout.tsx"]) {
      const src = readFileSync(join(SRC, file), "utf8");
      expect(src, `${file} còn dispatch sự kiện không ai nghe`).not.toContain("dispatchEvent(new CustomEvent");
    }
  });
});
