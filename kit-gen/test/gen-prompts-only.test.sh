#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: XEM ĐƯỢC PROMPT MÀ KHÔNG PHẢI TRẢ TIỀN CHO NÓ (KITGEN_PROMPTS_ONLY=1).
#
# VÌ SAO CÓ CHẾ ĐỘ NÀY — prompt gửi cho model được lắp TRONG chính gen.sh (khối
# python ~700 dòng). Trước bản này, cách duy nhất để đọc nó là chạy một lượt gen
# thật: mỗi lần muốn soi một câu chữ là một lần đốt hạn mức ảnh. Đúng thứ tự ngược
# — người ta muốn đọc TRƯỚC khi vẽ, nhất là ngay sau khi vừa sửa mô tả tấm.
#
# CA NÀY CHẠY GEN.SH THẬT, không trích hàm, vì thứ phải chứng minh là ĐƯỜNG ĐI:
# khung xương + khối python chạy đủ, rồi DỪNG trước vòng gọi codex. `codex` giả
# trong PATH ghi lại mọi lần bị gọi — nên "không gọi codex" ở đây là bằng chứng,
# không phải lời hứa. Không mạng, không quota.
#
# Ca cũng khoá luôn ba thứ mà Prompt Studio dựa vào:
#   · `sheet.directive`      → một dòng chỉ đạo riêng của tấm nằm trong prompt;
#   · `sheet.promptOverride` → prompt của người dùng NGUYÊN VĂN, nhưng vẫn giữ dòng
#     khổ giấy ở đầu (run_one đọc ngược khổ bằng `head -n1 … grep PORTRAIT`);
#   · dấu `prompts/<job>.fullbleed` → mối nối python→bash của cổng alpha.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
expect() { # <nhãn> <chuỗi phải có> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LOI  %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "${3:0:400}" >&2; fail=1 ;;
  esac
}
refute() { # <nhãn> <chuỗi KHÔNG được có> <output>
  case "$3" in
    *"$2"*) printf 'LOI  %s\n  không được có: %s\n' "$1" "$2" >&2; fail=1 ;;
    *) printf 'ok   %s\n' "$1" ;;
  esac
}
have() { # <nhãn> <đường dẫn phải tồn tại>
  if [ -e "$2" ]; then printf 'ok   %s\n' "$1"
  else printf 'LOI  %s\n  thiếu file: %s\n' "$1" "$2" >&2; fail=1; fi
}
havent() { # <nhãn> <đường dẫn KHÔNG được tồn tại>
  if [ -e "$2" ]; then printf 'LOI  %s\n  không được có file: %s\n' "$1" "$2" >&2; fail=1
  else printf 'ok   %s\n' "$1"; fi
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-promptsonly.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p"
cp "$HERE/gen.sh" "$WORK/p/gen.sh"
chmod +x "$WORK/p/gen.sh"
CALLS="$WORK/codex-calls.txt"

# codex giả: KHÔNG làm gì ngoài việc ghi sổ là mình đã bị gọi.
cat > "$WORK/bin/codex" <<FAKE
#!/bin/sh
echo "\$@" >> "$CALLS"
exit 0
FAKE
chmod +x "$WORK/bin/codex"

# Khung xương giả. Bản thật cần @resvg/resvg-wasm (2,4 MB wasm) và ảnh khung xương
# không dính gì tới câu chữ của prompt — thứ ca này soi. Stub giữ đúng hợp đồng:
# ghi skeleton/<sheet>.png rồi thoát 0.
cat > "$WORK/p/render-skeleton.mjs" <<'STUB'
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
const cfg = JSON.parse(readFileSync("styles.json", "utf8"))
mkdirSync("skeleton", { recursive: true })
for (const sh of cfg.sheets) writeFileSync(`skeleton/${sh.id}.png`, "KHUNG-XUONG-GIA")
STUB

# Bốn tấm, mỗi tấm chứng minh một điều:
#   main   — tấm UI thường + `directive`
#   doc    — tấm PORTRAIT + `promptOverride` (khổ giấy phải sống sót)
#   nen    — tấm full-bleed (mọi ô skel.shape = "full") ⇒ phải có dấu .fullbleed
#   linh   — tấm mascot (có `ref`) ⇒ KHÔNG được nhận khối "ba lớp" viết cho nút bấm
cat > "$WORK/p/styles.json" <<'JSON'
{
  "styles": [
    { "id": "tet", "vi": "Tết đỏ", "style": "flat vector, red and gold" }
  ],
  "sheets": [
    {
      "id": "main", "orient": "landscape", "grid": { "cols": 2, "rows": 1 },
      "note": "ghi chú của template",
      "directive": "vẽ thêm mưa xuân rơi nhẹ",
      "components": [
        { "file": "01-btn-pill", "vi": "Nút", "spec": "glossy candy-red pill button",
          "skel": { "shape": "pill", "w": 0.8, "h": 0.4 } },
        { "file": "02-btn-wide", "vi": "Nút rộng", "spec": "wide rounded button",
          "skel": { "shape": "rrect", "w": 0.8, "h": 0.4 } }
      ]
    },
    {
      "id": "doc", "orient": "portrait", "grid": { "cols": 1, "rows": 1 },
      "promptOverride": "TÔI TỰ SOẠN: vẽ một tấm bảng gỗ mộc, không viền, nền trong suốt.",
      "components": [
        { "file": "03-board", "vi": "Bảng", "spec": "wooden board",
          "skel": { "shape": "rrect", "w": 0.8, "h": 0.6 } }
      ]
    },
    {
      "id": "nen", "orient": "landscape", "grid": { "cols": 1, "rows": 1 },
      "components": [
        { "file": "25-bg-home", "vi": "Nền màn chính", "spec": "village scene at dawn",
          "skel": { "shape": "full", "w": 1, "h": 1 } }
      ]
    },
    {
      "id": "linh", "orient": "landscape", "grid": { "cols": 1, "rows": 1 },
      "ref": "refs/mascot.png",
      "components": [
        { "file": "30-pose-vui", "vi": "Dáng vui", "spec": "mascot waving",
          "skel": { "shape": "pose", "w": 0.8, "h": 0.8 } }
      ]
    }
  ]
}
JSON

echo "── chạy gen.sh với KITGEN_PROMPTS_ONLY=1"
out="$( cd "$WORK/p" && PATH="$WORK/bin:$PATH" KITGEN_PROMPTS_ONLY=1 bash ./gen.sh 2>&1 )"
rc=$?
[ "$rc" -eq 0 ] && printf 'ok   %s\n' "thoát 0" || { printf 'LOI  thoát %s\n  %s\n' "$rc" "$out" >&2; fail=1; }
expect "nói rõ là đã dừng, không gọi codex" "KHÔNG gọi codex" "$out"

echo "── prompt được dựng đủ, ảnh thì không có tấm nào"
for j in tet-main tet-doc tet-nen tet-linh; do
  have "prompt của $j" "$WORK/p/prompts/$j.txt"
  have "danh sách ảnh kèm của $j" "$WORK/p/prompts/$j.att"
done
havent "KHÔNG có ảnh nào trong raw/" "$WORK/p/raw/tet-main.png"
if [ -s "$CALLS" ]; then
  printf 'LOI  codex ĐÃ BỊ GỌI ở chế độ xem trước:\n%s\n' "$(cat "$CALLS")" >&2; fail=1
else
  printf 'ok   %s\n' "codex không bị gọi một lần nào (kể cả cổng hỏi model)"
fi

main="$(cat "$WORK/p/prompts/tet-main.txt")"
doc="$(cat "$WORK/p/prompts/tet-doc.txt")"
linh="$(cat "$WORK/p/prompts/tet-linh.txt")"

echo "── sheet.directive thành MỘT DÒNG trong prompt, ngay sau ghi chú của tấm"
expect "có câu chỉ đạo riêng" "Extra direction for this sheet (from the designer): vẽ thêm mưa xuân rơi nhẹ" "$main"
expect "ghi chú của template vẫn còn" "ghi chú của template" "$main"
refute "tấm không khai directive thì không có câu đó" "Extra direction for this sheet" "$linh"

echo "── sheet.promptOverride = prompt của người dùng, NGUYÊN VĂN"
expect "chữ của người dùng có trong prompt" "TÔI TỰ SOẠN: vẽ một tấm bảng gỗ mộc" "$doc"
# Dòng khổ giấy là NGOẠI LỆ KỸ THUẬT: run_one đọc ngược khổ bằng `head -n1 | grep PORTRAIT`.
# Mất nó là mọi tấm dọc bị gửi đi với 1536x1024 (xem test/gen-canvas-size.test.sh).
head1="$(head -n1 "$WORK/p/prompts/tet-doc.txt")"
expect "dòng đầu vẫn là khổ giấy, và vẫn đúng PORTRAIT" "Canvas orientation: PORTRAIT 1024x1536." "$head1"
refute "KHÔNG nối thêm luật của engine (cấm chữ)" "ABSOLUTELY NO TEXT" "$doc"
refute "KHÔNG nối thêm luật của engine (khối lưới)" "STRICT grid" "$doc"
refute "KHÔNG nối thêm luật của engine (art style)" "Art style:" "$doc"
expect "tấm KHÔNG override thì vẫn có đủ luật engine" "ABSOLUTELY NO TEXT" "$main"

echo "── dấu full-bleed: mối nối python → bash cho cổng alpha"
have "tấm nền có dấu" "$WORK/p/prompts/tet-nen.fullbleed"
havent "tấm UI thường KHÔNG có dấu" "$WORK/p/prompts/tet-main.fullbleed"
havent "tấm mascot KHÔNG có dấu" "$WORK/p/prompts/tet-linh.fullbleed"

echo "── dấu mồ côi phải bị dọn: prompts/ sống qua nhiều lượt"
touch "$WORK/p/prompts/tet-main.fullbleed"
( cd "$WORK/p" && PATH="$WORK/bin:$PATH" KITGEN_PROMPTS_ONLY=1 bash ./gen.sh >/dev/null 2>&1 )
havent "lượt sau xoá dấu của tấm không còn full-bleed" "$WORK/p/prompts/tet-main.fullbleed"
have "dấu của tấm nền vẫn còn" "$WORK/p/prompts/tet-nen.fullbleed"

echo "── tấm mascot KHÔNG lãnh khối chỉ dẫn viết cho nút bấm"
refute "không có khối ba lớp" "Build each element in three layers" "$linh"
refute "không có lệnh rim/border" "the rim/border immediately OUTSIDE that footprint" "$linh"
expect "nhưng vẫn giữ vùng an toàn" "production SAFE ZONE" "$linh"
expect "vẫn giữ nền trong suốt" "BACKGROUND of the sheet: FULLY TRANSPARENT" "$linh"
expect "vẫn cấm chữ" "ABSOLUTELY NO TEXT" "$linh"
expect "vẫn cấm vẽ caro" "NEVER DRAW A CHECKERBOARD" "$linh"
expect "và vẫn cấm tràn sang ô khác" "never cross into another cell" "$linh"
expect "tấm nút bấm thì VẪN CÓ khối ba lớp" "Build each element in three layers" "$main"

echo "── không có cờ thì codex PHẢI bị gọi (chứng minh chính cái cờ là thứ chặn)"
: > "$CALLS"
( cd "$WORK/p" && PATH="$WORK/bin:$PATH" bash ./gen.sh >/dev/null 2>&1 )
if [ -s "$CALLS" ]; then printf 'ok   %s\n' "chạy thường vẫn gọi codex như cũ"
else printf 'LOI  chạy KHÔNG có cờ mà codex cũng không được gọi — cờ đã chặn nhầm đường thường\n' >&2; fail=1; fi

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao có chế độ này." >&2; exit 1; }
echo "OK  gen.sh: KITGEN_PROMPTS_ONLY dựng đủ prompt và không tiêu một đồng quota nào"
