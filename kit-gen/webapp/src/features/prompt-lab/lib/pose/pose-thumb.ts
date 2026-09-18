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
 * Cạnh ô xem trước Ở ĐẦU DÒNG, tính bằng **CSS px**.
 *
 * 40 chứ không phải 72: ô này đứng chen giữa tay nắm ⣿, số thứ tự và ba pill trên
 * một hàng KHÔNG ĐƯỢC PHÉP WRAP (`RowTop`), nên mỗi pixel nó lấy là một pixel chữ
 * trong pill mất đi. 40px vẫn đọc ra "tay giơ lên hay buông xuống, người đứng hay
 * ngồi" — đúng và đủ câu hỏi mà ô này trả lời: *"dòng này tôi vừa chọn cái gì?"*.
 * Câu hỏi *"dáng nào là dáng nào"* thì đã có ô 72px trong hộp chọn trả lời rồi.
 *
 * DỰNG ĐÚNG 40 (× dpr), KHÔNG dựng 72 rồi để CSS thu nhỏ: cạnh nằm TRONG khoá nhớ
 * nên hai cỡ là hai tấm riêng biệt, tức là dùng lại tấm 72 chẳng tiết kiệm được
 * lượt GPU nào mà chỉ đổi lấy một tấm bị trình duyệt thu nhỏ (nhoè hơn hẳn phép
 * hạ mẫu của chính bộ dựng) và gấp ~3 lần byte giữ trong RAM cho mỗi dòng.
 */
export const ROW_THUMB_SIZE = 40;

/**
 * Trần số tấm giữ lại.
 *
 * 19 dáng × 9 góc = 171 tấm cho hộp chọn — một người dùng bấm hết mọi tổ hợp vẫn
 * chưa chạm trần. Cộng thêm ô đầu dòng: cạnh 40 là một KHOÁ KHÁC, nên một bản
 * nháp 20 dòng gửi thêm tối đa 20 tấm nữa vào cùng cái nhớ. 280 để tổng ấy (~191)
 * còn lề; trần 200 cũ thì vừa đủ chạm, và chạm trần nghĩa là mỗi lần mở lại hộp
 * chọn lại đốt GPU cho những tấm vừa bị đẩy ra — đúng thứ cái nhớ sinh ra để tránh.
 */
export const POSE_THUMB_MAX = 280;

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
 * ║ chết người cho một ô xem trước: một dáng mượn ảnh của «Đứng chờ» là lời    ║
 * ║ nói dối "hai dáng này y hệt nhau", và người dùng tiêu một lượt vẽ mới biết.║
 * ║ Không có hình thì ô giữ chỗ trống — im lặng nhưng thật; một hình SAI thì   ║
 * ║ không.                                                                     ║
 * ║ Từ 18/09/2026 `POSE_PRESETS` đã phủ đủ 19/19 id của danh mục, nên với một  ║
 * ║ id LẤY TỪ DANH MỤC hàm này luôn `true` — cửa dưới đây nay chỉ còn chặn ô   ║
 * ║ dáng để trống và chữ người dùng tự gõ. Đừng bỏ nó đi vì "không bao giờ trả ║
 * ║ false nữa": hai ca ấy có thật, và ngày ai đó thêm dáng thứ 20 vào danh mục ║
 * ║ thì nó là thứ duy nhất đứng giữa cái dáng mới và một tấm ảnh nói dối.      ║
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

/**
 * HÀNG ĐỢI MỘT LÀN — mọi lượt vẽ nối đuôi nhau, không bao giờ có hai cái chạy song song.
 *
 * ╔══ VÌ SAO KHÔNG ĐỂ CHÚNG TỰ CHẠY ═════════════════════════════════════════╗
 * ║ Đời đầu, người gọi DUY NHẤT là vòng lặp trong `usePoseThumbs`, và vòng ấy  ║
 * ║ đã `await` từng tấm — tính tuần tự là của NGƯỜI GỌI, không phải của kho.   ║
 * ║ Từ lúc ô xem trước xuống tới ĐẦU DÒNG (18/09/2026) thì người gọi không còn ║
 * ║ là một nữa: mở một bản nháp 20 dòng là 20 component cùng hỏi 20 tấm khác   ║
 * ║ khoá nhau trong đúng một nhịp effect. `inflight` không cứu được — nó chỉ    ║
 * ║ gộp những lượt CÙNG KHOÁ. Kết quả là 20 context WebGL đòi mở cùng lúc,     ║
 * ║ trên trần ~16 của trình duyệt: những cái mở sau bị từ chối, `draw` bắt      ║
 * ║ được exception rồi bật `webglRefused`, và từ đó CẢ TRANG không còn tấm ảnh ║
 * ║ nào cho tới lúc tải lại. Một tính năng tự tắt chính nó khi có nhiều dòng.  ║
 * ║ Nối đuôi thì trần ấy không bao giờ bị chạm: đúng một context sống mỗi lúc, ║
 * ║ y như trước, chỉ khác là luật ấy nay nằm ở kho chứ không nằm ở người gọi.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO GIỮA HAI LƯỢT PHẢI THỞ MỘT NHỊP ════════════════════════════════╗
 * ║ `renderPoseDataUrl` chạy ĐỒNG BỘ từ đầu tới cuối (dựng scene · render ·    ║
 * ║ `toDataURL` · huỷ renderer), nên "nối đuôi bằng promise" KHÔNG đủ: chuỗi   ║
 * ║ microtask không nhường cho trình duyệt vẽ lại một lần nào, và mười chín    ║
 * ║ lượt ~10ms dính liền nhau là một cú đứng hình ~200ms — mở hộp chọn thì     ║
 * ║ thấy nguyên cái hộp đông cứng rồi mới có ảnh. `setTimeout(0)` là chỗ NGẮT: ║
 * ║ giữa hai tấm, trình duyệt lấy lại quyền, vẽ tấm vừa xong, rồi mới tới tấm  ║
 * ║ sau. Người dùng thấy ảnh hiện dần thay vì thấy một khoảng lặng.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Ảnh đã nhớ KHÔNG đi qua đây (xem `poseThumb`): một dòng có sẵn tấm của mình
 * phải hiện hình NGAY, không xếp hàng sau mười chín dòng khác.
 */
let queue: Promise<unknown> = Promise.resolve();

function breathe(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  /* Cùng `job` cho cả hai nhánh: lượt trước hỏng không được chặn lượt sau. */
  const next = queue.then(job, job);
  /* Nhịp thở nằm SAU `next`, không nằm trong nó: người gọi nhận ảnh ngay khi vẽ
     xong, chỉ có lượt KẾ TIẾP mới phải đợi trình duyệt kịp thở. */
  queue = next.then(breathe, breathe);
  return next;
}

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
  queue = Promise.resolve();
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

  const job = enqueue(() => draw(spec, key)).finally(() => {
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
