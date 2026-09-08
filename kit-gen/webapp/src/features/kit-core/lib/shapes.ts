/**
 * features/kit-core/lib/shapes.ts (08/09/2026 đổi nhà từ `features/design/lib/`)
 * — HÌNH KHỐI KHUNG XƯƠNG cho lưới ô (§3-S3.3) và
 * whitelist `shape` cho luật validate.
 *
 * NGUỒN SỰ THẬT LÀ MÃ ENGINE, KHÔNG PHẢI TRÍ NHỚ: mọi hằng số ở đây tới từ
 * `shape-data.generated.ts`, do `scripts/extract-shapes.mjs` rút thẳng từ
 * `silhouettes.js` · `skeleton.py` · `agent/lib/validate.mjs` · `slice.py`.
 * Brief §4 yêu cầu đúng điều này ("đọc silhouettes.js/skeleton.py để lấy danh sách,
 * không gõ tay"), và bài học `teams/design/INTEGRATION.md §1.6` cho thấy vì sao:
 * bản mirror gõ tay của web vanilla LỆCH 10/11 shape mà không ai biết.
 *
 * Hình học SVG dưới đây là bản dựng lại của `silhouette()` (silhouettes.js dòng 85–127).
 * Ca `__tests__/shape-source.test.ts` so TỪNG KÝ TỰ markup với file gốc — lệch là FAIL.
 */
import {
  DEFAULT_POSES, LIMBS, MATTE_VALUES, POSE_META, SHAPE_META, SLICE_CONST,
} from "./shape-data.generated";

export { DEFAULT_POSES, MATTE_VALUES, SLICE_CONST, SHAPE_META, POSE_META };

/** Màu của silhouettes.js (FILL/EDGE) — hình khung xương là ẢNH GỬI CHO MODEL,
 *  không phải phần tử giao diện, nên nó KHÔNG dùng token màu của app: đổi màu ở
 *  đây là làm ảnh ref khác đi so với thứ engine gửi đi. */
export const SIL_FILL = "#9a9a9a";
export const SIL_EDGE = "#606060";

export type ShapeId = string;

/** Whitelist hiện hành. Client KHÔNG được hẹp hơn agent (nếu không, user kẹt). */
export function shapeWhitelist(extra: readonly string[] = []): string[] {
  return [...new Set([...SHAPE_META.map((s) => s.id), ...extra])];
}

export function isKnownShape(shape: unknown, extra: readonly string[] = []): boolean {
  return shapeWhitelist(extra).includes(String(shape));
}

export function shapeLabel(shape: unknown): string {
  const id = String(shape ?? "");
  return SHAPE_META.find((s) => s.id === id)?.label ?? id;
}

/** Lựa chọn cho <select> "Hình khối". `empty` không nằm ở đây — muốn ô trống thì
 *  dùng nút [Xoá element] (ô thành trống), không phải đổi shape. */
export function shapeOptions(extra: readonly string[] = []): { value: string; label: string; drawable: boolean }[] {
  const known = new Map(SHAPE_META.map((s) => [s.id, s]));
  return shapeWhitelist(extra)
    .filter((s) => s !== "empty")
    .map((s) => ({
      value: s,
      label: known.get(s)?.label ?? s,
      drawable: known.get(s)?.drawableSvg ?? false,
    }));
}

/** 19 dáng: id + nhãn VI (nguyên văn `POSES[x].vi` của silhouettes.js). */
export function poseOptions(): { value: string; label: string }[] {
  return POSE_META.map((p) => ({ value: p.id, label: p.vi }));
}

export function poseLabel(id: unknown): string {
  const s = String(id ?? "");
  return POSE_META.find((p) => p.id === s)?.vi ?? s;
}

/** Tỉ lệ ô thật: landscape 3:2 · portrait 2:3 (§3-S3.3, khớp skeleton.py 1024×1536). */
export function cellAspect(orient: unknown): number {
  return orient === "portrait" ? 2 / 3 : 3 / 2;
}

/** Kích thước sheet thật mà engine render (skeleton.py dòng 96) — dùng để hiện px/ô. */
export function sheetPixels(orient: unknown): { w: number; h: number } {
  return orient === "portrait" ? { w: 1024, h: 1536 } : { w: 1536, h: 1024 };
}

/** Kích thước THẬT của một element trong ảnh sinh ra (px) — cho user biết to nhỏ ra sao. */
export function elementPixels(
  orient: unknown,
  grid: { cols: number; rows: number },
  skel: { w?: number; h?: number; shape?: string } | null | undefined,
): { w: number; h: number } {
  const sheet = sheetPixels(orient);
  const cw = sheet.w / Math.max(1, grid.cols);
  const ch = sheet.h / Math.max(1, grid.rows);
  if (skel?.shape === "full") return { w: Math.round(cw), h: Math.round(ch) };
  return { w: Math.round(cw * (skel?.w ?? 0.8)), h: Math.round(ch * (skel?.h ?? 0.6)) };
}

