/**
 * pose-presets.ts — BẢNG GÓC KHỚP CHO CẢ 19 DÁNG CỦA DANH MỤC, không thiếu dáng nào.
 *
 * ╔══ VÌ SAO ID LẤY TỪ `kit-core/lib/poses.ts` ════════════════════════════╗
 * ║ KitGen đã có danh mục 19 dáng và nó là thứ đi vào prompt thật. Nếu lab tự  ║
 * ║ đặt tên dáng của mình thì ảnh chụp ra không biết đính vào dáng nào của kit ║
 * ║ — đúng cái mối nối mà demo này muốn chứng minh là có thể nối được. Nên id  ║
 * ║ ở đây là id THẬT, nhãn tiếng Việt tra ngược bằng `poseLabel()`, và có test ║
 * ║ khoá "mọi id preset đều tồn tại trong POSES".                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO NAY LÀ 19/19 CHỨ KHÔNG CÒN LÀ 8/19 ═════════════════════════════╗
 * ║ Bản trước cố ý chỉ chép 8 bảng góc, với lý lẽ "19 bảng chép tay là việc của║
 * ║ người dựng chuyển động, không phải của một demo UX". Lý lẽ ấy đứng được    ║
 * ║ đúng tới ngày ô xem trước ra mắt (3.0.8): từ lúc hộp chọn có hình, 8 con   ║
 * ║ số ấy thôi là chuyện nội bộ và trở thành thứ NGƯỜI DÙNG NHÌN THẤY — «Ăn    ║
 * ║ mừng», «Suy nghĩ», «Giơ ngón cái»… bày ra một ô xám trống, và một danh mục ║
 * ║ mà hơn nửa số dòng không có hình thì tệ hơn cả danh mục không có hình nào: ║
 * ║ người dùng đọc ô trống thành "dáng này hỏng" chứ không thành "dáng này     ║
 * ║ chưa được dựng". Chủ sản phẩm nói đúng một câu, kèm ảnh chụp màn: dáng nào ║
 * ║ cũng phải có hình.                                                        ║
 * ║ Ba dáng nhóm «Góc nhìn» (`view-34`, `view-side`, `view-back`) nói về HƯỚNG ║
 * ║ ĐỨNG chứ không về tay chân, nên bảng góc của chúng là dáng nghỉ + một cú   ║
 * ║ xoay `hips.y`. Cố ý: đó chính xác là thứ ba dòng ấy hứa với người dùng.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * MỌI SỐ Ở ĐÂY LÀ ĐỘ, và dấu tuân theo quy ước ghi ở đầu `skeleton.ts`. Sửa số mà
 * không đọc quy ước thì tay sẽ gập ngược ra sau lưng — đã xảy ra khi dựng bảng này.
 *
 * THỨ TỰ KHAI BÁO = THỨ TỰ CỦA `POSES`. Không phải để cho đẹp: đặt cạnh nhau như
 * vậy thì thiếu một dáng là nhìn thấy được bằng mắt khi đọc hai file cạnh nhau,
 * chứ không phải đợi tới lúc một ô xám hiện ra trên màn người dùng.
 */
import { poseLabel } from "@/features/kit-core/lib/poses";
import type { PoseData } from "./pose-state";

export interface PosePreset {
  /** Id THẬT trong danh mục dáng của KitGen (`kit-core/lib/poses.ts`). */
  id: string;
  /** Một câu nói dáng này để làm gì — hiện dưới dropdown. */
  note: string;
  data: PoseData;
}

