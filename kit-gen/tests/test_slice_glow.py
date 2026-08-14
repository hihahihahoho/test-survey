"""Hồi quy cho nhánh tách glow trên NỀN ĐEN của slice.py (backlog P0-2).

Ánh sáng là phép CỘNG: trên nền đen ảnh AI chính là premultiplied `C = α·F`, nên
`α = max(R,G,B)` là đáp án đúng tuyệt đối. Bản cũ trừ black-point cứng
`α = (mx − 18)/(255 − 18)` NHƯNG vẫn tính `F = C/mx` — hai mẫu số khác nhau ⇒
`α·F ≠ C` ⇒ **năng lượng sáng bốc hơi ở quầng ngoài mềm**, đúng chỗ làm glow
trông mượt. Bản mới nhân soft-gate `smoothstep(6, 28)`: khử nhiễu tối mà không
trừ đi độ sáng.

Ground truth tổng hợp dựng theo đúng phương pháp research
(docs/research-glow-extraction-2026-08.md §1, §2.5): lõi trắng-vàng + quầng cam
rộng bán trong suốt + 12 tia + vòng xung kích XANH bão hoà (bẫy `α = max(RGB)`)
+ 28 sparkle + nhiễu Gaussian σ≈2 mô phỏng nhiễu gpt-image. Vì `E` được định
nghĩa TRƯỚC ở dạng float rồi mới lượng tử hoá thành "ảnh AI 8-bit trên nền đen",
ta biết chính xác đáp án đúng khi dán lên nền bất kỳ: `truth = clip(bg + E)`.

Số kỳ vọng của research (MAE 4.96 → 1.35 lv, mất sáng halo 37.2% → 0.6%) tái lập
được ở đây với sai lệch nhỏ do emitter tổng hợp không giống từng pixel.
"""
import unittest

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:                       # nhánh glow vốn đã bị guard HAS_PYMATTING
    HAS_NUMPY = False

from slicelib import load

slice_mod = load()

SIZE = 384
BLACK_POINT_OLD = 18.0                    # công thức bản cũ, để so găng trong test
HALO_BAND = (.08, .25)                    # dải max(RGB) của quầng ngoài yếu


