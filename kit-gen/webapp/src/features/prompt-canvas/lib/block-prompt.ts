import * as React from "react";
import { api } from "@/lib/api";
import { AgentError } from "@/lib/api/client";
import { promptPreviewProblem } from "@/features/kit-core/lib/prompt-studio";
import type { Contract } from "@/lib/types/contract";
import type { PromptPreviewJob } from "@/lib/types/api";

/**
 * block-prompt.ts — TAB "PROMPT" CỦA MỘT THẺ, và bốn cái khoá quanh nó.
 *
 * ╔══ ENDPOINT NÀY KHÔNG PHẢI MỘT PHÉP ĐỌC ══════════════════════════════════╗
 * ║ `POST /prompt-preview` CHẠY ENGINE THẬT (vài chục giây) và GHI ĐÈ          ║
 * ║ `styles.json` + `prompts/` của dự án. Ba hệ quả, ba cái khoá:              ║
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
 * ╔══ CÁI KHOÁ THỨ TƯ: KHÔNG BAO GIỜ ĐƯỢC QUAY MÃI ══════════════════════════╗
 * ║ Chủ sản phẩm báo: *"đang dựng prompt cứ quay tròn không ra gì"*. Mổ ra thì ║
 * ║ có BA nguyên nhân chồng lên nhau, và cả ba đều kết thúc bằng một vòng xoay ║
 * ║ không hồi kết — thứ §3.9 cấm.                                              ║
 * ║                                                                            ║
 * ║ ① `aliveRef` KHÔNG BAO GIỜ ĐƯỢC BẬT LẠI. Bản trước viết:                   ║
 * ║        useEffect(() => () => { aliveRef.current = false }, [])              ║
 * ║    Dưới `React.StrictMode` (bật ở `main.tsx`) React chạy mount → CLEANUP →  ║
 * ║    mount lại. Cú cleanup giả ấy hạ cờ, và không có dòng nào dựng nó lên     ║
 * ║    lại ⇒ TỪ GIÂY ĐẦU TIÊN mọi phản hồi đều bị `if (!aliveRef.current)`     ║
 * ║    ném đi: không `setByBlock` nào chạy, `busy` kẹt `true` vĩnh viễn nên nút ║
 * ║    "Xem lại" cũng khoá luôn. Đây là con bọ chính, và nó CHỈ xảy ra khi dev  ║
 * ║    — đúng thứ khiến nó sống lâu. Sửa: đặt cờ ở PHA VÀO của effect, không    ║
 * ║    chỉ ở pha ra. Cùng lớp lỗi với khối chú thích "quay mãi không dừng" ở    ║
 * ║    `features/kit/components/KitImage.tsx`.                                 ║
 * ║ ② HẠN 15s CỦA `POST` cắt ngang một lượt engine bình thường, rồi            ║
 * ║    `transportError` gọi nó là `AGENT_NOT_RUNNING` ⇒ báo sai nguyên nhân.    ║
 * ║    Sửa ở tầng transport: `kind: "preview"` = 75s (xem `constants.ts`).      ║
 * ║ ③ AGENT BẢN CŨ KHÔNG CÓ ROUTE NÀY. Bản cài 2.1.43 trả `404 NOT_FOUND`,     ║
 * ║    và bảng lỗi chung dịch nó thành "Không tìm thấy" — đúng chữ, vô dụng     ║
 * ║    với người đang ngồi trước màn hình. Nay nó ra một câu nói THẲNG phải làm ║
 * ║    gì (`npm run dev:full` / cập nhật KitGen).                              ║
 * ║                                                                            ║
 * ║ LUẬT THÀNH VĂN: mọi nhánh kết thúc của `request()` phải đặt `status` sang   ║
 * ║ `"ready"` hoặc `"error"`. Không có nhánh nào được rời khỏi `"loading"` bằng ║
 * ║ cách không làm gì cả — kể cả nhánh "component đã unmount", vì cái ta không  ║
 * ║ biết chắc là component NÀO đã unmount.                                     ║
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

/**
 * HẠN PHÍA CLIENT — 75 giây, và nó là hạn CUỐI CÙNG.
 *
 * Trùng số với `TIMEOUT.preview` một cách CÓ CHỦ Ý, không phải trùng lặp thừa:
 * đồng hồ của transport bảo vệ một `fetch` đang treo, còn đồng hồ ở đây bảo vệ cả
 * ĐOẠN mã — kể cả khi lượt gọi còn đang xếp hàng sau một lượt khác trong `chainRef`
 * và chưa chạm tới `fetch` nào. Không có nó thì hai thẻ mở cùng lúc = thẻ thứ hai
 * quay vô hạn trong lúc chờ, mà chờ bao lâu thì không ai nói.
 */
