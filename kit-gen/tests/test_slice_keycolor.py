"""Tổng quát hoá màu chroma-key trong slice.py (backlog mục 5).

Bản cũ chỉ biết phân biệt `is_green = kg > max(kr, kb)` rồi hardcode hai công
thức spill. Hệ quả: **cyan (0,255,255) bị phân loại SAI thành magenta** (vì
`255 > 255` là False) ⇒ `spill = min(r,b) − g = 0 − 255` âm toàn ảnh ⇒ không tách
được gì. Nay mọi phép đo quy về một đại lượng theo `key_axis()`:

    spill = min(kênh CAO của key) − max(kênh THẤP)

cho ra ĐÚNG hai công thức cũ với magenta/green (tương thích ngược tuyệt đối) và
tự chạy đúng với cyan/blue.

Interface với webapp CHỈ là chuỗi `bg` trong styles.json — không có field mới.
"""
import unittest
from PIL import Image, ImageDraw

from slicelib import load

slice_mod = load()
slice_mod.HAS_VITMATTE = False        # test không được tải model ~8s / cần mạng

SIZE = 160
BODY = (36, 36, 124, 124)             # thân đặc
HOLE = (68, 68, 92, 92)               # RUỘT RỖNG CỐ Ý — phải giữ trong suốt
ART = (250, 190, 40)                  # vàng cam: xa cả 4 màu key


def sheet_on(key):
    im = Image.new("RGB", (SIZE, SIZE), key)
    d = ImageDraw.Draw(im)
    d.rectangle(BODY, fill=ART)
    d.rectangle(HOLE, fill=key)       # lỗ thủng lộ đúng nền key
    return im


class KeyAxisTest(unittest.TestCase):
    def test_bon_mau_key_co_truc_rieng_biet(self):
        axes = {n: slice_mod.key_axis(c) for n, c in slice_mod.KEY_COLORS.items()}
        self.assertEqual(axes["magenta"], ((0, 2), (1,)))
        self.assertEqual(axes["green"],   ((1,), (0, 2)))
        self.assertEqual(axes["cyan"],    ((1, 2), (0,)))
        self.assertEqual(axes["blue"],    ((2,), (0, 1)))
        self.assertEqual(len(set(axes.values())), 4, "hai key trùng trục là không phân biệt được")

    def test_cong_thuc_moi_trung_khop_hai_cong_thuc_hardcode_cu(self):
        """Bằng chứng tương thích ngược: với magenta/green, spill mới == spill cũ."""
        for pixel in [(250, 190, 40), (12, 200, 30), (255, 0, 255), (128, 128, 128),
                      (200, 40, 210), (10, 10, 10)]:
            r, g, b = pixel
            self.assertEqual(
                min(pixel[i] for i in (0, 2)) - max(pixel[i] for i in (1,)),
                min(r, b) - g, "magenta")
            self.assertEqual(
                min(pixel[i] for i in (1,)) - max(pixel[i] for i in (0, 2)),
                g - max(r, b), "green")

    def test_cyan_khong_con_bi_phan_loai_nham_thanh_magenta(self):
        cyan = slice_mod.KEY_COLORS["cyan"]
        self.assertFalse(cyan[1] > max(cyan[0], cyan[2]), "tái lập bẫy `is_green` bản cũ")
        self.assertEqual(slice_mod.key_name_of(cyan), "cyan")

    def test_key_do_duoc_lech_mau_van_ra_dung_ten(self):
        for color, name in [((238, 15, 211), "magenta"), ((243, 9, 219), "magenta"),
                            ((250, 120, 230), "magenta"), ((20, 230, 40), "green"),
                            ((10, 230, 240), "cyan"), ((20, 30, 240), "blue")]:
            self.assertEqual(slice_mod.key_name_of(color), name, color)

    def test_mau_xam_khong_phai_key(self):
        self.assertIsNone(slice_mod.key_axis((128, 128, 128)))
        self.assertFalse(slice_mod.is_key_color([(200, 190, 185)]))
        self.assertFalse(slice_mod.is_key_color([(0, 255, 0), (255, 255, 255)]))  # nền caro


class DeclaredKeyTest(unittest.TestCase):
    def test_doc_duoc_chuoi_bg_that_trong_styles_json(self):
        self.assertEqual(slice_mod.declared_key("pure vivid magenta #FF00FF"), "magenta")
        self.assertEqual(slice_mod.declared_key("pure vivid green #00FF00"), "green")
        self.assertEqual(slice_mod.declared_key("one flat solid CYAN"), "cyan")

    def test_doc_duoc_hex_khong_kem_ten(self):
        self.assertEqual(slice_mod.declared_key("#00FFFF"), "cyan")
        self.assertEqual(slice_mod.declared_key("#0000FF"), "blue")

    def test_thieu_bg_giu_hanh_vi_cu(self):
        """Hợp đồng tương thích: thiếu `bg` ⇒ None ⇒ suy trục từ màu ĐO ĐƯỢC."""
        for missing in (None, "", "  "):
            self.assertIsNone(slice_mod.declared_key(missing))

    def test_bg_la_hoac_thi_khong_doan_bua(self):
        self.assertIsNone(slice_mod.declared_key("một màu nền lạ hoắc"))


class MatteAllKeysTest(unittest.TestCase):
    """Tách nền thật trên cả 4 màu key, giữ nguyên ruột rỗng cố ý."""

    def check(self, name):
        key = slice_mod.KEY_COLORS[name]
        out, strict = slice_mod.matte_chroma(sheet_on(key), key)
        a = out.getchannel("A").load()
        self.assertLess(a[4, 4], 16, f"{name}: góc nền phải trong suốt")
        self.assertGreater(a[SIZE // 2, 44], 200, f"{name}: thân phải đục")
        self.assertLess(a[SIZE // 2, SIZE // 2], 32,
                        f"{name}: RUỘT RỖNG CỐ Ý bị lấp — nền key kín trong thân "
                        f"phải trong suốt, đó là hợp đồng của matte_chroma")
        rgb = out.convert("RGBA").getpixel((SIZE // 2, 44))[:3]
        for i in range(3):
            self.assertLess(abs(rgb[i] - ART[i]), 45,
                            f"{name}: màu thân lệch sau despill/un-premultiply: {rgb}")

    def test_magenta(self): self.check("magenta")
    def test_green(self):   self.check("green")
    def test_cyan(self):    self.check("cyan")
    def test_blue(self):    self.check("blue")

    def test_truc_khai_bao_thang_khi_mau_do_duoc_lech(self):
        """Key magenta model vẽ nhạt vẫn phải tách theo trục magenta."""
        drift = (238, 15, 211)
        out, _ = slice_mod.matte_chroma(sheet_on(drift), drift,
                                        axis=slice_mod.key_axis(slice_mod.KEY_COLORS["magenta"]))
        a = out.getchannel("A").load()
        self.assertLess(a[4, 4], 16)
        self.assertGreater(a[SIZE // 2, 44], 200)

    def test_vlahos_duong_lui_cung_chay_dung_ca_4_key(self):
        for name, key in slice_mod.KEY_COLORS.items():
            with self.subTest(key=name):
                out, _ = slice_mod.matte_vlahos(sheet_on(key), key)
                a = out.getchannel("A").load()
                self.assertLess(a[4, 4], 16, f"{name}: nền chưa trong suốt")
                self.assertGreater(a[SIZE // 2, 44], 200, f"{name}: thân chưa đục")


if __name__ == "__main__":
    unittest.main()
