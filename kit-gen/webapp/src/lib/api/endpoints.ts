/**
 * webapp/src/lib/api/endpoints.ts — 42 endpoint của §6.2 bọc thành hàm có tên, mỗi hàm
 * PARSE response bằng zod trước khi trả về.
 *
 * Vì sao parse ở đây chứ không ở hook: hook TanStack Query chỉ nên lo cache. Nếu để
 * component nhận `unknown` rồi tự tin đó là `Project`, ta quay lại đúng cái bẫy của v1
 * (UI vỡ vì field thiếu). Parse ở đây ⇒ mọi hook trả về type đã bảo đảm.
 *
 * Ràng buộc §6.5 được ép TẠI ĐÂY, không phải nhắc nhở trong tài liệu:
 *   · #23 PUT contract LUÔN kèm `If-Match` — thiếu version là ném lỗi client, không fallback
 *   · #30 ref upload là multipart, agent tự đặt tên, client KHÔNG gửi `path`
 *   · #41 ảnh lưới LUÔN `?w=256`
 *   · #2 doctor KHÔNG được poll (chỉ gọi theo hành động) — enforce ở tầng hook (staleTime 60s)
 */
import {
  AgentError, etagOf, fileUrl, httpDelete, httpGet, httpPatch, httpPost,
  httpPut, httpUpload, currentBase, streamRun, thumbUrl,
} from "./client";
import { LIMITS } from "./constants";
import {
  activateWorkspaceSchema, cancelRunResultSchema, cleanResultSchema, contractResponseSchema,
  coverResponseSchema,
  createProjectResultSchema, deleteProjectResultSchema, doctorSchema, duplicateResultSchema,
  elementLibSchema, historyListSchema, importPreviewSchema, jobPromptSchema, kitSchema,
  projectDetailSchema, projectListSchema, projectSchema, rawHistorySchema, refListSchema,
  refUploadResultSchema, restoreContractResultSchema, runListSchema, runSchema,
  saveContractResultSchema, startRunResultSchema, trashListSchema, uploadResultSchema, usageSchema,
  validationSchema, workspaceListSchema, workflowDraftSchema, userLibrarySchema, libraryItemResultSchema,
  librarySettingsResultSchema, brandProfileResultSchema, poseTemplateResultSchema,
  type CleanTarget, type CreateProjectInput, type DuplicateInput,
  type PatchProjectInput, type RefKind, type StartRunInput,
  type LibrarySettings, type ImageGenProfile,
} from "../types/api";
import { normalizeContract, type Contract } from "../types/contract";
/* Hình dạng của tuỳ chọn-trên-đĩa được LẤY RA TỪ schema localStorage (xem file đó để biết
   vì sao), nên nó sống ở `lib/store` chứ không ở `lib/types/api.ts` như các schema khác. */
import { diskSettingsResponseSchema, type DiskSettingsPatch } from "../store/disk-settings";
import type { z } from "zod";

const pid = (id: string | number) => encodeURIComponent(String(id));

function qs(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = usp.toString();
  return s === "" ? "" : `?${s}`;
}

/**
 * Parse response. Lỗi schema ⇒ `AGENT_INTERNAL` (bảng §3.9 có copy) chứ KHÔNG để
 * exception của zod nổi lên component — message của zod là chuỗi kỹ thuật, và §3.9
 * cấm hiện chuỗi kỹ thuật ra thân UI.
 */
function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new AgentError({
    code: "AGENT_INTERNAL",
    message: `Dữ liệu ${what} không đúng schema: ${JSON.stringify(r.error.issues.slice(0, 5))}`,
    transport: "client",
    details: { what, issues: r.error.issues.slice(0, 20) },
  });
}

/* ═════════ A. Hệ thống & môi trường (#1–#6) ═════════ */

/** Kết quả `GET /api/update`. `ok:false` ⇒ CHƯA kiểm tra được, KHÁC với "đang mới nhất". */
export interface UpdateCheck {
  ok: boolean;
  currentVersion: string;
  latestVersion: string | null;
  tag: string | null;
  available: boolean;
  /** enum, chỉ có khi `ok:false` */
  reason?: "OFFLINE" | "MANIFEST_UNREADABLE";
  /** lệnh cập nhật thủ công, dạng nhãn rút gọn (~/…) */
  updateCommand: string;
  /**
   * Version nằm TRÊN ĐĨA (`~/.kitgen/current`) — có thể MỚI HƠN `currentVersion`, tức
   * version của tiến trình đang trả lời. Hai số này chỉ lệch trong đúng một ca: cài xong
   * mà bước khởi động lại không xảy ra (BACKLOG #20, đã xảy ra thật 14/08).
   */
  installedVersion?: string | null;
  /** `true` ⇒ đừng mời cập nhật lại, hãy bảo user chạy `restartCommand`. */
  restartRequired?: boolean;
  /** lệnh khởi động lại thủ công, dạng nhãn rút gọn (~/…) */
  restartCommand?: string;
  checkedAt: string;
}

