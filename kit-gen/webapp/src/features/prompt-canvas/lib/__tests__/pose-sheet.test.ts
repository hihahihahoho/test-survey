import { describe, expect, it } from "vitest";

import { engineGeometry, readRepo as read } from "@/__tests__/engine-geometry";
import { CANVAS_SQUARE } from "@/features/kit-core/lib/geometry";
import { POSE_RENDER_VERSION, cellBoxes, composePoseSheet, fitBox } from "../pose-sheet";
import { poseSheetKey } from "../composer-to-contract";
import { newMascotPose, type MascotBlock } from "@/features/prompt-lab/lib/composer-model";
import { mascotDoc } from "@/features/prompt-lab/lib/doc-templates";

/**
 * pose-sheet.test.ts — TẤM ẢNH DÁNG PHẢI CHỒNG KHÍT LÊN TẤM SẼ VẼ.
 *
 * ╔══ VÌ SAO CA NÀY NẠP ENGINE THẬT ═════════════════════════════════════════╗
 * ║ `composePoseSheet` hứa một điều rất hẹp với engine: "ô k của tấm manơ-    ║
 * ║ canh là dáng của ô k ở đây". Lời hứa ấy chỉ đúng khi toạ độ ô của tấm     ║
 * ║ ghép bằng ĐÚNG toạ độ mà engine dùng — engine tính chúng ở `geometry.mjs`.║
 * ║ Lệch một pixel thì không có gì báo: prompt vẫn hợp lệ, ảnh vẫn đính, model ║
 * ║ vẫn vẽ — chỉ là nó chép dáng của ô bên cạnh.                              ║
 * ║ Nên ca này KHÔNG so với một bảng số tôi gõ tay: nó GỌI `geometry.mjs` thật ║
 * ║ và so từng ô. Một bảng gõ tay chỉ khoá được trí nhớ của tôi lúc viết.     ║
 * ║                                                                           ║
 * ║ 16/09/2026 — trước đó ca này `execFileSync("python3", …)` để chạy         ║
 * ║ `geometry.py`. Engine nay là JS, nên lượt gọi ấy là một phụ thuộc mà SẢN  ║
 * ║ PHẨM KHÔNG CÒN CÓ: cùng những con số, không cần python trên máy ai cả.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/** Gọi thẳng `geometry.mjs` — cùng module mà `prompt.mjs` và `slice.mjs` cùng import. */
async function engineBoxes(
  cols: number,
  rows: number,
  count: number,
): Promise<{ x: number; y: number; w: number; h: number }[]> {
  const geo = await engineGeometry();
  const W = CANVAS_SQUARE.w;
  const H = CANVAS_SQUARE.w;
  const [w, h] = geo.cell_size(W, H, cols, rows);
  return Array.from({ length: count }, (_, i) => {
    const [x, y] = geo.cell_origin(W, H, cols, rows, i);
    return { x, y, w, h };
  });
}

