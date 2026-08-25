import type { Run, RunJob } from "@/lib/types";

export type ResultCategory = "background" | "popup" | "ui" | "prop" | "mascot" | "other";
export type ResultGroup = ResultCategory | "all";

/**
 * TRẠNG THÁI HIỂN THỊ CỦA MỘT Ô KẾT QUẢ — theo VÒNG ĐỜI THẬT của lượt chạy.
 *
 * Bệnh cũ: màn "Ảnh đã tạo" chỉ hỏi `item.path` có hay không. Vừa bấm Tạo ảnh xong,
 * chưa job nào kịp ghi `raw/<job>.png`, nên MỌI thẻ hiện icon đỏ + "Chưa tạo được ảnh"
 * — đọc ra là "hỏng hết" trong khi thật ra là "chưa chạy tới". Trạng thái phải đọc từ
 * `run.status` + `job.status` (agent phát qua NDJSON `job.started`/`job.done`/`progress`).
 */
export type ResultState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface GeneratedResultItem {
  job: string;
  sheet: string;
  variant: string;
  category: ResultCategory;
  status: RunJob["status"];
  /** Trạng thái để VẼ — xem `ResultState`. */
  state: ResultState;
  diagnosis: RunJob["diagnosis"];
  path: string | null;
  geometryOk: boolean | null;
  invalidCells: number;
}

export interface GeneratedRunGroup {
  id: string;
  at: string | null;
  status: Run["status"];
  /** true ⇒ lượt còn đang chạy: UI phải hiện tiến trình + nút Dừng, không hiện lỗi. */
  live: boolean;
  items: GeneratedResultItem[];
}

/* ══════════════════════════════════════════════════════════════════════════
   1. Id sheet → nhóm quản lý
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tách id sheet thành GỐC + SỐ THỨ TỰ TRONG DÃY.
 *
 * `kitset-to-contract.ts` (`seriesId`) đánh số dãy theo đúng quy ước `styles.json`:
 * `ui`, `ui2`, `ui3`… — **không** có dấu gạch trước số. Bản cũ của `categoryOfSheet`
 * chỉ khớp `^(small|ui)(-|$)`, nên `ui2` rơi thẳng vào "Khác"; `sheetLabel` thì chỉ
 * bắt `-(\d+)$` nên cũng mất số. Đó là gốc của hai triệu chứng người dùng thấy:
 * thẻ Nền/ui2 nằm nhóm "Khác" ở trang tổng, còn trang nhóm "Nền" thì RỖNG (lọc
 * `categoryOfSheet(sheet.id) === "background"` không khớp id thật là `nen`).
 */
export function sheetSeries(sheet: string): { base: string; index: number } {
  const value = String(sheet ?? "").trim().toLowerCase();
  const m = /^(.*[^0-9-])-?(\d+)$/.exec(value);
  if (!m) return { base: value, index: 1 };
  return { base: m[1]!, index: Number(m[2]) };
}

/** Sheet ô dọc dùng hậu tố `-doc` (`popup-doc`, `ui-doc`); nhóm vẫn là nhóm gốc. */
const headOf = (base: string): string => base.replace(/-doc$/, "");

/**
 * Nhóm của một sheet. Danh sách nhận diện phải phủ CẢ id do wizard sinh ra
 * (`nen`, `popup`, `popup-doc`, `ui`, `ui-doc`, `dao-cu`, `pose-<nhân vật>`) LẪN id
 * của `styles.json` đời cũ (`bg-home`, `main`, `tall`, `pose-lan`) — dự án nhập từ
 * bản cũ vẫn phải xếp đúng chỗ chứ không dồn vào "Khác".
 */
export function categoryOfSheet(sheet: string): ResultCategory {
  const head = headOf(sheetSeries(sheet).base);
  if (/^(nen|bg|background)(-|$)/.test(head)) return "background";
  if (/^(popup|modal|panel)(-|$)/.test(head)) return "popup";
  if (/^(pose|mascot|character|nhan-vat)(-|$)/.test(head)) return "mascot";
  if (/^(dao-cu|prop|item)(-|$)/.test(head)) return "prop";
  if (/^(ui|small|main|tall)(-|$)/.test(head)) return "ui";
  return "other";
}

const CATEGORY_LABEL: Record<ResultCategory, string> = {
  background: "Nền", popup: "Popup", ui: "UI nhỏ", prop: "Đạo cụ", mascot: "Mascot pose", other: "Khác",
};

/** Nhãn nhóm dùng chung cho chip, tiêu đề nhóm và câu xác nhận "tạo lại nhóm …". */
export function groupLabel(group: Exclude<ResultGroup, "all">): string {
  return CATEGORY_LABEL[group];
}

/**
 * THỨ TỰ CÁC KHỐI trên trang "Ảnh đã tạo" — một trang cuộn dọc, mỗi nhóm một khối.
 *
 * Hàng chip lọc nhóm đã bỏ (chủ sản phẩm: "BỎ CÁI ĐOẠN BUTTON PILL Ở TẤT CẢ THÀNH
 * PHẨM"), nên thứ tự này là thứ tự người dùng CUỘN QUA, không còn là thứ tự chip.
 * Mascot đứng đầu vì nó là thứ người ta soi kỹ nhất; "Khác" đứng cuối vì nó là rổ đựng
 * sheet không nhận ra được.
 */
export const RESULT_GROUP_ORDER: readonly ResultCategory[] = [
  "mascot", "background", "popup", "ui", "prop", "other",
];

