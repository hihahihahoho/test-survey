/**
 * SỐ ĐO HÌNH HỌC → TOẠ ĐỘ LỚP PHỦ. Phần thuần, kiểm bằng số THẬT.
 *
 * Cái dễ sai ở đây không phải là vẽ, mà là ĐỌC và DỜI:
 *  · đọc: dữ liệu tới từ một file `run.json` có thể do bản agent đời khác ghi, nên
 *    mọi hình dạng lạ phải dẫn tới «không có số đo», không dẫn tới một cú ném;
 *  · dời: `expected`/`actual` là toạ độ TRONG MỘT Ô, còn lớp phủ vẽ trên CẢ TẤM.
 *    Quên phép dời thì bốn ô chồng lên nhau ở góc trên-trái — trông vẫn "có vẽ gì
 *    đó", và đó là kiểu sai tệ nhất cho một công cụ dùng để đi soi độ lệch.
 */
import { describe, expect, it } from "vitest";
import { cellBadge, measureOfSheet, sheetOverlay } from "../sheet-geometry";

/** Tấm vuông 1254², lưới 2×2 — đúng tấm `ui` của `test-vcb-d6fd`. */
const SHEET = { canvas: "square", grid: { cols: 2, rows: 2 } } as never;

const WRITTEN_AT = "2026-09-11T04:41:32.223Z";

/** Chép từ `runs/r-0021/artifacts/chinh-ui.geometry.json`. */
const CELLS = [
  {
    file: "01-button", cell: 0, status: "regenerate",
    expected: [129.5, 249.5, 368.0, 128.0], actual: [38, 281, 587, 168],
    deviation: { edgesPx: { left: -91.5, top: 31.5, right: 127.5, bottom: 71.5 }, maxEdgePx: 31.5 },
  },
  {
    file: "02-avatar-frame", cell: 1, status: "ok",
    expected: [143.0, 143.0, 341.0, 341.0], actual: [49, 134, 538, 461],
    deviation: { edgesPx: { left: -94.0, top: -9.0, right: 103.0, bottom: 111.0 }, maxEdgePx: 0 },
  },
];

const run = (id: string, cells: unknown[] = CELLS, writtenAt: string | null = WRITTEN_AT) => ({
  id,
  jobs: [{
    job: "chinh-ui",
    artifact: {
      path: `runs/${id}/artifacts/chinh-ui.png`,
      ...(writtenAt === null ? {} : { writtenAt }),
      validation: { ok: false, cells },
    },
  }],
});

describe("tìm số đo của một tấm trong danh sách lượt chạy", () => {
  it("lấy lượt ĐẦU TIÊN có số đo của đúng tấm ấy — danh sách vốn mới-nhất-trước", () => {
    const found = measureOfSheet([run("r-0030"), run("r-0021")], "chinh-ui");
    expect(found?.runId).toBe("r-0030");
    expect(found?.cells).toHaveLength(2);
  });

  it("tấm khác ⇒ không có gì, KHÔNG mượn số đo của tấm bên cạnh", () => {
    expect(measureOfSheet([run("r-0030")], "chinh-nen")).toBeNull();
  });

  it("lượt chưa kiểm hình học (validation rỗng) ⇒ bỏ qua, đi tiếp lượt sau", () => {
    const older = run("r-0021");
    const newer = { id: "r-0030", jobs: [{ job: "chinh-ui", artifact: { path: "x", validation: null } }] };
    expect(measureOfSheet([newer, older], "chinh-ui")?.runId).toBe("r-0021");
  });

  it("có mã lượt ⇒ CHỈ nhận số đo của lượt đó (ảnh lượt là bất biến, khỏi so mốc)", () => {
    const found = measureOfSheet([run("r-0030"), run("r-0021")], "chinh-ui", {
      runId: "r-0021", rawVersion: "2026-09-14T06:30:35.370Z",
    });
    expect(found?.runId).toBe("r-0021");
  });

  it("ảnh gốc đã bị ghi đè bằng một bản khác ⇒ coi như KHÔNG có số đo", () => {
    expect(measureOfSheet([run("r-0030")], "chinh-ui", { rawVersion: "2026-09-14T06:30:35.370Z" }))
      .toBeNull();
  });

  it("mốc khớp ⇒ nhận; lượt không khai mốc ⇒ cũng nhận (đừng tắt vì thiếu một field)", () => {
    expect(measureOfSheet([run("r-0030")], "chinh-ui", { rawVersion: WRITTEN_AT })?.runId).toBe("r-0030");
    expect(measureOfSheet([run("r-0030", CELLS, null)], "chinh-ui", { rawVersion: WRITTEN_AT })?.runId)
      .toBe("r-0030");
  });

  /* Dữ liệu hỏng KHÔNG được ném: một `run.json` do bản agent khác ghi mà giết cả panel
     chính là bệnh đã một lần làm trắng màn kết quả (xem `types/api.ts`). */
  it("hình dạng lạ ⇒ null chứ không ném", () => {
    expect(measureOfSheet(null, "chinh-ui")).toBeNull();
    expect(measureOfSheet([null, 7, "x"], "chinh-ui")).toBeNull();
    expect(measureOfSheet([{ id: "r-1", jobs: "hỏng" }], "chinh-ui")).toBeNull();
    expect(measureOfSheet([run("r-1", [{ file: "a", cell: 0, expected: "x", actual: null }])], "chinh-ui"))
      .toBeNull();
  });

  it("ô CỐ Ý BỎ TRỐNG (không hộp nào) bị loại, ô còn lại vẫn về", () => {
    const cells = [{ file: "pad", cell: 0, status: "empty", expected: null, actual: null }, CELLS[1]];
    expect(measureOfSheet([run("r-1", cells)], "chinh-ui")?.cells.map((c) => c.name))
      .toEqual(["02-avatar-frame"]);
  });
});

