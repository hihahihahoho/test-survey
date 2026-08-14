/**
 * features/runs/lib/diagnostics.ts — KHỐI CHẨN ĐOÁN ĐỂ DÁN CHO DEV (BACKLOG #22).
 *
 * ══ VÌ SAO CÓ FILE NÀY ═══════════════════════════════════════════════════════
 * Hai lần trong một ngày, chủ sản phẩm gặp lượt gen chết 100% và câu duy nhất app nói
 * được là "chạy xong nhưng ảnh không được ghi". Nguyên nhân thật (`rc=127`,
 * `SyntaxError`) chỉ lòi ra sau khi có người mở `events.ndjson` bằng tay. Nút "Copy
 * chẩn đoán" cắt hẳn bước đó: người dùng bấm một cái, dán vào tin nhắn, dev có đủ thứ
 * cần để trả lời mà không phải hỏi vòng vo "bạn chạy phiên bản nào, lúc mấy giờ".
 *
 * ══ BA LUẬT, ĐỌC TRƯỚC KHI THÊM TRƯỜNG ═══════════════════════════════════════
 * ① **CỤC BỘ TUYỆT ĐỐI.** Hàm này chỉ dựng CHUỖI. Nó không gọi mạng, không log, không
 *    chạm `localStorage`. Chuỗi đi thẳng vào clipboard và dừng ở đó; người dùng là
 *    người duy nhất quyết định nó đi đâu tiếp.
 * ② **CHỈ DỮ LIỆU ĐÃ REDACT.** `errorTail` do agent redact (che khoá, rút gọn đường
 *    dẫn tuyệt đối — `agent/lib/redact.mjs`). Web KHÔNG thể redact lại: nó không biết
 *    HOME của máy chạy agent. Vì vậy luật là **không đưa vào đây bất cứ nguồn nào chưa
 *    qua cửa đó** — cấm `config`, cấm biến môi trường, cấm đường dẫn workspace, cấm
 *    tên file người dùng. Thứ được phép: phiên bản, id lượt, mốc giờ, đếm, và chính
 *    `errorTail`/`failSummary` của agent.
 * ③ **HỆ ĐIỀU HÀNH THÔ THÔI.** `osLabel` trả "macOS"/"Windows"/"Linux", KHÔNG trả
 *    nguyên `userAgent` — chuỗi đó là vân tay trình duyệt, mà thứ dev cần chỉ là biết
 *    nên nghi `bash` hay `PowerShell`.
 *
 * Thuần khiết, không React ⇒ test bằng Node.
 */
import type { Run, RunJob } from "@/lib/types";
import { RUN_STATUS } from "@/lib/status";
import { diagnosisText, progressOf, runStatusOf } from "./format";

/** Trần số job lỗi được liệt kê — dán 60 khối vào chat thì không ai đọc. */
const MAX_JOBS_LISTED = 8;

export interface DiagnosticsInput {
  run: Run | null | undefined;
  /** `__APP_VERSION__` — phiên bản bundle giao diện. */
  appVersion: string;
  /** `status.agentVersion` — phiên bản công cụ local. `null` khi mất kết nối. */
  agentVersion?: string | null;
  /** Nhãn hệ điều hành THÔ (xem `osLabel`). */
  os?: string;
  /** Tiêm để test tất định. */
  now?: number;
}

/**
 * `navigator.userAgent` → một trong bốn nhãn thô.
 * Cố ý KHÔNG trả phiên bản OS: nó không đổi cách chữa, mà lại làm vân tay sắc hơn.
 */
export function osLabel(userAgent: string | null | undefined): string {
  const ua = String(userAgent ?? "");
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux|X11|CrOS/i.test(ua)) return "Linux";
  return "không rõ";
}

/** Nhãn OS của chính trình duyệt đang chạy — tách khỏi `osLabel` để test không cần DOM. */
export function currentOsLabel(): string {
  return osLabel(typeof navigator === "undefined" ? null : navigator.userAgent);
}

/** Giờ ISO giữ nguyên: nhập nhằng múi giờ là thứ tệ nhất trong một báo cáo lỗi. */
function at(iso: string | null | undefined): string {
  return iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toISOString() : "—";
}

function jobBlock(job: RunJob): string[] {
  const lines = [`- ${job.job} — ${diagnosisText(job.diagnosis)}`];
  for (const tail of job.errorTail ?? []) lines.push(`    ${tail}`);
  return lines;
}

/**
 * Dựng khối text để dán. Luôn trả chuỗi dùng được, kể cả khi `run` là `null` —
 * "không có lượt chạy nào" vẫn là một thông tin thật cho người nhận.
 */
export function buildDiagnosticsText(input: DiagnosticsInput): string {
  const { run, appVersion, agentVersion = null, os = "không rõ", now = Date.now() } = input;
  const out: string[] = ["KitGen — chẩn đoán lượt chạy (dữ liệu cục bộ, đã che thông tin nhạy cảm)"];

  out.push(`Giao diện web: ${appVersion}`);
  out.push(`Công cụ local: ${agentVersion ?? "không kết nối được"}`);
  out.push(`Hệ điều hành: ${os}`);
  out.push(`Chép lúc: ${at(new Date(now).toISOString())}`);

  if (!run) {
    out.push("", "Chưa có lượt chạy nào để chẩn đoán.");
    return out.join("\n");
  }

  const { done, total, failed } = progressOf(run);
  out.push("");
  out.push(`Lượt chạy: ${run.id}${run.kind ? ` · ${run.kind}` : ""}`);
  out.push(`Bắt đầu: ${at(run.startedAt)}`);
  out.push(`Kết thúc: ${at(run.finishedAt)}`);
  out.push(`Kết quả: ${RUN_STATUS[runStatusOf(run.status)].label} — ${done}/${total} xong · ${failed} lỗi`);
  if (run.failSummary) out.push(`Tổng kết: ${run.failSummary}`);

  const bad = (run.jobs ?? []).filter((j) => j.status === "failed");
  if (bad.length) {
    out.push("", `Lượt lỗi (${bad.length}):`);
    for (const job of bad.slice(0, MAX_JOBS_LISTED)) out.push(...jobBlock(job));
    if (bad.length > MAX_JOBS_LISTED) out.push(`… và ${bad.length - MAX_JOBS_LISTED} lượt lỗi nữa.`);
  }

  return out.join("\n");
}
