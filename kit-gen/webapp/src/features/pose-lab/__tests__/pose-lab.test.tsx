import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { routeTree } from "@/routeTree";
import { POSES } from "@/features/kit-core/lib/poses";
import { loadBundledV2 } from "@/features/design/library/lib/source";

import { PoseSketchLabScreen } from "../PoseSketchLabScreen";
import { POSE_PRESETS, presetById, presetLabel } from "../lib/pose-presets";
import {
  CAMERA_VIEWS, CAMERA_TARGET, DEFAULT_VIEW, cameraView, clampAxis, expandPose, isDirty,
  setAxis, setJointRotation, zeroAngles,
} from "../lib/pose-state";
import {
  POSE_REF_PREVIEW_SIZE, POSE_REF_SIZE, PoseRefUnavailableError, canCapturePoseRef,
  capturePoseRef, poseRefLabel,
} from "../lib/capture-pose-ref";
import { JOINTS, JOINT_GROUPS, JOINT_IDS, childrenOf, deg, joint, rad, rootJoints } from "../lib/skeleton";
import {
  SKETCH_SIZE, drawSketch, emptySketch, guideFigure, hasInk, pushStroke, redo, undo,
  type Stroke,
} from "../lib/sketch-model";
import {
  CUSTOM_TARGET, MASCOT_POSE_TARGET, sketchTargets, targetGroups, targetLabel,
} from "../lib/sketch-targets";
import { addShot, makeShot, removeShot, shotFileName, MAX_SHOTS } from "../lib/shots";

/**
 * Test của một PROTOTYPE — phạm vi cố ý hẹp, và nói rõ hẹp ở đâu.
 *
 * KHOÁ: cây khớp (thứ mọi thứ khác đứng trên), bảng dáng (dễ gõ lệch id mà không
 * ai thấy), mô hình nét vẽ + undo/redo, dải ảnh, và dây nối route.
 *
 * KHÔNG KHOÁ: mọi thứ chạm WebGL. `PoseViewport.tsx` không được import ở đây, và
 * đó là CHỦ Ý — nó nằm sau một biên `React.lazy` + cờ `mounted` nên ở môi trường
 * `node` (config test mặc định) nó không bao giờ được nạp. Ca "smoke render" bên
 * dưới chính là cái canh hai chốt đó không bị ai gỡ: gỡ ra thì `renderToString`
 * sẽ nổ vì `three` đòi WebGL.
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

describe("bản phác — mô hình nét + undo/redo", () => {
  const stroke = (n: number): Stroke => ({ tool: "pen", width: 6, points: [n, n, n + 1, n + 1] });

  it("nét dưới 2 điểm bị bỏ — chạm lỡ tay không được ăn một bước undo", () => {
    const s = pushStroke(emptySketch(), { tool: "pen", width: 6, points: [10, 10] });
    expect(s.strokes).toHaveLength(0);
    expect(hasInk(s)).toBe(false);
  });

  it("undo → redo về đúng chỗ cũ; vẽ nét mới thì DỌN nhánh redo", () => {
    let s = pushStroke(pushStroke(emptySketch(), stroke(1)), stroke(2));
    expect(s.strokes).toHaveLength(2);
    s = undo(s);
    expect(s.strokes).toHaveLength(1);
    expect(s.undone).toHaveLength(1);
    s = redo(s);
    expect(s.strokes).toHaveLength(2);
    expect(s.undone).toHaveLength(0);

    s = pushStroke(undo(s), stroke(3));
    expect(s.strokes).toHaveLength(2);
    expect(s.undone, "vẽ mới phải dọn nhánh redo cũ").toHaveLength(0);
  });

  it("undo/redo ở đáy/đỉnh trả về CHÍNH nó, không ném", () => {
    const empty = emptySketch();
    expect(undo(empty)).toBe(empty);
    expect(redo(empty)).toBe(empty);
  });

  it("người que gợi ý đúng tỉ lệ chibi và nằm gọn trong khổ vẽ", () => {
    const shapes = guideFigure(SKETCH_SIZE);
    const head = shapes.find((s) => s.kind === "circle");
    expect(head).toBeDefined();
    if (head?.kind === "circle") {
      /* Đầu ~1/3 chiều cao thân người que (đường kính 0.24 trên khoảng 0.8). */
      expect((head.r * 2) / SKETCH_SIZE).toBeCloseTo(0.24, 2);
    }
    for (const s of shapes) {
      const xs = s.kind === "circle" ? [s.x - s.r, s.x + s.r] : [s.x1, s.x2];
      const ys = s.kind === "circle" ? [s.y - s.r, s.y + s.r] : [s.y1, s.y2];
      for (const v of [...xs, ...ys]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(SKETCH_SIZE);
      }
    }
  });

  it("vẽ lại LUÔN tô trắng trước, và TẨY dùng màu trắng chứ không khoét thủng alpha", () => {
    /* Ctx giả: chỉ cần ghi lại thứ tự lời gọi và giá trị được gán. */
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, prop: string) => {
        if (prop === "fillStyle" || prop === "strokeStyle") return undefined;
        return (...args: unknown[]) => { calls.push(`${prop}(${args.join(",")})`); };
      },
      set: (_t, prop: string, value: unknown) => { calls.push(`${prop}=${String(value)}`); return true; },
    }) as unknown as CanvasRenderingContext2D;

    const state = pushStroke(emptySketch(), { tool: "eraser", width: 40, points: [0, 0, 5, 5, 9, 9] });
    drawSketch(ctx, state, { size: SKETCH_SIZE, guide: false });

    expect(calls).toContain("fillStyle=#ffffff");
    expect(calls).toContain(`fillRect(0,0,${SKETCH_SIZE},${SKETCH_SIZE})`);
    expect(calls).toContain("strokeStyle=#ffffff");
    /* `destination-out` sẽ khoét cả nền và để lại lỗ trong suốt trong PNG. */
    expect(calls.join("|")).not.toContain("destination-out");
  });

  it("bật khung xương gợi ý thì có vẽ cung tròn cái đầu", () => {
    const arcs: unknown[][] = [];
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
      stroke() {}, fillRect() {}, arc(...a: unknown[]) { arcs.push(a); },
    } as unknown as CanvasRenderingContext2D;
    drawSketch(ctx, emptySketch(), { size: SKETCH_SIZE, guide: true });
    expect(arcs).toHaveLength(1);
  });
});

