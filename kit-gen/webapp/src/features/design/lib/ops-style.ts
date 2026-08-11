/**
 * features/design/lib/ops-style.ts — thao tác THUẦN cho tab "Phong cách" (§3-S3.5)
 * và tab "Nâng cao" (§3-S3.6): variant · brand · nhân vật · tham số cắt.
 *
 * Tách khỏi `ops.ts` chỉ vì kích thước file (luật ~400 dòng); cùng một hợp đồng `Op`.
 *
 * MỘT LƯU Ý DỮ LIỆU THẬT: `styles.json` và `styles-campaign.json` trên đĩa đều dùng
 * khoá cũ `styles[]`. `contractVariants()` của R0 đọc được cả hai, nhưng GHI thì phải
 * ghi một chỗ — nếu không, sửa `variants[]` mà đĩa đọc `styles[]` là thay đổi bốc hơi.
 * `writeVariants()` dưới đây là cửa DUY NHẤT ghi danh sách phong cách: nó ghi vào
 * đúng khoá mà contract đang dùng và xoá khoá kia đi.
 */
import {
  CHROMA_PRESETS, contractVariants, slugify,
  type Brand, type Character, type Contract, type Variant,
} from "@/lib/types/contract";
import type { Op } from "./ops";
import { clone, uniqueId } from "./ops";

const noop = (contract: Contract): Op => ({ contract, label: "" });

/** Cửa DUY NHẤT ghi `variants[]`. Chuẩn hoá về tên mới, xoá tên cũ `styles[]`. */
function writeVariants(c: Contract, list: Variant[]): Contract {
  const next = clone(c);
  delete next.styles;
  next.variants = list;
  return next;
}

export const variantIndex = (c: Contract, id: string): number =>
  contractVariants(c).findIndex((v) => v.id === id);

export const findVariant = (c: Contract, id: string): Variant | null =>
  contractVariants(c).find((v) => v.id === id) ?? null;

/* ══════════════════════════ PHONG CÁCH ══════════════════════════ */

export function addVariant(c: Contract, input: { vi?: string; id?: string } = {}): Op {
  const list = clone(contractVariants(c));
  const vi = input.vi?.trim() || `Phong cách ${list.length + 1}`;
  const id = uniqueId(input.id || slugify(vi) || "phong-cach", list.map((v) => v.id));
  list.push({
    id,
    vi,
    style: "",
    styleMode: "prompt",
    bg: CHROMA_PRESETS.magenta,
    brand: { mode: "colors" },
    characters: [],
    inspo: [],
  });
  return { contract: writeVariants(c, list), label: `Thêm phong cách «${vi}»`, focus: { kind: "variant", variantId: id } };
}

export function patchVariant(c: Contract, id: string, patch: Partial<Variant>, label?: string): Op {
  const list = clone(contractVariants(c));
  const i = list.findIndex((v) => v.id === id);
  if (i === -1) return noop(c);
  const merged = { ...list[i]!, ...clone(patch) } as Variant;
  list[i] = merged;
  return {
    contract: writeVariants(c, list),
    label: label || `Sửa phong cách «${list[i]!.vi || id}»`,
    focus: { kind: "variant", variantId: merged.id },
  };
}

/**
 * Đổi mã phong cách — phải cập nhật MỌI `sheet.variants[]` trỏ tới nó, nếu không
 * sheet lập tức mồ côi (cảnh báo UNKNOWN_VARIANT) và số lượt sinh ảnh tụt về 0
 * mà user không hiểu vì sao.
 */
export function renameVariantId(c: Contract, oldId: string, newId: string): Op {
  const list = clone(contractVariants(c));
  const i = list.findIndex((v) => v.id === oldId);
  if (i === -1) return noop(c);
  list[i] = { ...list[i]!, id: newId };
  const next = writeVariants(c, list);
  next.sheets = next.sheets.map((sh) => {
    const only = sh.variants ?? sh.styles;
    if (!Array.isArray(only) || !only.includes(oldId)) return sh;
    const { styles: _drop, ...rest } = sh;
    return { ...rest, variants: only.map((x) => (x === oldId ? newId : x)) };
  });
  return { contract: next, label: `Đổi mã phong cách «${oldId}» → «${newId}»`, focus: { kind: "variant", variantId: newId } };
}