export const systemApi = {
  /**
   * Kiểm tra bản mới. Agent fetch `release.json` HỘ trình duyệt (raw.githubusercontent.com
   * không cho origin loopback gọi thẳng) và không bao giờ 500 vì mất mạng — khi đó
   * `ok:false` + `reason`, `latestVersion` null.
   */
  async checkUpdate() {
    return await httpGet("/api/update") as UpdateCheck;
  },
  async installUpdate() {
    return await httpPost("/api/update", {}) as {
      ok: boolean; previousVersion?: string; restarting?: boolean;
      /** nhãn rút gọn của nhật ký lượt cài (~/.kitgen/update.log) — chỗ duy nhất còn lại
       *  để đọc khi installer chết giữa chừng. */
      logLabel?: string;
    };
  },
  /**
   * Chọn hồ sơ Codex dùng để tạo ảnh. Agent GHI BỀN vào `<workspace>/.kitgen/config.json`
   * rồi tự bỏ cache doctor ⇒ lần đọc doctor kế tiếp là trạng thái của hồ sơ MỚI.
   * Web chỉ gửi enum, không bao giờ gửi/nhận path tuyệt đối hay bất cứ gì của phiên đăng nhập.
   */
  async setImageProfile(mode: "default" | "separate") {
    return await httpPatch("/api/image-profile", { mode }) as {
      ok: boolean; mode: "default" | "separate"; profile?: ImageGenProfile; codexHomeLabel: string;
    };
  },
  async revealWorkspace() {
    return await httpPost("/api/workspace/reveal", {}) as { ok: boolean };
  },
  /** #2 — CẤM poll (chạy `codex debug prompt-input`, ~1s/lần). Cache 60s ở tầng hook. */
  async doctor(opts: { refresh?: boolean } = {}) {
    const data = await httpGet(`/api/doctor${opts.refresh ? "?refresh=1" : ""}`);
    return parse(doctorSchema, data, "doctor");
  },
  /**
   * Quota còn lại của tài khoản Codex. RẺ (chỉ đọc file trạng thái local, không spawn
   * codex, không gọi mạng, không tốn quota) — nhưng số liệu CŨ BẰNG lượt chạy cuối,
   * nên hook cache dài và UI phải nói `observedAt` ra.
   */
  async usage(opts: { refresh?: boolean } = {}) {
    return parse(usageSchema, await httpGet(`/api/usage${opts.refresh ? "?refresh=1" : ""}`), "usage");
  },
  /** #3 */
  async workspaces() {
    return parse(workspaceListSchema, await httpGet("/api/workspaces"), "workspaces");
  },
  /** #4 — web gửi **id đục**, KHÔNG BAO GIỜ gửi path (chốt X1). */
  async activateWorkspace(workspaceId: string) {
    return parse(activateWorkspaceSchema, await httpPost("/api/workspace/activate", { workspaceId }), "workspace/activate");
  },

  /**
   * Tuỳ chọn người dùng ĐỌC TỪ ĐĨA (`<workspace>/.kitgen/config.json`). Đây là nguồn sự
   * thật; `localStorage` chỉ còn là bộ nhớ đệm khởi động — xem `lib/store/disk-settings.ts`.
   * Chỉ enum · boolean · số · mã do app sinh đi qua đây; không path, không chữ tự do.
   */
  async settings() {
    return parse(diskSettingsResponseSchema, await httpGet("/api/settings"), "tuỳ chọn người dùng");
  },
  /** Vá MỘT PHẦN (chỉ field vừa đổi) và nhận lại TOÀN BỘ bảng sau khi agent chuẩn hoá. */
  async patchSettings(patch: DiskSettingsPatch) {
    return parse(diskSettingsResponseSchema, await httpPatch("/api/settings", patch), "tuỳ chọn vừa lưu");
  },
};

/* ═════════ B. Project CRUD (#7–#21) ═════════ */