export const PROMPT_TIMEOUT_MS = 75_000;

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

/** Lỗi tự dựng khi đồng hồ 75s của chính hook nổ — phân biệt với abort của transport. */
class PromptTimeout extends Error {
  constructor() {
    super("PROMPT_PREVIEW_TIMEOUT");
    this.name = "PromptTimeout";
  }
}

/**
 * DỊCH MỘT LỖI THÀNH CÂU NGƯỜI ĐỌC ĐƯỢC + việc phải làm.
 *
 * Ba ngách đầu là ba ca mà bảng lỗi chung (`promptPreviewProblem`) trả lời ĐÚNG NHƯNG
 * VÔ DỤNG, vì nó không biết endpoint này mới có từ bản nào và không biết web đang nói
 * chuyện với agent nào. Ngách thứ tư giao lại cho bảng chung — ở đó nó là bảng đúng.
 *
 * Hàm THUẦN, export để test gọi thẳng: ba ngách này chỉ tái hiện được bằng một agent
 * đời cũ / một sợi mạng bị cắt, tức là bằng những thứ không dựng lại được trong CI.
 */
export function describePromptError(error: unknown): { message: string; details: string[] } {
  if (error instanceof PromptTimeout) {
    return {
      message: `Quá ${Math.round(PROMPT_TIMEOUT_MS / 1000)} giây chưa dựng xong prompt — engine có thể đang kẹt. Bấm «Thử lại».`,
      details: [],
    };
  }

  if (error instanceof AgentError) {
    /* AGENT ĐỜI CŨ. `404` + `NOT_FOUND` là đúng chữ agent 2.1.43 trả về cho một route
       nó không khai (đo bằng curl thật). Đây KHÔNG phải "dự án không tồn tại": lỗi ấy
       mang mã `PROJECT_NOT_FOUND` riêng, nên hai ca không lẫn được vào nhau. */
    if (error.status === 404 && (error.code === "NOT_FOUND" || error.code === "AGENT_INTERNAL")) {
      return {
        /* CÂU CHO NGƯỜI DÙNG THẬT: họ không có repo và không gõ lệnh nào. Việc của họ
           là cập nhật. Lệnh dành cho người đang phát triển nằm ở `details` — khối gập,
           đúng chỗ mà §3.9 luật ① dành cho bằng chứng kỹ thuật. */
        message: "Công cụ local đang chạy bản cũ, chưa có cửa xem prompt. Cập nhật KitGen rồi mở lại dự án.",
        details: [
          // kg-allow-jargon: một dòng lệnh phải gõ nguyên văn thì không dịch được sang
          // tiếng Việt; nó nằm trong khối gập «Chi tiết», không phải trong câu chính.
          "Đang phát triển? Khởi động agent của repo: npm run dev:full",
          error.message,
        ],
      };
    }

    /* KHÔNG NỐI ĐƯỢC. `transport` là kết luận của chính tầng vận chuyển (`client.ts`):
       "unreachable" = fetch không tới đích, "timeout" = tới được nhưng quá hạn. Cả hai
       đều KHÔNG phải lỗi của bản thiết kế, nên đừng bắt người dùng đi sửa nội dung. */
    if (error.transport === "unreachable" || error.transport === "timeout") {
      return {
        message: "Không nối được agent — công cụ local có đang chạy không? Bật lên rồi bấm «Thử lại».",
        details: [error.message],
      };
    }
  }

  const problem = promptPreviewProblem(error);
  return { message: problem.message, details: problem.details };
}

