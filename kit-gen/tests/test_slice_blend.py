"""Backlog P1-3 — asset glow SHIP KÈM BLEND MODE, không bake vào alpha.

Ánh sáng là phép CỘNG; PNG straight-alpha dán kiểu `source-over` là phép TRỘN, nên
dán thường thì quầng ngoài mềm — thứ làm glow ra glow — bị nền nuốt. Research đã đo
(docs/research-glow-extraction-2026-08.md): RGBA(α = max(RGB)) dán bằng
`plus-lighter` cho ra ảnh GIỐNG HỆT TỪNG BIT với nền-đen + additive. Quyết định:
KHÔNG hy sinh alpha, mà ghi kèm chỉ dẫn `blend` vào manifest để nơi vẽ (webapp
preview, Figma, engine game) đặt Screen / Linear Dodge (Add).

Hai tầng ca ở đây:
 ① `asset_blend()` thuần — chỉ `matte:"glow"` mới có blend; `matte:"glass"` (ruột
   kính, vẫn là vật liệu TRỘN chứ không phát sáng) và ô thường KHÔNG có khoá này.
 ② `slice.py` chạy THẬT trong một sandbox (bản sao script + styles.json + raw/ tự
   dựng) rồi soi `kits/manifest.json`. Khoá cả ĐƯỜNG MERGE của re-slice hẹp: cắt
   lại một sheet không được làm rơi `blend` của các sheet giữ nguyên — đúng lớp lỗi
   mà khối merge cuối `slice.py` sinh ra để chặn.

Sheet dựng ở đây có ALPHA THẬT nên `slice.py` đi nhánh `alpha_sheet` (không cần
pymatting/ViTMatte, không tải model): việc đang đo là KHOÁ MANIFEST, không phải
chất lượng tách nền — chất lượng đã có test_slice_glow.py lo.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

from slicelib import ROOT, load

slice_mod = load()

# KHỔ TẤM PHẢI LÀ 3:2 — `orientation_error` (sự cố 21/08/2026) bỏ qua mọi sheet
# lệch quá 10% khỏi tỉ lệ đã khai. Ô ở đây do đó KHÔNG vuông; không sao, ca này đo
# manifest chứ không đo hình học.
SHEET_W, SHEET_H = 240, 160
CELL = 80                       # chỉ còn dùng cho lề vẽ khối bên trong ô
STYLE_ID = "kit"


def skel(matte=None, **extra):
    s = {"shape": "rrect", "w": 0.5, "h": 0.5}
    if matte:
        s["matte"] = matte
    s.update(extra)
    return s


def styles_json(sheet_ids=("main", "tall")):
    """styles.json tối thiểu. `sheet_ids` hẹp lại = đúng thứ engine gửi khi người
    dùng bấm "Lưu và tạo lại" cho MỘT nhóm (contractToStylesV1 + materializeStyles)."""
    sheets = [
        {"id": "main", "grid": {"cols": 2, "rows": 1}, "components": [
            {"file": "01-btn", "skel": skel()},
            {"file": "02-fx-burst", "skel": skel("glow")},
        ]},
        {"id": "tall", "grid": {"cols": 2, "rows": 1}, "components": [
            {"file": "03-board-panel", "skel": skel("glass")},
            {"file": "04-fx-sparkle", "skel": skel("glow")},
        ]},
    ]
    return {
        "sheets": [sh for sh in sheets if sh["id"] in sheet_ids],
        "styles": [{"id": STYLE_ID, "bg": "pure vivid magenta #FF00FF"}],
    }


def raw_sheet(path, cols=2, rows=1):
    """Sheet RGBA khổ 3:2: mỗi ô một khối đặc ở giữa, quanh là trong suốt thật."""
    img = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
    px = img.load()
    cw, ch = SHEET_W // cols, SHEET_H // rows
    for r in range(rows):
        for c in range(cols):
            for y in range(r * ch + 20, r * ch + ch - 20):
                for x in range(c * cw + 20, c * cw + cw - 20):
                    px[x, y] = (240, 200, 80, 255)
    img.save(path)


def run_slice(box):
    """Chạy slice.py trong sandbox. Trả về entry manifest của style."""
    res = subprocess.run([sys.executable, "slice.py"], cwd=box,
                         capture_output=True, text=True)
    assert res.returncode == 0, f"slice.py hỏng:\n{res.stdout}\n{res.stderr}"
    with open(os.path.join(box, "kits", "manifest.json")) as f:
        return json.load(f)["styles"][STYLE_ID]


def blend_of(entry, file):
    a = next(a for a in entry["assets"] if a["file"] == f"{file}.png")
    return a.get("blend", "—")          # "—" = KHÔNG có khoá (khác với None)


class AssetBlendTest(unittest.TestCase):
    """① Bảng tra thuần: ai được blend, ai không."""

    def test_chi_matte_glow_moi_co_blend_screen(self):
        self.assertEqual(slice_mod.asset_blend({"matte": "glow"}), "screen")

    def test_matte_glass_va_o_thuong_khong_co_blend(self):
        for s in ({"matte": "glass"}, {"shape": "pill"}, {}, None):
            self.assertIsNone(slice_mod.asset_blend(s), s)


class ManifestBlendTest(unittest.TestCase):
    """② slice.py chạy thật → kits/manifest.json."""

    def setUp(self):
        self.box = tempfile.mkdtemp(prefix="kitgen-blend-")
        self.addCleanup(shutil.rmtree, self.box, True)
        shutil.copy(os.path.join(ROOT, "slice.py"), os.path.join(self.box, "slice.py"))
        # geometry.py đi CÙNG slice.py: nó `import geometry` để lấy bảng khổ canvas
        # + toạ độ ô/safe zone (dùng chung với khối python của gen.sh). Copy thiếu là
        # ModuleNotFoundError — đúng thứ sẽ xảy ra nếu ai quên nó trong ENGINE_FILES.
        shutil.copy(os.path.join(ROOT, "geometry.py"), os.path.join(self.box, "geometry.py"))
        os.makedirs(os.path.join(self.box, "raw"))
        for sid in ("main", "tall"):
            raw_sheet(os.path.join(self.box, "raw", f"{STYLE_ID}-{sid}.png"))
        self.write_styles()

    def write_styles(self, sheet_ids=("main", "tall")):
        with open(os.path.join(self.box, "styles.json"), "w") as f:
            json.dump(styles_json(sheet_ids), f)

    def manifest_path(self):
        return os.path.join(self.box, "kits", "manifest.json")

    def test_o_glow_co_blend_screen_o_khac_khong_co_khoa_nao(self):
        entry = run_slice(self.box)
        self.assertEqual(blend_of(entry, "02-fx-burst"), "screen")
        self.assertEqual(blend_of(entry, "04-fx-sparkle"), "screen")
        # Asset thường KHÔNG mang `"blend": "normal"` — người đọc manifest cũ
        # (figma-export, engine game) không phải biết thêm khoá nào.
        self.assertEqual(blend_of(entry, "01-btn"), "—")
        self.assertEqual(blend_of(entry, "03-board-panel"), "—")

    def test_re_slice_hep_khong_lam_roi_blend_cua_sheet_giu_nguyen(self):
        """Đường merge: cắt lại MỖI sheet `main`, sheet `tall` phải nguyên vẹn."""
        run_slice(self.box)
        self.write_styles(("main",))
        entry = run_slice(self.box)
        self.assertEqual(blend_of(entry, "02-fx-burst"), "screen", "sheet vừa cắt lại")
        self.assertEqual(blend_of(entry, "04-fx-sparkle"), "screen", "sheet giữ nguyên")
        self.assertEqual(blend_of(entry, "03-board-panel"), "—")

    def test_manifest_ban_cu_duoc_bu_blend_khi_cat_lai_mot_sheet(self):
        """Kit cắt bằng slice.py ĐỜI TRƯỚC (manifest chưa có khoá `blend`): lượt cắt
        sau bù cho các sheet giữ nguyên, vì styles.json vẫn khai `matte:"glow"`."""
        run_slice(self.box)
        with open(self.manifest_path()) as f:
            manifest = json.load(f)
        for a in manifest["styles"][STYLE_ID]["assets"]:
            a.pop("blend", None)                       # giả lập manifest đời cũ
        with open(self.manifest_path(), "w") as f:
            json.dump(manifest, f)
        # sheet `tall` còn trong styles.json nhưng KHÔNG có raw ⇒ bị bỏ qua, đi
        # đường giữ-nguyên; `main` cắt lại bình thường.
        os.remove(os.path.join(self.box, "raw", f"{STYLE_ID}-tall.png"))
        entry = run_slice(self.box)
        self.assertEqual(blend_of(entry, "04-fx-sparkle"), "screen")
        self.assertEqual(blend_of(entry, "03-board-panel"), "—")


if __name__ == "__main__":
    unittest.main()
