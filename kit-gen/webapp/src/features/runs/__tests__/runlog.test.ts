import { describe, expect, it, vi } from "vitest";
import { createRunLogBuffer, filterLines, logToText, type LogLine } from "../lib/runlog";

const line = (o: Partial<LogLine> & { seq: number }): LogLine => ({
  t: "2026-08-06T12:04:02.113Z", job: null, level: "info", text: `dòng ${o.seq}`, ...o,
});

/** Bộ đệm gom nhóm 120ms ⇒ test phải chờ; dùng fake timer cho nhanh và tất định. */
function makeBuffer(onChange: (l: LogLine[]) => void) {
  return createRunLogBuffer({ runId: "r-0001", projectId: "p1", onChange, persist: false });
}

describe("bộ đệm nhật ký — đóng D2 (v1 GHI ĐÈ log)", () => {
  it("NỐI THÊM, không bao giờ thay cả danh sách", () => {
    const buf = makeBuffer(() => {});
    buf.push([line({ seq: 1 }), line({ seq: 2 })]);
    buf.push([line({ seq: 3 })]);
    expect(buf.all().map((l) => l.seq)).toEqual([1, 2, 3]);
    buf.dispose();
  });

  it("KHỬ TRÙNG theo seq — stream nối lại `?from=` gửi lại vài event", () => {
    const buf = makeBuffer(() => {});
    buf.push([line({ seq: 1 }), line({ seq: 2 }), line({ seq: 3 })]);
    // nối lại: agent phát lại từ seq 2
    buf.push([line({ seq: 2 }), line({ seq: 3 }), line({ seq: 4 })]);
    expect(buf.all().map((l) => l.seq)).toEqual([1, 2, 3, 4]);
    buf.dispose();
  });

  it("cắt theo DÒNG khi vượt 5000, không cắt theo ký tự (bug v1)", () => {
    const buf = makeBuffer(() => {});
    buf.push(Array.from({ length: 5200 }, (_, i) => line({ seq: i + 1 })));
    const all = buf.all();
    expect(all.length).toBe(5000);
    // Bỏ dòng CŨ NHẤT, giữ dòng mới nhất — và mỗi phần tử vẫn là một dòng nguyên vẹn.
    expect(all[0]!.seq).toBe(201);
    expect(all[all.length - 1]!.seq).toBe(5200);
    expect(all.every((l) => typeof l.text === "string" && l.text.startsWith("dòng"))).toBe(true);
    buf.dispose();
  });

  it("lastSeq là con trỏ để nối lại stream", () => {
    const buf = makeBuffer(() => {});
    buf.push([line({ seq: 7 }), line({ seq: 12 })]);
    expect(buf.lastSeq()).toBe(12);
    buf.dispose();
  });

  it("hydrate nạp đè từ IDB và nạp luôn tập seq đã thấy", () => {
    const buf = makeBuffer(() => {});
    buf.hydrate([line({ seq: 1 }), line({ seq: 2 })]);
    buf.push([line({ seq: 2 }), line({ seq: 3 })]); // seq 2 đã có
    expect(buf.all().map((l) => l.seq)).toEqual([1, 2, 3]);
    buf.dispose();
  });

  it("dòng client tự sinh (seq<=0) LUÔN được nhận, không bị coi là trùng", () => {
    const buf = makeBuffer(() => {});
    buf.push([line({ seq: 0, text: "a" }), line({ seq: 0, text: "b" })]);
    expect(buf.all().length).toBe(2);
    buf.dispose();
  });
});

describe("gom nhóm — chống render 500 lần/giây", () => {
  it("nhiều lô liên tiếp chỉ báo MỘT lần sau 120ms", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const buf = makeBuffer(onChange);
    buf.push([line({ seq: 1 })]);
    buf.push([line({ seq: 2 })]);
    buf.push([line({ seq: 3 })]);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toHaveLength(3);
    buf.dispose();
    vi.useRealTimers();
  });

  it("flush() bơm ngay — KHÔNG MẤT ĐUÔI log khi rời màn", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const buf = makeBuffer(onChange);
    buf.push([line({ seq: 1 })]);
    buf.flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    buf.dispose();
    vi.useRealTimers();
  });

  it("sau dispose thì không báo nữa (tránh setState trên component đã unmount)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const buf = makeBuffer(onChange);
    buf.dispose();
    buf.push([line({ seq: 1 })]);
    vi.advanceTimersByTime(500);
    expect(onChange).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("lọc & xuất", () => {
  const lines = [
    line({ seq: 1, job: "tet-main", level: "info" }),
    line({ seq: 2, job: "tet-main", level: "error", text: "hỏng" }),
    line({ seq: 3, job: "vang-main", level: "info" }),
  ];

  it("không lọc gì thì trả nguyên mảng (không tạo bản sao thừa)", () => {
    expect(filterLines(lines, { errorsOnly: false, job: null })).toBe(lines);
  });

  it("[Chỉ lỗi] giữ đúng dòng error", () => {
    const out = filterLines(lines, { errorsOnly: true, job: null });
    expect(out.map((l) => l.seq)).toEqual([2]);
  });

  it("[Chỉ lượt này] lọc theo job", () => {
    const out = filterLines(lines, { errorsOnly: false, job: "vang-main" });
    expect(out.map((l) => l.seq)).toEqual([3]);
  });

  it("hai bộ lọc chồng nhau", () => {
    expect(filterLines(lines, { errorsOnly: true, job: "vang-main" })).toHaveLength(0);
  });

  it("logToText có timestamp + job + đánh dấu ERROR cho file tải về", () => {
    const text = logToText(lines);
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("tet-main");
    expect(text).toContain("ERROR");
  });
});
