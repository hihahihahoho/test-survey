#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: ẢNH THAM CHIẾU ĐI VÀO PROMPT BẰNG CHỮ, KHÔNG BẰNG FILE ĐÍNH KÈM.
#
# ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/09/2026) ═════════════════════════════════════╗
# ║ Cùng một prompt, cùng một model, đo bằng chính ảnh trả về:                    ║
# ║   · gọi `image_gen` KÈM `referenced_image_paths` ⇒ ảnh RGB, nền caro do model ║
# ║     tự vẽ — MẤT nền trong suốt, lần nào cũng vậy;                             ║
# ║   · cùng lời gọi ấy nhưng KHÔNG đính ảnh ⇒ RGBA, alpha thật.                  ║
# ║ Tool `image_gen` built-in không có tham số nền nào để mà xin (skill imagegen  ║
# ║ ghi rõ `background` chỉ thuộc CLI dự phòng), nên không có đường thứ ba.       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
#
# BẢN VÁ, và đây là ca kiểm ĐƯỜNG ĐI của nó (chạy gen.sh THẬT, codex GIẢ):
#   ① tấm cần nền trong suốt: mọi ảnh tham chiếu được đổi thành CHỮ bằng một lượt
#      `codex exec` KHÔNG sinh ảnh, rồi chữ thay vào dấu chỗ `{{DESC:…}}`;
#   ② mô tả được CACHE theo băm nội dung ảnh + vai + phiên bản câu hỏi ⇒ lượt hai
#      không gọi codex lần nào (đây là nửa đắt tiền nhất: một bộ kit có hàng chục
#      tấm dùng chung mấy tấm ảnh phong cách);
#   ③ tả HỎNG thì VẪN VẼ — dấu chỗ bị xoá, dòng OK mang ghi chú `[thiếu mô tả ảnh]`;
#   ④ tấm FULL-BLEED không đổi một chữ nào: vẫn đính ảnh, vẫn `referenced_image_paths`.
#
# Không mạng, không quota: `codex` trong PATH là một script sh ghi sổ.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
expect() { # <nhãn> <chuỗi phải có> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LOI  %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "${3:0:600}" >&2; fail=1 ;;
  esac
}
refute() { # <nhãn> <chuỗi KHÔNG được có> <output>
  case "$3" in
    *"$2"*) printf 'LOI  %s\n  không được có: %s\n  trong: %s\n' "$1" "$2" "${3:0:600}" >&2; fail=1 ;;
    *) printf 'ok   %s\n' "$1" ;;
  esac
}
have() { if [ -e "$2" ]; then printf 'ok   %s\n' "$1"
  else printf 'LOI  %s\n  thiếu file: %s\n' "$1" "$2" >&2; fail=1; fi }
eqnum() { # <nhãn> <mong đợi> <thực tế>
  if [ "$2" = "$3" ]; then printf 'ok   %s (=%s)\n' "$1" "$3"
  else printf 'LOI  %s: mong %s, thực tế %s\n' "$1" "$2" "$3" >&2; fail=1; fi }

WORK="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/kitgen-desc.XXXXXX")" && pwd)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/refs"
cp "$HERE/gen.sh" "$HERE/geometry.py" "$WORK/p/"
chmod +x "$WORK/p/gen.sh"

CALLS="$WORK/calls.txt"          # mọi lượt codex, nguyên văn đối số
TASKS="$WORK/tasks"              # task của TỪNG lượt vẽ, mỗi tấm một file
mkdir -p "$TASKS"
DESC_CALLS="$WORK/desc-calls.txt" # riêng lượt TẢ ẢNH
COUNTER="$WORK/counter"
: > "$CALLS"; : > "$DESC_CALLS"; echo 0 > "$COUNTER"

# ── codex GIẢ ────────────────────────────────────────────────────────────────
# Ba vai: cổng hỏi model, lượt TẢ ẢNH (nhận ra bằng chính câu cấm sinh ảnh), lượt
# VẼ (ghi một file mới vào raw/ — nội dung phải KHÁC lượt trước, vì run_one phán
# bằng băm nội dung chứ không bằng mtime).
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
ALL="$*"
{ echo "=== CALL ==="; echo "$ALL"; } >> "$CALLS"
case "$ALL" in
  *"Do not generate any image"*)
    echo "$ALL" >> "$DESC_CALLS"
    [ -n "${DESC_FAIL:-}" ] && exit 1
    out=""; prev=""
    for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
    [ -n "$out" ] && printf '%s\n' "${DESC_TEXT:-mot mo ta}" > "$out"
    exit 0 ;;
