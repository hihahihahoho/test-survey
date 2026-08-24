import { Lock } from "lucide-react";
import { CopyableCode, StatusDot } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import type { Doctor } from "@/lib/types/api";
import { StepCard, Note } from "../../components/StepShell";
import { codexPathFixCmd, imgHomeCheckCmd, imgHomeLoginCmd } from "../../lib/commands";
import { imageGenOutcome } from "../../lib/doctor-view";
import { CodexAccountRow } from "./CodexAccountRow";
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

/**
 * "ẢNH SẼ ĐƯỢC TẠO BẰNG MODEL NÀO" — CÂU HỎI CÓ THẬT, VÀ TRƯỚC ĐÂY KHÔNG CÓ CHỖ TRẢ LỜI.
 *
 * `gen.sh` ép model rẻ + mức nghĩ vừa (`-m` + `model_reasoning_effort`) vì việc của
 * model ở đây rất nhẹ: đọc prompt, gọi tool vẽ, ghi file. Nhưng cả app không hiện chỗ
 * nào cho biết điều đó có thật sự đang xảy ra hay không, nên câu hỏi "sao tốn token
 * thế" không có cách nào tự trả lời — phải đi đọc rollout của codex mới biết.
 *
 * BA TRẠNG THÁI, VÀ KHÔNG TRẠNG THÁI NÀO ĐƯỢC PHÉP NÓI QUÁ:
 *  · `known === false` — codex trên máy KHÔNG biết tên model này ⇒ chính cổng của
 *    gen.sh sẽ bỏ `-m` và chạy bằng model của hồ sơ. Phải cảnh báo, vì đây đúng là ca
 *    "tưởng đang chạy model rẻ mà không phải".
 *  · `requested === null` — engine CỐ Ý không ép (`KITGEN_GEN_MODEL=""`).
 *  · `source === "unknown"` — không đọc được gen.sh. Im lặng còn hơn bịa một cái tên.
 *
 * Chữ dùng là **"sẽ yêu cầu"**, không phải "đang chạy bằng": catalog chỉ chứng minh
 * codex BIẾT tên model, không chứng minh provider chịu phục vụ — gen.sh còn một nhánh
 * tự chữa hạ xuống model hồ sơ khi bị từ chối, và nhánh đó chỉ lộ ra trong log lượt chạy.
 */
type GenModel = NonNullable<NonNullable<Doctor["imageGen"]>["model"]>;

function GenModelRow({ model }: { model: GenModel | undefined }) {
  if (!model || model.source === "unknown") return null;

  if (!model.requested) {
    return (
      <Note>
        Engine không ép model — ảnh sẽ được tạo bằng model mặc định của hồ sơ Codex.
      </Note>
    );
  }

  const gated = model.known === false;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption text-fg-muted">Sẽ yêu cầu</span>
        <Badge tone={gated ? "warn" : "outline"}>
          <span className="font-mono">{model.requested}</span>
        </Badge>
        {model.effort && (
          <>
            <span className="text-caption text-fg-muted">mức nghĩ</span>
            <Badge tone={gated ? "warn" : "outline"}><span className="font-mono">{model.effort}</span></Badge>
          </>
        )}
        {model.source === "env" && (
          <span className="text-caption text-fg-muted">(đặt bằng <span className="font-mono">KITGEN_GEN_MODEL</span>)</span>
        )}
      </div>
      {gated && (
        <Note>
          Bản Codex trên máy không có tên model này trong danh mục, nên engine sẽ bỏ qua và
          chạy bằng model mặc định của hồ sơ — có thể nghĩ sâu hơn và tốn token hơn.
        </Note>
      )}
    </div>
  );
}

const MODE_LABEL: Record<string, string> = {
  "default-home": "cấu hình mặc định",
  "img-home": "home riêng cho tạo ảnh",
  "profile-overlay": "hồ sơ phủ thêm",
  unavailable: "chưa dùng được",
  unknown: "chưa xác định",
};

export function ImageGenCard({ doctor }: { doctor: Doctor | null }) {
  const out = imageGenOutcome(doctor);
  /* Agent chạy được `codex` KHÔNG có nghĩa Terminal của user gõ được — xem
     `agent/lib/doctor.mjs:codexWhere`. Hai lệnh copy bên dưới đi thẳng vào tay
     user nên phải bám cái thứ hai, nếu không là `command not found`. */
  const codex = doctor?.codex;
  const shellBlind = codex?.ok === true && codex.shellOk === false;
  const pathDir = typeof codex?.shellDirLabel === "string" ? codex.shellDirLabel : null;

  return (
    <StepCard title="Tạo ảnh AI">
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot tone={out.tone === "ok" ? "ok" : "warn"} label={out.title} />
        <Badge tone={out.tone === "ok" ? "ok" : "warn"} aria-label={`Chế độ tạo ảnh: ${MODE_LABEL[out.mode] ?? out.mode}`}>
          <span className="font-mono">{out.mode}</span>
        </Badge>
      </div>
      {out.detail && <p className="text-body text-fg">{out.detail}</p>}

      {/* Ai đang đăng nhập + nút đăng xuất — tự ẩn khi chưa đăng nhập. */}
      <CodexAccountRow />

      <GenModelRow model={doctor?.imageGen?.model} />

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
              {shellBlind && (
                <Note>
                  Máy đã cài codex nhưng <strong>Terminal của bạn chưa thấy nó</strong> — gõ{" "}
                  <span className="font-mono">codex</span> sẽ ra <span className="font-mono">command not found</span>.
                  Hai lệnh dưới đây đã được viết bằng đường đầy đủ nên dán vào là chạy được.
                  {pathDir && " Muốn gõ ngắn gọn từ lần sau thì thêm dòng PATH ở cuối vào ~/.zshrc."}
                </Note>
              )}
              <CopyableCode value={imgHomeLoginCmd(codex)} label="Lệnh đăng nhập Codex" />
              <CopyableCode value={imgHomeCheckCmd(codex)} label="Lệnh kiểm tra công cụ tạo ảnh" />
              {shellBlind && pathDir && (
                <CopyableCode value={codexPathFixCmd(pathDir)} label="Thêm codex vào PATH (dán vào ~/.zshrc)" />
              )}
              <Note>
                Lệnh kiểm tra chỉ ĐẾM xem có công cụ tạo ảnh hay không — không sinh ảnh, không tốn
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
