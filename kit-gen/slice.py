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
import json, math, os, re, sys
from collections import deque
from array import array
from PIL import Image, ImageChops, ImageFilter, ImageOps

# QA này chỉ là cổng dữ liệu. Không có nhánh nào gọi lại gen.sh khi bị cờ.
# 15px đủ lớn hơn nhiễu thường đo được (~6px/mép), vẫn bắt sai lệch hình học
# có ý nghĩa; không đặt thấp hơn sàn nhiễu, cũng không dùng 23px cực xấu làm
# ngưỡng mặc định vì sẽ nuốt các ca lệch 16–22px mà người dùng cần thấy.
SIZE_DEVIATION_THRESHOLD_PX = 15
QA_SIZE_DEVIATION_THRESHOLD_PX = SIZE_DEVIATION_THRESHOLD_PX

# ── THƯ VIỆN TÍNH TOÁN: CHỈ CÒN numpy + scipy ────────────────────────────────
# Bản chroma phải nạp cả `pymatting` (closed-form alpha) và `torch`+`transformers`
# (ViTMatte) để giải ngược C = α·F + (1−α)·K — bài toán chỉ tồn tại khi nền là MÀU.
# Nền nay là alpha thật: α đọc thẳng từ file, không phải giải gì cả. Hai thư viện
# đó đã bỏ khỏi mã lẫn khỏi bộ cài (ViTMatte kéo theo ~2 GB torch + checkpoint).
#
# `scipy.ndimage` thì Ở LẠI: nó không dính gì tới tách nền, nó lo phần hình học —
# dán nhãn khối liên thông để dọn đốm mồ côi sau `snap_to_safe`.
try:
    import numpy as np
    from scipy import ndimage
    HAS_NDIMAGE = True
except (ImportError, RuntimeError):        # thiếu lib ⇒ bỏ bước dọn đốm, không chết
    HAS_NDIMAGE = False

HERE = os.path.dirname(os.path.abspath(__file__))
# HÌNH HỌC DÙNG CHUNG VỚI PROMPT. `geometry.py` nằm cạnh file này (engine.mjs copy
# cả hai vào project). Bốn con số mà prompt HỨA với model và bốn con số dao cắt
# DÙNG phải ra từ cùng một hàm — trước 27/08/2026 chúng là hai công thức viết tay ở
# hai file khác ngôn ngữ, lệch nhau đúng 1px, và không có test nào nhìn thấy.
sys.path.insert(0, HERE)
import geometry                                                   # noqa: E402

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


def in_boxes(x, y, boxes):
    """Điểm nằm trong một hộp `(l, t, r, b)` nào chưa (nửa mở bên phải/dưới)."""
    return any(l <= x < r and t <= y < b for l, t, r, b in boxes)


# Khổ mong đợi theo khai báo của sheet — KHÔNG còn là bản chép. Bảng thật nằm ở
# `geometry.py:CANVAS`, cùng bảng mà khối python của gen.sh import. Khổ ảnh từng
# được suy ĐỘC LẬP ở bốn chỗ (gen.sh, run_one, skeleton-svg.js, file này), mỗi chỗ
# một dòng ba ngôi `orient == "portrait" ? … : …`; nay khung xương đã bỏ và hai chỗ
# còn lại ăn chung một bảng, nên không còn gì để mà quên đồng bộ.
# `[:2]` vì `geometry.CANVAS` mang thêm hai chuỗi (header + tỉ lệ) dành cho prompt —
# ở đây chỉ cần con số.
CANVAS = {k: v[:2] for k, v in geometry.CANVAS.items()}


def orientation_error(orient, W, H, canvas=None):
    """Ảnh raw có đúng khổ mà sheet đã khai không? Trả câu lỗi, hoặc None nếu đúng.

    VÌ SAO TÁCH RA: phép chia lưới ở cuối file lấy ĐẠI kích thước ảnh nhận được rồi
    chia cho grid, không hỏi khổ có đúng không. Model trả sai hướng là mọi ô méo lặng
    lẽ — sheet 4x2 landscape mong ô 384x512, nhận ảnh dọc thì ô thành 256x768. Cờ QA
    chỉ báo SAU KHI đã cắt, tức là đã tiêu tiền sinh ảnh rồi mới biết. Sự cố 21/08/2026.

    Ngưỡng 10%: đủ rộng cho vài pixel làm tròn của model, đủ chặt để bắt cả ảnh VUÔNG
    (tỉ lệ 1.0 lệch 33% so với 1.5 và 50% so với 0.667) lẫn ảnh lộn hướng. Với sheet
    khai VUÔNG thì ngưỡng đó lật ngược lại đúng như vậy: ảnh ngang/dọc bị bắt.

    `canvas` là field mới ("landscape"|"portrait"|"square") và THẮNG `orient`; sheet
    đời cũ chỉ có `orient` nên nó vẫn được đọc làm đường lùi.
    """
    if not H:
        return f"anh cao 0px ({W}x{H})"
    key = str(canvas or orient or "landscape").lower()
    if key not in CANVAS:
        key = "landscape"
    want_w, want_h = CANVAS[key]
    want_ratio = want_w / want_h
    got_ratio = W / H
    if want_ratio * 0.9 <= got_ratio <= want_ratio * 1.1:
        return None
    return f"sheet khai {key} ({want_w}x{want_h}) nhung anh la {W}x{H}"


SOLID_ALPHA = 240      # từ mức này trở lên coi là ĐỤC HẲN — xem alpha_sheet


def alpha_sheet(img):
    """Sheet có alpha thật từ model — dùng thẳng, chỉ nắn phần "đục hẳn" cho tròn.

    ĐO ĐƯỢC trên ảnh model trả về (đối chứng skel-B, BACKLOG #24 ⑰): thân đặc KHÔNG
    nằm ở α=255 mà ở **251–254**, và α cao nhất trong cả ảnh là 254 — không một pixel
    nào đục hoàn toàn. Model vẽ alpha bằng cọ, nên nó "gần đục" chứ không đục.

    Chênh 3/255 mắt không thấy, nhưng nó đi thẳng vào file giao cho người dùng: mọi
    sprite xuất ra đều mờ 1,2%, xếp chồng trong game engine là thấy đường ghép, và
    designer soi ô thì đọc ra "98,8% opacity" cho một cái nút lẽ ra đặc.

    Nên: α ≥ SOLID_ALPHA ⇒ kéo về 255. KHÔNG đụng gì bên dưới ngưỡng — ô `glass` cố
    ý nằm ở α≈64–128 và quầng `glow` tan dần từ 0 lên, cả hai đều cách 240 rất xa.
    Dùng lại đúng con số đã làm mốc `strict` để cả file chỉ có MỘT định nghĩa "đục".
    """
    rgba = img.convert("RGBA")
    a = rgba.getchannel("A").tobytes()
    strict = bytearray(len(a))
    for i, v in enumerate(a):
        if v >= SOLID_ALPHA:
            strict[i] = 1
    if any(SOLID_ALPHA <= v < 255 for v in a):
        rgba.putalpha(rgba.getchannel("A").point(
            lambda v: 255 if v >= SOLID_ALPHA else v))
    return rgba, strict


