"""ĐỤC HẲN PHẢI LÀ 255 — nắn cái "gần đục" mà model trả về.

VÌ SAO CÓ FILE NÀY
─────────────────────────────────────────────────────────────────────────────────
Từ khi bỏ chroma-key, alpha của asset đến THẲNG từ model. Và model không vẽ alpha
bằng công thức, nó vẽ bằng cọ — nên "đục" của nó là *gần* đục.

Đo trên ảnh thật (đối chứng skel-B, BACKLOG #24 ⑰):

    đỉnh alpha nằm ở  α=253 (20,3% pixel)  ·  α=252 (8,7%)  ·  α=251 (0,8%)
    alpha CAO NHẤT trong cả ảnh 1536×1024:  254
    số pixel ở α=255:                       0

Không một pixel nào đục hoàn toàn. Chênh 3/255 thì mắt chịu, nhưng nó không dừng
ở màn hình: file giao cho người dùng có mọi sprite mờ 1,2%, xếp chồng trong game
engine là hiện đường ghép, và designer soi ô thì đọc ra "98,8%" cho một cái nút
lẽ ra đặc. Đây đúng là loại lỗi đi lọt mọi vòng kiểm bằng mắt.

RANH GIỚI PHẢI GIỮ — và đây mới là phần dễ làm hỏng
─────────────────────────────────────────────────────────────────────────────────
Nắn alpha là thao tác dễ tay quá đà. Hai thứ PHẢI không được đụng tới, vì độ mờ
của chúng là NỘI DUNG chứ không phải sai số:
  · ô `glass` — thân kính cố ý nằm ở α≈64–128 (`item-prompt.ts:glassCellPrompt`);
  · quầng `glow` — tan dần từ α=0 lên, cả dải mờ là hình dạng của ánh sáng.
Cả hai đều cách ngưỡng 240 rất xa, nên phép nắn không chạm. Ca ② và ③ khoá đúng
chuyện đó — nếu ai đó hạ ngưỡng xuống cho "sạch hơn", kính sẽ hoá đặc và test đỏ.
"""
import unittest

from PIL import Image

from slicelib import load

slice_mod = load()


def sheet(*alphas):
    """Một hàng pixel, mỗi pixel một mức alpha — đọc kết quả ra là đọc thẳng dải α."""
    img = Image.new("RGBA", (len(alphas), 1))
    px = img.load()
    for x, a in enumerate(alphas):
        px[x, 0] = (200, 80, 40, a)
    return img


def alpha_of(img):
    rgba = slice_mod.snap_solid_alpha(img.convert("RGBA"))
    return [rgba.getchannel("A").load()[x, 0] for x in range(img.size[0])]


class AlphaDucHanTest(unittest.TestCase):
    def test_gan_duc_251_254_duoc_keo_ve_255(self):
        """Đúng dải mà model thật trả về — sau khi cắt phải là 255 tròn."""
        self.assertEqual(alpha_of(sheet(251, 252, 253, 254, 255)), [255] * 5)

    def test_kinh_va_quang_sang_KHONG_bi_dung_toi(self):
        """Độ mờ của kính/glow là NỘI DUNG. Nắn vào đây là làm hỏng thành phẩm."""
        mo = (0, 1, 32, 64, 96, 128, 180, 239)
        self.assertEqual(alpha_of(sheet(*mo)), list(mo))

    def test_nguong_240_la_bien_chinh_xac(self):
        """239 giữ nguyên, 240 lên 255 — khoá con số, vì hạ nó xuống là hoá đặc kính."""
        self.assertEqual(alpha_of(sheet(239, 240)), [239, 255])
        self.assertEqual(slice_mod.SOLID_ALPHA, 240)

    def test_mau_RGB_khong_doi_mot_byte(self):
        """Chỉ động vào kênh α. Đụng vào màu là despill trá hình, không ai gọi."""
        img = sheet(252, 100, 0)
        rgba = slice_mod.snap_solid_alpha(img.convert("RGBA"))
        px = rgba.load()
        self.assertEqual([px[x, 0][:3] for x in range(3)], [(200, 80, 40)] * 3)

    def test_anh_von_da_255_di_qua_nguyen_ven(self):
        """Không có gì để nắn thì không nắn — nhánh rẻ, và không đổi byte nào."""
        img = sheet(0, 128, 255)
        self.assertEqual(alpha_of(img), [0, 128, 255])

    def test_phep_nan_CHI_TANG_alpha_khong_bao_gio_ha(self):
        """Ranh giới quan trọng nhất sau khi bỏ tách nền: dao cắt không được HẠ một
        byte alpha nào. Phép nắn là phép duy nhất còn chạm vào α, nên nó phải đơn
        điệu tăng — có thế mới không tồn tại đường nào gặm ruột element."""
        vao = tuple(range(0, 256, 7)) + (239, 240, 254, 255)
        ra = alpha_of(sheet(*vao))
        for truoc, sau in zip(vao, ra):
            self.assertGreaterEqual(sau, truoc, f"alpha {truoc} bị hạ xuống {sau}")


if __name__ == "__main__":
    unittest.main()
