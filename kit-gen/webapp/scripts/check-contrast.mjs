#!/usr/bin/env node
/**
 * check-contrast.mjs — kiểm tương phản WCAG 2.1 cho token màu của kit-gen v2.
 *
 * Cổng port của web/css/tools/check-contrast.py (bản vanilla) sang webapp/.
 * Khác biệt quan trọng: script này KHÔNG hardcode màu — nó ĐỌC THẲNG
 * src/styles/tokens.css và parse biến `--kg-*`. Nếu ai sửa token mà quên đo
 * lại, script sẽ fail ngay, không có chuyện tài liệu nói một đằng CSS một nẻo.
 *
 * Ngưỡng: 4.5:1 chữ thường · 3:1 chữ lớn (≥18.66px bold / ≥24px) và
 * thành phần UI / viền mang thông tin (WCAG 1.4.11).
 *
 * Chạy: node scripts/check-contrast.mjs   (exit 1 nếu có FAIL)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(HERE, "../src/styles/tokens.css");

// ---------- WCAG relative luminance (công thức §9.4 UX-SPEC) ----------
const chan = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) =>
  0.2126 * chan(r / 255) + 0.7152 * chan(g / 255) + 0.0722 * chan(b / 255);
const cr = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};
/** phủ màu fg ở alpha a lên nền bg (dùng cho nền tint của badge) */
const over = (fg, a, bg) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const hex = (t) => "#" + t.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");

