/**
 * webapp/src/lib/update/pending.ts — LỜI HỨA GHI RA ĐĨA TRƯỚC KHI TRANG BIẾN MẤT.
 *
 * `window.location.reload()` xoá sạch mọi state trong RAM, kể cả cái state đang biết
 * "user vừa bấm cập nhật lên 2.2.0". Nếu không ghi lại, app mở lên như chưa có chuyện gì
 * xảy ra và user chỉ còn cách tự vào Cài đặt dò xem bản mới đã vào hay chưa.
 *
 * Nên: ghi ý định TRƯỚC khi tải lại, đọc NGAY khi app mở lại, so với version đang chạy
 * thật rồi nói đúng một câu — và XOÁ khoá đi. Bản ghi này sống đúng một nhịp reload;
 * `PENDING_TTL_MS` là cái chốt để một bản ghi mồ côi (user đóng tab giữa chừng) không
 * bật ra thành thông báo lạc lõng vài ngày sau.
 *
 * Ghi qua `storeSet` — CỬA DUY NHẤT ra localStorage (§6.5-2), nên bản ghi này cũng đi qua
 * allowlist khoá + schema + bộ dò secret như mọi thứ khác.
 */
import { LS_KEYS, storeGet, storeRemove, storeSet } from "../store/persist";
import { compareVersions } from "./restart";

/** Lệnh cập nhật thủ công — chỉ dùng khi agent không nói cho ta biết lệnh của nó. */
export const MANUAL_UPDATE_CMD = "~/.kitgen/bin/kitgen update";
/** Lệnh khởi động lại — câu trả lời cho ca "đã cài xong mà tiến trình cũ vẫn chạy". */
export const MANUAL_RESTART_CMD = "~/.kitgen/bin/kitgen restart";

/** 30 phút: đủ cho một lượt cài chậm nhất, ngắn hơn một buổi làm việc. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

export interface PendingUpdate {
  /** bản đích; rỗng khi lúc bấm không kiểm tra được bản mới nhất. */
  targetVersion: string;
  /** bản đang chạy lúc bấm — mốc để biết "có đổi gì không". */
  fromVersion: string;
  startedAt: string;
}

export function markUpdatePending(p: {
  targetVersion?: string | null;
  fromVersion?: string | null;
  startedAt?: string;
}): void {
  try {
    storeSet(LS_KEYS.update, {
      targetVersion: p.targetVersion ?? "",
      fromVersion: p.fromVersion ?? "",
      startedAt: p.startedAt ?? new Date().toISOString(),
    });
  } catch {
    /* Storage bị chặn (Safari private) ⇒ mất lời chào sau reload. Đó là một lời chào,
       không phải bản cập nhật: không được vì nó mà chặn việc cài. */
  }
}

/** Bản ghi còn hiệu lực, hoặc `null` (không có / hết hạn — hết hạn thì dọn luôn). */
export function readUpdatePending(now: number = Date.now()): PendingUpdate | null {
  let raw: PendingUpdate;
  try {
    raw = storeGet(LS_KEYS.update);
  } catch {
    return null;
  }
  if (!raw.startedAt) return null;
  const started = Date.parse(raw.startedAt);
  if (!Number.isFinite(started) || now - started > PENDING_TTL_MS) {
    clearUpdatePending();
    return null;
  }
  return raw;
}

export function clearUpdatePending(): void {
  try {
    storeRemove(LS_KEYS.update);
  } catch {
    /* không xoá được thì TTL sẽ dọn hộ */
  }
}

export type UpdateResultKind = "success" | "failed" | "unknown";

export interface UpdateResult {
  kind: UpdateResultKind;
  /** version đang chạy sau khi tải lại; `null` khi không hỏi được agent. */
  runningVersion: string | null;
  targetVersion: string;
}

/**
 * So ý định với sự thật. Ba kết cục, KHÔNG gộp (cùng tinh thần §3.9 "chưa kiểm tra được"
 * ≠ "đang mới nhất"):
 *   · `success` — đúng bản đích, hoặc cao hơn bản cũ;
 *   · `failed`  — agent sống mà version y nguyên ⇒ nói thẳng và đưa lệnh tay;
 *   · `unknown` — agent chưa trả lời ⇒ KHÔNG được kết tội cập nhật hỏng, vì rất có thể
 *                 user chỉ đang tắt công cụ local.
 */
export function resolveUpdateResult(p: PendingUpdate, runningVersion: string | null): UpdateResult {
  const base = { runningVersion, targetVersion: p.targetVersion };
  if (!runningVersion) return { ...base, kind: "unknown" };
  if (p.targetVersion && compareVersions(runningVersion, p.targetVersion) >= 0) return { ...base, kind: "success" };
  if (p.fromVersion && compareVersions(runningVersion, p.fromVersion) > 0) return { ...base, kind: "success" };
  if (!p.targetVersion && !p.fromVersion) return { ...base, kind: "unknown" };
  return { ...base, kind: "failed" };
}
