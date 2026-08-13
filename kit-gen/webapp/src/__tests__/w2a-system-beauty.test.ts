/**
 * WAVE 2A — «ĐẸP-HỆ-THỐNG» · cổng chống hồi quy ở tầng TOKEN / PRIMITIVE.
 *
 * Vì sao là test đọc-nguồn chứ không phải test hành vi: mọi thứ W2A sửa đều là
 * **giá trị thiết kế** — bóng, bậc nền, một class shell, chuỗi class của primitive.
 * jsdom không có layout engine nên không "nhìn" được chúng; `npm run contrast` chỉ
 * đo màu; `npm run deadclass` chỉ hỏi "class có sinh CSS không". Cả ba cổng đó đều
 * xanh y nguyên nếu ai đó lặng lẽ trả `bg-accent` về cho ray slider hay thêm lại
 * `border-b` mặc định cho modal. Đây là cổng khoá chính chuỗi class đó.
 *
 * Cùng khuôn với `__tests__/visual-debt-a1.test.ts` (FE-2·A1) — kể cả việc XOÁ CHÚ
 * THÍCH trước khi so: các file W2A sửa đều có comment kể lại giá trị CŨ, quét thô sẽ
 * báo động giả trên chính lời giải thích.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** bỏ `/*…*\/` và `//…` — giữ nguyên phần code thật */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const TOKENS = strip(read("src/styles/tokens.css"));
