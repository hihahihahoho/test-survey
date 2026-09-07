"""Test khối dựng prompt của gen.sh (backlog P2-10 + mục 5).

gen.sh nhúng một khối Python heredoc. Test nạp ĐÚNG mã đang ship (cắt tới ngay
trước vòng lặp dựng prompt) chứ không chép lại — chép lại là test xanh mà sản
phẩm đỏ.
"""
import contextlib, io, json, os, re, shutil, tempfile, unittest
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


def _seed_workspace(td, cfg):
    """Dựng thư mục làm việc y như gen.sh thấy nó.

    `geometry.py` PHẢI có mặt: khối python `import geometry` ngay dòng đầu (bảng khổ
    canvas + toạ độ safe zone đều ở đó, dùng chung với slice.py). Chép thật chứ không
    nhét sys.path — engine trên máy người dùng cũng chạy bằng một bản CHÉP nằm cạnh
    gen.sh, nên workspace của test phải có cùng hình dạng.
    """
    Path(td, "styles.json").write_text(json.dumps(cfg), encoding="utf-8")
    Path(td, "prompts").mkdir()
    shutil.copy(ROOT / "geometry.py", Path(td, "geometry.py"))


def render_prompt_files(cfg):
    """Chạy đúng heredoc dựng prompt của gen.sh trong workspace tạm."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        _seed_workspace(td, cfg)
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
            return Path(td, "prompts", "demo-pose-demo.att").read_text(encoding="utf-8").splitlines()
        finally:
            os.chdir(cwd)


def render_prompt_text(cfg, name="demo-pose-demo"):
    """Chính văn prompt gửi model (không phải danh sách file đính kèm)."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        _seed_workspace(td, cfg)
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
            return Path(td, "prompts", f"{name}.txt").read_text(encoding="utf-8")
        finally:
            os.chdir(cwd)


ROW1 = re.compile(r"^1\) ", re.M)


def first_cell_line(txt):
    """Chỉ số dòng của mục ĐẦU TIÊN trong danh sách ô.

    Neo cũ là dòng tiêu đề "Row 1, left to right:". Nó đã bị bỏ cùng khung xương
    (27/08/2026): mỗi dòng ô nay tự mang toạ độ tuyệt đối, nói vị trí chính xác hơn
    mọi tiêu đề hàng, nên tiêu đề chỉ còn là chữ xen giữa danh sách.
    Phải bỏ qua khối "Build each element from the inside out" — nó cũng đánh số 1)2)3)
    nhưng là các LỚP của một element, không phải các ô.
    """
    lines = txt.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("1) ") and " — safe zone " in line:
            return i
        if line.startswith("1) ") and "content surface" not in line and "safe zone" not in line:
            return i          # ô full-bleed / ô trống: không có toạ độ để mang
    raise AssertionError("prompt không có danh sách ô nào")


def cell_list_offset(txt):
    """Vị trí KÝ TỰ của dòng ô đầu tiên — cho các phép so `index(...) <`."""
    return sum(len(l) + 1 for l in txt.splitlines()[:first_cell_line(txt)])


gen = load_gen_block()


class KhoiPhongCachDungDauTest(unittest.TestCase):
    """PROMPT TỔNG PHONG CÁCH PHẢI ĐỨNG ĐẦU, KHÔNG PHẢI CUỐI.

    Chủ sản phẩm (26/08/2026): "phải copy cả prompt của phong cách, có prompt tổng".
    Bản cũ chôn khối `Art style:` ở TẬN CUỐI, sau ~900 dòng hình học — người mở tab
    Prompt ra đọc thì gặp engine nói về V16 và về hoa lá trước khi gặp một chữ nào
    của chính mình.

    Dời lên đầu chỉ AN TOÀN được nhờ một điều kiện, và điều kiện đó chính là phần
    còn lại của bản vá: dòng đánh số ở dưới nay chỉ còn DANH TỪ. Chừng nào spec còn
    tả vật liệu ("glossy 3D candy-red…") thì chữ ở gần ô vẫn thắng chữ ở xa, và đưa
    phong cách ra xa là tự dâng phần thua. Nên nếu ai đó nhét mô tả vật liệu trở
    lại element-lib thì hai lớp test này cùng đỏ, không phải một.
    """

    def setUp(self):
        self.txt = render_prompt_text(_cfg(spec="the primary action button"))

    def test_khoi_phong_cach_nam_trong_dau_prompt(self):
        """Section «Art style» đứng NGAY SAU «Canvas» — hai section, không phải
        chín. Chủ sản phẩm 07/09/2026: *"đáng nhẽ nên chia thành section
        ## Art style"*."""
        i = self.txt.index("## Art style")
        self.assertLess(self.txt[:i].count("\n"), 5,
                        "khối phong cách bị đẩy xuống lưng chừng prompt")

    def test_phong_cach_dung_TRUOC_danh_sach_o(self):
        self.assertLess(self.txt.index("## Art style"), self.txt.index("## Elements"),
                        "chữ của người dùng phải đến trước danh sách ô")

    def test_giu_NGUYEN_VAN_cau_nguoi_dung_go(self):
        """Engine KHÔNG bóc `variant.style` ra, không thêm một tính từ nào: nó là
        chữ của người dùng, in nguyên văn dưới đúng một tiêu đề."""
        self.assertIn("## Art style\nflat ink.", self.txt)

    def test_khong_co_style_thi_NOI_THANG_chu_khong_bia_mot_phong_cach(self):
        cfg = _cfg()
        cfg["styles"][0].pop("style")
        txt = render_prompt_text(cfg)
        self.assertIn("None was given for this project", txt)


