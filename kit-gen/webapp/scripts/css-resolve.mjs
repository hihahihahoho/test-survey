/**
 * css-resolve.mjs — giải mã CSS THẬT do `vite build` sinh ra.
 *
 * VÌ SAO CẦN: jsdom không giải `var(--kg-*)`, `getComputedStyle` trả về nguyên
 * chuỗi `rgb(var(--kg-raised) / …)`. Mà lỗi B1/B2 chính là "màu cuối cùng sai",
 * nên phải tính được MÀU CUỐI CÙNG mới dám nói PASS. Module này:
 *   1. đọc `dist/assets/*.css` (bundle thật, sau Tailwind + minify),
 *   2. khớp mọi rule với danh sách class mà React vừa render ra,
 *   3. thay `var(--kg-*)` bằng giá trị trong `src/styles/tokens.css`,
 *   4. tính tương phản WCAG 2.1.
 *
 * Nó KHÔNG hardcode màu nào — sửa token hay sửa class là số đo đổi theo.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

export function loadBundleCss() {
  const dir = resolve(ROOT, "dist/assets");
  if (!existsSync(dir)) throw new Error("Chưa có dist/ — chạy `npm run build:only` trước.");
  const file = readdirSync(dir).find((f) => f.endsWith(".css"));
  if (!file) throw new Error("dist/assets không có file .css nào.");
  return { name: file, css: readFileSync(resolve(dir, file), "utf8") };
}

/** Đọc biến --kg-* trong một block của tokens.css (":root,.dark" hoặc ".light"). */
export function loadTokens(selectorRe = /:root,\s*\.dark\s*\{/) {
  const tok = readFileSync(resolve(ROOT, "src/styles/tokens.css"), "utf8");
  const m = tok.match(selectorRe);
  if (!m) throw new Error(`tokens.css không có block ${selectorRe}`);
  const body = tok.slice(m.index + m[0].length).split("}")[0];
  const out = {};
  for (const line of body.split("\n")) {
    const v = line.match(/--kg-([a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (v) out[v[1]] = v[2].trim();
  }
  return out;
}

function parseRules(css) {
  const rules = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) rules.push({ sel: m[1].trim(), body: m[2] });
  return rules;
}

/**
 * Gom declaration áp lên một phần tử.
 * @param classList danh sách class thật trên DOM
 * @param pseudo    "" = trạng thái thường; ":disabled" = thêm lớp disabled
 */
export function declarationsFor(css, classList, pseudo = "") {
  const decl = {};
  for (const r of parseRules(css)) {
    for (const one of r.sel.split(",")) {
      const s = one.trim();
      if (!s.startsWith(".")) continue;
      const mm = s.match(/^\.((?:\\.|[^:\s>+~])+)((?::[a-z-]+)*)$/);
      if (!mm) continue;
      if (!classList.includes(mm[1].replace(/\\/g, ""))) continue;
      if (mm[2] && mm[2] !== pseudo) continue;
      for (const d of r.body.split(";")) {
        const i = d.indexOf(":");
        if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      }
    }
  }
  return decl;
}

export function expandVars(value, decl, tokens) {
  let out = value, guard = 0;
  while (/var\(/.test(out) && guard++ < 24) {
    out = out.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/i, (_, name, fb) =>
      name.startsWith("--kg-") ? (tokens[name.slice(5)] ?? fb ?? "") : (decl[name] ?? fb ?? ""));
  }
  return out.trim();
}

export function toRgb(s) {
  if (!s || /transparent/i.test(s)) return null;
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+)\s*)?\)/);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  const h = s.match(/#([0-9a-f]{6})/i);
  if (h) return { rgb: [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)), a: 1 };
  return null;
}

const ch = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * ch(r / 255) + 0.7152 * ch(g / 255) + 0.0722 * ch(b / 255);
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
};
export const over = (fg, a, bg) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
export const hex = (t) => "#" + t.map((v) => Math.round(v).toString(16).padStart(2, "0").toUpperCase()).join("");

/**
 * Màu chữ / màu nền CUỐI CÙNG của một phần tử, đã trộn alpha lên nền cha.
 * @param backdrop nền phía sau (mặc định canvas) — dùng khi nền phần tử trong suốt.
 */
export function finalColors(css, tokens, classList, { pseudo = "", backdrop } = {}) {
  const decl = declarationsFor(css, classList, "");
  const merged = pseudo ? { ...decl, ...declarationsFor(css, classList, pseudo) } : decl;
  const back = backdrop ?? toRgb(`rgb(${tokens.canvas})`).rgb;
  const bgRaw = toRgb(expandVars(merged["background-color"] ?? "", merged, tokens));
  const bg = bgRaw ? over(bgRaw.rgb, bgRaw.a, back) : back;
  const fgRaw = toRgb(expandVars(merged["color"] ?? "", merged, tokens));
  // không khai màu chữ ⇒ KẾ THỪA (đúng cái bẫy của B6). Trả null để bên gọi tự xử.
  const fg = fgRaw ? over(fgRaw.rgb, fgRaw.a, bg) : null;
  const opacity = expandVars(merged["opacity"] ?? "1", merged, tokens);
  return { bg, fg, opacity, declaredColor: Boolean(fgRaw) };
}
