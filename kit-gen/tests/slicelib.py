"""Nạp slice.py như một module để test.

`slice.py` chạy như script (`python3 slice.py`) nên tên file không import được
bằng `import slice` cho gọn — và trước đây import thẳng còn CHẠY LUÔN vòng cắt,
ghi đè `kits/`. Nay thân script đã nằm dưới `if __name__ == "__main__":` nên nạp
qua importlib là an toàn: chỉ lấy định nghĩa hàm.
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load():
    spec = importlib.util.spec_from_file_location("kitgen_slice", ROOT / "slice.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