describe("đích vẽ — danh mục lấy READ-ONLY từ thư viện 42 element, không chép tay", () => {
  it("gồm dáng nhân vật + toàn bộ thư viện + ô tự gõ", () => {
    const lib = loadBundledV2().elements;
    const targets = sketchTargets();
    expect(targets).toHaveLength(lib.length + 2);
    expect(targets[0]?.id).toBe(MASCOT_POSE_TARGET);
    expect(targets[targets.length - 1]?.id).toBe(CUSTOM_TARGET);
    for (const e of lib) {
      expect(targets.some((t) => t.id === e.file), `thiếu element ${e.file}`).toBe(true);
    }
  });

  it("`optgroup` giữ đúng thứ tự danh mục — 'Nhân vật' luôn trên cùng", () => {
    const groups = targetGroups();
    expect(groups[0]?.group).toBe("Nhân vật");
    expect(groups.flatMap((g) => g.items)).toHaveLength(sketchTargets().length);
  });

  it("nhãn ảnh: element lấy tên VI của kho; ô tự gõ rỗng KHÔNG được ra nhãn rỗng", () => {
    expect(targetLabel(MASCOT_POSE_TARGET, "")).toBe("Dáng nhân vật (mascot)");
    expect(targetLabel(CUSTOM_TARGET, "  thanh máu  ")).toBe("thanh máu");
    expect(targetLabel(CUSTOM_TARGET, "   ")).toBe("món chưa đặt tên");
    const first = loadBundledV2().elements[0]!;
    expect(targetLabel(first.file, "")).toBe(first.vi);
  });
});

describe("dải ảnh — chung cho hai tab, phân biệt bằng nhãn loại", () => {
  it("ảnh mới lên ĐẦU và dải có trần", () => {
    let list = [makeShot("pose-3d", "Đứng chờ · Chính diện", "data:image/png;base64,a")];
    list = addShot(list, makeShot("sketch", "Nút đỏ (CTA)", "data:image/png;base64,b"));
    expect(list[0]?.kind).toBe("sketch");
    expect(list).toHaveLength(2);

    for (let i = 0; i < MAX_SHOTS + 5; i += 1) {
      list = addShot(list, makeShot("sketch", `x${i}`, "data:,"));
    }
    expect(list).toHaveLength(MAX_SHOTS);
  });

  it("id không trùng nhau kể cả chụp liên tiếp trong cùng một mili-giây", () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeShot("sketch", "a", "data:,").id));
    expect(ids.size).toBe(50);
  });

  it("tên file bỏ dấu tiếng Việt và mang tiền tố loại — đích đến là thư mục `refs/`", () => {
    expect(shotFileName(makeShot("pose-3d", "Đứng chờ · Chính diện", "d"))).toBe("pose-3d-dung-cho-chinh-dien.png");
    expect(shotFileName(makeShot("sketch", "Nút đỏ (CTA)", "d"))).toBe("sketch-nut-do-cta.png");
    /* Nhãn toàn ký tự lạ vẫn phải ra một tên file hợp lệ. */
    expect(shotFileName(makeShot("sketch", "!!!", "d"))).toBe("sketch-shot.png");
  });

  it("xoá một ảnh không đụng ảnh khác", () => {
    const a = makeShot("sketch", "a", "d");
    const b = makeShot("sketch", "b", "d");
    expect(removeShot([a, b], a.id)).toEqual([b]);
  });
});

describe("dây nối route + màn render được", () => {
  it("`/lab/pose-editor` có trong cây route", () => {
    expect(JSON.stringify(routeTree).replaceAll("\\/", "/")).toContain("/lab/pose-editor");
  });

  it("smoke: màn render ở môi trường KHÔNG có WebGL, và nói rõ mình là lab", () => {
    /* Ca này canh hai chốt cùng lúc (xem chú thích đầu file): cờ `mounted` và biên
       `React.lazy` quanh `PoseViewport`. Gỡ chốt nào thì `renderToString` cũng sẽ
       chạm `three`/WebGL và nổ ngay ở đây. */
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<PoseSketchLabScreen />);
    warn.mockRestore();

    expect(html).toContain("Lab demo");
    expect(html).toContain("Pose &amp; Sketch Lab");
    expect(html).toContain("Chọn dáng");
    expect(html).toContain("Chưa có ảnh nào");
    /* Ghi chú "đính vào đâu" là lời hứa của demo với người xem — mất nó thì demo
       chỉ còn là một món đồ chơi không nói được nó dùng để làm gì. */
    expect(html).toContain("referenced_image_paths");
  });
});
