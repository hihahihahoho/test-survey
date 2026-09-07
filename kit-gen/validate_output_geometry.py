#!/usr/bin/env python3
"""Validate generated sheet bodies against contract safe zones without deforming art.

NỀN LÀ ALPHA, KHÔNG PHẢI MÀU. Bản trước phải đoán màu chroma-key của sheet để
biết pixel nào là nền: đọc tên/hex từ `variant.bg`, rồi ĐO thêm màu viền ngoài vì
model vẽ key lệch khỏi hex chuẩn tới ~50 level, rồi phân loại theo
`spill = min(kênh CAO) − max(kênh THẤP)`. Cả chuỗi suy đoán đó tồn tại chỉ vì "nền"
là một MÀU nào đó phải đi tìm.

Sheet nay mang alpha thật, nên câu hỏi "pixel này có phải nền không" có câu trả lời
thẳng: `alpha < ngưỡng`. Không đoán màu, không đo viền, không lệch trục — và không
còn ca hỏng nào kiểu "sheet magenta rơi về key xanh lá nên MỌI pixel tính là
foreground" (docs/research-glow-extraction-2026-08.md §3.3).

╔══ 07/09/2026 — BỎ NỐT PHÉP DÒ LÕI BẰNG MÀU + MORPHOLOGY ═════════════════════╗
║ File này CỐ Ý soi gương `slice.py`. Cho tới hôm nay nó soi một cái gương đã   ║
║ vỡ: `_core_mask` erode silhouette, lấy thành phần liên thông lớn nhất, có hẳn ║
║ một nhánh nhận diện "màu tím là men" — và trên ô kính thật (`test-e0d4`,      ║
║ 02-healthbar) phép đó trả về lõi 212x107 cho một thanh rộng 473px. Sai 2,2    ║
║ lần, im lặng, rồi đi thẳng vào cờ `regenerate`.                              ║
║                                                                              ║
║ `slice.py` nay đo lõi bằng ĐÚNG MỘT phép: bbox của pixel α ≥ 128. File này    ║
║ dùng lại đúng phép ấy, nên hai bên không thể lệch nhau nữa.                   ║
║ Hệ quả đã biết và đã chấp nhận: `core` và `decoration` không còn tách được    ║
║ theo MÀU, chỉ còn tách theo ĐỘ ĐỤC — trang trí đục nằm chung hộp với thân.    ║
║ Đổi lại, không còn chỗ nào để đoán sai.                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

File này CỐ Ý tự chứa (không import slice.py): runtime deploy nó cạnh slice.py
nhưng cũng chạy độc lập trong tools/. Chỉ ``core_undershoot`` vào safe-zone làm
cell regenerate; `silhouette`/`decoration` là số theo dõi overflow.
"""
import argparse, json
from pathlib import Path
from PIL import Image

ALPHA_FG = 24                        # α ≥ ngưỡng ⇒ pixel CÓ MỰC, dưới ⇒ nền trống.
                                     # Lấy thấp có chủ ý: quầng glow tan tới α rất
                                     # nhỏ vẫn là mực, và bbox silhouette phải ôm nó.
ALPHA_CORE = 128                     # α ≥ ngưỡng ⇒ pixel thuộc LÕI (mặt chức năng).
                                     # Cùng con số `slice.py:CORE_ALPHA` dùng để ghi
                                     # `safe` vào manifest — một phép, hai người dùng.


def bbox_at(image, threshold):
    """bbox của pixel có α ≥ `threshold` → ``(l, t, r, b)`` hoặc None.

    `point()` + `getbbox()` chạy ở tầng C của Pillow; bản trước quét từng pixel
    bằng vòng lặp Python trên cả ảnh 1536x1024 cho MỖI ô.
    """
    alpha = image.convert("RGBA").getchannel("A")
    if threshold > 1:
        alpha = alpha.point(lambda v: 255 if v >= threshold else 0)
    return alpha.getbbox()


def bbox_foreground(image, threshold=ALPHA_FG):
    """bbox của phần CÓ MỰC. Nền = alpha thấp, không phải một màu nào cả."""
    return bbox_at(image, threshold)


def _decoration_bbox(image, core_box, threshold=ALPHA_FG):
    """bbox của phần mực nằm NGOÀI hộp lõi — đồ trang trí tràn ra.

    Đo bằng bốn dải quanh hộp lõi (trên/dưới/trái/phải) thay vì quét mask: mỗi dải
    là một `crop` + `getbbox`, vẫn ở tầng C, và hợp của bốn hộp con chính là bbox
    của phần còn lại.
    """
    if core_box is None:
        return bbox_foreground(image, threshold)
    w, h = image.size
    l, t, r, b = core_box
    out = None
    for band in ((0, 0, w, t), (0, b, w, h), (0, t, l, b), (r, t, w, b)):
        if band[0] >= band[2] or band[1] >= band[3]:
            continue
        sub = bbox_at(image.crop(band), threshold)
        if sub is None:
            continue
        box = (sub[0] + band[0], sub[1] + band[1], sub[2] + band[0], sub[3] + band[1])
        out = box if out is None else (min(out[0], box[0]), min(out[1], box[1]),
                                       max(out[2], box[2]), max(out[3], box[3]))
    return out


def _measure_core_decoration(image):
    silhouette = bbox_foreground(image)
    core = bbox_at(image, ALPHA_CORE) or silhouette
    return {
        "silhouette": silhouette,
        "core": core,
        "decoration": _decoration_bbox(image, core),
        "measured": silhouette is not None,
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
        measured = _measure_core_decoration(crop)
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
            'bg_mode':'alpha','cells':results}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--image',type=Path,required=True); p.add_argument('--contract',type=Path,required=True); p.add_argument('--job',required=True); p.add_argument('--output',type=Path)
    a=p.parse_args(); result=validate(Image.open(a.image).convert('RGBA'),json.loads(a.contract.read_text()),a.job); text=json.dumps(result,ensure_ascii=False)
    if a.output: a.output.write_text(text+'\n')
    print(text); return 0 if result['ok'] else 2
if __name__=='__main__': raise SystemExit(main())
