#!/usr/bin/env python3
"""Validate generated sheet bodies against contract safe zones without deforming art.

NỀN LÀ ALPHA, KHÔNG PHẢI MÀU. Cả tầng đoán màu nền của bản trước đã bỏ (07/09/2026):
sheet nay mang alpha thật, nên "pixel này có phải nền không" có câu trả lời thẳng —
`alpha < ngưỡng`. Không đoán màu, không đo viền, không lệch trục.

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
import argparse, importlib.util, json
from pathlib import Path
from PIL import Image

ALPHA_FG = 24                        # α ≥ ngưỡng ⇒ pixel CÓ MỰC, dưới ⇒ nền trống.
                                     # Lấy thấp có chủ ý: quầng glow tan tới α rất
                                     # nhỏ vẫn là mực, và bbox silhouette phải ôm nó.
                                     # Thấp, nhưng vẫn CAO HƠN màn sương α=1..3 mà
                                     # model phủ lên cả ô (`slice.py:CONTENT_ALPHA`
                                     # = 4 mang số đo). Nên `silhouette` ở đây không
                                     # bị sương kéo phình ra cả ô như `content` từng
                                     # bị — không phải sửa gì, chỉ là hai file phải
                                     # đọc được cùng một lý do.
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


#: Lệch TỈ LỆ tối đa còn chấp nhận — cùng con số `slice.py:ASPECT_DEVIATION_THRESHOLD`.
#: 14/09/2026: prompt thôi hứa hộp pixel (model vẽ đúng tâm mà cỡ gấp 1,5–1,7 lần ở
#: mọi ô — đo r-0021: lõi 587px trên hộp hứa 368px), nay chỉ hứa TỈ LỆ W:H của lõi.
#: Nên file này cũng phải đo được đúng thứ ấy: cỡ tuyệt đối do dao cắt + bộ co lo,
#: tỉ lệ thì không ai chữa hộ được.
ASPECT_DEVIATION_THRESHOLD = 0.15


def _aspect_deviation(box, out, threshold=ASPECT_DEVIATION_THRESHOLD):
    """``|(box.w/box.h) / (out.w/out.h) − 1|`` → sổ đo, hoặc `value=None` nếu thiếu số.

    Cố ý chép công thức của `slice.py` thay vì import: file này chạy độc lập trong
    tools/. Đổi một bên thì phải đổi bên kia — và hai bên có test riêng canh.
    """
    val = ba = oa = None
    try:
        ow, oh = float(out["w"]), float(out["h"])
        bw, bh = float(box[2] - box[0]), float(box[3] - box[1])
    except (TypeError, KeyError, IndexError, ValueError):
        ow = oh = bw = bh = 0.0
    if ow > 0 and oh > 0 and bw > 0 and bh > 0:
        ba, oa = bw / bh, ow / oh
        val = round(abs(ba / oa - 1), 4)
    return {"value": val, "flagged": bool(val is not None and val > threshold),
            "threshold": threshold,
            "coreAspect": None if ba is None else round(ba, 4),
            "outAspect": None if oa is None else round(oa, 4),
            "metric": "core_aspect"}


# ── HỘP THÂN ĐOÁN ĐƯỢC: MƯỢN CỦA `slice.py`, KHÔNG CHÉP LẠI ──────────────────
# ╔══ VÌ SAO Ở ĐÂY LẠI IMPORT, TRONG KHI `_aspect_deviation` THÌ CHÉP ══════════╗
# ║ `_aspect_deviation` là MỘT DÒNG số học — chép nó thì hai bên còn đọc được    ║
# ║ nhau bằng mắt, và mỗi bên có test riêng canh. `guess_core_box` là hơn trăm   ║
# ║ dòng có ngưỡng, có trung vị, có MAD: hai bản của nó sẽ trôi khỏi nhau trong  ║
# ║ đúng một lượt sửa, và lúc ấy lớp phủ «Lưới ô» vẽ một hộp KHÁC hộp mà webapp  ║
# ║ dùng để đặt ảnh vào khung — tức là vẽ ra đúng cái nó sinh ra để bác bỏ.      ║
# ║                                                                             ║
# ║ Nên nó mượn, nhưng mượn theo kiểu KHÔNG BAO GIỜ LÀM HỎNG LƯỢT: nạp bằng      ║
# ║ importlib, bọc try, và thiếu thì `core_guess` vắng mặt — status không đổi    ║
# ║ một chữ. Lời hứa «file này chạy độc lập trong tools/» vẫn còn nguyên: chạy   ║
# ║ một mình thì không có `slice.py`/`styles.json` cạnh bên, và nó im lặng bỏ    ║
# ║ qua đúng một khoá theo dõi.                                                  ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
_CORE = []                             # hộp nạp một lần: [] chưa thử, [None] thử rồi mà không có


def _core_module():
    if _CORE:
        return _CORE[0]
    mod = None
    try:
        path = Path(__file__).resolve().parent / 'slice.py'
        if path.exists():
            spec = importlib.util.spec_from_file_location('kitgen_slice_core', path)
            cand = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cand)
            if hasattr(cand, 'guess_core_box') and hasattr(cand, 'paint_coverage'):
                mod = cand
    except Exception:
        mod = None                     # engine đời cũ / chạy lẻ trong tools/ — không sao
    _CORE.append(mod)
    return mod


def _core_guess(crop, out, cluster):
    """``{'box': [x, y, w, h], 'coverage': 0..1}`` của thân đoán được, hoặc None.

    SỐ THEO DÕI, KHÔNG PHẢI CỔNG — `status` của ô không đọc nó. Nó có mặt để lớp
    phủ «Lưới ô» của web vẽ được HỘP THÂN bằng đúng con số mà `slice.py` ghi vào
    manifest, thay vì để web tự đoán lần thứ hai.
    """
    mod = _core_module()
    if mod is None or cluster is None:
        return None
    try:
        aspect = float(out['w']) / float(out['h'])
    except (TypeError, KeyError, ValueError, ZeroDivisionError):
        return None
    alpha = crop.convert('RGBA').getchannel('A')
    l, t, r, b = cluster
    box = mod.guess_core_box(alpha, aspect, [l, t, r - l, b - t])
    if box is None:
        return None
    cov = mod.paint_coverage(alpha, box)
    return {'box': box, 'coverage': None if cov is None else round(cov, 4)}


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
            # SỐ THEO DÕI, KHÔNG PHẢI CỔNG. `status` vẫn do `reasons` quyết như cũ:
            # đây là chỉ số MỚI (lệch tỉ lệ so với cỡ người dùng đặt), và biến một
            # chỉ số vừa ra đời thành cổng gen lại là cách nhanh nhất để cả lượt gen
            # đỏ vì một ngưỡng chưa ai đo trên dự án thật.
            'aspectDeviation': (_aspect_deviation(box, component.get('out'))
                                if box is not None else None),
            # HỘP THÂN ĐOÁN ĐƯỢC — cùng phép, cùng con số mà `slice.py` ghi vào
            # manifest (`coreBox`). Ở đây nó chỉ để lớp phủ «Lưới ô» vẽ được cái
            # hộp ấy lên chính tấm ảnh; nó KHÔNG tham gia `status`.
            'core_guess': _core_guess(crop, component.get('out'), box),
        })
    return {'ok':all(x['status'] in ('ok','empty') for x in results),'job':job,'sheet':sheet_id,
            'bg_mode':'alpha','cells':results}

def main():
    p=argparse.ArgumentParser(); p.add_argument('--image',type=Path,required=True); p.add_argument('--contract',type=Path,required=True); p.add_argument('--job',required=True); p.add_argument('--output',type=Path)
    a=p.parse_args(); result=validate(Image.open(a.image).convert('RGBA'),json.loads(a.contract.read_text()),a.job); text=json.dumps(result,ensure_ascii=False)
    if a.output: a.output.write_text(text+'\n')
    print(text); return 0 if result['ok'] else 2
if __name__=='__main__': raise SystemExit(main())