esac
job=$(printf '%s' "$ALL" | grep -oE 'raw/[a-z0-9-]+\.png' | head -1)
n=$(cat "$COUNTER" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$COUNTER"
if [ -n "$job" ]; then
  # Task là văn bản NHIỀU DÒNG: gom cả lượt vào một file riêng thì ca test soi được
  # trọn vẹn, chứ `grep` trên một sổ chung chỉ trả về đúng dòng khớp.
  printf '%s' "$ALL" > "$TASKS/$(basename "$job" .png).txt"
  printf 'FAKEPNG %s %s\n' "$job" "$n" > "$job"
fi
exit 0
FAKE
chmod +x "$WORK/bin/codex"

# Hai tấm, và chúng khác nhau ở ĐÚNG một điều — có cần nền trong suốt hay không:
#   linh — lưới nhân vật (ô `pose`) + ảnh nhân vật + ảnh phong cách ⇒ TẢ THÀNH CHỮ
#   nen  — một cảnh phủ kín khung (ô `full`) + ảnh cảnh ⇒ VẪN ĐÍNH ẢNH
cat > "$WORK/p/styles.json" <<'JSON'
{
  "styles": [
    { "id": "tet", "vi": "Tết đỏ", "style": "flat vector, red and gold",
      "inspo": ["refs/tranh-dan-gian.png"] }
  ],
  "sheets": [
    {
      "id": "linh", "orient": "landscape", "grid": { "cols": 2, "rows": 1 },
      "ref": "refs/lan.png",
      "poseRef": "refs/tam-dang.png",
      "components": [
        { "file": "01-vay", "vi": "Vẫy tay", "spec": "the character described above, waving",
          "skel": { "shape": "pose", "w": 0.3, "h": 0.85 } },
        { "file": "02-chi", "vi": "Chỉ tay", "spec": "the character described above, pointing",
          "skel": { "shape": "pose", "w": 0.3, "h": 0.85 } }
      ]
    },
    {
      "id": "nen", "orient": "landscape", "grid": { "cols": 1, "rows": 1 },
      "ref": "refs/cho-tet.png",
      "components": [
        { "file": "25-bg-home", "vi": "Nền màn chính", "spec": "a village market at dawn",
          "skel": { "shape": "full", "w": 1, "h": 1 } }
      ]
    }
  ]
}
JSON
for f in lan tam-dang tranh-dan-gian cho-tet; do
  printf 'anh gia %s' "$f" > "$WORK/p/refs/$f.png"
done

DESC_TEXT="A round red squirrel with a cream belly, oversized head and short limbs, wearing a small gold-trimmed red tunic."

chay() { # <nhãn env thêm> → in stdout của gen.sh
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" CALLS="$CALLS" DESC_CALLS="$DESC_CALLS" TASKS="$TASKS" \
           COUNTER="$COUNTER" DESC_TEXT="$DESC_TEXT" MAXJOBS=1
    bash ./gen.sh 2>&1 )
}

# ═══════════════════════════════════════════════════════════════════════════════
echo "── ① LƯỢT ĐẦU: ảnh của tấm nhân vật được TẢ, ảnh của tấm nền được ĐÍNH"
out1="$(chay)"
expect "tấm nhân vật vẽ xong" "OK  tet-linh" "$out1"
expect "tấm nền vẽ xong"      "OK  tet-nen"  "$out1"
eqnum "đúng hai lượt tả ảnh (ảnh nhân vật + ảnh phong cách)" 2 "$(wc -l < "$DESC_CALLS" | tr -d ' ')"
refute "tấm ảnh dáng KHÔNG được tả (dáng đã có bằng chữ trên từng dòng ô)" \
  "tam-dang" "$(cat "$DESC_CALLS")"

linh="$(cat "$WORK/p/prompts/tet-linh.txt")"
expect "mô tả nhân vật đã nằm trong prompt" "$DESC_TEXT" "$linh"
refute "và không còn dấu chỗ nào" "{{DESC:" "$linh"
expect "section «Character» thay cho «Character reference»" "## Character" "$linh"
refute "prompt nhân vật không còn trỏ vào ảnh đính kèm" "attached" "$linh"
have "bản có dấu chỗ vẫn được giữ lại để soi" "$WORK/p/prompts/tet-linh.tpl"
expect "và nó CÒN dấu chỗ" "{{DESC:refs/lan.png}}" "$(cat "$WORK/p/prompts/tet-linh.tpl")"

echo "── lượt tả ảnh KHÔNG được sinh ảnh, và phải nói rõ điều đó"
dcalls="$(cat "$DESC_CALLS")"
expect "cấm sinh ảnh"        "Do not generate any image" "$dcalls"
expect "cấm gọi thẳng tool"  "Do not use image_gen"      "$dcalls"
expect "chạy sandbox chỉ đọc" "-s read-only"             "$dcalls"
expect "ảnh được đính vào ĐÚNG lượt tả này" "$WORK/p/refs/lan.png" "$dcalls"
expect "hỏi đúng vai nhân vật" "You are describing a character to an illustrator" "$dcalls"
expect "hỏi đúng vai phong cách" "You are describing the ART STYLE" "$dcalls"

