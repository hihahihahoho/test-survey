/**
 * sketch-model.ts — MÔ HÌNH của bản vẽ tay + hàm VẼ LẠI. Không React, không DOM
 * ngoài `CanvasRenderingContext2D` được truyền vào ⇒ test được ở môi trường `node`
 * bằng một ctx giả ghi lại lời gọi.
 *
 * ╔══ VÌ SAO GIỮ NÉT THÀNH DỮ LIỆU RỒI VẼ LẠI TOÀN BỘ ═══════════════════════╗
 * ║ Cách rẻ hơn là vẽ thẳng lên canvas và coi pixel là nguồn sự thật. Nhưng    ║
 * ║ undo/redo khi đó bắt buộc phải chụp ImageData mỗi nét — vài MB mỗi bước    ║
 * ║ với khổ 1024². Giữ danh sách nét thì undo là `pop()`, và toàn bộ mô hình   ║
 * ║ là JSON thuần nên test được mà không cần jsdom hay WebGL.                  ║
 * ║ Giá phải trả: mỗi thay đổi vẽ lại từ đầu. Với vài trăm nét ở 1024² thì     ║
 * ║ chi phí này không đo được — đây là khổ một ô element, không phải một bức   ║
 * ║ tranh.                                                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/** Khổ vẽ VUÔNG: một sketch = một element = một ô spritesheet. Xem `sketch-targets.ts`. */
export const SKETCH_SIZE = 1024;

export type SketchTool = "pen" | "eraser";

/** Điểm lưu PHẲNG `[x0,y0,x1,y1,…]` theo pixel của canvas (không phải pixel màn
 *  hình) — nét vẫn đúng khi cửa sổ đổi cỡ hoặc khi DPR khác nhau. */
export interface Stroke {
  tool: SketchTool;
  width: number;
  points: number[];
}

export interface SketchState {
  strokes: Stroke[];
  /** Nét đã undo, chờ redo. Vẽ nét mới thì DỌN — nhánh lịch sử cũ không quay lại được. */
  undone: Stroke[];
}

export const emptySketch = (): SketchState => ({ strokes: [], undone: [] });

/** Ba cỡ nét. Số to vì đây là pixel của khổ 1024², không phải pixel màn hình. */
export const PEN_SIZES: readonly { id: string; label: string; width: number }[] = [
  { id: "thin", label: "Mảnh", width: 6 },
  { id: "medium", label: "Vừa", width: 14 },
  { id: "thick", label: "Đậm", width: 30 },
];

export const ERASER_WIDTH = 48;

export function pushStroke(state: SketchState, stroke: Stroke): SketchState {
  /* Nét dưới 2 điểm là một cú chạm lỡ tay — bỏ, để undo không tiêu một bước vào
     thứ không nhìn thấy được. (Chấm cố ý thì `startStroke` đã nhân đôi điểm.) */
  if (stroke.points.length < 4) return state;
  return { strokes: [...state.strokes, stroke], undone: [] };
}

export function undo(state: SketchState): SketchState {
  const last = state.strokes[state.strokes.length - 1];
  if (!last) return state;
  return { strokes: state.strokes.slice(0, -1), undone: [...state.undone, last] };
}

export function redo(state: SketchState): SketchState {
  const last = state.undone[state.undone.length - 1];
  if (!last) return state;
  return { strokes: [...state.strokes, last], undone: state.undone.slice(0, -1) };
}

/** Xoá trắng — CỐ Ý không giữ lại để redo: "xoá trắng" phải là một hành động dứt
 *  khoát, và người dùng đã được hỏi trước khi mất nét (xem `SketchTab`). */
export const clearSketch = (): SketchState => emptySketch();

export function hasInk(state: SketchState): boolean {
  return state.strokes.length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   NGƯỜI QUE GỢI Ý — chỉ cho đích "dáng nhân vật"
   ══════════════════════════════════════════════════════════════════════════
   Đây là món dành cho người KHÔNG BIẾT VẼ: một khung xương mờ để đồ theo. Nó là
   NÉT NỀN, không phải nét của người dùng — nên không nằm trong `strokes`, không
   undo được, và (quan trọng nhất) VẪN in vào ảnh xuất ra. Cố ý in: một bản phác
   có khung tỉ lệ đúng còn đọc được, một bản phác lệch tỉ lệ thì máy vẽ chỉ học
   được cái lệch. */
export type GuideShape =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number };

