"""Ô FULL-BLEED: CẮT NGUYÊN Ô, VÀ PHẦN MODEL CHỪA PHẢI Ở LẠI LÀ TRONG SUỐT.

LỊCH SỬ, VÌ NÓ GIẢI THÍCH VÌ SAO FILE NÀY NGẮN ĐI RẤT NHIỀU
─────────────────────────────────────────────────────────────────────────────────
Bug 15/08: chủ sản phẩm dán tấm nền vừa gen sang Figma và thấy một SỌC MAGENTA dọc
mép trái. Nguyên nhân là model vẽ THỤT VÀO, chừa nguyên khung chroma-key quanh 4
cạnh, mà ô full-bleed thì `slice.py` cắt thẳng KHÔNG qua matte — nên dải key đi
nguyên vào asset. Bản vá khi đó phải ba lớp: gọt theo màu KHAI BÁO, gọt thêm cột
"ám key" (nửa key nửa tranh), rồi xoá nốt răng cưa theo PIXEL.

Cả ba lớp đó nay **không còn lý do tồn tại**. Model chừa mép thì phần chừa là
alpha = 0 — nó KHÔNG PHẢI MỘT MÀU, nên không có gì để gọt và cũng không có răng
cưa ám màu để xoá. `slice.py` cắt nguyên ô ra khỏi sheet alpha rồi dán.

Nhưng ĐÚNG CÁI BUG CŨ vẫn phải được canh, chỉ là ở dạng mới: nếu ai đó lỡ tay đưa
ô full-bleed về `convert("RGB")` (như bản chroma từng làm, và đó là lựa chọn ĐÚNG
hồi ấy) thì phần model chừa sẽ hoá ĐEN ĐẶC — vẫn là một cái viền đi vào Figma, chỉ
đổi màu. Ca ② và ③ khoá chuyện đó.
"""
import unittest

from PIL import Image

from slicelib import load

s = load()


def artwork_px(x, y):
    """Tranh nền: biến thiên cả DỌC (trời → đất) lẫn NGANG, như mọi ảnh nền thật."""
    return (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4)


def make_full_sheet(w=200, h=120, gap=8, ragged=3):
    """Sheet 1 ô full-bleed như model thật trả về: tranh phủ kín, mép trái model
    CHỪA (alpha = 0), ranh giới răng cưa ±`ragged`px, kèm một cột alpha TRUNG GIAN
    ở đúng ranh giới — đây là dải mờ mà chroma-key không bao giờ tạo nổi."""
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y in range(h):
        edge = gap + (y % (ragged + 1))
        for x in range(w):
            r, g, b = artwork_px(x, y)
            if x < edge:
                px[x, y] = (0, 0, 0, 0)              # model chừa — trong suốt hẳn
            elif x == edge:
                px[x, y] = (r, g, b, 128)            # mép khử răng cưa
            else:
                px[x, y] = (r, g, b, 255)
    return im


def cut(sheet):
    """Đúng thứ nhánh `shape == "full"` của slice.py làm: crop nguyên ô."""
    keyed, _strict = s.alpha_sheet(sheet)
    return keyed.crop((0, 0, *sheet.size))


class FullBleedTest(unittest.TestCase):
    def test_cat_nguyen_o_khong_gam_mat_mot_pixel_tranh(self):
        """Full-bleed nghĩa là ô CHÍNH LÀ asset — không bbox lại, không gọt."""
        sheet = make_full_sheet()
        out = cut(sheet)
        self.assertEqual(out.size, sheet.size)
        px = out.load()
        r, g, b = artwork_px(150, 60)
        self.assertEqual(px[150, 60], (r, g, b, 255), "ruột tranh bị đổi")

    def test_phan_model_chua_van_TRONG_SUOT_chu_khong_hoa_den(self):
        """Đây là bug 15/08 ở dạng mới: chừa mép mà hoá đặc là lại một cái viền."""
        out = cut(make_full_sheet())
        px = out.load()
        for y in range(0, 120, 7):
            self.assertEqual(px[0, y][3], 0, f"mép trái y={y} phải trong suốt")

    def test_mep_khu_rang_cua_giu_alpha_TRUNG_GIAN(self):
        """Dải mờ là thứ chroma-key không làm nổi. Nắn nó về 0/255 là mất mép mềm."""
        out = cut(make_full_sheet())
        px = out.load()
        band = [px[gap + (y % 4), y][3] for y, gap in ((y, 8) for y in range(0, 120, 3))]
        self.assertTrue(any(0 < a < 255 for a in band), f"không còn dải mờ: {set(band)}")

    def test_o_khong_chua_mep_thi_khong_co_gi_thay_doi(self):
        """Tranh phủ kín thật sự ⇒ ra đúng một ô đục hoàn toàn, không viền nào."""
        w, h = 200, 120
        sheet = Image.new("RGBA", (w, h))
        px = sheet.load()
        for y in range(h):
            for x in range(w):
                px[x, y] = (*artwork_px(x, y), 255)
        out = cut(sheet)
        alpha = out.getchannel("A").getextrema()
        self.assertEqual(alpha, (255, 255), "ô phủ kín mà vẫn có chỗ trong suốt")


if __name__ == "__main__":
    unittest.main()
