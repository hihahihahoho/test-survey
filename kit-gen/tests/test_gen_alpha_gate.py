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
        self.assertLess(self.task.index("HARD BAN"), self.task.index("Generate ONE image"),
                        "lệnh cấm phải đứng trước phần mô tả ảnh")

    def test_KHONG_cam_nham_viec_chep_file(self):
        """Model vẫn phải copy PNG về raw/. Cấm quá tay là tự tay làm hỏng lượt gen."""
        self.assertIn("Copying or moving the resulting file", self.task)


if __name__ == "__main__":
    unittest.main()