/** Người que tỉ lệ CHIBI (đầu ~1/3 chiều cao), toạ độ chuẩn hoá 0..1 rồi nhân
 *  `size` — cùng tỉ lệ với manơcanh 3D ở tab bên cạnh, để hai đường vào cùng cho
 *  ra một nhân vật chứ không phải hai. */
export function guideFigure(size: number): GuideShape[] {
  const p = (nx: number, ny: number): [number, number] => [nx * size, ny * size];
  const line = (a: [number, number], b: [number, number]): GuideShape => ({
    kind: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1],
  });

  const head = p(0.5, 0.2);
  const neck = p(0.5, 0.34);
  const hip = p(0.5, 0.58);
  const shoulderL = p(0.38, 0.37);
  const shoulderR = p(0.62, 0.37);
  const elbowL = p(0.31, 0.47);
  const elbowR = p(0.69, 0.47);
  const handL = p(0.28, 0.58);
  const handR = p(0.72, 0.58);
  const hipL = p(0.44, 0.58);
  const hipR = p(0.56, 0.58);
  const kneeL = p(0.43, 0.73);
  const kneeR = p(0.57, 0.73);
  const footL = p(0.42, 0.88);
  const footR = p(0.58, 0.88);

  return [
    { kind: "circle", x: head[0], y: head[1], r: 0.12 * size },
    line(neck, hip),
    line(shoulderL, shoulderR),
    line(shoulderL, elbowL), line(elbowL, handL),
    line(shoulderR, elbowR), line(elbowR, handR),
    line(hipL, kneeL), line(kneeL, footL),
    line(hipR, kneeR), line(kneeR, footR),
    line(hipL, hipR),
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
   VẼ LẠI
   ══════════════════════════════════════════════════════════════════════════ */

export interface DrawOptions {
  size: number;
  /** Có in người que gợi ý làm nét nền hay không. */
  guide: boolean;
  /** Nét ĐANG kéo (chưa nhả chuột) — vẽ cùng lượt để không nháy. */
  live?: Stroke | null;
}

/**
 * Vẽ toàn bộ bản phác lên ctx. Luôn TÔ TRẮNG trước: canvas mặc định trong suốt,
 * và một PNG có alpha đính làm ảnh tham chiếu sẽ ra nền đen ở phần lớn pipeline.
 * Nền trắng đặc cũng chính là thứ ảnh reference cần (sạch, không có gì để bắt chước
 * ngoài nét vẽ).
 */
export function drawSketch(ctx: CanvasRenderingContext2D, state: SketchState, opts: DrawOptions): void {
  const { size } = opts;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  if (opts.guide) {
    ctx.strokeStyle = "#c9cdd4";
    ctx.lineWidth = Math.max(2, size * 0.006);
    ctx.lineCap = "round";
    for (const shape of guideFigure(size)) {
      ctx.beginPath();
      if (shape.kind === "circle") ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
      else { ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); }
      ctx.stroke();
    }
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const all = opts.live ? [...state.strokes, opts.live] : state.strokes;
  for (const stroke of all) strokePath(ctx, stroke);
  ctx.restore();
}

/**
 * Một nét. Tẩy KHÔNG dùng `destination-out` mà vẽ bằng MÀU TRẮNG — vì nền đã là
 * trắng đặc, tẩy bằng màu nền cho kết quả giống hệt mà lại không đục thủng alpha,
 * nên ảnh xuất ra vẫn là PNG đặc hoàn toàn. `destination-out` sẽ khoét cả nền và
 * để lại lỗ trong suốt đúng chỗ người dùng tẩy.
 */
function strokePath(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const pts = stroke.points;
  if (pts.length < 4) return;
  ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : "#111418";
  ctx.lineWidth = stroke.width;
  ctx.beginPath();
  ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  /* Làm mượt bằng đường bậc hai qua TRUNG ĐIỂM hai điểm liên tiếp: điểm gốc thành
     điểm điều khiển. Rẻ, không cần thư viện, và bỏ hẳn cái "gãy khúc" của pointer
     event thưa khi kéo nhanh. */
  for (let i = 2; i + 3 < pts.length; i += 2) {
    const cx = pts[i] ?? 0;
    const cy = pts[i + 1] ?? 0;
    const mx = (cx + (pts[i + 2] ?? 0)) / 2;
    const my = (cy + (pts[i + 3] ?? 0)) / 2;
    ctx.quadraticCurveTo(cx, cy, mx, my);
  }
  ctx.lineTo(pts[pts.length - 2] ?? 0, pts[pts.length - 1] ?? 0);
  ctx.stroke();
}
