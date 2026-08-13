import * as React from "react";
import { ImageOff, Loader2, Ban, RotateCw } from "lucide-react";
import { CheckerboardImage } from "@/components/common";
import { FOCUS } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import { loadFull, loadThumb } from "../lib/image-source";
import type { Backdrop } from "../lib/backdrop";
import { backdropClass } from "../lib/backdrop";

/**
 * MỘT Ô ẢNH KIT — lazy-load thật + nền xem thử 3 chế độ.
 *
 * VÌ SAO KHÔNG DÙNG THẲNG `<CheckerboardImage src=…>` CỦA R0:
 * component đó nhận `src` gắn vào `<img>`, mà `<img src>` tới agent trả **403**
 * (đo thật, xem `lib/image-source.ts` phần đầu). Nên ở đây: tải bytes qua transport
 * → object URL → MỚI đưa vào `CheckerboardImage`. Vẫn dùng component của R0 để giữ
 * nguyên nền checkerboard, `object-fit: contain`, và ca ảnh hỏng của họ.
 *
 * LAZY-LOAD (yêu cầu của brief: kit thật có thể >500 ảnh):
 *  · `IntersectionObserver` với `rootMargin: 300px` — chỉ tải khi ô gần vào khung nhìn.
 *  · Ô cuộn qua rất nhanh mà chưa kịp tải ⇒ `handle.cancel()` bỏ khỏi hàng đợi.
 *  · Vẫn giữ `loading="lazy"` ở `<img>` (do R0 đặt) như lớp thứ hai.
 * Kết quả: mở kit 500 ảnh chỉ phát ~20–30 request đầu, không phải 500.
 */
export interface KitImageProps {
  projectId: string;
  /** đường dẫn tương đối trong project, vd `kits/tet/01-btn.png` */
  path: string;
  /** nhãn tiếng Việt có nghĩa (A9) */
  alt: string;
  backdrop: Backdrop;
  /** true ⇒ ảnh GỐC (lightbox). false ⇒ thumbnail `?w=256` (§6.5-5). */
  full?: boolean;
  /** true ⇒ tải ngay, không chờ vào khung nhìn (dùng ở lightbox). */
  eager?: boolean;
  /** file cắt ra rỗng — nói thật, không hiện ô trống bí ẩn */
  empty?: boolean;
  /** agent chưa chạy ⇒ không thử tải, hiện "Ảnh nằm trên máy bạn" (§2.5-3) */
  offline?: boolean;
  className?: string;
  imgClassName?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "failed" }
  /** vẫn đang tải nhưng đã quá lâu ⇒ ngừng quay, đưa nút bấm lại (§B1). */
  | { kind: "slow" };

/**
 * Ngưỡng "quá lâu". `TIMEOUT.get` của transport là 8s + 1 lần thử lại, và ô còn phải
 * xếp hàng sau tối đa 6 request khác ⇒ 20s là mốc mà một ô BÌNH THƯỜNG không bao giờ
 * chạm tới. Chạm tới nghĩa là có gì đó hỏng, và người dùng cần một cái nút chứ không
 * cần một vòng xoay nữa.
 */
export const SLOW_LOAD_MS = 20_000;

