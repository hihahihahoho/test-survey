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
        box=bbox_foreground(crop,key,axis); sw=float(skel.get('w',1))*crop.width; sh=float(skel.get('h',1))*crop.height
        expected=(crop.width-sw)/2,(crop.height-sh)/2,sw,sh
        reasons=[]
        if box is None: reasons=['missing-body']; actual=None
        else:
            x0,y0,x1,y1=box; actual=[x0,y0,x1-x0,y1-y0]
            if abs((x0+x1)/2-crop.width/2)>position_tolerance*crop.width or abs((y0+y1)/2-crop.height/2)>position_tolerance*crop.height: reasons.append('position')
            if abs((x1-x0)-sw)>size_tolerance*max(1,sw) or abs((y1-y0)-sh)>size_tolerance*max(1,sh): reasons.append('size')
        results.append({'file':component.get('file',str(index)),'cell':index,'status':'ok' if not reasons else 'regenerate','reasons':reasons,'expected':[round(v,2) for v in expected],'actual':actual})
    return {'ok':all(x['status'] in ('ok','empty') for x in results),'job':job,'sheet':sheet_id,
            'key':list(key),'key_mode':'spill' if axis else 'distance','cells':results}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--image',type=Path,required=True); p.add_argument('--contract',type=Path,required=True); p.add_argument('--job',required=True); p.add_argument('--output',type=Path)
    a=p.parse_args(); result=validate(Image.open(a.image).convert('RGB'),json.loads(a.contract.read_text()),a.job); text=json.dumps(result,ensure_ascii=False)
    if a.output: a.output.write_text(text+'\n')
    print(text); return 0 if result['ok'] else 2
if __name__=='__main__': raise SystemExit(main())
