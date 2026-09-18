import { CAMERA_VIEWS, expandPose, type CameraView } from "./pose-state";
import { POSE_PRESETS, presetById } from "./pose-presets";

/**
 * pose-thumb.ts — ẢNH XEM TRƯỚC 80×80 CHO MỘT DÒNG TRONG HỘP CHỌN, CÓ NHỚ.
 *
 * ╔══ VÌ SAO HỘP CHỌN DÁNG PHẢI CÓ HÌNH ═════════════════════════════════════╗
 * ║ Danh mục dáng là 19 dòng chữ: «Đứng chờ», «Giới thiệu», «Ăn mừng»… Hai     ║
 * ║ dòng bất kỳ trong đó khác nhau ở chỗ nào thì chỉ người viết danh mục biết; ║
 * ║ người dùng phải CHỌN rồi mới thấy, mà thấy thì đã tiêu một lượt vẽ. Chủ    ║
 * ║ sản phẩm nói thẳng cái thiếu: *"cho xem trước cái dáng để biết dáng nào là ║
 * ║ dáng nào"*. Manơcanh 3D vốn đã dựng được đúng tấm ấy — nó chỉ chưa bao giờ ║
 * ║ được bày ra trước lúc bấm.                                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO PHẢI CÓ MỘT CÁI NHỚ, KHÔNG PHẢI VẼ THẲNG MỖI LẦN ═══════════════╗
 * ║ Một lượt `renderPoseDataUrl` mở một context WebGL THẬT rồi trả lại (xem    ║
 * ║ `pose-renderer.ts`). Trình duyệt chỉ cho ~16 context sống cùng lúc, và mở  ║
 * ║ hộp dáng là hỏi 8 tấm một nhịp. Không nhớ thì mỗi lần cuộn, mỗi lần gõ vào ║
 * ║ ô tìm, mỗi lần mở lại hộp đều là 8 lượt mở-đóng GPU cho đúng 8 tấm ảnh     ║
 * ║ KHÔNG ĐỔI — dáng «Vẫy tay» nhìn từ «¾ trái» hôm nay giống hệt hôm qua.     ║
 * ║ Nên khoá nhớ là đúng bốn thứ quyết định pixel: dáng · góc · cạnh · dpr.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Cạnh ô xem trước, tính bằng **CSS px**. Pixel thật = `size × dpr`.
 *
 * 72 chứ không phải 80: một dòng có ô 80px cao 92px, và ở trần hộp 480px thì chỉ
 * còn ~4 dòng lọt vào tầm mắt. 72px đưa dòng về ~84px ⇒ ~5 dòng, mà cái mất thì
 * không đo được bằng mắt — manơcanh vẫn đọc ra dáng ở cả hai cỡ.
 * PHẢI khớp `size-[4.5rem]` của `OptionPreview` (`SourcePicker.tsx`); lệch nhau
 * thì ảnh dựng ra một cỡ rồi bị CSS kéo sang cỡ khác, tức là lại nhoè đúng thứ
 * mà phép nhân dpr sinh ra để tránh.
 */
export const POSE_THUMB_SIZE = 72;

/**
 * Trần số tấm giữ lại. 19 dáng × 9 góc = 171 tấm — tức là một người dùng bấm hết
 * mọi tổ hợp vẫn chưa chạm trần, còn một bản nháp 30 dòng thì không giữ nổi 30
 * cái ảnh khác nhau trong RAM nếu không có trần nào.
 */
export const POSE_THUMB_MAX = 200;

export interface PoseThumbSpec {
  /** Id dáng trong danh mục THẬT (`kit-core/lib/poses.ts`). */
  poseId: string;
  view: CameraView;
  /** Cạnh ô, tính bằng CSS px. */
  size: number;
  /** Tỉ lệ pixel màn hình đã kẹp — xem `thumbPixelRatio`. */
  dpr: number;
}

/** Khoá nhớ = ĐÚNG bốn thứ quyết định pixel. Thêm thứ gì vào ảnh thì thêm vào đây. */
export function poseThumbKey({ poseId, view, size, dpr }: PoseThumbSpec): string {
  return `${poseId}|${view}|${size}|${dpr}`;
}

/**
 * `true` khi dáng này có BẢNG GÓC KHỚP để dựng hình.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG THẲNG `presetById` ══════════════════════════════════╗
 * ║ `presetById` cố ý rơi về dáng đầu (`idle`) với id lạ — đúng cho lượt gen   ║
 * ║ (một bản nháp cũ mang id đã bỏ không đáng làm hỏng cả lượt vẽ), nhưng SAI   ║
 * ║ chết người cho một ô xem trước: danh mục có 19 dáng mà `POSE_PRESETS` chỉ  ║
 * ║ có 8, nên «Ăn mừng», «Suy nghĩ», «Cúi chào»… sẽ cùng bày ra ẢNH CỦA «Đứng  ║
 * ║ chờ» và nói với người dùng rằng bốn dáng ấy y hệt nhau. Không có hình thì  ║
 * ║ ô giữ chỗ trống — im lặng nhưng thật; một hình SAI thì không.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function hasPoseSkeleton(poseId: string): boolean {
  return POSE_PRESETS.some((preset) => preset.id === poseId);
}

/** `true` khi id này là một góc máy có TOẠ ĐỘ — cùng lý do với `hasPoseSkeleton`:
 *  `cameraView()` rơi về «chính diện» với id lạ, và mọi dòng lạ sẽ trông như nhau. */
