"""Test khối dựng prompt của gen.sh (backlog P2-10 + mục 5).

gen.sh nhúng một khối Python heredoc. Test nạp ĐÚNG mã đang ship (cắt tới ngay
trước vòng lặp dựng prompt) chứ không chép lại — chép lại là test xanh mà sản
phẩm đỏ.
"""
import contextlib, hashlib, io, json, os, re, shutil, tempfile, unittest
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
    Path(td, "refs").mkdir(exist_ok=True)
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


def render_desc_file(cfg, name="demo-pose-demo"):
    """Bản kê «ảnh nào phải đổi thành CHỮ, với vai gì» — `prompts/<job>.desc`.

    Đây là mối nối python → bash của bước tả ảnh: khối python biết vai của từng ảnh
    (nhân vật / phong cách / bố cục), còn codex thì chỉ gọi được từ tầng bash.
    """
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    with tempfile.TemporaryDirectory() as td:
        _seed_workspace(td, cfg)
        cwd = os.getcwd()
        os.chdir(td)
        try:
            exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
            rows = Path(td, "prompts", f"{name}.desc").read_text(encoding="utf-8").splitlines()
            return [tuple(row.split("\t")) for row in rows if row]
        finally:
            os.chdir(cwd)


def _run_block_in(td, name):
    """Chạy khối dựng prompt trong một workspace ĐÃ GIEO SẴN (cache mô tả, ảnh…)."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    block = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", src, re.S).group(1)
    cwd = os.getcwd()
    os.chdir(td)
    try:
        exec(compile(block, "gen.sh:PY", "exec"), {"__name__": "gen_prompt_test"})
        return Path(td, "prompts", f"{name}.txt").read_text(encoding="utf-8")
    finally:
        os.chdir(cwd)


def _att_in(td, name):
    """Danh sách ảnh ĐÍNH KÈM của một workspace đã chạy — đọc sau `_run_block_in`."""
    return Path(td, "prompts", f"{name}.att").read_text(encoding="utf-8").split()


def _desc_in(td, name):
    """Bản kê «ảnh nào phải tả thành chữ» của một workspace đã chạy."""
    rows = Path(td, "prompts", f"{name}.desc").read_text(encoding="utf-8").splitlines()
    return [tuple(row.split("\t")) for row in rows if row]


def png_rgba(w, h, a):
    """PNG RGBA đặc một màu, `a=0` là trong suốt hoàn toàn — dựng TAY.

    Bằng `zlib` + `struct` chứ không bằng Pillow: phép đo "ảnh này có nền trong
    suốt thật không" LÀ thứ đang được kiểm, nên ca test không được phụ thuộc vào
    việc máy chạy nó có Pillow hay không theo một đường khác. Ảnh thì tự dựng
    được; còn `ref_has_alpha` của gen.sh cần Pillow thật thì ca test tự bỏ qua.
    """
    import struct
    import zlib

    raw = b"".join(b"\x00" + bytes([200, 60, 60, a]) * w for _ in range(h))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw))
            + chunk(b"IEND", b""))


def co_pillow():
    try:
        import PIL.Image  # noqa: F401
        return True
    except Exception:
        return False


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


def first_cell_line_text(txt):
    """NGUYÊN VĂN dòng element đầu tiên — dùng để quét thứ chỉ được có mặt Ở ĐÓ.

    Khác `first_cell_line` (trả CHỈ SỐ dòng) đúng ở kiểu trả về, và tách ra vì hai
    câu hỏi khác nhau: "danh sách ô bắt đầu ở đâu" và "dòng ấy nói gì".
    """
    return txt.splitlines()[first_cell_line(txt)]


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

    def test_luong_trang_tri_do_DONG_CUA_O_quyet_dinh_khong_phai_theme(self):
        """CHỦ SẢN PHẨM, 09/2026: *"lần nào nó cũng ra viền decor"*.

        Bộ kit theme Tết: hoa mai và đèn lồng bám quanh MỌI ô, kể cả ô người dùng đã
        chọn «Không trang trí» trên app. Nguồn không phải một câu sai mà là một khoảng
        TRỐNG — `## Art style` tả cả một bộ nhận diện lễ hội, `## Elements` nói lượng
        trang trí cho từng ô, và không dòng nào nói ai thắng ai. Model chọn nguồn nói
        to hơn, tức là theme. Một dòng phân vai, ngay trên danh sách ô.

        Ca này khoá CẢ HAI CHIỀU: dòng phải có mặt ở tấm giao diện, và nó phải đứng
        TRƯỚC danh sách (một luật in sau ô số 1 thì ô số 1 không nghe thấy)."""
        txt = self.texts["ui"]
        head = txt[:cell_list_offset(txt)]
        self.assertIn("Ornament amount and placement are set PER ELEMENT", head)
        self.assertIn("the theme supplies the motif, not the quantity", head)

    def test_luat_trang_tri_KHONG_len_tam_full_bleed(self):
        """GUARD ÂM. Ở tấm full-bleed mỗi ô là một bức tranh phủ kín ô, không có "vật
        thể" nào để mà đếm hoa văn bám quanh — dòng ấy chỉ là chữ thừa ở đó.

        Dùng tấm NHIỀU ô full-bleed (`_cfg_nen(n=2)`) chứ không phải tấm một ô: tấm
        một ô đi hẳn nhánh `screen_sheet`, ở đó không có section «Elements» nào để mà
        chứng minh điều gì — ca sẽ xanh vì mù."""
        txt = render_prompt_text(_cfg_nen(n=2), name="demo-nen")
        self.assertIn("## Scenes", txt)          # đúng là đã vào nhánh danh sách
        self.assertNotIn("Ornament amount and placement", txt)


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
        """`run_one` đọc ngược khổ bằng `head -n3 | grep`. Ba dòng đầu lệch một chữ
        là mọi tấm dọc/vuông bị gửi đi với 1536x1024.

        HAI chứ không phải MỘT kể từ khi prompt chia section: dòng 1 là tiêu đề
        `## Canvas`, khổ giấy nằm ở dòng ngay dưới."""
        cfg = _cfg()
        cfg["sheets"][0]["canvas"] = "square"
        txt = render_prompt_text(cfg)
        rows = txt.splitlines()
        # 09/09/2026: dòng 0 là từ khoá tham số nền (chủ sản phẩm: «để ngay ở trên
        # đầu»), «## Canvas» lùi xuống dòng 1, khổ giấy ở dòng 2 — run_one đọc head -n3.
        self.assertEqual(rows[0], 'background="transparent"')
        self.assertEqual(rows[1], "## Canvas")
        self.assertTrue(rows[2].startswith("SQUARE 1254x1254 px,"), rows[2])
        self.assertIn("square 1:1", txt)

    def test_promptOverride_van_giu_SECTION_KHO_GIAY(self):
        """Người dùng tự soạn cả prompt thì engine không nối thêm một chữ nào —
        NGOẠI TRỪ section «Canvas», vì `run_one` đọc ngược khổ từ đó."""
        cfg = _cfg()
        cfg["sheets"][0]["canvas"] = "square"
        cfg["sheets"][0]["promptOverride"] = "TÔI TỰ SOẠN."
        txt = render_prompt_text(cfg)
        rows = txt.splitlines()
        self.assertEqual(rows[0], 'background="transparent"')
        self.assertEqual(rows[1], "## Canvas")
        self.assertTrue(rows[2].startswith("SQUARE 1254x1254 px,"), rows[2])
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

    ĐỘ TRONG thì KHÁC, và nó được ở lại trong spec: alpha là TRẠNG THÁI kỹ thuật của
    ô, không phải thẩm mỹ, và nó là thứ prompt tổng phong cách không nói hộ được. Nó
    từng nằm ở `skel.matte` (gen.sh in ra một khối riêng) — cờ ấy đã bỏ khỏi
    contract/engine/agent 08/09/2026, cùng ngày với cả pill «Đục nền» của app.
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

    def test_rang_buoc_ky_thuat_ALPHA_o_spec_KHONG_o_skel(self):
        """ĐẢO CHIỀU 08/09/2026 (ca này trước đây đòi đúng điều ngược lại).

        Hai ô mang hợp đồng alpha thật sự. Hợp đồng ấy từng ở `skel.matte` vì đó là
        thứ cả gen.sh lẫn slice.py cùng đọc — nhưng slice.py đã thôi đọc nó (chỉ crop
        theo toạ độ), còn gen.sh thì in ra một khối câu chữ CHỒNG lên câu đục nền mà
        webapp đã nối vào cùng ô. Nguồn sự thật thứ hai nằm ở chính chỗ đó, không phải
        ở spec. Nay: một câu, trong spec, và `matte` không còn ở đâu trong thư viện."""
        by = {e["file"]: e for e in self.lib["elements"]}
        for f in ("16-fx-burst", "22-board-panel"):
            self.assertNotIn("matte", by[f]["skel"], f"{f}: cờ matte đã bỏ")
            self.assertIn("alpha", by[f]["spec"].lower(), f"{f}: hợp đồng alpha phải ở spec")
        # …và KHÔNG ô nào khác trong thư viện lén mang lại cờ ấy.
        self.assertEqual(
            [e["file"] for e in self.lib["elements"] if "matte" in e.get("skel", {})], [],
            "thư viện còn khai skel.matte")

    def test_engine_KHONG_con_tu_phat_cau_ky_thuat_cho_o_glow_glass(self):
        """GUARD ÂM. Hai nhánh `skel.matte` của gen.sh đã bỏ: prompt không được mọc
        lại một khối alpha thứ hai bên cạnh câu đục nền mà webapp gửi trong spec."""
        for matte in ("glow", "glass"):
            txt = render_prompt_text(_cfg(spec="a radial light burst", skel={"matte": matte}))
            self.assertNotIn("LIGHT EFFECT", txt)
            self.assertNotIn("SEE-THROUGH ELEMENT", txt)
            self.assertNotIn("matte", txt.lower(), f"matte={matte} rò vào prompt")
        # Ô kính nói độ trong bằng SPEC, và spec đi nguyên văn vào prompt.
        glassy = render_prompt_text(_cfg(spec="a background panel, a see-through sheet of glass"
                                              " drawn at low alpha with an opaque frame and rim"))
        self.assertIn("drawn at low alpha", glassy)


class AttachmentListTest(unittest.TestCase):
    """AI ĐƯỢC ĐÍNH KÈM — VÀ TỪ 09/09/2026 CÂU TRẢ LỜI THƯỜNG LÀ "KHÔNG AI CẢ".

    ╔══ ĐO ĐƯỢC (chủ sản phẩm, 09/09/2026) ═════════════════════════════════════╗
    ║ Cùng một prompt, cùng một model: gọi `image_gen` KÈM `referenced_image_    ║
    ║ paths` ⇒ ảnh về là RGB, nền caro vẽ tay. Bỏ ảnh ra ⇒ alpha thật. Tool      ║
    ║ built-in không có tham số nền nào để xin.                                  ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Nên `.att` (danh sách `-i` + khối REFERENCE IMAGES của task) chỉ còn dành cho
    tấm FULL-BLEED; mọi tấm cần alpha ghi `.att` RỖNG và một bản kê `.desc`.

    ⚠️ LUẬT ẤY ĐÃ HẸP LẠI: phép đo trên làm bằng một tấm ảnh ĐỤC, và ảnh tham chiếu
    CÓ alpha thật thì đính vẫn giữ được alpha (memory dự án 21-22/08/2026). Lớp này
    chạy trên một workspace KHÔNG có file ảnh nào, nên `ref_has_alpha` trả `False`
    cho tất cả — tức nó khoá đúng nhánh ẢNH ĐỤC. Nhánh còn lại:
    `AnhTrongSuotThiDinhThangTest`.
    """

    CHUNG = "refs/shared.png"

    def _cfg(self, skel, ref=None):
        return {
            "styles": [{
                "id": "demo", "bg": "magenta", "style": "flat ink",
                "brand": {"mode": "image", "refs": [self.CHUNG, "refs/brand.png", self.CHUNG]},
                "inspo": [self.CHUNG, "refs/inspo.png", "refs/inspo.png"],
            }],
            "sheets": [{
                "id": "pose-demo", "grid": {"cols": 1, "rows": 1},
                "components": [{"file": "01-thing", "spec": "blank button", "skel": skel}],
                **({"ref": ref} if ref else {}),
            }],
        }

    def test_tam_can_alpha_KHONG_dinh_mot_anh_nao(self):
        got = render_prompt_files(self._cfg({"shape": "rrect", "w": 0.8, "h": 0.6},
                                            ref=self.CHUNG))
        self.assertEqual(got, [], "đính ảnh = mất nền trong suốt (đo được)")

    def test_tam_full_bleed_van_dinh_kem_va_van_khu_trung_lap(self):
        """Ảnh CẢNH phải được đính thật: tả một khu chợ Tết thành văn rồi vẽ lại là
        mất đúng thứ người dùng tải lên. Tấm ấy không cần alpha nên không mất gì.

        Khử trùng lặp vẫn là luật cũ: codex tính token theo từng `-i`."""
        got = render_prompt_files(self._cfg({"shape": "full", "w": 1, "h": 1}, ref=self.CHUNG))
        self.assertEqual(got, [self.CHUNG, "refs/brand.png", "refs/inspo.png"])

    def test_ban_ke_desc_khai_dung_VAI_cua_tung_anh(self):
        """`.desc` là mối nối python → bash: bash đọc VAI để biết hỏi câu nào."""
        got = render_desc_file(self._cfg({"shape": "rrect", "w": 0.8, "h": 0.6},
                                         ref=self.CHUNG))
        self.assertEqual(got, [("character", self.CHUNG),
                               ("style", "refs/brand.png"),
                               ("style", "refs/inspo.png")])

    def test_tam_full_bleed_KHONG_ta_anh_thanh_chu(self):
        got = render_desc_file(self._cfg({"shape": "full", "w": 1, "h": 1}, ref=self.CHUNG))
        self.assertEqual(got, [], "tấm đính được ảnh thì không tiêu một lượt codex nào để tả")


class AnhThanhChuTest(unittest.TestCase):
    """ẢNH THAM CHIẾU ĐI VÀO PROMPT BẰNG CHỮ, KHÔNG BẰNG FILE ĐÍNH KÈM.

    ╔══ ĐO ĐƯỢC (chủ sản phẩm, 09/09/2026) ═════════════════════════════════════╗
    ║ Đính ảnh vào lời gọi `image_gen` (`referenced_image_paths`) ⇒ ảnh trả về   ║
    ║ mất nền trong suốt: RGB, nền caro do model tự vẽ. Cùng prompt ấy, bỏ ảnh   ║
    ║ ra ⇒ alpha thật. Tool built-in KHÔNG có tham số nền nào để xin.            ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Nên tấm cần alpha đổi mọi ảnh của nó thành CHỮ trước khi vẽ. Khối python để
    lại dấu chỗ `{{DESC:<ảnh>}}`; tầng bash tả xong thì thay vào (xem
    `test/gen-describe-refs.test.sh`). Lớp này khoá nửa python của mối nối ấy.
    """

    @staticmethod
    def _mascot(**sheet):
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0].update(sheet)
        return cfg

    def test_prompt_nhan_vat_KHONG_con_mot_chu_nao_ve_anh_dinh_kem(self):
        """Trỏ vào một tấm ảnh không có trong lượt vẽ là dạy model đi tìm thứ không
        tồn tại — và nó sẽ tự bịa ra thứ nó nghĩ là đang thiếu."""
        txt = render_prompt_text(self._mascot(ref="refs/lan.png"))
        for cam in ("attached", "REFERENCE PHOTO", "reference photo", "referenced_image_paths"):
            self.assertNotIn(cam, txt, f"prompt còn trỏ vào ảnh đính kèm: {cam}")

    def test_anh_phong_cach_thanh_section_Style_reference(self):
        cfg = self._mascot()
        cfg["styles"][0]["inspo"] = ["refs/inspo.png"]
        txt = render_prompt_text(cfg)
        self.assertIn("## Style reference", txt)
        self.assertIn("{{DESC:refs/inspo.png}}", txt)
        # …và «Art style» phải trỏ xuống section ấy, không trỏ vào ảnh đính kèm.
        self.assertIn("The «Style reference» section below describes", txt)
        self.assertNotIn("The attached reference image(s) ARE the style", txt)

    def test_tam_full_bleed_GIU_NGUYEN_loi_noi_ve_anh_dinh_kem(self):
        """Chiều ngược lại: tấm cảnh nền không cần alpha nên nó vẫn đính ảnh thật,
        và mọi câu chữ cũ của nó phải còn nguyên."""
        cfg = _cfg_nen(extra={"ref": "refs/cho-tet.png"})
        cfg["styles"][0]["inspo"] = ["refs/inspo.png"]
        txt = render_prompt_text(cfg, name="demo-nen")
        self.assertIn("The attached SCENE REFERENCE image", txt)
        self.assertIn("The attached reference image(s) ARE the style", txt)
        self.assertNotIn("{{DESC:", txt)

    def test_cache_con_han_thi_prompt_MANG_LUON_CHU_va_khong_con_dau_cho(self):
        """Nửa đắt tiền nhất của bước tả ảnh: KHÔNG gọi codex lần thứ hai cho cùng
        một tấm ảnh. Cache do bash ghi, khối python đọc lại được — nên lượt sau (và
        cả màn xem trước prompt) có sẵn chữ, không còn việc gì để làm."""
        cfg = self._mascot(ref="refs/lan.png")
        with tempfile.TemporaryDirectory() as td:
            _seed_workspace(td, cfg)
            anh = Path(td, "refs", "lan.png")
            anh.write_bytes(b"mot tam anh gia")
            key = ("# sha256:" + hashlib.sha256(anh.read_bytes()).hexdigest()
                   + " role:character v2")
            Path(td, "refs", "lan.png.desc.txt").write_text(
                key + "\nA round red squirrel with a cream belly.\n", encoding="utf-8")
            txt = _run_block_in(td, "demo-pose-demo")
        self.assertIn("A round red squirrel with a cream belly.", txt)
        self.assertNotIn("{{DESC:", txt)

    def test_cache_lech_BAM_thi_coi_nhu_khong_co(self):
        """Người dùng thay ảnh nhưng giữ nguyên tên file là ca thường gặp nhất. Khoá
        cache là BĂM NỘI DUNG chứ không phải tên, nên mô tả cũ tự hết hạn."""
        cfg = self._mascot(ref="refs/lan.png")
        with tempfile.TemporaryDirectory() as td:
            _seed_workspace(td, cfg)
            Path(td, "refs", "lan.png").write_bytes(b"anh MOI")
            Path(td, "refs", "lan.png.desc.txt").write_text(
                "# sha256:deadbeef role:character v2\nCon sóc của ảnh cũ.\n", encoding="utf-8")
            txt = _run_block_in(td, "demo-pose-demo")
        self.assertNotIn("Con sóc của ảnh cũ", txt)
        self.assertIn("{{DESC:refs/lan.png}}", txt)

    def test_cache_lech_VAI_cung_coi_nhu_khong_co(self):
        cfg = self._mascot(ref="refs/lan.png")
        with tempfile.TemporaryDirectory() as td:
            _seed_workspace(td, cfg)
            anh = Path(td, "refs", "lan.png")
            anh.write_bytes(b"x")
            key = ("# sha256:" + hashlib.sha256(b"x").hexdigest() + " role:style v2")
            Path(td, "refs", "lan.png.desc.txt").write_text(
                key + "\nMot mo ta phong cach.\n", encoding="utf-8")
            txt = _run_block_in(td, "demo-pose-demo")
        self.assertNotIn("Mot mo ta phong cach", txt)
        self.assertIn("{{DESC:refs/lan.png}}", txt)


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

    def test_co_ref_thi_anh_nhan_vat_thanh_CHU_chu_khong_thanh_anh_dinh_kem(self):
        """Section «Character reference» (trỏ vào ảnh đính kèm) đã thành «Character»
        (CHỨA đoạn chữ tả nhân vật) — xem `AttachmentListTest` để biết vì sao."""
        txt = render_prompt_text(self._pose_cfg(ref="refs/lan.png"))
        self.assertIn("## Character", txt)
        self.assertNotIn("## Character reference", txt)
        self.assertIn("Every character cell shows EXACTLY the character described here", txt)
        self.assertIn("{{DESC:refs/lan.png}}", txt, "phải có dấu chỗ cho tầng bash thay chữ")
        # Không còn một chữ nào trỏ vào một tấm ảnh mà lượt vẽ này không hề có.
        self.assertNotIn("REFERENCE PHOTO", txt)
        self.assertNotIn("attached", txt.lower())

    def test_poseRef_KHONG_dinh_duoc_thi_KHONG_co_section_nao(self):
        """Tấm manơcanh chỉ có nghĩa khi được ĐÍNH ("cell k there gives the pose for
        cell k here"). Không đính được thì câu ấy trỏ vào hư không — và dáng của
        từng ô đã có sẵn bằng chữ ngay trên dòng của ô đó, nên tả nó cũng vô nghĩa.

        Ở đây file ảnh không tồn tại ⇒ không đo được nền ⇒ coi như đục ⇒ không đính.
        Ca ngược lại (ảnh có alpha thật ⇒ đính lại và có section) nằm ở
        `AnhTrongSuotThiDinhThangTest`."""
        txt = render_prompt_text(self._pose_cfg(ref="refs/lan.png", poseRef="refs/tam-dang.png"))
        self.assertNotIn("## Pose reference", txt)
        self.assertNotIn("POSE REFERENCE SHEET", txt)
        self.assertNotIn("mannequin", txt)
        self.assertNotIn("tam-dang", txt, "tấm dáng không được tả, cũng không được đính")

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

    def test_tam_nhan_vat_khong_dinh_kem_gi_va_tam_dang_khong_co_trong_ban_ke(self):
        cfg = {
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
        }
        self.assertEqual(render_prompt_files(cfg), [])
        self.assertEqual(render_desc_file(cfg),
                         [("character", "refs/lan.png"),
                          ("style", "refs/brand.png"),
                          ("style", "refs/inspo.png")],
                         "tấm dáng KHÔNG được tả — mỗi lượt tả là một lượt codex")


class AnhTrongSuotThiDinhThangTest(unittest.TestCase):
    """ĐÍNH HAY TẢ LÀ CÂU HỎI CỦA TỪNG TẤM ẢNH, KHÔNG PHẢI CỦA CẢ TẤM SHEET.

    ╔══ HAI PHÉP ĐO, VÀ CHÚNG KHÔNG MÂU THUẪN NHAU ═════════════════════════════╗
    ║ · 21-22/08/2026: `image_gen` GIỮ alpha thật khi ảnh tham chiếu đính kèm CÓ ║
    ║   kênh alpha thật.                                                        ║
    ║ · 09/09/2026: đính ảnh vào `image_gen` thì ảnh trả về mất nền trong suốt.  ║
    ║ Lần đo thứ hai làm bằng một tấm ảnh ĐỤC. Cả hai nói cùng một điều: model   ║
    ║ vẽ lại cái nền nó NHÌN THẤY trong ảnh mẫu.                                 ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Nên luật là: ảnh nền trong suốt thật ⇒ ĐÍNH THẲNG (giống hơn hẳn một đoạn văn
    tả lại, và không tốn lượt codex nào); ảnh đục ⇒ tả thành chữ.

    ⚠️ Không có Pillow thì `ref_has_alpha` trả `False` cho MỌI ảnh (đường an toàn),
    nên cả lớp này mất hết khả năng phân biệt và tự bỏ qua.
    """

    @classmethod
    def setUpClass(cls):
        if not co_pillow():
            raise unittest.SkipTest("máy này không có Pillow ⇒ mọi ảnh bị coi là đục")

    def _cfg(self, **sheet):
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0].update(sheet)
        return cfg

    def _chay(self, cfg, anh):
        """Gieo workspace kèm ẢNH THẬT rồi chạy khối dựng prompt."""
        td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, td, True)
        _seed_workspace(td, cfg)
        for ten, data in anh.items():
            Path(td, "refs", ten).write_bytes(data)
        txt = _run_block_in(td, "demo-pose-demo")
        return txt, _att_in(td, "demo-pose-demo"), _desc_in(td, "demo-pose-demo")

    def test_anh_nhan_vat_TRONG_SUOT_duoc_dinh_thang_va_KHONG_bi_ta(self):
        txt, att, descs = self._chay(self._cfg(ref="refs/lan.png"),
                                     {"lan.png": png_rgba(16, 16, 0)})
        self.assertEqual(att, ["refs/lan.png"], "ảnh trong suốt thì đính, không tả")
        self.assertEqual(descs, [], "và không tiêu một lượt codex nào để tả")
        self.assertNotIn("{{DESC:", txt)
        self.assertIn("the attached CHARACTER REFERENCE image", txt)
        # CÂU CẦU. Dòng ô do webapp dựng luôn nói "the character described above" —
        # webapp không biết ảnh có alpha hay không, và engine thì KHÔNG viết lại chữ
        # của ai (xem `test_spec_di_thang_vao_prompt_KHONG_bi_sua_mot_ky_tu`). Nên
        # section «Character» phải nói cụm ấy trỏ vào đâu, thay vì bỏ nó trỏ vào
        # một đoạn mô tả không tồn tại trên tấm này.
        self.assertIn("where a cell line says «the character described above», it means"
                      " the character in that image", txt)

    def test_anh_nhan_vat_DUC_van_di_duong_ta_thanh_chu(self):
        """PNG RGBA alpha 255 toàn tấm là ĐỤC — "có kênh alpha" không phải là chuẩn."""
        txt, att, descs = self._chay(self._cfg(ref="refs/lan.png"),
                                     {"lan.png": png_rgba(16, 16, 255)})
        self.assertEqual(att, [], "đính một tấm ảnh đục là kéo cả sheet về RGB")
        self.assertEqual(descs, [("character", "refs/lan.png")])
        self.assertIn("{{DESC:refs/lan.png}}", txt)
        self.assertNotIn("attached", txt.lower())

    def test_MOT_TAM_CO_CA_HAI_LOAI_anh(self):
        """Ảnh nhân vật trong suốt + ảnh phong cách đục ⇒ prompt vừa trỏ vào ảnh
        đính kèm vừa mang một đoạn chữ. Không có nhánh nào phải chọn một."""
        cfg = self._cfg(ref="refs/lan.png")
        cfg["styles"][0]["inspo"] = ["refs/tranh.png"]
        txt, att, descs = self._chay(cfg, {"lan.png": png_rgba(16, 16, 0),
                                           "tranh.png": png_rgba(16, 16, 255)})
        self.assertEqual(att, ["refs/lan.png"])
        self.assertEqual(descs, [("style", "refs/tranh.png")])
        self.assertIn("the attached CHARACTER REFERENCE image", txt)
        self.assertIn("## Style reference", txt)
        self.assertIn("{{DESC:refs/tranh.png}}", txt)

    def test_tam_dang_co_alpha_that_thi_QUAY_LAI_ca_section_lan_file_dinh_kem(self):
        """`pose-sheet.ts` nay ghép tấm manơcanh thành PNG có alpha thật, nên nó lại
        đính được — và một tấm hình chỉ dáng thì chính xác hơn hẳn một câu chữ."""
        txt, att, descs = self._chay(self._cfg(ref="refs/lan.png", poseRef="refs/tam-dang.png"),
                                     {"lan.png": png_rgba(16, 16, 0),
                                      "tam-dang.png": png_rgba(16, 16, 0)})
        self.assertEqual(att, ["refs/lan.png", "refs/tam-dang.png"])
        self.assertIn("## Pose reference", txt)
        self.assertIn("cell k there gives the body pose", txt)
        self.assertEqual(descs, [], "tấm dáng KHÔNG bao giờ được tả thành chữ")

    def test_anh_dinh_kem_LUON_co_mot_section_noi_ra_no_la_gi(self):
        """Một tấm ảnh đính kèm mà prompt không nhắc tới thì model tự gán vai cho nó
        — thường là «ảnh phong cách», và thế là một tấm manơcanh xám đi vào bảng màu
        của cả sheet. Bản đời đầu đính `poseRef` của MỌI loại tấm; nay section «Pose
        reference» chỉ có ở hồ sơ nhân vật, nên `.att` cũng chỉ nhận nó ở đó."""
        cfg = _cfg(spec="a village market at dawn", skel={"shape": "full", "w": 1, "h": 1})
        cfg["sheets"][0]["ref"] = "refs/cho-tet.png"
        cfg["sheets"][0]["poseRef"] = "refs/tam-dang.png"
        td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, td, True)
        _seed_workspace(td, cfg)
        for ten in ("cho-tet.png", "tam-dang.png"):
            Path(td, "refs", ten).write_bytes(png_rgba(16, 16, 0))
        _run_block_in(td, "demo-pose-demo")
        self.assertEqual(_att_in(td, "demo-pose-demo"), ["refs/cho-tet.png"],
                         "tấm cảnh có «Scene reference» nói về nó; tấm dáng thì không")

    def test_nguong_alpha_cua_engine_va_cua_agent_la_MOT_con_so(self):
        """Web nói «ảnh nền đục: máy vẽ nhận mô tả bằng chữ» thì engine phải LÀM đúng
        thế. Hai tầng đo cùng một phép, nên ngưỡng phải là cùng một con số — lệch
        nhau là web nói một đằng, prompt gửi đi một nẻo, và không ai thấy."""
        gen = re.search(r"^REF_ALPHA_MIN = ([\d.]+)$",
                        (ROOT / "gen.sh").read_text(encoding="utf-8"), re.M)
        agent = re.search(r"export const REF_ALPHA_MIN = ([\d.]+)",
                          (ROOT / "agent" / "lib" / "ref-alpha.mjs").read_text(encoding="utf-8"))
        self.assertIsNotNone(gen, "gen.sh phải khai REF_ALPHA_MIN")
        self.assertIsNotNone(agent, "agent/lib/ref-alpha.mjs phải khai REF_ALPHA_MIN")
        self.assertEqual(float(gen.group(1)), float(agent.group(1)))


class MoTaNguoiDungSuaTest(unittest.TestCase):
    """CHỮ CỦA NGƯỜI DÙNG KHÔNG BỊ MỘT LƯỢT NÂNG PHIÊN BẢN XOÁ MẤT.

    Dòng khoá của cache có hai dạng, khác nhau ở token cuối:
      · `# sha256:<băm> role:<vai> v2`   — engine tả, hết hạn khi `DESC_V` đổi;
      · `# sha256:<băm> role:<vai> user` — NGƯỜI gõ, chỉ hết hạn khi ẢNH đổi.
    Người ta sửa mô tả vì bản máy tả sai con vật của họ. Tả lại chính là quay về
    đúng cái sai ấy — nên `DESC_V` không được đụng tới chữ của họ.
    """

    def _cfg(self):
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0]["ref"] = "refs/lan.png"
        return cfg

    def _voi_cache(self, khoa_hau_to, noi_dung_anh=b"anh cua toi"):
        td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, td, True)
        _seed_workspace(td, self._cfg())
        Path(td, "refs", "lan.png").write_bytes(noi_dung_anh)
        khoa = ("# sha256:" + hashlib.sha256(noi_dung_anh).hexdigest()
                + " role:character " + khoa_hau_to)
        Path(td, "refs", "lan.png.desc.txt").write_text(
            khoa + "\nCon so mui hong, tai cup, deo khan do.\n", encoding="utf-8")
        return _run_block_in(td, "demo-pose-demo")

    def test_co_user_thi_KHONG_ta_lai_du_phien_ban_cau_hoi_da_khac(self):
        txt = self._voi_cache("user")
        self.assertIn("Con so mui hong, tai cup, deo khan do.", txt)
        self.assertNotIn("{{DESC:", txt, "chữ của người dùng không bao giờ hết hạn theo DESC_V")

    def test_khong_co_user_va_phien_ban_cu_thi_HET_HAN(self):
        """Chiều ngược lại phải còn nguyên: mô tả do MÁY tả cho một câu hỏi đời trước
        là câu trả lời cho một câu hỏi khác, giữ lại là giữ một thứ đã sai."""
        txt = self._voi_cache("v1")
        self.assertNotIn("Con so mui hong", txt)
        self.assertIn("{{DESC:refs/lan.png}}", txt)

    def test_doi_ANH_thi_ca_chu_cua_nguoi_dung_cung_het_han(self):
        """Mô tả ấy tả một con vật KHÔNG CÒN Ở ĐÂY nữa. Giữ lại mới là nói dối."""
        td = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, td, True)
        _seed_workspace(td, self._cfg())
        Path(td, "refs", "lan.png").write_bytes(b"ANH MOI HOAN TOAN")
        Path(td, "refs", "lan.png.desc.txt").write_text(
            "# sha256:" + hashlib.sha256(b"anh cu").hexdigest()
            + " role:character user\nCon so cua anh cu.\n", encoding="utf-8")
        txt = _run_block_in(td, "demo-pose-demo")
        self.assertNotIn("Con so cua anh cu", txt)
        self.assertIn("{{DESC:refs/lan.png}}", txt)


class BoDanhTinhNhanVatTest(unittest.TestCase):
    """*"con nhân vật nó khác với con nhân vật ref, có cách nào prompt bắt buộc bó
    vào con đó không?"* — chủ sản phẩm, 09/09/2026.

    Ba đòn, và lớp này khoá đòn thứ ba (hai đòn kia: đính thẳng ảnh có alpha, và
    câu hỏi tả ảnh dài + có cấu trúc ở `desc_question character`).
    """

    def _txt(self, **sheet):
        cfg = _cfg(spec="the character described above, waving",
                   skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0].update(sheet)
        return render_prompt_text(cfg)

    def test_moi_dau_hieu_nhan_dang_phai_co_mat_o_MOI_o(self):
        txt = self._txt(ref="refs/lan.png")
        self.assertIn("Every identifying detail named above has to be visible in every cell", txt)

    def test_trang_phuc_theo_dong_chi_MAC_THEM_LEN_chu_khong_doi_co_the(self):
        """Bộ kit theo mùa là chỗ vỡ: dòng ô nói «wearing a Tết áo dài», và không câu
        nào nói rằng bộ đồ ấy không được đổi cả cái đầu."""
        txt = self._txt(ref="refs/lan.png")
        self.assertIn("Clothing goes ON TOP of the character described above", txt)
        self.assertIn("the body, the head, the face and the main colours stay exactly as described", txt)

    def test_khong_co_anh_thi_KHONG_co_section_Character_va_khong_co_cau_rang_buoc(self):
        """Không có ảnh nhân vật thì không có gì để bó vào — câu ràng buộc trỏ vào
        «the character described above» khi không có mô tả nào là dạy model tự bịa."""
        txt = self._txt()
        self.assertNotIn("## Character", txt)
        self.assertNotIn("Every identifying detail named above", txt)

    def test_cau_hoi_ta_anh_nhan_vat_hoi_DU_TAM_muc_va_dai_gap_doi(self):
        """Danh tính không nằm ở "a round red squirrel" — nó nằm ở TỈ SỐ, ở MÃ MÀU
        theo vùng, và ở dăm dấu hiệu mà thiếu chúng thì không ai nhận ra con vật."""
        src = (ROOT / "gen.sh").read_text(encoding="utf-8")
        cau = re.search(r"You are describing a character to an illustrator.*?\"\n", src, re.S).group(0)
        self.assertIn("120 to 200 words", cau)
        for muc in ("(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)"):
            self.assertIn(muc, cau, f"thiếu mục {muc} của bộ khung cố định")
        self.assertIn("as ratios", cau)
        self.assertIn("approximate hex code", cau)
        self.assertIn("three to five identifying marks", cau)
        # Ba thứ bị cấm vẫn phải còn nguyên — chúng thuộc về chỗ khác trong prompt.
        self.assertIn("Do NOT describe the background, the lighting of the photo, or the"
                      " particular pose", cau)

    def test_hai_tang_noi_cung_MOT_con_so_phien_ban_cau_hoi(self):
        """`DESC_V` bên bash ghi cache, `DESC_V` bên python đọc lại. Lệch nhau là mọi
        mô tả bị coi là hết hạn ở LƯỢT NÀO CŨNG VẬY — tức nhân số lượt codex lên,
        lặng lẽ, mãi mãi."""
        src = (ROOT / "gen.sh").read_text(encoding="utf-8")
        py = re.search(r'^DESC_V = "(v\d+)"$', src, re.M).group(1)
        sh = re.search(r'^DESC_V="(v\d+)"$', src, re.M).group(1)
        self.assertEqual(py, sh)


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
        self.assertEqual(self.prompt.count("is simply empty: alpha 0"), 1)
        for chet in ("This background rule OVERRIDES the art style",
                     "WHENEVER SOMETHING SHOULD BE SEE-THROUGH",
                     "Every element is FULLY OPAQUE with solid fills"):
            self.assertNotIn(chet, self.prompt, f"khối cũ mọc lại: {chet}")

    def test_nac_TU_DONG_THEO_VAT_LIEU_noi_dung_mot_lan_o_section_chung(self):
        """MẶC ĐỊNH CỦA MỘT Ô LÀ «MÁY TỰ QUYẾT THEO VẬT LIỆU» (08/09/2026).

        Chủ sản phẩm chốt: model tự vẽ trong suốt, và mặc định của một ô không còn
        là "đục" mà là "theo vật liệu" — kính/băng/ánh sáng xuyên thấu bằng alpha
        thật, kim loại/gỗ/đá đục hoàn toàn. Đó là nấc `auto` của pill «Đục nền»
        (webapp `kit-core/lib/glaze.ts`), nấc mặc định của mọi ô mới.

        Luật ấy đúng với MỌI ô nên nó nói ĐÚNG MỘT LẦN, ở section chung. Ca này
        khoá cả ba vế của lời chốt: vật liệu xuyên thấu, vật liệu đục, và mệnh đề
        "trừ khi dòng của ô nói khác" — thiếu vế thứ ba thì nấc «Đục hoàn toàn»
        của một ô trông-như-kính sẽ cãi nhau với chính section này."""
        self.assertEqual(self.prompt.count("its transparency follows"), 1)
        self.assertIn("Unless an element's own line below says otherwise", self.prompt)
        self.assertIn("glass, ice, water and light effects are see-through", self.prompt)
        for vat_lieu in ("metal", "wood", "stone", "plastic", "fabric"):
            self.assertIn(vat_lieu, self.prompt, f"luật vật liệu thiếu {vat_lieu}")
        self.assertIn("fully opaque (alpha 255)", self.prompt)

    def test_nac_TU_DONG_khong_in_lai_o_tung_dong_element(self):
        """GUARD ÂM, và đây là lý do tồn tại của cả cách làm.

        `auto` KHÔNG có cụm chữ nào trong `spec` (`GLAZE_PRESETS[0].en` rỗng có chủ
        ý) và KHÔNG có cờ nào trong contract. Nếu mai này ai đó "cho chắc" bằng cách
        nối câu ấy vào từng ô, prompt sẽ nói cùng một luật N lần — đúng cái bệnh mà
        `skel.matte` vừa bị bỏ vì mắc phải, và không ca nào khác đỏ.

        Ba ô, ba vật liệu khác nhau, không ô nào khai đục nền: dòng của chúng phải
        SẠCH TRƠN, chỉ có mô tả và hộp safe zone."""
        cfg = {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}], "sheets": [{
            "id": "pose-demo", "grid": {"cols": 3, "rows": 1},
            "components": [
                {"file": "01-a", "spec": "a glass window pane",
                 "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}},
                {"file": "02-b", "spec": "a gold metal coin",
                 "skel": {"shape": "circle", "w": 0.5, "h": 0.5}},
                {"file": "03-c", "spec": "a wooden signpost",
                 "skel": {"shape": "rrect", "w": 0.6, "h": 0.8}},
            ]}]}
        txt = render_prompt_text(cfg, name="demo-pose-demo")
        dong = [row for row in txt.splitlines() if re.match(r"^\d\) ", row)]
        self.assertEqual(len(dong), 3, txt)
        for row in dong:
            self.assertNotIn("transparency follows", row)
            self.assertNotIn("alpha", row.lower(), f"dòng element mọc hợp đồng alpha: {row}")
            self.assertNotIn("see-through", row)
        self.assertEqual(txt.count("its transparency follows"), 1)

    def test_nac_CU_THE_van_in_o_dong_cua_chinh_o_ay(self):
        """Chiều còn lại: chọn một nấc cụ thể thì câu của nấc ấy PHẢI tới, và nó
        tới bằng `spec` — webapp nối, engine chỉ chép. Hai nấc đáng canh nhất là hai
        nấc cãi nhau với luật chung: «Đục hoàn toàn» trên một ô trông-như-kính, và
        «Phát sáng» trên một ô mà luật chung sẽ vẽ đục."""
        duc = ("fully opaque everywhere, alpha 255, with no see-through part at all,"
               " whatever material it may look like")
        p_duc = render_prompt_text(_cfg(spec=f"a glass window pane, {duc}"))
        self.assertIn(duc, first_cell_line_text(p_duc))

        sang = ("pure light with no surface: the halo keeps its own colour and fades to alpha 0"
                " at its edge, and the empty canvas shows through all around it")
        p_sang = render_prompt_text(_cfg(spec=f"a radial light burst, {sang}"))
        self.assertIn(sang, first_cell_line_text(p_sang))

    def test_prompt_KHONG_nhac_ten_caro(self):
        """08/09/2026 — chủ sản phẩm: "prompt tự nhiên mention mấy cái caro checker
        board → AI gen không hiểu là negative prompt, lại bị nhiễm". Bản cũ gọi tên
        "CHECKERBOARD" ba lần in hoa để cấm, và cái tên được nhắc chính là thứ model
        vẽ ra (tấm caro xám-trắng ở α=255, nhìn y hệt nền trong suốt). Nay prompt
        chỉ tả điều MUỐN: chỗ trống để trống (alpha 0), chỗ xuyên thấu vẽ alpha thấp
        màu riêng. Chữ "checker" không được xuất hiện ở bất kỳ đâu, kể cả trong
        câu của một nấc đục nền nối vào dòng ô."""
        low = self.prompt.lower()
        for cam in ("checker", "transparency pattern"):
            self.assertNotIn(cam, low, f"prompt lại gọi tên thứ mình cấm: {cam}")
        self.assertIn("is simply empty: alpha 0", self.prompt)
        self.assertIn("draw it in its own colour at a lower alpha", self.prompt)
        # Giọng tự nhiên: không còn câu cấm in hoa trong section này.
        for gao in ("NEVER DRAW", "FOLLOWS ITS MATERIAL", "FULLY OPAQUE (alpha 255)"):
            self.assertNotIn(gao, self.prompt, f"câu gào mọc lại: {gao}")

    def test_tu_vung_chroma_khong_duoc_quay_lai_prompt(self):
        for w in ("chroma", "flat solid", "#FF00FF", "#00FF00"):
            self.assertNotIn(w, self.prompt, f"prompt còn nhắc {w!r}")

    def test_safe_zone_KHONG_BAO_GIO_tu_ha_xuong_thanh_goi_y(self):
        """GUARD ÂM. Ô `free` từng được nối thêm ", placement guide" — lời hứa rằng dao
        cắt sẽ bám lõi artwork thay vì hộp in ra. `slice.py` KHÔNG có nhánh ấy: nó cắt
        mọi ô không full-bleed theo đúng toạ độ này. Câu đó là nói dối model, và model
        vẽ tràn ra ngoài hộp đúng như được cho phép."""
        p = render_prompt_text(_cfg(skel={"shape": "rrect", "w": 0.5, "h": 0.5, "free": True}))
        self.assertIn("safe zone x=", p)
        self.assertNotIn("placement guide", p)

    def test_o_glow_khong_con_bat_ve_NEN_DEN(self):
        """Nền đen từng là cách duy nhất lấy quầng sáng (C = α·F trên đen). Alpha
        thật mang sẵn cả dải mờ, nên giữ nền đen chỉ tổ nướng một mảng đen vào
        asset."""
        p = render_prompt_text(_cfg(skel={"matte": "glow"}))
        self.assertNotIn("PURE BLACK", p)
        self.assertNotIn("#000000", p)

    def test_LUAT_SAFE_ZONE_TRUNG_LAP_voi_o_kinh_va_o_anh_sang(self):
        """THAY CHO HAI CA `matte` CŨ (08/09/2026).

        Bản trước, luật safe zone ra lệnh "lấp kín hộp" và model đọc nó thành "phủ
        SƠN ĐẶC kín hộp" — với một quầng sáng thì nó lấp phần trong suốt bằng thứ nó
        nghĩ là trong suốt, tức cái đế caro. Cách chữa cũ là in một câu HUỶ LỆNH riêng
        cho từng ô `matte:"glow"`: hai luật cãi nhau trong cùng một prompt, và câu huỷ
        ấy chỉ tới được những ô có cờ.

        Nay luật gốc TỰ trung lập — nói một lần, cho mọi ô — nên không còn câu huỷ
        lệnh nào, và cũng không cần cờ nào để bật nó."""
        p = render_prompt_text(_cfg(skel={"shape": "rrect", "w": 0.5, "h": 0.5}))
        self.assertIn("Filling the box is about REACH, not about opaque paint", p)
        self.assertIn("fade to full transparency inside its own box", p)
        # Không còn câu nào bảo model BỎ QUA một luật khác của chính prompt này.
        self.assertNotIn("Ignore the safe-zone fill rule", p)

    def test_do_trong_cua_o_chi_den_tu_SPEC(self):
        """Ô kính nói độ trong qua `spec` (câu của webapp `kit-core/lib/glaze.ts`),
        không qua một cờ nào. Cờ `matte` có mặt cũng KHÔNG sinh thêm chữ."""
        cau = ("a see-through pane of barely tinted glass drawn at low alpha, about 64 of 255,"
               " keeping its own tint colour at that alpha; frame, rim and highlights stay fully opaque")
        p = render_prompt_text(_cfg(spec=f"a coin icon, {cau}"))
        self.assertIn(cau, p)
        self.assertNotIn("chroma", p)
        # Cùng ô ấy mà không có câu ⇒ DÒNG CỦA Ô không mọc thêm hợp đồng alpha nào.
        # (Quét đúng dòng element, vì section «Transparency» chung vẫn nói "low alpha"
        # cho cả tấm — đó là luật chung, không phải câu riêng của ô.)
        tron = render_prompt_text(_cfg(spec="a coin icon", skel={"matte": "glass"}))
        dong = next(l for l in tron.splitlines() if l.startswith("1) "))
        self.assertEqual(dong, "1) a coin icon — safe zone x=153..1382, y=205..819 (1229x614 px)")

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
        # 07/09/2026 — VẾT THỨ HAI của cùng một quyết định. Cỗ máy dưới đây không
        # phải chroma, nhưng nó là ĐỜI SAU của chroma: mask "nghiêm" theo ngưỡng
        # alpha, dán nhãn khối, feather bằng blur, nắn nội dung về khung, và nhánh
        # vẽ ô glow trên nền đen. Chúng gặm ruột element có alpha thật (đo được:
        # ruột thanh máu α≈90 ra α≈5). slice.py nay CHỈ CẮT.
        for name in ("label_blobs", "fill_mask_holes", "snap_to_safe", "align_content_safe",
                     "measure_core", "measure_asset_geometry", "MATTE_BLEND", "asset_blend",
                     "normalize_pose_side", "painted_checkerboard", "alpha_sheet",
                     # `pack_atlas` gói mọi mảnh ruột thành atlas.png + atlas.json cho
                     # Phaser. Không client nào đọc hai file ấy nữa (tab «Xuất kit» đã
                     # bỏ), nên nó chỉ còn là hai file rác mỗi lượt cắt.
                     "pack_atlas"):
            self.assertFalse(hasattr(sl, name), f"slice.py còn máy móc cũ: `{name}`")
        # Quét TÊN IMPORT chứ không quét chữ mô tả: `code_of` chỉ bỏ chú thích `#`,
        # docstring thì ở lại, và docstring của slice.py cố ý kể tên cỗ máy đã bỏ.
        code = code_of(ROOT / "slice.py")
        for w in ("ImageFilter", "ImageChops", "ImageOps", "scipy", "ndimage"):
            self.assertNotIn(w, code, f"slice.py nạp lại đồ sửa mask: {w}")
        # Và thứ PHẢI ở lại: đường alpha thật + phép đo thuần.
        self.assertTrue(hasattr(sl, "read_sheet"))
        self.assertTrue(hasattr(sl, "snap_solid_alpha"))
        self.assertTrue(hasattr(sl, "measure_cell"))

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

    def test_va_logo_van_toi_duoc_may_ve_bang_CHU(self):
        """Tấm này cần nền trong suốt ⇒ không đính ảnh nào (xem `AttachmentListTest`).
        Logo vẫn phải TỚI được máy vẽ — bằng một đoạn mô tả trong «Style reference»."""
        self.assertEqual(render_prompt_files(self.CFG), [])
        self.assertEqual(render_desc_file(self.CFG), [("style", "refs/logo.png")])
        txt = render_prompt_text(self.CFG)
        self.assertIn("## Style reference", txt)
        self.assertIn("{{DESC:refs/logo.png}}", txt)

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
        """`run_one` đọc ngược khổ bằng `head -n3 … | grep -qiE 'PORTRAIT|SQUARE'`.
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
        """«Text» KHÔNG còn trong danh sách này (09/09/2026 — chủ sản phẩm: *"gen
        character thì cần gì text"*). Xem `MoiLoaiTamMotBoLuatTest` để biết vì sao."""
        cfg = _cfg(spec="a mascot waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0]["ref"] = "refs/lan.png"
        cfg["sheets"][0]["poseRef"] = "refs/tam-dang.png"
        heads = self._headings(render_prompt_text(cfg))
        self.assertEqual(heads, ["Canvas", "Art style", "Layout", "Safe zone", "Transparency",
                                 "Character", "Elements", "Output"])


class MoiLoaiTamMotBoLuatTest(unittest.TestCase):
    """MỘT BẢNG «TẤM NÀO NHẬN LUẬT NÀO», VÀ NÓ PHẢI ĐO ĐƯỢC TỪ HAI PHÍA.

    ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/09/2026) ══════════════════════════════════╗
    ║ Đọc prompt của tấm NHÂN VẬT: *"mấy cái này bị kiểu lặp sang chỗ khác      ║
    ║ rồi…, ví dụ gen character thì cần gì text…, nhiều chỗ đáng nhẽ phải       ║
    ║ prompt riêng"*.                                                           ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    Đo lại thì đúng từng chữ: một lưới nhân vật đang đọc «## Text» ("plates,
    banners, buttons and screens stay BLANK"), ba gạch vật liệu kính/băng/nước/kim
    loại, "functional CORE", "REACH not opaque paint" và dòng phân vai lượng trang
    trí — toàn bộ là luật của một món đồ giao diện.

    Lớp này khoá CẢ HAI CHIỀU trên cùng một danh sách, vì dọn một chiều thì lần sau
    ai đó "cho chắc" là mọi luật lại về chung một rọ mà không có gì đỏ. Nó KHÔNG
    kiểm cách viết (`profile`, `on=`) — cách viết là chuyện của người sửa; nó kiểm
    thứ đi ra khỏi engine.
    """

    # Những câu CHỈ thuộc về tấm giao diện.
    CHI_CUA_GIAO_DIEN = (
        "## Text",
        "No letters, no digits",
        "functional CORE",
        "REACH, not about opaque paint",
        "glass, ice, water",
        "Ornament amount",
        "Any rim, border or edge treatment",
    )

    @staticmethod
    def _mascot():
        cfg = _cfg(spec="the same mascot, waving", skel={"shape": "pose", "w": 0.3, "h": 0.85})
        cfg["sheets"][0]["grid"] = {"cols": 2, "rows": 1}
        cfg["sheets"][0]["components"].append(
            {"file": "02-thing", "spec": "the same mascot, pointing",
             "skel": {"shape": "pose", "w": 0.3, "h": 0.85}})
        cfg["sheets"][0]["ref"] = "refs/lan.png"
        return render_prompt_text(cfg)

    def test_tam_nhan_vat_KHONG_lanh_mot_cau_nao_cua_tam_giao_dien(self):
        txt = self._mascot()
        for cam in self.CHI_CUA_GIAO_DIEN:
            self.assertNotIn(cam, txt, f"luật của tấm giao diện bò sang tấm nhân vật: {cam}")

    def test_tam_giao_dien_van_giu_DU_bo_luat_cua_no(self):
        """Chiều ngược lại, cùng một danh sách: dọn nhầm sang tấm giao diện thì mọi
        ô UI mất luật hộp cắt của nó — và ca trên vẫn xanh."""
        txt = render_prompt_text(_cfg(spec="the primary action button"))
        for phai_co in self.CHI_CUA_GIAO_DIEN:
            if phai_co == "Ornament amount":
                continue          # dòng ấy nằm ở tấm nhiều ô lẫn một ô, kiểm riêng dưới
            self.assertIn(phai_co, txt, f"tấm giao diện mất luật của chính nó: {phai_co}")
        self.assertIn("Ornament amount and placement are set PER ELEMENT", txt)

    def test_do_trong_cua_nhan_vat_gon_trong_MOT_cau(self):
        """Nhân vật không cần một đoạn về kính, băng, nước, kim loại, gỗ, đá để rồi
        tự suy ra rằng cơ thể mình thì đục. Nó cần hai vế: quanh người là trống,
        thân người là đặc."""
        txt = self._mascot()
        than = txt[txt.index("## Transparency"):]
        than = than[:than.index("\n\n")]
        self.assertEqual(len(than.splitlines()), 2, than)     # tiêu đề + đúng một câu
        self.assertIn("The space around the characters is simply empty: alpha 0", than)
        self.assertIn("solid all the way through", than)

    def test_vung_an_toan_cua_nhan_vat_noi_ve_CHIEU_CAO_va_ve_O_BEN_CANH(self):
        txt = self._mascot()
        self.assertIn("the body fills it from top to bottom", txt)
        self.assertIn("Draw the character as ONE natural figure", txt)
        self.assertIn("characters stay in their own cell, never touch each other", txt)

    def test_dong_cua_mot_nhan_vat_khong_noi_bang_tu_vung_cua_do_giao_dien(self):
        """Hộp ngoài vẫn phải in ra — thứ đổi là TÊN của cái tràn ra khỏi nó: tóc,
        đuôi, món đồ cầm tay, chứ không phải "rim and ornaments"."""
        txt = self._mascot()
        self.assertIn("everything of this character, hair and props included, stays inside x=", txt)
        self.assertNotIn("rim and ornaments included", txt)
        ui = render_prompt_text(_cfg_ui_2o())
        self.assertIn("everything of this element, rim and ornaments included, stays inside x=", ui)

    def test_tam_nen_nhieu_o_khong_bi_doi_alpha_0_ngay_duoi_cau_phu_kin_khung(self):
        """Tấm full-bleed nhiều ô từng nhận nguyên section «Transparency» — tức là
        engine vừa nói "there is no transparent area anywhere" ở «## Canvas» vừa dạy
        cách để alpha 0 ở ngay dưới. Hai câu của cùng một engine cãi nhau thì model
        tự hoà giải, và cách nó hoà giải là chừa một khung rỗng."""
        txt = render_prompt_text(_cfg_nen(n=2), name="demo-nen")
        self.assertIn("there is no transparent area anywhere", txt)
        self.assertNotIn("## Transparency", txt)
        self.assertNotIn("## Safe zone", txt)
        self.assertIn("## Text", txt)          # cảnh vẽ ra vẫn không được có chữ

    def test_anh_dinh_kem_cua_tam_nen_NHIEU_O_cung_ta_canh_chu_khong_ta_nhan_vat(self):
        """Cùng lỗ với tấm nền một ô (đã vá 07/09/2026), chỉ khác ở số ô: `sheet.ref`
        của một tấm nhiều cảnh vẫn rơi vào nhánh «Character reference» và mọc ra một
        con mascot giữa mỗi bức tranh."""
        txt = render_prompt_text(_cfg_nen(n=2, extra={"ref": "refs/cho-tet.png"}), name="demo-nen")
        self.assertIn("## Scene reference", txt)
        self.assertNotIn("## Character reference", txt)


def _cfg_ui_2o():
    """Tấm giao diện HAI ô — cần hai ô mới có hộp ngoài để mà in ra."""
    return {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}], "sheets": [{
        "id": "pose-demo", "grid": {"cols": 2, "rows": 1},
        "components": [
            {"file": "01-a", "spec": "a button", "skel": {"shape": "pill", "w": 0.8, "h": 0.4}},
            {"file": "02-b", "spec": "a popover panel", "skel": {"shape": "rrect", "w": 0.8, "h": 0.6}},
        ]}]}


