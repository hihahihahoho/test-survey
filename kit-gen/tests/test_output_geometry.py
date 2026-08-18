import importlib.util, json, subprocess, sys, tempfile, unittest
from pathlib import Path
from PIL import Image, ImageDraw

TOOL = Path(__file__).parents[1] / "tools" / "validate_output_geometry.py"

_spec = importlib.util.spec_from_file_location("validate_output_geometry", TOOL)
tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tool)

# Màu key ĐO ĐƯỢC trên sheet magenta thật (manifest BlindTest-B2), không phải
# #FF00FF: model vẽ lệch tới ~50 level. Đây chính là ca làm chết validator cũ.
MAGENTA_DRIFT = (238, 15, 211)


def contract(bg, w=.5, h=.5, cols=1, rows=1, comps=None):
    return {"variants": [{"id": "main", "bg": bg}],
            "sheets": [{"id": "main", "grid": {"cols": cols, "rows": rows},
                        "components": comps or [{"file": "button",
                                                 "skel": {"shape": "rrect", "w": w, "h": h}}]}]}


def run_tool(image, data):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td); ip = root / 'sheet.png'; cp = root / 'contract.json'
        image.save(ip); cp.write_text(json.dumps(data))
        p = subprocess.run([sys.executable, str(TOOL), '--image', str(ip),
                            '--contract', str(cp), '--job', 'main-main'],
                           capture_output=True, text=True)
        return p.returncode, json.loads(p.stdout)


class GeometryValidatorTest(unittest.TestCase):
    """Bộ cũ: sheet key XANH LÁ, bg khai báo đúng dạng hex."""

    def run_case(self, box):
        im = Image.new('RGB', (200, 100), (0, 255, 0))
        ImageDraw.Draw(im).rectangle(box, fill=(220, 20, 20))
        return run_tool(im, contract("#00FF00"))

    def test_centered_body_passes(self):
        code, out = self.run_case((50, 25, 150, 75)); self.assertEqual(code, 0); self.assertTrue(out['ok'])

    def test_shifted_body_requires_regeneration(self):
        code, out = self.run_case((0, 0, 80, 40)); self.assertEqual(code, 2); self.assertFalse(out['ok']); self.assertEqual(out['cells'][0]['status'], 'regenerate')


