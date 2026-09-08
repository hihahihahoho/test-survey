/**
 * CHỐNG HỒI QUY cho B1–B5 — năm lỗi chủ dự án bắt BẰNG MẮT trên app thật.
 *
 * Nguyên tắc của bộ test này: mỗi ca phải FAIL trên mã CŨ. Không viết test chỉ
 * để xanh. Chỗ nào chưa kiểm được ở đây (bố cục thật cần trình duyệt) thì nói
 * thẳng trong FIXES.md chứ không giả vờ phủ.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const TOKENS = read("styles/tokens.css");

/** Lấy giá trị một token trong block `:root, .dark` hoặc `.light`. */
function token(name: string, theme: "dark" | "light"): string {
  const re = theme === "dark" ? /:root,\s*\.dark\s*\{/ : /\.light\s*\{/;
  const m = TOKENS.match(re)!;
  const body = TOKENS.slice(m.index! + m[0].length).split("}")[0]!;
  const v = body.match(new RegExp(`--kg-${name}\\s*:\\s*([^;]+);`));
  if (!v) throw new Error(`thiếu token --kg-${name} (${theme})`);
  return v[1]!.trim();
}
const rgb = (name: string, theme: "dark" | "light") =>
  token(name, theme).split(/\s+/).map(Number) as [number, number, number];

/** WCAG 2.1 — cùng công thức với scripts/check-contrast.mjs. */
const chan = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: number[]) =>
  0.2126 * chan(r! / 255) + 0.7152 * chan(g! / 255) + 0.0722 * chan(b! / 255);
const contrast = (a: number[], b: number[]) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};
const over = (fg: number[], a: number, bg: number[]) =>
  fg.map((v, i) => Math.round(v * a + bg[i]! * (1 - a)));

/** "Xanh dương" = kênh lam trội hẳn hai kênh kia. Dùng để quét màu sót. */
const isBlue = ([r, g, b]: number[]) => b! > r! + 18 && b! > g! + 10;

