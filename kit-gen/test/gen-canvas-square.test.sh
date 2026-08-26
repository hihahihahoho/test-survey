#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# KHỔ CANVAS PHẢI GIỐNG NHAU Ở CẢ BỐN TẦNG — nhất là khổ VUÔNG, khổ mới nhất.
#
# ══ SỰ CỐ MÀ CA NÀY SINH RA ĐỂ CHẶN ═══════════════════════════════════════════
# Khổ ảnh từng được suy ĐỘC LẬP ở bốn chỗ, mỗi chỗ một dòng ba ngôi
# `orient === "portrait" ? … : …`:
#     ① gen.sh, khối python  → dòng "Canvas orientation: …" ở đầu prompt
#     ② gen.sh, run_one      → con số nhắc lại cho model ("MUST be exactly …")
#     ③ skeleton-svg.js      → khổ ảnh KHUNG XƯƠNG đính kèm
#     ④ slice.py             → khổ mong đợi lúc cắt lưới
# Thêm một khổ thứ ba (square) mà quên một trong bốn thì hỏng LẶNG LẼ, và mỗi chỗ
# quên hỏng một kiểu khác nhau:
#   · quên ① ⇒ prompt khai landscape, model vẽ ngang, khung xương vuông ⇒ lệch ô;
#   · quên ② ⇒ model nhận "MUST be exactly 1536x1024" cho một tấm vuông;
#   · quên ③ ⇒ khung xương ngang làm reference cho một canvas vuông ⇒ model tự bịa
#     lại bố cục, và không ai đọc prompt mà thấy được điều đó;
#   · quên ④ ⇒ ảnh vuông về đúng nhưng slicer từ chối nó là "sai hướng".
# Không ca nào trong bốn cái đó làm một test khác đỏ. Nên soi cả bốn ở một chỗ.
#
# ══ VÌ SAO Ô VUÔNG LÀ 1254x1254 ═══════════════════════════════════════════════
# Chủ sản phẩm hỏi "2040x2040 thì phải? codex có option đó không?". Đã soi binary
# codex 0.149.0 (26/08/2026): tool `image_gen.imagegen` có ĐÚNG BA tham số —
# `prompt`, `referenced_image_paths`, `num_last_images_to_include` — và KHÔNG có
# `size`. Khổ do backend chọn; model chỉ lái được TỈ LỆ bằng lời văn.
# Đo 685 ảnh thật do tool sinh trên máy dev: mọi ảnh đều ≈1.572.864 pixel
# (= 1536×1024) ±1500, tỉ lệ tự do. Trong đó 132 ảnh vuông, TẤT CẢ đúng 1254×1254.
# KHÔNG một ảnh nào 1024×1024, không một ảnh nào 2048 hay 2040.
# (Bảng size cứng {1024x1024, 1536x1024, 1024x1536, 2048x2048…} chỉ tồn tại ở
#  đường CLI `scripts/image_gen.py --size` — đường mà gen.sh CẤM THẲNG.)
# Vậy hứa 1254 là hứa đúng thứ sẽ nhận. Hứa 1024 thì mọi lượt vuông đều trông như
# "model làm sai khổ", và người dùng đi sửa nhầm chỗ.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
eq() { # <nhãn> <mong đợi> <thực tế>
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'LOI  %s\n  mong: %s\n  thực: %s\n' "$1" "$2" "$3" >&2; fail=1; fi
}

echo "── ③ khung xương: skeleton-svg.js dựng đúng khổ vuông"
sizes="$(cd "$HERE" && node -e '
  require("./silhouettes.js"); require("./skeleton-svg.js");
  const { sheetToSvg } = globalThis.KITSKEL;
  const sheet = extra => ({
    id: "s", grid: { cols: 2, rows: 2 },
    components: [0, 1, 2, 3].map(i => ({
      file: `0${i + 1}-x`, vi: "", spec: "", skel: { shape: "rrect", w: 0.6, h: 0.6 },
    })),
    ...extra,
  });
  const dim = extra => (sheetToSvg(sheet(extra)).match(/width="(\d+)" height="(\d+)"/) || []).slice(1).join("x");
  console.log(dim({}));
  console.log(dim({ orient: "portrait" }));
  console.log(dim({ canvas: "square" }));
  console.log(dim({ canvas: "square", orient: "portrait" }));
  console.log(dim({ canvas: "squre" }));
')"
[ -n "$sizes" ] || { echo "LOI  không chạy được skeleton-svg.js" >&2; exit 1; }
eq "mặc định vẫn NGANG"                     "1536x1024" "$(sed -n 1p <<<"$sizes")"
eq "orient=portrait vẫn DỌC (contract cũ)"  "1024x1536" "$(sed -n 2p <<<"$sizes")"
eq "canvas=square ⇒ khung xương VUÔNG"      "1254x1254" "$(sed -n 3p <<<"$sizes")"
# `canvas` là field CHÍNH, `orient` chỉ là đường lùi cho contract đời trước. Khai cả
# hai thì `canvas` thắng — không thì một tấm cũ được nâng lên vuông sẽ vẫn ra dọc.
eq "canvas THẮNG orient khi khai cả hai"    "1254x1254" "$(sed -n 4p <<<"$sizes")"
# Gõ sai một chữ không được giết cả lượt gen; rơi về khổ mặc định là hành vi của
# cả ba tầng, nên nó phải giống nhau ở cả ba.
eq "chữ lạ rơi về NGANG, không ném"         "1536x1024" "$(sed -n 5p <<<"$sizes")"

echo "── ④ cắt lưới: slice.py (chạy nguyên ca chuyên trách, đã có sẵn khổ vuông)"
# KHÔNG viết lại phép kiểm của slice.py ở đây. `test/slice-orientation.test.py` đã
# trích `orientation_error` + bảng `CANVAS` bằng AST (để khỏi cần Pillow) và đã có
# đủ ca vuông. Chép lại là đẻ ra một bản thứ hai sẽ trôi khỏi bản gốc — đúng cái
# bệnh mà cả bản vá này sinh ra để chữa. Gọi thẳng nó, và ĐỂ NÓ TỰ IN.
if (cd "$HERE" && "${KITGEN_PYTHON:-python3}" test/slice-orientation.test.py); then
  printf 'ok   %s\n' "slice-orientation.test.py xanh (bao gồm mọi ca khổ vuông)"
else
  printf 'LOI  slice-orientation.test.py đỏ — xem output ngay trên\n' >&2; fail=1
fi

echo "── ① + ② đã được canh ở test/gen-prompts-only.test.sh và test/gen-canvas-size.test.sh"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao phải soi cả bốn tầng." >&2; exit 1; }
echo "OK  khổ vuông đi xuyên cả bốn tầng bằng đúng một con số"
