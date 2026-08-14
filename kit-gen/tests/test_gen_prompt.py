"""Test khối dựng prompt của gen.sh (backlog P2-10 + mục 5).

gen.sh nhúng một khối Python heredoc. Test nạp ĐÚNG mã đang ship (cắt tới ngay
trước vòng lặp dựng prompt) chứ không chép lại — chép lại là test xanh mà sản
phẩm đỏ.
"""
import contextlib, io, json, os, re, unittest
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


gen = load_gen_block()


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
