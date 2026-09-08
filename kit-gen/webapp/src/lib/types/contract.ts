/**
 * webapp/src/lib/types/contract.ts — SCHEMA BẢN THIẾT KẾ (contract v4).
 *
 * zod là NGUỒN SỰ THẬT duy nhất: type TypeScript được `z.infer` ra từ schema, nên
 * không thể có chuyện type nói một đằng validate làm một nẻo. Cùng schema này được
 * dùng cho ba việc:
 *   1. đọc/kiểm dữ liệu agent trả về (§6.2 #22)
 *   2. validate form ở trình soạn S3 qua react-hook-form + zodResolver (§3.4 V-01…V-08)
 *   3. chặn TRƯỚC khi PUT (#23) để không tốn một vòng mạng chỉ để ăn 422
 *
 * ĐỐI CHIẾU DỮ LIỆU THẬT (đã chạy python đếm trên repo, không đoán):
 *   · styles.json                        13 sheet · 122 component · 4 phong cách
 *   · teams/t4-tichhop/styles-campaign.json  12 sheet ·  78 component · 3 phong cách
 *   · key của sheet     : id, styles|variants, grid, cell_hint, components, orient?, note?, ref?, poseRef?
 *   · key của component : file, vi, spec, skel
 *   · key của skel      : shape, w, h, slice9?, free?, anchor?, pose?, plain?
 *   · shape gặp thật    : pose, rrect, pill, circle, bar, empty, puzzle, full, burst
 *   · file KHÔNG khớp `^\d{2}-[a-z0-9-]+$`: 80/122 ở styles.json (76 `pose-*`, 4 `_empty-*`)
 *     ⇒ V-01 phải MIỄN cho ô pose và ô trống, nếu không thì contract thật của dự án
 *       bị đánh là sai. Agent (`agent/lib/validate.mjs`) đã miễn cho `shape:"empty"`;
 *       ở đây miễn thêm `shape:"pose"` vì `styles.json` thật dùng `pose-lan-idle`.
 *   · styles.json có `pose-soc`, `pose-soc2` LẶP id sheet ⇒ V-03 (id duy nhất) bắt được
 *     — đây chính là lỗi audit K4/A6 mà spec yêu cầu chặn ở client.
 */
import { z } from "zod";

/* ── regex chuẩn, khớp ĐÚNG agent/lib/paths.mjs dòng 69–77 ───────────────── */
export const RE_SHEET_ID = /^[a-z0-9-]{2,32}$/;
export const RE_VARIANT_ID = /^[a-z0-9-]{2,24}$/;
export const RE_COMPONENT_FILE = /^[0-9]{2}-[a-z0-9-]+$/;
export const RE_CHARACTER_ID = /^[a-z0-9-]{2,24}$/;
export const RE_PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,47}$/;
export const RE_SLUG = /^[a-z0-9][a-z0-9-]{2,47}$/;
export const RE_RUN_ID = /^r-[0-9]{4,8}$/;
export const RE_JOB = /^[a-z0-9-]{2,24}-[a-z0-9-]{2,32}$/;
export const RE_SNAPSHOT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/;
export const RE_TRASH_ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9-]{3,48}$/;

/** Tập shape mà `silhouettes.js` (dòng 87–125) + `skeleton.py` (SHAPES) vẽ được.
 *  "rect" thêm vào cho contract nhập từ ngoài — khớp agent/lib/validate.mjs. */
export const SKEL_SHAPES = [
  "empty", "pose", "pill", "bar", "rrect", "rect", "circle", "burst", "puzzle", "figure", "full",
] as const;
export const skelShapeSchema = z.enum(SKEL_SHAPES);
export type SkelShape = z.infer<typeof skelShapeSchema>;

