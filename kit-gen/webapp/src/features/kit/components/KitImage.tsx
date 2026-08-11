import * as React from "react";
import { ImageOff, Loader2, Ban } from "lucide-react";
import { CheckerboardImage } from "@/components/common";
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
  | { kind: "failed" };

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

  // Đổi file (lọc lại lưới, cắt lại) ⇒ về idle để tải lại đúng ảnh mới.
  React.useEffect(() => {
    setState({ kind: "idle" });
  }, [path, full]);

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

  React.useEffect(() => {
    if (offline || empty || !visible || state.kind !== "idle") return;
    let alive = true;
    setState({ kind: "loading" });
    const handle = full ? loadFull(projectId, path) : loadThumb(projectId, path);
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
      handle.cancel();
    };
  }, [visible, offline, empty, full, projectId, path, state.kind]);

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
        <span className="flex flex-col items-center gap-1">
          <ImageOff className="size-4 text-fg-muted" aria-hidden strokeWidth={1.5} />
          <span className="text-caption text-fg-muted-raised">
            {offline ? "Ảnh nằm trên máy bạn" : "Thiếu file"}
          </span>
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