export interface ProjectListParams {
  q?: string;
  tag?: string;
  sort?: string;
  include?: string;
  /** `If-None-Match` — 304 ⇒ dùng lại cache, tiết kiệm cả một lần quét đĩa của agent. */
  etag?: string | null;
}

export const projectsApi = {
  /** #7 — trả kèm `etag` để lần sau gửi `If-None-Match`. */
  async list(params: ProjectListParams = {}) {
    const { q, tag, sort, include = "stats", etag } = params;
    const data = await httpGet(`/api/projects${qs({ q, tag, sort, include })}`, {
      ...(etag ? { headers: { "If-None-Match": etag } } : {}),
    });
    if ((data as { notModified?: boolean }).notModified) {
      return { notModified: true as const, etag: etagOf(data) };
    }
    return { ...parse(projectListSchema, data, "danh sách project"), etag: etagOf(data), notModified: false as const };
  },
  /** #9 */
  async get(id: string) {
    const data = await httpGet(`/api/projects/${pid(id)}`);
    return parse(projectDetailSchema, data, "project").project;
  },
  /** #8 */
  async create(input: CreateProjectInput) {
    return parse(createProjectResultSchema, await httpPost("/api/projects", input), "tạo project");
  },
  /** #10 — patch một phần. `projectId`/thư mục KHÔNG đổi (§4.2). */
  async patch(id: string, body: PatchProjectInput) {
    const data = await httpPatch(`/api/projects/${pid(id)}`, body);
    // Agent trả `{project}`; một số bản trả thẳng project — nhận cả hai để không vỡ.
    const wrapped = (data as { project?: unknown }).project;
    return parse(projectSchema, wrapped ?? data, "project sau khi sửa");
  },
  /** #11 — xoá MỀM vào thùng rác 30 ngày + toast Hoàn tác 10s (chốt X6). */
  async remove(id: string) {
    return parse(deleteProjectResultSchema, await httpDelete(`/api/projects/${pid(id)}`), "xoá project");
  },
  /** #16 — use case CHÍNH của tool (§4.3). */
  async duplicate(id: string, input: DuplicateInput) {
    return parse(duplicateResultSchema, await httpPost(`/api/projects/${pid(id)}/duplicate`, input), "nhân bản");
  },
  /** #17 */
  async clean(id: string, targets: CleanTarget[]) {
    return parse(cleanResultSchema, await httpPost(`/api/projects/${pid(id)}/clean`, { targets }), "dọn cache");
  },
  /**
   * #18 — URL tải zip. Trả URL cho thẻ `<a download>` chứ không fetch: file có thể
   * hàng trăm MB, nạp vào RAM là vô nghĩa và mất progress của trình duyệt.
   */
  exportUrl(id: string, include: string[] = ["contract", "refs", "raw", "kits"], variant?: string | string[]) {
    return `${currentBase().replace(/\/+$/, "")}/api/projects/${pid(id)}/export.zip${qs({ include, variant })}`;
  },
  /** #21 */
  async reveal(id: string, path?: string) {
    await httpPost(`/api/projects/${pid(id)}/reveal`, path ? { path } : {});
    return { ok: true };
  },
  /**
   * #43 — trạng thái ảnh bìa tự sinh (none | running | ok | failed).
   * BYTE của ảnh KHÔNG đi qua đây: ảnh đọc bằng `#41 files/cover/cover.png?w=256`
   * như mọi ảnh khác của project (agent/routes/cover.mjs nói rõ vì sao).
   */
  async cover(id: string) {
    return parse(coverResponseSchema, await httpGet(`/api/projects/${pid(id)}/cover`), "ảnh bìa").cover;
  },
  /** #44 — vẽ lại ảnh bìa. 202: agent chạy nền, KHÔNG phải một lượt chạy (không chiếm suất run). */
  async regenerateCover(id: string) {
    return parse(coverResponseSchema, await httpPost(`/api/projects/${pid(id)}/cover`, {}), "ảnh bìa").cover;
  },
  async workflowDraft(id: string) {
    return parse(workflowDraftSchema, await httpGet(`/api/projects/${pid(id)}/workflow-draft`), "bản nháp wizard");
  },
  async saveWorkflowDraft(id: string, input: { completed: boolean; draft: Record<string, unknown> }) {
    return parse(workflowDraftSchema, await httpPut(`/api/projects/${pid(id)}/workflow-draft`, input), "bản nháp wizard vừa lưu");
  },
};

