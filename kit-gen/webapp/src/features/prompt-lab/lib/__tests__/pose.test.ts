import { describe, expect, it } from "vitest";

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
import { JOINTS, JOINT_GROUPS, JOINT_IDS, childrenOf, deg, joint, rad, rootJoints } from "../pose/skeleton";

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
  it("cả 8 preset đều có trong danh mục 19 dáng của kit-core (`lib/poses.ts`)", () => {
    const known = new Set<string>(POSES.map((p) => p.id));
    expect(POSE_PRESETS).toHaveLength(8);
    for (const preset of POSE_PRESETS) {
      expect(known.has(preset.id), `dáng "${preset.id}" không có trong POSES`).toBe(true);
      /* Nhãn tra ngược từ danh mục thật ⇒ KHÔNG được rơi về chính id. */
      expect(presetLabel(preset.id)).not.toBe(preset.id);
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

  it("id dáng lạ rơi về dáng đầu thay vì làm trắng màn", () => {
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