class PromptKhongNhiemTest(unittest.TestCase):
    """PROMPT GỬI MODEL KHÔNG ĐƯỢC MANG CHỮ CỦA RIÊNG ENGINE.

    ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 26/08/2026) ══════════════════════════════════╗
    ║ "nhìn prompt lỗi này v16???" · "dễ bị nhiễm prompt lắm — audit lại toàn bộ ║
    ║ prompt đi". Ba họ chữ, ba cái giá khác nhau:                                ║
    ║  ① NHÃN PHIÊN BẢN NỘI BỘ — "V16 GUIDE CONTRACT", "the nine-element v14+     ║
    ║    layout". Model không có cách nào biết V16 là gì ⇒ thuần nhiễu token; còn ║
    ║    người đọc prompt thì kết luận engine đang hỏng.                          ║
    ║  ② DANH TỪ TRANG TRÍ CỨNG — "flowers, ribbons, tassels, jewels, sparkles    ║
    ║    and filigree", nhét vào MỌI element của MỌI tấm bất kể phong cách. Với   ║
    ║    ref là tranh mực hoạ phẳng thì đó là lệnh vẽ thêm hoa và tua rua vào một ║
    ║    bộ UI không hề có chúng — engine ra lệnh thẩm mỹ, việc của người dùng.   ║
    ║  ③ KHUNG NGỮ CẢNH CỨNG — "a game UI kit sprite sheet for a mobile mini-game ║
    ║    marketing campaign": một thể loại + một kênh + một mục đích thương mại,  ║
    ║    đóng đinh cho mọi dự án dùng engine này.                                 ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Luật thay thế: engine CHỈ được nói HÌNH HỌC và RÀNG BUỘC KỸ THUẬT. Mọi câu nói
    về vật liệu / màu / độ bóng / trang trí phải bắt nguồn từ chữ của người dùng.

    Quét trên PROMPT ĐÃ DỰNG, không quét mã nguồn: chú thích trong gen.sh còn trích
    nguyên văn mấy câu này để đời sau biết vì sao chúng bị bỏ — và đó là chuyện tốt.
    """

    def setUp(self):
        # Dựng đủ mọi nhánh: tấm UI thường, tấm mascot (có ref), tấm nền full-bleed.
        self.texts = {
            "ui": render_prompt_text(_cfg(spec="the primary action button")),
            "mascot": render_prompt_text(_cfg(extra=None, skel={"shape": "pose"})),
        }
        cfg = _cfg(spec="the HOME screen background", skel={"shape": "full", "w": 1, "h": 1})
        self.texts["nen"] = render_prompt_text(cfg)
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose"})
        cfg["sheets"][0]["ref"] = "refs/mascot.png"
        self.texts["mascot"] = render_prompt_text(cfg)

    def _khong_co(self, *cam):
        for ten, txt in self.texts.items():
            low = txt.lower()
            for w in cam:
                self.assertNotIn(w.lower(), low, f"prompt tấm '{ten}' còn chữ cấm: {w}")

    def test_khong_con_nhan_phien_ban_noi_bo(self):
        self._khong_co("V16", "V14", "v14+", "nine-element")
        # Biểu thức, không phải danh sách: "V15"/"v17" của mai sau cũng phải đỏ ngay
        # thay vì đợi ai đó nhớ ra mà bổ sung vào danh sách trên.
        for ten, txt in self.texts.items():
            self.assertIsNone(re.search(r"\bv1[0-9]\b", txt, re.I),
                              f"prompt tấm '{ten}' còn nhãn phiên bản dạng V1x")

    def test_khong_con_danh_tu_trang_tri_cung(self):
        self._khong_co("flowers", "ribbons", "tassels", "jewels", "filigree", "sparkles")

    def test_khong_con_khung_ngu_canh_cung(self):
        self._khong_co("marketing", "mini-game", "campaign")

    def test_khong_con_chat_lieu_lot_vao_cau_hinh_hoc(self):
        """'enamel' (men sứ) từng núp trong một câu chỉ nói về ĐO ĐẠC:
        "The continuous enamel/content surface is the CORE". Di chứng của đời prompt
        kẹo bóng — không ai để ý vì nó nằm trong một câu trông rất kỹ thuật."""
        self._khong_co("enamel", "glossy", "candy")

    def test_bo_may_gam_chu_da_bi_do_HAN(self):
        """~250 dòng MATERIAL_WORDS / FINISH_WORDS / strip_finish / preset_words đã
        bị xoá, và đó là chủ ý chứ không phải quên dọn.

        Bộ máy đó tồn tại vì MỘT lý do: spec của thư viện là mô tả vật liệu cứng,
        nên engine phải đi gỡ cái mồi do chính nó gieo. Nay spec chỉ còn danh từ ⇒
        không còn preset nào để hạ cấp, và chữ vật liệu còn sót trong một spec bây
        giờ là chữ NGƯỜI DÙNG tự chọn (khu soạn prompt cho chọn vật liệu theo ô).
        Xoá lựa chọn của người dùng là một lỗi, không phải một phép dọn — nên ca này
        khoá luôn chiều ngược: đừng ai "khôi phục lại cho chắc".
        """
        for ten in ("MATERIAL_WORDS", "FINISH_WORDS", "COLOUR_WORDS", "COLOUR_ROLE",
                    "strip_finish", "preset_words", "colour_roles",
                    "PRESET_WORD_CAP", "PRESET_CHAR_CAP"):
            self.assertNotIn(ten, gen, f"{ten} đã bị bỏ — đừng dựng lại")

    def test_spec_di_thang_vao_prompt_KHONG_bi_sua_mot_ky_tu(self):
        """Hệ quả trực tiếp của việc bỏ bộ máy trên, và là thứ người dùng cảm được:
        họ gõ gì thì model đọc đúng cái đó."""
        spec = "a glossy neon-pink popover panel, made of frosted glass"
        txt = render_prompt_text(_cfg(spec=spec))
        lines = txt.splitlines()
        head = first_cell_line(lines and txt)
        # Spec đi thẳng, KHÔNG bị sửa một ký tự — phần engine nối thêm chỉ được nằm
        # SAU nó (toạ độ safe zone), không được chen vào giữa.
        self.assertTrue(lines[head].startswith(f"1) {spec} — safe zone x="),
                        f"dòng ô bị sửa: {lines[head]!r}")

    def test_engine_van_TUYEN_BO_THU_HANG_thay_vi_viet_lai_chu_cua_ai(self):
        """Bỏ gặm chữ KHÔNG có nghĩa là bỏ phòng thủ. Thứ thay thế nó là một câu
        nói về THỨ HẠNG, đặt ngay trên danh sách ô — engine tuyên bố ai thắng ai,
        engine không viết lại chữ của ai cả."""
        txt = self.texts["ui"]
        head = txt[:cell_list_offset(txt)]
        # MỘT DÒNG thay cho khối 9 dòng cũ: cùng ba thứ hạng (danh từ / lối vẽ /
        # toạ độ), nói một lần, ngay trên danh sách.
        self.assertIn("The list names WHAT each cell is", head)
        self.assertIn("the art style above decides how it looks", head)
        self.assertIn("the coordinates decide where and how big", head)


