/**
 * resolve-scene.test.ts — SỐ HỌC MÀN DEMO, KIỂM BẰNG BỐN KIT THẬT.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG SỐ BỊA (cùng lý do `figma-node.test.ts:1-18`) ════════╗
 * ║ Cả lớp lỗi ở đây là "lệch vài chục pixel mà không có gì báo". Một fixture   ║
 * ║ đối xứng (safe = content, offset 0) sẽ ĐI QUA cả những công thức bỏ hẳn     ║
 * ║ `contentAt` hoặc nhầm thân với ảnh. Fixture ở đây là `kits/manifest.json`   ║
 * ║ THẬT của bốn phong cách trong workspace dev (`ipay`/`candy`/`tet`/`rnd`),   ║
 * ║ lọc còn những ô mà spec màn demo có thể trỏ tới + toàn bộ ô mascot.         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * PHÁT HIỆN ĐỨNG SAU QUY ƯỚC ĐƠN VỊ "THÂN", đo ngay trên fixture này (ca cuối):
 * `safe` của cùng một ô GIỐNG HỆT NHAU ở cả bốn kit, còn `content` thì mỗi kit một
 * khác. Spec viết theo thân ⇒ một bản dùng cho mọi kit.
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types/api";
import type { KitFile } from "@/lib/types";
import { DEMO_SCREENS, screenSpecById } from "../data/screens.default";
import {
  charactersOf, indexKitFiles, resolveScene, sceneImageCount, sceneIsUsable,
} from "../lib/resolve-scene";
import type { ScreenSpec } from "../lib/screen-spec";
import manifest from "./fixtures/kits-4.manifest.json";

/* ── Dựng lại ĐÚNG thứ #42 `GET /api/projects/:id/kit` trả về ────────────────
   `agent/routes/files.mjs:76-98` phát MỘT bản ghi cho MỖI file trên đĩa, dùng chung
   meta của ô ⇒ mỗi ô có hai bản: canvas và `tight/`. Dựng cả hai để test luôn được
   luật "ưu tiên bản tight/" của `indexKitFiles`. */
type Asset = {
  file: string; sheet?: string;
  canvas: number[]; cell: number[]; bleed: number[];
  content: number[]; content_at: number[]; safe: number[];
};
type KitId = "ipay" | "candy" | "tet" | "rnd";
const KITS: readonly KitId[] = ["ipay", "candy", "tet", "rnd"];
const styles = manifest.styles as Record<KitId, { assets: Asset[] }>;

function kitFile(a: Asset, tight: boolean): KitFile {
  const bare = a.file.replace(/\.png$/, "");
  const [w, h] = tight ? a.content : a.canvas;
  return kitFileSchema.parse({
    file: tight ? `tight/${bare}` : bare,
    path: `kits/chinh/${tight ? "tight/" : ""}${a.file}`,
    w, h, bytes: 1234, sheet: a.sheet ?? "main", cellIndex: null,
    safe: a.safe, contentAt: a.content_at, content: a.content,
    canvas: a.canvas, cell: a.cell, bleed: a.bleed,
  });
}

/** Cả hai bản của mọi ô — giống hệt dữ liệu app nhận được. */
function filesOf(kit: KitId): KitFile[] {
  return styles[kit].assets.flatMap((a) => [kitFile(a, false), kitFile(a, true)]);
}

function assetOf(kit: KitId, bare: string): Asset {
  const hit = styles[kit].assets.find((a) => a.file === `${bare}.png`);
  if (hit === undefined) throw new Error(`fixture thiếu ô ${bare} trong kit ${kit}`);
  return hit;
}

const HOME = screenSpecById("home")!;
const layerOf = (scene: ReturnType<typeof resolveScene>, name: string) => {
  const hit = scene.layers.find((l) => l.name === name);
  if (hit === undefined) throw new Error(`màn không dựng ô ${name}`);
  return hit;
};

