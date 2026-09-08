import { presetById, presetLabel } from "./pose-presets";
import { cameraView, expandPose, type CameraView } from "./pose-state";

/**
 * capture-pose-ref.ts — **API MÀ PROMPT COMPOSER SẼ GỌI.**
 *
 * ╔══ ĐÂY LÀ MẢNH DUY NHẤT CỦA LAB ĐƯỢC THIẾT KẾ ĐỂ SỐNG TIẾP ════════════════╗
 * ║ Luồng đích, khi nối thật:                                                  ║
 * ║   ① Người dùng chỉ chọn HAI thứ trong composer: pill [dáng] + pill [góc].  ║
 * ║   ② Bấm Gen ⇒ composer gọi `capturePoseRef(poseId, view)`.                 ║
 * ║   ③ Nhận PNG nền trắng ⇒ ghi vào `refs/` của project ⇒ đường dẫn đi vào     ║
 * ║      `prompts/<job>.att`, rồi vào `referenced_image_paths` của image_gen.   ║
 * ║ Người dùng KHÔNG BAO GIỜ thấy bước ③ — không có viewport nào phải mở, không ║
 * ║ có nút "chụp" nào phải bấm. Manơcanh 3D là chuyện nội bộ của công cụ.       ║
 * ║                                                                            ║
 * ║ Hệ quả cho người sửa sau: hàm này phải chạy được ở BẤT KỲ đâu trong app,   ║
 * ║ kể cả khi tab Pose Lab chưa từng được mở. Đừng thêm tham số nào buộc phải   ║
 * ║ có một component đang sống.                                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO BẤT ĐỒNG BỘ KHI VIỆC VẼ LÀ ĐỒNG BỘ ═════════════════════════════
 * Bản thân phép render mất ~10ms và không đợi gì. `Promise` ở đây là để trả giá
 * cho `import()` ĐỘNG: `three` nặng ~700 kB và tuyệt đối không được nằm trong
 * bundle chính chỉ vì có một pill dáng trong composer. Nạp lần đầu tốn một nhịp
 * mạng/đĩa; từ lần hai trở đi module đã nằm trong cache của trình duyệt.
 */

/** Cạnh mặc định của ảnh nộp cho máy vẽ. 768² đủ để đọc dáng mà vẫn nhẹ khi phải
 *  đính nhiều tấm; xem `POSE_REF_PREVIEW_SIZE` cho bản xem trước trong UI. */
export const POSE_REF_SIZE = 768;

/** Cạnh bản xem trước trong giao diện — nhỏ để đổi lựa chọn thấy ngay. */
export const POSE_REF_PREVIEW_SIZE = 320;

/**
 * Ném khi môi trường không dựng được ảnh (không có DOM, hoặc không có WebGL).
 * Có KIỂU RIÊNG để nơi gọi phân biệt được "máy này không vẽ được" với "mã hỏng"
 * — cái đầu phải xử lý êm (bỏ ảnh tham chiếu, gen bằng chữ như cũ), cái sau phải
 * nổ to.
 */
export class PoseRefUnavailableError extends Error {
  constructor(reason: string) {
    super(`pose-ref: không dựng được ảnh pose reference — ${reason}`);
    this.name = "PoseRefUnavailableError";
  }
}

/**
 * `true` khi môi trường hiện tại có thể dựng ảnh. Kiểm TRƯỚC KHI nạp `three`, nên
 * gọi nó ở môi trường `node` (ca test) là hoàn toàn rẻ và không kéo theo gì.
 *
 * Cố ý chỉ kiểm tới mức "có `document` và tạo được `<canvas>`": thử tạo hẳn một
 * context WebGL ở đây sẽ đốt một context thật cho mỗi lần hỏi.
 */
export function canCapturePoseRef(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

export interface CapturePoseRefOptions {
  /** Cạnh ảnh vuông (px). Mặc định `POSE_REF_SIZE`. */
  size?: number;
}

/**
 * Dựng ảnh pose reference cho MỘT dáng ở MỘT góc máy.
 *
 * @param poseId  id dáng THẬT của KitGen (`kit-core/lib/poses.ts`) — id lạ rơi
 *                về dáng đầu thay vì ném, vì một bản nháp cũ mang id đã bỏ không
 *                đáng làm hỏng cả lượt gen.
 * @param view    id góc máy trong `CAMERA_VIEWS` — id lạ rơi về "chính diện".
 * @returns       PNG dạng data URL, nền TRẮNG ĐẶC, ảnh vuông `size × size`.
 * @throws        `PoseRefUnavailableError` khi môi trường không có canvas/WebGL.
 */
export async function capturePoseRef(
  poseId: string,
  view: CameraView,
  options: CapturePoseRefOptions = {},
): Promise<string> {
  if (!canCapturePoseRef()) {
    throw new PoseRefUnavailableError("môi trường này không có DOM/canvas");
  }

  const preset = presetById(poseId);
  const size = Math.max(64, Math.round(options.size ?? POSE_REF_SIZE));

  /* Nạp ĐỘNG — đây là toàn bộ lý do hàm này bất đồng bộ. Xem đầu file. */
  const { renderPoseDataUrl } = await import("./pose-renderer");

  try {
    return renderPoseDataUrl({
      angles: expandPose(preset.data),
      rootY: preset.data.rootY ?? 0,
      view,
      size,
    });
  } catch (cause) {
    /* Máy không có GPU / WebGL bị tắt: three ném ngay ở `new WebGLRenderer`.
       Gói lại thành lỗi CÓ KIỂU để nơi gọi bỏ qua ảnh tham chiếu một cách êm
       thay vì làm chết cả lượt gen. */
    throw new PoseRefUnavailableError(
      `trình duyệt từ chối tạo WebGL (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
}

/** Nhãn dán lên ảnh: "Nhảy · ¾ trái". Cùng một chuỗi dùng cho tên file và cho
 *  chữ hiện dưới thumbnail, nên nó ở đây chứ không nằm rải trong UI. */
export function poseRefLabel(poseId: string, view: CameraView): string {
  return `${presetLabel(presetById(poseId).id)} · ${cameraView(view).vi}`;
}