class BangKhoCanvasTest(unittest.TestCase):
    """MỘT BẢNG KHỔ DUY NHẤT, VÀ NÓ PHẢI ĐI TỚI DÒNG ĐẦU PROMPT.

    Khổ ảnh từng được suy ĐỘC LẬP ở bốn chỗ (khối python này, `run_one` ở tầng bash,
    `skeleton-svg.js:sheetSize`, `slice.py:orientation_error`), mỗi chỗ một dòng ba
    ngôi `orient == "portrait" ? … : …`. Thêm một khổ thứ ba là phải sửa đủ bốn, và
    chỗ nào quên thì hỏng LẶNG LẼ. Bảng `CANVAS` ở đây là nguồn sự thật; ba chỗ kia
    hoặc đọc ngược từ dòng đầu prompt, hoặc chép bảng này và trỏ ngược về đây.

    VÌ SAO Ô VUÔNG LÀ 1254x1254 — đã soi binary codex 0.149.0: tool
    `image_gen.imagegen` có ĐÚNG BA tham số (prompt, referenced_image_paths,
    num_last_images_to_include) và KHÔNG có `size`. Khổ do backend chọn; model chỉ
    lái được TỈ LỆ bằng lời văn. Đo 685 ảnh thật tool đã sinh: mọi ảnh đều ≈1.572.864
    pixel, trong đó 132 ảnh vuông và TẤT CẢ đúng 1254x1254 — không ảnh nào 1024²,
    không ảnh nào 2048/2040.
    """

    def test_bang_co_du_ba_kho(self):
        """Bảng nay nằm ở `geometry.py` — khối python của gen.sh chỉ import. Ca này đọc
        qua chính đường import đó, nên nếu ai đó dựng lại một bảng cục bộ trong gen.sh
        thì ca vẫn xanh mà sản phẩm đã có hai nguồn: `test/gen-canvas-square.test.sh`
        có ca chống chép-lại canh đúng chuyện ấy."""
        self.assertEqual(set(gen["geometry"].CANVAS), {"landscape", "portrait", "square"})
        self.assertEqual(gen["geometry"].CANVAS["square"][:2], (1254, 1254),
                         "hứa một khổ codex không trả về thì mọi lượt vuông trông như model sai")

    def test_canvas_thang_orient_va_chu_la_roi_ve_landscape(self):
        self.assertEqual(gen["canvas_of"]({"canvas": "square"})[2], "SQUARE 1254x1254")
        self.assertEqual(gen["canvas_of"]({"canvas": "square", "orient": "portrait"})[2],
                         "SQUARE 1254x1254")
        self.assertEqual(gen["canvas_of"]({"orient": "portrait"})[2], "PORTRAIT 1024x1536")
        self.assertEqual(gen["canvas_of"]({})[2], "LANDSCAPE 1536x1024")
        self.assertEqual(gen["canvas_of"]({"canvas": "squre"})[2], "LANDSCAPE 1536x1024")

    def test_kho_di_toi_HAI_DONG_DAU_prompt(self):
        """`run_one` đọc ngược khổ bằng `head -n2 | grep`. Hai dòng đầu lệch một chữ
        là mọi tấm dọc/vuông bị gửi đi với 1536x1024.

        HAI chứ không phải MỘT kể từ khi prompt chia section: dòng 1 là tiêu đề
        `## Canvas`, khổ giấy nằm ở dòng ngay dưới."""
        cfg = _cfg()
        cfg["sheets"][0]["canvas"] = "square"
        txt = render_prompt_text(cfg)
        rows = txt.splitlines()
        self.assertEqual(rows[0], "## Canvas")
        self.assertTrue(rows[1].startswith("SQUARE 1254x1254 px,"), rows[1])
        self.assertIn("square 1:1", txt)

    def test_promptOverride_van_giu_SECTION_KHO_GIAY(self):
        """Người dùng tự soạn cả prompt thì engine không nối thêm một chữ nào —
        NGOẠI TRỪ section «Canvas», vì `run_one` đọc ngược khổ từ đó."""
        cfg = _cfg()
        cfg["sheets"][0]["canvas"] = "square"
        cfg["sheets"][0]["promptOverride"] = "TÔI TỰ SOẠN."
        txt = render_prompt_text(cfg)
        rows = txt.splitlines()
        self.assertEqual(rows[0], "## Canvas")
        self.assertTrue(rows[1].startswith("SQUARE 1254x1254 px,"), rows[1])
        self.assertIn("TÔI TỰ SOẠN.", txt)
        self.assertNotIn("## Safe zone", txt)
        self.assertNotIn("No letters, no digits", txt)

    def test_promptOverride_van_cho_GHI_CHU_cua_nguoi_dung_di_theo(self):
        """Ghi chú và câu chỉ đạo là chữ của CHÍNH người dùng, gõ ở một ô khác trên
        cùng cái thẻ. Vứt nó đi vì họ lỡ bật chế độ tự do là lặng lẽ nuốt một thứ
        họ vẫn đang nhìn thấy trên màn hình."""
        cfg = _cfg()
        cfg["sheets"][0]["promptOverride"] = "TÔI TỰ SOẠN."
        cfg["sheets"][0]["directive"] = "thêm mưa xuân"
        txt = render_prompt_text(cfg)
        self.assertIn("## Direction", txt)
        self.assertIn("From the designer: thêm mưa xuân", txt)


class ThuVienChiCoDANHTUTest(unittest.TestCase):
    """SPEC CỦA THƯ VIỆN = MỘT DANH TỪ. Chủ sản phẩm: "popover thì chỉ là popover thôi".

    Chạy trên `element-lib.json` ĐANG SHIP: thêm một món mới mà lọt chữ vật liệu thì
    ca này đỏ ngay, thay vì phải đợi tới lúc nhìn ảnh ra sai phong cách.

    Ràng buộc KỸ THUẬT của ô KHÔNG nằm trong spec: nó nằm ở `skel.matte` và do gen.sh
    phát ra (matte='glow' ⇒ câu tan-về-alpha-0; matte='glass' ⇒ câu low-alpha
    see-through). Một nguồn sự thật, engine nói một lần — không chép tay vào 42 dòng.
    """

    # Chữ VẬT LIỆU / BỀ MẶT / MÀU. Cố ý KHÔNG có từ hình dáng hay trạng thái
    # (capsule, pill, hollow, outline, open, closed…): những từ đó là hợp đồng
    # hình học và trạng thái, chúng ĐƯỢC PHÉP ở lại.
    CAM = {
        "glossy", "gloss", "matte", "candy", "jelly", "gummy", "plastic", "3d",
        "metal", "metallic", "chrome", "foil", "velvet", "satin", "silk", "wooden",
        "papery", "glassy", "ceramic", "porcelain", "marble", "enamel", "lacquer",
        "rubber", "gel", "frosted", "brushed", "polished", "iridescent",
        "holographic", "pearlescent", "neon", "pastel", "shiny", "waxy", "specular",
        "bevel", "beveled", "bevelled", "gradient", "sheen", "creamy", "velvety",
        "red", "orange", "coral", "gold", "golden", "silver", "bronze", "copper",
        "blue", "green", "yellow", "purple", "violet", "pink", "crimson", "scarlet",
        "turquoise", "lime", "navy", "maroon", "peach", "mint", "lavender",
        "burgundy", "olive", "charcoal", "vivid", "saturated", "luminous",
    }

    def setUp(self):
        self.lib = json.loads((ROOT / "element-lib.json").read_text(encoding="utf-8"))

    def test_khong_spec_nao_con_chu_vat_lieu_hay_mau(self):
        bad = []
        for el in self.lib["elements"]:
            words = {w.lower() for w in re.findall(r"[A-Za-z0-9][A-Za-z0-9-]*", el["spec"])}
            for w in list(words):
                words |= set(w.split("-"))
            leak = sorted(words & self.CAM)
            if leak:
                bad.append((el["file"], leak))
        self.assertEqual(bad, [], "spec thư viện còn chữ thẩm mỹ — phải là DANH TỪ thuần")

    def test_spec_ngan_gon_dung_nghia_mot_danh_tu(self):
        """Không có ngưỡng thần thánh nào ở đây; 140 ký tự chỉ đủ rộng cho một danh
        từ kèm trạng thái và một mệnh đề phân biệt, và đủ chặt để chặn một đoạn văn
        tả vật liệu bò về."""
        dai = [(e["file"], len(e["spec"])) for e in self.lib["elements"] if len(e["spec"]) > 140]
        self.assertEqual(dai, [], "spec dài quá mức của một danh từ")

    def test_rang_buoc_ky_thuat_o_skel_KHONG_o_spec(self):
        """Hai ô mang hợp đồng alpha thật sự — và hợp đồng đó phải ở `skel.matte`,
        vì đó là thứ cả gen.sh lẫn slice.py cùng đọc. Chép vào spec là đẻ ra nguồn
        sự thật thứ hai, và nó sẽ lệch ngay lần đầu ai sửa một trong hai."""
        by = {e["file"]: e for e in self.lib["elements"]}
        self.assertEqual(by["16-fx-burst"]["skel"].get("matte"), "glow")
        self.assertEqual(by["22-board-panel"]["skel"].get("matte"), "glass")
        for f in ("16-fx-burst", "22-board-panel"):
            self.assertNotIn("alpha", by[f]["spec"].lower(), f"{f}: luật alpha đã ở skel.matte")

    def test_o_glow_va_glass_van_nhan_dung_cau_ky_thuat_tu_engine(self):
        for matte, dau in (("glow", "LIGHT EFFECT"), ("glass", "SEE-THROUGH ELEMENT")):
            txt = render_prompt_text(_cfg(spec="a radial light burst", skel={"matte": matte}))
            self.assertIn(dau, txt, f"ô matte={matte} mất câu kỹ thuật của engine")


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
        # KHÔNG còn `skeleton/pose-demo.png` ở vị trí đầu: engine không đính ảnh của
        # chính nó nữa (khung xương bỏ 27/08/2026). `.att` giờ TOÀN LÀ ảnh người dùng.
        self.assertEqual(got, [shared, "refs/brand.png", "refs/inspo.png"])