class HinhDangOQuyetDinhHopSafeZoneTest(unittest.TestCase):
    """DÒNG ELEMENT PHẢI IN HỘP ĐÚNG HÌNH DẠNG CỦA ELEMENT ẤY.

    Bệnh đo được 07/09/2026 trên tấm Bộ UI thật của dự án ``test``
    (``kits/manifest.json``): prompt in

        2) health bar … — safe zone x=815..1066, y=219..407 (251x188 px)
        3) avatar frame … — safe zone x=188..439, y=846..1034 (251x188 px)

    CÙNG một cái hộp 4:3 cho một thanh dài mỏng và một khung tròn, vì contract khai
    ``skel`` giống hệt nhau (``rrect`` 0.8×0.6) cho mọi ô. Model vẽ ra hình hợp lý —
    lõi đo được 370×97 và 303×263 — nên cả hai "sai" so với lời hứa, QA gắn cờ 46px,
    và ô dán sang Figma lệch cỡ. Cái sai nằm ở LỜI HỨA, không ở model.

    Lớp này khoá phía engine của bản vá: cùng một tấm, ô ``bar`` phải ra hộp
    RỘNG-MỎNG và ô ``circle`` phải ra hộp VUÔNG. Nó không kiểm một chuỗi cứng nào —
    chuỗi cứng sẽ chết theo lần đầu ai đó chỉnh bảng tỉ lệ; nó kiểm QUAN HỆ giữa
    hình dạng và hộp, thứ không được phép đổi.
    """

    @staticmethod
    def _cfg_ui():
        """Tấm vuông 2×2, ba ô ba hình dạng — đúng hình dạng tấm mà màn prompt-first
        sinh ra (`composer-to-contract.ts`: canvas vuông + lưới vuông)."""
        return {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}],
                "sheets": [{"id": "ui", "canvas": "square", "grid": {"cols": 2, "rows": 2},
                            "components": [
                                {"file": "01-button", "spec": "button",
                                 "skel": {"shape": "pill", "w": 0.391, "h": 0.136, "slice9": True}},
                                {"file": "02-healthbar", "spec": "health bar",
                                 "skel": {"shape": "bar", "w": 0.431, "h": 0.11, "slice9": True}},
                                {"file": "03-avatar-frame", "spec": "avatar frame",
                                 "skel": {"shape": "circle", "w": 0.311, "h": 0.311}},
                                {"file": "_empty-1", "spec": "", "skel": {"shape": "empty"}}]}]}

    def setUp(self):
        self.txt = render_prompt_text(self._cfg_ui(), name="demo-ui")

    def _hop(self, dau_dong):
        """(w, h) mà dòng ô ấy hứa với model — đọc từ chính chuỗi prompt."""
        for line in self.txt.splitlines():
            if line.startswith(dau_dong):
                hit = re.search(r"\((\d+)x(\d+) px\)", line)
                self.assertIsNotNone(hit, f"dòng không mang hộp nào: {line}")
                return int(hit.group(1)), int(hit.group(2))
        raise AssertionError(f"prompt không có dòng {dau_dong!r}")

    def test_ba_o_ba_hop_KHAC_NHAU(self):
        hop = [self._hop(f"{i}) ") for i in (1, 2, 3)]
        self.assertEqual(len(set(hop)), 3, f"vẫn còn hai ô dùng chung một hộp: {hop}")

    def test_thanh_mau_ra_hop_RONG_MONG(self):
        w, h = self._hop("2) ")
        self.assertGreater(w / h, 3, f"thanh máu ra hộp {w}x{h} — không phải hình một cái thanh")

    def test_khung_avatar_ra_hop_VUONG(self):
        w, h = self._hop("3) ")
        # Ô vuông ⇒ w/h của skel LÀ tỉ lệ hình; lệch 1px là chuyện làm tròn của
        # `safe_offset_in_cell`, không phải chuyện hình dạng.
        self.assertLessEqual(abs(w - h), 1, f"khung avatar ra hộp {w}x{h} — không vuông")

    def test_hop_in_ra_KHOP_voi_geometry_py_chu_khong_phai_mot_phep_nhan_thu_hai(self):
        """Con số trong prompt phải đến từ `geometry.safe_box` — cùng hàm mà
        `slice.py` dùng để cắt. Hai phép nhân song song là hai con số sẽ trôi."""
        import geometry
        sheet = self._cfg_ui()["sheets"][0]
        for i, comp in enumerate(sheet["components"][:3]):
            x0, y0, x1, y1 = geometry.safe_box(1254, 1254, 2, 2, i, comp["skel"])
            self.assertEqual(self._hop(f"{i + 1}) "), (x1 - x0, y1 - y0))


