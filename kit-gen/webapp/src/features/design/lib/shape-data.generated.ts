/* SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
 * Nguồn: silhouettes.js · skeleton.py · agent/lib/validate.mjs · slice.py · styles.example.json
 * Sinh lại: node src/features/design/scripts/extract-shapes.mjs
 * Ca test __tests__/shape-source.test.ts đối chiếu lại file này với 5 nguồn trên.
 */

export interface ShapeMeta {
  id: string;
  label: string;
  /** silhouettes.js vẽ được (`empty` cố ý trả rỗng). */
  drawableSvg: boolean;
  /** skeleton.py (engine PIL) xử lý được. */
  drawablePy: boolean;
}

/** Whitelist = ĐÚNG tập agent chấp nhận. Client KHÔNG được hẹp hơn agent. */
export const SHAPE_META: readonly ShapeMeta[] = [
  {
    "id": "empty",
    "label": "Ô trống",
    "drawableSvg": false,
    "drawablePy": false
  },
  {
    "id": "pose",
    "label": "Dáng nhân vật",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "pill",
    "label": "Viên nhộng (pill)",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "bar",
    "label": "Thanh ngang (bar)",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "rrect",
    "label": "Chữ nhật bo góc",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "rect",
    "label": "Chữ nhật",
    "drawableSvg": false,
    "drawablePy": false
  },
  {
    "id": "circle",
    "label": "Tròn",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "burst",
    "label": "Tia nổ",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "puzzle",
    "label": "Mảnh ghép",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "figure",
    "label": "Hình người",
    "drawableSvg": true,
    "drawablePy": true
  },
  {
    "id": "full",
    "label": "Tràn nền (full-bleed)",
    "drawableSvg": true,
    "drawablePy": true
  }
] as const;

