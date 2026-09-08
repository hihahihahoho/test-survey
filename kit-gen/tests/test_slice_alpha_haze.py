"""MÀN SƯƠNG CỦA MODEL KHÔNG ĐƯỢC KÉO HỘP CẮT PHÌNH RA CẢ Ô.

╔══ BỆNH, ĐO TRÊN DỰ ÁN THẬT (`test-e0d4`, tấm `chinh-ui`, raw 1254²) ══════════╗
║ Nền "trong suốt" model trả về KHÔNG phải α=0. Histogram alpha cả tấm:         ║
║     α=0: 1.137.428 px  ·  α=1: 64.934 px  ·  α=2: 14.256  ·  α=3: 8.989       ║
║     α=4: 6.898  ·  …  ·  α=255: 127                                          ║
║ 64.934 pixel ở α=1 rải đều CẢ Ô — một màn sương 0,4% opacity. `alpha_bbox`    ║
║ ngưỡng 1 vì thế trả về gần nguyên ô, và `tight/01-button.png` ra một ảnh      ║
║ VUÔNG 600×627 thay vì ôm sát cái nút. Chủ sản phẩm dán sang Figma và nói      ║
║ đúng triệu chứng: *"ảnh thì vuông (đáng nhẽ phải crop sát)"*.                 ║
║                                                                              ║
║ bbox ô `01-button` theo từng ngưỡng (ô 627²) — hộp ĐỨNG YÊN từ 4 trở lên:     ║
║     ≥1 → 27,0–626,626   ≥2 → 33,23–626,626   ≥3 → 34,209–625,626              ║
║     ≥4 → 34,210–624,626   ≥8 → 35,211–623,626                                ║
╚══════════════════════════════════════════════════════════════════════════════╝

`CONTENT_ALPHA = 4` là SÀN LƯỢNG TỬ, KHÔNG PHẢI TÁCH NỀN — và ca cuối của file
này là thứ giữ ranh giới đó: không một byte pixel nào được đổi vì hằng ấy, nó chỉ
quyết định hộp cắt đặt ở đâu.

Ca chạy `slice.py` THẬT trong sandbox (không mock), rồi đọc `kits/manifest.json`
và cỡ file `tight/` như web sẽ đọc.
"""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from slicelib import ROOT

STYLE, SHEET = "kit", "ui"
W, H = 240, 160                       # khổ 3:2 — `orientation_error` bỏ qua
COLS, ROWS = 2, 1
CW = W // COLS                        # ô 120×160
RGB = (200, 100, 50)

# Ô ①: thân đặc + một pixel α=4 lẻ loi ngoài thân. Hai con số này khoá HAI PHÍA của
# hằng: α=3 (sương) phải nằm NGOÀI hộp, α=4 phải nằm TRONG.
BODY = (30, 40, 80, 110)              # trái, trên, phải, dưới — toạ độ TRONG ô
FAINT = (10, 20)                      # pixel α=4: mép trên-trái của hộp mong đợi
HOLE = (40, 50)                       # ruột bán trong suốt nằm GIỮA thân
HOLE_ALPHA = 90
WANT_AT = [FAINT[0], FAINT[1]]        # [10, 20]
WANT_SIZE = [BODY[2] - FAINT[0], BODY[3] - FAINT[1]]   # [70, 90]


def haze(x, y):
    """Sương phủ CẢ ô, đúng dải α=1..3 mà model thật rải ra."""
    return 1 + (x + y) % 3