class CoDauRaVaHeSoPhongTest(unittest.TestCase):
    """PROMPT PHẢI NÓI CỠ THẬT + HỆ SỐ PHÓNG, không chỉ nói cái hộp to.

    Chủ sản phẩm 07/09/2026: *«vẫn phải bảo nó là khi scale ra thật thì là size bao
    nhiêu, tức là bảo nó upscale bao nhiêu lần… độ dày của border»*. Lỗ hổng thật:
    ô nay được lấp bằng hộp lớn nhất vừa lề, nên một cái nút 120×52 được vẽ ở
    480×208 — nếu model không biết cỡ thật, nó chọn độ dày nét / bán kính bo / mật
    độ chi tiết theo hộp 480×208 và ra một tấm banner viền mảnh; co về 120×52 là
    nát. Ba con số phải cùng có mặt trên MỘT dòng: cỡ thật, hệ số, hộp.
    """

    @staticmethod
    def _cfg():
        return {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}],
                "sheets": [{"id": "ui", "canvas": "square", "grid": {"cols": 2, "rows": 2},
                            "components": [
                                {"file": "01-button", "spec": "button",
                                 "skel": {"shape": "pill", "w": 0.765, "h": 0.332},
                                 "out": {"w": 120, "h": 52}, "drawScale": 4.0},
                                {"file": "02-healthbar", "spec": "health bar",
                                 "skel": {"shape": "bar", "w": 0.8, "h": 0.205},
                                 "out": {"w": 240, "h": 62}},
                                {"file": "03-avatar-frame", "spec": "avatar frame",
                                 "skel": {"shape": "circle", "w": 0.777, "h": 0.777},
                                 "out": {"w": 195, "h": 195}, "drawScale": 2.5},
                                {"file": "_empty-1", "spec": "", "skel": {"shape": "empty"}}]}]}

    def setUp(self):
        self.txt = render_prompt_text(self._cfg(), name="demo-ui")

    def _dong(self, dau_dong):
        for line in self.txt.splitlines():
            if line.startswith(dau_dong):
                return line
        raise AssertionError(f"prompt không có dòng {dau_dong!r}")

    def test_dong_element_mang_co_that_va_he_so(self):
        line = self._dong("1) ")
        self.assertIn("final size 120x52 px", line)
        self.assertIn("drawn at 4x", line)
        # Hộp sau dấu "=" phải là ĐÚNG hộp safe zone in ở cuối dòng, không phải một
        # con số thứ hai: hứa hai hộp khác nhau trên cùng một dòng là hỏng cả dòng.
        hop = re.findall(r"(\d+)x(\d+) px", line)
        self.assertEqual(hop[1], hop[2], f"hộp phóng ≠ hộp safe zone: {line}")

    def test_he_so_thieu_thi_engine_TU_TINH_chu_khong_im_lang(self):
        """Contract do bản webapp cũ sinh ra không có `drawScale`. Bỏ trống câu ấy
        là để model đoán cỡ thật — đúng cái bệnh này sinh ra để chữa."""
        line = self._dong("2) ")
        self.assertIn("final size 240x62 px", line)
        # Hệ số dựng lại từ CHÍNH hộp in ở cuối dòng ⇒ dòng luôn tự nhất quán, kể cả
        # với contract sửa tay có `skel` không dựng từ `out`.
        hop = re.findall(r"(\d+)x(\d+) px", line)
        k = float(re.search(r"drawn at ([\d.]+)x", line).group(1))
        self.assertAlmostEqual(int(hop[1][0]) / 240, k, places=2)

    def test_cau_chung_giai_thich_HE_SO_dung_mot_lan(self):
        self.assertEqual(self.txt.count("drawn ENLARGED from its final on-screen size"), 1)
        self.assertIn("a small button drawn at 2.5x must still read as a small button", self.txt)

    def test_o_khong_co_out_thi_KHONG_bia_ra_co(self):
        cfg = self._cfg()
        for comp in cfg["sheets"][0]["components"]:
            comp.pop("out", None)
            comp.pop("drawScale", None)
        txt = render_prompt_text(cfg, name="demo-ui")
        self.assertNotIn("final size", txt)
        self.assertNotIn("drawn at", txt)


