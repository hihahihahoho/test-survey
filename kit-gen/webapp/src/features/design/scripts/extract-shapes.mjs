/**
 * extract-shapes.mjs — RÚT whitelist shape + bảng dáng TỪ MÃ NGUỒN THẬT, không gõ tay.
 *
 * Brief §4 nói rõ: "shape thuộc whitelist (đọc silhouettes.js/skeleton.py để lấy danh
 * sách, không gõ tay)". Script này là cách thi hành câu đó — nó đọc 3 nguồn và GIAO/HỢP
 * chúng lại, rồi sinh `src/features/design/lib/shape-data.generated.ts`.
 *
 *   1. /silhouettes.js        — `silhouette()` dòng 85–127 (nguồn vẽ SVG của studio + skeleton.html)
 *   2. /skeleton.py           — `SHAPES` dòng 81 + nhánh `shape == "empty"|"full"` (bản PIL)
 *   3. /agent/lib/validate.mjs— `SHAPES` dòng 6 (thứ agent CHẤP NHẬN)
 *
 * LUẬT: client KHÔNG ĐƯỢC HẸP HƠN AGENT (nếu không user bị kẹt: contract agent cho qua mà
 * UI chặn). Vì vậy whitelist xuất ra = tập của agent, kèm cờ `drawable` = có trong
 * silhouettes.js hay không, để UI nói đúng sự thật ("engine sẽ không vẽ được ô này").
 *
 * Chạy:  node src/features/design/scripts/extract-shapes.mjs
 * Kiểm:  npx vitest run --config src/features/design/__tests__/vitest.config.ts
 *        (ca test đối chiếu lại file sinh ra với 3 nguồn — lệch là FAIL)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "../../../../../");

const read = (p) => readFileSync(resolve(REPO, p), "utf8");

/** Shape mà `silhouette()` của silhouettes.js thật sự VẼ RA hình (khác rỗng). */
export function shapesFromSilhouettes(src = read("silhouettes.js")) {
  const body = src.slice(src.indexOf("function silhouette("));
  const out = new Set();
  // `if (shape === "x")` và `shape === "x" || shape === "y"`
  for (const m of body.matchAll(/shape === "([a-z0-9]+)"/g)) out.add(m[1]);
  // `if (shape === "empty") return "";` — CÓ nhánh nhưng CỐ Ý không vẽ gì.
  for (const m of body.matchAll(/shape === "([a-z0-9]+)"\)\s*return "";/g)) out.delete(m[1]);
  return [...out];
}

/** POSES của silhouettes.js: id → { vi, khớp }. Rút bằng cách CHẠY file thật trong sandbox. */
export async function posesFromSilhouettes() {
  const src = read("silhouettes.js");
  // silhouettes.js kết thúc bằng `})(typeof window !== "undefined" ? window : globalThis)`.
  // Khai một biến `window` CỤC BỘ trong hàm bọc ⇒ IIFE gán vào object của ta, KHÔNG đụng
  // globalThis. Đây là điều kiện để ca test có nghĩa: so mirror với NGUỒN THẬT, chứ không
  // so hàm thật với chính nó (bài học teams/design/INTEGRATION.md §1.6).
  const fn = new Function(`const window = {};\n${src}\nreturn window.KITSIL;`);
  const KITSIL = fn();
  if (!KITSIL || !KITSIL.POSES) throw new Error("Nạp silhouettes.js thất bại: không thấy KITSIL.POSES");
  return KITSIL;
}

/**
 * skeleton.py (bản PIL của engine). Hai nhóm khác nhau, KHÔNG được gộp:
 *  · `SHAPES` dict → có hàm vẽ thật
 *  · nhánh `sk["shape"] == "empty"` → `continue` (cố ý không vẽ), `== "full"` → vẽ chữ nhật
 */
export function shapesFromSkeletonPy(src = read("skeleton.py")) {
  const m = src.match(/SHAPES\s*=\s*\{([\s\S]*?)\}/);
  const drawable = new Set();
  if (m) for (const k of m[1].matchAll(/"([a-z0-9]+)"\s*:/g)) drawable.add(k[1]);
  for (const k of src.matchAll(/sk\["shape"\]\s*==\s*"([a-z0-9]+)":\s*\n\s*(\w+)/g)) {
    if (k[2] !== "continue") drawable.add(k[1]); // `continue` = cố ý bỏ trống
  }
  return [...drawable];
}

