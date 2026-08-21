import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { CopyableCode } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useCodexLogin } from "@/lib/hooks";
import { Note } from "../../components/StepShell";

/**
 * ĐĂNG NHẬP CODEX BẰNG MỘT CÚ BẤM — thay cho câu "bạn mở Terminal lên và gõ…".
 *
 * VÌ SAO ĐỔI, KHI LUẬT CŨ NÓI RÕ "KHÔNG TỰ ĐỘNG HOÁ `codex login`"
 * ─────────────────────────────────────────────────────────────────────────────
 * Luật cũ bảo vệ một thứ, và nó vẫn đang được bảo vệ nguyên vẹn: **app không được
 * đứng giữa người dùng và thông tin đăng nhập của họ**. Bắt mở Terminal chỉ là
 * cách rẻ nhất để đạt điều đó — không phải bản thân mục đích. Cái giá của nó là
 * thật: một người làm thiết kế, trên máy chưa từng mở Terminal, dừng lại ở đúng
 * bước này và không đi tiếp được.
 *
 * `--device-auth` đạt CÙNG mục đích mà không phải trả giá đó:
 *   · KHÔNG có ô mật khẩu nào trong app. Việc đăng nhập diễn ra trên trang của
 *     OpenAI, trong trình duyệt của chính người dùng;
 *   · token do CHÍNH codex ghi vào `auth.json` — agent không nhận, không đọc,
 *     không chuyển tiếp (chi tiết ở `agent/lib/codex-login.mjs`);
 *   · thứ duy nhất app hiện là **link công khai + mã 8 ký tự sống 15 phút**, đúng
 *     thứ người dùng sẽ tự tay gõ sang bên kia. Không có phiên trình duyệt của họ
 *     thì cái mã đó chẳng mở được gì.
 *
 * MÃ HIỆN TO VÀ CÓ NÚT COPY, cố ý: người dùng phải chép nó sang một tab khác. Mã
 * hiện nhỏ như chữ thường là mời họ gõ nhầm rồi đổ cho "app hỏng". Nó cũng KHÔNG
 * được lưu ở đâu cả — hết phiên là biến mất khỏi cả agent lẫn tab này.
 *
 * KHÔNG CÓ ĐƯỜNG NÀO ĐỂ HỎNG CÂM: mọi kết cục hỏng đều ra một câu tiếng Việt nói
 * đúng chuyện gì xảy ra, kèm lối lui về cách cũ (tự chạy lệnh trong Terminal) —
 * lệnh đó vẫn nằm ngay dưới trong `ImageGenCard`, không bị gỡ đi.
 */
const REASON_TEXT: Record<string, string> = {
  NO_CODEX: "Máy chưa có công cụ Codex, nên chưa mở được phiên đăng nhập.",
  NO_DEVICE_CODE: "Codex không đưa ra mã đăng nhập (có thể là bản quá cũ). Thử cách chạy lệnh bên dưới.",
  DECLINED: "Phiên đăng nhập kết thúc mà chưa thành công. Bạn thử lại nhé.",
  EXPIRED: "Mã đã quá hạn 15 phút. Bấm lại để lấy mã mới.",
  SPAWN_FAILED: "Không mở được phiên đăng nhập.",
};

export function CodexLoginPanel() {
  const { session, starting, active, start, cancel, reset } = useCodexLogin();
  const { status, verificationUrl, userCode, codexHomeLabel } = session;

  if (status === "done") {
    return (
      <div className="flex flex-col gap-2 rounded-2 border border-line-subtle bg-canvas p-3">
        <p className="text-body text-fg-strong">Đã đăng nhập xong ✓</p>
        <Note>
          Bấm <strong className="text-fg-strong">Kiểm tra lại</strong> để app đọc lại trạng thái công
          cụ tạo ảnh.
        </Note>
      </div>
    );
  }

  if (status === "waiting" && verificationUrl && userCode) {
    return (
      <div className="flex flex-col gap-3 rounded-2 border border-line-subtle bg-canvas p-3">
        <p className="text-body text-fg">
          Mở trang đăng nhập rồi nhập mã dưới đây. Mã sống{" "}
          <strong className="text-fg-strong">15 phút</strong>.
        </p>
        <CopyableCode value={userCode} label="Mã đăng nhập dùng một lần" />
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="primary" size="sm">
            {/* Điều hướng THẬT sang trang của OpenAI — không phải iframe, không phải
                webview trong app: người dùng phải nhìn thấy thanh địa chỉ của chính
                trình duyệt mình trước khi gõ mật khẩu vào đó. */}
            <a href={verificationUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              Mở trang đăng nhập
            </a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            Huỷ
          </Button>
        </div>
        <Note>
          App không thấy mật khẩu của bạn: việc đăng nhập diễn ra trên trang của OpenAI, còn phần
          ghi nhớ đăng nhập là do công cụ Codex tự làm.
        </Note>
      </div>
    );
  }

  const failed = status === "failed";

  return (
    <div className="flex flex-col gap-3 rounded-2 border border-line-subtle bg-canvas p-3">
      {failed && (
        <p className="text-body text-fg-strong">
          {REASON_TEXT[session.reason ?? ""] ?? "Không mở được phiên đăng nhập."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={starting || active}
          onClick={() => { reset(); void start(); }}
        >
          {starting || active
            ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
            : <KeyRound className="size-3.5" aria-hidden />}
          {starting || active ? "Đang mở phiên đăng nhập…" : failed ? "Thử lại" : "Đăng nhập Codex"}
        </Button>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            Huỷ
          </Button>
        )}
      </div>
      <Note>
        Bấm nút này, app sẽ đưa bạn một đường link và một mã dùng một lần
        {codexHomeLabel ? <> (cho hồ sơ <span className="font-mono">{codexHomeLabel}</span>)</> : null}. Không
        cần mở Terminal.
      </Note>
    </div>
  );
}
