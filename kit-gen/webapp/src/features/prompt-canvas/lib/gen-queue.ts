import * as React from "react";
import { AgentError } from "@/lib/api/client";
import { presentError } from "@/lib/api/errors";
import { useCancelRun, useRun, useRunStream } from "@/lib/hooks";
import { useGenerateRun } from "@/lib/hooks";
import { isRunLive } from "@/features/kit-core/lib/generated-results";

/**
 * gen-queue.ts — HÀNG ĐỢI VẼ PHÍA WEB, vì agent chỉ cho MỘT lượt mỗi dự án.
 *
 * ╔══ LUẬT CỦA AGENT, VÀ HỆ QUẢ KHÔNG TRÁNH ĐƯỢC ════════════════════════════╗
 * ║ `agent/lib/runs.mjs:104` — dự án đã có lượt chưa kết thúc thì lượt thứ hai ║
 * ║ nhận thẳng 409 `RUN_CONFLICT`. Nhưng màn prompt-first có nút Gen TRÊN TỪNG ║
 * ║ THẺ: người ta soạn xong ba thẻ rồi bấm Gen cả ba trong mười giây. Không có ║
 * ║ hàng đợi thì hai cú bấm sau là hai hộp lỗi đỏ — và người dùng học được      ║
 * ║ đúng một điều sai: "bấm nhanh là hỏng".                                    ║
 * ║                                                                          ║
 * ║ Hàng đợi này KHÔNG phải một hàng đợi ở server, và không giả vờ là vậy:     ║
 * ║ nó sống trong tab. Đóng tab là mất phần chưa phóng — nói thẳng ở UI bằng   ║
 * ║ chữ "đang chờ tấm trước", không hứa gì về lúc vắng mặt.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CŨNG BÁM CẢ RUN CỦA NGƯỜI KHÁC ═════════════════════════════════
 * Lượt đang chạy có thể không phải do màn này phóng (tab thứ hai, màn wizard cũ,
 * lượt còn sót từ trước khi mở trang). Khi POST trả 409, `details.runId` cho biết
 * lượt nào đang giữ chỗ — ta bám theo ĐÚNG lượt đó và thử lại khi nó xong, thay
 * vì thử lại theo đồng hồ. Không có vòng retry nào ở đây; mỗi lần thử là một sự
 * kiện có thật (một lượt vừa kết thúc).
 */

export type GenStatus = "idle" | "queued" | "running" | "done" | "fail";

