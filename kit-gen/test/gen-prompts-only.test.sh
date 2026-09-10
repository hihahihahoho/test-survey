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
# geometry.py đi CÙNG gen.sh, không phải phụ kiện: khối python của nó `import geometry`
# ngay dòng đầu. Thiếu file này thì ca đỏ vì ModuleNotFoundError — đúng như trên máy
# người dùng nếu ai đó quên thêm nó vào ENGINE_FILES của agent.
cp "$HERE/geometry.py" "$WORK/p/geometry.py"
chmod +x "$WORK/p/gen.sh"
CALLS="$WORK/codex-calls.txt"

# codex giả: KHÔNG làm gì ngoài việc ghi sổ là mình đã bị gọi.
cat > "$WORK/bin/codex" <<FAKE
#!/bin/sh
echo "\$@" >> "$CALLS"
exit 0
FAKE
chmod +x "$WORK/bin/codex"

# KHÔNG CÒN STUB KHUNG XƯƠNG. Bản trước phải giả lập `render-skeleton.mjs` (bản thật
# cần @resvg/resvg-wasm, 2,4 MB wasm) chỉ để gen.sh đi qua được bước đó. Khung xương
# đã bỏ 27/08/2026: gen.sh nay chỉ đọc styles.json và viết chữ, nên ca này chạy được
# trên một máy trần — không node module nào, không ảnh nào.