class HopOLaGioiHanNgoaiTest(unittest.TestCase):
    """MỖI DÒNG ELEMENT PHẢI NÓI RA HAI HỘP: hộp lõi, và hộp mà phần tràn dừng lại.

    ╔══ BỆNH ĐÃ ĐO (dự án thật, 09/2026) ═════════════════════════════════════════╗
    ║ Prompt chỉ hứa MỘT hộp — safe zone — rồi dặn "tránh xa vùng của element     ║
    ║ khác, đừng chạm mép ảnh". Mép ẢNH thì cách cả một ô, nên model đọc ra là     ║
    ║ "còn nhiều chỗ" và vẽ viền + đèn lồng tràn qua ranh giới ô. Nhưng `slice.py`║
    ║ cắt theo hộp Ô (`sheet_img.crop(cell)`), nên phần tràn ấy bị chém cụt: sổ đo║
    ║ `kits/manifest.json` ghi `overflowPx` bên phải của `01-button` = 69 và của  ║
    ║ `03-popover` = 77 — chạm khít mép ô 627px.                                  ║
    ║ Nay dòng của ô nói thẳng hộp ô ra, nên model có một con số để dừng trước.   ║
    ╚═════════════════════════════════════════════════════════════════════════════╝
    """

    @staticmethod
    def _cfg_ui():
        return {"styles": [{"id": "demo", "bg": "magenta", "style": "flat ink"}],
                "sheets": [{"id": "ui", "canvas": "square", "grid": {"cols": 2, "rows": 2},
                            "components": [
                                {"file": "01-button", "spec": "button",
                                 "skel": {"shape": "pill", "w": 0.6, "h": 0.2, "decor": True}},
                                {"file": "02-popover", "spec": "popover",
                                 "skel": {"shape": "rrect", "w": 0.6, "h": 0.45}},
                                {"file": "03-avatar-frame", "spec": "avatar frame",
                                 "skel": {"shape": "circle", "w": 0.6, "h": 0.6, "decor": True}},
                                {"file": "_empty-1", "spec": "", "skel": {"shape": "empty"}}]}]}

    def setUp(self):
        self.txt = render_prompt_text(self._cfg_ui(), name="demo-ui")

    def _dong(self, dau_dong):
        for line in self.txt.splitlines():
            if line.startswith(dau_dong):
                return line
        raise AssertionError(f"prompt không có dòng {dau_dong!r}")

    def test_moi_o_that_deu_mang_hop_ngoai(self):
        for i in (1, 2, 3):
            self.assertIn("stays inside x=", self._dong(f"{i}) "),
                          f"ô {i} không có giới hạn ngoài nào")

    def test_hop_ngoai_la_DUNG_hop_o_cua_geometry_py(self):
        """Không phải một phép chia thứ hai: cùng `cell_box` mà `slice.py` cắt theo."""
        import geometry
        for i in range(3):
            cx0, cy0, cx1, cy1 = geometry.cell_box(1254, 1254, 2, 2, i)
            self.assertIn(f"stays inside x={cx0}..{cx1}, y={cy0}..{cy1}", self._dong(f"{i + 1}) "))

    def test_hop_ngoai_OM_TRON_safe_zone_cua_chinh_o_ay(self):
        """Hai hộp lồng nhau, không phải hai hộp cạnh nhau — một dòng hứa ngược là
        một dòng model không có cách nào làm đúng."""
        for i in (1, 2, 3):
            line = self._dong(f"{i}) ")
            sz = re.search(r"safe zone x=(\d+)\.\.(\d+), y=(\d+)\.\.(\d+)", line)
            cell = re.search(r"stays inside x=(\d+)\.\.(\d+), y=(\d+)\.\.(\d+)", line)
            sx0, sx1, sy0, sy1 = (int(v) for v in sz.groups())
            cx0, cx1, cy0, cy1 = (int(v) for v in cell.groups())
            self.assertLessEqual(cx0, sx0)
            self.assertLessEqual(sx1, cx1)
            self.assertLessEqual(cy0, sy0)
            self.assertLessEqual(sy1, cy1)

    def test_luat_chung_noi_ra_quan_he_giua_hai_hop(self):
        self.assertIn("Each element's line gives a second, larger box: its own cell", self.txt)
        self.assertIn("come to rest inside it", self.txt)
        # Câu cũ CHỈ nhắc mép ảnh — biên cách cả một ô — đã thay hẳn.
        self.assertNotIn("must stay well clear of", self.txt)
        self.assertIn("the cell box around its safe zone", self.txt)

    def test_tam_MOT_O_khong_hua_hop_ngoai_nao(self):
        """Ở tấm 1×1 hộp ô CHÍNH LÀ khổ ảnh; in nó ra là một dòng dài thêm mà không
        thêm ràng buộc nào, và luật "đừng chạm mép ảnh" đã nói đúng điều ấy."""
        txt = render_prompt_text(_cfg(spec="a coin icon"))
        self.assertIn("safe zone x=", txt)
        self.assertNotIn("stays inside x=", txt)
        self.assertIn("nothing touches the image edges", txt)

    def test_giong_van_TU_NHIEN_khong_goi_ten_thu_khong_muon(self):
        """Cùng luật với `test_prompt_KHONG_nhac_ten_caro`: chỉ tả điều MUỐN."""
        cau = self._dong("1) ").split("stays inside")[0]
        for xau in ("checker", "NEVER", "MUST NOT", "do not"):
            self.assertNotIn(xau, cau)