/**
 * PHA CỦA MỘT CÚ BẤM, nhìn từ phía TẤM — không phải từ phía lượt chạy.
 *
 * ╔══ VÌ SAO `status` KHÔNG TRẢ LỜI ĐƯỢC ════════════════════════════════════╗
 * ║ `status` nói về THẺ và về hàng đợi: "đang xếp hàng" / "đang chạy". Nhưng   ║
 * ║ câu người dùng hỏi khi nhìn một ô ảnh là "tấm NÀY đang được vẽ, hay đang   ║
 * ║ đứng chờ?" — và hai câu ấy lệch nhau ở hai chỗ có thật: lượt chưa phóng    ║
 * ║ được (thẻ khác đang giữ chỗ), và lượt đã mở nhưng máy còn vẽ tấm khác.     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export type GenPhase = "idle" | "waiting" | "drawing" | "done" | "fail";

export interface GenBlockState {
  status: GenStatus;
  /** Câu hiện dưới nút — lý do chờ, tiến trình, hoặc lỗi. Rỗng khi không có gì để nói. */
  message: string;
  /** Lượt chạy của thẻ này (khi đã phóng). */
  runId: string | null;
  done: number;
  total: number;
  /**
   * TẤM NÀO THẬT SỰ NẰM TRONG LƯỢT `runId` — tên job, đúng thứ tự gửi đi.
   *
   * ╔══ VÌ SAO MỘT DANH SÁCH, KHÔNG PHẢI MỘT CỜ ═══════════════════════════════╗
   * ║ Một thẻ sinh NHIỀU tấm, nhưng một lượt vẽ có thể chỉ mang MỘT tấm: nút    ║
   * ║ «Vẽ lại tấm này» thu hẹp về đúng một tấm, và phép bỏ qua theo vân tay của ║
   * ║ agent cũng cắt bớt tấm chưa đổi. Trạng thái của CẢ THẺ không nói được     ║
   * ║ tấm nào trong số đó đang được vẽ — và đúng chỗ ấy con bọ 14/09 chui ra:   ║
   * ║ bấm vẽ lại tấm 2 thì CẢ HAI ô ảnh cùng hiện «Đang vẽ tấm này…», còn ảnh   ║
   * ║ đang có của tấm 1 thì biến mất.                                          ║
   * ║ Danh sách này để mỗi ô ảnh tự hỏi «có tôi trong lượt ấy không» — và nếu    ║
   * ║ KHÔNG thì nó đọc ảnh hiện hành của mình như chưa hề có lượt nào chạy.     ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Tấm bị agent giữ nguyên (vân tay chưa đổi) KHÔNG có mặt ở đây: nó không được
   * vẽ, nên nó cũng không được phép hiện khung chờ.
   */
  jobs: readonly string[];
  /**
   * TẤM ĐÃ XIN VẼ MÀ CHƯA CÓ ẢNH MỚI — danh sách CÒN NỢ của cú bấm này.
   *
   * ╔══ CON BỌ 15/09/2026: BẤM RỒI MÀ PANEL IM RE ════════════════════════════╗
   * ║ Bấm «Vẽ lại tấm này» lúc hàng đợi đang bận ⇒ thẻ vào hàng với `runId`     ║
   * ║ rỗng, nên CẢ `jobs` lẫn `drawing` đều rỗng, và panel của tấm KHÔNG hiện   ║
   * ║ một dấu hiệu nào. Chữ duy nhất nói ra là «Đang vẽ k/N» ở ĐẦU thẻ — phải   ║
   * ║ kéo lên mới thấy. Người dùng bấm lại, rồi lại, cho một hàng đợi vốn đã    ║
   * ║ nhận đủ.                                                                 ║
   * ║ Danh sách này biết ngay TỪ LÚC BẤM (vẽ một tấm ⇒ đúng tấm ấy; vẽ cả thẻ   ║
   * ║ ⇒ mọi tấm của thẻ), nên panel có thứ để bày trước cả khi agent mở lượt.   ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Nó CO LẠI hai lần, và cả hai lần đều để không hứa thừa:
   *  · agent trả lượt ⇒ thu về đúng `jobs` thật (tấm bị giữ nguyên vì vân tay
   *    chưa đổi thoát khỏi chờ ngay, không quay vòng tới hết lượt);
   *  · tấm nào vẽ xong (`ok`/`failed`) ⇒ rời danh sách, vì ảnh đã có trên đĩa.
   */
  requested: readonly string[];
  /**
   * TẤM MÁY ĐANG VẼ NGAY LÚC NÀY — job ở trạng thái `running`, tập con của `requested`.
   *
   * Từ 15/09/2026 danh sách này KHÔNG còn ôm cả job `queued`: agent ghi sẵn mọi
   * job là `queued` ngay lúc mở lượt, nên ôm cả chúng là bắt bốn tấm cùng hiện
   * «Đang vẽ tấm này…» trong khi máy mới cầm một tấm. Tấm còn `queued` nay nằm ở
   * `requested` và được nói đúng tên việc: đang chờ tới lượt.
   */
  drawing: readonly string[];
  /**
   * TẤM ĐÃ VẼ XONG TRONG LƯỢT NÀY **VÀ ĐÃ CÓ ẢNH BẤT BIẾN** — tập con của `jobs`.
   *
   * ╔══ CON BỌ 15/09/2026, NỬA SAU ═══════════════════════════════════════════╗
   * ║ Bấm «Vẽ lại tấm này» ⇒ panel hiện đúng dải «Đang chờ tới lượt…», NHƯNG ô  ║
   * ║ ảnh ngay dưới đỏ lên «Thiếu file · Thử lại», kèm câu «Đây là ảnh của đúng ║
   * ║ lượt chạy này». Hai chỉ báo cãi nhau trên cùng một panel.                 ║
   * ║ Gốc: `jobs` trả lời câu «lượt này MANG tấm nào», và ô ảnh lại dùng nó để  ║
   * ║ trả lời một câu KHÁC HẲN — «tấm này đã có ảnh trong thư mục của lượt      ║
   * ║ chưa». Agent ghi tên mọi job vào `run.json` NGAY lúc mở lượt (`queued`),  ║
   * ║ còn `runs/<lượt>/artifacts/<tấm>.png` thì chỉ ra đời khi vẽ xong. Quãng   ║
   * ║ giữa hai mốc ấy — vài giây tới vài phút — ô ảnh đi xin một file chưa tồn  ║
   * ║ tại, và bức ảnh đang có trên đĩa (`raw/<tấm>.png`) thì bị bỏ lại.         ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Nên danh sách này chỉ nhận tấm có ĐỦ HAI bằng chứng trong bản kê của lượt:
   * trạng thái đã kết (không còn `queued`/`running`, không `failed`) VÀ có đường
   * ảnh thật. Thiếu một trong hai ⇒ ô ảnh đọc bản hiện hành, đúng thứ đang treo
   * trên màn trước cú bấm.
   */
  drawn: readonly string[];
  /** Pha NHÌN TỪ TẤM — xem `GenPhase`. */
  phase: GenPhase;
}

