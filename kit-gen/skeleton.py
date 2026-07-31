#!/usr/bin/env python3
"""skeleton.py — vẽ ảnh KHUNG XƯƠNG layout cho từng sheet từ styles.json.

Mỗi ô có KHUNG SAFE ZONE (viền chữ nhật) + silhouette xám lấp đầy khung:
  · THÂN element phải lấp đầy khung safe zone — khung là HỢP ĐỒNG TOẠ ĐỘ,
    engine/Figma luôn gán vị trí theo khung này (slice.py crop nguyên ô nên
    khung nằm cố định trong canvas ra).
  · Trang trí (hoa, đèn lồng, tua rua...) được TRÀN ra ngoài khung thoải mái,
    miễn nằm trong ô — vừa sáng tạo vừa trong khuôn khổ.

Ảnh đính kèm vào codex (gen.sh: codex exec -i) làm reference. Chung cho mọi
style (layout không đổi theo style) → skeleton/<sheet>.png.

Không chữ, không số trong skeleton (tránh model bê text vào ảnh gen).
Deterministic 100%: cùng styles.json → cùng ảnh.
"""
import json
import math
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1536, 1024          # khổ ảnh gen (landscape)
BG = (242, 242, 242)
GRID = (200, 200, 200)
FILL = (154, 154, 154)
EDGE = (96, 96, 96)
SAFE = (70, 70, 70)      # viền khung safe zone


def pill(d, x0, y0, x1, y1):
    d.rounded_rectangle([x0, y0, x1, y1], radius=(y1 - y0) / 2, fill=FILL, outline=EDGE, width=3)


def rrect(d, x0, y0, x1, y1):
    r = min(x1 - x0, y1 - y0) / 6
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=FILL, outline=EDGE, width=3)


def circle(d, x0, y0, x1, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(x1 - x0, y1 - y0) / 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=FILL, outline=EDGE, width=3)


def burst(d, x0, y0, x1, y1):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    R = min(x1 - x0, y1 - y0) / 2
    pts = []
    for i in range(16):
        a = i * math.pi / 8
        r = R if i % 2 == 0 else R * 0.45
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=FILL, outline=EDGE)


def puzzle(d, x0, y0, x1, y1):
    w, h = x1 - x0, y1 - y0
    tab = min(w, h) * 0.22
    body_y0 = y0 + tab
    d.rounded_rectangle([x0, body_y0, x1, y1], radius=min(w, h) / 8, fill=FILL, outline=EDGE, width=3)
    cx = (x0 + x1) / 2
    d.ellipse([cx - tab, y0, cx + tab, y0 + tab * 2], fill=FILL, outline=EDGE, width=3)  # tab trên
    ncy = (body_y0 + y1) / 2
    # khuyết trái = vết cắn cùng màu nền, KHÔNG viền (viền làm model tưởng là object riêng)
    d.ellipse([x0 - tab, ncy - tab, x0 + tab, ncy + tab], fill=BG)


def figure(d, x0, y0, x1, y1):
    """Nhân vật: đầu tròn + thân bo — chỉ pin vị trí/cỡ, không pin dáng."""
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) / 2
    head_r = min(w * 0.42, h * 0.26)
    d.ellipse([cx - head_r, y0, cx + head_r, y0 + head_r * 2], fill=FILL, outline=EDGE, width=3)
    body_y0 = y0 + head_r * 1.7
    bw = w * 0.8
    d.rounded_rectangle([cx - bw / 2, body_y0, cx + bw / 2, y1], radius=bw / 4,
                        fill=FILL, outline=EDGE, width=3)


SHAPES = {"pill": pill, "rrect": rrect, "circle": circle, "bar": pill,
          "burst": burst, "puzzle": puzzle, "figure": figure,
          "pose": figure}   # fallback PIL: pose vẽ như figure (bản HTML mới có stick OpenPose)


def main():
    cfg = json.load(open(os.path.join(HERE, "styles.json")))
    outdir = os.path.join(HERE, "skeleton")
    os.makedirs(outdir, exist_ok=True)
    for sh in cfg["sheets"]:
        cols, rows = sh["grid"]["cols"], sh["grid"]["rows"]
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        cw, ch = W / cols, H / rows
        for i, comp in enumerate(sh["components"]):
            r, c = divmod(i, cols)
            x0, y0 = c * cw, r * ch
            sk = comp["skel"]
            if sk["shape"] == "full":
                d.rectangle([x0 + 2, y0 + 2, x0 + cw - 2, y0 + ch - 2], fill=FILL, outline=EDGE, width=3)
                continue
            ew, eh = cw * sk["w"], ch * sk["h"]
            ex = x0 + (cw - ew) / 2
            ey = y0 + ch - eh - ch * 0.04 if sk.get("anchor") == "bottom" else y0 + (ch - eh) / 2
            if sk.get("plain") and sk["shape"] in ("pill", "bar"):
                d.rounded_rectangle([ex, ey, ex + ew, ey + eh], radius=eh / 2, fill=FILL)
            else:
                SHAPES[sk["shape"]](d, ex, ey, ex + ew, ey + eh)
            # khung safe zone đè lên trên silhouette
            d.rectangle([ex, ey, ex + ew, ey + eh], outline=SAFE, width=4)
        # kẻ lưới sau cùng cho nét mảnh đè lên trên
        for c in range(1, cols):
            d.line([c * cw, 0, c * cw, H], fill=GRID, width=2)
        for r in range(1, rows):
            d.line([0, r * ch, W, r * ch], fill=GRID, width=2)
        path = os.path.join(outdir, f"{sh['id']}.png")
        img.save(path)
        print("skeleton →", path)


if __name__ == "__main__":
    main()
