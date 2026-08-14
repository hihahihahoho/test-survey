"""Hồi quy cho khâu HẬU KỲ alpha của slice.py (backlog P0-1).

Lỗi đã sửa: `out.paste(im, box, im)` dán ảnh RGBA lên canvas TRONG SUỐT và lấy
CHÍNH NÓ làm mask. PIL tính `out = out*(1−m) + im*m`, mà `out` trong suốt và
`m = a/255`, nên **alpha bị bình phương** (`a²/255`) và RGB bị premultiply vào
buffer straight-alpha. Mỗi asset đi qua 2 lần (`:897` rồi `:517`/`:559`) ⇒
`alpha⁴/255³`: pixel bán trong suốt trong lòng element bị bóp về 0 = LỖ THỦNG,
pixel gần đục tụt 30–60% = mảng rỗ lộ nền, kèm ám màu tối.

Bài test này chính là bài mà research đề xuất: "có test này thì lỗi không lọt"
(docs/research-hole-artifacts-2026-08.md §Backlog 2).
"""
import unittest
from PIL import Image

from slicelib import load

slice_mod = load()

RGB = (200, 100, 50)
# Đúng dải alpha mà research đo: 128 → 16 (thủng), 200 → 97 (rỗ lộ nền)
ALPHAS = [255, 250, 242, 230, 220, 200, 180, 160, 128, 100, 90, 60, 32]


def make_canvas(size=200, core=(50, 50, 150, 150)):
    """Khối đặc có RUỘT bán trong suốt ở những mức alpha đã biết."""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    l, t, r, b = core
    for y in range(t, b):
        for x in range(l, r):
            px[x, y] = RGB + (255,)
    for i, a in enumerate(ALPHAS):          # rải ruột bán trong suốt, cách nhau
        x, y = l + 10 + (i % 5) * 12, t + 10 + (i // 5) * 12
        px[x, y] = RGB + (a,)
    return im, [(l + 10 + (i % 5) * 12, t + 10 + (i // 5) * 12, a)
                for i, a in enumerate(ALPHAS)]


class AlphaPostProcessTest(unittest.TestCase):
    def assert_preserved(self, out, probes, dx, dy):
        px = out.load()
        for x, y, a in probes:
            got = px[x + dx, y + dy]
            self.assertEqual(got[3], a, f"alpha {a} tại ({x},{y}) ra {got[3]} "
                                        f"— dấu hiệu alpha bị bình phương")
            if a:                            # RGB không được premultiply
                self.assertEqual(got[:3], RGB, f"RGB tại alpha {a} bị nhân alpha: {got[:3]}")

    def test_align_content_safe_giu_nguyen_alpha(self):
        im, probes = make_canvas()
        safe = (20, 30, 100, 100)            # lệch tâm ⇒ buộc phải tịnh tiến
        out = slice_mod.align_content_safe(im, safe)
        self.assertIsNot(out, im, "test vô nghĩa nếu không có phép tịnh tiến nào")
        core = slice_mod.measure_core(im, coverage=0.9)
        dx = round(safe[0] + safe[2] / 2 - (core[0] + core[2]) / 2)
        dy = round(safe[1] + safe[3] / 2 - (core[1] + core[3]) / 2)
        self.assert_preserved(out, probes, dx, dy)

    def test_snap_to_safe_pose_chi_tinh_tien_va_giu_alpha(self):
        im, probes = make_canvas()
        sk = {"shape": "pose", "w": .5, "h": .5}   # pose KHÔNG resize (s = 1.0)
        safe = (20, 30, 100, 100)
        out = slice_mod.snap_to_safe(im, sk, safe)
        core = slice_mod.measure_core(im)
        dx = round(safe[0] + safe[2] / 2 - (core[0] + core[2]) / 2)
        dy = round(safe[1] + safe[3] / 2 - (core[1] + core[3]) / 2)
        self.assert_preserved(out, probes, dx, dy)

    def test_hai_chang_lien_tiep_khong_sinh_lo_thung(self):
        """Đúng đường đi thật của một asset: dán ô → snap → (align)."""
        im, probes = make_canvas()
        sk = {"shape": "pose", "w": .5, "h": .5}
        step1 = slice_mod.snap_to_safe(im, sk, (20, 30, 100, 100))
        step2 = slice_mod.align_content_safe(step1, (40, 20, 100, 100))
        hist = step2.getchannel("A").histogram()
        for a in ALPHAS:
            self.assertGreaterEqual(hist[a], 1,
                                    f"mất sạch pixel alpha={a} sau 2 chặng hậu kỳ")
        # alpha⁴: 128 → 16, 100 → 6, 90 → 4 … tức dồn hết xuống đáy histogram
        self.assertEqual(sum(hist[1:32]), 0, "xuất hiện pixel alpha rất thấp — "
                                             "alpha đang bị bóp (bình phương)")

    def test_alpha_composite_thay_paste_o_khau_dan_o(self):
        """Chứng minh cơ chế: paste-với-chính-mình bình phương alpha, còn
        alpha_composite giữ nguyên. Đây là khác biệt giữa hai bản code."""
        src = Image.new("RGBA", (16, 16), RGB + (128,))
        wrong = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        wrong.paste(src, (0, 0), src)
        right = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        right.alpha_composite(src, (0, 0))
        self.assertEqual(wrong.getpixel((0, 0))[3], 64)     # 128²/255 ≈ 64
        self.assertEqual(right.getpixel((0, 0)), RGB + (128,))


if __name__ == "__main__":
    unittest.main()
