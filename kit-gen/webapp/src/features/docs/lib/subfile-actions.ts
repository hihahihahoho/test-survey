/**
 * features/docs/lib/subfile-actions.ts — LUẬT của CRUD file con (THUẦN HÀM, không React).
 *
 * Vì sao tách khỏi component: bốn thứ dễ sai nhất của C2 — tên hợp lệ, câu nói
 * "sản phẩm KHÔNG bị xoá", cửa sổ Hoàn tác 10 giây, và hạn 30 ngày của thùng rác —
 * đều kiểm được bằng test Node, không cần dựng jsdom. Component chỉ còn việc vẽ.
 *
 * NGUỒN: UI-SPEC-V2 §4.2 (file con là VIEW ⇒ xoá file KHÔNG xoá sản phẩm) ·
 *        §4.4 (bảng tạo/nhân bản/đổi tên/xoá + toast [Hoàn tác] 10s + thùng rác 30 ngày) ·
 *        §4.4 ⚠ (bài học C-01: file trỏ tới sheet ĐANG CHẠY thì CHỈ cảnh báo, CẤM huỷ run).
 *
 * BỐN QUYẾT ĐỊNH, mỗi cái có lý do:
 *
 * ① **Xác thực tên ở đây dùng CHUNG luật với `docs-repo-local`**: `docNameSchema` +
 *    so tên không phân biệt hoa/thường. UI lỏng hơn repo ⇒ người dùng gõ xong mới bị
 *    repo từ chối (lỗi hiện muộn, ở chỗ không sửa được). UI chặt hơn repo ⇒ có tên hợp
 *    lệ mà không đặt được. Một luật, hai chỗ gọi.
 *
 * ② **Cửa sổ Hoàn tác là DỮ LIỆU, không phải hiệu ứng phụ của toast.** Toast tự tắt sau
 *    10s, nhưng phải có nguồn sự thật để (a) test bằng fake timer khẳng định đúng 10 000 ms,
 *    (b) chặn hoàn tác muộn nếu người dùng bấm khi cửa sổ đã đóng.
 *
 * ③ **Câu cảnh báo run KHÁC HẲN câu của xoá project.** Xoá project: *"lượt đó sẽ bị dừng"*.
 *    Xoá file con: lượt chạy và sản phẩm **không hề bị đụng**. Dùng nhầm câu của project
 *    sẽ khiến người dùng tưởng mình vừa giết một lượt sinh ảnh — và FE thì TUYỆT ĐỐI
 *    không được gọi cancel (C-01).
 *
 * ④ **Không có "xoá vĩnh viễn" trong C2.** `purgeExpired` chỉ dọn thứ đã quá 30 ngày;
 *    UI không cấp nút xoá hẳn, nên không cần ma sát gõ tên (ConfirmDestructive không
 *    truyền `confirmText`) — đúng chốt X6: thao tác phục hồi được thì đừng thêm ma sát.
 */
import { docNameSchema, DOC_NAME_MAX, isVirtualDoc, type Doc, type DocKind } from "./types";
import { TRASH_KEEP_DAYS } from "./docs-repo-local";

/* ═════════ 1. Tên file ═════════ */

export interface NameCheck {
  ok: boolean;
  /** Tên đã trim, dùng để gửi xuống repo (repo cũng trim, nhưng UI phải hiện đúng thứ sẽ lưu). */
  value: string;
  /** Câu lỗi INLINE cho người thường. `null` khi hợp lệ. */
  error: string | null;
}

/**
 * Kiểm tên trước khi gọi repo. `selfId` = đang đổi tên chính file đó (không tự trùng mình).
 * File trong thùng rác KHÔNG chiếm tên — đúng như `assertNameFree` của repo.
 */
export function checkDocName(
  raw: string,
  docs: readonly Doc[],
  selfId?: string,
): NameCheck {
  const parsed = docNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, value: raw.trim(), error: parsed.error.issues[0]?.message ?? "Tên không hợp lệ." };
  }
  const value = parsed.data;
  const taken = docs.some(
    (d) => !d.trashedAt && d.id !== selfId && d.name.toLowerCase() === value.toLowerCase(),
  );
  if (taken) {
    return { ok: false, value, error: "Trong dự án đã có file trùng tên. Đặt tên khác giúp bạn dễ tìm hơn." };
  }
  return { ok: true, value, error: null };
}

