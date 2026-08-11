/**
 * features/docs/lib/docs-repo.ts — HỢP ĐỒNG `DocsRepo` + bộ chọn bản hiện thực.
 *
 * ⚠️ ĐÂY LÀ CHỖ MOCK DUY NHẤT CỦA ĐỢT FE-1 (FE-PLAN §4). Mọi truy cập file con của
 * FE-2 (sub-file) và FE-3 (canvas) PHẢI đi qua interface này — không đọc/ghi lưu trữ rải rác.
 * Khi agent có `#43–#49` trên namespace `/docs` (UI-SPEC-V2 §8.2 [REV]) thì **đổi adapter**
 * (`http`), KHÔNG đổi component. Chữ ký hàm dưới đây được nắn theo đúng 7 endpoint đó.
 *
 * BẢN ĐỒ hàm ⇄ endpoint tương lai:
 *   list      → #43 GET    /api/projects/:id/docs
 *   create    → #44 POST   /api/projects/:id/docs
 *   rename    → #45 PATCH  /api/projects/:id/docs/:docId   {name}
 *   setColor  → #45 PATCH  …                                {color}
 *   setView   → #45 PATCH  …                                {view}
 *   duplicate → #44 POST   …                                {fromFileId}
 *   remove    → #46 DELETE …                (soft, thùng rác 30 ngày)
 *   restore   → #47 POST   …/restore        (đường lùi của "Hoàn tác 10s")
 *   load      → #48 GET    …/canvas         (trả kèm `version` = ETag)
 *   save      → #49 PUT    …/canvas         (`expectedVersion` = If-Match)
 */
import { localDocsRepo } from "./docs-repo-local";
import { httpDocsRepo } from "./docs-repo-http";
import type { CanvasDoc, Doc, DocColor, DocKind, DocView } from "./types";

export interface CreateDocInput {
  name: string;
  kind: DocKind;
  view?: DocView;
  /** nhân bản từ file này (§4.4): sao chép node/bộ lọc, KHÔNG sao chép contract/ảnh. */
  fromDocId?: string;
}

export interface LoadedCanvas {
  canvas: CanvasDoc;
  /** = `ETag` của #48. Truyền lại ở `save` để chống ghi đè (If-Match). */
  version: number;
}

export interface SaveResult {
  version: number;
  /** kích thước đã ghi, để UI cảnh báo trước ngưỡng `413 TOO_LARGE` của #49. */
  bytes: number;
}

export interface DocsRepo {
  /** `local` = nháp trên máy (hiện badge «bản nháp cục bộ»); `http` = đã có backend. */
  readonly kind: "local" | "http";
  /** Chỗ lưu có dùng được không (IndexedDB bị chặn ⇒ false ⇒ UI phải nói rõ, không im lặng). */
  available(): Promise<boolean>;

  list(projectId: string, opts?: { includeTrashed?: boolean }): Promise<Doc[]>;
  create(projectId: string, input: CreateDocInput): Promise<Doc>;
  rename(projectId: string, docId: string, name: string): Promise<Doc>;
  setColor(projectId: string, docId: string, color: DocColor): Promise<Doc>;
  setView(projectId: string, docId: string, view: DocView): Promise<Doc>;
  duplicate(projectId: string, docId: string): Promise<Doc>;
  /** Xoá MỀM: vào thùng rác (§4.4). KHÔNG bao giờ đụng sheet/ảnh/kit của project. */
  remove(projectId: string, docId: string): Promise<{ trashedAt: string }>;
  restore(projectId: string, docId: string): Promise<Doc>;
  /** Dọn thùng rác quá hạn 30 ngày. Trả về số bản ghi đã xoá hẳn. */
  purgeExpired(projectId: string, now?: Date): Promise<number>;

  load(projectId: string, docId: string): Promise<LoadedCanvas>;
  save(
    projectId: string,
    docId: string,
    canvas: CanvasDoc,
    expectedVersion: number,
  ): Promise<SaveResult>;
}

/* ═════════ Bộ chọn ═════════ */

export type DocsBackend = "local" | "http";

/**
 * Cờ chọn adapter. Mặc định `local` vì backend chưa có; đổi được lúc chạy để test
 * và để bật dần khi agent lên, KHÔNG cần build lại.
 */
let backend: DocsBackend = "http";

export function setDocsBackend(next: DocsBackend): void {
  backend = next;
}
export function getDocsBackend(): DocsBackend {
  return backend;
}

export function docsRepo(): DocsRepo {
  return backend === "http" ? httpDocsRepo : localDocsRepo;
}

/**
 * Có phải đang chạy trên chỗ lưu tạm không ⇒ UI PHẢI hiện badge «bản nháp cục bộ»
 * (FE-PLAN §3-C1 mục Mock: *"người dùng phải biết mình đang mock"*, Q3).
 */
export function isLocalDraftBackend(): boolean {
  return docsRepo().kind === "local";
}

export { httpDocsRepo } from "./docs-repo-http";
