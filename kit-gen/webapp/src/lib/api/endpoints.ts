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
  AgentError, confirmHeader, etagOf, fileUrl, httpDelete, httpGet, httpPatch, httpPost,
  httpPut, httpUpload, currentBase, streamRun, thumbUrl,
} from "./client";
import { LIMITS } from "./constants";
import {
  activateWorkspaceSchema, cancelRunResultSchema, cleanResultSchema, contractResponseSchema,
  createProjectResultSchema, deleteProjectResultSchema, doctorSchema, duplicateResultSchema,
  elementLibSchema, historyListSchema, importPreviewSchema, jobPromptSchema, kitSchema,
  projectDetailSchema, projectListSchema, projectSchema, rawHistorySchema, refListSchema,
  refUploadResultSchema, restoreContractResultSchema, runListSchema, runSchema,
  saveContractResultSchema, startRunResultSchema, trashListSchema, uploadResultSchema,
  validationSchema, workspaceListSchema,
  type CleanTarget, type CreateProjectInput, type DuplicateInput,
  type PatchProjectInput, type RefKind, type StartRunInput,
} from "../types/api";
import { normalizeContract, type Contract } from "../types/contract";
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

export const systemApi = {
  /** #2 — CẤM poll (chạy `codex debug prompt-input`, ~1s/lần). Cache 60s ở tầng hook. */
  async doctor(opts: { refresh?: boolean } = {}) {
    const data = await httpGet(`/api/doctor${opts.refresh ? "?refresh=1" : ""}`);
    return parse(doctorSchema, data, "doctor");
  },
  /** #3 */
  async workspaces() {
    return parse(workspaceListSchema, await httpGet("/api/workspaces"), "workspaces");
  },
  /** #4 — web gửi **id đục**, KHÔNG BAO GIỜ gửi path (chốt X1). */
  async activateWorkspace(workspaceId: string) {
    return parse(activateWorkspaceSchema, await httpPost("/api/workspace/activate", { workspaceId }), "workspace/activate");
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
  /** #14 — xoá VĨNH VIỄN: cần mã 4 số in ở terminal, dùng 1 lần, KHÔNG persist. */
  async purge(trashId: string, code: string) {
    await httpDelete(`/api/trash/${pid(trashId)}?purge=1`, { headers: confirmHeader(code) });
    return { ok: true };
  },
  /** #15 — yêu cầu agent in mã 4 số ra terminal. */
  async requestCode(trashId: string) {
    return (await httpPost(`/api/trash/${pid(trashId)}/code`)) as { expiresInMs?: number };
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
  refs: refsApi,
  runs: runsApi,
  files: filesApi,
};
export default api;
