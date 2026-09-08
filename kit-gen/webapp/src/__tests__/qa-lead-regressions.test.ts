/**
 * KHOÁ HỒI QUY — QA LEAD (teams/react/VERDICT.md).
 *
 * Mọi ca ở đây bắt một lỗi CAO đã từng lọt qua CẢ `tsc`, CẢ `vitest`, CẢ `vite build`.
 * Đó là lý do chúng phải là test tĩnh trên MÃ NGUỒN và trên CSS ĐÃ BIÊN DỊCH: bốn cổng
 * kiểm định cũ đều xanh trong khi 6 class không hề sinh ra CSS và mọi modal rộng bằng
 * cả màn hình. Ai "dọn dẹp" các chỗ này về trạng thái cũ sẽ thấy test đỏ ngay.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(new URL(".", import.meta.url).pathname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("V-1 · class Tailwind phải TỒN TẠI trong bảng màu của repo", () => {
  /* `tailwind.config.ts` khai `theme.colors` (không phải `theme.extend.colors`) ⇒ xoá
     sạch palette mặc định, KHÔNG CÒN `white`. Mọi `bg-white/[…]` là style chết. */
  const files = [
    "src/components/ui/button.tsx",
    "src/components/layout/flora.ts",
    "src/components/layout/ProjectRail.tsx",
    "src/components/layout/AppBreadcrumb.tsx",
    "src/components/layout/FloraShell.tsx",
  ];
  it.each(files)("%s không dùng token `white` (đã bị config xoá)", (f) => {
    expect(read(f)).not.toMatch(/(bg|border|text)-white\b|white\/\[/);
  });

  it("bảng màu KHÔNG có `white` ⇒ phải dùng `fg-strong` (255 255 255)", () => {
    const cfg = read("tailwind.config.ts");
    expect(cfg).not.toMatch(/^\s*white:/m);
    expect(cfg).toContain('strong: c("fg-strong")');
  });
});

describe("V-2 · 4 cỡ modal phải có trong nhóm `maxWidth`", () => {
  it("dialog.tsx dùng sm:max-w-modal-* ⇒ config phải khai maxWidth", () => {
    expect(read("src/components/ui/dialog.tsx")).toContain("sm:max-w-modal-md");
    const cfg = read("tailwind.config.ts");
    const maxWidth = cfg.slice(cfg.indexOf("maxWidth:"), cfg.indexOf("maxHeight:"));
    for (const k of ["modal-sm", "modal-md", "modal-lg", "modal-xl"]) {
      expect(maxWidth).toContain(`"${k}"`);
    }
  });
});

describe("V-3 · mốc <768px là CHỈ-ĐỌC THẬT (audit M5)", () => {
  it("gate có `useNarrowViewport` và `gateOf` nhận cờ narrow", () => {
    const gate = read("src/features/projects/lib/gate.ts");
    expect(gate).toContain("export function useNarrowViewport");
    expect(gate).toMatch(/gateOf\(status: ConnectionStatus, narrow = false\)/);
  });
  it.each([
    "src/features/projects/ProjectsScreen.tsx",
    "src/features/kit/KitScreen.tsx",
    /* `features/project/ProjectScreen.tsx` ĐÃ XOÁ cùng đợt "một màn duy nhất" — màn
       «Kết quả & xuất kit» không còn, và hàng cửa ra của nó (cùng cái `gate` này)
       nay nằm trong `PromptCanvasScreen`. */
    "src/features/prompt-canvas/PromptCanvasScreen.tsx",
    "src/features/project/ProjectSettingsScreen.tsx",
    "src/features/runs/RunsScreen.tsx",
    "src/features/runs/RunDetailScreen.tsx",
  ])("%s truyền narrow vào gate", (f) => {
    expect(read(f)).toContain("gateOf(status, narrow)");
  });
  it("S3 (trình soạn) cũng khoá ghi khi màn hẹp", () => {
    expect(read("src/features/design/lib/useDesignEditor.ts")).toContain("const readOnly = narrow ||");
  });
});

describe("V-4 · S3 xếp DỌC dưới 1024px", () => {
  it("SheetsWorkspace đổi orientation theo bề rộng", () => {
    const s = read("src/features/design/components/SheetsWorkspace.tsx");
    expect(s).toContain("useCompactViewport");
    expect(s).toContain('compact ? "vertical" : "horizontal"');
  });
});

