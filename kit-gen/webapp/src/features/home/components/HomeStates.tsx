import { Boxes, RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, InlineBanner, CopyableCode } from "@/components/common";
import { BTN, EMPTY, MSG } from "@/features/kitfile";
import { errorDetail } from "@/features/projects/lib/feedback";
import { HOME_COPY } from "../lib/home-copy";
import { CreateKitTile } from "./CreateKitTile";
import type { Gate } from "@/features/projects/lib/gate";

/**
 * NĂM CA CỦA MÀN H (FE3-PLAN §0-N6 + UX-V3 §6 hàng H) — tách khỏi màn để soi từng cái:
 *   empty · loading · error · agent-offline · success.
 * Ca `success` là lưới, nằm ở `HomeGrid`.
 */

/**
 * empty — §5.3 hàng H. Chữ lấy nguyên từ `EMPTY.home` của S, màn KHÔNG tự viết.
 *
 * ══ P-SWEEP·9 · MỘT CARD, MỘT CÂU ═══════════════════════════════════════════
 * Bản trước là CARD LỒNG CARD: một khung hairline cao 460px, bên trong lại một
 * khung hairline nữa (chính `CreateKitTile compact`) cao 215px. Hai lớp viền lồng
 * nhau không thêm nghĩa gì, và khối trong bị dồn xuống nửa dưới nên khoảng trống
 * trên/dưới lệch hẳn (ảnh 02).
 *
 * Kèm một câu nói HAI LẦN cùng lúc: `EMPTY.home.body` ("…bạn điền form cho máy làm,
 * hoặc tự xếp trên bàn làm việc") và `HOME_COPY.CREATE_TILE_HINT` ("Điền form cho
 * máy làm, hoặc tự xếp trên bàn.") — gần như trùng từng chữ, cách nhau 40px.
 *
 * Nay: vỏ ngoài mất viền/nền/blur (chỉ còn là hộp canh giữa), thẻ ✚ là CARD DUY
 * NHẤT — đúng chuẩn "card đơn canh giữa" mà empty state của canvas đang dùng. Câu
 * mô tả chỉ còn bản nằm TRONG thẻ, nơi nó đứng ngay cạnh nút phải bấm.
 */
export function HomeEmpty({ gate, onCreate }: { gate: Gate; onCreate: () => void }) {
  return (
    <EmptyState
      icon={Boxes}
      title={EMPTY.home.title}
      className="min-h-[420px]"
      action={<CreateKitTile gate={gate} onCreate={onCreate} compact />}
    />
  );
}

/** empty · lọc ra 0 kết quả. Nói rõ TỪ KHOÁ nào không khớp, kèm đường lùi. */
export function HomeNoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={query ? `${HOME_COPY.FILTER_EMPTY_TITLE} «${query}»` : HOME_COPY.FILTER_EMPTY_TITLE}
      description={HOME_COPY.FILTER_EMPTY_BODY}
      className="min-h-[320px] rounded-5 border border-line-subtle bg-surface/70 backdrop-blur-xl"
      action={
        <Button variant="secondary" onClick={onClear}>
          {BTN.CLEAR_SEARCH}
        </Button>
      }
    />
  );
}

/**
 * loading lần đầu (CHƯA có cache): **6 thẻ skeleton ĐÚNG KHUNG THẺ THẬT** — không
 * spinner giữa màn (§6 hàng H, và là tiêu chí nghiệm thu của FE3-PLAN §3-H1).
 *
 * «Đúng khung thẻ thật» ở đây là điều kiểm được, không phải lời hứa: khung ngoài dùng
 * cùng bộ class với `KitCard` (`rounded-4 border-line-subtle bg-surface p-3 gap-3`) và ô
 * ảnh dùng cùng `aspect-[16/10] rounded-3` với `KitCover` ⇒ lưới không nhảy khi dữ liệu về.
 * Có test khoá đúng ba thuộc tính đó.
 */
export function HomeSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      data-home-skeleton
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
    >
      <span className="sr-only">{HOME_COPY.LOADING_LABEL}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          data-home-skeleton-card
          className="flex flex-col gap-3 rounded-4 border border-line-subtle bg-surface p-3"
        >
          <Skeleton className="aspect-[16/10] w-full rounded-3" />
          <div className="flex flex-col gap-2 px-1 pb-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * error — KHÔNG có cả cache để vẽ. Câu chữ là «chuyện gì xảy ra + việc cần làm»;
 * `error.message` chỉ sống trong `<details>` của `ErrorState` (§6 quy tắc chung).
 */
export function HomeError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <ErrorState
      title={HOME_COPY.ERROR_TITLE}
      description={HOME_COPY.ERROR_BODY}
      detail={errorDetail(error)}
      actions={
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {BTN.RETRY}
        </Button>
      }
    />
  );
}

/**
 * AGENT CHƯA CHẠY — khối dùng chung của §6: banner **dưới header, TRÊN nội dung**,
 * KHÔNG phải overlay chặn màn. Nội dung phía dưới vẫn hiện (danh sách từ cache).
 *
 * `hasCache` đổi đúng một câu: có cache thì nói thẳng danh sách đang xem là bản cũ;
 * không có cache thì không hứa gì về danh sách cả.
 */
export function HomeAgentOffline({
  hasCache,
  onRetry,
}: {
  hasCache: boolean;
  onRetry: () => void;
}) {
  return (
    <InlineBanner
      data-home-agent-banner
      tone="warning"
      title={MSG.AGENT_OFF_TITLE}
      description={
        <div className="flex flex-col gap-2">
          <p>{MSG.AGENT_OFF_BODY}</p>
          <CopyableCode value={MSG.AGENT_OFF_CMD} label="Lệnh chạy công cụ trên máy" />
          {hasCache && <p>{MSG.AGENT_OFF_CACHED}</p>}
        </div>
      }
      actions={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          {BTN.RETRY}
        </Button>
      }
    />
  );
}