def synth_glow(size=SIZE, seed=7):
    """(truth 0..255 float, ảnh AI 8-bit trên nền đen)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size]
    cx = cy = size / 2
    r = np.hypot(xx - cx, yy - cy)
    th = np.arctan2(yy - cy, xx - cx)
    E = np.zeros((size, size, 3))
    E += np.exp(-(r / (size * .055)) ** 2)[..., None] * np.array([1., .97, .85])
    E += (np.exp(-(r / (size * .22)) ** 1.6) * .55)[..., None] * np.array([1., .55, .18])
    E += ((np.cos(th * 12) ** 16) * np.exp(-(r / (size * .34)) ** 2) * .7)[..., None] \
        * np.array([1., .8, .45])
    # vòng xung kích XANH bão hoà: kênh B lớn nhất, bẫy alpha = max(RGB)
    E += (np.exp(-((r - size * .26) / (size * .018)) ** 2) * .6)[..., None] \
        * np.array([.15, .55, 1.])
    for _ in range(28):
        sx, sy = rng.integers(size * .15, size * .85, 2)
        E += np.exp(-(((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * 2.2 ** 2)))[..., None] \
            * np.array([1., 1., .95]) * rng.uniform(.3, .9)
    win = np.clip((size * .44 - r) / (size * .06), 0, 1)     # tắt hẳn ra rìa ô
    truth = np.clip(E, 0, 1) * win[..., None] * 255.
    obs = np.rint(np.clip(truth + rng.normal(0, 2., (size, size, 3)), 0, 255)).astype(np.uint8)
    return truth, obs


def score(alpha, fg, truth, obs, bg_level=128.):
    """(MAE khi dán ADDITIVE lên nền, nhiễu còn lại ở nền đen, % mất sáng halo)."""
    prem = fg * alpha[..., None]                 # ánh sáng asset thực sự mang theo
    mae = np.abs(np.clip(bg_level + prem, 0, 255)
                 - np.clip(bg_level + truth, 0, 255)).mean()
    empty = truth.max(axis=2) <= 0
    noise = prem[empty].mean()
    mx = obs.max(axis=2) / 255.
    band = (mx >= HALO_BAND[0]) & (mx < HALO_BAND[1])
    lost = 1 - prem[band].sum() / max(obs[band].sum(), 1e-9)
    return mae, noise, lost


@unittest.skipUnless(HAS_NUMPY, "nhánh glow cần numpy")
class GlowExtractionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.truth, cls.obs = synth_glow()
        cls.reg = cls.obs.astype(np.float64)
        cls.mx = cls.reg.max(axis=2)
        cls.F_raw = np.clip(cls.reg * 255. / np.maximum(cls.mx, 1.)[..., None], 0, 255)

    def old_formula(self):
        a = np.clip((self.mx - BLACK_POINT_OLD) / (255. - BLACK_POINT_OLD), 0, 1)
        return a, self.F_raw

    def test_soft_gate_thu_hoi_do_sang_quang_ngoai(self):
        """Khuyết tật chính: bản cũ ăn mất >1/3 độ sáng quầng ngoài yếu."""
        _, _, lost_old = score(*self.old_formula(), self.truth, self.obs)
        _, _, lost_new = score(*slice_mod.glow_alpha(self.reg), self.truth, self.obs)
        self.assertGreater(lost_old, .30, "bản cũ đáng lẽ mất >30% sáng halo "
                                          "— test mất ý nghĩa nếu không tái lập được")
        self.assertLess(lost_new, .05, f"soft-gate vẫn ăn {100 * lost_new:.1f}% "
                                       f"độ sáng quầng ngoài")

    def test_mae_additive_tot_hon_han_ban_cu(self):
        mae_old, _, _ = score(*self.old_formula(), self.truth, self.obs)
        mae_new, _, _ = score(*slice_mod.glow_alpha(self.reg), self.truth, self.obs)
        self.assertLess(mae_new, 2.0, f"MAE {mae_new:.2f} lv — research kỳ vọng ~1.35")
        self.assertLess(mae_new, mae_old / 2.5,
                        f"MAE chỉ cải thiện {mae_old / mae_new:.1f}× (kỳ vọng ~3.7×)")

    def test_gate_van_khu_sach_nhieu_toi_o_nen(self):
        """Bỏ gate hẳn thì halo không mất gì nhưng nền đen lấm tấm — không nhận."""
        _, noise_new, _ = score(*slice_mod.glow_alpha(self.reg), self.truth, self.obs)
        _, noise_none, _ = score(np.clip(self.mx / 255., 0, 1), self.F_raw,
                                 self.truth, self.obs)
        self.assertLess(noise_new, .1, f"nhiễu nền còn {noise_new:.3f} lv")
        self.assertGreater(noise_none, noise_new * 5,
                           "không gate đáng lẽ để lại nhiễu rõ rệt hơn")

    def test_alpha_bang_do_sang_o_vung_sang(self):
        """Trên ngưỡng gate, alpha KHÔNG được trừ đi gì — đó là cả điểm của fix."""
        a, _ = slice_mod.glow_alpha(self.reg)
        bright = self.mx >= slice_mod.GLOW_GATE_HI
        self.assertTrue(bright.any())
        np.testing.assert_allclose(a[bright], self.mx[bright] / 255., atol=1e-9)

    def test_gate_tat_han_duoi_nguong_va_lien_tuc(self):
        a, _ = slice_mod.glow_alpha(np.zeros((1, 1, 3)) + slice_mod.GLOW_GATE_LO)
        self.assertEqual(a[0, 0], 0.)
        ramp = np.stack([np.linspace(0, 60, 200)] * 3, axis=-1)[None, ...]
        a, _ = slice_mod.glow_alpha(ramp)
        d = np.diff(a[0])
        self.assertTrue((d >= -1e-12).all(), "gate phải đơn điệu tăng")
        self.assertLess(d.max(), .02, "gate có bậc nhảy → sinh contour trên quầng glow")

    def test_vong_xung_kich_xanh_bao_hoa_khong_bi_cat(self):
        """Bẫy của alpha = max(RGB): vùng kênh B trội phải giữ đúng năng lượng."""
        a, F = slice_mod.glow_alpha(self.reg)
        blue = (self.reg.argmax(axis=2) == 2) & (self.mx > 60)
        self.assertGreater(blue.sum(), 200)
        prem = (F * a[..., None])[blue]
        np.testing.assert_allclose(prem, self.reg[blue], atol=1.5)


if __name__ == "__main__":
    unittest.main()