describe("màn Home dựng đúng số trên kit thật", () => {
  const scene = resolveScene(HOME, filesOf("ipay"), { char: "taxi" });

  /**
   * Ca TÍNH TAY, đối chiếu từng bước với manifest `ipay`:
   *   safe [111,123,300,102] · content [248,110] · content_at [137,120]
   *   tỉ lệ xuất UI = 0.5              ⇒ frame 150×51, ảnh (13, −1.5) 124×55
   *   spec ép thân 300px ⇒ k = 300/150 ⇒ frame 300×102, ảnh (26, −3) 248×110
   *   tâm (50%, 91%) của khung 400×600 ⇒ left = 200 − 150, top = 546 − 51
   * Ảnh vẫn LỆCH ÂM trên trục y: trang trí tràn lên trên hitbox — đúng thứ hợp đồng
   * §3.3 nói tới, và là bằng chứng công thức KHÔNG bỏ rơi `contentAt`.
   */
  it("nút chơi: frame = thân đã ép cỡ, ảnh lệch theo contentAt", () => {
    expect(layerOf(scene, "01-btn-pill-red")).toMatchObject({
      name: "01-btn-pill-red",
      path: "kits/chinh/tight/01-btn-pill-red.png",
      left: 50,
      top: 495,
      frame: { w: 300, h: 102 },
      image: { x: 26, y: -3, w: 248, h: 110 },
      text: { value: "CHƠI NGAY", size: 19 },
    });
  });

  /**
   * NỀN KHÔNG đi qua safe-frame mà qua phép "cover" tự tính (xem `resolveBackground`).
   * `25-bg-home` của ipay là 1024×1536 — đúng tỉ lệ 2:3 của khung 400×600 ⇒ phủ khít,
   * không lệch. Kit `rnd` (1024×1508) thì lệch — ca dưới đo chính chỗ đó.
   */
  it("nền phủ kín khung bằng phép cover tính sẵn, không nhờ object-fit", () => {
    expect(scene.background).toEqual({
      name: "25-bg-home",
      path: "kits/chinh/tight/25-bg-home.png",
      left: 0, top: 0, w: 400, h: 600,
    });
  });

  it("nền lệch tỉ lệ thì tràn cân hai bên rồi để khung màn cắt", () => {
    const bg = resolveScene(HOME, filesOf("rnd")).background!;
    // rnd: 1024×1508 ⇒ cover = 600/1508 ⇒ rộng 407.4 > 400, tràn đều 3.7px mỗi bên.
    expect(bg.h).toBeCloseTo(600, 4);
    expect(bg.w).toBeCloseTo(407.43, 2);
    expect(bg.left).toBeCloseTo(-3.71, 2);
    expect(bg.top).toBe(0);
  });

  /**
   * Mascot xuất 1:1 còn UI 50% (`export-scale.ts`), nhưng spec ép thân cao 225px thì
   * thân PHẢI cao đúng 225px trên màn — tỉ lệ xuất bị hệ số ép cỡ triệt tiêu. Đây là
   * chỗ bản này lệch có chủ ý với công thức `bw / safe.w` của thiết kế §5.2, xem
   * chú thích `fitScale`.
   */
  it("ép cỡ thân thắng tỉ lệ xuất, cả với mascot 1:1", () => {
    const pose = layerOf(scene, "pose-taxi-wave");
    const a = assetOf("ipay", "pose-taxi-wave");
    expect(pose.frame.h).toBeCloseTo(225, 10);
    expect(pose.frame.w).toBeCloseTo(225 * (a.safe[2]! / a.safe[3]!), 4);
    expect(pose.top).toBeCloseTo(0.57 * 600 - 225 / 2, 4);
    // ảnh cao hơn thân đúng tỉ lệ content/safe — không bị co về vừa khung
    expect(pose.image.h).toBeCloseTo(225 * (a.content[1]! / a.safe[3]!), 4);
  });

  it("ô UI không ép cỡ thì rơi về thân × tỉ lệ xuất", () => {
    const spec: ScreenSpec = { ...HOME, nodes: [{ file: "01-btn-pill-red", x: 50, y: 50 }] };
    const one = resolveScene(spec, filesOf("ipay"));
    expect(one.layers[0]!.frame).toEqual({ w: 150, h: 51 });
  });

  it("mọi ô của màn Home dựng được trên ipay, không thiếu ô nào", () => {
    expect(scene.missing).toEqual([]);
    expect(scene.broken).toEqual([]);
    expect(scene.layers.map((l) => l.name)).toEqual([
      "50-counter-pill", "04-btn-circle", "10-popup-ribbon", "pose-taxi-wave",
      "07-progress-track", "08-progress-fill", "01-btn-pill-red",
    ]);
    expect(sceneImageCount(scene)).toBe(8);
    expect(sceneIsUsable(scene)).toBe(true);
  });

  it("mọi frame nằm trong khung màn (không có ô văng ra ngoài)", () => {
    for (const l of scene.layers) {
      expect(l.left).toBeGreaterThanOrEqual(0);
      expect(l.top).toBeGreaterThanOrEqual(0);
      expect(l.left + l.frame.w).toBeLessThanOrEqual(400);
      expect(l.top + l.frame.h).toBeLessThanOrEqual(600);
    }
  });
});

