"""Sheet TRỘN NỀN: ô `matte:"glow"` nền ĐEN nằm chung sheet với ô nền key.

╔══ BỆNH ĐÃ ĐO TRÊN DỰ ÁN THẬT, KHÔNG PHẢI GIẢ ĐỊNH ════════════════════════════╗
║ Dự án `hello-368a` của chủ sản phẩm (agent 2.1.24, key magenta #FF00FF):       ║
║                                                                                ║
║   sheet        lưới   ô glow   border_colors đo được          → đường đi        ║
║   dao-cu       3×3    1 (#0)   [(233,2,222), (1,0,0)]         → key_binary ✗    ║
║   ui           4×4    0        [(247,5,237)]                  → matte ✓         ║
║   popup-doc    2×1    0        [(250,5,231)]                  → matte ✓         ║
║                                                                                ║
║ `16-fx-burst` là ô `matte:"glow"`, và gen.sh vẽ ô glow trên **nền ĐEN** có chủ  ║
║ ý (ánh sáng là phép cộng). Ô đó chạm mép sheet ⇒ hơn 5% mẫu viền là màu đen ⇒   ║
║ `border_colors` trả HAI màu ⇒ `is_key_color` False ⇒ **cả sheet** rơi xuống     ║
║ `key_binary` — đường lùi cho nền nhạt/caro, KHÔNG có bước despill.              ║
║                                                                                ║
║ Hậu quả đo được trên 8 ô còn lại của `dao-cu` (ảnh đã cắt trong kit của user):  ║
║   đường lùi  : 22 304 px tím ĐỤC   → quầng magenta quanh hộp quà, mảnh ghép,    ║
║                                      phiếu thưởng, huy hiệu (ảnh chủ SP gửi)    ║
║   đường matte:      0 px tím đục                                                ║
║ Cùng một tấm raw, cùng một key. Khác đúng một ô đen ở góc.                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Ca ở đây tổng hợp lại đúng hình dạng đó (không kèm ảnh của user vào repo) và khoá
hai đầu: ô glow KHÔNG được kéo cả sheet xuống đường lùi, mà nền caro 2 màu thật thì
VẪN phải ra 2 màu — nếu không thì bản vá này chỉ đổi một bệnh lấy một bệnh khác.
"""
import unittest

from PIL import Image, ImageDraw

from slicelib import load

slice_mod = load()

KEY = (255, 0, 255)
W, H = 240, 240
COLS, ROWS = 2, 2


def sheet_with_glow_cell(glow_index=0):
    """2×2: một ô nền ĐEN (glow), ba ô nền key — đúng hình dạng sheet `dao-cu`."""
    im = Image.new("RGB", (W, H), KEY)
    d = ImageDraw.Draw(im)
    cw, ch = W // COLS, H // ROWS
    r, c = divmod(glow_index, COLS)
    d.rectangle([c * cw, r * ch, (c + 1) * cw - 1, (r + 1) * ch - 1], fill=(0, 0, 0))
    # lõi sáng của ô glow + vài element đặc ở các ô key (để ảnh không phải nền trơn)
    d.ellipse([c * cw + 30, r * ch + 30, c * cw + 90, r * ch + 90], fill=(255, 230, 150))
    for i in range(COLS * ROWS):
        if i == glow_index:
            continue
        rr, cc = divmod(i, COLS)
        d.rounded_rectangle([cc * cw + 25, rr * ch + 25, cc * cw + 95, rr * ch + 95],
                            radius=12, fill=(210, 90, 60))
    return im


def boxes_for(glow_index):
    cw, ch = W / COLS, H / ROWS
    r, c = divmod(glow_index, COLS)
    return [(round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))]


