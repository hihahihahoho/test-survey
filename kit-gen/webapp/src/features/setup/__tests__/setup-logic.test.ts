/**
 * Test cho phần LOGIC THUẦN của màn S0 (không cần DOM).
 *
 * ⚠️ `webapp/vitest.config.ts` (chủ sở hữu: R0) chỉ gom `src/lib/**` nên bộ này KHÔNG
 * chạy trong `npm test`. Đã ghi teams/react/NEEDS-s0-setup.md (N4). Cách chạy hiện tại
 * ghi ngay trong NEEDS đó (config tạm ngoài repo). TODO(R0): mở include ra
 * `src/{lib,features}/**` để test của các màn cùng chạy trong CI.
 */
import { describe, expect, it } from "vitest";
import {
  STEPS, fromPersistedStep, stepAt, stepIndex, toPersistedStep,
} from "../lib/steps";
import { checkRows, imageGenOutcome, persistableMode, safeHomeLabel } from "../lib/doctor-view";
import { bytes, count, hhmm } from "../lib/format";
import { SEVEN_THINGS, SCRIPT_NAME, scriptBytes, scriptText } from "../lib/installer-script";
import { IMG_HOME_CHECK_CMD, IMG_HOME_LOGIN_CMD, bashCmd, shasumCmd, updateCmd } from "../lib/commands";
import type { Doctor } from "@/lib/types/api";

describe("steps — 4 bước và cầu nối với enum đã persist", () => {
  it("đúng 4 bước, đúng thứ tự của §3-S0", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["install", "connect", "workspace", "imagegen"]);
  });

  it("mỗi bước có NHÃN CHỮ, không chỉ số trơn", () => {
    for (const s of STEPS) {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.long).toContain("Bước");
    }
  });

  it("map hai chiều không mất bước nào (kể cả bước 'workspace' mà R0 chưa có enum)", () => {
    for (const s of STEPS) {
      expect(fromPersistedStep(toPersistedStep(s.id))).toBe(s.id);
    }
  });

  it("giá trị lạ hoặc thiếu ⇒ về bước 1, KHÔNG ném", () => {
    expect(fromPersistedStep(undefined)).toBe("install");
    expect(fromPersistedStep("zzz")).toBe("install");
  });

  it("'done' ⇒ đứng ở bước cuối, không rơi ngược về bước 1", () => {
    expect(fromPersistedStep("done")).toBe("imagegen");
  });

  it("stepAt kẹp biên, không văng ra ngoài mảng", () => {
    expect(stepAt(-5)).toBe("install");
    expect(stepAt(99)).toBe("imagegen");
    expect(stepIndex("workspace")).toBe(2);
  });
});

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
    const all = [IMG_HOME_CHECK_CMD, IMG_HOME_LOGIN_CMD, bashCmd(SCRIPT_NAME), shasumCmd(SCRIPT_NAME), updateCmd(null)];
    for (const c of all) {
      expect(c).not.toMatch(/\/Users\/|\/home\/[a-z]/i);
    }
    // lệnh kiểm image_gen chỉ ĐẾM, không in nội dung cấu hình
    expect(IMG_HOME_CHECK_CMD).toContain("grep -c");
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

describe("script cài — ràng buộc của §3-S0 bước 1", () => {
  it("accordion liệt kê ĐÚNG 7 việc", () => {
    expect(SEVEN_THINGS).toHaveLength(7);
  });

  it("KHÔNG có kiểu curl/wget … | bash", () => {
    const s = scriptText();
    expect(/curl[^\n]*\|\s*(bash|sh)\b/.test(s)).toBe(false);
    expect(/wget[^\n]*\|\s*(bash|sh)\b/.test(s)).toBe(false);
  });

  it("KHÔNG gọi sudo ở bất kỳ dòng lệnh nào", () => {
    const lines = scriptText().split("\n").filter((l) => !l.trim().startsWith("#"));
    for (const l of lines) expect(/(^|[;&|(]\s*)sudo\s/.test(l), `dòng gọi sudo: ${l}`).toBe(false);
  });

  it("chỉ KIỂM TRA auth.json tồn tại, không đọc nội dung", () => {
    const s = scriptText();
    expect(s).toContain('[ -f "$CODEX_HOME_DIR/auth.json" ]');
    expect(/\b(cat|head|grep|less|jq)\b[^\n]*auth\.json/.test(s)).toBe(false);
  });

  it("bytes tải về khớp text hiện trên màn (nguồn của cả Blob lẫn SHA256)", () => {
    expect(scriptBytes().length).toBe(new TextEncoder().encode(scriptText()).length);
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