describe("toạ độ ô của tấm ảnh dáng = toạ độ của engine, không phải một phép chia thứ hai", () => {
  it("`geometry.mjs` vẫn là nơi DUY NHẤT giữ phép chia ấy", async () => {
    const geo = await engineGeometry();
    expect(typeof geo.cell_size).toBe("function");
    expect(typeof geo.cell_origin).toBe("function");
    /* Làm tròn TỪ TOẠ ĐỘ THẬT, không cộng dồn `col * cw` — đó là chi tiết mà
       `cellBoxes` phải chép đúng, và cũng là chi tiết dễ bị viết lại cho "gọn".
       Ô vuông 1254 chia 4 = 313,5 nên HAI PHÉP ẤY RA HAI SỐ KHÁC NHAU, đo được:
       cộng dồn cho ô cột 3 ra 3×314 = 942, làm tròn từ toạ độ thật ra 940 (940,5
       làm tròn về số CHẴN kiểu Python). Số 940 mới là số dao cắt dùng. */
    expect(geo.cell_size(1254, 1254, 4, 4)).toEqual([314, 314]);
    expect(geo.cell_origin(1254, 1254, 4, 4, 2)[0]).toBe(627);
    expect(geo.cell_origin(1254, 1254, 4, 4, 3)[0]).toBe(940);
  });

  it.each([
    [1, 1, 1],
    [2, 2, 4],
    [3, 3, 9],
    [4, 4, 16],
    /* Lưới KHÔNG chia hết 1254 — chính là ca mà phép cộng dồn sẽ trượt ở ô cuối. */
    [3, 3, 7],
    [4, 3, 11],
  ])("lưới %ix%i, %i ô: từng ô khớp `geometry.mjs`", async (cols, rows, count) => {
    expect(cellBoxes(cols, rows, count)).toEqual(await engineBoxes(cols, rows, count));
  });

  /**
   * Ô CUỐI ĐƯỢC PHÉP THÒ RA MỘT PIXEL, và đó là hành vi của engine chứ không phải
   * lỗi của tấm ghép: `cell_size` làm tròn LÊN (1254/5 = 250,8 ⇒ 251) trong khi
   * `cell_origin` của ô cuối làm tròn từ toạ độ thật. Canvas HTML tự cắt phần thừa,
   * y như `slice.mjs` kẹp hộp về trong ảnh. Khoá số 1 ở đây để ai đó đổi phép làm
   * tròn thì thấy ngay — chứ không phải để đòi nó bằng 0.
   */
  it("ô cuối cùng không thò ra quá một pixel — cùng sai số làm tròn với engine", () => {
    for (const [cols, rows] of [
      [3, 3],
      [4, 4],
      [5, 5],
    ] as const) {
      for (const box of cellBoxes(cols, rows, cols * rows)) {
        expect(box.x + box.w).toBeLessThanOrEqual(CANVAS_SQUARE.w + 1);
        expect(box.y + box.h).toBeLessThanOrEqual(CANVAS_SQUARE.w + 1);
      }
    }
  });
});

describe("ảnh manơcanh vào ô: vừa khít, KHÔNG méo", () => {
  it("ảnh vuông vào ô chữ nhật ⇒ giữ tỉ lệ, canh giữa", () => {
    const fit = fitBox({ x: 100, y: 200, w: 400, h: 200 }, 512, 512);
    expect(fit).toEqual({ x: 200, y: 200, w: 200, h: 200 });
  });

  it("ảnh hỏng (kích thước 0) ⇒ trả về nguyên ô, không sinh NaN", () => {
    const box = { x: 0, y: 0, w: 300, h: 300 };
    expect(fitBox(box, 0, 0)).toEqual(box);
  });
});

/**
 * ══ NỀN CỦA TẤM GHÉP: TRỐNG, KHÔNG PHẢI TRẮNG ═════════════════════════════
 *
 * Bản trước tô kín tấm bằng `#ffffff` trước khi vẽ manơcanh. PNG vẫn là RGBA nên
 * nhìn qua thì "có alpha", nhưng alpha = 255 ở TOÀN BỘ tấm — đo trên
 * `refs/char-pose-sheet-*.png` của một dự án thật: 0 pixel nào có alpha 0. Máy vẽ
 * ảnh bắt chước ảnh tham chiếu ở mọi tầng, kể cả tầng nền, nên tấm nhân vật nó trả
 * về cũng đục kín và rơi thẳng vào cổng alpha của `gen.mjs`.
 *
 * Môi trường `node` không có canvas thật (không cài `node-canvas`), nên ca này dựng
 * một canvas GIẢ mang MỘT mảng alpha thật: canvas thật vừa tạo có alpha 0 khắp nơi,
 * và trong cả file chỉ có `fillRect` là phép nâng được alpha của vùng chưa vẽ gì lên
 * 255. Đo pixel bốn góc trên mảng ấy trả lời đúng câu cần hỏi — "tấm gửi đi có nền
 * đặc không" — mà không phải chép lại một bộ dựng ảnh.
 */
interface FakeCanvas {
  alpha: Uint8Array;
  ops: string[];
  document: { createElement: (tag: string) => unknown };
}