def painted_checkerboard(img, sample_rows=24):
    """Bắt tấm CARO GIẢ — bẫy nguy hiểm nhất của đường alpha thật.

    Khi model KHÔNG tạo được nền trong suốt, nó không báo lỗi. Nó vẽ lại **cái
    hình ảnh tượng trưng cho trong suốt**: ô caro xám-trắng đan nhau, toàn bộ
    α=255. Đo được trên CẢ HAI lượt nền-đặc của đối chứng (BACKLOG #24 ⑦):
    `(254,254,254)` đan `(245,245,245)`, và `(254,254,254)` đan `(238,238,238)`.

    Nhìn bằng mắt thì **y hệt** một ảnh nền trong suốt — người kiểm cũng gật đầu.
    Không chặn ở đây thì cả sheet caro nướng chín đi thẳng vào `kits/` và không
    khâu nào bắt được nữa. Cùng một họ với `file_hash` chống "OK giả": không tin
    lời khai, đọc thẳng byte.

    Trả `(mức tối, mức sáng)` nếu thấy caro, `None` nếu không.

    NHẬN DIỆN HẸP CÓ CHỦ Ý — sheet raw ĐỜI CŨ (nền magenta/green/cyan/blue) và
    nền phẳng nhạt phải đi lọt, vì cả hai vẫn cắt được:
      · nền phải chiếm phần lớn ảnh và phải SÁNG + TRUNG TÍNH;
      · phải có ĐÚNG HAI mức xám cách nhau vừa phải (caro thật), không phải một;
      · và mức phải ĐỔI ĐỀU ĐẶN theo cả hàng LẪN cột — nền phẳng cho 0 lần đổi,
        chuyển sắc mềm cho 1-2 lần, chỉ caro mới cho hàng chục.
    Đọc PIXEL GỐC, không thu nhỏ: thu nhỏ là trộn hai mức caro thành một mức
    phẳng, tự tay xoá mất thứ đang đi tìm.
    """
    W, H = img.size
    if W < 64 or H < 64:
        return None
    rgb = img.convert("RGB")

    def nhat(c):
        r, g, b = c
        return min(r, g, b) >= 180 and max(r, g, b) - min(r, g, b) <= 12

    bang = rgb.getcolors(maxcolors=1 << 21)     # histogram ở tầng C, không quét Python
    if not bang:
        return None
    muc, sang = {}, 0
    for cnt, c in bang:
        if nhat(c):
            sang += cnt
            v = sum(c) // 3
            muc[v] = muc.get(v, 0) + cnt
    if sang < W * H * 0.25 or len(muc) < 2:
        return None                              # nền không phải xám sáng

    thu_tu = sorted(muc.items(), key=lambda kv: -kv[1])
    v1 = thu_tu[0][0]
    v2 = next((v for v, _ in thu_tu if 3 <= abs(v - v1) <= 60), None)
    if v2 is None:
        return None                              # chỉ một mức ⇒ nền phẳng, không phải caro
    # mức thứ hai phải thực sự là một nửa bàn cờ, không phải vệt răng cưa
    if sum(c for v, c in muc.items() if abs(v - v2) <= 2) < sang * 0.15:
        return None
    lo, hi = min(v1, v2), max(v1, v2)
    mid = (lo + hi) / 2

    px = rgb.load()

    def doi_muc(lay):
        """Số lần đổi mức dọc một tuyến, CHỈ tính trên pixel thuộc nền."""
        truoc, dem = None, 0
        for c in lay:
            if not nhat(c):
                continue                         # gặp hình vẽ thì bỏ qua, không cắt tuyến
            b = sum(c) / 3 > mid
            if truoc is not None and b != truoc:
                dem += 1
            truoc = b
        return dem

    hang = sum(1 for k in range(sample_rows)
               if doi_muc(px[x, H * (k + 1) // (sample_rows + 1)] for x in range(W)) >= 3)
    cot = sum(1 for k in range(sample_rows)
              if doi_muc(px[W * (k + 1) // (sample_rows + 1), y] for y in range(H)) >= 3)
    if hang < sample_rows * 0.5 or cot < sample_rows * 0.5:
        return None                              # sọc một chiều / nhiễu — chưa phải caro
    return lo, hi


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


POSE_SIDE = {"wave": 1, "point": 1, "run": 1, "fly": 1}   # xương kỳ vọng bên PHẢI ảnh


def normalize_pose_side(canvas, want, tag):
    """gpt-image không bị ràng buộc cứng theo xương (không phải ControlNet) nên
    hay MIRROR tay/hướng. Với pose bất đối xứng: đo trọng tâm alpha nửa TRÊN
    (tay giơ/đầu nghiêng kéo trọng tâm về bên đó) so với trục thân — ngược bên
    kỳ vọng thì lật ngang. Lật sprite là phép không mất mát nên luôn an toàn."""
    a = canvas.getchannel("A")
    box = a.getbbox()
    if not box:
        return canvas
    l, t, r, b = box
    px = a.load()

    def centroid_x(y0, y1):
        sx = n = 0
        for y in range(y0, y1):
            for x in range(l, r):
                if px[x, y] > 60:
                    sx += x; n += 1
        return sx / n if n else None

    h = b - t
    # Mốc so sánh là TRỤC THÂN (trọng tâm nửa dưới — chân/thân đối xứng), KHÔNG
    # phải giữa bbox: bbox bị chính cánh tay giơ kéo lệch nên so với bbox sẽ
    # flip oan pose đã đúng (đã dính).
    top = centroid_x(t, t + max(1, h * 2 // 5))
    bot = centroid_x(b - max(1, h * 2 // 5), b)
    if top is None or bot is None:
        return canvas
    bias = top - bot
    if bias * want < 0 and abs(bias) > (r - l) * 0.02:
        print(f"  ↔ {tag}: model mirror pose — lật ngang cho đúng hướng xương")
        return ImageOps.mirror(canvas)
    return canvas


def measure_core(canvas, coverage=0.5):
    """Dò LÕI element: vùng phủ alpha dày ≥50% hàng/cột dày nhất — tua rua,
    đèn lồng, tia sáng mảnh không tính. Trả (l, t, r, b) hoặc None nếu rỗng."""
    W, H = canvas.size
    a = canvas.getchannel("A").load()
    row_cov = [sum(1 for x in range(W) if a[x, y] >= 128) for y in range(H)]
    col_cov = [sum(1 for y in range(H) if a[x, y] >= 128) for x in range(W)]
    if not any(row_cov):
        return None
    rmax, cmax = max(row_cov), max(col_cov)
    rows = [y for y, c in enumerate(row_cov) if c >= rmax * coverage]
    cols = [x for x, c in enumerate(col_cov) if c >= cmax * coverage]
    return min(cols), min(rows), max(cols) + 1, max(rows) + 1


# ── ĐO-KÝ-SỔ HÌNH HỌC SAU CÙNG ────────────────────────────────────────────────
# Projection helper cũ vẫn giữ cho callers ngoài engine.
# Snap/ledger dùng chung phép đo core/decor bên dưới: tách silhouette chính khỏi đồ
# trang trí rồi lấy core
# là thành phần liên thông lớn nhất của lớp enamel. Thuật toán bám
# experiments/sprite-sheet-fairy-gray-safe-v6/measure-core-alignment.py: màu tím
# là enamel, viền màu khác dính core là face/enamel; fallback màu tổng quát dùng
# phần lõi đã erosion để không phụ thuộc palette của một kit cụ thể.


def _mask_bbox(mask, width, height):
    points = [i for i, value in enumerate(mask) if value]
    if not points:
        return None
    xs = [i % width for i in points]
    ys = [i // width for i in points]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def _largest_component(mask, width, height):
    """Trả mask thành phần 4-liên thông lớn nhất + số pixel."""
    seen = bytearray(width * height)
    best = bytearray(width * height)
    best_size = 0
    for start, present in enumerate(mask):
        if not present or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        component = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            if x > 0 and mask[index - 1] and not seen[index - 1]:
                seen[index - 1] = 1; queue.append(index - 1)
            if x + 1 < width and mask[index + 1] and not seen[index + 1]:
                seen[index + 1] = 1; queue.append(index + 1)
            if y > 0 and mask[index - width] and not seen[index - width]:
                seen[index - width] = 1; queue.append(index - width)
            if y + 1 < height and mask[index + width] and not seen[index + width]:
                seen[index + width] = 1; queue.append(index + width)
        if len(component) > best_size:
            best_size = len(component)
            best = bytearray(width * height)
            for index in component:
                best[index] = 1
    return best, best_size


def _erode_mask(mask, width, height, iterations=1):
    current = bytearray(mask)
    for _ in range(max(0, iterations)):
        nxt = bytearray(width * height)
        for index, present in enumerate(current):
            if not present:
                continue
            x, y = index % width, index // width
            if (x == 0 or not current[index - 1] or x + 1 == width or not current[index + 1]
                    or y == 0 or not current[index - width] or y + 1 == height
                    or not current[index + width]):
                continue
            nxt[index] = 1
        current = nxt
    return current


def _dilate_mask(mask, width, height, radius=1):
    current = bytearray(mask)
    for _ in range(max(0, radius)):
        nxt = bytearray(current)
        for index, present in enumerate(current):
            if not present:
                continue
            x, y = index % width, index // width
            if x > 0: nxt[index - 1] = 1
            if x + 1 < width: nxt[index + 1] = 1
            if y > 0: nxt[index - width] = 1
            if y + 1 < height: nxt[index + width] = 1
        current = nxt
    return current


def _projection_core_mask(silhouette, width, height):
    """Tách mặt liên tục khỏi tua/hoa cùng màu bằng erosion + projection.

    Erosion làm rụng các nhánh mảnh trước khi lấy thành phần lớn nhất; projection
    50% giữ phần plateau liên tục thay vì một decoration dày ở một phía. Bbox
    được nới lại đúng bán kính erosion để không biến core thành ảnh nhỏ giả.
    Đây là fallback cho asset không có màu enamel riêng (nhánh tím/median vẫn
    được ưu tiên ở ``_core_mask_for_silhouette``).
    """
    main_box = _mask_bbox(silhouette, width, height)
    main_size = sum(1 for value in silhouette if value)
    if not main_box or not main_size:
        return silhouette, main_size

    radius = max(2, min(12, round(min(width, height) * 0.025)))
    eroded = _erode_mask(silhouette, width, height, radius)
    seed, seed_size = _largest_component(eroded, width, height)
    if seed_size < max(16, int(main_size * 0.04)):
        return silhouette, main_size

    rows = [0] * height
    cols = [0] * width
    for index, value in enumerate(seed):
        if not value:
            continue
        x, y = index % width, index // width
        rows[y] += 1
        cols[x] += 1
    if not rows or not max(rows) or not max(cols):
        return silhouette, main_size
    row_floor = max(rows) * 0.5
    col_floor = max(cols) * 0.5
    ys = [y for y, count in enumerate(rows) if count >= row_floor]
    xs = [x for x, count in enumerate(cols) if count >= col_floor]
    if not xs or not ys:
        return silhouette, main_size
    box = (
        max(main_box[0], min(xs) - radius),
        max(main_box[1], min(ys) - radius),
        min(main_box[2], max(xs) + 1 + radius),
        min(main_box[3], max(ys) + 1 + radius),
    )
    if box == main_box:
        return silhouette, main_size

    candidate = bytearray(width * height)
    candidate_size = 0
    for index, value in enumerate(silhouette):
        if not value:
            continue
        x, y = index % width, index // width
        if box[0] <= x < box[2] and box[1] <= y < box[3]:
            candidate[index] = 1
            candidate_size += 1
    if candidate_size < max(16, int(main_size * 0.05)):
        return silhouette, main_size
    return candidate, candidate_size


def _difference_bbox(outer, inner, width, height):
    """Bbox phần foreground không thuộc core; dùng để theo dõi overflow decor."""
    remainder = bytearray(width * height)
    for index, value in enumerate(outer):
        if value and not inner[index]:
            remainder[index] = 1
    return _mask_bbox(remainder, width, height)


def _median_rgb(pixels, indices, width):
    if not indices:
        return (0, 0, 0)
    # Lấy mẫu đều trên ảnh rất lớn; ledger không cần giữ thêm bản sao bitmap.
    sample = indices if len(indices) <= 12000 else indices[::max(1, len(indices) // 12000)]
    return tuple(sorted(pixels[i % width, i // width][channel] for i in sample)[len(sample) // 2]
                 for channel in range(3))


def _core_mask_for_silhouette(canvas, silhouette, width, height):
    """Dò core màu enamel, fallback morphology nếu không có lớp màu riêng.

    Nhánh tím/vàng giữ đúng mask thí nghiệm. Nhánh tổng quát dùng màu trung vị
    của phần sâu trong silhouette, nên synthetic red/blue + viền giả vẫn đo đúng;
    vật thể đơn sắc không bị co giả nếu morphology không chứng minh được plateau
    riêng; khi có tua cùng màu, projection sau erosion tách phần liên tục chính.
    """
    pixels = canvas.convert("RGBA").load()
    main_indices = [i for i, value in enumerate(silhouette) if value]
    main_size = len(main_indices)
    if not main_indices:
        return bytearray(width * height), 0

    # Mask purple của measure-core-alignment.py: core enamel, không lấy viền vàng.
    purple = bytearray(width * height)
    for i in main_indices:
        r, g, b, _ = pixels[i % width, i // width]
        if b >= 60 and r >= 35 and g <= min(r * 0.72, b * 0.68):
            purple[i] = 1
    purple_core, purple_size = _largest_component(purple, width, height)
    if purple_size >= max(16, int(main_size * 0.05)):
        return purple_core, purple_size

    depth = max(1, min(4, round(min(width, height) * 0.02)))
    inner = _erode_mask(silhouette, width, height, depth)
    inner_indices = [i for i, value in enumerate(inner) if value]
    if not inner_indices:
        return _projection_core_mask(silhouette, width, height)
    median = _median_rgb(pixels, inner_indices, width)
    # 72px là biên đủ rộng cho gradient nhẹ, nhưng vẫn tách viền màu giả.
    candidate = bytearray(width * height)
    for i in main_indices:
        r, g, b, _ = pixels[i % width, i // width]
        if math.dist((r, g, b), median) <= 72:
            candidate[i] = 1
    core, core_size = _largest_component(candidate, width, height)
    main_box = _mask_bbox(silhouette, width, height)
    core_box = _mask_bbox(core, width, height)
    if not core_box or core_size < max(16, int(main_size * 0.05)):
        return _projection_core_mask(silhouette, width, height)
    # Không có viền màu riêng: candidate phủ gần hết thân → đây là chính thân.
    if core_box == main_box or core_size >= int(main_size * 0.82):
        return _projection_core_mask(silhouette, width, height)
    if (core_box[2] - core_box[0] < max(3, round((main_box[2] - main_box[0]) * 0.2))
            or core_box[3] - core_box[1] < max(3, round((main_box[3] - main_box[1]) * 0.2))):
        return _projection_core_mask(silhouette, width, height)
    return core, core_size


def _enamel_mask_from_core(silhouette, core, width, height):
    """Core + các lớp viền dính core; đồ trang trí rời bị loại khỏi enamel."""
    core_size = sum(1 for value in core if value)
    if not core_size:
        return silhouette
    if core_size == sum(1 for value in silhouette if value):
        return silhouette
    near = _dilate_mask(core, width, height, 3)
    remainder = bytearray(width * height)
    for i, value in enumerate(silhouette):
        if value and not core[i]:
            remainder[i] = 1
    seen = bytearray(width * height)
    enamel = bytearray(core)
    for start, present in enumerate(remainder):
        if not present or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        component = []
        touches_core = False
        while queue:
            index = queue.popleft()
            component.append(index)
            if near[index]:
                touches_core = True
            x, y = index % width, index // width
            if x > 0 and remainder[index - 1] and not seen[index - 1]:
                seen[index - 1] = 1; queue.append(index - 1)
            if x + 1 < width and remainder[index + 1] and not seen[index + 1]:
                seen[index + 1] = 1; queue.append(index + 1)
            if y > 0 and remainder[index - width] and not seen[index - width]:
                seen[index - width] = 1; queue.append(index - width)
            if y + 1 < height and remainder[index + width] and not seen[index + width]:
                seen[index + width] = 1; queue.append(index + width)
        if touches_core:
            for index in component:
                enamel[index] = 1
    return enamel


def _xywh_from_rect(rect):
    if rect is None:
        return None
    return [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]]


def measure_asset_geometry(canvas, contract_safe=None, threshold=SIZE_DEVIATION_THRESHOLD_PX,
                           shape=None):
    """Đo geometry THẬT của canvas sau mọi bước tách/nắn.

    `contract_safe` là `[x, y, w, h]` của safe zone trong canvas; kết quả `core`,
    `enamel`, `silhouette`, `decoration` là bbox `[left, top, right, bottom]`
    theo pixel canvas. `safe` dùng core đo được (fallback enamel/silhouette), để
    snap/crop giữ đúng functional surface mà không để decoration điều khiển scale.
    QA dùng ``core_undershoot`` một phía; overflow ghi riêng, không tự gen lại.
    """
    rgba = canvas.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A").load()
    visible = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            if alpha[x, y] >= 128:
                visible[y * width + x] = 1
    # Core tìm trên thân liên tục lớn nhất; silhouette giữ TOÀN BỘ foreground để
    # decoration rời core vẫn xuất hiện trong ledger/crop tracking, không biến mất
    # chỉ vì nó không nối 4-neighbor với mặt chính.
    body, body_size = _largest_component(visible, width, height)
    core, core_size = _core_mask_for_silhouette(rgba, body, width, height)
    enamel = _enamel_mask_from_core(body, core, width, height)
    silhouette_box = _mask_bbox(visible, width, height)
    core_box = _mask_bbox(core, width, height)
    enamel_box = _mask_bbox(enamel, width, height)
    decoration_box = _difference_bbox(visible, core, width, height)
    safe_rect = core_box or enamel_box or silhouette_box
    safe = _xywh_from_rect(safe_rect)

    contract = list(contract_safe) if contract_safe is not None else None
    edges = None
    max_edge = None
    undershoot = None
    overflow = None
    if contract is not None and safe_rect is not None:
        target = (contract[0], contract[1], contract[0] + contract[2], contract[1] + contract[3])
        errors = tuple(safe_rect[i] - target[i] for i in range(4))
        edges = {"left": errors[0], "top": errors[1], "right": errors[2], "bottom": errors[3]}
        # Chỉ thiếu vào safe-zone là lỗi. Core/decor tràn ra ngoài còn cắt được.
        undershoot = {
            "left": max(0, errors[0]),
            "top": max(0, errors[1]),
            "right": max(0, -errors[2]),
            "bottom": max(0, -errors[3]),
        }
        overflow = {
            "left": max(0, -errors[0]),
            "top": max(0, -errors[1]),
            "right": max(0, errors[2]),
            "bottom": max(0, errors[3]),
        }
        max_edge = max(undershoot.values())
    threshold = int(threshold)
    return {
        "silhouette": list(silhouette_box) if silhouette_box else None,
        "core": list(core_box) if core_box else None,
        "enamel": list(enamel_box) if enamel_box else None,
        "decoration": list(decoration_box) if decoration_box else None,
        "safe": safe,
        "contractSafe": contract,
        "deviation": {
            "edgesPx": edges,
            "maxEdgePx": max_edge,
            "undershootPx": undershoot,
            "overflowPx": overflow,
            "metric": "core_undershoot",
        },
        "sizeDeviation": {
            "maxEdgePx": max_edge,
            "flagged": bool(max_edge is not None and max_edge > threshold),
            "threshold": threshold,
            "edgesPx": edges,
            "undershootPx": undershoot,
            "overflowPx": overflow,
            "metric": "core_undershoot",
        },
        "measured": bool(body_size),
    }


def _measured_core_box(canvas):
    """Core bbox duy nhất cho snap, free-safe và ledger; decor không điều khiển scale."""
    measured = measure_asset_geometry(canvas)
    box = measured.get("core")
    return tuple(box) if box else None


# Tên dễ đọc cho test/tool ngoài engine; giữ một API duy nhất.
measure_core_enamel = measure_asset_geometry


def align_content_safe(canvas, safe, tag=None):
    """Chỉ TỊNH TIẾN lõi đặc vào giữa contentSafe, tuyệt đối không resize.

    ImageGen thường giữ đúng hình nhưng đặt cả object lệch vài chục px trong ô.
    coverage cao bỏ qua cánh/hoa/tua rua mảnh và bám vào mặt element liên tục.
    Contract vẫn là tọa độ cố định; phép này chỉ sửa placement do model.
    """
    core = _measured_core_box(canvas)
    if core is None:
        return canvas
    sx, sy, sw, sh = safe
    cl, ct, cr, cb = core
    dx = round(sx + sw / 2 - (cl + cr) / 2)
    dy = round(sy + sh / 2 - (ct + cb) / 2)
    W, H = canvas.size
    ab = canvas.getchannel("A").getbbox()
    if ab:
        dx = min(max(dx, -ab[0]), W - ab[2])
        dy = min(max(dy, -ab[1]), H - ab[3])
    if dx == 0 and dy == 0:
        return canvas
    if tag:
        print(f"  → {tag}: contentSafe chỉ tịnh tiến ({dx:+d},{dy:+d})px, không resize")
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # KHÔNG truyền mask: `paste(im, box, im)` tính out = out*(1−a) + im*a trên
    # buffer straight-alpha TRONG SUỐT ⇒ alpha bị BÌNH PHƯƠNG (a²/255) và RGB bị
    # premultiply nhầm — đúng nguồn gốc "rỗ rỗ" (lỗ li ti + mảng lộ nền + xỉn màu),
    # đo được ở docs/research-hole-artifacts-2026-08.md §5. Đích là canvas vừa
    # `Image.new` rỗng nên copy thẳng 4 kênh là đúng ngữ nghĩa và rẻ nhất.
    out.paste(canvas, (dx, dy))
    return out


def snap_to_safe(canvas, sk, safe):
    """Nắn nội dung về KHUNG SAFE: model vẽ gần đúng chứ không đúng 100% —
    dò LÕI element rồi scale + dịch cho lõi khớp khung safe. Hình học (nút,
    panel...) được scale; nhân vật/burst chỉ dịch (scale thân nhân vật theo
    lõi dễ phá dáng). Nhờ vậy MỌI style ra thân cùng cỡ, cùng toạ độ —
    trang trí đi theo tự nhiên. (Element `free` KHÔNG qua đây: giữ nguyên
    art, safe zone = lõi đo được — khung động theo ý art.)"""
    if sk["shape"] == "full":
        return canvas
    W, H = canvas.size
    sx, sy, sw, sh = safe
    core = _measured_core_box(canvas)
    if core is None:
        return canvas
    cl, ct, cr, cb = core

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
    out.paste(scaled, (dx, dy))       # KHÔNG mask — xem align_content_safe
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


# ── Ô matte:"glow" vẽ trên NỀN ĐEN ────────────────────────────────────────────
MATTE_BLEND = {"glow": "screen"}


def asset_blend(skel):
    """Blend mode phải đặt cho asset này. None = vẽ thường (`source-over`)."""
    return MATTE_BLEND.get((skel or {}).get("matte"))


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


# ── CLI: tham số + ổ khoá manifest ───────────────────────────────────────────
# CẮT LŨY TIẾN (14/08 → 15/08). Trước: cả lượt gen xong 10 tấm mới cắt MỘT LẦN, người
# dùng ngồi nhìn màn hình trống 15 phút. Nay agent gọi slice.py NGAY khi một tấm gen
# xong, với đúng một style + đúng một sheet:
#     python3 slice.py tet --sheet=main
# Nên CLI có thêm `--sheet=<id>` (lặp được) / `--sheets=a,b`. Không truyền = cắt mọi
# sheet như cũ (pha "lưới an toàn" cuối lượt vẫn chạy y nguyên).
#
# Vì sao KHÔNG thu hẹp bằng styles.json như agent vẫn làm với gen.sh: styles.json là
# file DÙNG CHUNG của cả lượt (gen.sh đang đọc nó), viết đè nó giữa lượt để lọc sheet
# là sửa hợp đồng dưới chân tiến trình khác. Lọc bằng argv thì không ai bị ảnh hưởng.


def parse_cli(argv):
    """Tách argv thành (tập style, tập sheet|None). Không có cờ = hành vi cũ y nguyên."""
    styles, sheets = set(), set()
    for a in argv:
        if a.startswith("--sheet="):
            sheets.add(a[len("--sheet="):].strip())
        elif a.startswith("--sheets="):
            sheets.update(s.strip() for s in a[len("--sheets="):].split(",") if s.strip())
        elif a.startswith("-"):
            raise SystemExit(f"slice.py: tham số lạ {a!r} (chỉ có --sheet= / --sheets=)")
        else:
            styles.add(a)
    return styles, (sheets or None)


# ── Ổ KHOÁ + GHI NGUYÊN TỬ cho kits/manifest.json ────────────────────────────
# `manifest.json` được ĐỌC ở đầu lượt và GHI ở cuối lượt (khối merge). Với cắt lũy
# tiến, hai tấm gen xong cách nhau vài giây sẽ chạy hai lượt slice CHỒNG NHAU, và
# hai lượt đó cùng đọc–sửa–ghi một file: lượt về sau ghi đè mất phần của lượt trước
# (lost update) — đúng cái mà khối merge sinh ra để tránh.
# Hai lớp bảo vệ, cả hai đều cần:
#   ① Ổ KHOÁ HỆ ĐIỀU HÀNH (flock/msvcrt) giữ từ TRƯỚC lúc đọc tới SAU lúc ghi ⇒
#      đọc–sửa–ghi là một khối không chia cắt được. Khoá theo tiến trình: tiến trình
#      chết là hệ điều hành tự nhả, không có khoá ma treo vĩnh viễn.
#   ② GHI NGUYÊN TỬ (tmp + os.replace) ⇒ agent đọc manifest giữa chừng không bao giờ
#      vớ phải file cụt (`GET /api/projects/:id/kit` đọc thẳng file này).
MANIFEST_LOCK_TIMEOUT = 900.0

try:
    import fcntl as _fcntl
except ImportError:                       # Windows
    _fcntl = None
try:
    import msvcrt as _msvcrt
except ImportError:                       # POSIX
    _msvcrt = None


def _try_lock(fd):
    """True nếu giành được khoá độc quyền, False nếu tiến trình khác đang giữ."""
    try:
        if _fcntl is not None:
            _fcntl.flock(fd, _fcntl.LOCK_EX | _fcntl.LOCK_NB)
        elif _msvcrt is not None:
            os.lseek(fd, 0, os.SEEK_SET)
            _msvcrt.locking(fd, _msvcrt.LK_NBLCK, 1)
        return True
    except OSError:
        return False


def acquire_manifest_lock(kits_dir, timeout=MANIFEST_LOCK_TIMEOUT, poll=0.05):
    """Giữ khoá tới khi tiến trình thoát (không cần nhả tay). Trả fd, hoặc None nếu
    nền tảng không có cơ chế khoá nào (khi đó vẫn chạy — chỉ mất lớp bảo vệ ①)."""
    import time
    os.makedirs(kits_dir, exist_ok=True)
    if _fcntl is None and _msvcrt is None:
        return None
    fd = os.open(os.path.join(kits_dir, ".manifest.lock"), os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + timeout
    while not _try_lock(fd):
        if time.monotonic() >= deadline:
            os.close(fd)
            raise SystemExit("slice.py: chờ quá lâu ổ khoá kits/manifest.json — "
                             "còn một lượt cắt khác đang chạy trong cùng thư mục")
        time.sleep(poll)
    return fd


def dump_manifest(mpath, manifest):
    """Ghi manifest NGUYÊN TỬ: người đọc thấy bản cũ trọn vẹn hoặc bản mới trọn vẹn."""
    tmp = mpath + ".tmp"
    with open(tmp, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, mpath)


def summarize_size_deviation(assets, threshold=SIZE_DEVIATION_THRESHOLD_PX, style_id=None):
    """Tổng hợp QA thuần dữ liệu; tuyệt đối không kích hoạt gen lại."""
    measured = []
    flagged_assets = []
    worst = None
    for asset in assets or []:
        qa = asset.get("sizeDeviation") or {}
        max_edge = qa.get("maxEdgePx")
        if not isinstance(max_edge, (int, float)):
            continue
        measured.append(asset)
        worst = max(abs(max_edge), worst or 0)
        if qa.get("flagged"):
            flagged_assets.append({
                "style": style_id if style_id is not None else asset.get("_style"),
                "file": asset.get("file"),
                "maxEdgePx": max_edge,
            })
    return {
        "threshold": int(threshold),
        "measured": len(measured),
        "flagged": bool(flagged_assets),
        "flaggedCount": len(flagged_assets),
        "maxEdgePx": worst,
        "flaggedAssets": flagged_assets,
    }


def summarize_manifest_qa(manifest, threshold=SIZE_DEVIATION_THRESHOLD_PX):
    """QA toàn manifest, chỉ chứa ID asset + số; không chứa đường dẫn máy."""
    all_assets = []
    for style_id, entry in (manifest.get("styles") or {}).items():
        all_assets.extend({**asset, "_style": style_id} for asset in entry.get("assets") or [])
    summary = summarize_size_deviation(all_assets, threshold)
    return {"sizeDeviation": summary}


# ── CLI ──────────────────────────────────────────────────────────────────────
# Thân script nằm dưới guard `__main__` để test (và mọi công cụ đo) IMPORT được
# các hàm ở trên mà KHÔNG chạy cắt ghi đè kits/. Hành vi CLI không đổi.
if __name__ == "__main__":
    # filter CLI: `python3 slice.py ipay tet` chỉ cắt các style đó (manifest merge, không mất style khác)
    ONLY, ONLY_SHEETS = parse_cli(sys.argv[1:])
    mpath = os.path.join(HERE, "kits", "manifest.json")
    # Khoá TRƯỚC khi đọc: mọi lượt slice trong cùng project xếp hàng, không ai ghi đè ai.
    _LOCK_FD = acquire_manifest_lock(os.path.join(HERE, "kits"))
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {"styles": {}}
    manifest.setdefault("schemaVersion", 2)
    manifest.setdefault("styles", {})
    for style in cfg["styles"]:
        sid = style["id"]
        if ONLY and sid not in ONLY:
            continue
        threshold = style.get("threshold", DEFAULT_THRESHOLD)
        strict_threshold = style.get("grow_threshold", threshold + GROW_OFFSET)
        qa_threshold = style.get("sizeDeviationThreshold", SIZE_DEVIATION_THRESHOLD_PX)
        try:
            qa_threshold = int(qa_threshold)
        except (TypeError, ValueError):
            qa_threshold = SIZE_DEVIATION_THRESHOLD_PX
        out_dir = os.path.join(HERE, "kits", sid)
        entry = {"sheets": {}, "assets": [], "empty_cells": []}
        atlas_items = []
        done_sheets = set()          # sheet THỰC SỰ cắt lại lượt này (xem khối merge cuối)

        for sh in cfg["sheets"]:
            if sh.get("styles") and sid not in sh["styles"]:
                continue                     # sheet riêng của style khác (vd pose-<char>)
            if ONLY_SHEETS and sh["id"] not in ONLY_SHEETS:
                continue                     # cắt lũy tiến: chỉ tấm vừa gen xong
            job = f"{sid}-{sh['id']}"
            src_path = os.path.join(HERE, "raw", f"{job}.png")
            if not os.path.exists(src_path):
                print(f"⚠ bỏ qua {job}: chưa có raw/{job}.png")
                continue

            COLS, ROWS = sh["grid"]["cols"], sh["grid"]["rows"]
            raw_img = Image.open(src_path)
            W, H = raw_img.size

            # ── KHỔ SHEET PHẢI ĐÚNG HƯỚNG ĐÃ KHAI ────────────────────────────
            # Phép chia dưới đây lấy ĐẠI kích thước ảnh nhận được rồi chia cho lưới,
            # KHÔNG hỏi ảnh có đúng khổ không. Model trả sai hướng là mọi ô méo lặng lẽ:
            #   sheet 4x2 landscape  → mong 1536x1024 → ô 384x512
            #   model trả 1024x1536  →                  ô 256x768   (cao gấp rưỡi)
            # Ảnh cắt ra trông "bị kéo cao", còn cờ QA thì chỉ báo lệch SAU KHI đã cắt —
            # tức là đã tiêu tiền sinh ảnh và đã đẻ ra hàng chục file rác. Sự cố thật
            # ngày 21/08/2026. Chặn ở đây: sai hướng thì BỎ QUA sheet, nói rõ phải làm gì.
            orient_err = orientation_error(sh.get("orient"), W, H, sh.get("canvas"))
            if orient_err:
                print(f"⚠ bỏ qua {job}: {orient_err}. Cắt lưới {COLS}x{ROWS} trên khổ "
                      f"sai sẽ ra ô méo — sinh lại sheet này thay vì dùng ảnh hiện có.")
                continue

            cell_w, cell_h = W / COLS, H / ROWS
            # CW/CH qua `geometry.cell_size` chứ không `round()` tại chỗ: đây là cùng
            # hàm mà khối python của gen.sh gọi để in toạ độ safe zone vào prompt. Chia
            # trên W/H CỦA ẢNH THẬT (không phải của bảng CANVAS) là có chủ ý — model
            # được phép lệch vài chục pixel trong ngưỡng tỉ lệ, và ô phải bám ảnh nhận
            # được chứ không bám con số ta mong.
            CW, CH = geometry.cell_size(W, H, COLS, ROWS)   # canvas chuẩn của sheet này

            # ── MỘT ĐƯỜNG DUY NHẤT: ALPHA THẬT ────────────────────────────
            # Trước bản này ở đây có HAI nhánh: ảnh có alpha thì dùng thẳng, ảnh
            # KHÔNG alpha thì coi là raw đời cũ nền chroma và đi qua cả bộ matting
            # (ViTMatte / PyMatting closed-form / Vlahos + despill + lấp lỗ). Cả
            # nhánh chroma đã bị BỎ HẲN theo quyết định của chủ sản phẩm: từ khi
            # `image_gen` trả RGBA thật, mọi sheet sinh ra đều có alpha, và giữ một
            # đường thứ hai chỉ để cứu ảnh cũ là giữ 800 dòng cho một ca hiếm.
            #
            # HỆ QUẢ, ĐÃ BIẾT VÀ ĐÃ CHẤP NHẬN: sheet raw ĐỜI CŨ (nền magenta/green)
            # nằm sẵn trên đĩa KHÔNG cắt lại được nữa — phải sinh lại. Vì vậy lời
            # báo dưới đây phải nói ĐÚNG lý do, không được chỉ kêu "ảnh sai".
            if "A" not in raw_img.getbands() or raw_img.getchannel("A").getextrema()[0] >= 128:
                # Ba lý do khác nhau, ba câu khác nhau — người đọc phải biết mình
                # đang ở ca nào thì mới biết làm gì tiếp.
                gia = painted_checkerboard(raw_img.convert("RGB"))
                if gia:
                    print(f"⚠ bỏ qua {job}: nền là CARO VẼ TAY, không phải trong suốt "
                          f"(xám {gia[0]}/{gia[1]}, alpha=255 khắp ảnh). Model không tạo "
                          f"được nền trong suốt nên nó vẽ lại hình ảnh tượng trưng cho "
                          f"trong suốt. Sinh lại sheet này; đừng cắt ảnh hiện có.")
                elif "A" not in raw_img.getbands():
                    print(f"⚠ bỏ qua {job}: ảnh KHÔNG có kênh alpha. Bản này chỉ cắt được "
                          f"sheet nền trong suốt — đường tách nền chroma (magenta/green) "
                          f"đã bỏ. Nếu đây là sheet cũ thì phải SINH LẠI, không cắt lại "
                          f"được nữa.")
                else:
                    print(f"⚠ bỏ qua {job}: có kênh alpha nhưng KHÔNG chỗ nào trong suốt "
                          f"(alpha thấp nhất = {raw_img.getchannel('A').getextrema()[0]}). "
                          f"Model vẽ đè kín nền. Sinh lại sheet này.")
                continue
            keyed, strict = alpha_sheet(raw_img)
            mode = "alpha thật"

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
            # contentSafe cho phép decor nằm ngoài mặt element nên cần vành rộng
            # hơn contract cũ. Chỉ áp dụng cho sheet có loại này để không đổi canvas
            # của các sheet legacy.
            bleed_ratio = max(BLEED, 0.24) if any(
                c["skel"].get("contentSafe") for c in sh["components"]
            ) else BLEED
            BX, BY = round(cell_w * bleed_ratio), round(cell_h * bleed_ratio)
            CVW, CVH = CW + 2 * BX, CH + 2 * BY       # canvas = ô + vành bleed
            for idx, comp in enumerate(sh["components"]):
                if comp["skel"]["shape"] == "empty":
                    continue                      # ô đệm cố ý bỏ trống — không cắt
                cx0, cy0 = geometry.cell_origin(W, H, COLS, ROWS, idx)
                canvas = Image.new("RGBA", (CVW, CVH), (0, 0, 0, 0))
                if comp["skel"]["shape"] == "full":
                    # Ô full-bleed (nền): artwork phủ kín ô, không có gì để tách —
                    # cắt NGUYÊN ô ra khỏi sheet alpha và dán thẳng.
                    #
                    # Bản chroma ở đây phải làm thêm hai lượt gọt (`trim_flat_cell`
                    # theo cột/hàng, rồi `erase_key_edge` theo pixel) vì model hay vẽ
                    # THỤT VÀO và chừa nguyên khung magenta quanh 4 cạnh — sọc magenta
                    # 40–55px quanh 25-bg-home là bug thật ngày 15/08. Với alpha thật
                    # phần chừa đó là TRONG SUỐT, không phải màu: nó không đi vào ảnh,
                    # nên không còn gì để gọt và cũng không còn răng cưa ám màu.
                    canvas.paste(keyed.crop((cx0, cy0, cx0 + CW, cy0 + CH)), (BX, BY))
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
                    # feather biên mask: cắt cứng làm mép glow lởm chởm hình blob
                    # (đã dính ở fx-burst) — blur 6px cho vùng crop PHAI DẦN qua cả
                    # những lump 10-20px của blob dò trên glow nhiễu
                    msk = msk.filter(ImageFilter.GaussianBlur(6))
                    region.putalpha(ImageChops.multiply(region.getchannel("A"), msk))
                    # alpha_composite = phép CHỒNG LỚP đúng (idiom của nhà, xem
                    # tools/safe_zone_asset.py:280). `paste(region, box, region)` là
                    # bình phương alpha trên canvas trong suốt — xem align_content_safe.
                    canvas.alpha_composite(region, (L - (cx0 - BX), T - (cy0 - BY)))
                sk = comp["skel"]
                if sk["shape"] == "pose" and POSE_SIDE.get(sk.get("pose")):
                    canvas = normalize_pose_side(canvas, POSE_SIDE[sk["pose"]], f"{sid}/{comp['file']}")
                content_safe = sk.get("contentSafe")
                # SAFE ZONE = ĐÚNG HỘP MÀ PROMPT ĐÃ HỨA. `geometry.safe_offset_in_cell`
                # là cùng hàm khối python của gen.sh gọi để in "safe zone x=…, y=…" vào
                # prompt; ở đây chỉ cộng thêm vành bleed (BX/BY) để đổi từ toạ độ TRONG Ô
                # sang toạ độ TRÊN CANVAS asset.
                #
                # Hai nhánh (contentSafe căn giữa / skel thường có `anchor:"bottom"`) và
                # phép `//2` nằm TRỌN trong hàm đó — trước 27/08/2026 chúng nằm ở đây,
                # còn prompt thì không có con số nào, nên "hứa" và "cắt" không thể đối
                # chiếu được với nhau. Nay lệch một pixel là một test đỏ, không phải một
                # asset lệch mà không ai biết.
                dx, dy, sw, sh_ = geometry.safe_offset_in_cell(CW, CH, sk)
                sx, sy = BX + dx, BY + dy
                contract_safe_box = [sx, sy, sw, sh_]
                # Audit chạm mép TRƯỚC snap: snap kéo content vào trong canvas nên vết
                # cụt (cắt ở biên vùng crop) sẽ "tàng hình" nếu đo sau
                pre = canvas.getchannel("A").getbbox()
                if pre and sk["shape"] != "full" and (
                        pre[0] == 0 or pre[1] == 0 or pre[2] == CVW or pre[3] == CVH):
                    print(f"  ⚠ {sid}/{comp['file']}: content chạm mép canvas — raw tràn quá vành bleed, bị cụt")
                if content_safe:
                    # Giữ nguyên scale của pixels AI; chỉ dịch lõi đặc về tâm contract.
                    canvas = align_content_safe(
                        canvas, (sx, sy, sw, sh_), f"{sid}/{comp['file']}"
                    )
                    safe_box = contract_safe_box
                elif sk.get("free"):
                    # KHUNG ĐỘNG: không nắn art — safe zone = LÕI ĐO ĐƯỢC của chính
                    # art này (padding tự sinh khi cắt, đúng ý "để AI vẽ tự do")
                    core = _measured_core_box(canvas)
                    safe_box = [core[0], core[1], core[2] - core[0], core[3] - core[1]] \
                        if core else [sx, sy, sw, sh_]
                else:
                    canvas = snap_to_safe(canvas, sk, (sx, sy, sw, sh_))
                    safe_box = contract_safe_box
                # DỌN ĐỐM MỒ CÔI — phải nằm SAU snap_to_safe: snap resample nội
                # dung làm cầu alpha mờ nối đốm với thân MỎNG ĐI rồi đứt, tức đốm
                # chỉ tách rời ở ảnh CUỐI (đã dính: dọn trước snap thấy n2=1 nên
                # bỏ qua, ảnh lưu ra vẫn còn đốm). Đốm = cụm TỐI, NHỎ, tách khỏi
                # thân ở ngưỡng α>60; sparkle sáng màu cố ý → giữ. Dọn cả quầng mờ
                # quanh đốm (nới 4px), chừa lãnh thổ thân.
                if HAS_NDIMAGE and comp["skel"]["shape"] != "full":
                    ca = np.asarray(canvas)
                    aa = ca[..., 3]
                    lb2, n2 = ndimage.label(aa > 60)
                    if n2 > 1:
                        sizes2 = ndimage.sum(aa > 60, lb2, range(1, n2 + 1))
                        main_id = int(np.argmax(sizes2)) + 1
                        main_sz = sizes2[main_id - 1]
                        protect = ndimage.binary_dilation(lb2 == main_id, iterations=1)
                        lum2 = 0.3 * ca[..., 0] + 0.59 * ca[..., 1] + 0.11 * ca[..., 2]
                        kill = np.zeros(aa.shape, dtype=bool)
                        for j in range(1, n2 + 1):
                            sz = sizes2[j - 1]
                            if j == main_id or sz > max(60, main_sz * 0.004):
                                continue
                            mk = lb2 == j
                            if lum2[mk].mean() < 100:
                                kill |= ndimage.binary_dilation(mk, iterations=4) & ~protect
                        if kill.any():
                            # quét nốt quầng mờ + cầu alpha thấp quanh vùng vừa diệt
                            kill |= ndimage.binary_dilation(kill, iterations=8) & (aa < 60) & ~protect
                            ca = ca.copy()
                            ca[kill] = 0
                            canvas = Image.fromarray(ca)
                            print(f"  · {sid}/{comp['file']}: dọn {int(kill.sum())}px đốm tối mồ côi")
                if sk["shape"] == "full":
                    ledger = {
                        "silhouette": None, "core": None, "enamel": None, "decoration": None,
                        "safe": contract_safe_box, "contractSafe": contract_safe_box,
                        "deviation": {"edgesPx": None, "maxEdgePx": None,
                                       "undershootPx": None, "overflowPx": None,
                                       "metric": "core_undershoot"},
                        "sizeDeviation": {"maxEdgePx": None, "flagged": False,
                                           "threshold": qa_threshold, "edgesPx": None,
                                           "undershootPx": None, "overflowPx": None,
                                           "metric": "core_undershoot"},
                        "measured": False,
                    }
                else:
                    ledger = measure_asset_geometry(
                        canvas, contract_safe_box, qa_threshold, shape=sk.get("shape")
                    )
                    safe_box = ledger["safe"] or contract_safe_box
                    if ledger["sizeDeviation"]["flagged"]:
                        print(f"  ⚠ QA {sid}/{comp['file']}: sizeDeviation "
                              f"max {ledger['sizeDeviation']['maxEdgePx']}px > {qa_threshold}px "
                              "(chỉ gắn cờ, không tự gen lại)")
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
                # chiếu raw/ (bbox gồm cả trang trí tràn nên lệch nhẹ là bình thường;
                # element free có khung bám theo art nên không có khái niệm lệch)
                if not sk.get("free"):
                    dev_x = (ox + pw / 2) - (sx + sw / 2)
                    dev_y = (oy + ph / 2) - (sy + sh_ / 2)
                    if abs(dev_x) > CW * 0.06 or abs(dev_y) > CH * 0.06:
                        print(f"  ⚠ {sid}/{comp['file']}: ruột lệch khung safe ({dev_x:+.0f},{dev_y:+.0f})px")
                atlas_items.append((comp["file"], tight, (CVW, CVH), (ox, oy)))
                asset = {"file": comp["file"] + ".png", "sheet": sh["id"],
                         "canvas": [CVW, CVH], "cell": [CW, CH], "bleed": [BX, BY],
                         "content": [pw, ph],
                         "content_at": [ox, oy], "safe": safe_box,
                         "contractSafe": contract_safe_box,
                         "core": ledger["core"], "enamel": ledger["enamel"],
                         "decoration": ledger["decoration"],
                         "deviation": ledger["deviation"],
                         "sizeDeviation": ledger["sizeDeviation"]}
                blend = asset_blend(sk)
                if blend:
                    asset["blend"] = blend       # xem MATTE_BLEND: ô glow ship kèm blend
                if content_safe:
                    asset["contentSafe"] = True
                if sk.get("free"):
                    asset["freeSafe"] = True     # safe = lõi đo từ art, không phải khung contract
                if sk.get("slice9"):
                    # inset 9-slice theo RUỘT (px trên tight/): pill góc tròn = h/2 nên
                    # inset ngang hơi quá bán kính; rrect theo bán kính min/6
                    if sk["shape"] in ("pill", "bar"):
                        ins_x = min(round(ph * 0.52), (pw - 4) // 2)
                        ins_y = min(round(ph * 0.4), (ph - 4) // 2)
                    else:
                        m = round(min(pw, ph) * 0.3)
                        ins_x = min(m, (pw - 4) // 2)
                        ins_y = min(m, (ph - 4) // 2)
                    asset["slice9"] = [ins_x, ins_y, ins_x, ins_y]
                entry["assets"].append(asset)
                n_ok += 1

            # `bg_detected` (màu nền đo được ở viền) đã bỏ cùng đường chroma —
            # không ai đọc nó, và với sheet alpha thì "màu nền" không tồn tại.
            entry["sheets"][sh["id"]] = {"mode": mode,
                                         "canvas": [CVW, CVH], "cell": [CW, CH], "bleed": [BX, BY],
                                         "size": [W, H], "blobs": len(blobs), "cut": n_ok}
            done_sheets.add(sh["id"])
            print(f"✓ {job}: {n_ok}/{len(sh['components'])} (canvas {CVW}x{CVH} = ô {CW}x{CH} + bleed), "
                  f"{len(blobs)} khối, {mode}")

        # ── GEN LẠI MỘT NHÓM: giữ lại phần sheet KHÔNG chạy lượt này ────────────────
        # Agent thu hẹp styles.json đúng tập job của lượt chạy (engine.mjs
        # contractToStylesV1 + materializeStyles), nên khi người dùng bấm "Lưu và tạo
        # lại" cho MỘT nhóm thì cfg["sheets"] chỉ còn sheet đó. Bản cũ ghi thẳng
        # `manifest["styles"][sid] = entry` ⇒ mọi asset của các sheet KHÁC biến mất
        # khỏi manifest và khỏi atlas, dù file PNG vẫn nằm trong kits/. Đường gen-toàn-
        # bộ không bao giờ lộ ra vì lượt đó có đủ sheet. Đây là khác biệt THẬT giữa
        # hai đường hậu kỳ — merge để cả hai ra cùng một manifest.
        prev = manifest["styles"].get(sid) or {}
        keep_sheets = [k for k in (prev.get("sheets") or {}) if k not in done_sheets]
        if keep_sheets:
            done_files = {c["file"] for sh in cfg["sheets"] if sh["id"] in done_sheets
                          for c in sh["components"]}
            # Skel của các sheet GIỮ LẠI, khi lượt này còn nhìn thấy chúng trong
            # styles.json (sheet có trong cfg nhưng thiếu raw/, hay lượt gen-toàn-bộ
            # bị lọc bằng CLI). Dùng để BÙ khoá `blend` cho manifest do bản slice.py
            # cũ ghi — asset giữ lại vốn được chép NGUYÊN VẸN nên bản mới không mất
            # khoá, chỉ bản cũ là thiếu. Không xoá `blend` đang có: file PNG trên đĩa
            # vẫn là bản cắt cũ, manifest phải tả đúng cái đang nằm đó.
            keep_skel = {c["file"]: c["skel"] for sh in cfg["sheets"]
                         if sh["id"] in keep_sheets for c in sh["components"]}
            for k in keep_sheets:
                entry["sheets"][k] = prev["sheets"][k]
            for a in (prev.get("assets") or []):
                if a.get("sheet") not in keep_sheets or a.get("file", "")[:-4] in done_files:
                    continue
                kblend = asset_blend(keep_skel.get(a.get("file", "")[:-4]))
                if kblend and not a.get("blend"):
                    a["blend"] = kblend
                entry["assets"].append(a)
                # Frame atlas của asset giữ lại: dựng lại từ tight/ đã có trên đĩa,
                # kèm canvas/offset ghi trong manifest cũ → atlas không mất frame.
                tp = os.path.join(out_dir, "tight", a["file"])
                if os.path.exists(tp) and a.get("canvas") and a.get("content_at"):
                    atlas_items.append((a["file"][:-4], Image.open(tp).convert("RGBA"),
                                        tuple(a["canvas"]), tuple(a["content_at"])))
            for f in (prev.get("empty_cells") or []):
                if f not in done_files and f not in entry["empty_cells"]:
                    entry["empty_cells"].append(f)
            print(f"  ↺ {sid}: giữ nguyên {len(keep_sheets)} sheet không chạy lượt này "
                  f"({', '.join(keep_sheets)})")

        if atlas_items:
            atlas_img, atlas_json = pack_atlas(atlas_items)
            atlas_img.save(os.path.join(out_dir, "atlas.png"))
            json.dump(atlas_json, open(os.path.join(out_dir, "atlas.json"), "w"), indent=1)
            entry["atlas"] = {"image": "atlas.png", "json": "atlas.json",
                              "size": [atlas_img.width, atlas_img.height]}
            print(f"  atlas {sid}: {atlas_img.width}x{atlas_img.height}, {len(atlas_items)} frame")

        entry["qa"] = {"sizeDeviation": summarize_size_deviation(
            entry["assets"], qa_threshold, sid)}
        manifest["styles"][sid] = entry
        total = len(entry["assets"])
        want = sum(sum(1 for c in sh["components"] if c["skel"]["shape"] != "empty")
                   for sh in cfg["sheets"]
                   if sh["id"] in done_sheets) \
            + sum(1 for a in entry["assets"] if a.get("sheet") not in done_sheets)
        print(f"— {sid}: {total}/{want} asset" +
              (f", Ô TRỐNG: {entry['empty_cells']}" if entry["empty_cells"] else ""))
        if entry["qa"]["sizeDeviation"]["flagged"]:
            q = entry["qa"]["sizeDeviation"]
            print(f"  ⚠ QA summary {sid}: {q['flaggedCount']} ô vượt {q['threshold']}px "
                  "(chỉ dữ liệu; người dùng tự quyết gen lại)")

    manifest["qa"] = summarize_manifest_qa(manifest)
    q = manifest["qa"]["sizeDeviation"]
    print(f"— QA sizeDeviation: {q['flaggedCount']} flagged / {q['measured']} measured, "
          f"threshold {q['threshold']}px (không auto-regen)")
    dump_manifest(mpath, manifest)
    print("→ kits/manifest.json")