describe("dời toạ độ từ trong-ô ra cả-tấm", () => {
  const overlay = () => sheetOverlay(SHEET, measureOfSheet([run("r-0030")], "chinh-ui"));

  it("khổ lớp phủ = khổ ảnh gốc, nên nó co giãn cùng ảnh mà không cần đo màn hình", () => {
    const o = overlay();
    expect(o?.width).toBe(1254);
    expect(o?.height).toBe(1254);
    expect(o?.cols).toBe(2);
  });

  it("ô số 1 nằm ở cột 2 — hộp của nó phải cộng thêm đúng một bề ngang ô", () => {
    const cell = overlay()?.cells[1];
    expect(cell?.col).toBe(1);
    expect(cell?.row).toBe(0);
    expect(cell?.cell).toEqual({ x: 627, y: 0, w: 627, h: 627 });
    expect(cell?.expectedAt).toEqual({ x: 770, y: 143, w: 341, h: 341 });
    expect(cell?.actualAt).toEqual({ x: 676, y: 134, w: 538, h: 461 });
  });

  it("ô vượt quá số hàng của lưới thì BỎ, không vẽ ra ngoài tấm", () => {
    const far = [{ ...CELLS[0], cell: 9 }];
    expect(sheetOverlay(SHEET, measureOfSheet([run("r-1", far)], "chinh-ui"))).toBeNull();
  });

  it("không có số đo ⇒ không có lớp phủ", () => {
    expect(sheetOverlay(SHEET, null)).toBeNull();
  });
});

describe("nhãn góc ô", () => {
  const cells = () => sheetOverlay(SHEET, measureOfSheet([run("r-1")], "chinh-ui"))?.cells ?? [];

  /* Cạnh xa nhất lấy từ `edgesPx` (có dấu, cả bốn cạnh) chứ KHÔNG lấy `maxEdgePx`:
     `maxEdgePx` chỉ đếm phần thụt vào, nên ô vẽ tràn hẳn ra ngoài sẽ mang số 0 — đúng
     cho việc chấm điểm, và sai hẳn cho câu «món này lệch bao nhiêu». */
  it("nói tên món + cạnh lệch xa nhất, làm tròn về pixel", () => {
    expect(cellBadge(cells()[0]!)).toBe("01-button · lệch 128px");
    expect(cellBadge(cells()[1]!)).toBe("02-avatar-frame · lệch 111px");
  });

  it("không đo được cạnh nào ⇒ chỉ còn tên, không bịa ra số 0", () => {
    const bare = [{ file: "03-progress", cell: 0, status: "ok", expected: [1, 2, 3, 4], actual: null }];
    const only = sheetOverlay(SHEET, measureOfSheet([run("r-1", bare)], "chinh-ui"))?.cells ?? [];
    expect(cellBadge(only[0]!)).toBe("03-progress");
  });

  /* ── LỆCH TỈ LỆ ĐỨNG CẠNH LỆCH PIXEL (14/09/2026) ────────────────────────────
     Prompt thôi hứa hộp pixel: trên chính lượt r-0021 ở trên, model vẽ đúng tâm mà
     lõi 587px nằm trong hộp hứa 368px — mọi ô lệch 1,5–1,7 lần, qua codex lẫn qua
     web ChatGPT. Thứ nó hứa nay là TỈ LỆ, và đó là thứ web KHÔNG co về được. */
  it("có lệch tỉ lệ thì nhãn nói cả hai, mỗi thứ một đơn vị", () => {
    const co = [{
      file: "01-button", cell: 0, status: "ok",
      expected: [129.5, 249.5, 368, 128], actual: [38, 281, 587, 168],
      deviation: { edgesPx: { left: 0, top: 0, right: 12, bottom: 0 }, maxEdgePx: 12 },
      aspectDeviation: { value: 0.1234, flagged: false, threshold: 0.15 },
    }];
    const cell = sheetOverlay(SHEET, measureOfSheet([run("r-1", co)], "chinh-ui"))!.cells[0]!;
    expect(cell.aspectOff).toBeCloseTo(0.1234, 4);
    expect(cellBadge(cell)).toBe("01-button · lệch 12px · tỉ lệ lệch 12%");
  });

  it("số đo đời cũ không có khối tỉ lệ ⇒ nhãn giữ nguyên như trước, không thêm '0%'", () => {
    expect(cells()[0]!.aspectOff).toBeNull();
    expect(cellBadge(cells()[0]!)).toBe("01-button · lệch 128px");
  });
});