const IDLE: GenBlockState = {
  status: "idle", message: "", runId: null, done: 0, total: 0,
  jobs: [], requested: [], drawing: [], drawn: [], phase: "idle",
};

/** Câu DUY NHẤT cho ca "phải đợi tấm trước" — hai chỗ nói hai kiểu là hai sự thật. */
export const WAITING_COPY = "Đang chờ tấm trước";

/**
 * CÂU NÓI RA TẤM NÀO ĐƯỢC GIỮ NGUYÊN.
 *
 * ╔══ VÌ SAO PHẢI NÓI, KHÔNG ĐƯỢC IM ════════════════════════════════════════╗
 * ║ Agent bỏ qua tấm có vân tay chưa đổi, nên một cú bấm Vẽ trên thẻ hai tấm  ║
 * ║ có thể chỉ vẽ một. Không nói ra thì người dùng đọc «Đang vẽ 1/2» rồi tưởng║
 * ║ tấm kia lỗi — và bấm Vẽ lại, đúng cái việc mà phép bỏ qua sinh ra để khỏi ║
 * ║ phải làm. Câu này trả lời thẳng: tấm ấy KHÔNG hỏng, nó chỉ chưa đổi gì.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * `indexes` đếm từ 0 theo thứ tự tấm của thẻ; chữ hiện ra thì đếm từ 1.
 */
export function keptCopy(indexes: readonly number[], total: number): string {
  if (indexes.length === 0) return "";
  const names = indexes.map((at) => `Tấm ${at + 1}`).join(" · ");
  if (indexes.length >= total && total > 1) return `Cả ${total} tấm giữ nguyên, chưa đổi gì.`;
  return `${names} giữ nguyên, chưa đổi gì.`;
}

interface Entry {
  blockId: string;
  /** MỌI tấm của thẻ, theo thứ tự — nguồn để gọi tên «Tấm 2» và để cắt ra một tấm. */
  all: string[];
  /**
   * Tấm THẬT SỰ ĐANG ĐƯỢC VẼ trong lượt này — tức tấm đã gửi TRỪ tấm agent giữ
   * nguyên vì vân tay chưa đổi. Đây là con số mà «Đang vẽ k/N» rơi về khi chưa có
   * tiến trình của agent, và là danh sách mà mỗi ô ảnh tra tên mình vào.
   */
  jobs: string[];
  /**
   * TẤM ĐÃ XIN — điền NGAY LÚC BẤM, trước khi biết agent nhận cái nào.
   *
   * Trước khi lượt phóng được, đây là thứ DUY NHẤT nói được "tấm nào đang chờ":
   * `all`/`jobs` còn rỗng vì `prepare` chỉ chạy lúc phóng. Lúc lượt trả về thì nó
   * thu ngay về `jobs` thật — xem `GenBlockState.requested`.
   * Rỗng khi nơi gọi không cấp `jobsOf` (vỏ test cũ): hàng đợi vẫn chạy y như cũ,
   * chỉ là không có gì để bày sớm.
   */
  requested: string[];
  /**
   * VẼ LẠI RIÊNG TẤM THỨ MẤY (đếm từ 0); `null` = cả thẻ.
   *
   * Vẽ lẻ cũng là ÉP VẼ: người dùng bấm «Vẽ lại tấm này» khi bức ảnh xấu, tức là
   * mô tả KHÔNG đổi và vân tay vẫn trùng — không ép thì agent bỏ qua đúng cái tấm
   * họ vừa xin, và nút ấy thành một nút bấm vào không có gì xảy ra.
   */
  only: number | null;
  /** Lượt của chính thẻ này; `null` = chưa phóng được (đang xếp hàng). */
  runId: string | null;
  message: string;
}

