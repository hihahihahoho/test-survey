import type { MascotBlock, MascotPose } from "@/features/prompt-lab/lib/composer-model";
import { mascotSheetPlan, poseSheetKey, type ComposerContractOptions } from "./composer-to-contract";
import { uploadPillImage } from "./pill-image";
import { canComposePoseSheet, composePoseSheet } from "./pose-sheet";

/**
 * pose-refs.ts — "BẤM VẼ THÌ ẢNH DÁNG TỰ CÓ", đúng luồng mà bộ manơcanh (`prompt-lab/lib/pose/`) đã hẹn.
 *
 * ╔══ LỜI HẸN Ở `capture-pose-ref.ts` ═══════════════════════════════════════╗
 * ║ File đó tự ghi luồng đích: người dùng chỉ chọn [dáng] + [góc]; bấm Vẽ ⇒   ║
 * ║ composer gọi `capturePoseRef` ⇒ PNG nền TRỐNG ⇒ ghi vào `refs/` ⇒ đường    ║
 * ║ dẫn đi vào prompt. "Người dùng KHÔNG BAO GIỜ thấy bước ③." File này là     ║
 * ║ bước ③, và nó chạy Ở NGAY TRƯỚC lượt vẽ chứ không lúc gõ: chụp mỗi lần     ║
 * ║ đổi pill là mỗi lần một tệp mới trong `refs/` cho một tấm chưa chắc vẽ.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ ĐỔI 09/2026: MỘT THẺ RA MỘT TẤM NHIỀU DÁNG ════════════════════════════
 * Trước đây một thẻ Nhân vật là một ô, nên một ảnh manơcanh đính thẳng vào
 * `sheet.ref` là đủ. Nay một thẻ là một sprite sheet, mà `image_gen` chỉ nhận MỘT
 * danh sách ảnh dùng chung cho cả tấm — không có chỗ nào nói "ảnh này của ô 3".
 * Nên file này làm hai việc nối nhau:
 *   ① chụp ảnh manơcanh cho từng dòng chưa có (gom theo cặp dáng|góc, chụp một
 *      lần dùng cho mọi dòng trùng cặp), tải lên `refs/` ⇒ `MascotPose.refPath`;
 *   ② GHÉP các ảnh ấy thành MỘT tấm cùng lưới, cùng toạ độ ô với tấm sẽ vẽ, tải
 *      lên ⇒ `MascotBlock.poseSheet` ⇒ `sheet.poseRef` của contract.
 * Bước ① không phải để đính kèm (chỉ tấm ghép mới được đính) mà để KHỎI CHỤP LẠI:
 * nó là bằng chứng lưu bền rằng cặp dáng|góc của dòng đã có ảnh trên đĩa.
 *
 * ══ HỎNG THÌ ĐI TIẾP, KHÔNG DỪNG LƯỢT ═════════════════════════════════════
 * Máy không có WebGL ⇒ `PoseRefUnavailableError`. Đó KHÔNG phải lý do để huỷ
 * lượt vẽ: contract vẫn tả dáng VÀ GÓC MÁY bằng chữ (`poseSpecFor()` + cụm EN của
 * `CAMERA_VIEWS`), ảnh tham chiếu chỉ làm nó chính xác hơn. Nên ca đó trả về
 * `skipped` + một câu để màn NÓI RA, chứ không ném lên hàng đợi.
 */

export interface PoseRefOutcome {
  /** Thẻ sau khi cập nhật (có thể là chính nó khi không đổi gì). */
  block: MascotBlock;
  /** Có thay đổi cần ghi xuống tài liệu không. */
  changed: boolean;
  /** Vừa dựng + tải lên ảnh mới (dùng cho câu "đã dựng ảnh dáng"). */
  captured: boolean;
  /** Rỗng = không bỏ qua gì. Có chữ = lý do vẽ bằng chữ thay vì kèm ảnh. */
  skipped: string;
}

/** Khoá gom ảnh theo CẶP (dáng, góc) — hai dòng cùng cặp dùng chung một tệp. */
function pairKey(row: MascotPose): string {
  return `${row.pose}|${row.view}`;
}

