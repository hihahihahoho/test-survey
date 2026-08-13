/**
 * kitset-to-contract.ts — HÒN ĐÁ MÓNG của WAVE 3 (UPGRADE-PLAN §W3-1).
 *
 * Biến state của workflow (thứ 6 file step đang sửa) thành `Contract` — thứ DUY NHẤT
 * mà `gen.sh` ăn được. Trước wave này module như vậy **không tồn tại ở bất kỳ đâu
 * trong repo**, nên workflow không có gì để lưu, để validate, để ước lượng, để preview.
 *
 * ┌── RANH GIỚI (giữ đúng §W3-1) ────────────────────────────────────────────┐
 * │ ADAPTER MỘT CHIỀU, đặt ở `lib/`. 6 file step KHÔNG được biết gì về        │
 * │ `Contract` — chúng tiếp tục đọc `useWorkflowStore()`. Chiều ngược lại     │
 * │ (Contract → state) KHÔNG có ở đây và không nên có: contract giàu hơn      │
 * │ state, dịch ngược là mất dữ liệu.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ══ VÌ SAO KHÔNG CHÉP THẲNG `form-to-contract.ts` ══════════════════════════
 * Plan bảo "chép khuôn từ `form-to-contract.ts`, đừng viết từ đầu" — tôi chép
 * KHUÔN (bg 1×1 riêng · pad ô `empty` · `contractSchema.parse` chốt cuối) nhưng
 * KHÔNG chép cách chọn lưới, vì đối chiếu với contract THẬT của dự án
 * (`styles.json`, 13 sheet · 122 component) thì cách đó sai hai chỗ:
 *
 *  ① `form-to-contract` ép MỌI lưới về hình vuông (`squareCapacity` → 1/4/9/16).
 *    `styles.json` thật KHÔNG vuông: sheet `tall` là **4×2**. Lý do là số học của
 *    canvas: ảnh landscape 1536×1024, lưới 4×2 ⇒ mỗi ô 384×512 = **dọc 3:4**.
 *    Muốn ô DỌC thì đổi TỶ LỆ LƯỚI, không phải đổi `orient` của sheet. Ép vuông
 *    ⇒ popup dọc (`w .78 · h .84`) bị nhét vào ô ngang 3:2 và méo.
 *  ② `form-to-contract` pad ô trống bằng `{file:""}` cho MỌI ô. Từ ô trống thứ hai
 *    trở đi điều đó **vi phạm V-02** (`contract.ts` bắt trùng tên file trong sheet,
 *    chuỗi rỗng cũng là một tên) ⇒ `contractSchema.parse` NÉM. `styles.json` thật
 *    đặt tên `_empty-1`, `_empty-2`… — đây là lý do có 4 file `_empty-*` trong đó.
 *    Module này đặt tên ô trống theo đúng quy ước ấy.
 *
 * ══ NGUỒN SỰ THẬT CỦA MỌI HẰNG SỐ DƯỚI ĐÂY ═══════════════════════════════
 * Không hằng nào ở đây do tôi nghĩ ra — tất cả đọc ra từ `styles.json` thật:
 *   · `cell_hint` 4 loại : "landscape 3:2 cell" · "portrait 3:4 cell"
 *                          · "full-bleed portrait scene" · "cell containing ONE full-body character"
 *   · sheet nền          : `grid 1×1` + `orient:"portrait"` (bg-home / bg-play)
 *   · sheet dáng         : landscape, lưới vuông, `ref` = ảnh nhân vật, kèm `note`
 *   · đường dẫn ref      : `refs/<name>` — khớp `gen.sh:136-142` (đính kèm tương đối
 *                          từ ROOT) VÀ `agent/lib/validate.mjs:100` `refUsage()`
 *                          (`p === name || p.endsWith("/" + name)`), nên V-08 "ref
 *                          đang được dùng" chặn xoá đúng.
 *   · trần 16 ô/sheet    : sheet lớn nhất của `styles.json` là 4×4.
 */
