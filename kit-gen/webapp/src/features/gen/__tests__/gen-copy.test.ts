import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MSG } from "@/features/kitfile";
import { GEN_GROUP_NOTE, GEN_KIND_LIST, GEN_NEED_CHARACTER_REF, GEN_KIND_SPEC } from "../lib/gen-kinds";
import { PACK_NOTE_LOCKED } from "../lib/pack-model";

/**
 * CHỮ HIỆN RA — ba việc:
 *   ① ba câu bắt buộc của UX-V3 §4.1 khớp TỪNG KÝ TỰ với từ điển S1 khi S1 có sẵn câu đó;
 *   ② tên 4 lệnh không dùng chữ CẤM §5.4;
 *   ③ đếm `CTA` trong feature — luật L1 «một màn, một nút phát sáng».
 */
const ROOT = "src/features/gen";
function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "__tests__") continue;
      out.push(...listSources(p));
    } else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const FILES = listSources(ROOT);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("① ba câu bắt buộc — khớp từ điển S1 từng ký tự", () => {
  it("«vẽ cả nhóm một lần» trùng `MSG.GEN_GROUP_NOTE` của S1", () => {
    expect(GEN_GROUP_NOTE).toBe(MSG.GEN_GROUP_NOTE);
  });

  it("«cần ảnh nhân vật trước» trùng `MSG.GEN_NEED_CHAR_REF` của S1", () => {
    expect(GEN_NEED_CHARACTER_REF).toBe(MSG.GEN_NEED_CHAR_REF);
  });

  it("«ghi chú không vào bộ kit» trùng `MSG.PACK_NOTE_LOCKED` của S1", () => {
    expect(PACK_NOTE_LOCKED).toBe(MSG.PACK_NOTE_LOCKED);
  });

  it("câu nói thật của lệnh «Món giao diện» nằm trong ĐẶC TẢ, không phải tooltip", () => {
    expect(GEN_KIND_SPEC.element.truthNote).toBe(GEN_GROUP_NOTE);
  });
});