export const trashApi = {
  /** #12 */
  async list() {
    return parse(trashListSchema, await httpGet("/api/trash"), "thùng rác");
  },
  /** #13 */
  async restore(trashId: string) {
    const data = await httpPost(`/api/trash/${pid(trashId)}/restore`);
    const wrapped = (data as { project?: unknown }).project;
    return parse(projectSchema, wrapped ?? data, "project phục hồi");
  },
  /** #14 — xoá vĩnh viễn: xác nhận bằng cụm từ và đối chiếu đúng project trong thùng rác. */
  async purge(trashId: string, projectId: string, confirm: string) {
    await httpDelete(`/api/trash/${pid(trashId)}?purge=1`, { headers: { "X-KitGen-Confirm": confirm, "X-KitGen-Project": projectId } });
    return { ok: true };
  },
};

export const uploadsApi = {
  /** #19 — kiểm cỡ TRƯỚC khi gửi để không tốn công upload rồi ăn 413. */
  async create(file: File) {
    if (typeof file?.size === "number" && file.size > LIMITS.uploadBytes) {
      throw new AgentError({
        code: "TOO_LARGE", status: 413, transport: "client",
        message: `File ${file.size} byte vượt hạn mức ${LIMITS.uploadBytes}`,
        details: { maxBytes: LIMITS.uploadBytes, bytes: file.size },
      });
    }
    const fd = new FormData();
    fd.append("file", file);
    return parse(uploadResultSchema, await httpUpload("/api/uploads", fd), "upload");
  },
};

export const importApi = {
  /** #20 — LUÔN preview trước; cấm mọi đường import "im lặng" (chốt X12). */
  async preview(payload: { source: "zip" | "stylesJson" | "folder"; uploadId?: string; path?: string }) {
    return parse(importPreviewSchema, await httpPost("/api/import/preview", payload), "đối chiếu nhập").report;
  },
};

/* ═════════ C. Bản thiết kế (#22–#28) ═════════ */

