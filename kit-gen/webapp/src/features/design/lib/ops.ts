/**
 * features/design/lib/ops.ts — MỌI THAY ĐỔI bản thiết kế là một hàm THUẦN ở đây.
 *
 * VÌ SAO THUẦN: undo/redo ≥50 bước (§3.7, chốt X5 tầng 1) chỉ đúng khi (a) không
 * sửa tại chỗ — `useEditorStore.apply()` giữ contract cũ làm mốc undo, một mutation
 * ngầm là hỏng cả stack; (b) mỗi thao tác có NHÃN tiếng Việt để hover [↺ Hoàn tác]
 * đọc được ("Bỏ 1 element khỏi sheet main").
 *
 * QUY ƯỚC CỨNG CỦA ENGINE (không được đổi):
 *  · thứ tự ô = thứ tự `components` ROW-MAJOR (gen.sh + slice.py đánh index theo đó)
 *  · `components.length` LUÔN = cols×rows (V-04) ⇒ mọi thao tác đổi lưới TỰ BÙ ô trống
 *  · ô trống = `{ file:"", vi:"", spec:"", skel:{ shape:"empty" } }` (skeleton.py bỏ qua)
 *
 * Mỗi hàm trả `Op = { contract, label, focus? }`. `label` rỗng ⇒ KHÔNG có gì đổi,
 * màn phải bỏ qua (đừng đẩy một bước undo rỗng vào stack).
 */
import {
  sheetVariantFilter, slugify,
  type Component, type Contract, type Sheet, type Skel,
} from "@/lib/types/contract";
import type { Selection } from "@/lib/store";

export interface Op {
  contract: Contract;
  /** Nhãn cho nút Hoàn tác. Rỗng = không có thay đổi nào. */
  label: string;
  /** Con trỏ sau thao tác — màn dùng để chọn đúng thứ vừa tạo. */
  focus?: Selection;
}

const noop = (contract: Contract): Op => ({ contract, label: "" });

/** structuredClone có ở mọi trình duyệt mục tiêu; JSON là đường lùi cho môi trường test cũ. */
export function clone<T>(o: T): T {
  return typeof structuredClone === "function" ? structuredClone(o) : (JSON.parse(JSON.stringify(o)) as T);
}

export const EMPTY_SKEL: Skel = { shape: "empty", w: 1, h: 1 };

/** Ô trống — CÓ w/h vì `skelSchema` bắt buộc hai field này; engine bỏ qua ô `empty`. */
export function emptyCell(): Component {
  return { file: "", vi: "", spec: "", skel: { ...EMPTY_SKEL } };
}

export function isEmptyCell(c: Component | undefined | null): boolean {
  return c === undefined || c === null || String(c.skel?.shape ?? "") === "empty";
}

export function emptyContract(): Contract {
  return { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] };
}

/* ── tra cứu ─────────────────────────────────────────────────────────────── */

export const findSheet = (c: Contract | null, id: string): Sheet | null =>
  c?.sheets.find((s) => s.id === id) ?? null;

export const sheetIndex = (c: Contract | null, id: string): number =>
  c?.sheets.findIndex((s) => s.id === id) ?? -1;

export const cellCount = (sh: Sheet | null | undefined): number =>
  Math.max(0, Number(sh?.grid?.cols ?? 0)) * Math.max(0, Number(sh?.grid?.rows ?? 0));

/** Số element THẬT (không tính ô trống) — con số user quan tâm, khác `components.length`. */
export const realCount = (sh: Sheet | null | undefined): number =>
  (sh?.components ?? []).filter((c) => !isEmptyCell(c)).length;

