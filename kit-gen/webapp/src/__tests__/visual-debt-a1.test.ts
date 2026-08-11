/**
 * FE-2 · A1 — khoá ba món nợ thị giác của FE-1, để không ai vô tình mở lại.
 *
 * Vì sao cần test này khi đã có `npm run contrast` + `npm run deadclass`:
 *  ① `check-contrast.mjs` chỉ đo cặp màu nào ĐANG CÓ trong src. Nếu ai đổi
 *     `bg-scroll-thumb` về `bg-line/40` thì cổng bắt được (đã mutation-test),
 *     NHƯNG nếu ai xoá khai báo màu trong `tailwind.config.ts` thì class chỉ
 *     lặng lẽ không sinh CSS — contrast KHÔNG thấy gì.
 *  ② `check-dead-classes.mjs` đáng lẽ bắt ca đó, nhưng `WATCH` của nó là
 *     danh sách TÊN cứng (white|black|modal-*|gray|…) nên `bg-scroll-thumb`
 *     nằm ngoài tầm. Tôi đã mutation-test và xác nhận nó KHÔNG bắt (xem
 *     A1-REPORT §4.2). Script đó ngoài glob A ⇒ không sửa, chặn bằng test này.
 *
 * Test đọc file nguồn dạng text — cố ý. Đây là cổng chống hồi quy trên CHÍNH
 * chuỗi class, không phải test hành vi component.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Bỏ chú thích trước khi so class: các file A1 sửa đều CÓ comment kể lại class
 *  CŨ đã bị loại (`bg-line/40`…). Quét thô sẽ báo động giả trên chính lời giải
 *  thích. Cùng cách xử lý mà `check-contrast.mjs` đang dùng. */
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

describe("A1 · thumb thanh cuộn dùng token ĐẶC (WCAG 1.4.11)", () => {
  const src = stripComments(read("src/components/ui/scroll-area.tsx"));

  it("ScrollAreaThumb không còn dùng `bg-line/<alpha>`", () => {
    // `bg-line/40` composite = 1.59:1 trên nền đen — thumb là ĐIỀU KHIỂN, cần ≥3:1
    expect(src).not.toMatch(/bg-line\/\d+/);
  });

  it("ScrollAreaThumb dùng đúng hai token đặc", () => {
    expect(src).toContain("bg-scroll-thumb");
    expect(src).toContain("hover:bg-scroll-thumb-hover");
  });

  it("`scroll-thumb` ĐƯỢC KHAI trong tailwind.config — nếu thiếu, class chết âm thầm", () => {
    // Đây là ca mà `check-dead-classes.mjs` bỏ lọt (WATCH là allowlist tên cứng).
    const cfg = read("tailwind.config.ts");
    expect(cfg).toMatch(/"scroll-thumb":\s*\{[^}]*DEFAULT:\s*c\("scroll-thumb"\)/);
    expect(cfg).toMatch(/hover:\s*c\("scroll-thumb-hover"\)/);
  });

  it("hai biến CSS nền tảng tồn tại ở CẢ dark và light", () => {
    const tokens = read("src/styles/tokens.css");
    expect(tokens.match(/--kg-scroll-thumb:/g)).toHaveLength(2);
    expect(tokens.match(/--kg-scroll-thumb-hover:/g)).toHaveLength(2);
  });
});

describe("A1 · bo góc theo thang semantic FLORA (8/12/16/20/24/999)", () => {
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

describe("A1 · `.kg-floatbar` có đủ đường lùi (NEEDS-fe1-b2 N1)", () => {
  const css = read("src/styles/globals.css");
  const rule = css.slice(css.indexOf(".kg-floatbar"));

  it("tầng ① mặc định là nền ĐẶC, KHÔNG alpha và KHÔNG blur", () => {
    const base = rule.slice(0, rule.indexOf("supports-["));
    expect(base).toMatch(/@apply[^;]*\bbg-overlay\b/);
    expect(base).not.toMatch(/bg-overlay\/\d+/);
    expect(base).not.toMatch(/backdrop-blur-(?!none)/);
  });

  it("tầng ② alpha + blur chỉ bật trong @supports", () => {
    expect(rule).toContain("supports-[backdrop-filter:blur(0px)]:bg-overlay/90");
    expect(rule).toContain("supports-[backdrop-filter:blur(0px)]:backdrop-blur-xl");
  });

  it("tầng ③ prefers-reduced-transparency quay về nền đặc, tắt blur", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)[\s\S]{0,160}\.kg-floatbar[\s\S]{0,120}backdrop-blur-none/,
    );
  });
});
