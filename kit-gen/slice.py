#!/usr/bin/env python3
"""
Cắt sprite sheet UI kit thành từng asset đã crop + tách nền.

  raw/<style>.png  (grid 4x3, nền phẳng một màu)
      │  1. màu nền = median viền ngoài của cả sheet
      │  2. chroma-key toàn sheet → alpha; thêm mask NGHIÊM (chỉ pixel đặc)
      │  3. label các khối pixel liền nhau (connected components) trên mask nghiêm
      │  4. gán mỗi khối về ô lưới chứa TRỌNG TÂM của nó; mỗi ô = hợp bbox các khối
      │  5. crop + trim + đệm
      ▼
  kits/<style>/01-leaderboard.png … 12-progress.png   (RGBA, đã crop)

Vì sao không crop cứng theo lưới hay "nở bbox":
  · crop cứng: component vẽ tràn vạch lưới sẽ bị chém cụt (giỏ quà tết mất nơ).
  · nở bbox: hàng xóm cũng tràn vạch → chạm là nuốt nguyên hàng xóm (đã dính ở neon/candy).
  · connected-component: khối của ai thuộc về người đó theo TRỌNG TÂM, kể cả khi
    tràn vạch — miễn hai component không dính hẳn vào nhau.
  · label trên mask NGHIÊM (ngưỡng cao) để glow nhạt (style neon) không bắc cầu
    nối hai component thành một khối; glow quanh asset được giữ lại bằng HALO px.

Tên file GIỐNG HỆT nhau giữa các style — đó là hợp đồng nội dung.
Chạy:  python3 slice.py
"""
import json, math, os
from collections import deque
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_THRESHOLD = 52     # cutout: pixel cách màu nền hơn mức này là thuộc asset
GROW_OFFSET = 60           # mask nghiêm mặc định = threshold + 60 (style ghi đè được)
MIN_BLOB = 12              # khối nhỏ hơn (px) coi là nhiễu, bỏ
HALO = 14                  # nới bbox để giữ glow/viền mềm quanh asset
PAD = 6

cfg = json.load(open(os.path.join(HERE, "styles.json")))
COLS, ROWS = cfg["grid"]["cols"], cfg["grid"]["rows"]
COMPONENTS = cfg["components"]
assert len(COMPONENTS) == COLS * ROWS, "số component phải khớp lưới"


def border_median(img, strip=8):
    w, h = img.size
    px = img.load()
    samples = []
    for x in range(0, w, 4):
        for y in list(range(strip)) + list(range(h - strip, h)):
            samples.append(px[x, y])
    for y in range(0, h, 4):
        for x in list(range(strip)) + list(range(w - strip, w)):
            samples.append(px[x, y])
    samples.sort()
    return samples[len(samples) // 2]


def key_sheet(sheet, bg, threshold, strict_threshold):
    """Trả về (RGBA đã tách nền, bytearray mask nghiêm)."""
    w, h = sheet.size
    out = Image.new("RGBA", (w, h))
    strict = bytearray(w * h)
    src, dst = sheet.load(), out.load()
    br, bgc, bb = bg
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = src[x, y]
            d = math.sqrt((r - br) ** 2 + (g - bgc) ** 2 + (b - bb) ** 2)
            if d < threshold:
                dst[x, y] = (r, g, b, 0)
            else:
                dst[x, y] = (r, g, b, 255)
                if d >= strict_threshold:
                    strict[row + x] = 1
    return out, strict


def label_blobs(strict, W, H):
    """BFS 4-hướng trên mask nghiêm → [(bbox, size, centroid)] cho từng khối."""
    seen = bytearray(W * H)
    blobs = []
    for start in range(W * H):
        if not strict[start] or seen[start]:
            continue
        q = deque([start])
        seen[start] = 1
        l = r = start % W
        t = b = start // W
        n = sx = sy = 0
        while q:
            i = q.popleft()
            x, y = i % W, i // W
            n += 1; sx += x; sy += y
            if x < l: l = x
            if x > r: r = x
            if y < t: t = y
            if y > b: b = y
            if x > 0 and strict[i - 1] and not seen[i - 1]: seen[i - 1] = 1; q.append(i - 1)
            if x < W - 1 and strict[i + 1] and not seen[i + 1]: seen[i + 1] = 1; q.append(i + 1)
            if y > 0 and strict[i - W] and not seen[i - W]: seen[i - W] = 1; q.append(i - W)
            if y < H - 1 and strict[i + W] and not seen[i + W]: seen[i + W] = 1; q.append(i + W)
        if n >= MIN_BLOB:
            blobs.append(((l, t, r + 1, b + 1), n, (sx / n, sy / n)))
    return blobs


manifest = {"styles": {}}
for style in cfg["styles"]:
    sid = style["id"]
    src_path = os.path.join(HERE, "raw", f"{sid}.png")
    if not os.path.exists(src_path):
        print(f"⚠ bỏ qua {sid}: chưa có raw/{sid}.png")
        continue

    threshold = style.get("threshold", DEFAULT_THRESHOLD)
    strict_threshold = style.get("grow_threshold", threshold + GROW_OFFSET)
    sheet = Image.open(src_path).convert("RGB")
    W, H = sheet.size
    cell_w, cell_h = W / COLS, H / ROWS
    bg = border_median(sheet)
    keyed, strict = key_sheet(sheet, bg, threshold, strict_threshold)
    blobs = label_blobs(strict, W, H)

    # mỗi khối về ô chứa trọng tâm của nó
    cell_boxes = [None] * (COLS * ROWS)
    for box, n, (cx, cy) in blobs:
        idx = min(ROWS - 1, int(cy // cell_h)) * COLS + min(COLS - 1, int(cx // cell_w))
        cur = cell_boxes[idx]
        cell_boxes[idx] = box if cur is None else (
            min(cur[0], box[0]), min(cur[1], box[1]), max(cur[2], box[2]), max(cur[3], box[3]))

    out_dir = os.path.join(HERE, "kits", sid)
    os.makedirs(out_dir, exist_ok=True)

    files, empty = [], []
    for idx, comp in enumerate(COMPONENTS):
        box = cell_boxes[idx]
        if box is None:
            empty.append(comp["file"])
            continue
        l, t, r, b = box
        piece = keyed.crop((max(0, l - HALO - PAD), max(0, t - HALO - PAD),
                            min(W, r + HALO + PAD), min(H, b + HALO + PAD)))
        fp = os.path.join(out_dir, f"{comp['file']}.png")
        piece.save(fp)
        files.append({"file": comp["file"] + ".png", "w": piece.width, "h": piece.height})

    manifest["styles"][sid] = {
        "threshold": threshold, "strict_threshold": strict_threshold,
        "bg_detected": bg, "sheet": [W, H], "blobs": len(blobs),
        "assets": files, "empty_cells": empty
    }
    print(f"✓ {sid}: {len(files)}/12, {len(blobs)} khối, nền {bg}" +
          (f" — Ô TRỐNG: {empty}" if empty else ""))

json.dump(manifest, open(os.path.join(HERE, "kits", "manifest.json"), "w"),
          indent=2, ensure_ascii=False)
print("→ kits/manifest.json")
