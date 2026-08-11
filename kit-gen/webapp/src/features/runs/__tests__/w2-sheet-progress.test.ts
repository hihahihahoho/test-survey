import { describe, expect, it } from "vitest";
import type { Contract, Run, RunJob } from "@/lib/types";
import { friendlyDiagnosis, resolveSheetIdentity, sheetProgressState } from "../lib/sheet-progress";

const contract = {
  version: 4,
  variants: [{ id: "tet-do", vi: "Tết đỏ", style: "", bg: "green" }],
  sheets: [{ id: "main-ui", grid: { cols: 2, rows: 1 }, components: [
    { file: "01-play", vi: "Chơi", spec: "", skel: { shape: "pill" } },
    { file: "02-close", vi: "Đóng", spec: "", skel: { shape: "circle" } },
  ] }],
  characterPoses: [],
} as Contract;
const job = { job: "tet-do-main-ui", status: "ok", recovered: false, diagnosis: null } as RunJob;
const baseRun = { id: "r-20260001", status: "running", kind: "gen", jobs: [job], progress: { done: 1, total: 1, failed: 0 } } as Run;

describe("W2 tiến trình theo tấm", () => {
  it("tách tên bằng variant id đã biết dù variant có dấu gạch", () => {
    expect(resolveSheetIdentity(job, contract)).toMatchObject({ variantId: "tet-do", sheetId: "main-ui", variantLabel: "Tết đỏ" });
  });
  it("job.done chưa được gọi là xong trước pha tách nền", () => {
    expect(sheetProgressState(job, baseRun)).toBe("awaiting-cut");
  });
  it("chỉ xong sau khi sang pha 2", () => {
    expect(sheetProgressState(job, { ...baseRun, phase: { index: 2, total: 2 } })).toBe("done");
  });
  it("run.finished cũng cho phép gọi tấm đã cắt là xong", () => {
    expect(sheetProgressState(job, { ...baseRun, status: "done" })).toBe("done");
  });
  it("dịch chẩn đoán thành câu tiếng Việt", () => {
    expect(friendlyDiagnosis("QUOTA_SUSPECTED")).toContain("hết lượt");
    expect(friendlyDiagnosis("NO_ARTIFACT")).toContain("ảnh mờ");
    expect(friendlyDiagnosis("NOT_LOGGED_IN")).toContain("ảnh nhân vật");
  });
});
