import { CANVAS_SQUARE } from "@/features/kit-core/lib/geometry";

/**
 * pose-sheet.ts — GHÉP ẢNH MANƠCANH CỦA NHIỀU DÒNG THÀNH MỘT TẤM.
 *
 * ╔══ VÌ SAO PHẢI GHÉP, THAY VÌ ĐÍNH TỪNG ẢNH MỘT ═══════════════════════════╗
 * ║ Tool `image_gen` của codex nhận `referenced_image_paths` — MỘT danh sách   ║
 * ║ ảnh dùng chung cho cả tấm, không có chỗ nào để nói "ảnh này dành cho ô 3". ║
 * ║ Đính chín ảnh manơcanh rời cho một tấm chín dáng thì model phải tự đoán    ║
 * ║ ảnh nào ứng với ô nào, và nó sẽ đoán bằng thứ tự — thứ mà `gen.sh` vừa mất ║
 * ║ công bỏ đi (xem khối "KHÔNG CÒN The SECOND attached image" ở đó).          ║
 * ║ Một tấm DUY NHẤT, cùng lưới và cùng toạ độ ô với tấm sắp vẽ, thì không còn ║
 * ║ gì để đoán: "ô k của tấm manơcanh là dáng của ô k ở đây".                  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ HÌNH HỌC LẤY TỪ ĐÂU ═══════════════════════════════════════════════════
 * Toạ độ ô phải là ĐÚNG toạ độ mà `geometry.py` tính (`cell_origin`/`cell_size`),
 * nếu không thì ô thứ k của tấm manơcanh không nằm chồng lên ô thứ k của tấm sẽ
 * vẽ — và một ảnh tham chiếu lệch ô còn tệ hơn không có ảnh nào. Phép chia của
 * engine được viết lại ở `cellBoxes()` dưới đây và bị khoá bằng ca test đọc thẳng
 * `geometry.py`.
 */

/**
 * ╔══ TẤM GHÉP KHÔNG CÓ NỀN, VÀ ĐÓ LÀ CẢ VẤN ĐỀ ══════════════════════════════════╗
 * ║ Bản trước tô kín tấm bằng màu trắng đặc rồi mới vẽ manơcanh lên. PNG gửi đi   ║
 * ║ vẫn là RGBA, nhưng alpha = 255 ở TOÀN BỘ tấm — đo trên tấm thật của một dự    ║
 * ║ án (`refs/char-pose-sheet-*.png`): không một pixel nào có alpha 0. Máy vẽ bắt ║
 * ║ chước ảnh tham chiếu ở mọi tầng, kể cả tầng nền, nên tấm nhân vật nó trả về   ║
 * ║ cũng đục kín rồi rơi thẳng vào cổng alpha của `gen.sh`.                       ║
 * ║                                                                               ║
 * ║ Nên tấm này để TRỐNG: canvas vừa tạo vốn đã alpha 0 khắp nơi, việc duy nhất   ║
 * ║ phải làm là đừng tô gì lên. Manơcanh xám vẫn đọc rõ trên nền trống.           ║
 * ║                                                                               ║
 * ║ Cách chữa nằm ở ẢNH, không phải ở một câu dặn thêm trong prompt: prompt chỉ   ║
 * ║ tả thứ MUỐN vẽ, còn nền của ảnh đính kèm thì tự nó nói.                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * ĐỜI CỦA BỘ DỰNG ẢNH DÁNG — nằm trong vân tay `poseSheetKey`.
 *
 * ╔══ VÌ SAO PHẢI CÓ MỘT CON SỐ Ở ĐÂY ═══════════════════════════════════════════╗
 * ║ Vân tay của tấm ghép chỉ gồm lưới + cặp (dáng, góc). Đổi CÁCH VẼ manơcanh   ║
 * ║ (bỏ nền trắng, đổi màu, đổi góc máy) mà vân tay không đổi thì đường nhanh    ║
 * ║ của `ensurePoseRefs` thấy "tấm còn tươi" và dùng lại tệp cũ MÃI MÃI — đo    ║
 * ║ được: sau khi bỏ nền trắng, dự án thật vẫn đính tấm nền trắng của hôm trước ║
 * ║ vì không một lượt Vẽ nào chụp lại. Tăng số này mỗi lần bộ dựng đổi ảnh ra.  ║
 * ║   1 — nền trắng đặc (đời đầu).  2 — nền trống alpha 0.                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */
export const POSE_RENDER_VERSION = 2;