class MagentaSheetTest(unittest.TestCase):
    """Ca đã làm 10/10 file `.geometry.json` vô giá trị.

    `bg` trong contract là chuỗi MÔ TẢ ("pure vivid magenta #FF00FF"), không phải
    hex trần, nên `rgb()` bản cũ rơi về mặc định `#00FF00`; cộng thêm key thật
    lệch màu ⇒ MỌI pixel tính là foreground ⇒ `actual` = nguyên ô.
    """

    def sheet(self, box, size=(400, 200), key=MAGENTA_DRIFT):
        im = Image.new('RGB', size, key)
        ImageDraw.Draw(im).rectangle(box, fill=(30, 180, 90))   # thân xanh lá
        return im

    def test_do_duoc_bbox_that_tren_sheet_magenta(self):
        box = (100, 50, 299, 149)                                # đúng tâm, 200x100
        code, out = run_tool(self.sheet(box), contract("pure vivid magenta #FF00FF"))
        self.assertEqual(out['key_mode'], 'spill')
        self.assertEqual(out['cells'][0]['actual'], [100, 50, 200, 100])
        self.assertEqual(code, 0)
        self.assertTrue(out['ok'])

    def test_bat_duoc_sai_so_that_khi_than_lech_va_nho(self):
        box = (40, 20, 189, 119)                                 # lệch + nhỏ hơn khung
        code, out = run_tool(self.sheet(box), contract("pure vivid magenta #FF00FF"))
        cell = out['cells'][0]
        self.assertEqual(cell['actual'], [40, 20, 150, 100])
        self.assertEqual(cell['status'], 'regenerate')
        self.assertIn('position', cell['reasons'])
        self.assertIn('size', cell['reasons'])
        self.assertEqual(code, 2)

    def test_ban_cu_do_ra_nguyen_o_tren_cung_anh(self):
        """Bằng chứng hồi quy: key xanh lá + khoảng cách RGB ⇒ actual = nguyên ô."""
        im = self.sheet((100, 50, 299, 149))
        old = tool.bbox_foreground(im, (0, 255, 0), axis=None, threshold=42)
        self.assertEqual(old, (0, 0, im.width, im.height),
                         "ca hỏng không tái lập được — test mất ý nghĩa")
        new = tool.bbox_foreground(im, *tool.resolve_key(im, tool.parse_key("pure vivid magenta #FF00FF")))
        self.assertEqual(new, (100, 50, 300, 150))  # bbox nửa mở: 200x100 px

    def test_chiu_duoc_key_lech_mau_va_nhieu(self):
        """Key model vẽ ra lệch dần: vẫn phải đo đúng thân, không nuốt cả ô."""
        for key in [(255, 0, 255), (238, 15, 211), (243, 9, 219), (250, 60, 240)]:
            with self.subTest(key=key):
                im = self.sheet((100, 50, 299, 149), key=key)
                _, out = run_tool(im, contract("pure vivid magenta #FF00FF"))
                self.assertEqual(out['key_mode'], 'spill')
                self.assertEqual(out['cells'][0]['actual'], [100, 50, 200, 100])

    def test_o_trong_co_y_khong_bi_tinh_la_can_tao_lai(self):
        data = contract("pure vivid magenta #FF00FF", cols=2, rows=1, comps=[
            {"file": "button", "skel": {"shape": "rrect", "w": .5, "h": .5}},
            {"file": "_empty-1", "skel": {"shape": "empty"}}])
        im = Image.new('RGB', (400, 200), MAGENTA_DRIFT)
        ImageDraw.Draw(im).rectangle((50, 50, 149, 149), fill=(30, 180, 90))
        code, out = run_tool(im, data)
        self.assertEqual([c['status'] for c in out['cells']], ['ok', 'empty'])
        self.assertTrue(out['ok'])
        self.assertEqual(code, 0)

    def test_validator_cham_core_khong_nuot_decoration(self):
        im = Image.new('RGB', (300, 220), (0, 255, 0))
        draw = ImageDraw.Draw(im)
        draw.rectangle((70, 70, 229, 149), fill=(220, 20, 20))
        # Decoration liên thông, tràn cả trái/phải/dưới.
        draw.rectangle((40, 130, 99, 189), fill=(220, 20, 20))
        draw.rectangle((180, 145, 199, 214), fill=(220, 20, 20))
        data = contract('#00FF00', w=160 / 300, h=80 / 220)
        code, out = run_tool(im, data)
        cell = out['cells'][0]
        self.assertEqual(code, 0)
        self.assertEqual(cell['actual'], [70, 70, 160, 80])
        self.assertEqual(cell['core'], [70, 70, 230, 150])
        self.assertEqual(cell['decoration'], [40, 130, 200, 215])
        self.assertEqual(cell['deviation']['maxEdgePx'], 0)
        self.assertEqual(cell['status'], 'ok')

    def test_validator_ghi_ca_decoration_roi(self):
        im = Image.new('RGB', (300, 220), (0, 255, 0))
        draw = ImageDraw.Draw(im)
        draw.rectangle((70, 70, 229, 149), fill=(220, 20, 20))
        draw.ellipse((40, 30, 55, 45), fill=(220, 20, 20))
        data = contract('#00FF00', w=160 / 300, h=80 / 220)
        code, out = run_tool(im, data)
        cell = out['cells'][0]
        self.assertEqual(code, 0)
        self.assertEqual(cell['core'], [70, 70, 230, 150])
        self.assertEqual(cell['silhouette'], [40, 30, 230, 150])
        self.assertEqual(cell['decoration'], [40, 30, 56, 46])
        self.assertEqual(cell['status'], 'ok')


class KeyResolutionTest(unittest.TestCase):
    def test_doc_duoc_ca_4_ten_key(self):
        for name, rgb in tool.KEY_COLORS.items():
            self.assertEqual(tool.parse_key(f"one flat solid {name} background"), rgb)

    def test_doc_duoc_hex_tran(self):
        self.assertEqual(tool.parse_key("#00FFFF"), (0, 255, 255))
        self.assertEqual(tool.parse_key("00ff00"), (0, 255, 0))
        self.assertIsNone(tool.parse_key(""))
        self.assertIsNone(tool.parse_key("một màu nền lạ"))

    def test_ten_thang_hex_khi_ca_hai_cung_xuat_hien(self):
        self.assertEqual(tool.parse_key("pure vivid magenta #FF00FF"), (255, 0, 255))

    def test_khong_ro_key_thi_lui_ve_khoang_cach_mau(self):
        im = Image.new('RGB', (60, 60), (130, 128, 126))          # nền xám, không phải key
        ImageDraw.Draw(im).rectangle((10, 10, 40, 40), fill=(10, 200, 10))  # inclusive
        key, axis = tool.resolve_key(im, None)
        self.assertIsNone(axis)
        self.assertEqual(tool.bbox_foreground(im, key, axis), (10, 10, 41, 41))


if __name__ == '__main__':
    unittest.main()
