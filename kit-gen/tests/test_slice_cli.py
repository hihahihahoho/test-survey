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

Ca ①/③ chạy CLI thật trong thư mục tạm. `torch`/`transformers` bị chặn bằng stub để
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

KEY = (255, 0, 255)


def write_stub_modules(d):
    """`import torch` phải NGÃ để slice.py đi nhánh không-ViTMatte."""
    d.mkdir(parents=True, exist_ok=True)
    for name in ("torch", "transformers"):
        (d / f"{name}.py").write_text('raise ImportError("stub cho test")\n')


def cell_component(file, shape, **skel):
    return {"file": file, "vi": file, "spec": file, "skel": dict(shape=shape, w=0.8, h=0.6, **skel)}


def make_bg_sheet(path, w=160, h=100):
    """Tấm nền 2x1 toàn ô full-bleed: viền ngoài cả tấm là TRANH (đúng ca đã sinh ra
    bug sọc magenta), dải key nằm GIỮA hai ô với ranh giới răng cưa."""
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (30 + y // 2, 60 + (x * 7) % 50, 20 + y // 4)
    mid = w // 2
    for y in range(h):
        for x in range(mid - 6 - (y % 3), mid + 6 + (y % 3)):
            px[x, y] = KEY
    im.save(path)


def make_ui_sheet(path, w=80, h=80):
    """Tấm 1x1 nền nhạt (KHÔNG phải key) → đi đường binary, nhanh, không cần matting."""
    im = Image.new("RGB", (w, h), (245, 245, 245))
    px = im.load()
    for y in range(25, 55):
        for x in range(25, 55):
            px[x, y] = (200, 40, 40)
    im.save(path)


class SliceCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kitgen-slice-cli-"))
        shutil.copy(ROOT / "slice.py", self.tmp / "slice.py")
        (self.tmp / "raw").mkdir()
        make_bg_sheet(self.tmp / "raw" / "v1-nen.png")
        make_ui_sheet(self.tmp / "raw" / "v1-ui.png")
        styles = {
            "styles": [{"id": "v1", "vi": "V1", "bg": "pure vivid magenta #FF00FF"}],
            "sheets": [
                {"id": "nen", "grid": {"cols": 2, "rows": 1}, "orient": "landscape",
                 "components": [cell_component("25-bg-home", "full"), cell_component("26-bg-play", "full")]},
                {"id": "ui", "grid": {"cols": 1, "rows": 1}, "orient": "landscape",
                 "components": [cell_component("01-btn", "rrect")]},
            ],
        }
        (self.tmp / "styles.json").write_text(json.dumps(styles), encoding="utf-8")
        self.stub = self.tmp / "stub"
        write_stub_modules(self.stub)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_slice(self, *args):
        env = dict(os.environ, PYTHONPATH=str(self.stub))
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

    def test_o_full_bleed_khong_con_mep_am_mau_key(self):
        """Tấm nền có viền ngoài là TRANH ⇒ `is_key_color(bg)` False. Trước bản vá,
        key khai báo trong styles.json bị bỏ qua ở đây và asset ra lò còn sọc magenta."""
        self.run_slice("v1", "--sheet=nen")
        ax = s.key_axis(KEY)
        for name in ("25-bg-home.png", "26-bg-play.png"):
            im = Image.open(self.tmp / "kits" / "v1" / name).convert("RGBA")
            w, h = im.size
            px = im.load()
            bad = [(x, y, px[x, y]) for y in range(h) for x in range(w)
                   if px[x, y][3] and s.key_spill_px(px[x, y], ax) > s.KEY_TINT_SPILL]
            self.assertEqual(bad[:5], [], f"{name} còn {len(bad)} pixel ám màu key")

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