/** Ảnh manơcanh + tấm ghép của một thẻ Nhân vật — dựng thứ còn thiếu, giữ thứ đã có. */
export async function ensurePoseRefs(
  projectId: string,
  block: MascotBlock,
  opts: ComposerContractOptions = {},
): Promise<PoseRefOutcome> {
  const idle: PoseRefOutcome = { block, changed: false, captured: false, skipped: "" };
  if (block.poses.length === 0) return idle;

  const wantKey = poseSheetKey(block, opts);
  const sheetFresh = block.poseSheet?.key === wantKey;
  /* ĐƯỜNG NHANH, và nó là đường đi thường xuyên nhất: bấm Vẽ lại một thẻ không
     sửa gì thì không chụp, không ghép, không tải lên một byte nào. */
  if (sheetFresh && block.poses.every((row) => row.refPath)) return idle;

  if (!canComposePoseSheet()) {
    return { ...idle, skipped: "Máy này chưa dựng được ảnh dáng — vẽ bằng chữ mô tả." };
  }

  let capture: typeof import("@/features/prompt-lab/lib/pose/capture-pose-ref");
  try {
    /* `import()` ĐỘNG: `three` nặng ~700 kB và không được nằm trong bundle chính
       chỉ vì màn có một pill dáng. Xem đầu `capture-pose-ref.ts`. */
    capture = await import("@/features/prompt-lab/lib/pose/capture-pose-ref");
  } catch (error) {
    return { ...idle, skipped: `Chưa nạp được bộ dựng ảnh dáng (${message(error)}) — vẽ bằng chữ mô tả.` };
  }

  /* Ảnh của từng CẶP, dùng lại trong cả lượt: một tấm turnaround hay lặp lại một
     dáng ở nhiều góc, và mỗi lần chụp lại là một tệp thừa trong `refs/`. */
  const shots = new Map<string, string>();
  let skipped = "";
  let captured = false;

  const shotOf = async (row: MascotPose): Promise<string> => {
    const key = pairKey(row);
    const seen = shots.get(key);
    if (seen !== undefined) return seen;
    try {
      const dataUrl = await capture.capturePoseRef(row.pose, row.view as never);
      shots.set(key, dataUrl);
      return dataUrl;
    } catch (error) {
      /* Một dáng hỏng KHÔNG được kéo theo cả tấm: ô ấy để trắng trên tấm ghép và
         vẫn được tả bằng chữ. Ghi lại lý do ĐẦU TIÊN — mười dòng cùng hỏng vì một
         nguyên nhân thì mười câu giống nhau không nói thêm được gì. */
      if (!skipped) {
        skipped =
          error instanceof capture.PoseRefUnavailableError
            ? "Máy này chưa dựng được ảnh dáng — vẽ bằng chữ mô tả."
            : `Chưa dựng được ảnh dáng (${message(error)}) — vẽ bằng chữ mô tả.`;
      }
      shots.set(key, "");
      return "";
    }
  };

  /* ── ① Ảnh manơcanh của từng dòng ───────────────────────────────────────── */
  const rows: MascotPose[] = [];
  const uploaded = new Map<string, string>();
  for (const row of block.poses) {
    const dataUrl = await shotOf(row);
    if (row.refPath || !dataUrl) {
      rows.push(row);
      continue;
    }
    const key = pairKey(row);
    const already = uploaded.get(key);
    if (already) {
      rows.push({ ...row, refPath: already });
      continue;
    }
    try {
      const image = await uploadPillImage(projectId, dataUrl, {
        kind: "character",
        /* Tên gợi ý bằng id, KHÔNG bằng nhãn tiếng Việt (`poseRefLabel`): nhãn có
           dấu và dấu `·`, agent phải nắn lại hết — mà nắn xong thì log không còn
           đọc ra đây là ảnh của cặp nào. */
        hintName: `pose-${row.pose}-${row.view}.png`,
      });
      uploaded.set(key, image.path);
      captured = true;
      rows.push({ ...row, refPath: image.path });
    } catch (error) {
      /* Tải lên hỏng (agent tắt, đĩa đầy) cũng KHÔNG chặn lượt vẽ — cùng lập luận
         với ca không có WebGL. Ảnh vẫn nằm trong `shots` nên tấm ghép vẫn có ô
         này; chỉ là lần sau phải chụp lại. */
      if (!skipped) skipped = `Chưa lưu được ảnh dáng (${message(error)}) — vẽ bằng chữ mô tả.`;
      rows.push(row);
    }
  }

  /* ── ② Tấm ghép, một tấm cho mỗi tấm sẽ vẽ ──────────────────────────────── */
  const plans = mascotSheetPlan({ ...block, poses: rows }, opts);
  const paths: string[] = [];
  for (const [i, plan] of plans.entries()) {
    const cells = plan.poses.map((row) => shots.get(pairKey(row)) ?? "");
    if (cells.every((cell) => !cell)) {
      /* Không dựng được ô nào ⇒ KHÔNG tải lên một tấm trắng: một ảnh tham chiếu
         trắng trơn là một chỉ thị "vẽ không có gì" gửi thẳng tới máy vẽ. */
      paths.push("");
      continue;
    }
    try {
      const dataUrl = await composePoseSheet(cells, plan.grid.cols, plan.grid.rows);
      const image = await uploadPillImage(projectId, dataUrl, {
        kind: "character",
        hintName: `pose-sheet-${block.id}-${i + 1}.png`,
      });
      paths.push(image.path);
      captured = true;
    } catch (error) {
      if (!skipped) skipped = `Chưa ghép được tấm ảnh dáng (${message(error)}) — vẽ bằng chữ mô tả.`;
      paths.push("");
    }
  }

  const next: MascotBlock = { ...block, poses: rows, poseSheet: { key: wantKey, paths } };
  return { block: next, changed: true, captured, skipped };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
