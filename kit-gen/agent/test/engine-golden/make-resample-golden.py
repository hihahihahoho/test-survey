#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════════
# make-resample-golden.py — ĐÓNG BĂNG KẾT QUẢ CỦA PILLOW CHO BẢN PORT JS.
#
# ╔══ VÌ SAO LÀ BĂM CHỨ KHÔNG PHẢI FILE PNG ════════════════════════════════════╗
# ║ Thứ phải khớp là PIXEL, không phải BYTE CỦA FILE: Pillow và `png.mjs` chọn   ║
# ║ filter/zlib khác nhau nên hai file PNG mang cùng một tấm ảnh vẫn khác byte.  ║
# ║ Mà một tấm 1600x900 đóng vào repo là ~1 MB cho mỗi ca. Nên golden ở đây là   ║
# ║ sha256 CỦA MẢNG PIXEL — nhỏ, chính xác, và không thể "gần đúng".             ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# DÙNG:  python3 agent/test/engine-golden/make-resample-golden.py
#   ghi: agent/test-fixtures/engine-resample/src.png      (nguồn RGBA, dựng tất định)
#        agent/test-fixtures/engine-resample/src-rgb.png  (cùng tấm, đã bỏ alpha)
#        agent/test-fixtures/engine-resample/pillow.json  (băm của từng ca)
#
# ⚠️ CHẠY LẠI CHỈ KHI PILLOW ĐỔI THUẬT TOÁN. Golden đỏ lên nghĩa là bản JS đã trôi
# khỏi Pillow — câu trả lời gần như luôn là sửa bản JS.
# ══════════════════════════════════════════════════════════════════════════════
import hashlib
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "..", "..", "test-fixtures", "engine-resample")
W, H = 256, 160
TARGET_W, TARGET_H = 1600, 900


def digest(im):
    return hashlib.sha256(im.tobytes()).hexdigest()


def main():
    os.makedirs(FIX, exist_ok=True)
    # Nguồn TẤT ĐỊNH: không random, không ảnh ngoài. Có cả vùng alpha=0, vùng đục
    # và một dải mờ liên tục — ba thứ mà phép nhân sẵn alpha của Pillow phân biệt.
    im = Image.new("RGBA", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            d = max(abs(x - W // 2), abs(y - H // 2))
            a = 255 if d < 30 else max(0, 255 - (d - 30) * 9)
            px[x, y] = ((x * 7 + y * 3) % 256, (x * x // 11 + y) % 256, (x ^ y) % 256, a)
    im.save(os.path.join(FIX, "src.png"))
    rgb = im.convert("RGB")
    rgb.save(os.path.join(FIX, "src-rgb.png"))

    cases = {}

    # ① cover.sh: crop dải giữa về 16:9 rồi LANCZOS về 1600x900, trên ảnh đã convert RGB.
    ratio = TARGET_W / TARGET_H
    src = Image.open(os.path.join(FIX, "src.png")).convert("RGB")
    w, h = src.size
    if w / h > ratio:
        nw = int(round(h * ratio))
        left = (w - nw) // 2
        box = (left, 0, left + nw, h)
    else:
        nh = int(round(w / ratio))
        top = (h - nh) // 2
        box = (0, top, w, top + nh)
    cases["cover"] = digest(src.crop(box).resize((TARGET_W, TARGET_H), Image.LANCZOS))

    # ② thumbs.mjs: `im.thumbnail((w, w*4))` rồi `convert("RGBA")`.
    #    RGBA đi đường nhân-sẵn-alpha (và vì thế BỎ QUA reduce), RGB thì có reduce —
    #    hai đường khác nhau, nên đóng băng cả hai.
    for name, path in (("rgba", "src.png"), ("rgb", "src-rgb.png")):
        for want in (32, 64, 128):
            t = Image.open(os.path.join(FIX, path))
            t.thumbnail((want, want * 4))
            cases[f"thumb-{name}-{want}"] = digest(t.convert("RGBA"))
            cases[f"thumb-{name}-{want}-size"] = list(t.size)

    out = {
        "pillow": Image.__version__,
        "python": sys.version.split()[0],
        "note": "sha256 của mảng pixel (im.tobytes()), KHÔNG phải của file PNG",
        "cases": cases,
    }
    with open(os.path.join(FIX, "pillow.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"ok  Pillow {Image.__version__} — {len(cases)} mục vào {FIX}/pillow.json")


if __name__ == "__main__":
    main()
