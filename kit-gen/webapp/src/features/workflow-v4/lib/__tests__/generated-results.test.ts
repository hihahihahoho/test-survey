import { describe, expect, it } from "vitest";
import type { Run } from "@/lib/types";
import {
  categoryOfSheet, generatedRuns, groupLabel, jobsForGroup, resultProgress, resultStateOf,
  resumeInvite, sheetLabel, sheetSeries,
} from "../generated-results";

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
    expect(categoryOfSheet("dao-cu-01")).toBe("prop");
  });

  it("chọn đúng jobs khi tạo lại một nhóm", () => {
    expect(jobsForGroup(run({}).jobs, "popup")).toEqual(["main-popup-01"]);
    expect(jobsForGroup(run({}).jobs, "all")).toEqual(["main-bg-01", "main-popup-01"]);
  });
});

/**
 * HỒI QUY BÁO TỪ BẢN CÀI THẬT: thẻ "Nền" và "ui2" nằm nhóm **Khác** ở trang tổng, còn
 * trang nhóm "Nền" trong sidebar dự án thì RỖNG. Cả hai cùng một gốc: id sheet do
 * `kitset-to-contract.ts` sinh ra là `nen` / `nen2` / `ui` / `ui2` (đánh số KHÔNG có
 * gạch, đúng quy ước `styles.json`), còn `categoryOfSheet` chỉ khớp `^(small|ui)(-|$)`
 * và không biết `nen` là gì.
 */
describe("nhóm sheet phải khớp 1-1 với nhóm cấu hình của wizard", () => {
  it("id do wizard sinh ra (kể cả sheet thứ 2, 3…) vào đúng nhóm", () => {
    expect(categoryOfSheet("nen")).toBe("background");
    expect(categoryOfSheet("nen2")).toBe("background");
    expect(categoryOfSheet("popup")).toBe("popup");
    expect(categoryOfSheet("popup2")).toBe("popup");
    expect(categoryOfSheet("popup-doc")).toBe("popup");
    expect(categoryOfSheet("popup-doc2")).toBe("popup");
    expect(categoryOfSheet("ui")).toBe("ui");
    expect(categoryOfSheet("ui2")).toBe("ui");
    expect(categoryOfSheet("ui-doc")).toBe("ui");
    expect(categoryOfSheet("dao-cu")).toBe("prop");
    expect(categoryOfSheet("dao-cu2")).toBe("prop");
    expect(categoryOfSheet("dao-cu-doc2")).toBe("prop");
    expect(categoryOfSheet("pose-nhan-vat")).toBe("mascot");
    expect(categoryOfSheet("pose-nhan-vat2")).toBe("mascot");
    expect(categoryOfSheet("pose-nhan-vat-2")).toBe("mascot");
  });

  it("id của styles.json đời cũ cũng không rơi vào Khác", () => {
    expect(categoryOfSheet("bg-home")).toBe("background");
    expect(categoryOfSheet("main")).toBe("ui");
    expect(categoryOfSheet("main2")).toBe("ui");
    expect(categoryOfSheet("tall")).toBe("ui");
    expect(categoryOfSheet("pose-lan")).toBe("mascot");
  });

  it("chỉ id thật sự lạ mới là Khác", () => {
    expect(categoryOfSheet("thu-gi-do")).toBe("other");
    expect(groupLabel("other")).toBe("Khác");
  });

  it("tách được số thứ tự dãy dù có hay không dấu gạch", () => {
    expect(sheetSeries("ui")).toEqual({ base: "ui", index: 1 });
    expect(sheetSeries("ui2")).toEqual({ base: "ui", index: 2 });
    expect(sheetSeries("ui-doc-01")).toEqual({ base: "ui-doc", index: 1 });
    expect(sheetSeries("pose-nhan-vat3")).toEqual({ base: "pose-nhan-vat", index: 3 });
  });

  it("nhãn sheet nói đúng nhóm, đúng số và đúng hướng ô", () => {
    expect(sheetLabel("nen")).toBe("Nền");
    expect(sheetLabel("nen2")).toBe("Nền 2");
    expect(sheetLabel("ui2")).toBe("UI nhỏ 2");
    expect(sheetLabel("popup-doc")).toBe("Popup dọc");
    expect(sheetLabel("pose-nhan-vat2")).toBe("Mascot pose 2");
  });
});

