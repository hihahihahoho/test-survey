/**
 * H1 — LỌC + SẮP của màn H (`features/home/lib/home-view.ts`). Test thuần, không DOM.
 */
import { describe, expect, it } from "vitest";
import { projectSchema, type Project } from "@/lib/types";
import {
  SEARCH_THRESHOLD, applyHomeView, haystackOf, shouldShowSearch, sortByRecent,
} from "@/features/home";

const kit = (over: Partial<Project> & { id: string; name: string }): Project =>
  projectSchema.parse({ tags: [], ...over });

const TET = kit({
  id: "tet26-a7f3", name: "Tết Vietcombank", tags: ["tet", "kg-workflow"],
  updatedAt: "2026-08-06T12:00:00Z",
});
const HE = kit({
  id: "he-11b2", name: "Ý tưởng hè", tags: ["kg-canvas"],
  updatedAt: "2026-08-07T09:00:00Z",
});
const CANDY = kit({ id: "candy-9911", name: "Candy Lite", updatedAt: "2026-08-01T09:00:00Z" });
const ALL = [TET, HE, CANDY];

describe("sắp «sửa gần nhất»", () => {
  it("mới nhất đứng đầu", () => {
    expect(sortByRecent(ALL).map((p) => p.id)).toEqual(["he-11b2", "tet26-a7f3", "candy-9911"]);
  });

  it("KHÔNG đổi mảng gốc (nó là cache của TanStack Query — sắp tại chỗ là làm hỏng cache)", () => {
    const input = [...ALL];
    sortByRecent(input);
    expect(input.map((p) => p.id)).toEqual(["tet26-a7f3", "he-11b2", "candy-9911"]);
  });

  it("thiếu `updatedAt` thì rơi về `createdAt`, không ném và không nhảy lên đầu", () => {
    const noDate = kit({ id: "x-1", name: "Không ngày" });
    expect(() => sortByRecent([...ALL, noDate])).not.toThrow();
    expect(sortByRecent([...ALL, noDate]).at(-1)?.id).toBe("x-1");
  });
});

describe("tìm — chỉ trên thứ user NHÌN THẤY", () => {
  it("tìm theo tên, chấp nhận gõ thiếu dấu", () => {
    expect(applyHomeView(ALL, "tet").map((p) => p.id)).toEqual(["tet26-a7f3"]);
    expect(applyHomeView(ALL, "y tuong").map((p) => p.id)).toEqual(["he-11b2"]);
  });

  it("KHÔNG tìm theo `id`/`slug` — hai thứ đó IA mới không cho user thấy (BA-V3 §1.4)", () => {
    // Gõ đúng id vẫn không ra: tìm theo thứ vô hình cho ra kết quả user không giải thích nổi.
    expect(applyHomeView(ALL, "a7f3")).toEqual([]);
    expect(applyHomeView(ALL, "9911")).toEqual([]);
  });

  it("KHÔNG tìm theo tag hệ thống `kg-*` — gõ «canvas» mà ra bộ kit là lộ chỗ chứa mượn", () => {
    expect(applyHomeView(ALL, "canvas")).toEqual([]);
    expect(applyHomeView(ALL, "workflow")).toEqual([]);
    expect(haystackOf(HE)).not.toContain("kg-");
  });

  it("vẫn tìm được theo tag NGƯỜI DÙNG đặt", () => {
    expect(applyHomeView(ALL, "tet").map((p) => p.id)).toEqual(["tet26-a7f3"]);
  });

  it("từ khoá rỗng / chỉ khoảng trắng ⇒ trả đủ, đã sắp", () => {
    expect(applyHomeView(ALL, "").map((p) => p.id)).toEqual(["he-11b2", "tet26-a7f3", "candy-9911"]);
    expect(applyHomeView(ALL, "   ").map((p) => p.id)).toEqual(["he-11b2", "tet26-a7f3", "candy-9911"]);
  });

  it("không khớp gì ⇒ mảng rỗng (màn sẽ hiện ca «không có bộ kit nào khớp»)", () => {
    expect(applyHomeView(ALL, "zzzzzz")).toEqual([]);
  });

  it("hoà điểm khớp thì «sửa gần nhất» phân xử — thứ tự phải tất định", () => {
    const a = kit({ id: "a", name: "Kit mùa xuân", updatedAt: "2026-01-01T00:00:00Z" });
    const b = kit({ id: "b", name: "Kit mùa xuân", updatedAt: "2026-06-01T00:00:00Z" });
    expect(applyHomeView([a, b], "Kit mùa xuân").map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("dữ liệu thiếu trường (tên rỗng, tags thiếu) không làm ném", () => {
    const broken = { id: "b1", name: "", tags: [] } as unknown as Project;
    expect(() => applyHomeView([broken], "x")).not.toThrow();
    expect(() => haystackOf(broken)).not.toThrow();
  });
});

describe("ngưỡng hiện ô tìm", () => {
  it(`ẩn dưới ${SEARCH_THRESHOLD} bộ kit — màn người mới đúng y wireframe §1.1: không ô nhập nào`, () => {
    expect(shouldShowSearch(0)).toBe(false);
    expect(shouldShowSearch(6)).toBe(false);
  });
  it("hiện từ ngưỡng trở lên", () => {
    expect(shouldShowSearch(SEARCH_THRESHOLD)).toBe(true);
    expect(shouldShowSearch(30)).toBe(true);
  });
});