class PoseSheetTest(unittest.TestCase):
    """TẤM DÁNG NHÂN VẬT: NHẬN DIỆN BẰNG GÌ, VÀ NÓI VỀ ẢNH THEO VAI TRÒ NÀO.

    ╔══ HAI LỖ CỦA BẢN CŨ, CẢ HAI ĐỀU IM LẶNG ═════════════════════════════════╗
    ║ ① `mascot_sheet = bool(sh.get("ref"))`. Thẻ Nhân vật của webapp nay ra một ║
    ║   tấm NHIỀU DÁNG, và người dùng được phép tả nhân vật bằng chữ thay vì tải ║
    ║   ảnh lên. Tấm ấy không có `ref` ⇒ rơi vào nhánh UI ⇒ lãnh khối "core /    ║
    ║   rim / decoration" và bị vẽ như một món đồ giao diện. Không có gì báo:    ║
    ║   prompt vẫn hợp lệ, ảnh vẫn ra, chỉ là ra sai thứ.                        ║
    ║ ② Ảnh manơcanh: `image_gen` nhận MỘT danh sách ảnh dùng chung cho cả tấm,  ║
    ║   nên client ghép sẵn thành một tấm cùng lưới rồi gửi qua `sheet.poseRef`. ║
    ║   Engine phải (a) đính nó và (b) NÓI nó là gì — thiếu (b) thì model coi nó ║
    ║   là một ảnh tham chiếu phong cách và vẽ ra một con manơcanh xám.          ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    """

    def _pose_cfg(self, **sheet):
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0].update(sheet)
        return cfg

    def test_o_dang_DU_de_vao_nhanh_mascot_du_khong_co_anh_nhan_vat(self):
        txt = render_prompt_text(self._pose_cfg())
        # DẤU HIỆU của nhánh mascot nằm ở section «Safe zone»: nhân vật được vẽ như
        # một dáng người, không phải một cái viền quanh mặt phẳng.
        self.assertIn("Draw the character as ONE natural figure", txt)
        # Luật viền/trang trí của ô UI KHÔNG được áp lên một nhân vật.
        self.assertNotIn("Any rim, border or edge treatment", txt)

    def test_khong_co_ref_thi_KHONG_noi_ve_mot_tam_anh_khong_ton_tai(self):
        txt = render_prompt_text(self._pose_cfg())
        self.assertNotIn("REFERENCE PHOTO", txt)
        self.assertNotIn("## Character reference", txt)

    def test_co_ref_thi_van_noi_dung_cau_cu(self):
        txt = render_prompt_text(self._pose_cfg(ref="refs/lan.png"))
        self.assertIn("## Character reference", txt)
        self.assertIn("The attached CHARACTER REFERENCE PHOTO is the character", txt)

    def test_poseRef_duoc_NOI_RA_theo_vai_tro_va_bi_cam_ve_lai(self):
        txt = render_prompt_text(self._pose_cfg(ref="refs/lan.png", poseRef="refs/tam-dang.png"))
        self.assertIn("## Pose reference", txt)
        self.assertIn("POSE REFERENCE SHEET", txt)
        self.assertIn("cell k there gives the body pose and camera angle", txt)
        self.assertIn("NEVER draw the mannequin itself", txt)
        # Vai trò, KHÔNG phải thứ tự đính kèm — cùng luật đã bỏ "The SECOND attached image".
        self.assertNotIn("SECOND attached image", txt)

    def test_poseRef_mot_minh_van_du_de_vao_nhanh_mascot(self):
        cfg = _cfg(spec="a mascot waving")            # skel mặc định: rrect, KHÔNG phải pose
        cfg["sheets"][0]["poseRef"] = "refs/tam-dang.png"
        self.assertIn("Draw the character as ONE natural figure", render_prompt_text(cfg))

    def test_tam_nhieu_dang_van_duoc_goi_dung_ten(self):
        cfg = _cfg(skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0]["grid"] = {"cols": 2, "rows": 1}
        cfg["sheets"][0]["components"].append(
            {"file": "02-thing", "spec": "waving", "skel": {"shape": "pose", "w": 0.3, "h": 0.85}})
        txt = render_prompt_text(cfg)
        self.assertIn("2x1 grid, 2 elements in reading order", txt)
        self.assertIn("Draw the character as ONE natural figure", txt)

    def test_layoutRef_duoc_NOI_RA_theo_vai_tro_va_KHONG_lai_loi_ve(self):
        """Bản phác bố cục trả lời câu «cái gì nằm ở đâu», KHÔNG trả lời «vẽ theo lối
        nào». Thiếu vế cấm thì model chép luôn nét chì và mảng xám của bản phác —
        đó là toàn bộ lý do câu này phải nói ra cả hai vế."""
        txt = render_prompt_text(self._pose_cfg(layoutRef="refs/bo-cuc.png"))
        self.assertIn("## Layout sketch", txt)
        self.assertIn("copy WHERE things sit", txt)
        self.assertIn("not its style, colours, line quality or level of finish", txt)

    def test_layoutRef_dinh_kem_NGAY_SAU_anh_cua_tam(self):
        got = render_prompt_files({
            "styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}],
            "sheets": [{
                "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
                "components": [{"file": "01-thing", "spec": "a village at dawn",
                                "skel": {"shape": "full", "w": 1, "h": 1}}],
                "ref": "refs/cho-tet.png",
                "layoutRef": "refs/bo-cuc.png",
            }],
        })
        self.assertEqual(got, ["refs/cho-tet.png", "refs/bo-cuc.png"])

    def test_poseRef_dinh_kem_NGAY_SAU_anh_nhan_vat(self):
        got = render_prompt_files({
            "styles": [{
                "id": "demo", "bg": "magenta", "style": "flat ink",
                "brand": {"mode": "image", "refs": ["refs/brand.png"]},
                "inspo": ["refs/inspo.png"],
            }],
            "sheets": [{
                "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
                "components": [{"file": "01-thing", "spec": "a mascot waving",
                                "skel": {"shape": "pose", "w": 0.3, "h": 0.85}}],
                "ref": "refs/lan.png",
                "poseRef": "refs/tam-dang.png",
            }],
        })
        self.assertEqual(got, ["refs/lan.png", "refs/tam-dang.png", "refs/brand.png", "refs/inspo.png"])


