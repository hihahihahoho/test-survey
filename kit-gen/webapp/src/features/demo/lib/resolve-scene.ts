/**
 * features/demo/lib/resolve-scene.ts — ② TẦNG SỐ HỌC CỦA MÀN DEMO. HÀM THUẦN.
 *
 * Không chạm DOM, không chạm mạng, không chạm Figma ⇒ mọi con số ở đây kiểm được
 * bằng kit THẬT mà không cần trình duyệt. Đây là chỗ duy nhất quyết định "ô này nằm
 * ở đâu, to bằng nào" — tầng DOM bên dưới chỉ đọc lại rồi in ra thuộc tính style.
 *
 * ╔══ TÁI DÙNG, KHÔNG VIẾT LẠI ═══════════════════════════════════════════════╗
 * ║ Hình học frame/ảnh lấy NGUYÊN `buildFigmaNodeForAsset` (`figma-node.ts`     ║
 * ║ `:197-215`) — bộ công thức đã đối chiếu 6/6 với node thật trong Figma:      ║
 * ║     frame = safe × scale · image = (origin − safe) × scale  (thường ÂM)     ║
 * ║ Ở đây chỉ BỌC THÊM hai thứ mà một ô đứng lẻ không cần: hệ số ép cỡ theo     ║
 * ║ thân và toạ độ trong khung màn.                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── VÌ SAO KHÔNG CÒN PHÉP "BÙ LỆCH TÂM" CỦA PROTOTYPE ─────────────────────┐
 * │ `screens.html:78-80` phải tính `dx/dy` để kéo tâm THÂN về đúng `(x, y)`,   │
 * │ vì div của nó to bằng cả ẢNH. Ở đây frame **là** safe zone, nên tâm frame  │
 * │ đã chính là tâm thân: phép bù biến mất. Vừa đúng hợp đồng §3.3 hơn, vừa ít │
 * │ hơn một chỗ để sai.                                                        │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import type { KitFile } from "@/lib/types";
import {
  FigmaNodeUnsupported, assetName, buildFigmaNodeForAsset, geometryOf,
  type FigmaNodeSpec,
} from "@/features/kit-core/lib/figma-node";
import type { ScreenNode, ScreenSpec, ScreenTextSpec } from "./screen-spec";

/** Một ô đã chốt xong mọi con số, đơn vị px trong khung màn. */
export interface SceneLayer {
  /** Tên ô (đã bỏ tiền tố `tight/`) — cũng là `aria-label` ⇒ tên frame trong Figma. */
  name: string;
  /** Đường dẫn để `loadFull()` lấy object URL. */
  path: string;
  /** Góc trên-trái của FRAME trong khung màn. */
  left: number;
  top: number;
  /** Frame = hitbox (safe zone) đã áp cả tỉ lệ xuất lẫn hệ số ép cỡ của spec. */
  frame: { w: number; h: number };
  /** Ảnh raster trong frame; `x`/`y` âm = trang trí tràn ra ngoài hitbox. */
  image: { x: number; y: number; w: number; h: number };
  /** `"screen"` cho ô phát sáng (`manifest.blend`) — xem `features/kit/lib/blend.ts`. */
  blend: FigmaNodeSpec["blend"];
  text: ScreenTextSpec | null;
}

/**
 * Nền màn. KHÔNG đi qua safe-frame: nó phủ kín khung và bị khung cắt, nên thứ cần
 * là bốn số của phép "cover" chứ không phải hitbox.
 */
export interface SceneBackground {
  name: string;
  path: string;
  left: number;
  top: number;
  w: number;
  h: number;
}

export interface SceneGap {
  /** Tên ô như spec viết (ô mascot: `pose-<char>-<dáng>`). */
  file: string;
  reason: string;
}

export interface ResolvedScene {
  id: string;
  /** `aria-label` của frame màn. */
  name: string;
  size: { w: number; h: number };
  ground: string;
  /** `null` ⇒ kit không có ô nền ⇒ **không dựng màn này**. */
  background: SceneBackground | null;
  layers: readonly SceneLayer[];
  /** Ô spec cần mà kit không có — bỏ qua, nhưng phải NÓI RA. */
  missing: readonly string[];
  /** Ô có ảnh nhưng manifest tả sai hình học ⇒ bỏ qua kèm lý do (`geometryOf` ném). */
  broken: readonly SceneGap[];
  /** Ô phát sáng trong màn — dialog gộp thành MỘT dòng nhắc, không bắn N toast. */
  glow: readonly string[];
}

export interface ResolveOptions {
  /** Nhân vật muốn dùng cho các ô `role:"pose"`. */
  char?: string | null;
  /** Tập tên file mà contract khai là ô mascot (`export-scale.ts`). */
  poseFiles?: ReadonlySet<string>;
}

