/**
 * fail-report.ts — DỰNG KHỐI CHỮ «COPY LỖI» CỦA MỘT LƯỢT VẼ HỎNG.
 *
 * ╔══ VÌ SAO CẦN CẢ MỘT FILE CHO MỘT NÚT COPY ═══════════════════════════════╗
 * ║ Thẻ hỏng chỉ nói được MỘT CÂU: «1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ   ║
 * ║ để thử lại.» — câu ấy là `failSummary` agent đã gộp, và với ca `UNKNOWN`  ║
 * ║ nó không mang một chữ nào về nguyên nhân. Một người dùng Windows gặp đúng ║
 * ║ câu ấy và cách duy nhất để biết chuyện gì đã xảy ra là được CHỈ ĐƯỜNG đi  ║
 * ║ đào file `logs/<job>.log` trên máy mình.                                  ║
 * ║ Nhưng agent ĐÃ gửi sẵn thứ cần: mỗi job hỏng có `diagnosis` (mã) và       ║
 * ║ `errorTail` (2–3 dòng cuối log, agent đã redact — `agent/lib/redact.mjs`).║
 * ║ Chúng chỉ chưa bao giờ được bày ra. Nút «Copy lỗi» gom đúng chỗ ấy thành  ║
 * ║ một khối chữ dán được vào chat hỏi người khác.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ LUẬT CỦA KHỐI CHỮ NÀY ═════════════════════════════════════════════════
 *  ① THIẾU THÌ BỎ TRỐNG, KHÔNG BỊA. Không biết version/nền tảng/mã lượt thì
 *     đoạn ấy biến mất khỏi dòng đầu — một dòng «KitGen undefined · project…»
 *     làm người đọc log đi tìm một sự thật không tồn tại.
 *  ② KHÔNG THÊM GÌ NGOÀI BỐN PHẦN ĐÃ HỨA (dòng đầu · câu tóm tắt · từng tấm
 *     hỏng · đường tới log). Người dùng dán khối này cho người lạ, nên mọi thứ
 *     lọt vào đây phải là thứ ta CỐ Ý cho vào.
 *  ③ KHÔNG REDACT LẠI `errorTail`. Client không biết HOME của máy chạy agent
 *     nên không thể redact đúng; agent đã làm rồi (xem `RunJob.errorTail`).
 *
 * Thuần khiết, không React, không `Date.now()` ngầm (`at` tiêm được) ⇒ test bằng Node.
 */

/**
 * BẢN DỊCH MÃ CHẨN ĐOÁN — CHÉP ĐÚNG `DIAGNOSIS_VI` của `agent/lib/engine.mjs`.
 *
 * Chép chứ không import: agent là tiến trình KHÁC, chạy bản KHÁC trên máy người
 * dùng; webapp không có đường nào đọc hằng số của nó. Cùng chữ ấy đang đi vào
 * `failSummary` mà thẻ hiện ở dòng đỏ, nên khối copy phải nói y hệt — hai cách
 * gọi tên cho cùng một mã, trong cùng một khối chữ, là hai sự thật.
 *
 * Mã lạ (agent mới hơn webapp) ⇒ rơi về câu của `UNKNOWN` thay vì lộ chuỗi hoa
 * gạch dưới ra cho người dùng, đúng luật `coverFailReason` đã theo ở Home.
 */
export const DIAGNOSIS_VI: Record<string, string> = {
  QUOTA_SUSPECTED: "nghi chạm giới hạn tạo ảnh",
  MODEL_BUSY: "máy vẽ đang quá tải, thử lại sau ít phút",
  NOT_LOGGED_IN: "công cụ tạo ảnh chưa đăng nhập",
  NO_ARTIFACT: "không ghi được ảnh",
  TIMEOUT: "quá thời gian chờ",
  UNKNOWN: "lỗi chưa rõ nguyên nhân",
};

export function diagnosisVi(code: string | null | undefined): string {
  return DIAGNOSIS_VI[String(code ?? "UNKNOWN")] ?? DIAGNOSIS_VI.UNKNOWN!;
}

