#!/usr/bin/env python3
"""
Cắt sprite sheet UI kit thành từng asset: tách nền alpha MỀM + chuẩn hoá canvas.
Contract v3: mỗi style nhiều sheet (main 4x4, tall 4x2, bg 2x1) — element nào
code cần điều khiển độc lập (progress track/fill, tab idle/active, túi đóng/mở)
nằm ở ô riêng nên thành file riêng.

  raw/<style>-<sheet>.png
      │  1. màu nền = median viền ngoài của sheet
      │  2. matte: nền KEY màu chát (magenta/green) → alpha MỀM theo khoảng cách
      │     màu + un-mix màu nền khỏi viền (glow phai mượt, không răng cưa);
      │     nền nhạt/caro kiểu cũ → binary key + lấp lỗ oan (đường lùi)
      │  3. label khối pixel liền nhau trên mask nghiêm, gán khối về ô theo trọng tâm
      │  4. mỗi element XUẤT TRÊN CANVAS CỐ ĐỊNH = kích thước ô của sheet, căn giữa
      │     → cùng element ở mọi style ra file CÙNG KÍCH THƯỚC, layout không xô lệch
      ▼
  kits/<style>/01-btn-pill-red.png … 26-bg-blur.png   (RGBA, canvas đồng nhất)

Vì sao matte mềm: glow là dải bán trong suốt — cắt alpha nhị phân là mép bị gặm
răng cưa (nát); trên nền caro 2 tông còn gặm đúng hình bàn cờ. Nền key một màu
chát + alpha ramp + un-mix là cách chuẩn của greenscreen.

Tên file GIỐNG HỆT nhau giữa các style — đó là hợp đồng nội dung.
Chạy:  python3 slice.py
"""
import json, math, os
from collections import deque
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_THRESHOLD = 52   # tâm ramp: dưới lo → trong suốt, trên hi → đục hẳn
GROW_OFFSET = 60         # mask nghiêm = threshold + 60 (style ghi đè bằng grow_threshold)
MIN_BLOB = 12            # khối nhỏ hơn (px) coi là nhiễu
HALO = 14                # nới bbox giữ glow quanh element
PAD = 6

cfg = json.load(open(os.path.join(HERE, "styles.json")))
for _sh in cfg["sheets"]:
    _n = _sh["grid"]["cols"] * _sh["grid"]["rows"]
    assert len(_sh["components"]) == _n, "sheet %s: component phải khớp lưới" % _sh["id"]