export const contractApi = {
  /** #22 — trả kèm `version` để #23 đặt `If-Match`. */
  async get(id: string) {
    const data = await httpGet(`/api/projects/${pid(id)}/contract`);
    const out = parse(contractResponseSchema, data, "bản thiết kế");
    // ETag của agent là `"37"` = version. Ưu tiên body, ETag chỉ là đường lùi.
    const et = etagOf(data);
    if (out.version === 0 && et) {
      const n = Number(et.replace(/"/g, ""));
      if (Number.isFinite(n)) out.version = n;
    }
    return out;
  },
  /**
   * #23 — `If-Match` BẮT BUỘC (§6.5-4: "thiếu → coi là bug, không phải fallback").
   * `normalizeContract` đưa `styles[]` (tên cũ trên đĩa) về `variants[]` trước khi ghi.
   */
  async save(id: string, version: number, contract: Contract) {
    if (!Number.isFinite(Number(version))) {
      throw new AgentError({
        code: "IF_MATCH_REQUIRED", status: 412, transport: "client",
        message: "PUT contract thiếu version để đặt If-Match",
      });
    }
    const data = await httpPut(
      `/api/projects/${pid(id)}/contract`,
      { contract: normalizeContract(contract) },
      { headers: { "If-Match": String(version) } },
    );
    return parse(saveContractResultSchema, data, "lưu bản thiết kế");
  },
  /** #24 — 50 bản (thay `.bak` 1 tầng, đóng B4). */
  async history(id: string, limit = 50) {
    return parse(historyListSchema, await httpGet(`/api/projects/${pid(id)}/contract/history${qs({ limit })}`), "lịch sử");
  },
  /** #25 */
  async snapshot(id: string, snapshot: string) {
    const data = await httpGet(`/api/projects/${pid(id)}/contract/history/${pid(snapshot)}`);
    return parse(contractResponseSchema, data, "bản lịch sử");
  },
  /** #26 — tạo bản MỚI, không ghi đè lịch sử. */
  async restore(id: string, snapshot: string) {
    return parse(restoreContractResultSchema, await httpPost(`/api/projects/${pid(id)}/contract/restore`, { snapshot }), "khôi phục");
  },
  /** #27 — dry-run, không ghi (đóng K5). */
  async validate(id: string, contract: Contract) {
    const data = await httpPost(`/api/projects/${pid(id)}/contract/validate`, { contract: normalizeContract(contract) });
    return parse(validationSchema, data, "kiểm bản thiết kế");
  },
};

/** #28 — catalogue CHỈ ĐỌC; thêm element = COPY vào contract của project (chốt X8). */
export const elementLibApi = {
  async get() {
    return parse(elementLibSchema, await httpGet("/api/element-lib"), "thư viện element");
  },
};

export const libraryApi = {
  async get() {
    return parse(userLibrarySchema, await httpGet("/api/library"), "kho dùng chung");
  },
  async addBrand(input: { name: string; description?: string; colors?: string[]; assetIds?: string[] }) {
    return parse(brandProfileResultSchema, await httpPost("/api/library/brands", input), "thương hiệu vừa tạo").brand;
  },
  async patchBrand(id: string, input: { name?: string; description?: string; colors?: string[]; assetIds?: string[] }) {
    return parse(brandProfileResultSchema, await httpPatch(`/api/library/brands/${pid(id)}`, input), "thương hiệu vừa sửa").brand;
  },
  async removeBrand(id: string) { await httpDelete(`/api/library/brands/${pid(id)}`); return { ok: true }; },
  async addPose(input: { name: string; description?: string; sourcePose: string; enabled?: boolean }) {
    return parse(poseTemplateResultSchema, await httpPost("/api/library/poses", input), "khung pose vừa tạo").pose;
  },
  async patchPose(id: string, input: { name?: string; description?: string; sourcePose?: string; enabled?: boolean }) {
    return parse(poseTemplateResultSchema, await httpPatch(`/api/library/poses/${pid(id)}`, input), "khung pose vừa sửa").pose;
  },
  async removePose(id: string) { await httpDelete(`/api/library/poses/${pid(id)}`); return { ok: true }; },
  async add(input: { file: File; kind: "ui" | "mascot" | "reference"; group: string; name: string; description?: string; tags?: string[]; poses?: string[]; cell?: string; skel?: Record<string, unknown> }) {
    if (input.file.size > LIMITS.refBytes) {
      throw new AgentError({ code: "TOO_LARGE", status: 413, transport: "client", message: "Ảnh vượt quá 20 MB" });
    }
    const fd = new FormData();
    fd.append("file", input.file);
    fd.append("kind", input.kind);
    fd.append("group", input.group);
    fd.append("name", input.name);
    if (input.description) fd.append("description", input.description);
    if (input.tags) fd.append("tags", JSON.stringify(input.tags));
    if (input.poses) fd.append("poses", JSON.stringify(input.poses));
    if (input.cell) fd.append("cell", input.cell);
    if (input.skel) fd.append("skel", JSON.stringify(input.skel));
    return parse(libraryItemResultSchema, await httpUpload("/api/library/items", fd), "ảnh vừa thêm").item;
  },
  async patch(id: string, input: { name?: string; description?: string; tags?: string[]; group?: string; poses?: string[]; cell?: string; skel?: Record<string, unknown> }) {
    return parse(libraryItemResultSchema, await httpPatch(`/api/library/items/${pid(id)}`, input), "ảnh vừa sửa").item;
  },
  async remove(id: string) {
    await httpDelete(`/api/library/items/${pid(id)}`);
    return { ok: true };
  },
  async patchSettings(input: Partial<LibrarySettings>) {
    return parse(librarySettingsResultSchema, await httpPatch("/api/library/settings", input), "thiết lập kho").settings;
  },
  async blob(id: string) {
    const response = await httpGet<Response>(`/api/library/items/${pid(id)}/file`, { raw: true });
    return response.blob();
  },
};

/* ═════════ D. Ảnh tham khảo (#29–#31) ═════════ */

export const refsApi = {
  /** #29 */
  async list(id: string) {
    return parse(refListSchema, await httpGet(`/api/projects/${pid(id)}/refs`), "ảnh tham khảo");
  },
  /**
   * #30 — multipart, agent TỰ ĐẶT TÊN. Client KHÔNG được gửi `path`: bài học G1
   * (v1 nhận `path` từ client và bị `refs/../gen.sh` xuyên qua).
   */
  async add(id: string, file: File, kind: RefKind, hintName?: string) {
    if (typeof file?.size === "number" && file.size > LIMITS.refBytes) {
      throw new AgentError({
        code: "TOO_LARGE", status: 413, transport: "client",
        message: `Ảnh ${file.size} byte vượt hạn mức ${LIMITS.refBytes}`,
        details: { maxBytes: LIMITS.refBytes, bytes: file.size },
      });
    }
    if (typeof file?.type === "string" && file.type !== "" && !LIMITS.refTypes.includes(file.type as never)) {
      throw new AgentError({
        code: "BAD_TYPE", status: 415, transport: "client",
        message: `Kiểu ${file.type} không nhận`,
        details: { accept: LIMITS.refTypes },
      });
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (hintName) fd.append("hintName", hintName);
    return parse(refUploadResultSchema, await httpUpload(`/api/projects/${pid(id)}/refs`, fd), "thêm ảnh");
  },
  async blob(id: string, name: string) {
    const response = await httpGet<Response>(`/api/projects/${pid(id)}/refs/${pid(name)}/file`, { raw: true });
    return response.blob();
  },
  /** #31 — 409 REF_IN_USE kèm `usedBy` ⇒ UI hiện [Xem chỗ dùng] [Vẫn xoá] (V-08). */
  async remove(id: string, name: string, opts: { force?: boolean } = {}) {
    await httpDelete(`/api/projects/${pid(id)}/refs/${pid(name)}${opts.force ? "?force=1" : ""}`);
    return { ok: true };
  },
};

/* ═════════ E. Lượt chạy (#32–#40) ═════════ */

export const runsApi = {
  /** #32 — `jobs` là DANH TỪ đối chiếu contract, không phải substring filter (đóng E7). */
  async start(id: string, input: StartRunInput) {
    return parse(startRunResultSchema, await httpPost(`/api/projects/${pid(id)}/runs`, input), "bắt đầu lượt chạy");
  },
  /** #33 */
  async list(id: string, limit = 20) {
    return parse(runListSchema, await httpGet(`/api/projects/${pid(id)}/runs${qs({ limit })}`), "danh sách lượt chạy");
  },
  /** #34 — nguồn sự thật khi stream đứt (chế độ poll 2s, chốt X10). */
  async get(runId: string) {
    return parse(runSchema, await httpGet(`/api/runs/${pid(runId)}`), "lượt chạy");
  },
  /** #35 — stream NDJSON, KHÔNG timeout. */
  stream: streamRun,
  /** #36 (đóng D6). */
  async cancel(runId: string) {
    return parse(cancelRunResultSchema, await httpPost(`/api/runs/${pid(runId)}/cancel`), "dừng lượt chạy");
  },
  /** #37 — `text/plain`, ĐÃ redact phía agent (đóng D7). */
  async jobLog(runId: string, job: string, tail = 2000) {
    const res = await httpGet<Response>(`/api/runs/${pid(runId)}/jobs/${pid(job)}/log${qs({ tail })}`, { raw: true });
    return res.text();
  },
  /** #38 (đóng §3.3 "prompt đã dùng"). */
  async jobPrompt(runId: string, job: string) {
    return parse(jobPromptSchema, await httpGet(`/api/runs/${pid(runId)}/jobs/${pid(job)}/prompt`), "prompt");
  },
  /** #39 — giữ 3 đời (đóng B7, R9). */
  async rawHistory(id: string, job: string) {
    return parse(rawHistorySchema, await httpGet(`/api/projects/${pid(id)}/raw/${pid(job)}/history`), "lịch sử ảnh");
  },
  /** #40 */
  async rawRestore(id: string, job: string, historyId: string) {
    return (await httpPost(`/api/projects/${pid(id)}/raw/${pid(job)}/restore`, { historyId })) as {
      restored?: boolean;
      mtime?: string;
    };
  },
};

/* ═════════ F. Đọc file sản phẩm (#41–#42) ═════════ */

export const filesApi = {
  /** #41 — lưới LUÔN `?w=256` (§6.5-5, đóng H4). */
  thumbUrl,
  /** #41 — ảnh full CHỈ dùng trong lightbox. */
  fullUrl: (id: string, relPath: string) => fileUrl(id, relPath),
  /** #42 */
  async kit(id: string, variant?: string) {
    return parse(kitSchema, await httpGet(`/api/projects/${pid(id)}/kit${qs({ variant })}`), "thư viện kit");
  },
};

/** Toàn bộ bề mặt API — component KHÔNG import `client.ts` trực tiếp. */
export const api = {
  system: systemApi,
  projects: projectsApi,
  trash: trashApi,
  uploads: uploadsApi,
  import: importApi,
  contract: contractApi,
  elementLib: elementLibApi,
  library: libraryApi,
  refs: refsApi,
  runs: runsApi,
  files: filesApi,
};
export default api;
