"""geometry.py — MỘT PHÉP TÍNH, HAI NGƯỜI DÙNG.

╔══ CA NÀY THAY CHO test_skeleton_svg.py + test_grid_engine.py ═════════════════╗
║ Hai file đó đo bộ dựng ảnh khung xương (`skeleton-svg.js` + `@resvg/resvg-wasm`):║
║ SVG có đúng viền không, bóng xám lệch +1px chưa, khối lượng mực có khớp diện    ║
║ tích tính tay không. Khung xương đã bỏ hẳn 27/08/2026 — prompt nay IN THẲNG     ║
║ toạ độ — nên toàn bộ những phép đo ấy không còn đối tượng.                      ║
║                                                                                ║
║ Thứ THAY THẾ chúng, và là thứ đắt hơn hẳn: bốn con số mà prompt HỨA với model   ║
║ phải bằng đúng bốn con số mà `slice.py` DÙNG để cắt. Bản cũ không có cách nào   ║
║ kiểm điều đó — một bên là hình ảnh, một bên là số — và hai bên đã lệch nhau     ║
║ đúng 1px suốt nhiều tháng (`skeleton-svg.js` cộng CELL_BORDER, `slice.py` thì   ║
║ không) mà không một test nào đỏ.                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

Bốn nhóm ca:
  1. ``CanvasTableTest``   — bảng khổ: ba khổ, `canvas` thắng `orient`, chữ lạ không ném.
  2. ``CellAndSafeBoxTest``— số học ô + safe zone, so với con số tính tay.
  3. ``PromptMatchesSliceTest`` — TRÙNG KHỚP: toạ độ đọc ra từ prompt THẬT của `gen.sh`
     == toạ độ `slice.py` tính. Đây là ca đắt nhất của file.
  4. ``SliceUsesTheModuleTest`` — `slice.py` phải GỌI module, không được chép công thức.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import geometry                                                   # noqa: E402


def render_prompt(cfg, job):
    """Chạy ĐÚNG khối python đang ship trong gen.sh, trả chính văn prompt.

    Trích từ file thật chứ không chép lại: chép lại là test xanh mà sản phẩm đỏ.
    """
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        Path(td, "styles.json").write_text(json.dumps(cfg), encoding="utf-8")
        Path(td, "prompts").mkdir()
        shutil.copy(ROOT / "geometry.py", Path(td, "geometry.py"))
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "geom_test"})
            return Path(td, "prompts", f"{job}.txt").read_text(encoding="utf-8")
        finally:
            os.chdir(cwd)


def sheet_3x3_square(w=0.5, h=0.345):
    """Tấm mẫu của đề bài: 3×3 trên khổ VUÔNG 1254 ⇒ ô 418×418 chẵn."""
    return {
        "styles": [{"id": "demo", "style": "flat ink"}],
        "sheets": [{
            "id": "ui", "canvas": "square", "grid": {"cols": 3, "rows": 3},
            "components": [
                {"file": f"{i + 1:02d}-x", "spec": f"element {i + 1}",
                 "skel": {"shape": "rrect", "w": w, "h": h}}
                for i in range(9)
            ],
        }],
    }


class CanvasTableTest(unittest.TestCase):
    def test_du_ba_kho_va_kem_ca_chuoi_header(self):
        """Header là DÒNG ĐẦU prompt, và `run_one` (bash) grep ngược nó để biết phải
        xin model khổ nào. Con số và chuỗi phải nằm cùng một dòng bảng, không thì
        sửa một cái mà quên cái kia là hỏng lặng lẽ."""
        self.assertEqual(set(geometry.CANVAS), {"landscape", "portrait", "square"})
        self.assertEqual(geometry.CANVAS["square"], (1254, 1254, "SQUARE 1254x1254", "square 1:1"))

    def test_canvas_thang_orient_va_chu_la_roi_ve_landscape(self):
        self.assertEqual(geometry.canvas_of({"canvas": "square"})[:2], (1254, 1254))
        self.assertEqual(geometry.canvas_of({"canvas": "square", "orient": "portrait"})[:2], (1254, 1254))
        self.assertEqual(geometry.canvas_of({"orient": "portrait"})[:2], (1024, 1536))
        self.assertEqual(geometry.canvas_of({})[:2], (1536, 1024))
        # Gõ sai một chữ không được giết cả lượt gen.
        self.assertEqual(geometry.canvas_of({"canvas": "squre"})[:2], (1536, 1024))


class CellAndSafeBoxTest(unittest.TestCase):
    def test_o_vuong_1254_chia_3_ra_418_chan(self):
        self.assertEqual(geometry.cell_size(1254, 1254, 3, 3), (418, 418))
        self.assertEqual(geometry.cell_box(1254, 1254, 3, 3, 0), (0, 0, 418, 418))
        self.assertEqual(geometry.cell_box(1254, 1254, 3, 3, 4), (418, 418, 836, 836))
        self.assertEqual(geometry.cell_box(1254, 1254, 3, 3, 8), (836, 836, 1254, 1254))

    def test_o_khong_chia_het_van_bam_mep_khong_troi(self):
        """1536/5 = 307,2. Cộng dồn `col * CW` sẽ làm ô cuối kết thúc ở 1535; làm tròn
        từ toạ độ thật thì ô cuối bắt đầu ở 1229 và phủ tới 1536."""
        cw, _ch = geometry.cell_size(1536, 1024, 5, 1)
        self.assertEqual(cw, 307)
        self.assertEqual(geometry.cell_box(1536, 1024, 5, 1, 4)[0], 1229)
        self.assertEqual(geometry.cell_box(1536, 1024, 5, 1, 4)[2], 1536)

    def test_safe_box_can_giua_o(self):
        # ô 418×418, skel 0.5×0.345 ⇒ sw = 209, sh = round(418*0.345) = 144
        # lệch = (418-209)//2 = 104 và (418-144)//2 = 137
        box = geometry.safe_box(1254, 1254, 3, 3, 0, {"shape": "rrect", "w": 0.5, "h": 0.345})
        self.assertEqual(box, (104, 137, 313, 281))
        # ô số 5 (hàng 2, cột 2) = ô số 1 dịch đúng một ô
        box5 = geometry.safe_box(1254, 1254, 3, 3, 4, {"shape": "rrect", "w": 0.5, "h": 0.345})
        self.assertEqual(box5, (104 + 418, 137 + 418, 313 + 418, 281 + 418))

    def test_anchor_bottom_day_xuong_day_chua_4_phan_tram(self):
        # dy = CH - sh - round(CH*0.04) = 418 - 209 - 17 = 192
        box = geometry.safe_box(1254, 1254, 3, 3, 0, {"shape": "figure", "w": 0.5, "h": 0.5,
                                                      "anchor": "bottom"})
        self.assertEqual(box[1], 192)
        self.assertEqual(box[3], 192 + 209)

    def test_contentSafe_da_chet_KHONG_con_de_len_skel(self):
        """GUARD ÂM. `contentSafe` (vùng chữ/hitbox khai riêng w/h, đời thử nghiệm) đã bỏ:
        không app, thư viện element hay bộ dựng contract nào phát ra nó nữa. Nếu một
        contract đời cũ còn mang nó thì nó phải bị BỎ QUA, không được đè lên skel w/h —
        đọc nó lại là dựng lại hai nguồn sự thật cho cùng một hộp cắt."""
        skel = {"shape": "rrect", "w": 0.5, "h": 0.5, "contentSafe": {"w": 0.9, "h": 0.9}}
        self.assertEqual(geometry.safe_box(1254, 1254, 3, 3, 0, skel),
                         geometry.safe_box(1254, 1254, 3, 3, 0,
                                           {"shape": "rrect", "w": 0.5, "h": 0.5}))
        self.assertFalse(hasattr(geometry, "safe_spec_of"))

    def test_o_full_va_o_trong_KHONG_co_safe_zone(self):
        """Không có khung nào để hứa: `full` phủ kín ô, `empty` không vẽ gì. Trả `None`
        chứ không trả hộp bằng cả ô — hứa một hộp cắt ở đó là mời model vẽ viền."""
        cfg = sheet_3x3_square()
        cfg["sheets"][0]["components"][0]["skel"] = {"shape": "full", "w": 1, "h": 1}
        cfg["sheets"][0]["components"][1]["skel"] = {"shape": "empty"}
        cfg["sheets"][0]["components"][2]["skel"] = {"shape": "rrect", "w": 0.5, "h": 0.5,
                                                     "free": True}
        geo = geometry.sheet_geometry(cfg["sheets"][0])
        self.assertEqual(geo[0]["kind"], "full")
        self.assertIsNone(geo[0]["safe"])
        self.assertEqual(geo[1]["kind"], "empty")
        self.assertIsNone(geo[1]["safe"])
        # GUARD ÂM: `free` KHÔNG còn là một loại ô. `slice.py` chưa bao giờ có nhánh
        # "bám lõi đo được" — mọi ô không full-bleed đều bị cắt theo safe zone — nên
        # cờ ấy phải rơi về "safe" thay vì đẻ ra một loại mà dao cắt không biết.
        self.assertEqual(geo[2]["kind"], "safe")
        self.assertEqual(geo[2]["safe"],
                         geometry.safe_box(1254, 1254, 3, 3, 2,
                                           {"shape": "rrect", "w": 0.5, "h": 0.5}))

    def test_row_col_dem_tu_1_cho_nguoi_index_dem_tu_0_cho_may(self):
        geo = geometry.sheet_geometry(sheet_3x3_square()["sheets"][0])
        self.assertEqual((geo[0]["row"], geo[0]["col"]), (1, 1))
        self.assertEqual((geo[4]["row"], geo[4]["col"]), (2, 2))
        self.assertEqual((geo[8]["row"], geo[8]["col"]), (3, 3))
        self.assertEqual([g["index"] for g in geo], list(range(9)))


class PromptMatchesSliceTest(unittest.TestCase):
    """CA ĐẮT NHẤT CỦA FILE: prompt hứa gì thì dao cắt phải cắt đúng đó.

    Đọc ngược toạ độ RA KHỎI prompt thật (bằng regex, y như một người đọc), rồi so với
    `geometry.safe_box`. `slice.py` gọi cùng hàm ấy (ca `SliceUsesTheModuleTest` khoá
    điều đó), nên bằng nhau ở đây nghĩa là bằng nhau tới tận pixel cuối cùng.
    """

    ZONE = re.compile(
        r"^(\d+)\) .*? — safe zone x=(\d+)\.\.(\d+), y=(\d+)\.\.(\d+) \((\d+)x(\d+) px\)",
        re.M)

    def zones_of(self, txt):
        out = {}
        for m in self.ZONE.finditer(txt):
            n, x0, x1, y0, y1, w, h = (int(g) for g in m.groups())
            out[n] = (x0, y0, x1, y1)
            self.assertEqual((x1 - x0, y1 - y0), (w, h),
                             f"ô {n}: kích thước in ra không khớp chính hai đầu mút của nó")
        return out

    def test_3x3_vuong_moi_o_dung_so(self):
        cfg = sheet_3x3_square()
        zones = self.zones_of(render_prompt(cfg, "demo-ui"))
        self.assertEqual(len(zones), 9, "thiếu ô nào là ô đó không có hợp đồng hình học")
        skel = cfg["sheets"][0]["components"][0]["skel"]
        for i in range(9):
            self.assertEqual(zones[i + 1], geometry.safe_box(1254, 1254, 3, 3, i, skel),
                             f"ô {i + 1}: prompt hứa một hộp, geometry tính một hộp khác")
        # và con số cụ thể của ô đầu — để một thay đổi âm thầm trong công thức không
        # thể "đúng với chính nó" mà vẫn sai với thực tế.
        self.assertEqual(zones[1], (104, 137, 313, 281))

    def test_kho_ngang_va_kho_doc_cung_khop(self):
        for canvas, (W, H) in (("landscape", (1536, 1024)), ("portrait", (1024, 1536))):
            cfg = sheet_3x3_square()
            cfg["sheets"][0]["canvas"] = canvas
            zones = self.zones_of(render_prompt(cfg, "demo-ui"))
            skel = cfg["sheets"][0]["components"][0]["skel"]
            for i in range(9):
                self.assertEqual(zones[i + 1], geometry.safe_box(W, H, 3, 3, i, skel),
                                 f"{canvas} ô {i + 1} lệch")

    def test_anchor_bottom_di_toi_tan_prompt(self):
        """Nhánh dễ bị bỏ quên nhất, vì nó chỉ khác căn giữa ở TRỤC DỌC — lệch ở đây
        không nhìn ra bằng mắt trên một tấm prompt, chỉ hiện ra khi asset bị cắt cụt."""
        cfg = sheet_3x3_square()
        cfg["sheets"][0]["components"][0]["skel"] = {"shape": "figure", "w": 0.5, "h": 0.5,
                                                     "anchor": "bottom"}
        zones = self.zones_of(render_prompt(cfg, "demo-ui"))
        comps = cfg["sheets"][0]["components"]
        self.assertEqual(zones[1], geometry.safe_box(1254, 1254, 3, 3, 0, comps[0]["skel"]))
        self.assertNotEqual(zones[1][1], zones[3][1], "neo đáy phải KHÁC căn giữa")

    def test_prompt_khong_con_mot_chu_nao_ve_khung_xuong(self):
        txt = render_prompt(sheet_3x3_square(), "demo-ui")
        # "gray" nằm trong danh sách vì MỌI câu cũ đều gọi tên màu của bóng khung xương
        # ("the gray silhouette", "gray fills", "their gray colour"). Không còn tấm nào
        # để mà xám, nên còn chữ đó là còn một câu trỏ vào hư không.
        for chet in ("skeleton", "silhouette", "attached image is the geometry",
                     "guide box", "gray", "INNER CROP BOX"):
            self.assertNotIn(chet, txt, f"prompt còn dấu vết khung xương: {chet}")


class SliceUsesTheModuleTest(unittest.TestCase):
    """`slice.py` phải GỌI module, không được chép công thức ra.

    Quét mã nguồn chứ không chạy `slice.py` (nó cần Pillow + một tấm PNG thật). Đây là
    ca chống TÁI PHÁT: cả sự cố lệch-1px sinh ra từ đúng một thói quen — viết lại
    `round(col * cell_w)` ngay tại chỗ cho tiện.
    """

    def setUp(self):
        self.src = (ROOT / "slice.py").read_text(encoding="utf-8")

    def test_goi_dung_ba_ham_cua_module(self):
        for goi in ("import geometry",
                    "geometry.cell_size(W, H, COLS, ROWS)",
                    "geometry.cell_origin(W, H, COLS, ROWS, idx)",
                    "geometry.safe_offset_in_cell(CW, CH, sk)"):
            self.assertIn(goi, self.src, f"slice.py phải gọi {goi}")

    def test_khong_con_cong_thuc_chep_tay(self):
        code = re.sub(r"#.*", "", self.src)      # bỏ chú thích: chúng được quyền trích lại
        for chep in ('round(col * cell_w)', 'round(CW * sk["w"]', 'round(CH * 0.04)'):
            self.assertNotIn(chep, code,
                             f"slice.py chép lại công thức {chep!r} — bản thật ở geometry.py")

    def test_bang_CANVAS_dan_xuat_chu_khong_chep(self):
        self.assertIn("geometry.CANVAS.items()", self.src)
        self.assertNotIn('"landscape": (1536, 1024)', re.sub(r"#.*", "", self.src))


class MaxFitBoxTest(unittest.TestCase):
    """HỘP VẼ = MAX-FIT, không còn là cỡ người dùng chọn.

    Chủ sản phẩm 07/09/2026: *«nó chỉ cần vẽ đúng tỉ lệ, để tối đa độ phân giải —
    còn việc co về của Figma là của code»*. Nên ô luôn được lấp bằng hộp lớn nhất
    vừa lề, và cỡ người dùng chọn chỉ còn hai vai: cho ra TỈ LỆ ở đây, và đi vào
    manifest thành `outSize` cho tầng xuất.
    """

    def test_khung_trong_va_hop_lon_nhat(self):
        # Con số chủ sản phẩm nêu: ô 313 ⇒ hộp vuông ~250², thanh 3,9:1 ⇒ ~250x64.
        self.assertEqual(geometry.cell_inner(313, 313), (250, 250))
        self.assertEqual(geometry.max_fit_box(313, 313, 1.0), (250, 250))
        self.assertEqual(geometry.max_fit_box(313, 313, 3.909), (250, 64))
        # Ô KHÔNG VUÔNG vẫn phải ra hộp nằm gọn theo CẢ HAI cạnh.
        w, h = geometry.max_fit_box(384, 256, 3.0)
        self.assertLessEqual(w, geometry.cell_inner(384, 256)[0])
        self.assertLessEqual(h, geometry.cell_inner(384, 256)[1])

    def test_he_so_lam_tron_xuong_buoc_025(self):
        # 502/120 = 4,18 ⇒ 4,0. Làm tròn LÊN (4,25) là cho hộp vượt lề.
        self.assertEqual(geometry.draw_scale(627, 627, 120, 52), 4.0)
        self.assertEqual(geometry.draw_box(627, 627, 120, 52), (480, 208, 4.0))
        # Bội của 0,25 khi k >= 1 (số model đọc được: "drawn at 2.5x"); dưới 1 thì
        # bước 0,05 vì bước 0,25 ở dải ấy phí tới một phần tư diện tích ô.
        for out_w, out_h in [(120, 52), (195, 195), (40, 40), (250, 90)]:
            k = geometry.draw_scale(313, 313, out_w, out_h)
            self.assertGreaterEqual(k, 1)
            self.assertAlmostEqual(k * 4, round(k * 4), places=6,
                                   msg=f"{out_w}x{out_h}: {k} không phải bội của 0,25")
        k = geometry.draw_scale(313, 313, 304, 78)
        self.assertAlmostEqual(k * 20, round(k * 20), places=6)

    def test_khong_bao_gio_tran_le_va_khong_meo_ti_le(self):
        aw, ah = geometry.cell_inner(313, 313)
        for out_w, out_h in [(120, 52), (195, 195), (304, 78), (8, 4096), (1254, 1254)]:
            w, h, _k = geometry.draw_box(313, 313, out_w, out_h)
            self.assertLessEqual(w, aw, f"{out_w}x{out_h} tràn lề ngang")
            self.assertLessEqual(h, ah, f"{out_w}x{out_h} tràn lề dọc")
            # Tỉ lệ là thứ DUY NHẤT ta thật sự yêu cầu ở máy vẽ — nó không được méo.
            self.assertAlmostEqual(w / h, out_w / out_h, delta=max(0.06, out_w / out_h * 0.03))

    def test_co_dau_ra_lon_hon_o_thi_he_so_tut_duoi_1(self):
        # Bản chốt đầu tiên nói "k >= 1, hộp = min(out, box)"; `min` từng trục bóp
        # thanh 3,9:1 thành 3,2:1 ⇒ bỏ, xem khối chú thích của `draw_box`.
        w, h, k = geometry.draw_box(313, 313, 304, 78)
        self.assertLess(k, 1)
        self.assertAlmostEqual(w / h, 304 / 78, delta=0.2)


if __name__ == "__main__":
    unittest.main()
