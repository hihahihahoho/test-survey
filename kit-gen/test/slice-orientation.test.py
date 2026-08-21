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
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("slicemod", os.path.join(HERE, "..", "slice.py"))
slicemod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slicemod)
orientation_error = slicemod.orientation_error

fails = []


def check(label, got_none_expected, orient, w, h):
    err = orientation_error(orient, w, h)
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
