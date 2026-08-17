"""Test khối dựng prompt của gen.sh (backlog P2-10 + mục 5).

gen.sh nhúng một khối Python heredoc. Test nạp ĐÚNG mã đang ship (cắt tới ngay
trước vòng lặp dựng prompt) chứ không chép lại — chép lại là test xanh mà sản
phẩm đỏ.
"""
import contextlib, io, json, os, re, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_gen_block():
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    head = block.split('for s in cfg["styles"]:')[0]        # bỏ vòng dựng prompt
    ns = {"__name__": "gen_block"}
    cwd = os.getcwd()
    os.chdir(ROOT)                                          # khối đọc styles.json
    try:
        exec(compile(head, "gen.sh:PY", "exec"), ns)
    finally:
        os.chdir(cwd)
    return ns


def render_prompt_files(cfg):
    """Chạy đúng heredoc dựng prompt của gen.sh trong workspace tạm."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        Path(td, "styles.json").write_text(json.dumps(cfg), encoding="utf-8")
        Path(td, "prompts").mkdir()
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
            return Path(td, "prompts", "demo-pose-demo.att").read_text(encoding="utf-8").splitlines()
        finally:
            os.chdir(cwd)


gen = load_gen_block()


class StripFinishTest(unittest.TestCase):
    """Nhiễm kết cấu 3D vào sheet element (dự án thật hello-368a).

    Art style của dự án là ảnh ref UI kiếm hiệp MỰC HOẠ PHẲNG. Sheet `nen` và
    `pose-*` (spec không có chữ vật liệu) ra đúng mực hoạ phẳng; sheet `ui` và
    `dao-cu` ra NHỰA BÓNG 3D — nút viên nang đỏ kẹo vành bevel, nút tròn mái vòm,
    mảnh ghép đùn khối. Khác nhau đúng ở chỗ dòng ô có chữ 'glossy 3D … bevel'
    hay không. Câu "do NOT paint them" không gỡ được mồi ⇒ phải XOÁ chữ."""

    def strip(self, spec):
        return gen["strip_finish"](spec)[0]

    def test_tu_be_mat_bien_mat_khoi_cau(self):
        got = self.strip("glossy 3D candy-red capsule button, wide pill shape, "
                         "soft white top highlight, darker red bevel rim, blank face")
        for w in ("glossy", "3D", "candy", "bevel"):
            self.assertNotIn(w.lower(), got.lower(), f"{w} vẫn còn trong spec")

    def test_hinh_dang_va_trang_thai_con_nguyen(self):
        got = self.strip("glossy 3D candy-red capsule button, wide pill shape, "
                         "soft white top highlight, darker red bevel rim, blank face")
        for w in ("capsule", "button", "wide pill shape", "rim", "blank face"):
            self.assertIn(w, got, f"mất hợp đồng hình học: {w}")

    def test_giu_vai_mau_trong_tu_ghep(self):
        """'candy-red' → 'red': bỏ kết cấu, GIỮ vai màu để ô còn phân biệt được."""
        self.assertIn("red", self.strip("glossy 3D candy-red capsule button"))

    def test_khong_dung_vao_mau_phan_biet_o(self):
        """45/46/47-rank-badge chỉ khác nhau ở GOLD/SILVER/BRONZE — xoá là mất ô."""
        for w in ("GOLD", "SILVER", "BRONZE"):
            spec = f"the SAME glossy 3D medal badge in {w} for this place"
            self.assertIn(w, self.strip(spec))

    def test_khong_lat_nguoc_menh_lenh_phu_dinh(self):
        """'no gloss', 'NO metal or gold rim' — xoá danh từ sau `no` là lật nghĩa."""
        got = self.strip("the SAME capsule button in DISABLED state: flat "
                         "desaturated grey, matte, no gloss")
        self.assertIn("no gloss", got)
        got2 = self.strip("smooth glossy capsule — absolutely NO outer frame, "
                          "NO metal or gold rim, NO border")
        self.assertIn("NO metal or gold rim", got2)
        self.assertNotIn("glossy", got2)

    def test_khong_dung_vao_tu_trang_thai_va_kinh(self):
        """matte/desaturated = trạng thái disabled; glass/frosted/translucent là
        hợp đồng của nhánh matte kính trong slice.py."""
        for w in ("matte", "desaturated", "muted", "translucent", "glass",
                  "frosted", "vivid", "bright", "dark"):
            self.assertNotIn(w, gen["FINISH_WORDS"], f"{w} không được phép xoá")

    def test_menh_de_mat_het_nghia_thi_bo_tron(self):
        """'gradient face, beveled edge, glossy top highlight' → rác nếu chỉ xoá
        tính từ. Bỏ trọn mệnh đề, giữ nguyên mệnh đề còn nghĩa."""
        got = self.strip("small rounded-square 3D plate for one countdown digit, "
                         "gradient face, beveled edge, glossy top highlight, "
                         "EMPTY center with no number")
        self.assertEqual(got, "small rounded-square plate for one countdown digit, "
                              "EMPTY center with no number")

    def test_khong_xe_cau_trong_ngoac(self):
        got = self.strip("smooth glossy capsule (the decorated track is a "
                         "SEPARATE element)")
        self.assertIn("(the decorated track is a SEPARATE element)", got)

    def test_spec_khong_co_tu_be_mat_thi_khong_doi_mot_ky_tu(self):
        cfg = json.loads((ROOT / "styles.json").read_text(encoding="utf-8"))
        for sh in cfg["sheets"]:
            for c in sh["components"]:
                out, cut = gen["strip_finish"](c["spec"])
                if not cut:
                    self.assertEqual(out, c["spec"].strip(), c["file"])

    def test_thu_vien_element_that_khong_con_tu_be_mat_nao(self):
        """Chạy trên element-lib.json đang ship — thư viện thêm món mới mà lọt
        chữ kết cấu thì test này đỏ ngay."""
        lib = json.loads((ROOT / "element-lib.json").read_text(encoding="utf-8"))
        bad = []
        for el in lib["elements"]:
            out, _ = gen["strip_finish"](el["spec"])
            words = {w.lower() for w in re.findall(r"[A-Za-z0-9][A-Za-z0-9-]*", out)}
            # 'gloss' của "no gloss" được cố ý giữ lại (mệnh lệnh phủ định)
            leak = {w for w in words & gen["FINISH_WORDS"]
                    if not re.search(r"\b(no|not|never|without|non)\s+%s\b" % w,
                                     out, re.I)}
            if leak:
                bad.append((el["file"], sorted(leak)))
        self.assertEqual(bad, [], "spec thư viện còn chữ kết cấu sau khi lọc")

    def test_la_tap_con_cua_material_words(self):
        self.assertTrue(gen["FINISH_WORDS"] <= gen["MATERIAL_WORDS"])

    def test_cau_ha_cap_khong_duoc_nhac_lai_chu_da_xoa(self):
        """Bẫy chí mạng: preset_words() chạy trên spec GỐC thì câu hạ cấp lại
        đọc to đúng những chữ vừa xoá — mời chúng quay lại prompt."""
        spec, _ = gen["strip_finish"]("glossy 3D candy-red capsule button, "
                                      "darker red bevel rim")
        named = [w.lower() for w in gen["preset_words"](spec)]
        for w in ("glossy", "3d", "candy", "bevel"):
            self.assertNotIn(w, named)
        self.assertIn("red", named, "chữ màu vẫn phải được hạ cấp bằng cách nêu tên")


class PresetWordCapTest(unittest.TestCase):
    """Bẫy `hits[:10]`: `08-progress-fill` đứng đúng 10/10, thêm một từ vật liệu
    nữa vào spec là từ thứ 11 rơi ÂM THẦM và ô lại ra màu preset."""

    def test_cap_moi_rong_hon_han_cho_dang_dung(self):
        self.assertGreaterEqual(gen["PRESET_WORD_CAP"], 20)
        self.assertGreaterEqual(gen["PRESET_CHAR_CAP"], 200)

    def test_o_10_tu_khong_con_cham_cap(self):
        spec = ("wide jelly glossy vivid warm orange-to-coral gradient bar with a "
                "bright specular metal streak and a gold rim")
        with contextlib.redirect_stderr(io.StringIO()) as err:
            got = gen["preset_words"](spec, "ô thử")
        self.assertEqual(len(got), 10)
        self.assertIn("gold", got, "từ thứ 10 phải còn nguyên")
        self.assertEqual(err.getvalue(), "", "không được cảnh báo khi chưa chạm cap")

    def test_moi_spec_that_trong_styles_json_deu_khong_bi_cat(self):
        cfg = json.loads((ROOT / "styles.json").read_text(encoding="utf-8"))
        with contextlib.redirect_stderr(io.StringIO()) as err:
            for sh in cfg["sheets"]:
                for c in sh["components"]:
                    gen["preset_words"](c["spec"], c["file"])
        self.assertEqual(err.getvalue(), "",
                         "có spec đang bị cắt âm thầm — nới cap hoặc rút spec")

    def test_vuot_cap_thi_keu_ra_stderr_kem_ten_o_va_tu_bi_bo(self):
        words = ["glossy", "candy", "jelly", "metal", "chrome", "foil", "velvet",
                 "satin", "silk", "wood", "paper", "glass", "ceramic", "marble",
                 "stone", "enamel", "rubber", "frosted", "brushed", "polished",
                 "neon", "pastel", "shiny", "waxy", "crimson", "turquoise"]
        spec = "a pill with " + " ".join(words)
        with contextlib.redirect_stderr(io.StringIO()) as err:
            got = gen["preset_words"](spec, "ipay-main ô 8 (08-progress-fill)")
        msg = err.getvalue()
        self.assertEqual(len(got), gen["PRESET_WORD_CAP"])
        self.assertTrue(msg, "cắt từ mà im lặng — đúng cái bẫy phải bỏ")
        self.assertIn("08-progress-fill", msg, "cảnh báo phải chỉ ra Ô NÀO")
        for dropped in words[gen["PRESET_WORD_CAP"]:]:
            self.assertIn(dropped, msg, "phải liệt kê đúng từ bị bỏ")

    def test_cap_ky_tu_cung_chan_va_bao(self):
        spec = "a pill with " + " ".join(["holographic"] * 1 + ["iridescent",
                "pearlescent", "desaturated", "translucent", "metallic",
                "bevelled", "turquoise", "burgundy", "lavender", "charcoal",
                "colourful", "saturated", "porcelain", "specular", "beveled"])
        with contextlib.redirect_stderr(io.StringIO()):
            got = gen["preset_words"](spec, "x")
        self.assertLessEqual(sum(len(w) + 2 for w in got), gen["PRESET_CHAR_CAP"])


class AttachmentListTest(unittest.TestCase):
    def test_moi_anh_chi_duoc_dinh_kem_mot_lan_trong_mot_job(self):
        shared = "refs/shared.png"
        got = render_prompt_files({
            "styles": [{
                "id": "demo", "bg": "magenta", "style": "flat ink",
                "brand": {"mode": "image", "refs": [shared, "refs/brand.png", shared]},
                "inspo": [shared, "refs/inspo.png", "refs/inspo.png"],
            }],
            "sheets": [{
                "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
                "components": [{"file": "01-thing", "spec": "blank button",
                                "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}}],
                "ref": shared,
            }],
        })
        self.assertEqual(got, [
            "skeleton/pose-demo.png", shared, "refs/brand.png", "refs/inspo.png"
        ])


class ChromaKeyTest(unittest.TestCase):
    def test_nhan_dien_ca_4_key_tu_chuoi_bg(self):
        for name in ("magenta", "green", "cyan", "blue"):
            got, desc = gen["key_of"]({"id": "s", "bg": f"pure vivid {name} #ABCDEF"})
            self.assertEqual(got, name)
            self.assertIn(name, desc)

    def test_nhan_dien_qua_hex_khi_khong_co_ten(self):
        self.assertEqual(gen["key_of"]({"id": "s", "bg": "#00FFFF"})[0], "cyan")
        self.assertEqual(gen["key_of"]({"id": "s", "bg": "#0000FF"})[0], "blue")

    def test_thieu_bg_giu_hanh_vi_cu_la_magenta(self):
        """Hợp đồng tương thích ngược của backlog mục 5."""
        with contextlib.redirect_stderr(io.StringIO()) as err:
            for style in ({"id": "s"}, {"id": "s", "bg": None}, {"id": "s", "bg": ""}):
                name, desc = gen["key_of"](style)
                self.assertEqual(name, "magenta")
                self.assertIn("#FF00FF", desc)
        self.assertEqual(err.getvalue(), "", "thiếu bg là hợp lệ, không cảnh báo")

    def test_bg_ngoai_tap_key_thi_canh_bao_va_lui_ve_magenta(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            name, _ = gen["key_of"]({"id": "styleX", "bg": "soft beige linen"})
        self.assertEqual(name, "magenta")
        self.assertIn("styleX", err.getvalue())

    def test_moi_style_that_trong_styles_json_deu_ra_key_hop_le(self):
        cfg = json.loads((ROOT / "styles.json").read_text(encoding="utf-8"))
        with contextlib.redirect_stderr(io.StringIO()) as err:
            names = {s["id"]: gen["key_of"](s)[0] for s in cfg["styles"]}
        self.assertEqual(err.getvalue(), "")
        self.assertTrue(set(names.values()) <= set(gen["CHROMA_KEYS"]))
        self.assertEqual(names["ipay"], "magenta")
        self.assertEqual(names["candy"], "green")

    def test_truc_key_khop_voi_slice_py(self):
        """Hai file phải hiểu cùng một tập key, nếu không prompt và slicer lệch nhau."""
        import importlib.util
        spec = importlib.util.spec_from_file_location("kg_slice", ROOT / "slice.py")
        sl = importlib.util.module_from_spec(spec); spec.loader.exec_module(sl)
        self.assertEqual(set(gen["CHROMA_KEYS"]), set(sl.KEY_COLORS))
        for name, (rgb, _d) in gen["CHROMA_KEYS"].items():
            self.assertEqual(rgb, sl.KEY_COLORS[name])
            self.assertEqual(gen["_axis"](rgb), sl.key_axis(rgb))


if __name__ == "__main__":
    unittest.main()