/** Nhân bản: copy TOÀN BỘ style/brand/nhân vật, id mới (§3-S3.5 menu ⋯). */
export function duplicateVariant(c: Contract, id: string): Op {
  const list = clone(contractVariants(c));
  const i = list.findIndex((v) => v.id === id);
  if (i === -1) return noop(c);
  const copy = clone(list[i]!);
  copy.id = uniqueId(`${id}-2`, list.map((v) => v.id));
  copy.vi = `${copy.vi || id} (bản sao)`;
  list.splice(i + 1, 0, copy);
  return { contract: writeVariants(c, list), label: `Nhân bản phong cách «${id}»`, focus: { kind: "variant", variantId: copy.id } };
}

/**
 * Xoá phong cách. Sheet nào CHỈ áp cho phong cách này sẽ mất chỗ dựa — ta gỡ id
 * khỏi `sheet.variants[]`; sheet rỗng danh sách nghĩa là "áp cho mọi phong cách",
 * đúng ngữ nghĩa của engine, và cảnh báo UNKNOWN_VARIANT không còn nổ oan.
 */
export function removeVariant(c: Contract, id: string): Op {
  const list = clone(contractVariants(c));
  const i = list.findIndex((v) => v.id === id);
  if (i === -1) return noop(c);
  const [gone] = list.splice(i, 1);
  const next = writeVariants(c, list);
  next.sheets = next.sheets.map((sh) => {
    const only = sh.variants ?? sh.styles;
    if (!Array.isArray(only) || !only.includes(id)) return sh;
    const rest = only.filter((x) => x !== id);
    const { styles: _drop, variants: _v, ...base } = sh;
    return rest.length > 0 ? { ...base, variants: rest } : base;
  });
  return {
    contract: next,
    label: `Xoá phong cách «${gone?.vi || id}»`,
    focus: list[Math.max(0, i - 1)] ? { kind: "variant", variantId: list[Math.max(0, i - 1)]!.id } : { kind: "none" },
  };
}

export function moveVariant(c: Contract, id: string, delta: number): Op {
  const list = clone(contractVariants(c));
  const i = list.findIndex((v) => v.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= list.length) return noop(c);
  const [row] = list.splice(i, 1);
  list.splice(j, 0, row!);
  return { contract: writeVariants(c, list), label: `Chuyển phong cách «${id}»`, focus: { kind: "variant", variantId: id } };
}

/* ══════════════════════════ BRAND ══════════════════════════ */

export function patchBrand(c: Contract, variantId: string, patch: Partial<Brand>, label?: string): Op {
  const v = findVariant(c, variantId);
  if (!v) return noop(c);
  const brand: Brand = { ...(v.brand ?? { mode: "colors" }), ...clone(patch) } as Brand;
  return patchVariant(c, variantId, { brand }, label || `Sửa màu brand của «${v.vi || variantId}»`);
}

/* ══════════════════════════ NHÂN VẬT ══════════════════════════ */
/* Nhân vật thuộc PROJECT (đóng audit A3) — nằm trong `variant.characters[]` theo
   đúng cấu trúc contract v4 mà gen.sh đọc; UI nói rõ "bộ dáng chỉ áp cho project này". */

export function addCharacter(c: Contract, variantId: string, input: { vi?: string; id?: string } = {}): Op {
  const v = findVariant(c, variantId);
  if (!v) return noop(c);
  const list = clone(v.characters ?? []);
  const vi = input.vi?.trim() || `Nhân vật ${list.length + 1}`;
  const id = uniqueId(input.id || slugify(vi) || "nhan-vat", list.map((x) => x.id));
  list.push({ id, vi, poses: [] });
  return {
    ...patchVariant(c, variantId, { characters: list }, `Thêm nhân vật «${vi}»`),
    focus: { kind: "character", characterId: id },
  };
}

export function patchCharacter(
  c: Contract,
  variantId: string,
  characterId: string,
  patch: Partial<Character>,
  label?: string,
): Op {
  const v = findVariant(c, variantId);
  if (!v) return noop(c);
  const list = clone(v.characters ?? []);
  const i = list.findIndex((x) => x.id === characterId);
  if (i === -1) return noop(c);
  list[i] = { ...list[i]!, ...clone(patch) } as Character;
  return {
    ...patchVariant(c, variantId, { characters: list }, label || `Sửa nhân vật «${list[i]!.vi || characterId}»`),
    focus: { kind: "character", characterId: list[i]!.id },
  };
}

