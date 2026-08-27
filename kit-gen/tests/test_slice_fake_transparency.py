"""CHỐT CHẶN CARO GIẢ — sheet "trông như trong suốt" mà thật ra đặc.

VÌ SAO PHẢI CÓ RIÊNG MỘT FILE TEST CHO CHUYỆN NÀY
─────────────────────────────────────────────────────────────────────────────────
Từ khi prompt xin nền TRONG SUỐT thay cho nền chroma, xuất hiện một kiểu hỏng chưa
từng có: **model không báo lỗi khi nó không làm được**. Nó vẽ lại *cái hình ảnh
tượng trưng cho trong suốt* — ô caro xám-trắng đan nhau — ở alpha 255.

Đo được trên cả hai lượt nền-đặc của đối chứng (BACKLOG #24 ⑦):

    skel-probe/out.png : (254,254,254,255) đan (238,238,238,255)
    skel-A/out.png     : (254,254,254,255) đan (245,245,245,255)

Cái đáng sợ không phải là nó sai, mà là **nó sai một cách không nhìn ra được**.
Mở ảnh lên xem thì thấy đúng ô caro như mọi trình xem ảnh vẫn vẽ dưới vùng trong
suốt. Người kiểm gật đầu. Cắt xong, mỗi asset mang theo một mảng caro nướng chín,
và tới lúc dán vào Figma mới lộ — khi đã muộn.

Nên nó phải chết **ồn ào, ở ngay cửa vào**, cùng một họ với `file_hash` chống báo
"OK giả": không tin lời khai, đọc thẳng byte.

HAI TẦNG CA
  ① `painted_checkerboard()` thuần — bắt đúng cái phải bắt, và quan trọng hơn:
    KHÔNG bắt nhầm sheet đời cũ (nền magenta) hay nền phẳng nhạt, vì bắt nhầm là
    chặn đường cắt lại của project người dùng.
  ② `slice.py` chạy THẬT: sheet caro giả phải bị bỏ qua kèm lời giải thích, và
    KHÔNG được đẻ ra asset nào.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

from slicelib import ROOT, load

slice_mod = load()

# Khổ 3:2 — `orientation_error` bỏ qua sheet lệch quá 10% khỏi tỉ lệ đã khai,
# và một tấm 2:1 sẽ bị chặn TRƯỚC khi tới được chốt caro, làm ca này xanh giả.
SHEET_W, SHEET_H = 480, 320
STYLE_ID = "kit"


def caro(size=(SHEET_W, SHEET_H), o=16, sang=254, toi=238):
    """Đúng thứ model vẽ ra: hai mức xám sáng đan nhau, alpha 255 khắp nơi."""
    img = Image.new("RGB", size, (sang, sang, sang))
    px = img.load()
    for y in range(size[1]):
        for x in range(size[0]):
            if ((x // o) + (y // o)) % 2:
                px[x, y] = (toi, toi, toi)
    return img


class NhanDienTest(unittest.TestCase):
    """① Hàm thuần."""

    def test_bat_duoc_caro_dung_hai_muc_da_do_duoc_that(self):
        for sang, toi in ((254, 238), (254, 245)):      # hai lượt thật, BACKLOG #24 ⑦
            got = slice_mod.painted_checkerboard(caro(sang=sang, toi=toi))
            self.assertEqual(got, (toi, sang), f"trượt caro {sang}/{toi}")

    def test_bat_duoc_ca_khi_o_caro_to_hay_nho(self):
        for o in (8, 16, 32):
            self.assertIsNotNone(slice_mod.painted_checkerboard(caro(o=o)), f"ô {o}px")

    def test_KHONG_bat_nham_sheet_doi_cu_nen_chroma(self):
        """Bắt nhầm ở đây là chặn đường cắt lại project cũ của người dùng — hỏng
        nặng hơn hẳn cái nó định chặn."""
        for mau in ((255, 0, 255), (0, 255, 0), (0, 255, 255), (0, 0, 255)):
            self.assertIsNone(
                slice_mod.painted_checkerboard(Image.new("RGB", (SHEET_W, SHEET_H), mau)), mau)

    def test_KHONG_bat_nham_nen_phang(self):
        for mau in ((255, 255, 255), (248, 248, 248), (242, 242, 242), (0, 0, 0)):
            self.assertIsNone(
                slice_mod.painted_checkerboard(Image.new("RGB", (SHEET_W, SHEET_H), mau)), mau)

    def test_KHONG_bat_nham_chuyen_sac_mem(self):
        """Nền chuyển sắc cũng có nhiều mức xám sáng. Thứ phân biệt nó với caro là
        mức phải ĐỔI ĐI ĐỔI LẠI đều đặn, không phải đi một chiều."""
        img = Image.new("RGB", (SHEET_W, SHEET_H))
        px = img.load()
        for y in range(SHEET_H):
            for x in range(SHEET_W):
                v = 235 + (x * 20) // SHEET_W
                px[x, y] = (v, v, v)
        self.assertIsNone(slice_mod.painted_checkerboard(img))

    def test_KHONG_bat_nham_soc_mot_chieu(self):
        """Sọc dọc đổi mức theo hàng nhưng KHÔNG đổi theo cột. Caro đổi cả hai."""
        img = Image.new("RGB", (SHEET_W, SHEET_H))
        px = img.load()
        for y in range(SHEET_H):
            for x in range(SHEET_W):
                v = 254 if (x // 16) % 2 else 238
                px[x, y] = (v, v, v)
        self.assertIsNone(slice_mod.painted_checkerboard(img))


class SliceTuChoiTest(unittest.TestCase):
    """② slice.py chạy thật trong sandbox."""

    def setUp(self):
        self.box = tempfile.mkdtemp(prefix="kitgen-caro-")
        self.addCleanup(shutil.rmtree, self.box, True)
        shutil.copy(os.path.join(ROOT, "slice.py"), os.path.join(self.box, "slice.py"))
        # geometry.py đi CÙNG slice.py: nó `import geometry` để lấy bảng khổ canvas
        # + toạ độ ô/safe zone (dùng chung với khối python của gen.sh). Copy thiếu là
        # ModuleNotFoundError — đúng thứ sẽ xảy ra nếu ai quên nó trong ENGINE_FILES.
        shutil.copy(os.path.join(ROOT, "geometry.py"), os.path.join(self.box, "geometry.py"))
        os.makedirs(os.path.join(self.box, "raw"))
        with open(os.path.join(self.box, "styles.json"), "w") as f:
            json.dump({
                "sheets": [{"id": "main", "grid": {"cols": 2, "rows": 1}, "components": [
                    {"file": "01-btn", "skel": {"shape": "rrect", "w": 0.5, "h": 0.5}},
                    {"file": "02-btn", "skel": {"shape": "rrect", "w": 0.5, "h": 0.5}},
                ]}],
                "styles": [{"id": STYLE_ID, "bg": "pure vivid magenta #FF00FF"}],
            }, f)

    def run_slice(self):
        return subprocess.run([sys.executable, "slice.py"], cwd=self.box,
                              capture_output=True, text=True)

    def test_sheet_caro_gia_bi_bo_qua_va_NOI_RO_VI_SAO(self):
        caro().save(os.path.join(self.box, "raw", f"{STYLE_ID}-main.png"))
        res = self.run_slice()
        self.assertEqual(res.returncode, 0, res.stderr)
        out = res.stdout + res.stderr
        self.assertIn("CARO", out.upper(), f"không nói gì về caro:\n{out}")
        # Lời nhắn phải dạy được người đọc, không chỉ "lỗi": nêu cả nguyên nhân
        # (model không tạo được trong suốt) lẫn việc cần làm (sinh lại sheet).
        self.assertIn("sinh lại", out.lower())

    def test_KHONG_de_ra_asset_nao_tu_sheet_caro_gia(self):
        """Chốt chặn mà vẫn cho asset lọt xuống `kits/` thì vô nghĩa."""
        caro().save(os.path.join(self.box, "raw", f"{STYLE_ID}-main.png"))
        self.run_slice()
        kits = os.path.join(self.box, "kits")
        pngs = [f for f in os.listdir(kits) if f.endswith(".png")] if os.path.isdir(kits) else []
        self.assertEqual(pngs, [], f"caro giả vẫn ra asset: {pngs}")

    def test_sheet_ALPHA_THAT_van_cat_binh_thuong(self):
        """Ca đối chứng — chốt chặn không được đứng chắn đường đi đúng."""
        img = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
        px = img.load()
        cw = SHEET_W // 2
        for c in range(2):
            for y in range(30, SHEET_H - 30):
                for x in range(c * cw + 30, c * cw + cw - 30):
                    px[x, y] = (240, 200, 80, 255)
        img.save(os.path.join(self.box, "raw", f"{STYLE_ID}-main.png"))
        res = self.run_slice()
        self.assertEqual(res.returncode, 0, res.stderr)
        with open(os.path.join(self.box, "kits", "manifest.json")) as f:
            assets = json.load(f)["styles"][STYLE_ID]["assets"]
        self.assertEqual(sorted(a["file"] for a in assets), ["01-btn.png", "02-btn.png"])


if __name__ == "__main__":
    unittest.main()