/** 19 dáng mặc định — đúng `characterPoses` của styles.example.json. */
export const DEFAULT_CHARACTER_POSES = [
  "idle", "wave", "point", "hold-gift", "cheer", "sad", "run", "think", "sit", "jump",
  "bow", "thumbs-up", "fly", "walk", "dance", "present", "view-34", "view-side", "view-back",
] as const;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ MÀU THƯƠNG HIỆU MẶC ĐỊNH CỦA APP — TRUNG TÍNH, KHÔNG PHẢI CỦA AI CẢ      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * §BUG-1 (blind-test 2.1.17): mọi ô "Màu chính/Màu phụ" từng khởi tạo bằng cặp
 * `#005BAA` / `#00B0F0` — nhận diện của MỘT thương hiệu có thật, dán vào dự án của
 * mọi người dùng. LUẬT: giá trị khởi tạo của một trường THƯƠNG HIỆU chỉ được là (a)
 * rỗng, hoặc (b) màu trung tính của chính app.
 *
 * Hai màu dưới đây là mực/xám của bảng token (`styles/tokens.css`: `fg-strong` sáng
 * #151516 và `line-strong` tối #9A9A9A) — chúng không nói tên ai cả.
 *
 * ĐẶT Ở ĐÂY, KHÔNG Ở `kit-core/lib/model.ts`: bốn nơi cần chúng nằm ở bốn feature
 * khác nhau (workflow, home/Brand, design/Styles, kit-form), và `kit-form/lib/form-model`
 * ↔ `kit-core/lib/model` là một VÒNG import (model đọc `STYLE_AXIS_IDS` của
 * form-model). `types/contract.ts` là lá — không import gì trong `src/` — nên nó là
 * chỗ chung duy nhất không tạo vòng. `model.ts` xuất lại hai tên này để chỗ gọi cũ
 * không phải đổi.
 */
export const NEUTRAL_PRIMARY_COLOR = "#151516";
export const NEUTRAL_SECONDARY_COLOR = "#9A9A9A";


/**
 * `skel` — khung xương. `w`/`h` ∈ (0,1] là **V-06**.
 * Dùng `looseObject` (không phải strict) vì §6.5-6: agent thêm field mới thì UI cũ
 * KHÔNG ĐƯỢC VỠ. Field lạ được giữ nguyên khi ghi lại để không làm mất dữ liệu của
 * bản agent mới hơn.
 *
 * ⚠️ `matte` ĐÃ BỊ BỎ (08/09/2026) — nó là cờ đời tách-nền-bằng-key, vừa đổi câu chữ
 * của `gen.sh` vừa chọn nhánh giải ngược của `slice.py`, và cả hai vế đã chết. Độ
 * trong của một ô nay CHỈ là chữ trong `spec` — chữ người dùng tự gõ, không danh mục.
 * Contract cũ trên đĩa còn khoá ấy vẫn parse được (looseObject giữ nguyên field lạ) và
 * `mergeElementSkel` lược nó ra khi dựng contract mới — không có đường nào báo lỗi.
 */
export const skelSchema = z.looseObject({
  shape: skelShapeSchema,
  /**
   * `w`/`h` OPTIONAL — xem NEEDS-r2p1-design.md §N3. Ô trống thật của engine chỉ có
   * `{shape:"empty"}` (`skeleton.py:100`), và agent bỏ qua khi thiếu:
   * `agent/lib/validate.mjs:80` — `if (sk[k] === undefined) continue`.
   * Bắt buộc ở client làm ô trống không parse được, buộc R2-P1 phải bịa `w:1,h:1`
   * rồi ghi 2 field thừa lên đĩa. V-06 vẫn chạy đủ khi giá trị CÓ mặt.
   *
   * ⚠️ NEEDS-r2p1-design §N2 đề nghị gắn `params:{rule:"V-06"}` ngay tại `.gt()/.lte()`
   * ("zod v4 nhận `{message, params}` trong option của combinator"). ĐIỀU ĐÓ SAI —
   * đã thử và `tsc` bác: option của `.gt()` chỉ có `{abort?, error?, message?}`,
   * không có `params`. Vì vậy `ruleFromPath()` của họ ĐƯỢC GIỮ LẠI, không xoá.
   * Xem INTEGRATION.md phần "NEEDS bị bác".
   */
  w: z.number()
    .gt(0, "Giá trị từ 0.05 đến 1.00.")
    .lte(1, "Giá trị từ 0.05 đến 1.00.")
    .optional(),
  h: z.number()
    .gt(0, "Giá trị từ 0.05 đến 1.00.")
    .lte(1, "Giá trị từ 0.05 đến 1.00.")
    .optional(),
  slice9: z.boolean().optional(),
  free: z.boolean().optional(),
  anchor: z.enum(["bottom", "center", "top"]).optional(),
  /** chỉ có nghĩa khi shape="pose" — 1 trong `characterPoses`. */
  pose: z.string().optional(),
  plain: z.boolean().optional(),
});
export type Skel = z.infer<typeof skelSchema>;

/** Ô pose và ô trống được MIỄN luật tên file V-01 (xem đối chiếu dữ liệu ở đầu file). */
export function isFileNameExempt(shape: unknown): boolean {
  return shape === "empty" || shape === "pose";
}

export const componentSchema = z
  .looseObject({
    /**
     * KHÔNG dùng `.min(1)` ở đây — xem NEEDS-r2p1-design.md §N1 (lỗi ĐO ĐƯỢC).
     * Agent MIỄN luật tên file cho ô trống (`agent/lib/validate.mjs:63-66`:
     * `const isEmpty = c?.skel?.shape === "empty"; if (!isEmpty && !RE…) E("V-01")`),
     * và ô trống thật do `skeleton.py:100` sinh ra CHÍNH LÀ `{file:"", skel:{shape:"empty"}}`.
     * Bản cũ chặt hơn agent ⇒ mọi sheet có dù chỉ MỘT ô trống đều sinh issue ở
     * `components[j].file` ⇒ thanh Validate đếm là lỗi chặn ⇒ NÚT LƯU XÁM VĨNH VIỄN,
     * user không có đường thoát (xoá ô trống thì vỡ V-04 `len === cols*rows`).
     * `styles.json` thật có 4 ô `_empty-*` nên dữ liệu thật dính ngay.
     * V-01 dưới `superRefine` đã miễn đúng cho `empty`/`pose` và vẫn bắt ô thường
     * có `file` rỗng (chuỗi rỗng không khớp RE_COMPONENT_FILE).
     */
    file: z.string().default(""),
    vi: z.string().default(""),
    spec: z.string().default(""),
    skel: skelSchema,
    /**
     * CỠ ĐẦU RA (px thiết kế) — KHÔNG phải cỡ vẽ.
     *
     * Ô luôn được vẽ to hết cỡ lề cho phép (`geometry.max_fit_box`) để ăn trọn độ
     * phân giải của ảnh sinh; `out` chỉ nói element này phải to bao nhiêu khi RỜI
     * khỏi app (dán Figma, xuất PNG). `slice.py` chép nguyên sang manifest thành
     * `outSize`, dao cắt không đọc. Không có `out` = kit đời cũ, tầng xuất rơi về
     * `contractSafe` như trước.
     */
    out: z.looseObject({ w: z.number().int(), h: z.number().int() }).optional(),
    /** Hệ số phóng từ `out` lên hộp vẽ — chỉ để prompt nói ra ("drawn at 2.5x"). */
    drawScale: z.number().optional(),
  })
  .superRefine((c, ctx) => {
    // V-01 — "Tên file: 2 số + gạch nối + chữ thường. Gợi ý: `17-btn-close`"
    if (isFileNameExempt(c.skel?.shape)) return;
    if (!RE_COMPONENT_FILE.test(c.file)) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "Tên file: 2 số + gạch nối + chữ thường. Gợi ý: 17-btn-close",
        params: { rule: "V-01" },
      });
    }
  });
