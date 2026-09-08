"""VALIDATOR HÌNH HỌC ĐO THEO ALPHA, KHÔNG CÒN ĐI TÌM MÀU NỀN.

VÌ SAO FILE NÀY NGẮN ĐI MỘT NỬA
─────────────────────────────────────────────────────────────────────────────────
Bản cũ có hẳn một lớp ca (`MagentaSheetTest`, `KeyResolutionTest`) chỉ để canh việc
ĐOÁN MÀU NỀN: đọc tên/hex key từ `variant.bg`, đo màu viền ngoài vì model vẽ key
lệch tới ~50 level, chọn giữa "màu khai báo" và "màu đo được", rồi phân loại pixel
theo `spill`. Cả lớp đó sinh ra từ một sự cố thật — `bg` là chuỗi MÔ TẢ ("pure vivid
magenta #FF00FF") chứ không phải hex trần, nên bản trước nữa rơi về mặc định
`#00FF00`, MỌI pixel thành foreground, và 10/10 file `.geometry.json` vô giá trị
(research-glow-extraction §3.3).

Nền nay là alpha thật ⇒ "pixel này có phải nền không" là `alpha < ngưỡng`. Không
đoán, không đo viền, không có ca lệch trục. Nên phần test tương ứng cũng biến mất —
giữ lại chỉ là canh một cỗ máy không còn quay.

CÁI PHẢI CANH TIẾP, VÀ NÓ KHÔNG ĐỔI: validator vẫn phải phân biệt được **core** với
**decoration**, vẫn phải cho ô `shape:"empty"` đi qua, và vẫn phải bắt thân lệch.
Đó là lý do nó tồn tại, và ba chuyện đó không dính gì tới nền.
"""
import importlib.util, json, subprocess, sys, tempfile, unittest
from pathlib import Path
from PIL import Image, ImageDraw

TOOL = Path(__file__).parents[1] / "validate_output_geometry.py"

_spec = importlib.util.spec_from_file_location("validate_output_geometry", TOOL)
tool = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tool)

INK = (220, 20, 20, 255)
TRONG = (0, 0, 0, 0)


def contract(w=.5, h=.5, cols=1, rows=1, comps=None):
    return {"variants": [{"id": "main"}],
            "sheets": [{"id": "main", "grid": {"cols": cols, "rows": rows},
                        "components": comps or [{"file": "button",
                                                 "skel": {"shape": "rrect", "w": w, "h": h}}]}]}


def sheet(size, *boxes, fill=INK):
    """Sheet nền TRONG SUỐT + các khối mực đặc — hình dạng của mọi sheet mới."""
    im = Image.new("RGBA", size, TRONG)
    draw = ImageDraw.Draw(im)
    for box in boxes:
        draw.rectangle(box, fill=fill)
    return im


def run_tool(image, data):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td); ip = root / 'sheet.png'; cp = root / 'contract.json'
        image.save(ip); cp.write_text(json.dumps(data))
        p = subprocess.run([sys.executable, str(TOOL), '--image', str(ip),
                            '--contract', str(cp), '--job', 'main-main'],
                           capture_output=True, text=True)
        return p.returncode, json.loads(p.stdout)


class GeometryValidatorTest(unittest.TestCase):
    def run_case(self, box):
        return run_tool(sheet((200, 100), box), contract())

    def test_than_dung_tam_thi_qua(self):
        code, out = self.run_case((50, 25, 150, 75))
        self.assertEqual(code, 0)
        self.assertTrue(out['ok'])

    def test_than_lech_thi_doi_sinh_lai(self):
        code, out = self.run_case((0, 0, 80, 40))
        self.assertEqual(code, 2)
        self.assertFalse(out['ok'])
        self.assertEqual(out['cells'][0]['status'], 'regenerate')


class AlphaDoDacTest(unittest.TestCase):
    """Phép đo phải KHỚP TỪNG PIXEL — đây là thứ bản đoán-màu không bao giờ đạt."""

    def test_bbox_dung_bang_khoi_muc_khong_hon_khong_kem(self):
        im = sheet((400, 200), (100, 50, 299, 149))          # inclusive ⇒ 200x100
        self.assertEqual(tool.bbox_foreground(im), (100, 50, 300, 150))

    def test_do_duoc_bbox_that_qua_CLI(self):
        code, out = run_tool(sheet((400, 200), (100, 50, 299, 149)), contract())
        self.assertEqual(out['bg_mode'], 'alpha')
        self.assertEqual(out['cells'][0]['actual'], [100, 50, 200, 100])
        self.assertEqual(code, 0)
        self.assertTrue(out['ok'])

    def test_bat_duoc_sai_so_that_khi_than_lech_va_nho(self):
        code, out = run_tool(sheet((400, 200), (40, 20, 189, 119)), contract())
        cell = out['cells'][0]
        self.assertEqual(cell['actual'], [40, 20, 150, 100])
        self.assertEqual(cell['status'], 'regenerate')
        self.assertIn('position', cell['reasons'])
        self.assertIn('size', cell['reasons'])
        self.assertEqual(code, 2)

    def test_mep_khu_rang_cua_van_tinh_la_muc(self):
        """Ngưỡng `ALPHA_FG` thấp có chủ ý: quầng glow tan tới α rất nhỏ vẫn là mực.
        Kéo ngưỡng lên cho 'sạch' là gặm mất rìa mềm rồi báo thân nhỏ hơn thật."""
        im = sheet((200, 100), (80, 40, 119, 59))
        px = im.load()
        for y in range(40, 60):
            px[79, y] = (220, 20, 20, 30)                    # rìa mờ, dưới nửa alpha
        self.assertEqual(tool.bbox_foreground(im)[0], 79, "rìa mờ bị coi là nền")


