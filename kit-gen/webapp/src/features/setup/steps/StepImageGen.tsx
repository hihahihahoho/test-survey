import { FolderPlus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common";
import { presentError } from "@/lib/api";
import type { Doctor } from "@/lib/types/api";
import { InlineBanner } from "../components/InlineBanner";
import { DevDetails } from "../components/DevDetails";
import { StepCard, StepShell, Note } from "../components/StepShell";
import { DoctorChecklist } from "./parts/DoctorChecklist";
import { ImageGenCard } from "./parts/ImageGenCard";

/**
 * S0 · BƯỚC 4 — MÔI TRƯỜNG & TẠO ẢNH (§3-S0 bước 4, yêu cầu #5).
 *
 * Gọi `/api/doctor` MỘT lần khi vào bước, và chỉ gọi lại khi user bấm [Kiểm tra lại]
 * (§6.2 cấm poll — mỗi lần chạy `codex debug prompt-input` tốn ~1s CPU của user).
 *
 * 4 trạng thái + ca agent chưa chạy, tất cả đều KẾT THÚC ĐƯỢC WIZARD:
 *  loading      — skeleton, không khoá nút
 *  error        — copy lấy từ bảng §3.9 + panel dev; **vẫn cho vào app** (quản lý project
 *                 không cần doctor), chỉ nói rõ phần sinh ảnh chưa chắc chạy
 *  agent offline— banner vàng + vẫn cho vào app ở chế độ chỉ-đọc (§2.5)
 *  success      — checklist + khối tạo ảnh + 2 nút to kết thúc
 *
 * KHÔNG BAO GIỜ báo "✅ xong" khi môi trường hỏng — đó là điều cấm số 2 của §3.9.
 */
export interface StepImageGenProps {
  doctor: Doctor | null;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  agentOffline: boolean;
  onRecheck: () => void;
  onFinish: () => void;
  onCreateFirst: () => void;
  onImport: () => void;
}

export function StepImageGen({
  doctor, loading, refreshing, error, agentOffline, onRecheck, onFinish, onCreateFirst, onImport,
}: StepImageGenProps) {
  const lead =
    "Bước cuối: xem máy bạn đã đủ thứ để sinh ảnh và cắt ảnh chưa. Thiếu gì chúng tôi nói rõ thiếu " +
    "cái gì và mất tính năng nào — không có gì bắt buộc phải xong ngay.";

  /* ── CA AGENT CHƯA CHẠY ───────────────────────────────────────────────── */
  if (agentOffline) {
    return (
      <StepShell title="Môi trường & tạo ảnh AI" lead={lead}>
        <InlineBanner
          tone="warning"
          title="Chưa hỏi được máy bạn vì công cụ local chưa chạy"
          description="Bạn vẫn vào app được — chỉ là ở chế độ chỉ xem cho tới khi công cụ local chạy."
          actions={
            <Button variant="secondary" onClick={onRecheck} loading={refreshing}>
              <RefreshCw aria-hidden />
              Kiểm tra lại
            </Button>
          }
        />
        <FinishRow onFinish={onFinish} onCreateFirst={onCreateFirst} onImport={onImport} allowSkip />
      </StepShell>
    );
  }

  /* ── LOADING lần đầu ──────────────────────────────────────────────────── */
  if (loading && !doctor) {
    return (
      <StepShell title="Môi trường & tạo ảnh AI" lead={lead}>
        <StepCard title="Đang kiểm tra máy bạn">
          <Note>Việc này mất khoảng 1 giây và chỉ chạy khi bạn mở bước này.</Note>
          {/* 7 dòng = đúng số mục của checklist, không đoán bừa (§5.6 SkeletonBlock) */}
          <LoadingState count={7} variant="rows" label="Đang kiểm tra môi trường trên máy bạn…" />
        </StepCard>
      </StepShell>
    );
  }

  /* ── ERROR ────────────────────────────────────────────────────────────── */
  if (error && !doctor) {
    const v = presentError(error);
    return (
      <StepShell title="Môi trường & tạo ảnh AI" lead={lead}>
        <ErrorState
          variant="inline"
          title={`Không kiểm tra được môi trường — ${v.title}`}
          description={v.explain}
          actions={
            <Button variant="secondary" size="sm" onClick={onRecheck} loading={refreshing}>
              <RefreshCw aria-hidden />
              Thử lại
            </Button>
          }
        />
        <DevDetails error={error} />
        <Note>
          Bạn vẫn dùng được phần quản lý project; chỉ phần sinh ảnh là chưa chắc chạy được.
        </Note>
        <FinishRow onFinish={onFinish} onCreateFirst={onCreateFirst} onImport={onImport} allowSkip />
      </StepShell>
    );
  }

  /* ── SUCCESS ──────────────────────────────────────────────────────────── */
  return (
    <StepShell title="Môi trường & tạo ảnh AI" lead={lead}>
      <ImageGenCard doctor={doctor} />
      <DoctorChecklist doctor={doctor} />
      <div>
        <Button variant="secondary" onClick={onRecheck} loading={refreshing}>
          <RefreshCw aria-hidden />
          Kiểm tra lại
        </Button>
      </div>
      <FinishRow onFinish={onFinish} onCreateFirst={onCreateFirst} onImport={onImport} />
    </StepShell>
  );
}

/**
 * Kết thúc wizard — §3-S0: đúng 2 nút to. `primary` chỉ MỘT (§5.4), nút còn lại secondary.
 * Cả hai đều ghi `kitgen.setup.v1.completed = true` trước khi điều hướng, nên user không
 * bao giờ bị ném ngược về wizard sau khi đã đi qua nó.
 */
function FinishRow({
  onFinish, onCreateFirst, onImport, allowSkip = false,
}: {
  onFinish: () => void;
  onCreateFirst: () => void;
  onImport: () => void;
  allowSkip?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
      <Button
        variant="primary"
        size="lg"
        data-kg-primary=""
        onClick={() => {
          onFinish();
          onCreateFirst();
        }}
      >
        <FolderPlus aria-hidden />
        Tạo project đầu tiên
      </Button>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => {
          onFinish();
          onImport();
        }}
      >
        <Upload aria-hidden />
        Nhập từ styles.json cũ
      </Button>
      {allowSkip && (
        <Button variant="ghost" onClick={onFinish}>
          Bỏ qua kiểm tra và vào app
        </Button>
      )}
    </div>
  );
}
