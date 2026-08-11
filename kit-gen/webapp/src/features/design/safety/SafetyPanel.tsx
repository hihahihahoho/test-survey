import * as React from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useContract } from "@/lib/hooks";
import type { Contract } from "@/lib/types";
import type { SafetyPanelProps } from "../contracts";
import { ConflictDialog } from "./ConflictDialog";
import { DraftBanner } from "./DraftBanner";
import { HistoryDrawer } from "./HistoryDrawer";
import { diffContracts } from "./diff";
import { acknowledgeDraft, clearDraftSession, useDraft } from "./useDraft";
import { useContractHistory } from "./useContractHistory";
import type { ConflictInfo } from "./types";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SafetyPanel — LƯỚI AN TOÀN của trình soạn, lắp vào thanh lưu của S3.
 * Đóng issue #3 của audit (B1, B2, B4, B5, B6, R7) — MUST độ khó L của §7.1.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Đúng hợp đồng `features/design/contracts.ts` (R2-P1): nhận `api`, `conflict`,
 * `resolveConflict`, `dismissConflict`, `onResolved`. Panel dựng ba thứ mà thanh
 * lưu của màn còn thiếu:
 *
 *   ① [Lịch sử ▾]  → drawer 50 bản lưu (#24) + [Khôi phục] (#26)
 *   ② banner nháp  → "Có bản nháp chưa lưu từ 14:32" + [Khôi phục][Bỏ nháp][So sánh]
 *   ③ modal 409    → so sánh 2 cột + 3 lối ra
 *
 * BỐ CỤC: panel render nút [Lịch sử] INLINE (nó nằm trong thanh lưu), còn banner
 * nháp thì `position: fixed` ngay dưới header. Lý do banner không inline: nó xuất
 * hiện SAU khi màn đã layout xong (đọc IDB là bất đồng bộ), chèn vào giữa thanh
 * lưu sẽ đẩy cả lưới ô nhảy xuống — đúng kiểu giật màn hình mà audit H3 đã ghi.
 *
 * VÌ SAO KHÔNG DÙNG `conflict.diffSummary` CỦA AGENT LÀM SO SÁNH: nó chỉ có
 * `{added, removed}` — hai con số không giúp user chọn giữa "ghi đè" và "tải lại".
 * Panel nạp bản trên đĩa rồi diff thật, để câu trả lời là "sheet «pose-lan» sẽ mất".
 */
export function SafetyPanel({ api, conflict, resolveConflict, dismissConflict, onResolved }: SafetyPanelProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [resolving, setResolving] = React.useState(false);

  const contractQuery = useContract(api.projectId);
  const serverContract = contractQuery.data?.contract ?? null;

  const draft = useDraft({
    projectId: api.projectId,
    contract: api.contract,
    dirty: api.dirty,
    baseVersion: api.baseVersion,
  });

  const history = useContractHistory(api.projectId, api.baseVersion);

  /* ── Lưu xong ⇒ nháp hết nhiệm vụ ────────────────────────────────────────
   * Bám vào `dirty` chuyển true→false KÈM `baseVersion` tăng: đó là chữ ký của
   * một lần lưu THÀNH CÔNG. Chỉ nhìn `dirty` là chưa đủ (init lại cũng cho
   * dirty=false), và xoá nháp nhầm lúc đó là mất dữ liệu thật.                */
  const prevRef = React.useRef({ dirty: api.dirty, version: api.baseVersion });
  React.useEffect(() => {
    const prev = prevRef.current;
    if (prev.dirty && !api.dirty && api.baseVersion > prev.version) {
      clearDraftSession(api.projectId);
    }
    prevRef.current = { dirty: api.dirty, version: api.baseVersion };
  }, [api.dirty, api.baseVersion, api.projectId]);

  /* ── Nháp: dựng prompt cho banner ────────────────────────────────────── */
  const draftPrompt = React.useMemo(() => {
    const f = draft.found;
    if (!f) return null;
    const base = serverContract ?? api.contract;
    return {
      draft: {
        contract: f.contract,
        baseVersion: f.baseVersion,
        savedAt: new Date(f.savedAt).toISOString(),
        dirtyFields: [],
      },
      // Nháp CŨ hơn bản trên đĩa ⇒ banner đổi sang giọng cảnh báo.
      stale: api.baseVersion > f.baseVersion,
      diff: diffContracts(f.contract, base),
    };
  }, [draft.found, serverContract, api.contract, api.baseVersion]);

  const restoreDraft = React.useCallback(() => {
    const f = draft.found;
    if (!f) return;
    // Đi qua `replaceContract` để bước này HOÀN TÁC ĐƯỢC bằng ⌘Z — bấm nhầm
    // [Khôi phục] vẫn có đường lùi (§1.1-1).
    api.replaceContract(f.contract, { label: "Khôi phục bản nháp chưa lưu", markDirty: true });
    acknowledgeDraft(api.projectId);
  }, [draft, api]);

  /* ── Xung đột 409: nạp bản trên đĩa để so hai cột thật ───────────────── */
  const [theirs, setTheirs] = React.useState<{ contract: Contract | null; loading: boolean }>({
    contract: null,
    loading: false,
  });

  React.useEffect(() => {
    if (!conflict) {
      setTheirs({ contract: null, loading: false });
      return;
    }
    setTheirs({ contract: null, loading: true });
    let alive = true;
    void (async () => {
      try {
        const fresh = await contractQuery.refetch();
        if (alive) setTheirs({ contract: fresh.data?.contract ?? null, loading: false });
      } catch {
        if (alive) setTheirs({ contract: null, loading: false });
      }
    })();
    return () => {
      alive = false;
    };
    // `contractQuery` đổi tham chiếu mỗi render; chỉ chạy lại khi có xung đột MỚI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict?.serverVersion, conflict?.myBaseVersion]);

  const conflictInfo = React.useMemo<ConflictInfo | null>(() => {
    if (!conflict) return null;
    return {
      serverVersion: conflict.serverVersion,
      myBaseVersion: conflict.myBaseVersion,
      mine: conflict.mine,
      theirs: theirs.contract,
      theirsLoading: theirs.loading,
      diff: theirs.loading ? null : diffContracts(conflict.mine, theirs.contract),
    };
  }, [conflict, theirs]);

  const onResolve = React.useCallback(
    (choice: "overwrite" | "reload" | "fork") => {
      // CHỤP `mine` TRƯỚC khi await: `resolveConflict` của R0 gọi `setConflict(null)`
      // khi xong, nên đọc `conflict!.mine` SAU await là một quả bom hẹn giờ
      // (non-null assertion trên giá trị đã bị xoá). Đã bắt được ở lượt tự soát.
      const mine = conflict?.mine ?? null;
      if (mine === null) return;
      setResolving(true);
      void (async () => {
        try {
          const res = await resolveConflict(choice);
          if (choice === "overwrite") {
            // PUT lại với If-Match = version trên đĩa. Bản cũ vẫn nằm trong
            // `.history/contract/` của agent ⇒ "ghi đè" KHÔNG phải mất dữ liệu.
            const v = (res as { version?: number } | null)?.version;
            clearDraftSession(api.projectId);
            if (typeof v === "number") onResolved(mine, v);
            void history.refetch();
          } else if (choice === "reload") {
            const r = res as { contract?: Contract; version?: number } | null;
            if (r?.contract && typeof r.version === "number") {
              clearDraftSession(api.projectId);
              onResolved(r.contract, r.version);
            }
          }
          // fork: `useSaveContract` trả `{fork:true, contract, serverVersion}`.
          // Việc tạo project mới cần TÊN do user đặt (§4.3) ⇒ để màn quyết định.
        } finally {
          setResolving(false);
        }
      })();
    },
    [resolveConflict, api.projectId, conflict, onResolved, history],
  );

  const restoreSnapshot = React.useCallback(
    async (snapshot: string) => {
      const r = await history.restore(snapshot);
      if (!r) return false;
      clearDraftSession(api.projectId);
      onResolved(r.contract, r.version);
      return true;
    },
    [history, api.projectId, onResolved],
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="size-3.5" aria-hidden />
            Lịch sử
            {history.count > 0 && (
              <span className="text-caption text-fg-muted-raised">{history.count}</span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {history.count > 0
            ? `${history.count} bản lưu gần nhất — xem lại và khôi phục được`
            : "Bản lưu trước đó của bản thiết kế"}
        </TooltipContent>
      </Tooltip>

      {draftPrompt && (
        <div className="pointer-events-none fixed inset-x-0 top-[calc(theme(spacing.header)+8px)] z-sticky flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-3xl shadow-2">
            <DraftBanner
              prompt={draftPrompt}
              serverContract={serverContract ?? api.contract}
              onRestore={restoreDraft}
              onDiscard={draft.discard}
            />
          </div>
        </div>
      )}

      <ConflictDialog
        conflict={conflictInfo}
        pending={resolving}
        onResolve={onResolve}
        onDismiss={dismissConflict}
      />

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        currentVersion={api.baseVersion}
        dirty={api.dirty}
        dirtyCount={api.dirtyCount}
        onRestore={restoreSnapshot}
      />
    </>
  );
}

export default SafetyPanel;