export interface PoseSheetBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `round()` CỦA PYTHON, không phải `Math.round()` của JS.
 *
 * ╔══ MỘT PIXEL, VÀ NÓ CÓ THẬT ══════════════════════════════════════════════╗
 * ║ Python làm tròn NỬA VỀ SỐ CHẴN: `round(940.5) == 940`. JS làm tròn nửa    ║
 * ║ LÊN: `Math.round(940.5) == 941`. Lưới 4 cột trên khổ 1254 rơi đúng vào ca ║
 * ║ ấy (ô thứ tư: 3 × 313,5 = 940,5) — dùng `Math.round` thì mọi ô của cột    ║
 * ║ cuối lệch 1px so với ô mà `slice.py` sẽ cắt. Không ai thấy được 1px trên  ║
 * ║ một tấm manơcanh, nhưng nó là 1px SAI HƯỚNG ở đúng cái tấm sinh ra để     ║
 * ║ nói "ô này khớp ô kia".                                                   ║
 * ║ Bản mirror ở `design/preview/geometry.ts` vẫn dùng `Math.round` và điều đó ║
 * ║ ĐÚNG cho việc của nó: nó vẽ một khung xem trước cho người nhìn, không     ║
 * ║ dựng một ảnh gửi cho máy vẽ.                                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
function pyRound(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest > 0.5) return floor + 1;
  if (rest < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Hộp của từng ô trên tấm vuông `size × size` chia lưới `cols × rows`.
 *
 * Chép ĐÚNG hai hàm của `geometry.py`:
 *   · `cell_size`   → `round(size / cols)`, `round(size / rows)`;
 *   · `cell_origin` → `round(col * size / cols)` — làm tròn TỪ TOẠ ĐỘ THẬT chứ
 *     không cộng dồn `col * CW`, vì cộng dồn tích luỹ sai số khi khổ không chia
 *     hết và ô cuối hàng trượt khỏi mép.
 */
export function cellBoxes(cols: number, rows: number, count: number, size: number = CANVAS_SQUARE.w): PoseSheetBox[] {
  const cw = pyRound(size / cols);
  const ch = pyRound(size / rows);
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return { x: pyRound((col * size) / cols), y: pyRound((row * size) / rows), w: cw, h: ch };
  });
}

/**
 * Vẽ một ảnh vuông vào một ô sao cho VỪA KHÍT mà không méo.
 *
 * Ô của tấm vuông chia lưới n×n vốn đã vuông, nên phép này gần như luôn là 1:1 —
 * nhưng lưới không vuông vẫn xảy ra được (`squareGrid` kẹp trần 4), và một manơcanh
 * bị kéo dẹt là một chỉ thị sai về TỈ LỆ NGƯỜI gửi thẳng tới máy vẽ.
 */
export function fitBox(box: PoseSheetBox, srcW: number, srcH: number): PoseSheetBox {
  if (srcW <= 0 || srcH <= 0) return box;
  const scale = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Môi trường này có ghép được ảnh không — kiểm TRƯỚC khi bắt đầu chụp. */
export function canComposePoseSheet(): boolean {
  if (typeof document === "undefined" || typeof document.createElement !== "function") return false;
  return typeof document.createElement("canvas").getContext === "function";
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh dáng vừa dựng"));
    img.src = dataUrl;
  });
}

/**
 * Nhiều ảnh manơcanh (data URL) → MỘT data URL PNG.
 *
 * `shots[k]` là ảnh của ô thứ k; chuỗi rỗng nghĩa là ô đó không dựng được ảnh —
 * ô ấy để TRỐNG (alpha 0) chứ không bị bỏ qua, vì bỏ qua sẽ đẩy mọi ô sau lên một
 * chỗ và cả tấm hết khớp với tấm sắp vẽ.
 *
 * Ném khi không có canvas: nơi gọi coi đó là "vẽ bằng chữ" chứ không phải lỗi —
 * xem `ensurePoseRefs`.
 */
export async function composePoseSheet(
  shots: readonly string[],
  cols: number,
  rows: number,
  size: number = CANVAS_SQUARE.w,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt này không dựng được tấm ảnh dáng");

  const boxes = cellBoxes(cols, rows, shots.length, size);
  for (const [index, shot] of shots.entries()) {
    const box = boxes[index];
    if (!shot || !box) continue;
    const img = await loadImage(shot);
    const fit = fitBox(box, img.naturalWidth || img.width, img.naturalHeight || img.height);
    ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
  }

  return canvas.toDataURL("image/png");
}
