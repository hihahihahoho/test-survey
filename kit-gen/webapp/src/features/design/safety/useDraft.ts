/**
 * features/design/safety/useDraft.ts — NHÁP TỰ LƯU IndexedDB (chốt X5 tầng 2, §3.7).
 *
 * THI CÔNG ĐÚNG HỢP ĐỒNG `features/design/contracts.ts` của R2-P1:
 *   export function useDraft(opts: UseDraftOptions): UseDraftResult
 *   UseDraftOptions = { projectId, contract, dirty, baseVersion }
 *   UseDraftResult  = { found: {savedAt:number, contract, baseVersion} | null, discard() }
 *
 * `found.savedAt` là **number (epoch ms)** theo đúng hợp đồng đó — trong khi bản ghi
 * IDB lưu ISO string (arch §4.2). Chuyển đổi ở đây, không bắt R2-P1 biết.
 *
 * BA ĐIỀU FILE NÀY KHÔNG LÀM, CÓ CHỦ Ý:
 *  1. KHÔNG tự khôi phục — §3.7 bắt hỏi user. Tự nạp nháp là một kiểu mất dữ liệu khác:
 *     user đã lưu ở tab khác, nháp cũ lặng lẽ đè lên bản mới.
 *  2. KHÔNG gắn `beforeunload` — `contracts.ts` ghi rõ "MÀN đã gắn (một chỗ duy nhất).
 *     Đừng gắn lần hai." Gắn hai lần thì Chrome vẫn hỏi một câu, nhưng hai chỗ cùng
 *     quản một hành vi là mầm bug lúc một bên gỡ.
 *  3. KHÔNG tự xoá nháp khi `dirty` chuyển false. Nghe hợp lý nhưng sai: `dirty=false`
 *     xảy ra cả khi lưu THÀNH CÔNG lẫn khi màn `init()` lại vì lý do khác. Chỉ có
 *     `discard()` (user bấm) và `markSaved()` (lưu xong thật) mới được xoá.
 */
import * as React from "react";
import type { UseDraftOptions, UseDraftResult } from "../contracts";
import {
  clearDraftSession, dismissFoundDraft, scheduleDraftWrite, subscribeDraft,
  type DraftSessionState,
} from "./draft-session";

const EMPTY: DraftSessionState = { found: null, savedAt: null, scanned: false };

export function useDraft({ projectId, contract, dirty, baseVersion }: UseDraftOptions): UseDraftResult {
  const [session, setSession] = React.useState<DraftSessionState>(EMPTY);

  // `serverContract` cho lần quét đầu: dùng contract hiện có làm mốc so sánh.
  // Ref để việc contract đổi từng phím gõ KHÔNG làm đăng ký lại phiên.
  const firstContractRef = React.useRef(contract);
  if (firstContractRef.current === null && contract !== null) firstContractRef.current = contract;

  React.useEffect(() => {
    if (!projectId) return;
    setSession(EMPTY);
    return subscribeDraft(projectId, setSession, firstContractRef.current);
  }, [projectId]);

  // Hẹn ghi sau mỗi thay đổi. Phiên chỉ giữ MỘT timer nên gọi mỗi render cũng an toàn.
  React.useEffect(() => {
    if (!projectId) return;
    scheduleDraftWrite(projectId, { contract, dirty, baseVersion });
  }, [projectId, contract, dirty, baseVersion]);

  const found = React.useMemo(() => {
    const f = session.found;
    if (!f) return null;
    const t = Date.parse(f.savedAt);
    return {
      savedAt: Number.isNaN(t) ? 0 : t,
      contract: f.contract,
      baseVersion: f.baseVersion,
    };
  }, [session.found]);

  const discard = React.useCallback(() => {
    if (projectId) clearDraftSession(projectId);
  }, [projectId]);

  return { found, discard };
}

/**
 * Ngoài hợp đồng tối thiểu: báo "user đã trả lời câu hỏi khôi phục" mà KHÔNG xoá
 * nháp trên đĩa. Dùng khi user bấm [Khôi phục] — nội dung đã vào editor rồi, đừng
 * hỏi lại; nhưng nháp vẫn nên nằm đó tới khi lưu xong, phòng tab chết ngay sau đó.
 */
export function acknowledgeDraft(projectId: string): void {
  dismissFoundDraft(projectId);
}

export { clearDraftSession };