export type Component = z.infer<typeof componentSchema>;

export const gridSchema = z.looseObject({
  cols: z.number().int().min(1).max(8),
  rows: z.number().int().min(1).max(8),
});
export type Grid = z.infer<typeof gridSchema>;

/**
 * Sheet. `variants[]` là tên chốt của v2 (arch §2.4); dữ liệu thật trên đĩa còn dùng
 * `styles[]` (styles.json + styles-campaign.json đều vậy) nên schema nhận CẢ HAI và
 * chuẩn hoá về `variants`. Rỗng/thiếu = áp cho MỌI phong cách (đúng `contractJobs`
 * của agent/lib/contract.mjs).
 */
export const sheetSchema = z
  .looseObject({
    id: z.string().regex(RE_SHEET_ID, "Chỉ chữ thường, số, gạch nối (2–32 ký tự)."),
    grid: gridSchema,
    components: z.array(componentSchema),
    variants: z.array(z.string()).optional(),
    /** tên cũ trên đĩa — đọc được, khi ghi thì đã được `normalizeContract` gộp vào `variants`. */
    styles: z.array(z.string()).optional(),
    cell_hint: z.string().optional(),
    orient: z.enum(["landscape", "portrait"]).optional(),
    /* KHỔ CANVAS CỦA TẤM — field CHÍNH, thay cho `orient` (chỉ có ngang/dọc).
       Khoá phải khớp ĐÚNG bảng `CANVAS` trong khối python của `gen.sh`; bản chép
       của bảng đó nằm ở `skeleton-svg.js:sheetSize` và `slice.py:CANVAS`, và agent
       kiểm cùng tập khoá ở `agent/lib/validate.mjs:CANVAS_KINDS`.
         landscape → 1536×1024 · portrait → 1024×1536 · square → 1254×1254
       1254 chứ không phải 1024/2048: tool `image_gen` của codex KHÔNG có tham số
       `size`, nó luôn trả ~1,57 triệu pixel và chỉ lái được TỈ LỆ — đo 685 ảnh
       thật thì 132 ảnh vuông đều đúng 1254×1254.
       `orient` giữ lại để contract đời trước còn chạy; có cả hai thì `canvas` thắng. */
    canvas: z.enum(["landscape", "portrait", "square"]).optional(),
    note: z.string().optional(),
    /* PROMPT STUDIO — hai trường CHỮ mà `gen.sh` đọc thẳng từ `styles.json`:
       `directive` (gen.sh:760 — chèn một dòng chỉ đạo ngay sau `note`) và
       `promptOverride` (gen.sh:973 — thay TRỌN prompt của tấm, chỉ giữ dòng
       `Canvas orientation:` đầu tiên). Khai TƯỜNG MINH dù `looseObject` vốn đã cho
       khoá lạ đi qua: khai ra thì `Sheet` có type cho chúng, còn thứ tự khoá của
       object sau `parse` là thứ tự SCHEMA — để hai trường này nằm sau `note` (đúng
       chỗ chúng đứng trong prompt) chứ không trôi xuống cuối theo thứ tự input.
       Agent kiểm cùng một luật ở `agent/lib/validate.mjs:42`: có thì phải là chuỗi. */
    directive: z.string().optional(),
    promptOverride: z.string().optional(),
    /* QA-FUNC: agent ĐÃ GỬI `ref: null` cho MỌI sheet của MỌI project tạo trước
       08/09/2026 (khi ấy `agent/lib/templates.mjs` và `importer.mjs` dựng sẵn tấm).
       `.optional()` không nhận null ⇒ zod ném ⇒ endpoints.ts biến thành AGENT_INTERNAL
       ⇒ MÀN S3 THIẾT KẾ KHÔNG MỞ ĐƯỢC với bất kỳ project nào. Dùng `.nullish()` — và
       giữ nguyên: contract.json trên đĩa người dùng vẫn còn nguyên những `null` đó. */
    ref: z.string().nullish(),
    /* TẤM ẢNH DÁNG GHÉP SẴN — cùng luật đường dẫn với `ref`, khác vai trò.
       `ref` là ảnh NHÂN VẬT (danh tính, trang phục); `poseRef` là một tấm manơcanh
       xám xếp CÙNG LƯỚI, CÙNG TOẠ ĐỘ Ô với tấm sắp vẽ, chỉ để chép DÁNG và GÓC
       MÁY của từng ô. Phải là hai trường chứ không phải một mảng `refs`: `gen.sh`
       nói vai trò của từng ảnh bằng một CÂU riêng, và câu ấy chỉ viết được khi
       biết ảnh nào đóng vai nào (xem khối "KHÔNG CÒN The SECOND attached image"). */
    poseRef: z.string().nullish(),
    /* BẢN PHÁC BỐ CỤC của tấm nền — cùng luật đường dẫn với `ref`, vai trò ngược
       lại. `ref` nói NỘI DUNG ("cảnh này"), `layoutRef` chỉ nói CHỖ ĐẶT ("khối
       này to chừng này, nằm chỗ này") và `gen.sh` dặn máy vẽ đừng lấy gì khác từ
       nó — không lấy nét, không lấy màu, không lấy độ hoàn thiện. Phải là trường
       RIÊNG chứ không dùng lại `ref`: một bản phác nằm ở `ref` là lệnh "vẽ lại
       chính bản phác này cho đẹp", và đó đúng là thứ đã xảy ra khi câu Background
       chỉ có một ô ảnh không khai vai trò. */
    layoutRef: z.string().nullish(),
    mode: z.string().optional(),
  })
  .superRefine((sh, ctx) => {
    // V-04 — số ô phải bằng cols×rows. Đây chính là assert của gen.sh/slice.py.
    const need = sh.grid.cols * sh.grid.rows;
    if (sh.components.length !== need) {
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: `Lưới ${sh.grid.cols}×${sh.grid.rows} cần ${need} ô, đang có ${sh.components.length}.`,
        params: { rule: "V-04", expected: need, actual: sh.components.length },
      });
    }
    // V-02 — tên file duy nhất TRONG sheet.
    const seen = new Map<string, number>();
    sh.components.forEach((c, i) => {
      const prev = seen.get(c.file);
      if (prev !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["components", i, "file"],
          message: `Đã có element tên này ở ô ${prev + 1}.`,
          params: { rule: "V-02" },
        });
      } else seen.set(c.file, i);
    });
    // ref/poseRef phải là đường dẫn TƯƠNG ĐỐI trong project (khớp agent: REF_PATH).
    for (const field of ["ref", "poseRef", "layoutRef"] as const) {
      const path = sh[field];
      if (path && (path.includes("..") || path.startsWith("/"))) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Đường dẫn ảnh phải nằm trong project.",
          params: { rule: "REF_PATH" },
        });
      }
    }
  });
