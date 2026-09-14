/**
 * features/prompt-canvas/lib/result/sheet-geometry.ts
 * ────────────────────────────────────────────────────────────────────────────
 * SỐ ĐO HÌNH HỌC CỦA MỘT TẤM → toạ độ để vẽ lớp phủ lên chính ảnh vừa gen.
 *
 * ╔══ KHÔNG ĐO LẠI GÌ HẾT — CHỈ DỌN ĐƯỜNG CHO CÁI ĐÃ ĐO ═════════════════════╗
 * ║ `validate_output_geometry.py` đã đo từng ô bằng ĐÚNG pixel của ảnh: hộp    ║
 * ║ vùng an toàn mà prompt hứa (`expected`) và hộp thân món máy vẽ ra          ║
 * ║ (`actual`, bbox alpha ≥ 128). Kết quả nằm hai chỗ, cùng một nội dung:      ║
 * ║ file `runs/<lượt>/artifacts/<tấm>.geometry.json` và — tiện hơn cho web —   ║
 * ║ `run.json` ở `jobs[].artifact.validation`, thứ `#33`/`#34` trả sẵn.        ║
 * ║ File này CHỈ đọc bản ấy rồi dời toạ độ từ trong-ô ra toàn-tấm. Tự đo lại   ║
 * ║ bằng canvas ở tầng web là dựng bản thứ hai của sự thật, và bản thứ hai     ║
 * ║ luôn là bản không ai đối chiếu.                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO ĐỌC `unknown` CHỨ KHÔNG DÙNG KIỂU CỦA `types/api.ts` ════════════╗
 * ║ `runJobSchema` khai `validation` tới mức ĐỦ ĐỂ ĐẾM ô đỏ, không tới mức     ║
 * ║ mang theo `expected`/`actual`/`deviation` — chúng vẫn về (schema là        ║
 * ║ `looseObject`) nhưng không có mặt trong kiểu. Nới schema ấy ra thì mọi giá ║
 * ║ trị lạ trong một file `run.json` cũ lại thành một đường ném mới, mà chính  ║
 * ║ chỗ đó đã một lần giết cả màn kết quả (xem khối «BA GIÁ TRỊ» trong         ║
 * ║ `types/api.ts`). Nên chỗ đọc nằm ở đây, đọc phòng thủ từ `unknown`, và mọi ║
 * ║ hình dạng lạ chỉ dẫn tới «không có số đo» — một lớp phủ tắt, không phải    ║
 * ║ một màn trắng.                                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import type { Sheet } from "@/lib/types/contract";
import { canvasOf, gridOf } from "@/features/kit-core/lib/geometry";

/** `[x, y, w, h]`. Toạ độ TRONG MỘT Ô khi đọc từ số đo, TRONG CẢ TẤM sau khi dời. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Một ô đã đo — bản đã dọn của một phần tử `cells[]` trong số đo. */
export interface MeasuredCell {
  /** Tên món (`file` của số đo), dùng làm nhãn góc ô. */
  name: string;
  /** Số thứ tự ô trong tấm, quét theo hàng — đây là thứ quyết định ô nằm đâu. */
  index: number;
  /** Máy chấm «cần vẽ lại» ⇒ nhãn tô đỏ. */
  regenerate: boolean;
  /** Hộp vùng an toàn mà prompt đã hứa; `null` = ô cố ý bỏ trống. */
  expected: Box | null;
  /** Hộp thân món đo được (alpha ≥ 128); `null` = không tìm thấy thân. */
  actual: Box | null;
  /** Cạnh lệch xa nhất, px. `null` = không đo được cạnh nào. */
  offsetPx: number | null;
  /**
   * LỆCH TỈ LỆ, dạng phân số (0,12 = 12%). `null` = ô chưa đặt cỡ, hoặc số đo đời cũ.
   *
   * Từ 14/09/2026 prompt KHÔNG còn hứa một hộp pixel nào — đo lượt r-0021: model vẽ
   * đúng tâm, đúng ô, mà lõi 587px nằm trong hộp hứa 368px; mọi ô lệch 1,5–1,7 lần,
   * qua codex lẫn khi dán tay vào web ChatGPT. Thứ prompt hứa nay là TỈ LỆ W:H của
   * lõi, và đó là thứ DUY NHẤT không sửa được ở hạ nguồn: web co lõi đo được về
   * `outSize`, co đồng dạng thì không méo, sai tỉ lệ thì chỉ còn cách chèn viền rỗng.
   * `offsetPx` ở lại cạnh nó: hai con số, hai câu hỏi khác nhau.
   */
  aspectOff: number | null;
}

