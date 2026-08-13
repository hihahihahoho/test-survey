/**
 * webapp/src/lib/types/api.ts — TYPE CHO TOÀN BỘ HỢP ĐỒNG API §6.2 (42 endpoint).
 *
 * Quy ước chung cho MỌI schema response trong file này: dùng `z.looseObject`, KHÔNG
 * `strictObject`. Lý do là ràng buộc §6.5-6: "Mọi `code` lỗi mới (agent thêm sau) mà web
 * chưa biết → hiện lỗi generic. KHÔNG được vỡ UI." Cùng logic đó áp cho field: agent v1.3
 * thêm field mới thì bundle v1.2 phải vẫn chạy. `strictObject` sẽ làm cả màn hình chết vì
 * một field vô hại — đúng kiểu lỗi mà audit E1–E5 đã cấm.
 *
 * Ngược lại, `store` (localStorage) thì PHẢI strict — xem lib/store/persist.ts. Hai chỗ,
 * hai luật, có lý do khác nhau.
 */
import { z } from "zod";
import { contractSchema, RE_JOB, RE_PROJECT_ID, RE_RUN_ID, RE_SLUG, skelSchema } from "./contract";

/* ═════════════ Enum dùng chung ═════════════ */

/** 7 trạng thái lượt sinh ảnh — §5.7, KHÔNG THÊM KHÔNG BỚT. Khớp lib/status.ts của P1. */
export const jobStatusSchema = z.enum(["never", "queued", "running", "ok", "stale", "uncut", "failed"]);
export type JobStatusValue = z.infer<typeof jobStatusSchema>;

/** Trạng thái lượt chạy — §6.2 kiểu `Run`. `queued` có trong agent (runs.mjs) nên phải nhận. */
export const runStatusSchema = z.enum([
  "queued", "running", "done", "done-with-errors", "cancelled", "env-failed",
]);
export type RunStatusValue = z.infer<typeof runStatusSchema>;

export const runKindSchema = z.enum(["gen", "slice", "skeleton"]);
export type RunKind = z.infer<typeof runKindSchema>;

/** Chẩn đoán 1 dòng cho lượt lỗi (§6.2 kiểu `Run`, cột `diagnosis`). */
export const diagnosisSchema = z.enum([
  "QUOTA_SUSPECTED", "NOT_LOGGED_IN", "NO_ARTIFACT", "TIMEOUT", "UNKNOWN",
]);
export type Diagnosis = z.infer<typeof diagnosisSchema>;

/** 5 enum mode tạo ảnh được phép lưu ở browser (arch §4.1 `kitgen.setup.v1`). */
export const imageGenModeSchema = z.enum([
  "default-home", "img-home", "profile-overlay", "unavailable", "unknown",
]);
export type ImageGenMode = z.infer<typeof imageGenModeSchema>;

/* ═════════════ Envelope lỗi (§6.1) ═════════════ */

/**
 * `message` là KỸ THUẬT: chỉ được hiện trong panel "Chi tiết cho lập trình viên".
 * Type này cố ý KHÔNG có helper nào trả `message` ra cho UI — muốn lấy phải đi qua
 * `devDetails()` của lib/api/errors.ts, để việc rò message ra thân UI là một hành vi
 * phải viết thêm code mới làm được (chứ không phải vô tình).
 */
