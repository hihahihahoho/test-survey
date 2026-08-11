/**
 * FE-3 · S0 — canh nợ EVIDENCE-FE2 §7-#7: `qk.docs` vừa được thêm vào
 * `lib/hooks/keys.ts`, trong khi `features/docs/hooks/use-docs.ts` vẫn đang dùng
 * `docsKeys` cục bộ của chính nó.
 *
 * Hai bảng key song song là đúng thứ sinh ra bug cache im lặng: `invalidateQueries`
 * gọi một bên, `useQuery` đọc bên kia, không ai đỏ và dữ liệu cũ nằm lại trên màn.
 * Test này giữ hai bên BẰNG NHAU cho tới khi chủ `features/docs/**` đổi import
 * (S0 không đổi hộ — file đó ngoài glob S0).
 *
 * ⚠️ VỊ TRÍ FILE: đặt trong `features/kitfile/__tests__/` vì đó là glob của nhánh S
 * (FE3-PLAN §1.1). `lib/hooks/__tests__/` KHÔNG thuộc nhánh nào ⇒ không đẻ file ở đó
 * (luật N1 — bài học B2 FE-1). Xem S-REPORT §4.4.
 */
import { describe, expect, it } from "vitest";
import { qk } from "@/lib/hooks/keys";
import { docsKeys } from "@/features/docs/hooks/use-docs";

describe("S0 · qk.docs khớp docsKeys cục bộ (nợ FE-2 §7-#7)", () => {
  it("all()", () => {
    expect(qk.docs.all()).toEqual(docsKeys.all());
  });

  it("ofProject()", () => {
    expect(qk.docs.ofProject("p1")).toEqual(docsKeys.ofProject("p1"));
  });

  it("list() — cả hai giá trị của includeTrashed, kể cả mặc định", () => {
    expect(qk.docs.list("p1")).toEqual(docsKeys.list("p1"));
    expect(qk.docs.list("p1", false)).toEqual(docsKeys.list("p1", false));
    expect(qk.docs.list("p1", true)).toEqual(docsKeys.list("p1", true));
  });

  it("storage()", () => {
    expect(qk.docs.storage()).toEqual(docsKeys.storage());
  });

  it("list(true) KHÁC list(false) — nếu bằng nhau thì bộ lọc thùng rác dùng chung cache", () => {
    expect(qk.docs.list("p1", true)).not.toEqual(qk.docs.list("p1", false));
  });
});

describe("S0 · tiền tố `docs` không giẫm namespace nào của agent", () => {
  /** 42 route thật không có `/docs` (BA-V3 §5.1) — key này thuần local. */
  const agentNamespaces = [
    qk.health()[0],
    qk.doctor()[0],
    qk.workspaces()[0],
    qk.projects.all()[0],
    qk.trash.all()[0],
    qk.contract.all("p1")[0],
    qk.elementLib()[0],
    qk.refs.all("p1")[0],
    qk.runs.all()[0],
    qk.kit.all("p1")[0],
  ];

  it("không namespace nào của agent trùng chuỗi 'docs'", () => {
    expect(agentNamespaces).not.toContain("docs");
  });

  it("mọi key docs đều bắt đầu bằng đúng tiền tố 'docs' ⇒ huỷ hiệu lực theo tầng chạy đúng", () => {
    for (const k of [qk.docs.all(), qk.docs.ofProject("p1"), qk.docs.list("p1"), qk.docs.storage()]) {
      expect(k[0]).toBe("docs");
    }
  });
});
