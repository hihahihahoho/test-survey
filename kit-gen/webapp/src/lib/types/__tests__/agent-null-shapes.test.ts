import { describe, expect, it } from "vitest";
import { projectSchema, workspaceItemSchema } from "../api";
import { sheetSchema, characterSchema } from "../contract";

/**
 * HỒI QUY QA-FUNC (bản React) — BA ca `null` mà AGENT THẬT GỬI nhưng schema web
 * từng khai `.optional()`. `.optional()` của zod KHÔNG nhận `null` ⇒ `parse()` ở
 * `endpoints.ts` ném ⇒ biến thành `AGENT_INTERNAL` ⇒ MÀN TRẮNG.
 *
 * Cả ba đều đo bằng agent thật (workspace /tmp/kitws-qa, agent 1.2.0):
 *   · sheet.ref = null           ← agent dựng sẵn tấm (MỌI sheet, mọi project tạo
 *                                  trước 08/09/2026 — vẫn nằm trên đĩa người dùng)
 *   · project.contract.hash=null ← agent/lib/projects.mjs:200 (MỌI project vừa tạo)
 *   · workspace.diskBytes = null ← agent/routes/system.mjs #3
 *
 * Đừng đổi `.nullish()` thành `.optional()` nếu chưa sửa agent trước.
 */
describe("schema web phải nhận đúng hình dạng null của agent THẬT", () => {
  it("sheet.ref = null (mọi sheet của mọi template) ⇒ màn S3 Thiết kế mở được", () => {
    const r = sheetSchema.safeParse({
      id: "mo-qua-main", grid: { cols: 1, rows: 1 }, ref: null,
      components: [{ file: "01-btn-cta", vi: "A", spec: "s", skel: { shape: "rrect", w: 0.5, h: 0.5 } }],
    });
    expect(r.success).toBe(true);
  });

  it("character.ref = null ⇒ panel thuộc tính nhân vật không vỡ", () => {
    expect(characterSchema.safeParse({ id: "lan", vi: "Lan", ref: null }).success).toBe(true);
  });

  it("project.contract.hash = null (project vừa tạo) ⇒ màn S1 Danh sách không vỡ", () => {
    const r = projectSchema.safeParse({
      id: "p-1", name: "P", contract: { file: "contract.json", version: 0, hash: null },
    });
    expect(r.success).toBe(true);
  });

  it("workspace.diskBytes = null ⇒ S6 tab Agent + Setup chọn workspace không vỡ", () => {
    const r = workspaceItemSchema.safeParse({
      id: "ws_1", label: "/tmp/ws", projects: 0, diskBytes: null, active: true, writable: true,
    });
    expect(r.success).toBe(true);
  });

  it("MỘT project null-hash KHÔNG được làm hỏng cả danh sách", () => {
    const items = [
      { id: "ok", name: "OK", contract: { file: "contract.json", version: 3, hash: "sha256:abc" } },
      { id: "new", name: "Mới", contract: { file: "contract.json", version: 0, hash: null } },
    ];
    expect(items.every((p) => projectSchema.safeParse(p).success)).toBe(true);
  });
});
