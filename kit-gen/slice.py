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
      │  4. mỗi element XUẤT TRÊN CANVAS = NGUYÊN Ô của sheet, GIỮ NGUYÊN TOẠ ĐỘ
      │     (không căn lại theo bbox) → khung SAFE ZONE của contract nằm cố định
      │     trong canvas, manifest ghi "safe": engine/Figma luôn gán vị trí theo
      │     khung; trang trí được tràn ngoài khung mà không xô layout
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
from array import array
from PIL import Image, ImageChops, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_THRESHOLD = 52   # tâm ramp: dưới lo → trong suốt, trên hi → đục hẳn
GROW_OFFSET = 60         # mask nghiêm = threshold + 60 (style ghi đè bằng grow_threshold)
MIN_BLOB = 12            # khối nhỏ hơn (px) coi là nhiễu
HALO = 14                # nới bbox giữ glow quanh element
PAD = 6
BLEED = 0.18             # vành canvas ngoài ô (mỗi phía, theo tỷ lệ ô): trang trí
                         # tràn RANH GIỚI Ô vẫn được vớt (mask sở hữu khối lo phần
                         # không vớt nhầm đồ hàng xóm); engine bù 1+2*BLEED khi fit.
                         # Đo thực tế: model tràn tới ~17% ô (đèn lồng ribbon tết)

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
    rìa). Pixel trộn → alpha đúng độ trong suốt thật. Rồi UN-PREMULTIPLY theo
    màu key: quan sát C = α·F + (1−α)·K ⇒ màu thật F = (C − (1−α)·K)/α.
    (Despill kiểu cắt kênh cũ làm mép SẠM ĐEN và ruột bán trong suốt lem —
    trừ sáng thay vì gỡ nền; un-premultiply gỡ đúng phần nền trộn vào.)

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
            # un-premultiply: gỡ phần nền key đã trộn vào, trả màu thật
            inv = 1 - a
            r = min(255, max(0, round((r - inv * kr) / a)))
            g = min(255, max(0, round((g - inv * kg) / a)))
            b = min(255, max(0, round((b - inv * kb) / a)))
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
    """BFS 4-hướng trên mask nghiêm → ([(bbox, size, centroid, id)], labelmap).
    labelmap[i] = id khối (1-based) tại pixel i — dùng mask pixel theo QUYỀN SỞ
    HỮU khối khi crop ô (chặn phần thân khối hàng xóm tràn vào vùng crop)."""
    seen = bytearray(W * H)
    labelmap = array("H", bytes(2 * W * H))
    blobs = []
    for start in range(W * H):
        if not strict[start] or seen[start]:
            continue
        q = deque([start])
        seen[start] = 1
        l = r = start % W
        t = b = start // W
        n = sx = sy = 0
        lbl = len(blobs) + 1
        px_list = []
        while q:
            i = q.popleft()
            px_list.append(i)
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
            for i in px_list:
                labelmap[i] = lbl
            blobs.append(((l, t, r + 1, b + 1), n, (sx / n, sy / n), lbl))
    return blobs, labelmap


