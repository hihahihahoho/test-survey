import * as React from "react";
import { ClipboardCopy, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Gate } from "@/features/projects/lib/gate";
import type { Run } from "@/lib/types";
import { diagnosisText } from "@/features/runs";
import { buildDiagnosticsText, currentOsLabel } from "@/features/runs/lib/diagnostics";
import { useCopy } from "@/features/setup/hooks/use-copy";
import { useHealth } from "@/lib/hooks";

/**
 * DẢI "LƯỢT GEN VỪA RỒI CÓ LỖI" — BACKLOG #22.
 *
 * ══ VÌ SAO DẢI NÀY TỒN TẠI ═══════════════════════════════════════════════════
 * Trước bản này, một lượt gen chết 100% chỉ được nói ra ở TỪNG Ô kết quả: phải mở
 * từng ô mới thấy "chạy xong nhưng ảnh không được ghi". Chủ sản phẩm dính hai lần
 * trong một ngày và cả hai lần đều mô tả giống nhau — «nó chẳng báo gì cả». Đúng:
 * mười ô cùng nói khẽ một câu thì tổng cộng vẫn là im lặng. Trang phải nói MỘT câu,
 * ở ĐẦU trang, trước khi người dùng kịp cuộn.
 *
 * ══ BỐN QUYẾT ĐỊNH ═══════════════════════════════════════════════════════════
 * ① **Đỏ, không vàng.** `StaleBanner` cạnh đây cố ý màu vàng vì "ảnh cũ hơn thiết kế"
 *    là trạng thái BÌNH THƯỜNG của quy trình. Còn đây là việc đã hỏng và sẽ không tự
 *    khỏi — nhuộm vàng nó là nói giảm.
 * ② **Kèm bằng chứng, tối đa 3 dòng.** `errorTail` của job đỏ ĐẦU TIÊN, do agent
 *    redact sẵn. Đây là thứ phân biệt `rc=127` (thiếu codex) với `SyntaxError` (engine
 *    chết) — hai ca mà `diagnosis` gộp chung thành một câu vô dụng. Nhật ký đầy đủ vẫn
 *    ở drawer của từng lượt; ở đây chỉ cần đủ để biết nên hỏi ai.
 * ③ **Hai nút, không hơn.** "Tạo lại toàn bộ" (chữa) và "Copy chẩn đoán" (nhờ chữa).
 * ④ **Tự tắt khi hết chuyện.** Lượt gần nhất xong sạch, hoặc đang chạy, hoặc bị dừng
 *    tay ⇒ không vẽ gì. Dải này không bao giờ là đồ trang trí thường trực.
 */
export function RunFailBanner({
  run,
  gate,
  onRegenerate,
}: {
  /** Lượt chạy GẦN NHẤT của dự án (`items[0]` của #33). */
  run: Run | null | undefined;
  gate: Gate;
  /** Mở modal M1 với toàn bộ lượt — cửa duy nhất tiêu quota (§4.8). */
  onRegenerate: () => void;
}) {
  const { copy } = useCopy();
  /* Phiên bản công cụ local cho khối chẩn đoán. Dùng `useHealth` (Query, `refetchInterval:
     false`) chứ KHÔNG `useAgentStatus`: hook kia mang cả một vòng probe backoff riêng, và
     mount thêm một vòng nữa chỉ để đọc một chuỗi version là nhân đôi nhịp dò. */
  const health = useHealth();

  const failed = React.useMemo(() => (run?.jobs ?? []).filter((j) => j.status === "failed"), [run]);

  /* `env-failed` = engine còn chẳng chạy được (thiếu gen.sh, spawn hỏng). Nó KHÔNG có
     job đỏ nào theo nghĩa thông thường nhưng lại là ca im lặng nhất, nên vẫn phải hiện. */
  const broken = run?.status === "done-with-errors" || run?.status === "env-failed";
  if (!run || !broken) return null;

  const total = run.jobs?.length ?? 0;
  const first = failed[0];
  const tail = first?.errorTail ?? [];
  const headline = run.failSummary
    ?? (failed.length > 0
      ? `${failed.length}/${total} lượt không tạo được ảnh`
      : "Lượt chạy vừa rồi không chạy được");

  const onCopy = () => {
    void copy(
      buildDiagnosticsText({
        run,
        appVersion: __APP_VERSION__,
        agentVersion: health.data?.runtimeVersion ?? health.data?.version ?? null,
        os: currentOsLabel(),
      }),
      "chẩn đoán",
    );
  };

  return (
    <div
      role="alert"
      data-run-fail-banner
      className="flex flex-wrap items-start gap-3 rounded-3 border border-danger/60 bg-danger/[0.1] p-4"
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-on-tint-danger" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-subtitle text-fg-strong">{headline}</p>
        {first && (
          <p className="mt-0.5 text-caption text-fg">
            {`Lượt ${first.job}: ${diagnosisText(first.diagnosis)}.`}
          </p>
        )}
        {/* BẰNG CHỨNG — agent đã che khoá và rút gọn đường dẫn trước khi gửi (§4.3).
            `overflow-x-auto` vì một dòng lỗi của codex có thể dài hơn cả màn hình, và
            cho nó xuống dòng sẽ biến dải cảnh báo thành một khối chữ nửa trang. */}
        {tail.length > 0 && (
          <pre className="mt-2 max-w-full overflow-x-auto rounded-2 bg-raised px-3 py-2 text-caption text-fg">
            {tail.join("\n")}
          </pre>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onRegenerate}
        >
          <RefreshCw aria-hidden />Tạo lại toàn bộ
        </Button>
        {/* CỤC BỘ: chỉ ghi vào clipboard của máy này, không gửi đi đâu. Chuỗi chép ra
            chỉ gồm dữ liệu agent đã redact — xem `lib/diagnostics.ts`. */}
        <Button variant="ghost" size="sm" onClick={onCopy} title="Chép vào bộ nhớ tạm của máy này để gửi cho người hỗ trợ">
          <ClipboardCopy aria-hidden />Copy chẩn đoán
        </Button>
      </div>
    </div>
  );
}
