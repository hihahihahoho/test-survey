"""CLI của slice.py: CẮT LŨY TIẾN (`--sheet=`) + ổ khoá manifest + ghi nguyên tử.

Vì sao bộ ca này tồn tại: từ 15/08 agent gọi slice.py NGAY khi một tấm gen xong, thay
vì đợi cả lượt. Nghĩa là nhiều lượt slice.py chạy CHỒNG NHAU trên cùng một
`kits/manifest.json` — thứ mà cả file này đọc ở đầu và ghi ở cuối. Ba lời hứa phải
được khoá lại bằng test, không phải bằng lời:

  ① `--sheet=<id>` chỉ cắt đúng tấm đó, và tấm cắt TỪ TRƯỚC vẫn còn nguyên trong
     manifest (khối merge "GEN LẠI MỘT NHÓM");
  ② hai tiến trình slice.py không bao giờ cùng lúc đọc–sửa–ghi manifest (ổ khoá);
  ③ manifest ghi NGUYÊN TỬ — người đọc (`GET /api/projects/:id/kit`) không bao giờ
     vớ phải file cụt.

Ca ①/③ chạy CLI thật trong thư mục tạm. `torch`/`transformers` không còn được
slice.py nạp nữa (đường matting chroma đã bỏ), nên stub chặn import cũng bỏ theo.
lượt chạy không nạp ViTMatte (~8s): đường full-bleed không dùng matting, và tấm còn
lại trong ca này cố ý KHÔNG dùng nền key, nên chặn stub không che giấu đường nào.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from slicelib import load, ROOT

s = load()

def cell_component(file, shape, **skel):
    return {"file": file, "vi": file, "spec": file, "skel": dict(shape=shape, w=0.8, h=0.6, **skel)}


def make_bg_sheet(path, w=160, h=100):
    """Tấm nền 2x1 toàn ô full-bleed: tranh phủ kín, dải model CHỪA (alpha = 0) nằm
    GIỮA hai ô với ranh giới răng cưa — đúng ca từng sinh ra bug sọc magenta, nay
    phần chừa là trong suốt chứ không phải một màu."""
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4, 255)
    mid = w // 2
    for y in range(h):
        for x in range(mid - 6 - (y % 3), mid + 6 + (y % 3)):
            px[x, y] = (0, 0, 0, 0)
    im.save(path)


def make_ui_sheet(path, w=120, h=80):
    """Tấm 1x1 nền TRONG SUỐT với một khối đặc ở giữa — hình dạng mà mọi sheet mới
    đều có.

    KHỔ PHẢI LÀ 3:2. `orientation_error` (sự cố 21/08/2026) bỏ qua mọi sheet lệch
    quá 10% khỏi tỉ lệ đã khai — và ảnh VUÔNG lệch 33%. Tấm 80x80 cũ vì thế bị bỏ
    qua lặng lẽ, manifest rỗng, hai ca merge đỏ mà không nói được vì sao."""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = im.load()
    for y in range(25, 55):
        for x in range(25, 55):
            px[x, y] = (200, 40, 40, 255)
    im.save(path)


class SliceCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-slice-cli-"))
        shutil.copy(ROOT / "slice.py", self.tmp / "slice.py")
        # geometry.py đi CÙNG slice.py: nó `import geometry` để lấy bảng khổ canvas
        # + toạ độ ô/safe zone (dùng chung với khối python của gen.sh). Copy thiếu là
        # ModuleNotFoundError — đúng thứ sẽ xảy ra nếu ai quên nó trong ENGINE_FILES.
        shutil.copy(ROOT / "geometry.py", self.tmp / "geometry.py")
        (self.tmp / "raw").mkdir()
        make_bg_sheet(self.tmp / "raw" / "v1-nen.png")
        make_ui_sheet(self.tmp / "raw" / "v1-ui.png")
        styles = {
            "styles": [{"id": "v1", "vi": "V1", "bg": "pure vivid magenta #FF00FF"}],
            "sheets": [
                {"id": "nen", "grid": {"cols": 2, "rows": 1}, "orient": "landscape",
                 "components": [cell_component("25-bg-home", "full"), cell_component("26-bg-play", "full")]},
                {"id": "ui", "grid": {"cols": 1, "rows": 1}, "orient": "landscape",
                 # `out`/`drawScale` = CỠ ĐẦU RA + hệ số phóng: hai số ĐI QUA dao cắt
                 # chứ không tham gia cắt (xem khối chú thích trong slice.py).
                 "components": [{**cell_component("01-btn", "rrect"),
                                 "out": {"w": 120, "h": 52}, "drawScale": 2.5}]},
            ],
        }
        (self.tmp / "styles.json").write_text(json.dumps(styles), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_slice(self, *args):
        env = dict(os.environ)
        p = subprocess.run([sys.executable, str(self.tmp / "slice.py"), *args],
                           capture_output=True, text=True, env=env, timeout=300)
        self.assertEqual(p.returncode, 0, f"slice.py {args} chết:\n{p.stdout}\n{p.stderr}")
        return p.stdout

    def manifest(self):
        return json.loads((self.tmp / "kits" / "manifest.json").read_text())

    def test_cat_lu_y_tien_giu_nguyen_tam_da_cat_truoc(self):
        self.run_slice("v1", "--sheet=nen")
        m = self.manifest()
        self.assertEqual(sorted(m["styles"]["v1"]["sheets"]), ["nen"],
                         "--sheet= phải cắt ĐÚNG một tấm")

        self.run_slice("v1", "--sheet=ui")
        m = self.manifest()
        self.assertEqual(sorted(m["styles"]["v1"]["sheets"]), ["nen", "ui"],
                         "lượt cắt hẹp thứ hai đã XOÁ MẤT tấm cắt ở lượt trước")
        files = {a["file"] for a in m["styles"]["v1"]["assets"]}
        self.assertIn("25-bg-home.png", files, "asset của tấm cắt trước biến mất khỏi manifest")
        self.assertIn("01-btn.png", files)
        measured = next(a for a in m["styles"]["v1"]["assets"] if a["file"] == "01-btn.png")
        self.assertIn("core", measured)
        self.assertIn("enamel", measured)
        self.assertIn("contractSafe", measured)
        self.assertIn("sizeDeviation", measured)
        self.assertEqual(m["qa"]["sizeDeviation"]["threshold"], 15)
        self.assertIn("qa", m["styles"]["v1"])

        # ... và lượt cắt TỔNG cuối lượt (lưới an toàn) chạy lại được, không phá gì
        self.run_slice("v1")
        m = self.manifest()
        self.assertEqual(sorted(m["styles"]["v1"]["sheets"]), ["nen", "ui"])
        for f in ("25-bg-home.png", "26-bg-play.png", "01-btn.png"):
            self.assertTrue((self.tmp / "kits" / "v1" / f).exists(), f"{f} biến mất sau lượt cắt tổng")

    def test_o_full_bleed_giu_nguyen_phan_model_chua_lam_TRONG_SUOT(self):
        """Bug sọc magenta 15/08 ở dạng mới. Model chừa mép thì phần chừa phải đi
        vào asset dưới dạng ALPHA = 0. Nếu ai đó lỡ đưa nhánh full-bleed về
        `convert("RGB")` như bản chroma từng làm, phần chừa hoá ĐEN ĐẶC — vẫn là
        một cái viền đi thẳng sang Figma, chỉ đổi màu."""
        self.run_slice("v1", "--sheet=nen")
        for name in ("25-bg-home.png", "26-bg-play.png"):
            im = Image.open(self.tmp / "kits" / "v1" / name).convert("RGBA")
            lo, hi = im.getchannel("A").getextrema()
            self.assertEqual(hi, 255, f"{name}: mất phần tranh đục")
            self.assertEqual(lo, 0, f"{name}: phần model chừa bị tô đặc thay vì trong suốt")

    def test_co_dau_ra_di_QUA_dao_cat_vao_manifest(self):
        """`outSize` là cỡ mà thành phẩm phải có khi RỜI khỏi app; dao cắt vẫn cắt
        theo `contractSafe` (hộp max-fit mà prompt đã hứa). Hai số khác nhau nằm
        cạnh nhau trong cùng một asset — đó là cả điểm của bản vá: trước đây chỉ có
        một cỡ, nên muốn nút nhỏ thì phải bảo máy vẽ nhỏ, và mất độ phân giải."""
        self.run_slice("v1", "--sheet=ui")
        asset = self.manifest()["styles"]["v1"]["assets"][0]
        self.assertEqual(asset["outSize"], [120, 52])
        self.assertEqual(asset["drawScale"], 2.5)
        # Hộp cắt KHÔNG đổi theo `out`: nó vẫn là `round(ô × skel.w/h)` = 96x48.
        self.assertEqual(asset["contractSafe"][2:], [96, 48])

    def test_o_khong_khai_out_thi_manifest_KHONG_bia_outSize(self):
        """Kit đời cũ không có `out`. Bịa một `outSize` mặc định ở đây là ép tầng
        xuất co ảnh về một cỡ chưa ai chọn — im lặng và sai."""
        self.run_slice("v1", "--sheet=nen")
        for asset in self.manifest()["styles"]["v1"]["assets"]:
            self.assertNotIn("outSize", asset)

    def test_ghi_manifest_nguyen_tu(self):
        self.run_slice("v1", "--sheet=ui")
        self.assertFalse((self.tmp / "kits" / "manifest.json.tmp").exists(),
                         "file tạm còn sót — ghi chưa qua os.replace")
        self.assertTrue(self.manifest()["styles"]["v1"]["sheets"], "manifest đọc được")

    def test_parse_cli(self):
        self.assertEqual(s.parse_cli([]), (set(), None))
        self.assertEqual(s.parse_cli(["tet", "ipay"]), ({"tet", "ipay"}, None))
        self.assertEqual(s.parse_cli(["tet", "--sheet=main"]), ({"tet"}, {"main"}))
        self.assertEqual(s.parse_cli(["--sheet=main", "--sheet=tall"]), (set(), {"main", "tall"}))
        self.assertEqual(s.parse_cli(["tet", "--sheets=main,tall"]), ({"tet"}, {"main", "tall"}))
        with self.assertRaises(SystemExit):
            s.parse_cli(["--khong-ton-tai"])


@unittest.skipUnless(hasattr(os, "fork"), "cần fork (POSIX) để dựng tiến trình thứ hai")
class ManifestLockTest(unittest.TestCase):
    """Ổ khoá phải ĐỘC QUYỀN GIỮA CÁC TIẾN TRÌNH — đó là toàn bộ lý do nó tồn tại.
    Dùng fork thay vì spawn python mới: giữ nguyên module đã nạp (nhanh) mà vẫn là
    hai tiến trình thật, và `flock` khoá theo *open file description* nên fd mở mới
    trong tiến trình con vẫn đụng khoá của cha — đúng thứ cần đo."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-lock-"))
        self.kits = self.tmp / "kits"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def child_try_lock(self, timeout):
        """Chạy acquire_manifest_lock trong tiến trình CON, trả True nếu giành được."""
        r, w = os.pipe()
        pid = os.fork()
        if pid == 0:                                   # ── tiến trình con
            os.close(r)
            code = b"0"
            try:
                s.acquire_manifest_lock(str(self.kits), timeout=timeout, poll=0.02)
                code = b"1"
            except SystemExit:
                code = b"0"
            except Exception:
                code = b"E"
            os.write(w, code)
            os._exit(0)
        os.close(w)
        got = os.read(r, 1)
        os.close(r)
        os.waitpid(pid, 0)
        self.assertNotEqual(got, b"E", "tiến trình con nổ vì lỗi khác")
        return got == b"1"

    def test_khoa_doc_quyen_giua_hai_tien_trinh(self):
        fd = s.acquire_manifest_lock(str(self.kits))
        self.assertIsNotNone(fd, "nền tảng này phải có cơ chế khoá")
        self.assertTrue((self.kits / ".manifest.lock").exists())
        self.assertFalse(self.child_try_lock(0.3),
                         "tiến trình thứ hai VẪN giành được khoá ⇒ hai lượt slice sẽ "
                         "cùng đọc–sửa–ghi manifest và ăn mất phần của nhau")
        os.close(fd)                                    # nhả khoá
        self.assertTrue(self.child_try_lock(5.0), "khoá đã nhả mà vẫn không xin được")

    def test_ghi_nguyen_tu_khong_de_lai_file_cut(self):
        self.kits.mkdir(parents=True)
        p = str(self.kits / "manifest.json")
        s.dump_manifest(p, {"styles": {"v1": {"sheets": {"main": {"cut": 3}}}}})
        self.assertEqual(json.loads(Path(p).read_text())["styles"]["v1"]["sheets"]["main"]["cut"], 3)
        self.assertFalse(os.path.exists(p + ".tmp"))
        s.dump_manifest(p, {"styles": {"v1": {"sheets": {}}, "v2": {}}})
        self.assertIn("v2", json.loads(Path(p).read_text())["styles"], "lượt ghi sau không thay được file")


if __name__ == "__main__":
    unittest.main()