export type Sheet = z.infer<typeof sheetSchema>;

export const brandSchema = z.looseObject({
  mode: z.enum(["colors", "image"]).default("colors"),
  primary: z.string().optional(),
  secondary: z.string().optional(),
  refs: z.array(z.string()).optional(),
});
export type Brand = z.infer<typeof brandSchema>;

export const characterSchema = z.looseObject({
  id: z.string().regex(RE_CHARACTER_ID, "Chỉ chữ thường, số, gạch nối."),
  vi: z.string().default(""),
  ref: z.string().nullish(),   // QA-FUNC: agent dùng null cho "chưa có ảnh tham khảo"
  poses: z.array(z.string()).optional(),
});
export type Character = z.infer<typeof characterSchema>;

/**
 * Phong cách (`variant`). Dữ liệu thật: id, vi, style, styleMode, bg, brand, characters, inspo.
 *
 * `styleMode` là `"prompt" | "inspo"`, KHÔNG phải `"prompt" | "image"`. Nguồn sự thật là
 * `gen.sh:95` (`s.get("styleMode","prompt") == "inspo" and s.get("inspo")`), khớp
 * `studio.html:346`. Bản đầu của schema này ghi `"image"`
 * theo trực giác và bị ca test "styles.json thật parse sạch" bắt lỗi ngay: 3/4 phong cách
 * trong `styles.json` dùng `styleMode:"inspo"` và bị báo sai. Đã sửa theo code, không theo
 * trí nhớ. (`brand.mode` mới là chỗ dùng `"colors" | "image"` — hai trường khác nhau.)
 */