describe("ô mascot: tên file KHÔNG thống nhất giữa các kit", () => {
  /* ĐO trên fixture, không phải giả định: hai lối đặt tên cùng tồn tại — dạng có tên
     nhân vật `pose-<char>-<dáng>` và dạng đánh số `NN-pose-<dáng>`; `candy` chỉ có
     dạng thứ hai. Prototype `screens.html:151` chỉ biết dạng thứ nhất, nên nó không
     dựng nổi mascot cho `candy`. */
  it("mỗi kit khai một kiểu nhân vật khác nhau, có kit không khai gì", () => {
    expect(charactersOf(filesOf("ipay"))).toEqual(["soc", "taxi"]);
    expect(charactersOf(filesOf("tet"))).toEqual(["lan"]);
    expect(charactersOf(filesOf("rnd"))).toEqual(["soc"]);
    expect(charactersOf(filesOf("candy"))).toEqual([]);
  });

  it("chọn đúng nhân vật khi kit có nhiều nhân vật", () => {
    expect(layerOf(resolveScene(HOME, filesOf("ipay"), { char: "soc" }), "pose-soc-wave")).toBeTruthy();
    expect(layerOf(resolveScene(HOME, filesOf("ipay"), { char: "taxi" }), "pose-taxi-wave")).toBeTruthy();
  });

  it("không biết nhân vật vẫn tìm ra dáng, ở CẢ HAI lối đặt tên", () => {
    for (const kit of ["candy", "tet", "rnd"] as const) {
      const scene = resolveScene(HOME, filesOf(kit));
      expect(layerOf(scene, "28-pose-wave").frame.h).toBeCloseTo(225, 10);
      expect(scene.missing).toEqual([]);
    }
    // ipay không có ô `NN-pose-*` nào ⇒ phải rơi trúng dạng `pose-<char>-<dáng>`
    expect(layerOf(resolveScene(HOME, filesOf("ipay")), "pose-soc-wave")).toBeTruthy();
  });
});

describe("thiếu ô thì nói ra, không im lặng và không vẽ placeholder", () => {
  const without = (kit: KitId, drop: readonly string[]) =>
    filesOf(kit).filter((f) => !drop.some((d) => f.file.endsWith(d)));

  it("thiếu ô lẻ ⇒ bỏ node đó, màn vẫn dựng, tên ô vào missing[]", () => {
    const scene = resolveScene(HOME, without("ipay", ["04-btn-circle", "08-progress-fill"]));
    expect(scene.missing).toEqual(["04-btn-circle", "08-progress-fill"]);
    expect(scene.layers).toHaveLength(5);
    expect(sceneIsUsable(scene)).toBe(true);
  });

  it("thiếu dáng mascot ⇒ báo theo tên dáng, không phải tên file", () => {
    const noPose = filesOf("ipay").filter((f) => !f.file.includes("-wave"));
    expect(resolveScene(HOME, noPose, { char: "taxi" }).missing).toEqual(["pose-taxi-wave"]);
  });

  it("thiếu NỀN ⇒ màn không dùng được (không dán một khung trống ra Figma)", () => {
    const scene = resolveScene(HOME, without("ipay", ["25-bg-home"]));
    expect(scene.background).toBeNull();
    expect(scene.missing).toContain("25-bg-home");
    expect(sceneIsUsable(scene)).toBe(false);
  });

  it("manifest tả sai hình học ⇒ vào broken[] kèm lý do, không ném ra ngoài", () => {
    const files = filesOf("ipay").map((f) =>
      f.file === "tight/01-btn-pill-red" ? { ...f, w: 999, h: 999 } : f);
    const scene = resolveScene(HOME, files);
    expect(scene.broken).toHaveLength(1);
    expect(scene.broken[0]!.file).toBe("01-btn-pill-red");
    expect(scene.broken[0]!.reason).toContain("999×999");
    expect(scene.layers.map((l) => l.name)).not.toContain("01-btn-pill-red");
  });
});