/**
 * Tập ô mascot suy ra từ chính danh sách file, khi nơi gọi không có contract.
 *
 * ⚠️ KHÔNG bỏ được bước này: `scaleOf` đoán theo `file.file`, mà bản ghi của #42 mang
 * tiền tố thư mục (`tight/pose-taxi-wave`) nên `RE_POSE_NAME` — vốn đòi `pose` đứng
 * đầu hoặc sau `-`/`_` — TRƯỢT, và mascot sẽ bị xuất ở 50% thay vì 1:1. Ở đây so trên
 * TÊN ĐÃ BỎ TIỀN TỐ rồi trả về đúng chuỗi `file.file` mà `kindOf` sẽ tra.
 */
export function defaultPoseFiles(files: readonly KitFile[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) if (/(^|[-_])pose(-|_|$)/i.test(assetName(f))) out.add(f.file);
  return out;
}

/* ── Chỉ mục ô ────────────────────────────────────────────────────────────────
   #42 `GET /api/projects/:id/kit` phát MỖI FILE một bản ghi, nên một ô có tới hai:
   bản `tight/` (ruột đã cắt sát) và bản canvas (còn đệm bleed). Lưới kết quả ưu tiên
   `tight/` (`CutAssetGrid.cutAssets`) và màn demo cũng vậy — ảnh nhỏ hơn nhiều mà
   `geometryOf` vẫn ra đúng vị trí nhờ `contentAt`. */

/** Ký tự phải thoát khi ghép mã dáng vào regex tìm ô mascot. */
const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;

/** Tên ô → bản ghi tốt nhất của ô đó. */
export function indexKitFiles(files: readonly KitFile[]): Map<string, KitFile> {
  const out = new Map<string, KitFile>();
  for (const f of files) {
    if (f.empty) continue;
    const name = assetName(f);
    const cur = out.get(name);
    const isTight = String(f.file).startsWith("tight/");
    if (cur === undefined || (isTight && !String(cur.file).startsWith("tight/"))) out.set(name, f);
  }
  return out;
}

/**
 * Danh sách nhân vật có trong kit.
 *
 * ⚠️ ĐO TRÊN BỐN KIT THẬT — hai lối đặt tên cùng tồn tại và một kit có thể chỉ có
 * lối thứ hai: `ipay` → `soc`, `taxi` (tên dạng `pose-<char>-<dáng>`); `tet` → `lan`;
 * `rnd` → `soc`; **`candy` → không có gì**, mọi ô mascot của nó tên `NN-pose-<dáng>`
 * (`28-pose-wave`) nên trong tên file không có nhân vật nào để đọc ra. Vì vậy mảng
 * RỖNG là kết quả hợp lệ, và `resolveScene` phải tìm được dáng cả khi không biết nhân
 * vật nào — xem `findPose`. (Prototype `screens.html:151` chỉ biết lối thứ nhất, nên
 * nó không dựng nổi mascot cho `candy`.)
 */