class MixedKeySheetTest(unittest.TestCase):
    def test_o_glow_nen_den_tung_keo_ca_sheet_xuong_duong_lui(self):
        """Đây là BỆNH — giữ ca này để không ai 'tối ưu' `ignore` đi mất."""
        im = sheet_with_glow_cell(0)
        bg = slice_mod.border_colors(im)
        self.assertEqual(len(bg), 2, "test vô nghĩa nếu ô đen không lọt vào mẫu viền")
        self.assertFalse(slice_mod.is_key_color(bg),
                         "chưa loại ô glow thì sheet phải bị coi là nền 2 màu (bệnh cũ)")

    def test_loai_o_glow_thi_sheet_tro_lai_dung_mot_mau_key(self):
        im = sheet_with_glow_cell(0)
        bg = slice_mod.border_colors(im, ignore=boxes_for(0))
        self.assertEqual(len(bg), 1, f"vẫn còn 2 màu nền: {bg}")
        self.assertTrue(slice_mod.is_key_color(bg), f"nền {bg} phải được nhận là key")
        self.assertEqual(slice_mod.key_name_of(bg[0]), "magenta")

    def test_o_glow_o_bat_ky_vi_tri_nao_cham_mep(self):
        for idx in range(COLS * ROWS):
            with self.subTest(cell=idx):
                im = sheet_with_glow_cell(idx)
                bg = slice_mod.border_colors(im, ignore=boxes_for(idx))
                self.assertEqual(len(bg), 1, f"ô glow #{idx} vẫn kéo ra 2 màu: {bg}")
                self.assertTrue(slice_mod.is_key_color(bg))

    def test_khong_co_o_glow_thi_ket_qua_khong_doi_mot_pixel(self):
        """Bản vá chỉ được động tới sheet CÓ ô glow — mọi sheet khác phải y hệt."""
        im = Image.new("RGB", (W, H), KEY)
        ImageDraw.Draw(im).rounded_rectangle([60, 60, 180, 180], radius=16, fill=(60, 120, 220))
        self.assertEqual(slice_mod.border_colors(im), slice_mod.border_colors(im, ignore=[]))

    def test_nen_caro_2_mau_that_van_phai_ra_2_mau(self):
        """Đường lùi nền nhạt/caro kiểu cũ KHÔNG được bản vá này nuốt mất."""
        im = Image.new("RGB", (W, H), (245, 245, 245))
        d = ImageDraw.Draw(im)
        for y in range(0, H, 16):
            for x in range(0, W, 16):
                if (x // 16 + y // 16) % 2:
                    d.rectangle([x, y, x + 15, y + 15], fill=(205, 205, 205))
        bg = slice_mod.border_colors(im, ignore=[])
        self.assertEqual(len(bg), 2, "nền caro thật phải vẫn đo ra 2 màu")
        self.assertFalse(slice_mod.is_key_color(bg))

    def test_ca_vien_bi_che_thi_quay_ve_phep_do_cu_chu_khong_ne(self):
        """Sheet 1×1 toàn ô glow: `ignore` che sạch viền ⇒ không được trả rỗng/ném."""
        im = Image.new("RGB", (W, H), (0, 0, 0))
        bg = slice_mod.border_colors(im, ignore=[(0, 0, W, H)])
        self.assertEqual(len(bg), 1)
        self.assertEqual(bg[0], (0, 0, 0))


class InBoxesTest(unittest.TestCase):
    def test_hop_nua_mo_ben_phai_duoi(self):
        b = [(10, 20, 30, 40)]
        self.assertTrue(slice_mod.in_boxes(10, 20, b))
        self.assertTrue(slice_mod.in_boxes(29, 39, b))
        self.assertFalse(slice_mod.in_boxes(30, 39, b), "mép phải phải là nửa mở")
        self.assertFalse(slice_mod.in_boxes(29, 40, b), "mép dưới phải là nửa mở")
        self.assertFalse(slice_mod.in_boxes(9, 20, b))
        self.assertFalse(slice_mod.in_boxes(0, 0, []))


if __name__ == "__main__":
    unittest.main()
