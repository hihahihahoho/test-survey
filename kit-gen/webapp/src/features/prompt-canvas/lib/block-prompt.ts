import * as React from "react";
import { api } from "@/lib/api";
import { promptPreviewProblem } from "@/features/workflow-v4/lib/prompt-studio";
import type { Contract } from "@/lib/types/contract";
import type { PromptPreviewJob } from "@/lib/types/api";

/**
 * block-prompt.ts — TAB "PROMPT" CỦA MỘT THẺ, và ba cái khoá quanh nó.
 *
 * ╔══ ENDPOINT NÀY KHÔNG PHẢI MỘT PHÉP ĐỌC ══════════════════════════════════╗
 * ║ `POST /prompt-preview` CHẠY ENGINE THẬT (vài giây) và GHI ĐÈ `styles.json` ║
 * ║ + `prompts/` của dự án. Ba hệ quả, ba cái khoá:                            ║
 * ║  ① KHÔNG TỰ GỌI KHI GÕ. Chỉ chạy khi người dùng MỞ tab — và đó là một      ║
 * ║    hàm gọi từ trình xử lý sự kiện, KHÔNG phải một `useEffect` theo dữ liệu:║
 * ║    effect nào phụ thuộc nội dung thẻ cũng sẽ bắn lại sau mỗi phím gõ.      ║
 * ║  ② MỘT LƯỢT MỘT LÚC. Mở nhanh ba tab là ba tiến trình engine cùng ghi vào  ║
 * ║    một thư mục `prompts/`. Lời gọi nối đuôi nhau qua `chainRef`.           ║
 * ║  ③ CACHE THEO VÂN TAY NỘI DUNG. Đóng tab rồi mở lại mà chữ y nguyên thì     ║
 * ║    không có gì để dựng lại; khoá cache là `sheetsHash`, nên chữ ĐỔI là     ║
 * ║    cache tự trượt và nút "Xem lại" hiện ra.                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * 409 `RUN_ACTIVE` (đang có lượt vẽ) ra một câu tiếng Việt rồi DỪNG — không có
 * vòng thử lại nào. Người dùng bấm lại khi lượt vẽ xong; máy không được tự gõ cửa.
 */

export type BlockPromptStatus = "idle" | "loading" | "ready" | "error";

export interface BlockPromptState {
  status: BlockPromptStatus;
  jobs: PromptPreviewJob[];
  /** Tấm engine không dựng nổi prompt — phải NÓI RA, không lặng lẽ thiếu. */
  missing: string[];
  message: string;
  /** Bằng chứng kỹ thuật, chỉ để trong khối gập (§3.9 luật ①). */
  details: string[];
  /** Vân tay nội dung của lần lấy này — khác vân tay hiện tại ⇒ bản đang xem đã cũ. */
  hash: string;
}

const EMPTY: BlockPromptState = { status: "idle", jobs: [], missing: [], message: "", details: [], hash: "" };

export interface BlockPrompts {
  stateOf: (blockId: string) => BlockPromptState;
  /**
   * Lấy prompt cho MỘT thẻ. Gọi từ trình xử lý sự kiện (mở tab, bấm "Xem lại").
   * Trùng vân tay với bản đang có ⇒ không đi mạng.
   */
  request: (blockId: string, hash: string, contract: Contract) => void;
  /** Có một lượt đang chạy (của thẻ nào cũng tính) — nút của thẻ khác hiện "đang chờ". */
  busy: boolean;
}

export function useBlockPrompts(projectId: string): BlockPrompts {
  const [byBlock, setByBlock] = React.useState<Record<string, BlockPromptState>>({});
  const [busy, setBusy] = React.useState(false);
  /* Dây chuyền một làn. Mỗi lời gọi nối vào đuôi lời gọi trước — kể cả khi lời
     trước hỏng (`catch` nuốt để dây không đứt giữa chừng). */
  const chainRef = React.useRef<Promise<void>>(Promise.resolve());
  const stateRef = React.useRef(byBlock);
  stateRef.current = byBlock;
  const aliveRef = React.useRef(true);
  React.useEffect(() => () => { aliveRef.current = false; }, []);
  /* ĐẾM, không phải cờ bật/tắt: hai lời gọi xếp hàng thì lời thứ nhất xong sẽ
     tắt cờ trong khi lời thứ hai còn đang chạy — nút của thẻ khác sáng lên giữa
     lúc engine vẫn bận. */
  const inFlightRef = React.useRef(0);

  const request = React.useCallback(
    (blockId: string, hash: string, contract: Contract) => {
      const current = stateRef.current[blockId];
      if (current && current.hash === hash && (current.status === "ready" || current.status === "loading")) return;

      setByBlock((prev) => ({ ...prev, [blockId]: { ...EMPTY, status: "loading", hash, message: "Đang dựng prompt…" } }));
      inFlightRef.current += 1;
      setBusy(true);

      chainRef.current = chainRef.current.then(async () => {
        try {
          const res = await api.contract.promptPreview(projectId, contract);
          if (!aliveRef.current) return;
          setByBlock((prev) => ({
            ...prev,
            [blockId]: { status: "ready", jobs: res.jobs, missing: res.missing, message: "", details: [], hash },
          }));
        } catch (error) {
          if (!aliveRef.current) return;
          const problem = promptPreviewProblem(error);
          setByBlock((prev) => ({
            ...prev,
            [blockId]: { ...EMPTY, status: "error", message: problem.message, details: problem.details, hash },
          }));
        } finally {
          inFlightRef.current -= 1;
          if (aliveRef.current && inFlightRef.current === 0) setBusy(false);
        }
      });
    },
    [projectId],
  );

  const stateOf = React.useCallback((blockId: string) => byBlock[blockId] ?? EMPTY, [byBlock]);

  return { stateOf, request, busy };
}
