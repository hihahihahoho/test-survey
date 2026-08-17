import * as React from "react";
import { ImageIcon, ImageOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { qk, useProjectCover, useRegenerateCover } from "@/lib/hooks";
import { loadThumb } from "@/features/projects/lib/agent-blob";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { isAutoCover, titleZoneStyle } from "../lib/cover-title";

/**
 * `cover/cover.json` → MỘT MỆNH ĐỀ NGẮN người dùng hiểu. Đây là bốn mã mà
 * `agent/lib/cover.mjs` thật sự ghi ra (`NOT_LOGGED_IN` · `NO_ARTIFACT` ·
 * `INTERRUPTED`, và `UNKNOWN` khi meta không nói gì) — không đoán thêm mã nào
 * agent chưa từng viết. Mã lạ rơi về `UNKNOWN` thay vì lộ chuỗi hoa gạch dưới.
 */
const COVER_FAIL_REASON: Record<string, string> = {
  NOT_LOGGED_IN: "công cụ tạo ảnh chưa đăng nhập",
  NO_ARTIFACT: "chạy xong nhưng không có ảnh",
  INTERRUPTED: "bị cắt ngang giữa chừng",
  UNKNOWN: "chưa rõ nguyên nhân",
};

export function coverFailReason(code: string | null | undefined): string {
  return COVER_FAIL_REASON[String(code ?? "UNKNOWN")] ?? COVER_FAIL_REASON.UNKNOWN!;
}

/** Tỉ lệ ô ảnh của thẻ. PHẢI khớp `aspect-[16/10]` bên dưới — `titleZoneStyle` dùng nó
 *  để bù phần ảnh 16:9 bị `object-cover` cắt hai bên. */
const BOX_ASPECT = 16 / 10;

/**
 * ẢNH BÌA 16:10 của thẻ bộ kit (UX-V3 §1.1: «ảnh bo 16px, nền ô cờ»).
 *
 * Ba ca phải vẽ được, không ca nào là ô trống bí ẩn:
 *   · có ảnh            → thumbnail 256px (`#41 ?w=256`, BA-V3 §1.4)
 *   · chưa có ảnh bìa   → khung + CHỮ «Chưa vẽ ảnh nào»
 *   · agent tắt/ảnh hỏng→ khung + CHỮ «Ảnh nằm trên máy bạn»
 *   · ĐÃ VẼ MÀ HỎNG     → khung + «Vẽ bìa lỗi: …» + nút [Vẽ lại]
 *
 * Ca thứ tư là bản vá: `cover/cover.json` có `status:"failed"` (thường là
 * `NOT_LOGGED_IN` — chưa đăng nhập công cụ tạo ảnh) nhưng thẻ vẫn nói «Chưa vẽ ảnh
 * nào». Hai câu đó dẫn tới hai hành động khác hẳn nhau: một câu bảo user cứ đợi, câu
 * kia bảo user đi sửa. Nói câu sai ⇒ user đợi mãi một tấm ảnh sẽ không bao giờ tới.
 *
 * Vì sao không dùng `<img src>` thẳng tới agent: bị 403 ở CẢ HAI đường vào (FE-1 đo bằng
 * curl thật). `loadThumb` đi qua transport, có cache object URL — dùng lại nguyên vẹn,
 * KHÔNG viết bộ tải ảnh thứ hai.
 *
 * `kg-checkerboard` chỉ bật khi ẢNH THẬT đã có: ô cờ dưới một khung rỗng trông như lỗi render.
 */
export function KitCover({
  projectId,
  coverPath,
  kitName,
  offline,
  watchCover = false,
  className,
}: {
  projectId: string;
  coverPath: string | null | undefined;
  kitName: string;
  /** agent không sẵn sàng ⇒ đừng cả thử tải, hiện luôn khung «ảnh nằm trên máy bạn» */
  offline: boolean;
  /**
   * Dự án này CÓ THỂ đang được agent vẽ bìa ngầm ⇒ theo dõi cho tới khi xong.
   * `KitCard` bật cờ này khi dự án đã từng chạy một lượt gen (xem chú thích bên dưới).
   */
  watchCover?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  /**
   * ══ THẺ Ở HOME PHẢI TỰ HIỆN BÌA KHI AGENT VẼ XONG ═══════════════════════════
   * Bìa là JOB PHỤ chạy NGẦM sau lượt gen (`agent/lib/run-handle.mjs` gọi
   * `maybeAutoCover` ở `finish()`), mất vài chục giây và KHÔNG có event nào trong
   * stream NDJSON của lượt chạy. Danh sách Home đã được invalidate lúc run xong —
   * nhưng lúc đó bìa còn CHƯA CÓ, nên `project.cover` vẫn null và thẻ đứng nguyên ở
   * ô «Chưa vẽ ảnh nào» cho tới khi người dùng tự F5. Trước đây chỉ `InfoForm` (màn
   * cài đặt dự án) theo dõi việc này.
   *
   * VÌ SAO KHÔNG POLL CẢ TRANG: `useProjectCover` chỉ đặt `refetchInterval` khi
   * `status === "running"` và tự tắt ngay khi xong. Cộng thêm ba cửa hẹp ở dưới,
   * thẻ đã có bìa / dự án chưa từng gen / agent tắt đều KHÔNG gửi request nào; thẻ
   * ứng viên gửi ĐÚNG MỘT request rồi thôi nếu bìa không ở trạng thái đang vẽ.
   */
  const watching = !coverPath && watchCover && !offline;
  const cover = useProjectCover(watching ? projectId : null);
  const livePath = cover.data?.status === "ok" ? (cover.data.path ?? null) : null;
  /* Vẽ NGAY từ kết quả poll, không đợi vòng invalidate danh sách quay về — thứ người
     dùng chờ là tấm ảnh, không phải một lần refetch. */
  const shownPath = coverPath ?? livePath;

  React.useEffect(() => {
    if (!watching || cover.data?.status !== "ok") return;
    // Đồng bộ nguồn sự thật chung: `project.cover` nuôi cả `deriveStatus`, menu thẻ và
    // mọi màn khác. Chạy MỘT lần cho mỗi lần bìa chuyển sang "ok" (query đã hết poll).
    void qc.invalidateQueries({ queryKey: qk.projects.lists() });
  }, [watching, cover.data?.status, qc]);

  React.useEffect(() => {
    if (!shownPath || offline) return;
    let alive = true;
    setFailed(false);
    loadThumb(projectId, shownPath).then(
      (u) => alive && setUrl(u),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [projectId, shownPath, offline]);

  /* ĐÃ VẼ MÀ HỎNG — chỉ tin khi CHÍNH query này nói (`watching`), tức dự án đã từng
     gen và chưa có ảnh. Dự án chưa gen bao giờ vẫn là «Chưa vẽ ảnh nào» như cũ. */
  const drawFailed = watching && cover.data?.status === "failed";
  const regen = useRegenerateCover(projectId);

  const empty = !shownPath;
  const showPlaceholder = empty || failed || offline || url === null;

  return (
    <div
      data-kit-cover
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-3 border border-line-subtle",
        showPlaceholder ? "bg-raised" : "kg-checkerboard",
        className,
      )}
    >
      {showPlaceholder ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 px-3 text-center">
          {empty && drawFailed ? (
            <>
              <ImageOff className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
              <span className="text-caption text-fg-muted">
                Vẽ bìa lỗi: {coverFailReason(cover.data?.error)}
              </span>
              {/* Thẻ bao ngoài là một vùng BẤM ĐƯỢC (mở dự án) ⇒ nút này phải chặn nổi
                  bọt, nếu không thì "Vẽ lại" cũng chỉ là một cách mở dự án. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={regen.isPending || cover.data?.status === "running"}
                disabled={regen.isPending || cover.data?.status === "running"}
                onClick={(e) => {
                  e.stopPropagation();
                  regen.mutate(undefined, {
                    onSuccess: () =>
                      toastSuccess("Đang vẽ lại ảnh bìa", "Mất khoảng một phút. Ảnh hiện lên thẻ khi xong."),
                    onError: (err) => toastError(err, { titleOverride: "Chưa vẽ được ảnh bìa" }),
                  });
                }}
              >
                Vẽ lại
              </Button>
            </>
          ) : (
            <>
              <ImageIcon className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
              <span className="text-caption text-fg-muted">
                {empty ? "Chưa vẽ ảnh nào" : "Ảnh nằm trên máy bạn"}
              </span>
            </>
          )}
        </div>
      ) : (
        <>
          <img
            src={url}
            alt={`Ảnh bìa của dự án ${kitName}`}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
          {/* ══ TÊN DỰ ÁN GHÉP LÊN ẢNH BÌA ═══════════════════════════════════════
              CHỈ với ảnh bìa TỰ SINH: prompt của agent đã dặn model chừa trống đúng
              hình chữ nhật này (`cover-title.ts` giữ toạ độ chung với agent). Ảnh bìa
              do user tự chọn từ kit KHÔNG có chỗ chừa nào — đè chữ lên là che mất ô
              họ chọn, nên `isAutoCover` là điều kiện bắt buộc.

              Chữ nằm trên một CHIP NỀN ĐẶC (`bg-surface`) chứ không đặt thẳng lên ảnh:
              đúng luật §8.3 và đúng lý lẽ ở KitCard ① — mọi lời hứa tương phản trên nền
              một tấm ảnh bất kỳ đều là lời hứa không đo được. Với chip nền đặc thì cặp
              màu là `surface`/`fg-strong`, đo tĩnh được như mọi chỗ khác trong app.

              `aria-hidden`: tên dự án đã có ở `<h2>` của thẻ và ở `aria-label` — đọc
              lần thứ ba là làm phiền người dùng trình đọc màn hình. */}
          {isAutoCover(shownPath) && (
            <div
              data-cover-title
              aria-hidden
              style={titleZoneStyle(BOX_ASPECT)}
              className="pointer-events-none absolute flex items-center overflow-hidden"
            >
              <span className="line-clamp-2 max-w-full rounded-2 bg-surface px-2 py-1 text-label text-fg-strong shadow-2">
                {kitName}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