describe("B1 · nút primary bị khoá phải ĐỌC ĐƯỢC (không còn mint mờ)", () => {
  const html = renderToStaticMarkup(
    <Button variant="primary" disabled>
      Tiếp: chọn thư mục làm việc →
    </Button>,
  );

  it("KHÔNG dùng opacity để làm mờ — nguyên nhân chữ tàng hình", () => {
    expect(html).not.toContain("disabled:opacity");
    expect(read("components/ui/button.tsx")).not.toMatch(/^\s*"?disabled:opacity-45/m);
  });

  it("đổi HẲN sang bộ trung tính: bg-raised + text-fg-muted + viền line-subtle", () => {
    expect(html).toContain("disabled:bg-raised");
    expect(html).toContain("disabled:text-fg-muted");
    expect(html).toContain("disabled:border-line-subtle");
  });

  it("chữ nút khoá đạt ≥4.5:1 ở CẢ hai theme (đo thật trên token)", () => {
    for (const theme of ["dark", "light"] as const) {
      const v = contrast(rgb("fg-muted", theme), rgb("raised", theme));
      expect(v, `${theme}: fg-muted trên raised = ${v.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("nút LOADING vẫn giữ chữ + có spinner, không mất nhãn", () => {
    const busy = renderToStaticMarkup(
      <Button variant="primary" loading>
        Lưu (3)
      </Button>,
    );
    expect(busy).toContain("Lưu (3)");
    expect(busy).toContain("animate-spin");
    expect(busy).toContain('aria-busy="true"');
  });

  it("mọi biến thể đều nhận bộ khoá trung tính, không riêng primary", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger", "link"] as const) {
      const h = renderToStaticMarkup(<Button variant={variant} disabled>X</Button>);
      expect(h, variant).toContain("disabled:text-fg-muted");
    }
  });

  it("asChild (thẻ <a>) cũng đổi màu nhờ aria-[disabled=true]", () => {
    const h = renderToStaticMarkup(<Button variant="primary" disabled>X</Button>);
    expect(h).toContain("aria-[disabled=true]:text-fg-muted");
    expect(h).toContain('aria-disabled="true"');
  });
});

describe("B1 quét cùng loại · input/select/textarea không còn chữ chìm", () => {
  for (const f of [
    "components/ui/input.tsx",
    "components/ui/textarea.tsx",
    "components/ui/select.tsx",
    "components/ui/tabs.tsx",
    "components/ui/checkbox.tsx",
    "components/ui/radio-group.tsx",
    "components/ui/switch.tsx",
    "components/ui/slider.tsx",
    "components/ui/label.tsx",
    "components/ui/command.tsx",
    "components/ui/toggle-group.tsx",
    "components/ui/dropdown-menu.tsx",
  ]) {
    it(`${f} không dùng opacity-45 cho trạng thái khoá`, () => {
      expect(read(f)).not.toContain("opacity-45");
    });
  }
});

/* ══════════════════════════════════════════════════════════════════════════════
   B3 — VIẾT LẠI (đợt VNPAY-RECOLOR). Đọc kỹ trước khi sửa, vì chính khối này là
   cái đã KHOÁ một hiểu lầm suốt ba wave.

   Bản cũ tên là "không còn màu xanh dương trong hệ token (FLORA = mint + trung
   tính)" và bắt CẢ 18 token — accent lẫn trung tính — phải `isBlue === false`.
   Nó sinh ra từ một câu của chủ dự án bị đọc NGƯỢC: "dùng màu xanh VNPAY nhé"
   được hiểu thành "còn sót màu xanh, diệt đi". Từ đó mọi wave sau đều có một
   cổng xanh lè xác nhận rằng accent KHÔNG ĐƯỢC là xanh dương — nên không ai
   sửa lại được, kể cả khi muốn.

   B3 có HAI mệnh đề, bản cũ trộn làm một. Nay tách đôi:
   ① ĐÚNG và GIỮ — bộ TRUNG TÍNH phải trung tính thật. `#A8B1C2`/`#AEB6C6` là
     xám ÁM LAM: đó là bẩn màu, không phải nhận diện. Vẫn cấm.
   ② SAI và ĐẢO — accent PHẢI là xanh dương VNPAY. Đây là yêu cầu nhận diện
     thương hiệu, chủ dự án đã nhắc hai lần.

   Vì thế ca của nhóm ② nay khẳng định điều NGƯỢC LẠI bản cũ. Đó là chủ ý, và
   nó vẫn giữ nguyên luật "mỗi ca phải FAIL trên mã cũ" ở đầu file: chạy bộ này
   trên tokens.css thời mint thì cả nhóm ② đỏ.
   ══════════════════════════════════════════════════════════════════════════ */
describe("B3① · bộ TRUNG TÍNH không được ám lam (phần ĐÚNG của B3, giữ nguyên)", () => {
  const NEUTRAL_TOKENS = [
    "on-tint-never", "on-tint-queued",
    "fg-strong", "fg-default", "fg-muted", "line", "line-subtle", "line-strong",
    "canvas", "surface", "raised", "overlay",
  ];
  for (const theme of ["dark", "light"] as const) {
    for (const t of NEUTRAL_TOKENS) {
      it(`${theme} · --kg-${t} không bị ám lam`, () => {
        const c = rgb(t, theme);
        expect(isBlue(c), `${t} = rgb(${c.join(",")})`).toBe(false);
      });
    }
  }
});

describe("B3② · hệ ACCENT phải là XANH DƯƠNG VNPAY (đảo chiều bản cũ)", () => {
  const ACCENT_TOKENS = [
    "accent", "accent-hover", "accent-active", "accent-text", "focus-ring",
    "on-tint-accent",
  ];
  /** Góc màu HSL, 0–360. VNPAY primary #005BAA = 208°, cyan phụ #00B0F0 = 196°. */
  const hue = ([r, g, b]: number[]) => {
    const mx = Math.max(r!, g!, b!), mn = Math.min(r!, g!, b!), d = mx - mn;
    if (d === 0) return -1;
    const h = mx === r! ? ((g! - b!) / d) % 6 : mx === g! ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
    return (h * 60 + 360) % 360;
  };

  for (const theme of ["dark", "light"] as const) {
    for (const t of ACCENT_TOKENS) {
      it(`${theme} · --kg-${t} nằm trong dải xanh dương VNPAY`, () => {
        const c = rgb(t, theme);
        expect(isBlue(c), `${t} = rgb(${c.join(",")}) — kênh lam phải trội`).toBe(true);
        const h = hue(c);
        expect(h, `${t} = rgb(${c.join(",")}) · hue ${h.toFixed(1)}°`).toBeGreaterThanOrEqual(195);
        expect(h, `${t} = rgb(${c.join(",")}) · hue ${h.toFixed(1)}°`).toBeLessThanOrEqual(220);
      });
    }
  }

  it("mint #71D083 đã bị gỡ khỏi mã (chỉ còn được nhắc trong chú thích lịch sử)", () => {
    for (const f of [
      "styles/tokens.css",
      "components/ui/button.tsx",
      "features/home/components/CreateKitTile.tsx",
      "features/kit-core/lib/form-model.ts",
      "features/kit-core/lib/model.ts",
    ]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/#71D083/i);
    }
  });
});

describe("B3 · số đo của hệ accent", () => {

  it("chữ trên nền tint accent (chip ⊟9 / ✛ tự do / ❆ glow) đạt ≥4.5:1", () => {
    for (const theme of ["dark", "light"] as const) {
      const a = Number(token("tint-a", theme));
      const layers = ["canvas", "surface", "raised", "overlay"].map((l) => rgb(l, theme));
      const worst = Math.min(
        ...layers.map((L) => contrast(rgb("on-tint-accent", theme), over(rgb("accent", theme), a, L))),
      );
      expect(worst, `${theme}: worst = ${worst.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("không còn hex xanh dương cũ ở bất kỳ đâu trong src/", () => {
    for (const f of [
      "styles/tokens.css",
      "components/ui/badge.tsx",
      "components/layout/flora.ts",
      "features/kit/lib/figma-board.ts",
    ]) {
      // Bỏ chú thích: các file có ghi lại hex CŨ để giải thích vì sao đã đổi.
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/#(8FBBFF|4C8DFF|1955C2|14489F|C0C6D2|A8B1C2|AEB6C6)/i);
    }
  });
});

/* B4 (kích thước 3 vùng của trình soạn S3) ĐÃ XOÁ 08/09/2026: `features/design/**`
   và `components/ui/resizable.tsx` đi cùng màn ấy, và gói `react-resizable-panels`
   đã gỡ khỏi `package.json`. Bài học vẫn đúng cho ai dựng lại một khung kéo được:
   `defaultSize/minSize/maxSize` dạng SỐ TRẦN là pixel trong v4, không phải phần trăm. */

describe("B5 · banner «Đã kết nối lại» phải tự tắt", () => {
  const src = read("components/layout/AgentBanner.tsx");

  it("bộ đếm tự ẩn nằm ở effect RIÊNG (StrictMode-safe)", () => {
    expect(src).toMatch(/React\.useEffect\(\(\) => \{\s*if \(!reconnected\) return;[\s\S]*?setTimeout/);
    expect(src).toContain("return () => clearTimeout(t);");
  });

  it("trạng thái «checking» lúc mở app KHÔNG bị tính là mất kết nối", () => {
    expect(src).toContain('if (status.pill === "checking") return;');
  });
});