import {
  CHROMA_PRESETS,
  contractSchema,
  slugify,
  type Component,
  type Contract,
  type Sheet,
} from "@/lib/types/contract";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { buildStylePrompt } from "@/features/kit-form/lib/style-phrases";
import type { WorkflowMascot, WorkflowState } from "./model";
import { isPropElement } from "./user-library";

/* ══════════════════════════════════════════════════════════════════════════
   1. Hằng số — id ỔN ĐỊNH, không lấy từ chữ người dùng gõ
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ Id phong cách và id nhân vật là HẰNG, KHÔNG slug từ `kitName`/`mascotName`.
 *
 * Đây là quyết định có chủ ý, không phải lười. `contractJobs()` sinh job
 * `${variant.id}-${sheet.id}`, và `gen.sh:158` ghi ảnh ra `raw/<job>.png`.
 * Nếu id chạy theo tên người dùng gõ thì **đổi tên bộ kit = mồ côi toàn bộ ảnh
 * đã vẽ trên đĩa** (raw/, kits/, prompts/, logs/ đều khoá theo job). Tên người
 * dùng sống ở `vi` — nơi đổi bao nhiêu lần cũng không đụng tới đĩa.
 */
export const MAIN_VARIANT_ID = "chinh";
export const CHARACTER_ID = "nhan-vat";

/** Trần ô mỗi sheet. Landscape lưới vuông (4×4) · dọc lưới 2:1 (4×2) — xem đầu file. */
const MAX_CELLS_SQUARE = 16;
const MAX_CELLS_TALL = 8;

export interface SheetLimits {
  background: number;
  popup: number;
  small: number;
  props: number;
  mascot: number;
}

export const DEFAULT_SHEET_LIMITS: SheetLimits = {
  background: 2,
  popup: 4,
  small: 16,
  props: 16,
  mascot: 4,
};

const HINT_LANDSCAPE = "landscape 3:2 cell";
const HINT_PORTRAIT = "portrait 3:4 cell";
const HINT_BG = "full-bleed portrait scene";
const HINT_POSE = "cell containing ONE full-body character";

/** Chép nguyên `note` của sheet dáng trong `styles.json` — đây là prompt engineering
 *  đã chạy thật, không phải văn tôi viết. Chỉ dùng khi CÓ ảnh ref nhân vật. */
const POSE_NOTE =
  "All cells show THE SAME character as in the attached REFERENCE PHOTO: match its " +
  "species, face, colors, costume, materials and proportions exactly — only the pose " +
  "and viewing angle change per cell, like one character turnaround sheet.";

/** 19 dáng của `styles.example.json` → mô tả tiếng Anh cho `spec`.
 *  Dáng lạ vẫn chạy được (rơi về chính id), không ném. */
const POSE_SPEC: Record<string, string> = {
  idle: "standing still in a neutral relaxed idle pose, facing the viewer",
  wave: "waving one hand high in greeting",
  point: "pointing forward with one arm extended",
  "hold-gift": "holding a wrapped gift box with both hands in front of the chest",
  cheer: "cheering with both arms raised in celebration",
  sad: "looking down with slumped shoulders, sad expression",
  run: "running to the side, mid-stride, arms swinging",
  think: "one hand on the chin in a thinking pose, head slightly tilted",
  sit: "sitting down, legs forward, relaxed",
  jump: "jumping upward, both feet off the ground, arms up",
  bow: "bowing forward politely, hands together",
  "thumbs-up": "giving a confident thumbs-up with one hand",
  fly: "flying forward, body horizontal, arms stretched ahead",
  walk: "walking to the side, mid-step",
  dance: "dancing, weight on one leg, arms out in a playful rhythm",
  present: "presenting with one open palm to the side, as if showing a reward",
  "view-34": "standing in a three-quarter view, body turned about 45 degrees, face toward the viewer",
  "view-side": "standing in full side profile",
  "view-back": "standing seen from behind, back to the viewer",
};