def snap_to_safe(canvas, sk, safe):
    """Nắn nội dung về KHUNG SAFE: model vẽ gần đúng chứ không đúng 100% —
    dò LÕI element (vùng phủ alpha dày ≥50% hàng/cột dày nhất — tua rua, đèn
    lồng, tia sáng mảnh không tính), rồi scale + dịch cho lõi khớp khung safe.
    Hình học (nút, panel...) được scale; nhân vật/burst chỉ dịch (scale thân
    nhân vật theo lõi dễ phá dáng). Nhờ vậy MỌI style ra thân cùng cỡ, cùng
    toạ độ — trang trí đi theo tự nhiên."""
    if sk["shape"] == "full":
        return canvas
    W, H = canvas.size
    sx, sy, sw, sh = safe
    a = canvas.getchannel("A").load()
    row_cov = [sum(1 for x in range(W) if a[x, y] >= 128) for y in range(H)]
    col_cov = [sum(1 for y in range(H) if a[x, y] >= 128) for x in range(W)]
    if not any(row_cov):
        return canvas
    rmax, cmax = max(row_cov), max(col_cov)
    rows = [y for y, c in enumerate(row_cov) if c >= rmax * 0.5]
    cols = [x for x, c in enumerate(col_cov) if c >= cmax * 0.5]
    cl, ct, cr, cb = min(cols), min(rows), max(cols) + 1, max(rows) + 1

    s = 1.0
    if sk["shape"] in ("pill", "bar", "rrect", "circle", "puzzle"):
        s = min(sw / (cr - cl), sh / (cb - ct))
        s = max(0.7, min(1.35, s))          # chặn scale hoang khi dò lõi trượt
    scaled = canvas if s == 1.0 else canvas.resize(
        (max(1, round(W * s)), max(1, round(H * s))), Image.LANCZOS)
    if sk.get("anchor") == "bottom":        # mascot ngó: đáy lõi chạm đáy khung
        dx = round(sx + sw / 2 - (cl + cr) / 2 * s)
        dy = round(sy + sh - cb * s)
    else:
        dx = round(sx + sw / 2 - (cl + cr) / 2 * s)
        dy = round(sy + sh / 2 - (ct + cb) / 2 * s)
    # kẹp dịch chuyển: đừng đẩy content (kể cả trang trí) lòi khỏi canvas khi còn chỗ
    ab = canvas.getchannel("A").getbbox()
    if ab:
        lo, hi = -math.floor(ab[0] * s), W - math.ceil(ab[2] * s)
        if lo <= hi:
            dx = min(max(dx, lo), hi)
        lo, hi = -math.floor(ab[1] * s), H - math.ceil(ab[3] * s)
        if lo <= hi:
            dy = min(max(dy, lo), hi)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(scaled, (dx, dy), scaled)
    return out


def fill_mask_holes(msk):
    """Lấp vùng 0 KÍN trong mask (không thông ra biên): ruột bán-trong-suốt
    (kính, hollow có glow) nằm dưới ngưỡng strict nên không thuộc blob nào —
    nhưng bị viền element bao kín thì vẫn là ruột, phải giữ."""
    w, h = msk.size
    mp = msk.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mp[x, y] == 0 and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if mp[x, y] == 0 and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and mp[nx, ny] == 0 and not seen[ny * w + nx]:
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    for y in range(h):
        for x in range(w):
            if mp[x, y] == 0 and not seen[y * w + x]:
                mp[x, y] = 255
    return msk