export function KitImage({
  projectId,
  path,
  alt,
  backdrop,
  full = false,
  eager = false,
  empty = false,
  offline = false,
  className,
  imgClassName,
}: KitImageProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<State>({ kind: "idle" });
  const [visible, setVisible] = React.useState(eager);
  /** Tăng lên ⇒ effect tải chạy lại. Đây là đường DUY NHẤT để thử lại. */
  const [attempt, setAttempt] = React.useState(0);
  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  React.useEffect(() => {
    if (eager || visible) return;
    const node = ref.current;
    if (node === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true); // môi trường không có IO (jsdom cũ) ⇒ tải luôn, đừng để ô trắng mãi
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [eager, visible]);

  /**
   * ══ TẢI BYTES → OBJECT URL ═══════════════════════════════════════════════
   *
   * ⚠️ ĐỌC TRƯỚC KHI THÊM `state` VÀO MẢNG PHỤ THUỘC — bản trước có `state.kind`
   * ở đó và ĐÓ CHÍNH LÀ BUG "quay mãi không dừng":
   *   ① effect chạy (state.kind === "idle") → `setState({loading})`
   *   ② `state.kind` đổi ⇒ React coi phụ thuộc đã đổi ⇒ chạy CLEANUP của chính
   *      lần vừa rồi: `alive = false` + `handle.cancel()`
   *   ③ effect chạy lại, nhưng `state.kind !== "idle"` nên thoát ngay
   *   ④ promise về sau đó rơi vào `alive === false` ⇒ KHÔNG ai đặt `ready`
   * Kết quả: mọi ô ảnh kết quả kẹt ở `loading` — `aria-busy="true"` + vòng xoay
   * vĩnh viễn, F5 bao nhiêu lần cũng thế. Tab Skeleton không dính vì nó vẽ SVG,
   * không đi qua component này.
   *
   * Effect này vì thế CHỈ phụ thuộc vào những thứ ĐỔI THÌ PHẢI TẢI LẠI THẬT
   * (ô vào khung nhìn, đổi file, đổi kích thước, bấm thử lại). Nó tự đặt
   * `loading` mỗi lần chạy nên không cần trạng thái "idle" làm cổng chặn nữa.
   */
  React.useEffect(() => {
    if (offline || empty || !visible) return;
    let alive = true;
    setState({ kind: "loading" });
    const handle = full ? loadFull(projectId, path) : loadThumb(projectId, path);
    /* Vẫn để request chạy tiếp — nó có thể về muộn và tự lên `ready`. Cái đổi ở đây
       chỉ là NÓI THẬT với người dùng rằng chờ tiếp là vô ích, kèm một lối thoát. */
    const slowTimer = setTimeout(() => {
      if (alive) setState((prev) => (prev.kind === "loading" ? { kind: "slow" } : prev));
    }, SLOW_LOAD_MS);
    handle.promise.then(
      (url) => {
        if (alive) setState({ kind: "ready", url });
      },
      () => {
        if (alive) setState({ kind: "failed" });
      },
    );
    return () => {
      alive = false;
      clearTimeout(slowTimer);
      handle.cancel();
    };
  }, [visible, offline, empty, full, projectId, path, attempt]);

  const shell = cn("relative overflow-hidden rounded-2 border border-line", className);

  /* File rỗng: §3-S5 đòi nói rõ, KHÔNG để ô trống khiến user tưởng lỗi tải. */
  if (empty) {
    return (
      <div ref={ref} className={cn(shell, "flex items-center justify-center bg-raised p-2 text-center")}>
        <span className="flex flex-col items-center gap-1">
          <Ban className="size-4 text-warn" aria-hidden strokeWidth={1.5} />
          <span className="text-caption text-fg-muted-raised">File rỗng</span>
        </span>
        <span className="sr-only">{alt} — file cắt ra rỗng</span>
      </div>
    );
  }

  /* §2.5-3 agent chưa chạy: ảnh nằm trên máy user ⇒ khung xám + chữ, không icon vỡ. */
  if (offline || state.kind === "failed") {
    return (
      <div className={cn(shell, "flex items-center justify-center bg-raised p-2 text-center")} ref={ref}>
        {/* `relative z-10`: lớp phủ `title={path}` ngay dưới đây nằm SAU trong DOM nên
            mặc định phủ lên nút — nút sẽ không bấm được nếu không nâng lớp này lên. */}
        <span className="relative z-10 flex flex-col items-center gap-1">
          <ImageOff className="size-4 text-fg-muted" aria-hidden strokeWidth={1.5} />
          <span className="text-caption text-fg-muted-raised">
            {offline ? "Ảnh nằm trên máy bạn" : "Thiếu file"}
          </span>
          {/* Agent chưa chạy thì bấm lại cũng vô ích ⇒ nút CHỈ hiện ở ca tải hỏng. */}
          {!offline && <RetryButton alt={alt} onRetry={retry} />}
        </span>
        {/* Tooltip đường dẫn TƯƠNG ĐỐI (§3-S5 error) — không bao giờ đường dẫn tuyệt đối */}
        <span className="sr-only">
          {alt}
          {state.kind === "failed" ? ` — không đọc được ${path}` : ""}
        </span>
        {state.kind === "failed" && <span className="absolute inset-0" title={path} aria-hidden />}
      </div>
    );
  }

  /* Tải quá lâu — KHÔNG quay tiếp. Vòng xoay không có hồi kết là lời hứa suông. */
  if (state.kind === "slow") {
    return (
      <div className={cn(shell, "flex items-center justify-center bg-raised p-2 text-center")} ref={ref}>
        <span className="flex flex-col items-center gap-1">
          <span className="text-caption text-fg-muted-raised">Ảnh tải lâu bất thường</span>
          <RetryButton alt={alt} onRetry={retry} />
        </span>
        <span className="sr-only">{alt} — chưa tải xong sau {Math.round(SLOW_LOAD_MS / 1000)} giây</span>
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div
        ref={ref}
        className={cn(shell, "flex items-center justify-center", backdropClass(backdrop))}
        aria-busy="true"
      >
        <Loader2 className="size-4 animate-spin text-fg-muted" aria-hidden />
        <span className="sr-only">Đang tải {alt}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="contents">
      <CheckerboardImage
        alt={alt}
        src={state.url}
        // Nền do S5 quyết (ô vuông / đen / trắng) nên ghi đè lớp nền của R0.
        className={cn(shell, backdropClass(backdrop))}
        imgClassName={imgClassName}
      />
    </div>
  );
}

/**
 * Nút "Thử lại" trong ô ảnh.
 *
 * `<button>` thật chứ không phải ô bấm được: ô ảnh nằm trong `<article>` có menu ⋯
 * riêng, và ở lưới kết quả nó còn nằm trong thẻ bấm-được-cả-thẻ. Một nút thật giữ
 * được thứ tự tab và không nuốt cú bấm của thẻ cha (`stopPropagation`).
 */
function RetryButton({ alt, onRetry }: { alt: string; onRetry: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Thử lại tải ${alt}`}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onRetry();
      }}
      className={cn(
        "mt-1 inline-flex items-center gap-1 rounded-2 border border-line px-2 py-1 text-caption text-fg",
        "hover:border-line-strong hover:bg-surface",
        FOCUS,
      )}
    >
      <RotateCw className="size-3" aria-hidden strokeWidth={1.5} />
      Thử lại
    </button>
  );
}