class SteeringPromptTest(unittest.TestCase):
    """Luật hình học phải nói bằng SỐ, và chỉ bằng số.

    Bản cũ ra lệnh bằng cách trỏ vào một tấm ảnh đính kèm ("the FIRST attached image
    is the geometry contract", "match the gray silhouette exactly"). Tấm ảnh đó không
    còn được render nữa, nên mọi câu trỏ vào nó là câu trỏ vào hư không — model sẽ tự
    bịa ra thứ nó nghĩ là đang được nói tới. Ca này khoá cả hai chiều: luật mới phải
    CÓ, luật cũ phải KHÔNG.
    """

    def setUp(self):
        self.txt = render_prompt_text(_cfg())

    def test_luat_core_noi_bang_toa_do_chu_khong_bang_anh(self):
        self.assertIn("exact pixel crop boxes", self.txt)
        self.assertIn("fills its safe zone exactly", self.txt)
        self.assertIn("origin top-left", self.txt)

    def test_luat_vung_an_toan_CHI_NOI_MOT_LAN(self):
        """Chủ sản phẩm 07/09/2026: *"khá dài dòng và không chuẩn"*. Đo được: luật
        vùng an toàn từng nằm ở BỐN chỗ ("production crop box", "Build each element
        from the inside out", "The continuous content surface is the CORE", và một
        dòng kết lặp lại lần nữa). Nói một luật bốn lần không làm model tuân bốn
        lần — nó làm mọi luật khác loãng đi."""
        self.assertEqual(self.txt.count("## Safe zone"), 1)
        # Cụm "safe zone" vẫn được nhắc ở dòng toạ độ của từng ô — đó là DỮ LIỆU,
        # không phải luật. Cái phải đúng một lần là LUẬT, và luật có đúng một nhà.
        head = self.txt[:self.txt.index("## Elements")]
        self.assertEqual(head.count("## Safe zone"), 1)
        for chet in ("Build each element from the inside out",
                     "production crop box",
                     "The continuous content surface is the CORE",
                     "SIZING:",
                     "The grid above is fixed for this sheet"):
            self.assertNotIn(chet, self.txt, f"khối cũ mọc lại: {chet}")

    def test_moi_dau_vet_cua_khung_xuong_da_bien_khoi_prompt(self):
        for chet in ("skeleton", "silhouette", "attached image is the geometry",
                     "guide box", "INNER CROP BOX", "deliberately expanded",
                     "OUTERMOST boundary of the functional CORE"):
            self.assertNotIn(chet, self.txt, f"prompt còn dấu vết khung xương: {chet}")


def _cfg(spec="blank button", skel=None, extra=None):
    sk = {"shape": "rrect", "w": 0.8, "h": 0.6}
    sk.update(skel or {})
    st = {"id": "demo", "bg": "magenta", "style": "flat ink"}
    st.update(extra or {})
    return {"styles": [st], "sheets": [{
        "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
        "components": [{"file": "01-thing", "spec": spec, "skel": sk}]}]}