export function isCameraView(id: string): id is CameraView {
  return CAMERA_VIEWS.some((view) => view.id === id);
}

/**
 * Tỉ lệ pixel để dựng ảnh — kẹp về SỐ NGUYÊN 1…3.
 *
 * Kẹp trần 3 vì trên 3 thì cạnh thật vượt 240px cho một ô 80px, tức là trả gấp
 * đôi thời gian GPU cho những pixel không mắt nào phân biệt được. Làm tròn về số
 * nguyên vì dpr là MỘT PHẦN CỦA KHOÁ NHỚ: để nguyên 1.7391… của một cửa sổ đang
 * zoom là mỗi nấc zoom sinh một bộ ảnh mới và cái nhớ thành vô dụng.
 */
export function thumbPixelRatio(): number {
  const raw = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(3, Math.round(raw));
}

/* ══════════════════════════════════════════════════════════════════════════
   CÁI NHỚ — LRU trên `Map`
   ══════════════════════════════════════════════════════════════════════════
   `Map` của JS giữ ĐÚNG thứ tự chèn, nên "cũ nhất" chính là khoá đầu tiên của
   `keys()` — không cần danh sách liên kết nào. Mỗi lần trúng thì xoá-rồi-chèn
   lại để khoá ấy nhảy về cuối hàng; đó là toàn bộ phép "vừa dùng gần đây". */

const cache = new Map<string, string>();

/** Lượt vẽ ĐANG CHẠY, gộp theo khoá: hộp mở hai lần trong một nhịp không được
 *  thành hai lượt GPU cho cùng một tấm. */
const inflight = new Map<string, Promise<string | null>>();

/**
 * Máy này đã từ chối WebGL một lần ⇒ ĐỪNG HỎI LẠI.
 *
 * Không phải lỗi tạm: máy không có GPU, hoặc trình duyệt tắt WebGL, thì lần thứ
 * hai cũng hỏng y như lần đầu. Thiếu cờ này thì mỗi lần mở hộp là 8 lần dựng
 * renderer để nhận 8 lần ném — người dùng ấy trả giá bằng một hộp chọn giật.
 */
let webglRefused = false;

/** Ảnh đã nhớ cho khoá này, hoặc `null`. **Đồng bộ** — đây là thứ giúp mở lại hộp
 *  hiện hình NGAY, không nháy một nhịp ô trống. */
export function peekPoseThumb(key: string): string | null {
  const hit = cache.get(key);
  if (hit === undefined) return null;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > POSE_THUMB_MAX) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** Số tấm đang giữ — chỉ để ca kiểm tra đọc được cái trần. */
export function poseThumbCount(): number {
  return cache.size;
}

/** Quên hết. Dùng trong test để mỗi ca bắt đầu từ một cái nhớ trống. */
export function resetPoseThumbs(): void {
  cache.clear();
  inflight.clear();
  webglRefused = false;
}

/**
 * Ảnh xem trước của MỘT dáng ở MỘT góc. `null` = không có hình để bày (dáng chưa
 * có bảng góc khớp, hoặc máy này không dựng được) ⇒ nơi gọi bày ô giữ chỗ.
 *
 * KHÔNG BAO GIỜ NÉM: nó chạy trong lúc người dùng đang mở một hộp chọn, và một
 * dòng thiếu hình vẫn là một dòng bấm được — còn một exception lọt ra từ đây thì
 * làm trắng cả thẻ prompt đang soạn dở.
 */
export async function poseThumb(spec: PoseThumbSpec): Promise<string | null> {
  const key = poseThumbKey(spec);
  const hit = peekPoseThumb(key);
  if (hit !== null) return hit;

  const live = inflight.get(key);
  if (live) return live;

  const job = draw(spec, key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

async function draw(spec: PoseThumbSpec, key: string): Promise<string | null> {
  if (webglRefused) return null;
  if (!hasPoseSkeleton(spec.poseId) || !isCameraView(spec.view)) return null;
  if (typeof document === "undefined") return null;

  try {
    /* Nạp ĐỘNG, cùng luật với `capture-pose-ref.ts`: `three` nặng ~700 kB và
       không được nằm trong bundle chính chỉ vì một hộp chọn có hình. */
    const { renderPoseDataUrl } = await import("./pose-renderer");
    const preset = presetById(spec.poseId);
    const url = renderPoseDataUrl({
      angles: expandPose(preset.data),
      rootY: preset.data.rootY ?? 0,
      view: spec.view,
      /* Pixel THẬT = cạnh CSS × dpr. Dựng đúng 80px rồi để màn Retina phóng lên
         là một manơcanh nhoè — mà cả điểm của tính năng này là NHÌN RA dáng. */
      size: Math.max(1, Math.round(spec.size * spec.dpr)),
    });
    remember(key, url);
    return url;
  } catch {
    webglRefused = true;
    return null;
  }
}
