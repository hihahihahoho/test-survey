"""Khoá đường render khung xương MỚI (BACKLOG #15): skeleton-svg.js + resvg-wasm.

Ba nhóm ca, mỗi nhóm khoá một thứ khác nhau:

  1. ``SvgBuilderTest`` — bộ dựng SVG. Ánh xạ từ 4 luật CSS cũ của skeleton.html
     phải đúng từng con số, đặc biệt là **+1px** (con ``position:absolute`` của
     ``.cell`` neo theo *padding box* vì .cell có border 1px). Bỏ sót đúng 1px này
     làm sai khác so với ảnh Playwright nhảy 1,64% → 2,63%.

  2. ``ViewerDriftTest`` — chống TRÔI. skeleton.html chỉ được là khung XEM: nó
     phải nhúng thẳng chuỗi SVG của bộ dựng, không được có luật CSS layout nào
     (resvg không đọc CSS của trang ⇒ thứ vẽ bằng CSS chỉ có trên màn hình, không
     có trong ảnh gửi cho codex). Cũng khoá luôn việc bản PIL không được quay lại.

  3. ``RenderIntegrationTest`` — render thật một sheet cố định rồi đo KÍCH THƯỚC
     và KHỐI LƯỢNG MỰC so với diện tích tính bằng tay. Cố ý KHÔNG so-bằng-bit với
     ảnh vàng: đổi bản resvg là răng cưa đổi ⇒ test đỏ oan (spike đo được toàn bộ
     1,30% khác-bit với Playwright là răng cưa, còn tổng mực chỉ lệch 0,009%).
"""
import json
import math
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BG = 242          # nền sheet #f2f2f2
FILL = 154        # silhouette #9a9a9a