describe("② tên lệnh và gợi ý — sạch chữ kỹ thuật §5.4", () => {
  const BANNED = [
    "contract", "variant", "sheet", "job", "run", "workflow", "canvas", "quota",
    "grid", "skeleton", "template", "element", "frame", "stale", "mode",
  ];

  it("không tên/gợi ý/nhãn nào của 4 lệnh chứa từ cấm", () => {
    for (const spec of GEN_KIND_LIST) {
      const text = [spec.label, spec.hint, spec.promptLabel ?? "", spec.promptPlaceholder,
        spec.orientFixedNote, spec.truthNote ?? ""].join(" ").toLowerCase();
      for (const w of BANNED) {
        expect(`${spec.kind} có "${w}"? ${text.includes(w)}`).toBe(`${spec.kind} có "${w}"? false`);
      }
    }
  });

  /* P-SWEEP·11 — hình của mỗi lệnh đổi từ emoji (🖼 🧍 🧩 📦) sang icon lucide, khai ở
     `GEN_KIND_ICON` trong `panels/GenKindGrid.tsx` (module `lib/gen-kinds.ts` phải ở
     lại THUẦN DỮ LIỆU nên không giữ component React). Bất biến a11y §5.8-A3 mà ca này
     canh KHÔNG đổi: mỗi lệnh luôn có CHỮ, hình chỉ là phụ trợ và luôn `aria-hidden`. */
  it("mỗi lệnh luôn có CHỮ — không bao giờ chỉ là một cái hình (a11y §5.8-A3)", () => {
    for (const spec of GEN_KIND_LIST) {
      expect(spec.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("đúng 4 lệnh, đúng thứ tự wireframe §4.1", () => {
    expect(GEN_KIND_LIST.map((s) => s.kind)).toEqual(["bg", "pose", "element", "kit"]);
  });
});

describe("③ L1 — đếm chỗ dùng `CTA` trong mã CHẠY của feature", () => {
  const uses = FILES.flatMap((f) => {
    const src = stripComments(readFileSync(f, "utf8"));
    return (src.match(/\bCTA\b/g) ?? []).map(() => f);
  });

  it("hộp GEN dùng `CTA` đúng MỘT lần (nút mở «Nhờ máy vẽ»)", () => {
    const inPopover = uses.filter((f) => f.endsWith("GenPopover.tsx"));
    // 2 lượt trúng: dòng `import` và dòng dùng. Đó là MỘT nút.
    expect(inPopover.length).toBeLessThanOrEqual(2);
    expect(inPopover.length).toBeGreaterThan(0);
  });

  it("panel điền KHÔNG dùng `CTA` — nút «Vẽ» đang khoá, không được phát sáng", () => {
    expect(uses.filter((f) => f.includes("/panels/"))).toEqual([]);
  });

  it("lớp phủ đóng gói dùng `CTA` đúng cho một nút «Đóng thành bộ kit»", () => {
    const inPack = uses.filter((f) => f.endsWith("PackOverlay.tsx"));
    expect(inPack.length).toBeLessThanOrEqual(2);
    expect(inPack.length).toBeGreaterThan(0);
  });
});

/**
 * Quét từ cấm §5.4 trên CHÍNH mã của tôi, mức **0 tuyệt đối**.
 *
 * Vì sao tự viết bộ quét nhỏ thay vì gọi `banned-scan.ts` của S1: file đó nằm trong
 * `features/kitfile/__tests__/**` — glob của nhánh S. Import xuyên `__tests__` của nhánh
 * khác sẽ khoá chân họ khi họ đổi. Bộ đếm toàn cục (bánh cóc 300) vẫn là của S1 và vẫn
 * chạy trong `npm run verify`; ở đây chỉ canh phần của mình cho chặt.
 * Cùng luật với S1: chỉ soi chuỗi có DẤU TIẾNG VIỆT (xấp xỉ «chữ hiện ra cho user»).
 */
describe("§5.4 — mã của C2: 0 từ cấm, không ngoại lệ", () => {
  const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  const STR = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
  const WORDS = [
    "contract", "variant", "sheet", "job", "run", "slug", "project", "doc",
    "workflow", "canvas", "frame", "template", "quota", "stale", "element",
    "grid", "cols", "rows", "skeleton", "shape", "chroma-key", "workspace", "mode",
    "quy trình chuẩn", "free-style",
  ];

  it("không chuỗi tiếng Việt nào trong `features/gen/**` chứa chữ kỹ thuật", () => {
    const found: string[] = [];
    for (const f of FILES) {
      for (const line of stripComments(readFileSync(f, "utf8")).split("\n")) {
        for (const m of line.matchAll(STR)) {
          const inner = m[0].slice(1, -1);
          if (!VI.test(inner)) continue;
          const low = inner.toLowerCase();
          for (const w of WORDS) {
            const hit = /^[a-z-]+$/.test(w)
              ? new RegExp(`(^|[^a-z-])${w}([^a-z-]|$)`).test(low)
              : low.includes(w);
            if (hit) found.push(`${f}: «${inner.slice(0, 60)}» chứa «${w}»`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it("bộ quét thật sự chạy (chống cổng rỗng): thấy ít nhất một chuỗi tiếng Việt", () => {
    const viStrings = FILES.flatMap((f) =>
      [...stripComments(readFileSync(f, "utf8")).matchAll(STR)]
        .map((m) => m[0].slice(1, -1))
        .filter((s) => VI.test(s)),
    );
    expect(viStrings.length).toBeGreaterThan(10);
  });
});

describe("0 literal màu / bo góc arbitrary trong feature", () => {
  it("không mã màu hex, không `rounded-[…]`", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(`${f}: ${/#[0-9a-fA-F]{6}\b/.test(src)}`).toBe(`${f}: false`);
      expect(`${f}: ${/rounded-\[[^\]]+\]/.test(src)}`).toBe(`${f}: false`);
    }
  });
});