/**
 * HỒI QUY: vừa bấm "Tạo ảnh", mọi thẻ đã đỏ "Chưa tạo được ảnh". Trạng thái phải
 * đọc từ vòng đời run, không từ "có file hay chưa".
 */
describe("trạng thái ô kết quả theo vòng đời lượt chạy", () => {
  it("run đang chạy ⇒ job chưa tới lượt là ĐANG CHỜ, không phải lỗi", () => {
    expect(resultStateOf("running", "queued")).toBe("queued");
    expect(resultStateOf("queued", "queued")).toBe("queued");
    expect(resultStateOf("running", "running")).toBe("running");
  });

  it("job xong/hỏng thì trạng thái của job thắng", () => {
    expect(resultStateOf("running", "ok")).toBe("done");
    expect(resultStateOf("running", "failed")).toBe("failed");
    expect(resultStateOf("done-with-errors", "failed")).toBe("failed");
  });

  it("người dùng DỪNG ⇒ job dở là ĐÃ DỪNG, không phải lỗi (run-handle đưa về queued)", () => {
    expect(resultStateOf("cancelled", "queued")).toBe("cancelled");
    expect(resultStateOf("cancelled", "running")).toBe("cancelled");
    expect(resultStateOf("cancelled", "ok")).toBe("done");
  });

  it("run kết thúc mà job vẫn treo ⇒ mới là lỗi", () => {
    expect(resultStateOf("done", "queued")).toBe("failed");
    expect(resultStateOf("env-failed", "queued")).toBe("failed");
  });

  it("generatedRuns gắn state + cờ live cho cả lượt", () => {
    const live = generatedRuns([run({
      status: "running", finishedAt: null,
      jobs: [
        { job: "a", sheet: "nen", status: "ok", startedAt: null, durationMs: null, artifact: { path: "raw/a.png" }, recovered: false, diagnosis: null },
        { job: "b", sheet: "ui", status: "running", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null },
        { job: "c", sheet: "ui2", status: "queued", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null },
      ],
    })])[0]!;
    expect(live.live).toBe(true);
    expect(live.items.map((i) => i.state)).toEqual(["done", "running", "queued"]);
    expect(live.items.map((i) => i.category)).toEqual(["background", "ui", "ui"]);
    expect(resultProgress(live.items)).toEqual({ done: 1, failed: 0, running: 1, total: 3 });
  });

  /* ── DỪNG → CHẠY TIẾP PHẦN THIẾU (16/08) ─────────────────────────────────
     Lời mời này là vế thứ hai của nút Dừng. Nó phải chọn ĐÚNG tập còn thiếu: thừa một
     tấm là đốt lại quota của ảnh đã trả tiền, thiếu một tấm là người dùng tưởng xong
     rồi mà bộ kit vẫn hụt. */
  it("lượt bị dừng ⇒ mời chạy tiếp ĐÚNG số tấm chưa có ảnh", () => {
    const group = generatedRuns([run({
      status: "cancelled", finishedAt: "2026-08-16T00:01:00Z",
      jobs: [
        { job: "a", sheet: "nen", status: "ok", startedAt: null, durationMs: null, artifact: { path: "raw/a.png" }, recovered: false, diagnosis: null },
        { job: "b", sheet: "ui", status: "queued", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null },
        { job: "c", sheet: "ui2", status: "queued", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null },
      ],
    })])[0]!;
    expect(resumeInvite(group)).toEqual({ jobs: ["b", "c"], done: 1, total: 3 });
  });

  it("không mời chạy tiếp khi lượt còn sống, đã xong, hay đang hỏng theo kiểu khác", () => {
    const live = generatedRuns([run({ status: "running", finishedAt: null })])[0]!;
    expect(resumeInvite(live)).toBeNull();
    expect(resumeInvite(generatedRuns([run({})])[0]!)).toBeNull();
    // lượt đỏ đã có dải RunFailBanner nói chuyện lỗi — không chồng thêm giọng thứ hai
    expect(resumeInvite(generatedRuns([run({ status: "done-with-errors" })])[0]!)).toBeNull();
    expect(resumeInvite(null)).toBeNull();
  });

  it("dừng mà tấm nào cũng kịp xong ⇒ không mời gì cả", () => {
    const done = generatedRuns([run({
      status: "cancelled",
      jobs: [{ job: "a", sheet: "nen", status: "ok", startedAt: null, durationMs: null, artifact: { path: "raw/a.png" }, recovered: false, diagnosis: null }],
    })])[0]!;
    expect(resumeInvite(done)).toBeNull();
  });
});
