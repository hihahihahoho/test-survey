#!/usr/bin/env python3
"""Dựng ĐẦU VÀO của các ca golden cho bước cắt (dev-only, cần Pillow).

Mỗi ca là một thư mục tự chứa:
    <case>/styles.json     — hợp đồng engine v1 mà `slice.py` đọc
    <case>/contract.json   — hợp đồng cho `validate_output_geometry.py` (tuỳ ca)
    <case>/raw/<job>.png   — ảnh sheet đầu vào
    <case>/steps.json      — danh sách argv của từng lượt chạy slice.py

Ảnh DỰNG TẠI CHỖ bằng PIL và bằng ĐÚNG những hình mà bộ pytest hiện hành mô tả
(viên thuốc + holly, vòng rỗng ruột, khung popup + ruy băng, thanh dài + mũ tuyết,
thân kính α=64, màn sương α=1..3, dải alpha 255→1, full-bleed mép răng cưa). Không
có ảnh mẫu nào nằm sẵn trên đĩa: một file .png trong repo không tả được nó là hình gì.

Chạy: python3 make-cases.py <thư-mục-đích>
"""
import json, os, sys
from PIL import Image, ImageDraw

TRONG = (0, 0, 0, 0)


def comp(file, shape="rrect", w=0.8, h=0.6, out=None, draw_scale=None, **skel):
    c = {"file": file, "vi": file, "spec": file, "skel": dict(shape=shape, w=w, h=h, **skel)}
    if out:
        c["out"] = {"w": out[0], "h": out[1]}
    if draw_scale:
        c["drawScale"] = draw_scale
    return c


def case(root, name, styles, images, steps=None, contract_jobs=()):
    d = os.path.join(root, name)
    os.makedirs(os.path.join(d, "raw"), exist_ok=True)
    with open(os.path.join(d, "styles.json"), "w", encoding="utf-8") as f:
        json.dump(styles, f, ensure_ascii=False, indent=2)
    for job, im in images.items():
        im.save(os.path.join(d, "raw", job + ".png"))
    with open(os.path.join(d, "steps.json"), "w", encoding="utf-8") as f:
        json.dump(steps or [[]], f)
    if contract_jobs:
        contract = {"schemaVersion": 4,
                    "variants": [{"id": s["id"]} for s in styles["styles"]],
                    "sheets": styles["sheets"]}
        with open(os.path.join(d, "contract.json"), "w", encoding="utf-8") as f:
            json.dump(contract, f, ensure_ascii=False, indent=2)
        with open(os.path.join(d, "validate-jobs.json"), "w", encoding="utf-8") as f:
            json.dump(list(contract_jobs), f)
    print("  ·", name)


def blank(w, h):
    return Image.new("RGBA", (w, h), TRONG)


# ── ① thân đặc, khổ ngang ────────────────────────────────────────────────────

def solid_landscape():
    W, H, COLS, ROWS = 768, 512, 4, 2
    im = blank(W, H)
    d = ImageDraw.Draw(im)
    cw, ch = W // COLS, H // ROWS
    palette = [(200, 60, 60), (60, 160, 90), (90, 60, 200), (220, 180, 60),
               (40, 140, 160), (230, 120, 40), (120, 120, 120)]
    comps = []
    for i in range(COLS * ROWS):
        r, c = divmod(i, COLS)
        if i == 5:
            comps.append(comp("06-cach", shape="empty"))
            continue
        x0, y0 = c * cw, r * ch
        pad_x, pad_y = 24 + (i % 3) * 8, 30 + (i % 2) * 10
        d.rounded_rectangle((x0 + pad_x, y0 + pad_y, x0 + cw - pad_x - 1, y0 + ch - pad_y - 1),
                            radius=18, fill=palette[i % len(palette)] + (255,))
        comps.append(comp("%02d-o" % (i + 1), w=0.7 + (i % 3) * 0.05, h=0.55,
                          out=(120 + i * 10, 52 + i * 4), draw_scale=2.5 if i == 0 else None))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "ui", "grid": {"cols": COLS, "rows": ROWS},
                          "canvas": "landscape", "orient": "landscape", "components": comps}]}
    return styles, {"kit-ui": im}


# ── ② khổ dọc + neo đáy ──────────────────────────────────────────────────────

def portrait_bottom():
    W, H, COLS, ROWS = 512, 768, 2, 3
    im = blank(W, H)
    d = ImageDraw.Draw(im)
    cw, ch = W // COLS, H // ROWS
    comps = []
    for i in range(COLS * ROWS):
        r, c = divmod(i, COLS)
        x0, y0 = c * cw, r * ch
        d.ellipse((x0 + 40, y0 + 40, x0 + cw - 41, y0 + ch - 41), fill=(60, 120 + i * 10, 200, 255))
        comps.append(comp("%02d-o" % (i + 1), w=0.6, h=0.5,
                          anchor="bottom" if i % 2 else "center", out=(96, 80)))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "doc", "grid": {"cols": COLS, "rows": ROWS},
                          "canvas": "portrait", "orient": "portrait", "components": comps}]}
    return styles, {"kit-doc": im}


