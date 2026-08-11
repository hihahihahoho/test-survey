/**
 * FE-2 · Q1 — khoá việc GHÉP story vào trang `/__preview`.
 *
 * Q là chủ duy nhất của `routes/__preview.tsx` (FE2-PLAN §1). Việc của Q ở đây là
 * **ghép**, không sửa component của C/D. Ba thứ được khoá:
 *  ① trang preview tổng thật sự mount story C và D (không phải chỉ khai import);
 *  ② Q KHÔNG viết lại UI của C/D — story vẫn là nguồn duy nhất, `__preview.tsx`
 *     chỉ gọi component đã export;
 *  ③ story C/D vẫn nằm đúng file của nhánh mình (nếu ai xoá/di chuyển, test đỏ
 *     thay vì trang preview âm thầm rỗng).
 *
 * Test đọc SOURCE thay vì render: trang preview kéo gần như toàn bộ primitive +
 * hai story, render nó trong jsdom là bài test chậm và giòn mà không nói thêm điều gì
 * về việc ghép. Phần render thật của story đã có DOM suite của C (68 ca) và D (29 ca).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const R = (p: string) => resolve(ROOT, p);
const read = (p: string) => readFileSync(R(p), "utf8");

const PREVIEW = "src/routes/__preview.tsx";
const STORY_C = "src/features/docs/__preview__.tsx";
const STORY_D = "src/features/canvas/__preview__.tsx";

describe("① story C/D được MOUNT trên trang preview tổng", () => {
  const src = read(PREVIEW);

  it.each([
    ["SubfilePreview", STORY_C],
    ["SubfileCrudPreview", STORY_C],
    ["SubfileA11yPreview", STORY_C],
    ["CanvasPreview", STORY_D],
  ])("%s được import từ story và render bằng JSX", (name, story) => {
    expect(src).toMatch(new RegExp(`\\b${name}\\b`));
    expect(src).toContain(`<${name} />`);
    // đúng nguồn: tên phải được export từ file story của nhánh sở hữu
    expect(read(story)).toMatch(new RegExp(`export function ${name}\\b`));
  });

  it("có mục lục riêng cho hai khối FE-2 (id để chụp/deep-link)", () => {
    expect(src).toContain('id="subfile"');
    expect(src).toContain('id="canvas-shell"');
  });
});

describe("② Q chỉ GHÉP — không dựng lại UI của C/D", () => {
  const src = read(PREVIEW);

  it("chỉ chạm ĐÚNG hai đường dẫn story, không import component con của C/D", () => {
    // Bắt cả `from "…"` (tĩnh) và `import("…")` (động) để test không bị vô hiệu
    // khi đổi cách nạp — đúng lỗi tôi tự vấp lượt đầu.
    const refs = [
      ...(src.match(/from "@\/features\/(?:docs|canvas)\/[^"]+"/g) ?? []).map((m) =>
        m.replace(/^from "/, "").replace(/"$/, ""),
      ),
      ...(src.match(/import\("@\/features\/(?:docs|canvas)\/[^"]+"\)/g) ?? []).map((m) =>
        m.replace(/^import\("/, "").replace(/"\)$/, ""),
      ),
    ];
    expect([...new Set(refs)].sort()).toEqual([
      "@/features/canvas/__preview__",
      "@/features/docs/__preview__",
    ]);
  });

  it("story nạp RỜI ⇒ không kéo `features/canvas` vào chunk chung", () => {
    /* Lượt đầu tôi import tĩnh: `dist/assets/canvas-*.js` tụt 19.26 → 1.86 kB và
       `common-*.js` phồng 361.92 → 391.31 kB vì Rolldown hoist `features/canvas`
       lên chunk chung (hai điểm vào cùng dùng). Test đếm chunk của E1 KHÔNG bắt
       được vì nó chỉ đếm số lượng. Khoá lại bằng cách yêu cầu nạp động. */
    expect(src).toMatch(/React\.lazy\(\s*\(\)\s*=>\s*\n?\s*import\("@\/features\/canvas\/__preview__"\)/);
    expect(src).not.toMatch(/^import \{[^}]*\} from "@\/features\/(docs|canvas)\/__preview__";/m);
    expect(src).toContain("React.Suspense");
  });

  it("không tự gọi docsRepo / IndexedDB / fetch trong trang preview", () => {
    for (const kw of ["docsRepo", "indexedDB", "IndexedDB", "localStorage"]) {
      expect(src).not.toContain(kw);
    }
    // không import CỬA DỮ LIỆU vào trang preview (story mới là thứ được ghép)
    expect(src).not.toMatch(/from "@\/features\/docs\/lib/);
    expect(src).not.toMatch(/from "@\/features\/canvas\/lib/);
    // không fetch trần
    expect(src.replace(/refetch/g, "")).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("③ story vẫn nằm đúng glob của nhánh sở hữu", () => {
  it.each([STORY_C, STORY_D])("%s tồn tại", (p) => {
    expect(existsSync(R(p))).toBe(true);
  });

  it("story không bị Q sửa thành nguồn dữ liệu thật (vẫn là dữ liệu tĩnh)", () => {
    // story được phép dùng repo in-memory/dữ liệu tĩnh; điều PHẢI đúng là nó
    // không kéo backend http hay đổi backend toàn cục cho cả app.
    for (const p of [STORY_C, STORY_D]) {
      expect(read(p)).not.toContain("setDocsBackend");
    }
  });
});
