import { describe, expect, it } from "vitest";

import { buildFailReport, diagnosisVi, NO_TAIL_LINE } from "../fail-report";

/**
 * KHỐI CHỮ «COPY LỖI» — THỨ NGƯỜI DÙNG DÁN CHO NGƯỜI LẠ.
 *
 * ╔══ VÌ SAO KHOÁ BẰNG TEST, VÀ KHOÁ CHÍNH XÁC ĐẾN TỪNG DÒNG ════════════════╗
 * ║ Người dùng KHÔNG đọc lại khối này trước khi dán — họ bấm rồi dán thẳng    ║
 * ║ vào chat. Nên hai lời hứa phải kiểm được, không phải tin được:             ║
 * ║  ① đủ bốn phần (dòng đầu · câu đỏ · từng tấm hỏng · đường tới log), theo  ║
 * ║     ĐÚNG thứ tự — người đọc log quét từ trên xuống;                        ║
 * ║  ② KHÔNG có dòng thứ năm nào. Thiếu version/nền tảng/mã lượt thì đoạn ấy  ║
 * ║     BIẾN MẤT, chứ không thành «undefined» — một dòng đầu bịa ra sự thật   ║
 * ║     là cách nhanh nhất để người hỗ trợ đi sai hướng.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/** Đồng hồ cố định: khối chữ mang mốc thời gian, test thì không được mang. */
const AT = "2026-09-17T08:12:33.000Z";

describe("diagnosisVi", () => {
  it("dịch đúng mã agent gửi, mã lạ rơi về câu của UNKNOWN", () => {
    expect(diagnosisVi("NO_ARTIFACT")).toBe("không ghi được ảnh");
    expect(diagnosisVi("MODEL_BUSY")).toBe("máy vẽ đang quá tải, thử lại sau ít phút");
    /* Agent mới hơn webapp ⇒ mã chưa biết. Người dùng KHÔNG được thấy chuỗi hoa
       gạch dưới — cùng luật `coverFailReason` đã theo ở thẻ Home. */
    expect(diagnosisVi("SOMETHING_NEW")).toBe("lỗi chưa rõ nguyên nhân");
    expect(diagnosisVi(null)).toBe("lỗi chưa rõ nguyên nhân");
    expect(diagnosisVi(undefined)).not.toContain("_");
  });
});