export interface GenQueue {
  stateOf: (blockId: string) => GenBlockState;
  /**
   * Đưa một thẻ vào cuối hàng. Thẻ đã ở trong hàng ⇒ không làm gì.
   * `onlySheet` (đếm từ 0) ⇒ chỉ vẽ lại ĐÚNG tấm ấy, và ép vẽ — xem `Entry.only`.
   */
  enqueue: (blockId: string, onlySheet?: number) => void;
  /**
   * Đưa NHIỀU thẻ vào cuối hàng, giữ nguyên thứ tự đưa vào.
   *
   * ╔══ VÌ SAO KHÔNG PHẢI `ids.forEach(enqueue)` ══════════════════════════════╗
   * ║ `enqueue` là một `setState` với hàm cập nhật, nên gọi n lần trong một     ║
   * ║ trình xử lý sự kiện thì React gộp chúng lại và kết quả ĐÚNG. Nhưng nó     ║
   * ║ cũng gọi `setSettled` n lần, và mỗi lượt dựng một object mới cho cả bảng  ║
   * ║ — với hai chục thẻ thì đó là hai chục lần chép bảng để xoá đúng một khoá. ║
   * ║ Quan trọng hơn: nút «Vẽ tất cả» cần một hành động ĐƠN để nói về ("đã xếp  ║
   * ║ 7 thẻ"), chứ không phải bảy hành động rời mà nó tự đếm hộ.                ║
   * ╚═════════════════════════════════════════════════════════════════════════╝
   */
  enqueueMany: (blockIds: readonly string[]) => void;
  /** Bỏ một thẻ ĐANG CHỜ khỏi hàng. Thẻ đang chạy thì không bỏ được (đã tiêu lượt). */
  dequeue: (blockId: string) => void;
  /**
   * DỪNG thẻ ĐANG VẼ: gọi `#36 cancel` lên đúng lượt của nó. Lượt đã tiêu nên
   * không hoàn lại được; cái dừng được là thời gian chờ và hàng đợi phía sau
   * (thẻ kế phóng ngay khi agent phát `run.finished` với trạng thái cancelled).
   *
   * Đời trước ghi ở `dequeue`: "muốn dừng thì đó là chuyện của nút Dừng ở màn
   * lượt chạy". Màn ấy đã bị bỏ (chỉ còn một màn /k), nên lời hẹn đó rơi vào
   * khoảng không — chủ sản phẩm hỏi thẳng "không có nút stop vẽ à". Đây là nút đó.
   */
  stop: (blockId: string) => void;
  /** Thẻ đang được gửi lệnh dừng (đợi agent xác nhận) — để nút hiện «Đang dừng…». */
  stopping: string | null;
  /**
   * Bỏ MỌI thẻ chưa phóng khỏi hàng. Thẻ đang chạy ở lại — nó đã tiêu lượt rồi,
   * và dừng nó là việc của nút Dừng ở màn lượt chạy, không phải của hàng đợi.
   */
  clearWaiting: () => void;
  /** Thẻ đang trong hàng (kể cả thẻ đang chạy), THEO THỨ TỰ. */
  pending: string[];
  /** Số thẻ đang chờ tới lượt (không kể thẻ đang chạy). */
  waiting: number;
  activeRunId: string | null;
}

/**
 * @param prepare Việc phải làm NGAY TRƯỚC khi phóng một thẻ: chụp ảnh dáng nếu
 *   thiếu, dựng contract mới nhất, PUT lên server — rồi trả về danh sách job của
 *   thẻ ấy, ĐỦ CẢ THẺ và ĐÚNG THỨ TỰ TẤM (hàng đợi tự cắt ra một tấm khi vẽ lẻ). Ném ⇒ thẻ vào trạng thái lỗi và hàng đợi đi tiếp.
 *   Nó chạy ở ĐÚNG lúc phóng chứ không lúc bấm: thẻ thứ ba có thể đợi vài phút,
 *   và trong lúc ấy người dùng còn sửa chữ — thứ được vẽ phải là bản mới nhất.
 * @param jobsOf Tên job của một thẻ, ĐỌC ĐƯỢC NGAY LÚC BẤM (đồng bộ, đúng thứ tự
 *   tấm). Khác `prepare` ở chỗ nó KHÔNG đi mạng và KHÔNG hứa hẹn gì: nó chỉ trả
 *   lời "cú bấm này xin những tấm nào", để panel của từng tấm có cái mà bày trong
 *   lúc còn xếp hàng. Vắng ⇒ không có chỉ báo sớm, mọi thứ khác y nguyên.
 */
