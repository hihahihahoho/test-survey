/* @vitest-environment jsdom */
/**
 * CÁI NHỚ ẢNH XEM TRƯỚC — BỐN LUẬT, VÀ CẢ BỐN ĐỀU CÓ GIÁ BẰNG GPU.
 *
 * ╔══ VÌ SAO PHẢI CÓ CA CHO MỘT CÁI `Map` ═══════════════════════════════════╗
 * ║ Mỗi lượt trượt khỏi cái nhớ là một context WebGL được mở rồi đóng, và      ║
 * ║ trình duyệt chỉ cho ~16 context sống cùng lúc (xem `pose-renderer.ts`).    ║
 * ║ Một lỗi ở đây KHÔNG hiện ra thành màn hỏng: hộp chọn vẫn đúng ảnh, chỉ là  ║
 * ║ mỗi lần cuộn lại đốt GPU cho những tấm không đổi — thứ không cổng nào      ║
 * ║ khác trong repo này nhìn thấy được.                                       ║
 * ║ Ca thứ hai (`hasPoseSkeleton`) còn đắt hơn: `presetById` cố ý rơi về       ║
 * ║ `idle` với id lạ, nên bỏ cổng ấy đi là ô dáng ĐỂ TRỐNG và mọi chữ người    ║
 * ║ dùng tự gõ đều bày ra ảnh của «Đứng chờ» — NÓI DỐI người dùng.             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `renderPoseDataUrl` bị thay: jsdom không có WebGL, và ca ở đây nói về CÁI NHỚ
 * chứ không về nét vẽ — nét vẽ đã có ca riêng ở `pose.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderPoseDataUrl = vi.fn(
  (input: { view: string; size: number }) => `data:image/png;base64,${input.view}-${input.size}`,
);

vi.mock("../pose-renderer", () => ({ renderPoseDataUrl, POSE_FOV: 34 }));

import { POSES } from "@/features/kit-core/lib/poses";

import {
  hasPoseSkeleton,
  isCameraView,
  peekPoseThumb,
  poseThumb,
  poseThumbCount,
  poseThumbKey,
  POSE_THUMB_MAX,
  POSE_THUMB_SIZE,
  resetPoseThumbs,
  thumbPixelRatio,
} from "../pose-thumb";

const SHOT = { poseId: "wave", view: "three-quarter-left", size: POSE_THUMB_SIZE, dpr: 2 } as const;

beforeEach(() => {
  resetPoseThumbs();
  renderPoseDataUrl.mockClear();
});

describe("khoá nhớ", () => {
  it("① đổi BẤT KỲ thứ nào trong bốn thứ quyết định pixel ⇒ khoá khác", () => {
    const base = poseThumbKey(SHOT);
    expect(poseThumbKey({ ...SHOT, poseId: "jump" })).not.toBe(base);
    expect(poseThumbKey({ ...SHOT, view: "front" })).not.toBe(base);
    expect(poseThumbKey({ ...SHOT, size: 120 })).not.toBe(base);
    expect(poseThumbKey({ ...SHOT, dpr: 1 })).not.toBe(base);
    /* Và cùng bốn thứ ⇒ CÙNG khoá, nếu không thì cái nhớ không bao giờ trúng. */
    expect(poseThumbKey({ ...SHOT })).toBe(base);
  });

  it("② dpr bị kẹp về số nguyên 1…3 — một cửa sổ đang zoom không được sinh bộ khoá mới", () => {
    const dpr = thumbPixelRatio();
    expect(Number.isInteger(dpr)).toBe(true);
    expect(dpr).toBeGreaterThanOrEqual(1);
    expect(dpr).toBeLessThanOrEqual(3);
  });
});

describe("dáng nào vẽ được", () => {
  it("③ MỌI dáng trong danh mục đều có bảng góc khớp — không dòng nào còn bày ô xám", () => {
    /* Đây là cái chốt của cả đợt 18/09/2026. Thêm một dáng vào `POSES` mà quên
       bảng góc là dòng ấy hiện ra một ô trống trên màn người dùng, và không cổng
       nào khác trong repo nhìn thấy được. */
    const thieu = POSES.filter((pose) => !hasPoseSkeleton(pose.id)).map((pose) => pose.id);
    expect(thieu, `dáng chưa có bảng góc khớp: ${thieu.join(", ")}`).toEqual([]);
    expect(POSES).toHaveLength(19);
  });

  it("③b chữ tự gõ / ô để trống KHÔNG được mượn ảnh của «Đứng chờ»", async () => {
    expect(hasPoseSkeleton("wave")).toBe(true);
    expect(hasPoseSkeleton("")).toBe(false);
    expect(hasPoseSkeleton("dang-toi-tu-nghi-ra")).toBe(false);

    await expect(poseThumb({ ...SHOT, poseId: "dang-toi-tu-nghi-ra" })).resolves.toBeNull();
    expect(renderPoseDataUrl).not.toHaveBeenCalled();
  });

  it("④ góc máy lạ cũng không được rơi về «chính diện» — không hình còn hơn hình sai", async () => {
    expect(isCameraView("front")).toBe(true);
    expect(isCameraView("khong-co-goc-nay")).toBe(false);

    await expect(poseThumb({ ...SHOT, view: "khong-co-goc-nay" as never })).resolves.toBeNull();
    expect(renderPoseDataUrl).not.toHaveBeenCalled();
  });
});