/** Thư mục làm việc mặc định — nhãn agent dùng khi người dùng không đổi gì. */
const DEFAULT_WORKSPACE = "~/KitGen";

/** Câu thay cho đuôi log khi agent đời cũ (hoặc lượt chết sớm) không gửi gì. */
export const NO_TAIL_LINE = "  (agent không ghi lại đuôi log)";

/** Một tấm hỏng, đúng ba thứ khối chữ cần — không ôm cả `RunJob` vào đây. */
export interface FailedJobInfo {
  job: string;
  diagnosis?: string | null;
  errorTail?: readonly string[] | null;
}

export interface FailReportInput {
  projectId: string;
  /** Đúng câu đỏ người dùng đang nhìn (`GenBlockState.message`). */
  summary: string;
  jobs: readonly FailedJobInfo[];
  runId?: string | null;
  /** `status.agentVersion` — "3.0.3". Vắng ⇒ dòng đầu chỉ có chữ «KitGen». */
  agentVersion?: string | null;
  /** `doctor.os` nếu màn Cài đặt đã từng hỏi. Vắng ⇒ bỏ hẳn đoạn này. */
  platform?: string | null;
  /** `status.workspaceLabel` — nhãn rút gọn (`~/KitGen`), KHÔNG phải path tuyệt đối. */
  workspaceLabel?: string | null;
  /** Tiêm được để test không phụ thuộc đồng hồ máy. */
  at?: Date | string;
}

function isoOf(at: Date | string | undefined): string {
  if (typeof at === "string") return at;
  return (at ?? new Date()).toISOString();
}

/** Bỏ gạch chéo cuối để không sinh `~/KitGen//projects/…`. */
function workspaceRoot(label: string | null | undefined): string {
  const raw = (label ?? "").trim();
  if (!raw) return DEFAULT_WORKSPACE;
  return raw.replace(/[/\\]+$/, "") || DEFAULT_WORKSPACE;
}

/**
 * Đuôi log đã dọn: bỏ dòng trắng (chúng thành hai dấu cách lơ lửng trong khối
 * chữ) và bỏ khoảng trắng thừa cuối dòng. KHÔNG cắt bớt nội dung — agent đã
 * chọn giữ 2–3 dòng, cắt thêm ở đây là vứt đúng phần ta vừa hứa sẽ đưa ra.
 */
function tailLines(tail: readonly string[] | null | undefined): string[] {
  return (tail ?? []).map((line) => line.replace(/\s+$/, "")).filter((line) => line.trim() !== "");
}

/**
 * KHỐI CHỮ HOÀN CHỈNH, dán thẳng vào chat được.
 *
 * Dòng cuối là đường tới log ĐẦY ĐỦ trên máy. Có nhiều tấm hỏng thì nó viết
 * `<tên tấm>` chứ không chọn bừa một tấm: mỗi tấm có một file log riêng, và chỉ
 * đường tới đúng MỘT trong số đó là mời người dùng đọc nhầm file.
 */
export function buildFailReport(input: FailReportInput): string {
  const head = [
    input.agentVersion ? `KitGen v${input.agentVersion}` : "KitGen",
    input.platform?.trim() || null,
    `project ${input.projectId}`,
    input.runId ? `run ${input.runId}` : null,
    isoOf(input.at),
  ].filter(Boolean).join(" · ");

  const lines: string[] = [head, input.summary];

  for (const item of input.jobs) {
    lines.push(`— ${item.job}: ${diagnosisVi(item.diagnosis)}`);
    const tail = tailLines(item.errorTail);
    if (tail.length === 0) lines.push(NO_TAIL_LINE);
    else for (const line of tail) lines.push(`  ${line}`);
  }

  const only = input.jobs.length === 1 ? input.jobs[0]!.job : "<tên tấm>";
  lines.push(`log đầy đủ: ${workspaceRoot(input.workspaceLabel)}/projects/${input.projectId}/logs/${only}.log`);

  return lines.join("\n");
}
