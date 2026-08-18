#!/usr/bin/env python3
"""Validate generated sheet bodies against contract safe zones without deforming art.

MÀU KEY KHÔNG ĐƯỢC HARDCODE. Bản trước mặc định `#00FF00` và chỉ đọc `variant.bg`
qua `lstrip('#')` — nhưng `bg` trong contract là chuỗi MÔ TẢ ("pure vivid magenta
#FF00FF"), không phải hex trần, nên mọi sheet magenta rơi về key xanh lá ⇒ MỌI
pixel tính là foreground ⇒ `actual` luôn bằng nguyên ô và 10/10 file
`.geometry.json` vô giá trị (docs/research-glow-extraction-2026-08.md §3.3).

Nay: đọc tên/hex key từ `variant.bg` (magenta/green/cyan/blue) VÀ đo màu nền thật
ở viền sheet — model vẽ key lệch khỏi hex chuẩn tới ~50 level, nên số đo mới là
màu phải so. Phép phân loại foreground dùng đúng đại lượng của slice.py:

    spill = min(kênh CAO của key) − max(kênh THẤP)      (xem slice.py: key_axis)

File này CỐ Ý tự chứa (không import slice.py): runtime deploy nó cạnh slice.py
nhưng cũng chạy độc lập trong tools/. Thuật toán phải soi gương slice.py.
`actual` là bbox CORE sau tách morphology/màu; `silhouette`/`decoration` là số
theo dõi overflow. Chỉ ``core_undershoot`` vào safe-zone làm cell regenerate.
"""
import argparse, json, math, re
from pathlib import Path
from PIL import Image

KEY_COLORS = {                       # đúng tập key mà slice.py/gen.sh hiểu
    "magenta": (255, 0, 255),
    "green":   (0, 255, 0),
    "cyan":    (0, 255, 255),
    "blue":    (0, 0, 255),
}
KEY_SPILL_RATIO = .5                 # spill/sref ≥ ngưỡng ⇒ pixel là NỀN key


def key_axis(key):
    """(kênh CAO, kênh THẤP) của màu key — soi gương slice.py.key_axis()."""
    mid = (max(key) + min(key)) / 2.
    hi = tuple(i for i in range(3) if key[i] >= mid)
    lo = tuple(i for i in range(3) if key[i] < mid)
    return (hi, lo) if hi and lo else None


def spill(color, axis):
    hi, lo = axis
    return min(color[i] for i in hi) - max(color[i] for i in lo)


