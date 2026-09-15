#!/usr/bin/env python3
"""
slice.py — CHỈ CẮT. Không tách nền, không đụng alpha của model.

ĐÃ BỎ 07/09/2026: cả tầng tách nền đời cũ (key màu nền, alpha mềm theo khoảng cách
màu, un-mix viền, mask khối, feather, lấp lỗ, nắn lõi về khung) — hơn 900 dòng. Nó
tồn tại vì một tiền đề đã chết: "ảnh model trả về không có alpha". Nay `image_gen`
trả PNG RGBA có alpha thật, và máy cũ chạy trên ảnh đã có alpha thì PHÁ chứ không
thừa: đo trên dự án `test-e0d4`, ruột thanh máu α≈90 bị bóp còn α≈3.

LUẬT MỚI, ĐỌC HẾT TRONG MƯỜI GIÂY:

  raw/<style>-<sheet>.png  (RGBA, alpha do model vẽ)
      │  ① hộp ô  = geometry.cell_box  — CHÍNH XÁC hộp ô, không nới một pixel
      │  ② crop   = copy nguyên vùng đó. Không key, không ngưỡng, không mask,
      │             không blend, không nắn, không dịch, không lật.
      │  ③ đo     = bbox alpha (chỉ ĐỌC, không sửa pixel) → content/safe
      ▼
  kits/<style>/<file>.png        canvas = ĐÚNG một ô
  kits/<style>/tight/<file>.png  cùng ảnh, crop về bbox alpha ≥ CONTENT_ALPHA
                                 (không dư viền, và không ôm màn sương của model)

Thứ DUY NHẤT còn chạm vào alpha: `snap_solid_alpha` kéo α≥240 lên 255 (xem hàm).
Nó không phải tách nền — nó chỉ vá chỗ model vẽ "gần đục" (đo được: đỉnh α=253,
cao nhất trong cả ảnh là 254, không một pixel nào 255) thành đục hẳn. Phép này
CHỈ TĂNG alpha và chỉ trong dải sát trần, nên không thể gặm ruột thứ gì.

Chạy:  python3 slice.py [<style> …] [--sheet=<id>] [--sheets=a,b]
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
# HÌNH HỌC DÙNG CHUNG VỚI PROMPT. `geometry.py` nằm cạnh file này (engine.mjs copy
# cả hai vào project). Bốn con số mà prompt HỨA với model và bốn con số dao cắt
# DÙNG phải ra từ cùng một hàm — trước 27/08/2026 chúng là hai công thức viết tay ở
# hai file khác ngôn ngữ, lệch nhau đúng 1px, và không có test nào nhìn thấy.
sys.path.insert(0, HERE)
import geometry                                                   # noqa: E402

# QA này chỉ là cổng dữ liệu. Không có nhánh nào gọi lại gen.sh khi bị cờ.
# 15px đủ lớn hơn nhiễu thường đo được (~6px/mép), vẫn bắt sai lệch hình học
# có ý nghĩa; không đặt thấp hơn sàn nhiễu.
SIZE_DEVIATION_THRESHOLD_PX = 15

# ── LỆCH TỈ LỆ: CHỈ SỐ ĐO ĐÚNG THỨ PROMPT YÊU CẦU (14/09/2026) ────────────────
# ╔══ VÌ SAO THÊM MỘT CHỈ SỐ NỮA THAY VÌ SIẾT CÁI CŨ ════════════════════════════╗
# ║ `sizeDeviation` đo lõi đo được so với HỘP HỨA tính bằng pixel. Từ 14/09/2026 ║
# ║ prompt không hứa hộp pixel nào nữa: đo r-0021 cho thấy model vẽ đúng tâm mà  ║
# ║ cỡ gấp 1,5–1,7 lần ở MỌI ô (lõi 587px / hộp hứa 368px), qua codex lẫn qua    ║
# ║ web ChatGPT — toạ độ không điều khiển được nó. Nên `sizeDeviation` nay đo    ║
# ║ một lời hứa KHÔNG AI CÒN HỨA: nó vẫn đúng như một số theo dõi (và webapp     ║
# ║ đang đọc), nhưng nó không còn là điểm số của prompt.                        ║
# ║ Thứ prompt hứa bây giờ là TỈ LỆ W:H của lõi, và đó là thứ hạ nguồn KHÔNG     ║
# ║ chữa được: webapp co lõi đo được về `outSize` — co đồng dạng thì không méo,  ║
# ║ nhưng sai tỉ lệ thì chỉ còn cách chèn viền rỗng trong khung.                 ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
# 0,15 = lệch 15% tỉ lệ. Một nút 2,9:1 vẽ thành 2,5:1 hay 3,4:1 thì qua; vẽ thành
# 2,0:1 (lệch 31%) thì gắn cờ. Ngưỡng TƯƠNG ĐỐI chứ không phải pixel: tỉ lệ không
# có đơn vị, và cùng một % sai lệch trên ô to hay ô nhỏ đều nát như nhau.
ASPECT_DEVIATION_THRESHOLD = 0.15

#: Từ mức này trở lên coi là ĐỤC HẲN — xem `snap_solid_alpha`.
SOLID_ALPHA = 240
#: Ngưỡng đo LÕI (`safe`). Không phải ngưỡng cắt: không một pixel nào bị bỏ vì nó.
#: 128 = nửa đục — quầng sáng tan dần và mặt kính α≈64 nằm dưới, nên chúng không
#: kéo hộp `safe` phình ra, mà vẫn còn nguyên trong ảnh.
CORE_ALPHA = 128
#: SÀN LƯỢNG TỬ của `content`/`content_at`/`tight/`. Nền "trong suốt" mà model trả
#: về KHÔNG phải α=0: đo histogram alpha của một tấm raw 1254² thật (`test-e0d4`,
#: chinh-ui) ⇒ α=0: 1.137.428 px · **α=1: 64.934 px** · α=2: 14.256 · α=3: 8.989 ·
#: α=4: 6.898. Một màn sương α=1..3 phủ CẢ ô, nên `alpha_bbox(canvas)` (ngưỡng 1)
#: trả về gần nguyên ô và `tight/` ra ảnh VUÔNG thay vì ôm sát element. Đo bbox
#: theo từng ngưỡng trên ô `01-button` (ô 627²): ≥1 → 27,0–626,626 · ≥2 →
#: 33,23–626,626 · ≥3 → 34,209–625,626 · **≥4 → 34,210–624,626** · ≥8 →
#: 35,211–623,626 — từ 4 trở lên hộp đã đứng yên, nên 4 là sàn nhiễu chứ không
#: phải một con số chọn cho đẹp. 4/255 ≈ 1,5% opacity: mắt không thấy.
#:
#: ĐÂY KHÔNG PHẢI TÁCH NỀN. Không một byte pixel nào bị đổi vì hằng này — nó chỉ
#: quyết định HỘP CẮT đặt ở đâu. Sương vẫn nằm nguyên trong ảnh canvas, và phần
#: sương lọt trong hộp `tight/` cũng đi ra nguyên vẹn.
CONTENT_ALPHA = 4

cfg = json.load(open(os.path.join(HERE, "styles.json")))
for _sh in cfg["sheets"]:
    _n = _sh["grid"]["cols"] * _sh["grid"]["rows"]
    assert len(_sh["components"]) == _n, "sheet %s: component phải khớp lưới" % _sh["id"]


# Khổ mong đợi theo khai báo của sheet — KHÔNG phải bản chép. Bảng thật nằm ở
# `geometry.py:CANVAS`, cùng bảng mà khối python của gen.sh import.
# `[:2]` vì `geometry.CANVAS` mang thêm hai chuỗi (header + tỉ lệ) dành cho prompt.
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


def read_sheet(img):
    """Ảnh raw → ``(RGBA, mode)`` với mode ∈ {"alpha", "rgb"}.

    KHÔNG CÒN CỔNG CHẶN Ở ĐÂY. Bản trước BỎ QUA cả tấm khi ảnh không có alpha (và
    còn dò "caro vẽ tay" để đoán model đã bịa nền trong suốt). Hai chuyện đó nay
    tách khỏi nhau:
      · CHẶN LÚC SINH là việc của `gen.sh` (cổng alpha) — bắt sớm, trước khi tiêu
        quota, và ở đúng chỗ có thể sinh lại;
      · CẮT thì cứ cắt. Người dùng đã có ảnh trong tay; từ chối cắt là giữ nó làm
        con tin. Tấm không alpha vẫn ra file, chỉ mang `mode:"rgb"` để web nói
        thẳng "tấm này không có nền trong suốt".
    TUYỆT ĐỐI KHÔNG TỰ CHẾ ALPHA cho tấm rgb: đoán đâu là nền chính là cỗ máy vừa
    bị bỏ, và đoán sai thì nó gặm vào giữa hình.
    """
    if "A" not in img.getbands():
        return img.convert("RGBA"), "rgb"
    rgba = img.convert("RGBA")
    if rgba.getchannel("A").getextrema()[0] >= SOLID_ALPHA:
        # Có kênh alpha nhưng không chỗ nào trong suốt ⇒ thực chất là tấm RGB.
        return rgba, "rgb"
    return snap_solid_alpha(rgba), "alpha"


def snap_solid_alpha(rgba):
    """α ≥ SOLID_ALPHA ⇒ kéo về 255. Thao tác DUY NHẤT còn chạm vào alpha.

    ĐO ĐƯỢC trên ảnh model trả về (đối chứng skel-B, BACKLOG #24 ⑰): thân đặc KHÔNG
    nằm ở α=255 mà ở **251–254**, và α cao nhất trong cả ảnh là 254 — không một pixel
    nào đục hoàn toàn. Model vẽ alpha bằng cọ, nên nó "gần đục" chứ không đục.

    Chênh 3/255 mắt không thấy, nhưng nó đi thẳng vào file giao cho người dùng: mọi
    sprite xuất ra đều mờ 1,2%, xếp chồng trong game engine là thấy đường ghép, và
    designer soi ô thì đọc ra "98,8% opacity" cho một cái nút lẽ ra đặc.

    VÌ SAO NÓ KHÔNG PHẢI "TÁCH NỀN": phép này chỉ TĂNG alpha, và chỉ trong dải
    240..254. Không pixel nào bị hạ xuống, nên không có gì bị gặm. Ô `glass` cố ý
    nằm ở α≈64–128 và quầng `glow` tan dần từ 0 lên — cả hai cách 240 rất xa.
    """
    a = rgba.getchannel("A")
    lo, hi = a.getextrema()
    if hi < SOLID_ALPHA or lo >= 255:
        return rgba                       # không có pixel nào trong dải cần nắn
    rgba.putalpha(a.point(lambda v: 255 if v >= SOLID_ALPHA else v))
    return rgba


# ── ĐO (chỉ đọc pixel, không bao giờ ghi) ────────────────────────────────────

def alpha_bbox(canvas, threshold=1):
    """bbox của pixel có α ≥ `threshold` → ``(l, t, r, b)`` hoặc None nếu rỗng.

    Dùng `point()` + `getbbox()` của Pillow (vòng lặp ở tầng C) thay vì quét Python:
    một ô 627x627 là 393k pixel, và một tấm 4x4 thì nhân 16.
    """
    a = canvas.getchannel("A")
    if threshold > 1:
        a = a.point(lambda v: 255 if v >= threshold else 0)
    return a.getbbox()


def _xywh(rect):
    return None if rect is None else [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]]


def aspect_deviation(safe, out, threshold=ASPECT_DEVIATION_THRESHOLD):
    """Lệch TỈ LỆ giữa lõi đo được và cỡ người dùng đặt.

    ``|(safe.w / safe.h) / (out.w / out.h) − 1|`` — không đơn vị, không phụ thuộc
    ô to hay nhỏ, và đối xứng đủ dùng ở dải lệch ta quan tâm.

    `safe` là ``[x, y, w, h]`` (lõi đo được, bbox α ≥ CORE_ALPHA); `out` là
    ``{"w","h"}`` của contract. Thiếu bên nào ⇒ `value` là None, `flagged` False:
    ô không đo được KHÔNG phải ô đạt, và cũng không phải ô hỏng.
    """
    val = sa = oa = None
    try:
        ow, oh = float(out["w"]), float(out["h"])
        sw, sh = float(safe[2]), float(safe[3])
    except (TypeError, KeyError, IndexError, ValueError):
        ow = oh = sw = sh = 0.0
    if ow > 0 and oh > 0 and sw > 0 and sh > 0:
        sa, oa = sw / sh, ow / oh
        val = round(abs(sa / oa - 1), 4)
    return {
        "value": val,
        "flagged": bool(val is not None and val > threshold),
        "threshold": threshold,
        "safeAspect": None if sa is None else round(sa, 4),
        "outAspect": None if oa is None else round(oa, 4),
        "metric": "core_aspect",
    }


def measure_cell(canvas, contract_safe, threshold=SIZE_DEVIATION_THRESHOLD_PX, out=None):
    """Sổ đo của một ô đã cắt → dict ``{safe, contractSafe, sizeDeviation}``.

    `safe` = bbox của pixel α ≥ CORE_ALPHA trên CẢ Ô. Đây là "lõi đo được" — hộp mà
    Figma dựng frame theo, và là con số đối chiếu với `contractSafe` (hộp prompt đã
    hứa). CHỌN PHÉP RẺ NHẤT CÓ CHỦ Ý: bản trước dò lõi bằng morphology + màu (erode,
    thành phần liên thông lớn nhất, một nhánh riêng cho màu tím), và trên ô kính
    `02-healthbar` nó trả về 212x107 cho một thanh rộng 473px — sai 2,2 lần, rồi cái
    sai đó đi thẳng vào `safe` mà không ai đọc lại. Một bbox theo ngưỡng alpha thì
    không có chỗ nào để mà đoán sai.

    `contract_safe` là ``[x, y, w, h]`` trong toạ độ ô (None với ô không có khung).
    Lệch được tính MỘT PHÍA: chỉ phần lõi THIẾU vào trong khung mới là lỗi; lõi tràn
    ra ngoài khung là trang trí, và trang trí thì được phép tràn.
    """
    rect = alpha_bbox(canvas, CORE_ALPHA) or alpha_bbox(canvas)
    safe = _xywh(rect)
    threshold = int(threshold)
    edges = undershoot = overflow = max_edge = None
    if rect is not None and contract_safe is not None:
        cx, cy, cw, ch = contract_safe
        err = (rect[0] - cx, rect[1] - cy, rect[2] - (cx + cw), rect[3] - (cy + ch))
        edges = {"left": err[0], "top": err[1], "right": err[2], "bottom": err[3]}
        undershoot = {"left": max(0, err[0]), "top": max(0, err[1]),
                      "right": max(0, -err[2]), "bottom": max(0, -err[3])}
        overflow = {"left": max(0, -err[0]), "top": max(0, -err[1]),
                    "right": max(0, err[2]), "bottom": max(0, err[3])}
        max_edge = max(undershoot.values())
    return {
        "safe": safe,
        "contractSafe": list(contract_safe) if contract_safe is not None else None,
        # LỆCH TỈ LỆ ĐI CẠNH LỆCH PIXEL, KHÔNG THAY NÓ. Hai số trả lời hai câu hỏi
        # khác nhau ("lõi có lấp đúng hộp cũ không" / "lõi có đúng dáng không") và
        # webapp đang đọc số thứ nhất — bỏ nó đi là làm vỡ màn kết quả để nói một
        # điều mà thêm một khoá cũng nói được.
        "aspectDeviation": aspect_deviation(safe, out),
        "sizeDeviation": {
            "maxEdgePx": max_edge,
            "flagged": bool(max_edge is not None and max_edge > threshold),
            "threshold": threshold,
            "edgesPx": edges,
            "undershootPx": undershoot,
            "overflowPx": overflow,
            "metric": "safe_undershoot",
        },
        "measured": rect is not None,
    }


# ── ĐOÁN HỘP THÂN: MÉP TRUNG VỊ (15/09/2026) ─────────────────────────────────
# ╔══ VÌ SAO PHẢI ĐOÁN, VÀ VÌ SAO KHÔNG ĐOÁN BẰNG HỘP HỨA ══════════════════════╗
# ║ Model vẽ CẢ CỤM: thân món + lá holly + mũ tuyết + quầng sáng. `safe` (bbox   ║
# ║ α ≥ 128) đo đúng cụm ấy — không có chỗ nào trong nó tách được thân. Webapp   ║
# ║ thì có một nấc tên «Thân lấp khung», và tới 14/09/2026 nấc ấy lấy            ║
# ║ `contractSafe` làm thân: một hộp mà PROMPT đã thôi hứa (đo r-0021: model vẽ  ║
# ║ đúng tâm mà cỡ gấp 1,5–1,7 lần ở mọi ô). Nấc «thân» đang căn theo một con số ║
# ║ không còn ai tôn trọng. Nên thân phải ĐO RA TỪ PIXEL, hoặc không có.         ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# ╔══ PHÉP CHÍNH: MÉP TRUNG VỊ, KHÔNG PHẢI DIỆN TÍCH, KHÔNG PHẢI BBOX ══════════╗
# ║ Cạnh trên của thân = TRUNG VỊ của «y nhỏ nhất có sơn» lấy trên các cột nằm   ║
# ║ trong dải giữa 60% bề rộng cụm. Ba tính chất, và cả ba đều cần:              ║
# ║  ① Trang trí thò ra (holly, tuyết, ruy băng) chỉ chiếm THIỂU SỐ cột ⇒ không  ║
# ║    kéo nổi trung vị. bbox thì chỉ cần MỘT cột là phình ra hết cỡ.            ║
# ║  ② Thân RỖNG RUỘT (vòng avatar, khung popup) vẫn có mép ngoài ở MỌI cột ⇒    ║
# ║    trung vị đọc đúng vòng. Phép đo theo DIỆN TÍCH thì chết ở đây: một cái    ║
# ║    vòng phủ ~45% hộp của chính nó (đo 02-avatar-frame thật: 0,456).          ║
# ║  ③ Bo góc chỉ làm tụt độ phủ vài %, mà không dời mép ngoài của dải giữa.     ║
# ║ CÁI GIÁ, ghi ra chứ không giấu: trang trí trải dọc HẾT một cạnh (mũ tuyết    ║
# ║ phủ cả bề ngang một thanh) là ĐA SỐ, nên nó được tính vào thân. Phép này     ║
# ║ không có cách nào phân biệt «mũ tuyết phủ hết cạnh» với «thân dày hơn».      ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# ╔══ NỚI THEO MAD: VÌ MÉP CONG KHÔNG PHẢI MÉP LỆCH ═══════════════════════════╗
# ║ Trung vị trần trụi cắt cụt mọi hình CONG: trên một vòng tròn, trung vị của   ║
# ║ mép trên lấy ở dải giữa nằm THẤP HƠN đỉnh vòng ~7% đường kính — không phải   ║
# ║ vì có trang trí, mà vì vòng cong xuống ở hai bên. Nên sau khi có trung vị,   ║
# ║ mép được NỚI ra tới giá trị ngoài cùng còn nằm trong `MAD_K × MAD`:          ║
# ║   · hình cong  ⇒ các mép tản đều ⇒ MAD lớn ⇒ nới tới đúng đỉnh vòng;         ║
# ║   · thân phẳng + trang trí ⇒ đa số mép BẰNG NHAU ⇒ MAD = 0 ⇒ không nới,      ║
# ║     trang trí bị bỏ lại ngoài đúng như ý.                                    ║
# ║ MAD (độ lệch tuyệt đối trung vị) chứ không phải độ lệch chuẩn: chính đám     ║
# ║ trang trí ta muốn loại lại là thứ thổi phồng độ lệch chuẩn nhất.             ║
# ╚═════════════════════════════════════════════════════════════════════════════╝

#: Ngưỡng «CÓ SƠN». Thấp hơn `CORE_ALPHA` một cách CÓ CHỦ Ý: mặt kính / glass mà
#: model vẽ ở α ≈ 64 vẫn là THÂN, và với ngưỡng 128 thì ruột một thanh kính rỗng
#: hoàn toàn ⇒ mọi phép đo độ phủ đọc nó thành «khung rỗng». Vẫn cao hơn hẳn màn
#: sương α = 1..3 phủ cả ô (xem `CONTENT_ALPHA`), nên nền trống không thành thân.
PAINT_ALPHA = 32
#: Dải giữa dùng để lấy trung vị: 60% bề rộng (cho mép trên/dưới) và 60% chiều cao
#: (cho mép trái/phải) của cụm. Hẹp hơn thì vài chục cột quyết cả cạnh; rộng hơn thì
#: chính bốn góc — nơi trang trí hay đậu — được bỏ phiếu.
CORE_BAND = 0.6
#: Hệ số nới mép theo MAD. 3 là quy ước quen của phép loại ngoại lai theo MAD.
CORE_MAD_K = 3.0
#: Sàn nới, px: với thân phẳng MAD = 0, mà viền răng cưa của ngưỡng alpha vẫn dao
#: động 1–2px. Không có sàn thì mép bám đúng một giá trị trung vị và cắt mất viền.
CORE_EDGE_FLOOR_PX = 2
#: Nhỏ hơn ngần này so với cụm theo MỘT chiều ⇒ coi là ĐOÁN HỎNG, trả None.
CORE_MIN_CLUSTER_FRAC = 0.35
#: Lớn hơn ngần này so với cụm theo CẢ HAI chiều ⇒ món không có trang trí; trả None
#: để hạ nguồn dùng thẳng cụm, thay vì bày ra hai con số lệch nhau vài pixel.
CORE_WHOLE_CLUSTER_FRAC = 0.97
#: ĐƯỜNG PHỤ (quét độ phủ): cột/hàng thuộc thân khi tỉ lệ pixel có sơn trong dải
#: ngang qua nó đạt ngần này.
CORE_COVER_MIN = 0.85
#: …và dừng sau ngần này cột/hàng liên tiếp KHÔNG đạt — một cột hụt là khe hở của
#: hình, ba cột liền là đã ra khỏi thân.
CORE_COVER_GAP = 3
#: Số vòng lặp của đường phụ: bề rộng đo trong một dải cao, chiều cao đo trong một
#: dải rộng, nên hai số phụ thuộc nhau và phải lặp lại cho đứng yên.
CORE_COVER_ROUNDS = 3


def paint_mask(alpha):
    """Kênh alpha → mặt nạ 0/255 của pixel CÓ SƠN (α ≥ `PAINT_ALPHA`)."""
    return alpha.point(lambda v: 255 if v >= PAINT_ALPHA else 0)


def _slice_profile(mask, lo, hi, across0, across1, vertical):
    """Mỗi lát (cột nếu `vertical`, hàng nếu không) → ``(mép nhỏ, mép lớn, số px sơn)``.

    Lát nào không có sơn thì VẮNG MẶT trong dict — «không có sơn» khác «có sơn ở
    mép 0». Mỗi lát tốn đúng một `crop` + `getbbox` + `histogram`, cả ba ở tầng C
    của Pillow; không một vòng lặp Python nào chạm tới pixel. Một ô 627² tốn ~750
    lát, rẻ hơn hẳn việc kéo 393k pixel qua `getdata()`.
    """
    out = {}
    for i in range(lo, hi):
        strip = mask.crop((i, across0, i + 1, across1)) if vertical \
            else mask.crop((across0, i, across1, i + 1))
        bb = strip.getbbox()
        if bb is None:
            continue
        painted = strip.histogram()[255]
        out[i] = ((bb[1] + across0, bb[3] - 1 + across0, painted) if vertical
                  else (bb[0] + across0, bb[2] - 1 + across0, painted))
    return out


def _median(vals):
    s = sorted(vals)
    n = len(s)
    return float(s[n // 2]) if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def _robust_edge(vals, outward):
    """Mép thân từ danh sách mép ngoài của từng lát. `outward` = -1 (trên/trái) hoặc +1.

    Trung vị trước, rồi NỚI tới giá trị ngoài cùng còn nằm trong `MAD_K × MAD` (sàn
    `CORE_EDGE_FLOOR_PX`). Vì sao cả hai bước: xem khối «NỚI THEO MAD».
    """
    med = _median(vals)
    mad = _median([abs(v - med) for v in vals])
    tol = max(float(CORE_EDGE_FLOOR_PX), CORE_MAD_K * mad)
    keep = [v for v in vals if (v >= med - tol if outward < 0 else v <= med + tol)]
    if not keep:
        return int(round(med))
    return min(keep) if outward < 0 else max(keep)


def _median_core_box(mask, cluster):
    """Hộp thân theo mép trung vị → ``[x, y, w, h]``, hoặc None nếu dải giữa trống."""
    x, y, w, h = cluster
    ix, iy = int(round(w * (1 - CORE_BAND) / 2)), int(round(h * (1 - CORE_BAND) / 2))
    cols = _slice_profile(mask, x + ix, x + w - ix, y, y + h, True)
    rows = _slice_profile(mask, y + iy, y + h - iy, x, x + w, False)
    if not cols or not rows:
        return None
    top = _robust_edge([v[0] for v in cols.values()], -1)
    bottom = _robust_edge([v[1] for v in cols.values()], +1)
    left = _robust_edge([v[0] for v in rows.values()], -1)
    right = _robust_edge([v[1] for v in rows.values()], +1)
    if right <= left or bottom <= top:
        return None
    return [left, top, right - left + 1, bottom - top + 1]


def _run_edge(profile, start, step, span, lo_limit, hi_limit):
    """Từ `start` đi theo `step`: lát cuối cùng còn đủ độ phủ trước khi hụt liên tiếp."""
    edge = None
    gap = 0
    i = int(start)
    while lo_limit <= i <= hi_limit:
        cell = profile.get(i)
        if cell is not None and span > 0 and cell[2] / float(span) >= CORE_COVER_MIN:
            edge, gap = i, 0
        else:
            gap += 1
            if gap >= CORE_COVER_GAP:
                break
        i += step
    return edge


def _coverage_core_box(mask, cluster, center):
    """ĐƯỜNG PHỤ: quét ĐỘ PHỦ cột/hàng từ tâm ra hai bên. Dùng khi mép trung vị câm.

    Quét theo độ phủ chứ không theo diện tích hộp: bo góc làm diện tích tụt 5–8% dù
    thân vẫn đúng, còn độ phủ của một CỘT thì chỉ tụt ở đúng mấy cột sát góc.
    """
    x, y, w, h = cluster
    cx, cy = center
    hc, wc = float(h), float(w)
    left = right = top = bottom = None
    for _ in range(CORE_COVER_ROUNDS):
        y0, y1 = max(y, int(round(cy - hc / 2))), min(y + h, int(round(cy + hc / 2)))
        if y1 <= y0:
            return None
        cols = _slice_profile(mask, x, x + w, y0, y1, True)
        left = _run_edge(cols, round(cx), -1, y1 - y0, x, x + w - 1)
        right = _run_edge(cols, round(cx), +1, y1 - y0, x, x + w - 1)
        if left is None or right is None or right <= left:
            return None
        wc = float(right - left + 1)
        x0, x1 = max(x, int(round(cx - wc / 2))), min(x + w, int(round(cx + wc / 2)))
        if x1 <= x0:
            return None
        rows = _slice_profile(mask, y, y + h, x0, x1, False)
        top = _run_edge(rows, round(cy), -1, x1 - x0, y, y + h - 1)
        bottom = _run_edge(rows, round(cy), +1, x1 - x0, y, y + h - 1)
        if top is None or bottom is None or bottom <= top:
            return None
        hc = float(bottom - top + 1)
    return [left, top, right - left + 1, bottom - top + 1]


def _paint_centroid(mask, cluster):
    """Trọng tâm khối lượng của phần CÓ SƠN trong cụm → ``(cx, cy)`` hoặc None."""
    x, y, w, h = cluster
    cols = _slice_profile(mask, x, x + w, y, y + h, True)
    rows = _slice_profile(mask, y, y + h, x, x + w, False)
    tw = sum(v[2] for v in cols.values())
    th = sum(v[2] for v in rows.values())
    if tw <= 0 or th <= 0:
        return None
    return (sum(i * v[2] for i, v in cols.items()) / float(tw),
            sum(i * v[2] for i, v in rows.items()) / float(th))


def _fit_aspect(box, aspect, bounds):
    """Hộp lớn nhất có tỉ lệ `aspect` NẰM GỌN trong `box`, cùng tâm, kẹp trong `bounds`.

    «Nằm gọn» chứ không phải «phủ kín», và đây là chỗ phép đoán trả nợ nhiều nhất:
    một viên thuốc 470×160 kèm hai cụm holly hai đầu cho hộp trung vị 590×160 (holly
    chiếm đa số HÀNG của dải giữa nên nó thắng ở mép trái/phải) — ép về tỉ lệ 2,94
    thì chiều cao là cạnh chặt hơn, và bề rộng rút đúng về 470.
    """
    x, y, w, h = box
    if w / float(h) > aspect:
        nh = float(h)
        nw = nh * aspect
    else:
        nw = float(w)
        nh = nw / aspect
    nx = int(round(x + w / 2.0 - nw / 2.0))
    ny = int(round(y + h / 2.0 - nh / 2.0))
    nw, nh = int(round(nw)), int(round(nh))
    bx, by, bw, bh = bounds
    nw, nh = min(nw, bw), min(nh, bh)
    nx = max(bx, min(nx, bx + bw - nw))
    ny = max(by, min(ny, by + bh - nh))
    return [nx, ny, nw, nh]


def guess_core_box(alpha, aspect, cluster_box):
    """ĐOÁN HỘP THÂN trong một ô → ``[x, y, w, h]`` (toạ độ ô), hoặc None.

    `alpha` = kênh alpha của ô (ảnh Pillow mode "L"); `aspect` = `w/h` của cỡ đầu ra
    người dùng đặt (`comp["out"]`), None nếu ô không đặt cỡ; `cluster_box` = hộp CẢ
    CỤM (`safe`).

    None nghĩa là «không đoán được, hạ nguồn cứ dùng cả cụm» — KHÔNG phải «lỗi». Bốn
    lối rơi về None, và không lối nào đoán bừa thay:
      · không có cỡ đầu ra ⇒ không có tỉ lệ để ép, mà mép trung vị trần trụi thì
        không tự tách được thân khỏi trang trí ở hai đầu;
      · ô không một pixel nào có sơn;
      · hộp đoán được < 35% cụm theo một chiều ⇒ phép đoán vừa cắt mất thân;
      · hộp đoán được ≥ 97% cụm theo CẢ HAI chiều ⇒ món không có trang trí.
    ĐÃ BỎ (theo yêu cầu chủ sản phẩm, 15/09/2026) điều kiện «độ phủ diện tích < 0,6
    ⇒ None»: nó giết đúng những món RỖNG RUỘT hợp lệ — vòng avatar đo được 0,456,
    khung popup 0,667 — mà đó lại chính là loại món cần đoán thân nhất.
    """
    try:
        a = float(aspect)
    except (TypeError, ValueError):
        return None
    if not (a > 0):
        return None
    try:
        gx, gy, gw, gh = (int(v) for v in cluster_box[:4])
    except (TypeError, ValueError, IndexError):
        return None
    if gw <= 0 or gh <= 0:
        return None

    mask = paint_mask(alpha)
    paint = mask.getbbox()
    if paint is None:
        return None
    # CỤM = HỢP của hộp đã đo (α ≥ 128) và bbox phần có sơn (α ≥ 32), kẹp trong ô.
    # Hợp chứ không phải một trong hai: `safe` là thứ hạ nguồn gọi là «cả cụm», còn
    # bbox có sơn là thứ MẮT nhìn thấy — một thân kính α = 64 nằm ngoài `safe` vẫn
    # phải được tính vào cụm, nếu không mọi tỉ lệ so với cụm đều nói dối.
    W, H = mask.size
    x0, y0 = max(0, min(gx, paint[0])), max(0, min(gy, paint[1]))
    x1, y1 = min(W, max(gx + gw, paint[2])), min(H, max(gy + gh, paint[3]))
    if x1 <= x0 or y1 <= y0:
        return None
    cluster = [x0, y0, x1 - x0, y1 - y0]

    box = _median_core_box(mask, cluster)
    if box is None:
        # Dải giữa câm (hình chỉ có mực ở rìa, kiểu dấu «=»): rơi sang đường phụ.
        # Hai tâm, LẤY HỘP LỚN HƠN — tâm hộp cụm đúng với món căn giữa, trọng tâm
        # khối lượng đúng với món dồn mực về một phía; không có cách nào biết
        # trước cái nào đúng, nên thử cả hai và giữ cái ít cắt vào thân hơn.
        centers = [(cluster[0] + cluster[2] / 2.0, cluster[1] + cluster[3] / 2.0)]
        centroid = _paint_centroid(mask, cluster)
        if centroid is not None:
            centers.append(centroid)
        found = [b for b in (_coverage_core_box(mask, cluster, c) for c in centers)
                 if b is not None]
        if not found:
            return None
        box = max(found, key=lambda b: b[2] * b[3])

    core = _fit_aspect(box, a, cluster)
    if core[2] < CORE_MIN_CLUSTER_FRAC * cluster[2] or core[3] < CORE_MIN_CLUSTER_FRAC * cluster[3]:
        return None
    if (core[2] >= CORE_WHOLE_CLUSTER_FRAC * cluster[2]
            and core[3] >= CORE_WHOLE_CLUSTER_FRAC * cluster[3]):
        return None
    return core


def paint_coverage(alpha, box):
    """Tỉ lệ pixel CÓ SƠN trong `box` → 0..1, hoặc None nếu hộp rỗng.

    Chỉ là SỐ ĐỂ SOI, không phải cổng: `guess_core_box` không đọc nó (một cái vòng
    rỗng ruột phủ ~0,45 mà vẫn là thân đúng). Nó có mặt để khi một ô ra hộp lạ thì
    còn đọc được «thân này đặc hay rỗng» mà không phải mở lại ảnh.
    """
    try:
        x, y, w, h = (int(v) for v in box[:4])
    except (TypeError, ValueError, IndexError):
        return None
    if w <= 0 or h <= 0:
        return None
    crop = paint_mask(alpha).crop((x, y, x + w, y + h))
    return crop.histogram()[255] / float(w * h)


# ── CLI: tham số + ổ khoá manifest ───────────────────────────────────────────
# CẮT LŨY TIẾN (14/08 → 15/08). Trước: cả lượt gen xong 10 tấm mới cắt MỘT LẦN, người
# dùng ngồi nhìn màn hình trống 15 phút. Nay agent gọi slice.py NGAY khi một tấm gen
# xong, với đúng một style + đúng một sheet:
#     python3 slice.py tet --sheet=main
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
    with open(tmp, "w", encoding="utf-8") as f:
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


def summarize_aspect_deviation(assets, threshold=ASPECT_DEVIATION_THRESHOLD, style_id=None):
    """Tổng hợp lệch TỈ LỆ. Cùng hình dạng với `summarize_size_deviation` có chủ ý:
    web đọc hai khối cạnh nhau thì chúng phải có cùng tên khoá, chỉ khác đơn vị
    (`maxValue` là tỉ lệ 0..n, không phải pixel)."""
    measured = []
    flagged_assets = []
    worst = None
    for asset in assets or []:
        qa = asset.get("aspectDeviation") or {}
        val = qa.get("value")
        if not isinstance(val, (int, float)):
            continue
        measured.append(asset)
        worst = max(abs(val), worst or 0)
        if qa.get("flagged"):
            flagged_assets.append({
                "style": style_id if style_id is not None else asset.get("_style"),
                "file": asset.get("file"),
                "value": val,
            })
    return {
        "threshold": threshold,
        "measured": len(measured),
        "flagged": bool(flagged_assets),
        "flaggedCount": len(flagged_assets),
        "maxValue": worst,
        "flaggedAssets": flagged_assets,
    }


def summarize_manifest_qa(manifest, threshold=SIZE_DEVIATION_THRESHOLD_PX):
    """QA toàn manifest, chỉ chứa ID asset + số; không chứa đường dẫn máy."""
    all_assets = []
    for style_id, entry in (manifest.get("styles") or {}).items():
        all_assets.extend({**asset, "_style": style_id} for asset in entry.get("assets") or [])
    return {"sizeDeviation": summarize_size_deviation(all_assets, threshold),
            "aspectDeviation": summarize_aspect_deviation(all_assets)}


# ── CLI ──────────────────────────────────────────────────────────────────────
# Thân script nằm dưới guard `__main__` để test (và mọi công cụ đo) IMPORT được
# các hàm ở trên mà KHÔNG chạy cắt ghi đè kits/.
if __name__ == "__main__":
    ONLY, ONLY_SHEETS = parse_cli(sys.argv[1:])
    mpath = os.path.join(HERE, "kits", "manifest.json")
    # Khoá TRƯỚC khi đọc: mọi lượt slice trong cùng project xếp hàng, không ai ghi đè ai.
    _LOCK_FD = acquire_manifest_lock(os.path.join(HERE, "kits"))
    manifest = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {"styles": {}}
    manifest.setdefault("schemaVersion", 2)
    manifest.setdefault("styles", {})

    for style in cfg["styles"]:
        sid = style["id"]
        if ONLY and sid not in ONLY:
            continue
        try:
            qa_threshold = int(style.get("sizeDeviationThreshold", SIZE_DEVIATION_THRESHOLD_PX))
        except (TypeError, ValueError):
            qa_threshold = SIZE_DEVIATION_THRESHOLD_PX
        out_dir = os.path.join(HERE, "kits", sid)
        entry = {"sheets": {}, "assets": [], "empty_cells": []}
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
            # Phép chia dưới đây lấy ĐẠI kích thước ảnh nhận được rồi chia cho lưới.
            # Model trả sai hướng là mọi ô méo lặng lẽ (sự cố 21/08/2026): ảnh cắt ra
            # trông "bị kéo cao", còn cờ QA thì chỉ báo SAU KHI đã cắt.
            orient_err = orientation_error(sh.get("orient"), W, H, sh.get("canvas"))
            if orient_err:
                print(f"⚠ bỏ qua {job}: {orient_err}. Cắt lưới {COLS}x{ROWS} trên khổ "
                      f"sai sẽ ra ô méo — sinh lại sheet này thay vì dùng ảnh hiện có.")
                continue

            # CW/CH qua `geometry.cell_size` chứ không `round()` tại chỗ: đây là cùng
            # hàm mà khối python của gen.sh gọi để in toạ độ safe zone vào prompt. Chia
            # trên W/H CỦA ẢNH THẬT (không phải của bảng CANVAS) là có chủ ý — model
            # được phép lệch vài chục pixel trong ngưỡng tỉ lệ, và ô phải bám ảnh nhận
            # được chứ không bám con số ta mong.
            CW, CH = geometry.cell_size(W, H, COLS, ROWS)
            sheet_img, mode = read_sheet(raw_img)
            if mode == "rgb":
                print(f"  ⚠ {job}: ảnh KHÔNG có nền trong suốt (mode rgb). Vẫn cắt "
                      f"nguyên, KHÔNG tự chế alpha — manifest ghi mode:\"rgb\" để web "
                      f"báo cho người dùng biết mà sinh lại.")

            os.makedirs(out_dir, exist_ok=True)
            n_ok = 0
            for idx, comp in enumerate(sh["components"]):
                sk = comp["skel"]
                if sk["shape"] == "empty":
                    continue                      # ô đệm cố ý bỏ trống — không cắt

                # ① HỘP Ô, KHÔNG NỚI MỘT PIXEL. Bản trước nới ra vành `bleed` (18–24%
                # mỗi phía) để "vớt trang trí tràn", rồi phải dựng cả bộ mask sở hữu
                # khối để đuổi lại đồ của hàng xóm vừa múc vào. Vành đó chính là cửa
                # cho vệt vàng lẻ loi dưới `01-button`. Luật safe zone trong prompt đã
                # chừa sẵn 10% lề mỗi cạnh cho phần tràn NGAY TRONG Ô — không cần
                # mượn đất của ô bên, nên không cần đuổi ai cả.
                cx0, cy0 = geometry.cell_origin(W, H, COLS, ROWS, idx)
                canvas = sheet_img.crop((cx0, cy0, cx0 + CW, cy0 + CH))

                # ② KHUNG HỢP ĐỒNG. Hộp này là chuyện của DAO CẮT và của QA, không
                # còn là một lời hứa với model: từ 14/09/2026 prompt không in toạ độ
                # nào (model vẽ đúng tâm mà cỡ gấp 1,5–1,7 lần — đo r-0021: lõi 587px
                # trên hộp hứa 368px). Nó ở lại vì `sizeDeviation` đối chiếu theo nó
                # và webapp đang đọc số ấy; lời hứa thật thì đo bằng `aspectDeviation`.
                # Ô full-bleed không có khung nào để hứa ⇒ khung = cả ô.
                if sk["shape"] == "full":
                    contract_safe = [0, 0, CW, CH]
                else:
                    dx, dy, sw, sh_ = geometry.safe_offset_in_cell(CW, CH, sk)
                    contract_safe = [dx, dy, sw, sh_]

                # ③ ĐO. Không một dòng nào dưới đây ghi vào pixel.
                # Sàn CONTENT_ALPHA để hộp không ôm màn sương α=1..3 của model (xem
                # hằng). Đường lùi `or alpha_bbox(canvas)`: ô mà KHÔNG pixel nào đạt
                # α≥4 vẫn được cắt bình thường theo bbox sương — TRỐNG là "không một
                # pixel nào có alpha", không phải "mờ quá ngưỡng của tôi". Từ chối cắt
                # một ô người dùng đã trả tiền gen là giữ nó làm con tin; và ô mờ toàn
                # phần là chuyện của lượt gen hỏng, phải nhìn thấy được thì mới sửa.
                content_box = alpha_bbox(canvas, CONTENT_ALPHA)
                haze_only = content_box is None
                if haze_only:
                    content_box = alpha_bbox(canvas)
                if content_box is None:
                    entry["empty_cells"].append(comp["file"])
                    print(f"  · {sid}/{comp['file']}: ô TRỐNG (không pixel nào có alpha)")
                    continue
                if haze_only:
                    print(f"  ⚠ {sid}/{comp['file']}: cả ô không có pixel nào α ≥ "
                          f"{CONTENT_ALPHA} — chỉ là sương mờ. Vẫn cắt nguyên, nhưng "
                          "lượt vẽ này gần như trống.")
                ledger = measure_cell(canvas, contract_safe, qa_threshold,
                                      comp.get("out"))
                if ledger["aspectDeviation"]["flagged"]:
                    print(f"  ⚠ QA {sid}/{comp['file']}: aspectDeviation "
                          f"{ledger['aspectDeviation']['value']:.0%} > "
                          f"{ASPECT_DEVIATION_THRESHOLD:.0%} "
                          f"(lõi {ledger['aspectDeviation']['safeAspect']}:1 vs "
                          f"hứa {ledger['aspectDeviation']['outAspect']}:1)")
                if ledger["sizeDeviation"]["flagged"]:
                    print(f"  ⚠ QA {sid}/{comp['file']}: sizeDeviation "
                          f"max {ledger['sizeDeviation']['maxEdgePx']}px > {qa_threshold}px "
                          "(chỉ gắn cờ, không tự gen lại)")

                canvas.save(os.path.join(out_dir, f"{comp['file']}.png"))
                ox, oy = content_box[0], content_box[1]
                pw = content_box[2] - content_box[0]
                ph = content_box[3] - content_box[1]
                # tight/ = cùng ảnh, cắt về đúng bbox alpha ≥ CONTENT_ALPHA — không dư
                # một viền trong suốt nào, và không ôm màn sương phủ cả ô. Web ưu tiên bản này (`cover.mjs`, lưới kết quả); bản canvas
                # ở lại vì Figma cần toạ độ tuyệt đối trong ô.
                tight = canvas.crop(content_box)
                os.makedirs(os.path.join(out_dir, "tight"), exist_ok=True)
                tight.save(os.path.join(out_dir, "tight", f"{comp['file']}.png"))

                asset = {"file": comp["file"] + ".png", "sheet": sh["id"], "mode": mode,
                         "canvas": [CW, CH], "cell": [CW, CH], "bleed": [0, 0],
                         "content": [pw, ph], "content_at": [ox, oy],
                         "safe": ledger["safe"] or contract_safe,
                         "contractSafe": contract_safe,
                         "sizeDeviation": ledger["sizeDeviation"],
                         "aspectDeviation": ledger["aspectDeviation"]}
                # CỠ ĐẦU RA CHỈ ĐI QUA, KHÔNG THAM GIA CẮT. `out` là cỡ người dùng
                # muốn có khi element rời khỏi app (dán Figma, xuất PNG); ô thì luôn
                # được vẽ to hết cỡ lề cho phép để ăn trọn độ phân giải ảnh sinh.
                out = comp.get("out")
                if isinstance(out, dict) and out.get("w") and out.get("h"):
                    asset["outSize"] = [int(out["w"]), int(out["h"])]
                    if comp.get("drawScale"):
                        asset["drawScale"] = float(comp["drawScale"])

                # ④ ĐOÁN THÂN. Cũng chỉ ĐỌC pixel. `safe` đo CẢ CỤM (thân + holly +
                # tuyết + quầng sáng), mà webapp có một nấc tên «Thân lấp khung» và
                # tới nay nấc ấy căn theo `contractSafe` — một hộp prompt đã thôi
                # hứa. Hộp này là câu trả lời đo được cho nấc đó; vắng khoá nghĩa là
                # «không đoán được», và webapp quay lại dùng cả cụm.
                core_aspect = None
                if isinstance(out, dict) and out.get("w") and out.get("h"):
                    try:
                        core_aspect = float(out["w"]) / float(out["h"])
                    except (TypeError, ValueError, ZeroDivisionError):
                        core_aspect = None
                core_box = guess_core_box(canvas.getchannel("A"), core_aspect,
                                          ledger["safe"] or contract_safe)
                if core_box is not None:
                    asset["coreBox"] = core_box
                    cov = paint_coverage(canvas.getchannel("A"), core_box)
                    if cov is not None:
                        asset["coreCoverage"] = round(cov, 4)
                entry["assets"].append(asset)
                n_ok += 1

            entry["sheets"][sh["id"]] = {"mode": mode, "canvas": [CW, CH], "cell": [CW, CH],
                                         "bleed": [0, 0], "size": [W, H], "cut": n_ok}
            done_sheets.add(sh["id"])
            print(f"✓ {job}: {n_ok}/{len(sh['components'])} ô (canvas = ô {CW}x{CH}), {mode}")

        # ── GEN LẠI MỘT NHÓM: giữ lại phần sheet KHÔNG chạy lượt này ────────────────
        # Agent thu hẹp styles.json đúng tập job của lượt chạy (engine.mjs
        # contractToStylesV1 + materializeStyles), nên khi người dùng bấm "Lưu và tạo
        # lại" cho MỘT nhóm thì cfg["sheets"] chỉ còn sheet đó. Ghi thẳng
        # `manifest["styles"][sid] = entry` ⇒ mọi asset của các sheet KHÁC biến mất
        # khỏi manifest, dù file PNG vẫn nằm trong kits/.
        prev = manifest["styles"].get(sid) or {}
        keep_sheets = [k for k in (prev.get("sheets") or {}) if k not in done_sheets]
        if keep_sheets:
            done_files = {c["file"] for sh in cfg["sheets"] if sh["id"] in done_sheets
                          for c in sh["components"]}
            for k in keep_sheets:
                entry["sheets"][k] = prev["sheets"][k]
            for a in (prev.get("assets") or []):
                if a.get("sheet") not in keep_sheets or a.get("file", "")[:-4] in done_files:
                    continue
                entry["assets"].append(a)
            for f in (prev.get("empty_cells") or []):
                if f not in done_files and f not in entry["empty_cells"]:
                    entry["empty_cells"].append(f)
            print(f"  ↺ {sid}: giữ nguyên {len(keep_sheets)} sheet không chạy lượt này "
                  f"({', '.join(keep_sheets)})")


        entry["qa"] = {"sizeDeviation": summarize_size_deviation(
            entry["assets"], qa_threshold, sid),
            "aspectDeviation": summarize_aspect_deviation(
                entry["assets"], ASPECT_DEVIATION_THRESHOLD, sid)}
        manifest["styles"][sid] = entry
        total = len(entry["assets"])
        want = sum(sum(1 for c in sh["components"] if c["skel"]["shape"] != "empty")
                   for sh in cfg["sheets"] if sh["id"] in done_sheets) \
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
    # CHỈ SỐ CỦA LỜI HỨA HÔM NAY: prompt nói tỉ lệ, nên QA phải đọc được tỉ lệ.
    a = manifest["qa"]["aspectDeviation"]
    print(f"— QA aspectDeviation: {a['flaggedCount']} flagged / {a['measured']} measured, "
          f"threshold {a['threshold']:.0%} (không auto-regen)")
    dump_manifest(mpath, manifest)
    print("→ kits/manifest.json")
