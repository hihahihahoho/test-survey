import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { POSES } from "@/features/kit-core/lib/poses";

import { POSE_PRESETS, presetById, presetLabel } from "../pose/pose-presets";
import {
  CAMERA_VIEWS, CAMERA_TARGET, DEFAULT_VIEW, cameraView, clampAxis, expandPose, isDirty,
  setAxis, setJointRotation, zeroAngles,
} from "../pose/pose-state";
import {
  POSE_REF_PREVIEW_SIZE, POSE_REF_SIZE, PoseRefUnavailableError, canCapturePoseRef,
  capturePoseRef, poseRefLabel,
} from "../pose/capture-pose-ref";
import {
  JOINTS, JOINT_GROUPS, JOINT_IDS, childrenOf, deg, joint, rad, rootJoints,
  type JointId, type Vec3,
} from "../pose/skeleton";

/**
 * MANƠCANH 3D — phần SỐNG TIẾP của lab «Pose & Sketch» đã bị xoá (07/09/2026).
 *
 * Lab có route riêng (`/lab/pose-editor`), viewport WebGL, tab phác tay và dải ảnh;
 * tất cả đi theo route. Thứ Ở LẠI là bốn module mà khu soạn prompt gọi thật:
 * `skeleton` → `pose-state` → `pose-presets` → `capture-pose-ref`, tức đường sinh
 * ảnh dáng cho `sheet.poseRef` (xem `prompt-canvas/lib/pose-refs.ts`). Bộ test này
 * là phần CŨ tương ứng, cắt ra nguyên văn — không viết lại, để cái gì đang được
 * khoá thì vẫn được khoá y như trước.
 *
 * KHOÁ: cây khớp (thứ mọi thứ khác đứng trên), bảng dáng (dễ gõ lệch id mà không
 * ai thấy), phép nắn khớp, bảng góc máy, và biên `capturePoseRef`.
 *
 * KHÔNG KHOÁ: mọi thứ chạm WebGL. `pose-renderer.ts` (và `three`) nằm sau một
 * `import()` ĐỘNG bên trong `capturePoseRef`, và ca "từ chối TRƯỚC KHI nạp three"
 * bên dưới chính là cái canh chốt đó không bị ai gỡ.
 */