const GLOBALS = strip(read("src/styles/globals.css"));
/** khối dark = từ `:root, .dark {` tới `}` đầu tiên — KHÔNG lẫn sang `.light` */
const DARK = TOKENS.slice(TOKENS.indexOf(":root,"), TOKENS.indexOf(".light"));
const LIGHT = TOKENS.slice(TOKENS.indexOf(".light"));
const rgbOf = (block: string, name: string) => {
  const m = block.match(new RegExp(`--kg-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`không thấy --kg-${name}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
};
const sum = (v: [number, number, number]) => v[0] + v[1] + v[2];

describe("W2A-1 · độ sâu của dark phải THẬT SỰ vẽ ra được gì đó", () => {
  it("3 bậc bóng đều có ring trắng mờ — bóng đen thuần trên nền đen là no-op", () => {
    for (const n of [1, 2, 3]) {
      const m = DARK.match(new RegExp(`--kg-shadow-${n}:([^;]+);`));
      expect(m, `--kg-shadow-${n} phải tồn tại trong khối dark`).toBeTruthy();
      // `0 0 0 1px rgb(255 255 255 / …)` = vành ngoài bắt sáng, thay viền chết
      expect(m![1]).toMatch(/0 0 0 1px rgb\(255 255 255 \/ 0?\.\d+\)/);
    }
  });

  it("bậc 2 và 3 có thêm gờ sáng inset ở cạnh trên", () => {
    for (const n of [2, 3]) {
      const m = DARK.match(new RegExp(`--kg-shadow-${n}:([^;]+);`))!;
      expect(m[1]).toMatch(/inset 0 1px 0 rgb\(255 255 255 \/ 0?\.\d+\)/);
    }
  });

  it("KHÔNG bậc nào còn là bóng đen thuần một mình", () => {
    for (const n of [1, 2, 3]) {
      const v = String(DARK.match(new RegExp(`--kg-shadow-${n}:([^;]+);`))?.[1]);
      expect(v.includes("255 255 255"), `--kg-shadow-${n} chỉ có màu đen`).toBe(true);
    }
  });

  it("hết ĐẢO LỚP: overlay phải SÁNG HƠN raised, raised sáng hơn surface", () => {
    expect(sum(rgbOf(DARK, "overlay"))).toBeGreaterThan(sum(rgbOf(DARK, "raised")));
    expect(sum(rgbOf(DARK, "raised"))).toBeGreaterThan(sum(rgbOf(DARK, "surface")));
  });

  it("light: dialog/menu không được tối hơn input phía dưới", () => {
    expect(sum(rgbOf(LIGHT, "overlay"))).toBeGreaterThan(sum(rgbOf(LIGHT, "raised")));
  });

  it("khối .light KHÔNG bị đụng — ở đó bóng vốn đã hoạt động đúng", () => {
    // bóng theme sáng vẫn là mực #151516, không có ring trắng nào
    expect(LIGHT).toContain("--kg-shadow-1: 0 1px 2px rgb(21 21 22 / 0.1)");
    expect(LIGHT).toContain("--kg-shadow-2: 0 4px 12px rgb(21 21 22 / 0.14)");
    expect(LIGHT).toContain("--kg-shadow-3: 0 16px 48px rgb(21 21 22 / 0.2)");
  });
});

describe("W2A-2 · MỘT lưới cho cả app", () => {
  it("`.kg-page` tồn tại và là container duy nhất được khai", () => {
    expect(GLOBALS).toMatch(/\.kg-page\s*\{[^}]*max-w-\[1280px\]/);
    expect(GLOBALS).toMatch(/\.kg-page\s*\{[^}]*mx-auto/);
  });

  it("6 khối cấp trang đều đeo `.kg-page`", () => {
    const users: Array<[string, string]> = [
      ["src/features/projects/ProjectsScreen.tsx", "Home"],
      ["src/features/home/components/HomeWorkspaceShell.tsx", "Settings và thư viện"],
      ["src/features/workflow-v4/WorkflowScreen.tsx", "Workflow"],
      ["src/features/workflow-v4/steps/Stepper.tsx", "Stepper workflow"],
      ["src/components/layout/FloraShell.tsx", "ruột header"],
      ["src/features/kit-form/KitFormScreen.tsx", "KitForm"],
    ];
    for (const [file, label] of users) {
      expect(strip(read(file)), `${label} phải dùng .kg-page`).toContain("kg-page");
    }
  });

  it("các container trang CŨ đã biến mất khỏi code thật", () => {
    expect(strip(read("src/features/projects/ProjectsScreen.tsx"))).not.toContain("max-w-[1600px]");
    expect(strip(read("src/features/settings/SettingsScreen.tsx"))).not.toContain("max-w-4xl");
    expect(GLOBALS).not.toContain("max-w-6xl");
    // `max-w-content` là class CHẾT (không có bậc `content` trong tailwind.config)
    for (const f of walkSrc(join(ROOT, "src"))) {
      expect(strip(readFileSync(f, "utf8")), f).not.toContain("max-w-content");
    }
  });

  it("`.workflow-page` KHÔNG còn padding ngang — nếu còn, mép trái lại lệch 16px", () => {
    const rule = GLOBALS.match(/\.workflow-page\s*\{([^}]*)\}/)![1];
    expect(rule).not.toMatch(/\bpx-\d/);
    expect(rule).not.toMatch(/\bsm:px-\d/);
    expect(rule).not.toMatch(/\blg:px-\d/);
  });

  it("hairline header vẫn FULL-BLEED (ở thẻ <header>, không ở ruột `.kg-page`)", () => {
    const shell = strip(read("src/components/layout/FloraShell.tsx"));
    expect(shell).toMatch(/<header className=\{cn\("sticky top-0 z-sticky h-14 shrink-0 border-b"/);
  });
});

describe("W2A-3 · không còn control thô của hệ điều hành", () => {
  it("6 file step của workflow-v4 KHÔNG còn thẻ `<select>` nào", () => {
    for (const f of walkSrc(join(ROOT, "src/features/workflow-v4"))) {
      expect(strip(readFileSync(f, "utf8")), f).not.toMatch(/<select[\s>]/);
    }
  });

  /* Bước ⑥ "Kết quả" đã bỏ; nhà mới của màn thành phẩm là tab "Ảnh đã tạo" của dự án.
     Hợp đồng giữ nguyên chữ: ưu tiên thành phẩm, không nhét control kỹ thuật vào đó. */
  it("màn thành phẩm ưu tiên thành phẩm, không đưa control kỹ thuật vào màn chính", () => {
    const s = strip(read("src/features/project/sections/ImagesSection.tsx"));
    expect(s).toContain("<GeneratedResults");
    expect(s).not.toContain('<select');
    expect(s).not.toContain('result-chroma');
  });

  it("rule chồng style `.result-toolbar select` đã xoá", () => {
    expect(GLOBALS).not.toMatch(/\.result-toolbar select\s*\{/);
  });

  it("`.color-swatch` thôi hardcode đỏ; màu do component truyền theo chroma", () => {
    const rule = GLOBALS.match(/\.color-swatch\s*\{([^}]*)\}/)![1];
    expect(rule).not.toContain("bg-danger");
    expect(strip(read("src/features/workflow-v4/steps/StyleStep.tsx"))).toContain("CHROMA_HEX[s.chroma]");
  });

  it("ô màu đổi hình thái: `.color-field` chấm tròn + hex mono", () => {
    expect(GLOBALS).toMatch(/\.color-field\s*\{/);
    expect(GLOBALS).toMatch(/\.color-field input\[type="color"\]\s*\{[^}]*size-9/);
    expect(strip(read("src/features/workflow-v4/steps/StyleStep.tsx"))).toContain('className="color-field"');
  });
});

describe("W2A-4 · slider: mint là NHẤN, không phải NỀN", () => {
  const s = strip(read("src/components/ui/slider.tsx"));

  it("ray KHÔNG còn tô mint đặc", () => {
    expect(s).not.toMatch(/Range[^/]*bg-accent/);
    expect(s).toMatch(/SliderPrimitive\.Range className="absolute h-full bg-line"/);
  });

  it("có vạch mốc giữa — thang lưỡng cực phải nhìn ra cái GIỮA", () => {
    expect(s).toMatch(/after:left-1\/2/);
    expect(s).toMatch(/after:bg-line-subtle/);
  });

  it("CHỈ núm giữ mint", () => {
    expect(s).toMatch(/Thumb[\s\S]{0,200}border-accent/);
  });
});

describe("W2A-5 · ba class mồ côi nay có thân thật", () => {
  it.each(["workflow-choice", "brand-ref", "mascot-dropzone"])("`.%s` có rule trong CSS", (cls) => {
    expect(GLOBALS).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
  });

  it("cổng deadclass có LUẬT ② bắt class mồ côi, không chỉ allowlist tên cứng", () => {
    const gate = read("scripts/check-dead-classes.mjs");
    expect(gate).toContain("class MỒ CÔI");
    expect(gate).toContain("classNameExpr");
  });
});

describe("W2A-6 · vòng focus một lớp + hai vỏ modal là MỘT", () => {
  it("`:focus-visible` thu về phần tử tương tác thật, không áp lên mọi container", () => {
    expect(GLOBALS).toMatch(
      /:where\(a, button, input, select, textarea, summary, \[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible/,
    );
    expect(GLOBALS).not.toMatch(/^\s*:focus-visible\s*\{/m);
  });

  it("ring ÔM SÁT control — không còn khe đen 2px ở đâu trong primitive", () => {
    expect(GLOBALS).toContain("ring-offset-0");
    for (const f of walkSrc(join(ROOT, "src/components/ui"))) {
      expect(strip(readFileSync(f, "utf8")), f).not.toContain("ring-offset-2");
    }
  });

  it("KHÔNG được bỏ ring — repo vẫn không có `outline: none` ở đâu cả", () => {
    expect(GLOBALS).toContain("ring-2 ring-focus-ring");
    for (const f of walkSrc(join(ROOT, "src"))) {
      expect(strip(readFileSync(f, "utf8")), f).not.toMatch(/outline:\s*none/);
    }
  });

  it("vỏ `alert-dialog` khớp `dialog`: cùng bo góc và nền đặc", () => {
    const a = strip(read("src/components/ui/alert-dialog.tsx"));
    const d = strip(read("src/components/ui/dialog.tsx"));
    const SHELL = "rounded-5 border border-line-subtle bg-overlay shadow-3 duration-2";
    expect(a).toContain(SHELL);
    expect(d).toContain(SHELL);
  });

  it("alert-dialog GIỮ luật không-kẻ của W1-5 (thân một dòng thì kẻ thành cái bẫy)", () => {
    const a = strip(read("src/components/ui/alert-dialog.tsx"));
    expect(a).not.toMatch(/AlertDialogHeader[\s\S]{0,200}border-b/);
    expect(a).not.toMatch(/AlertDialogFooter[\s\S]{0,200}border-t/);
  });

  it("bỏ ring mint quanh MỌI item menu — nền tint nói đủ", () => {
    for (const f of ["command.tsx", "select.tsx", "dropdown-menu.tsx"]) {
      const s = strip(read(`src/components/ui/${f}`));
      expect(s, f).not.toContain("ring-accent");
      expect(s, f).not.toContain("ring-inset");
    }
  });
});

/** mọi file nguồn .ts/.tsx, bỏ test */
function walkSrc(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, acc);
    else if (/\.tsx?$/.test(e.name) && !p.includes("__tests__")) acc.push(p);
  }
  return acc;
}
