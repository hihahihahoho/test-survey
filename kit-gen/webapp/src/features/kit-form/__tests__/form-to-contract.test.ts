import { describe, expect, it } from "vitest";
import { contractJobs } from "@/lib/types/contract";
import { DEFAULT_VALUES } from "../lib/form-model";
import { buildContract, countCutItems, uniqueId } from "../lib/form-to-contract";
import { estimateContract } from "../lib/estimate-view";
describe("form to contract", () => {
  it("tự chèn ô trống, sinh tên hợp lệ và không sinh shape rect", () => { const c = buildContract({ ...DEFAULT_VALUES, name: "Tết", backgroundCount: 2, items: ["01-btn-pill-red", "02-btn-pill-blue", "03-btn-pill-outline"], hasCharacter: true, poseCount: 4 }); expect(c.sheets.every((s) => s.components.length === s.grid.cols * s.grid.rows)).toBe(true); expect(JSON.stringify(c)).not.toContain('"shape":"rect"'); expect(contractJobs(c)).toHaveLength(4); expect(countCutItems(c)).toBe(9); });
  it("tăng hậu tố khi id trùng", () => { const used = new Set<string>(); expect([uniqueId("Nền", used), uniqueId("Nền", used)]).toEqual(["nen", "nen-2"]); });
  it("ước lượng từ contract thật", () => { const e = estimateContract(buildContract({ ...DEFAULT_VALUES, backgroundCount: 1, items: ["01-btn-pill-red"] })); expect(e).toMatchObject({ sheets: 2, items: 2, quota: "6–10" }); });
});
