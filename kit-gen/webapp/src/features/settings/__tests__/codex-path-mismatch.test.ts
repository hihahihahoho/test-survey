/**
 * "ĐÃ CÀI CODEX ✓" ≠ "TERMINAL CỦA BẠN GÕ ĐƯỢC CODEX".
 *
 * ╔══ SỰ CỐ CÓ THẬT, ĐÃ TỐN MỘT CHUYẾN LÊN MÁY KHÁCH ═════════════════════════╗
 * ║ Khách cài bằng standalone installer (chatgpt.com/codex/install.sh) ⇒       ║
 * ║ binary nằm ở `~/.local/bin/codex`. Thư mục đó KHÔNG có trong PATH mặc định ║
 * ║ của macOS; installer chỉ export cho phiên shell đang chạy.                 ║
 * ║                                                                            ║
 * ║   agent (khởi động từ chính phiên đó)  → chạy được  → UI báo "đã cài ✓"    ║
 * ║   khách mở Terminal MỚI, gõ `codex`    → command not found                 ║
 * ║                                                                            ║
 * ║ Và app đưa cho họ đúng chữ `codex login` trần để copy ⇒ dán vào là hỏng.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nên `doctor.codex` nay có `shellOk` — đo bằng chính login shell của user
 * (`$SHELL -lic 'command -v codex'`, xem `agent/lib/doctor.mjs:codexWhere`).
 *
 * BA GIÁ TRỊ, và ca `null` mới là ca dễ làm hỏng: không dò được (Windows, shell
 * treo quá 8s) thì phải im lặng đúng như cũ. Báo "Terminal của bạn hỏng" dựa trên
 * một phép dò thất bại là đúng thứ `PROBE_FAILED` của setup.sh đã cố tránh.
 */
import { describe, expect, it } from "vitest";
import { checkRows } from "../parts/lib/doctor-view";
import { codexCmdName, codexPathFixCmd, imagegenCheckCmd, codexLoginCmd } from "../parts/lib/commands";
import type { Doctor } from "@/lib/types/api";

const doctorWith = (codex: Record<string, unknown>) => ({ codex } as unknown as Doctor);

const BINH_THUONG = { ok: true, version: "0.149.0", binLabel: "~/.local/bin/codex", shellOk: true, shellDirLabel: null };
const LECH = { ok: true, version: "0.149.0", binLabel: "~/.local/bin/codex", shellOk: false, shellDirLabel: "~/.local/bin" };
const KHONG_DO_DUOC = { ok: true, version: "0.149.0", binLabel: null, shellOk: null, shellDirLabel: null };

const codexRowOf = (d: Doctor) => checkRows(d).find((r) => r.key === "codex")!;

describe("lệnh Terminal phải là lệnh KHÁCH gõ được", () => {
  it("Terminal thấy codex ⇒ chữ `codex` trần, KHÔNG dán đường đầy đủ vào", () => {
    /* `binLabel` có thể là shim theo phiên (fnm dựng ~/.local/state/fnm_multishells/
       <pid>_<ts>/bin/codex, chết khi phiên đóng) ⇒ dán ra còn tệ hơn chữ `codex`. */
    expect(codexCmdName(BINH_THUONG)).toBe("codex");
    expect(codexLoginCmd(BINH_THUONG)).toBe("codex login");
  });

  it("Terminal KHÔNG thấy ⇒ lệnh mang đường đầy đủ — đây là bản vá", () => {
    expect(codexLoginCmd(LECH)).toBe("~/.local/bin/codex login");
    expect(imagegenCheckCmd(LECH)).toContain("~/.local/bin/codex debug prompt-input");
  });

  it("không dò được ⇒ giữ nguyên hành vi cũ, không đoán", () => {
    expect(codexLoginCmd(KHONG_DO_DUOC)).toBe("codex login");
    expect(codexLoginCmd(null)).toBe("codex login");
  });

  it("dòng PATH là dòng dán được vào ~/.zshrc, không phải câu văn", () => {
    expect(codexPathFixCmd("~/.local/bin")).toBe('export PATH="~/.local/bin:$PATH"');
  });
});

describe("dòng checklist «codex CLI» nói thật", () => {
  it("lệch PATH: vẫn ✓ (agent sinh ảnh được) nhưng NÓI RA là Terminal chưa thấy", () => {
    const row = codexRowOf(doctorWith(LECH));
    expect(row.ok).toBe(true);                       // không chặn wizard — gen vẫn chạy
    expect(row.value).toContain("Terminal của bạn chưa thấy");
    expect(row.consequence).toContain("command not found");
  });

  it("lệch PATH: lệnh sửa là dòng PATH, KHÔNG phải bảo cài lại codex", () => {
    /* Bản cũ luôn đưa `npm i -g @openai/codex` — vô ích, vì máy đã cài rồi. */
    expect(codexRowOf(doctorWith(LECH)).cmd).toBe('export PATH="~/.local/bin:$PATH"');
  });

  it("máy bình thường: không một chữ nào đổi so với trước", () => {
    const row = codexRowOf(doctorWith(BINH_THUONG));
    expect(row.value).toBe("0.149.0");
    expect(row.consequence).toContain("Không có codex thì không sinh được ảnh AI");
    expect(row.cmd).toContain("chatgpt.com/codex");
  });

  it("không dò được cũng KHÔNG được báo lệch", () => {
    const row = codexRowOf(doctorWith(KHONG_DO_DUOC));
    expect(row.value).toBe("0.149.0");
    expect(row.cmd).toContain("chatgpt.com/codex");
  });

  it("máy chưa cài codex: vẫn là ✗ và vẫn chỉ lệnh cài", () => {
    const row = codexRowOf(doctorWith({ ok: false, version: null, shellOk: null }));
    expect(row.ok).toBe(false);
    expect(row.cmd).toContain("chatgpt.com/codex");
  });
});
