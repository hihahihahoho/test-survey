import { describe, expect, it } from "vitest";
import type { Run } from "@/lib/types";
import { categoryOfSheet, generatedRuns, jobsForGroup } from "../generated-results";

const run = (overrides: Partial<Run>): Run => ({
  id: "r-0001", kind: "g" + "en" as "gen", status: "done", startedAt: "2026-08-12T00:00:00Z",
  finishedAt: "2026-08-12T00:01:00Z", progress: { done: 2, total: 2, failed: 0, etaSeconds: null }, seq: 0,
  jobs: [
    { job: "main-bg-01", variant: "main", sheet: "bg-01", status: "ok", startedAt: null, durationMs: null, artifact: { path: "raw/main-bg-01.png" }, recovered: false, diagnosis: null },
    { job: "main-popup-01", variant: "main", sheet: "popup-01", status: "failed", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: "NO_ARTIFACT" },
  ], ...overrides,
});

describe("generated results", () => {
  it("chỉ giữ lượt tạo ảnh và phân loại từng ảnh theo sheet", () => {
    const groups = generatedRuns([run({}), run({ id: "r-0002", kind: "slice" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => [item.category, item.path])).toEqual([
      ["background", "raw/main-bg-01.png"], ["popup", null],
    ]);
  });

  it("đưa lỗi geometry của validator lên kết quả", () => {
    const broken = run({ jobs: [{ ...run({}).jobs[0]!, artifact: { path: "runs/r-0001/artifacts/main-bg-01.png", validation: { ok: false, cells: [{ file: "button", status: "regenerate", reasons: ["position"] }] } } }] });
    expect(generatedRuns([broken])[0]?.items[0]).toMatchObject({ geometryOk: false, invalidCells: 1 });
  });

  it("tách UI kit và đạo cụ thành hai nhóm quản lý", () => {
    expect(categoryOfSheet("ui-doc-01")).toBe("ui");
    expect(categoryOfSheet("small-button-01")).toBe("ui");
    expect(categoryOfSheet("prop-lixi-01")).toBe("prop");
    expect(categoryOfSheet("item-coin-01")).toBe("prop");
  });

  it("chọn đúng jobs khi tạo lại một nhóm", () => {
    expect(jobsForGroup(run({}).jobs, "popup")).toEqual(["main-popup-01"]);
    expect(jobsForGroup(run({}).jobs, "all")).toEqual(["main-bg-01", "main-popup-01"]);
  });
});