def make_sheet(path):
    """Ô ⓪ = sương + thân đặc; ô ① = TOÀN sương, không một pixel nào α ≥ 4."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    for y in range(H):
        for x in range(W):
            px[x, y] = RGB + (haze(x, y),)
    x0, y0, x1, y1 = BODY
    for y in range(y0, y1):
        for x in range(x0, x1):
            px[x, y] = RGB + (255,)
    px[HOLE[0], HOLE[1]] = RGB + (HOLE_ALPHA,)
    px[FAINT[0], FAINT[1]] = RGB + (4,)
    img.save(path)


def styles_json():
    comps = [{"file": f"0{i + 1}-o", "vi": "o", "spec": "o",
              "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}} for i in range(COLS * ROWS)]
    return {"styles": [{"id": STYLE, "vi": STYLE}],
            "sheets": [{"id": SHEET, "grid": {"cols": COLS, "rows": ROWS},
                        "orient": "landscape", "components": comps}]}


class HopCatKhongOmSuongTest(unittest.TestCase):
    def setUp(self):
        self.box = Path(tempfile.mkdtemp(prefix="kitgen-slice-haze-"))
        self.addCleanup(shutil.rmtree, self.box, True)
        for f in ("slice.py", "geometry.py"):
            shutil.copy(ROOT / f, self.box / f)
        (self.box / "raw").mkdir()
        make_sheet(self.box / "raw" / f"{STYLE}-{SHEET}.png")
        (self.box / "styles.json").write_text(json.dumps(styles_json()), encoding="utf-8")
        p = subprocess.run([sys.executable, "slice.py"], cwd=self.box,
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(p.returncode, 0, f"slice.py chết:\n{p.stdout}\n{p.stderr}")
        self.out = p.stdout
        self.manifest = json.loads((self.box / "kits" / "manifest.json").read_text(encoding="utf-8"))
        self.entry = self.manifest["styles"][STYLE]
        self.raw = Image.open(self.box / "raw" / f"{STYLE}-{SHEET}.png").convert("RGBA")

    def asset(self, name):
        return next(a for a in self.entry["assets"] if a["file"] == f"{name}.png")

    # ── ① Ô có thân: hộp phải ôm THÂN, không ôm sương ────────────────────────

    def test_content_la_hop_cua_THAN_chu_khong_phai_ca_o(self):
        a = self.asset("01-o")
        self.assertEqual(a["content_at"], WANT_AT,
                         "hộp nội dung đang bắt đầu ở mép ô ⇒ sương lại kéo nó phình ra")
        self.assertEqual(a["content"], WANT_SIZE)
        self.assertNotEqual(a["content"], [CW, H], "hộp bằng cả ô = đúng cái bệnh đang chữa")

    def test_tight_ra_dung_co_than_chu_khong_phai_anh_vuong_ca_o(self):
        tight = Image.open(self.box / "kits" / STYLE / "tight" / "01-o.png")
        self.assertEqual(list(tight.size), WANT_SIZE)

    def test_pixel_ben_trong_crop_KHONG_bi_doi_mot_byte(self):
        """RANH GIỚI của cả lượt sửa: `CONTENT_ALPHA` dời HỘP, không sửa PIXEL.

        Kể cả pixel sương lọt vào trong hộp cũng phải đi ra nguyên vẹn — nếu ai đó
        biến hằng này thành một phép "làm sạch nền" (α < 4 ⇒ 0) thì ca này đỏ.
        """
        tight = Image.open(self.box / "kits" / STYLE / "tight" / "01-o.png").convert("RGBA")
        vung = self.raw.crop((WANT_AT[0], WANT_AT[1],
                              WANT_AT[0] + WANT_SIZE[0], WANT_AT[1] + WANT_SIZE[1]))
        got, want = tight.load(), vung.load()
        for y in range(tight.size[1]):
            for x in range(tight.size[0]):
                g, w = got[x, y], want[x, y]
                muon = w[:3] + (255 if w[3] >= 240 else w[3],)   # chỉ `snap_solid_alpha`
                self.assertEqual(g, muon, f"({x},{y}) trong crop bị đổi: {w} → {g}")

    def test_pixel_alpha_4_nam_TRONG_hop_va_alpha_3_nam_NGOAI(self):
        """Hai phía của con số 4, phát biểu bằng chính hộp cắt."""
        a = self.asset("01-o")
        l, t = a["content_at"]
        r, b = l + a["content"][0], t + a["content"][1]
        self.assertTrue(l <= FAINT[0] < r and t <= FAINT[1] < b,
                        "pixel α=4 bị bỏ ra ngoài ⇒ ngưỡng đã bị nâng quá tay")
        self.assertGreater(l, 0, "mép trái vẫn ở 0 ⇒ sương α≤3 vẫn được tính là nội dung")
        self.assertGreater(t, 0)

    def test_ruot_ban_trong_suot_giu_nguyen_alpha(self):
        """Sàn lượng tử không được đụng tới ruột kính (α≈64–128) nằm giữa thân."""
        tight = Image.open(self.box / "kits" / STYLE / "tight" / "01-o.png").convert("RGBA")
        px = tight.load()[HOLE[0] - WANT_AT[0], HOLE[1] - WANT_AT[1]]
        self.assertEqual(px, RGB + (HOLE_ALPHA,))

    # ── ② Ô TOÀN SƯƠNG: vẫn cắt, vẫn nói ra ──────────────────────────────────

    def test_o_toan_suong_VAN_duoc_cat_va_KHONG_bi_goi_la_trong(self):
        """QUYẾT ĐỊNH: "trống" = không một pixel nào có alpha, KHÔNG phải "mờ hơn
        ngưỡng của tôi".

        Từ chối cắt một ô người dùng đã trả tiền gen là giữ nó làm con tin — và ô mờ
        toàn phần là dấu hiệu của một lượt vẽ hỏng, phải NHÌN THẤY được thì mới sửa
        được. Nên đường lùi `or alpha_bbox(canvas)`: hộp quay về ngưỡng 1, file vẫn ra,
        và một dòng cảnh báo nói thẳng ô này gần như trống.
        """
        self.assertNotIn("02-o", self.entry.get("empty_cells", []))
        a = self.asset("02-o")
        self.assertEqual(a["content"], [CW, H], "ô toàn sương ⇒ hộp lùi về bbox sương = cả ô")
        self.assertEqual(a["content_at"], [0, 0])
        self.assertEqual(list(Image.open(self.box / "kits" / STYLE / "tight" / "02-o.png").size),
                         [CW, H])

    def test_o_toan_suong_duoc_NOI_RA_chu_khong_nuot(self):
        self.assertIn("02-o", self.out)
        self.assertIn("chỉ là sương mờ", self.out,
                      f"không có dòng cảnh báo nào cho ô toàn sương:\n{self.out}")


if __name__ == "__main__":
    unittest.main()
