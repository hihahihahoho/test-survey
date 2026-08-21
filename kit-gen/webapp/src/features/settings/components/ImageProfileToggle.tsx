import * as React from "react";
import { Lock, Loader2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CopyableCode, StatusDot } from "@/components/common";
import { StepCard } from "@/features/setup/components/StepShell";
import { CodexLoginPanel } from "@/features/setup/steps/parts/CodexLoginPanel";
import { useSetImageProfile, type useDoctor } from "@/lib/hooks";
import { devDetails, presentError, type ConnectionStatus } from "@/lib/api";
import { IMAGE_PROFILES, imageProfileView, type ImageProfileWire } from "../lib/image-profile";

/**
 * TOGGLE "Hồ sơ Codex dùng để tạo ảnh" (Cài đặt → Tạo ảnh, ngay dưới thẻ trạng thái).
 *
 * VÌ SAO CẦN: máy có thể có HAI hồ sơ Codex — `~/.codex` (mặc định, có khi trỏ sang nhà
 * cung cấp không trả ảnh về máy) và `~/.codex-img` (home riêng chỉ để tạo ảnh). Trước
 * đây thẻ "Tạo ảnh AI" chỉ ĐỌC trạng thái, muốn đổi hồ sơ phải sửa tay
 * `<workspace>/.kitgen/config.json`. Nay chọn ở đây là agent GHI BỀN vào chính file đó,
 * nên chọn xong đóng app mở lại vẫn giữ.
 *
 * VÌ SAO Ở THẺ RIÊNG chứ không nhét vào `ImageGenCard`: `ImageGenCard` là tài sản của
 * màn S0 (features/setup) và đang có người sửa song song. Thẻ này dùng LẠI `StepCard`
 * của họ nên nhìn liền một mạch với thẻ trên, mà không phải sửa file của họ.
 *
 * RANH GIỚI VỚI ĐĂNG NHẬP (arch §4.4) — giống hệt `ImageGenCard`:
 *  · Chọn hồ sơ ≠ đăng nhập. Web chỉ gửi ENUM ("default" | "separate"); agent chỉ ghi
 *    enum + nhãn `~/…` vào config, KHÔNG đọc `auth.json`/`config.toml` của hồ sơ đó.
 *  · Nếu hồ sơ riêng chưa đăng nhập, ở đây CHỈ HIỆN LỆNH để user tự chạy trong Terminal.
 *    Không có nút chạy hộ, và cố ý là vậy.
 *
 * SAU KHI ĐỔI phải làm mới doctor: trạng thái "Sẵn sàng/chưa dùng được" là của HỒ SƠ CŨ.
 * Agent tự bỏ cache doctor 60s khi nhận PATCH, còn phía web `refetch()` để đọc lại ngay.
 */
export function ImageProfileToggle({
  doctor,
  status,
}: {
  doctor: ReturnType<typeof useDoctor>;
  status: ConnectionStatus;
}) {
  const setProfile = useSetImageProfile();
  const data = doctor.data ?? null;
  const view = imageProfileView(data, { connected: status.connected });

  /* Chọn LẠC QUAN: Radix đổi ngay khi bấm, còn doctor mất ~1s mới trả lời. Không có
     nó thì nút bật ngược về hồ sơ cũ trong lúc chờ, trông như bấm trượt. */
  const [pendingWire, setPendingWire] = React.useState<ImageProfileWire | null>(null);
  const value = pendingWire ?? view.wire;

  const onChange = (next: string) => {
    // Radix single-toggle trả "" khi bấm lại nút đang bật — đó KHÔNG phải "bỏ chọn hồ sơ".
    if (next !== "default" && next !== "separate") return;
    if (next === view.wire) return;
    setPendingWire(next);
    setProfile.mutate(next, {
      // `await` là có chủ đích: giữ lựa chọn lạc quan cho tới khi doctor đã trả lời cho
      // hồ sơ MỚI. Buông sớm thì nút nhấp một nhịp về hồ sơ cũ (doctor cũ vẫn trong cache).
      onSuccess: async () => { await doctor.refetch(); },
      onSettled: () => setPendingWire(null),
    });
  };

  const busy = setProfile.isPending;
  const disabled = !status.connected || busy;

  return (
    <StepCard title="Hồ sơ Codex dùng để tạo ảnh">
      <p className="max-w-[62ch] text-body text-fg">
        kit-gen gọi Codex bằng đúng hồ sơ bạn chọn ở đây. Lựa chọn được lưu vào thư mục
        làm việc nên giữ nguyên ở những lần mở sau.
      </p>

      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        aria-label="Hồ sơ Codex dùng để tạo ảnh"
        className="flex-wrap justify-start"
      >
        {IMAGE_PROFILES.map((o) => (
          <ToggleGroupItem key={o.wire} value={o.wire} aria-label={o.label} className="font-mono">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <p className="max-w-[62ch] text-caption text-fg-muted">{view.option.hint}</p>

      <div className="flex flex-wrap items-center gap-3">
        {busy
          ? (
            <span className="inline-flex items-center gap-2 text-caption text-fg-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Đang đổi hồ sơ và kiểm tra lại…
            </span>
          )
          : <StatusDot tone={view.tone === "ok" ? "ok" : "warn"} label={view.status} />}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
        <dt className="text-fg-muted">Đang chọn</dt>
        <dd className="font-mono text-fg-strong">{view.option.label}</dd>
        <dt className="text-fg-muted">Cấu hình đang dùng</dt>
        <dd className="font-mono text-fg-strong">{view.homeLabel}</dd>
      </dl>

      {view.needsLogin && (
        <div className="flex flex-col gap-2">
          <p className="text-body text-fg">
            Hồ sơ <span className="font-mono">{view.homeLabel}</span> chưa đăng nhập.
          </p>
          {/* Agent tự đọc hồ sơ ĐANG CHỌN trong config để biết đăng nhập vào CODEX_HOME
              nào — nên nút này luôn khớp với dòng "Cấu hình đang dùng" ngay phía trên,
              kể cả khi user vừa gạt toggle xong. Đăng nhập nhầm home là kiểu hỏng tệ
              nhất: mọi thứ báo thành công mà lượt gen vẫn kêu chưa đăng nhập. */}
          <CodexLoginPanel />
          <details className="rounded-2 border border-line-subtle bg-canvas p-3">
            <summary className="cursor-pointer text-body text-fg">
              Cách khác: tự chạy lệnh trong Terminal
            </summary>
            <div className="mt-3">
              <CopyableCode value={`CODEX_HOME=${view.homeLabel} codex login`} label="Lệnh đăng nhập cho hồ sơ này" />
            </div>
          </details>
        </div>
      )}

      {setProfile.isError && (
        <div className="rounded-2 border border-line-subtle bg-canvas p-3">
          <p className="text-body text-warn">
            Chưa lưu được lựa chọn: {presentError(setProfile.error).explain}
          </p>
          {devDetails(setProfile.error) && (
            <p className="mt-1 font-mono text-caption text-fg-muted">{devDetails(setProfile.error)}</p>
          )}
        </div>
      )}

      <p className="inline-flex items-start gap-2 text-caption text-fg-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Đổi hồ sơ chỉ đổi thư mục cấu hình mà kit-gen gọi tới — nó không đọc, không hiện và
        không lưu thông tin đăng nhập trong đó.
      </p>
    </StepCard>
  );
}