export function removeCharacter(c: Contract, variantId: string, characterId: string): Op {
  const v = findVariant(c, variantId);
  if (!v) return noop(c);
  const list = clone(v.characters ?? []).filter((x) => x.id !== characterId);
  return {
    ...patchVariant(c, variantId, { characters: list }, `Xoá nhân vật «${characterId}»`),
    focus: { kind: "variant", variantId },
  };
}

/** Bật/tắt một dáng của nhân vật (lưới 19 dáng — checkbox THẬT, đóng I2/I4). */
export function toggleCharacterPose(c: Contract, variantId: string, characterId: string, pose: string): Op {
  const v = findVariant(c, variantId);
  const ch = (v?.characters ?? []).find((x) => x.id === characterId);
  if (!ch) return noop(c);
  const cur = ch.poses ?? [];
  const nextPoses = cur.includes(pose) ? cur.filter((p) => p !== pose) : [...cur, pose];
  return patchCharacter(
    c,
    variantId,
    characterId,
    { poses: nextPoses },
    `${cur.includes(pose) ? "Bỏ" : "Thêm"} dáng «${pose}» của «${ch.vi || characterId}»`,
  );
}

/* ══════════════════════════ TAB NÂNG CAO ══════════════════════════ */

/**
 * Màu nền tách cho MỌI phong cách. Đổi màu nền ⇒ ảnh cũ vẫn nền cũ — UI phải nói
 * điều đó ra, đây chỉ lo phần dữ liệu.
 */
export function setAllChromaKey(c: Contract, key: "magenta" | "green"): Op {
  const list = clone(contractVariants(c)).map((v) => ({ ...v, bg: CHROMA_PRESETS[key] }));
  if (list.length === 0) return noop(c);
  return { contract: writeVariants(c, list), label: `Đổi màu nền tách sang ${key}` };
}

export type SliceScope = "project" | "variant";

/**
 * Tham số cắt.
 *
 * ĐỌC KỸ TRƯỚC KHI SỬA (slice.py, đã đối chiếu dòng 643–644 và 66):
 *  · `threshold`, `grow_threshold` được slice.py đọc THEO TỪNG STYLE
 *    (`style.get("threshold", DEFAULT_THRESHOLD)`) ⇒ "áp cho cả project" = ghi
 *    vào mọi variant, đồng thời lưu mặc định ở `contract.slice`.
 *  · `bleed` KHÔNG được engine đọc: `BLEED = 0.18` là HẰNG SỐ MODULE. Ta vẫn ghi
 *    vào `contract.slice.bleed` để không mất dữ liệu khi engine hỗ trợ, nhưng UI
 *    BẮT BUỘC nói rõ là chưa có tác dụng (M4 · teams/design/INTEGRATION.md §5).
 *  · `quality` cũng vậy: engine TỰ DÒ ViTMatte/PyMatting, không có cờ chọn.
 */
export function patchSliceParams(
  c: Contract,
  patch: { threshold?: number; grow_threshold?: number; bleed?: number; quality?: "fast" | "high" },
  scope: { scope: SliceScope; variantId?: string } = { scope: "project" },
): Op {
  const next = clone(c);
  next.slice = { ...(next.slice ?? {}), ...patch };

  const perVariant: Record<string, number> = {};
  if (patch.threshold !== undefined) perVariant.threshold = patch.threshold;
  if (patch.grow_threshold !== undefined) perVariant.grow_threshold = patch.grow_threshold;

  if (Object.keys(perVariant).length > 0) {
    const list = clone(contractVariants(next)).map((v) =>
      scope.scope === "project" || v.id === scope.variantId ? { ...v, ...perVariant } : v,
    );
    const written = writeVariants(next, list);
    written.slice = next.slice;
    return { contract: written, label: "Sửa tham số cắt ảnh" };
  }
  return { contract: next, label: "Sửa tham số cắt ảnh" };
}

/** Danh sách dáng dùng chung của project (`characterPoses`). */
export function setCharacterPoses(c: Contract, poses: string[]): Op {
  const next = clone(c);
  next.characterPoses = poses;
  return { contract: next, label: "Sửa danh sách dáng của project" };
}