class TransparentBackgroundTest(unittest.TestCase):
    """NỀN SHEET LÀ ALPHA THẬT, KHÔNG CÒN CHROMA-KEY.

    Trước đây prompt bắt model tô một mảng màu phẳng (magenta/green/cyan/blue)
    rồi slice.py tách theo màu. codex 0.149 trả về RGBA thật nên khâu giả đó bỏ
    được — kèm luôn cái giá của nó: viền nhiễm màu key, quầng sáng cụt, kính phải
    suy ngược C = α·F + (1−α)·K.

    Lớp này thay cho ``ChromaKeyTest`` cũ (đã xoá cùng ``key_of``/``CHROMA_KEYS``
    trong gen.sh). Nó khoá HAI CHIỀU: nền mới phải được nói ra, và từ vựng chroma
    không được bò về prompt — bò về thì không ca nào khác đỏ, chỉ ảnh ra là hỏng.
    """

    def setUp(self):
        self.prompt = render_prompt_text(_cfg())

    def test_prompt_doi_ALPHA_THAT_chu_khong_phai_mau_nen(self):
        # Luật nền nay nói ĐÚNG MỘT LẦN, trong section «Canvas» — không lặp lại ở
        # section «Transparency» nữa (xem `test_luat_trong_suot_CHI_NOI_MOT_LAN`).
        self.assertIn("Background fully transparent", self.prompt)
        self.assertIn("real alpha channel", self.prompt)
        self.assertIn("alpha 0 on every pixel", self.prompt)

    def test_luat_trong_suot_CHI_NOI_MOT_LAN(self):
        """Bốn khối cũ (nền alpha, cấm caro, "see-through", "fully opaque") gộp còn
        một section ba gạch đầu dòng, và câu nền thì ở hẳn section «Canvas»."""
        self.assertEqual(self.prompt.count("## Transparency"), 1)
        self.assertEqual(self.prompt.count("NEVER DRAW A CHECKERBOARD"), 1)
        for chet in ("This background rule OVERRIDES the art style",
                     "WHENEVER SOMETHING SHOULD BE SEE-THROUGH",
                     "Every element is FULLY OPAQUE with solid fills"):
            self.assertNotIn(chet, self.prompt, f"khối cũ mọc lại: {chet}")

    def test_prompt_CAM_DICH_DANH_viec_ve_caro_gia(self):
        """Bẫy đã đo được (BACKLOG #24 ⑦): không tạo được trong suốt thì model
        KHÔNG báo lỗi — nó vẽ một tấm caro xám-trắng ở α=255, nhìn bằng mắt y hệt
        ảnh nền trong suốt. Prompt phải gọi tên đúng hành vi đó mà cấm."""
        self.assertIn("NEVER DRAW A CHECKERBOARD", self.prompt)
        # ② nói ra VÌ SAO nó sai, ③ và chỉ ra cách làm đúng thay thế — thiếu ③ thì
        # model chỉ biết mình sai mà không biết đi đường nào (đo được: nó lấp bằng
        # thứ khác thay vì thôi lấp).
        self.assertIn("DISPLAYS empty pixels", self.prompt)
        self.assertIn("LOW ALPHA value in its own colour, never paler paint", self.prompt)

    def test_tu_vung_chroma_khong_duoc_quay_lai_prompt(self):
        for w in ("chroma", "flat solid", "#FF00FF", "#00FF00"):
            self.assertNotIn(w, self.prompt, f"prompt còn nhắc {w!r}")

    def test_o_glow_khong_con_bat_ve_NEN_DEN(self):
        """Nền đen từng là cách duy nhất lấy quầng sáng (C = α·F trên đen). Alpha
        thật mang sẵn cả dải mờ, nên giữ nền đen chỉ tổ nướng một mảng đen vào
        asset."""
        p = render_prompt_text(_cfg(skel={"matte": "glow"}))
        self.assertNotIn("PURE BLACK", p)
        self.assertNotIn("#000000", p)
        self.assertIn("no plate, no black, no checkerboard", p)
        self.assertIn("Ignore the safe-zone fill rule here", p)

    def test_o_glass_do_trong_nam_trong_kenh_alpha(self):
        p = render_prompt_text(_cfg(skel={"matte": "glass"}))
        self.assertIn("LOW ALPHA", p)
        self.assertIn("thin sheet of tinted glass", p)
        self.assertNotIn("chroma", p)

    def test_KHONG_MOT_MANH_CHROMA_NAO_CON_SONG(self):
        """Quyết định của chủ sản phẩm 22/08: bỏ HẲN, cả hai vế.

        Bản trước ca này chỉ đòi `gen.sh` sạch, còn cố tình để `slice.py` giữ
        `KEY_COLORS` cho tương thích ngược với sheet raw đời cũ. Chủ sản phẩm chốt
        bỏ luôn vế đó — và hệ quả đã biết: sheet raw nền magenta nằm sẵn trên đĩa
        KHÔNG cắt lại được nữa, phải sinh lại.

        Ca này canh việc mã CHẾT không lặng lẽ mọc lại. Nó quét MÃ, không quét chú
        thích, vì các file đó cố ý kể lại lịch sử bằng chữ."""
        import importlib.util

        def code_of(path):
            return re.sub(r"(?m)^\s*#.*$", "", path.read_text(encoding="utf-8"))

        chet = ("CHROMA_KEYS", "key_of(", "DEFAULT_KEY", "KEY_COLORS", "matte_chroma",
                "matte_vlahos", "matte_pymatting", "is_key_color", "key_binary",
                "border_colors", "erase_key_edge", "key_spill")
        for f in ("gen.sh", "slice.py", "validate_output_geometry.py"):
            code = code_of(ROOT / f)
            for w in chet:
                self.assertNotIn(w, code, f"{f} còn máy móc chroma: {w}")

        spec = importlib.util.spec_from_file_location("kg_slice", ROOT / "slice.py")
        sl = importlib.util.module_from_spec(spec); spec.loader.exec_module(sl)
        for name in ("KEY_COLORS", "matte_chroma", "is_key_color", "border_colors"):
            self.assertFalse(hasattr(sl, name), f"slice.py còn export `{name}`")
        # Và thứ PHẢI ở lại: chốt chặn caro giả + đường alpha.
        self.assertTrue(hasattr(sl, "painted_checkerboard"))
        self.assertTrue(hasattr(sl, "alpha_sheet"))

    def test_KHONG_CON_NAP_torch_hay_pymatting(self):
        """Bỏ matting chroma là bỏ luôn lý do tồn tại của ViTMatte/PyMatting.

        Đây không phải chuyện gọn mã: `torch` + checkpoint ViTMatte là ~2 GB trong
        bộ cài. Nếu ai đó nạp lại chúng thì hoặc là đường chroma sống dậy, hoặc là
        bộ cài phình lên vì một import không ai dùng."""
        code = re.sub(r"(?m)^\s*#.*$", "", (ROOT / "slice.py").read_text(encoding="utf-8"))
        for w in ("import torch", "transformers", "pymatting", "VitMatte"):
            self.assertNotIn(w, code, f"slice.py nạp lại `{w}`")


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
            "components": [{"file": "01-thing", "spec": "the primary action button",
                            "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}}],
        }],
    }

    def test_co_logo_van_PHAI_con_dong_bang_mau(self):
        txt = render_prompt_text(self.CFG)
        self.assertIn("#0A5C36", txt, "tải logo lên là mất dòng màu thương hiệu")
        self.assertIn("#F2C230", txt)

    def test_va_logo_van_duoc_dinh_kem(self):
        self.assertIn("refs/logo.png", render_prompt_files(self.CFG))

    # Prompt ngắt dòng ở ~86 cột, nên câu nào cũng có thể bị cắt giữa chừng. Cái
    # phải khớp là CHỮ, không phải chỗ xuống dòng — y hệt mẹo `flat()` mà ca mirror
    # bên webapp (`cell-background.test.tsx`) đã phải dùng, và vì cùng một lý do.
    @staticmethod
    def _lien(txt):
        return re.sub(r"\s+", " ", txt)

    def test_co_khoi_phan_xu_mau_va_no_dat_bang_mau_len_dau(self):
        txt = render_prompt_text(self.CFG)
        self.assertIn("## Palette", txt)
        sau = self._lien(txt[txt.index("## Palette"):])
        self.assertIn("dominant: primary actions and key surfaces", sau)
        self.assertIn("decide the RENDERING, not the hue", sau,
                      "ảnh ref phải quyết lối vẽ, không quyết màu")

    def test_moi_ma_mau_XUAT_HIEN_DUNG_MOT_LAN(self):
        """Bảng màu từng được nói BA lần: chữ trong `variant.style`
        (`describeBrandColors`), dòng "Brand palette:", và khối "COLOUR AUTHORITY".
        Ba nguồn cùng nói về màu thì nguồn ĐỨNG GẦN Ô NHẤT thắng — đúng triệu chứng
        "màu nhận diện thương hiệu không được respect"."""
        txt = render_prompt_text(self.CFG)
        self.assertEqual(txt.count("#0A5C36"), 1)
        self.assertEqual(txt.count("#F2C230"), 1)
        self.assertEqual(txt.count("## Palette"), 1)

    def test_engine_KHONG_con_viet_lai_spec_cua_nguoi_dung(self):
        """CA NÀY ĐÃ ĐỔI HẲN Ý NGHĨA — đọc kỹ trước khi "sửa cho xanh".

        Bản cũ tên là `test_dong_o_khong_con_mot_chu_mau_nao`: nó nạp một spec vật
        liệu ("glossy 3D candy-red capsule button") rồi đòi engine GẶM sạch chữ màu
        khỏi dòng ô. Bộ máy gặm chữ đó (`strip_finish`/`preset_words`, ~250 dòng) đã
        bị bỏ, và bỏ có lý do: nó tồn tại chỉ vì THƯ VIỆN tự ra lệnh vật liệu, tức
        engine đi gỡ cái mồi do chính nó gieo. Nay thư viện chỉ còn danh từ
        (`ThuVienChiCoDANHTUTest` canh điều đó), nên chữ vật liệu còn sót lại trong
        một spec là chữ NGƯỜI DÙNG tự chọn — và gặm chữ của người dùng là một lỗi.

        Nên yêu cầu của chủ sản phẩm được giữ ở CHỖ KHÁC: spec đi thẳng, nguyên vẹn;
        còn thứ hạng thì engine TUYÊN BỐ ngay trên danh sách ô.
        """
        txt = render_prompt_text(self.CFG)
        lines = txt.splitlines()
        head = first_cell_line(txt)
        self.assertTrue(
            lines[head].startswith("1) " + self.CFG["sheets"][0]["components"][0]["spec"] + " — safe zone x="),
            "spec của người dùng phải đi thẳng vào prompt, không bị sửa")
        truoc = txt[:cell_list_offset(txt)]
        self.assertIn("the art style above decides how it looks", truoc,
                      "bỏ gặm chữ thì phải còn câu tuyên bố thứ hạng, không thì mất cả hai")

    def test_khong_co_brand_thi_khong_bia_ra_dong_mau(self):
        cfg = json.loads(json.dumps(self.CFG))
        cfg["styles"][0]["brand"] = {"refs": ["refs/logo.png"]}
        txt = render_prompt_text(cfg)
        self.assertNotIn("Primary #", txt)
        sau = self._lien(txt[txt.index("## Palette"):])
        self.assertIn("decide both the rendering and the palette", sau)