/** SHAPES của agent — tập CHẤP NHẬN được; client không được hẹp hơn. */
export function shapesFromAgent(src = read("agent/lib/validate.mjs")) {
  const m = src.match(/const SHAPES = new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("Không tìm thấy SHAPES trong agent/lib/validate.mjs");
  return [...m[1].matchAll(/"([a-z0-9]+)"/g)].map((x) => x[1]);
}

/** matte: slice.py chỉ hiểu đúng 2 giá trị — rút từ chính slice.py. */
export function matteFromSlicePy(src = read("slice.py")) {
  const out = new Set();
  for (const m of src.matchAll(/matte"?\)?\s*in\s*\("([a-z]+)",\s*"([a-z]+)"\)/g)) {
    out.add(m[1]);
    out.add(m[2]);
  }
  return [...out];
}

/** BLEED của slice.py — hằng số module (M4: UI đổi KHÔNG có tác dụng thật). */
export function bleedFromSlicePy(src = read("slice.py")) {
  const m = src.match(/^BLEED\s*=\s*([0-9.]+)/m);
  const th = src.match(/^DEFAULT_THRESHOLD\s*=\s*([0-9]+)/m);
  const go = src.match(/^GROW_OFFSET\s*=\s*([0-9]+)/m);
  return {
    bleed: m ? Number(m[1]) : null,
    threshold: th ? Number(th[1]) : null,
    growOffset: go ? Number(go[1]) : null,
    /** true = BLEED là hằng số module, KHÔNG đọc từ contract ⇒ UI phải nói rõ. */
    bleedIsModuleConstant: /^BLEED\s*=/m.test(src) && !/BLEED\s*=\s*(style|sheet|cfg)/.test(src),
  };
}

/** 19 dáng mặc định — đọc từ styles.example.json (`characterPoses`), không gõ tay. */
export function posesFromExample(src = read("styles.example.json")) {
  const j = JSON.parse(src);
  return Array.isArray(j.characterPoses) ? j.characterPoses : [];
}

const LABELS = {
  pill: "Viên nhộng (pill)",
  bar: "Thanh ngang (bar)",
  rrect: "Chữ nhật bo góc",
  rect: "Chữ nhật",
  circle: "Tròn",
  burst: "Tia nổ",
  puzzle: "Mảnh ghép",
  figure: "Hình người",
  pose: "Dáng nhân vật",
  full: "Tràn nền (full-bleed)",
  empty: "Ô trống",
};

export async function build() {
  const agent = shapesFromAgent();
  const svg = new Set(shapesFromSilhouettes());
  const py = new Set(shapesFromSkeletonPy());
  const KITSIL = await posesFromSilhouettes();
  const poseIds = Object.keys(KITSIL.POSES);
  const poses = poseIds.map((id) => ({
    id,
    vi: KITSIL.POSES[id].vi,
    j: KITSIL.POSES[id].j,
  }));
  const matte = matteFromSlicePy();
  const slice = bleedFromSlicePy();
  const defaultPoses = posesFromExample();

  const shapes = agent.map((id) => ({
    id,
    label: LABELS[id] ?? id,
    /** silhouettes.js vẽ ra hình (empty cố ý rỗng ⇒ false, đó là đúng). */
    drawableSvg: svg.has(id),
    /** skeleton.py (bản PIL của engine) xử lý được. */
    drawablePy: py.has(id),
  }));

  const header = `/* SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
 * Nguồn: silhouettes.js · skeleton.py · agent/lib/validate.mjs · slice.py · styles.example.json
 * Sinh lại: node src/features/design/scripts/extract-shapes.mjs
 * Ca test __tests__/shape-source.test.ts đối chiếu lại file này với 5 nguồn trên.
 */`;

  const body = `${header}

export interface ShapeMeta {
  id: string;
  label: string;
  /** silhouettes.js vẽ được (\`empty\` cố ý trả rỗng). */
  drawableSvg: boolean;
  /** skeleton.py (engine PIL) xử lý được. */
  drawablePy: boolean;
}

/** Whitelist = ĐÚNG tập agent chấp nhận. Client KHÔNG được hẹp hơn agent. */
export const SHAPE_META: readonly ShapeMeta[] = ${JSON.stringify(shapes, null, 2)} as const;

/** id dáng + nhãn VI + 13 khớp chuẩn hoá (0..1) — nguyên văn POSES của silhouettes.js. */
export const POSE_META: readonly { id: string; vi: string; j: Record<string, [number, number]> }[] =
  ${JSON.stringify(poses)} as const;

/** \`characterPoses\` mặc định — đọc từ styles.example.json. */
export const DEFAULT_POSES: readonly string[] = ${JSON.stringify(defaultPoses)} as const;

/** slice.py chỉ hiểu 2 giá trị matte này (rút từ chính slice.py). */
export const MATTE_VALUES: readonly string[] = ${JSON.stringify(matte.sort())} as const;

/** Hằng số cắt đọc từ slice.py — \`bleedIsModuleConstant\` là căn cứ cho cảnh báo M4. */
export const SLICE_CONST = ${JSON.stringify(slice, null, 2)} as const;

/** Màu chi kiểu OpenPose — nguyên văn LIMBS của silhouettes.js. */
export const LIMBS: readonly [string, string, string][] = ${JSON.stringify(
    // LIMBS không export ra KITSIL nên rút bằng regex từ nguồn
    limbsFromSource(),
  )} as const;
`;

  const out = resolve(REPO, "webapp/src/features/design/lib/shape-data.generated.ts");
  writeFileSync(out, body, "utf8");
  return { out, shapes, poses: poses.length, matte, slice };
}

export function limbsFromSource(src = read("silhouettes.js")) {
  const m = src.match(/const LIMBS = \[([\s\S]*?)\];/);
  if (!m) throw new Error("Không tìm thấy LIMBS trong silhouettes.js");
  return [...m[1].matchAll(/\["([a-z]+)",\s*"([a-z]+)",\s*"(#[0-9a-f]{6})"\]/g)].map((x) => [x[1], x[2], x[3]]);
}

if (process.argv[1] && process.argv[1].endsWith("extract-shapes.mjs")) {
  const r = await build();
  console.log("Đã sinh:", r.out);
  console.log("shapes:", r.shapes.map((s) => `${s.id}${s.drawableSvg ? "" : "(no-svg)"}`).join(" "));
  console.log("poses:", r.poses, "· matte:", r.matte, "· slice:", r.slice);
}
