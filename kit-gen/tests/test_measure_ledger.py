import json
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from slicelib import load


slice_module = load()


class MeasureLedgerTest(unittest.TestCase):
    def make_asset(self):
        image = Image.new("RGBA", (160, 120), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        # Decoration giả, rời core/enamel: không được kéo safe-zone theo.
        draw.ellipse((4, 50, 20, 66), fill=(245, 80, 190, 255))
        # Viền giả vàng + ruột enamel tím, bám đúng mask của thí nghiệm.
        draw.rectangle((25, 25, 134, 94), fill=(215, 170, 40, 255))
        draw.rectangle((35, 35, 124, 84), fill=(100, 45, 200, 255))
        return image

    def test_core_enamel_bbox_tach_vien_gia_va_decor(self):
        result = slice_module.measure_asset_geometry(
            self.make_asset(), [35, 35, 90, 50], threshold=15
        )

        self.assertEqual(result["core"], [35, 35, 125, 85])
        self.assertEqual(result["enamel"], [25, 25, 135, 95])
        self.assertEqual(result["safe"], [35, 35, 90, 50])
        self.assertFalse(result["sizeDeviation"]["flagged"])
        self.assertEqual(result["sizeDeviation"]["maxEdgePx"], 0)

    def test_flag_bat_tat_nguong_va_khong_tu_gen_lai(self):
        exact_threshold = slice_module.measure_asset_geometry(
            self.make_asset(), [20, 20, 90, 50], threshold=15
        )
        self.assertEqual(exact_threshold["sizeDeviation"]["maxEdgePx"], 15)
        self.assertFalse(exact_threshold["sizeDeviation"]["flagged"], "đúng ngưỡng không cờ")

        over = slice_module.measure_asset_geometry(
            self.make_asset(), [19, 20, 90, 50], threshold=15
        )
        self.assertEqual(over["sizeDeviation"]["maxEdgePx"], 16)
        self.assertTrue(over["sizeDeviation"]["flagged"])
        self.assertEqual(over["sizeDeviation"]["threshold"], 15)
        self.assertEqual(
            over["sizeDeviation"]["edgesPx"],
            {"left": 16, "top": 15, "right": 16, "bottom": 15},
        )

    def test_measurement_json_chi_co_so_va_so_do(self):
        result = slice_module.measure_asset_geometry(self.make_asset(), [35, 35, 90, 50])
        encoded = json.dumps(result, ensure_ascii=False)
        self.assertNotIn(str(Path.cwd()), encoded)
        self.assertNotIn("/Users/", encoded)
        for key in ("core", "enamel", "safe", "contractSafe"):
            value = result[key]
            self.assertTrue(value is None or all(isinstance(item, int) for item in value))


if __name__ == "__main__":
    unittest.main()
