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


def render_prompt_text(cfg):
    """Như `render_prompt_files` nhưng trả NỘI DUNG prompt — thứ model thật đọc."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        Path(td, "styles.json").write_text(json.dumps(cfg), encoding="utf-8")
        Path(td, "prompts").mkdir()
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
            return Path(td, "prompts", "demo-pose-demo.txt").read_text(encoding="utf-8")
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

    def test_tu_ghep_rung_CA_HAI_nua(self):
        """'candy-red' rụng trọn: candy là bề mặt, red là màu — cả hai đều là style.

        Bản trước giữ lại 'red' với lý lẽ "màu là vai trò". Đo được nửa sai của lý
        lẽ đó: từ màu literal đứng SÁT Ô, đúng vị trí vừa chứng minh là thắng cả
        khối ưu tiên lẫn khối Art style ⇒ `01-btn-pill-red` ra ĐỎ bất kể bảng màu
        thương hiệu là gì. Không thể vừa để mệnh lệnh màu cạnh ô vừa mong bảng màu
        thắng. Spec của element nay chỉ nói NÓ LÀ CÁI GÌ."""
        got = self.strip("glossy 3D candy-red capsule button")
        self.assertNotIn("candy", got.lower())
        self.assertNotIn("red", got.lower())
        self.assertIn("capsule button", got, "mất luôn danh tính element là hỏng khác")

    def test_thu_hang_SONG_SOT_duoi_dang_VAI_TRO(self):
        """Nửa ĐÚNG của lý lẽ cũ: 45/46/47-rank-badge chỉ khác nhau ở GOLD/SILVER/
        BRONZE. Xoá trần là ba huy chương thành y hệt nhau — nên từ màu mang THỨ
        HẠNG không biến mất, nó được DỊCH sang vai trò rồi phát thành tag riêng."""
        roles = {}
        for w in ("GOLD", "SILVER", "BRONZE"):
            spec, cut = gen["strip_finish"](f"the SAME glossy 3D medal badge in {w} for this place")
            self.assertNotIn(w.lower(), spec.lower(), "màu literal vẫn phải biến mất")
            roles[w] = gen["colour_roles"](cut)
            self.assertTrue(roles[w], f"{w} mất cả vai trò lẫn màu ⇒ ba ô thành một")
        self.assertEqual(len({tuple(v) for v in roles.values()}), 3,
                         f"ba hạng phải ra ba vai trò KHÁC nhau, được: {roles}")

    def test_gioi_tu_mo_coi_bi_don_theo(self):
        """"badge in GOLD for this place" bỏ mỗi GOLD thì còn "badge in for this
        place" — câu cụt, và câu cụt là thứ model tự bịa nghĩa để lấp."""
        got = self.strip("the SAME medal badge in GOLD for this place")
        self.assertNotIn(" in for ", got)
        self.assertIn("medal badge", got)

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
        # Từ MÀU nay cũng đã bị xoá ở bước ① ⇒ không còn gì để nêu tên. Danh sách
        # rỗng chính là đích: câu hạ cấp chỉ tồn tại cho chữ LỌT LƯỚI từ điển.
        self.assertNotIn("red", named, "chữ màu đã xoá mà câu hạ cấp còn đọc to là mời nó quay lại")


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


class SteeringPromptTest(unittest.TestCase):
    def test_v16_no_bias_va_core_la_bien_ngoai(self):
        prompt = (ROOT / "gen.sh").read_text(encoding="utf-8")
        self.assertIn("OUTERMOST boundary of the functional CORE", prompt)
        self.assertIn("fit the continuous core INSIDE it, never beyond", prompt)
        self.assertIn("must match the gray silhouette exactly", prompt)
        self.assertNotIn("deliberately expanded", prompt)


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


class MauThuongHieuTest(unittest.TestCase):
    """MÀU NHẬN DIỆN THƯƠNG HIỆU PHẢI ĐI CÙNG ẢNH REF, KHÔNG LOẠI TRỪ NHAU.

    ╔══ BỆNH ĐÃ ĐO ═════════════════════════════════════════════════════════════╗
    ║ `kitset-to-contract.ts` đặt `mode = brandRefs.length > 0 ? "image"         ║
    ║ : "colors"`, còn gen.sh chỉ in dòng palette khi `mode == "colors"` và chỉ  ║
    ║ đính ảnh brand khi `mode == "image"`. Hệ quả: **tải logo lên là mất trắng  ║
    ║ dòng màu thương hiệu** — ảnh được đính, nhưng câu "dùng #xxxxxx làm màu    ║
    ║ chủ đạo" biến mất khỏi prompt. Đúng triệu chứng chủ sản phẩm báo.          ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Hai thứ trả lời hai câu khác nhau (MÀU NÀO / VẼ THEO LỐI NÀO) nên phải cùng có
    mặt, và phải có một khối phân xử nói ai bảo ai.
    """

    CFG = {
        "styles": [{
            "id": "demo", "bg": "magenta", "style": "flat ink",
            "brand": {"mode": "image", "primary": "#0A5C36", "secondary": "#F2C230",
                      "refs": ["refs/logo.png"]},
        }],
        "sheets": [{
            "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
            "components": [{"file": "01-thing", "spec": "glossy 3D candy-red capsule button",
                            "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}}],
        }],
    }

    def test_co_logo_van_PHAI_con_dong_bang_mau(self):
        txt = render_prompt_text(self.CFG)
        self.assertIn("#0A5C36", txt, "tải logo lên là mất dòng màu thương hiệu")
        self.assertIn("#F2C230", txt)

    def test_va_logo_van_duoc_dinh_kem(self):
        self.assertIn("refs/logo.png", render_prompt_files(self.CFG))

    def test_co_khoi_phan_xu_mau_va_no_dat_bang_mau_len_dau(self):
        txt = render_prompt_text(self.CFG)
        self.assertIn("COLOUR AUTHORITY", txt)
        i = txt.index("COLOUR AUTHORITY")
        self.assertIn("BRAND PALETTE above is the source of every colour", txt[i:])
        self.assertIn("They do NOT decide hue", txt[i:],
                      "ảnh ref phải quyết lối vẽ, không quyết màu")

    def test_dong_o_khong_con_mot_chu_mau_nao(self):
        """Đây là điều chủ sản phẩm yêu cầu: spec của element chỉ tả ĐẶC TÍNH."""
        txt = render_prompt_text(self.CFG)
        # Lấy dòng ô THẬT: nó là dòng ngay sau tiêu đề hàng, không phải mọi "1) "
        # trong prompt (khối neo hình học cũng đánh số kiểu đó).
        lines = txt.splitlines()
        head = next(i for i, l in enumerate(lines) if l.startswith("Row 1, left to right"))
        dong_o = lines[head + 1]
        for w in ("red", "candy", "glossy", "3D"):
            self.assertNotIn(w.lower(), dong_o.lower(), f"dòng ô còn chữ style: {w}")
        self.assertIn("capsule button", dong_o, "mất luôn danh tính element là hỏng khác")

    def test_khong_co_brand_thi_khong_bia_ra_dong_mau(self):
        cfg = json.loads(json.dumps(self.CFG))
        cfg["styles"][0]["brand"] = {"refs": ["refs/logo.png"]}
        txt = render_prompt_text(cfg)
        self.assertNotIn("Brand palette:", txt)
        i = txt.index("COLOUR AUTHORITY")
        self.assertIn("decide both the rendering AND the palette", txt[i:])
