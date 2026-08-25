import type { DocBlock } from "@/features/prompt-lab/lib/composer-model";
import { uploadPillImage } from "./pill-image";
import { FALLBACK_POSE, poseRefKey, poseViewOf, readPosePill, writePoseRefPill } from "./pose-doc";

/**
 * pose-refs.ts — "BẤM GEN THÌ ẢNH DÁNG TỰ CÓ", đúng luồng mà pose-lab đã hẹn.
 *
 * ╔══ LỜI HẸN Ở `capture-pose-ref.ts` ═══════════════════════════════════════╗
 * ║ File đó tự ghi luồng đích: người dùng chỉ chọn [dáng] + [góc]; bấm Gen ⇒   ║
 * ║ composer gọi `capturePoseRef` ⇒ PNG nền trắng ⇒ ghi vào `refs/` ⇒ đường    ║
 * ║ dẫn đi vào prompt. "Người dùng KHÔNG BAO GIỜ thấy bước ③." File này là     ║
 * ║ bước ③, và nó chạy Ở NGAY TRƯỚC lượt gen chứ không lúc gõ: chụp mỗi lần    ║
 * ║ đổi pill là mỗi lần một tệp mới trong `refs/` cho một tấm chưa chắc vẽ.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ HỎNG THÌ ĐI TIẾP, KHÔNG DỪNG LƯỢT ═════════════════════════════════════
 * Máy không có WebGL ⇒ `PoseRefUnavailableError`. Đó KHÔNG phải lý do để huỷ
 * lượt vẽ: contract vẫn tả dáng bằng chữ (`poseSpecFor()`), ảnh tham chiếu chỉ
 * là thứ làm nó chính xác hơn. Nên ca đó trả về `skipped` + một câu để màn NÓI
 * RA, chứ không ném lên hàng đợi.
 */

export interface PoseRefOutcome {
  /** Block sau khi cập nhật (có thể là chính nó khi không đổi gì). */
  block: DocBlock;
  /** Có thay đổi cần ghi xuống tài liệu không. */
  changed: boolean;
  /** Vừa chụp + tải lên một tấm mới (dùng cho câu "đã dựng ảnh dáng"). */
  captured: boolean;
  /** Rỗng = không bỏ qua gì. Có chữ = lý do vẽ bằng chữ thay vì ảnh. */
  skipped: string;
}

/** Ảnh dáng của cặp (dáng, góc) hiện tại — có sẵn thì dùng lại, chưa có thì dựng. */
export async function ensurePoseRef(projectId: string, block: DocBlock): Promise<PoseRefOutcome> {
  if (block.kind !== "mascot") return { block, changed: false, captured: false, skipped: "" };

  const pose = readPosePill(block.doc) || FALLBACK_POSE;
  const view = poseViewOf(block);
  const key = poseRefKey(pose, view);

  const cached = block.poseRefs?.[key] ?? "";
  if (cached) {
    /* Đã chụp cặp này rồi. Vẫn phải GHI LẠI vào pill: người dùng có thể vừa đổi
       dáng qua lại, và pill đang mang ảnh của cặp trước đó. */
    const doc = writePoseRefPill(block.doc, { refName: refNameOf(cached), path: cached });
    return { block: { ...block, doc }, changed: true, captured: false, skipped: "" };
  }

  try {
    /* `import()` ĐỘNG: `three` nặng ~700 kB và không được nằm trong bundle chính
       chỉ vì màn có một pill dáng. Xem đầu `capture-pose-ref.ts`. */
    const { capturePoseRef, PoseRefUnavailableError } = await import("@/features/pose-lab/lib/capture-pose-ref");
    let dataUrl: string;
    try {
      dataUrl = await capturePoseRef(pose, view);
    } catch (error) {
      if (error instanceof PoseRefUnavailableError) {
        return { block, changed: false, captured: false, skipped: "Máy này chưa dựng được ảnh dáng — vẽ bằng chữ mô tả." };
      }
      throw error;
    }

    const image = await uploadPillImage(projectId, dataUrl, {
      kind: "character",
      /* Tên gợi ý bằng id, KHÔNG bằng nhãn tiếng Việt (`poseRefLabel`): nhãn có
         dấu và dấu `·`, agent phải nắn lại hết — mà nắn xong thì log không còn
         đọc ra đây là ảnh của cặp nào. */
      hintName: `pose-${pose}-${view}.png`,
    });

    return {
      block: {
        ...block,
        doc: writePoseRefPill(block.doc, image),
        poseRefs: { ...(block.poseRefs ?? {}), [key]: image.path },
      },
      changed: true,
      captured: true,
      skipped: "",
    };
  } catch (error) {
    /* Tải lên hỏng (agent tắt, đĩa đầy) cũng KHÔNG chặn lượt vẽ — cùng lập luận
       với ca không có WebGL. Câu lỗi đi lên màn để người dùng biết vì sao tấm
       này không có ảnh dáng. */
    return {
      block,
      changed: false,
      captured: false,
      skipped: `Chưa lưu được ảnh dáng (${error instanceof Error ? error.message : String(error)}) — vẽ bằng chữ mô tả.`,
    };
  }
}

/** `refs/pose-idle-front.png` → `pose-idle-front.png`. */
function refNameOf(path: string): string {
  return path.startsWith("refs/") ? path.slice("refs/".length) : path;
}
