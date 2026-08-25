/**
 * pose-presets.ts — 8 DÁNG GỐC để người dùng nắn tiếp, không phải nắn từ tượng gỗ.
 *
 * ╔══ VÌ SAO ID LẤY TỪ `workflow-v4/lib/poses.ts` ════════════════════════════╗
 * ║ KitGen đã có danh mục 19 dáng và nó là thứ đi vào prompt thật. Nếu lab tự  ║
 * ║ đặt tên dáng của mình thì ảnh chụp ra không biết đính vào dáng nào của kit ║
 * ║ — đúng cái mối nối mà demo này muốn chứng minh là có thể nối được. Nên id  ║
 * ║ ở đây là id THẬT, nhãn tiếng Việt tra ngược bằng `poseLabel()`, và có test ║
 * ║ khoá "mọi id preset đều tồn tại trong POSES".                             ║
 * ║ Chỉ chọn 8/19: 19 bảng góc chép tay là công việc của người dựng chuyển     ║
 * ║ động, không phải của một demo UX. 8 dáng đủ phủ các kiểu hình (đứng, giơ   ║
 * ║ tay, chỉ, bật nhảy, ngồi, chạy, ôm đồ, rũ xuống).                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * MỌI SỐ Ở ĐÂY LÀ ĐỘ, và dấu tuân theo quy ước ghi ở đầu `skeleton.ts`. Sửa số mà
 * không đọc quy ước thì tay sẽ gập ngược ra sau lưng — đã xảy ra khi dựng bảng này.
 */
import { poseLabel } from "@/features/workflow-v4/lib/poses";
import type { PoseData } from "./pose-state";

export interface PosePreset {
  /** Id THẬT trong danh mục dáng của KitGen (`workflow-v4/lib/poses.ts`). */
  id: string;
  /** Một câu nói dáng này để làm gì — hiện dưới dropdown. */
  note: string;
  data: PoseData;
}

export const POSE_PRESETS: readonly PosePreset[] = [
  {
    id: "idle",
    note: "Tư thế nghỉ — điểm xuất phát trung tính nhất để nắn tiếp.",
    data: {
      angles: {
        shoulderL: [0, 0, 10], shoulderR: [0, 0, -10],
        elbowL: [-12, 0, 0], elbowR: [-12, 0, 0],
        spine: [1, 0, 0],
      },
    },
  },
  {
    id: "wave",
    note: "Tay phải giơ cao vẫy — dáng chào mở màn của hầu hết mascot.",
    data: {
      angles: {
        shoulderR: [-12, 0, -158], elbowR: [-32, 0, 0], wristR: [0, 0, -22],
        shoulderL: [0, 0, 12], elbowL: [-14, 0, 0],
        chest: [0, -6, 0], head: [0, -8, 6],
      },
    },
  },
  {
    id: "point",
    note: "Chỉ tay ra trước — dùng khi mascot trỏ vào nút hoặc phần thưởng.",
    data: {
      angles: {
        shoulderR: [-88, 14, -14], elbowR: [-6, 0, 0], wristR: [-8, 0, 0],
        shoulderL: [6, 0, 9], elbowL: [-16, 0, 0],
        chest: [0, -10, 0], head: [4, -14, 0],
      },
    },
  },
  {
    id: "jump",
    note: "Bật nhảy — hai tay giơ, gối co, cả người nhấc khỏi mặt đất.",
    data: {
      rootY: 0.35,
      angles: {
        shoulderL: [-16, 0, 152], shoulderR: [-16, 0, -152],
        elbowL: [-24, 0, 0], elbowR: [-24, 0, 0],
        hipL: [-32, 0, 6], hipR: [-26, 0, -6],
        kneeL: [72, 0, 0], kneeR: [58, 0, 0],
        ankleL: [-26, 0, 0], ankleR: [-20, 0, 0],
        spine: [-6, 0, 0], head: [-8, 0, 0],
      },
    },
  },
  {
    id: "sit",
    note: "Ngồi — đùi ngang, gối vuông; `rootY` hạ cả bộ khung xuống ghế tưởng tượng.",
    data: {
      rootY: -0.66,
      angles: {
        hipL: [-88, 0, 8], hipR: [-88, 0, -8],
        kneeL: [86, 0, 0], kneeR: [86, 0, 0],
        ankleL: [4, 0, 0], ankleR: [4, 0, 0],
        shoulderL: [-18, 0, 14], shoulderR: [-18, 0, -14],
        elbowL: [-28, 0, 0], elbowR: [-28, 0, 0],
        spine: [4, 0, 0], head: [-4, 0, 0],
      },
    },
  },
  {
    id: "run",
    note: "Chạy — tay chân so le, thân đổ về trước; dáng động khó tả bằng chữ nhất.",
    data: {
      rootY: 0.06,
      angles: {
        hipL: [-56, 0, 4], kneeL: [36, 0, 0], ankleL: [-16, 0, 0],
        hipR: [38, 0, -4], kneeR: [92, 0, 0], ankleR: [-30, 0, 0],
        shoulderL: [-72, 0, 10], elbowL: [-86, 0, 0],
        shoulderR: [58, 0, -10], elbowR: [-70, 0, 0],
        spine: [12, 0, 0], chest: [0, -10, 0], hips: [0, 6, 0], head: [-10, 0, 0],
      },
    },
  },
  {
    id: "hold-gift",
    note: "Ôm quà — hai tay đưa ra trước, khuỷu gập, đầu hơi cúi nhìn vật.",
    data: {
      angles: {
        shoulderL: [-72, 0, 22], elbowL: [-78, 0, 0], wristL: [0, 0, -14],
        shoulderR: [-72, 0, -22], elbowR: [-78, 0, 0], wristR: [0, 0, 14],
        spine: [4, 0, 0], head: [12, 0, 0],
      },
    },
  },
  {
    id: "sad",
    note: "Buồn — vai xuôi, đầu cúi, cả cột sống rũ về trước.",
    data: {
      rootY: -0.05,
      angles: {
        head: [26, 0, 0], neck: [10, 0, 0], chest: [9, 0, 0], spine: [14, 0, 0],
        shoulderL: [10, 0, 5], shoulderR: [10, 0, -5],
        elbowL: [-20, 0, 0], elbowR: [-20, 0, 0],
        hipL: [4, 0, 0], hipR: [4, 0, 0], kneeL: [7, 0, 0], kneeR: [7, 0, 0],
      },
    },
  },
];

/** Nhãn tiếng Việt của preset — tra từ danh mục THẬT, không chép chuỗi. */
export function presetLabel(id: string): string {
  return poseLabel(id);
}

/** Preset theo id; id lạ rơi về dáng đầu (`idle`) thay vì làm trắng màn. */
export function presetById(id: string): PosePreset {
  return POSE_PRESETS.find((p) => p.id === id) ?? POSE_PRESETS[0]!;
}

/** Dáng mở màn khi vào lab. */
export const DEFAULT_PRESET_ID = "idle";