def border_colors(img, strip=8):
    """Màu nền từ viền ngoài sheet. 1 màu (key phẳng) hoặc 2 màu (caro kiểu cũ)."""
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
    c1 = samples[len(samples) // 2]
    far = [s for s in samples if math.dist(s, c1) > 30]
    if len(far) > len(samples) * 0.05:
        far.sort()
        return [c1, far[len(far) // 2]]
    return [c1]


def is_key_color(bgs):
    """Nền là màu key chát (bão hoà cao, 1 màu) → dùng matte mềm, bỏ lấp lỗ."""
    if len(bgs) != 1:
        return False
    r, g, b = bgs[0]
    return max(r, g, b) - min(r, g, b) > 80


def matte_chroma(sheet, key):
    """Chroma-key thực thụ theo Vlahos + DESPILL, cho nền key green/magenta.

    Ramp theo khoảng-cách-màu là chưa đủ: glow bán trong suốt TRỘN với nền key
    cho ra pixel "đủ xa" màu key → được giữ đục nguyên màu trộn → viền ám xanh
    lá / hồng (đã dính). Vlahos đo thẳng mức "nhiễm key" của từng pixel:

      green key:   spill = g - max(r, b)
      magenta key: spill = min(r, b) - g
      alpha = 1 - spill / SREF      (SREF = spill của màu key thuần đo từ nền)

    Pixel key thuần → alpha 0 (kể cả ruột rỗng nằm kín — không cần thông ra
    rìa). Pixel trộn → alpha đúng độ trong suốt thật. Rồi DESPILL: cắt phần
    kênh key vượt trội để màu giữ lại không còn ám key.

    Đánh đổi ghi rõ: element CÓ MÀU GẦN KEY (xanh lá trên nền green, tím trên
    nền magenta) sẽ bị mờ/xỉn — vì vậy prompt đã cấm dùng màu key trong element
    và key được chọn ngoài palette của style."""
    kr, kg, kb = key
    is_green = kg > max(kr, kb)
    sref = max(40, (kg - max(kr, kb)) if is_green else (min(kr, kb) - kg))
    w, h = sheet.size
    out = Image.new("RGBA", (w, h))
    strict = bytearray(w * h)
    src, dst = sheet.load(), out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b = src[x, y]
            spill = (g - max(r, b)) if is_green else (min(r, b) - g)
            if spill <= 0:
                dst[x, y] = (r, g, b, 255)
                strict[row + x] = 1
                continue
            a = 1 - spill / sref
            if a <= 0.04:
                continue                          # nền / gần nền → trong suốt
            if is_green:
                g = max(r, b)                     # despill: cắt green vượt trội
            else:
                m = spill // 2                    # despill magenta: hạ r và b
                r = max(0, r - m)
                b = max(0, b - m)
            if a >= 1:
                dst[x, y] = (r, g, b, 255)
                strict[row + x] = 1
            else:
                dst[x, y] = (r, g, b, round(a * 255))
                if a >= 0.95:
                    strict[row + x] = 1
    return out, strict


def key_binary(sheet, bgs, threshold, strict_threshold):
    """Đường lùi cho nền nhạt/caro (sheet cũ): binary key 1–2 màu nền."""
    w, h = sheet.size
    out = Image.new("RGBA", (w, h))
    strict = bytearray(w * h)
    src, dst = sheet.load(), out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            p = src[x, y]
            d = min(math.dist(p, bg) for bg in bgs)
            r, g, b = p
            if d < threshold:
                dst[x, y] = (r, g, b, 0)
            else:
                dst[x, y] = (r, g, b, 255)
                if d >= strict_threshold:
                    strict[row + x] = 1
    return out, strict


def alpha_sheet(img):
    """Sheet có alpha thật từ model — dùng thẳng."""
    rgba = img.convert("RGBA")
    a = rgba.getchannel("A").tobytes()
    strict = bytearray(len(a))
    for i, v in enumerate(a):
        if v >= 240:
            strict[i] = 1
    return rgba, strict


def fill_holes(keyed, sheet_rgb, W, H):
    """Chỉ dùng ở đường lùi nền nhạt: lấp vùng trong suốt nằm kín trong element
    (ruột trắng bị key nhầm vì trắng ≈ nền). Nền key chát KHÔNG cần — và không
    được dùng, vì nó sẽ lấp cả ruột rỗng có chủ đích (nút outline)."""
    dst = keyed.load()
    src = sheet_rgb.load()
    transparent = bytearray(W * H)
    for y in range(H):
        row = y * W
        for x in range(W):
            if dst[x, y][3] == 0:
                transparent[row + x] = 1
    outside = bytearray(W * H)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            i = y * W + x
            if transparent[i] and not outside[i]:
                outside[i] = 1; q.append(i)
    for y in range(H):
        for x in (0, W - 1):
            i = y * W + x
            if transparent[i] and not outside[i]:
                outside[i] = 1; q.append(i)
    while q:
        i = q.popleft()
        x, y = i % W, i // W
        if x > 0 and transparent[i - 1] and not outside[i - 1]: outside[i - 1] = 1; q.append(i - 1)
        if x < W - 1 and transparent[i + 1] and not outside[i + 1]: outside[i + 1] = 1; q.append(i + 1)
        if y > 0 and transparent[i - W] and not outside[i - W]: outside[i - W] = 1; q.append(i - W)
        if y < H - 1 and transparent[i + W] and not outside[i + W]: outside[i + W] = 1; q.append(i + W)
    filled = 0
    for i in range(W * H):
        if transparent[i] and not outside[i]:
            x, y = i % W, i // W
            r, g, b = src[x, y]
            dst[x, y] = (r, g, b, 255)
            filled += 1
    return filled


def label_blobs(strict, W, H):
    """BFS 4-hướng trên mask nghiêm → [(bbox, size, centroid)] từng khối."""
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


def normalize_canvas(piece, cw, ch):
    """Đặt element lên canvas cố định (đúng kích thước ô), căn giữa.
    Element tràn ô (bbox to hơn canvas) thì thu vừa, giữ tỷ lệ.
    → cùng element ở mọi style ra file CÙNG kích thước; layout demo không xô lệch,
    anchor chữ đè ổn định."""
    if piece.width > cw or piece.height > ch:
        k = min(cw / piece.width, ch / piece.height)
        piece = piece.resize((max(1, round(piece.width * k)),
                              max(1, round(piece.height * k))), Image.LANCZOS)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(piece, ((cw - piece.width) // 2, (ch - piece.height) // 2), piece)
    return canvas


manifest = {"styles": {}}
for style in cfg["styles"]:
    sid = style["id"]
    threshold = style.get("threshold", DEFAULT_THRESHOLD)
    strict_threshold = style.get("grow_threshold", threshold + GROW_OFFSET)
    out_dir = os.path.join(HERE, "kits", sid)
    entry = {"sheets": {}, "assets": [], "empty_cells": []}

    for sh in cfg["sheets"]:
        job = f"{sid}-{sh['id']}"
        src_path = os.path.join(HERE, "raw", f"{job}.png")
        if not os.path.exists(src_path):
            print(f"⚠ bỏ qua {job}: chưa có raw/{job}.png")
            continue

        COLS, ROWS = sh["grid"]["cols"], sh["grid"]["rows"]
        raw_img = Image.open(src_path)
        W, H = raw_img.size
        cell_w, cell_h = W / COLS, H / ROWS
        CW, CH = round(cell_w), round(cell_h)          # canvas chuẩn của sheet này

        has_alpha = "A" in raw_img.getbands() and raw_img.getchannel("A").getextrema()[0] < 128
        if has_alpha:
            bg = None
            keyed, strict = alpha_sheet(raw_img)
            mode = "alpha thật"
        else:
            sheet_rgb = raw_img.convert("RGB")
            bg = border_colors(sheet_rgb)
            if is_key_color(bg):
                keyed, strict = matte_chroma(sheet_rgb, bg[0])
                mode = f"matte Vlahos + despill, key {bg[0]}"
            else:
                keyed, strict = key_binary(sheet_rgb, bg, threshold, strict_threshold)
                filled = fill_holes(keyed, sheet_rgb, W, H)
                mode = f"binary {len(bg)} màu nhạt (đường lùi), lấp {filled}px"
        blobs = label_blobs(strict, W, H)

        cell_boxes = [None] * (COLS * ROWS)
        for box, n, (cx, cy) in blobs:
            idx = min(ROWS - 1, int(cy // cell_h)) * COLS + min(COLS - 1, int(cx // cell_w))
            cur = cell_boxes[idx]
            cell_boxes[idx] = box if cur is None else (
                min(cur[0], box[0]), min(cur[1], box[1]), max(cur[2], box[2]), max(cur[3], box[3]))

        os.makedirs(out_dir, exist_ok=True)
        n_ok = 0
        for idx, comp in enumerate(sh["components"]):
            box = cell_boxes[idx]
            if box is None:
                entry["empty_cells"].append(comp["file"])
                continue
            l, t, r, b = box
            piece = keyed.crop((max(0, l - HALO - PAD), max(0, t - HALO - PAD),
                                min(W, r + HALO + PAD), min(H, b + HALO + PAD)))
            content = (piece.width, piece.height)
            canvas = normalize_canvas(piece, CW, CH)
            canvas.save(os.path.join(out_dir, f"{comp['file']}.png"))
            entry["assets"].append({"file": comp["file"] + ".png", "sheet": sh["id"],
                                    "canvas": [CW, CH], "content": list(content)})
            n_ok += 1

        entry["sheets"][sh["id"]] = {"mode": mode, "bg_detected": bg, "canvas": [CW, CH],
                                     "size": [W, H], "blobs": len(blobs), "cut": n_ok}
        print(f"✓ {job}: {n_ok}/{len(sh['components'])} (canvas {CW}x{CH}), {len(blobs)} khối, {mode}")

    manifest["styles"][sid] = entry
    total = len(entry["assets"])
    want = sum(len(sh["components"]) for sh in cfg["sheets"])
    print(f"— {sid}: {total}/{want} asset" +
          (f", Ô TRỐNG: {entry['empty_cells']}" if entry["empty_cells"] else ""))

json.dump(manifest, open(os.path.join(HERE, "kits", "manifest.json"), "w"),
          indent=2, ensure_ascii=False)
print("→ kits/manifest.json")
