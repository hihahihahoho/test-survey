import * as React from "react";
import { ArrowUpCircle, Check, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableCode } from "@/components/common/CopyableCode";
import { useInstallUpdateFlow, useUpdateCheck } from "@/lib/hooks";
import { APP_PROTOCOL, type ConnectionStatus } from "@/lib/api";

/**
 * TAB "VỀ" (§3-S6) — phiên bản + KHỐI QUYỀN RIÊNG TƯ (yêu cầu #7).
 *
 * Khối quyền riêng tư không phải câu tiếp thị: nó là lời hứa kiểm chứng được của
 * kiến trúc này (web tĩnh + agent chạy trên máy). Ba câu dưới đây đúng với mã:
 *  · dữ liệu nằm trên máy — mọi endpoint đều là `127.0.0.1`, không có server nào khác;
 *  · không gửi gì lên server — không có analytics/telemetry nào trong bundle;
 *  · không lưu thông tin đăng nhập — `persist.ts` có allowlist khoá + bộ dò secret,
 *    và kit-gen chỉ HỎI agent "đã đăng nhập chưa", không bao giờ đọc nội dung.
 *
 * KHỐI "KIỂM TRA CẬP NHẬT" — vì sao ở đây chứ không tự chạy khi mở màn: gọi ra Internet
 * là việc DUY NHẤT trong app không nằm trên máy user, nên nó phải do user bấm. Query
 * dùng chung khoá `["update"]` với popover trạng thái ở header, nên bấm ở đây cũng làm
 * mới chấm báo bản mới trên đó — không có hai nguồn sự thật về version.
 */
export function AboutTab({ status }: { status: ConnectionStatus }) {
  /* `enabled:false` — tab này KHÔNG tự gọi; nó đọc lại kết quả của lần kiểm tra im lặng
     lúc mở app (cùng khoá `["update"]`), và nút bên dưới ép `refetch()` khi user muốn. */
  const update = useUpdateCheck({ enabled: false });
  const install = useInstallUpdateFlow();
  const check = React.useCallback(() => void update.refetch(), [update]);

  const rows: { label: string; value: string }[] = [
    { label: "Giao diện web", value: __APP_VERSION__ },
    { label: "Công cụ local", value: status.agentVersion ? `v${status.agentVersion}` : "chưa kết nối" },
    { label: "Giao thức", value: `protocol ${status.health?.protocol ?? APP_PROTOCOL}` },
    { label: "Thư mục làm việc", value: status.workspaceLabel ?? "chưa rõ" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader><CardTitle>Phiên bản</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-line-subtle">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                <dt className="text-body text-fg-muted">{r.label}</dt>
                <dd className="font-mono text-caption text-fg-strong">{r.value}</dd>
              </div>
            ))}
            {update.data?.ok && (
              <div className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-body text-fg-muted">Bản phát hành mới nhất</dt>
                <dd className="font-mono text-caption text-fg-strong">{update.data.latestVersion}</dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={check}
              loading={update.isFetching}
              disabled={!status.connected}
            >
              <RefreshCw aria-hidden /> Kiểm tra cập nhật
            </Button>
            {update.data?.ok && update.data.available && (
              <Button size="sm" onClick={() => void install.start(update.data?.latestVersion)} loading={install.pending}>
                <ArrowUpCircle aria-hidden /> Cập nhật ngay
              </Button>
            )}
          </div>

          {/* Một dòng kết quả duy nhất, `aria-live` để screen reader nghe được sau khi bấm. */}
          <p role="status" aria-live="polite" className="flex items-start gap-2 text-caption text-fg-muted">
            {!status.connected
              ? <>Công cụ local chưa chạy nên chưa kiểm tra được bản mới.</>
              : update.isFetching
                ? <>Đang hỏi bản phát hành mới nhất…</>
                : !update.data
                  ? <>Chưa kiểm tra lần nào. Việc kiểm tra chỉ chạy khi bạn bấm — app không tự gọi ra Internet.</>
                  : !update.data.ok
                    ? <><WifiOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />{update.data.reason === "OFFLINE"
                        ? "Không đọc được danh sách bản phát hành — kiểm tra kết nối mạng rồi thử lại."
                        : "Danh sách bản phát hành đang lỗi định dạng. Dùng lệnh bên dưới để cập nhật thủ công."}</>
                    : update.data.available
                      ? <><ArrowUpCircle className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />Có bản {update.data.latestVersion}. Bản đang chạy là {update.data.currentVersion}.</>
                      : <><Check className="mt-0.5 size-3.5 shrink-0 text-on-tint-ok" aria-hidden />Đang dùng bản mới nhất ({update.data.currentVersion}).</>}
          </p>

          {update.data && (!update.data.ok || update.data.available) && (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-fg-muted">Hoặc cập nhật thủ công trong Terminal:</p>
              <CopyableCode value={update.data.updateCommand} label="Lệnh cập nhật KitGen" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-accent-text" aria-hidden />
            Quyền riêng tư
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-body text-fg">
          <p className="max-w-[68ch]">
            <strong className="text-fg-strong">File dự án nằm trên máy bạn.</strong> KitGen chỉ đọc
            chúng qua công cụ local đang chạy trên máy.
          </p>
          <p className="max-w-[68ch]">
            <strong className="text-fg-strong">Không có thống kê hay theo dõi hành vi.</strong> Khi bạn
            bấm tạo ảnh, công cụ local chỉ gửi prompt và dữ liệu đầu vào cần thiết tới dịch vụ tạo ảnh đã cấu hình.
          </p>
          <p className="max-w-[68ch]">
            <strong className="text-fg-strong">Không lưu thông tin đăng nhập.</strong> kit-gen chỉ
            hỏi công cụ local “đã đăng nhập tài khoản tạo ảnh chưa”, và không bao giờ đọc hay lưu
            nội dung đăng nhập ở trình duyệt.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