/** id chưa dùng: `base`, `base-2`, `base-3`… (đóng E2: không từ chối im lặng). */
export function uniqueId(base: string, taken: readonly string[], min = 2): string {
  let root = slugify(base) || "sheet";
  if (root.length < min) root = `${root}-1`;
  if (!taken.includes(root)) return root;
  for (let n = 2; n < 999; n += 1) {
    const cand = `${root}-${n}`;
    if (!taken.includes(cand)) return cand;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/* ══════════════════════════ SHEET ══════════════════════════ */

export interface AddSheetInput {
  id?: string;
  cols?: number;
  rows?: number;
  orient?: "landscape" | "portrait";
  /** element có sẵn (nhập từ thư viện / tràn từ sheet khác); thiếu thì bù ô trống. */
  components?: readonly Component[] | null;
  variants?: string[];
}

export function addSheet(c: Contract, input: AddSheetInput = {}): Op {
  const { cols = 4, rows = 4, orient = "landscape", components = null } = input;
  const next = clone(c);
  const sid = uniqueId(input.id || "sheet", next.sheets.map((s) => s.id));
  const total = Math.max(1, cols) * Math.max(1, rows);
  const comps: Component[] = [];
  for (let i = 0; i < total; i += 1) comps.push(components?.[i] ? clone(components[i]!) : emptyCell());

  next.sheets.push({
    id: sid,
    grid: { cols, rows },
    orient,
    cell_hint: orient === "portrait" ? "portrait 2:3 cell" : "landscape 3:2 cell",
    note: "",
    ...(input.variants && input.variants.length > 0 ? { variants: input.variants } : {}),
    components: comps,
  });
  return { contract: next, label: `Thêm sheet «${sid}»`, focus: { kind: "sheet", sheetId: sid } };
}

/**
 * Đổi mã sheet. KHÔNG tự slug hoá ở đây: user đang gõ dở ("po") thì slug hoá sẽ
 * nhảy con trỏ. Giá trị sai dạng để V-03 bắt và hiện lỗi inline — đúng §3.4
 * ("hiện lỗi INLINE tại chỗ"), còn nút [Sửa thành «pose-lan»] mới là nơi slug hoá.
 */
export function renameSheet(c: Contract, sheetId: string, newId: string): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh) return noop(c);
  sh.id = String(newId ?? "");
  return {
    contract: next,
    label: `Đổi mã sheet «${sheetId}» → «${sh.id}»`,
    focus: { kind: "sheet", sheetId: sh.id },
  };
}

export function patchSheet(c: Contract, sheetId: string, patch: Partial<Sheet>, label?: string): Op {
  const next = clone(c);
  const i = sheetIndex(next, sheetId);
  if (i === -1) return noop(c);
  next.sheets[i] = { ...next.sheets[i]!, ...clone(patch) };
  return {
    contract: next,
    label: label || `Sửa sheet «${sheetId}»`,
    focus: { kind: "sheet", sheetId: patch.id ?? sheetId },
  };
}

export function duplicateSheet(c: Contract, sheetId: string): Op {
  const next = clone(c);
  const i = sheetIndex(next, sheetId);
  if (i === -1) return noop(c);
  const copy = clone(next.sheets[i]!);
  copy.id = uniqueId(`${sheetId}-2`, next.sheets.map((s) => s.id));
  next.sheets.splice(i + 1, 0, copy);
  return { contract: next, label: `Nhân bản sheet «${sheetId}»`, focus: { kind: "sheet", sheetId: copy.id } };
}

export function removeSheet(c: Contract, sheetId: string): Op {
  const next = clone(c);
  const i = sheetIndex(next, sheetId);
  if (i === -1) return noop(c);
  next.sheets.splice(i, 1);
  const neighbour = next.sheets[Math.max(0, i - 1)]?.id;
  return {
    contract: next,
    label: `Xoá sheet «${sheetId}»`,
    focus: neighbour ? { kind: "sheet", sheetId: neighbour } : { kind: "none" },
  };
}

/** Đổi thứ tự sheet (kéo-thả hoặc ⌥↑/⌥↓). */
export function moveSheet(c: Contract, sheetId: string, delta: number): Op {
  const next = clone(c);
  const i = sheetIndex(next, sheetId);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= next.sheets.length) return noop(c);
  const [row] = next.sheets.splice(i, 1);
  next.sheets.splice(j, 0, row!);
  return {
    contract: next,
    label: `Chuyển sheet «${sheetId}» ${delta < 0 ? "lên" : "xuống"}`,
    focus: { kind: "sheet", sheetId },
  };
}

/** Sheet này áp cho phong cách nào; mảng rỗng = MỌI phong cách. */
export function setSheetVariants(c: Contract, sheetId: string, variantIds: string[]): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh) return noop(c);
  delete sh.styles; // tên cũ trên đĩa — không để hai nguồn sự thật cùng tồn tại
  if (variantIds.length === 0) delete sh.variants;
  else sh.variants = [...variantIds];
  return {
    contract: next,
    label:
      variantIds.length === 0
        ? `Sheet «${sheetId}» áp cho mọi phong cách`
        : `Sheet «${sheetId}» chỉ áp cho ${variantIds.length} phong cách`,
    focus: { kind: "sheet", sheetId },
  };
}

/* ══════════════════════════ ĐỔI LƯỚI ══════════════════════════ */

export type OverflowMode = "drop" | "move" | "grow";

/** Element THẬT sẽ mất nếu đổi sang lưới cols×rows (ô trống không tính là mất mát). */
export function overflowOf(sh: Sheet | null | undefined, cols: number, rows: number): Component[] {
  return (sh?.components ?? []).slice(Math.max(0, cols * rows)).filter((c) => !isEmptyCell(c));
}

