#!/usr/bin/env bash
# make-golden-slice.sh — SINH FIXTURE GOLDEN CHO BƯỚC CẮT. DEV-ONLY, CHẠY TAY.
#
# ╔══ VÌ SAO GOLDEN PHẢI DO CHÍNH slice.py SINH RA ═══════════════════════════════╗
# ║ Bản JS (`agent/engine/slice.mjs`) là bản PORT, không phải bản viết lại. Thứ   ║
# ║ duy nhất định nghĩa "đúng" ở đây là đầu ra của `slice.py` + Pillow trên cùng  ║
# ║ đầu vào. Nếu kỳ vọng được gõ tay thì mọi khác biệt sẽ được "sửa" về phía bản  ║
# ║ JS, và cái sai sẽ nằm im trong fixture.                                       ║
# ║                                                                               ║
# ║ Vì vậy script này CHẠY slice.py THẬT (và validate_output_geometry.py THẬT)    ║
# ║ bằng một python3 có Pillow, rồi đổ nguyên đầu ra vào                          ║
# ║ `agent/test-fixtures/engine-golden-slice/<ca>/expected/`.                     ║
# ║ Bộ test (`agent/test/suite-engine-slice.mjs`) KHÔNG gọi script này: nó chỉ so ║
# ║ bản JS với fixture đã commit, nên CI không cần Python.                        ║
# ╚═══════════════════════════════════════════════════════════════════════════════╝
#
# Chạy:  bash agent/test/engine-golden/make-golden-slice.sh [--keep]
# Biến:  KITGEN_PY=<python3 có Pillow>   (mặc định: dò anaconda rồi python3)
#        KITGEN_REAL_PROJECT=<project-dir>  (mặc định: ~/KitGen-dev/projects/test-vcb-d6fd)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"                 # kit-gen/
OUT="$ROOT/agent/test-fixtures/engine-golden-slice"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-golden-XXXXXX")"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1
trap '[ "$KEEP" = 1 ] || rm -rf "$STAGE"' EXIT

pick_python() {
  if [ -n "${KITGEN_PY:-}" ]; then echo "$KITGEN_PY"; return; fi
  for p in /opt/homebrew/anaconda3/bin/python3 python3; do
    if command -v "$p" >/dev/null 2>&1 && "$p" -c "import PIL" >/dev/null 2>&1; then echo "$p"; return; fi
  done
  echo "KHÔNG tìm được python3 có Pillow — đặt KITGEN_PY=" >&2; exit 1
}
PY="$(pick_python)"
echo "python : $PY  ($("$PY" -c 'import PIL;print("Pillow",PIL.__version__)'))"
echo "staging: $STAGE"
echo "đích   : $OUT"

"$PY" "$HERE/make-cases.py" "$STAGE"

REAL="${KITGEN_REAL_PROJECT:-$HOME/KitGen-dev/projects/test-vcb-d6fd}"
if [ -f "$REAL/contract.json" ]; then
  node "$HERE/make-real-cases.mjs" "$REAL" "$STAGE"
else
  echo "  ⚠ bỏ qua ca ảnh thật: không thấy $REAL/contract.json"
fi

"$PY" "$HERE/run-golden.py" "$STAGE" "$OUT" "$ROOT"

# ── fixture riêng cho CODEC PNG ──────────────────────────────────────────────
"$PY" "$HERE/make-png-cases.py" "$ROOT/agent/test-fixtures/engine-golden-png"

echo
echo "xong. $(find "$OUT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ') ca trong $OUT"
