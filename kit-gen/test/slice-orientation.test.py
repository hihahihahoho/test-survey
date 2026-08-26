#!/usr/bin/env python3
"""
slice.py: ảnh raw sai khổ thì KHÔNG được đem đi cắt.

VÌ SAO CÓ CA NÀY
    Phép chia lưới trong slice.py lấy ĐẠI kích thước ảnh nhận được rồi chia cho grid.
    Model trả sai hướng là mọi ô méo lặng lẽ:
        sheet 4x2 landscape → mong 1536x1024 → ô 384x512
        model trả 1024x1536 →                  ô 256x768  (cao gấp rưỡi)
    Người dùng thấy "ảnh bị kéo cao" sau khi copy sang Figma, còn cờ QA thì chỉ báo
    SAU KHI đã cắt — tức là đã tiêu tiền sinh ảnh và đã đẻ ra hàng chục file rác.
    Sự cố thật 21/08/2026 (ảnh sheet dọc, lưới landscape, lệch tới 562px).

    Ảnh VUÔNG cũng phải bị bắt: nó không phải khổ nào trong hai khổ hợp lệ.
"""
import ast
import os
import sys

# TRÍCH ĐÚNG MỘT HÀM RA KHỎI slice.py, KHÔNG import cả module.
#   Bản đầu dùng importlib rồi `exec_module` — và CI đỏ ngay lượt đầu tiên:
#   `ModuleNotFoundError: No module named 'PIL'`. Runner không có Pillow, mà chẳng
#   có lý do gì nó phải có: hàm đang kiểm là số học thuần trên (orient, W, H),
#   không đụng một pixel nào. Bắt CI cài 30 MB thư viện ảnh để chạy một phép so tỉ
#   lệ là trả giá sai chỗ — và là một lý do nữa để ca này bị bỏ qua khi nó chậm.
#   Đây là bản dịch sang Python của mẹo `sed -n '/^func()/,/^}$/p'` mà mấy ca shell
#   bên cạnh đã dùng, chỉ khác là cắt bằng AST nên không sợ thụt lề đánh lừa.
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "slice.py"), encoding="utf-8").read()
_tree = ast.parse(SRC)
_fn = next((n for n in _tree.body
            if isinstance(n, ast.FunctionDef) and n.name == "orientation_error"), None)
if _fn is None:
    print("LOI  không tìm thấy orientation_error trong slice.py "
          "(đổi tên hàm thì sửa cả ca này)", file=sys.stderr)
    sys.exit(1)
# Hàm KHÔNG còn đứng một mình: từ 26/08/2026 nó tra bảng `CANVAS` ở tầng module
# (bản chép của bảng cùng tên trong khối python của gen.sh — xem chú thích ở đó về
# việc khổ ảnh từng bị suy độc lập ở bốn chỗ). Trích thiếu bảng thì ca này chết vì
# `NameError`, một lời báo lỗi chẳng liên quan gì tới thứ nó đang đo. Nên lấy CẢ
# HAI, và vẫn bằng AST để không phải import PIL.
_canvas = next((n for n in _tree.body
                if isinstance(n, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == "CANVAS" for t in n.targets)), None)
if _canvas is None:
    print("LOI  không tìm thấy bảng CANVAS trong slice.py "
          "(đổi tên bảng thì sửa cả ca này)", file=sys.stderr)
    sys.exit(1)
_ns = {}
exec(compile(ast.Module(body=[_canvas, _fn], type_ignores=[]), "slice.py", "exec"), _ns)
orientation_error = _ns["orientation_error"]
CANVAS = _ns["CANVAS"]

fails = []


def check(label, got_none_expected, orient, w, h, canvas=None):
    err = orientation_error(orient, w, h, canvas)
    ok = (err is None) if got_none_expected else (err is not None)
    print(("ok   " if ok else "LOI  ") + label + ("" if ok else f"  → {err!r}"))
    if not ok:
        fails.append(label)