/**
 * `id` của khối một nhóm trong trang. Đây là chỗ DUY NHẤT biết hình dạng anchor đó,
 * vì hai bên phải khớp nhau: nơi VẼ khối (lưới ô đã cắt, lưới sheet gốc) và nơi CUỘN
 * TỚI khi URL còn mang `?group=` của bản cũ.
 */
export function groupAnchorId(group: Exclude<ResultGroup, "all">): string {
  return `nhom-${group}`;
}

/** Tên tiếng Việt của một sheet: `nen2` → "Nền 2", `ui-doc` → "UI nhỏ dọc". */
export function sheetLabel(sheet: string): string {
  const { base, index } = sheetSeries(sheet);
  const category = categoryOfSheet(sheet);
  if (category === "other") return String(sheet).replaceAll("-", " ");
  const orient = /-doc$/.test(base) ? " dọc" : "";
  const number = index > 1 ? ` ${index}` : "";
  return `${CATEGORY_LABEL[category]}${orient}${number}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Vòng đời lượt chạy
   ══════════════════════════════════════════════════════════════════════════ */

/** Lượt chạy còn đang sống (agent chưa ghi `finishedAt`). */
export function isRunLive(status: Run["status"]): boolean {
  return status === "running" || status === "queued";
}

/**
 * Trạng thái để vẽ một ô.
 *
 * `run-handle.mjs:326` — khi người dùng DỪNG, job đang chờ/đang chạy bị đưa về
 * `queued` (chứ không phải `failed`), đúng ý "chưa tiêu quota". Vì vậy job `queued`
 * trong một run `cancelled` phải đọc là **đã dừng**, không phải lỗi.
 */
export function resultStateOf(
  runStatus: Run["status"],
  jobStatus: RunJob["status"],
): ResultState {
  if (jobStatus === "ok") return "done";
  if (jobStatus === "failed") return "failed";
  if (isRunLive(runStatus)) return jobStatus === "running" ? "running" : "queued";
  if (runStatus === "cancelled") return "cancelled";
  return "failed";
}

export interface ResultProgress {
  done: number;
  failed: number;
  running: number;
  total: number;
}

/** Tiến trình tổng của một lần tạo — nguồn của dòng "x/y sheet xong" ở đầu màn. */
export function resultProgress(items: readonly GeneratedResultItem[]): ResultProgress {
  return {
    done: items.filter((item) => item.state === "done").length,
    failed: items.filter((item) => item.state === "failed").length,
    running: items.filter((item) => item.state === "running").length,
    total: items.length,
  };
}

export function generatedRuns(runs: readonly Run[]): GeneratedRunGroup[] {
  return runs.filter((run) => run.kind === "gen").map((run) => ({
    id: run.id,
    at: run.finishedAt ?? run.startedAt ?? null,
    status: run.status,
    live: isRunLive(run.status),
    items: run.jobs.map((job) => ({
      job: job.job,
      sheet: job.sheet ?? job.job,
      variant: job.variant ?? "",
      category: categoryOfSheet(job.sheet ?? job.job),
      status: job.status,
      state: resultStateOf(run.status, job.status),
      diagnosis: job.diagnosis,
      path: job.artifact?.path ?? null,
      geometryOk: job.artifact?.validation?.ok ?? null,
      invalidCells: job.artifact?.validation?.cells.filter((cell) => cell.status === "regenerate").length ?? 0,
    })),
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Dừng → chạy tiếp phần thiếu
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * LỜI MỜI "CHẠY TIẾP N TẤM CÒN THIẾU" — `null` nghĩa là không mời gì cả.
 *
 * kit-gen KHÔNG có pause thật và sẽ không có: một lượt `codex exec` đang bay không có
 * nút tạm dừng, treo tiến trình (SIGSTOP) chỉ làm phía kia rớt phiên. "Dừng" ở đây là
 * **ngừng phát tấm mới**; agent giữ nguyên tấm đã xong và cắt nốt cho sạch
 * (`run-handle.mjs settleCancelledSheets`). Vế còn lại của cặp — **chạy tiếp** — trước
 * bản này KHÔNG có trên màn hình: người dùng chỉ thấy "Tạo lại toàn bộ", nghĩa là muốn
 * vẽ nốt 4 tấm thiếu thì phải tự đi tick bỏ 6 tấm đã xong, và tick nhầm là đốt lại
 * quota của tấm đã trả tiền. Hàm này tính sẵn đúng tập đó.
 *
 * Chỉ mời với lượt `cancelled` — gồm cả lượt bị agent chết giữa chừng, vì `sweepOrphanRuns`
 * quy nó về đúng trạng thái này. Lượt `done-with-errors` đã có dải đỏ riêng
 * (`RunFailBanner`) nói chuyện lỗi, chồng thêm một lời mời nữa là hai giọng cùng lúc.
 */
export function resumeInvite(group: GeneratedRunGroup | null | undefined): {
  jobs: string[];
  done: number;
  total: number;
} | null {
  if (!group || group.live || group.status !== "cancelled") return null;
  const jobs = group.items.filter((item) => item.state !== "done").map((item) => item.job);
  if (!jobs.length) return null;
  return { jobs, done: group.items.length - jobs.length, total: group.items.length };
}

export function jobsForGroup(jobs: readonly Pick<RunJob, "job" | "sheet">[], group: ResultGroup): string[] {
  return jobs
    .filter((job) => group === "all" || categoryOfSheet(job.sheet ?? job.job) === group)
    .map((job) => job.job);
}