def _cfg_nen(spec="a village square at dawn, red lanterns overhead", n=1, extra=None):
    """Contract của thẻ «Cảnh nền» bên webapp: khổ dọc, lưới 1x1, ô `shape:"full"`.

    Giữ khác `_cfg` chứ không thêm cờ: hai ca này khác nhau ở HÌNH DẠNG contract, và
    ca nhiều ô (`n > 1`) tồn tại chỉ để chứng minh nhánh cũ CÒN SỐNG.
    """
    sheet = {
        "id": "nen", "canvas": "portrait", "grid": {"cols": 1, "rows": n},
        "components": [{"file": f"{i + 1:02d}-nen", "vi": "Cảnh nền", "spec": spec,
                        "skel": {"shape": "full", "w": 1, "h": 1}} for i in range(n)],
    }
    sheet.update(extra or {})
    return {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}], "sheets": [sheet]}


class CanhNenMotKhungTest(unittest.TestCase):
    """MỘT CẢNH NỀN LÀ MỘT MÀN HÌNH, KHÔNG PHẢI MỘT SPRITE SHEET CÓ ĐÚNG MỘT Ô.

    ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 07/09/2026) ══════════════════════════════════╗
    ║ «Cảnh nền → prompt dài quá, giờ tách ra ko cho nó gen sprite sheet nữa    ║
    ║ nhé, kiểu gen full khung mobile luôn.»                                    ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Trước bản này tấm nền đi CHUNG một đường với tấm giao diện, nên nó lãnh nguyên
    bộ luật viết cho những ô sẽ bị cắt rời: lưới cứng, hộp cắt safe zone, cấu tạo
    ba lớp core/rim/decoration, nền phải trong suốt hoàn toàn, cấm vẽ caro. Ngót
    trăm dòng nói về những thứ tấm này KHÔNG có — và tệ hơn cả thừa, chúng nói
    NGƯỢC: một tấm mà tranh phải phủ kín từ mép đến mép lại vừa được lệnh «nền phải
    trong suốt» vừa được lệnh «chừa 40px đệm quanh element».

    Ca này khoá HAI CHIỀU. Chiều một: prompt nền không được mang lại một chữ nào của
    bộ luật kia. Chiều hai: tấm full-bleed NHIỀU ô (bộ nhiều cảnh trên một canvas)
    vẫn phải đi đường cũ — gộp hai ca lại là mất một trong hai.
    """

    def setUp(self):
        self.txt = render_prompt_text(_cfg_nen(), name="demo-nen")

    # ── chiều một: những thứ KHÔNG được có mặt nữa ────────────────────────────
    def test_khong_con_mot_chu_nao_cua_bo_luat_sprite_sheet(self):
        # "empty" trần không nằm trong danh sách: chính nhánh mới cũng nói "inset
        # inside an empty frame is unusable" — đó là câu CẤM chừa viền, tức là thứ
        # ngược hẳn với luật ô trống của tấm giao diện. Cấm theo cụm, không theo từ.
        # "transparent" trần KHÔNG nằm trong danh sách nữa: section «Canvas» của
        # nhánh này nói "there is no transparent area anywhere" — câu ĐẢO NGƯỢC luật
        # nền, và nó phải có mặt. Cấm theo cụm, không theo từ.
        for w in ("grid", "safe zone", "CORE", "fully transparent", "checkerboard",
                  "alpha", "cell", "40px", "intentionally empty",
                  "## Safe zone", "## Transparency"):
            self.assertNotIn(w.lower(), self.txt.lower(),
                             f"prompt cảnh nền còn chữ của tấm giao diện: {w}")

    def test_khong_con_danh_sach_o_danh_so(self):
        """Không có ô nào để đánh số: cả tấm LÀ một ô. Một danh sách "1) …" ở đây
        chỉ mời model chia tranh ra thành ngăn."""
        self.assertNotIn("\n1) ", self.txt)
        with self.assertRaises(AssertionError):
            first_cell_line(self.txt)

    def test_prompt_ngan_bang_mot_phan_ba_tam_giao_dien(self):
        """Ngưỡng đo được, không phải cảm tính: đây chính là lời phàn nàn («prompt
        dài quá»), nên nó phải có một con số canh gác. Bản trước tấm nền dài xấp xỉ
        bằng tấm UI vì chúng dùng chung mọi khối."""
        ui = render_prompt_text(_cfg(spec="the primary action button"))
        self.assertLess(len(self.txt.splitlines()), 22,
                        "prompt cảnh nền phình trở lại")
        self.assertLess(len(self.txt), len(ui) / 2,
                        "prompt cảnh nền phải ngắn hơn hẳn tấm giao diện")

    # ── chiều hai: những thứ PHẢI có mặt ─────────────────────────────────────
    def test_hai_dong_dau_van_la_hop_dong_kho_giay_voi_tang_bash(self):
        """`run_one` đọc ngược khổ bằng `head -n2 … | grep -qiE 'PORTRAIT|SQUARE'`.
        Nhánh mới cũng là một nhánh dựng prompt, nên nó cũng phải giữ hợp đồng ấy."""
        rows = self.txt.splitlines()
        self.assertEqual(rows[0], "## Canvas")
        self.assertTrue(rows[1].startswith("PORTRAIT 1024x1536 px,"), rows[1])

    def test_co_cau_ky_thuat_phu_kin_khung_va_phong_cach_cua_nguoi_dung(self):
        self.assertIn("A single full-screen mobile game background", self.txt)
        self.assertIn("filling the whole frame edge to edge", self.txt)
        self.assertIn("1024x1536 px", self.txt)
        self.assertIn("## Art style\nflat ink.", self.txt)

    def test_canh_nguoi_dung_go_la_cau_cuoi_va_khong_bi_sua_mot_ky_tu(self):
        spec = "a village square at dawn, red lanterns overhead"
        con = [l for l in self.txt.splitlines() if l.strip()]
        self.assertIn(spec, con)
        self.assertEqual(con[-1], "Game-ready mobile game background art, portrait 2:3.")
        self.assertEqual(con[-2], "## Output")
        self.assertEqual(con[-3], spec, "cảnh phải là câu cuối trước dòng chốt")

    def test_ghi_chu_va_chi_dao_cua_nguoi_dung_van_di_theo(self):
        txt = render_prompt_text(
            _cfg_nen(extra={"note": "Ghi chú của tấm.", "directive": "thêm mưa xuân"}),
            name="demo-nen")
        self.assertIn("## Direction", txt)
        self.assertIn("Ghi chú của tấm.", txt)
        self.assertIn("From the designer: thêm mưa xuân", txt)

    def test_anh_dinh_kem_cua_tam_nen_TA_CANH_chu_khong_ta_nhan_vat(self):
        """Thẻ Cảnh nền cho đính ảnh, và ảnh ấy về contract là `sheet.ref` — đúng
        field mà tấm mascot dùng. Câu cũ nói thẳng «trong ảnh này là NHÂN VẬT», nên
        một tấm ảnh chợ Tết sẽ mọc ra giữa màn hình một con mascot không ai xin."""
        txt = render_prompt_text(_cfg_nen(extra={"ref": "refs/cho-tet.png"}), name="demo-nen")
        self.assertIn("The attached SCENE REFERENCE image", txt)
        self.assertNotIn("character REFERENCE PHOTO", txt)

    # ── nhánh cũ còn sống ────────────────────────────────────────────────────
    def test_tam_full_bleed_NHIEU_o_van_di_duong_cu(self):
        """Nhiều cảnh trên một canvas thì vẫn phải có lưới và ranh giới ô — nó chỉ
        giống tấm nền ở chỗ không có pixel rỗng."""
        txt = render_prompt_text(_cfg_nen(n=2), name="demo-nen")
        self.assertIn("1x2 grid, 2 elements in reading order", txt)
        self.assertIn("full-bleed scene, fills its whole cell", txt)
        self.assertIn("bleeds off all four sides of that cell", txt)
        self.assertIn("## Scenes", txt)

    def test_dau_fullbleed_cho_tang_bash_van_duoc_ghi(self):
        """Mối nối python→bash của cổng alpha (`alpha_verdict` lật ngược phép kiểm
        cho tấm full-bleed). Nhánh mới không được đánh rơi nó."""
        src = (ROOT / "gen.sh").read_text(encoding="utf-8")
        block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
        with tempfile.TemporaryDirectory() as td:
            _seed_workspace(td, _cfg_nen())
            cwd = os.getcwd()
            os.chdir(td)
            try:
                exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
                self.assertTrue(Path(td, "prompts", "demo-nen.fullbleed").exists())
            finally:
                os.chdir(cwd)


