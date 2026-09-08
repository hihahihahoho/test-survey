/**
 * PHẦN LOGIC THUẦN mà dialog Cài đặt dùng — `doctor-view` + `commands` + `format`.
 *
 * 07/09/2026: file này là `features/setup/__tests__/setup-logic.test.ts` cũ. Wizard
 * cài đặt 4 bước đã bị xoá, nên hai describe chỉ khoá nó đi theo: "steps" (`lib/steps.ts`
 * — bảng 4 bước + cầu nối enum đã persist) và "script cài" (`lib/installer-script.ts` —
 * script tải về của bước 1). Phần còn lại KHÔNG đổi một dòng: nó khoá đúng thứ mà hai
 * tab «Môi trường» / «Agent» đang đọc.
 */
import { describe, expect, it } from "vitest";
import { checkRows, imageGenOutcome, persistableMode, safeHomeLabel } from "../parts/lib/doctor-view";
import { bytes, count, hhmm } from "@/lib/format";
import { CODEX_LOGIN_CMD, IMAGEGEN_CHECK_CMD } from "../parts/lib/commands";
import type { Doctor } from "@/lib/types/api";

describe("imageGenOutcome — ĐÚNG 3 kết cục của §3-S0 bước 4", () => {
  it("kết cục 1: sẵn sàng với cấu hình mặc định", () => {
    const o = imageGenOutcome({ imageGen: { mode: "default-home", available: true } } as Doctor);
    expect(o.tone).toBe("ok");
    expect(o.title).toContain("mặc định");
    expect(o.needsFallback).toBe(false);
  });

  it("kết cục 2: sẵn sàng với home riêng", () => {
    const o = imageGenOutcome({
      imageGen: { mode: "img-home", available: true, codexHomeLabel: "~/.codex-img" },
    } as Doctor);
    expect(o.tone).toBe("ok");
    expect(o.title).toContain("home riêng");
    expect(o.detail).toContain("~/.codex-img");
  });

  it("kết cục 3: chưa tạo được ảnh ⇒ bật khối hướng dẫn dự phòng", () => {
    const o = imageGenOutcome({
      imageGen: { mode: "unavailable", available: false, reason: "NOT_LOGGED_IN" },
    } as Doctor);
    expect(o.tone).toBe("warn");
    expect(o.needsFallback).toBe(true);
    // Copy lấy từ bảng tĩnh của R0, không tự viết.
    expect(o.detail).toContain("đăng nhập");
  });

  it("doctor chưa có ⇒ vẫn trả object dùng được, không ném", () => {
    expect(imageGenOutcome(null).mode).toBe("unknown");
  });
});

describe("bảo mật — không để PII/secret lọt vào UI hay localStorage", () => {
  it("path tuyệt đối chứa tên user bị loại, chỉ nhận nhãn rút gọn ~/…", () => {
    expect(safeHomeLabel("~/.codex-img")).toBe("~/.codex-img");
    expect(safeHomeLabel("/Users/an/.codex-img")).toBeNull();
    expect(safeHomeLabel("/home/an/.codex")).toBeNull();
    expect(safeHomeLabel("C:\\Users\\an\\.codex")).toBeNull();
  });

  it("nhãn thư mục làm việc trong checklist cũng đi qua bộ lọc đó", () => {
    const rows = checkRows({ workspace: { label: "/Users/an/KitGen", writable: true } } as Doctor);
    const ws = rows.find((r) => r.key === "workspace")!;
    expect(ws.value).not.toContain("/Users/");
  });

  it("chỉ 5 enum được phép ghi vào kitgen.setup.v1", () => {
    const allowed = ["default-home", "img-home", "profile-overlay", "unavailable", "unknown"];
    expect(allowed).toContain(persistableMode(null));
    expect(persistableMode({ imageGen: { mode: "img-home", available: true } } as Doctor)).toBe("img-home");
    expect(persistableMode({ imageGen: { mode: "img-home", available: false } } as Doctor)).toBe("unavailable");
    // mode lạ do agent bản mới thêm ⇒ hạ về "unknown", KHÔNG ghi thẳng ra đĩa
    expect(persistableMode({ imageGen: { mode: "brand-new" as never, available: true } } as Doctor)).toBe("unknown");
  });

  it("lệnh hiện cho user không chứa path tuyệt đối và không in secret", () => {
    /* Ba lệnh của bước 1 (`bashCmd`/`shasumCmd`) và `updateCmd` đã rời danh sách này
       cùng wizard cài đặt — chúng không còn tồn tại/không còn hiện ở màn nào của
       Cài đặt. Hai lệnh còn lại là đúng hai lệnh mà tab «Môi trường» đưa cho user dán. */
    const all = [IMAGEGEN_CHECK_CMD, CODEX_LOGIN_CMD];
    for (const c of all) {
      expect(c).not.toMatch(/\/Users\/|\/home\/[a-z]/i);
    }
    // lệnh kiểm image_gen chỉ ĐẾM, không in nội dung cấu hình
    expect(IMAGEGEN_CHECK_CMD).toContain("grep -c");
  });
});

describe("checkRows — không bịa trạng thái", () => {
  it("agent không khai mục nào ⇒ known=false (UI hiện 'chưa kiểm được', không hiện ✗)", () => {
    const rows = checkRows(null);
    expect(rows.every((r) => r.known === false)).toBe(true);
  });

  it("mọi dòng có thể thiếu đều kèm lệnh sửa + câu hệ quả", () => {
    const rows = checkRows({} as Doctor).filter((r) => r.key !== "workspace");
    for (const r of rows) {
      expect(r.cmd, `${r.key} thiếu lệnh sửa`).toBeTruthy();
      expect(r.consequence.length).toBeGreaterThan(10);
    }
  });
});

describe("format", () => {
  it("bytes dùng dấu phẩy thập phân kiểu VI, số âm/không hợp lệ ⇒ '—'", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(18 * 1024)).toBe("18 KB");
    expect(bytes(1.2 * 1024 * 1024)).toBe("1,2 MB");
    expect(bytes(null)).toBe("—");
    expect(bytes(-1)).toBe("—");
  });

  it("count và hhmm không ném với dữ liệu rác", () => {
    expect(count(undefined, "project")).toBe("— project");
    expect(hhmm("không-phải-ngày")).toBe("");
    expect(hhmm(null)).toBe("");
  });
});
