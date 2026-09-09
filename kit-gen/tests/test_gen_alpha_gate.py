"""CỔNG ALPHA CỦA gen.sh — BẮT NGAY LÚC SINH, KHÔNG ĐỢI TỚI LÚC CẮT.

╔══ VÌ SAO CÓ FILE NÀY ═════════════════════════════════════════════════════════╗
║ Từ khi bỏ HẲN đường tách nền, hợp đồng còn đúng một câu: `image_gen` trả về    ║
║ PNG RGBA có nền trong suốt thật. Prompt đã XIN điều đó — nhưng xin không phải  ║
║ là kiểm. Trước bản này lời phán duy nhất sau mỗi lượt là "file có đổi byte     ║
║ không", nên một sheet đục hoàn toàn vẫn được đóng dấu OK và chỗ duy nhất phát  ║
║ hiện ra là slice.py, tức SAU khi đã tiêu xong quota của cả lượt.               ║
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
# CỔNG ALPHA PHẢI CÓ HẬU QUẢ, KHÔNG CHỈ CÓ LỜI PHÁN
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


class CongAlphaCoHauQuaTest(unittest.TestCase):
    """VERDICT "bad" PHẢI DỌN DẸP HIỆN TRƯỜNG, KHÔNG CHỈ IN MỘT DÒNG.

    ╔══ HIỆN TRƯỜNG (dự án thật, 09/2026) ════════════════════════════════════════╗
    ║ `alpha_verdict` phán "bad", `gen.sh` in `FAIL <job>` — rồi thôi. File đục    ║
    ║ vẫn nằm ở `raw/<job>.png`, và tầng agent phán theo SẢN PHẨM                  ║
    ║ (`run-handle.settleGenJobs`: có ảnh mới trong lượt này ⇒ job "ok"), nên nó   ║
    ║ lật job từ failed về ok, cắt, và ĐĂNG tấm đục thành phiên bản đang dùng.     ║
    ║ Kết quả: sheet `chinh-nhan-vat` của dự án test là một tấm nền giả, mode      ║
    ║ "rgb", và đó là bản người dùng đang nhìn.                                    ║
    ╚═════════════════════════════════════════════════════════════════════════════╝

    Bản vá: đổi tên ảnh trượt thành `.rejected.png`, gọi codex lại ĐÚNG MỘT LẦN,
    kiểm lại; vẫn trượt thì `raw/<job>.png` KHÔNG được tồn tại.
    """

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-alpha-retry-"))
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

    @property
    def rejected(self):
        return self.proj / "raw" / "job1.rejected.png"

    def calls(self):
        return int(self.counter.read_text().strip()) if self.counter.exists() else 0

    def test_luot_1_dat_thi_KHONG_goi_lai_lan_nao(self):
        """Nửa đắt tiền nhất của bản vá: ảnh đúng không được tốn thêm một lượt nào."""
        out = self.run_one(mem_that())
        self.assertTrue(out.startswith("OK  job1"), out)
        self.assertEqual(self.calls(), 1, "ảnh đạt cổng mà vẫn gọi codex lần hai")
        self.assertTrue(self.raw.exists())
        self.assertFalse(self.rejected.exists())

    def test_luot_1_duc_luot_2_dat_thi_OK_va_anh_truot_duoc_giu_rieng(self):
        out = self.run_one(duc(), mem_that())
        self.assertTrue(out.startswith("OK  job1"), out)
        self.assertEqual(self.calls(), 2)
        self.assertTrue(self.raw.exists(), "ảnh đạt của lượt hai phải nằm ở đích")
        self.assertTrue(self.rejected.exists(), "ảnh trượt phải được giữ lại để soi")

    def test_van_duc_sau_luot_2_thi_KHONG_de_lai_raw(self):
        """Đây là câu chốt: agent phán theo sản phẩm, nên thứ giữ nó không đăng ảnh
        đục là chính việc `raw/<job>.png` không tồn tại."""
        out = self.run_one(duc(), duc())
        self.assertTrue(out.startswith("FAIL job1"), out)
        self.assertIn("đã thử lại 1 lần", out)
        self.assertIn("job1.rejected.png", out)
        self.assertFalse(self.raw.exists(), "ảnh đục vẫn nằm ở raw/ — agent sẽ đăng nó")
        self.assertTrue(self.rejected.exists())
        self.assertEqual(self.calls(), 2, "chỉ được thử lại ĐÚNG MỘT LẦN")

    def test_luot_2_khong_ghi_gi_cung_khong_hoi_sinh_anh_truot(self):
        """Không được chép `.rejected.png` ngược về đích: nó đã trượt cổng một lần."""
        out = self.run_one(duc(), None)
        self.assertTrue(out.startswith("FAIL job1"), out)
        self.assertFalse(self.raw.exists())
        self.assertTrue(self.rejected.exists())

    def test_doan_them_cua_luot_2_noi_dung_chuyen_va_khong_goi_ten_thu_khong_muon(self):
        self.run_one(duc(), mem_that())
        log = self.tasklog.read_text(encoding="utf-8")
        lan1, lan2 = log.split("--- CALL 2 ---")
        self.assertNotIn("opaque image without an alpha channel", lan1,
                         "lượt đầu không được mang câu của lượt chữa")
        self.assertIn("opaque image without an alpha channel", lan2)
        self.assertIn("keeps the alpha channel it returns", lan2)
        # Cùng luật với `test_prompt_KHONG_nhac_ten_caro`: một cái tên nhắc ra là một
        # cái tên có cơ hội lọt vào ảnh.
        self.assertNotIn("checker", lan2.lower())
        # Và task gốc vẫn đi kèm nguyên vẹn — lượt hai vẽ cùng một tấm, không phải
        # một yêu cầu khác.
        self.assertIn("IMAGE PROMPT START", lan2)


if __name__ == "__main__":
    unittest.main()