/* ══════════════════════════════════════════════════════════════════════════
   2. Bước 1 — kitset của workflow ⇄ element THẬT của thư viện
   ══════════════════════════════════════════════════════════════════════════ */

/** Vì sao một món KHÔNG vào được contract. Cả hai đều phải NÓI RA trên UI, không nuốt. */
export type SkipReason =
  /** Món preset chưa có bản thiết kế (`wheel-board`) — UI đã tự gắn nhãn "bỏ qua khi vẽ thật". */
  | "mock"
  /** Có trong kitset nhưng không có trong thư viện element ⇒ không có `spec`/`skel` để vẽ. */
  | "unknown";

export interface SkippedElement {
  file: string;
  label: string;
  reason: SkipReason;
}

export interface ResolvedKitset {
  /** Món VẼ ĐƯỢC THẬT, đã kèm `spec`/`skel` của thư viện. */
  drawable: LibElement[];
  skipped: SkippedElement[];
}

/**
 * Đối chiếu kitset (chỉ có `file`/`label`) với thư viện element (có `spec`/`skel`).
 *
 * Món không đối chiếu được thì **bị bỏ ra và ghi tên vào `skipped`** — tuyệt đối không
 * im lặng thả rơi: ước lượng lượt đọc chính hàm này, nên nuốt một món = báo giá sai.
 */
export function resolveKitset(
  elements: readonly WorkflowState["elements"][number][],
  lib: readonly LibElement[],
): ResolvedKitset {
  const byFile = new Map(lib.map((e) => [e.file, e]));
  const drawable: LibElement[] = [];
  const skipped: SkippedElement[] = [];
  for (const e of elements) {
    if (!e.selected) continue;
    if (e.mock) {
      skipped.push({ file: e.file, label: e.label, reason: "mock" });
      continue;
    }
    const hit = byFile.get(e.file);
    if (!hit) {
      skipped.push({ file: e.file, label: e.label, reason: "unknown" });
      continue;
    }
    /* KÍCH THƯỚC RIÊNG CỦA DỰ ÁN đè lên số của thư viện — trộn ở ĐÂY, một lần, để
       contract, preview skeleton và bảng chi tiết không thể nói ba con số khác nhau.
       Thư viện chung không bị đụng tới: `hit` được sao ra bản mới. */
    const override = e.skel;
    drawable.push(
      override && (override.w !== undefined || override.h !== undefined)
        ? { ...hit, skel: { ...hit.skel, ...(override.w !== undefined ? { w: override.w } : {}), ...(override.h !== undefined ? { h: override.h } : {}) } }
        : hit,
    );
  }
  return { drawable, skipped };
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Xếp ô — giữ group liền kề, pad cho đủ cols×rows
   ══════════════════════════════════════════════════════════════════════════ */

/** Ô trống. Tên `_empty-N` là **bắt buộc**, không phải trang trí — xem ② ở đầu file. */
function emptyCell(n: number): Component {
  return { file: `_empty-${n}`, vi: "", spec: "", skel: { shape: "empty" } };
}

function toComponent(el: LibElement): Component {
  return { file: el.file, vi: el.vi, spec: el.spec, skel: { ...el.skel } };
}

/**
 * Lưới cho ô NGANG: vuông ⇒ ô thừa hưởng đúng tỷ lệ canvas 3:2.
 * (1536×1024 chia 4×4 = 384×256 = 3:2 — đúng `cell_hint` của sheet `main`.)
 */
function squareGrid(n: number): { cols: number; rows: number } {
  const side = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  return { cols: side, rows: side };
}

/**
 * Lưới cho ô DỌC: `cols = 2 × rows` ⇒ ô 3:4 trên canvas ngang.
 * (1536×1024 chia 4×2 = 384×512 = 3:4 — đúng sheet `tall` của `styles.json`.)
 */
function tallGrid(n: number): { cols: number; rows: number } {
  const rows = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(n / 2))));
  return { cols: rows * 2, rows };
}

