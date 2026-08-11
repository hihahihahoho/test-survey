/**
 * features/docs/lib/types.ts — MÔ HÌNH DỮ LIỆU "FILE CON" (sub-file / `doc`).
 *
 * ⚠️ LƯU Ý TÊN THƯ MỤC: `features/docs/` hiện đang chứa HAI thứ khác nhau vì
 * FE-PLAN §1 giao đúng glob này cho nhánh C:
 *   · `lib/catalog.ts`, `lib/anchors.ts`, `components/**`  = trang trợ giúp MÃ LỖI (đã có)
 *   · `lib/types.ts`, `lib/docs-idb.ts`, `lib/docs-repo.ts`, `lib/invariants.ts` (file này và
 *     ba file cạnh nó) = FILE CON của project, tương ứng namespace API `/api/projects/:id/docs`
 *     mà UI-SPEC-V2 §8.2 [REV] chốt.
 * Hai nhóm KHÔNG import lẫn nhau. Đặt tên `doc` là theo hợp đồng API đã chốt, không phải sở thích.
 *
 * NGUỒN: UI-SPEC-V2 §4.2 (file con là VIEW, không phải BẢN SAO) · §4.4 (tạo/nhân bản/đổi tên/xoá)
 *        · §4.5 (ánh xạ) · §8.1 (hình dạng `project.json.files[]`) · §8.2 [REV] (`docId` regex).
 *
 * BA LUẬT CỦA SCHEMA NÀY:
 *  1. **Không có trường nào chứa đường dẫn tuyệt đối hay secret.** `assertNoSecret` (R0) chặn ở
 *     tầng ghi, nhưng schema cũng phải không MỜI người ta ghi vào (không có `path`, `token`, `auth`).
 *  2. **Doc không nhân bản contract.** Chỉ giữ `view.sheetIds`/`view.variantIds` = BỘ LỌC id.
 *     Sheet/ảnh/kit thuộc project; xoá doc không bao giờ xoá sản phẩm (§4.2 bảng, §4.4 hàng "Xoá").
 *  3. **Parse hỏng ⇒ bỏ qua bản ghi đó, KHÔNG ném ra UI** (cùng tinh thần `safety/drafts.ts`).
 */
import { z } from "zod";

/** `docId` — đúng regex mà §8.2 [REV] yêu cầu đưa vào `agent/lib/paths.mjs`. */
export const RE_DOC_ID = /^f-[a-z0-9-]{2,32}$/;
/** Tên file con: 1–48 ký tự, không xuống dòng, không trùng trong project (§4.4). */
export const DOC_NAME_MAX = 48;

export const DOC_KINDS = ["workflow", "canvas"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** Màu nhãn tab — TÊN token, KHÔNG phải mã màu (cấm hard-code màu, brief §RÀNG BUỘC). */
export const DOC_COLORS = ["none", "mint", "ice", "amber", "rose", "violet"] as const;
export type DocColor = (typeof DOC_COLORS)[number];

export const docNameSchema = z
  .string()
  .trim()
  .min(1, "Đặt tên cho file.")
  .max(DOC_NAME_MAX, `Tên tối đa ${DOC_NAME_MAX} ký tự.`)
  .refine((s) => !/[\n\r\t]/.test(s), "Tên không được xuống dòng.");

/** Bộ lọc của file kiểu `workflow` (§4.5): danh sách id, KHÔNG phải bản sao sheet. */
export const docViewSchema = z.object({
  sheetIds: z.array(z.string()).default([]),
  variantIds: z.array(z.string()).default([]),
});
export type DocView = z.infer<typeof docViewSchema>;

/** Node của file kiểu `canvas` (§2.9: lưu toạ độ + ghi chú + liên kết, KHÔNG lưu ảnh). */
export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["frame", "note", "arrow", "image-ref"]),
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative().default(0),
  h: z.number().nonnegative().default(0),
  z: z.number().int().default(0),
  text: z.string().max(2000).default(""),
  /** liên kết hai chiều với contract/artifact. `ref` là đường dẫn TƯƠNG ĐỐI trong project. */
  bind: z
    .object({
      kind: z.enum(["sheet", "variant", "ref"]),
      id: z.string().min(1),
    })
    .nullish(),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const viewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  k: z.number().min(0.1).max(4).default(1),
});
export type Viewport = z.infer<typeof viewportSchema>;

export const canvasDocSchema = z.object({
  nodes: z.array(canvasNodeSchema).default([]),
  viewport: viewportSchema.default({ x: 0, y: 0, k: 1 }),
});
export type CanvasDoc = z.infer<typeof canvasDocSchema>;

/** Metadata file con — hình dạng khớp `project.json.files[]` của §8.1 để đổi adapter là xong. */
export const docSchema = z.object({
  id: z.string().regex(RE_DOC_ID, "Mã file không hợp lệ."),
  name: docNameSchema,
  kind: z.enum(DOC_KINDS),
  createdAt: z.string(),
  updatedAt: z.string(),
  color: z.enum(DOC_COLORS).default("none"),
  view: docViewSchema.optional(),
  /** thời điểm vào thùng rác (§4.4 soft-delete 30 ngày). `null` = đang dùng. */
  trashedAt: z.string().nullish(),
});
export type Doc = z.infer<typeof docSchema>;

/** Bản ghi lưu trong IndexedDB: metadata + (nếu là canvas) nội dung + version lạc quan. */
export const docRecordSchema = z.object({
  doc: docSchema,
  /** tăng 1 mỗi lần `saveCanvas`; là thứ sẽ thành `ETag`/`If-Match` của #48/#49. */
  version: z.number().int().nonnegative().default(0),
  canvas: canvasDocSchema.nullish(),
});
export type DocRecord = z.infer<typeof docRecordSchema>;

/* ═════════ File hệ thống «Tất cả sheet» (§4.5) ═════════ */

/** File workflow ẢO, không lưu, không xoá được, luôn thấy MỌI sheet. */
export const ALL_SHEETS_DOC_ID = "f-all-sheets";
export const ALL_SHEETS_DOC_NAME = "Tất cả sheet";

export function isVirtualDoc(id: string): boolean {
  return id === ALL_SHEETS_DOC_ID;
}

/** Sinh id hợp `RE_DOC_ID` từ tên người dùng gõ; đụng nhau thì thêm hậu tố. */
export function makeDocId(name: string, taken: readonly string[] = []): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "doc";
  const base = `f-${slug}`.slice(0, 34);
  if (!taken.includes(base) && RE_DOC_ID.test(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base.slice(0, 30)}-${i}`;
    if (!taken.includes(cand) && RE_DOC_ID.test(cand)) return cand;
  }
  return `f-doc-${Date.now().toString(36)}`.slice(0, 34);
}

/** Tên "«tên» (bản sao)" của §4.4, có đánh số khi trùng tiếp và cắt đúng 48 ký tự. */
export function duplicateName(name: string, taken: readonly string[]): string {
  const fit = (s: string) => s.slice(0, DOC_NAME_MAX);
  const first = fit(`${name} (bản sao)`);
  if (!taken.includes(first)) return first;
  for (let i = 2; i < 1000; i++) {
    const cand = fit(`${name} (bản sao ${i})`);
    if (!taken.includes(cand)) return cand;
  }
  return fit(`${name} (bản sao ${Date.now().toString(36)})`);
}