/* ══════════════ Silhouette SVG — mirror của silhouettes.js dòng 85–127 ══════════════ */

export interface SkelLike {
  shape?: string;
  w?: number;
  h?: number;
  plain?: boolean;
  pose?: string;
  [k: string]: unknown;
}

const jointsOf = (poseId: unknown): Record<string, [number, number]> => {
  const p = POSE_META.find((x) => x.id === String(poseId)) ?? POSE_META.find((x) => x.id === "idle");
  return (p?.j ?? {}) as Record<string, [number, number]>;
};

/** `poseSVG()` của silhouettes.js — bộ xương OpenPose (chi màu + 13 chấm khớp). */
export function poseSvgMarkup(poseId: unknown, w: number, h: number): string {
  const j = jointsOf(poseId);
  const P = (k: string): [number, number] => {
    const v = j[k] ?? [0.5, 0.5];
    return [v[0] * w, v[1] * h];
  };
  const lw = Math.max(5, w * 0.045);
  let out = "";
  for (const [a, b, color] of LIMBS) {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${lw}" stroke-linecap="round"/>`;
  }
  const [hx, hy] = P("head");
  out += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(h * 0.085).toFixed(1)}" fill="none" stroke="#e6194b" stroke-width="${lw}"/>`;
  for (const k of Object.keys(j)) {
    const [x, y] = P(k);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(lw * 0.65).toFixed(1)}" fill="#222"/>`;
  }
  return out;
}

/**
 * `silhouette()` của silhouettes.js. Trả MARKUP (chuỗi) vì đó là dạng so sánh được
 * từng ký tự với bản gốc trong test. Component `<Silhouette>` bọc nó lại để render.
 *
 * `uid` phải DUY NHẤT trong trang: `puzzle` dùng `<mask id="pz…">`, trùng id là hai ô
 * cùng ăn một mask (lỗi kinh điển của SVG inline).
 */
export function silhouetteMarkup(shape: unknown, w: number, h: number, uid: string, skel: SkelLike = {}): string {
  const c = skel.plain
    ? `fill="${SIL_FILL}"`
    : `fill="${SIL_FILL}" stroke="${SIL_EDGE}" stroke-width="3"`;
  if (shape === "empty") return "";
  if (shape === "pose") return poseSvgMarkup(skel.pose, w, h);
  if (shape === "pill" || shape === "bar")
    return `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" ${c}/>`;
  if (shape === "rrect")
    return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) / 6}" ${c}/>`;
  if (shape === "circle") {
    const r = Math.min(w, h) / 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" ${c}/>`;
  }
  if (shape === "burst") {
    const R = Math.min(w, h) / 2;
    const pts: string[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? R * 0.45 : R;
      pts.push(`${w / 2 + r * Math.cos(a)},${h / 2 + r * Math.sin(a)}`);
    }
    return `<polygon points="${pts.join(" ")}" ${c}/>`;
  }
  if (shape === "puzzle") {
    const tab = Math.min(w, h) * 0.22;
    const rx = Math.min(w, h) / 8;
    return `<mask id="pz${uid}">
          <rect x="0" y="${tab}" width="${w}" height="${h - tab}" rx="${rx}" fill="#fff"/>
          <circle cx="${w / 2}" cy="${tab}" r="${tab}" fill="#fff"/>
          <circle cx="0" cy="${(h + tab) / 2}" r="${tab}" fill="#000"/>
        </mask>
        <rect x="-6" y="-6" width="${w + 12}" height="${h + 12}" fill="${SIL_FILL}" mask="url(#pz${uid})"/>`;
  }
  if (shape === "figure") {
    const hr = Math.min(w * 0.4, h * 0.24);
    const by = hr * 1.8;
    const bw = w * 0.66;
    const bh = h - by;
    const aw = w * 0.15;
    const ah = bh * 0.5;
    return `<circle cx="${w / 2}" cy="${hr}" r="${hr}" ${c}/>
        <rect x="${(w - bw) / 2}" y="${by}" width="${bw}" height="${bh}" rx="${bw / 3}" ${c}/>
        <rect x="${(w - bw) / 2 - aw * 0.8}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${c}
              transform="rotate(12 ${(w - bw) / 2} ${by + bh * 0.06})"/>
        <rect x="${(w + bw) / 2 - aw * 0.2}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${c}
              transform="rotate(-12 ${(w + bw) / 2} ${by + bh * 0.06})"/>`;
  }
  if (shape === "full") return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" ${c}/>`;
  return "";
}
