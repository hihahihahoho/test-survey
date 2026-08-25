/**
 * WAVE 3 §W3-2 + §W3-3 — bằng chứng cho hai cây cầu nối workflow ra đĩa thật.
 *
 * Bộ này kiểm phần **thuần khiết** (không React, không mạng): luật "không ghi đè bản
 * thiết kế của người khác", và luật "đọc ngược `kind` từ tên agent đặt". Phần cần
 * agent sống nằm ở `agent-contract.integration.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { contractSchema } from "@/lib/types/contract";
import { createWorkflowStore, resetWorkflowStores } from "../model";
import { buildKitsetContract, MAIN_VARIANT_ID } from "../kitset-to-contract";
import { isForeignContract } from "../contract-sync";
import { groupRefs, refKindOf, toKitsetRefs } from "../refs-sync";

const state = () => {
  resetWorkflowStores();
  return createWorkflowStore("kit-sync").getState();
};

const ref = (name: string) => ({ name, usedBy: [] });

/* ══════════════════════════════════════════════════════════════════════════
   §W3-2 — CỬA MẤT DỮ LIỆU: không ghi đè contract của người khác
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-2 — nhận diện bản thiết kế KHÔNG do workflow viết", () => {
  it("project mới toanh (0 sheet) KHÔNG bị coi là của người khác — phải ghi được", () => {
    expect(isForeignContract(contractSchema.parse({ sheets: [], variants: [], characterPoses: [] }))).toBe(false);
  });

  it("contract do CHÍNH workflow sinh ra thì không phải của người khác", () => {
    expect(isForeignContract(buildKitsetContract(state()))).toBe(false);
  });

  it("contract NHẬP TỪ TỆP CŨ (có sheet, không có phong cách `chinh`) ⇒ CHỈ ĐỌC", () => {
    // Hình dạng của `styles.json` thật: nhiều sheet, phong cách id riêng (`ipay`, `tet`…).
    const imported = contractSchema.parse({
      sheets: [{
        id: "main", grid: { cols: 1, rows: 1 },
        components: [{ file: "01-btn-pill-red", vi: "", spec: "", skel: { shape: "pill", w: 0.7, h: 0.4 } }],
      }],
      styles: [{ id: "ipay", vi: "Fintech xanh 3D", style: "", bg: "pure vivid magenta #FF00FF" }],
      characterPoses: [],
    });
    expect(isForeignContract(imported)).toBe(true);
  });

  it("chỉ cần MỘT phong cách mang id `chinh` là nhận lại quyền ghi", () => {
    const mixed = contractSchema.parse({
      sheets: [{
        id: "main", grid: { cols: 1, rows: 1 },
        components: [{ file: "01-btn-pill-red", vi: "", spec: "", skel: { shape: "pill", w: 0.7, h: 0.4 } }],
      }],
      variants: [{ id: "ipay", vi: "", style: "", bg: "x" }, { id: MAIN_VARIANT_ID, vi: "", style: "", bg: "x" }],
      characterPoses: [],
    });
    expect(isForeignContract(mixed)).toBe(false);
  });

  it("`null`/`undefined` (chưa nạp xong) KHÔNG được coi là của người khác — nếu không, banner nháy oan", () => {
    expect(isForeignContract(null)).toBe(false);
    expect(isForeignContract(undefined)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §W3-3 — đọc ngược `kind` từ tên agent đặt (đây là thứ làm chip sống sót qua F5)
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-3 — kind của ảnh ref đọc ra từ tên file", () => {
  it("khớp đúng ba quy ước đặt tên của `agent/routes/refs.mjs:118-131`", () => {
    expect(refKindOf("char-meo-bac-ha.png")).toBe("character");
    expect(refKindOf("brand-1.jpg")).toBe("brand");
    expect(refKindOf("inspo-7.webp")).toBe("inspo");
  });

  it("tên lạ rơi về `inspo` — không ném, không nuốt: ảnh vẫn hiện ở một ô nào đó", () => {
    expect(refKindOf("anh-nguoi-dung-tu-dat.png")).toBe("inspo");
  });

  it("gom nhóm đúng ba ô thả", () => {
    const g = groupRefs([ref("inspo-1.png"), ref("brand-1.png"), ref("char-a.png"), ref("inspo-2.png")]);
    expect(g.inspo.map((r) => r.name)).toEqual(["inspo-1.png", "inspo-2.png"]);
    expect(g.brand.map((r) => r.name)).toEqual(["brand-1.png"]);
    expect(g.character.map((r) => r.name)).toEqual(["char-a.png"]);
  });

  it("đường dẫn contract là `refs/<name>` — khớp gen.sh:142 và refUsage của agent", () => {
    const k = toKitsetRefs(groupRefs([ref("inspo-1.png"), ref("brand-1.png"), ref("char-a.png")]));
    expect(k.inspo).toEqual(["refs/inspo-1.png"]);
    expect(k.brand).toEqual(["refs/brand-1.png"]);
    expect(k.character).toBe("refs/char-a.png");
  });

  it("nhiều ảnh nhân vật ⇒ lấy bản MỚI NHẤT (contract chỉ có MỘT `character.ref`)", () => {
    const k = toKitsetRefs(groupRefs([
      { name: "char-cu.png", mtime: "2026-01-01T00:00:00.000Z", usedBy: [] },
      { name: "char-moi.png", mtime: "2026-08-08T00:00:00.000Z", usedBy: [] },
    ]));
    expect(k.character).toBe("refs/char-moi.png");
  });

  it("chưa có ảnh nhân vật ⇒ `null`, KHÔNG phải chuỗi rỗng (schema dùng `ref: string|null`)", () => {
    expect(toKitsetRefs(groupRefs([])).character).toBeNull();
  });

  it("ref của ĐĨA thắng bản nháp khi dựng contract (đĩa là sự thật)", () => {
    const s = { ...state(), styleRefs: [{ name: "nhap-cu.png", kind: "style" as const }] };
    const withDisk = buildKitsetContract(s, { refs: { inspo: ["refs/inspo-1.png"], brand: [], character: null } });
    expect(withDisk.variants?.[0]?.inspo).toEqual(["refs/inspo-1.png"]);
    // Không truyền `refs` (offline) thì mới rơi về bản nháp.
    expect(buildKitsetContract(s).variants?.[0]?.inspo).toEqual(["refs/nhap-cu.png"]);
  });
});
