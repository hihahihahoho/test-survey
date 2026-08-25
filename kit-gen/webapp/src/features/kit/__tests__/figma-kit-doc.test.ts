/**
 * figma-kit-doc.test.ts — NÚT HEADER "COPY SANG FIGMA": LƯỚI NODE, KHÔNG RESAMPLE.
 *
 * ╔══ BA CÂU HỎI TEST NÀY PHẢI TRẢ ĐƯỢC BẰNG SỐ ══════════════════════════════╗
 * ║ ① Mỗi ô ra ĐÚNG MỘT node hay vẫn nhân đôi? (#42 phát mỗi ô hai bản ghi)    ║
 * ║ ② Tỉ lệ xuất có làm MẤT PIXEL không? — câu hỏi trung tâm của bệnh "mờ tịt".║
 * ║ ③ Payload của một kit thật to bao nhiêu, chia mấy đợt?                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture là `kits/manifest.json` THẬT của `blindtest-a-trung-thu-candy` — dùng
 * chung với `kit-core/lib/__tests__/figma-node.test.ts`, nơi 6 ô đó đã được đo
 * lại trên đĩa bằng header PNG (`tight/x.png ≡ content`, `x.png ≡ canvas`, 6/6 khớp).
 * Số bịa sẽ đi qua cả công thức sai; số thật thì không.
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types/api";
import type { KitFile } from "@/lib/types";
import {
  BASE64_FACTOR, CLIPBOARD_SOFT_MAX, batchGroups, cellsOf, estimateBytes, packKitDoc, preferTight,
} from "../lib/figma-kit-doc";
import { packBoard } from "../lib/figma-board";
import { exportSize } from "../lib/export-scale";
import manifest from "@/features/kit-core/lib/__tests__/fixtures/kit-blindtest-a.manifest.json";

type Asset = {
  file: string; sheet: string;
  canvas: number[]; cell: number[]; bleed: number[];
  content: number[]; content_at: number[]; safe: number[];
};
const assets = manifest.styles.chinh.assets as Asset[];

/** Dựng lại đúng phép biến đổi của `agent/routes/files.mjs`: MỖI file một bản ghi. */
function kitFile(a: Asset, tight: boolean, bytes = 200_000): KitFile {
  const bare = a.file.replace(/\.png$/, "");
  const [w, h] = tight ? a.content : a.canvas;
  return kitFileSchema.parse({
    file: tight ? `tight/${bare}` : bare,
    path: `kits/chinh/${tight ? "tight/" : ""}${a.file}`,
    w, h, bytes, sheet: a.sheet, cellIndex: null,
    safe: a.safe, contentAt: a.content_at, content: a.content,
    canvas: a.canvas, cell: a.cell, bleed: a.bleed,
  });
}

/** Kit như #42 thật sự trả: cả bản canvas LẪN bản `tight/` của từng ô. */
const KIT: KitFile[] = assets.flatMap((a) => [kitFile(a, false), kitFile(a, true)]);
const POSE = new Set(KIT.filter((f) => /pose/.test(f.file)).map((f) => f.file));

describe("① mỗi ô đúng MỘT node — #42 phát hai bản ghi cho cùng một ô", () => {
  it("bảng cũ lấy nguyên kit.files ⇒ mỗi ô hiện HAI LẦN (bệnh đang chữa)", () => {
    expect(KIT).toHaveLength(12);
    expect(packBoard(KIT, POSE).cells).toHaveLength(12); // ← đường bitmap cũ, 6 ô × 2
  });

  it("`preferTight` giữ đúng 6 ô, và luôn là bản ôm sát", () => {
    const kept = preferTight(KIT);
    expect(kept).toHaveLength(6);
    expect(kept.every((f) => f.file.startsWith("tight/"))).toBe(true);
  });

  it("lưới node cũng 6 ô, không nhân đôi", () => {
    expect(cellsOf(packKitDoc(KIT, POSE).groups)).toHaveLength(6);
  });
});