describe("buildFailReport", () => {
  it("hai tấm hỏng: đủ bốn phần, đúng thứ tự, đuôi log thụt hai dấu cách", () => {
    const text = buildFailReport({
      projectId: "hello-a262",
      runId: "r-0034",
      summary: "2/2 job không ghi được ảnh. Bấm Vẽ để thử lại.",
      agentVersion: "3.0.3",
      platform: "win32",
      workspaceLabel: "~/KitGen",
      at: AT,
      jobs: [
        { job: "chinh-ui2", diagnosis: "NO_ARTIFACT", errorTail: ["rc=127", "codex: command not found"] },
        { job: "chinh-ui3", diagnosis: "QUOTA_SUSPECTED", errorTail: ["429 too many requests"] },
      ],
    });

    expect(text.split("\n")).toEqual([
      "KitGen v3.0.3 · win32 · project hello-a262 · run r-0034 · 2026-09-17T08:12:33.000Z",
      "2/2 job không ghi được ảnh. Bấm Vẽ để thử lại.",
      "— chinh-ui2: không ghi được ảnh",
      "  rc=127",
      "  codex: command not found",
      "— chinh-ui3: nghi chạm giới hạn tạo ảnh",
      "  429 too many requests",
      /* Nhiều tấm ⇒ KHÔNG chọn bừa một tên: mỗi tấm một file log, chỉ đường tới
         đúng một trong số đó là mời người dùng đọc nhầm file. */
      "log đầy đủ: ~/KitGen/projects/hello-a262/logs/<tên tấm>.log",
    ]);
  });

  it("một tấm hỏng ⇒ dòng cuối chỉ thẳng tới file log của chính nó", () => {
    const text = buildFailReport({
      projectId: "p1", runId: "r-1", summary: "s", at: AT,
      jobs: [{ job: "chinh-ui2", diagnosis: "TIMEOUT", errorTail: ["hết giờ"] }],
    });
    expect(text.endsWith("log đầy đủ: ~/KitGen/projects/p1/logs/chinh-ui2.log")).toBe(true);
  });

  it("agent không gửi đuôi log (bản cũ) ⇒ nói thẳng là không có, không bỏ trống", () => {
    const empty = buildFailReport({
      projectId: "p1", summary: "1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để thử lại.",
      at: AT, jobs: [{ job: "vang-main2", diagnosis: "UNKNOWN", errorTail: [] }],
    });
    expect(empty).toContain(NO_TAIL_LINE);

    /* `errorTail` vắng hẳn (agent trước bản vá #22) và toàn dòng trắng phải cho
       CÙNG một kết quả: dòng trắng thụt lề chỉ là hai dấu cách lơ lửng. */
    const missing = buildFailReport({
      projectId: "p1", summary: "1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để thử lại.",
      at: AT, jobs: [{ job: "vang-main2" }],
    });
    const blank = buildFailReport({
      projectId: "p1", summary: "1/1 job lỗi chưa rõ nguyên nhân. Bấm Vẽ để thử lại.",
      at: AT, jobs: [{ job: "vang-main2", diagnosis: "UNKNOWN", errorTail: ["", "   "] }],
    });
    expect(missing).toBe(empty);
    expect(blank).toBe(empty);
  });

  it("thiếu version/nền tảng/mã lượt/thư mục ⇒ BỎ đoạn ấy, không bịa", () => {
    const text = buildFailReport({
      projectId: "p1", summary: "Lượt vẽ đã bị dừng.", at: AT,
      jobs: [{ job: "a", diagnosis: "UNKNOWN", errorTail: ["x"] }],
      agentVersion: null, platform: null, runId: null, workspaceLabel: null,
    });
    const [head, ...rest] = text.split("\n");
    expect(head).toBe(`KitGen · project p1 · ${AT}`);
    expect(text).not.toMatch(/undefined|null|NaN/);
    /* Không biết thư mục làm việc ⇒ rơi về mặc định của agent, KHÔNG phải một
       đường dẫn trống dẫn tới `/projects/…`. */
    expect(rest.at(-1)).toBe("log đầy đủ: ~/KitGen/projects/p1/logs/a.log");
  });

  it("không có tấm nào kể tên (lượt chưa phóng nổi) vẫn ra khối chữ dùng được", () => {
    const text = buildFailReport({
      projectId: "p1", summary: "Thẻ này chưa có gì để vẽ — thêm nội dung trước đã.",
      at: AT, jobs: [], agentVersion: "3.0.3",
    });
    expect(text.split("\n")).toEqual([
      `KitGen v3.0.3 · project p1 · ${AT}`,
      "Thẻ này chưa có gì để vẽ — thêm nội dung trước đã.",
      "log đầy đủ: ~/KitGen/projects/p1/logs/<tên tấm>.log",
    ]);
  });

  it("KHÔNG rò gì ngoài bốn phần đã hứa: mỗi tấm hỏng đúng 1 + số dòng đuôi log", () => {
    const tail = ["một", "hai", "ba"];
    const text = buildFailReport({
      projectId: "p1", runId: "r-9", summary: "s", at: AT,
      agentVersion: "3.0.3", platform: "darwin", workspaceLabel: "~/Work/KitGen/",
      jobs: [
        { job: "a", diagnosis: "NO_ARTIFACT", errorTail: tail },
        { job: "b", diagnosis: "NOT_LOGGED_IN", errorTail: [] },
      ],
    });
    const lines = text.split("\n");
    /* 1 dòng đầu + 1 câu đỏ + (1 + 3) của tấm a + (1 + 1) của tấm b + 1 dòng log. */
    expect(lines).toHaveLength(9);
    /* Gạch chéo cuối của nhãn thư mục KHÔNG được sinh ra `KitGen//projects`. */
    expect(lines.at(-1)).toBe("log đầy đủ: ~/Work/KitGen/projects/p1/logs/<tên tấm>.log");
    /* `errorTail` do agent redact; client KHÔNG sửa nội dung, chỉ thụt lề. */
    expect(lines.slice(3, 6)).toEqual(["  một", "  hai", "  ba"]);
  });
});