export const variantSchema = z.looseObject({
  id: z.string().regex(RE_VARIANT_ID, "Chỉ chữ thường, số, gạch nối (2–24 ký tự)."),
  vi: z.string().default(""),
  style: z.string().default(""),
  styleMode: z.enum(["prompt", "inspo"]).optional(),
  brand: brandSchema.nullish(),
  /** `styles.json` có variant `candy` với `characters: null` ⇒ phải nhận nullish. */
  characters: z.array(characterSchema).nullish(),
  inspo: z.array(z.string()).nullish(),
});
export type Variant = z.infer<typeof variantSchema>;

/** Tham số cắt của S3.6 — đúng 3 tham số của slice.py (đóng C8). */
export const sliceParamsSchema = z.looseObject({
  threshold: z.number().int().min(0).max(255).optional(),
  grow_threshold: z.number().int().min(0).max(255).optional(),
  bleed: z.number().min(0).max(1).optional(),
  quality: z.enum(["fast", "high"]).optional(),
});
export type SliceParams = z.infer<typeof sliceParamsSchema>;

/**
 * CONTRACT v4. `variants[]` là tên chốt; `styles[]` là tên cũ trên đĩa — nhận cả hai.
 * Luật liên-sheet (V-03 id duy nhất, V-05 id phong cách duy nhất) kiểm ở tầng này.
 */