describe("V-5 · Tabs phải có TabsContent (aria-controls không được trỏ hư không)", () => {
  it.each([
    /* Ruột của Cài đặt đã rời `SettingsScreen` sang `SettingsDialog` — cùng một dialog
       cho `/settings` và cho bánh răng topbar trong dự án. `<Tabs>` đi theo ruột, nên
       phép kiểm này phải soi đúng chỗ có `<Tabs>`, không phải chỗ có cái tên cũ. */
    "src/features/settings/SettingsDialog.tsx",
    "src/features/kit/KitScreen.tsx",
    "src/features/design/DesignScreen.tsx",
  ])("%s có TabsContent", (f) => {
    expect(read(f)).toContain("<TabsContent");
  });

  /** Phủ định đi kèm: file nào KHÔNG còn `<Tabs>` thì cũng không được sót `<TabsList>`. */
  it("SettingsScreen không còn giữ mảnh Tabs mồ côi", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    expect(screen).not.toContain("<Tabs");
    expect(screen).not.toContain("<TabsContent");
  });
});

describe("V-6 · tương phản: nút chính KHÔNG dùng accent alpha cho hover/active", () => {
  it("button.tsx dùng token đặc accent-hover / accent-active", () => {
    const s = read("src/components/ui/button.tsx");
    expect(s).toContain("hover:bg-accent-hover active:bg-accent-active");
    expect(s).not.toContain("accent/80");
  });
  it("tokens.css khai đủ 2 token cho cả dark lẫn light", () => {
    const css = read("src/styles/tokens.css");
    expect(css.match(/--kg-accent-hover:/g)?.length).toBe(2);
    expect(css.match(/--kg-accent-active:/g)?.length).toBe(2);
  });
});

describe("V-7 · biến khung phải được KHAI, không sống bằng fallback", () => {
  it("--kg-header có thật và khớp header 56px", () => {
    expect(read("src/styles/tokens.css")).toContain("--kg-header: 56px");
    expect(read("tailwind.config.ts")).toContain('header: "56px"');
    expect(read("src/components/layout/FloraShell.tsx")).toContain("h-14");
  });
});

describe("V-8 · không hứa phím tắt mà mã không hề xử lý", () => {
  it("tooltip menu ⋯ không còn nhắc Shift+F10", () => {
    expect(read("src/features/projects/components/ProjectMenu.tsx")).not.toContain(
      "Thao tác khác (Shift+F10)",
    );
  });
});

describe("V-9 · sàn chữ 12px (audit I3) không được thủng", () => {
  /* ĐỔI ĐỊA CHỈ, KHÔNG ĐỔI LUẬT. Chỗ thủng sàn ban đầu là `WizardStepper.tsx` của
     wizard cài đặt; wizard đã bị xoá 07/09/2026. Bốn mảnh dưới đây là phần THỪA KẾ
     trực tiếp của nó (dời sang `features/settings/parts/` cùng đợt) — đúng chỗ mà
     một `text-[11px]` chép lại từ mã cũ sẽ mọc lên. */
  it.each([
    "src/features/settings/parts/StepCard.tsx",
    "src/features/settings/parts/DoctorChecklist.tsx",
    "src/features/settings/parts/ImageGenCard.tsx",
    "src/features/settings/parts/WorkspacePicker.tsx",
  ])("%s không còn text-[11px]/text-[10px]", (f) => {
    expect(read(f)).not.toMatch(/text-\[(10|11)px\]/);
  });
});

describe("V-10 · preview ảnh không lồng ổ cuộn", () => {
  /* ĐỔI ĐỊA CHỈ, KHÔNG ĐỔI LUẬT. Popup xem ảnh ở độ nét thật từng là
     `AssetZoomDialog` trong `kit-core/components/CutAssetGrid.tsx`; component đó đã bị
     xoá cùng IA prompt-first. Popup tương đương nay nằm ở cuối `SheetResultPanel`
     (tab «Ảnh gốc» → bấm vào ảnh), và bệnh cần chặn vẫn y nguyên: hai ổ cuộn lồng
     nhau thì bánh xe chuột lăn trong cái trong, người dùng tưởng trang đơ. */
  const source = () => read("src/features/prompt-canvas/components/result/SheetResultPanel.tsx");
  const preview = () => source().slice(source().indexOf("<Dialog open={zoom}"));

  it("chỉ DialogBody giữ overflow-y-auto; khung ảnh không tạo overflow riêng", () => {
    expect(preview()).not.toMatch(/overflow-(?:x-)?auto|overflow-(?:x-)?scroll/);
    expect(preview()).toContain("!max-h-[min(90dvh,720px)]");
  });

  it("DialogBody là vùng nổi có overscroll-contain để Radix khóa nền", () => {
    const dialog = read("src/components/ui/dialog.tsx");
    expect(dialog).toContain("overflow-y-auto overscroll-contain");
    expect(dialog).toContain("DialogPrimitive.Content");
  });
});
