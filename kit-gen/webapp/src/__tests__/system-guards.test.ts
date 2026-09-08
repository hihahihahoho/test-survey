/**
 * CỔNG HỆ THỐNG — những luật TĨNH không thuộc về một màn nào, nên không chết
 * theo màn. Gộp từ `visual-debt-a1.test.ts` (bo góc semantic) và `final-fix.test.ts`
 * (toast, preload font) sau khi các ca khoá wizard/màn kết quả cũ bị gỡ.
 *
 * Vì sao là test đọc-nguồn chứ không phải test hành vi: cả ba nhóm đều là **giá
 * trị tĩnh** — một chuỗi class, một thuộc tính CSS của toast, thứ tự thẻ trong
 * `index.html`. jsdom không có layout engine, `npm run contrast` chỉ đo màu, và
 * `npm run deadclass` chỉ hỏi "class có sinh CSS không". Cả ba cổng đó xanh y
 * nguyên nếu ai đó gõ lại `rounded-[14px]` hay dời `<base>` xuống dưới `<title>`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Bỏ chú thích trước khi so: các file liên quan đều CÓ comment kể lại giá trị CŨ
 *  đã bị loại, quét thô sẽ báo động giả trên chính lời giải thích. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** mọi file nguồn .ts/.tsx trong src, bỏ test */
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !p.includes("__tests__")) acc.push(p);
  }
  return acc;
}

/* ══════════════════════════════════════════════════════════════════════════════
   A1 · BO GÓC THEO THANG SEMANTIC FLORA (8/12/16/20/24/999)
   ══════════════════════════════════════════════════════════════════════════════ */
describe("A1 · bo góc theo thang semantic FLORA", () => {
  it("không còn `rounded-[Npx]` trong glob A", () => {
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, "src"))) {
      const rel = f.slice(ROOT.length + 1);
      // 2 chỗ NGOÀI glob A, đã ghi NEEDS-fe2-a.md #2 — không phải nợ của A1
      if (rel.includes("components/layout/ProjectRail.tsx")) continue;
      if (rel.includes("components/layout/FloraShell.tsx")) continue;
      for (const m of stripComments(readFileSync(f, "utf8")).match(/rounded-\[[^\]]+\]/g) ?? []) {
        if (m === "rounded-[inherit]") continue; // kế thừa từ host, không phải giá trị thiết kế
        offenders.push(`${rel}: ${m}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   V1 · NÚT ✕ ĐÈ LÊN TIÊU ĐỀ TOAST
   `[data-close-button]` là position:absolute ⇒ không đẩy được chữ. Tiêu đề phải
   tự chừa chỗ.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("V1 · tiêu đề toast chừa chỗ cho nút đóng", () => {
  const SONNER = read("src/components/ui/sonner.tsx");

  it("class `title` của Toaster có padding phải", () => {
    const title = SONNER.match(/\n\s*title:\s*"([^"]+)"/)?.[1] ?? "";
    expect(title).toMatch(/\bpr-\d/);
  });

  it("nút ✕ vẫn còn dù toast lỗi cũng tự đóng", () => {
    expect(SONNER).toMatch(/\bcloseButton\b/);
    expect(SONNER).toMatch(/error:\s*12_000/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   V7 · PRELOAD FONT 404 TRÊN ROUTE LỒNG
   `vite base:"./"` viết href thành `./fonts/…`; ở `/app/k/<id>` nó ra
   `/app/k/fonts/…`. `<base>` đặt SAU thì đã muộn — nó chỉ đổi cách phân giải của
   phần tử phân tích sau nó.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("V7 · preload font phải là đường tuyệt đối theo base app", () => {
  const INDEX = read("index.html");

  it("không còn thẻ <link rel=preload> tĩnh trỏ font bằng đường tương đối/gốc", () => {
    expect(INDEX).not.toMatch(/<link[^>]*rel="preload"[^>]*fonts\//);
  });

  it("preload do script dựng, href ghép từ `base` (⇒ tuyệt đối)", () => {
    expect(INDEX).toMatch(/link\.rel\s*=\s*"preload"/);
    expect(INDEX).toMatch(/link\.href\s*=\s*base\s*\+\s*"fonts\/"/);
    expect(INDEX).toMatch(/geist-latin\.woff2/);
    expect(INDEX).toMatch(/playfair-latin\.woff2/);
  });

  it("khối <base> đứng TRƯỚC <title> và trước script module của Vite", () => {
    const baseAt = INDEX.indexOf('el.setAttribute("href", base)');
    // `<title>` cũng xuất hiện trong chú thích dòng 2 — neo vào thẻ THẬT.
    const titleAt = INDEX.indexOf("<title>kit-gen");
    const viteAt = INDEX.indexOf('<script type="module"');
    expect(baseAt).toBeGreaterThan(-1);
    expect(baseAt).toBeLessThan(titleAt);
    expect(baseAt).toBeLessThan(viteAt);
  });
});
