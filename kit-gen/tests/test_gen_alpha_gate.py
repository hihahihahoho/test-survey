"""PHÉP ĐO NỀN CỦA gen.sh — ĐO NGAY LÚC SINH, VÀ CHỈ ĐỂ GHI CHÚ.

╔══ VÌ SAO CÓ FILE NÀY ═════════════════════════════════════════════════════════╗
║ Từ khi bỏ HẲN đường tách nền, hợp đồng còn đúng một câu: `image_gen` trả về    ║
║ PNG RGBA có nền trong suốt thật. Prompt đã XIN điều đó — nhưng xin không phải  ║
║ là biết. Trước bản này lời phán duy nhất sau mỗi lượt là "file có đổi byte     ║
║ không", nên một sheet đục hoàn toàn cũng không ai nói gì, và chỗ duy nhất phát ║
║ hiện ra là slice.py, tức SAU khi đã tiêu xong quota của cả lượt.               ║
║                                                                               ║
║ Phép đo NÓI, chứ không chặn: chủ sản phẩm chốt 09/09/2026 "cứ để cho nó gen    ║
║ tự nhiên nhé, ko block" (xem `NenDucKhongChanTest` ở cuối file).               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

CA ĐẮT NHẤT LÀ CA ②, và nó không hiển nhiên chút nào: ảnh có kênh alpha, có nền
trong suốt, nhìn bằng mắt thì ĐÚNG — nhưng alpha chỉ có 0 và 255. Alpha do model
vẽ luôn có dải mờ liên tục ở rìa khử răng cưa (đo trên ảnh thật: 29–35%); alpha do
một phép tách bằng script thì không bao giờ có (0,00%).

Ngày 22/08/2026 đo 10 sheet raw của một lượt thật: 9/10 dải mờ 0,00% kèm viền
trắng răng cưa — vì model KHÔNG tạo nổi nền trong suốt nên nó tự viết rồi biên
dịch một công cụ riêng (`.tmp_remove_checker.swift`, CoreGraphics
`setBlendMode(.clear)`) để xoá nền hộ. Đúng thứ vừa bị bỏ khỏi kit-gen, quay lại
bằng cửa sau — và không một phép kiểm nào của engine nhìn thấy.
"""
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]


def _shell_fn():
    """Bóc đúng hàm `alpha_verdict` khỏi gen.sh — test qua bash, không chép lại logic."""
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")
    m = re.search(r"^PY_CHECK=.*?^\}", src, re.S | re.M)
    assert m, "không tìm thấy alpha_verdict trong gen.sh"
    return m.group(0)


FN = _shell_fn()


def verdict(img):
    with tempfile.TemporaryDirectory() as td:
        p = Path(td, "sheet.png")
        img.save(p)
        r = subprocess.run(["bash", "-c", f'{FN}\nalpha_verdict "$1"', "_", str(p)],
                           capture_output=True, text=True)
        return r.stdout.strip()


def mem_that():
    """Alpha THẬT: thân đặc, rìa khử răng cưa mềm ⇒ dải mờ liên tục."""
    m = Image.new("L", (400, 300), 0)
    ImageDraw.Draw(m).rounded_rectangle((40, 40, 360, 260), radius=60, fill=255)
    im = Image.new("RGBA", (400, 300), (220, 60, 60, 255))
    im.putalpha(m.filter(ImageFilter.GaussianBlur(6)))
    return im


