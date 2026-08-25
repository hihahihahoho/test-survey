/**
 * WAVE 3 §W3-3 — cây cầu nối ảnh tham chiếu trên đĩa vào bản thiết kế.
 *
 * Bộ này kiểm phần **thuần khiết** (không React, không mạng): luật "đọc ngược `kind`
 * từ tên agent đặt". Phần cần agent sống nằm ở `agent-contract.integration.test.ts`.
 * (§W3-2 đã rời khỏi file này — xem ghi chú ngay trên nhóm ca bên dưới.)
 */
import { describe, expect, it } from "vitest";
import { createWorkflowStore, resetWorkflowStores } from "../model";
import { buildKitsetContract } from "../kitset-to-contract";
import { groupRefs, refKindOf, toKitsetRefs } from "../refs-sync";

const state = () => {
  resetWorkflowStores();
  return createWorkflowStore("kit-sync").getState();
};

const ref = (name: string) => ({ name, usedBy: [] });

/* ĐÃ GỠ: cả nhóm §W3-2 («không ghi đè bản thiết kế của người khác»).
   Luật đó sống trong `lib/contract-sync.ts:isForeignContract`, và cửa nó canh là
   đường workflow-wizard ghi đè `contract.json` của một dự án nhập từ tệp cũ. Đợt IA
   prompt-first đã xoá cả cửa ấy: `/k/:id` là khu soạn prompt, nguồn sự thật là TÀI
   LIỆU COMPOSER và nó ghi contract theo luật riêng đã ghi rõ ở
   `PromptCanvasScreen.putContract` (xung đột thì ghi đè, bản cũ vẫn nằm trong
   `.history/contract/` của agent). Không còn ai gọi `isForeignContract` ⇒ file bị
   xoá, và ca của nó không thể xanh cho một thứ không tồn tại.
   Nhóm §W3-3 dưới đây (`refs-sync`) KHÔNG đổi: nó vẫn là luật đọc ngược `kind` từ
   tên file mà agent đặt, và `agent-contract.integration.test.ts` còn dùng. */

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