def trim_flat_cell(cell_rgb):
    """Ô full-bleed: gọt các cột/hàng PHẲNG (một màu đều — dải gap màu key giữa
    hai nửa, hay mép key sót) ở 4 mép. Cột artwork thật luôn biến thiên dọc
    (trời→đất) nên không bị gọt. Trả bbox (l, t, r, b)."""
    W, H = cell_rgb.size
    px = cell_rgb.load()

    def flat_col(x):
        r0, g0, b0 = px[x, 0]
        for i in range(1, 16):
            r, g, b = px[x, (i * (H - 1)) // 15]
            if abs(r - r0) > 14 or abs(g - g0) > 14 or abs(b - b0) > 14:
                return False
        return True

    def flat_row(y):
        r0, g0, b0 = px[0, y]
        for i in range(1, 16):
            r, g, b = px[(i * (W - 1)) // 15, y]
            if abs(r - r0) > 14 or abs(g - g0) > 14 or abs(b - b0) > 14:
                return False
        return True

    lim_x, lim_y = W // 8, H // 8
    l = 0
    while l < lim_x and flat_col(l): l += 1
    r = W
    while r > W - lim_x and flat_col(r - 1): r -= 1
    t = 0
    while t < lim_y and flat_row(t): t += 1
    b = H
    while b > H - lim_y and flat_row(b - 1): b -= 1
    return l, t, r, b


def pack_atlas(items, max_w=2048):
    """Shelf-pack các mảnh RUỘT (đã crop chặt) thành 1 atlas + json Phaser.

    Format JSON Hash của Phaser: frame = vị trí ruột trong atlas,
    sourceSize = canvas chuẩn hoá, spriteSourceSize = vị trí ruột trong canvas
    → Phaser tự bù đệm, sprite hành xử như ảnh canvas đầy đủ nhưng texture
    chỉ tốn đúng phần ruột."""
    items = sorted(items, key=lambda it: -it[1].height)
    x = y = row_h = 0
    placed = []
    for name, tight, (W, H), (ox, oy) in items:
        if x + tight.width > max_w:
            x = 0
            y += row_h + 2
            row_h = 0
        placed.append((name, tight, (W, H), (ox, oy), (x, y)))
        x += tight.width + 2
        row_h = max(row_h, tight.height)
    atlas_h = y + row_h
    atlas = Image.new("RGBA", (max_w, atlas_h), (0, 0, 0, 0))
    frames = {}
    for name, tight, (W, H), (ox, oy), (ax, ay) in placed:
        atlas.paste(tight, (ax, ay))
        frames[name] = {
            "frame": {"x": ax, "y": ay, "w": tight.width, "h": tight.height},
            "rotated": False, "trimmed": True,
            "spriteSourceSize": {"x": ox, "y": oy, "w": tight.width, "h": tight.height},
            "sourceSize": {"w": W, "h": H}
        }
    return atlas, {"frames": frames,
                   "meta": {"image": "atlas.png", "size": {"w": max_w, "h": atlas_h}, "scale": "1"}}


manifest = {"styles": {}}
for style in cfg["styles"]:
    sid = style["id"]
    threshold = style.get("threshold", DEFAULT_THRESHOLD)
    strict_threshold = style.get("grow_threshold", threshold + GROW_OFFSET)
    out_dir = os.path.join(HERE, "kits", sid)
    entry = {"sheets": {}, "assets": [], "empty_cells": []}
    atlas_items = []

    for sh in cfg["sheets"]:
        if sh.get("styles") and sid not in sh["styles"]:
            continue                     # sheet riêng của style khác (vd pose-<char>)
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
        blobs, labelmap = label_blobs(strict, W, H)

        cell_blobs = [[] for _ in range(COLS * ROWS)]
        for box, n, (cx, cy), lbl in blobs:
            idx = min(ROWS - 1, int(cy // cell_h)) * COLS + min(COLS - 1, int(cx // cell_w))
            cell_blobs[idx].append((box, n, lbl))

        # Đốm tí hon dính sát BIÊN ô = rơi vãi từ ô hàng xóm (spec bắt element chừa
        # ≥40px padding nên blob xịn không bám mép). Không lọc là nó kéo bbox union
        # rộng tới mép, crop múc theo cả mảng bán-trong-suốt của hàng xóm (đã dính:
        # đèn lồng của ribbon tết lạc vào 11-digit-plate). Sao/sparkle quanh burst
        # nằm giữa ô và to hơn hẳn 1% nên không bị đụng.
        edge = 0.06
        cell_boxes = [None] * (COLS * ROWS)
        cell_keep = [set() for _ in range(COLS * ROWS)]   # id các khối được giữ / ô
        dropped = 0
        for idx, blist in enumerate(cell_blobs):
            if not blist:
                continue
            main_n = max(n for _, n, _ in blist)
            row, col = divmod(idx, COLS)
            cl, ct = col * cell_w, row * cell_h
            mx, my = cell_w * edge, cell_h * edge
            for box, n, lbl in blist:
                l, t, r, b = box
                near_edge = (r <= cl + mx or l >= cl + cell_w - mx or
                             b <= ct + my or t >= ct + cell_h - my)
                if n < main_n * 0.01 and near_edge:
                    dropped += 1
                    continue
                cell_keep[idx].add(lbl)
                cur = cell_boxes[idx]
                cell_boxes[idx] = box if cur is None else (
                    min(cur[0], box[0]), min(cur[1], box[1]), max(cur[2], box[2]), max(cur[3], box[3]))
        if dropped:
            print(f"  · {job}: bỏ {dropped} đốm rơi vãi sát biên ô")

        os.makedirs(out_dir, exist_ok=True)
        n_ok = 0
        BX, BY = round(cell_w * BLEED), round(cell_h * BLEED)
        CVW, CVH = CW + 2 * BX, CH + 2 * BY       # canvas = ô + vành bleed
        for idx, comp in enumerate(sh["components"]):
            row, col = divmod(idx, COLS)
            cx0, cy0 = round(col * cell_w), round(row * cell_h)
            canvas = Image.new("RGBA", (CVW, CVH), (0, 0, 0, 0))
            if comp["skel"]["shape"] == "full":
                # Ô full-bleed (bg): KHÔNG key gì cả — artwork phủ kín ô, key chỉ
                # còn ở dải gap → matte trên artwork là tự phá ảnh (đã dính: nền
                # blur bị ăn sạch). Crop nguyên ô đục 100%, gọt dải gap phẳng ở mép.
                cell_rgb = raw_img.convert("RGB").crop((cx0, cy0, cx0 + CW, cy0 + CH))
                fl, ft, fr, fb = trim_flat_cell(cell_rgb)
                canvas.paste(cell_rgb.crop((fl, ft, fr, fb)).convert("RGBA"), (BX + fl, BY + ft))
            else:
                box = cell_boxes[idx]
                if box is None:
                    entry["empty_cells"].append(comp["file"])
                    continue
                # Canvas = NGUYÊN Ô, KHÔNG căn lại theo bbox nội dung: khung SAFE ZONE
                # của contract (skel trong styles.json) nằm cố định trong ô, nên toạ độ
                # ghép game/Figma luôn gán theo khung — trang trí tràn ngoài khung được
                # giữ nguyên chỗ, model vẽ bay bổng cỡ nào cũng không xô layout.
                # Chỉ dán vùng bbox (nới HALO) của blob THUỘC ô → junk hàng xóm không lọt.
                # Vùng crop ĐƯỢC với sang ô bên cạnh (tối đa hết vành bleed) để vớt
                # trang trí tràn ranh giới ô — mask sở hữu khối chặn đồ của hàng xóm.
                l, t, r, b = box
                L = max(0, cx0 - BX, l - HALO - PAD); T = max(0, cy0 - BY, t - HALO - PAD)
                R = min(W, cx0 + CW + BX, r + HALO + PAD); B = min(H, cy0 + CH + BY, b + HALO + PAD)
                region = keyed.crop((L, T, R, B))
                # Mask theo QUYỀN SỞ HỮU khối: pixel chỉ giữ nếu thuộc khối đã gán
                # cho ô này (nới MaxFilter ăn quầng glow mềm quanh khối). Không mask
                # là thân khối hàng xóm tràn vào vùng crop bị múc theo (đã dính:
                # nóc hộp quà ô dưới lọt vào đáy tab chip).
                keep = cell_keep[idx]
                msk = Image.new("L", (R - L, B - T), 0)
                mp = msk.load()
                for yy in range(T, B):
                    base = yy * W
                    for xx in range(L, R):
                        if labelmap[base + xx] in keep:
                            mp[xx - L, yy - T] = 255
                msk = fill_mask_holes(msk.filter(ImageFilter.MaxFilter(2 * HALO + 1)))
                region.putalpha(ImageChops.multiply(region.getchannel("A"), msk))
                canvas.paste(region, (L - (cx0 - BX), T - (cy0 - BY)), region)
            sk = comp["skel"]
            sw, sh_ = round(CW * sk["w"]), round(CH * sk["h"])
            sx = BX + (CW - sw) // 2
            sy = BY + (CH - sh_ - round(CH * 0.04) if sk.get("anchor") == "bottom" else (CH - sh_) // 2)
            # Audit chạm mép TRƯỚC snap: snap kéo content vào trong canvas nên vết
            # cụt (cắt ở biên vùng crop) sẽ "tàng hình" nếu đo sau
            pre = canvas.getchannel("A").getbbox()
            if pre and sk["shape"] != "full" and (
                    pre[0] == 0 or pre[1] == 0 or pre[2] == CVW or pre[3] == CVH):
                print(f"  ⚠ {sid}/{comp['file']}: content chạm mép canvas — raw tràn quá vành bleed, bị cụt")
            canvas = snap_to_safe(canvas, sk, (sx, sy, sw, sh_))
            canvas.save(os.path.join(out_dir, f"{comp['file']}.png"))
            abox = canvas.getchannel("A").getbbox()
            if abox is None:
                entry["empty_cells"].append(comp["file"])
                continue
            ox, oy = abox[0], abox[1]
            pw, ph = abox[2] - abox[0], abox[3] - abox[1]
            tight = canvas.crop(abox)
            # tight/ = ruột crop chặt, không đệm canvas — cho Figma/designer lấy lẻ
            os.makedirs(os.path.join(out_dir, "tight"), exist_ok=True)
            tight.save(os.path.join(out_dir, "tight", f"{comp['file']}.png"))
            # ruột lệch tâm khung safe nhiều = model vẽ sai chỗ → cảnh báo để đối
            # chiếu raw/ (bbox gồm cả trang trí tràn nên lệch nhẹ là bình thường)
            dev_x = (ox + pw / 2) - (sx + sw / 2)
            dev_y = (oy + ph / 2) - (sy + sh_ / 2)
            if abs(dev_x) > CW * 0.06 or abs(dev_y) > CH * 0.06:
                print(f"  ⚠ {sid}/{comp['file']}: ruột lệch khung safe ({dev_x:+.0f},{dev_y:+.0f})px")
            atlas_items.append((comp["file"], tight, (CVW, CVH), (ox, oy)))
            entry["assets"].append({"file": comp["file"] + ".png", "sheet": sh["id"],
                                    "canvas": [CVW, CVH], "cell": [CW, CH], "bleed": [BX, BY],
                                    "content": [pw, ph],
                                    "content_at": [ox, oy], "safe": [sx, sy, sw, sh_]})
            n_ok += 1

        entry["sheets"][sh["id"]] = {"mode": mode, "bg_detected": bg,
                                     "canvas": [CVW, CVH], "cell": [CW, CH], "bleed": [BX, BY],
                                     "size": [W, H], "blobs": len(blobs), "cut": n_ok}
        print(f"✓ {job}: {n_ok}/{len(sh['components'])} (canvas {CVW}x{CVH} = ô {CW}x{CH} + bleed), "
              f"{len(blobs)} khối, {mode}")

    if atlas_items:
        atlas_img, atlas_json = pack_atlas(atlas_items)
        atlas_img.save(os.path.join(out_dir, "atlas.png"))
        json.dump(atlas_json, open(os.path.join(out_dir, "atlas.json"), "w"), indent=1)
        entry["atlas"] = {"image": "atlas.png", "json": "atlas.json",
                          "size": [atlas_img.width, atlas_img.height]}
        print(f"  atlas {sid}: {atlas_img.width}x{atlas_img.height}, {len(atlas_items)} frame")

    manifest["styles"][sid] = entry
    total = len(entry["assets"])
    want = sum(len(sh["components"]) for sh in cfg["sheets"]
               if not sh.get("styles") or sid in sh["styles"])
    print(f"— {sid}: {total}/{want} asset" +
          (f", Ô TRỐNG: {entry['empty_cells']}" if entry["empty_cells"] else ""))

json.dump(manifest, open(os.path.join(HERE, "kits", "manifest.json"), "w"),
          indent=2, ensure_ascii=False)
print("→ kits/manifest.json")