export const contractSchema = z
  .looseObject({
    schemaVersion: z.number().optional(),
    sheets: z.array(sheetSchema).default([]),
    variants: z.array(variantSchema).optional(),
    styles: z.array(variantSchema).optional(),
    characterPoses: z.array(z.string()).default([]),
    slice: sliceParamsSchema.optional(),
  })
  .superRefine((c, ctx) => {
    const variants = c.variants ?? c.styles ?? [];
    // V-05 — id phong cách duy nhất.
    const vSeen = new Set<string>();
    variants.forEach((v, i) => {
      if (vSeen.has(v.id)) {
        ctx.addIssue({
          code: "custom",
          path: [c.variants ? "variants" : "styles", i, "id"],
          message: `Đã có phong cách «${v.id}». Đổi tên hoặc gộp.`,
          params: { rule: "V-05" },
        });
      } else vSeen.add(v.id);
    });
    // V-03 — id sheet duy nhất trong project (đóng A6/K4; styles.json thật đang vi phạm).
    const sSeen = new Set<string>();
    c.sheets.forEach((sh, i) => {
      if (sSeen.has(sh.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["sheets", i, "id"],
          message: `Đã có sheet «${sh.id}». Đổi tên hoặc gộp.`,
          params: { rule: "V-03" },
        });
      } else sSeen.add(sh.id);
    });
  });
export type Contract = z.infer<typeof contractSchema>;

/* ── Chuẩn hoá & tính toán dẫn xuất ─────────────────────────────────────── */

/** Phong cách của contract, bất kể dữ liệu dùng `variants` hay `styles`. */
export function contractVariants(c: Pick<Contract, "variants" | "styles">): Variant[] {
  return (c.variants ?? c.styles ?? []) as Variant[];
}

/** Sheet này áp cho phong cách nào (rỗng = mọi phong cách) — đọc cả `variants` và `styles`. */
export function sheetVariantFilter(sh: Pick<Sheet, "variants" | "styles">): string[] {
  const list = sh.variants ?? sh.styles ?? [];
  return Array.isArray(list) ? list : [];
}

/**
 * Danh sách lượt sinh ảnh (job) = phong cách × sheet — CHÍNH XÁC như
 * `contractJobs()` của agent (agent/lib/contract.mjs) và như `gen.sh`.
 * UI hiện là "phong cách × sheet", không bao giờ hiện chữ "job" (§1.3).
 */
export function contractJobs(c: Contract): { job: string; variant: string; sheet: string }[] {
  const out: { job: string; variant: string; sheet: string }[] = [];
  for (const v of contractVariants(c)) {
    for (const sh of c.sheets) {
      const only = sheetVariantFilter(sh);
      if (only.length > 0 && !only.includes(v.id)) continue;
      out.push({ job: `${v.id}-${sh.id}`, variant: v.id, sheet: sh.id });
    }
  }
  return out;
}

