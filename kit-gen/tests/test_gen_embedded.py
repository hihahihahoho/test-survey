"""Khoá hồi quy cho python nhúng trong gen.sh.

Bài học 14/08: thêm encoding="utf-8" vào khối `python3 -c "…"` — bash nuốt
dấu nháy kép, python nhận `encoding=utf-8` trần → SyntaxError, MỌI job chết
sau ~1s, ship trong 2.1.20/2.1.21. `bash -n` xanh (cú pháp bash vẫn đúng),
không test nào chạy qua khối nhúng. Test này mô phỏng ĐÚNG cách bash đọc
chuỗi nháy kép (dừng ở nháy không escape) rồi compile phần python thu được —
ai thêm nháy kép trần vào khối -c là đỏ ngay tại đây.
"""
import re
import unittest
from pathlib import Path

GEN_SH = Path(__file__).resolve().parent.parent / "gen.sh"


class GenEmbeddedPython(unittest.TestCase):
    def test_python_c_blocks_compile_as_bash_parses_them(self):
        src = GEN_SH.read_text(encoding="utf-8")
        blocks = re.findall(r'python3 -c "((?:[^"\\]|\\.)*)"', src, re.S)
        self.assertGreaterEqual(len(blocks), 1, "gen.sh phải còn ít nhất 1 khối python3 -c")
        for i, raw in enumerate(blocks):
            code = raw.replace('\\"', '"').replace("\\$", "$").replace("\\\\", "\\")
            try:
                compile(code, f"gen.sh:python3-c-block{i}", "exec")
            except SyntaxError as e:  # pragma: no cover - thông điệp là sản phẩm
                self.fail(
                    f"Khối python3 -c thứ {i} trong gen.sh vỡ khi bash bóc nháy kép: {e}\n"
                    "Nhớ: trong khối -c nháy kép phải escape hoặc dùng nháy đơn."
                )


if __name__ == "__main__":
    unittest.main()