# ── khổ ĐÚNG: phải lọt ──────────────────────────────────────────────────────────
check("landscape 1536x1024 hợp lệ", True, "landscape", 1536, 1024)
check("portrait  1024x1536 hợp lệ", True, "portrait", 1024, 1536)
# `orient` thiếu/None = landscape, đúng như gen.sh: sh.get("orient") == "portrait"
check("orient thiếu ⇒ coi là landscape", True, None, 1536, 1024)
# vài pixel lệch do model làm tròn thì vẫn phải cho qua
check("landscape 1520x1024 (lệch nhẹ) vẫn hợp lệ", True, "landscape", 1520, 1024)

# ── khổ SAI: phải bắt ───────────────────────────────────────────────────────────
check("landscape mà nhận ảnh DỌC → bắt", False, "landscape", 1024, 1536)
check("portrait mà nhận ảnh NGANG → bắt", False, "portrait", 1536, 1024)
check("landscape mà nhận ảnh VUÔNG → bắt", False, "landscape", 1024, 1024)
check("portrait mà nhận ảnh VUÔNG → bắt", False, "portrait", 1024, 1024)
check("cao 0px không làm sập (chia cho 0)", False, "landscape", 1536, 0)

# ── KHỔ VUÔNG (field mới `sheet.canvas`) ────────────────────────────────────────
# Ảnh vuông vẫn phải bị bắt với tấm ngang/dọc — hai ca ngay trên khoá điều đó. Cái
# ca dưới đây khoá vế còn lại: tấm KHAI vuông thì ảnh vuông là ĐÚNG, không phải oan.
# 1254x1254 chứ không phải 1024x1024: tool image_gen của codex KHÔNG có tham số
# `size`, nó luôn trả ~1,57 triệu pixel; đo 685 ảnh thật thì 132 ảnh vuông đều đúng
# 1254x1254. Phép so ở đây là so TỈ LỆ nên cả hai con số vuông đều lọt — cố ý:
# slice.py không được từ chối một ảnh chỉ vì model làm tròn khác vài chục pixel.
check("canvas=square + ảnh 1254x1254 ⇒ hợp lệ", True, None, 1254, 1254, "square")
check("canvas=square + ảnh 1024x1024 ⇒ vẫn hợp lệ (so tỉ lệ)", True, None, 1024, 1024, "square")
check("canvas=square mà nhận ảnh NGANG → bắt", False, None, 1536, 1024, "square")
check("canvas=square mà nhận ảnh DỌC → bắt", False, None, 1024, 1536, "square")
# `canvas` là field CHÍNH; `orient` chỉ là đường lùi cho contract đời trước. Khai cả
# hai thì canvas thắng — không thì một tấm cũ được nâng lên vuông vẫn bị xử theo dọc.
check("canvas THẮNG orient khi khai cả hai", True, "portrait", 1254, 1254, "square")
# Chữ lạ không được giết cả lượt cắt: rơi về landscape, đúng như gen.sh và
# skeleton-svg.js. Ba tầng phải cùng một hành vi, không thì lỗi gõ hiện ra mỗi tầng
# một kiểu.
check("canvas gõ sai ⇒ rơi về landscape, không ném", True, None, 1536, 1024, "squre")

if set(CANVAS) != {"landscape", "portrait", "square"}:
    print(f"LOI  bảng CANVAS của slice.py lệch khỏi bảng của gen.sh: {sorted(CANVAS)}")
    fails.append("bảng CANVAS")

# Câu lỗi phải nói ra CẢ hai vế, không thì người đọc log vẫn phải tự đoán.
msg = orientation_error("landscape", 1024, 1536)
for want in ("landscape", "1536x1024", "1024x1536"):
    if want not in msg:
        print(f"LOI  câu lỗi thiếu '{want}': {msg!r}")
        fails.append("thông điệp")
    else:
        print(f"ok   câu lỗi có nhắc '{want}'")

if fails:
    print("\nHỎNG: " + ", ".join(fails), file=sys.stderr)
    sys.exit(1)
print("\nOK  slice.py: chặn đúng mọi khổ sai, không chặn nhầm khổ đúng")
