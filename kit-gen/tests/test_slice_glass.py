"""Ô `matte:"glass"` — UNMIX foreground-over-key, không phải despill.

╔══ BỆNH ĐÃ ĐO TRÊN DỰ ÁN THẬT ════════════════════════════════════════════════╗
║ `hello-368a` / `22-board-panel` (`matte:"glass"`, sheet `popup-doc` đã đi đúng ║
║ đường matte): **325 626 px magenta ĐỤC = 40% diện tích ô**. Model vẽ tấm panel ║
║ KÍNH trong suốt, nền key lộ qua, solver alpha thấy một mảng màu liền khối biên ║
║ rõ nên gọi là foreground (α≈1) ⇒ panel ra đục màu key.                         ║
║                                                                                ║
║ Despill thường KHÔNG cứu được: nó trừ sắc key khỏi RGB ⇒ magenta đục thành     ║
║ HỒNG CÁ HỒI đục, vẫn không nhìn xuyên qua. Phải giải ngược phép trộn:          ║
║                                                                                ║
║     C = α·F + (1−α)·K                                                          ║
║     spill(C) = α·spill(F) + (1−α)·sref      (spill tuyến tính theo key_axis)   ║
║     spill(F) = 0  (giả thiết Vlahos: kính không tự mang sắc key)               ║
║   ⇒ α = 1 − spill(C)/sref        F = (C − (1−α)·K)/α                           ║
║                                                                                ║
║ ĐO LẠI SAU BẢN VÁ, trên chính ô đó:                                            ║
║   tím đục      325 626 → 0        (−100%)                                      ║
║   α thân(25..250) 26 780 → 377 259  ← KÍNH CÒN THÂN, không bị đục lỗ           ║
║   α trong suốt  377 566 → 366 737  ← không hề "ép alpha=0 sạch"                ║
║   F trung bình = (219,117,117), spill trung bình = **−0.1** (sạch key)         ║
║   α trung bình = 152/255 ⇒ panel mờ 60%                                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Ca ở đây dựng GROUND TRUTH tổng hợp (biết trước đáp án đúng) rồi đo vòng tròn
khép kín: trộn F0/α0 lên nền key → matte → phải trả lại đúng F0/α0. Không kèm ảnh
của user vào repo; số của ảnh thật nằm ở khối trên và ở báo cáo.
"""
import unittest

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

from PIL import Image

from slicelib import load

slice_mod = load()
slice_mod.HAS_VITMATTE = False        # test không được tải model ~8s / cần mạng
PURE_KEY_SN_REAL = slice_mod.PURE_KEY_SN

KEY = (255, 0, 255)
SIZE = 160
PANEL = (30, 30, 130, 130)            # tấm kính
RING = 10                             # bề dày khung viền ĐẶC

# Kính: `spill(F0) = min(R,B) − G = min(140,160) − 140 = 0` ⇒ giả thiết Vlahos
# ĐÚNG TUYỆT ĐỐI với fixture này, nên đáp án kỳ vọng là con số chính xác chứ
# không phải "xấp xỉ" — sai số duy nhất còn lại là hậu kỳ (blur 0.7px + feather).
GLASS_RGB = (140, 140, 160)
GLASS_A = 0.5
FRAME_RGB = (200, 160, 60)            # vàng: spill = min(200,60) − 160 = −100 < 0


def composite_over_key():
    """`C = α·F + (1−α)·K` — đúng thứ model vẽ ra khi tô kính trên nền key."""
    arr = np.empty((SIZE, SIZE, 3), dtype=np.float64)
    arr[:, :] = KEY
    l, t, r, b = PANEL
    arr[t:b, l:r] = np.array(GLASS_RGB) * GLASS_A + np.array(KEY) * (1 - GLASS_A)
    for i in range(RING):              # khung viền đặc bao quanh
        arr[t + i, l:r] = FRAME_RGB
        arr[b - 1 - i, l:r] = FRAME_RGB
        arr[t:b, l + i] = FRAME_RGB
        arr[t:b, r - 1 - i] = FRAME_RGB
    return Image.fromarray(np.rint(arr).astype(np.uint8), "RGB")


def cell_masks():
    m = np.ones((SIZE, SIZE), dtype=bool)
    return m, m                        # cả ảnh là MỘT ô glass


def probe(img):
    """Lấy mẫu ở TÂM kính, trên KHUNG, và ở NỀN — tránh mọi mép bị blur."""
    a = np.asarray(img)
    return {
        "glass": a[80, 80],
        "frame": a[35, 80],
        "outside": a[8, 8],
    }


@unittest.skipUnless(HAS_NUMPY and slice_mod.HAS_PYMATTING,
                     "unmix glass nằm trên nhánh pymatting")
