import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from safe_zone_asset import detect_button_safe, normalize_button  # noqa: E402


class SafeZoneAssetTest(unittest.TestCase):
    def test_detects_center_surface_without_counting_outer_decoration(self):
        image = Image.new("RGBA", (200, 120), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.ellipse((5, 35, 65, 95), fill=(245, 80, 190, 255))
        draw.ellipse((135, 35, 195, 95), fill=(245, 80, 190, 255))
        draw.rectangle((35, 30, 165, 90), fill=(215, 170, 40, 255))
        draw.rounded_rectangle((40, 34, 159, 85), radius=12, fill=(100, 45, 200, 255))

        safe = detect_button_safe(image)

        self.assertEqual(safe.as_tuple(), (40, 34, 160, 86))

    def test_normalize_maps_safe_zone_to_exact_logical_size_and_writes_figma_offsets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            output = root / "button@4x.png"
            manifest = root / "button.json"

            image = Image.new("RGBA", (200, 120), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.ellipse((5, 35, 65, 95), fill=(245, 80, 190, 255))
            draw.ellipse((135, 35, 195, 95), fill=(245, 80, 190, 255))
            draw.rectangle((35, 30, 165, 90), fill=(215, 170, 40, 255))
            draw.rounded_rectangle((40, 34, 159, 85), radius=12, fill=(100, 45, 200, 255))
            image.save(source)

            result = normalize_button(
                source,
                output,
                manifest,
                safe_width=120,
                safe_height=52,
                density=4,
                margin=2,
            )

            saved = Image.open(output)
            data = json.loads(manifest.read_text())
            safe = data["safeZone"]
            figma = data["figma"]

            self.assertEqual(saved.mode, "RGBA")
            self.assertEqual((safe["width"], safe["height"]), (480, 208))
            self.assertEqual(data["frame"], {"width": 120, "height": 52, "clipContent": False})
            self.assertEqual(data["fit"]["mode"], "uniform-height")
            self.assertEqual(data["fit"]["sourceAspectRatio"], data["fit"]["targetAspectRatio"])
            self.assertEqual(data["fit"]["aspectError"], 0)
            self.assertAlmostEqual(figma["image"]["x"], -safe["x"] / 4)
            self.assertAlmostEqual(figma["image"]["y"], -safe["y"] / 4)
            self.assertAlmostEqual(figma["image"]["width"], saved.width / 4)
            self.assertAlmostEqual(figma["image"]["height"], saved.height / 4)
            self.assertEqual(result["safeZone"], safe)
            self.assertEqual(saved.getpixel((0, 0))[3], 0)

    def test_rejects_wrong_skeleton_ratio_instead_of_squashing_artwork(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "too-wide.png"
            image = Image.new("RGBA", (240, 100), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((20, 30, 219, 69), radius=10, fill=(100, 45, 200, 255))
            image.save(source)

            with self.assertRaisesRegex(ValueError, "Không scale méo"):
                normalize_button(
                    source,
                    root / "out.png",
                    root / "out.json",
                    safe_width=120,
                    safe_height=52,
                    density=4,
                )

            self.assertFalse((root / "out.png").exists())
            self.assertFalse((root / "out.json").exists())

    def test_rejects_an_image_without_a_visible_center_surface(self):
        image = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "trung tâm"):
            detect_button_safe(image)


if __name__ == "__main__":
    unittest.main()
