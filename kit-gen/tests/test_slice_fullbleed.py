"""Ô FULL-BLEED KHÔNG ĐƯỢC MANG SỌC MÀU KEY Ở MÉP (bug 15/08).

Chủ sản phẩm dán tấm nền vừa gen sang Figma và thấy một SỌC MAGENTA dọc mép trái.
Đào ra trên dữ liệu thật (`~/KitGen/projects/hello-a262`, tấm `nen`, ô `26-bg-play`):

  · `trim_flat_cell` chỉ nhận màu key khi `is_key_color(bg)` — mà `bg` là màu ĐO Ở
    VIỀN NGOÀI CẢ TẤM. Tấm nền gồm toàn ô full-bleed nên viền ngoài là TRANH ⇒
    `is_key_color` False ⇒ key=None ⇒ lượt gọt theo MÀU không chạy lần nào.
  · Còn lại đúng một lượt gọt "phẳng", và nó dừng ở cột magenta đầu tiên có biến
    thiên dọc: đo được cột x=5, (231,8,238) so với (226,33,217) ⇒ Δg=27 > 18.
    Kết quả: cột magenta ĐẶC nằm nguyên trong asset (1024/1024 pixel ám key).
  · Ngay cả khi có key, ranh giới key↔tranh do model vẽ là RĂNG CƯA nên gọt theo
    cột/hàng nguyên không bao giờ sạch hết.

Bộ ca này khoá cả ba nửa của bản vá: gọt theo màu KHAI BÁO, gọt thêm cột "ám key"
(nửa key nửa tranh), và xoá nốt phần răng cưa theo PIXEL.
"""
import unittest
from PIL import Image

from slicelib import load

s = load()

KEY = (255, 0, 255)          # magenta — key mặc định của mọi kit hiện có
AX = s.key_axis(KEY)


def artwork_px(x, y):
    """Tranh nền: biến thiên cả DỌC (trời → đất) lẫn NGANG, như mọi ảnh nền thật, nên
    lượt gọt 'phẳng' không có cớ đụng vào cột hay hàng nào. Cố ý ấm/nâu — không mang
    trục màu key (min(R,B) − G luôn âm)."""
    return (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4)


def make_full_cell(w=200, h=120, gap=8, ragged=3):
    """Ô full-bleed như model thật vẽ: tranh phủ kín, dải key ở mép trái, ranh giới
    răng cưa ±`ragged`px, kèm một cột pixel TRỘN (anti-alias) ở đúng ranh giới."""
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = artwork_px(x, y)
    for y in range(h):
        edge = gap + (y % (ragged + 1))
        for x in range(edge):
            px[x, y] = KEY
        mixed = artwork_px(edge, y)
        px[edge, y] = tuple((mixed[i] + KEY[i]) // 2 for i in range(3))
    return im


def edge_key_pixels(rgba):
    """Số pixel CÒN NHÌN THẤY (alpha > 0) và ÁM MÀU KEY trên hàng/cột ngoài cùng."""
    w, h = rgba.size
    px = rgba.load()
    n = 0
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y][3] and s.key_spill_px(px[x, y], AX) > s.KEY_TINT_SPILL:
                n += 1
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y][3] and s.key_spill_px(px[x, y], AX) > s.KEY_TINT_SPILL:
                n += 1
    return n


def cut(cell, key):
    """Đúng chuỗi mà nhánh `shape == "full"` của slice.py chạy."""
    box = s.trim_flat_cell(cell, key=key)
    crop = cell.crop(box).convert("RGBA")
    erased = s.erase_key_edge(crop, key)
    return box, crop, erased


class FullBleedEdgeTest(unittest.TestCase):
    def test_mep_ngoai_cung_khong_con_pixel_am_key(self):
        cell = make_full_cell()
        box, crop, _ = cut(cell, KEY)
        self.assertEqual(edge_key_pixels(crop), 0,
                         f"mép asset còn pixel màu key (bbox {box})")

    def test_bug_cu_tai_hien_duoc_khi_khong_co_key(self):
        """Bản cũ (key=None) để lại đúng cái sọc — nếu ca này xanh mà ca trên đỏ thì
        lỗi nằm ở bản vá, không phải ở dữ liệu dựng."""
        cell = make_full_cell()
        box_old = s.trim_flat_cell(cell, key=None)
        old = cell.crop(box_old).convert("RGBA")
        self.assertGreater(edge_key_pixels(old), 50,
                           "dữ liệu dựng không tái hiện được bug cũ")

    def test_khong_an_vao_tranh(self):
        """Gọt phải ĐỦ, không được lẹm: ô không có dải key thì không mất một cột nào,
        và ô có dải key chỉ mất đúng phần key + răng cưa."""
        plain = Image.new("RGB", (200, 120))
        px = plain.load()
        for y in range(120):
            for x in range(200):
                px[x, y] = artwork_px(x, y)
        box, crop, erased = cut(plain, KEY)
        self.assertEqual(box, (0, 0, 200, 120), "ô không có key mà vẫn bị gọt")
        self.assertEqual(erased, 0, "ô không có key mà vẫn bị xoá pixel")

        cell = make_full_cell(gap=8, ragged=3)
        box, crop, _ = cut(cell, KEY)
        # dải key rộng 8..11px + 1 cột trộn ⇒ gọt tới cột 13 là cùng
        self.assertLessEqual(box[0], 13, f"gọt hụt, còn sót dải key (l={box[0]})")
        self.assertEqual(box[2], 200, "mép phải không có key mà vẫn bị gọt")

    def test_khong_khai_bao_key_thi_khong_doi_hanh_vi(self):
        """Contract cũ không khai `bg` (key=None) ⇒ đường đi phải y hệt bản trước:
        không gọt theo màu, không xoá pixel nào."""
        cell = make_full_cell()
        crop = cell.crop(s.trim_flat_cell(cell, key=None)).convert("RGBA")
        self.assertEqual(s.erase_key_edge(crop, None), 0)

    def test_xoa_theo_pixel_bi_chan_trong_vanh_mep(self):
        """Phép loang không được có đường đi vào GIỮA ảnh: một vũng màu key nằm giữa
        ô (model vẽ hỏng) phải còn nguyên — nó là chuyện của người xem, không phải
        thứ mà hàm gọt mép được tự ý xoá."""
        cell = make_full_cell()
        px = cell.load()
        for y in range(55, 65):
            for x in range(95, 105):
                px[x, y] = KEY
        box, crop, _ = cut(cell, KEY)
        cp = crop.load()
        self.assertTrue(cp[100 - box[0], 60][3] > 0, "vũng key giữa ảnh bị xoá oan")


if __name__ == "__main__":
    unittest.main()
