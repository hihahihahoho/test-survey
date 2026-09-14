"""SỔ ĐO CỦA MỘT Ô — `measure_cell`: đo bằng NGƯỠNG ALPHA, không dò màu.

VÌ SAO FILE NÀY VIẾT LẠI (07/09/2026)
─────────────────────────────────────────────────────────────────────────────────
Bản cũ đo `core` / `enamel` / `decoration` bằng morphology + màu: erode rồi lấy
thành phần liên thông lớn nhất, có hẳn một nhánh riêng nhận diện "màu tím là men".
Trên ô thật `02-healthbar` (dự án `test-e0d4`) nó trả về lõi 212x107 cho một thanh
rộng 473px — sai 2,2 lần — rồi con số sai đó đi thẳng vào `safe` của manifest và
thành khung Figma. Ba trường `core`/`enamel`/`decoration` cũng không có một người
đọc nào trong agent lẫn webapp.

Nay: `safe` = bbox của pixel α ≥ 128 trên cả ô. Một phép, không có chỗ để đoán sai.
Ngưỡng 128 (chứ không phải 1) là thứ giữ cho quầng sáng tan dần và mặt kính α≈64
KHÔNG kéo hộp phình ra — nhưng chúng vẫn nằm nguyên trong ảnh, vì đây là phép ĐO
chứ không phải phép cắt.
"""
import unittest

from PIL import Image, ImageDraw

from slicelib import load

s = load()


def canvas(size=(200, 160)):
    return Image.new("RGBA", size, (0, 0, 0, 0))


class MeasureCellTest(unittest.TestCase):
    def test_safe_la_bbox_cua_pixel_duc(self):
        im = canvas()
        ImageDraw.Draw(im).rectangle((40, 30, 159, 129), fill=(100, 45, 200, 255))
        self.assertEqual(s.measure_cell(im, None)["safe"], [40, 30, 120, 100])

    def test_quang_sang_mo_KHONG_keo_hop_safe_phinh_ra(self):
        """Quầng α thấp là NỘI DUNG (nó ở lại trong ảnh) nhưng không phải LÕI."""
        im = canvas()
        d = ImageDraw.Draw(im)
        d.rectangle((10, 10, 189, 149), fill=(255, 220, 90, 64))    # quầng mờ phủ rộng
        d.rectangle((40, 30, 159, 129), fill=(100, 45, 200, 255))   # thân đục
        self.assertEqual(s.measure_cell(im, None)["safe"], [40, 30, 120, 100])
        # …và quầng vẫn còn nguyên: `content` (α > 0) ôm trọn nó.
        self.assertEqual(s.alpha_bbox(im), (10, 10, 190, 150))

    def test_o_hoan_toan_trong_suot_thi_khong_do_duoc(self):
        led = s.measure_cell(canvas(), [10, 10, 50, 50])
        self.assertIsNone(led["safe"])
        self.assertFalse(led["measured"])
        self.assertIsNone(led["sizeDeviation"]["maxEdgePx"])
        self.assertFalse(led["sizeDeviation"]["flagged"])

    def test_o_chi_co_pixel_MO_van_do_duoc_bang_duong_lui(self):
        """Ô kính rất trong (α < 128 khắp nơi) không được coi là ô trống."""
        im = canvas()
        ImageDraw.Draw(im).rectangle((40, 30, 159, 129), fill=(100, 45, 200, 64))
        self.assertEqual(s.measure_cell(im, None)["safe"], [40, 30, 120, 100])

    def test_lech_chi_tinh_MOT_PHIA_tran_ra_ngoai_khung_khong_phai_loi(self):
        """Trang trí được phép tràn khỏi khung; chỉ THIẾU vào trong khung mới là lỗi."""
        im = canvas()
        ImageDraw.Draw(im).rectangle((30, 20, 169, 139), fill=(100, 45, 200, 255))
        qa = s.measure_cell(im, [40, 30, 120, 100])["sizeDeviation"]
        self.assertEqual(qa["undershootPx"], {"left": 0, "top": 0, "right": 0, "bottom": 0})
        self.assertEqual(qa["overflowPx"], {"left": 10, "top": 10, "right": 10, "bottom": 10})
        self.assertEqual(qa["maxEdgePx"], 0)
        self.assertFalse(qa["flagged"])

    def test_lo_thieu_vao_trong_khung_thi_gan_co(self):
        im = canvas()
        ImageDraw.Draw(im).rectangle((70, 60, 129, 99), fill=(100, 45, 200, 255))
        qa = s.measure_cell(im, [40, 30, 120, 100], threshold=15)["sizeDeviation"]
        self.assertEqual(qa["undershootPx"], {"left": 30, "top": 30, "right": 30, "bottom": 30})
        self.assertEqual(qa["maxEdgePx"], 30)
        self.assertTrue(qa["flagged"])
        self.assertEqual(qa["threshold"], 15)

    def test_khong_co_khung_hop_dong_thi_khong_bia_ra_lech(self):
        """Ô `full` / kit đời cũ không có khung ⇒ `maxEdgePx` là None, KHÔNG phải 0."""
        im = canvas()
        ImageDraw.Draw(im).rectangle((40, 30, 159, 129), fill=(100, 45, 200, 255))
        qa = s.measure_cell(im, None)["sizeDeviation"]
        self.assertIsNone(qa["maxEdgePx"])
        self.assertFalse(qa["flagged"])

    def test_so_do_KHONG_sua_mot_pixel_nao(self):
        """Đo là đọc. Nếu phép đo ghi vào ảnh thì nó đã là phép cắt trá hình."""
        im = canvas()
        ImageDraw.Draw(im).rectangle((40, 30, 159, 129), fill=(100, 45, 200, 200))
        truoc = list(im.getdata())
        s.measure_cell(im, [40, 30, 120, 100])
        self.assertEqual(list(im.getdata()), truoc)


