/**
 * WAVE 2B — «ĐẸP · LIỀU LƯỢNG». Khoá lại từng con số mà wave này vừa chỉnh.
 *
 * Vì sao lại là test TĨNH trên mã nguồn + CSS, không phải test render: mọi thứ 2B
 * đụng đều là **liều lượng** — một cỡ chữ, một mức alpha, một cái vỏ. Không có
 * hành vi nào đổi, nên không có `expect(click)` nào bắt được nếu ai đó lỡ tay trả
 * chúng về chỗ cũ. Đây đúng cùng lối mà `qa-lead-regressions.test.ts` và
 * `w2a-system-beauty.test.ts` đã dùng, và là lối duy nhất có tác dụng ở đây.
 *
 * Mỗi ca dưới đây tương ứng một dòng trong `UPGRADE-PLAN.md` §WAVE 2B.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(new URL(".", import.meta.url).pathname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const GLOBALS = read("src/styles/globals.css");
/** globals.css KHÔNG có chú thích — dùng cho mọi phép "rule này phải BIẾN MẤT". */
const CSS_RULES = GLOBALS.replace(/\/\*[\s\S]*?\*\//g, " ");
const TOKENS = read("src/styles/tokens.css");
const CONFIG = read("tailwind.config.ts");
const FLORA = read("src/components/layout/flora.ts");

/** Mọi file nguồn (bỏ test) — dùng cho các phép quét toàn kho. */
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !p.includes("__tests__")) acc.push(p);
  }
  return acc;
}
/** Bỏ chú thích trước khi quét — bài học W2A-5: cổng đo CODE, không đo văn xuôi. */
const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));

const SRC = walk(join(ROOT, "src")).map((f) => ({
  path: f.slice(ROOT.length + 1),
  code: stripComments(readFileSync(f, "utf8")),
}));

