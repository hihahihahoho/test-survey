/**
 * web/js/core/api.js — 42 endpoint của UX-SPEC §6.2 bọc thành hàm có tên.
 * Màn hình gọi api.projects.list() thay vì tự ghép path → không ai gõ sai URL,
 * và mọi ràng buộc §6.5 (If-Match bắt buộc, ?w=256, multipart cho ref) được ép ở đây.
 */

import { LIMITS } from './constants.js';
import * as agent from './agent.js';

const pid = (id) => encodeURIComponent(String(id));
const q = (params) => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = usp.toString();
  return s === '' ? '' : `?${s}`;
};

/* A. Hệ thống & môi trường (#1–#6) */
export const system = {
  health: (opts) => agent.health(opts),
  /** #2 — CẤM poll (tốn ~1s vì chạy codex debug). Chỉ gọi khi mở S6/setup/[Kiểm tra lại]/trước M1. */
  doctor: ({ refresh = false } = {}) => agent.get(`/api/doctor${refresh ? '?refresh=1' : ''}`),
  workspaces: () => agent.get('/api/workspaces'),
  /** #4 — web gửi id ĐỤC, không bao giờ gửi path (chốt X1). */
  activateWorkspace: (workspaceId) => agent.post('/api/workspace/activate', { workspaceId }),
  /**
   * Kiểm tra bản mới. Công cụ local đọc `release.json` HỘ trình duyệt — đó là cùng một
   * manifest mà installer dùng, và raw.githubusercontent.com không trả CORS cho origin
   * loopback nên trang này không thể tự gọi. Agent luôn trả 200; `ok:false` = chưa
   * kiểm tra được (mất mạng), KHÁC với `available:false` = đang dùng bản mới nhất.
   */
  checkUpdate: () => agent.get('/api/update'),
  /** Cài bản mới rồi khởi động lại công cụ local (202, agent tự restart sau ~1s). */
  installUpdate: () => agent.post('/api/update', {}),
};

/* B. Project CRUD (#7–#21) */
export const projects = {
  list: ({ q: query, tag, sort, include = 'stats', etag } = {}) => agent.get(
    `/api/projects${q({ q: query, tag, sort, include })}`,
    etag ? { headers: { 'If-None-Match': etag } } : {},
  ),
  get: (id) => agent.get(`/api/projects/${pid(id)}`),
  create: (payload) => agent.post('/api/projects', payload),
  update: (id, patchBody) => agent.patch(`/api/projects/${pid(id)}`, patchBody),
  /** Xoá mềm → thùng rác 30 ngày + toast Hoàn tác (chốt X6). */
  remove: (id) => agent.del(`/api/projects/${pid(id)}`),
  duplicate: (id, payload) => agent.post(`/api/projects/${pid(id)}/duplicate`, payload),
  clean: (id, targets) => agent.post(`/api/projects/${pid(id)}/clean`, { targets }),
  /** #18 — `variant` (id hoặc mảng id) lọc theo PHONG CÁCH; bỏ trống = mọi phong cách. */
  exportUrl: (id, include = ['contract', 'refs', 'raw', 'kits'], variant = null) =>
    `${agent.baseUrl().replace(/\/+$/, '')}/api/projects/${pid(id)}/export.zip${q({ include, variant })}`,
  reveal: (id, path) => agent.post(`/api/projects/${pid(id)}/reveal`, path ? { path } : {}),
};

export const trash = {
  list: () => agent.get('/api/trash'),
  restore: (trashId) => agent.post(`/api/trash/${pid(trashId)}/restore`),
  /** Xoá vĩnh viễn: cần mã 4 số in ở terminal, dùng 1 lần, KHÔNG persist (arch §3.4 lớp 8). */
  purge: (trashId, confirmCode) => agent.del(
    `/api/trash/${pid(trashId)}?purge=1`,
    { headers: agent.confirmHeader(confirmCode) },
  ),
  requestCode: (trashId) => agent.post(`/api/trash/${pid(trashId)}/code`),
};

export const uploads = {
  /** #19 — multipart. Client tự kiểm cỡ trước để không tốn công gửi rồi ăn 413. */
  create: (file) => {
    if (file && typeof file.size === 'number' && file.size > LIMITS.uploadBytes) {
      throw new agent.AgentError({
        code: 'TOO_LARGE', status: 413,
        message: `File ${file.size} byte vượt hạn mức ${LIMITS.uploadBytes}`,
        details: { maxBytes: LIMITS.uploadBytes, bytes: file.size },
      });
    }
    const fd = new FormData();
    fd.append('file', file);
    return agent.upload('/api/uploads', fd);
  },
};

export const importer = {
  /** #20 — LUÔN preview trước; cấm import "im lặng" (chốt X12). */
  preview: (payload) => agent.post('/api/import/preview', payload),
};