/** Số đo của CẢ TẤM, kèm dấu vết nó từ đâu ra. */
export interface SheetMeasure {
  /** Lượt chạy đã đo. */
  runId: string;
  /** Mốc ghi ảnh gốc của lượt đó — dùng để biết số đo có thuộc về ảnh đang xem không. */
  writtenAt: string | null;
  cells: MeasuredCell[];
}

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** `[x, y, w, h]` của python → `Box`. Bốn số hữu hạn và `w`/`h` dương, không thì bỏ. */
function box(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length < 4) return null;
  const [x, y, w, h] = [num(v[0]), num(v[1]), num(v[2]), num(v[3])];
  if (x === null || y === null || w === null || h === null) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/**
 * LỆCH XA NHẤT CỦA MỘT Ô, px.
 *
 * `deviation.edgesPx` là bốn con số CÓ DẤU: mỗi cạnh của hộp đo được cách cạnh
 * tương ứng của hộp đã hứa bao nhiêu. Lấy trị tuyệt đối lớn nhất vì đó chính là
 * thứ mắt nhìn ra — «món này thò ra/thụt vào chừng ấy pixel».
 *
 * `maxEdgePx` (nếu có) chỉ đếm phần THỤT VÀO (undershoot), nên nó bằng 0 ở một ô
 * vẽ tràn hẳn ra ngoài hộp — đúng cho việc chấm điểm, sai cho việc kể lại độ lệch.
 * Vì thế `edgesPx` là nguồn chính, `maxEdgePx` chỉ là đường lùi cho số đo đời cũ.
 */
function offsetOf(deviation: unknown): number | null {
  const d = rec(deviation);
  if (d === null) return null;
  const edges = rec(d["edgesPx"]);
  if (edges !== null) {
    const vals = ["left", "top", "right", "bottom"]
      .map((k) => num(edges[k]))
      .filter((v): v is number => v !== null)
      .map(Math.abs);
    if (vals.length > 0) return Math.max(...vals);
  }
  return num(d["maxEdgePx"]);
}

/** Một phần tử `cells[]` → `MeasuredCell`. `null` khi không đủ để vẽ gì. */
function measuredCell(raw: unknown, fallbackIndex: number): MeasuredCell | null {
  const c = rec(raw);
  if (c === null) return null;
  const expected = box(c["expected"]);
  const actual = box(c["actual"]);
  if (expected === null && actual === null) return null;
  return {
    name: str(c["file"]),
    index: num(c["cell"]) ?? fallbackIndex,
    regenerate: str(c["status"]) === "regenerate",
    expected,
    actual,
    offsetPx: offsetOf(c["deviation"]),
    aspectOff: num(rec(c["aspectDeviation"])?.["value"]),
  };
}

/** Một job trong `run.json` → số đo của tấm, nếu job ấy đúng tên và có số đo. */
function measureOfJob(raw: unknown, job: string, runId: string): SheetMeasure | null {
  const j = rec(raw);
  if (j === null || str(j["job"]) !== job) return null;
  const artifact = rec(j["artifact"]);
  if (artifact === null) return null;
  const validation = rec(artifact["validation"]);
  if (validation === null) return null;
  const list = validation["cells"];
  if (!Array.isArray(list)) return null;
  const cells = list
    .map((c, i) => measuredCell(c, i))
    .filter((c): c is MeasuredCell => c !== null);
  if (cells.length === 0) return null;
  const writtenAt = str(artifact["writtenAt"]);
  return { runId, writtenAt: writtenAt === "" ? null : writtenAt, cells };
}

export interface MeasureLookup {
  /** Panel đang xem ảnh BẤT BIẾN của đúng lượt này ⇒ chỉ nhận số đo của nó. */
  runId?: string | null;
  /**
   * Mốc ghi của ẢNH GỐC ĐANG HIỆN (`#39`, bản «đang dùng»).
   *
   * ĐÂY LÀ CHỐT CHỐNG NÓI DỐI, không phải một tối ưu. Chọn một bản cũ ở thanh
   * phiên bản là GHI ĐÈ `raw/<tấm>.png` bằng file cũ, nên ảnh đang hiện có thể
   * không phải ảnh mà lượt mới nhất đã đo. Cả hai đầu đều lấy mốc từ cùng một
   * chỗ — mtime của chính file ấy, in ra bằng cùng một hàm — nên so bằng chuỗi
   * là so đúng, và lệch nghĩa là số đo thuộc về một tấm khác.
   * Bỏ trống (chưa đọc xong lịch sử) ⇒ KHÔNG chặn: thà hiện số đo mới nhất còn
   * hơn tắt lớp phủ vì một request chưa về.
   */
  rawVersion?: string | null;
}

/**
 * TÌM SỐ ĐO CỦA MỘT TẤM trong danh sách lượt chạy (`#33`, mới nhất đứng trước).
 *
 * Không có ⇒ `null`, và nút bật lớp phủ phải xám đi kèm lời giải thích. Đoán bừa
 * bằng số đo của một lượt khác là vẽ một cái lưới không thuộc về tấm đang nhìn —
 * tệ hơn hẳn việc không vẽ gì.
 */
