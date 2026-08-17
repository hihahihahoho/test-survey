"""KHE HẸP nền lọt giữa hai mảng element — không được ra MẢNG KEY ĐỤC.

╔══ BỆNH ĐÃ ĐO TRÊN DỰ ÁN THẬT ════════════════════════════════════════════════╗
║ `hello-368a`, các tấm dáng nhân vật (`chinh-pose-nhan-vat*.png`, đi ĐÚNG đường ║
║ matte closed-form — không phải ca `border_colors` của test_slice_mixed_key).   ║
║ QA đo trên `kits/chinh/tight/` (`edge / fringe / opaque` theo crop_audit):     ║
║     01-pose-idle 0/115/270 · 04-pose-present 0/0/114 · 12-pose-bow 0/0/42      ║
║     05-pose-hold-gift 0/0/27 · 03-pose-point 0/0/22                            ║
║ Mảng đục đó là NỀN THUẦN: RGB tb (239,12,228) ≈ đúng màu key, alpha 253–255,   ║
║ nằm ở KHE HẸP (nách, kẽ tay, khe giữa hai chân — rộng 3–7px) BÊN TRONG dáng.   ║
║                                                                                ║
║ CƠ CHẾ, đo trên `chinh-pose-nhan-vat.png` thật (key (250,3,243), sref 240):    ║
║ trimap lấy nhãn "nền chắc" từ `sn_s` = `sn` đã bôi σ=2. Trong khe hẹp, cú bôi  ║
║ kéo `sn=0` của element hai bên vào giữa ⇒ `sn_s < 0.9` ⇒ khe MẤT nhãn nền và   ║
║ rơi vào dải nghi vấn; solver thấy vùng nghi vấn bị foreground bao kín, không    ║
║ còn điểm tựa nền nào ⇒ tô alpha≈1.                                             ║
║   px `sn ≥ 0.98` mà alpha ra ≥ 250 :  77                                       ║
║   trong đó THOÁT nhãn nền (`sn_s<0.9`): 77/77  ← 100%                          ║
║   tập được gán nền chắc đúng cách    :  0 px đục, alpha trung bình 0,26/255     ║
║                                                                                ║
║ VÁ: `bg_sure = (sn_s >= 0.9) | (sn >= PURE_KEY_SN)` — giữ nguyên `sn_s` cho    ║
║ đường viền 0.9 (nó lo việc chống răng cưa), chỉ HỢP THÊM nhãn nền cho pixel mà ║
║ `sn` GỐC gần bằng nền thuần. Đo lại toàn bộ 54 asset, cắt từ raw thật:         ║
║   magenta ĐỤC   475 → **0**        magenta fringe  168 → 47 (đều ở alpha ≤ 1)  ║
║   riêng 5 dáng trên: 270/114/42/27/22 → 0/0/0/0/0                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Fixture ở đây dựng lại ĐÚNG hình học đó (khe 5px xuyên giữa một khối đặc) nên ca
"bệnh" và ca "đã vá" chạy trên cùng một ảnh, chỉ khác `PURE_KEY_SN`.
"""
import unittest

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

from PIL import Image, ImageFilter

from slicelib import load

slice_mod = load()
slice_mod.HAS_VITMATTE = False        # test không được tải model ~8s / cần mạng

KEY = (255, 0, 255)
SIZE = 160
BLOB = (30, 20, 130, 140)             # (l, t, r, b) khối element đặc
FG_RGB = (60, 140, 200)               # spill = min(60,200) − 140 = −80 ⇒ chắc chắn foreground
SLIT_X = (78, 83)                     # khe rộng 5px…
SLIT_Y = (40, 120)                    # …nằm gọn TRONG khối, hai đầu bị bịt kín
GAP_X = (36, 60)                      # khe RỘNG 24px để đối chứng
GAP_Y = (100, 132)

# `PURE_KEY_SN` > 1 ⇒ điều kiện `sn >= PURE_KEY_SN` không bao giờ đúng ⇒ `bg_sure`
# thu về đúng `sn_s >= 0.9` của bản CHƯA VÁ. Đây là cách bật/tắt bản vá trong test.
OFF = 1.01


def sheet_with_slit():
    arr = np.empty((SIZE, SIZE, 3), dtype=np.float64)
    arr[:, :] = KEY
    l, t, r, b = BLOB
    arr[t:b, l:r] = FG_RGB
    arr[SLIT_Y[0]:SLIT_Y[1], SLIT_X[0]:SLIT_X[1]] = KEY
    arr[GAP_Y[0]:GAP_Y[1], GAP_X[0]:GAP_X[1]] = KEY
    return Image.fromarray(np.rint(arr).astype(np.uint8), "RGB")


def alpha_of(img):
    return np.asarray(img)[..., 3]


@unittest.skipUnless(HAS_NUMPY and slice_mod.HAS_PYMATTING,
                     "nhãn trimap chỉ tồn tại trên nhánh pymatting")