def build_svgs(contract):
    """Chạy bộ dựng THẬT (Node) và trả list chuỗi SVG, một cho mỗi sheet."""
    script = (
        "require(process.env.SIL); require(process.env.SVGB);"
        "const cfg = JSON.parse(require('fs').readFileSync(process.env.CFG, 'utf8'));"
        "process.stdout.write(JSON.stringify(globalThis.KITSKEL.buildAll(cfg)));"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(contract, f)
        cfg_path = f.name
    try:
        env = {**os.environ, "SIL": str(ROOT / "silhouettes.js"),
               "SVGB": str(ROOT / "skeleton-svg.js"), "CFG": cfg_path}
        p = subprocess.run(["node", "-e", script], capture_output=True, text=True, env=env)
        if p.returncode != 0:
            raise AssertionError(f"bộ dựng SVG lỗi: {p.stderr}")
        return json.loads(p.stdout)
    finally:
        os.unlink(cfg_path)


def sheet(**over):
    s = {"id": "main", "grid": {"cols": 1, "rows": 1},
         "components": [{"file": "01-btn", "skel": {"shape": "rrect", "w": .5, "h": .5}}]}
    s.update(over)
    return s


def one(skel, **over):
    return sheet(components=[{"file": "01-x", "skel": skel}], **over)


class SvgBuilderTest(unittest.TestCase):
    """Bộ dựng SVG — hình học phải khớp từng con số với CSS cũ."""

    def svg(self, sh):
        return build_svgs({"sheets": [sh]})[0]["svg"]

    def test_landscape_va_portrait_dung_kho_anh_gen(self):
        land = self.svg(sheet())
        self.assertIn('width="1536" height="1024"', land)
        self.assertIn('viewBox="0 0 1536 1024"', land)
        port = self.svg(sheet(orient="portrait"))
        self.assertIn('width="1024" height="1536"', port)

    def test_nen_sheet_la_rect_f2f2f2_phu_kin(self):
        self.assertIn('<rect x="0" y="0" width="1536" height="1024" fill="#f2f2f2"/>',
                      self.svg(sheet()))

    def test_vien_o_inset_nua_pixel_vi_svg_ve_quanh_tam_net(self):
        """.cell { border: 1px } — SVG vẽ nét quanh TÂM nên phải lùi vào 0.5."""
        s = self.svg(sheet(grid={"cols": 2, "rows": 1}, components=[
            {"file": "a", "skel": {"shape": "empty"}},
            {"file": "b", "skel": {"shape": "empty"}}]))
        self.assertIn('<rect x="0.5" y="0.5" width="767" height="1023" fill="none" '
                      'stroke="#d9d9d9" stroke-width="1"/>', s)
        self.assertIn('<rect x="768.5" y="0.5" width="767" height="1023"', s)

    def test_CON_CUA_O_LECH_DUNG_1PX_vi_cell_co_border(self):
        """BẪY DUY NHẤT của cả bản chuyển đổi. Ô 1536×1024, skel 0.5×0.5:
        ew=768 eh=512, ex=384 ey=256 → gốc phải là (385, 257), KHÔNG phải (384, 256).
        """
        s = self.svg(one({"shape": "rrect", "w": .5, "h": .5}))
        self.assertIn('<g transform="translate(385 257)">', s)
        self.assertNotIn('translate(384 256)', s)

    def test_khung_safe_inset_2_rx_4_stroke_4(self):
        """.safe { border: 4px; border-radius: 6px; box-sizing: border-box }
        → tâm nét lùi vào 2, bán kính ngoài 6 − 2 = 4."""
        s = self.svg(one({"shape": "rrect", "w": .5, "h": .5}))
        self.assertIn('<rect x="387" y="259" width="764" height="508" rx="4" '
                      'fill="none" stroke="#464646" stroke-width="4"/>', s)

    def test_anchor_bottom_dung_cong_thuc_cua_skeleton_html(self):
        """ey = ch − eh − ch*0.04 = 1024 − 512 − 40.96 = 471.04 → +1px = 472.04"""
        s = self.svg(one({"shape": "rrect", "w": .5, "h": .5, "anchor": "bottom"}))
        self.assertIn('translate(385 472.04)', s)

    def test_dung_g_translate_chu_khong_phai_svg_long(self):
        """<svg> lồng CẮT phần trang trí tràn ra ngoài khung safe; CSS overflow:visible
        thì không. Chỉ được có ĐÚNG MỘT thẻ <svg> — thẻ gốc."""
        s = self.svg(one({"shape": "burst", "w": .5, "h": .5}))
        self.assertEqual(s.count("<svg"), 1)
        self.assertIn('<g transform="translate(', s)

    def test_empty_khong_ve_gi_ngoai_vien_o(self):
        s = self.svg(one({"shape": "empty"}))
        self.assertNotIn("<g transform", s)
        self.assertNotIn("#464646", s)

    def test_full_va_free_khong_co_khung_safe(self):
        self.assertNotIn("#464646", self.svg(one({"shape": "full", "w": 1, "h": 1})))
        self.assertNotIn("#464646", self.svg(one({"shape": "rrect", "w": .5, "h": .5, "free": True})))

    def test_pose_di_qua_silhouettes_js_chu_khong_ve_lai(self):
        s = self.svg(one({"shape": "pose", "pose": "wave", "w": .5, "h": .8}))
        self.assertIn("#e6194b", s)          # màu chi "neck→head" của bộ xương OpenPose
        self.assertGreater(s.count("<line"), 10)

    def test_mask_puzzle_khong_dung_id_giua_cac_sheet(self):
        """Khung xem nhét nhiều sheet vào CÙNG một trang HTML — trùng id thì
        url(#pz…) bắt nhầm mask của sheet trước."""
        pz = {"file": "p", "skel": {"shape": "puzzle", "w": .5, "h": .5}}
        out = build_svgs({"sheets": [sheet(id="a", components=[pz]),
                                     sheet(id="b", components=[pz])]})
        ids = [s["svg"][s["svg"].index('<mask id="'):][10:24] for s in out]
        self.assertNotEqual(ids[0], ids[1], f"id mask trùng nhau: {ids}")

    def test_deterministic_cung_contract_cung_chuoi(self):
        c = {"sheets": [one({"shape": "puzzle", "w": .5, "h": .5})]}
        self.assertEqual(build_svgs(c), build_svgs(c))


class ViewerDriftTest(unittest.TestCase):
    """skeleton.html là KHUNG XEM. Luật layout chỉ được nằm ở skeleton-svg.js."""

    def setUp(self):
        self.html = (ROOT / "skeleton.html").read_text(encoding="utf-8")
        self.css = self.html[self.html.index("<style>"):self.html.index("</style>")]

    def test_viewer_nhung_thang_chuoi_svg_cua_bo_dung(self):
        self.assertIn("skeleton-svg.js", self.html)
        self.assertIn("KITSKEL.sheetToSvg", self.html)

    def test_viewer_khong_con_luat_css_layout_nao(self):
        for banned in (".cell", ".safe", "position:", "border:", "1536px", "overflow"):
            self.assertNotIn(banned, self.css,
                             f"skeleton.html vẽ '{banned}' bằng CSS — resvg KHÔNG đọc CSS "
                             f"của trang, ảnh gửi codex sẽ khác cái nhìn thấy trên màn hình")

    def test_viewer_khong_tu_tinh_toa_do(self):
        body = self.html[self.html.index("<script>"):]
        # `sh.grid.cols/rows` được phép: đó là NHÃN chữ, không phải toạ độ.
        for banned in ("silhouette(", "anchor", ".skel", "orient"):
            self.assertNotIn(banned, body,
                             f"skeleton.html tự tính '{banned}' — hình học phải nằm trọn "
                             f"ở skeleton-svg.js, nếu không hai đường render sẽ trôi khỏi nhau")

    def test_ban_PIL_da_bi_xoa_va_khong_duoc_quay_lai(self):
        """skeleton.py lệch 17,6% khối lượng mực và vẽ sai hẳn dáng pose. Một đường
        lùi SAI còn tệ hơn không có đường lùi: nó hỏng im lặng."""
        self.assertFalse((ROOT / "skeleton.py").exists(), "skeleton.py đã quay lại")
        gen = (ROOT / "gen.sh").read_text(encoding="utf-8")
        # khoá LỜI GỌI, không khoá chữ: comment trong gen.sh có quyền nhắc tên file cũ
        self.assertNotIn("python3 skeleton.py", gen)
        self.assertIn("render-skeleton.mjs", gen)
        # nút "vẽ lại khung xương" của app phải đi cùng một renderer với gen.sh
        eng = (ROOT / "agent" / "lib" / "engine.mjs").read_text(encoding="utf-8")
        self.assertNotIn("skeleton.py\"", eng)
        self.assertIn("render-skeleton.mjs\"", eng)

    def test_gen_sh_dung_han_khi_render_hong(self):
        gen = (ROOT / "gen.sh").read_text(encoding="utf-8")
        block = gen[gen.index("if ! node render-skeleton.mjs"):]
        self.assertIn("exit 1", block[:400], "render hỏng phải dừng gen, không đi tiếp")


class RenderIntegrationTest(unittest.TestCase):
    """Render THẬT một sheet cố định rồi đo kích thước + khối lượng mực."""

    @classmethod
    def setUpClass(cls):
        probe = subprocess.run(
            ["node", "-e", "require.resolve('@resvg/resvg-wasm')"],
            capture_output=True,
            env={**os.environ, "NODE_PATH": os.path.expanduser("~/.kitgen/tools/node_modules")})
        if probe.returncode != 0:
            raise unittest.SkipTest(
                "chưa cài @resvg/resvg-wasm — chạy setup.sh, hoặc "
                "npm install --prefix ~/.kitgen/tools @resvg/resvg-wasm")

    def render(self, contract):
        """Chạy render-skeleton.mjs y như gen.sh gọi nó; trả {id: PIL.Image}."""
        tmp = tempfile.mkdtemp(prefix="kitgen-skel-")
        for f in ("silhouettes.js", "skeleton-svg.js", "render-skeleton.mjs"):
            Path(tmp, f).write_bytes((ROOT / f).read_bytes())
        Path(tmp, "styles.json").write_text(json.dumps(contract), encoding="utf-8")
        p = subprocess.run(["node", str(Path(tmp, "render-skeleton.mjs"))],
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, f"render lỗi: {p.stderr}")
        return {f.stem: Image.open(f).convert("RGB")
                for f in sorted(Path(tmp, "skeleton").glob("*.png"))}

    def ink_and_bbox(self, im):
        """Mực = độ phủ có trọng số (0..1 mỗi pixel), miễn nhiễm với răng cưa.
        bbox tính trên pixel đậm hơn hẳn nét lưới ô (#d9d9d9 lệch 25)."""
        px = im.load()
        W, H = im.size
        ink = 0.0
        x0, y0, x1, y1 = W, H, -1, -1
        for y in range(H):
            for x in range(W):
                r, g, b = px[x, y]
                d = max(abs(r - BG), abs(g - BG), abs(b - BG))
                if d > 30:
                    if x < x0: x0 = x
                    if x > x1: x1 = x
                    if y < y0: y0 = y
                    if y > y1: y1 = y
                ink += d / (BG - FILL)
        return ink, (x0, y0, x1 + 1, y1 + 1)

    def test_kich_thuoc_dung_kho_anh_gen(self):
        out = self.render({"sheets": [sheet(id="land"), sheet(id="port", orient="portrait")]})
        self.assertEqual(out["land"].size, (1536, 1024))
        self.assertEqual(out["port"].size, (1024, 1536))

    def test_muc_khop_dien_tich_tinh_tay_va_dung_vi_tri_1px(self):
        """Một ô, một hình bo góc ĐẶC (plain ⇒ không viền, không khung safe, không
        lưới trong lòng hình): diện tích tính được bằng tay nên không cần ảnh vàng.
        """
        im = self.render({"sheets": [one(
            {"shape": "rrect", "w": .5, "h": .5, "plain": True, "free": True}, id="solo")]})["solo"]
        ink, bbox = self.ink_and_bbox(im)

        ew, eh = 1536 * .5, 1024 * .5                 # 768 × 512
        r = min(ew, eh) / 6                            # rx của shape rrect
        body = ew * eh - (4 - math.pi) * r * r         # rect bo góc
        border = (1536 + 1024) * 2 * (25 / (BG - FILL))  # nét lưới quanh sheet, quy về mực
        expect = body + border
        self.assertLess(abs(ink - expect) / expect, 0.005,
                        f"mực {ink:.0f} lệch quá 0,5% so với {expect:.0f} tính tay")

        # +1px: ex=384 ey=256 nhưng con neo theo padding box ⇒ (385, 257).
        # So KHỚP TUYỆT ĐỐI: mọi cạnh rơi đúng biên pixel nguyên nên không có
        # khoảng dung sai nào để một lỗi off-by-one lẩn vào.
        self.assertEqual(bbox, (385, 257, int(385 + ew), int(257 + eh)))

    def test_render_lai_ra_dung_byte_cu(self):
        c = {"sheets": [one({"shape": "pose", "pose": "fly", "w": .6, "h": .9}, id="det")]}
        a = self.render(c)["det"].tobytes()
        b = self.render(c)["det"].tobytes()
        self.assertEqual(a, b, "render không deterministic — ảnh ref cho codex phải cố định")


if __name__ == "__main__":
    unittest.main()