describe("cây khớp — thứ mà mọi bảng góc và mọi slider đứng lên trên", () => {
  it("đúng một khớp gốc, và MỌI khớp khác nối được về nó (không có nhánh mồ côi)", () => {
    expect(rootJoints().map((j) => j.id)).toEqual(["hips"]);
    for (const def of JOINTS) {
      let cursor = def.parent;
      let hops = 0;
      while (cursor && hops < 20) {
        cursor = joint(cursor).parent;
        hops += 1;
      }
      expect(cursor, `khớp ${def.id} không về được gốc`).toBeNull();
    }
  });

  it("cha luôn khai TRƯỚC con — `childrenOf` dựng cây theo thứ tự mảng", () => {
    const seen = new Set<string>();
    for (const def of JOINTS) {
      if (def.parent) expect(seen.has(def.parent), `${def.id} khai trước cha`).toBe(true);
      seen.add(def.id);
    }
  });

  it("17 khớp, id không trùng, và panel bên phải phủ ĐỦ 17 khớp", () => {
    expect(JOINT_IDS).toHaveLength(17);
    expect(new Set(JOINT_IDS).size).toBe(17);
    const inPanel = JOINT_GROUPS.flatMap((g) => g.ids);
    expect(new Set(inPanel)).toEqual(new Set(JOINT_IDS));
    expect(inPanel).toHaveLength(17);
  });

  it("mọi trục có dải hợp lệ và 0 nằm TRONG dải — dáng gốc phải luôn đặt được", () => {
    for (const def of JOINTS) {
      expect(def.axes.length, `${def.id} không có trục nào`).toBeGreaterThan(0);
      for (const axis of def.axes) {
        expect(axis.min, `${def.id}.${axis.axis}`).toBeLessThan(axis.max);
        expect(axis.min).toBeLessThanOrEqual(0);
        expect(axis.max).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("bàn chân chạm đất ở dáng gốc — sai chỗ này thì nhân vật lơ lửng ở MỌI dáng", () => {
    /* Cộng dọc: hông 1.30 − 0.06 (háng) − 0.62 (đùi) − 0.56 (cẳng) ≈ 0.06. */
    const hips = joint("hips").offset[1];
    const drop = joint("hipL").offset[1] + (joint("hipL").bone?.length ?? 0) * -1
      + (joint("kneeL").bone?.length ?? 0) * -1;
    expect(hips + drop).toBeCloseTo(0.06, 2);
  });

  it("độ ⇄ radian đi về được nguyên vẹn", () => {
    expect(deg(rad(45))).toBe(45);
    expect(deg(rad(-137.5))).toBe(-137.5);
    expect(childrenOf("head")).toHaveLength(0);
    expect(childrenOf("chest").map((c) => c.id)).toEqual(["neck", "shoulderL", "shoulderR"]);
  });
});

describe("bảng dáng — id phải là id THẬT của KitGen, không phải tên lab tự đặt", () => {
  it("mọi preset đều có trong danh mục 19 dáng của kit-core (`lib/poses.ts`)", () => {
    const known = new Set<string>(POSES.map((p) => p.id));
    for (const preset of POSE_PRESETS) {
      expect(known.has(preset.id), `dáng "${preset.id}" không có trong POSES`).toBe(true);
      /* Nhãn tra ngược từ danh mục thật ⇒ KHÔNG được rơi về chính id. */
      expect(presetLabel(preset.id)).not.toBe(preset.id);
    }
  });

  it("VÀ NGƯỢC LẠI: mọi dáng của danh mục đều có bảng góc — 19/19, không id nào rơi về `idle`", () => {
    /* Chiều này mới là chiều người dùng nhìn thấy. Thiếu một bảng góc thì
       `presetById` lặng lẽ trả về «Đứng chờ» (đường lùi cố ý của nó), và dòng ấy
       bày ra ảnh của một dáng KHÁC — hoặc, ở hộp chọn, một ô xám. Chủ sản phẩm
       gửi ảnh chụp màn đúng ca ấy ngày 18/09/2026: 11 trong 19 dòng là ô xám. */
    const co = new Set(POSE_PRESETS.map((preset) => preset.id));
    const thieu = POSES.filter((pose) => !co.has(pose.id)).map((pose) => pose.id);
    expect(thieu, `dáng chưa có bảng góc khớp: ${thieu.join(", ")}`).toEqual([]);
    expect(POSE_PRESETS).toHaveLength(POSES.length);

    for (const pose of POSES) {
      expect(presetById(pose.id).id, `"${pose.id}" rơi về đường lùi`).toBe(pose.id);
    }
  });

  it("mọi góc đều nằm trong dải của trục, và không preset nào đặt số cho một trục KHÔNG TỒN TẠI", () => {
    /* Trục không tồn tại là ca im lặng nhất trong cả bảng: `wristL` không có trục
       `y`, `kneeL` chỉ có `x`, `ankleL` không có `z` — viết số vào đó thì
       `expandPose` chép nó sang three.js và khớp xoay theo một trục mà slider
       không bao giờ chỉnh lại được, tức là một dáng không ai sửa nổi. */
    const TRUC = ["x", "y", "z"] as const;
    for (const preset of POSE_PRESETS) {
      for (const [id, goc] of Object.entries(preset.data.angles)) {
        const def = joint(id as never);
        TRUC.forEach((truc, at) => {
          const spec = def.axes.find((a) => a.axis === truc);
          const so = goc?.[at] ?? 0;
          if (!spec) {
            expect(so, `${preset.id}.${id}: khớp này không có trục ${truc}`).toBe(0);
            return;
          }
          expect(so, `${preset.id}.${id}.${truc} = ${so} ra ngoài dải`).toBeGreaterThanOrEqual(spec.min);
          expect(so).toBeLessThanOrEqual(spec.max);
        });
      }
    }
  });

  it("mọi khớp nhắc tới trong preset đều tồn tại — gõ lệch tên khớp thì im lặng mất góc", () => {
    const known = new Set<string>(JOINT_IDS);
    for (const preset of POSE_PRESETS) {
      for (const id of Object.keys(preset.data.angles)) {
        expect(known.has(id), `preset ${preset.id} nhắc khớp lạ "${id}"`).toBe(true);
      }
    }
  });

  it("`expandPose` điền đủ 17 khớp và trả BẢN SAO — preset là hằng dùng chung", () => {
    const preset = presetById("wave");
    const a = expandPose(preset.data);
    expect(Object.keys(a)).toHaveLength(17);
    expect(a.hips).toEqual([0, 0, 0]);
    a.shoulderR[0] = 999;
    expect(expandPose(preset.data).shoulderR[0]).not.toBe(999);
  });

  it("id dáng lạ (bản nháp cũ mang dáng đã bị bỏ) vẫn rơi về dáng đầu thay vì làm trắng màn", () => {
    expect(presetById("khong-ton-tai").id).toBe("idle");
  });

  it("dáng ngồi/nhảy phải đổi `rootY` — xoay khớp không làm người ngồi xuống được", () => {
    expect(presetById("sit").data.rootY).toBeLessThan(-0.3);
    expect(presetById("jump").data.rootY).toBeGreaterThan(0.2);
    expect(presetById("idle").data.rootY ?? 0).toBe(0);
  });
});

describe("nắn khớp — hai đường (gizmo & slider) ghi vào CÙNG một bảng góc", () => {
  it("slider bị KẸP theo dải của trục, gizmo thì không", () => {
    const spec = joint("kneeL").axes[0]!;
    expect(clampAxis(999, spec)).toBe(spec.max);
    expect(clampAxis(-999, spec)).toBe(spec.min);
    expect(clampAxis(Number.NaN, spec)).toBe(0);

    const clamped = setAxis(zeroAngles(), "kneeL", "x", 999);
    expect(clamped.kneeL[0]).toBe(spec.max);

    /* Gizmo đi đường `setJointRotation` — xoay tự do là cái hay của gizmo. */
    const free = setJointRotation(zeroAngles(), "kneeL", [999, 0, 0]);
    expect(free.kneeL[0]).toBe(999);
  });

  it("trục KHÔNG khai trong `axes` vẫn ghi được (đường gizmo), không bị nuốt", () => {
    /* `kneeL` chỉ khai trục x; gizmo vẫn xoay được y/z và slider không có ô cho nó. */
    expect(setAxis(zeroAngles(), "kneeL", "y", 30).kneeL[1]).toBe(30);
  });

  it("ghi một khớp KHÔNG đụng khớp khác và trả tham chiếu mới (React mới chịu vẽ lại)", () => {
    const before = zeroAngles();
    const after = setAxis(before, "elbowL", "x", -40);
    expect(after).not.toBe(before);
    expect(before.elbowL[0]).toBe(0);
    expect(after.shoulderL).toBe(before.shoulderL);
  });

  it("`isDirty` bật khi góc lệch HOẶC độ cao gốc lệch", () => {
    const base = expandPose(presetById("idle").data);
    expect(isDirty(expandPose(presetById("idle").data), base, 0, 0)).toBe(false);
    expect(isDirty(setAxis(base, "head", "y", 5), base, 0, 0)).toBe(true);
    expect(isDirty(base, base, 0.3, 0)).toBe(true);
  });

});

describe("bảng góc máy — 9 hướng, MỌI hướng cùng một bán kính", () => {
  it("đủ 9 góc, id không trùng, ai cũng có nhãn tiếng Việt", () => {
    expect(CAMERA_VIEWS).toHaveLength(9);
    expect(new Set(CAMERA_VIEWS.map((v) => v.id)).size).toBe(9);
    for (const v of CAMERA_VIEWS) {
      expect(v.vi.trim(), `${v.id} thiếu nhãn`).not.toBe("");
    }
  });

  it("phủ đủ một vòng máy quay: trước/sau · hai bên · hai đường chéo · trên/dưới", () => {
    const ids = CAMERA_VIEWS.map((v) => v.id);
    for (const id of [
      "front", "back", "side-left", "side-right",
      "three-quarter-left", "three-quarter-right",
      "top-down", "low-angle", "isometric",
    ]) {
      expect(ids, `thiếu góc ${id}`).toContain(id);
    }
  });

  it("CÙNG BÁN KÍNH so với tâm ngắm — bộ ảnh mỗi tấm một cỡ thì máy vẽ đọc ra mấy nhân vật", () => {
    /* Đây là ràng buộc dễ vỡ nhất của bảng: sửa một vị trí cho "nhìn đẹp hơn" là
       tấm đó lệch cỡ khỏi 8 tấm còn lại mà không ai thấy cho tới lúc ghép bộ. */
    const radius = (v: (typeof CAMERA_VIEWS)[number]) =>
      Math.hypot(v.position[0] - CAMERA_TARGET[0], v.position[1] - CAMERA_TARGET[1], v.position[2] - CAMERA_TARGET[2]);
    for (const v of CAMERA_VIEWS) {
      expect(radius(v), `${v.id} lệch bán kính`).toBeCloseTo(7.8, 1);
    }
  });

  it("trái/phải thật sự đối xứng qua trục X", () => {
    const pairs: [string, string][] = [["side-left", "side-right"], ["three-quarter-left", "three-quarter-right"]];
    for (const [l, r] of pairs) {
      const a = cameraView(l as never);
      const b = cameraView(r as never);
      expect(a.position[0]).toBeCloseTo(-b.position[0], 3);
      expect(a.position[1]).toBeCloseTo(b.position[1], 3);
    }
  });

  it("isometric ĐÚNG NGHĨA: ba thành phần lệch bằng nhau ⇒ 45° / 35.26°", () => {
    const iso = cameraView("isometric");
    const dx = Math.abs(iso.position[0]);
    const dy = Math.abs(iso.position[1] - CAMERA_TARGET[1]);
    const dz = Math.abs(iso.position[2]);
    expect(dy).toBeCloseTo(dx, 1);
    expect(dz).toBeCloseTo(dx, 1);
  });

  it("KHÔNG góc nào nằm đúng trên trục gây suy biến `lookAt` (khung hình lật)", () => {
    for (const v of CAMERA_VIEWS) {
      const flatDist = Math.hypot(v.position[0], v.position[2]);
      expect(flatDist, `${v.id} nằm thẳng đứng trên tâm ngắm`).toBeGreaterThan(0.5);
    }
  });

  it("id lạ rơi về chính diện; góc mặc định có thật", () => {
    expect(cameraView("khong-co" as never).id).toBe("front");
    expect(CAMERA_VIEWS.some((v) => v.id === DEFAULT_VIEW)).toBe(true);
  });
});

describe("capturePoseRef — API mà composer sẽ gọi lúc bấm Gen", () => {
  it("môi trường `node` KHÔNG có DOM ⇒ báo trước, không phải thử rồi mới chết", () => {
    /* Ca test chạy ở `environment: "node"` (xem vitest.config.ts) nên đây đúng là
       tình huống "máy không dựng được ảnh" mà nơi gọi phải chịu được. */
    expect(canCapturePoseRef()).toBe(false);
  });

  it("từ chối ÊM và CÓ KIỂU — nơi gọi phân biệt được 'máy không vẽ được' với 'mã hỏng'", async () => {
    await expect(capturePoseRef("idle", "front")).rejects.toBeInstanceOf(PoseRefUnavailableError);
    await expect(capturePoseRef("idle", "front")).rejects.toThrow(/không dựng được ảnh pose reference/);
  });

  it("từ chối TRƯỚC KHI nạp `three` — không có DOM thì đừng kéo 700 kB về làm gì", async () => {
    /* Nếu ai đó chuyển lời gọi `import("./pose-renderer")` lên trước phép kiểm
       môi trường, ca này sẽ đỏ vì `three` đụng `self`/`document` lúc nạp ở node,
       hoặc chí ít cũng làm test chậm hẳn. Chốt bằng thời gian là mong manh, nên
       chốt bằng KIỂU LỖI: `PoseRefUnavailableError` chỉ ném ở nhánh kiểm trước. */
    const err = await capturePoseRef("idle", "isometric").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PoseRefUnavailableError);
    expect((err as Error).message).toContain("không có DOM/canvas");
  });

  it("nhãn ảnh ghép ĐÚNG dạng «dáng · góc», bằng nhãn tiếng Việt của cả hai bảng", () => {
    expect(poseRefLabel("jump", "three-quarter-left")).toBe("Nhảy · ¾ trái");
    expect(poseRefLabel("sit", "isometric")).toBe("Ngồi · Isometric");
    /* id lạ KHÔNG được làm vỡ nhãn — bản nháp cũ mang dáng đã bỏ vẫn phải gen được. */
    expect(poseRefLabel("khong-co", "front")).toBe("Đứng chờ · Chính diện");
  });

  it("cỡ ảnh: bản gửi máy vẽ lớn hơn hẳn bản xem trước", () => {
    expect(POSE_REF_SIZE).toBeGreaterThan(POSE_REF_PREVIEW_SIZE);
    expect(POSE_REF_PREVIEW_SIZE).toBeGreaterThanOrEqual(256);
  });
});

/**
 * ══ ẢNH MANƠCANH KHÔNG ĐƯỢC MANG NỀN ĐẶC ══════════════════════════════════
 *
 * Ảnh này đi thẳng vào `referenced_image_paths` của `image_gen`, và máy vẽ bắt
 * chước ảnh tham chiếu ở MỌI tầng — kể cả tầng nền. Một manơcanh đặt trên tấm
 * trắng đặc dạy nó trả về tấm nhân vật đục kín, rồi cổng alpha của `gen.sh` đánh
 * trượt đúng cái tấm ấy. Cách chữa nằm ở ẢNH, không phải ở một câu dặn thêm trong
 * prompt: prompt chỉ tả thứ muốn vẽ.
 *
 * `pose-renderer.ts` chạm WebGL nên không gọi được ở đây (xem khối đầu file) —
 * ca này đọc mã nguồn, giống cách `pose-sheet.test.ts` khoá bản mirror hình học.
 */
const RENDERER = readFileSync(
  resolve(fileURLToPath(new URL(".", import.meta.url)), "../pose/pose-renderer.ts"),
  "utf8",
);

describe("ảnh dáng nộp cho máy vẽ — nền TRỐNG, chỉ còn manơcanh", () => {
  it("renderer xin context CÓ alpha và xoá buffer về alpha 0", () => {
    expect(RENDERER).toContain("alpha: true");
    expect(RENDERER).toContain("renderer.setClearColor(0x000000, 0)");
  });

  it("không còn ai đặt `scene.background` — một `Color` ở đó là một tấm nền đặc", () => {
    expect(RENDERER).not.toContain("scene.background");
  });

  it("bảng màu manơcanh không còn khoá nền, và không có nét trắng nào", () => {
    const mesh = readFileSync(
      resolve(fileURLToPath(new URL(".", import.meta.url)), "../pose/mannequin-mesh.ts"),
      "utf8",
    );
    const colors = /export const POSE_COLORS = \{([\s\S]*?)\} as const;/.exec(mesh)?.[1] ?? "";
    expect(colors).not.toContain("background:");
    /* Nét trắng trên nền trống là nét vô hình. Màu xám hiện tại đọc được ở cả hai. */
    expect(colors.toLowerCase()).not.toContain("#ffffff");
    expect(colors.toLowerCase()).not.toContain("#fff\"");
  });
});


/* ══════════════════════════════════════════════════════════════════════════
   BẢNG GÓC CÓ RA ĐÚNG CÁI DÁNG NÓ TỰ XƯNG KHÔNG
   ══════════════════════════════════════════════════════════════════════════

   ╔══ VÌ SAO PHẢI TỰ DỰNG LẠI PHÉP TÍNH VỊ TRÍ ═════════════════════════════╗
   ║ 19 bảng góc là 19 tờ giấy đầy số, và một số SAI DẤU vẫn ra một hình trông  ║
   ║ hợp lý — chỉ là hình của một dáng khác. Ca thật đã xảy ra khi dựng bảng    ║
   ║ này: `bow` viết `shoulder.x = +58` để "bù lại chỗ ngực đã gập", và cái dấu ║
   ║ dương ấy hất hai cánh tay LÊN TRỜI SAU LƯNG thay vì buông thẳng đứng. Mọi  ║
   ║ cổng khác trong repo đều cho nó qua: id có trong danh mục ✓, khớp có thật  ║
   ║ ✓, góc trong dải ✓, ảnh dựng ra không ném ✓. Chỉ có MẮT NGƯỜI bắt được —   ║
   ║ mà mắt người thì không chạy trong CI.                                     ║
   ║ Nên ca này dựng lại đúng phép biến đổi của three.js (`Matrix4.compose` với ║
   ║ Euler thứ tự mặc định XYZ, tức R = Rx·Ry·Rz) để đọc ra TOẠ ĐỘ THẬT của cổ  ║
   ║ tay, cổ chân, quả đầu — rồi hỏi từng dáng đúng cái câu mà `note` của nó đã ║
   ║ hứa với người dùng. Sai dấu ở đây là đỏ, không phải là một tấm ảnh lạ.     ║
   ╚═══════════════════════════════════════════════════════════════════════════╝ */

type M9 = readonly number[];
const EYE: M9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mul(a: M9, b: M9): M9 {
  const out: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      let sum = 0;
      for (let k = 0; k < 3; k += 1) sum += a[i * 3 + k]! * b[k * 3 + j]!;
      out[i * 3 + j] = sum;
    }
  }
  return out;
}

function apply(m: M9, v: Vec3): Vec3 {
  return [
    m[0]! * v[0] + m[1]! * v[1] + m[2]! * v[2],
    m[3]! * v[0] + m[4]! * v[1] + m[5]! * v[2],
    m[6]! * v[0] + m[7]! * v[1] + m[8]! * v[2],
  ];
}

/** R = Rx·Ry·Rz — ĐÚNG thứ tự Euler mặc định của three.js (`Euler.order = "XYZ"`),
 *  thứ tự mà `mannequin-mesh.setAngles` dựa vào khi gán thẳng `rotation.set(…)`. */
function rotXYZ([x, y, z]: Vec3): M9 {
  const [a, b] = [Math.cos(rad(x)), Math.sin(rad(x))];
  const [c, d] = [Math.cos(rad(y)), Math.sin(rad(y))];
  const [e, f] = [Math.cos(rad(z)), Math.sin(rad(z))];
  return mul(mul([1, 0, 0, 0, a, -b, 0, b, a], [c, 0, d, 0, 1, 0, -d, 0, c]), [e, -f, 0, f, e, 0, 0, 0, 1]);
}

interface Landmarks {
  at: Record<JointId, Vec3>;
  /** Tâm quả đầu — `mannequin-mesh` đặt nó cách gốc khớp `head` đúng một bán kính. */
  headCenter: Vec3;
  /** Hướng MẶT nhìn: +Z của khớp gốc. */
  facing: Vec3;
  /** Gốc khớp thấp nhất — "có chạm đất không". Dáng đứng thường là ~0.06 (cổ chân). */
  lowest: number;
}

function landmarksOf(id: string): Landmarks {
  const preset = presetById(id);
  expect(preset.id, `không có bảng góc cho "${id}"`).toBe(id);
  const angles = expandPose(preset.data);

  const world = new Map<JointId, { R: M9; p: Vec3 }>();
  /* `JOINTS` khai CHA TRƯỚC CON (luật ghi ở `skeleton.ts`), nên một vòng lặp
     thẳng là đủ — không cần đệ quy. */
  for (const def of JOINTS) {
    const parent = def.parent
      ? world.get(def.parent)!
      : { R: EYE, p: [0, preset.data.rootY ?? 0, 0] as Vec3 };
    const offset = apply(parent.R, def.offset);
    world.set(def.id, {
      R: mul(parent.R, rotXYZ(angles[def.id])),
      p: [parent.p[0] + offset[0], parent.p[1] + offset[1], parent.p[2] + offset[2]],
    });
  }

  const at = {} as Record<JointId, Vec3>;
  let lowest = Infinity;
  for (const def of JOINTS) {
    at[def.id] = world.get(def.id)!.p;
    lowest = Math.min(lowest, at[def.id][1]);
  }

  const head = world.get("head")!;
  const lift = apply(head.R, [0, joint("head").headRadius ?? 0, 0]);
  return {
    at,
    headCenter: [head.p[0] + lift[0], head.p[1] + lift[1], head.p[2] + lift[2]],
    facing: apply(world.get("hips")!.R, [0, 0, 1]),
    lowest,
  };
}

describe("mỗi dáng phải ra đúng cái hình mà `note` của nó hứa", () => {
  it("«Đứng chờ» là mốc: mặt nhìn thẳng vào camera, hai tay buông dưới hông, chân chạm đất", () => {
    const m = landmarksOf("idle");
    expect(m.facing[2]).toBeCloseTo(1, 2);
    expect(m.at.wristL[1]).toBeLessThan(m.at.hips[1]);
    expect(m.at.wristR[1]).toBeLessThan(m.at.hips[1]);
    expect(m.lowest).toBeLessThan(0.1);
  });

  it("«Giới thiệu» — tay phải mở NGANG (ra xa thân) và hơi ra trước, cao ngang vai", () => {
    const m = landmarksOf("present");
    expect(m.at.wristR[0]).toBeLessThan(-0.9);
    expect(m.at.wristR[2]).toBeGreaterThan(0.3);
    expect(Math.abs(m.at.wristR[1] - m.at.shoulderR[1])).toBeLessThan(0.4);
  });

  it("«Ăn mừng» — HAI cổ tay cao hơn quả đầu, mà chân vẫn bám đất (đó là chỗ khác «Nhảy»)", () => {
    const m = landmarksOf("cheer");
    expect(m.at.wristL[1]).toBeGreaterThan(m.headCenter[1]);
    expect(m.at.wristR[1]).toBeGreaterThan(m.headCenter[1]);
    expect(m.lowest).toBeLessThan(0.15);
    expect(m.lowest).toBeLessThan(landmarksOf("jump").lowest - 0.3);
  });

  it("«Suy nghĩ» — bàn tay phải áp vào quả đầu (chống cằm), không dừng lại ngang vai", () => {
    const m = landmarksOf("think");
    const xa = Math.hypot(
      m.at.wristR[0] - m.headCenter[0],
      m.at.wristR[1] - m.headCenter[1],
      m.at.wristR[2] - m.headCenter[2],
    );
    expect(xa).toBeLessThan(0.75);
    expect(m.at.wristR[1]).toBeGreaterThan(m.at.elbowR[1]);
  });

  it("«Giơ ngón cái» — nắm tay CAO HƠN và RA TRƯỚC khuỷu, tức là đang chìa về người xem", () => {
    const m = landmarksOf("thumbs-up");
    expect(m.at.wristR[1]).toBeGreaterThan(m.at.elbowR[1] + 0.3);
    expect(m.at.wristR[2]).toBeGreaterThan(m.at.elbowR[2] + 0.1);
  });

  it("«Đi bộ» — một bàn chân trước một bàn chân sau, và CẢ HAI còn sát đất (khác «Chạy»)", () => {
    const m = landmarksOf("walk");
    expect(m.at.ankleL[2] - m.at.ankleR[2]).toBeGreaterThan(0.8);
    expect(Math.max(m.at.ankleL[1], m.at.ankleR[1])).toBeLessThan(0.25);
    /* «Chạy» thì bốc hẳn lên — hai dáng không được ra cùng một hình. */
    expect(landmarksOf("run").lowest).toBeGreaterThan(m.lowest + 0.25);
  });

  it("«Nhảy múa» — BẤT ĐỐI XỨNG: tay trái vươn trên đầu, tay phải mở ngang, gối trái nhấc khỏi đất", () => {
    const m = landmarksOf("dance");
    expect(m.at.wristL[1]).toBeGreaterThan(m.headCenter[1]);
    expect(m.at.wristR[0]).toBeLessThan(-1);
    expect(m.at.ankleL[1]).toBeGreaterThan(m.at.ankleR[1] + 0.15);
  });

  it("«Cúi chào» — đầu đổ HẲN ra trước và xuống thấp, hai tay BUÔNG XUỐNG chứ không hất lên sau lưng", () => {
    const m = landmarksOf("bow");
    expect(m.headCenter[2]).toBeGreaterThan(m.at.hips[2] + 0.9);
    expect(m.headCenter[1]).toBeLessThan(2);
    /* ĐÂY là cái chốt của cả ca: bản nháp đầu hất hai tay lên trời sau lưng vì
       một dấu cộng, và không cổng nào khác nhìn thấy. */
    expect(m.at.wristL[1]).toBeLessThan(m.at.shoulderL[1] - 0.6);
    expect(m.at.wristR[1]).toBeLessThan(m.at.shoulderR[1] - 0.6);
  });

  it("«Bay» — cả người lơ lửng, đầu và tay phải vươn về trước, hai bàn chân kéo lại phía sau", () => {
    const m = landmarksOf("fly");
    expect(m.lowest).toBeGreaterThan(1);
    expect(m.at.wristR[2]).toBeGreaterThan(m.headCenter[2] + 0.5);
    expect(m.at.ankleL[2]).toBeLessThan(m.at.hips[2] - 0.8);
  });

  it("ba dáng nhóm «Góc nhìn» quay người đúng số độ chúng hứa, không dáng nào quay nhầm chiều", () => {
    /* `hips.y` dương quay mặt về +X = bên TRÁI người xem (quy ước `skeleton.ts`). */
    const ba = landmarksOf("view-34");
    expect(ba.facing[0]).toBeCloseTo(Math.sin(rad(40)), 2);
    expect(ba.facing[2]).toBeCloseTo(Math.cos(rad(40)), 2);

    expect(landmarksOf("view-side").facing[0]).toBeCloseTo(1, 2);
    expect(landmarksOf("view-back").facing[2]).toBeCloseTo(-1, 2);
  });
});
