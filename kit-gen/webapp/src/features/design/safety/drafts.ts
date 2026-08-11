/**
 * features/design/safety/drafts.ts — NHÁP TỰ LƯU (tầng 2 của chốt X5, arch §4.2 store `drafts`).
 *
 * "Nháp tự lưu IDB mỗi 2s → khi mở lại: banner *Có bản nháp chưa lưu từ 14:32 hôm nay*
 * + [Khôi phục] [Bỏ nháp] [So sánh]" (§3.7).
 *
 * BA QUYẾT ĐỊNH CÓ LÝ DO:
 *
 * 1. **Không tự khôi phục.** Spec bắt HỎI trước. Tự nạp nháp là một cách khác để mất
 *    dữ liệu: user lưu ở tab khác rồi mở lại, nháp cũ đè lên bản mới mà họ không biết.
 *
 * 2. **Nháp được validate bằng chính `contractSchema` khi ĐỌC.** Nháp là thứ duy nhất
 *    trong IDB không tái tạo được, nhưng nó cũng là dữ liệu cũ có thể lệch schema
 *    (user cập nhật app giữa chừng). Đọc mà không parse thì editor nhận rác.
 *    Parse hỏng ⇒ coi như không có nháp, KHÔNG ném lỗi ra màn.
 *
 * 3. **`baseVersion` đi cùng nháp.** Không có nó thì lúc khôi phục ta không biết nháp
 *    này đẻ ra từ bản đĩa nào ⇒ không so được "nháp cũ hơn bản trên đĩa hay không"
 *    ⇒ mất khả năng cảnh báo ca nguy hiểm nhất (`isDraftStale`).
 */
import { contractSchema, type Contract } from "@/lib/types";
import { IDB_STORES, idbDel, idbGet, idbSet } from "./idb";

export interface DraftRecord {
  contract: Contract;
  /** version của bản trên đĩa lúc user bắt đầu sửa — dùng để so với version hiện tại. */
  baseVersion: number;
  savedAt: string;
  /** nhãn ngắn của vài thay đổi cuối, hiện trong banner. KHÔNG chứa nội dung contract. */
  dirtyFields: string[];
}

interface RawDraft {
  contract?: unknown;
  baseVersion?: unknown;
  savedAt?: unknown;
  dirtyFields?: unknown;
}

/** Đọc nháp. Hỏng/lệch schema ⇒ `null` (im lặng, không phá màn). */
export async function readDraft(projectId: string): Promise<DraftRecord | null> {
  if (!projectId) return null;
  const raw = await idbGet<RawDraft>(IDB_STORES.drafts, projectId);
  if (!raw || typeof raw !== "object") return null;
  const parsed = contractSchema.safeParse(raw.contract);
  if (!parsed.success) return null;
  return {
    contract: parsed.data,
    baseVersion: Number(raw.baseVersion) || 0,
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt : "",
    dirtyFields: Array.isArray(raw.dirtyFields) ? raw.dirtyFields.slice(0, 8).map(String) : [],
  };
}

export async function writeDraft(
  projectId: string,
  rec: Omit<DraftRecord, "savedAt"> & { savedAt?: string },
): Promise<boolean> {
  if (!projectId) return false;
  return idbSet(IDB_STORES.drafts, projectId, {
    contract: rec.contract,
    baseVersion: rec.baseVersion,
    dirtyFields: rec.dirtyFields.slice(0, 8),
    savedAt: rec.savedAt ?? new Date().toISOString(),
  });
}

export async function dropDraft(projectId: string): Promise<boolean> {
  if (!projectId) return false;
  return idbDel(IDB_STORES.drafts, projectId);
}

/**
 * Nháp CŨ HƠN bản trên đĩa ⇒ khôi phục nó sẽ mất công của người khác/tab khác.
 * Banner phải đổi giọng ở ca này (§3.9 CONTRACT_CONFLICT cùng tinh thần: nói rõ,
 * không tự chọn hộ).
 */
export function isDraftStale(draft: Pick<DraftRecord, "baseVersion">, serverVersion: number): boolean {
  return Number.isFinite(serverVersion) && serverVersion > draft.baseVersion;
}
