/**
 * FE-2 · A1 — khoá món nợ thị giác của FE-1, để không ai vô tình mở lại.
 *
 * Vì sao cần test này khi đã có `npm run contrast` + `npm run deadclass`: hai cổng đó
 * chỉ đo MÀU và hỏi "class có sinh CSS không". Chúng xanh y nguyên nếu ai đó gõ lại một
 * bán kính bo bằng số cứng (`rounded-[14px]`) thay vì bậc semantic — mà đúng sự bất
 * nhất đó là thứ A1 dọn.
 *
 * Đợt 3 gỡ khối thứ hai của file (`.kg-floatbar`) và khối thứ ba (thumb ScrollArea):
 * `components/common/FloatingToolbar.tsx` và `components/ui/scroll-area.tsx` đều KHÔNG
 * còn ai import nên đã bị xoá, và một cổng canh một file không tồn tại thì chỉ đỏ vì
 * `ENOENT`, không canh được gì.
 *
 * Test đọc file nguồn dạng text — cố ý. Đây là cổng chống hồi quy trên CHÍNH chuỗi
 * class, không phải test hành vi component.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");

/** Bỏ chú thích trước khi so class: các file A1 sửa đều CÓ comment kể lại giá trị CŨ
 *  đã bị loại. Quét thô sẽ báo động giả trên chính lời giải thích. Cùng cách xử lý mà
 *  `check-contrast.mjs` đang dùng. */
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