export function useGenQueue(
  projectId: string,
  prepare: (blockId: string) => Promise<string[]>,
  jobsOf?: (blockId: string) => readonly string[],
): GenQueue {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [settled, setSettled] = React.useState<Record<string, GenBlockState>>({});
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);

  const gen = useGenerateRun(projectId);
  const cancel = useCancelRun(projectId);
  const [stopping, setStopping] = React.useState<string | null>(null);
  const run = useRun(activeRunId, { poll: false });
  /* Stream để tiến trình chạy MƯỢT: nó đẩy `progress`/`job.done` thẳng vào cache
     của Query, tức chính chỗ `useRun` ở trên đọc. Không có state song song. */
  useRunStream(activeRunId, { enabled: Boolean(activeRunId) });

  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;
  const prepareRef = React.useRef(prepare);
  prepareRef.current = prepare;
  const jobsOfRef = React.useRef(jobsOf);
  jobsOfRef.current = jobsOf;
  const startRef = React.useRef(gen.startJobs);
  startRef.current = gen.startJobs;
  /* Một lượt phóng đang bay. `useRef` chứ không `useState`: nó là cái KHOÁ, và
     một cái khoá đặt bằng state thì hai effect chạy trong cùng một nhịp render
     đều thấy nó chưa khoá. */
  const launchingRef = React.useRef(false);

  const head = entries[0] ?? null;

  /* ── Phóng thẻ đầu hàng ────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!head || head.runId || activeRunId || launchingRef.current) return;
    launchingRef.current = true;
    const blockId = head.blockId;

    const only = head.only;

    void (async () => {
      try {
        const all = await prepareRef.current(blockId);
        if (all.length === 0) throw new Error("Thẻ này chưa có gì để vẽ — thêm nội dung trước đã.");
        /* Cắt ra ĐÚNG một tấm khi vẽ lẻ. Chỉ số ngoài khoảng (thẻ vừa bị sửa bớt
           dòng giữa lúc chờ) ⇒ rơi về cả thẻ thay vì gửi một mảng rỗng: một lượt
           vẽ 0 tấm là một cú bấm không có kết quả và không có lời giải thích. */
        const one = only !== null ? all[only] : undefined;
        const jobs = one ? [one] : all;
        const res = await startRef.current(jobs, only !== null);
        /* Tấm agent GIỮ NGUYÊN → chỉ số tấm trong thẻ, để câu chữ gọi đúng tên. */
        const keptJobs = new Set((res.skipped ?? []).map((item) => item.job));
        const kept = (res.skipped ?? [])
          .map((item) => all.indexOf(item.job))
          .filter((at) => at >= 0)
          .sort((a, b) => a - b);
        /* Tấm CÒN LẠI mới là lượt vẽ thật. Giữ cả tấm bị bỏ qua trong danh sách này
           là vừa đếm sai «Đang vẽ k/N», vừa bắt ô ảnh của một tấm không ai đụng tới
           phải hiện khung chờ cho tới hết lượt. */
        const live = jobs.filter((job) => !keptJobs.has(job));
        if (!res.runId) {
          /* KHÔNG CÓ LƯỢT NÀO ĐƯỢC PHÓNG — mọi tấm được xin đều còn nguyên vân tay.
             Đây là ca XONG, không phải ca lỗi: kết quả người dùng muốn đã nằm sẵn
             trên màn, và không một lượt tạo nào bị tiêu. */
          setSettled((prev) => ({
            ...prev,
            [blockId]: {
              ...IDLE, status: "done", phase: "done", done: 0, total: 0,
              message: keptCopy(kept, all.length) || "Chưa có gì đổi nên không vẽ lại.",
            },
          }));
          setEntries((prev) => prev.filter((e) => e.blockId !== blockId));
          return;
        }
        /* THU DANH SÁCH CHỜ VỀ ĐÚNG SỰ THẬT: từ đây trở đi "tấm đã xin" chính là
           "tấm của lượt". Tấm bị giữ nguyên rời khung chờ NGAY, không phải đợi
           tới lúc lượt chốt sổ — nó có được vẽ đâu mà chờ. */
        setEntries((prev) => prev.map((e) => (
          e.blockId === blockId
            ? { ...e, all, jobs: live, requested: live, runId: res.runId, message: keptCopy(kept, all.length) }
            : e
        )));
        setActiveRunId(res.runId);
      } catch (error) {
        const conflictRun = runIdOfConflict(error);
        if (conflictRun) {
          /* Có lượt khác đang giữ chỗ. Giữ thẻ NGUYÊN VỊ TRÍ trong hàng và bám
             theo lượt kia — khi nó xong, effect này chạy lại đúng một lần. */
          setEntries((prev) => prev.map((e) => (e.blockId === blockId ? { ...e, message: WAITING_COPY } : e)));
          setActiveRunId(conflictRun);
          return;
        }
        setSettled((prev) => ({
          ...prev,
          [blockId]: { ...IDLE, status: "fail", phase: "fail", message: failCopy(error) },
        }));
        setEntries((prev) => prev.filter((e) => e.blockId !== blockId));
      } finally {
        launchingRef.current = false;
      }
    })();
  }, [head, activeRunId]);

  /* ── Lượt kết thúc ⇒ chốt sổ thẻ đó và mở đường cho thẻ kế ─────────────── */
  React.useEffect(() => {
    const data = run.data;
    if (!activeRunId || !data || data.id !== activeRunId || isRunLive(data.status)) return;

    const owner = entriesRef.current.find((e) => e.runId === activeRunId);
    if (owner) {
      const failed = data.jobs.filter((job) => job.status === "failed");
      /* Lượt chết rồi thì danh sách này ĐÓNG BĂNG: tấm nào đã có ảnh trong thư mục
         của lượt thì neo vào đó mãi, tấm hỏng giữa chừng thì ở lại với bản hiện hành. */
      const drawn = drawnJobs(owner.jobs, data);
      setSettled((prev) => ({
        ...prev,
        [owner.blockId]: failed.length
          ? {
              ...IDLE,
              status: "fail",
              phase: "fail",
              runId: activeRunId,
              total: data.jobs.length,
              /* Danh sách sống TIẾP sau khi lượt chết: ô ảnh vẫn phải biết tấm nào
                 thuộc lượt `runId` này để đọc đúng ảnh bất biến của nó — và tấm
                 KHÔNG thuộc lượt thì vẫn đọc ảnh hiện hành của mình. */
              jobs: owner.jobs,
              drawn,
              /* LÝ DO, KHÔNG CHỈ CON SỐ. `failSummary` là câu agent đã gộp sẵn
                 (kiểu «2/3 job không ghi được ảnh · 1 nghi chạm giới hạn tạo
                 ảnh») — dùng nguyên văn để mọi bề mặt nói cùng một câu, đúng luật
                 mà `run-line.ts` đã theo. Thiếu nó (agent bản cũ) thì rơi về con số như trước. Câu cuối
                 là việc người dùng làm tiếp: nút Vẽ ngay bên dưới chính là nút vẽ lại
                 thẻ này. (Tấm nền ĐỤC không tới đây: từ 09/09/2026 nó là một job XONG,
                 chỉ mang chú thích cạnh ảnh — xem `SheetResultPanel`.) */
              message:
                data.status === "cancelled"
                  ? "Lượt vẽ đã bị dừng."
                  : `${data.failSummary ?? `${failed.length}/${data.jobs.length} tấm không vẽ được`}. Bấm Vẽ để thử lại.`,
            }
          : {
              ...IDLE, status: "done", phase: "done", runId: activeRunId,
              done: data.jobs.length, total: data.jobs.length,
              jobs: owner.jobs,
              drawn,
              /* Câu "tấm nào giữ nguyên" sống tới tận lúc chốt sổ: nó là lời giải
                 thích cho con số «1/2» mà người dùng vừa nhìn thấy chạy qua. */
              message: owner.message,
            },
      }));
      setEntries((prev) => prev.filter((e) => e.blockId !== owner.blockId));
    }
    setActiveRunId(null);
  }, [run.data, activeRunId]);

  const stateOf = React.useCallback(
    (blockId: string): GenBlockState => {
      const entry = entries.find((e) => e.blockId === blockId);
      if (!entry) return settled[blockId] ?? IDLE;
      if (!entry.runId) {
        /* CHƯA CÓ LƯỢT, NHƯNG ĐÃ CÓ LỜI HỨA. Danh sách tấm đã xin đi ra từ đây,
           và đó là toàn bộ chỗ dựa của khung chờ dưới mỗi tấm trong lúc thẻ còn
           xếp hàng — trước lượt này quãng ấy hoàn toàn câm. */
        return {
          ...IDLE, status: "queued", phase: "waiting",
          message: entry.message || WAITING_COPY,
          requested: entry.requested,
        };
      }
      const payload = run.data?.id === entry.runId ? run.data : null;
      const progress = payload?.progress ?? null;
      const kept = entry.message ? ` · ${entry.message}` : "";
      /* Tên pha rút ra TRƯỚC khi ghép câu — xem chú thích cùng kiểu ở `OnePrompt`
         (`CanvasBlock.tsx`): cổng từ cấm quét cả biểu thức trong chuỗi mẫu. */
      const phase = run.data?.phase?.name ?? "";
      const drawing = runningJobs(entry.jobs, payload);
      const owed = owedJobs(entry.jobs, payload);
      return {
        status: "running",
        message: phase ? `Đang vẽ · ${phase}${kept}` : `Đang vẽ…${kept}`,
        runId: entry.runId,
        done: progress?.done ?? 0,
        total: progress?.total ?? entry.jobs.length,
        jobs: entry.jobs,
        requested: owed,
        drawing,
        drawn: drawnJobs(entry.jobs, payload),
        /* Không tấm nào còn nợ ⇒ lượt sắp chốt sổ, gọi là "đang vẽ" chứ không phải
           "đang chờ": chờ cái gì nữa khi mọi tấm đã có ảnh? */
        phase: drawing.length > 0 || owed.length === 0 ? "drawing" : "waiting",
      };
    },
    [entries, settled, run.data],
  );

  const enqueue = React.useCallback((blockId: string, onlySheet?: number) => {
    setSettled((prev) => {
      if (!(blockId in prev)) return prev;
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    setEntries((prev) => (prev.some((e) => e.blockId === blockId)
      ? prev
      : [...prev, {
          blockId, all: [], jobs: [], requested: askedJobs(jobsOfRef.current, blockId, onlySheet),
          only: onlySheet ?? null, runId: null, message: WAITING_COPY,
        }]));
  }, []);

  const enqueueMany = React.useCallback((blockIds: readonly string[]) => {
    setSettled((prev) => {
      /* Chỉ dựng lại bảng khi CÓ gì để xoá — thẻ chưa từng vẽ không có mục nào ở
         đây, và ca thường gặp của «Vẽ tất cả» là một bộ kit chưa vẽ lần nào. */
      const stale = blockIds.filter((id) => id in prev);
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const id of stale) delete next[id];
      return next;
    });
    setEntries((prev) => {
      const fresh = blockIds
        .filter((id) => !prev.some((e) => e.blockId === id))
        /* Khử trùng lặp NGAY TRONG danh sách đưa vào: hai lần cùng một thẻ là hai
           lượt vẽ cùng một tấm, tức là tiêu tiền hai lần cho một kết quả. */
        .filter((id, at, all) => all.indexOf(id) === at)
        .map((blockId) => ({
          blockId, all: [] as string[], jobs: [] as string[],
          requested: askedJobs(jobsOfRef.current, blockId, undefined),
          only: null, runId: null, message: WAITING_COPY,
        }));
      return fresh.length === 0 ? prev : [...prev, ...fresh];
    });
  }, []);

  const dequeue = React.useCallback((blockId: string) => {
    /* CHỈ bỏ được thẻ chưa phóng. Thẻ đang chạy đã tiêu lượt rồi — muốn dừng thì
       đó là chuyện của nút Dừng ở màn lượt chạy, không phải "bỏ khỏi hàng". */
    setEntries((prev) => prev.filter((e) => e.blockId !== blockId || e.runId !== null));
  }, []);

  const stop = React.useCallback((blockId: string) => {
    const entry = entriesRef.current.find((e) => e.blockId === blockId && e.runId !== null);
    if (!entry?.runId) return;
    setStopping(blockId);
    /* Không tự "chốt sổ" thẻ ở đây: agent là người biết lượt đã chết hay chưa.
       Nó phát `run.finished{cancelled}` ⇒ effect "Lượt kết thúc" phía trên ghi
       "Lượt vẽ đã bị dừng." và mở đường cho thẻ kế — đúng con đường của mọi
       lượt khác, không có nhánh riêng cho ca dừng. */
    cancel.mutateAsync(entry.runId)
      .catch(() => { /* lỗi mạng: nút trở lại «Dừng», người dùng bấm lại */ })
      .finally(() => setStopping((cur) => (cur === blockId ? null : cur)));
  }, [cancel]);

  const clearWaiting = React.useCallback(() => {
    setEntries((prev) => prev.filter((e) => e.runId !== null));
  }, []);

  return {
    stateOf,
    enqueue,
    enqueueMany,
    dequeue,
    stop,
    stopping,
    clearWaiting,
    pending: entries.map((e) => e.blockId),
    waiting: entries.filter((e) => e.runId === null).length,
    activeRunId,
  };
}