/**
 * ĐỔI LƯỚI — thao tác nguy hiểm nhất của màn (thu nhỏ lưới = mất element).
 *
 * Hợp đồng với UI: gọi `overflowOf()` TRƯỚC. Có element thừa ⇒ PHẢI hỏi user
 * (dialog 3 lựa chọn), rồi mới gọi hàm này kèm `overflow`:
 *   · "drop" — bỏ hẳn N element cuối (user đã xác nhận)
 *   · "move" — chuyển N element cuối sang sheet mới «…-2» (không mất gì)
 *   · "grow" — KHÔNG thu nhỏ: nới `rows` cho vừa hết element (đường an toàn)
 * Thiếu ô thì luôn tự bù ô trống, không hỏi (§3 "thiếu ô → tự thêm empty").
 */
export function resizeGrid(
  c: Contract,
  sheetId: string,
  cols: number,
  rows: number,
  opts: { overflow?: OverflowMode } = {},
): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh) return noop(c);
  const overflow = opts.overflow ?? "drop";
  const comps = [...sh.components];
  const before = comps.length;

  // "grow": giữ nguyên cols, tăng rows cho tới khi chứa hết element THẬT cuối cùng.
  let finalRows = rows;
  if (overflow === "grow") {
    let lastReal = -1;
    comps.forEach((x, i) => {
      if (!isEmptyCell(x)) lastReal = i;
    });
    finalRows = Math.max(rows, Math.ceil((lastReal + 1) / Math.max(1, cols)) || 1);
  }
  const total = Math.max(1, cols) * Math.max(1, finalRows);

  let movedOut: Component[] = [];
  if (total > before) {
    for (let i = before; i < total; i += 1) comps.push(emptyCell());
  } else if (total < before) {
    movedOut = comps.splice(total).filter((x) => !isEmptyCell(x));
  }

  sh.grid = { cols, rows: finalRows };
  sh.components = comps;

  let label = `Đổi lưới sheet «${sheetId}» thành ${cols}×${finalRows}`;
  if (overflow === "grow" && finalRows !== rows) label += ` (nới thêm hàng để không mất element)`;

  if (movedOut.length > 0 && overflow === "move") {
    const spill = addSheet(next, {
      id: `${sheetId}-2`,
      cols,
      rows: Math.max(1, Math.ceil(movedOut.length / Math.max(1, cols))),
      ...(sh.orient ? { orient: sh.orient } : {}),
      components: movedOut,
      ...(sheetVariantFilter(sh).length > 0 ? { variants: sheetVariantFilter(sh) } : {}),
    });
    return {
      contract: spill.contract,
      label: `${label} · chuyển ${movedOut.length} element sang sheet mới`,
      ...(spill.focus ? { focus: spill.focus } : {}),
    };
  }
  if (movedOut.length > 0) label += ` · bỏ ${movedOut.length} element`;
  return { contract: next, label, focus: { kind: "sheet", sheetId } };
}

/* ══════════════════════════ ELEMENT ══════════════════════════ */

export function setCell(c: Contract, sheetId: string, index: number, comp: Component, label?: string): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh || index < 0 || index >= sh.components.length) return noop(c);
  sh.components[index] = clone(comp);
  return {
    contract: next,
    label: label || `Sửa element ô ${index + 1} của sheet «${sheetId}»`,
    focus: { kind: "component", sheetId, index },
  };
}

/** Sửa một phần element. `skel` merge riêng để không mất field lạ của bản agent mới. */
export function patchCell(
  c: Contract,
  sheetId: string,
  index: number,
  // `Omit` rồi mới thêm `skel` — nếu để `Partial<Component> & { skel?: Partial<Skel> }`
  // thì hai kiểu GIAO nhau thành `Skel & Partial<Skel>`, tức vẫn bắt buộc shape/w/h và
  // `patchCell(..., { skel: { w: 0.5 } })` không biên dịch được (đúng ca ops.test.ts bắt).
  patch: Omit<Partial<Component>, "skel"> & { skel?: Partial<Skel> },
  label?: string,
): Op {
  const cur = findSheet(c, sheetId)?.components[index];
  if (!cur) return noop(c);
  const merged: Component = { ...clone(cur), ...clone(patch) } as Component;
  if (patch.skel) merged.skel = { ...clone(cur.skel ?? {}), ...clone(patch.skel) } as Skel;
  return setCell(c, sheetId, index, merged, label);
}

/**
 * Xoá element khỏi ô ⇒ ô thành TRỐNG (V-04 vẫn đúng, không dồn ô).
 * Không dồn là CHỦ Ý: thứ tự ô = bố cục ảnh, dồn ô làm cả sheet xô lệch trong khi
 * user chỉ định bỏ một cái.
 */