class AspectDeviationTest(unittest.TestCase):
    """LỆCH TỈ LỆ — CHỈ SỐ ĐO ĐÚNG THỨ PROMPT HỨA (14/09/2026).

    ╔══ VÌ SAO THÊM MỘT CHỈ SỐ NỮA THAY VÌ SIẾT CÁI CŨ ═══════════════════════════╗
    ║ `sizeDeviation` đo lõi so với HỘP HỨA bằng pixel. Từ 14/09/2026 prompt không ║
    ║ hứa hộp pixel nào nữa: đo r-0021 cho thấy model vẽ đúng tâm mà cỡ gấp        ║
    ║ 1,5–1,7 lần ở mọi ô (lõi 587px / hộp hứa 368px), qua codex lẫn qua web       ║
    ║ ChatGPT. Cỡ tuyệt đối nay do hạ nguồn lo — `slice.py` cắt theo ô, webapp co  ║
    ║ lõi đo được về `outSize`. Thứ hạ nguồn KHÔNG chữa được là tỉ lệ: co đồng     ║
    ║ dạng thì không méo, sai tỉ lệ thì chỉ còn cách chèn viền rỗng trong khung.   ║
    ╚═════════════════════════════════════════════════════════════════════════════╝
    """

    def test_ve_dung_ti_le_thi_lech_gan_0_du_CO_TO_GAP_DOI(self):
        """Ca trung tâm: một lõi to gấp đôi nhưng ĐÚNG DÁNG phải qua. Đây chính là
        thứ `sizeDeviation` gắn cờ và `aspectDeviation` thì không — hai câu hỏi
        khác nhau, nên hai số."""
        qa = s.aspect_deviation([0, 0, 490, 170], {"w": 245, "h": 85})
        self.assertLess(qa["value"], 0.001)
        self.assertFalse(qa["flagged"])
        self.assertEqual((qa["safeAspect"], qa["outAspect"]), (2.8824, 2.8824))

    def test_ve_sai_dang_thi_gan_co_du_CO_DUNG_KHIT(self):
        """Chiều ngược lại: đúng cỡ, sai dáng. 245x85 (2,88:1) vẽ thành 245x120
        (2,04:1) ⇒ lệch 29% — co về khung thì hoặc méo hoặc phải chèn viền rỗng."""
        qa = s.aspect_deviation([0, 0, 245, 120], {"w": 245, "h": 85})
        self.assertAlmostEqual(qa["value"], 0.2917, places=3)
        self.assertTrue(qa["flagged"])

    def test_nguong_la_15_phan_tram_va_no_nam_o_MOT_CHO(self):
        self.assertEqual(s.ASPECT_DEVIATION_THRESHOLD, 0.15)
        self.assertFalse(s.aspect_deviation([0, 0, 280, 85], {"w": 245, "h": 85})["flagged"])
        self.assertTrue(s.aspect_deviation([0, 0, 300, 85], {"w": 245, "h": 85})["flagged"])

    def test_thieu_out_hoac_thieu_lo_thi_KHONG_bia_ra_lech(self):
        """Ô `full`, ô chưa đặt cỡ, ô trong suốt hoàn toàn: `value` là None chứ
        không phải 0 — "không đo được" không phải là "đạt"."""
        for safe, out in (([0, 0, 245, 85], None), (None, {"w": 245, "h": 85}),
                          ([0, 0, 245, 0], {"w": 245, "h": 85}),
                          ([0, 0, 245, 85], {"w": 0, "h": 85})):
            qa = s.aspect_deviation(safe, out)
            self.assertIsNone(qa["value"], (safe, out))
            self.assertFalse(qa["flagged"])

    def test_measure_cell_mang_ca_HAI_so_do(self):
        """Webapp đang đọc `sizeDeviation`; thêm số mới mà làm mất số cũ là làm vỡ
        màn kết quả để nói một điều mà thêm một khoá cũng nói được."""
        im = canvas()
        ImageDraw.Draw(im).rectangle((40, 30, 159, 129), fill=(100, 45, 200, 255))
        led = s.measure_cell(im, [40, 30, 120, 100], out={"w": 240, "h": 200})
        self.assertEqual(led["sizeDeviation"]["maxEdgePx"], 0)
        self.assertEqual(led["aspectDeviation"]["value"], 0.0)
        self.assertEqual(led["aspectDeviation"]["metric"], "core_aspect")

    def test_tong_hop_cua_ca_bo_dem_dung_so_o_bi_co(self):
        assets = [
            {"file": "a.png", "aspectDeviation": s.aspect_deviation([0, 0, 245, 120],
                                                                    {"w": 245, "h": 85})},
            {"file": "b.png", "aspectDeviation": s.aspect_deviation([0, 0, 490, 170],
                                                                    {"w": 245, "h": 85})},
            {"file": "c.png", "aspectDeviation": s.aspect_deviation(None, None)},
        ]
        tong = s.summarize_aspect_deviation(assets, style_id="tet")
        self.assertEqual((tong["measured"], tong["flaggedCount"]), (2, 1))
        self.assertTrue(tong["flagged"])
        self.assertEqual(tong["flaggedAssets"][0]["file"], "a.png")
        self.assertEqual(tong["flaggedAssets"][0]["style"], "tet")
        self.assertAlmostEqual(tong["maxValue"], 0.2917, places=3)


if __name__ == "__main__":
    unittest.main()
