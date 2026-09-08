#!/usr/bin/env python3
"""
slice.py — CHỈ CẮT. Không tách nền, không đụng alpha của model.

╔══ VÌ SAO FILE NÀY NGẮN ĐI HƠN 900 DÒNG (07/09/2026) ═════════════════════════╗
║ Bản trước là một cỗ máy TÁCH NỀN đời chroma-key, đắp thêm mãi: key màu        ║
║ magenta/green, alpha mềm theo khoảng cách màu, un-mix màu nền khỏi viền, dán  ║
║ nhãn khối liên thông (blob) để giành pixel giữa hai ô, MaxFilter + blur để    ║
║ "feather" mép mask, lấp lỗ kín, erode/dilate dò "core enamel" theo màu tím,   ║
║ nắn nội dung về khung safe (snap/align, có cả resize), lật ngang pose, và một ║
║ nhánh riêng vẽ ô `matte:"glow"` trên NỀN ĐEN rồi ship kèm `blend:"screen"`.   ║
║                                                                              ║
║ Cả cỗ máy đó tồn tại vì một tiền đề đã CHẾT: "ảnh model trả về không có       ║
║ alpha". Nay `image_gen` trả PNG RGBA có alpha thật và prompt (`gen.sh`,       ║
║ section Transparency) đòi đúng điều đó. Giữ máy cũ chạy trên ảnh đã có alpha  ║
║ không phải là thừa — nó PHÁ, và ba vết đo được trên dự án `test-e0d4`:        ║
║   · 01-button   — một vệt vàng lẻ loi phía dưới: vùng crop được nới ra ngoài  ║
║                   ranh giới ô (vành `bleed`) nên múc theo mảnh của ô bên;     ║
║   · 02-healthbar— ruột thanh bị GẶM: thân kính model vẽ ở α≈86–93, nằm dưới   ║
║                   mask "nghiêm" (α≥240) nên bị mask×blur bóp còn α≈3–8;       ║
║   · 03-avatar   — nằm trên nền ĐEN ĐẶC: `matte:"glow"` ⇒ `blend:"screen"` ⇒   ║
║                   web tự đặt nền tối cho ô đó.                               ║
║ Không cái nào là lỗi của model. Cả ba là máy móc cũ tự gây ra.                ║
╚══════════════════════════════════════════════════════════════════════════════╝

LUẬT MỚI, ĐỌC HẾT TRONG MƯỜI GIÂY:

  raw/<style>-<sheet>.png  (RGBA, alpha do model vẽ)
      │  ① hộp ô  = geometry.cell_box  — CHÍNH XÁC hộp ô, không nới một pixel
      │  ② crop   = copy nguyên vùng đó. Không key, không ngưỡng, không mask,
      │             không blend, không nắn, không dịch, không lật.
      │  ③ đo     = bbox alpha (chỉ ĐỌC, không sửa pixel) → content/safe
      ▼
  kits/<style>/<file>.png        canvas = ĐÚNG một ô
  kits/<style>/tight/<file>.png  cùng ảnh, crop về bbox alpha>0 (không dư viền)

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
QA_SIZE_DEVIATION_THRESHOLD_PX = SIZE_DEVIATION_THRESHOLD_PX

#: Từ mức này trở lên coi là ĐỤC HẲN — xem `snap_solid_alpha`.
SOLID_ALPHA = 240
#: Ngưỡng đo LÕI (`safe`). Không phải ngưỡng cắt: không một pixel nào bị bỏ vì nó.
#: 128 = nửa đục — quầng sáng tan dần và mặt kính α≈64 nằm dưới, nên chúng không
#: kéo hộp `safe` phình ra, mà vẫn còn nguyên trong ảnh.
CORE_ALPHA = 128

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


def measure_cell(canvas, contract_safe, threshold=SIZE_DEVIATION_THRESHOLD_PX):
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


def summarize_manifest_qa(manifest, threshold=SIZE_DEVIATION_THRESHOLD_PX):
    """QA toàn manifest, chỉ chứa ID asset + số; không chứa đường dẫn máy."""
    all_assets = []
    for style_id, entry in (manifest.get("styles") or {}).items():
        all_assets.extend({**asset, "_style": style_id} for asset in entry.get("assets") or [])
    return {"sizeDeviation": summarize_size_deviation(all_assets, threshold)}


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

                # ② KHUNG HỢP ĐỒNG. `geometry.safe_offset_in_cell` là cùng hàm khối
                # python của gen.sh gọi để in "safe zone x=…, y=…" vào prompt, nên
                # lệch một pixel là một test đỏ chứ không phải một asset lệch âm thầm.
                # Ô full-bleed không có khung nào để hứa ⇒ khung = cả ô.
                if sk["shape"] == "full":
                    contract_safe = [0, 0, CW, CH]
                else:
                    dx, dy, sw, sh_ = geometry.safe_offset_in_cell(CW, CH, sk)
                    contract_safe = [dx, dy, sw, sh_]

                # ③ ĐO. Không một dòng nào dưới đây ghi vào pixel.
                content_box = alpha_bbox(canvas)
                if content_box is None:
                    entry["empty_cells"].append(comp["file"])
                    print(f"  · {sid}/{comp['file']}: ô TRỐNG (không pixel nào có alpha)")
                    continue
                ledger = measure_cell(canvas, contract_safe, qa_threshold)
                if ledger["sizeDeviation"]["flagged"]:
                    print(f"  ⚠ QA {sid}/{comp['file']}: sizeDeviation "
                          f"max {ledger['sizeDeviation']['maxEdgePx']}px > {qa_threshold}px "
                          "(chỉ gắn cờ, không tự gen lại)")

                canvas.save(os.path.join(out_dir, f"{comp['file']}.png"))
                ox, oy = content_box[0], content_box[1]
                pw = content_box[2] - content_box[0]
                ph = content_box[3] - content_box[1]
                # tight/ = cùng ảnh, cắt về đúng bbox alpha — không dư một viền trong
                # suốt nào. Web ưu tiên bản này (`cover.mjs`, lưới kết quả); bản canvas
                # ở lại vì Figma cần toạ độ tuyệt đối trong ô.
                tight = canvas.crop(content_box)
                os.makedirs(os.path.join(out_dir, "tight"), exist_ok=True)
                tight.save(os.path.join(out_dir, "tight", f"{comp['file']}.png"))

                asset = {"file": comp["file"] + ".png", "sheet": sh["id"], "mode": mode,
                         "canvas": [CW, CH], "cell": [CW, CH], "bleed": [0, 0],
                         "content": [pw, ph], "content_at": [ox, oy],
                         "safe": ledger["safe"] or contract_safe,
                         "contractSafe": contract_safe,
                         "sizeDeviation": ledger["sizeDeviation"]}
                # CỠ ĐẦU RA CHỈ ĐI QUA, KHÔNG THAM GIA CẮT. `out` là cỡ người dùng
                # muốn có khi element rời khỏi app (dán Figma, xuất PNG); ô thì luôn
                # được vẽ to hết cỡ lề cho phép để ăn trọn độ phân giải ảnh sinh.
                out = comp.get("out")
                if isinstance(out, dict) and out.get("w") and out.get("h"):
                    asset["outSize"] = [int(out["w"]), int(out["h"])]
                    if comp.get("drawScale"):
                        asset["drawScale"] = float(comp["drawScale"])
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
            entry["assets"], qa_threshold, sid)}
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
    dump_manifest(mpath, manifest)
    print("→ kits/manifest.json")