export function clearCell(c: Contract, sheetId: string, index: number): Op {
  const cur = findSheet(c, sheetId)?.components[index];
  const name = cur?.vi || cur?.file || `ô ${index + 1}`;
  return setCell(c, sheetId, index, emptyCell(), `Bỏ «${name}» khỏi sheet «${sheetId}»`);
}

/** Đổi vị trí 2 ô (kéo-thả hoặc ⌥←→↑↓). */
export function swapCells(c: Contract, sheetId: string, a: number, b: number): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh) return noop(c);
  const n = sh.components.length;
  if (a < 0 || b < 0 || a >= n || b >= n || a === b) return noop(c);
  const tmp = sh.components[a]!;
  sh.components[a] = sh.components[b]!;
  sh.components[b] = tmp;
  return {
    contract: next,
    label: `Đổi vị trí ô ${a + 1} ↔ ô ${b + 1} (sheet «${sheetId}»)`,
    focus: { kind: "component", sheetId, index: b },
  };
}

/** Thêm một element trống-có-tên vào ô trống đầu tiên; hết chỗ thì nới thêm 1 hàng. */
export function addElement(c: Contract, sheetId: string, comp?: Partial<Component>): Op {
  return addElements(c, sheetId, [comp ?? {}]);
}

/**
 * Thêm nhiều element (drawer Thư viện của R2-P3 gọi hàm này).
 * Điền ô trống trước; hết ô trống thì NỚI LƯỚI thêm hàng — không bao giờ ghi đè
 * element đang có, không bao giờ phá V-04.
 */
export function addElements(c: Contract, sheetId: string, items: readonly Partial<Component>[]): Op {
  const next = clone(c);
  const sh = findSheet(next, sheetId);
  if (!sh || items.length === 0) return noop(c);

  let firstIndex = -1;
  const taken = new Set(sh.components.map((x) => x.file).filter(Boolean));

  for (const raw of items) {
    let slot = sh.components.findIndex((x) => isEmptyCell(x));
    if (slot === -1) {
      const cols = Math.max(1, Number(sh.grid.cols) || 4);
      sh.grid = { ...sh.grid, rows: Math.max(1, Number(sh.grid.rows) || 1) + 1 };
      for (let i = 0; i < cols; i += 1) sh.components.push(emptyCell());
      slot = sh.components.findIndex((x) => isEmptyCell(x));
    }
    const comp = normalizeNewComponent(raw, slot, taken);
    taken.add(comp.file);
    sh.components[slot] = comp;
    if (firstIndex === -1) firstIndex = slot;
  }

  return {
    contract: next,
    label: items.length === 1 ? `Thêm element vào sheet «${sheetId}»` : `Thêm ${items.length} element vào sheet «${sheetId}»`,
    focus: firstIndex === -1 ? { kind: "sheet", sheetId } : { kind: "component", sheetId, index: firstIndex },
  };
}

/**
 * Element mới → component hợp lệ. Tên file tự sinh theo dạng V-01 (`NN-slug`) để
 * element vừa thêm KHÔNG lập tức đỏ lòm — user đổi tên sau vẫn được.
 */
export function normalizeNewComponent(
  raw: Partial<Component>,
  slot: number,
  taken: ReadonlySet<string>,
): Component {
  const skel = clone(raw.skel ?? { shape: "rrect", w: 0.8, h: 0.6 }) as Skel;
  let file = String(raw.file ?? "").trim();
  if (file === "" && skel.shape !== "empty" && skel.shape !== "pose") {
    const base = slugify(String(raw.vi ?? "") || "element") || "element";
    for (let n = slot + 1; n < slot + 200; n += 1) {
      const cand = `${String(n).padStart(2, "0")}-${base}`;
      if (!taken.has(cand)) {
        file = cand;
        break;
      }
    }
  }
  // Spread `raw` TRƯỚC để giữ field lạ của bản agent mới (§6.5-6), rồi ghi đè
  // bằng 4 field chuẩn hoá — thứ tự này là chủ ý, không phải ngẫu nhiên.
  return {
    ...(raw as object),
    file,
    vi: String(raw.vi ?? ""),
    spec: String(raw.spec ?? ""),
    skel,
  } as Component;
}

/* ── Số liệu dẫn xuất nằm ở `ops-derive.ts` (tách cho gọn file); re-export để nơi
      dùng chỉ cần nhớ MỘT đường import `./ops`. ─────────────────────────────── */
export { jobCountOfSheet, jobCountOfVariant, countRealComponents } from "./ops-derive";