class CoreVaDecorationTest(unittest.TestCase):
    """LÕI = phần ĐỤC (α ≥ 128); decoration = phần mực nằm ngoài hộp lõi.

    ĐỔI LUẬT 07/09/2026, và phải nói thẳng cái mất: bản trước tách lõi khỏi trang
    trí bằng MÀU + morphology (erode → thành phần liên thông lớn nhất → projection,
    kèm một nhánh riêng cho màu tím). Phép đó đo sai 2,2 lần trên ô kính thật, nên
    nó đã bị bỏ ở cả `slice.py` lẫn đây. Hệ quả: trang trí ĐỤC không còn tách được
    khỏi thân — nó nằm chung hộp lõi. Chỉ phần MỀM (quầng sáng, rìa tan) mới ra
    ngoài. Đổi lại: một phép duy nhất, không có chỗ nào để đoán sai, và con số ở
    đây bằng đúng con số `slice.py` ghi vào `manifest.safe`.
    """

    def test_quang_MEM_khong_keo_loi_phinh_ra(self):
        """Thân đục 160x80, quầng α=60 phủ rộng: lõi bám thân, quầng thành decoration."""
        im = Image.new("RGBA", (300, 220), TRONG)
        draw = ImageDraw.Draw(im)
        draw.rectangle((20, 20, 279, 199), fill=(255, 200, 90, 60))   # quầng mềm
        draw.rectangle((70, 70, 229, 149), fill=INK)                  # thân đục
        code, out = run_tool(im, contract(w=160 / 300, h=80 / 220))
        cell = out['cells'][0]
        self.assertEqual(cell['core'], [70, 70, 230, 150])
        self.assertEqual(cell['silhouette'], [20, 20, 280, 200])
        self.assertEqual(cell['decoration'], [20, 20, 280, 200])
        self.assertEqual(cell['actual'], [70, 70, 160, 80])
        self.assertEqual(cell['deviation']['maxEdgePx'], 0)
        self.assertEqual(cell['status'], 'ok')
        self.assertEqual(code, 0)

    def test_khong_co_gi_ngoai_loi_thi_decoration_la_None(self):
        im = sheet((300, 220), (70, 70, 229, 149))
        _code, out = run_tool(im, contract(w=160 / 300, h=80 / 220))
        cell = out['cells'][0]
        self.assertEqual(cell['core'], [70, 70, 230, 150])
        self.assertIsNone(cell['decoration'])

    def test_trang_tri_DUC_nay_nam_chung_hop_loi_va_ca_nay_ghi_lai_dieu_do(self):
        """Ca chống-bất-ngờ: ai đọc `core` phải biết nó KHÔNG còn là "mặt chức năng".

        Một cái tua đục thò ra khỏi thân sẽ kéo hộp lõi theo, và vì thân lệch tâm
        so với ô nên tấm bị đòi sinh lại. Đó là hành vi ĐÚNG của luật mới, không
        phải hồi quy — và nó cũng là hành vi mà `slice.py` đang ghi vào manifest.
        """
        im = sheet((300, 220), (70, 70, 229, 149), (40, 130, 99, 189))
        code, out = run_tool(im, contract(w=160 / 300, h=80 / 220))
        cell = out['cells'][0]
        self.assertEqual(cell['core'], [40, 70, 230, 190])
        self.assertIsNone(cell['decoration'])
        self.assertEqual(code, 2)
        self.assertIn('position', cell['reasons'])

    def test_o_trong_co_y_khong_bi_tinh_la_can_tao_lai(self):
        data = contract(cols=2, rows=1, comps=[
            {"file": "button", "skel": {"shape": "rrect", "w": .5, "h": .5}},
            {"file": "_empty-1", "skel": {"shape": "empty"}}])
        code, out = run_tool(sheet((400, 200), (50, 50, 149, 149)), data)
        self.assertEqual([c['status'] for c in out['cells']], ['ok', 'empty'])
        self.assertTrue(out['ok'])
        self.assertEqual(code, 0)


if __name__ == '__main__':
    unittest.main()