class NarrowSlitTest(unittest.TestCase):
    def setUp(self):
        self.sheet = sheet_with_slit()
        self.ax = slice_mod.key_axis(KEY)
        self.keep = slice_mod.PURE_KEY_SN

    def tearDown(self):
        slice_mod.PURE_KEY_SN = self.keep

    def matte(self):
        out, _ = slice_mod.matte_chroma(self.sheet, KEY, None, self.ax, None)
        return out

    def slit(self, a):
        """Lõi khe — chừa 1px mỗi bên cho blur 0.7px chống răng cưa."""
        return a[SLIT_Y[0] + 6:SLIT_Y[1] - 6, SLIT_X[0] + 1:SLIT_X[1] - 1]

    def test_chua_va_thi_khe_hep_ra_MANG_KEY_DUC(self):
        """Đây là BỆNH — giữ ca này để bản vá không bị lặng lẽ gỡ đi.

        Đo được ở bản chưa vá: khe alpha **255/255** và **400 px màu key mà đục**.
        """
        slice_mod.PURE_KEY_SN = OFF
        out = np.asarray(self.matte()).astype(int)
        self.assertGreater(int(self.slit(out[..., 3]).mean()), 200,
                           "fixture không tái hiện được bệnh ⇒ mọi ca dưới vô nghĩa")
        d = np.sqrt(((out[..., :3] - np.array(KEY)) ** 2).sum(-1))
        self.assertGreater(int(((d < 60) & (out[..., 3] >= 250)).sum()), 100)

    def test_khe_hep_khong_con_bi_solver_goi_la_FOREGROUND(self):
        """Đo được: khe 255 → **113/255**.

        Không về 0 là ĐÚNG, không phải vá dở: khe rộng 5px mà hai vách đều đục,
        nên bước FEATHER (`GaussianBlur(3)` cho vùng α≤128, có từ trước bản vá)
        kéo alpha của hai vách vào giữa. Khác biệt nằm ở CHỖ KHÁC và mới là chỗ
        người dùng thấy: phần còn lại nay mang màu ELEMENT chứ không còn màu key
        — xem `test_khong_con_pixel_MAU_KEY_ma_DUC`, và trên ảnh thật cả 5 dáng
        về 0/0. Khe hẹp hơn trên tấm thật (đã bị thu ~0,68×) thì feather phủ
        chưa tới nên sạch hẳn.
        """
        a = self.slit(alpha_of(self.matte()))
        self.assertLess(int(a.mean()), 140,
                        f"khe vẫn bị coi là foreground, alpha tb {a.mean():.0f}")

    def test_khong_con_pixel_MAU_KEY_ma_DUC(self):
        """Thước đo của QA: pixel gần màu key mà alpha ≥ 250."""
        out = np.asarray(self.matte()).astype(int)
        d = np.sqrt(((out[..., :3] - np.array(KEY)) ** 2).sum(-1))
        self.assertEqual(int(((d < 60) & (out[..., 3] >= 250)).sum()), 0)

    def test_khong_an_vao_THAN_element(self):
        """Nới tập 'nền chắc' không được gặm chỗ element đặc."""
        a = alpha_of(self.matte())
        l, t, r, b = BLOB
        body = a[t + 8:GAP_Y[0] - 8, l + 8:SLIT_X[0] - 8]
        self.assertGreaterEqual(int(body.min()), 250, "thân element bị làm trong")

    def test_mau_than_element_giu_nguyen(self):
        out = np.asarray(self.matte())
        got = [int(v) for v in out[60, 50, :3]]
        for i, want in enumerate(FG_RGB):
            self.assertAlmostEqual(got[i], want, delta=12, msg=f"thân đổi màu: {got}")

    def test_khe_RONG_von_da_dung_thi_ban_va_khong_lam_hong(self):
        """Đối chứng: khe rộng có điểm tựa nền nên vốn đã trong — phải vẫn trong."""
        for tag, sn in (("chưa vá", OFF), ("đã vá", self.keep)):
            with self.subTest(tag):
                slice_mod.PURE_KEY_SN = sn
                a = alpha_of(self.matte())
                gap = a[GAP_Y[0] + 8:GAP_Y[1] - 8, GAP_X[0] + 8:GAP_X[1] - 8]
                self.assertLessEqual(int(gap.max()), 8)


@unittest.skipUnless(HAS_NUMPY, "cần numpy")
class SlitMechanismTest(unittest.TestCase):
    """Khoá đúng CƠ CHẾ, để ai đổi σ blur hay ngưỡng còn đọc được vì sao có bản vá."""

    def test_cu_boi_sigma2_dim_nhan_nen_cua_khe_hep(self):
        arr = np.asarray(sheet_with_slit(), dtype=np.float64)
        ax = slice_mod.key_axis(KEY)
        sn = np.clip(slice_mod.key_spill(arr, ax) / slice_mod.key_spill_ref(KEY, ax), 0, 1)
        sn_s = np.asarray(Image.fromarray(np.rint(sn * 255).astype(np.uint8))
                          .filter(ImageFilter.GaussianBlur(2))) / 255.0
        y, x = 80, (SLIT_X[0] + SLIT_X[1]) // 2
        self.assertGreaterEqual(sn[y, x], slice_mod.PURE_KEY_SN,
                                "tâm khe phải là nền THUẦN trên ảnh gốc")
        self.assertLess(sn_s[y, x], 0.9,
                        "nếu cú bôi không còn dìm được nhãn thì bản vá đã thừa")

    def test_nguong_nam_giua_duong_vien_0_9_va_nen_thuan(self):
        self.assertGreater(slice_mod.PURE_KEY_SN, 0.9)
        self.assertLessEqual(slice_mod.PURE_KEY_SN, 1.0)


if __name__ == "__main__":
    unittest.main()
