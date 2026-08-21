import { Lock } from "lucide-react";
import { CopyableCode, StatusDot } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import type { Doctor } from "@/lib/types/api";
import { StepCard, Note } from "../../components/StepShell";
import { IMG_HOME_CHECK_CMD, IMG_HOME_LOGIN_CMD } from "../../lib/commands";
import { imageGenOutcome } from "../../lib/doctor-view";
import { CodexLoginPanel } from "./CodexLoginPanel";

/**
 * Khối "Tạo ảnh AI" của bước 4 — 3 KẾT CỤC đúng §3-S0:
 *   ✅ Sẵn sàng (dùng cấu hình mặc định)
 *   ✅ Sẵn sàng (dùng home riêng ~/.codex-img)
 *   ⚠️ Chưa tạo được ảnh  → thẻ khắc phục (§3.9 IMAGEGEN_UNAVAILABLE, 7 enum lý do)
 *
 * ĐIỀU QUAN TRỌNG NHẤT Ở FILE NÀY — ranh giới với thông tin đăng nhập:
 *  · web KHÔNG BAO GIỜ hỏi mật khẩu và không đứng giữa user và tài khoản của họ. Có hai
 *    lối đi tới cùng một chỗ, và cả hai đều giữ đúng ranh giới đó:
 *      ① nút [Đăng nhập Codex] (`CodexLoginPanel`) — agent chạy `codex login --device-auth`
 *        rồi chỉ đưa lại **link công khai + mã dùng một lần**; việc đăng nhập diễn ra trên
 *        trang của OpenAI trong trình duyệt của user, token do chính codex ghi ra đĩa.
 *      ② hai lệnh Terminal bên dưới — lối cũ, CỐ Ý GIỮ NGUYÊN làm đường lui khi máy chưa
 *        có codex hoặc bản codex quá cũ không biết `--device-auth`.
 *    (Lịch sử: bản đầu chỉ có ②, vì lúc đó "không tự động hoá `codex login`" bị hiểu thành
 *    luật. Thứ cần bảo vệ là ranh giới, không phải cái Terminal — ① bảo vệ y hệt mà không
 *    bắt người làm thiết kế phải mở shell.)
 *  · web KHÔNG hiện, KHÔNG nhận, KHÔNG lưu bất cứ thứ gì của phiên đăng nhập. Thứ duy
 *    nhất đi vào localStorage là **enum mode** (`default-home` | `img-home` | …); mã dùng
 *    một lần chỉ sống trong RAM của tab, hết phiên là biến mất.
 *  · `authPresent` mà agent trả về chỉ là boolean `existsSync(auth.json)` — ta còn không
 *    hiện nó ra như một trạng thái tài khoản, chỉ dùng để chọn câu hướng dẫn.
 *
 * Dòng cố định cuối khối là yêu cầu của spec, không phải câu quảng cáo.
 */
const PRIVACY_LINE =
  "kit-gen không bao giờ đọc hay lưu thông tin đăng nhập của bạn — nó chỉ hỏi công cụ local " +
  '"có tạo được ảnh hay không".';

const MODE_LABEL: Record<string, string> = {
  "default-home": "cấu hình mặc định",
  "img-home": "home riêng cho tạo ảnh",
  "profile-overlay": "hồ sơ phủ thêm",
  unavailable: "chưa dùng được",
  unknown: "chưa xác định",
};

export function ImageGenCard({ doctor }: { doctor: Doctor | null }) {
  const out = imageGenOutcome(doctor);

  return (
    <StepCard title="Tạo ảnh AI">
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot tone={out.tone === "ok" ? "ok" : "warn"} label={out.title} />
        <Badge tone={out.tone === "ok" ? "ok" : "warn"} aria-label={`Chế độ tạo ảnh: ${MODE_LABEL[out.mode] ?? out.mode}`}>
          <span className="font-mono">{out.mode}</span>
        </Badge>
      </div>
      {out.detail && <p className="text-body text-fg">{out.detail}</p>}

      {out.needsFallback && (
        <>
          <CodexLoginPanel />
          <details className="rounded-2 border border-line-subtle bg-canvas p-3">
            {/* LỐI LUI, ĐỂ GẤP LẠI. Hai lệnh này vẫn phải còn — chúng là đường duy nhất
                khi máy chưa có codex, hoặc codex cũ tới mức không biết `--device-auth`.
                Nhưng để chúng mở sẵn thì màn hình lại quay về nói "muốn dùng app này thì
                mở Terminal", đúng thứ vừa được gỡ bỏ. */}
            <summary className="cursor-pointer text-body text-fg">
              Cách khác: tự chạy lệnh trong Terminal
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <CopyableCode value={IMG_HOME_LOGIN_CMD} label="Lệnh đăng nhập Codex" />
              <CopyableCode value={IMG_HOME_CHECK_CMD} label="Lệnh kiểm tra công cụ tạo ảnh" />
              <Note>
                Lệnh thứ hai chỉ ĐẾM xem có công cụ tạo ảnh hay không — không sinh ảnh, không tốn
                quota. Chạy xong thì bấm Kiểm tra lại.
              </Note>
            </div>
          </details>
          <Note>
            Chưa xong bước này vẫn dùng được app: bạn soạn bản thiết kế và cắt ảnh bình thường, chỉ
            phần sinh ảnh mới cần nó.
          </Note>
        </>
      )}

      <p className="inline-flex items-start gap-2 text-caption text-fg-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {PRIVACY_LINE}
      </p>
    </StepCard>
  );
}