# ── ③ khổ vuông, TRANG TRÍ TRÀN Ô + thân rỗng ruột ──────────────────────────
#   Bốn ô là bốn hình mà `tests/test_slice_core.py` tả bằng lời.

def square_decor():
    W = H = 1280
    COLS = ROWS = 2
    im = blank(W, H)
    d = ImageDraw.Draw(im)

    def at(i, box):
        r, c = divmod(i, COLS)
        ox, oy = c * 640, r * 640
        return (box[0] + ox, box[1] + oy, box[2] + ox, box[3] + oy)

    # ô 0 — viên thuốc 470×160 + holly hai đầu + tuyết mỏng trên
    d.rounded_rectangle(at(0, (85, 240, 554, 399)), radius=80, fill=(200, 60, 60, 255))
    for x0 in (25, 555):
        d.rectangle(at(0, (x0, 275, x0 + 59, 364)), fill=(40, 140, 60, 255))
    d.rectangle(at(0, (240, 232, 379, 239)), fill=(240, 250, 255, 255))
    # ô 1 — vòng RỖNG RUỘT + holly bốn góc
    d.ellipse(at(1, (120, 120, 519, 519)), outline=(90, 60, 200, 255), width=40)
    for x0, y0 in ((95, 95), (455, 95), (95, 455), (455, 455)):
        d.rectangle(at(1, (x0, y0, x0 + 69, y0 + 69)), fill=(40, 140, 60, 255))
    # ô 2 — khung popup rỗng + ruy băng nhô đỉnh
    d.rectangle(at(2, (260, 140, 359, 199)), fill=(220, 180, 60, 255))
    d.rectangle(at(2, (120, 180, 519, 479)), outline=(80, 80, 120, 255), width=12)
    # ô 3 — thanh 6,7:1 + mũ tuyết phủ cả cạnh + quầng sáng mềm tràn ra ngoài
    d.rectangle(at(3, (20, 250, 619, 400)), fill=(255, 220, 120, 40))
    d.rectangle(at(3, (52, 265, 587, 279)), fill=(240, 250, 255, 255))
    d.rounded_rectangle(at(3, (52, 280, 587, 359)), radius=36, fill=(60, 160, 90, 255))

    comps = [comp("01-vien-thuoc", w=0.75, h=0.28, out=(470, 160)),
             comp("02-vong", w=0.7, h=0.7, out=(400, 400), decor=True),
             comp("03-popup", w=0.65, h=0.5, out=(400, 300)),
             comp("04-thanh", w=0.85, h=0.14, out=(536, 80), draw_scale=1.0)]
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "vuong", "grid": {"cols": COLS, "rows": ROWS},
                          "canvas": "square", "components": comps}]}
    return styles, {"kit-vuong": im}


# ── ④ FULL-BLEED: tranh phủ kín, mép model CHỪA răng cưa ────────────────────

def full_bleed():
    W, H = 384, 256
    im = Image.new("RGBA", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4, 255)
    mid = W // 2
    for y in range(H):
        for x in range(mid - 6 - (y % 3), mid + 6 + (y % 3)):
            px[x, y] = TRONG
    for y in range(H):
        edge = 8 + (y % 4)
        for x in range(edge):
            px[x, y] = TRONG
        px[edge, y] = (30 + y // 2, 60 + (edge * 7) % 50, 20 + y // 4, 128)
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "nen", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("25-bg-home", shape="full"),
                              comp("26-bg-play", shape="full")]}]}
    return styles, {"kit-nen": im}


# ── ⑤ MÀN SƯƠNG α=1..3 + ô toàn sương ───────────────────────────────────────

def alpha_haze():
    W, H = 240, 160
    RGB = (200, 100, 50)
    im = blank(W, H)
    px = im.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = RGB + (1 + (x + y) % 3,)
    for y in range(40, 110):
        for x in range(30, 80):
            px[x, y] = RGB + (255,)
    px[40, 50] = RGB + (90,)
    px[10, 20] = RGB + (4,)
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "ui", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-o"), comp("02-o")]}]}
    return styles, {"kit-ui": im}


# ── ⑥ DẢI ALPHA ĐẦY ĐỦ: ruột bán trong suốt bao kín bởi viền đục ───────────

def alpha_levels():
    W, H, COLS = 240, 160, 2
    RGB = (200, 100, 50)
    ALPHAS = [255, 250, 242, 239, 230, 200, 180, 128, 100, 93, 86, 64, 32, 8, 1]
    im = blank(W, H)
    px = im.load()
    cw = W // COLS
    for c in range(COLS):
        x0, y0, x1, y1 = c * cw + 20, 20, c * cw + cw - 20, H - 20
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = RGB + (255,)
        for i, a in enumerate(ALPHAS):
            px[x0 + 8 + (i % 5) * 8, y0 + 8 + (i // 5) * 8] = RGB + (a,)
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "ui", "grid": {"cols": COLS, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-o", out=(80, 100)), comp("02-o")]}]}
    return styles, {"kit-ui": im}


# ── ⑦ THÂN KÍNH α=64 có viền đục + holly hai đầu ────────────────────────────

def glass_body():
    W = H = 640
    im = blank(W, H)
    d = ImageDraw.Draw(im)
    d.rectangle((110, 250, 529, 389), fill=(120, 200, 255, 64))
    d.rectangle((110, 250, 529, 389), outline=(255, 255, 255, 255), width=4)
    for x0 in (60, 530):
        d.rectangle((x0, 275, x0 + 49, 364), fill=(40, 140, 60, 255))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "kinh", "grid": {"cols": 1, "rows": 1},
                          "canvas": "square", "components": [
                              comp("01-kinh", w=0.7, h=0.25, out=(420, 140))]}]}
    return styles, {"kit-kinh": im}