/** id dáng + nhãn VI + 13 khớp chuẩn hoá (0..1) — nguyên văn POSES của silhouettes.js. */
export const POSE_META: readonly { id: string; vi: string; j: Record<string, [number, number]> }[] =
  [{"id":"idle","vi":"Đứng thẳng","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.62,0.25],"re":[0.66,0.39],"rw":[0.67,0.53],"ls":[0.38,0.25],"le":[0.34,0.39],"lw":[0.33,0.53],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"wave","vi":"Vẫy chào","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.62,0.25],"re":[0.7,0.16],"rw":[0.76,0.05],"ls":[0.38,0.25],"le":[0.34,0.39],"lw":[0.33,0.53],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"point","vi":"Chỉ tay","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.62,0.25],"re":[0.76,0.28],"rw":[0.92,0.27],"ls":[0.38,0.25],"le":[0.34,0.39],"lw":[0.33,0.53],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"hold-gift","vi":"Ôm quà","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.62,0.25],"re":[0.66,0.38],"rw":[0.56,0.44],"ls":[0.38,0.25],"le":[0.34,0.38],"lw":[0.44,0.44],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"cheer","vi":"Ăn mừng","j":{"head":[0.5,0.1],"neck":[0.5,0.23],"rs":[0.62,0.26],"re":[0.7,0.15],"rw":[0.74,0.04],"ls":[0.38,0.26],"le":[0.3,0.15],"lw":[0.26,0.04],"hip":[0.5,0.56],"rk":[0.61,0.72],"ra":[0.66,0.84],"lk":[0.39,0.72],"la":[0.34,0.84]}},{"id":"sad","vi":"Buồn","j":{"head":[0.52,0.13],"neck":[0.5,0.24],"rs":[0.6,0.28],"re":[0.62,0.42],"rw":[0.58,0.56],"ls":[0.4,0.28],"le":[0.38,0.42],"lw":[0.42,0.56],"hip":[0.5,0.58],"rk":[0.57,0.76],"ra":[0.57,0.93],"lk":[0.43,0.76],"la":[0.43,0.93]}},{"id":"run","vi":"Chạy","j":{"head":[0.6,0.11],"neck":[0.56,0.23],"rs":[0.66,0.26],"re":[0.76,0.33],"rw":[0.84,0.24],"ls":[0.46,0.25],"le":[0.38,0.35],"lw":[0.32,0.46],"hip":[0.52,0.55],"rk":[0.68,0.68],"ra":[0.78,0.8],"lk":[0.44,0.76],"la":[0.34,0.92]}},{"id":"think","vi":"Suy nghĩ","j":{"head":[0.52,0.11],"neck":[0.5,0.23],"rs":[0.62,0.26],"re":[0.68,0.38],"rw":[0.58,0.21],"ls":[0.38,0.26],"le":[0.35,0.4],"lw":[0.44,0.48],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"sit","vi":"Ngồi","j":{"head":[0.5,0.18],"neck":[0.5,0.3],"rs":[0.61,0.33],"re":[0.65,0.46],"rw":[0.63,0.58],"ls":[0.39,0.33],"le":[0.35,0.46],"lw":[0.37,0.58],"hip":[0.5,0.63],"rk":[0.65,0.68],"ra":[0.62,0.88],"lk":[0.35,0.68],"la":[0.32,0.88]}},{"id":"jump","vi":"Bật nhảy","j":{"head":[0.5,0.09],"neck":[0.5,0.21],"rs":[0.61,0.24],"re":[0.7,0.14],"rw":[0.76,0.05],"ls":[0.39,0.24],"le":[0.3,0.14],"lw":[0.24,0.05],"hip":[0.5,0.52],"rk":[0.61,0.66],"ra":[0.56,0.78],"lk":[0.39,0.66],"la":[0.44,0.78]}},{"id":"bow","vi":"Cúi chào","j":{"head":[0.64,0.3],"neck":[0.56,0.38],"rs":[0.62,0.41],"re":[0.6,0.53],"rw":[0.56,0.64],"ls":[0.5,0.41],"le":[0.46,0.53],"lw":[0.42,0.64],"hip":[0.46,0.6],"rk":[0.53,0.77],"ra":[0.53,0.93],"lk":[0.4,0.77],"la":[0.4,0.93]}},{"id":"thumbs-up","vi":"Like 👍","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.62,0.25],"re":[0.7,0.36],"rw":[0.74,0.22],"ls":[0.38,0.25],"le":[0.34,0.39],"lw":[0.33,0.53],"hip":[0.5,0.56],"rk":[0.58,0.75],"ra":[0.58,0.93],"lk":[0.42,0.75],"la":[0.42,0.93]}},{"id":"present","vi":"Giới thiệu","j":{"head":[0.48,0.1],"neck":[0.48,0.22],"rs":[0.6,0.25],"re":[0.74,0.32],"rw":[0.88,0.38],"ls":[0.36,0.25],"le":[0.33,0.4],"lw":[0.4,0.5],"hip":[0.48,0.56],"rk":[0.56,0.75],"ra":[0.56,0.93],"lk":[0.4,0.75],"la":[0.4,0.93]}},{"id":"dance","vi":"Nhảy múa","j":{"head":[0.54,0.09],"neck":[0.52,0.21],"rs":[0.64,0.24],"re":[0.7,0.13],"rw":[0.64,0.04],"ls":[0.4,0.25],"le":[0.3,0.32],"lw":[0.2,0.26],"hip":[0.48,0.54],"rk":[0.6,0.69],"ra":[0.68,0.84],"lk":[0.38,0.74],"la":[0.3,0.88]}},{"id":"walk","vi":"Đi bộ","j":{"head":[0.54,0.1],"neck":[0.52,0.22],"rs":[0.62,0.25],"re":[0.68,0.37],"rw":[0.72,0.48],"ls":[0.42,0.25],"le":[0.37,0.37],"lw":[0.33,0.48],"hip":[0.5,0.56],"rk":[0.6,0.73],"ra":[0.64,0.91],"lk":[0.42,0.74],"la":[0.36,0.91]}},{"id":"fly","vi":"Bay","j":{"head":[0.66,0.13],"neck":[0.58,0.22],"rs":[0.64,0.26],"re":[0.76,0.18],"rw":[0.88,0.1],"ls":[0.52,0.28],"le":[0.66,0.26],"lw":[0.8,0.2],"hip":[0.44,0.5],"rk":[0.34,0.64],"ra":[0.24,0.78],"lk":[0.4,0.7],"la":[0.3,0.86]}},{"id":"view-34","vi":"Góc ¾","j":{"head":[0.53,0.1],"neck":[0.51,0.22],"rs":[0.65,0.26],"re":[0.68,0.39],"rw":[0.68,0.53],"ls":[0.43,0.25],"le":[0.38,0.38],"lw":[0.36,0.52],"hip":[0.5,0.56],"rk":[0.59,0.75],"ra":[0.6,0.93],"lk":[0.44,0.75],"la":[0.42,0.93]}},{"id":"view-side","vi":"Nhìn ngang","j":{"head":[0.55,0.1],"neck":[0.52,0.22],"rs":[0.53,0.25],"re":[0.55,0.39],"rw":[0.56,0.52],"ls":[0.5,0.25],"le":[0.51,0.39],"lw":[0.52,0.52],"hip":[0.5,0.56],"rk":[0.54,0.75],"ra":[0.56,0.93],"lk":[0.47,0.75],"la":[0.45,0.93]}},{"id":"view-back","vi":"Nhìn lưng","j":{"head":[0.5,0.1],"neck":[0.5,0.22],"rs":[0.38,0.25],"re":[0.34,0.39],"rw":[0.33,0.53],"ls":[0.62,0.25],"le":[0.66,0.39],"lw":[0.67,0.53],"hip":[0.5,0.56],"rk":[0.42,0.75],"ra":[0.42,0.93],"lk":[0.58,0.75],"la":[0.58,0.93]}}] as const;

/** `characterPoses` mặc định — đọc từ styles.example.json. */
export const DEFAULT_POSES: readonly string[] = ["idle","wave","point","hold-gift","cheer","sad","run","think","sit","jump","bow","thumbs-up","fly","walk","dance","present","view-34","view-side","view-back"] as const;

/** 2 giá trị `matte` mà PROMPT hiểu — rút từ `gen.sh` (nhánh glow/glass).
 *  Chúng chỉ còn đổi CÂU CHỮ gửi cho máy vẽ; `slice.py` không đọc `matte` nữa. */
export const MATTE_VALUES: readonly string[] = ["glass","glow"] as const;

/** Tham số cắt đọc từ slice.py. `null` = engine KHÔNG còn đọc tham số đó nữa.
 *  07/09: slice.py chỉ crop theo toạ độ ô ⇒ vành ngoài = 0, hai ngưỡng tách biến mất. */
export const SLICE_CONST = {
  "bleed": 0,
  "threshold": null,
  "growOffset": null,
  "bleedIsModuleConstant": true
} as const;

/** Màu chi kiểu OpenPose — nguyên văn LIMBS của silhouettes.js. */
export const LIMBS: readonly [string, string, string][] = [["neck","head","#e6194b"],["neck","hip","#f58231"],["neck","rs","#ffe119"],["rs","re","#bfef45"],["re","rw","#3cb44b"],["neck","ls","#42d4f4"],["ls","le","#4363d8"],["le","lw","#911eb4"],["hip","rk","#f032e6"],["rk","ra","#a9a9a9"],["hip","lk","#469990"],["lk","la","#9a6324"]] as const;