/* ══════════════════════════════════════════════════════════════════════════════
   2B-1 · THANG DISPLAY 3 BẬC — mọi H1 cùng một cấp
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-1 · thang display + dọn `text-[Npx]`", () => {
  it.each(["display-1", "display-2", "display-3"])("`%s` có trong theme.fontSize", (k) => {
    expect(CONFIG).toMatch(new RegExp(`"${k}":\\s*\\[`));
  });

  it("bậc `display` 24px CŨ vẫn còn — 2B thêm bậc TRÊN nó, không thay nó", () => {
    expect(CONFIG).toMatch(/display:\s*\["24px"/);
  });

  /* Con bọ B6 (`lib/utils.ts`): thiếu tên bậc ở đây thì tailwind-merge xếp
     `text-display-1` vào nhóm MÀU CHỮ và nuốt `text-fg-strong` đứng sau nó.
     Chú thích trong utils.ts nói repo "có test canh" — trước 2B thì KHÔNG có. */
  it("FONT_SIZE_KEYS khớp ĐÚNG bộ khoá `theme.fontSize` (cn() mới phân biệt được cỡ/màu)", () => {
    const keys = [...read("src/lib/utils.ts").matchAll(/^\s*"([a-z0-9-]+)",$/gm)].map((m) => m[1]);
    const cfg = [...CONFIG.matchAll(/^\s{6}(?:"([a-z0-9-]+)"|([a-z]+)):\s*\[/gm)].map((m) => m[1] ?? m[2]);
    expect(new Set(keys)).toEqual(new Set(cfg));
  });

  it("const `DISPLAY` dùng thang, không còn giá trị ngoặc vuông", () => {
    const line = /export const DISPLAY = "([^"]+)"/.exec(FLORA)![1]!;
    expect(line).toBe("text-display-2 sm:text-display-1");
  });

  /* Toa gốc đếm 55, đếm lại thật là 66. Ngưỡng 3 = ba chỗ CỐ Ý còn lại, tất cả
     nằm ở `ProjectRail.tsx` (ĐÔNG LẠNH từ W1-13, không route nào render) — xem
     W2B-DONE §Cố ý chưa làm. Ai thêm chỗ mới sẽ đẩy số này lên và làm đỏ ca này. */
  it("`text-[Npx]` trong MÃ (không tính chú thích) chỉ còn ở file đông lạnh", () => {
    const hits = SRC.flatMap(({ path, code }) =>
      [...code.matchAll(/text-\[\d+px\]/g)].map(() => path),
    );
    expect([...new Set(hits)]).toEqual(["src/components/layout/ProjectRail.tsx"]);
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it("bốn H1 cấp trang đều đi qua `DISPLAY`, không màn nào tự khai cỡ", () => {
    for (const f of [
      "src/features/setup/components/StepShell.tsx",
      "src/features/project/ProjectSettingsScreen.tsx",
    ]) {
      expect(read(f)).toContain("DISPLAY");
    }
    expect(read("src/features/home/components/HomeHeader.tsx")).toContain("text-subtitle text-fg-strong");
    expect(read("src/features/home/components/HomeWorkspaceShell.tsx")).toContain("text-subtitle text-fg-strong");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   2B-2 · GOM 13 MỨC ALPHA ACCENT VỀ THANG HAI BẬC
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-2 · thang tint hai bậc, giảm liều mint", () => {
  it("tokens.css khai ĐỦ hai bậc ở CẢ hai theme", () => {
    expect([...TOKENS.matchAll(/--kg-tint-a:\s*([\d.]+);/g)].map((m) => m[1])).toEqual(["0.16", "0.12"]);
    expect([...TOKENS.matchAll(/--kg-tint-b:\s*([\d.]+);/g)].map((m) => m[1])).toEqual(["0.08", "0.06"]);
  });

  it("bậc B phải NHẠT hơn bậc A ở cả hai theme (nếu ngược thì hai bậc mất nghĩa)", () => {
    const a = [...TOKENS.matchAll(/--kg-tint-a:\s*([\d.]+);/g)].map((m) => Number(m[1]));
    const b = [...TOKENS.matchAll(/--kg-tint-b:\s*([\d.]+);/g)].map((m) => Number(m[1]));
    a.forEach((v, i) => expect(b[i]!).toBeLessThan(v));
  });

  /* ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA WAVE. W2A đếm 13 mức alpha accent tự chế.
     Sau 2B chỉ được còn HAI, và cả hai phải là biến — không con số nào gõ thẳng. */
  it("KHÔNG còn một mức alpha accent gõ tay nào trong toàn bộ src", () => {
    const offenders = SRC.flatMap(({ path, code }) =>
      [...code.matchAll(/bg-accent\/(\[[\d.]+\]|\d{1,3})(?![\w-])/g)].map((m) => `${path}: ${m[0]}`),
    );
    expect(offenders).toEqual([]);
  });

  it("nền tint accent chỉ đi qua `--kg-tint-a` hoặc `--kg-tint-b`", () => {
    const used = new Set(
      SRC.flatMap(({ code }) => [...code.matchAll(/bg-accent\/\[var\(--kg-([a-z-]+)\)\]/g)].map((m) => m[1]!)),
    );
    expect([...used].sort()).toEqual(["tint-a", "tint-b"]);
  });

  /* Ổ mint mà W2A CỐ Ý hoãn sang 2B (W2A-DONE §Kỷ luật mint) — nay phải xong. */
  it("`.element-card.selected` thôi dùng viền mint đặc", () => {
    const rule = /\.element-card\.selected\s*\{([^}]*)\}/.exec(GLOBALS)![1]!;
    expect(rule).not.toMatch(/border-accent(?![\w-])/);
    expect(rule).toContain("--kg-tint-b");
  });

  it("`.choice-card.selected` thôi là một HỘP mint (khối 'Có mascot', ảnh 08)", () => {
    const rule = /\.choice-card\.selected\s*\{([^}]*)\}/.exec(GLOBALS)![1]!;
    expect(rule).not.toMatch(/border-accent(?![\w-])/);
    expect(rule).toContain("--kg-tint-a");
  });

  /* Mục "phải giữ" #8: giảm LIỀU, tuyệt đối không bỏ vòng focus. */
  it("không wave nào lén bỏ ring focus", () => {
    expect(GLOBALS).toContain("ring-2 ring-focus-ring");
    expect(SRC.filter(({ code }) => /outline:\s*none/.test(code))).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   2B-3 · STEPPER NHẸ — KHỐI NÀY ĐÃ RÚT (Wave 4·B)

   Nó khoá liều lượng thị giác của hàng-6-bước: `.workflow-stepper` không được
   mang vỏ nặng, pill `active` chỉ khác ở màu chữ, không `w-fit`. Cả CSS lẫn
   `steps/Stepper.tsx` đã bị xoá cùng wizard, nên không còn đối tượng nào để đo.

   KHÔNG chuyển các khẳng định này sang màn soạn prompt: chúng nói về một hàng
   bước tuần tự, mà màn mới cố ý KHÔNG có bước nào. Viết lại chúng cho một thứ
   khác hình dạng là giữ cái tên test mà bỏ mất điều nó bảo vệ.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════════
   2B-4 · BA TẦNG TIÊU ĐỀ CÒN MỘT

   Hai ca đầu ("hero đầy đủ CHỈ ở bước ①", "nhãn trạng thái lưu ở MỌI bước") đọc
   thẳng `WorkflowScreen.tsx` — file đã xoá. Ca thứ ba đo `steps/BriefStep.tsx`,
   file VẪN SỐNG (`ProjectSettingsDialog` render nó), nên nó ở lại nguyên văn.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-4 · cắt tầng tiêu đề", () => {
  it("eyebrow 'Bước trong một mạch' đã bỏ khỏi mọi bước", () => {
    expect(stripComments(read("src/features/kit-core/steps/BriefStep.tsx"))).not.toContain("Bước trong một mạch");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   2B-5 · LUẬT PLAYFAIR THÀNH VĂN
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-5 · Playfair chỉ làm MỘT việc", () => {
  it("luật được ghi cạnh const SERIF, không nằm trong đầu ai đó", () => {
    expect(FLORA).toMatch(/LUẬT PLAYFAIR/);
    expect(FLORA).toContain("export const SERIF = \"font-serif italic font-normal\"");
  });

  /* `fonts.css` CHỈ nạp face italic — thiếu `italic` là xin một face không tồn tại
     và chỉ nghiêng nhờ UA stylesheet của <em>. Đúng trên màn nhưng mong manh. */
  it("`.workflow-hero h1 em` có `italic` TƯỜNG MINH", () => {
    const rule = /\.workflow-hero h1 em\s*\{([^}]*)\}/.exec(GLOBALS)![1]!;
    expect(rule).toContain("italic");
    expect(read("src/styles/fonts.css")).toMatch(/font-style:\s*italic/);
  });

  it("serif KHÔNG còn đè lên dữ liệu ở `.kitset-summary h3`", () => {
    const rule = /\.kitset-summary h3\s*\{([^}]*)\}/.exec(GLOBALS)![1]!;
    expect(rule).not.toContain("font-serif");
    expect(rule).toContain("font-sans");
  });

  it("`.preview-wheel` (Playfair 80px làm nội dung giả) đã xoá hẳn khỏi CSS", () => {
    // Đo LUẬT, không đo văn xuôi: chú thích của 2B có kể lại tên hai rule vừa xoá.
    expect(CSS_RULES).not.toMatch(/\.preview-wheel/);
    expect(CSS_RULES).not.toMatch(/\.preview-button/);
    expect(CSS_RULES).not.toMatch(/\.skeleton-shape/);
  });

  it("tiêu đề 2 từ 'Cài đặt' thôi nhấn serif (điều ③ của luật)", () => {
    expect(read("src/features/settings/SettingsScreen.tsx")).not.toContain("SERIF");
  });

  it("phần nhấn dài đúng MỘT từ ở H1 đang chạy thật của Home", () => {
    const accent = /H:\s*\{[^}]*accent:\s*"([^"]+)"/.exec(read("src/features/kitfile/lib/copy.ts"))![1]!;
    expect(accent.split(/\s+/)).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   2B-6 · DỌN SẠN
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-6 · sạn nhỏ nhưng lộ ngay", () => {
  it("`.summary-row` cuối cùng thôi kẻ một gạch lơ lửng", () => {
    expect(/\.summary-row\s*\{([^}]*)\}/.exec(GLOBALS)![1]!).toContain("last:border-b-0");
  });

  it("chip ảnh nằm TRONG khung vùng thả, không trôi ra ngoài", () => {
    expect(GLOBALS).toMatch(/\.dropfield\s*\{/);
    /* UI-FIX §3b — vùng thả ảnh nhân vật đã rời `steps/MascotStep.tsx` vào modal
       "Thêm nhân vật" (bước Mascot nay là danh sách thẻ). Luật thì KHÔNG đổi: thứ
       hiện ra sau khi thả phải nằm TRONG khung `.dropfield`, nên ca test chỉ đổi
       địa chỉ và tên mảnh xem trước, không nới điều kiện. */
    const cases: ReadonlyArray<[string, string]> = [
      ["src/features/kit-core/steps/StyleStep.tsx", "<RefChips"],
      ["src/features/kit-core/components/MascotDialog.tsx", "<MascotThumb"],
    ];
    for (const [f, preview] of cases) {
      const src = read(f);
      const i = src.indexOf('"dropfield');
      expect(i, f).toBeGreaterThan(-1);
      // Mảnh xem trước phải nằm SAU khi mở `.dropfield` và trước khi đóng nó.
      expect(src.indexOf(preview, i), f).toBeGreaterThan(i);
    }
  });

  it("nét đứt kiểu wireframe đã bỏ khỏi vùng thả", () => {
    expect(/\.dropzone\s*\{([^}]*)\}/.exec(GLOBALS)![1]!).not.toContain("border-dashed");
  });

  it("pill phiên bản thôi vỡ 3 dòng trên mobile", () => {
    expect(/\.workflow-project-pill\s*\{([^}]*)\}/.exec(GLOBALS)![1]!).toContain("whitespace-nowrap");
  });

  it("`.result-toolbar` dưới 640px là THẺ, trên 640px mới là pill", () => {
    const rule = /\.result-toolbar\s*\{([^}]*)\}/.exec(GLOBALS)![1]!;
    expect(rule).toContain("sm:rounded-full");
    expect(rule).toMatch(/rounded-4/);
  });

  it("dot-grid rời trang form + trang danh sách, GIỮ trên canvas (mục 'phải giữ' #10)", () => {
    expect(/\.workflow-page\s*\{([^}]*)\}/.exec(GLOBALS)![1]!).not.toContain("radial-gradient");
    expect(read("src/features/projects/ProjectsScreen.tsx")).not.toContain("DOTGRID");
    expect(read("src/features/kit-form/KitFormScreen.tsx")).not.toContain("DOTGRID");
    expect(read("src/features/design/components/SheetCanvas.tsx")).toContain("DOTGRID");
    expect(GLOBALS).toMatch(/\.kg-dotgrid\s*\{/); // tiện ích còn nguyên
  });

  it("toast lỗi có đường tự thoát và vẫn giữ nút đóng thủ công", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toMatch(/error:\s*12_000/);
    expect(sonner).toMatch(/duration=\{KG_TOAST_DURATION\.info\}/);
    /* Phải khoá đúng PROP boolean `closeButton` trên `<Sonner>`, không phải chuỗi
       "closeButton" — chuỗi đó còn sống trong `classNames` kể cả khi prop đã bị gỡ,
       và bản đầu của ca này đã để lọt đúng mutation ấy. */
    expect(sonner).toMatch(/^\s*closeButton\s*$/m);
    expect(sonner).toContain("--toast-close-button-end");
  });

  /* P-SWEEP đổi CÁI ĐƯỢC GHI ĐÈ, không nới cổng: sonner vẫn phải bị `!` thắng.
     · nền: `!bg-accent` → `!bg-transparent` — "Hoàn tác" là nút PHỤ của một thông
       báo phụ, không được là vật nổi nhất màn hình (mục 5 của POLISH-SWEEP);
     · bo: `!rounded-full` → `!rounded-1` — bo 8px nay là bo của MỌI nút trong repo
       (`button.tsx` base), pill chỉ còn cho chip/badge.
     Điều ca này canh vẫn nguyên: phải có `!` trên `bg-*` và trên `rounded-*`, nếu
     không CSS built-in (0,3,0) của sonner thắng và nút ra màu TRẮNG. */
  it("nút hành động của toast thắng được CSS built-in của sonner", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toMatch(/actionButton:\s*"[^"]*!bg-transparent/);
    expect(sonner).toMatch(/actionButton:\s*"[^"]*!rounded-1/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   2B-7 · DỌN JARGON
   ══════════════════════════════════════════════════════════════════════════════ */
