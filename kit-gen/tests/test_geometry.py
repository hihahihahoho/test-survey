"""geometry.py — MỘT PHÉP TÍNH, HAI NGƯỜI DÙNG.

╔══ CA NÀY THAY CHO test_skeleton_svg.py + test_grid_engine.py ═════════════════╗
║ Hai file đó đo bộ dựng ảnh khung xương (`skeleton-svg.js` + `@resvg/resvg-wasm`):║
║ SVG có đúng viền không, bóng xám lệch +1px chưa, khối lượng mực có khớp diện    ║
║ tích tính tay không. Khung xương đã bỏ hẳn 27/08/2026 — prompt nay IN THẲNG     ║
║ toạ độ — nên toàn bộ những phép đo ấy không còn đối tượng.                      ║
║                                                                                ║
║ Thứ thay thế chúng từng là: bốn con số prompt HỨA phải bằng bốn con số          ║
║ `slice.py` DÙNG để cắt — và hai bên đã lệch nhau đúng 1px suốt nhiều tháng mà   ║
║ không test nào đỏ.                                                             ║
║                                                                                ║
║ 14/09/2026 — LỜI HỨA ẤY ĐÃ RÚT. Đo r-0021: model vẽ đúng tâm, đúng ô, nhưng lõi ║
║ 587px trong một hộp hứa 368px; mọi ô lệch 1,5–1,7 lần, qua codex lẫn qua web    ║
║ ChatGPT. Toạ độ pixel không điều khiển được model — chúng chỉ làm loãng những   ║
║ câu nó đọc được. `geometry.py` vẫn là nguồn số học DUY NHẤT của dao cắt (mục 2  ║
║ và 4 dưới đây không đổi một dòng); chỉ có prompt là thôi đọc nó, và nói tỉ lệ.  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Bốn nhóm ca:
  1. ``CanvasTableTest``   — bảng khổ: ba khổ, `canvas` thắng `orient`, chữ lạ không ném.
  2. ``CellAndSafeBoxTest``— số học ô + safe zone, so với con số tính tay.
  3. ``PromptNoiTiLeChuKhongNoiPixelTest`` — 14/09/2026: prompt THÔI in toạ độ. Ca
     này khoá chiều ngược lại — không một hộp pixel nào lọt ra prompt nữa — và khoá
     phép mới: tỉ lệ in ra == tỉ lệ của `out` mà người dùng đặt.
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
                 # `out` = cỡ người dùng đặt. Từ 14/09/2026 đây là nguồn DUY NHẤT
                 # của câu hình học trong prompt (tỉ lệ W:H), nên tấm mẫu phải có.
                 "out": {"w": 245, "h": 85},
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


class PromptNoiTiLeChuKhongNoiPixelTest(unittest.TestCase):
    """PROMPT KHÔNG CÒN HỨA MỘT HỘP PIXEL NÀO, VÀ TỈ LỆ NÓ NÓI PHẢI ĐÚNG.

    Lớp này từng tên là `PromptMatchesSliceTest` và làm việc ngược lại: đọc toạ độ
    ra khỏi prompt rồi so với `geometry.safe_box`. Hai vế ấy khớp nhau tuyệt đối
    suốt — chỉ có điều người nhận lời hứa không thực hiện được nó (đo r-0021: lõi
    587px trên hộp hứa 368px, lệch 1,5–1,7 lần ở mọi ô, cả qua codex lẫn qua web
    ChatGPT). Nên nay có hai việc phải canh, và chúng là hai việc khác nhau:
      · CHIỀU ÂM — không một toạ độ nào lọt lại vào prompt (dễ tái phát: hộp có
        sẵn trong `geo`, nối thêm vào `spec` chỉ tốn một dòng);
      · CHIỀU DƯƠNG — tỉ lệ in ra phải là tỉ lệ của `out`, tức cỡ người dùng đặt,
        chứ không phải tỉ lệ của hộp max-fit trong ô (hai số ấy khác nhau, và lấy
        nhầm thì mọi element đều mang tỉ lệ của Ô).
    """

    ASPECT = re.compile(r"^(\d+)\) .*? — core aspect ([\d.]+):([\d.]+) \(([^)]*)\)", re.M)

    def setUp(self):
        self.cfg = sheet_3x3_square()
        self.txt = render_prompt(self.cfg, "demo-ui")

    def test_HOP_SAFE_ZONE_khong_quay_lai_nhung_HOP_O_thi_co(self):
        """15/09/2026 — CA NÀY ĐỔI CHIỀU MỘT NỬA, CÓ CHỦ Ý.

        Bản trước cấm SẠCH mọi cặp toạ độ. Lượt r-0040 đo ra cái giá của vế đó: tấm
        1254² lưới 2×2 (ô 627), banner ô 1 khai «core aspect 3.9:1» được vẽ liền
        một mạch từ x=46 tới x=864 — lấn 237px sang ô 2. Ở r-0021, lượt CÒN in hộp
        ô, không món nào lấn ô. Hai loại hộp không cùng số phận: hộp SAFE ZONE hứa
        một CỠ LÕI và model không thực hiện nổi; hộp Ô chỉ vạch một RANH GIỚI, và
        ranh giới thì nó giữ. Nên đúng MỘT hộp được quay lại, và chỉ hộp ấy."""
        for chet in ("safe zone x=", "stays inside x=", "drawn at", "final size",
                     "crop box"):
            self.assertNotIn(chet, self.txt, f"hộp safe zone quay lại prompt: {chet}")
        for dong in self.txt.splitlines():
            if re.search(r"x=\d+\.\.\d+", dong):
                self.assertIn("its cell is x=", dong,
                              f"một cặp toạ độ KHÔNG PHẢI hộp ô lọt vào prompt: {dong}")
        # Chín ô ⇒ chín hộp ô, không thừa không thiếu.
        self.assertEqual(self.txt.count(" — its cell is x="), 9)
        self.assertIn("its cell is x=0..418, y=0..418 (418x418 px); everything of this"
                      " element, rim and ornaments included, stays inside that cell",
                      self.txt)

    def test_moi_o_mang_ti_le_cua_out_chu_khong_phai_ti_le_cua_o(self):
        found = {int(m.group(1)): (float(m.group(2)), float(m.group(3)))
                 for m in self.ASPECT.finditer(self.txt)}
        self.assertEqual(len(found), 9, "thiếu ô nào là ô đó không có hợp đồng hình học")
        # 245x85 = 2,88 ⇒ 2.9:1. Tỉ lệ của Ô (hộp max-fit 0.5x0.345 trên ô vuông) là
        # 1,45 — nếu con số dưới đây hoá thành 1.4 thì engine đang đọc nhầm nguồn.
        for n, (a, b) in found.items():
            self.assertEqual((a, b), (2.9, 1.0), f"ô {n}: tỉ lệ không phải tỉ lệ của out")

    def test_ti_le_duoc_TA_BANG_CHU_chu_khong_chi_bang_ky_hieu(self):
        """«2.9:1» một mình là ký hiệu; model ảnh đọc câu chữ. Đây là cả lý do đổi
        cách nói, nên nó phải có ca riêng chứ không nấp trong regex ở trên."""
        m = self.ASPECT.search(self.txt)
        self.assertEqual(m.group(4), "about three times wider than tall")

    def test_o_CAO_HON_RONG_doi_ve_so_cho_model_de_doc(self):
        """0,625 là một con số; «1:1.6, taller than wide» là một hình dạng."""
        cfg = sheet_3x3_square()
        for c in cfg["sheets"][0]["components"]:
            c["out"] = {"w": 100, "h": 160}
        m = self.ASPECT.search(render_prompt(cfg, "demo-ui"))
        self.assertEqual((m.group(2), m.group(3), m.group(4)),
                         ("1", "1.6", "taller than wide"))

    def test_geometry_py_VAN_LA_nguon_cua_dao_cat_du_prompt_thoi_doc_no(self):
        """Prompt rút lui khỏi toạ độ KHÔNG có nghĩa là hình học bị bỏ: `slice.py`
        vẫn cắt theo đúng `geometry.safe_box`. Ca này là cái chốt giữ mục đích của
        cả file khi lớp trên đã đổi việc."""
        skel = self.cfg["sheets"][0]["components"][0]["skel"]
        self.assertEqual(geometry.safe_box(1254, 1254, 3, 3, 0, skel), (104, 137, 313, 281))

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


class DecorMarginTest(unittest.TestCase):
    """LỀ CỦA Ô CÓ TRANG TRÍ — hộp ô là giới hạn ngoài, và nó phải VỚI TỚI được.

    ╔══ BỆNH ĐÃ ĐO (dự án thật, 09/2026) ══════════════════════════════════════╗
    ║ Sheet `ui`, lưới 2x2 trên 1254px ⇒ ô 627px. Với lề 0,10 thì safe zone     ║
    ║ chiếm ~78% bề ngang ô, chừa vỏn vẹn ~68px mỗi bên — mà viền + đèn lồng +  ║
    ║ hoa của nấc «Nhiều» cần quãng 130px. Sổ đo `kits/manifest.json` nói thẳng:║
    ║ `overflowPx` bên phải của `01-button` = 69 và của `03-popover` = 77, tức  ║
    ║ trang trí CHẠM ĐÚNG mép ô và `slice.py` (crop theo `cell_box`) đã chém    ║
    ║ cụt nó. Cho ô có trang trí một lề gấp đôi là cho phần tràn chỗ để dừng.   ║
    ╚══════════════════════════════════════════════════════════════════════════╝
    """

    def test_o_khong_trang_tri_KHONG_doi_mot_pixel_nao(self):
        """Nửa quan trọng nhất của đợt này: ô cũ phải y nguyên."""
        self.assertEqual(geometry.cell_margin_ratio({}), geometry.CELL_MARGIN_RATIO)
        self.assertEqual(geometry.cell_margin_ratio({"decor": False}), geometry.CELL_MARGIN_RATIO)
        # Contract ĐỜI CŨ không có khoá `decor`, và `None` là ca `skel` thiếu hẳn.
        self.assertEqual(geometry.cell_margin_ratio(None), geometry.CELL_MARGIN_RATIO)
        self.assertEqual(geometry.cell_margin_ratio({"shape": "pill", "w": 0.8}),
                         geometry.CELL_MARGIN_RATIO)

    def test_o_co_trang_tri_chua_le_gap_doi(self):
        self.assertEqual(geometry.cell_margin_ratio({"decor": True}),
                         geometry.CELL_MARGIN_RATIO_DECOR)
        self.assertEqual(geometry.CELL_MARGIN_RATIO_DECOR, 0.20)

    def test_safe_zone_tut_tu_78_phan_tram_xuong_60_phan_tram_o(self):
        """Con số chủ sản phẩm chốt, đo trên ĐÚNG ô 627px của dự án thật."""
        cell = 627
        thuong = geometry.cell_inner(cell, cell, geometry.cell_margin_ratio({}))
        trang_tri = geometry.cell_inner(cell, cell, geometry.cell_margin_ratio({"decor": True}))
        self.assertAlmostEqual(thuong[0] / cell, 0.80, places=2)
        self.assertAlmostEqual(trang_tri[0] / cell, 0.60, places=2)
        # Chỗ chừa MỖI BÊN: 62px là chỗ đã chém cụt trang trí (overflowPx đo được 69 và
        # 77, tức vượt hẳn); 125px thì đủ cho một cái viền có đèn lồng bám quanh.
        self.assertEqual((cell - thuong[0]) // 2, 62)
        self.assertEqual((cell - trang_tri[0]) // 2, 125)

    def test_hop_ve_cua_o_trang_tri_nho_hon_va_van_dung_ti_le(self):
        for out_w, out_h in [(245, 85), (195, 195), (270, 207)]:
            w0, h0, _ = geometry.draw_box(627, 627, out_w, out_h,
                                          geometry.cell_margin_ratio({}))
            w1, h1, _ = geometry.draw_box(627, 627, out_w, out_h,
                                          geometry.cell_margin_ratio({"decor": True}))
            self.assertLess(w1, w0, f"{out_w}x{out_h}: hộp vẽ không nhỏ lại")
            self.assertAlmostEqual(w1 / h1, out_w / out_h,
                                   delta=max(0.06, out_w / out_h * 0.03))

    def test_phan_tram_dieu_khien_qua_HAM_chu_khong_qua_hang_roi(self):
        """`cell_inner`/`max_fit_box`/`draw_scale`/`draw_box` đều nhận `margin`, nên
        chỗ gọi chỉ cần đưa kết quả của MỘT hàm — không ai được tự chọn số."""
        src = (ROOT / "geometry.py").read_text(encoding="utf-8")
        self.assertIn("def cell_margin_ratio(skel):", src)
        for fn in ("cell_inner", "max_fit_box", "draw_scale", "draw_box"):
            self.assertIn(f"def {fn}(cell_w, cell_h", src)
            self.assertIn("margin=CELL_MARGIN_RATIO", src)


if __name__ == "__main__":
    unittest.main()