function padTo(cells: Component[], capacity: number): Component[] {
  const out = [...cells];
  for (let i = out.length; i < capacity; i += 1) out.push(emptyCell(i - cells.length + 1));
  return out;
}

/**
 * Chia thành từng sheet ≤ `max` ô, **giữ nguyên khối các món cùng `group`**.
 *
 * Vì sao group phải liền: `element-lib` ghép cặp trạng thái (`toggle-off`/`toggle-on`,
 * `checkbox-off`/`checkbox-on`, 3 hạng huy chương…). Hai ô cùng cặp mà rơi vào hai
 * ảnh khác nhau thì model vẽ hai phong cách khác nhau, và cặp trạng thái đó vô dụng.
 * Group to hơn cả một sheet thì buộc phải cắt — nhưng cắt sau cùng, không cắt bừa.
 */
export function chunkKeepingGroups<T extends { group?: string }>(items: readonly T[], max: number): T[][] {
  const groups: T[][] = [];
  const at = new Map<string, T[]>();
  items.forEach((it, i) => {
    const key = it.group ? `g:${it.group}` : `solo:${i}`;
    const bucket = at.get(key);
    if (bucket) bucket.push(it);
    else {
      const fresh = [it];
      at.set(key, fresh);
      groups.push(fresh);
    }
  });

  const out: T[][] = [];
  let cur: T[] = [];
  for (const g of groups) {
    if (g.length > max) {
      if (cur.length) { out.push(cur); cur = []; }
      for (let i = 0; i < g.length; i += max) out.push(g.slice(i, i + max));
      continue;
    }
    if (cur.length + g.length > max) { out.push(cur); cur = []; }
    cur.push(...g);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Cắt thuần theo trần ô — cho danh sách không có khái niệm `group` (dáng nhân vật). */
function chunkBySize<T>(items: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += max) out.push(items.slice(i, i + max));
  return out;
}

/** `main`, `main2`, `main3`… — đúng quy ước `styles.json` (KHÔNG phải `main-2`). */
function seriesId(base: string, index: number): string {
  return index === 0 ? base : `${base}${index + 1}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Ảnh tham khảo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tên agent đặt (`inspo-1.png`) → đường dẫn contract (`refs/inspo-1.png`). Idempotent.
 *
 * Ref của agent LUÔN là **một đoạn đường dẫn duy nhất** (`agent/routes/refs.mjs:118`
 * `pickRefName` sinh `inspo-N.ext` / `brand-N.ext` / `char-<slug>.ext`, rồi
 * `safeSegment()` canh lúc xoá). Nên bất cứ thứ gì có `/` hay `..` bên trong đều
 * KHÔNG phải tên ref hợp lệ và bị trả về chuỗi rỗng (rồi bị lọc bỏ) — chứ không
 * phải bị "sửa" cho hợp lệ. Bản đầu của hàm này chỉ cắt dấu `/` đứng đầu, nên
 * `/etc/passwd` biến thành `refs/etc/passwd`: một đường dẫn có thư mục con, lọt
 * qua luật REF_PATH của `contract.ts` (chỉ chặn `..` và `/` ĐỨNG ĐẦU). Chính ca
 * test dưới `__tests__` bắt được, không phải tôi đọc lại mà thấy.
 */
export function refPath(name: string): string {
  const raw = String(name ?? "").trim();
  const seg = raw.startsWith("refs/") ? raw.slice("refs/".length) : raw;
  if (seg === "" || seg.includes("/") || seg.includes("\\") || seg.includes("..")) return "";
  return `refs/${seg}`;
}

const refPaths = (items: readonly { name: string }[]): string[] =>
  items.map((r) => refPath(r.name)).filter((p) => p !== "");

/* ══════════════════════════════════════════════════════════════════════════
   5. Hàm chính
   ══════════════════════════════════════════════════════════════════════════ */

/** Đúng những trường của `WorkflowState` mà contract cần — `Pick` để không lệch khi model đổi. */
export type KitsetContractInput = Pick<
  WorkflowState,
  | "kitName" | "campaign" | "stylePrompt" | "styleMode" | "styleAxes"
  | "primaryColor" | "secondaryColor" | "styleAvoid" | "chroma" | "sliceThreshold"
  | "elements" | "styleRefs" | "brandRefs"
  | "mascotEnabled" | "mascotName" | "mascotDescription" | "mascotRef" | "mascotPoses"
> & {
  /** UI-FIX §3b — danh sách nhân vật. Thiếu (bản nháp cũ) ⇒ rơi về ba trường `mascot*`. */
  mascots?: readonly WorkflowMascot[];
};

/**
 * Rút đúng phần state mà contract phụ thuộc.
 *
 * Dùng để dựng khoá memo/so sánh: store trả object MỚI mỗi lần `set()` dù nội dung
 * không đổi, và `WorkflowState` còn mang cả hàm (`set`, `next`, `toggleElement`…).
 * Băm cả state thì vừa thừa vừa nhiễu — băm đúng 17 trường này thì "có gì đổi thật
 * không" là câu trả lời được.
 */
export function pickContractInput(s: KitsetContractInput): KitsetContractInput {
  return {
    kitName: s.kitName, campaign: s.campaign, stylePrompt: s.stylePrompt, styleMode: s.styleMode,
    styleAxes: s.styleAxes, primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
    styleAvoid: s.styleAvoid, chroma: s.chroma, sliceThreshold: s.sliceThreshold,
    elements: s.elements, styleRefs: s.styleRefs, brandRefs: s.brandRefs,
    mascotEnabled: s.mascotEnabled, mascotName: s.mascotName, mascotDescription: s.mascotDescription,
    mascotRef: s.mascotRef, mascotPoses: s.mascotPoses,
    ...(s.mascots ? { mascots: s.mascots } : {}),
  };
}

export interface BuildKitsetOptions {
  /** Thư viện element. Mặc định bản đóng gói (42 món); W3-5 truyền bản của agent vào. */
  lib?: readonly LibElement[];
  /**
   * Ref ĐANG CÓ THẬT trên đĩa (§W3-3). Truyền vào thì **thắng** state: đĩa là sự thật,
   * bản nháp chỉ là tiếng vọng. Không truyền (test, offline) thì rơi về state.
   */
  refs?: {
    inspo: readonly string[];
    brand: readonly string[];
    /** Ảnh nhân vật MỚI NHẤT — đường lùi cho bản nháp một-mascot. */
    character: string | null;
    /** MỌI ảnh `char-*` đang có trên đĩa. Dùng để đối chiếu ref của từng nhân vật. */
    characters?: readonly string[];
  };
  /** Giới hạn do thư viện dùng chung quản lý. Geometry vẫn kẹp theo sức chứa canvas. */
  limits?: Partial<SheetLimits>;
}

function limitOf(value: number | undefined, fallback: number, ceiling: number): number {
  return Number.isInteger(value) && Number(value) > 0
    ? Math.min(Number(value), ceiling)
    : fallback;
}

function isPopupElement(element: LibElement): boolean {
  return /popup|modal|panel|ribbon/.test(`${element.file} ${element.group ?? ""}`.toLowerCase());
}

/** Một nhân vật đã giải xong ref + tên, sẵn sàng đổ vào contract. */
export interface ContractCharacter {
  /** Id HẰNG theo VỊ TRÍ (`nhan-vat`, `nhan-vat-2`…) — xem chú thích của `CHARACTER_ID`. */
  id: string;
  vi: string;
  description: string;
  /** `refs/<tên>` hoặc chuỗi rỗng khi không có ảnh mẫu. */
  ref: string;
}

/**
 * Danh sách nhân vật của contract, theo đúng thứ tự bước Mascot hiện ra.
 *
 * Ba lối vào, cùng một lối ra:
 *  · `s.mascots` có mục  ⇒ mỗi mục một nhân vật, ref lấy theo TÊN NÓ TỰ GIỮ.
 *  · rỗng nhưng bật mascot ⇒ đúng hành vi cũ: một nhân vật từ ba trường `mascot*`.
 *  · tắt mascot          ⇒ nơi gọi không gọi hàm này.
 *
 * ĐĨA VẪN THẮNG (§W3-3): có `opts.refs` thì ảnh nào không nằm trên đĩa bị coi là
 * không có — bản nháp chỉ là tiếng vọng, không phải bằng chứng.
 */
export function contractCast(
  s: Pick<KitsetContractInput, "mascots" | "mascotName" | "mascotDescription" | "mascotRef">,
  opts: Pick<BuildKitsetOptions, "refs"> = {},
): ContractCharacter[] {
  const onDisk = opts.refs
    ? new Set(opts.refs.characters ?? (opts.refs.character ? [opts.refs.character] : []))
    : null;
  const resolve = (name: string | null | undefined): string => {
    const path = name ? refPath(name) : "";
    if (!path) return "";
    if (onDisk && !onDisk.has(path)) return "";
    return path;
  };

  const list = s.mascots ?? [];
  if (list.length === 0) {
    // Đường cũ, giữ NGUYÊN: bản nháp một-mascot không biết tên ref của agent nên
    // `opts.refs.character` (ảnh `char-*` mới nhất) vẫn là nguồn đáng tin nhất.
    const ref = opts.refs ? (opts.refs.character ?? "") : (s.mascotRef ? refPath(s.mascotRef.name) : "");
    return [{ id: CHARACTER_ID, vi: s.mascotName.trim() || "Nhân vật", description: s.mascotDescription, ref }];
  }
  return list.map((m, i) => ({
    id: i === 0 ? CHARACTER_ID : `${CHARACTER_ID}-${i + 1}`,
    vi: m.name.trim() || (i === 0 ? "Nhân vật" : `Nhân vật ${i + 1}`),
    description: m.description,
    ref: resolve(m.ref?.name),
  }));
}

/** Mô tả phong cách gửi cho `gen.sh` = ô mô tả + 7 trục ngữ nghĩa + điều không muốn. */
export function buildVariantStyle(s: Pick<KitsetContractInput, "stylePrompt" | "styleAxes" | "styleAvoid">): string {
  const parts = [s.stylePrompt.trim(), buildStylePrompt(s.styleAxes)].filter((p) => p.length > 0);
  const avoid = s.styleAvoid.trim();
  if (avoid) parts.push(`avoid: ${avoid}`);
  return parts.join(", ");
}

/**
 * `WorkflowState` → `Contract`. Ném `ZodError` nếu sinh ra thứ không hợp lệ —
 * **có chủ ý**: thà đỏ ở client còn hơn để `gen.sh:31` (`assert len(comps) == cols*rows`)
 * nổ giữa chừng sau khi đã tiêu lượt.
 */
export function buildKitsetContract(s: KitsetContractInput, opts: BuildKitsetOptions = {}): Contract {
  const lib = opts.lib ?? loadBundledV2().elements;
  const { drawable } = resolveKitset(s.elements, lib);

  const limits = {
    background: limitOf(opts.limits?.background, DEFAULT_SHEET_LIMITS.background, MAX_CELLS_TALL),
    popup: limitOf(opts.limits?.popup, DEFAULT_SHEET_LIMITS.popup, MAX_CELLS_SQUARE),
    small: limitOf(opts.limits?.small, DEFAULT_SHEET_LIMITS.small, MAX_CELLS_SQUARE),
    props: limitOf(opts.limits?.props, DEFAULT_SHEET_LIMITS.props, MAX_CELLS_SQUARE),
    mascot: limitOf(opts.limits?.mascot, DEFAULT_SHEET_LIMITS.mascot, MAX_CELLS_SQUARE),
  };

  const backgrounds = drawable.filter((e) => e.skel.shape === "full");
  const rest = drawable.filter((e) => e.skel.shape !== "full");
  const popup = rest.filter(isPopupElement);
  const props = rest.filter((e) => !isPopupElement(e) && isPropElement(e));
  const small = rest.filter((e) => !isPopupElement(e) && !isPropElement(e));
  const popupTall = popup.filter((e) => e.cell === "portrait");
  const popupWide = popup.filter((e) => e.cell !== "portrait");
  const smallTall = small.filter((e) => e.cell === "portrait");
  const smallWide = small.filter((e) => e.cell !== "portrait");
  const propsTall = props.filter((e) => e.cell === "portrait");
  const propsWide = props.filter((e) => e.cell !== "portrait");

  const sheets: Sheet[] = [];

  /* ── a. Nền: ô dọc 3:4, mặc định HOME + THÀNH CÔNG chung một sheet ─────── */
  chunkKeepingGroups(backgrounds, limits.background).forEach((chunk, i) => {
    const one = chunk.length === 1;
    const grid = one ? { cols: 1, rows: 1 } : tallGrid(chunk.length);
    sheets.push({
      id: seriesId("nen", i),
      orient: one ? "portrait" : "landscape",
      grid,
      cell_hint: HINT_BG,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  /* ── b. Popup tách khỏi UI nhỏ; mỗi nhóm giữ đúng tỷ lệ ô ───────────────── */
  chunkKeepingGroups(popupWide, limits.popup).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("popup", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(popupTall, Math.min(limits.popup, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("popup-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  chunkKeepingGroups(smallWide, limits.small).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("ui", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(smallTall, Math.min(limits.small, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("ui-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  chunkKeepingGroups(propsWide, limits.props).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("dao-cu", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(propsTall, Math.min(limits.props, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("dao-cu-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  /* ── c. Dáng nhân vật ───────────────────────────────────────────────────── */
  const poses = s.mascotEnabled ? s.mascotPoses.filter((p) => typeof p === "string" && p.length > 0) : [];
  const cast = s.mascotEnabled ? contractCast(s, opts) : [];

  /**
   * UI-FIX §3b — MỖI NHÂN VẬT MỘT BỘ TẤM DÁNG.
   *
   * Bước Mascot nay cộng được nhiều con, nên nếu chỗ này vẫn chỉ dựng tấm cho con đầu
   * thì app bán một thứ nó không vẽ — đúng loại nói dối mà `estimateLine` sinh ra để dọn.
   * Cấu trúc contract vốn đã cho phép (`variants[].characters` là MẢNG); chỉ tầng dịch
   * này là đang thắt cổ chai.
   *
   * Tên ô: một nhân vật ⇒ giữ nguyên `NN-pose-<id>` (không đổi gì so với trước).
   * Nhiều nhân vật ⇒ chèn id nhân vật (`NN-pose-nhan-vat-2-idle`) để hai con không ghi
   * đè ảnh của nhau khi `slice.py` xuất ra `kits/`.
   */
  cast.forEach((character) => {
  const charRef = character.ref;
  const subject = charRef
    ? "the SAME character from the reference photo"
    : character.description.trim() || "the same original mascot character";
  const charName = character.vi;
  const multi = cast.length > 1;

  // Dáng KHÔNG có `group` (không phải cặp trạng thái) ⇒ cắt thuần theo trần ô.
  chunkBySize(poses, limits.mascot).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    const cells: Component[] = chunk.map((pose, k) => ({
      /**
       * ⚠️ TÊN Ô DÁNG PHẢI KHỚP `^[0-9]{2}-[a-z0-9-]+$` — bài học đắt của W3, và
       * TEST TÍCH HỢP VỚI AGENT THẬT mới lôi ra được, `npm test` thì không.
       *
       * Bản đầu đặt `pose-<char>-<pose>` theo đúng `styles.json` thật (`pose-lan-idle`).
       * Schema zod của webapp cho qua — `contract.ts` MIỄN V-01 cho `shape:"pose"`,
       * và docstring của nó nói rõ là cố ý. Nhưng **agent thì không miễn**:
       * `agent/lib/validate.mjs:63` chỉ miễn `shape === "empty"`, và
       * `agent/lib/contract.mjs:67-69` **CHẶN HẲN** lệnh ghi khi có error
       * (`CONTRACT_INVALID`). Nghĩa là contract đó lưu KHÔNG NỔI — client nói hợp lệ,
       * server từ chối. (Hệ quả kèm theo: `styles.json` thật của repo cũng không lưu
       * được qua agent. Đó là chuyện của agent, và WAVE 3 không được sửa `agent/`.)
       *
       * Đổi sang `NN-pose-<id>` là cách hoà cả hai mà KHÔNG mất gì: `gen.sh` và
       * `slice.py` không đọc tiền tố tên file bao giờ — chúng đọc `skel.shape==="pose"`
       * và `skel.pose` (slice.py:839). Tên file chỉ là tên ảnh xuất ra.
       * Đánh số chạy XUYÊN các tấm dáng để hai tấm không sinh ra hai `01-pose-*`.
       */
      file: `${String(i * limits.mascot + k + 1).padStart(2, "0")}-pose-${multi ? `${character.id}-` : ""}${pose}`,
      vi: `${charName}: ${pose}`,
      spec: `${subject}, ${POSE_SPEC[pose] ?? pose}, full body`,
      // `w` hẹp: một người đứng chiếm ~1/3 bề ngang ô, cao gần trọn ô — số của
      // `styles.json` (`w .3 · h .85`), không phải số tôi ước.
      skel: { shape: "pose" as const, pose, w: 0.3, h: 0.85 },
    }));
    sheets.push({
      id: seriesId(`pose-${character.id}`, i),
      orient: "landscape",
      grid,
      cell_hint: HINT_POSE,
      ...(charRef ? { ref: charRef, note: POSE_NOTE } : {}),
      components: padTo(cells, grid.cols * grid.rows),
    });
  });
  });

  /* ── d. Phong cách (variant) ────────────────────────────────────────────── */
  const brandRefs = opts.refs ? [...opts.refs.brand] : refPaths(s.brandRefs);
  const inspo = opts.refs ? [...opts.refs.inspo] : refPaths(s.styleRefs);

  return contractSchema.parse({
    schemaVersion: 4,
    sheets,
    variants: [
      {
        id: MAIN_VARIANT_ID,
        vi: s.kitName.trim() || "Phong cách chính",
        style: buildVariantStyle(s),
        styleMode: s.styleMode,
        bg: CHROMA_PRESETS[s.chroma],
        brand: {
          // `gen.sh:87-94`: mode "colors" ⇒ chèn dòng palette; mode "image" ⇒ đính ảnh brand.
          // Có ảnh thì ảnh thắng, nhưng vẫn giữ hex để không mất dữ liệu người dùng đã chọn.
          mode: brandRefs.length > 0 ? "image" : "colors",
          primary: s.primaryColor,
          secondary: s.secondaryColor,
          refs: brandRefs,
        },
        characters: cast.map((c) => ({ id: c.id, vi: c.vi, ref: c.ref || null, poses })),
        inspo,
      },
    ],
    characterPoses: poses,
    slice: { threshold: s.sliceThreshold },
  });
}

/** Slug ổn định cho tên file tải về (`.zip`) — dùng chung `slugify` của agent. */
export function kitSlug(s: Pick<KitsetContractInput, "kitName">): string {
  return slugify(s.kitName);
}