class AlphaGateTest(unittest.TestCase):
    def test_alpha_that_di_qua(self):
        v = verdict(mem_that())
        self.assertTrue(v.startswith("ok"), v)

    def test_tach_bang_script_BI_CHAN(self):
        """Ca ②. Cùng một hình, chỉ khác ở chỗ alpha bị nắn về 0/255."""
        im = mem_that()
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        v = verdict(im)
        self.assertTrue(v.startswith("bad"), v)
        self.assertIn("TÁCH NỀN bằng script", v)

    def test_khong_co_kenh_alpha_bi_chan(self):
        v = verdict(Image.new("RGB", (400, 300), (240, 230, 220)))
        self.assertTrue(v.startswith("bad"), v)
        self.assertIn("KHÔNG có kênh alpha", v)

    def test_co_alpha_nhung_duc_kin_bi_chan(self):
        v = verdict(Image.new("RGBA", (400, 300), (240, 230, 220, 255)))
        self.assertTrue(v.startswith("bad"), v)
        self.assertIn("không chỗ nào trong suốt", v)

    def test_ba_ly_do_la_BA_CAU_khac_nhau(self):
        """Người đọc phải biết mình đang ở ca nào thì mới biết làm gì tiếp."""
        cut = mem_that()
        cut.putalpha(cut.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        cau = {verdict(cut), verdict(Image.new("RGB", (9, 9))),
               verdict(Image.new("RGBA", (9, 9), (1, 2, 3, 255)))}
        self.assertEqual(len(cau), 3, cau)

    def test_thieu_Pillow_thi_KHONG_PHAN(self):
        """Không dò được thì không kết luận: chặn một lượt gen vì phép kiểm không
        chạy nổi là đổi một lỗi thật lấy một lỗi tự gây."""
        with tempfile.TemporaryDirectory() as td:
            Path(td, "sheet.png").write_bytes(b"")
            fake = Path(td, "python3")
            fake.write_text("#!/bin/sh\nexit 127\n")
            fake.chmod(0o755)
            env = {**os.environ, "KITGEN_PYTHON": str(fake)}
            r = subprocess.run(
                ["bash", "-c", f'{FN}\nalpha_verdict "$1"', "_", str(Path(td, "sheet.png"))],
                capture_output=True, text=True, env=env)
            self.assertTrue(r.stdout.strip().startswith("skip"), r.stdout)


class DinhTuyenSkillTest(unittest.TestCase):
    """CÂU LỆNH GỬI CHO CODEX PHẢI GỌI ĐÍCH DANH SKILL — không nói chung chung.

    Codex CLI KHÔNG nạp nội dung skill vào system prompt; `codex debug prompt-input`
    chỉ chèn DANH SÁCH tên + mô tả bị cắt + đường dẫn. Luật giữ alpha nằm trong
    SKILL.md và model phải tự mở ra đọc. Đo trên cùng máy, cùng model gpt-5.6-luna:
    prompt ngắn tự nhiên ⇒ model tự đọc SKILL.md ⇒ alpha thật (dải mờ 35,9%); còn
    câu cũ "your image generation tool" chôn dưới ~900 dòng layout ⇒ không đọc ⇒
    tự viết công cụ cắt nền. Ca kiểm này ghim cả hai nửa: GỌI TÊN, và CẤM tự chế.
    """

    TASK = re.search(r'^  task="(.*?)^--- IMAGE PROMPT START ---',
                     (ROOT / "gen.sh").read_text(encoding="utf-8"), re.S | re.M)

    def setUp(self):
        self.assertIsNotNone(self.TASK, "không tách được câu task khỏi gen.sh")
        self.task = self.TASK.group(1)

    def test_goi_dich_danh_skill_va_tool(self):
        for ten in ("imagegen", "image_gen", "SKILL.md"):
            self.assertIn(ten, self.task,
                          f"task phải gọi đích danh {ten} — nói chung chung là model không đọc skill")

    def test_goi_dich_danh_tham_so_background_transparent(self):
        """09/09/2026 — chủ sản phẩm: xin bằng câu văn thì lúc được lúc không, còn
        từ khoá tham số `background="transparent"` thì được. Task phải mang đúng
        từ khoá ấy (dấu nháy kép đã thoát trong chuỗi bash) để agent codex truyền
        vào lời gọi image_gen, và nó đứng ngay câu đầu, trước khối prompt.

        11/09/2026 — SỐ ĐẾM ĐỔI 2 → 3 CÓ CHỦ Ý. Chủ sản phẩm: đặt tham số thôi "vẫn
        chưa đủ", máy vẽ vẫn có lúc trả ảnh đục hoặc nền giả vẽ bằng pixel. Nên task
        có thêm MỘT chỗ nhắc lại từ khoá: câu bảo codex vẽ lại lần thứ hai. Ba chỗ
        ấy là ba việc khác nhau — ① luật của skill, ② lượt vẽ đầu, ③ lượt vẽ lại —
        nên đây vẫn là số đếm có nghĩa, không phải một con số nới ra cho dễ xanh."""
        kw = 'background=\\"transparent\\"'
        self.assertEqual(self.task.count(kw), 3,
                         "từ khoá phải có ở câu đầu, ở câu Generate ONE image, và ở câu vẽ lại")
        self.assertLess(self.task.index(kw), self.task.index("Generate ONE image"))

    def test_bat_codex_HOI_LAI_chinh_cong_cu_ve(self):
        """11/09/2026 — CHỦ SẢN PHẨM: "ask your image generation tool to double check
        its output" rồi vẽ lại nếu chưa đạt.

        Chỉ là CÂU VĂN cho codex: không script đo, không tự sửa pixel. Ca này ghim ba
        nửa của nó — có bước hỏi lại, có trần chi phí, và không gọi tên thứ không muốn
        (chữ "checker" trong task là prompt âm, nói ra là gieo vào ảnh)."""
        t = self.task
        self.assertIn("double check its own output", t,
                      "task phải bảo codex hỏi lại chính công cụ vẽ")
        self.assertIn("alpha channel is real", t,
                      "phải nói rõ xác nhận cái gì: alpha THẬT")
        self.assertIn("imitate transparency", t,
                      "phải nêu ca nền giả vẽ bằng pixel — nhưng bằng lời tả, không gọi tên")
        self.assertIn("ONE more time", t, "vẽ lại đúng MỘT lần")
        self.assertIn("Never more than two image_gen calls", t, "phải có trần chi phí")
        self.assertLess(t.index("Generate ONE image"), t.index("double check its own output"),
                        "bước tự kiểm phải đứng SAU lượt vẽ đầu")
        self.assertNotIn("checker", t.lower(), "task không được gọi tên thứ không muốn")

    def test_khong_bao_codex_DUNG_LAI_truoc_khi_ve_lai(self):
        """Câu cấm cũ kết bằng "just say so plainly and stop" — đứng một mình thì nó
        DẬP luôn lượt vẽ lại vừa thêm (hai câu của cùng một task đá nhau, và câu ở
        trước thì model đọc trước). Nên nó phải nói rõ: dừng SAU lượt vẽ lại."""
        self.assertIn("after the one retry described below", self.task)

    def test_cam_tu_che_cong_cu_tach_nen(self):
        """Cấm phải NÊU TÊN thứ đã thật sự bị lạm dụng, không cấm chung chung."""
        t = self.task.lower()
        for tu in ("swift", "python", "ffmpeg", "imagemagick", "chroma", "remove_chroma_key"):
            self.assertIn(tu, t, f"lệnh cấm phải nêu đích danh {tu}")
        self.assertIn("must not", t, "phải là lệnh cấm dứt khoát")

    def test_cam_dat_TRUOC_khoi_layout(self):
        """Chữ ở gần thắng chữ ở xa: cấm phải nằm trước ~900 dòng đặc tả layout."""
        self.assertLess(self.task.index("has to come from image_gen itself"),
                        self.task.index("Generate ONE image"),
                        "lệnh cấm phải đứng trước phần mô tả ảnh")

    def test_KHONG_cam_nham_viec_chep_file(self):
        """Model vẫn phải copy PNG về raw/. Cấm quá tay là tự tay làm hỏng lượt gen."""
        self.assertIn("Copying or moving the resulting file", self.task)


class MucNghiTest(unittest.TestCase):
    """MỨC NGHĨ PHẢI ĐƯỢC GHIM Ở CẢ HAI LƯỢT — kể cả lượt chạy lại.

    codex có mức "fast" ("Fast responses with lighter reasoning"). Thả nổi mức nghĩ
    là để hồ sơ của người dùng quyết định, mà "fast" thì cắt đúng bước model tự đi
    đọc SKILL.md — bước quyết định ảnh có alpha thật hay không.
    """

    SRC = (ROOT / "gen.sh").read_text(encoding="utf-8")

    def test_mac_dinh_la_medium_khong_phai_fast(self):
        self.assertIn('GEN_EFFORT="${KITGEN_GEN_EFFORT-medium}"', self.SRC)

    def test_luot_chay_lai_VAN_ghim_muc_nghi(self):
        """Lượt lại bỏ `-m` vì tên model bị từ chối — nhưng mức nghĩ thì độc lập với
        model, bỏ theo là tự thả về mặc định của hồ sơ."""
        khoi = self.SRC[self.SRC.index("bị provider từ chối"):]
        khoi = khoi[:khoi.index("rc=$?")]
        self.assertIn("model_reasoning_effort", khoi,
                      "lượt chạy lại phải giữ mức nghĩ, không thả về hồ sơ")
        self.assertNotIn(" -m ", khoi, "lượt chạy lại KHÔNG được ép lại model đã bị từ chối")


# ═══════════════════════════════════════════════════════════════════════════════
# PHÉP ĐO NỀN CHỈ ĐƯỢC GHI CHÚ — NÓ KHÔNG ĐƯỢC CHẶN GÌ CẢ
# ═══════════════════════════════════════════════════════════════════════════════
def _run_one_src():
    """Bóc đúng bộ hàm cần thiết để chạy `run_one` ngoài đời thật của gen.sh.

    Cùng lối của `test/gen-fake-ok.test.sh`: KHÔNG chép lại logic, chạy chính hàm
    trong file — sửa gen.sh mà làm hỏng cổng thì ca này đỏ.
    """
    src = (ROOT / "gen.sh").read_text(encoding="utf-8")

    def block(pattern, limit=None):
        m = re.search(pattern, src, re.S | re.M)
        assert m, f"không tìm thấy khối {pattern!r} trong gen.sh"
        text = m.group(0)
        return "\n".join(text.splitlines()[:limit]) if limit else text

    return "\n".join([
        block(r"^mtime_epoch\(\).*?^\}"),
        block(r"^file_hash\(\).*?^\}"),
        block(r"^PY_CHECK=.*?^\}"),
        block(r"^GEN_MODEL=.*?^fi$", limit=20),
        block(r"^run_one\(\) \{.*?^\}"),
    ])


RUN_ONE = _run_one_src()

#: codex GIẢ. Mỗi lượt gọi lấy ảnh từ biến `SRC<n>` (n = lượt thứ mấy) và ghi lại
#: task nhận được vào `$TASKLOG` — nhờ đó ca test đọc được đoạn thêm của lượt hai
#: mà không phải gọi mạng hay tiêu một đồng quota nào.
FAKE_CODEX = r"""#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
n=$(cat "$COUNTER" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$COUNTER"
eval "src=\$SRC$n"
{ echo "--- CALL $n ---"; echo "$*"; } >> "$TASKLOG"
if [ -n "$src" ]; then cp "$src" raw/job1.png; fi
exit 0
"""


def duc():
    """Ảnh model trả về khi nó KHÔNG tạo nổi nền trong suốt: RGB, không alpha."""
    return Image.new("RGB", (64, 64), (200, 80, 40))


class NenDucKhongChanTest(unittest.TestCase):
    """VERDICT "bad" CHỈ ĐƯỢC NÓI, KHÔNG ĐƯỢC LÀM GÌ.

    ╔══ HAI ĐỜI CỦA CÙNG MỘT PHÉP ĐO ═════════════════════════════════════════════╗
    ║ Đời ① (đầu 09/2026): verdict "bad" chỉ in một dòng FAIL rồi thôi — file đục  ║
    ║   vẫn nằm ở `raw/<job>.png`, và tầng agent phán theo SẢN PHẨM nên nó lật job ║
    ║   về ok, cắt, rồi đăng tấm đục thành phiên bản đang dùng.                     ║
    ║ Đời ②: verdict "bad" có hậu quả — đổi tên ảnh thành `.rejected.png`, gọi     ║
    ║   codex thêm ĐÚNG một lượt, vẫn đục thì FAIL và không để lại `raw/<job>.png`.║
    ║ Đời ③ (chủ sản phẩm chốt 09/09/2026): "cái này cứ để cho nó gen tự nhiên     ║
    ║   nhé, ko block". Không thử lại, không loại ảnh, không đánh trượt job. Ảnh   ║
    ║   model trả về được đăng như mọi ảnh khác; người nhìn nó là người quyết —    ║
    ║   thanh phiên bản đã có sẵn nút vẽ lại và nút «Xoá bản này».                 ║
    ╚═════════════════════════════════════════════════════════════════════════════╝

    Phép đo Ở LẠI vì nó vẫn nói đúng chuyện gì vừa xảy ra (log + ghi chú trên dòng
    `OK` + cờ `mode` mà slice.py ghi vào manifest). Ca ở đây khoá đúng ranh giới ấy:
    NÓI thì có, LÀM thì không — và nhất là KHÔNG tiêu thêm một lượt quota nào.
    """

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-nen-duc-"))
        self.proj = self.tmp / "p"
        for sub in ("prompts", "raw", "logs"):
            (self.proj / sub).mkdir(parents=True)
        (self.proj / "prompts" / "job1.txt").write_text(
            "## Canvas\nLANDSCAPE 1536x1024 px.\n", encoding="utf-8")
        (self.proj / "prompts" / "job1.att").write_text("", encoding="utf-8")
        (self.tmp / "bin").mkdir()
        codex = self.tmp / "bin" / "codex"
        codex.write_text(FAKE_CODEX, encoding="utf-8")
        codex.chmod(0o755)
        self.tasklog = self.tmp / "task.log"
        self.counter = self.tmp / "counter"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_one(self, *images):
        """Chạy `run_one job1` với codex giả trả lần lượt các ảnh đã cho.

        `None` = lượt ấy KHÔNG ghi gì vào đích (ca model im lặng)."""
        env = dict(os.environ)
        env["PATH"] = f"{self.tmp / 'bin'}:{env['PATH']}"
        env["COUNTER"] = str(self.counter)
        env["TASKLOG"] = str(self.tasklog)
        for i, img in enumerate(images, start=1):
            if img is None:
                env[f"SRC{i}"] = ""
                continue
            path = self.tmp / f"src{i}.png"
            img.save(path)
            env[f"SRC{i}"] = str(path)
        script = (f'set -uo pipefail\nROOT="{self.proj}"; ROOT_OUT="$ROOT"; IMG_HOME=""\n'
                  f"{RUN_ONE}\nrun_one job1\n")
        r = subprocess.run(["bash", "-c", script], cwd=self.proj,
                           capture_output=True, text=True, env=env, timeout=300)
        return r.stdout.strip()

    @property
    def raw(self):
        return self.proj / "raw" / "job1.png"

    def calls(self):
        return int(self.counter.read_text().strip()) if self.counter.exists() else 0

    def test_anh_dat_van_la_OK_va_chi_ton_mot_luot(self):
        out = self.run_one(mem_that())
        self.assertTrue(out.startswith("OK  job1"), out)
        self.assertNotIn("nền đục", out, "ảnh đạt thì không có gì để ghi chú")
        self.assertEqual(self.calls(), 1)
        self.assertTrue(self.raw.exists())

    def test_anh_duc_VAN_la_OK_kem_ghi_chu(self):
        """Câu chốt của đời ③: dòng kết là OK, và ghi chú đi kèm chứ không thay chỗ."""
        out = self.run_one(duc())
        self.assertTrue(out.startswith("OK  job1"), out)
        self.assertNotIn("FAIL", out, "nền đục KHÔNG còn đánh trượt job")
        self.assertIn("[nền đục:", out, "phải nói ra, không được im lặng cho qua")
        self.assertIn("KHÔNG có kênh alpha", out, "ghi chú mang nguyên lý do đã đo được")

    def test_anh_duc_KHONG_bi_loai_khoi_raw(self):
        """`raw/<job>.png` là sản phẩm. Không đổi tên, không dọn, không `.rejected`."""
        self.run_one(duc())
        self.assertTrue(self.raw.exists(), "ảnh model trả về phải nằm nguyên ở đích")
        self.assertEqual(
            sorted(p.name for p in (self.proj / "raw").iterdir()), ["job1.png"],
            "không được đẻ ra file phụ nào cạnh ảnh")

    def test_anh_duc_KHONG_goi_codex_lan_hai(self):
        """Nửa đắt tiền nhất: một lượt gen là một lượt quota. Không tự ý tiêu lượt hai."""
        self.run_one(duc(), mem_that())
        self.assertEqual(self.calls(), 1, "nền đục mà vẫn gọi codex lần hai = tự tiêu quota")
        log = self.tasklog.read_text(encoding="utf-8")
        self.assertNotIn("--- CALL 2 ---", log)
        self.assertNotIn("opaque image without an alpha channel", log,
                         "đoạn nhắc của lượt chữa đã bị bỏ cùng với chính lượt chữa")
        # Cùng luật với `test_prompt_KHONG_nhac_ten_caro`: một cái tên nhắc ra là một
        # cái tên có cơ hội lọt vào ảnh.
        self.assertNotIn("checker", log.lower())

    def test_ly_do_duoc_ghi_vao_log_cua_job(self):
        """Ghi chú trên một dòng `OK` thì ngắn; log là chỗ giữ nguyên văn để soi sau."""
        self.run_one(duc())
        log = (self.proj / "logs" / "job1.log").read_text(encoding="utf-8")
        self.assertIn("nền đục:", log)
        self.assertIn("chỉ ghi nhận, không chặn", log)


# ═══════════════════════════════════════════════════════════════════════════════
# ẢNH THAM CHIẾU ĐI THẲNG VÀO LỜI GỌI image_gen — CÒN KHÔNG CÓ ẢNH THÌ TUYỆT
# ĐỐI KHÔNG NHẮC TỚI MỘT TẤM NÀO
# ═══════════════════════════════════════════════════════════════════════════════
class DinhThangMoiAnhTest(unittest.TestCase):
    """╔══ QUYẾT ĐỊNH ĐANG ĐƯỢC KHOÁ Ở ĐÂY (chủ sản phẩm, 10/09/2026) ══════════════╗
    ║ Đính ảnh vào `image_gen` làm ảnh trả về mất nền trong suốt (đo 09/09/2026): ║
    ║ RGB với một cái nền ca-rô model tự vẽ. Một bản đã thử né bằng cách đổi ảnh  ║
    ║ thành CHỮ; nó giữ được alpha nhưng con vật vẽ ra không còn giống ảnh mẫu.   ║
    ║ Chốt: CHẤP NHẬN nền đục, đính thẳng mọi ảnh, chờ codex sửa đầu nguồn.       ║
    ╚════════════════════════════════════════════════════════════════════════════╝

    Nên ranh giới của `run_one` chỉ còn MỘT: `.att` có ảnh hay không.
      · có ảnh  ⇒ `-i` + khối REFERENCE IMAGES + câu dặn `referenced_image_paths`;
      · KHÔNG ảnh (nhân vật tả CHAY bằng chữ) ⇒ không một câu nào nhắc tới ảnh.
        Còn sót lại một câu thôi là model đi tìm ảnh và tự bịa ra một danh sách.
    Ca này đo trên TASK THẬT mà codex nhận được, không đọc mã nguồn.
    """

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-dinh-thang-"))
        self.proj = self.tmp / "p"
        for sub in ("prompts", "raw", "logs", "refs"):
            (self.proj / sub).mkdir(parents=True)
        (self.proj / "prompts" / "job1.txt").write_text(
            "## Canvas\nLANDSCAPE 1536x1024 px.\n", encoding="utf-8")
        (self.tmp / "bin").mkdir()
        codex = self.tmp / "bin" / "codex"
        codex.write_text(FAKE_CODEX, encoding="utf-8")
        codex.chmod(0o755)
        self.tasklog = self.tmp / "task.log"
        self.counter = self.tmp / "counter"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _chay(self, att_lines):
        (self.proj / "prompts" / "job1.att").write_text(att_lines, encoding="utf-8")
        env = dict(os.environ)
        env["PATH"] = f"{self.tmp / 'bin'}:{env['PATH']}"
        env["COUNTER"] = str(self.counter)
        env["TASKLOG"] = str(self.tasklog)
        img = self.tmp / "src1.png"
        mem_that().save(img)
        env["SRC1"] = str(img)
        script = (f'set -uo pipefail\nROOT="{self.proj}"; ROOT_OUT="$ROOT"; IMG_HOME=""\n'
                  f"{RUN_ONE}\nrun_one job1\n")
        subprocess.run(["bash", "-c", script], cwd=self.proj,
                       capture_output=True, text=True, env=env, timeout=300)
        return self.tasklog.read_text(encoding="utf-8")

    def test_co_anh_thi_dinh_thang_vao_image_gen(self):
        (self.proj / "refs" / "mascot.png").write_bytes(b"anh nhan vat")
        log = self._chay("refs/mascot.png\n")
        self.assertIn("referenced_image_paths", log)
        self.assertIn("REFERENCE IMAGES START", log)
        self.assertIn(str(self.proj / "refs" / "mascot.png"), log)

    def test_khong_anh_thi_task_KHONG_nhac_toi_anh_nao(self):
        """Nhân vật tả CHAY: người dùng gõ chữ, không tải ảnh nào lên."""
        log = self._chay("")
        self.assertNotIn("referenced_image_paths", log)
        self.assertNotIn("REFERENCE IMAGES START", log)
        self.assertNotIn(" -i ", log, "không có ảnh thì không được đính `-i` nào")
        # …nhưng câu dặn image_gen thì KHÔNG được mất theo.
        self.assertIn("image_gen", log)
        self.assertIn('background=\"transparent\"', log)


if __name__ == "__main__":
    unittest.main()
