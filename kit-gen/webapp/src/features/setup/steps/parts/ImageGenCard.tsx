import { Lock } from "lucide-react";
import { CopyableCode, StatusDot } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import type { Doctor } from "@/lib/types/api";
import { StepCard, Note } from "../../components/StepShell";
import { IMG_HOME_CHECK_CMD, IMG_HOME_LOGIN_CMD } from "../../lib/commands";
import { imageGenOutcome } from "../../lib/doctor-view";

/**
 * Khối "Tạo ảnh AI" của bước 4 — 3 KẾT CỤC đúng §3-S0:
 *   ✅ Sẵn sàng (dùng cấu hình mặc định)
 *   ✅ Sẵn sàng (dùng home riêng ~/.codex-img)
 *   ⚠️ Chưa tạo được ảnh  → thẻ khắc phục (§3.9 IMAGEGEN_UNAVAILABLE, 7 enum lý do)
 *
 * ĐIỀU QUAN TRỌNG NHẤT Ở FILE NÀY — ranh giới với thông tin đăng nhập:
 *  · web CHỈ HƯỚNG DẪN. Hai lệnh dưới đây là chữ để user tự chạy trong Terminal của họ.
 *    Không có nút nào chạy chúng, không có endpoint nào để chạy chúng, và cố ý là vậy:
 *    `codex login` mở luồng OAuth, đó là việc của người dùng trên máy người dùng.
 *  · web KHÔNG hiện, KHÔNG nhận, KHÔNG lưu bất cứ thứ gì của phiên đăng nhập. Thứ duy
 *    nhất đi vào localStorage là **enum mode** (`default-home` | `img-home` | …).
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
        <div className="flex flex-col gap-3 rounded-2 border border-line-subtle bg-canvas p-3">
          <p className="text-body text-fg">
            Mặc định dùng cấu hình Codex hiện tại. Bạn chạy 2 lệnh này trong Terminal — kit-gen cố ý{" "}
            <strong className="text-fg-strong">không tự chạy thay bạn</strong>, vì đây là việc liên
            quan tới đăng nhập.
          </p>
          <CopyableCode value={IMG_HOME_LOGIN_CMD} label="Lệnh đăng nhập Codex" />
          <CopyableCode value={IMG_HOME_CHECK_CMD} label="Lệnh kiểm tra công cụ tạo ảnh" />
          <Note>
            Lệnh thứ hai chỉ ĐẾM xem có công cụ tạo ảnh hay không — không sinh ảnh, không tốn quota.
            Chạy xong thì bấm Kiểm tra lại.
          </Note>
          <Note>
            Chưa xong bước này vẫn dùng được app: bạn soạn bản thiết kế và cắt ảnh bình thường, chỉ
            phần sinh ảnh mới cần nó.
          </Note>
        </div>
      )}

      <p className="inline-flex items-start gap-2 text-caption text-fg-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {PRIVACY_LINE}
      </p>
    </StepCard>
  );
}