echo "── cache: mô tả nằm cạnh ảnh, khoá là băm nội dung + vai + phiên bản câu hỏi"
have "cache của ảnh nhân vật"  "$WORK/p/refs/lan.png.desc.txt"
have "cache của ảnh phong cách" "$WORK/p/refs/tranh-dan-gian.png.desc.txt"
key="$(head -n1 "$WORK/p/refs/lan.png.desc.txt")"
expect "dòng khoá có băm nội dung" "# sha256:" "$key"
expect "…và vai"                   "role:character" "$key"
expect "…và phiên bản câu hỏi"     "v1" "$key"

echo "── ② TASK GỬI CODEX: tấm cần alpha không nhắc tới một tấm ảnh nào"
# Lượt vẽ của tấm nhân vật là lượt duy nhất có `raw/tet-linh.png` trong đối số.
task_linh="$(cat "$TASKS/tet-linh.txt")"
task_nen="$(cat "$TASKS/tet-nen.txt")"
refute "không có referenced_image_paths" "referenced_image_paths" "$task_linh"
refute "không có khối REFERENCE IMAGES"  "REFERENCE IMAGES START" "$task_linh"
refute "không đính ảnh nào bằng -i"      " -i " "$task_linh"
expect "nhưng vẫn dặn image_gen như cũ"  "image_gen" "$task_linh"
expect "và vẫn gọi thẳng tham số nền"    'background="transparent"' "$task_linh"
echo "── …còn tấm FULL-BLEED thì y nguyên: vẫn đính ảnh, vẫn nói đường dẫn"
expect "tấm nền vẫn truyền referenced_image_paths" "referenced_image_paths" "$task_nen"
expect "tấm nền vẫn đính ảnh cảnh" "$WORK/p/refs/cho-tet.png" "$task_nen"
refute "và ảnh cảnh KHÔNG bị đem đi tả thành chữ" "cho-tet" "$dcalls"

# ═══════════════════════════════════════════════════════════════════════════════
echo "── ③ LƯỢT HAI: cache còn hạn ⇒ KHÔNG gọi codex để tả lần nào nữa"
truoc="$(wc -l < "$DESC_CALLS" | tr -d ' ')"
out2="$(chay)"
expect "vẫn vẽ xong" "OK  tet-linh" "$out2"
eqnum "số lượt tả ảnh không tăng" "$truoc" "$(wc -l < "$DESC_CALLS" | tr -d ' ')"
expect "và mô tả vẫn có mặt trong prompt" "$DESC_TEXT" "$(cat "$WORK/p/prompts/tet-linh.txt")"

echo "── đổi NỘI DUNG ảnh (giữ nguyên tên) ⇒ mô tả cũ hết hạn, tả lại"
printf 'mot con vat KHAC han' > "$WORK/p/refs/lan.png"
out3="$(chay)"
eqnum "đúng thêm MỘT lượt tả (chỉ ảnh vừa đổi)" "$((truoc + 1))" \
  "$(wc -l < "$DESC_CALLS" | tr -d ' ')"

# ═══════════════════════════════════════════════════════════════════════════════
echo "── ④ TẢ HỎNG (codex sập / hết quota) ⇒ VẪN VẼ, và nói ra là mình thiếu gì"
rm -f "$WORK/p/refs"/*.desc.txt
out4="$( cd "$WORK/p"
  export PATH="$WORK/bin:$PATH" CALLS="$CALLS" DESC_CALLS="$DESC_CALLS" TASKS="$TASKS" \
         COUNTER="$COUNTER" DESC_TEXT="$DESC_TEXT" DESC_FAIL=1 MAXJOBS=1
  bash ./gen.sh 2>&1 )"
expect "tấm vẫn được vẽ, không đánh trượt job" "OK  tet-linh" "$out4"
expect "dòng OK mang ghi chú để agent/web nói ra được" "[thiếu mô tả ảnh: lan.png]" "$out4"
expect "thiếu ảnh nào nói ảnh đó" "[thiếu mô tả ảnh: tranh-dan-gian.png]" "$out4"
linh4="$(cat "$WORK/p/prompts/tet-linh.txt")"
refute "dấu chỗ KHÔNG được lọt vào prompt gửi model" "{{DESC:" "$linh4"
expect "phần còn lại của prompt vẫn nguyên vẹn" "## Character" "$linh4"
expect "lý do được ghi vào log RIÊNG của bước tả (log vẽ bị ghi đè)" \
  "KHÔNG tả được refs/lan.png" "$(cat "$WORK/p/logs/tet-linh.desc.log")"
expect "và người ngồi xem đọc được ngay trên dòng chạy" \
  "tet-linh: KHÔNG tả được refs/lan.png" "$out4"
eqnum "tả hỏng thì KHÔNG đóng đinh một cache rỗng nào" 0 \
  "$(ls "$WORK/p/refs" | grep -c 'desc.txt$' | tr -d ' ')"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao có bước tả ảnh." >&2; exit 1; }
echo "OK  gen.sh: ảnh tham chiếu thành chữ (cache theo băm), tấm cần alpha không đính ảnh nào"