export function charactersOf(files: readonly KitFile[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const m = /^pose-([^-]+)-(.+)$/.exec(assetName(f));
    if (m?.[1] !== undefined) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * Tìm file thật cho một ô mascot: ưu tiên đúng nhân vật, rồi tới bất kỳ tên nào kết
 * thúc bằng dáng đó. Hai dạng tên đều phải bắt được — `pose-taxi-wave` (ipay) và
 * `28-pose-wave` (candy/tet/rnd) — nên khúc giữa là tuỳ chọn.
 */
function findPose(index: ReadonlyMap<string, KitFile>, key: string, char: string | null): KitFile | null {
  if (char !== null && char !== "") {
    const exact = index.get(`pose-${char}-${key}`);
    if (exact !== undefined) return exact;
  }
  const re = new RegExp(`(^|[-_])pose-(.*-)?${key.replace(RE_ESCAPE, "\\$&")}$`);
  const hits = [...index.keys()].filter((name) => re.test(name)).sort();
  const first = hits[0];
  return first === undefined ? null : index.get(first) ?? null;
}

/** Tên spec dùng để báo thiếu — ô mascot không có tên file nên nói theo dáng. */
function gapName(node: ScreenNode, char: string | null): string {
  return node.role === "pose" ? `pose-${char === null || char === "" ? "*" : char}-${node.file}` : node.file;
}

/**
 * Hệ số ép cỡ. `bw`/`bh` là cỡ **thân** mong muốn trong khung màn, còn
 * `spec.frame` là thân đã nhân tỉ lệ xuất (mascot 1, UI 0.5) ⇒ chia ra là xong.
 *
 * ⚠️ LỆCH VỚI BẢN THIẾT KẾ §5.2 MỘT CÁCH CÓ CHỦ Ý: tài liệu viết
 * `layerScale = bw / safe.w`, nhưng `frame.w` đã là `safe.w × scale`, nên công thức
 * đó sẽ cho ra thân rộng `bw × scale` — tức mọi ô UI bé đi đúng một nửa và mascot thì
 * không. Chia cho `frame.w` mới giữ đúng lời hứa "thân rộng đúng `bw` px trên màn".
 */
function fitScale(node: ScreenNode, spec: FigmaNodeSpec): number {
  if (node.bw !== undefined && node.bw > 0) return node.bw / spec.frame.w;
  if (node.bh !== undefined && node.bh > 0) return node.bh / spec.frame.h;
  return 1;
}

function resolveBackground(file: KitFile, size: { w: number; h: number }): SceneBackground {
  const geo = geometryOf(file);
  /**
   * PHÉP "COVER" TỰ TÍNH, KHÔNG DÙNG `object-fit`.
   * Prototype dựa vào `object-fit:cover` (`screens.html:28`), nhưng encoder chỉ chép
   * `getBoundingClientRect()` của `<img>` — phần ảnh bị `object-fit` cắt/căn nằm
   * NGOÀI thứ nó chở đi, nên Figma sẽ kéo ảnh cho vừa khung và méo. Tính sẵn bốn số
   * rồi để khung màn (`overflow:hidden`) cắt phần thừa thì không có ẩn số nào.
   */
  const cover = Math.max(size.w / geo.pixels.w, size.h / geo.pixels.h);
  const w = geo.pixels.w * cover;
  const h = geo.pixels.h * cover;
  return {
    name: assetName(file),
    path: file.path,
    left: (size.w - w) / 2,
    top: (size.h - h) / 2,
    w,
    h,
  };
}

/** Spec + kit → mọi con số của một màn. Không ném: ô hỏng đi vào `missing`/`broken`. */
export function resolveScene(
  spec: ScreenSpec,
  files: readonly KitFile[],
  options: ResolveOptions = {},
): ResolvedScene {
  const index = indexKitFiles(files);
  const char = options.char ?? null;
  const poseFiles = options.poseFiles ?? defaultPoseFiles(files);

  const missing: string[] = [];
  const broken: SceneGap[] = [];
  const glow: string[] = [];
  const layers: Array<{ z: number; order: number; layer: SceneLayer }> = [];

  let background: SceneBackground | null = null;
  const bgFile = index.get(spec.background);
  if (bgFile === undefined) {
    missing.push(spec.background);
  } else {
    try {
      background = resolveBackground(bgFile, spec.size);
    } catch (err) {
      broken.push({ file: spec.background, reason: reasonOf(err) });
    }
  }

  spec.nodes.forEach((node, order) => {
    const file = node.role === "pose" ? findPose(index, node.file, char) : index.get(node.file) ?? null;
    if (file === null) {
      missing.push(gapName(node, char));
      return;
    }
    const name = assetName(file);
    let base: FigmaNodeSpec;
    try {
      base = buildFigmaNodeForAsset(file, { name, poseFiles });
    } catch (err) {
      broken.push({ file: name, reason: reasonOf(err) });
      return;
    }
    const k = fitScale(node, base);
    const frame = { w: base.frame.w * k, h: base.frame.h * k };
    if (base.blend !== null) glow.push(name);
    layers.push({
      z: node.z ?? 0,
      order,
      layer: {
        name,
        path: file.path,
        left: (node.x / 100) * spec.size.w - frame.w / 2,
        top: (node.y / 100) * spec.size.h - frame.h / 2,
        frame,
        image: {
          x: base.image.x * k,
          y: base.image.y * k,
          w: base.image.w * k,
          h: base.image.h * k,
        },
        blend: base.blend,
        text: node.text ?? null,
      },
    });
  });

  layers.sort((a, b) => (a.z === b.z ? a.order - b.order : a.z - b.z));

  return {
    id: spec.id,
    name: spec.name,
    size: spec.size,
    ground: spec.ground,
    background,
    layers: layers.map((l) => l.layer),
    missing,
    broken,
    glow,
  };
}

export function resolveScenes(
  specs: readonly ScreenSpec[],
  files: readonly KitFile[],
  options: ResolveOptions = {},
): ResolvedScene[] {
  return specs.map((spec) => resolveScene(spec, files, options));
}

/** Màn dựng được khi có nền — ô lẻ thiếu thì bỏ qua, mất nền thì không dán khung trống. */
export function sceneIsUsable(scene: ResolvedScene): boolean {
  return scene.background !== null && scene.layers.length > 0;
}

/** Tổng số ảnh sẽ đi vào payload (nền + từng ô) — dùng để nói trước cỡ và số node. */
export function sceneImageCount(scene: ResolvedScene): number {
  return (scene.background === null ? 0 : 1) + scene.layers.length;
}

function reasonOf(err: unknown): string {
  if (err instanceof FigmaNodeUnsupported) return err.message;
  return err instanceof Error ? err.message : String(err);
}