export function useBlockPrompts(projectId: string): BlockPrompts {
  const [byBlock, setByBlock] = React.useState<Record<string, BlockPromptState>>({});
  const [busy, setBusy] = React.useState(false);
  /* Dây chuyền một làn. Mỗi lời gọi nối vào đuôi lời gọi trước — kể cả khi lời
     trước hỏng (`catch` nuốt để dây không đứt giữa chừng). */
  const chainRef = React.useRef<Promise<void>>(Promise.resolve());
  const stateRef = React.useRef(byBlock);
  stateRef.current = byBlock;

  /**
   * ⚠️ CỜ ĐƯỢC BẬT Ở PHA VÀO, KHÔNG CHỈ HẠ Ở PHA RA. Đọc ① trong khối đầu file
   * trước khi rút gọn dòng này — bản `useEffect(() => () => {…}, [])` trông sạch
   * hơn và là chính con bọ "quay tròn không ra gì".
   */
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

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
        /* Đồng hồ dựng Ở ĐÂY, tức lúc lượt này THỰC SỰ tới lượt chạy — không phải
           lúc bấm. Người xếp hàng sau một lượt 60 giây không đáng bị tính là "quá
           hạn" ngay khi vừa tới phiên mình. */
        const ac = typeof AbortController === "undefined" ? null : new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;

        /**
         * ⚠️ `Promise.race`, KHÔNG PHẢI "chờ cú abort làm request tự hỏng".
         *
         * Bản đầu của lượt sửa này chỉ gọi `ac.abort()` trong đồng hồ rồi ngồi đợi
         * `catch` chạy. Nó dựa vào một giả định KHÔNG được bảo đảm: rằng thứ đang
         * treo có nghe `signal`. Ca test "promise không bao giờ settle" chứng minh
         * giả định ấy sai — và khi nó sai thì hậu quả đúng bằng con bọ ta đang chữa:
         * `catch`/`finally` không bao giờ chạy ⇒ state kẹt `loading`, `busy` kẹt
         * `true`, VÀ cả `chainRef` kẹt luôn nên MỌI thẻ khác cũng không xem được nữa.
         *
         * `race` biến hạn 75s thành một lời hứa CHẮC CHẮN kết thúc: sau ngần ấy giây,
         * đoạn này đi tiếp bằng chính chân nó, bất kể phía dưới còn treo hay không.
         * Cú `abort` vẫn gửi — để tiến trình engine phía agent được buông sớm — nhưng
         * nó không còn là điều kiện để UI thoát khỏi vòng xoay.
         */
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            ac?.abort(new PromptTimeout());
            reject(new PromptTimeout());
          }, PROMPT_TIMEOUT_MS);
        });

        try {
          const res = await Promise.race([
            api.contract.promptPreview(projectId, contract, ac?.signal),
            deadline,
          ]);
          if (!aliveRef.current) return;
          setByBlock((prev) => ({
            ...prev,
            [blockId]: { status: "ready", jobs: res.jobs, missing: res.missing, message: "", details: [], hash },
          }));
        } catch (error) {
          if (!aliveRef.current) return;
          const problem = describePromptError(error);
          setByBlock((prev) => ({
            ...prev,
            [blockId]: { ...EMPTY, status: "error", message: problem.message, details: problem.details, hash },
          }));
        } finally {
          clearTimeout(timer);
          inFlightRef.current -= 1;
          if (aliveRef.current && inFlightRef.current === 0) setBusy(false);
        }
      })
        /* ⚠️ DÂY CHUYỀN KHÔNG BAO GIỜ ĐƯỢC MANG MỘT LỜI HỨA HỎNG.
           `chainRef.current` không có ai `await`, nên một rejection lọt tới đây là một
           `unhandledRejection` — ở trình duyệt là một dòng đỏ trong console không ai
           đọc, ở test là một ca đỏ vì lý do không có thật. Thân ở trên đã `catch` mọi
           lỗi của lượt gọi; cái `catch` này canh phần CÒN LẠI (ví dụ `setByBlock` ném
           vì một reducer đời sau), và quan trọng hơn: nó giữ cho MẮT XÍCH SAU vẫn nối
           được. Dây đứt = mọi thẻ khác không xem prompt được nữa, im lặng. */
        .catch(() => {});
    },
    [projectId],
  );

  const stateOf = React.useCallback((blockId: string) => byBlock[blockId] ?? EMPTY, [byBlock]);

  return { stateOf, request, busy };
}