export const POSE_PRESETS: readonly PosePreset[] = [
  /* ── Cơ bản ─────────────────────────────────────────────────────────────── */
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
    /* KHÁC «Chỉ tay» ở chỗ tay KHÔNG chĩa vào người xem mà mở ngang sang một bên:
       "đây, mời xem" chứ không phải "bấm vào đây". Ở 72px thì cánh tay nằm ngang
       mở hết cỡ là dấu hiệu đọc được ngay, còn tay chĩa thẳng vào camera thì bị
       thu về gần như một chấm — chính vì thế `point` mới phải hạ vai xuống -88.
       ĐƯA TAY RA TRƯỚC Ở ĐÂY LÀ `shoulderR.y`, KHÔNG PHẢI `.x`. three.js quay theo
       thứ tự XYZ, tức là `z` (dang tay) được áp TRƯỚC: sau nó cánh tay đã nằm gần
       như dọc trục X, và một cú xoay quanh chính trục X thì gần như không dời nó
       đi đâu cả. `y` mới là trục quét cánh tay đã dang ra trước/ra sau. */
    id: "present",
    note: "Giới thiệu — tay phải mở ngang, lòng bàn ngửa, cả người hơi quay theo: «đây, mời xem».",
    data: {
      angles: {
        shoulderR: [-10, 24, -74], elbowR: [-16, 0, 0], wristR: [-20, 0, 12],
        shoulderL: [4, 0, 12], elbowL: [-18, 0, 0],
        chest: [0, 8, 0], spine: [0, -4, 0], head: [2, -24, 4],
      },
    },
  },

  /* ── Cảm xúc ────────────────────────────────────────────────────────────── */
  {
    /* HAI TAY GIƠ CHỮ V, nhưng CHÂN BÁM ĐẤT — đó là toàn bộ chỗ khác với «Nhảy».
       Hai dáng này đứng cách nhau đúng một `rootY` và một cú co gối, nên nếu một
       ngày ai đó thêm `rootY` vào đây thì hai dòng trong danh mục thành một. */
    id: "cheer",
    note: "Ăn mừng — hai tay giơ chữ V, ngực ưỡn, đầu ngẩng; chân vẫn bám đất (khác «Nhảy»).",
    data: {
      angles: {
        shoulderL: [-10, 0, 162], shoulderR: [-10, 0, -162],
        elbowL: [-20, 0, 0], elbowR: [-20, 0, 0],
        wristL: [0, 0, 16], wristR: [0, 0, -16],
        spine: [-7, 0, 0], chest: [-4, 0, 0], head: [-14, 0, 0],
        hipL: [0, 0, 7], hipR: [0, 0, -7],
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
  {
    /* TAY PHẢI ĐƯA LÊN CẰM + ĐẦU NGHIÊNG, tay trái đỡ dưới khuỷu phải.
       `shoulderR.z` DƯƠNG (+16) tuy vai phải nằm ở -X: z dương kéo xương về phía
       +X, tức là kéo cánh tay VÀO GIỮA THÂN — đúng chỗ phải tới để bàn tay gặp
       cằm. Bỏ số đó đi thì bàn tay dừng ngay cạnh vai và dáng đọc thành «giơ tay
       phát biểu». */
    id: "think",
    note: "Suy nghĩ — tay phải chống cằm, tay trái đỡ khuỷu, đầu nghiêng và hơi cúi.",
    data: {
      angles: {
        shoulderR: [-44, 0, 20], elbowR: [-146, 0, 0], wristR: [-18, 0, 0],
        shoulderL: [-14, 0, 22], elbowL: [-92, 0, 0],
        chest: [0, 8, 0], neck: [4, 0, 0], head: [8, -12, 9],
      },
    },
  },
  {
    /* Manơcanh KHÔNG CÓ NGÓN TAY, nên "giơ ngón cái" phải đọc ra bằng ĐƯỜNG CỦA
       CẢ CÁNH TAY: nắm tay gập lên ngang vai và đẩy RA TRƯỚC người xem, thân hơi
       ngả ra sau. Ai sửa số ở đây mà nghĩ tới bàn tay là sửa nhầm bộ phận. */
    id: "thumbs-up",
    note: "Giơ ngón cái — cánh tay phải gập, nắm tay đưa ra trước ngang vai, thân hơi ngả ra sau.",
    data: {
      angles: {
        shoulderR: [-68, 0, -18], elbowR: [-88, 0, 0], wristR: [-30, 0, 0],
        shoulderL: [2, 0, 11], elbowL: [-16, 0, 0],
        spine: [-5, 0, 0], chest: [0, -8, 0], head: [-6, -6, 0],
      },
    },
  },

  /* ── Chuyển động ────────────────────────────────────────────────────────── */
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
    /* CÙNG SƠ ĐỒ SO LE VỚI «Chạy», nhưng MỌI BIÊN ĐỘ CHIA ĐÔI và thân đứng thẳng:
       đó là toàn bộ khác biệt giữa đi và chạy, và nó phải đọc được ở 72px — nên
       chân sau chạm đất bằng mũi (`ankleR` âm) chứ không nhấc bổng như khi chạy. */
    id: "walk",
    note: "Đi bộ — sải chân vừa, thân thẳng, tay đánh nhẹ so le; chân sau còn chạm mũi xuống đất.",
    data: {
      rootY: -0.09,
      angles: {
        hipL: [-26, 0, 3], kneeL: [10, 0, 0], ankleL: [8, 0, 0],
        hipR: [19, 0, -3], kneeR: [24, 0, 0], ankleR: [-18, 0, 0],
        shoulderL: [26, 0, 8], elbowL: [-18, 0, 0],
        shoulderR: [-32, 0, -8], elbowR: [-26, 0, 0],
        spine: [3, 0, 0], hips: [0, 3, 0],
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
    /* BẤT ĐỐI XỨNG LÀ CẢ DÁNG. Mọi dáng khác trong bảng này đối xứng hoặc gần
       đối xứng, nên một hình bất đối xứng — tay trái thẳng đứng, tay phải mở
       ngang, hông lệch, một gối nhấc — đọc ra «đang nhảy múa» trước cả khi mắt
       kịp nhận ra từng chi. Cân nó lại cho "gọn" là xoá mất dáng. */
    id: "dance",
    note: "Nhảy múa — tay trái vươn thẳng lên, tay phải mở ngang, hông lệch, một gối nhấc và mũi chân duỗi.",
    data: {
      rootY: -0.08,
      angles: {
        shoulderL: [-8, 0, 168], elbowL: [-26, 0, 0], wristL: [0, 0, 20],
        shoulderR: [-12, 0, -84], elbowR: [-34, 0, 0], wristR: [0, 0, -18],
        hips: [0, 0, -9], spine: [0, 9, 11], chest: [0, -13, 5],
        neck: [0, 0, -6], head: [-6, -10, 13],
        hipL: [-34, 0, 13], kneeL: [86, 0, 0], ankleL: [-30, 0, 0],
        hipR: [5, 0, -5], kneeR: [7, 0, 0],
      },
    },
  },

  /* ── Chiến dịch ─────────────────────────────────────────────────────────── */
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
    /* THÂN GẬP 68° Ở BỤNG+NGỰC, KHÔNG PHẢI Ở `hips`. `hips` là gốc cây nên xoay
       nó thì CHÂN ĐỔ THEO và ra một người đang ngã chúi, không phải một người
       đang cúi chào.
       Và vì khung ngực đã chúi 68°, hai cánh tay ở góc 0 sẽ CHÌA RA SAU LƯNG —
       phải quay chúng RA TRƯỚC đúng chừng ấy để tay buông thẳng đứng, mà "ra
       trước" của một chi là `x` ÂM (quy ước đầu `skeleton.ts`). Bản nháp đầu viết
       +70 và ra một người chổng hai tay lên trời sau lưng: ở 72px thì hình ấy đọc
       thành «đang bị bắt», không phải «đang cúi chào». Ca dễ sai nhất trong bảng,
       và là ca duy nhất mà dấu sai vẫn ra một hình trông có vẻ hợp lý. */
    id: "bow",
    note: "Cúi chào — bụng và ngực gập tới gần ngang, hai tay buông thẳng đứng, gối hơi chùng.",
    data: {
      rootY: -0.04,
      angles: {
        spine: [46, 0, 0], chest: [22, 0, 0], neck: [6, 0, 0], head: [8, 0, 0],
        shoulderL: [-70, 0, 9], shoulderR: [-70, 0, -9],
        elbowL: [-14, 0, 0], elbowR: [-14, 0, 0],
        hipL: [-12, 0, 3], hipR: [-12, 0, -3],
        kneeL: [14, 0, 0], kneeR: [14, 0, 0],
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
    /* DÁNG DUY NHẤT DÙNG HẾT BIÊN ĐỘ `hips.x` (45°, đúng trần khai ở `skeleton.ts`).
       Nó phải thế: "bay" là cả người NẰM NGANG, mà cái nghiêng ấy chỉ có `hips`
       mới kéo được chân đi theo. 45 + 25 (bụng) + 15 (ngực) = 85° ⇒ thân gần
       ngang, chân đá ngửa ra sau bằng `hipL/R` dương, cổ và đầu bẻ ngược lên để
       mặt còn nhìn về phía đang bay. `rootY` +0.6 nhấc cả người khỏi mặt đất —
       thiếu nó thì đây là một người đang bò. */
    id: "fly",
    note: "Bay — cả người nằm ngang lơ lửng, tay phải vươn thẳng về trước, tay trái ép sát thân, chân duỗi mũi.",
    data: {
      rootY: 0.6,
      angles: {
        hips: [45, 0, 0], spine: [25, 0, 0], chest: [15, 0, 0],
        neck: [-30, 0, 0], head: [-38, 0, 0],
        shoulderR: [-172, 0, -10], elbowR: [-8, 0, 0], wristR: [-10, 0, 0],
        shoulderL: [6, 0, 10], elbowL: [-14, 0, 0],
        hipL: [42, 0, 4], hipR: [40, 0, -4],
        kneeL: [12, 0, 0], kneeR: [16, 0, 0],
        ankleL: [-34, 0, 0], ankleR: [-34, 0, 0],
      },
    },
  },

  /* ── Góc nhìn ───────────────────────────────────────────────────────────────
     BA DÒNG NÀY NÓI VỀ HƯỚNG ĐỨNG, KHÔNG VỀ TAY CHÂN. Nên bảng góc của chúng là
     dáng nghỉ cộng đúng một cú xoay `hips.y` — và đó không phải chỗ lười: một
     người dùng bấm «Góc 3/4» đang xin một nhân vật QUAY NGƯỜI, còn góc MÁY thì
     họ đã có pill «Góc» riêng ngay cạnh.
     `hips.y` DƯƠNG quay mặt về phía +X, tức là về bên TRÁI người xem (quy ước
     trái/phải của `skeleton.ts`). */
  {
    id: "view-34",
    note: "Góc 3/4 — cả người xoay 40°, tay buông như dáng nghỉ, mắt liếc về người xem.",
    data: {
      angles: {
        hips: [0, 40, 0],
        shoulderL: [0, 0, 10], shoulderR: [0, 0, -10],
        elbowL: [-12, 0, 0], elbowR: [-12, 0, 0],
        spine: [1, 0, 0], head: [0, -16, 0],
      },
    },
  },
  {
    id: "view-side",
    note: "Nhìn ngang — cả người xoay đúng 90°, tay buông sát thân để đường viền sườn đọc rõ.",
    data: {
      angles: {
        hips: [0, 90, 0],
        shoulderL: [0, 0, 6], shoulderR: [0, 0, -6],
        elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
        spine: [1, 0, 0],
      },
    },
  },
  {
    /* TAY HƠI DANG RA (z ±22) chứ không buông sát như `idle`: quay lưng lại thì
       hai cánh tay sát sườn chồng lên bóng của thân, và cả hình thu về một cái
       cột. Dang ra một chút là đủ để thấy đây là một người đang quay lưng. */
    id: "view-back",
    note: "Nhìn sau — cả người xoay 180°, hai tay hơi dang để bóng thân không nuốt mất cánh tay.",
    data: {
      angles: {
        hips: [0, 180, 0],
        shoulderL: [0, 0, 22], shoulderR: [0, 0, -22],
        elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
        spine: [1, 0, 0],
      },
    },
  },
];

/** Nhãn tiếng Việt của preset — tra từ danh mục THẬT, không chép chuỗi. */
export function presetLabel(id: string): string {
  return poseLabel(id);
}

/**
 * Preset theo id; id lạ rơi về dáng đầu (`idle`) thay vì làm trắng màn.
 *
 * Đường lùi ấy NAY KHÔNG CÒN CHẠM TỚI ĐƯỢC bằng một id trong danh mục — bảng
 * trên đã phủ đủ 19/19 và có test khoá điều đó. Giữ nó lại là để chịu đựng thứ
 * duy nhất còn sinh ra id lạ: một bản nháp cũ mang id của một dáng đã bị bỏ khỏi
 * danh mục. Với ca ấy thì một lượt vẽ bằng dáng nghỉ vẫn hơn một lượt vẽ hỏng.
 * Cửa cho ô XEM TRƯỚC thì ngược lại — xem `hasPoseSkeleton` ở `pose-thumb.ts`.
 */
export function presetById(id: string): PosePreset {
  return POSE_PRESETS.find((p) => p.id === id) ?? POSE_PRESETS[0]!;
}

/** Dáng mở màn khi vào lab. */
export const DEFAULT_PRESET_ID = "idle";