# ── ⑧ TẤM KHÔNG CÓ KÊNH ALPHA (mode rgb) ────────────────────────────────────

def rgb_sheet():
    W, H = 384, 256
    im = Image.new("RGB", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = (10 + x // 3, 40 + y // 2, 90)
    d = ImageDraw.Draw(im)
    d.rectangle((60, 60, 130, 190), fill=(255, 0, 0))
    d.rectangle((250, 60, 320, 190), fill=(0, 255, 0))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "duc", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-o"), comp("02-o")]}]}
    return styles, {"kit-duc": im}


# ── ⑨ CÓ KÊNH ALPHA NHƯNG KHÔNG CHỖ NÀO TRONG SUỐT ⇒ vẫn là "rgb" ──────────

def opaque_alpha():
    W, H = 384, 256
    im = Image.new("RGBA", (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = (10 + x // 3, 40 + y // 2, 90, 250 if (x + y) % 5 else 255)
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "duc", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-o"), comp("02-o")]}]}
    return styles, {"kit-duc": im}


# ── ⑩ Ô TRỐNG HOÀN TOÀN ─────────────────────────────────────────────────────

def empty_cells():
    im = blank(384, 256)
    d = ImageDraw.Draw(im)
    d.rectangle((40, 60, 140, 190), fill=(200, 60, 60, 255))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "ui", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-co"), comp("02-trong")]}]}
    return styles, {"kit-ui": im}


# ── ⑪ SAI KHỔ: khai ngang mà ảnh dọc ⇒ bỏ qua cả tấm ───────────────────────

def wrong_orientation():
    im = blank(256, 384)
    ImageDraw.Draw(im).rectangle((40, 60, 200, 300), fill=(200, 60, 60, 255))
    styles = {"styles": [{"id": "kit", "vi": "Kit"}],
              "sheets": [{"id": "ui", "grid": {"cols": 2, "rows": 1},
                          "canvas": "landscape", "components": [
                              comp("01-o"), comp("02-o")]}]}
    return styles, {"kit-ui": im}


# ── ⑫ CẮT LŨY TIẾN: hai tấm, ba lượt argv ───────────────────────────────────

def incremental():
    nen = Image.new("RGBA", (240, 160))
    px = nen.load()
    for y in range(160):
        for x in range(240):
            px[x, y] = (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4, 255)
    for y in range(160):
        for x in range(114 - (y % 3), 126 + (y % 3)):
            px[x, y] = TRONG
    ui = blank(180, 120)
    ImageDraw.Draw(ui).rectangle((38, 30, 142, 90), fill=(200, 40, 40, 255))
    styles = {"styles": [{"id": "v1", "vi": "V1"}],
              "sheets": [
                  {"id": "nen", "grid": {"cols": 2, "rows": 1}, "canvas": "landscape",
                   "components": [comp("25-bg-home", shape="full"), comp("26-bg-play", shape="full")]},
                  {"id": "ui", "grid": {"cols": 1, "rows": 1}, "canvas": "landscape",
                   "components": [comp("01-btn", out=(120, 52), draw_scale=2.5)]},
              ]}
    return styles, {"v1-nen": nen, "v1-ui": ui}


CASES = [
    ("solid-landscape", solid_landscape, [[]], ("kit-ui",)),
    ("portrait-bottom-anchor", portrait_bottom, [[]], ("kit-doc",)),
    ("square-decor-overflow", square_decor, [[]], ("kit-vuong",)),
    ("full-bleed", full_bleed, [[]], ("kit-nen",)),
    ("alpha-haze", alpha_haze, [[]], ("kit-ui",)),
    ("alpha-levels", alpha_levels, [[]], ("kit-ui",)),
    ("glass-body", glass_body, [[]], ("kit-kinh",)),
    ("rgb-no-alpha", rgb_sheet, [[]], ("kit-duc",)),
    ("opaque-alpha", opaque_alpha, [[]], ("kit-duc",)),
    ("empty-cell", empty_cells, [[]], ("kit-ui",)),
    ("wrong-orientation", wrong_orientation, [[]], ()),
    ("incremental-merge", incremental,
     [["v1", "--sheet=nen"], ["v1", "--sheet=ui"], ["v1"]], ("v1-ui",)),
]


def main():
    root = sys.argv[1]
    os.makedirs(root, exist_ok=True)
    print("dựng ca tổng hợp:")
    for name, fn, steps, jobs in CASES:
        styles, images = fn()
        case(root, name, styles, images, steps, jobs)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