describe("nhớ", () => {
  it("⑤ vẽ MỘT lần cho một khoá, mọi lần hỏi sau đọc lại cái nhớ", async () => {
    const first = await poseThumb(SHOT);
    const second = await poseThumb(SHOT);

    expect(first).toBe(second);
    expect(renderPoseDataUrl).toHaveBeenCalledTimes(1);
    /* Cạnh THẬT = cạnh CSS × dpr 2 (72 ⇒ 144) — ảnh dựng đúng cỡ CSS rồi phóng lên
       màn Retina là một manơcanh nhoè, mà nhìn ra dáng mới là cả điểm của tính năng. */
    expect(POSE_THUMB_SIZE).toBe(72);
    expect(renderPoseDataUrl.mock.calls[0]?.[0]?.size).toBe(POSE_THUMB_SIZE * 2);
  });

  it("⑥ hai lượt hỏi CÙNG LÚC gộp làm một — mở hộp hai nhịp không thành hai context WebGL", async () => {
    const [a, b] = await Promise.all([poseThumb(SHOT), poseThumb(SHOT)]);

    expect(a).toBe(b);
    expect(renderPoseDataUrl).toHaveBeenCalledTimes(1);
  });

  it("⑥b nhiều KHOÁ KHÁC NHAU hỏi cùng lúc ⇒ vẽ NỐI ĐUÔI, đúng thứ tự hỏi, và THỞ giữa hai tấm", async () => {
    /* `inflight` chỉ gộp những lượt CÙNG khoá — 20 dòng của một bản nháp thì mỗi
       dòng một khoá. Thứ giữ cho chúng không dính thành một cú đứng hình là hàng
       đợi một-làn, và nhịp `setTimeout` giữa hai lượt là thứ trả lại quyền vẽ cho
       trình duyệt. Cắm một `setTimeout` khác vào GIỮA hàng đợi: nếu hàng đợi có
       thở thật thì mốc ấy phải rơi vào giữa dãy, không phải sau chót. */
    const nhat: string[] = [];
    renderPoseDataUrl.mockImplementation((input: { view: string; size: number }) => {
      nhat.push(`ve-${input.size}`);
      return `data:image/png;base64,${input.view}-${input.size}`;
    });
    setTimeout(() => nhat.push("trinh-duyet-tho"), 0);

    const dang = ["wave", "cheer", "think", "bow", "fly", "dance"];
    await Promise.all(dang.map((poseId, at) => poseThumb({ ...SHOT, poseId, size: at + 1 })));

    expect(renderPoseDataUrl).toHaveBeenCalledTimes(6);
    /* Đúng thứ tự hỏi — hàng đợi không được xáo trộn, nếu không thì dòng #1 có
       thể là dòng cuối cùng có ảnh. Cạnh ghi trong dấu vết là cạnh THẬT
       (cạnh CSS × dpr 2), nên `size: at + 1` ra `ve-2`, `ve-4`, … */
    expect(nhat.filter((b) => b.startsWith("ve-"))).toEqual(dang.map((_, at) => `ve-${(at + 1) * 2}`));
    expect(nhat.indexOf("trinh-duyet-tho")).toBeLessThan(nhat.length - 1);
  });

  it("⑦ `peek` là ĐỒNG BỘ: trống trước khi vẽ, có ngay sau — đó là thứ giúp mở lại hộp không nháy ô trống", async () => {
    const key = poseThumbKey(SHOT);
    expect(peekPoseThumb(key)).toBeNull();

    const url = await poseThumb(SHOT);
    expect(peekPoseThumb(key)).toBe(url);
  });

  it("⑧ quá trần thì bỏ tấm CŨ NHẤT, và tấm vừa dùng lại không bị tính là cũ", async () => {
    /* Tấm #0 được hỏi lại giữa chừng ⇒ nó nhảy về cuối hàng và phải sống sót,
       trong khi tấm #1 — không ai đụng tới — là tấm bị bỏ. */
    await poseThumb({ ...SHOT, size: 0 });
    await poseThumb({ ...SHOT, size: 1 });
    for (let n = 2; n <= POSE_THUMB_MAX; n += 1) {
      await poseThumb({ ...SHOT, size: n });
      if (n === POSE_THUMB_MAX / 2) await poseThumb({ ...SHOT, size: 0 });
    }

    expect(poseThumbCount()).toBe(POSE_THUMB_MAX);
    expect(peekPoseThumb(poseThumbKey({ ...SHOT, size: 0 }))).not.toBeNull();
    expect(peekPoseThumb(poseThumbKey({ ...SHOT, size: 1 }))).toBeNull();
  });
});
