import * as React from "react";
import { Camera, Eraser, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  ERASER_WIDTH, PEN_SIZES, SKETCH_SIZE, clearSketch, drawSketch, emptySketch,
  hasInk, pushStroke, redo, undo, type SketchState, type SketchTool, type Stroke,
} from "../lib/sketch-model";
import {
  CUSTOM_TARGET, MASCOT_POSE_TARGET, targetGroups, targetLabel,
} from "../lib/sketch-targets";

/**
 * SketchTab — VẼ TAY MỘT ELEMENT.
 *
 * ╔══ CANVAS 2D THUẦN, KHÔNG THÊM THƯ VIỆN ══════════════════════════════════╗
 * ║ `perfect-freehand` cho nét đẹp hơn (nét biến thiên theo tốc độ/áp lực),   ║
 * ║ nhưng nó đổi hẳn mô hình vẽ: mỗi nét thành một ĐA GIÁC phải fill chứ      ║
 * ║ không phải một đường phải stroke, và tẩy thì phải xử lý riêng. Với một    ║
 * ║ bản phác nguệch ngoạc để máy vẽ đọc bố cục, cái được thêm gần bằng không. ║
 * ║ Đường bậc hai qua trung điểm (xem `strokePath`) đã bỏ hết chỗ gãy khúc.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface SketchTabProps {
  onShot: (label: string, dataUrl: string) => void;
}

export function SketchTab({ onShot }: SketchTabProps) {
  const [target, setTarget] = React.useState(MASCOT_POSE_TARGET);
  const [custom, setCustom] = React.useState("");
  const [tool, setTool] = React.useState<SketchTool>("pen");
  const [penWidth, setPenWidth] = React.useState(PEN_SIZES[1]?.width ?? 14);
  const [guide, setGuide] = React.useState(true);
  const [sketch, setSketch] = React.useState<SketchState>(emptySketch);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  /* Nét đang kéo giữ trong REF chứ không phải state: pointermove bắn ~120 lần/giây,
     `setState` mỗi lần là 120 lần render React cho một việc mà canvas tự vẽ được. */
  const live = React.useRef<Stroke | null>(null);
  const drawing = React.useRef(false);

  /* Người que gợi ý chỉ có nghĩa với "dáng nhân vật" — đồ theo khung xương người
     khi đang vẽ cái nút bấm thì nó chỉ là rác trong ảnh xuất ra. */
  const guideAllowed = target === MASCOT_POSE_TARGET;
  const showGuide = guide && guideAllowed;

  const repaint = React.useCallback((state: SketchState, liveStroke: Stroke | null) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawSketch(ctx, state, { size: SKETCH_SIZE, guide: showGuide, live: liveStroke });
  }, [showGuide]);

  React.useEffect(() => { repaint(sketch, live.current); }, [sketch, repaint]);

  /** Toạ độ con trỏ → pixel của canvas 1024². Không dùng `offsetX` vì nó tính theo
   *  pixel CSS, mà canvas đang bị co lại cho vừa cột. */
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = SKETCH_SIZE / (rect.width || 1);
    return [(e.clientX - rect.left) * scale, (e.clientY - rect.top) * scale];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = toCanvas(e);
    /* Điểm nhân đôi để một cú CHẤM (down rồi up tại chỗ) vẫn ra một dấu chấm —
       `strokePath` cần tối thiểu hai điểm mới vẽ được gì. */
    live.current = {
      tool,
      width: tool === "eraser" ? ERASER_WIDTH : penWidth,
      points: [x, y, x, y],
    };
    repaint(sketch, live.current);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !live.current) return;
    const [x, y] = toCanvas(e);
    live.current.points.push(x, y);
    repaint(sketch, live.current);
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = live.current;
    live.current = null;
    if (stroke) setSketch((prev) => pushStroke(prev, stroke));
  };

  /** Đổi món ⇒ khung vẽ phải trắng lại (một sketch = một món). HỎI trước khi
   *  mất nét — mất bản vẽ vì lỡ tay đổi dropdown là kiểu mất mát khó tha thứ nhất. */
  const changeTarget = (next: string) => {
    if (hasInk(sketch)) {
      const ok = window.confirm("Đổi món sẽ xoá bản vẽ hiện tại. Lưu sketch trước rồi hãy đổi?\n\nOK = xoá và đổi.");
      if (!ok) return;
    }
    setSketch(clearSketch());
    setTarget(next);
  };

  const wipe = () => {
    if (hasInk(sketch) && !window.confirm("Xoá trắng toàn bộ bản vẽ?")) return;
    setSketch(clearSketch());
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onShot(targetLabel(target, custom), canvas.toDataURL("image/png"));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── KHUNG VẼ ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <canvas
          ref={canvasRef}
          width={SKETCH_SIZE}
          height={SKETCH_SIZE}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          className="w-full max-w-[520px] cursor-crosshair rounded-3 border border-line bg-[rgb(255_255_255)]"
          /* `touch-action: none` — thiếu nó thì trên máy cảm ứng, kéo để vẽ bị
             trình duyệt hiểu là cuộn trang và không có nét nào ra cả. */
          style={{ aspectRatio: "1 / 1", touchAction: "none" }}
        />
        <p className="text-caption text-fg-muted">
          Khổ vuông {SKETCH_SIZE}×{SKETCH_SIZE} — đúng tinh thần MỘT ô của spritesheet.
        </p>
      </div>

      {/* ── PANEL PHẢI ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-3 border border-line bg-surface p-3">
        <div>
          <label htmlFor="sketch-target" className="mb-1 block text-label font-medium text-fg-strong">
            Sketch cho element nào?
          </label>
          <select
            id="sketch-target"
            value={target}
            onChange={(e) => changeTarget(e.target.value)}
            className="h-ctl-md w-full rounded-1 border border-line bg-canvas px-2 text-body text-fg-strong"
          >
            {targetGroups().map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {target === CUSTOM_TARGET ? (
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Tên món bạn muốn vẽ…"
              className="mt-2 h-ctl-md w-full rounded-1 border border-line bg-canvas px-2 text-body text-fg-strong placeholder:text-fg-muted"
            />
          ) : null}
          <p className="mt-1 text-caption text-fg-muted">
            Danh mục lấy READ-ONLY từ thư viện 42 element của KitGen — để ảnh phác đính được vào đúng ô.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-label font-medium text-fg-strong">Công cụ</p>
          <div className="flex flex-wrap gap-1.5">
            {PEN_SIZES.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={tool === "pen" && penWidth === s.width ? "primary" : "secondary"}
                onClick={() => { setTool("pen"); setPenWidth(s.width); }}
              >
                <Pencil aria-hidden /> {s.label}
              </Button>
            ))}
            <Button size="sm" variant={tool === "eraser" ? "primary" : "secondary"} onClick={() => setTool("eraser")}>
              <Eraser aria-hidden /> Tẩy
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" disabled={sketch.strokes.length === 0} onClick={() => setSketch(undo)}>
              <Undo2 aria-hidden /> Hoàn tác
            </Button>
            <Button size="sm" variant="secondary" disabled={sketch.undone.length === 0} onClick={() => setSketch(redo)}>
              <Redo2 aria-hidden /> Làm lại
            </Button>
            <Button size="sm" variant="secondary" onClick={wipe}>
              <Trash2 aria-hidden /> Xoá trắng
            </Button>
          </div>
        </div>

        <div>
          <Button
            size="sm"
            variant={showGuide ? "primary" : "secondary"}
            disabled={!guideAllowed}
            onClick={() => setGuide((g) => !g)}
            className="w-full"
          >
            {showGuide ? "Đang hiện" : "Hiện"} khung xương gợi ý
          </Button>
          <p className={cn("mt-1 text-caption", guideAllowed ? "text-fg-muted" : "text-fg-muted opacity-70")}>
            {guideAllowed
              ? "Người que mờ để đồ theo — cho ai không quen vẽ. Nét này CÓ in vào ảnh xuất ra: khung tỉ lệ đúng còn đọc được, bản phác lệch tỉ lệ thì máy vẽ học luôn cái lệch."
              : "Chỉ có ở món “Dáng nhân vật”."}
          </p>
        </div>

        <Button variant="primary" onClick={save} disabled={!hasInk(sketch)}>
          <Camera aria-hidden /> 📸 Lưu sketch
        </Button>
        <p className="text-caption text-fg-muted">
          Sketch này sẽ đính làm tham chiếu cho đúng element đó trong spritesheet (1 sketch = 1 element).
        </p>
      </div>
    </div>
  );
}
