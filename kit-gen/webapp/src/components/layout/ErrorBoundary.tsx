import * as React from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common";
import { devDetails, presentError } from "@/lib/api";

/**
 * ErrorBoundary toàn app + dùng lại cho từng màn.
 *
 * LUẬT §1.5 / §3.9: user KHÔNG BAO GIỜ nhìn thấy chuỗi lỗi kỹ thuật ở thân UI.
 * Ở đây: tiêu đề + giải thích lấy từ bảng tra cứu tĩnh (`presentError`), còn
 * `error.message` / stack chỉ đi vào panel gập "Chi tiết cho lập trình viên"
 * của `ErrorState` (prop `detail`).
 *
 * `resetKey` đổi (vd `location.href`) ⇒ tự reset. Nếu không có cơ chế này thì
 * một màn lỗi sẽ dính lì cả app kể cả khi user đã điều hướng sang màn khác.
 */
export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Đổi giá trị này ⇒ boundary tự thử render lại. */
  resetKey?: string;
  /** Câu tiếng Việt thay cho tiêu đề mặc định (vd nêu tên màn bị lỗi). */
  title?: string;
  /** Nút phụ (vd "Về danh sách project"). */
  extraActions?: React.ReactNode;
}

interface State {
  error: unknown;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: unknown) {
    // Ghi ra console cho lập trình viên. KHÔNG gửi đi đâu — không có telemetry
    // (YC#7: trang web không gửi gì lên server).
    console.error("[kit-gen] lỗi khi render:", error);
  }

  private reset = () => this.setState({ error: null });

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const p = presentError(error);
    const detail = [devDetails(error), stackOf(error)].filter(Boolean).join("\n");

    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState
          title={this.props.title ?? "Màn hình này gặp trục trặc"}
          description={
            p.known
              ? p.explain
              : "Giao diện dừng lại giữa chừng nên không vẽ tiếp được. Dữ liệu của bạn trên máy không bị ảnh hưởng."
          }
          detail={detail}
          actions={
            <>
              <Button variant="primary" onClick={this.reset}>
                <RotateCcw aria-hidden /> Thử lại
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                <RefreshCw aria-hidden /> Tải lại trang
              </Button>
              {this.props.extraActions}
            </>
          }
        />
      </div>
    );
  }
}

function stackOf(error: unknown): string {
  const s = (error as { stack?: unknown } | null)?.stack;
  return typeof s === "string" ? s : "";
}
