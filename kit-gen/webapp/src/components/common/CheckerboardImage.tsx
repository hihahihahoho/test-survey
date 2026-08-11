import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * §5.6 Thumb — khung ảnh nền checkerboard 8px, object-fit: contain,
 * LUÔN có `alt` = nhãn tiếng Việt của element. Dùng để xem PNG có alpha:
 * checkerboard cho biết chỗ nào thật sự trong suốt.
 *
 * §2.5-3: khi agent không chạy, ảnh nằm trên máy user ⇒ tải hỏng. Component
 * tự rơi về khung xám + chữ "Ảnh nằm trên máy bạn" thay vì icon vỡ.
 */
export interface CheckerboardImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "alt"> {
  /** BẮT BUỘC — nhãn tiếng Việt có nghĩa (A9). Ảnh trang trí thì truyền "". */
  alt: string;
  /** chữ hiện khi ảnh không tải được */
  fallbackText?: string;
  className?: string;
  imgClassName?: string;
}

export const CheckerboardImage = React.forwardRef<HTMLDivElement, CheckerboardImageProps>(
  ({ alt, src, fallbackText = "Ảnh nằm trên máy bạn", className, imgClassName, ...props }, ref) => {
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => setFailed(false), [src]);

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-2 border border-line-subtle",
          failed || !src ? "bg-raised" : "kg-checkerboard",
          className
        )}
      >
        {failed || !src ? (
          <div className="flex flex-col items-center gap-1 p-3 text-center">
            <ImageOff className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
            <span className="text-caption text-fg-muted-raised">{fallbackText}</span>
            {/* alt vẫn phải tới được screen reader dù ảnh hỏng */}
            {alt && <span className="sr-only">{alt}</span>}
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            className={cn("size-full object-contain", imgClassName)}
            {...props}
          />
        )}
      </div>
    );
  }
);
CheckerboardImage.displayName = "CheckerboardImage";
