/**
 * webapp/src/features/kit-core/lib/element-lib/types.ts (đổi nhà 08/09/2026)
 * ────────────────────────────────────────────────────────────────────────────
 * Kiểu + zod schema cho THƯ VIỆN ELEMENT.
 *
 * Không khai lại `libElementSchema`/`elementLibSchema` — R0 đã có ở
 * `lib/types/api.ts` (#28) và đó là schema của dữ liệu agent trả về. Ở đây chỉ
 * SIẾT THÊM phần mà UI thật sự cần (`skel` phải parse được bằng `skelSchema` thì
 * mới vẽ được silhouette) và thêm mấy field mà `element-lib.json` có nhưng hợp
 * đồng §6.2 #28 chưa liệt kê (`sheetHint`).
 *
 * KHOAN DUNG LÀ CHỦ Ý (§6.5-6): element nào hỏng thì BỎ RIÊNG element đó và đếm
 * lại, KHÔNG để cả thư viện 42 món chết vì một dòng sai.
 */
import { z } from "zod";
import { skelSchema, type Skel } from "@/lib/types/contract";

/** `cell` của element-lib.json: chỉ có đúng 3 giá trị trong dữ liệu thật. */
export const LIB_CELLS = ["landscape", "portrait", "full"] as const;
export type LibCell = (typeof LIB_CELLS)[number];

export const libElementStrictSchema = z.looseObject({
  file: z.string().min(1),
  vi: z.string().default(""),
  spec: z.string().default(""),
  skel: skelSchema,
  cell: z.string().optional(),
  /** nhóm để lọc; element-lib.json thật có 12 nhóm + phần không nhóm. */
  group: z.string().optional(),
  /** tên sheet ưu tiên khi cả chunk cùng group (studio.html dòng 250). */
  sheetHint: z.string().optional(),
});

export type LibElement = z.infer<typeof libElementStrictSchema>;

/** Nguồn thư viện — mục 1 của brief: "hỗ trợ chọn nguồn lib". */
export type LibSourceId = "agent" | "v2";

export interface LibSourceMeta {
  id: LibSourceId;
  /** nhãn ngắn trên segmented control */
  label: string;
  /** một câu giải thích khác nhau ở đâu — user phải hiểu mình đang chọn gì */
  hint: string;
}

export const LIB_SOURCES: Record<LibSourceId, LibSourceMeta> = {
  agent: {
    id: "agent",
    label: "Bản đang dùng",
    hint: "Thư viện mà công cụ local đang dùng (element-lib.json). Đây là bản mà mọi project hiện có được tạo ra từ đó.",
  },
  v2: {
    id: "v2",
    label: "Bản chuẩn hoá",
    hint: "Bản viết lại cho đều tay: mọi mô tả dài 18–30 từ, cùng cách nêu tỉ lệ và vai trò màu. Cùng 42 element, chỉ khác chữ mô tả và vài thông số khung xương.",
  },
};

export interface LibElementView extends LibElement {
  /** nhóm đã chuẩn hoá — element không có `group` gom vào một rổ có tên tử tế. */
  groupKey: string;
  groupLabel: string;
  /** sheet nào trong project đang có element trùng tên file */
  usedIn: string[];
  /** chuỗi thường hoá để tìm kiếm (file + vi + spec + group) */
  haystack: string;
}

/** Element không thuộc nhóm nào — khoá riêng để lọc được, không dùng chuỗi rỗng. */
export const NO_GROUP = "__none__";
export const NO_GROUP_LABEL = "Không thuộc nhóm";

/** Nhãn tiếng Việt cho các nhóm CÓ THẬT trong element-lib.json (12 nhóm).
 *  Nhóm lạ (thư viện mới thêm) hiện nguyên khoá — không vỡ, không đoán bừa. */
export const GROUP_LABELS: Record<string, string> = {
  btnstate: "Nút — trạng thái",
  checkbox: "Checkbox",
  chip: "Tab / chip",
  envelope: "Lì xì",
  form: "Ô nhập liệu",
  giftstate: "Quà — trạng thái",
  medal: "Huy chương",
  piece: "Mảnh ghép",
  pouch: "Túi quà",
  rankrow: "Hàng bảng xếp hạng",
  smallbtn: "Nút nhỏ",
  toggle: "Công tắc",
};

export function groupLabel(key: string): string {
  if (key === NO_GROUP) return NO_GROUP_LABEL;
  return GROUP_LABELS[key] ?? key;
}

/** Nhãn VI của `cell` — hiện trên thẻ element để biết ô ngang hay dọc. */
export const CELL_LABELS: Record<string, string> = {
  landscape: "ô ngang",
  portrait: "ô dọc",
  full: "tràn nền",
};

export function cellLabel(cell: unknown): string {
  const c = String(cell ?? "landscape");
  return CELL_LABELS[c] ?? c;
}

/** Cờ khung xương hiện thành badge (§3-S3.3: matte glow|glass / slice9 / free). */
export interface SkelFlag {
  key: "slice9" | "free" | "matte" | "anchor";
  label: string;
  hint: string;
}

export function skelFlags(skel: Partial<Skel> | null | undefined): SkelFlag[] {
  const out: SkelFlag[] = [];
  if (skel?.slice9 === true) {
    out.push({ key: "slice9", label: "9-slice", hint: "Co giãn được: ruột kéo dài, 4 góc giữ nguyên." });
  }
  if (skel?.free === true) {
    out.push({ key: "free", label: "khung tự do", hint: "Không có khung an toàn cố định — hình tự do theo art." });
  }
  const matte = skel?.matte;
  if (typeof matte === "string" && matte !== "") {
    out.push({
      key: "matte",
      label: matte === "glow" ? "phát sáng" : matte === "glass" ? "trong suốt" : `tách: ${matte}`,
      hint:
        matte === "glow"
          ? "Tách nền kiểu phát sáng: giữ vầng sáng bán trong suốt quanh element."
          : matte === "glass"
            ? "Tách nền kiểu kính: ruột rỗng nhìn xuyên qua được."
            : "Chế độ tách nền riêng cho element này.",
    });
  } else if (matte === true) {
    out.push({ key: "matte", label: "tách kỹ", hint: "Bật chế độ tách nền mềm cho element này." });
  }
  if (skel?.anchor === "bottom") {
    out.push({ key: "anchor", label: "dán đáy", hint: "Element bám đáy ô thay vì căn giữa." });
  }
  return out;
}