class KhungPromptSectionTest(unittest.TestCase):
    """KHUNG PROMPT = SECTION MARKDOWN, MỖI LUẬT MỘT NHÀ.

    ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 07/09/2026) ══════════════════════════════════╗
    ║ Dán nguyên văn prompt một tấm Bộ UI ba element — 95 dòng — rồi nói: *"tôi  ║
    ║ đổi style khác nó lại nhồi cái đoạn style lên đầu à… đáng nhẽ nên chia     ║
    ║ thành section ## Art style… bạn audit lại toàn bộ khung prompt đi, khá dài ║
    ║ dòng và không chuẩn"*.                                                     ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Ca này khoá HÌNH DẠNG, không khoá câu chữ: tiêu đề nào có mặt, theo thứ tự nào,
    và tổng cộng dài bao nhiêu. Câu chữ bên trong từng section thì các lớp khác
    canh — tách ra vì hai thứ hỏng theo hai kiểu khác nhau: sửa một câu là chuyện
    thường ngày, còn để một luật mọc lại ở hai chỗ là quay về đúng cái bệnh trên.
    """

    def _ui3(self):
        cfg = {
            "styles": [{"id": "demo", "bg": "magenta", "style": "clean vector shapes with flat fills",
                        "brand": {"mode": "colors", "primary": "#43437a", "secondary": "#712323"}}],
            "sheets": [{
                "id": "ui", "canvas": "square", "grid": {"cols": 2, "rows": 2},
                "components": [
                    {"file": "01-button", "vi": "Nút", "spec": "button",
                     "skel": {"shape": "rrect", "w": 0.36, "h": 0.36}},
                    {"file": "02-hp", "vi": "Máu", "spec": "health bar",
                     "skel": {"shape": "bar", "w": 0.8, "h": 0.6}},
                    {"file": "03-avatar", "vi": "Avatar", "spec": "avatar frame",
                     "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}},
                    {"file": "_empty-1", "vi": "", "spec": "", "skel": {"shape": "empty"}},
                ],
            }],
        }
        return render_prompt_text(cfg, name="demo-ui")

    @staticmethod
    def _headings(txt):
        return [row[3:] for row in txt.splitlines() if row.startswith("## ")]

    def test_tam_giao_dien_co_dung_bo_section_va_dung_thu_tu(self):
        self.assertEqual(
            self._headings(self._ui3()),
            ["Canvas", "Art style", "Palette", "Layout", "Safe zone",
             "Transparency", "Text", "Elements", "Output"])

    def test_tam_giao_dien_ba_element_khong_qua_50_dong(self):
        """Con số này LÀ lời phàn nàn, nên nó phải có một cái chốt đo được. Bản
        trước tấm ấy dài 95 dòng."""
        rows = self._ui3().splitlines()
        self.assertLessEqual(len(rows), 50, "\n".join(rows))

    def test_moi_tieu_de_XUAT_HIEN_DUNG_MOT_LAN(self):
        txt = self._ui3()
        heads = self._headings(txt)
        self.assertEqual(len(heads), len(set(heads)), "một luật mọc ra hai nhà")

    def test_o_TRONG_chi_duoc_goi_ten_o_section_Layout(self):
        """Ô trống từng có một dòng riêng trong danh sách ("4)  — leave this area
        empty") — vừa là lần nói thứ hai của cùng một luật, vừa là một dòng mở đầu
        bằng số thứ tự mà không có danh từ nào theo sau."""
        txt = self._ui3()
        self.assertIn("Cell 4 is intentionally empty", txt)
        self.assertNotIn("\n4)", txt)

    def test_tam_man_hinh_bo_ba_section_khong_co_nghia_voi_no(self):
        cfg = _cfg_nen()
        heads = self._headings(render_prompt_text(cfg, name="demo-nen"))
        self.assertEqual(heads, ["Canvas", "Art style", "Layout", "Text", "Scene", "Output"])

    def test_tam_nhan_vat_co_them_section_anh_theo_vai_tro(self):
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0]["ref"] = "refs/lan.png"
        cfg["sheets"][0]["poseRef"] = "refs/tam-dang.png"
        heads = self._headings(render_prompt_text(cfg))
        self.assertEqual(heads, ["Canvas", "Art style", "Layout", "Safe zone", "Transparency",
                                 "Text", "Character reference", "Pose reference",
                                 "Elements", "Output"])
