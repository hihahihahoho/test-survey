import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 */
export function AboutTab({ status }: { status: ConnectionStatus }) {
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
        <CardContent>
          <dl className="flex flex-col divide-y divide-line-subtle">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-body text-fg-muted">{r.label}</dt>
                <dd className="font-mono text-caption text-fg-strong">{r.value}</dd>
              </div>
            ))}
          </dl>
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
