#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# KHỔ CANVAS PHẢI GIỐNG NHAU Ở CẢ BỐN TẦNG — nhất là khổ VUÔNG, khổ mới nhất.
#
# ══ SỰ CỐ MÀ CA NÀY SINH RA ĐỂ CHẶN ═══════════════════════════════════════════
# Khổ ảnh từng được suy ĐỘC LẬP ở bốn chỗ, mỗi chỗ một dòng ba ngôi
# `orient === "portrait" ? … : …`:
#     ① gen.sh, khối python  → dòng "Canvas orientation: …" ở đầu prompt
#     ② gen.sh, run_one      → con số nhắc lại cho model ("MUST be exactly …")
#     ③ skeleton-svg.js      → khổ ảnh KHUNG XƯƠNG đính kèm  ← ĐÃ CHẾT 27/08/2026
#     ④ slice.py             → khổ mong đợi lúc cắt lưới
# Thêm một khổ thứ ba (square) mà quên một trong bốn thì hỏng LẶNG LẼ, và mỗi chỗ
# quên hỏng một kiểu khác nhau:
#   · quên ① ⇒ prompt khai landscape trong khi lưới toạ độ tính theo vuông ⇒ lệch ô;
#   · quên ② ⇒ model nhận "MUST be exactly 1536x1024" cho một tấm vuông;
#   · quên ④ ⇒ ảnh vuông về đúng nhưng slicer từ chối nó là "sai hướng".
# Không ca nào trong ba cái đó làm một test khác đỏ. Nên soi cả ba ở một chỗ.
#
# ══ TẦNG ③ KHÔNG CÒN NỮA, VÀ ĐÓ LÀ TIN TỐT ════════════════════════════════════
# Khung xương đã bỏ: prompt tự nói toạ độ, lấy từ `geometry.py`, đúng module mà
# `slice.py` import. Nên ① và ④ nay ĂN CHUNG MỘT BẢNG thay vì mỗi bên một bản chép.
# Chỗ này đổi từ "soi ba bản chép có khớp nhau không" sang "soi đúng một bản có
# đúng không" — và thêm một ca chặn việc ai đó chép bảng ra lần nữa.
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

echo "── ⓪ MỘT BẢNG DUY NHẤT: geometry.py"
sizes="$(cd "$HERE" && "${KITGEN_PYTHON:-python3}" -c '
import geometry
for sh in ({}, {"orient": "portrait"}, {"canvas": "square"},
           {"canvas": "square", "orient": "portrait"}, {"canvas": "squre"}):
    w, h, _hdr, _ratio = geometry.canvas_of(sh)
    print(f"{w}x{h}")
')"
[ -n "$sizes" ] || { echo "LOI  không chạy được geometry.py" >&2; exit 1; }
eq "mặc định vẫn NGANG"                     "1536x1024" "$(sed -n 1p <<<"$sizes")"
eq "orient=portrait vẫn DỌC (contract cũ)"  "1024x1536" "$(sed -n 2p <<<"$sizes")"
eq "canvas=square ⇒ khổ VUÔNG"              "1254x1254" "$(sed -n 3p <<<"$sizes")"
# `canvas` là field CHÍNH, `orient` chỉ là đường lùi cho contract đời trước. Khai cả
# hai thì `canvas` thắng — không thì một tấm cũ được nâng lên vuông sẽ vẫn ra dọc.
eq "canvas THẮNG orient khi khai cả hai"    "1254x1254" "$(sed -n 4p <<<"$sizes")"
# Gõ sai một chữ không được giết cả lượt gen; rơi về khổ mặc định.
eq "chữ lạ rơi về NGANG, không ném"         "1536x1024" "$(sed -n 5p <<<"$sizes")"

echo "── và KHÔNG AI được chép bảng đó ra lần nữa"
# Đây là ca chống TÁI PHÁT. Cả sự cố ở đầu file sinh ra từ đúng một thói quen: viết
# lại `{"landscape": (1536, 1024), …}` ở file mình đang sửa cho tiện. Quét mã (đã bỏ
# chú thích) của hai người dùng còn lại; con số chỉ được phép xuất hiện trong
# geometry.py và trong lời khai đưa cho model.
for f in gen.sh slice.py; do
  if sed 's/#.*//' "$HERE/$f" | grep -q '1536.*1024.*portrait\|"landscape":.*1536'; then
    printf 'LOI  %s chép lại bảng khổ — bảng thật ở geometry.py\n' "$f" >&2; fail=1
  else
    printf 'ok   %s không chép lại bảng khổ\n' "$f"
  fi
done

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

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao phải soi cả ba tầng." >&2; exit 1; }
echo "OK  khổ vuông đi xuyên cả ba tầng bằng đúng một con số, từ đúng một bảng"