describe("2B-7 · chữ của người dùng, không phải của lập trình viên", () => {
  /* Giới hạn nói thẳng: `.element-card` / `.element-list` là TÊN CLASS, không phải
     chữ người dùng đọc — chúng nằm trong CSS và đổi tên chúng là churn thuần.
     Bộ lọc dưới đây bỏ đúng hình dạng "danh sách class" (toàn chữ thường + gạch
     nối + khoảng trắng); mọi câu tiếng Việt đều có dấu hoặc chữ hoa nên vẫn lọt lưới. */
  const looksLikeClassList = (s: string) => /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(s);

  /* `ReviewStep` đã rời danh sách vì file bị xoá cùng wizard (Wave 4·B). Bốn màn
     còn lại vẫn LIVE — chúng là ruột của `ProjectScreen` và `ProjectSettingsDialog`
     — nên luật "không nói 'element' với người dùng" vẫn có đủ chỗ để canh. */
  it("màn workflow không còn nói 'element' với người dùng", () => {
    for (const f of ["KitsetStep", "BriefStep", "StyleStep", "MascotStep"]) {
      const code = stripComments(read(`src/features/kit-core/steps/${f}.tsx`));
      const quoted = [...code.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]!).filter((s) => !looksLikeClassList(s));
      const jsxText = [...code.matchAll(/>([^<>{}\n]+)</g)].map((m) => m[1]!);
      expect([...quoted, ...jsxText].filter((s) => /\belement\b/i.test(s))).toEqual([]);
    }
  });

  /* Nửa sau của ca này đo `steps/ReviewStep.tsx` (thẻ recap "N thành phần") —
     màn Kiểm tra của wizard, đã xoá. Nửa còn lại vẫn đo được và vẫn đáng đo. */
  it("nhãn ô tìm nói 'thành phần'", () => {
    expect(read("src/features/kit-core/steps/KitsetStep.tsx")).toContain('placeholder="Tìm thành phần…"');
  });

  it("màn thành phẩm không còn panel kỹ thuật cắt/chroma", () => {
    const src = read("src/features/project/sections/ImagesSection.tsx");
    expect(src).toContain("GeneratedResults");
    expect(src).not.toContain("result-chroma");
    expect(src).not.toContain("Cắt lại");
    expect(src).not.toContain("slice.run()");
  });
});