function fakeCanvasDoc(size: number): FakeCanvas {
  const alpha = new Uint8Array(size * size);
  const ops: string[] = [];
  const ctx = {
    fillStyle: "",
    fillRect(x: number, y: number, w: number, h: number) {
      ops.push(`fillRect(${x},${y},${w},${h})`);
      for (let py = Math.max(0, y); py < Math.min(size, y + h); py += 1) {
        for (let px = Math.max(0, x); px < Math.min(size, x + w); px += 1) alpha[py * size + px] = 255;
      }
    },
    drawImage() {
      ops.push("drawImage");
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => "data:image/png;base64,GIA",
  };
  return { alpha, ops, document: { createElement: () => canvas } };
}

describe("tấm ảnh dáng gửi máy vẽ có NỀN TRỐNG", () => {
  it("không tô nền: pixel bốn góc giữ alpha 0", async () => {
    const size = 64;
    const fake = fakeCanvasDoc(size);
    const holder = globalThis as unknown as { document?: unknown };
    const before = holder.document;
    holder.document = fake.document;
    try {
      /* Ô rỗng = "dòng này không dựng được ảnh". Đúng ca cần đo: nếu tấm vẫn có nền
         thì nền ấy KHÔNG đến từ ảnh manơcanh nào cả. */
      await composePoseSheet(["", "", "", ""], 2, 2, size);
    } finally {
      if (before === undefined) delete holder.document;
      else holder.document = before;
    }
    for (const i of [0, size - 1, (size - 1) * size, size * size - 1]) {
      expect(fake.alpha[i], `pixel góc chỉ số ${i} bị tô`).toBe(0);
    }
    expect(fake.ops.filter((op) => op.startsWith("fillRect"))).toEqual([]);
  });

  it("mã nguồn không còn màu nền nào để mà tô", () => {
    const src = read("webapp/src/features/prompt-canvas/lib/pose-sheet.ts");
    expect(src).not.toContain("fillRect");
    expect(src).not.toContain("#ffffff");
  });

  /* Ảnh dáng LẺ (768², `capturePoseRef`) đi cùng một đường và cùng một lý do — nó
     được ghi vào `refs/` của dự án. Nền của nó do `pose-renderer.ts` quyết; ca khoá
     nằm ở `prompt-lab/lib/__tests__/pose.test.ts`. */
  it("bộ dựng ảnh dáng lẻ cũng để nền trống", () => {
    const src = read("webapp/src/features/prompt-lab/lib/pose/pose-renderer.ts");
    expect(src).toContain("alpha: true");
    expect(src).toContain("setClearColor(0x000000, 0)");
  });
});

function mascotBlock(id: string, poses = [newMascotPose("idle")]): MascotBlock {
  return { id, kind: "mascot", mode: "template", doc: mascotDoc(), poses };
}

describe("poseSheetKey — đời bộ dựng nằm trong vân tay", () => {
  /* Bỏ nền trắng xong mà dự án thật vẫn đính tấm nền trắng của hôm trước: vân tay
     cũ chỉ gồm lưới + cặp dáng/góc nên đường nhanh của `ensurePoseRefs` không bao
     giờ chụp lại. Ca này khoá: đổi đời bộ dựng ⇒ vân tay đổi ⇒ tấm cũ bị coi là cũ. */
  it("vân tay mở đầu bằng đời bộ dựng hiện tại, và đời ấy đã qua nền trắng", () => {
    const block = mascotBlock("m1");
    expect(POSE_RENDER_VERSION).toBeGreaterThanOrEqual(2);
    expect(poseSheetKey(block).startsWith(`r${POSE_RENDER_VERSION};`)).toBe(true);
  });

  it("tấm ghép lưu với vân tay đời cũ (không có đời) không còn được coi là tươi", () => {
    const block = mascotBlock("m1");
    const cu = poseSheetKey(block).replace(/^r\d+;/, "");
    expect(cu).not.toBe(poseSheetKey(block));
  });
});