/** Bản kê job của một lượt, đúng hình dạng `#33`/`#34` trả về. */
type RunListing = {
  jobs?: readonly {
    job: string;
    status?: string;
    /* Ảnh BẤT BIẾN của tấm trong lượt. Vắng ⇒ agent chưa chép được gì sang thư mục
       của lượt, nên không có gì để neo vào — dù trạng thái nói gì đi nữa. */
    artifact?: { path?: string } | null;
  }[];
} | null;

/**
 * TẤM MỘT CÚ BẤM XIN VẼ — biết ngay lúc bấm, không đợi đi mạng.
 *
 * Chỉ số ngoài khoảng (thẻ vừa bị sửa bớt dòng giữa lúc chờ) ⇒ rơi về CẢ THẺ,
 * đúng như nhánh phóng lượt ở trên: hai chỗ đoán khác nhau thì khung chờ sẽ mọc
 * trên một tấm mà lượt không hề mang theo.
 */
function askedJobs(
  jobsOf: ((blockId: string) => readonly string[]) | undefined,
  blockId: string,
  only: number | undefined,
): string[] {
  const all = jobsOf?.(blockId) ?? [];
  if (only === undefined || only === null) return [...all];
  const one = all[only];
  return one ? [one] : [...all];
}

/**
 * TẤM MÁY ĐANG CẦM TRONG TAY ngay lúc này — job `running`, không hơn.
 *
 * ╔══ VÌ SAO KHÔNG TÍNH CẢ `queued` (ĐỔI Ý 15/09/2026) ══════════════════════╗
 * ║ `agent/lib/runs.mjs:156` ghi SẴN mọi job là `queued` ngay lúc mở lượt, và ║
 * ║ engine chỉ đẩy từng job sang `running` khi thật sự bắt đầu vẽ nó           ║
 * ║ (`run-handle.mjs:438`). Gộp `queued` vào đây là bắt cả bốn tấm của thẻ     ║
 * ║ cùng hiện «Đang vẽ tấm này…» trong khi máy mới cầm một tấm — ba lời hứa     ║
 * ║ sai, và ba bức ảnh đang có bị khung chờ đẩy ra khỏi màn.                    ║
 * ║ Tấm `queued` KHÔNG mất chỉ báo: nó nằm ở `requested` và được gọi đúng tên  ║
 * ║ việc — đang chờ tới lượt.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Chưa lấy được bản kê (lượt vừa phóng, `#33` chưa trả) ⇒ CHƯA tấm nào đang vẽ.
 * Quãng ấy `owedJobs` phủ kín bằng khung chờ, nên không có khoảng trống nào.
 */