class GlassUnmixTest(unittest.TestCase):
    def setUp(self):
        self.sheet = composite_over_key()
        self.noclamp, self.glass = cell_masks()
        self.ax = slice_mod.key_axis(KEY)

    def run_matte(self, glass):
        out, _ = slice_mod.matte_chroma(self.sheet, KEY, self.noclamp, self.ax, glass)
        return out

    def test_khong_bat_glass_thi_panel_ra_DUC_MAU_KEY(self):
        """Đây là BỆNH — giữ ca này để bản vá không bị lặng lẽ gỡ đi.

        Phải hạ `PURE_KEY_SN` (nhãn nền cho khe hẹp — xem `test_slice_slit.py`)
        về trạng thái CŨ thì fixture mới tái hiện được bệnh: tấm kính tổng hợp ở
        đây là một hình chữ nhật MÀU PHẲNG, trimap mới neo nền chắc chắn tới mức
        solver tự gọi nó là nền. Panel THẬT không dễ thế — đo trên `22-board-panel`
        của `hello-368a` bằng chính thước của QA (`crop_audit`, dist<60, α≥250):
            trimap cũ, không unmix : 4840 px magenta đục
            trimap mới, không unmix: 4831 px   ← nhãn khe hẹp gần như không giúp gì
            trimap mới + unmix     :    0 px
        Tức bản vá glass VẪN LÀ thứ duy nhất chữa được ca này.
        """
        self.addCleanup(setattr, slice_mod, "PURE_KEY_SN", PURE_KEY_SN_REAL)
        slice_mod.PURE_KEY_SN = 1.01
        p = probe(self.run_matte(None))
        self.assertEqual(p["glass"][3], 255, "test vô nghĩa nếu solver không ra alpha đục")
        spill = min(int(p["glass"][0]), int(p["glass"][2])) - int(p["glass"][1])
        self.assertGreater(spill, 25, f"ruột kính phải còn ám key ở bản chưa vá: {p['glass']}")

    def test_bat_glass_thi_alpha_tra_ve_dung_do_mo_that(self):
        p = probe(self.run_matte(self.glass))
        self.assertAlmostEqual(p["glass"][3] / 255.0, GLASS_A, delta=0.06,
                               msg=f"alpha kính ra {p['glass'][3]}/255, chờ ~{GLASS_A}")

    def test_kinh_van_con_THAN_chu_khong_bi_duc_thung(self):
        """Yêu cầu chủ sản phẩm: 'đừng ép alpha=0 sạch — kính phải còn thân'."""
        a = np.asarray(self.run_matte(self.glass))[..., 3]
        l, t, r, b = PANEL
        inner = a[t + RING + 4:b - RING - 4, l + RING + 4:r - RING - 4]
        self.assertGreater(inner.min(), 60, "ruột kính bị đục thủng thành lỗ")
        self.assertLess(inner.max(), 220, "ruột kính vẫn còn đục — chưa unmix")

    def test_mau_kinh_tra_ve_dung_F0_va_sach_key(self):
        p = probe(self.run_matte(self.glass))
        got = [int(v) for v in p["glass"][:3]]
        for i, (g, want) in enumerate(zip(got, GLASS_RGB)):
            self.assertAlmostEqual(g, want, delta=14,
                                   msg=f"kênh {i} ra {g}, chờ {want} (F thu được {got})")
        spill = min(got[0], got[2]) - got[1]
        self.assertLessEqual(spill, 8, f"F thu được vẫn ám key: {got}")

    def test_khung_vien_dac_khong_bi_dung_toi(self):
        """Chỗ `sn≈0` phải giữ α=1 — unmix không được ăn vào phần đặc."""
        p = probe(self.run_matte(self.glass))
        self.assertGreaterEqual(p["frame"][3], 250, "khung viền bị làm trong suốt")
        for i, want in enumerate(FRAME_RGB):
            self.assertAlmostEqual(int(p["frame"][i]), want, delta=18)

    def test_nen_ngoai_panel_van_trong_suot(self):
        p = probe(self.run_matte(self.glass))
        self.assertLessEqual(p["outside"][3], 8, "nền key quanh panel phải trong suốt")

    def test_o_KHONG_glass_khong_doi_mot_pixel(self):
        """Bản vá chỉ được chạm ô khai `matte:"glass"`."""
        a = np.asarray(self.run_matte(None))
        b = np.asarray(self.run_matte(np.zeros((SIZE, SIZE), dtype=bool)))
        self.assertTrue(np.array_equal(a, b), "glass rỗng vẫn làm đổi kết quả")


@unittest.skipUnless(HAS_NUMPY, "cần numpy")
class GlassAlgebraTest(unittest.TestCase):
    """Đại số của phép unmix — kiểm không cần solver, đúng cho cả 4 màu key."""

    def test_alpha_va_F_giai_nguoc_dung_voi_moi_key(self):
        for name, key in slice_mod.KEY_COLORS.items():
            with self.subTest(key=name):
                ax = slice_mod.key_axis(key)
                sref = slice_mod.key_spill_ref(key, ax)
                k = np.array(key, dtype=np.float64)
                # F trung tính trên trục key ⇒ spill(F) = 0
                f0 = np.array([130.0, 130.0, 130.0])
                for a0 in (0.25, 0.5, 0.75):
                    c = (f0 * a0 + k * (1 - a0))[None, None, :]
                    sn = np.clip(slice_mod.key_spill(c, ax) / sref, 0, 1)
                    a_rec = float(1.0 - sn[0, 0])
                    self.assertAlmostEqual(a_rec, a0, delta=0.02,
                                           msg=f"{name} α {a0} → {a_rec}")
                    f_rec = (c[0, 0] - (1 - a_rec) * k) / max(a_rec, 1 / 255)
                    for got, want in zip(f_rec, f0):
                        self.assertAlmostEqual(got, want, delta=6)


if __name__ == "__main__":
    unittest.main()