describe("chỉ mục ô", () => {
  it("ưu tiên bản tight/ khi ô có cả hai bản", () => {
    const index = indexKitFiles(filesOf("ipay"));
    expect(index.get("01-btn-pill-red")!.file).toBe("tight/01-btn-pill-red");
    expect(index.size).toBe(styles.ipay.assets.length);
  });

  it("bỏ qua ô rỗng (`empty:true`) — file 0 byte không dán được", () => {
    const files = filesOf("ipay").map((f) =>
      f.file.endsWith("04-btn-circle") ? { ...f, empty: true } : f);
    expect(resolveScene(HOME, files).missing).toEqual(["04-btn-circle"]);
  });
});

describe("spec dùng lại được cho mọi kit vì đơn vị là THÂN", () => {
  /**
   * BẰNG CHỨNG CỦA QUY ƯỚC, đo chứ không tin lời: trên bảy ô của màn Home,
   * `safe` giống hệt nhau ở cả bốn kit **4/7 ô**, còn `content` thì **0/7**. Ô nào
   * `safe` có lệch cũng chỉ có ĐÚNG HAI giá trị (ipay là đời thư viện element cũ, ba
   * kit kia đời mới) — trong khi `content` thì bốn kit ra bốn số. Nếu tỉ số này đảo
   * chiều (thân trôi nhiều hơn ảnh) thì quy ước đơn vị của `screen-spec.ts` sai và
   * ca này phải đỏ trước khi người dùng thấy một màn xô lệch.
   */
  it("thân ổn định hơn ảnh: safe 4/7 ô bất biến, content 0/7", () => {
    const names = [
      "25-bg-home", "50-counter-pill", "04-btn-circle", "10-popup-ribbon",
      "07-progress-track", "08-progress-fill", "01-btn-pill-red",
    ];
    const distinct = (bare: string, key: "safe" | "content") =>
      new Set(KITS.map((k) => assetOf(k, bare)[key].join(","))).size;
    expect(names.filter((n) => distinct(n, "safe") === 1)).toEqual([
      "25-bg-home", "07-progress-track", "08-progress-fill", "01-btn-pill-red",
    ]);
    expect(names.filter((n) => distinct(n, "content") === 1)).toEqual([]);
    // ô có lệch thì cũng chỉ hai đời thư viện, không phải bốn kiểu
    for (const n of names) expect(distinct(n, "safe")).toBeLessThanOrEqual(2);
  });

  /** Checklist lát 1: chạy trên cả bốn kit và ghi lại `missing[]`. */
  it("cả bốn kit dựng đủ màn Home, missing[] rỗng", () => {
    for (const kit of KITS) {
      const scene = resolveScene(HOME, filesOf(kit));
      expect({ kit, missing: scene.missing, broken: scene.broken, layers: scene.layers.length })
        .toEqual({ kit, missing: [], broken: [], layers: HOME.nodes.length });
    }
  });

  it("lát 1 chỉ ship màn Home — mọi màn khác phải kèm nền và ít nhất một ô", () => {
    expect(DEMO_SCREENS.map((s) => s.id)).toEqual(["home"]);
    for (const s of DEMO_SCREENS) {
      expect(s.background).not.toBe("");
      expect(s.nodes.length).toBeGreaterThan(0);
    }
  });
});