function runningJobs(jobs: readonly string[], run: RunListing): string[] {
  const listed = run?.jobs ?? [];
  if (listed.length === 0) return [];
  return jobs.filter((job) => listed.find((item) => item.job === job)?.status === "running");
}

/**
 * TẤM CÒN NỢ MỘT BỨC ẢNH — `queued`, `running`, hoặc chưa có tên trong bản kê.
 *
 * Tấm vẽ xong giữa chừng chuyển sang `ok` và rời khỏi đây ngay: ảnh của nó đã nằm
 * trên đĩa rồi, để nó quay vòng chờ thêm vài phút nữa là nói dối. Tấm `failed`
 * cũng rời — lượt sẽ chốt sổ bằng câu lỗi, không phải bằng một khung chờ đứng mãi.
 *
 * Chưa có bản kê ⇒ coi cả lượt còn nợ: đó là sự thật gần đúng duy nhất có trong
 * tay, và nó sai về phía an toàn (bày khung chờ thừa, không phải giấu mất chờ).
 */
function owedJobs(jobs: readonly string[], run: RunListing): string[] {
  const listed = run?.jobs ?? [];
  if (listed.length === 0) return [...jobs];
  return jobs.filter((job) => {
    const found = listed.find((item) => item.job === job);
    return !found || found.status === "queued" || found.status === "running";
  });
}

