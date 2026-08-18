"""Production v16 grid/safe-zone steering tests.

These tests exercise the same JavaScript renderer used by gen.sh. They never
call image generation; only local SVG/PNG rendering is used.
"""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def node_json(expression, payload):
    script = (
        "require(process.env.SIL); require(process.env.SVGB);"
        "const value = " + expression + ";"
        "process.stdout.write(JSON.stringify(value));"
    )
    env = {
        **os.environ,
        "SIL": str(ROOT / "silhouettes.js"),
        "SVGB": str(ROOT / "skeleton-svg.js"),
        "PAYLOAD": json.dumps(payload),
    }
    # The payload is read from an environment variable inside the expression;
    # JSON is never interpolated into JavaScript source.
    script = script.replace("JSON.parse(process.env.PAYLOAD)", "JSON.parse(process.env.PAYLOAD)")
    proc = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if proc.returncode:
        raise AssertionError(proc.stderr)
    return json.loads(proc.stdout)


class GridBiasGeometryTest(unittest.TestCase):
    def test_v16_bias_is_absolute_px_not_percentage(self):
        expression = (
            "[globalThis.KITSKEL.compensationFor(300, 100),"
            " globalThis.KITSKEL.compensationFor(900, 300),"
            " globalThis.KITSKEL.compensationFor(430, 88, 'bar')]"
        )
        small, large, thin = node_json(expression, {})
        self.assertEqual(small["kind"], "rect")
        self.assertEqual(large["kind"], "rect")
        self.assertEqual(small["edges"], [14, 6, 19, 8])
        self.assertEqual(large["edges"], small["edges"])
        self.assertNotEqual(14 / 300, 14 / 900)
        self.assertEqual(thin["kind"], "bar")
        self.assertEqual(thin["edges"], [14, 7, 18, 5])

    def test_nine_element_layout_is_opt_in_by_contract_shape(self):
        nine = {
            "id": "nine",
            "grid": {"cols": 3, "rows": 3},
            "components": [
                {"skel": {"shape": "rrect", "w": 0.4, "h": 0.4}}
                for _ in range(9)
            ],
        }
        two = {
            "id": "two",
            "grid": {"cols": 2, "rows": 2},
            "components": nine["components"][:4],
        }
        result = node_json(
            "[globalThis.KITSKEL.isNineElementSheet(JSON.parse(process.env.PAYLOAD).nine),"
            " globalThis.KITSKEL.isNineElementSheet(JSON.parse(process.env.PAYLOAD).two)]",
            {"nine": nine, "two": two},
        )
        self.assertEqual(result, [True, False])

    def test_guides_never_escape_sheet_or_cell(self):
        sheet = {
            "id": "tight",
            "grid": {"cols": 2, "rows": 2},
            "gridGuide": True,
            "components": [
                {"skel": {"shape": "pill", "w": 0.98, "h": 0.98}},
                {"skel": {"shape": "circle", "w": 0.98, "h": 0.98}},
                {"skel": {"shape": "empty"}},
                {"skel": {"shape": "empty"}},
            ],
        }
        result = node_json(
            "[0,1].map(i => {"
            " const g = globalThis.KITSKEL.guideGeometry("
            "JSON.parse(process.env.PAYLOAD),"
            "JSON.parse(process.env.PAYLOAD).components[i], i);"
            " return {cell:g.cell, target:g.target, guide:g.guide, applied:g.applied};"
            "})",
            sheet,
        )
        for item in result:
            cell = item["cell"]
            target = item["target"]
            guide = item["guide"]
            self.assertGreaterEqual(guide["x"], cell["x"])
            self.assertGreaterEqual(guide["y"], cell["y"])
            self.assertLessEqual(guide["x"] + guide["width"], cell["x"] + cell["width"])
            self.assertLessEqual(guide["y"] + guide["height"], cell["y"] + cell["height"])
            self.assertLessEqual(guide["x"], target["x"])
            self.assertLessEqual(target["x"] + target["width"], guide["x"] + guide["width"])
            self.assertLessEqual(guide["y"], target["y"])
            self.assertLessEqual(target["y"] + target["height"], guide["y"] + guide["height"])


class GridRenderTest(unittest.TestCase):
    def test_rendered_fixture_has_sheet_size_and_gray_local_guides(self):
        contract = {
            "sheets": [{
                "id": "ui",
                "grid": {"cols": 2, "rows": 2},
                "gridGuide": True,
                "components": [
                    {"file": "01-btn-pill-red", "skel": {"shape": "pill", "w": 0.78, "h": 0.4}},
                    {"file": "04-btn-circle", "skel": {"shape": "circle", "w": 0.55, "h": 0.82, "free": True}},
                    {"file": "_empty-1", "skel": {"shape": "empty"}},
                    {"file": "_empty-2", "skel": {"shape": "empty"}},
                ],
            }]
        }
        with tempfile.TemporaryDirectory(prefix="kitgen-grid-test-") as td:
            cfg = Path(td, "styles.json")
            out = Path(td, "skeleton")
            cfg.write_text(json.dumps(contract), encoding="utf-8")
            proc = subprocess.run(
                ["node", str(ROOT / "render-skeleton.mjs"), str(cfg), str(out)],
                capture_output=True,
                text=True,
                env={**os.environ, "KITGEN_GRID_GUIDE": "v16"},
                check=False,
            )
            self.assertEqual(proc.returncode, 0, proc.stderr)
            image = Image.open(out / "ui.png").convert("RGB")
            self.assertEqual(image.size, (1536, 1024))
            # #c8c8c8 is the v16 local-guide ink; antialiasing may add neighbours.
            guide_pixels = sum(1 for pixel in image.getdata() if pixel == (200, 200, 200))
            self.assertGreater(guide_pixels, 1000)


if __name__ == "__main__":
    unittest.main()