# Bốn tấm, mỗi tấm chứng minh một điều:
#   main   — tấm UI thường + `directive`
#   doc    — tấm PORTRAIT + `promptOverride` (khổ giấy phải sống sót)
#   nen    — tấm full-bleed (mọi ô skel.shape = "full") ⇒ phải có dấu .fullbleed
#   linh   — tấm mascot (có `ref`) ⇒ KHÔNG được nhận khối "ba lớp" viết cho nút bấm
#   chay   — tấm mascot MÔ TẢ CHAY (không `ref`) ⇒ không được nhắc tới ảnh nào
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
    },
    {
      "id": "chay", "orient": "landscape", "grid": { "cols": 1, "rows": 1 },
      "components": [
        { "file": "31-pose-chay", "vi": "Dáng chay", "spec": "a round red squirrel with a cream belly, waving",
          "skel": { "shape": "pose", "w": 0.8, "h": 0.8 } }
      ]
    },
    {
      "id": "vuong", "canvas": "square", "grid": { "cols": 2, "rows": 2 },
      "components": [
        { "file": "01-a", "vi": "A", "spec": "a button", "skel": { "shape": "pill", "w": 0.8, "h": 0.4 } },
        { "file": "02-b", "vi": "B", "spec": "a popover panel", "skel": { "shape": "rrect", "w": 0.8, "h": 0.6 } },
        { "file": "03-c", "vi": "C", "spec": "a checkbox", "skel": { "shape": "rrect", "w": 0.3, "h": 0.4 } },
        { "file": "04-d", "vi": "D", "spec": "a toggle switch", "skel": { "shape": "pill", "w": 0.5, "h": 0.3 } }
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
for j in tet-main tet-doc tet-nen tet-linh tet-chay tet-vuong; do
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
chay="$(cat "$WORK/p/prompts/tet-chay.txt")"

# ── KHỔ VUÔNG: `sheet.canvas` là field mới, và nó phải đi tới TẬN dòng đầu prompt ──
# Chủ sản phẩm hỏi "2040x2040 thì phải? codex có option đó không?". Câu trả lời đo
# được: tool `image_gen` của codex 0.149 KHÔNG có tham số `size` nào cả (đúng ba
# tham số: prompt, referenced_image_paths, num_last_images_to_include) — nó luôn trả
# ~1,57 triệu pixel và chỉ lái được TỈ LỆ bằng lời văn. 685 ảnh thật đo trên máy dev:
# 132 ảnh vuông, TẤT CẢ đều đúng 1254x1254; không một ảnh nào 1024x1024, không một
# ảnh nào 2048 hay 2040. Nên con số ta hứa với model phải là 1254 — hứa 1024 rồi
# nhận về 1254 thì mọi lượt vuông đều trông như "model làm sai".
# HAI DÒNG ĐẦU, không phải một: prompt nay mở đầu bằng tiêu đề section `## Canvas`
# và khổ giấy nằm ở dòng ngay dưới, trên cùng là `background="transparent"` — `run_one` đọc `head -n3`.
echo "── sheet.canvas = square ⇒ hai dòng đầu prompt khai đúng khổ vuông"
head_vuong="$(head -n3 "$WORK/p/prompts/tet-vuong.txt")"
expect "dòng đầu tiên là từ khoá tham số nền" 'background="transparent"' "$(head -n1 "$WORK/p/prompts/tet-vuong.txt")"
expect "mở đầu bằng tiêu đề khổ giấy" "## Canvas" "$head_vuong"
expect "dòng ngay dưới là SQUARE 1254x1254" "SQUARE 1254x1254 px, origin top-left" "$head_vuong"
vuong="$(cat "$WORK/p/prompts/tet-vuong.txt")"
expect "câu chốt cuối nói tỉ lệ 1:1" "square 1:1 PNG" "$vuong"
refute "không lẫn sang khổ ngang" "1536x1024" "$vuong"
refute "và không hứa một khổ codex không trả về" "1024x1024" "$vuong"
# `orient` đời cũ vẫn phải chạy nguyên vẹn: tấm `doc` chỉ khai `orient: portrait`.
expect "contract đời cũ chỉ có orient vẫn ra đúng khổ dọc" "PORTRAIT 1024x1536 px" "$doc"

echo "── sheet.note + sheet.directive gom vào MỘT section «Direction»"
expect "có section riêng"    "## Direction" "$main"
expect "có câu chỉ đạo riêng" "From the designer: vẽ thêm mưa xuân rơi nhẹ" "$main"
expect "ghi chú của template vẫn còn" "ghi chú của template" "$main"
refute "tấm không khai gì thì không có section đó" "## Direction" "$linh"

echo "── sheet.promptOverride = prompt của người dùng, NGUYÊN VĂN"
expect "chữ của người dùng có trong prompt" "TÔI TỰ SOẠN: vẽ một tấm bảng gỗ mộc" "$doc"
# Dòng khổ giấy là NGOẠI LỆ KỸ THUẬT: run_one đọc ngược khổ bằng `head -n1 | grep PORTRAIT`.
# Mất nó là mọi tấm dọc bị gửi đi với 1536x1024 (xem test/gen-canvas-size.test.sh).
head1="$(head -n3 "$WORK/p/prompts/tet-doc.txt")"
expect "hai dòng đầu vẫn là khổ giấy, và vẫn đúng PORTRAIT" "PORTRAIT 1024x1536 px" "$head1"
refute "KHÔNG nối thêm luật của engine (cấm chữ)"  "No letters, no digits" "$doc"
refute "KHÔNG nối thêm luật của engine (vùng an toàn)" "## Safe zone" "$doc"
refute "KHÔNG nối thêm luật của engine (art style)" "## Art style" "$doc"
expect "tấm KHÔNG override thì vẫn có đủ luật engine" "No letters, no digits" "$main"

echo "── dấu full-bleed: mối nối python → bash cho cổng alpha"
have "tấm nền có dấu" "$WORK/p/prompts/tet-nen.fullbleed"
havent "tấm UI thường KHÔNG có dấu" "$WORK/p/prompts/tet-main.fullbleed"
havent "tấm mascot KHÔNG có dấu" "$WORK/p/prompts/tet-linh.fullbleed"

echo "── dấu mồ côi phải bị dọn: prompts/ sống qua nhiều lượt"
touch "$WORK/p/prompts/tet-main.fullbleed"
( cd "$WORK/p" && PATH="$WORK/bin:$PATH" KITGEN_PROMPTS_ONLY=1 bash ./gen.sh >/dev/null 2>&1 )
havent "lượt sau xoá dấu của tấm không còn full-bleed" "$WORK/p/prompts/tet-main.fullbleed"
have "dấu của tấm nền vẫn còn" "$WORK/p/prompts/tet-nen.fullbleed"

# ═══════════════════════════════════════════════════════════════════════════════
# MỖI LOẠI TẤM MỘT BỘ LUẬT (chủ sản phẩm 09/09/2026: *"mấy cái này bị kiểu lặp sang
# chỗ khác rồi…, ví dụ gen character thì cần gì text…, nhiều chỗ đáng nhẽ phải
# prompt riêng"*).
#
# `linh` là tấm NHÂN VẬT, `main` là tấm GIAO DIỆN, và ca này soi cùng một danh sách
# trên cả hai — mỗi luật phải CÓ ở đúng một bên và KHÔNG có ở bên kia. Kiểm hai
# chiều vì dọn một chiều thì lần sau ai đó "cho chắc" là mọi thứ lại về chung một rọ,
# và không có gì đỏ.
# ═══════════════════════════════════════════════════════════════════════════════
echo "── tấm mascot KHÔNG lãnh khối chỉ dẫn viết cho nút bấm"
refute "không có luật viền của ô giao diện" "Any rim, border or edge treatment" "$linh"
expect "thay bằng luật của một dáng người" "Draw the character as ONE natural figure" "$linh"
expect "nhưng vẫn giữ vùng an toàn" "## Safe zone" "$linh"
expect "vẫn giữ nền trong suốt" "Background fully transparent" "$linh"
# ── NHỮNG THỨ CỦA TẤM GIAO DIỆN, KHÔNG ĐƯỢC BÒ SANG NHÂN VẬT ─────────────────
refute "nhân vật không lãnh section cấm chữ"        "## Text" "$linh"
refute "và không lãnh danh sách danh từ giao diện"  "No letters, no digits" "$linh"
refute "không lãnh 'lõi chức năng' của một cái nút" "functional CORE" "$linh"
refute "không lãnh luật TẦM VỚI viết cho ô kính"    "REACH, not about opaque paint" "$linh"
refute "không lãnh luật vật liệu kính/băng/nước"    "glass, ice, water" "$linh"
refute "không lãnh dòng phân vai lượng trang trí"   "Ornament amount" "$linh"
expect "độ trong của nhân vật gói trong MỘT câu" \
  "The space around the characters is simply empty: alpha 0 in the PNG, with nothing painted there." "$linh"
expect "và câu ấy nói luôn vế thân người đặc" "Each character's own body is solid all the way through." "$linh"
refute "không nhắc chữ checker để khỏi nhiễm" "checker" "$linh"
# ── VÀ CHIỀU NGƯỢC LẠI: TẤM GIAO DIỆN VẪN GIỮ ĐỦ ────────────────────────────
expect "giao diện vẫn cấm chữ"              "## Text" "$main"
expect "giao diện vẫn có lõi chức năng"     "functional CORE" "$main"
expect "giao diện vẫn có luật TẦM VỚI"      "REACH, not about opaque paint" "$main"
expect "giao diện vẫn có luật vật liệu"     "glass, ice, water" "$main"
expect "giao diện vẫn có dòng phân vai trang trí" "Ornament amount" "$main"
refute "giao diện KHÔNG lãnh luật của dáng người" "Draw the character as ONE natural figure" "$main"
refute "giao diện KHÔNG lãnh ảnh nhân vật"        "## Character reference" "$main"
refute "giao diện KHÔNG lãnh tấm ảnh dáng"        "## Pose reference" "$main"
# Tấm mascot ở đây là MỘT Ô, nên nó không có hàng xóm nào để tránh và cũng không có
# hộp ngoài nào ngoài chính khổ ảnh — luật còn lại đúng một câu: đừng chạm mép.
expect "tấm một ô: biên duy nhất là mép ảnh" "nothing touches the image edges" "$linh"
refute "và không hứa một hộp ô nào (ô CHÍNH LÀ khổ ảnh)" "stays inside x=" "$linh"
expect "tấm nút bấm thì VẪN CÓ luật viền" "Any rim, border or edge treatment" "$main"

# ═══════════════════════════════════════════════════════════════════════════════
# ẢNH THAM CHIẾU ĐI THẲNG VÀO LỜI GỌI image_gen — VÀ CHỈ KHI CÓ ẢNH THẬT
#
# ╔══ QUYẾT ĐỊNH ĐANG ĐƯỢC KHOÁ Ở ĐÂY (chủ sản phẩm, 10/09/2026) ═══════════════╗
# ║ Đính ảnh vào image_gen làm ảnh trả về mất nền trong suốt (đo 09/09/2026).    ║
# ║ Một bản đã thử đổi ảnh thành CHỮ để né; nó giữ được alpha nhưng đánh mất     ║
# ║ đúng thứ người ta tải ảnh lên để có. Chốt: CHẤP NHẬN nền đục, đính thẳng     ║
# ║ mọi ảnh, chờ codex sửa đầu nguồn. Hai chiều dưới đây khoá cả quyết định ấy   ║
# ║ lẫn ca «mô tả nhân vật CHAY»: không ảnh thì prompt tuyệt đối không được nhắc ║
# ║ tới một tấm ảnh nào — trỏ vào hư không là mời máy vẽ tự bịa ra thứ đang thiếu.║
# ╚═════════════════════════════════════════════════════════════════════════════╝
# ═══════════════════════════════════════════════════════════════════════════════
echo "── có ảnh ⇒ đính thẳng, và prompt gọi nó theo VAI TRÒ"
expect "tấm nhân vật có section ảnh"       "## Character reference" "$linh"
expect "…và câu ấy nói tới ảnh ĐÍNH KÈM"   "The attached CHARACTER REFERENCE PHOTO is the character" "$linh"
expect "danh sách ảnh kèm có ảnh nhân vật" "refs/mascot.png" "$(cat "$WORK/p/prompts/tet-linh.att")"
have "bản kê vai của tấm nhân vật" "$WORK/p/prompts/tet-linh.refs"
expect "…khai đúng vai của ảnh" "character	refs/mascot.png" "$(cat "$WORK/p/prompts/tet-linh.refs")"

echo "── mô tả nhân vật CHAY (không ảnh) ⇒ prompt không nhắc tới ảnh nào"
expect "vẫn là tấm nhân vật (luật dáng người)" "Draw the character as ONE natural figure" "$chay"
expect "chữ người dùng gõ đi thẳng vào ô" "a round red squirrel with a cream belly" "$chay"
refute "KHÔNG có section ảnh nhân vật" "## Character reference" "$chay"
refute "KHÔNG có section ảnh dáng"     "## Pose reference" "$chay"
refute "KHÔNG một câu nào trỏ vào ảnh đính kèm" "attached" "$chay"
if [ -s "$WORK/p/prompts/tet-chay.refs" ]; then
  printf 'LOI  tấm mô tả chay không được kê ảnh nào:\n%s\n' "$(cat "$WORK/p/prompts/tet-chay.refs")" >&2; fail=1
else
  printf 'ok   %s\n' "bản kê ảnh của tấm mô tả chay RỖNG"
fi
if [ -n "$(tr -d '[:space:]' < "$WORK/p/prompts/tet-chay.att")" ]; then
  printf 'LOI  tấm mô tả chay vẫn có ảnh đính kèm:\n%s\n' "$(cat "$WORK/p/prompts/tet-chay.att")" >&2; fail=1
else
  printf 'ok   %s\n' "danh sách ảnh kèm của tấm mô tả chay RỖNG"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# BỎ SKELETON — PROMPT PHẢI TỰ NÓI TOẠ ĐỘ (27/08/2026)
#
# Trước bản này hình học đi tới model bằng MỘT TẤM ẢNH: `skeleton/<sheet>.png`, vẽ
# lưới ô + bóng xám + khung safe, đính ở vị trí thứ nhất. Prompt chỉ trỏ vào nó
# ("The FIRST attached image is the geometry contract", "match the gray silhouette
# exactly"). Hai cái giá phải trả:
#   ① model BẮT CHƯỚC ảnh tham chiếu chứ không chỉ đọc nó — tấm khung xương phẳng,
#      viền cứng, nên nhân vật ra như huy hiệu có viền;
#   ② nó là nguồn hình học THỨ HAI, và nó lệch: skeleton-svg.js cộng +1px (vì `.cell`
#      có border 1px) còn slice.py thì không.
# Nay prompt in thẳng bốn con số cho từng ô, lấy từ `geometry.py` — cùng hàm slice.py
# dùng để cắt. Ca này khoá cả ba mặt: có toạ độ, không còn ảnh khung xương, không còn
# một chữ nào của đời cũ.
# ═══════════════════════════════════════════════════════════════════════════════
echo "── mỗi element mang toạ độ safe zone NGAY TRÊN DÒNG CỦA NÓ"
allp="$(cat "$WORK"/p/prompts/*.txt)"
expect "khai gốc toạ độ" "SQUARE 1254x1254 px, origin top-left" "$vuong"
expect "luật chung một câu" "fills its safe zone exactly" "$vuong"
# 3x3? Không — tấm `vuong` là 2x2 trên khổ 1254: ô 627, skel 0.8x0.4 ⇒ safe 502x251,
# lệch trong ô là (627-502)//2 = 62 và (627-251)//2 = 188. Con số phải khớp TỪNG CÁI,
# không phải "có dạng toạ độ": sai số 1px ở đây là mọi asset lệch 1px lúc cắt.
expect "ô 1 đúng số"  "1) a button — safe zone x=62..564, y=188..439 (502x251 px)" "$vuong"
expect "ô 2 đúng số"  "2) a popover panel — safe zone x=689..1191, y=125..501 (502x376 px)" "$vuong"
expect "ô 3 đúng số"  "3) a checkbox — safe zone x=219..407, y=815..1066 (188x251 px)" "$vuong"
expect "ô 4 đúng số"  "4) a toggle switch — safe zone x=783..1097, y=846..1034 (314x188 px)" "$vuong"
# Danh sách CHỈ CÓ MỘT: danh từ và toạ độ trên cùng dòng (chủ sản phẩm 27/08/2026).
refute "không có bảng toạ độ thứ hai" "Cell 1 (row 1, col 1)" "$allp"
refute "không còn tiêu đề hàng"       "Row 1, left to right" "$allp"
# Mỗi ô THẬT phải có đúng một toạ độ. Đếm bằng regex để một ô bị bỏ sót là đỏ ngay.
n_zone=$(printf '%s' "$vuong" | grep -cE '^[0-9]+\) .* — safe zone x=[0-9]+\.\.[0-9]+, y=[0-9]+\.\.[0-9]+ \([0-9]+x[0-9]+ px\)')
eq_n() { if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"; else printf 'LOI  %s (mong %s, thực %s)\n' "$1" "$2" "$3" >&2; fail=1; fi; }
eq_n "tấm 2x2 có đủ 4 dòng toạ độ" 4 "$n_zone"
# ── HỘP Ô LÀ GIỚI HẠN NGOÀI (09/2026) ──────────────────────────────────────────
# Safe zone nói lõi to bằng nào; nó KHÔNG nói phần tràn đi tới đâu. `slice.py` cắt
# theo hộp Ô, nên viền/trang trí vượt mép ô là bị chém cụt — đo trên dự án thật:
# overflowPx bên phải 69 và 77, chạm khít mép ô. Nay mỗi dòng nói luôn hộp ngoài.
expect "ô 1 kèm hộp ô làm giới hạn ngoài" \
  "(502x251 px); everything of this element, rim and ornaments included, stays inside x=0..627, y=0..627" "$vuong"
expect "ô 4 (hàng dưới, cột phải) mang đúng hộp ô của nó" \
  "stays inside x=627..1254, y=627..1254" "$vuong"
n_cell=$(printf '%s' "$vuong" | grep -cE 'stays inside x=[0-9]+\.\.[0-9]+, y=[0-9]+\.\.[0-9]+$')
eq_n "cả 4 ô đều có hộp ngoài" 4 "$n_cell"
expect "và section Layout gọi tên hộp ấy" "the cell box around its safe zone" "$vuong"
expect "luật vùng an toàn nói phần tràn DỪNG trong ô" "come to rest inside it" "$vuong"
# Tấm nền MỘT Ô đi hẳn một nhánh khác (chủ sản phẩm 07/09/2026: "prompt dài quá,
# gen full khung mobile luôn"): nó không phải sprite sheet nên không có lưới, không
# có hộp cắt, không có luật nền trong suốt — chỉ còn khổ giấy, phong cách, một câu
# kỹ thuật và cảnh muốn vẽ. Tấm mascot thì vẫn CÓ safe zone.
nen="$(cat "$WORK/p/prompts/tet-nen.txt")"
refute "tấm nền không hứa khung cắt nào" "safe zone x=" "$nen"
refute "tấm nền không lãnh lưới của sprite sheet" "STRICT grid" "$nen"
refute "tấm nền không bị đòi nền trong suốt" "FULLY TRANSPARENT" "$nen"
expect "tấm nền nói rõ là phủ kín khung" "filling the whole frame edge to edge" "$nen"
expect "và vẫn mang đúng cảnh người dùng gõ" "village scene at dawn" "$nen"
expect "tấm mascot 1x1 ⇒ safe zone bằng 0.8x0.8 của cả canvas" \
  "1) mascot waving — safe zone x=153..1382, y=102..921 (1229x819 px)" "$linh"

echo "── KHÔNG còn một dấu vết nào của khung xương trong thứ gửi đi"
for bad in "skeleton" "silhouette" "FIRST attached image" "gray silhouette" "guide box" "grid lines" "attached image is the geometry"; do
  refute "prompt sạch: $bad" "$bad" "$allp"
done
for j in tet-main tet-doc tet-nen tet-linh tet-chay tet-vuong; do
  refute ".att của $j không còn ảnh khung xương" "skeleton/" "$(cat "$WORK/p/prompts/$j.att")"
done
havent "và engine KHÔNG tạo thư mục skeleton/ nữa" "$WORK/p/skeleton"

# ═══════════════════════════════════════════════════════════════════════════════
# PROMPT KHÔNG ĐƯỢC NHIỄM (chủ sản phẩm 26/08/2026: "nhìn prompt lỗi này v16???",
# "dễ bị nhiễm prompt lắm — audit lại toàn bộ prompt đi").
#
# BA HỌ CHỮ BỊ CẤM, và mỗi họ có một lý do riêng — đừng gộp lại thành "prompt phải
# gọn". Chúng khác nhau ở chỗ ai là người phải trả giá:
#
#  ① NHÃN PHIÊN BẢN NỘI BỘ ("V16 GUIDE CONTRACT", "the nine-element v14+ layout").
#     Model không có cách nào biết V16 là gì, nên nó thuần tuý là nhiễu token; còn
#     người mở tab Prompt ra đọc thì kết luận engine đang hỏng. Đúng câu chủ sản
#     phẩm đã nói khi nhìn thấy nó.
#  ② DANH TỪ TRANG TRÍ CỨNG ("flowers, ribbons, tassels, jewels, filigree").
#     Bản cũ nhét nguyên câu này vào MỌI element của MỌI tấm, bất kể phong cách.
#     Với ref là tranh mực hoạ phẳng thì đó là lệnh vẽ thêm hoa và tua rua vào một
#     bộ UI không hề có chúng — engine ra lệnh thẩm mỹ, đúng thứ chỉ người dùng
#     mới được quyết.
#  ③ KHUNG NGỮ CẢNH CỨNG ("a mobile mini-game marketing campaign"). Một thể loại +
#     một kênh phát hành + một mục đích thương mại, đóng đinh cho mọi dự án.
#
# Quét trên PROMPT ĐÃ DỰNG, không quét mã nguồn: chú thích trong gen.sh còn trích
# lại nguyên văn mấy câu này để đời sau biết vì sao chúng bị bỏ, và đó là chuyện
# tốt. Thứ phải sạch là cái ĐI RA khỏi engine.
# ═══════════════════════════════════════════════════════════════════════════════
echo "── prompt gửi model KHÔNG được nhiễm (nhãn phiên bản / trang trí cứng / ngữ cảnh cứng)"
for bad in "V16" "V14" "v14+" "v16" "nine-element"; do
  refute "không còn nhãn phiên bản nội bộ: $bad" "$bad" "$allp"
done
# grep -E vì đây là HỌ chữ, không phải một chuỗi: "V15", "v17" của mai sau cũng
# phải đỏ ngay, không đợi ai nhớ ra mà thêm vào danh sách trên.
if printf '%s' "$allp" | grep -qiE '\bv1[0-9]\b'; then
  printf 'LOI  prompt còn nhãn phiên bản dạng V1x:\n%s\n' \
    "$(printf '%s' "$allp" | grep -inE '\bv1[0-9]\b' | head -5)" >&2; fail=1
else
  printf 'ok   %s\n' "không còn bất kỳ nhãn V1x nào (quét bằng biểu thức, không bằng danh sách)"
fi
for bad in "flowers" "ribbons" "tassels" "jewels" "filigree"; do
  refute "không còn danh từ trang trí cứng: $bad" "$bad" "$allp"
done
for bad in "marketing" "mini-game" "campaign"; do
  refute "không còn khung ngữ cảnh cứng: $bad" "$bad" "$allp"
done
# "enamel" là một CHẤT LIỆU (men sứ) và nó từng nằm trong câu chỉ nói về đo đạc
# hình học ("The continuous enamel/content surface is the CORE") — di chứng của
# đời prompt kẹo bóng, không ai để ý vì nó núp trong một câu kỹ thuật.
refute "không còn chất liệu lọt vào câu hình học" "enamel" "$allp"

echo "── PHONG CÁCH TỔNG phải đứng ĐẦU, không phải cuối"
# Chủ sản phẩm: "phải copy cả prompt của phong cách, có prompt tổng". Đứng đầu là
# yêu cầu về ĐỌC (mở prompt ra thấy ngay chữ của mình), và nó chỉ an toàn được vì
# dòng đánh số ở dưới nay chỉ còn DANH TỪ — không còn mô tả vật liệu nào cạnh tranh.
expect "có section Art style" "## Art style" "$main"
expect "có nguyên văn câu phong cách của người dùng" "flat vector, red and gold." "$main"
style_ln="$(grep -n '^## Art style' "$WORK/p/prompts/tet-main.txt" | head -n1 | cut -d: -f1)"
# Neo cũ là dòng "Row 1, left to right:" — đã bỏ cùng khung xương (toạ độ tuyệt đối
# nói vị trí chính xác hơn tiêu đề hàng). Neo mới: dòng đánh số ĐẦU TIÊN có toạ độ.
list_ln="$(grep -nE '^1\) .* — safe zone x=' "$WORK/p/prompts/tet-main.txt" | head -n1 | cut -d: -f1)"
if [ -n "$style_ln" ] && [ -n "$list_ln" ] && [ "$style_ln" -lt "$list_ln" ]; then
  printf 'ok   %s (dòng %s < dòng %s)\n' "phong cách đứng TRƯỚC danh sách ô" "$style_ln" "$list_ln"
else
  printf 'LOI  phong cách phải đứng trước danh sách ô (style=%s, list=%s)\n' "$style_ln" "$list_ln" >&2; fail=1
fi
if [ -n "$style_ln" ] && [ "$style_ln" -le 12 ]; then
  printf 'ok   %s (dòng %s)\n' "và đứng ngay đầu prompt, không phải lưng chừng" "$style_ln"
else
  printf 'LOI  khối phong cách bị đẩy xuống dòng %s — phải nằm trong 12 dòng đầu\n' "$style_ln" >&2; fail=1
fi

echo "── không có cờ thì codex PHẢI bị gọi (chứng minh chính cái cờ là thứ chặn)"
: > "$CALLS"
( cd "$WORK/p" && PATH="$WORK/bin:$PATH" bash ./gen.sh >/dev/null 2>&1 )
if [ -s "$CALLS" ]; then printf 'ok   %s\n' "chạy thường vẫn gọi codex như cũ"
else printf 'LOI  chạy KHÔNG có cờ mà codex cũng không được gọi — cờ đã chặn nhầm đường thường\n' >&2; fail=1; fi

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao có chế độ này." >&2; exit 1; }
echo "OK  gen.sh: KITGEN_PROMPTS_ONLY dựng đủ prompt và không tiêu một đồng quota nào"
