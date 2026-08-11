/**
 * features/canvas/lib/canvas-state.ts — TOÁN + QUYẾT ĐỊNH TRẠNG THÁI của khung canvas.
 *
 * THUẦN HÀM: không React, không DOM, không repo ⇒ chạy được ở vitest environment "node"
 * (config gốc của R0), không cần jsdom. Mọi thứ cần DOM nằm ở `components/**`.
 *
 * PHẠM VI FE-2 (FE2-PLAN §3-D1): đây là **khung xem trước**, KHÔNG phải canvas thật.
 * Không có node N1–N7, không chọn/kéo/thả/undo/đông cứng. File này vì thế chỉ biết
 * đúng ba việc: (a) đang ở trạng thái nào, (b) bbox nội dung để `⌘1` fit, (c) câu chữ
 * cho trạng thái lưu nháp.
 */
import type { Rect } from "@/lib/viewport";
import { isDocsRepoError, type CanvasDoc } from "@/features/docs/lib";

/**
 * Năm trạng thái + ca agent chưa chạy (UI-SPEC-V2 §2.5).
 * `agent chưa chạy` KHÔNG phải một phase: canvas nháp nằm trên máy nên nó vẫn mở được;
 * nó chỉ thêm một dải thông báo và khoá các nút cần agent. Đây đúng tinh thần §2.5
 * ("kéo thả vẫn chạy") và tránh lặp lỗi "khoá cả màn khi agent tắt".
 */
export type CanvasPhase = "loading" | "timeout" | "error" | "empty" | "ready";

export interface CanvasPhaseInput {
  isLoading: boolean;
  timedOut: boolean;
  isError: boolean;
  /** số node đã tải được; FE-2 luôn là 0 vì chưa có trình soạn node. */
  nodeCount: number;
}

export function canvasPhase(input: CanvasPhaseInput): CanvasPhase {
  if (input.isError) return "error";
  if (input.isLoading) return input.timedOut ? "timeout" : "loading";
  return input.nodeCount > 0 ? "ready" : "empty";
}

/** Khung nhìn vẫn phải render ở mọi phase trừ hai ca chưa có gì để vẽ. */
export function showsViewport(phase: CanvasPhase): boolean {
  return phase !== "loading" && phase !== "timeout";
}

/* ═════════ bbox nội dung — nguồn cho ⌘1 «vừa khít tất cả» ═════════ */

/**
 * Gộp bbox của node. Canvas rỗng ⇒ `null` (đúng ca «bbox rỗng» mà `fitRect` của B1 đã
 * xử lý an toàn: không NaN, không chia 0). FE-2 gần như luôn rơi vào ca này — và đó là
 * lý do phải test nó, không phải lý do để bỏ qua.
 */
export function contentRectOf(canvas: CanvasDoc | null | undefined): Rect | null {
  const nodes = canvas?.nodes ?? [];
  let box: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const n of nodes) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const w = Number.isFinite(n.w) ? n.w : 0;
    const h = Number.isFinite(n.h) ? n.h : 0;
    box = box
      ? { x1: Math.min(box.x1, n.x), y1: Math.min(box.y1, n.y), x2: Math.max(box.x2, n.x + w), y2: Math.max(box.y2, n.y + h) }
      : { x1: n.x, y1: n.y, x2: n.x + w, y2: n.y + h };
  }
  return box ? { x: box.x1, y: box.y1, width: box.x2 - box.x1, height: box.y2 - box.y1 } : null;
}

/* ═════════ Trạng thái lưu nháp cục bộ ═════════ */

/**
 * `idle` chưa có gì để lưu · `dirty` đang chờ hẹn giờ · `saving` đang ghi ·
 * `saved` đã ghi xong · `conflict` bản trên máy mới hơn (tab khác vừa sửa) ·
 * `error` ghi hỏng (hết chỗ, kho bị chặn, file hệ thống).
 */
export type CanvasSaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface SaveCopy {
  /** câu ngắn hiện trên thanh trạng thái — viết cho người thường. */
  label: string;
  /** `true` ⇒ cần `role="alert"`, người dùng phải biết ngay. */
  urgent: boolean;
}

/** Copy của trạng thái lưu. Một nguồn duy nhất để story/test/màn không lệch chữ. */
export function saveCopy(state: CanvasSaveState): SaveCopy {
  switch (state) {
    case "dirty":
      return { label: "Sắp lưu…", urgent: false };
    case "saving":
      return { label: "Đang lưu…", urgent: false };
    case "saved":
      return { label: "Đã lưu trên máy", urgent: false };
    case "conflict":
      return { label: "Bản trên máy mới hơn — mở lại để không đè mất", urgent: true };
    case "error":
      return { label: "Chưa lưu được thay đổi", urgent: true };
    default:
      return { label: "Chưa có thay đổi", urgent: false };
  }
}

/* ═════════ Copy lỗi — thân UI không bao giờ thấy chuỗi kỹ thuật ═════════ */

export interface CanvasErrorCopy {
  /** câu đời thường; KHÔNG chứa mã lỗi, tên hàm, đường dẫn. */
  title: string;
  /** chỉ dùng trong panel «Chi tiết cho lập trình viên». */
  detail?: string;
}

const FALLBACK_TITLE =
  "Không mở được bàn làm việc này. Ảnh và bản thiết kế của dự án không bị ảnh hưởng.";

/**
 * `DocsRepoError.message` đã là câu viết cho người thường (docs-errors.ts), nên dùng lại
 * thay vì bịa câu thứ hai. Lỗi lạ ⇒ câu chung + `detail` để lập trình viên tự soi.
 */
export function canvasErrorCopy(err: unknown): CanvasErrorCopy {
  if (isDocsRepoError(err)) {
    return { title: err.message, detail: `${err.code}${err.detail ? `: ${err.detail}` : ""}` };
  }
  if (err instanceof Error && err.message) return { title: FALLBACK_TITLE, detail: err.name };
  return { title: FALLBACK_TITLE };
}

/* ═════════ Bàn phím ═════════ */

/**
 * Đang gõ chữ ⇒ KHÔNG bắt phím khung nhìn (tiêu chí D1: "Mod+0/1/2 và mũi tên không
 * bắt phím khi đang gõ").
 *
 * TODO(FE-3): `features/docs/lib/subfile-model.ts` có một hàm cùng nhiệm vụ. Hai bản
 * tồn tại vì hàm đó nằm trong glob nhánh C và **không** được xuất qua barrel công khai;
 * import sâu xuyên feature sẽ kéo tầng file con vào chunk canvas. Đề nghị nâng lên
 * `@/lib` đã ghi ở `teams/react/NEEDS-fe2-d.md` N1 — không tự làm vì ngoài glob D.
 */
export function isTypingTarget(el: unknown): boolean {
  const node = el as
    | { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null }
    | null;
  if (!node || typeof node.tagName !== "string") return false;
  if (node.isContentEditable === true) return true;
  const tag = node.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return node.getAttribute?.("role") === "textbox";
}