export const errorEnvelopeSchema = z.looseObject({
  error: z.looseObject({
    code: z.string(),
    message: z.string().optional(),
    hint: z.string().optional(),
    docs: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/* ═════════════ A. Hệ thống & môi trường (#1–#6) ═════════════ */

/** #1 `GET /health` — endpoint DUY NHẤT được gọi định kỳ (§6.2 ràng buộc thiết kế). */
export const healthSchema = z.looseObject({
  ok: z.boolean(),
  app: z.string().optional(),
  protocol: z.number(),
  version: z.string().optional(),
  buildId: z.string().optional(),
  instanceLabel: z.string().optional(),
  workspaceId: z.string().optional(),
  /** nhãn RÚT GỌN (`~/KitGen`), không phải path tuyệt đối — arch §4.1. */
  workspaceLabel: z.string().optional(),
  workspaceFingerprint: z.string().optional(),
  projects: z.number().optional(),
  activeRuns: z.number().optional(),
  uptimeMs: z.number().optional(),
  updateCommand: z.string().optional(),
  /** agent gộp sẵn cờ imageGen vào /health để pill §2.4 hàng 6 không phải poll doctor. */
  imageGen: z.looseObject({ available: z.boolean().optional() }).optional(),
});
export type Health = z.infer<typeof healthSchema>;

/** #2 `GET /api/doctor` — CẤM poll (chạy `codex debug prompt-input`, ~1s). Cache 60s. */
export const doctorSchema = z.looseObject({
  os: z.string().optional(),
  shell: z.string().optional(),
  kernel: z.string().optional(),
  node: z.looseObject({ ok: z.boolean(), version: z.string().nullish() }).optional(),
  python: z.looseObject({
    ok: z.boolean(),
    version: z.string().nullish(),
    venv: z.boolean().optional(),
    deps: z.record(z.string(), z.boolean()).optional(),
  }).optional(),
  playwright: z.looseObject({ ok: z.boolean(), fallback: z.string().optional() }).optional(),
  codex: z.looseObject({ ok: z.boolean(), version: z.string().nullish() }).optional(),
  imageGen: z.looseObject({
    mode: imageGenModeSchema.catch("unknown"),
    available: z.boolean(),
    /** nhãn rút gọn `~/.codex-img`, KHÔNG phải path tuyệt đối. */
    codexHomeLabel: z.string().nullish(),
    /** `existsSync(auth.json)` — BOOLEAN, agent không bao giờ đọc nội dung (arch §4.4-4). */
    authPresent: z.boolean().optional(),
    verifiedAt: z.string().optional(),
    reason: z.string().nullish(),
    needsFallbackHome: z.boolean().optional(),
  }).optional(),
  workspace: z.looseObject({
    label: z.string().optional(),
    writable: z.boolean().optional(),
    freeBytes: z.number().optional(),
  }).optional(),
  checkedAt: z.string().optional(),
  lite: z.boolean().optional(),
});
export type Doctor = z.infer<typeof doctorSchema>;

/** #3 `GET /api/workspaces` — web chọn bằng **id đục**, không bao giờ gửi path (chốt X1). */
export const workspaceItemSchema = z.looseObject({
  id: z.string(),
  label: z.string(),
  projects: z.number().optional(),
  /* QA-FUNC: agent trả `diskBytes: null` khi chưa tính được dung lượng
     (system.mjs #3). `.optional()` không nhận null ⇒ S6 tab Agent + màn Setup
     bước chọn workspace vỡ thành AGENT_INTERNAL. */
  diskBytes: z.number().nullish(),
  active: z.boolean().optional(),
  writable: z.boolean().optional(),
});
export type WorkspaceItem = z.infer<typeof workspaceItemSchema>;

export const workspaceListSchema = z.looseObject({
  items: z.array(workspaceItemSchema).default([]),
  activeId: z.string().nullish(),
});
export type WorkspaceList = z.infer<typeof workspaceListSchema>;

/** #4 `POST /api/workspace/activate` */
export const activateWorkspaceSchema = z.looseObject({
  ok: z.boolean().optional(),
  workspaceId: z.string(),
  workspaceLabel: z.string().optional(),
  workspaceFingerprint: z.string().optional(),
});

/* ═════════════ B. Project CRUD (#7–#21) ═════════════ */

/** Phân rã dung lượng — 6 dòng của wireframe §3-S2b (INTEGRATION §1.1 đã hiện thực hoá). */
export const diskBreakdownSchema = z.looseObject({
  raw: z.number().optional(),
  rawHistory: z.number().optional(),
  kits: z.number().optional(),
  skeleton: z.number().optional(),
  runs: z.number().optional(),
  refs: z.number().optional(),
  prompts: z.number().optional(),
});
export type DiskBreakdown = z.infer<typeof diskBreakdownSchema>;

export const projectStatsSchema = z.looseObject({
  variants: z.number().default(0),
  sheets: z.number().default(0),
  components: z.number().default(0),
  jobs: z.number().default(0),
  rawPresent: z.number().default(0),
  kitsCut: z.number().default(0),
  lastRun: z.looseObject({
    id: z.string(),
    at: z.string().nullish(),
    ok: z.number().optional(),
    fail: z.number().optional(),
  }).nullish(),
  diskBytes: z.number().default(0),
  diskBreakdown: diskBreakdownSchema.optional(),
});
export type ProjectStats = z.infer<typeof projectStatsSchema>;

/** `state.activeRun` — S1 cần badge `⚡2/8` theo TỪNG project (INTEGRATION N3). */
export const activeRunSchema = z.looseObject({
  runId: z.string().nullish(),
  kind: runKindSchema.nullish(),
  done: z.number().default(0),
  total: z.number().default(0),
  failed: z.number().default(0),
});
export type ActiveRunInfo = z.infer<typeof activeRunSchema>;

export const projectStateSchema = z.looseObject({
  stale: z.boolean().default(false),
  staleReason: z.array(z.string()).default([]),
  /** map `job → 1 trong 7 trạng thái §5.7` — nguồn của ma trận S2 và modal M1.
   *  `catch` để một job có trạng thái lạ (agent mới) không giết cả màn. */
  jobs: z.record(z.string(), jobStatusSchema.catch("never")).default({}),
  activeRun: activeRunSchema.nullish(),
});
export type ProjectState = z.infer<typeof projectStateSchema>;

/**
 * Kiểu `Project` (#7, #8, #9, #10, #16) — đúng `project.json` arch §2.3 + `state.jobs`.
 * `broken:true` ⇒ thẻ đỏ ở S1, KHÔNG được biến mất im lặng (arch §2.5).
 */
export const projectSchema = z.looseObject({
  id: z.string(),
  schemaVersion: z.number().optional(),
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contract: z.looseObject({
    file: z.string().optional(),
    version: z.number().default(0),
    /* QA-FUNC: project vừa tạo có `hash: null` (projects.mjs:200 đặt hash null
       lúc createProjectDir). `.optional()` không nhận null ⇒ MÀN S1 DANH SÁCH
       vỡ toàn bộ chỉ vì MỘT project mới. */
    hash: z.string().nullish(),
  }).optional(),
  cover: z.string().nullish(),
  workflow: z.looseObject({ completed: z.boolean().default(true), updatedAt: z.string().nullish() }).optional(),
  stats: projectStatsSchema.optional(),
  state: projectStateSchema.optional(),
  broken: z.boolean().default(false),
  error: z.looseObject({
    code: z.string().optional(),
    file: z.string().optional(),
    line: z.number().nullish(),
    message: z.string().optional(),
  }).nullish(),
});
export type Project = z.infer<typeof projectSchema>;

export const workflowDraftSchema = z.looseObject({
  completed: z.boolean().default(false), draft: z.record(z.string(), z.unknown()).nullable().default(null), updatedAt: z.string().nullish(),
});
export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;

/** #7 `GET /api/projects` */
export const projectListSchema = z.looseObject({
  items: z.array(projectSchema).default([]),
  scannedAt: z.string().optional(),
  workspaceLabel: z.string().optional(),
  workspaceFingerprint: z.string().optional(),
});
export type ProjectList = z.infer<typeof projectListSchema>;

/** #8 `POST /api/projects` — 4 template chốt ở §4.1. */
export const createProjectInputSchema = z.object({
  name: z.string().min(1, "Nhập tên project."),
  slug: z.string().regex(RE_SLUG, "Chỉ chữ thường, số, gạch nối (3–48 ký tự).").optional(),
  template: z.enum(["blank", "basic", "from-project", "import"]).default("basic"),
  firstVariant: z.object({
    id: z.string().optional(),
    vi: z.string().min(1, "Đặt tên cho phong cách đầu tiên."),
    bg: z.enum(["magenta", "green"]).default("magenta"),
  }),
  tags: z.array(z.string()).default([]),
  import: z.object({
    source: z.enum(["zip", "stylesJson", "folder"]),
    uploadId: z.string().optional(),
    path: z.string().optional(),
  }).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const createProjectResultSchema = z.looseObject({
  project: projectSchema,
  warnings: z.array(z.looseObject({
    code: z.string(),
    message: z.string().optional(),
    count: z.number().optional(),
  })).default([]),
});

/** #9 `GET /api/projects/:id` */
export const projectDetailSchema = z.looseObject({ project: projectSchema });

/** #10 `PATCH /api/projects/:id` — patch MỘT PHẦN; `projectId`/thư mục KHÔNG đổi (§4.2). */
export const patchProjectInputSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().regex(RE_SLUG).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  cover: z.string().nullable().optional(),
});
export type PatchProjectInput = z.infer<typeof patchProjectInputSchema>;

/** #11 `DELETE /api/projects/:id` — xoá MỀM vào thùng rác 30 ngày (chốt X6). */
export const deleteProjectResultSchema = z.looseObject({
  ok: z.boolean().optional(),
  trashId: z.string(),
  restoreBefore: z.string().optional(),
  cancelledRuns: z.array(z.string()).default([]),
  bytes: z.number().optional(),
});
export type DeleteProjectResult = z.infer<typeof deleteProjectResultSchema>;

/** #12 `GET /api/trash` */
export const trashItemSchema = z.looseObject({
  trashId: z.string(),
  projectId: z.string().optional(),
  name: z.string().optional(),
  deletedAt: z.string().optional(),
  restoreBefore: z.string().optional(),
  bytes: z.number().optional(),
});
export type TrashItem = z.infer<typeof trashItemSchema>;
export const trashListSchema = z.looseObject({ items: z.array(trashItemSchema).default([]) });

/** #16 `POST /api/projects/:id/duplicate` — use case CHÍNH của tool (§4.3). */
export const duplicateInputSchema = z.object({
  name: z.string().min(1),
  include: z.array(z.enum(["contract", "refs", "raw", "kits", "runs"])).default(["contract", "refs"]),
  variants: z.union([z.literal("all"), z.literal("none"), z.array(z.string())]).default("all"),
  newVariant: z.object({ vi: z.string(), id: z.string().optional() }).optional(),
});
export type DuplicateInput = z.infer<typeof duplicateInputSchema>;

export const duplicateResultSchema = z.looseObject({
  project: projectSchema,
  copied: z.looseObject({ files: z.number().optional(), bytes: z.number().optional() }).optional(),
});

/** #17 `POST /api/projects/:id/clean` — nhóm "tái tạo rẻ" (§1.2). */
export const cleanTargetSchema = z.enum(["skeleton", "prompts", "kits", "rawHistory", "oldLogs"]);
export type CleanTarget = z.infer<typeof cleanTargetSchema>;
export const cleanResultSchema = z.looseObject({
  freedBytes: z.number().default(0),
  removed: z.record(z.string(), z.number()).default({}),
});

/** #19 `POST /api/uploads` */
export const uploadResultSchema = z.looseObject({
  uploadId: z.string(),
  filename: z.string().optional(),
  bytes: z.number().optional(),
  kind: z.enum(["zip", "json", "image"]).optional(),
});

/** #20 `POST /api/import/preview` — LUÔN preview trước, cấm import im lặng (chốt X12). */
export const importReportSchema = z.looseObject({
  sheets: z.number().default(0),
  components: z.number().default(0),
  variants: z.number().default(0),
  poses: z.number().default(0),
  willCreate: z.record(z.string(), z.unknown()).optional(),
  warnings: z.array(z.looseObject({
    code: z.string(),
    message: z.string().optional(),
    items: z.array(z.string()).default([]),
  })).default([]),
  unknownComponents: z.number().default(0),
  duplicateSheetIds: z.array(z.string()).default([]),
  missingRefs: z.array(z.string()).default([]),
});
export type ImportReport = z.infer<typeof importReportSchema>;
export const importPreviewSchema = z.looseObject({ report: importReportSchema });

/* ═════════════ C. Bản thiết kế (#22–#28) ═════════════ */

/** #22 `GET /api/projects/:id/contract` + `ETag: "37"` */
export const contractResponseSchema = z.looseObject({
  version: z.number().default(0),
  contract: contractSchema,
});
export type ContractResponse = z.infer<typeof contractResponseSchema>;

export const validationSchema = z.looseObject({
  errors: z.array(z.looseObject({
    code: z.string(),
    path: z.string().optional(),
    message: z.string().optional(),
    expected: z.unknown().optional(),
    actual: z.unknown().optional(),
  })).default([]),
  warnings: z.array(z.looseObject({
    code: z.string(),
    path: z.string().optional(),
    message: z.string().optional(),
  })).default([]),
});
export type Validation = z.infer<typeof validationSchema>;

/** #23 `PUT` — If-Match BẮT BUỘC (§6.5-4). */
export const saveContractResultSchema = z.looseObject({
  version: z.number(),
  hash: z.string().optional(),
  snapshot: z.string().optional(),
  validation: validationSchema.optional(),
});
export type SaveContractResult = z.infer<typeof saveContractResultSchema>;

/** `details` của 409 CONTRACT_CONFLICT — modal so sánh 2 cột của S3 cần đúng 3 số này. */
export const contractConflictDetailsSchema = z.looseObject({
  serverVersion: z.number(),
  serverHash: z.string().nullish(),
  diffSummary: z.looseObject({
    added: z.number().default(0),
    removed: z.number().default(0),
  }).optional(),
});
export type ContractConflictDetails = z.infer<typeof contractConflictDetailsSchema>;

/** #24 `GET …/contract/history?limit=50` — thay `.bak` 1 tầng (đóng B4). */
export const historyItemSchema = z.looseObject({
  snapshot: z.string(),
  version: z.number().nullish(),
  at: z.string().nullish(),
  bytes: z.number().optional(),
  summary: z.looseObject({
    sheets: z.number().optional(),
    components: z.number().optional(),
  }).optional(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;
export const historyListSchema = z.looseObject({ items: z.array(historyItemSchema).default([]) });

/** #26 `POST …/contract/restore` — tạo bản MỚI, không ghi đè lịch sử. */
export const restoreContractResultSchema = z.looseObject({ version: z.number() });

/** #28 `GET /api/element-lib` — catalogue CHỈ ĐỌC (chốt X8). */
export const libElementSchema = z.looseObject({
  file: z.string(),
  vi: z.string().default(""),
  spec: z.string().default(""),
  skel: z.looseObject({}).optional(),
  cell: z.string().optional(),
  group: z.string().optional(),
});
export type LibElement = z.infer<typeof libElementSchema>;
export const elementLibSchema = z.looseObject({
  version: z.union([z.number(), z.string()]).optional(),
  elements: z.array(libElementSchema).default([]),
});
export type ElementLib = z.infer<typeof elementLibSchema>;

/** Kho riêng do người dùng quản lý; không ghi đè catalogue engine chỉ-đọc. */
export const libraryItemSchema = z.looseObject({
  id: z.string(),
  kind: z.enum(["ui", "mascot", "reference"]),
  group: z.enum(["background", "popup", "small", "props", "mascot", "style", "mascot-reference", "brand-logo", "brand-style", "brand-mascot"]),
  name: z.string(),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  filename: z.string(),
  bytes: z.number().optional(),
  w: z.number().nullish(),
  h: z.number().nullish(),
  poses: z.array(z.string()).default([]),
  cell: z.enum(["landscape", "portrait", "full"]).optional(),
  skel: skelSchema.optional(),
  createdAt: z.string().optional(),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export const librarySettingsSchema = z.object({
  background: z.number().int().min(1).max(32).default(2),
  popup: z.number().int().min(1).max(32).default(4),
  small: z.number().int().min(1).max(32).default(16),
  props: z.number().int().min(1).max(32).default(16),
  mascot: z.number().int().min(1).max(32).default(4),
});
export type LibrarySettings = z.infer<typeof librarySettingsSchema>;
export const brandProfileSchema = z.looseObject({
  id: z.string(), name: z.string(), description: z.string().default(""),
  colors: z.array(z.string()).default([]), assetIds: z.array(z.string()).default([]),
  createdAt: z.string().optional(), updatedAt: z.string().optional(),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;
export const brandProfileResultSchema = z.looseObject({ brand: brandProfileSchema });
export const poseTemplateSchema = z.looseObject({
  id: z.string(), name: z.string(), description: z.string().default(""),
  sourcePose: z.string(), enabled: z.boolean().default(true), builtIn: z.boolean().default(false),
  createdAt: z.string().optional(), updatedAt: z.string().optional(),
});
export type PoseTemplate = z.infer<typeof poseTemplateSchema>;
export const poseTemplateResultSchema = z.looseObject({ pose: poseTemplateSchema });
export const userLibrarySchema = z.looseObject({
  version: z.number().default(1),
  brands: z.array(brandProfileSchema).default([]),
  poseTemplates: z.array(poseTemplateSchema).default([]),
  settings: librarySettingsSchema,
  items: z.array(libraryItemSchema).default([]),
});
export type UserLibrary = z.infer<typeof userLibrarySchema>;
export const libraryItemResultSchema = z.looseObject({ item: libraryItemSchema });
export const librarySettingsResultSchema = z.looseObject({ settings: librarySettingsSchema });

/* ═════════════ D. Ảnh tham khảo (#29–#31) ═════════════ */

export const refUsageSchema = z.looseObject({ kind: z.string(), id: z.string() });

export const refItemSchema = z.looseObject({
  name: z.string(),
  bytes: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  mtime: z.union([z.number(), z.string()]).optional(),
  usedBy: z.array(refUsageSchema).default([]),
});
export type RefItem = z.infer<typeof refItemSchema>;
export const refListSchema = z.looseObject({ items: z.array(refItemSchema).default([]) });

/** #30 — agent TỰ ĐẶT TÊN; client KHÔNG được gửi `path` (bài học G1). */
export const refUploadResultSchema = z.looseObject({
  name: z.string(),
  path: z.string().optional(),
  bytes: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
});
export const refKindSchema = z.enum(["character", "inspo", "brand"]);
export type RefKind = z.infer<typeof refKindSchema>;

/* ═════════════ E. Lượt chạy (#32–#40) ═════════════ */

export const runJobSchema = z.looseObject({
  job: z.string(),
  variant: z.string().optional(),
  sheet: z.string().optional(),
  /** `catch` để trạng thái lạ không giết panel — vẫn hiện được dòng lượt (§6.5-6). */
  status: jobStatusSchema.catch("never"),
  startedAt: z.string().nullish(),
  durationMs: z.number().nullish(),
  artifact: z.looseObject({
    path: z.string(),
    bytes: z.number().optional(),
    writtenAt: z.string().optional(),
    validation: z.looseObject({
      ok: z.boolean(),
      job: z.string().optional(),
      sheet: z.string().optional(),
      cells: z.array(z.looseObject({
        file: z.string(),
        cell: z.number().optional(),
        status: z.enum(["ok", "regenerate"]),
        reasons: z.array(z.string()).default([]),
      })).default([]),
    }).nullish(),
  }).nullish(),
  /** R20: ảnh được cứu từ thư mục tạm của codex → dòng lượt có nhãn `↩ đã cứu ảnh`. */
  recovered: z.boolean().default(false),
  diagnosis: diagnosisSchema.nullish(),
});
export type RunJob = z.infer<typeof runJobSchema>;

/** Kiểu `Run` (§6.2 E). `phase` 2 = cắt (chốt X9). */
export const runSchema = z.looseObject({
  id: z.string(),
  projectId: z.string().optional(),
  kind: runKindSchema.catch("gen"),
  status: runStatusSchema.catch("running"),
  startedAt: z.string().nullish(),
  finishedAt: z.string().nullish(),
  maxJobs: z.number().optional(),
  phase: z.looseObject({
    index: z.number().default(1),
    total: z.number().default(1),
    name: z.string().optional(),
  }).optional(),
  progress: z.looseObject({
    done: z.number().default(0),
    total: z.number().default(0),
    failed: z.number().default(0),
    etaSeconds: z.number().nullish(),
  }).default({ done: 0, total: 0, failed: 0 }),
  jobs: z.array(runJobSchema).default([]),
  /** con trỏ stream hiện tại — client giữ để nối lại bằng `?from=seq+1` (§6.3). */
  seq: z.number().default(0),
});
export type Run = z.infer<typeof runSchema>;

export const runListSchema = z.looseObject({ items: z.array(runSchema).default([]) });

/** #32 `POST /api/projects/:id/runs` — `jobs` là DANH TỪ đối chiếu contract (đóng E7). */
export const startRunInputSchema = z.object({
  kind: runKindSchema,
  jobs: z.array(z.string().regex(RE_JOB)).default([]),
  maxJobs: z.number().int().min(1).max(8).default(4),
  autoSliceAfterGen: z.boolean().default(true),
});
export type StartRunInput = z.infer<typeof startRunInputSchema>;

export const startRunResultSchema = z.looseObject({
  runId: z.string(),
  jobs: z.array(z.looseObject({ job: z.string(), status: z.string().optional() })).default([]),
  /** 3 số BẮT BUỘC của modal M1 (chốt X11): số lượt, ước lượng thời gian, cảnh báo quota. */
  estimate: z.looseObject({
    seconds: z.tuple([z.number(), z.number()]).optional(),
    quotaUnits: z.tuple([z.number(), z.number()]).optional(),
  }).optional(),
});
export type StartRunResult = z.infer<typeof startRunResultSchema>;

/** #36 `POST /api/runs/:runId/cancel` (đóng D6). */
export const cancelRunResultSchema = z.looseObject({
  cancelled: z.boolean().default(true),
  killed: z.array(z.string()).default([]),
  kept: z.number().default(0),
});

/** #38 `GET …/jobs/:job/prompt` (đóng §3.3 "prompt đã dùng"). */
export const jobPromptSchema = z.looseObject({
  prompt: z.string().default(""),
  attachments: z.array(z.string()).default([]),
});

/** #39 `GET …/raw/:job/history` — giữ 3 đời (đóng B7, R9). */
export const rawHistoryItemSchema = z.looseObject({
  id: z.string(),
  at: z.string().nullish(),
  bytes: z.number().optional(),
  current: z.boolean().default(false),
});
export const rawHistorySchema = z.looseObject({ items: z.array(rawHistoryItemSchema).default([]) });

/** `details` của 409 RUN_CONFLICT — toast phải có nút [Xem lượt đang chạy] (đóng E5). */
export const runConflictDetailsSchema = z.looseObject({
  runId: z.string(),
  kind: z.string().optional(),
  startedAt: z.string().nullish(),
  progress: z.looseObject({
    done: z.number().default(0),
    total: z.number().default(0),
  }).optional(),
});
export type RunConflictDetails = z.infer<typeof runConflictDetailsSchema>;

/* ═════════════ F. Đọc file sản phẩm (#41–#42) ═════════════ */

export const kitFileSchema = z.looseObject({
  file: z.string(),
  path: z.string(),
  w: z.number().optional(),
  h: z.number().optional(),
  bytes: z.number().optional(),
  sheet: z.string().optional(),
  cellIndex: z.number().optional(),
  /** `empty:true` ⇒ dải cảnh báo "N file trống" + [Xem sheet gốc] (S5). */
  empty: z.boolean().default(false),
});
export type KitFile = z.infer<typeof kitFileSchema>;

export const kitSchema = z.looseObject({
  variant: z.string().optional(),
  cutAt: z.string().nullish(),
  files: z.array(kitFileSchema).default([]),
  sheets: z.record(z.string(), z.looseObject({
    mode: z.string().optional(),
    cut: z.number().optional(),
    blobs: z.number().optional(),
  })).default({}),
});
export type Kit = z.infer<typeof kitSchema>;

/* ═════════════ §6.3 Stream NDJSON (#35) ═════════════ */

/**
 * 10 loại event của §6.3. Dùng discriminated union để `switch (ev.type)` được
 * kiểm kiểu đầy đủ. Event lạ (agent mới) rơi vào `streamUnknownSchema` — KHÔNG
 * làm vỡ stream, đúng §6.5-6.
 */
const evBase = { seq: z.number(), t: z.string().optional() };

export const streamEventSchema = z.union([
  z.looseObject({ ...evBase, type: z.literal("run.started"), total: z.number().optional(), maxJobs: z.number().optional() }),
  z.looseObject({ ...evBase, type: z.literal("job.started"), job: z.string() }),
  z.looseObject({
    ...evBase, type: z.literal("job.log"), job: z.string().optional(),
    level: z.enum(["debug", "info", "warn", "error"]).catch("info"),
    /** ĐÃ được agent redact (arch §4.3-6) — client không redact lại, chỉ hiện. */
    line: z.string().default(""),
  }),
  z.looseObject({
    ...evBase, type: z.literal("job.done"), job: z.string(),
    status: jobStatusSchema.catch("failed"),
    durationMs: z.number().optional(), bytes: z.number().optional(),
    diagnosis: diagnosisSchema.nullish(),
  }),
  z.looseObject({
    ...evBase, type: z.literal("phase.changed"),
    phase: z.looseObject({ index: z.number(), total: z.number(), name: z.string().optional() }),
  }),
  z.looseObject({
    ...evBase, type: z.literal("progress"),
    done: z.number().default(0), total: z.number().default(0),
    failed: z.number().default(0), etaSeconds: z.number().nullish(),
  }),
  z.looseObject({
    ...evBase, type: z.literal("workspace.changed"),
    reason: z.string().optional(), projectId: z.string().optional(),
  }),
  z.looseObject({
    ...evBase, type: z.literal("run.finished"),
    status: runStatusSchema.catch("done-with-errors"),
    ok: z.number().optional(), failed: z.number().optional(), durationMs: z.number().optional(),
  }),
  z.looseObject({ ...evBase, type: z.literal("heartbeat") }),
  /** nhánh cuối: event chưa biết — vẫn parse được `seq` để không mất con trỏ stream. */
  z.looseObject({ ...evBase, type: z.string() }),
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;

export const STREAM_EVENT_TYPES = [
  "run.started", "job.started", "job.log", "job.done",
  "phase.changed", "progress", "workspace.changed", "run.finished", "heartbeat",
] as const;

/* ═════════════ Tiện ích kiểu ═════════════ */

/** Id project hợp lệ — dùng để chặn sớm trước khi ghép URL. */
export function isProjectId(v: unknown): v is string {
  return typeof v === "string" && RE_PROJECT_ID.test(v);
}
export function isRunId(v: unknown): v is string {
  return typeof v === "string" && RE_RUN_ID.test(v);
}