def parse_key(value):
    """`bg` của variant → RGB chuẩn. Nhận cả tên màu lẫn hex; None nếu không hiểu."""
    if not value:
        return None
    text = str(value).lower()
    for name, rgb_ in KEY_COLORS.items():
        if re.search(r'\b%s\b' % name, text):
            return rgb_
    m = re.search(r'#?([0-9a-f]{6})\b', text)
    if not m:
        return None
    v = m.group(1)
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def border_color(image, strip=8):
    """Trung vị màu viền ngoài sheet = nền thật model vẽ ra (soi gương
    slice.py.border_colors, rút về 1 màu vì ở đây chỉ cần mốc so)."""
    w, h = image.size
    px = image.load()
    s = [px[x, y] for x in range(0, w, 4) for y in list(range(min(strip, h)))
         + list(range(max(0, h - strip), h))]
    s += [px[x, y] for y in range(0, h, 4) for x in list(range(min(strip, w)))
          + list(range(max(0, w - strip), w))]
    return tuple(sorted(c[k] for c in s)[len(s) // 2] for k in range(3)) if s else (0, 255, 0)


def resolve_key(image, declared):
    """(màu key để so, axis hoặc None). Ưu tiên MÀU ĐO ĐƯỢC khi nó cùng trục với
    key đã khai báo; lệch trục thì tin khai báo (nền hỏng/không phải key)."""
    measured = border_color(image)
    m_axis = key_axis(measured)
    saturated = max(measured) - min(measured) > 80
    d_axis = key_axis(declared) if declared else None
    if d_axis and m_axis == d_axis and saturated:
        return measured, m_axis
    if d_axis:
        return declared, d_axis
    if m_axis and saturated:
        return measured, m_axis
    return measured, None


def bbox_foreground(image, key, axis=None, threshold=42):
    """bbox pixel KHÔNG phải nền. Có axis → dùng spill (chịu được key lệch màu);
    không có → khoảng cách RGB như đường lùi cũ."""
    w, h = image.size
    if axis is not None:
        sref = max(40., spill(key, axis))
        def is_fg(c): return spill(c, axis) / sref < KEY_SPILL_RATIO
    else:
        def is_fg(c): return math.dist(c[:3], key) > threshold
    xs = []; ys = []
    for i, c in enumerate(image.getdata()):
        if is_fg(c[:3]):
            xs.append(i % w); ys.append(i // w)
    return None if not xs else (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def _foreground_mask(image, key, axis):
    """Mask foreground giống ``bbox_foreground`` nhưng giữ được từng pixel."""
    w, h = image.size
    pixels = image.load()
    mask = bytearray(w * h)
    if axis is not None:
        sref = max(40., spill(key, axis))
        for y in range(h):
            for x in range(w):
                if spill(pixels[x, y][:3], axis) / sref < KEY_SPILL_RATIO:
                    mask[y * w + x] = 1
    else:
        for y in range(h):
            for x in range(w):
                if math.dist(pixels[x, y][:3], key) > 42:
                    mask[y * w + x] = 1
    return mask


def _mask_bbox(mask, width, height):
    points = [i for i, value in enumerate(mask) if value]
    if not points:
        return None
    return min(i % width for i in points), min(i // width for i in points), \
        max(i % width for i in points) + 1, max(i // width for i in points) + 1


def _largest_component(mask, width, height):
    """Largest 4-connected body used for core; caller retains all foreground."""
    seen = bytearray(width * height)
    best = bytearray(width * height)
    best_size = 0
    for start, present in enumerate(mask):
        if not present or seen[start]:
            continue
        queue = [start]
        seen[start] = 1
        component = []
        while queue:
            index = queue.pop()
            component.append(index)
            x, y = index % width, index // width
            for nxt in (
                index - 1 if x else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y else -1,
                index + width if y + 1 < height else -1,
            ):
                if nxt >= 0 and mask[nxt] and not seen[nxt]:
                    seen[nxt] = 1
                    queue.append(nxt)
        if len(component) > best_size:
            best_size = len(component)
            best = bytearray(width * height)
            for index in component:
                best[index] = 1
    return best, best_size


def _erode_mask(mask, width, height, iterations):
    current = bytearray(mask)
    for _ in range(max(0, iterations)):
        nxt = bytearray(width * height)
        for index, present in enumerate(current):
            if not present:
                continue
            x, y = index % width, index // width
            if (x == 0 or x + 1 == width or y == 0 or y + 1 == height
                    or not current[index - 1] or not current[index + 1]
                    or not current[index - width] or not current[index + width]):
                continue
            nxt[index] = 1
        current = nxt
    return current


def _projection_core_mask(silhouette, width, height):
    """Erode trước, lấy plateau liên tục, nới lại mép core; bỏ tua/hoa mảnh."""
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
        if value:
            x, y = index % width, index // width
            rows[y] += 1
            cols[x] += 1
    ys = [y for y, count in enumerate(rows) if count >= max(rows) * 0.5]
    xs = [x for x, count in enumerate(cols) if count >= max(cols) * 0.5]
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


def _median_rgb(image, indices, width):
    if not indices:
        return (0, 0, 0)
    pixels = image.load()
    sample = indices if len(indices) <= 12000 else indices[::max(1, len(indices) // 12000)]
    return tuple(sorted(pixels[i % width, i // width][channel] for i in sample)[len(sample) // 2]
                 for channel in range(3))


def _core_mask(image, silhouette, width, height):
    """Core màu enamel; soi gương nhánh tím của slice.py rồi fallback morphology."""
    main_indices = [i for i, value in enumerate(silhouette) if value]
    main_size = len(main_indices)
    if not main_indices:
        return bytearray(width * height), 0
    pixels = image.load()
    purple = bytearray(width * height)
    for index in main_indices:
        r, g, b = pixels[index % width, index // width][:3]
        if b >= 60 and r >= 35 and g <= min(r * 0.72, b * 0.68):
            purple[index] = 1
    purple_core, purple_size = _largest_component(purple, width, height)
    if purple_size >= max(16, int(main_size * 0.05)):
        return purple_core, purple_size
    depth = max(1, min(4, round(min(width, height) * 0.02)))
    inner = _erode_mask(silhouette, width, height, depth)
    inner_indices = [i for i, value in enumerate(inner) if value]
    if not inner_indices:
        return _projection_core_mask(silhouette, width, height)
    median = _median_rgb(image, inner_indices, width)
    candidate = bytearray(width * height)
    for index in main_indices:
        color = pixels[index % width, index // width][:3]
        if math.dist(color, median) <= 72:
            candidate[index] = 1
    core, core_size = _largest_component(candidate, width, height)
    core_box = _mask_bbox(core, width, height)
    main_box = _mask_bbox(silhouette, width, height)
    if (not core_box or core_size < max(16, int(main_size * 0.05))
            or core_box == main_box or core_size >= int(main_size * 0.82)
            or core_box[2] - core_box[0] < max(3, round((main_box[2] - main_box[0]) * 0.2))
            or core_box[3] - core_box[1] < max(3, round((main_box[3] - main_box[1]) * 0.2))):
        return _projection_core_mask(silhouette, width, height)
    return core, core_size


def _difference_bbox(outer, inner, width, height):
    remainder = bytearray(width * height)
    for index, value in enumerate(outer):
        if value and not inner[index]:
            remainder[index] = 1
    return _mask_bbox(remainder, width, height)


def _measure_core_decoration(image, key, axis):
    width, height = image.size
    foreground = _foreground_mask(image, key, axis)
    body, body_size = _largest_component(foreground, width, height)
    core, core_size = _core_mask(image, body, width, height)
    return {
        "silhouette": _mask_bbox(foreground, width, height),
        "core": _mask_bbox(core, width, height),
        "decoration": _difference_bbox(foreground, core, width, height),
        "measured": bool(body_size),
    }


def _one_sided_deviation(box, expected):
    errors = {
        "left": box[0] - expected[0],
        "top": box[1] - expected[1],
        "right": box[2] - expected[2],
        "bottom": box[3] - expected[3],
    }
    undershoot = {
        "left": max(0, errors["left"]),
        "top": max(0, errors["top"]),
        "right": max(0, -errors["right"]),
        "bottom": max(0, -errors["bottom"]),
    }
    overflow = {
        "left": max(0, -errors["left"]),
        "top": max(0, -errors["top"]),
        "right": max(0, errors["right"]),
        "bottom": max(0, errors["bottom"]),
    }
    return errors, undershoot, overflow


def validate(image, contract, job, position_tolerance=.08, size_tolerance=.15):
    variant_id, _, sheet_id = job.partition('-')
    sheet=next((s for s in contract.get('sheets',[]) if s.get('id')==sheet_id),None)
    if sheet is None: raise ValueError(f'unknown sheet: {sheet_id}')
    variant=next((v for v in contract.get('variants',[]) if v.get('id')==variant_id),{})
    key,axis=resolve_key(image,parse_key(variant.get('bg')))
    cols=max(1,int(sheet.get('grid',{}).get('cols',1))); rows=max(1,int(sheet.get('grid',{}).get('rows',1)))
    cw=image.width/cols; ch=image.height/rows; results=[]
    for index,component in enumerate(sheet.get('components',[])):
        col=index%cols; row=index//cols
        if row>=rows: break
        skel=component.get('skel',{})
        # Ô CỐ Ý BỎ TRỐNG (shape "empty", như slice.py/gen.sh hiểu): không có
        # thân để đo — báo 'empty' chứ KHÔNG phải 'regenerate', nếu không mọi
        # sheet có ô đệm đều bị đếm là ô lệch.
        if skel.get('shape')=='empty':
            results.append({'file':component.get('file',str(index)),'cell':index,'status':'empty','reasons':[],'expected':None,'actual':None}); continue
        crop=image.crop((round(col*cw),round(row*ch),round((col+1)*cw),round((row+1)*ch)))
        measured = _measure_core_decoration(crop, key, axis)
        box=measured['core'] or measured['silhouette']
        sw=float(skel.get('w',1))*crop.width; sh=float(skel.get('h',1))*crop.height
        expected=(crop.width-sw)/2,(crop.height-sh)/2,sw,sh
        reasons=[]
        if box is None: reasons=['missing-body']; actual=None
        else:
            x0,y0,x1,y1=box; actual=[x0,y0,x1-x0,y1-y0]
            target = (expected[0], expected[1], expected[0] + expected[2], expected[1] + expected[3])
            errors, undershoot, overflow = _one_sided_deviation(box, target)
            if abs((x0+x1)/2-crop.width/2)>position_tolerance*crop.width or abs((y0+y1)/2-crop.height/2)>position_tolerance*crop.height: reasons.append('position')
            if (undershoot['left'] > size_tolerance * max(1, sw)
                    or undershoot['right'] > size_tolerance * max(1, sw)
                    or undershoot['top'] > size_tolerance * max(1, sh)
                    or undershoot['bottom'] > size_tolerance * max(1, sh)):
                reasons.append('size')
        results.append({
            'file':component.get('file',str(index)), 'cell':index,
            'status':'ok' if not reasons else 'regenerate', 'reasons':reasons,
            'expected':[round(v,2) for v in expected], 'actual':actual,
            'core': measured['core'], 'decoration': measured['decoration'],
            'silhouette': measured['silhouette'],
            'deviation': ({'edgesPx': errors, 'undershootPx': undershoot,
                          'overflowPx': overflow, 'maxEdgePx': max(undershoot.values()),
                          'metric': 'core_undershoot'} if box is not None else None),
        })
    return {'ok':all(x['status'] in ('ok','empty') for x in results),'job':job,'sheet':sheet_id,
            'key':list(key),'key_mode':'spill' if axis else 'distance','cells':results}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--image',type=Path,required=True); p.add_argument('--contract',type=Path,required=True); p.add_argument('--job',required=True); p.add_argument('--output',type=Path)
    a=p.parse_args(); result=validate(Image.open(a.image).convert('RGB'),json.loads(a.contract.read_text()),a.job); text=json.dumps(result,ensure_ascii=False)
    if a.output: a.output.write_text(text+'\n')
    print(text); return 0 if result['ok'] else 2
if __name__=='__main__': raise SystemExit(main())