describe("② TỈ LỆ XUẤT LÀ CỠ NODE, KHÔNG PHẢI CỠ ẢNH — gốc của bệnh «mờ tịt»", () => {
  /**
   * `figma-board.ts:228` vẽ `drawImage(bmp, x, y, cell.w, cell.h)` với `cell.w/h` =
   * `exportSize()` ⇒ ảnh bị RESAMPLE xuống 50% rồi bake vào một PNG phẳng. Pixel mất
   * thật; kéo to lại trong Figma không lấy về được. Ca này khoá con số đó lại để không
   * ai "tối ưu" đường node về lại lối cũ.
   */
  it("đường bitmap cũ THẬT SỰ thu ảnh nền 1024×1524 xuống 512×762", () => {
    const bg = kitFile(assets.find((a) => a.file === "25-bg-home.png")!, true);
    const size = exportSize(bg, POSE);
    expect([bg.w, bg.h]).toEqual([1024, 1524]);
    expect([size.w, size.h]).toEqual([512, 762]); // ← cỡ mà canvas vẽ ra = cỡ pixel còn lại
  });

  it("đường node: cỡ NODE thu 50%, nhưng ảnh nhúng vẫn là PNG gốc 1024×1524", () => {
    const cell = cellsOf(packKitDoc(KIT, POSE).groups).find((c) => c.name === "25-bg-home")!;
    expect(cell.spec.scale).toBe(0.5);
    // node = safe × scale (hitbox), ảnh = content × scale — CSS px, không phải pixel ảnh.
    expect(cell.spec.frame).toEqual({ w: 512, h: 768 });
    expect(cell.spec.image).toEqual({ x: 0, y: 6, w: 512, h: 762 });
    /* ĐIỀU KHOÁ Ở ĐÂY: chia ngược cỡ node cho `scale` phải ra ĐÚNG cỡ pixel của file
       trên đĩa. Nghĩa là node chỉ HIỂN THỊ nhỏ đi; blob nhúng vào payload là
       `res.blob()` nguyên vẹn (`figma-h2d.global.js:248-259` không đi qua canvas nào).
       Ca e2e `figma-kit-doc-payload.spec.ts` kiểm nốt nửa còn lại trong Chromium thật. */
    expect(cell.spec.image.w / cell.spec.scale).toBe(cell.file.w);
    expect(cell.spec.image.h / cell.spec.scale).toBe(cell.file.h);
  });

  it("mọi ô đều giữ đúng luật đó, kể cả mascot 1:1", () => {
    for (const cell of cellsOf(packKitDoc(KIT, POSE).groups)) {
      expect(cell.spec.image.w / cell.spec.scale).toBe(cell.file.w);
      expect(cell.spec.image.h / cell.spec.scale).toBe(cell.file.h);
      expect(cell.spec.clipsContent).toBe(false);
    }
    const pose = cellsOf(packKitDoc(KIT, POSE).groups).find((c) => c.name === "01-pose-idle")!;
    expect(pose.spec.scale).toBe(1);
    expect(pose.spec.frame).toEqual({ w: 230, h: 435 });
  });
});

describe("lưới xếp theo nhóm, không ô nào chồng ô nào", () => {
  const layout = packKitDoc(KIT, POSE);

  it("nhóm đi đúng thứ tự cuộn của trang «Ảnh đã tạo»", () => {
    expect(layout.groups.map((g) => g.category)).toEqual(["mascot", "background", "popup", "prop"]);
    expect(layout.groups.map((g) => g.label)).toEqual(["Mascot pose", "Nền", "Popup", "Đạo cụ"]);
  });

  it("hai ô bất kỳ không đè lên nhau", () => {
    const cells = cellsOf(layout.groups);
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]!;
        const b = cells[j]!;
        const apart =
          a.left + a.spec.frame.w <= b.left || b.left + b.spec.frame.w <= a.left
          || a.top + a.spec.frame.h <= b.top || b.top + b.spec.frame.h <= a.top;
        expect(apart, `«${a.name}» đè «${b.name}»`).toBe(true);
      }
    }
  });

  it("ô thiếu safe zone bị bỏ qua KÈM LÝ DO, không âm thầm biến mất", () => {
    const old = kitFileSchema.parse({ file: "01-btn", path: "kits/chinh/01-btn.png", w: 10, h: 10, sheet: "ui" });
    const out = packKitDoc([...KIT, old], POSE);
    expect(cellsOf(out.groups)).toHaveLength(6);
    expect(out.skipped).toHaveLength(1);
    expect(out.skipped[0]!.name).toBe("01-btn");
    expect(out.skipped[0]!.reason).toMatch(/safe zone/);
  });
});

describe("③ cỡ payload và phép chia đợt", () => {
  it("ước lượng theo hệ số base64 HAI LẦN (1.80× đo thật), chỉ tính bản đã lọc", () => {
    const kept = preferTight(KIT);
    expect(estimateBytes(kept)).toBeGreaterThan(6 * 200_000 * BASE64_FACTOR);
    // Bản canvas KHÔNG được tính vào — nó không đi vào payload nữa.
    expect(estimateBytes(kept)).toBeLessThan(estimateBytes(KIT));
  });

  it("kit vừa trần ⇒ MỘT đợt", () => {
    expect(batchGroups(packKitDoc(KIT, POSE).groups)).toHaveLength(1);
  });

  it("kit quá trần ⇒ chia theo NHÓM, không cắt giữa nhóm", () => {
    const groups = packKitDoc(KIT, POSE).groups;
    const batches = batchGroups(groups, 1); // trần 1 byte ⇒ ép mỗi nhóm một đợt
    expect(batches).toHaveLength(groups.length);
    expect(batches.every((b) => b.length === 1)).toBe(true);
    // Không đợt nào làm mất ô: tổng ô của các đợt = tổng ô của lưới.
    expect(batches.flatMap(cellsOf)).toHaveLength(cellsOf(groups).length);
  });

  /* Đo thật trên `kits/ipay/tight/` (80 file, 13.0 MB PNG): payload 23.3 MB. Trần
     phải cao hơn con số ĐÃ ĐO, nếu không thì kit lớn nhất của repo cũng bị chia đợt. */
  it("trần mềm đủ chỗ cho kit to nhất trong repo (`ipay`, 80 ô, 23.3 MB đo được)", () => {
    expect(CLIPBOARD_SOFT_MAX).toBeGreaterThan(23.3 * 1024 * 1024);
    const ipayLike = Array.from({ length: 80 }, (_, i) =>
      kitFileSchema.parse({ file: `tight/x${i}`, path: `p${i}`, w: 1, h: 1, bytes: 13.0e6 / 80 }));
    expect(estimateBytes(ipayLike)).toBeLessThan(CLIPBOARD_SOFT_MAX);
  });
});