// ---------- parse tokens.css ----------
const css = readFileSync(TOKENS, "utf8");
/** Lấy map biến trong block bắt đầu từ selector cho trước. */
function block(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error(`Không tìm thấy block ${selectorRe} trong tokens.css`);
  const body = css.slice(m.index + m[0].length).split("}")[0];
  const vars = {};
  for (const line of body.split("\n")) {
    const v = line.match(/--kg-([a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (v) vars[v[1]] = v[2].trim();
  }
  return vars;
}
const parseRgb = (s) => {
  const p = s.split(/\s+/).map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p : null;
};

const DARK = block(/:root,\s*\.dark\s*\{/);
const LIGHT = { ...DARK, ...block(/\.light\s*\{/) }; // light phủ lên dark

// ---------- runner ----------
let fails = 0, total = 0;
const T = (s, n) => String(s).padEnd(n);
function chk(label, fg, bg, min, note = "", waiveKey = null) {
  total++;
  const v = cr(fg, bg);
  const ok = v >= min;
  const waive = !ok && waiveKey && WAIVED.has(waiveKey);
  if (!ok && !waive) fails++;
  if (waive) { waived++; note = `${note} · MIỄN TRỪ: ${WAIVED.get(waiveKey)}`; }
  const mark = ok ? "PASS" : waive ? "WAIV" : "FAIL";
  console.log(
    `  ${mark}  ${T(label, 38)} ${hex(fg)} on ${hex(bg)} = ${String(v.toFixed(2)).padStart(6)}  (min ${min.toFixed(1)}) ${note}`
  );
}

function auditTheme(name, V) {
  const g = (k) => {
    const raw = V[k];
    const p = raw && parseRgb(raw);
    if (!p) throw new Error(`token --kg-${k} thiếu hoặc không phải bộ 3 RGB (theme ${name}): ${raw}`);
    return p;
  };
  const LAYERS = ["canvas", "surface", "raised", "overlay"];
  const tintA = parseFloat(V["tint-a"]);

  console.log(`\n${"=".repeat(78)}\n=== THEME ${name.toUpperCase()} · nền tham chiếu = surface ${hex(g("surface"))}\n${"=".repeat(78)}`);

  const S = g("surface");
  console.log("\n-- §5.3 chữ / accent / trạng thái trên --surface --");
  chk("fg-strong", g("fg-strong"), S, 4.5);
  chk("fg-default", g("fg-default"), S, 4.5);
  chk("fg-muted", g("fg-muted"), S, 4.5);
  chk("accent (nền đặc: dùng làm chữ?)", g("accent"), S, 4.5);
  chk("accent-text", g("accent-text"), S, 4.5);
  chk("ok", g("ok"), S, 4.5);
  chk("warn / stale", g("warn"), S, 4.5);
  chk("danger (chữ)", g("danger"), S, 4.5);
  chk("running", g("running"), S, 4.5);
  chk("focus-ring", g("focus-ring"), S, 3.0, "· non-text 1.4.11");
  chk("line (viền input/ô lưới)", g("line"), S, 3.0, "· non-text 1.4.11");
  chk("line-strong (viền ô đang chọn)", g("line-strong"), S, 3.0, "· non-text 1.4.11");

  console.log("\n-- chữ trên nền ĐẶC (nút primary / nút danger) --");
  chk("fg-on-accent trên accent", g("fg-on-accent"), g("accent"), 4.5);
  chk("fg-on-danger trên danger-solid", g("fg-on-danger"), g("danger-solid"), 4.5);

  console.log("\n-- chữ phải đọc được trên CẢ 4 lớp nền (tooltip/menu/modal nằm trên raised/overlay) --");
  for (const layer of LAYERS) {
    const bg = g(layer);
    chk(`fg-strong trên ${layer}`, g("fg-strong"), bg, 4.5);
    chk(`fg-default trên ${layer}`, g("fg-default"), bg, 4.5);
    chk(`fg-muted-raised trên ${layer}`, g("fg-muted-raised"), bg, 4.5);
    chk(`accent-text trên ${layer}`, g("accent-text"), bg, 4.5);
    chk(`focus-ring trên ${layer}`, g("focus-ring"), bg, 3.0, "· non-text");
    chk(`line trên ${layer}`, g("line"), bg, 3.0, "· non-text");
  }

  console.log(`\n-- §5.5 chữ badge trên nền tint (${Math.round(tintA * 100)}% alpha), đo ở lớp nền XẤU NHẤT --`);
  const states = ["never", "queued", "running", "accent", "ok", "warn", "stale", "danger"];
  for (const st of states) {
    const tint = g(st);
    const text = g(`on-tint-${st}`);
    let worst = null, worstBg = null;
    for (const layer of LAYERS) {
      const composited = over(tint, tintA, g(layer));
      const v = cr(text, composited);
      if (worst === null || v < worst) { worst = v; worstBg = composited; }
    }
    chk(`badge ${st} (--kg-on-tint-${st})`, text, worstBg, 4.5, "· worst-of-4-layers");
  }

  auditAlpha(name.toUpperCase(), V, g, LAYERS);
}


/* ==========================================================================
   NHÓM MỚI (FE-1 · A1) — "CẶP MÀU SAU KHI ĐÈ ALPHA"
   --------------------------------------------------------------------------
   Vì sao cần: 93 phép đo cũ chỉ đo màu ĐẶC (token trên token). Nhưng app thật
   dùng rất nhiều nền/viền/chữ MỜ: `bg-accent/15`, `bg-fg-strong/[0.06]`,
   `border-warn/60`, `bg-overlay/90`, `opacity-80`, `rgb(var(--kg-line) / .4)`…
   Một cặp PASS lúc đặc hoàn toàn có thể FAIL sau khi trộn với nền phía dưới.
   Script này KHÔNG liệt kê tay: nó QUÉT src/**.tsx|ts + styles/*.css, rút ra
   mọi (token, alpha) đang dùng thật, composite đúng công thức src-over rồi đo.

   Công thức: kết quả = token·α + nền·(1−α)   (nền mờ nằm trên nền ĐỤC).
   Nền phía dưới không biết trước ⇒ đo trên CẢ 4 lớp (canvas/surface/raised/
   overlay) và lấy lớp XẤU NHẤT, giống cách §5.5 đã làm với badge tint.

   Giới hạn trung thực (không giấu):
   - `backdrop-filter: blur()` KHÔNG được mô phỏng. Blur làm nền dưới nhoè chứ
     không đổi độ sáng trung bình bao nhiêu ⇒ phép đo này là xấp xỉ hợp lý,
     nhưng nó là xấp xỉ.
   - Chữ đặt trên nền mờ được giả định là bộ chữ thân bài (fg-default/fg-muted)
     + "mực" của chính trạng thái đó. Nếu màn nào dùng màu chữ khác thì phải
     khai thêm ở FG_ON_TINT.
   - Class ghép động (`bg-${x}/10`) nằm ngoài tầm quét, y như check-dead-classes.
   ========================================================================== */
const SRC_DIR = resolve(HERE, "../src");
const GLOBALS = resolve(HERE, "../src/styles/globals.css");

/** Xoá `//…` và `/*…*\/` nhưng GIỮ nguyên số ký tự (để `file:dòng` không lệch). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** đọc đệ quy mọi file nguồn (bỏ test) */
function walkSrc(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkSrc(p, acc);
    else if (/\.(tsx?|css)$/.test(e.name) && !p.includes("__tests__")) acc.push(p);
  }
  return acc;
}

/** Đọc một biến alpha `--kg-*` ra số. NÉM nếu không có — xem lý do ở `parseAlpha`. */
function alphaVar(V, name) {
  const n = parseFloat(V[name]);
  if (!Number.isFinite(n)) {
    throw new Error(
      "alpha var(--kg-" + name + ") được dùng trong src nhưng tokens.css không khai nó thành số.\n" +
      "Cổng KHÔNG được im lặng bỏ qua: một mức alpha không đo được là một mức alpha chưa ai kiểm.",
    );
  }
  return n;
}

/** "15" → .15 · "[0.06]" → .06 · "[.16]" → .16 · "[var(--kg-tint-b)]" → giá trị token.
 *
 *  W2B: bản cũ chỉ nhận ĐÍCH DANH `--kg-tint-a`; mọi biến alpha khác rơi vào
 *  `Number(inner)` = NaN ⇒ `null` ⇒ **bị bỏ qua im lặng**. Đúng lúc W2B gom 13 mức
 *  alpha về thang `--kg-tint-a`/`--kg-tint-b`, cái lỗ đó sẽ nuốt trọn bậc B: cổng
 *  vẫn xanh trong khi không còn đo gì nữa. Nay nhận MỌI `var(--kg-*)` và tra thẳng
 *  tokens.css; biến không khai thì NÉM, không bỏ qua. */
function parseAlpha(raw, V) {
  if (raw.startsWith("[")) {
    const inner = raw.slice(1, -1);
    const v = inner.match(/^var\(\s*--kg-([a-z0-9-]+)\s*\)$/);
    if (v) return alphaVar(V, v[1]);
    const n = Number(inner);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n / 100 : null;
}

/** tên class Tailwind → tên token trong tokens.css */
const TOKEN_OF = (name) => (name === "fg" ? "fg-default" : name);

/** "mực" mặc định của từng nền trạng thái (chữ/icon đặt trên tint đó) */
const INK_OF = {
  accent: "accent-text", warn: "warn", danger: "danger", ok: "ok",
  running: "running", stale: "stale", never: "never", queued: "queued",
};

/** Nền ĐẶC của nút: chữ trên đó KHÔNG phải chữ thân bài mà là bộ `fg-on-*`.
    `bg-danger-solid/90` là hover của nút danger — đo với `fg-on-danger`, đo
    bằng fg-muted là sai mô hình (không màn nào đặt chữ xám lên nút đỏ). */
const SOLID_INK = {
  "danger-solid": "fg-on-danger",
  accent: null, // `bg-accent/α` trong app là TINT chọn/hover, không phải nút đặc
};

/** ------------------------------------------------------------------------
 *  MIỄN TRỪ CÓ THỜI HẠN — chỉ dùng cho cặp FAIL nằm NGOÀI glob sở hữu của
 *  nhánh A (FE-PLAN §1). Không im lặng: vẫn in ra, in đúng số đo, và bắt buộc
 *  trỏ tới file NEEDS đang chờ chủ file xử lý. Sửa được bằng token thì PHẢI sửa
 *  token, KHÔNG được thêm vào đây.
 *  ------------------------------------------------------------------------ */
const WAIVED = new Map([
  /* TRỐNG — và giữ cho nó trống. Hai mục cũ đều đã ĐÓNG bằng cách xoá nguồn phát,
     không phải bằng cách nới ngưỡng:
     - `bg-line/40` + `bg-line/70` (thumb ScrollArea) → `ui/scroll-area.tsx` đổi sang
       token ĐẶC rồi bị xoá hẳn ở Đợt 3 (không màn nào còn dùng ScrollArea).
     - `bg-accent/50` (vạch nối WizardStepper) → wizard tạo dự án đã bị xoá ở Đợt 1.
     Cả bốn class không còn trong src ⇒ scanner không sinh phép đo nào cho chúng. */
]);
let waived = 0;

/** ------------------------------------------------------------------------
 *  TOKEN NẰM NGOÀI MÔ HÌNH "chữ thân bài trên nền mờ" — KHÔNG phải miễn trừ.
 *
 *  W2B phát hiện khi nới `parseAlpha`: `bg-scrim/[var(--kg-scrim-a)]` (nền sau
 *  modal, 4 file `ui/*`) TRƯỚC ĐÂY bị bỏ qua Ở IM LẶNG — regex cũ chỉ nhận đích
 *  danh `--kg-tint-a`, mọi biến alpha khác trả `null` và rơi khỏi phép đo mà
 *  không in ra một dòng nào. Nay nó lọt vào và đo ra 3.02/2.66.
 *
 *  Nhưng con số đó đo một thứ KHÔNG TỒN TẠI: scrim là `<div class="fixed
 *  inset-0">` RỖNG — Radix không đặt chữ lên overlay, nội dung modal nằm ở
 *  `DialogContent` phía trên, trên nền `overlay` ĐỤC (đã đo riêng, PASS).
 *  Scrim cũng không mang thông tin trạng thái nên 1.4.11 không áp: nhiệm vụ
 *  của nó đúng là LÀM MỜ. Đo nó bằng ngưỡng chữ là bắt nhầm, và một cổng bắt
 *  nhầm là một cổng sẽ bị tắt (bài học `check-dead-classes` W2A-5).
 *
 *  Nên: loại khỏi mô hình, nhưng **IN RA** kèm lý do — im lặng là thứ đã giấu
 *  nó suốt ba wave. Muốn thêm token vào đây thì phải chứng minh nó không bao
 *  giờ có chữ con, không chỉ là "đo ra xấu".
 *  ------------------------------------------------------------------------ */
const NO_TEXT_TOKENS = new Map([
  ["scrim", "nền sau modal — <div> rỗng phủ toàn màn, chữ của modal nằm ở lớp `overlay` ĐỤC bên trên"],
]);

/** Các class alpha KHÔNG mang chữ — đo theo WCAG 1.4.11 (≥3:1) thay vì 4.5:1.
    Mỗi mục kèm file:dòng để người sau kiểm được là nó thật sự không có chữ.

    TRỐNG từ Đợt 3: cả ba mục cũ (`bg-accent/50` của WizardStepper, `bg-line/40` +
    `bg-line/70` của thumb ScrollArea) trỏ vào file đã bị xoá. Bảng ở lại vì cơ chế
    vẫn đúng — một thanh tiến trình hay một thumb mới sẽ cần đúng lối này. */
const NON_TEXT_ALPHA = new Map([]);

/** Quét toàn bộ nguồn, gom (kind, token, alpha) → nơi dùng đầu tiên. */
function scanAlphaUsages(V) {
  const files = walkSrc(SRC_DIR);
  const bg = new Map();      // "token@alpha" → {token, a, cls, where}
  const border = new Map();
  const opacity = new Map(); // "0.8" → {a, where}
  const rgba = new Map();    // css rgb(var(--kg-x) / a)

  const RE_BG = /\bbg-([a-z][a-z0-9-]*?)\/(\[[^\]]+\]|\d{1,3})(?![\w-])/g;
  const RE_BD = /\bborder-(?:[lrtbxy]-)?([a-z][a-z0-9-]*?)\/(\[[^\]]+\]|\d{1,3})(?![\w-])/g;
  const RE_OP = /\bopacity-(\[[^\]]+\]|\d{1,3})(?![\w-])/g;
  /* W2B: alpha có thể là số HOẶC bất kỳ biến `--kg-*` nào (thang tint hai bậc). */
  const RE_RGBA = /rgb\(\s*var\(--kg-([a-z0-9-]+)\)\s*\/\s*([0-9.]+|var\(--kg-[a-z0-9-]+\))\s*\)/g;

  for (const f of files) {
    /* Bỏ chú thích TRƯỚC khi quét: `button.tsx` và `CommandPalette.tsx` có nhắc
       `opacity-45`/`opacity-60` trong comment kể lại lỗi CŨ đã sửa. Quét thô sẽ
       đo một class KHÔNG còn tồn tại trong CSS ⇒ báo động giả. Thay bằng khoảng
       trắng cùng độ dài để số dòng/cột trong `file:dòng` vẫn đúng. */
    const src = stripComments(readFileSync(f, "utf8"));
    const lines = src.split("\n");
    const at = (idx) => `${f.slice(resolve(HERE, "..").length + 1)}:${src.slice(0, idx).split("\n").length}`;
    void lines;
    for (const [re, bucket] of [[RE_BG, bg], [RE_BD, border]]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const a = parseAlpha(m[2], V);
        if (a === null || a >= 1) continue;
        const key = `${m[1]}@${a}`;
        if (!bucket.has(key)) bucket.set(key, { token: m[1], a, cls: m[0], where: at(m.index) });
      }
    }
    RE_OP.lastIndex = 0;
    let m;
    while ((m = RE_OP.exec(src))) {
      const a = parseAlpha(m[1], V);
      if (a === null || a >= 1 || a === 0) continue; // 0/100 là ẩn-hiện, không phải đọc chữ
      if (!opacity.has(String(a))) opacity.set(String(a), { a, cls: m[0], where: at(m.index) });
    }
    if (f === GLOBALS) {
      RE_RGBA.lastIndex = 0;
      while ((m = RE_RGBA.exec(src))) {
        const a = m[2].startsWith("var")
          ? alphaVar(V, m[2].replace(/^var\(\s*--kg-|\s*\)$/g, ""))
          : Number(m[2]);
        if (!Number.isFinite(a) || a >= 1) continue;
        const key = `${m[1]}@${a}`;
        if (!rgba.has(key)) rgba.set(key, { token: m[1], a, cls: m[0], where: at(m.index) });
      }
    }
  }
  return { bg, border, opacity, rgba };
}

/** In & đo một nhóm nền mờ. */
function auditAlpha(name, V, g, LAYERS) {
  const { bg, border, opacity, rgba } = scanAlphaUsages(V);
  const has = (k) => V[k] !== undefined && parseRgb(V[k]) !== null;

  console.log(`\n${"-".repeat(78)}`);
  console.log(`-- [A1] CẶP MÀU SAU KHI ĐÈ ALPHA — theme ${name} · quét từ src/**, đo ở lớp nền XẤU NHẤT`);
  console.log(`${"-".repeat(78)}`);

  /** đo `fg` trên nền (token@a) đã composite, lấy lớp xấu nhất trong 4 lớp */
  const worstOnTint = (tok, a, fg) => {
    let worst = null, worstBg = null, worstLayer = null;
    for (const layer of LAYERS) {
      const composited = over(g(tok), a, g(layer));
      const v = cr(fg, composited);
      if (worst === null || v < worst) { worst = v; worstBg = composited; worstLayer = layer; }
    }
    return { worst, worstBg, worstLayer };
  };

  console.log("\n   ① nền mờ `bg-<token>/<alpha>` — chữ thân bài + mực trạng thái đặt lên trên");
  const bgRows = [...bg.values()].sort((x, y) => x.token.localeCompare(y.token) || x.a - y.a);
  for (const row of bgRows) {
    const tok = TOKEN_OF(row.token);
    if (!has(tok)) { console.log(`  SKIP  ${row.cls} — token --kg-${tok} không tồn tại (${row.where})`); continue; }
    if (NO_TEXT_TOKENS.has(row.token)) {
      console.log(`  N/A   ${T(row.cls, 38)} ngoài mô hình chữ-trên-nền-mờ: ${NO_TEXT_TOKENS.get(row.token)} · ${row.where}`);
      continue;
    }
    if (NON_TEXT_ALPHA.has(row.cls)) {
      // thành phần đồ hoạ: đo chính khối mờ với nền dưới nó (1.4.11)
      let worst = null, worstBg = null;
      for (const layer of LAYERS) {
        const composited = over(g(tok), row.a, g(layer));
        const v = cr(composited, g(layer));
        if (worst === null || v < worst) { worst = v; worstBg = g(layer); }
      }
      total++;
      const waive = worst < 3.0 && WAIVED.has(row.cls);
      const ok = worst >= 3.0; if (!ok && !waive) fails++; if (waive) waived++;
      const suffix = waive ? ` · MIỄN TRỪ: ${WAIVED.get(row.cls)}` : "";
      console.log(`  ${ok ? "PASS" : waive ? "WAIV" : "FAIL"}  ${T(row.cls + " (đồ hoạ)", 38)} ${hex(over(g(tok), row.a, worstBg))} on ${hex(worstBg)} = ${worst.toFixed(2).padStart(6)}  (min 3.0) · ${NON_TEXT_ALPHA.get(row.cls)}${suffix}`);
      continue;
    }
    let inks;
    if (SOLID_INK[row.token]) {
      inks = [SOLID_INK[row.token]];
    } else {
      inks = ["fg-default", "fg-muted"];
      const ink = INK_OF[row.token];
      if (ink && has(ink) && !inks.includes(ink)) inks.push(ink);
    }
    // nền là lớp nền thật (canvas/surface/raised/overlay) ở alpha ⇒ chữ trên đó vẫn là bộ chữ thường
    for (const fgName of inks) {
      const { worst, worstBg, worstLayer } = worstOnTint(tok, row.a, g(fgName));
      chk(`${row.cls} · ${fgName}`, g(fgName), worstBg, 4.5, `· xấu nhất trên ${worstLayer} · ${row.where}`, row.cls);
      void worst;
    }
  }

  console.log("\n   ② viền mờ `border-<token>/<alpha>` — WCAG 1.4.11 ≥3:1 (viền mang thông tin trạng thái)");
  for (const row of [...border.values()].sort((x, y) => x.token.localeCompare(y.token) || x.a - y.a)) {
    const tok = TOKEN_OF(row.token);
    if (!has(tok)) { console.log(`  SKIP  ${row.cls} — token --kg-${tok} không tồn tại (${row.where})`); continue; }
    let worst = null, worstBg = null, worstLayer = null;
    for (const layer of LAYERS) {
      const composited = over(g(tok), row.a, g(layer));
      const v = cr(composited, g(layer));
      if (worst === null || v < worst) { worst = v; worstBg = g(layer); worstLayer = layer; }
    }
    total++;
    const waive = worst < 3.0 && WAIVED.has(row.cls);
    const ok = worst >= 3.0; if (!ok && !waive) fails++; if (waive) waived++;
    console.log(`  ${ok ? "PASS" : waive ? "WAIV" : "FAIL"}  ${T(row.cls, 38)} ${hex(over(g(tok), row.a, worstBg))} on ${hex(worstBg)} = ${worst.toFixed(2).padStart(6)}  (min 3.0) · xấu nhất trên ${worstLayer} · ${row.where}`);
  }

  console.log("\n   ③ `opacity-<n>` trên cả khối — chữ bị nhoè theo, đo chữ đã trộn với nền dưới");
  if (opacity.size === 0) console.log("  (không còn chỗ nào dùng opacity trung gian cho nội dung — chỉ còn 0/100 ẩn-hiện)");
  for (const row of [...opacity.values()].sort((x, y) => x.a - y.a)) {
    for (const fgName of ["fg-default", "fg-muted"]) {
      let worst = null, worstBg = null, worstLayer = null;
      for (const layer of LAYERS) {
        const faded = over(g(fgName), row.a, g(layer));
        const v = cr(faded, g(layer));
        if (worst === null || v < worst) { worst = v; worstBg = g(layer); worstLayer = layer; }
      }
      total++;
      const ok = worst >= 4.5; if (!ok) fails++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  ${T(`${row.cls} · ${fgName}`, 38)} ${hex(over(g(fgName), row.a, worstBg))} on ${hex(worstBg)} = ${worst.toFixed(2).padStart(6)}  (min 4.5) · xấu nhất trên ${worstLayer} · ${row.where}`);
    }
  }

  console.log("\n   ④ alpha viết thẳng trong globals.css `rgb(var(--kg-x) / a)`");
  for (const row of [...rgba.values()].sort((x, y) => x.token.localeCompare(y.token) || x.a - y.a)) {
    const tok = TOKEN_OF(row.token);
    if (!has(tok)) { console.log(`  SKIP  ${row.cls} (${row.where})`); continue; }
    const nonText = row.token === "line" || /shadow/.test(row.token);
    let worst = null, worstBg = null, worstLayer = null;
    for (const layer of LAYERS) {
      const composited = over(g(tok), row.a, g(layer));
      const v = nonText ? cr(composited, g(layer)) : cr(g("fg-strong"), composited);
      if (worst === null || v < worst) { worst = v; worstBg = g(layer); worstLayer = layer; }
    }
    total++;
    const min = nonText ? 3.0 : 4.5;
    const ok = worst >= min; if (!ok) fails++;
    const label = nonText ? `${row.cls} (đồ hoạ)` : `${row.cls} · fg-strong`;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${T(label, 38)} ${hex(over(g(tok), row.a, worstBg))} ~ ${hex(worstBg)} = ${worst.toFixed(2).padStart(6)}  (min ${min.toFixed(1)}) · xấu nhất trên ${worstLayer} · ${row.where}`);
  }
}

console.log("kit-gen v2 · kiểm tương phản WCAG 2.1 — nguồn: src/styles/tokens.css");
auditTheme("dark", DARK);
auditTheme("light", LIGHT);

// ---------- đối chiếu bệnh v1 (audit I1): phải FAIL để chứng minh script đo đúng ----------
console.log(`\n${"=".repeat(78)}\n=== SANITY: bệnh của v1 phải bị bắt (audit I1)\n${"=".repeat(78)}`);
const v1 = cr([0x2f, 0x6f, 0xed], [0x2f, 0x34, 0x45]);
const sane = v1 < 3.0;
console.log(`  ${sane ? "PASS" : "FAIL"}  v1 viền ô đang chọn #2F6FED trên #2F3445 = ${v1.toFixed(2)} (phải < 3.0 → script bắt được lỗi thật)`);
if (!sane) fails++;
total++;

/* Sanity của NHÓM ALPHA (FE-1·A1): bộ chữ phụ CŨ (#9A9A9A) trên ô đang chọn
   `bg-accent/[0.18]` phải ra < 4.5 — đây chính là cặp mà 93 phép đo cũ bỏ lọt.
   Nếu phép này ra PASS nghĩa là công thức composite đã bị làm hỏng. */
const aOld = cr([0x9a, 0x9a, 0x9a], over([113, 208, 131], 0.18, [26, 27, 30]));
const aSane = aOld < 4.5;
console.log(`  ${aSane ? "PASS" : "FAIL"}  alpha: chữ phụ cũ #9A9A9A trên accent/18% phủ raised = ${aOld.toFixed(2)} (phải < 4.5 → nhóm alpha đo đúng)`);
if (!aSane) fails++;
total++;

console.log(`\n${"=".repeat(78)}`);
console.log(
  fails === 0
    ? `KẾT QUẢ: ${total - waived}/${total} PASS` + (waived ? ` · ${waived} MIỄN TRỪ (ngoài glob nhánh A — xem teams/react/NEEDS-fe2-a.md)` : "")
    : `KẾT QUẢ: ${fails}/${total} FAIL` + (waived ? ` · ${waived} MIỄN TRỪ` : "")
);
process.exit(fails === 0 ? 0 : 1);