export function measureOfSheet(
  runs: readonly unknown[] | undefined | null,
  job: string,
  lookup: MeasureLookup = {},
): SheetMeasure | null {
  if (!Array.isArray(runs) || job === "") return null;
  const wantRun = typeof lookup.runId === "string" ? lookup.runId.trim() : "";
  const rawVersion = typeof lookup.rawVersion === "string" ? lookup.rawVersion.trim() : "";
  for (const item of runs) {
    const r = rec(item);
    if (r === null) continue;
    const runId = str(r["id"]);
    if (wantRun !== "" && runId !== wantRun) continue;
    const jobs = r["jobs"];
    if (!Array.isArray(jobs)) continue;
    for (const j of jobs) {
      const measure = measureOfJob(j, job, runId);
      if (measure === null) continue;
      /* Ảnh của MỘT LƯỢT thì bất biến — không ai ghi đè nó, nên không phải so mốc. */
      if (wantRun !== "") return measure;
      if (rawVersion !== "" && measure.writtenAt !== null && measure.writtenAt !== rawVersion) {
        return null;
      }
      return measure;
    }
  }
  return null;
}

/** Một ô trên lớp phủ — toạ độ đã dời ra hệ của CẢ TẤM. */
export interface OverlayCell extends MeasuredCell {
  col: number;
  row: number;
  /** Khung của chính ô, trong hệ toạ độ tấm. */
  cell: Box;
  /** Hộp đã hứa, đã dời ra hệ toạ độ tấm. */
  expectedAt: Box | null;
  /** Hộp đo được, đã dời ra hệ toạ độ tấm. */
  actualAt: Box | null;
}

export interface SheetOverlay {
  /** Khổ ảnh gốc — dùng thẳng làm `viewBox`, nên lớp phủ co giãn cùng ảnh. */
  width: number;
  height: number;
  cols: number;
  rows: number;
  cells: OverlayCell[];
}

const shift = (b: Box | null, dx: number, dy: number): Box | null =>
  b === null ? null : { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };

/**
 * DỰNG LỚP PHỦ: số đo (toạ độ trong ô) + khổ tấm ⇒ toạ độ trong cả tấm.
 *
 * ╔══ LÀM TRÒN THEO ĐÚNG CÁCH CỦA BÊN ĐO ════════════════════════════════════╗
 * ║ `validate_output_geometry.py` cắt ô bằng `round(col*cw)`…`round((col+1)*cw)`║
 * ║ với `cw` là số THẬT (`ảnh / số cột`), y hệt `geometry.cell_origin`. Cộng   ║
 * ║ dồn `col * round(cw)` thay vào đó thì ô cuối hàng trượt khỏi mép khi khổ   ║
 * ║ không chia hết (1536/5 = 307,2) — và một cái lưới lệch vài pixel là đúng   ║
 * ║ thứ lớp phủ này sinh ra để bác bỏ.                                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function sheetOverlay(
  sheet: Pick<Sheet, "orient" | "canvas" | "grid"> | null | undefined,
  measure: SheetMeasure | null,
): SheetOverlay | null {
  if (measure === null) return null;
  const canvas = canvasOf(sheet);
  const grid = gridOf(sheet);
  const cw = canvas.w / grid.cols;
  const ch = canvas.h / grid.rows;
  const cells: OverlayCell[] = [];
  for (const c of measure.cells) {
    const col = c.index % grid.cols;
    const row = Math.floor(c.index / grid.cols);
    if (row >= grid.rows) continue;
    const x0 = Math.round(col * cw);
    const y0 = Math.round(row * ch);
    const cell: Box = {
      x: x0,
      y: y0,
      w: Math.round((col + 1) * cw) - x0,
      h: Math.round((row + 1) * ch) - y0,
    };
    cells.push({
      ...c,
      col,
      row,
      cell,
      expectedAt: shift(c.expected, x0, y0),
      actualAt: shift(c.actual, x0, y0),
    });
  }
  if (cells.length === 0) return null;
  return { width: canvas.w, height: canvas.h, cols: grid.cols, rows: grid.rows, cells };
}

/**
 * Nhãn góc ô: tên món + cạnh lệch xa nhất + lệch tỉ lệ.
 *
 * Hai số đứng cạnh nhau chứ không thay nhau, vì chúng trả lời hai câu khác nhau:
 * «món này thò ra/thụt vào bao nhiêu pixel so với hộp đã hứa» và «nó có đúng DÁNG
 * không». Từ 14/09/2026 chỉ câu thứ hai là thứ prompt còn hứa (hộp pixel đã rút:
 * model vẽ đúng tâm mà cỡ gấp 1,5–1,7 lần ở mọi ô), nhưng câu thứ nhất vẫn là số
 * người dùng đang đọc — nên giữ cả hai, ngắn.
 * Không đo được gì ⇒ chỉ còn tên; không có tên ⇒ chỉ còn số.
 */
export function cellBadge(cell: OverlayCell): string {
  const name = cell.name.trim();
  const notes: string[] = [];
  if (cell.offsetPx !== null) notes.push(`lệch ${Math.round(cell.offsetPx)}px`);
  if (cell.aspectOff !== null) notes.push(`tỉ lệ lệch ${Math.round(cell.aspectOff * 100)}%`);
  if (notes.length === 0) return name;
  const note = notes.join(" · ");
  return name === "" ? note : `${name} · ${note}`;
}
