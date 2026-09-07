"""DAO CẮT KHÔNG ĐƯỢC GẶM RUỘT — hồi quy trực tiếp của ca 02-healthbar.

╔══ FILE NÀY THAY CHO BỘ CA "HẬU KỲ ALPHA" ĐỜI TRƯỚC ══════════════════════════╗
║ Bản cũ đo ba khâu hậu kỳ: `snap_to_safe` (nắn + resize về khung safe),        ║
║ `align_content_safe` (tịnh tiến lõi về tâm) và phép `paste(im, box, im)` bình ║
║ phương alpha. Cả ba khâu ĐÃ BỎ HẲN 07/09/2026 — slice.py nay chỉ crop theo    ║
║ toạ độ. Giữ những ca đó là canh một cỗ máy không còn quay.                    ║
║                                                                              ║
║ Thứ PHẢI canh tiếp, và nó là bài học đắt nhất của cả đợt: **ảnh cắt ra không  ║
║ được có một pixel nào alpha THẤP HƠN ảnh raw ở cùng toạ độ.** Đo trên dự án   ║
║ thật `test-e0d4`: ruột thanh máu kính model vẽ ở α≈86–93, bản cũ trả về α≈3–8 ║
║ — mask "nghiêm" (α≥240) + MaxFilter + GaussianBlur nhân vào alpha đã bóp mất  ║
║ ruột. Nhìn ra là "thanh máu bị thủng loang lổ".                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

Ca chạy `slice.py` THẬT trong sandbox (không mock), rồi so từng pixel ảnh cắt với
đúng vùng ô trong ảnh raw.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from slicelib import ROOT

STYLE, SHEET = "kit", "ui"
# Khổ 3:2 — `orientation_error` bỏ qua mọi sheet lệch quá 10% khỏi tỉ lệ đã khai.
W, H = 240, 160
COLS, ROWS = 2, 1

# Đúng dải alpha mà research đo, cộng dải KÍNH của contract thật (α≈64–128):
# 128 → 16 và 200 → 97 là hai con số của lỗi bình phương alpha; 86/93 là ruột
# thanh máu đo trên `test-e0d4`.
ALPHAS = [255, 250, 242, 239, 230, 200, 180, 128, 100, 93, 86, 64, 32, 8, 1]
RGB = (200, 100, 50)


def make_sheet(path):
    """Hai ô, mỗi ô một khối đặc BAO QUANH một ruột bán trong suốt.

    Ruột nằm GIỮA khối (bao kín bởi viền đục) — đúng hình dạng mà mọi cỗ máy tách
    nền đời cũ hiểu nhầm là "lỗ nền" và lấp/gặm.
    """
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = img.load()
    cw = W // COLS
    probes = []
    for c in range(COLS):
        x0, y0, x1, y1 = c * cw + 20, 20, c * cw + cw - 20, H - 20
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = RGB + (255,)
        for i, a in enumerate(ALPHAS):
            x, y = x0 + 8 + (i % 5) * 8, y0 + 8 + (i // 5) * 8
            px[x, y] = RGB + (a,)
            probes.append((c, x, y, a))
    img.save(path)
    return probes


def styles_json():
    comps = [{"file": f"0{i + 1}-o", "vi": "o", "spec": "o",
              "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}} for i in range(COLS * ROWS)]
    return {"styles": [{"id": STYLE, "vi": STYLE}],
            "sheets": [{"id": SHEET, "grid": {"cols": COLS, "rows": ROWS},
                        "orient": "landscape", "components": comps}]}


class CutDoesNotEatAlphaTest(unittest.TestCase):
    def setUp(self):
        self.box = Path(tempfile.mkdtemp(prefix="kitgen-slice-alpha-"))
        self.addCleanup(shutil.rmtree, self.box, True)
        for f in ("slice.py", "geometry.py"):
            shutil.copy(ROOT / f, self.box / f)
        (self.box / "raw").mkdir()
        self.probes = make_sheet(self.box / "raw" / f"{STYLE}-{SHEET}.png")
        (self.box / "styles.json").write_text(json.dumps(styles_json()), encoding="utf-8")
        p = subprocess.run([sys.executable, "slice.py"], cwd=self.box,
                           capture_output=True, text=True, timeout=300)
        self.assertEqual(p.returncode, 0, f"slice.py chết:\n{p.stdout}\n{p.stderr}")
        self.raw = Image.open(self.box / "raw" / f"{STYLE}-{SHEET}.png").convert("RGBA")
        self.cells = [Image.open(self.box / "kits" / STYLE / f"0{i + 1}-o.png").convert("RGBA")
                      for i in range(COLS * ROWS)]

    def test_ruot_ban_trong_suot_giu_nguyen_tung_muc_alpha(self):
        """Mỗi mức α trong ruột phải đi ra NGUYÊN VẸN (trừ dải ≥240 được nắn lên 255)."""
        cw = W // COLS
        for c, x, y, a in self.probes:
            got = self.cells[c].load()[x - c * cw, y]
            muon = 255 if a >= 240 else a
            self.assertEqual(got[3], muon,
                             f"ô {c} ({x},{y}): α {a} ra {got[3]} — ruột đang bị gặm")
            self.assertEqual(got[:3], RGB,
                             f"ô {c} ({x},{y}): RGB đổi ⇒ có un-mix/premultiply lén")

    def test_khong_mot_pixel_nao_bi_HA_alpha_so_voi_raw(self):
        """Lời hứa của cả bản viết lại, phát biểu bằng một câu đo được."""
        cw = W // COLS
        for c, cell in enumerate(self.cells):
            vung = self.raw.crop((c * cw, 0, (c + 1) * cw, H))
            self.assertEqual(cell.size, vung.size, "canvas phải bằng ĐÚNG một ô")
            a_cut = list(cell.getchannel("A").getdata())
            a_raw = list(vung.getchannel("A").getdata())
            ha = [(i, r, g) for i, (r, g) in enumerate(zip(a_raw, a_cut)) if g < r]
            self.assertEqual(ha[:5], [], f"ô {c}: {len(ha)} pixel bị hạ alpha")

    def test_mau_RGB_khong_doi_mot_byte_so_voi_raw(self):
        """Không key màu, không un-mix, không blend ⇒ ba kênh màu là bản sao."""
        cw = W // COLS
        for c, cell in enumerate(self.cells):
            vung = self.raw.crop((c * cw, 0, (c + 1) * cw, H))
            self.assertEqual(list(cell.convert("RGB").getdata()),
                             list(vung.convert("RGB").getdata()),
                             f"ô {c}: kênh màu bị sửa")


if __name__ == "__main__":
    unittest.main()