/** Đưa `styles[]` (tên cũ) về `variants[]` (tên chốt v2) — dùng trước khi PUT. */
export function normalizeContract(c: Contract): Contract {
  const variants = contractVariants(c);
  const { styles: _drop, ...rest } = c;
  return {
    ...rest,
    schemaVersion: c.schemaVersion ?? 4,
    variants,
    sheets: c.sheets.map((sh) => {
      const only = sheetVariantFilter(sh);
      const { styles: _s, ...r } = sh;
      return only.length > 0 ? { ...r, variants: only } : r;
    }),
  };
}

/* ── Đọc mã luật từ lỗi zod ─────────────────────────────────────────────── */

/**
 * Mỗi luật V-01…V-08 gắn `params.rule` vào issue. `params` KHÔNG nằm trong type công khai
 * `$ZodIssue` của zod v4, nên thay vì bắt mỗi nơi dùng phải tự ép kiểu, đọc qua hai hàm này.
 *
 * Thanh Validate của S3 cần đúng thứ này: nhóm lỗi theo luật, và click từng dòng để nhảy
 * tới chỗ sai (`issue.path`).
 */
export function issueRule(issue: { params?: unknown } | unknown): string | null {
  const p = (issue as { params?: { rule?: unknown } } | null)?.params;
  return typeof p?.rule === "string" ? p.rule : null;
}

/** Danh sách mã luật của một `ZodError` (bỏ issue không gắn luật, vd lỗi kiểu thuần). */
export function issueRules(error: { issues: readonly unknown[] } | null | undefined): string[] {
  return (error?.issues ?? []).map(issueRule).filter((r): r is string => r !== null);
}

/**
 * Gom issue của zod thành danh sách dùng được cho thanh Validate §3.4:
 * `{ rule, path, message }` với `path` dạng chuỗi (`sheets[2].components`).
 */
export function toValidationErrors(
  error: { issues: readonly { path?: readonly PropertyKey[]; message?: string }[] } | null | undefined,
): { rule: string; path: string; message: string }[] {
  return (error?.issues ?? []).map((i) => ({
    rule: issueRule(i) ?? "SCHEMA",
    path: (i.path ?? []).reduce<string>(
      (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc === "" ? String(seg) : `${acc}.${String(seg)}`),
      "",
    ),
    message: i.message ?? "",
  }));
}

/* ── Cảnh báo (KHÔNG chặn lưu) — V-07 & ô trống §3.3 ────────────────────── */

export interface ContractWarning {
  rule: string;
  path: string;
  message: string;
}

/** V-07 (sheet 0 element) + đếm ô trống. Nút Lưu VẪN bấm được khi chỉ có cảnh báo (§3.4). */
export function contractWarnings(c: Contract): ContractWarning[] {
  const out: ContractWarning[] = [];
  c.sheets.forEach((sh, i) => {
    if (sh.components.length === 0) {
      out.push({
        rule: "V-07",
        path: `sheets[${i}].components`,
        message: `Sheet «${sh.id}» chưa có element — sẽ bị bỏ qua khi sinh ảnh.`,
      });
      return;
    }
    const empty = sh.components.filter((cp) => cp.skel?.shape === "empty").length;
    if (empty > 0) {
      const pct = Math.round((empty / sh.components.length) * 100);
      out.push({
        rule: "EMPTY_CELLS",
        path: `sheets[${i}].components`,
        message: `${empty} ô trống — vẫn tính vào ảnh (≈${pct}% diện tích).`,
      });
    }
  });
  const known = new Set(contractVariants(c).map((v) => v.id));
  c.sheets.forEach((sh, i) => {
    sheetVariantFilter(sh).forEach((vid, k) => {
      if (!known.has(vid)) {
        out.push({
          rule: "UNKNOWN_VARIANT",
          path: `sheets[${i}].variants[${k}]`,
          message: `Sheet «${sh.id}» trỏ tới phong cách «${vid}» không còn tồn tại.`,
        });
      }
    });
  });
  return out;
}

/** Slug từ tên có dấu — ĐÚNG `slugify()` của agent (§4.1-1, đóng E2). */
export function slugify(name: string): string {
  const s = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || "project";
}