/**
 * TẤM ĐÃ CÓ ẢNH BẤT BIẾN TRONG LƯỢT — đủ điều kiện để ô ảnh neo vào thư mục lượt.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG `jobs` CHO VIỆC NÀY ═════════════════════════════════╗
 * ║ `agent/lib/runs.mjs:156` ghi SẴN tên mọi job vào `run.json` lúc mở lượt,   ║
 * ║ trạng thái `queued`, và `runs/<lượt>/artifacts/<tấm>.png` chỉ ra đời sau   ║
 * ║ khi vẽ xong. Nên "có tên trong lượt" KHÔNG đồng nghĩa "có ảnh của lượt":   ║
 * ║ lấy cái nọ trả lời cái kia là bắt ô ảnh xin một file chưa tồn tại và bày   ║
 * ║ ô đỏ, trong khi bản hiện hành nằm ngay trên đĩa.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Hai bằng chứng, thiếu một là không neo:
 *  · trạng thái đã KẾT — `queued`/`running` là chưa xong, `failed`/`never` là
 *    không có ảnh nào để mà neo;
 *  · có ĐƯỜNG ẢNH thật trong bản kê — thứ duy nhất chứng minh agent đã chép
 *    xong snapshot sang thư mục của lượt.
 */
function drawnJobs(jobs: readonly string[], run: RunListing): string[] {
  const listed = run?.jobs ?? [];
  if (listed.length === 0) return [];
  return jobs.filter((job) => {
    const found = listed.find((item) => item.job === job);
    if (!found) return false;
    const status = found.status ?? "";
    if (status === "queued" || status === "running" || status === "failed" || status === "never") return false;
    return typeof found.artifact?.path === "string" && found.artifact.path !== "";
  });
}

/** `runId` của 409 RUN_CONFLICT / RUN_ACTIVE; rỗng ⇒ không phải ca chờ lượt. */
function runIdOfConflict(error: unknown): string | null {
  if (!(error instanceof AgentError)) return null;
  if (error.code !== "RUN_CONFLICT" && error.code !== "RUN_ACTIVE") return null;
  const details = error.details;
  if (!details || typeof details !== "object") return null;
  const runId = (details as Record<string, unknown>)["runId"];
  return typeof runId === "string" && runId ? runId : null;
}

/** Câu lỗi cho thẻ. Lỗi của agent đi qua bảng chung; lỗi của ta thì nói nguyên văn. */
function failCopy(error: unknown): string {
  if (error instanceof AgentError) {
    const v = presentError(error);
    return `${v.title}. ${v.explain}`;
  }
  return error instanceof Error ? error.message : String(error);
}