/** Gợi ý tên mặc định cho dialog tạo file, đã tránh trùng: «Bộ kit chính», «Bàn ý tưởng 2»… */
export function suggestDocName(kind: DocKind, docs: readonly Doc[]): string {
  const base = kind === "canvas" ? "Bàn ý tưởng" : "Bộ kit chính";
  const used = new Set(docs.filter((d) => !d.trashedAt).map((d) => d.name.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} ${i}`.slice(0, DOC_NAME_MAX);
    if (!used.has(cand.toLowerCase())) return cand;
  }
  return base;
}

/** File hệ thống thì không đổi tên/nhân bản/xoá được — menu phải khoá mục, không ẩn (§2.5-2). */
export function isEditableDoc(id: string): boolean {
  return !isVirtualDoc(id);
}

/* ═════════ 2. Cửa sổ Hoàn tác 10 giây (§4.4) ═════════ */

/**
 * ĐÚNG 10 000 ms. Số này phải BẰNG `KG_TOAST_DURATION.successWithUndo` của R0
 * (`components/ui/sonner.tsx`); không import trực tiếp vì tầng này thuần hàm và
 * chạy trong vitest environment "node". Ràng buộc được khoá bằng test DOM
 * ("hằng số 10s khớp KG_TOAST_DURATION") — lệch là đỏ.
 */
export const UNDO_WINDOW_MS = 10_000;

export interface UndoEntry {
  docId: string;
  name: string;
  /** `Date.now()` lúc xoá. */
  at: number;
}

/** Còn trong cửa sổ hoàn tác không. Biên: đúng 10 000 ms vẫn còn, 10 001 ms là hết. */
export function undoStillOpen(entry: UndoEntry | null, now: number, window = UNDO_WINDOW_MS): boolean {
  if (!entry) return false;
  return now - entry.at <= window;
}

/* ═════════ 3. Thùng rác 30 ngày (§4.4) ═════════ */

export const DAY_MS = 86_400_000;

export interface TrashEntry {
  doc: Doc;
  /** số ngày còn lại trước khi bị dọn hẳn; 0 = hết hạn, sẽ bị dọn ở lần mở sau. */
  daysLeft: number;
  expired: boolean;
}

/** Danh sách thùng rác, mới xoá lên trước, kèm số ngày còn lại. */
export function trashEntries(docs: readonly Doc[], now: number): TrashEntry[] {
  return docs
    .filter((d) => Boolean(d.trashedAt))
    .map((doc) => {
      const t = Date.parse(doc.trashedAt!);
      const age = Number.isFinite(t) ? now - t : 0;
      const left = TRASH_KEEP_DAYS - Math.floor(age / DAY_MS);
      return { doc, daysLeft: Math.max(0, left), expired: left <= 0 };
    })
    .sort((a, b) => String(b.doc.trashedAt).localeCompare(String(a.doc.trashedAt)));
}

/** Câu ngày còn lại — nói bằng tiếng người, không phải timestamp. */
export function trashCountdown(e: TrashEntry): string {
  if (e.expired) return "Hết hạn giữ — sẽ được dọn";
  if (e.daysLeft <= 1) return "Còn dưới 1 ngày";
  return `Còn ${e.daysLeft} ngày`;
}

/* ═════════ 4. Câu chữ của thao tác phá huỷ (§4.4) ═════════ */

/**
 * Câu BẮT BUỘC của dialog xoá. Spec §4.4 viết sẵn gần như nguyên văn, và nó phải
 * nói rõ thứ KHÔNG mất — đây là toàn bộ khác biệt giữa xoá file con và xoá project.
 */
export function deleteDocDescription(name: string): string {
  return (
    `Xoá file «${name}». Sheet, ảnh đã sinh và kit KHÔNG bị xoá — chúng thuộc về dự án. ` +
    `File chuyển vào Thùng rác và giữ ${TRASH_KEEP_DAYS} ngày.`
  );
}

export interface RunNotice {
  /** có lượt đang chạy dính tới sheet của file này không. */
  affected: boolean;
  sheetIds: string[];
  /** câu hiện trong dialog. `null` = không có gì để nói. */
  message: string | null;
}

/**
 * ⚠ C-01 áp cho file con (§4.4): file trỏ tới sheet ĐANG CHẠY thì **vẫn cho xoá**
 * (không xoá sản phẩm) nhưng phải nói rõ *"lượt này vẫn chạy tiếp"*.
 * Hàm này chỉ TRẢ SỰ THẬT; nó không chặn, và tuyệt đối không có đường nào gọi cancel.
 */
export function runNoticeForDoc(doc: Doc | null, runningSheetIds: readonly string[]): RunNotice {
  const ids = doc?.view?.sheetIds ?? [];
  const hit = ids.filter((id) => runningSheetIds.includes(id));
  if (hit.length === 0) return { affected: false, sheetIds: [], message: null };
  const names = hit.map((s) => `«${s}»`).join(", ");
  return {
    affected: true,
    sheetIds: hit,
    message:
      hit.length === 1
        ? `1 lượt đang chạy cho sheet ${names} — lượt này vẫn chạy tiếp.`
        : `${hit.length} lượt đang chạy cho các sheet ${names} — các lượt này vẫn chạy tiếp.`,
  };
}

/** Sau khi xoá file đang mở: chuyển về đâu để KHÔNG trắng trang (tiêu chí §3-C2). */
export function safeIdAfterDelete(
  deletedId: string,
  activeId: string,
  remaining: readonly Doc[],
  fallbackId: string,
): string {
  if (deletedId !== activeId) return activeId;
  const next = remaining.find((d) => !d.trashedAt && d.id !== deletedId);
  return next?.id ?? fallbackId;
}