/* C. Bản thiết kế (#22–#28) */
export const contract = {
  get: (id) => agent.get(`/api/projects/${pid(id)}/contract`),
  /** #23 — If-Match BẮT BUỘC. Thiếu version ⇒ coi là bug, không fallback (§6.5-4). */
  save: (id, version, contractBody) => {
    if (!Number.isFinite(Number(version))) {
      throw new agent.AgentError({
        code: 'IF_MATCH_REQUIRED', status: 412,
        message: 'PUT contract thiếu version để đặt If-Match',
      });
    }
    return agent.put(
      `/api/projects/${pid(id)}/contract`,
      { contract: contractBody },
      { headers: { 'If-Match': String(version) } },
    );
  },
  history: (id, limit = 50) => agent.get(`/api/projects/${pid(id)}/contract/history${q({ limit })}`),
  snapshot: (id, snapshot) => agent.get(`/api/projects/${pid(id)}/contract/history/${pid(snapshot)}`),
  restore: (id, snapshot) => agent.post(`/api/projects/${pid(id)}/contract/restore`, { snapshot }),
  validate: (id, contractBody) => agent.post(`/api/projects/${pid(id)}/contract/validate`, { contract: contractBody }),
};

/** #28 — catalogue CHỈ ĐỌC; thêm element = copy vào contract của project (chốt X8). */
export const elementLib = { get: () => agent.get('/api/element-lib') };

/* D. Ảnh tham khảo (#29–#31) */
export const refs = {
  list: (id) => agent.get(`/api/projects/${pid(id)}/refs`),
  /** #30 — multipart; agent TỰ ĐẶT TÊN. Client KHÔNG được gửi path (bài học G1). */
  add: (id, file, kind, hintName) => {
    if (file && typeof file.size === 'number' && file.size > LIMITS.refBytes) {
      throw new agent.AgentError({
        code: 'TOO_LARGE', status: 413,
        message: `Ảnh ${file.size} byte vượt hạn mức ${LIMITS.refBytes}`,
        details: { maxBytes: LIMITS.refBytes, bytes: file.size },
      });
    }
    if (file && typeof file.type === 'string' && file.type !== '' && !LIMITS.refTypes.includes(file.type)) {
      throw new agent.AgentError({
        code: 'BAD_TYPE', status: 415,
        message: `Kiểu ${file.type} không nhận`,
        details: { accept: LIMITS.refTypes },
      });
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    if (hintName) fd.append('hintName', hintName);
    return agent.upload(`/api/projects/${pid(id)}/refs`, fd);
  },
  remove: (id, name, { force = false } = {}) =>
    agent.del(`/api/projects/${pid(id)}/refs/${pid(name)}${force ? '?force=1' : ''}`),
};

/* E. Lượt chạy (#32–#40) */
export const runs = {
  /** #32 — jobs là DANH TỪ đối chiếu contract, không phải substring filter (đóng E7). */
  start: (id, { kind, jobs, maxJobs = 4, autoSliceAfterGen = true }) =>
    agent.post(`/api/projects/${pid(id)}/runs`, { kind, jobs, maxJobs, autoSliceAfterGen }),
  list: (id, limit = 20) => agent.get(`/api/projects/${pid(id)}/runs${q({ limit })}`),
  get: (runId) => agent.get(`/api/runs/${pid(runId)}`),
  /** #35 — stream NDJSON, không timeout. Xem thêm ndjson.js. */
  stream: (runId, opts) => agent.streamRun(runId, opts),
  cancel: (runId) => agent.post(`/api/runs/${pid(runId)}/cancel`),
  jobLog: (runId, job, tail = 2000) =>
    agent.get(`/api/runs/${pid(runId)}/jobs/${pid(job)}/log${q({ tail })}`, { raw: true }),
  jobPrompt: (runId, job) => agent.get(`/api/runs/${pid(runId)}/jobs/${pid(job)}/prompt`),
  rawHistory: (id, job) => agent.get(`/api/projects/${pid(id)}/raw/${pid(job)}/history`),
  rawRestore: (id, job, historyId) =>
    agent.post(`/api/projects/${pid(id)}/raw/${pid(job)}/restore`, { historyId }),
};

/* F. Đọc file sản phẩm (#41–#42) */
export const files = {
  /** Lưới LUÔN w=256; ảnh full CHỈ trong lightbox (§6.5-5, đóng H4). */
  thumbUrl: (id, relPath) => agent.fileUrl(id, relPath, { w: LIMITS.thumbWidth }),
  fullUrl: (id, relPath) => agent.fileUrl(id, relPath),
  kit: (id, variant) => agent.get(`/api/projects/${pid(id)}/kit${q({ variant })}`),
};

export { AgentError } from './agent.js';
export default { system, projects, trash, uploads, importer, contract, elementLib, refs, runs, files };
