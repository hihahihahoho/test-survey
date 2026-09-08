#!/usr/bin/env bash
# Sinh sprite sheet UI kit bằng codex CLI image-gen: mỗi (style × sheet) một con codex,
# tất cả chạy song song. Contract nằm trọn trong styles.json.
set -uo pipefail

# mtime epoch đa nền. GNU PHẢI đứng trước: `stat -c` trên BSD fail sạch (chỉ stderr),
# còn `stat -f %m` trên GNU coi %m là TÊN FILE ⇒ in khối verbose "File: ..." ra stdout
# rồi mới exit lỗi ⇒ fallback nối thêm số vào sau ⇒ chuỗi nhiều dòng lọt vào [[ -lt ]].
mtime_epoch(){ stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
# Băm nội dung file. macOS có `shasum`, Linux/Git-Bash có `sha256sum` — thử cả hai, y
# như lối phòng thân của mtime_epoch. File không tồn tại ⇒ chuỗi rỗng (KHÁC mọi băm
# thật, nên "chưa có ảnh" không bao giờ bị nhầm là "ảnh không đổi").
file_hash(){
  [ -f "$1" ] || { printf ''; return 0; }
  { shasum -a 256 "$1" 2>/dev/null || sha256sum "$1" 2>/dev/null; } | cut -d' ' -f1
}

# ── ẢNH VỪA SINH PHẢI LÀ RGBA VỚI ALPHA THẬT — KIỂM NGAY, KHÔNG ĐỢI TỚI LÚC CẮT ──
#
# ╔══ VÌ SAO PHẢI KIỂM Ở ĐÂY ═════════════════════════════════════════════════════╗
# ║ Từ khi bỏ HẲN đường tách nền, hợp đồng chỉ còn đúng một câu: `image_gen` trả  ║
# ║ về PNG RGBA có nền trong suốt thật. Prompt đã XIN điều đó — nhưng xin không   ║
# ║ phải là kiểm. Trước bản này lời phán duy nhất ở đây là "file có đổi byte       ║
# ║ không", nên một sheet đục hoàn toàn vẫn được đóng dấu OK, và chỗ duy nhất phát ║
# ║ hiện ra là `slice.py` — tức SAU khi đã tiêu xong quota của cả lượt.            ║
# ╚═══════════════════════════════════════════════════════════════════════════════╝
#
# BA PHÉP, phép thứ ba mới là phép đắt giá:
#   ① có kênh alpha không (mode phải là RGBA/LA — không thì hợp đồng đã vỡ);
#   ② có chỗ nào alpha = 0 thật không (model vẽ đè kín nền là ca đã gặp);
#   ③ DẢI MỜ — tỷ lệ pixel có 0 < alpha < 255. Đây là DẤU VÂN TAY:
#        · alpha do image_gen vẽ ra  → dải mờ liên tục, đo thật: 29–35%
#        · alpha do một script tách  → CHỈ CÓ 0 và 255, dải mờ 0,00%
#      Ngày 22/08/2026 đo 10 sheet raw của một lượt thật: 9/10 có dải mờ 0,00% và
#      viền trắng răng cưa — vì model KHÔNG tạo nổi nền trong suốt nên nó tự viết
#      rồi biên dịch một công cụ riêng (`.tmp_remove_checker.swift`, CoreGraphics
#      `setBlendMode(.clear)`) để xoá nền hộ. Đúng thứ vừa bị bỏ khỏi kit-gen, quay
#      lại bằng cửa sau. Ngưỡng 0,5% để rất xa cả hai đầu.
#
# KHÔNG DÒ ĐƯỢC THÌ KHÔNG PHÁN. Thiếu Pillow ⇒ in cảnh báo rồi cho qua: chặn một
# lượt gen vì phép kiểm không chạy nổi là đổi một lỗi thật lấy một lỗi tự gây.
#
# ⚠️ BA PHÉP TRÊN CHỈ ĐÚNG VỚI SHEET CÓ NỀN. Với sheet FULL-BLEED thì chính prompt
# ra lệnh ngược lại: dòng 488 viết "NOT ONE PIXEL of empty transparent background
# may show around a scene". Model làm ĐÚNG hợp đồng ⇒ alpha=0 chiếm 0,00% ⇒ phép ②
# đóng dấu FAIL "model vẽ đè kín nền", và phép ③ cũng FAIL vì cảnh đục kín thì
# không có dải mờ nào. Tức engine tự phạt chính thứ nó vừa yêu cầu — mọi sheet nền
# đều đỏ oan, và người dùng đọc được một lời buộc tội sai hẳn nguyên nhân.
# Nên tham số thứ hai ("1" = job full-bleed, do khối python đánh dấu bằng file
# `prompts/<job>.fullbleed`) LẬT NGƯỢC phép kiểm: full-bleed mà TRONG SUỐT NHIỀU
# mới là hỏng (cảnh bị vẽ thụt vào, chừa khung rỗng quanh 4 cạnh — đúng triệu
# chứng viền key 40-55px của BlindTest-B2), còn 0% trong suốt là ĐẠT.
PY_CHECK="${KITGEN_PYTHON:-python3}"
alpha_verdict(){
  "$PY_CHECK" - "$1" "${2:-0}" <<'PYA' 2>/dev/null || echo "skip không chạy được phép kiểm alpha"
import sys
try:
    from PIL import Image
except Exception:
    print("skip thiếu Pillow — bỏ qua phép kiểm alpha"); raise SystemExit
full_bleed = len(sys.argv) > 2 and sys.argv[2] == "1"
# Ngưỡng của nhánh full-bleed. Không lấy 0% làm chuẩn: khe 24px giữa các cảnh kề
# nhau là hợp lệ (prompt cho phép), và một sheet 3 cảnh có khe như thế mới chỉ
# quanh 1-2%. 10% thì chỉ có thể là cảnh bị thu nhỏ, chừa khung rỗng.
FULL_BLEED_MAX_TRONG = 0.10
im = Image.open(sys.argv[1])
if "A" not in im.getbands():
    if full_bleed:
        # Sheet phủ kín thì kênh alpha chẳng để làm gì — RGB đục là đúng hợp đồng.
        print("ok full-bleed, ảnh đục hoàn toàn (mode=%s) — đúng yêu cầu phủ kín" % im.mode)
    else:
        print("bad KHÔNG có kênh alpha (mode=%s). image_gen phải trả PNG RGBA — "
              "đường tách nền đã bỏ nên không có gì cứu được ảnh này." % im.mode)
    raise SystemExit
h = Image.open(sys.argv[1]).convert("RGBA").getchannel("A").histogram()
n = float(sum(h)) or 1.0
trong, mo = h[0] / n, sum(h[1:255]) / n
if full_bleed:
    if trong > FULL_BLEED_MAX_TRONG:
        print("bad sheet nền phải phủ KÍN ô mà %.0f%% pixel lại trong suốt — cảnh bị vẽ "
              "thụt vào, chừa khung rỗng quanh cạnh. Sinh lại." % (trong * 100))
    else:
        print("ok full-bleed, trong suốt %.0f%% (phủ kín, đúng hợp đồng)" % (trong * 100))
    raise SystemExit
if trong < 0.02:
    print("bad có kênh alpha nhưng gần như không chỗ nào trong suốt "
          "(alpha=0 chỉ %.2f%%) — model vẽ đè kín nền." % (trong * 100)); raise SystemExit
if mo < 0.005:
    print("bad alpha CHỈ CÓ 0 và 255 (dải mờ %.3f%%). Đó là dấu vân tay của một phép "
          "TÁCH NỀN bằng script, không phải alpha do image_gen vẽ — nhiều khả năng "
          "model đã tự viết công cụ xoá nền. Sinh lại." % (mo * 100)); raise SystemExit
print("ok trong suốt %.0f%%, dải mờ %.0f%%" % (trong * 100, mo * 100))
PYA
}

cd "$(dirname "$0")"
ROOT="$(pwd)"
# ĐƯỜNG DẪN ĐƯA VÀO NỘI DUNG PROMPT phải là dạng Windows khi chạy trên Git-Bash.
# Đối số truyền cho binary Windows thì MSYS tự đổi `/c/…` → `C:\…`, nhưng đường
# dẫn nằm BÊN TRONG chuỗi văn bản thì không — model nhận `/c/Users/…`, Windows
# hiểu `/` là gốc ổ đĩa hiện tại ⇒ ảnh ghi vào `C:\c\Users\…` ⇒ job FAIL.
# `cygpath` chỉ có trên MSYS/Cygwin nên macOS/Linux giữ nguyên ROOT_OUT == ROOT.
# Dùng `-m` (C:/… gạch xuôi) chứ không `-w` (C:\…): gạch ngược trong prompt dễ
# bị model/JSON hiểu thành ký tự escape.
ROOT_OUT="$ROOT"
command -v cygpath >/dev/null 2>&1 && ROOT_OUT="$(cygpath -m "$ROOT")"
mkdir -p raw logs prompts

# Mặc định dùng cấu hình Codex hiện tại. IMG_HOME chỉ được đặt khi user chủ động
# chọn profile riêng trong installer.
IMG_HOME="${IMG_HOME:-}"
MAXJOBS="${MAXJOBS:-4}"

# ── XEM PROMPT MÀ KHÔNG VẼ (KITGEN_PROMPTS_ONLY=1) ────────────────────────────
# Prompt gửi cho model được LẮP TRONG CHÍNH FILE NÀY, nên trước bản này cách duy
# nhất để đọc nó là… chạy một lượt gen thật và trả tiền cho nó. Đúng thứ tự ngược:
# người ta muốn soi câu chữ TRƯỚC khi tiêu quota, nhất là khi vừa sửa mô tả sheet.
# Chế độ này chạy đủ bước rẻ và tất định — khối python lắp prompt (kể cả toạ độ) —
# rồi DỪNG ngay trước vòng gọi codex. Không mạng, không quota, không đụng raw/.
# Nó cũng là đường mà agent dùng cho `POST /api/projects/:id/prompt-preview`.
PROMPTS_ONLY="${KITGEN_PROMPTS_ONLY:-}"

# ── MODEL CHO LƯỢT SINH ẢNH ───────────────────────────────────────────────────
# Việc của model ở đây RẤT NHẸ: đọc prompt, gọi tool tạo ảnh, ghi file ra đúng chỗ.
# Không có gì để suy luận sâu, nên mặc định đi model rẻ và nhanh: gpt-5.6-luna
# ("Fast and affordable agentic coding model", reasoning mặc định medium).
#
# PHẢI ĐẶT CẢ EFFORT, không chỉ model: `model_reasoning_effort` trong config.toml của
# người dùng vẫn áp lên bất kỳ model nào. Máy chủ sản phẩm đang để "xhigh" — nghĩ ở mức
# cao nhất cho một việc mà nghĩ nhiều không làm ảnh đẹp hơn (ảnh do tool vẽ), tức là
# đốt token không đổi lấy gì.
#
# Gõ rỗng để TẮT hẳn, trả về đúng hành vi cũ (dùng model/effort của hồ sơ):
#   KITGEN_GEN_MODEL="" ./gen.sh
# ⚠️ KHỐI DƯỚI (từ `GEN_MODEL=` tới `fi`) ĐƯỢC TRÍCH NGUYÊN VĂN ra chạy độc lập bởi
# test/gen-fake-ok.test.sh và test/gen-canvas-size.test.sh (`sed` theo đúng hai mốc
# đó). Vì vậy nó KHÔNG được phụ thuộc vào biến nào mà chính nó không đặt — dạng
# `${TÊN:-}` là bắt buộc, không thì snippet chết ngay vì `set -u`, và ca test chết
# theo với một lời báo lỗi chẳng liên quan gì tới thứ nó đang đo.
#
# Cổng model và cổng đăng nhập ngay dưới đều HỎI CODEX. Ở chế độ xem trước prompt thì
# codex không được gọi lần nào — máy chưa cài/chưa đăng nhập vẫn phải xem được prompt,
# nếu không thì đúng lúc cần chẩn đoán nhất lại là lúc không xem được gì.
GEN_MODEL="${KITGEN_GEN_MODEL-gpt-5.6-luna}"
GEN_EFFORT="${KITGEN_GEN_EFFORT-medium}"
MODEL_ARGS=()
if [[ -z "${PROMPTS_ONLY:-}" && -n "$GEN_MODEL" ]]; then
  # Catalog TĨNH, nằm sẵn trên máy (đo: 0,03 giây, không gọi mạng). Nó chỉ chứng minh
  # bản codex này BIẾT tên model — KHÔNG chứng minh provider của người dùng chịu phục vụ
  # model đó. Ai trỏ codex sang provider tuỳ biến thì tên có trong catalog mà gọi vẫn bị
  # từ chối. Nên đây chỉ là cửa RẺ; cửa thật là nhánh tự chữa trong run_one.
  # SOI ĐÚNG HOME sẽ gen (bug cũ: IMG_HOME đặt mà cổng này vẫn hỏi home mặc định
  # ⇒ MODEL_ARGS rỗng ⇒ âm thầm rơi về model/mức nghĩ của hồ sơ).
  model_gate_env=()
  [[ -n "$IMG_HOME" ]] && model_gate_env=(env CODEX_HOME="$IMG_HOME")
  if ${model_gate_env[@]+"${model_gate_env[@]}"} codex debug models 2>/dev/null | grep -q "\"$GEN_MODEL\""; then
    MODEL_ARGS=(-m "$GEN_MODEL")
    [[ -n "$GEN_EFFORT" ]] && MODEL_ARGS+=(-c "model_reasoning_effort=\"$GEN_EFFORT\"")
  else
    echo "codex không biết model '$GEN_MODEL' — dùng model mặc định của hồ sơ."
  fi
fi
if [[ -z "$PROMPTS_ONLY" && -n "$IMG_HOME" && ! -f "$IMG_HOME/auth.json" ]]; then
  echo "FATAL: profile Codex riêng chưa đăng nhập. Chạy: CODEX_HOME=$IMG_HOME codex login"; exit 1
fi

# ╔══ KHÔNG CÒN KHUNG XƯƠNG — VÀ ĐÂY LÀ CHỖ NÓ TỪNG ĐỨNG ═════════════════════════╗
# ║ Trước 27/08/2026 ở ngay đây có `node render-skeleton.mjs`: nó dựng một tấm PNG ║
# ║ vẽ lưới ô + bóng xám + khung safe, rồi đính tấm đó làm ẢNH THAM CHIẾU THỨ NHẤT ║
# ║ cho model. Cả prompt xây quanh nó ("The FIRST attached image is the geometry   ║
# ║ contract", "match the gray silhouette exactly"…).                              ║
# ║                                                                                ║
# ║ VÌ SAO BỎ:                                                                     ║
# ║  ① Model bắt chước ảnh tham chiếu chứ không chỉ đọc nó. Ảnh khung xương là     ║
# ║     hình phẳng, viền cứng, nền đặc-hay-không cũng vẫn là một tấm ĐỒ HOẠ — nên  ║
# ║     nó lái luôn cả phong cách: nhân vật ra như huy hiệu có viền, dáng cứng đơ. ║
# ║  ② Nó là nguồn hình học THỨ HAI. skeleton-svg.js cộng +1px (vì `.cell` có      ║
# ║     border 1px) còn slice.py thì không ⇒ khung ta ĐƯA và khung ta CẮT lệch     ║
# ║     nhau, lặng lẽ, ở mọi ô.                                                    ║
# ║  ③ Nó bắt cả sản phẩm phụ thuộc @resvg/resvg-wasm chỉ để nói một điều mà chữ   ║
# ║     nói được rẻ hơn và chính xác hơn: BỐN CON SỐ.                              ║
# ║                                                                                ║
# ║ Thay thế: khối python dưới đây in thẳng toạ độ safe zone của từng ô vào prompt,║
# ║ lấy từ `geometry.py` — CÙNG hàm mà `slice.py` dùng để cắt. Hứa và cắt nay là   ║
# ║ một phép tính, không phải hai.                                                 ║
# ║ Ảnh tham chiếu của NGƯỜI DÙNG (mascot ref, brand, inspo) KHÔNG đổi gì.         ║
# ╚════════════════════════════════════════════════════════════════════════════════╝

# Build prompt cho từng (style, sheet) → prompts/<style>-<sheet>.txt
python3 - <<'PY'
import json, os, sys
# `python3 - <<PY` chạy từ stdin ⇒ sys.path[0] là "" (cwd). gen.sh đã `cd` về thư
# mục chứa chính nó ở dòng 5, và agent COPY cả engine vào project, nên geometry.py
# luôn nằm ngay cạnh. Chèn cwd tường minh để không phụ thuộc mặc định của python.
sys.path.insert(0, os.getcwd())
import geometry
cfg = json.load(open("styles.json", encoding="utf-8"))

# ╔══ PROMPT ĐƯỢC LẮP THEO LỐI COMPOSITION ════════════════════════════════════╗
# ║ Bốn khối, đúng bốn nguồn sự thật, không khối nào lấn sân khối khác:        ║
# ║   ① PHONG CÁCH TỔNG — style + bảng màu + ảnh ref của người dùng. ĐỨNG ĐẦU. ║
# ║      Đây là nơi DUY NHẤT nói một thứ TRÔNG THẾ NÀO.                        ║
# ║   ② HÌNH HỌC — canvas, lưới, và TOẠ ĐỘ safe zone của từng ô. Thuần kỹ      ║
# ║      thuật, không một tính từ thẩm mỹ nào, không một ảnh nào.              ║
# ║   ③ RÀNG BUỘC KỸ THUẬT — nền alpha thật (tả điều muốn, không gọi tên      ║
# ║      caro), cấm chữ, cấm tràn ô.                                          ║
# ║   ④ DANH SÁCH Ô — mỗi ô là một DANH TỪ (+ trạng thái người dùng chọn).     ║
# ║                                                                            ║
# ║ VÌ SAO PHẢI DỌN (chủ sản phẩm 26/08/2026: "dễ bị nhiễm prompt lắm"):       ║
# ║   · nhãn phiên bản nội bộ ("V16 GUIDE CONTRACT", "the nine-element v14+    ║
# ║     layout") lọt thẳng vào prompt gửi model — model không có cách nào biết ║
# ║     V16 là gì, nên nó chỉ là nhiễu, và nó làm người đọc prompt tưởng engine║
# ║     đang hỏng;                                                             ║
# ║   · danh sách trang trí CỨNG ("flowers, ribbons, tassels, jewels, sparkles ║
# ║     and filigree") nhét vào MỌI element bất kể phong cách — đó là ra lệnh  ║
# ║     thẩm mỹ từ engine, đúng thứ phải đến từ style của người dùng;          ║
# ║   · khung ngữ cảnh cứng ("a mobile mini-game marketing campaign") đóng đinh║
# ║     thể loại cho mọi dự án.                                                ║
# ║ Luật thay thế: engine chỉ được nói HÌNH HỌC và RÀNG BUỘC KỸ THUẬT. Mọi câu ║
# ║ nói về vật liệu/màu/độ bóng/trang trí phải bắt nguồn từ chữ của người dùng.║
# ╚════════════════════════════════════════════════════════════════════════════╝

# ── BẢNG KHỔ CANVAS + TOẠ ĐỘ Ô: ĐÃ DỜI SANG `geometry.py` ────────────────────
# Trước bản này khổ ảnh được suy ra ĐỘC LẬP ở bốn chỗ, mỗi chỗ một dòng
# `orient == "portrait" ? … : …`:
#   ① khối python này (dòng "Canvas orientation: …"),
#   ② `run_one` ở tầng bash (`want_size`),
#   ③ `skeleton-svg.js:sheetSize` (khổ ảnh khung xương),
#   ④ `slice.py:orientation_error` (khổ mong đợi lúc cắt).
# Nay ③ đã chết cùng khung xương, còn ① và ④ import CHUNG `geometry.py`. ② vẫn
# đọc ngược từ chính dòng đầu prompt nên không thể lệch.
#
# Và từ bản này bảng khổ không phải thứ duy nhất phải dùng chung: TOẠ ĐỘ SAFE ZONE
# của từng ô cũng vậy. Prompt in ra bốn con số, `slice.py` cắt theo bốn con số —
# nếu hai bên tự tính thì lời hứa và nhát cắt lệch nhau mà không ai thấy.
canvas_of = geometry.canvas_of


# ── VÌ SAO Ở ĐÂY KHÔNG CÒN BỘ MÁY GẶM CHỮ VẬT LIỆU ───────────────────────────
# Từng có ~250 dòng ở đúng chỗ này: MATERIAL_WORDS / FINISH_WORDS / COLOUR_WORDS,
# `strip_finish()` xoá chữ bề mặt + màu khỏi spec, `preset_words()` nêu đích danh
# rồi hạ cấp, `COLOUR_ROLE` dịch gold/silver/bronze sang "rank 1/2/3".
#
# Toàn bộ bộ máy đó tồn tại vì MỘT lý do: spec trong element-lib.json là mô tả
# VẬT LIỆU CỨNG ("glossy 3D candy-red capsule button…"), tức thư viện tự ra lệnh
# thẩm mỹ, và engine phải đi gỡ mồi do chính nó gieo.
#
# Nay spec của thư viện chỉ còn DANH TỪ ("the primary action button", "a popover
# panel", "a background panel"). Không còn preset để mà hạ cấp — nên bộ máy này
# vừa thừa vừa NGUY HIỂM: chữ vật liệu còn sót lại trong một spec bây giờ là chữ
# NGƯỜI DÙNG tự chọn (khu soạn prompt cho chọn vật liệu theo từng ô), và xoá lựa
# chọn của người dùng là một lỗi, không phải một phép dọn.
#
# Thứ thay thế nó là MỘT CÂU nói về THỨ HẠNG, ngay trên danh sách ô: khối phong
# cách quyết diện mạo, dòng đánh số chỉ nói ô đó LÀ CÁI GÌ. Engine tuyên bố ai
# thắng ai; engine không viết lại chữ của ai cả.
#
# ── CHỈ CÒN ĐÚNG MỘT ĐƯỜNG NỀN: ALPHA THẬT ────────────────────────────────────
# Bảng màu nền giả-trong-suốt (và cả tầng tách theo nó) đã bỏ — image_gen của codex
# 0.149 trả RGBA thật, nên prompt xin thẳng nền trong suốt. Chỉ còn một đường nghĩa
# là nó phải được KIỂM, không chỉ được XIN (xem `alpha_verdict` ở đầu file).

for s in cfg["styles"]:
    for sh in cfg["sheets"]:
        if sh.get("styles") and s["id"] not in sh["styles"]:
            continue                      # sheet riêng của style khác (vd pose-<char>)
        cols, rows = sh["grid"]["cols"], sh["grid"]["rows"]
        comps = sh["components"]
        assert len(comps) == cols * rows, f'{sh["id"]}: {len(comps)} component ≠ lưới {cols}x{rows}'
        real = [c for c in comps if c["skel"].get("shape") != "empty"]
        n_real = len(real)
        canvas_w, canvas_h, canvas_header, canvas_ratio = canvas_of(sh)
        # HÌNH HỌC CỦA CẢ TẤM, tính MỘT LẦN, bằng ĐÚNG hàm `slice.py` dùng để cắt.
        # `geo[i]["safe"]` là bốn con số sẽ đi vào prompt; `geo[i]["cell"]` chỉ dùng
        # nội bộ (dao cắt) — chủ sản phẩm chốt KHÔNG in hộp ô vào prompt vì nó không
        # thêm được gì mà lại dài gấp đôi danh sách.
        geo = geometry.sheet_geometry(sh)
        # ⚠️ SHEET FULL-BLEED NHẬN DIỆN THEO skel.shape, KHÔNG theo id sheet.
        # Bản cũ: `if sh["id"] != "bg"`. Nhưng id sheet do NGƯỜI DÙNG/agent đặt —
        # dự án thật đặt "nen", "background", "bg-scene"… nên nhánh full-bleed gần
        # như KHÔNG BAO GIỜ chạy, và sheet nền lãnh đúng câu dành cho ô UI:
        # "keeping at least 40px of empty background padding on every side" ⇒ cảnh
        # nền bị vẽ THỤT VÀO, chừa nguyên khung rỗng quanh 4 cạnh; slice.py cắt ô
        # full-bleed KHÔNG key gì cả nên viền đó đi thẳng vào asset (đã dính: viền
        # magenta 40-55px quanh 25-bg-home ở lần gen thứ hai của BlindTest-B2).
        full_bleed = n_real > 0 and all(c["skel"].get("shape") == "full" for c in real)
        # MỘT Ô FULL-BLEED = MỘT MÀN HÌNH, không phải một sprite sheet 1x1. Tách hẳn
        # vị từ này ra khỏi `full_bleed` vì tấm NHIỀU ô full-bleed (bộ nhiều cảnh trên
        # một canvas) vẫn cần lưới, vẫn cần biết ranh giới ô — nó chỉ giống tấm nền ở
        # chỗ không có pixel rỗng. Nhập hai ca lại là mất một trong hai.
        screen_sheet = full_bleed and len(comps) == 1
        # ⚠️ SHEET MASCOT KHÔNG CÒN NHẬN DIỆN BẰNG MỖI `sh["ref"]`.
        # Bản cũ: `mascot_sheet = bool(sh.get("ref"))` — có ảnh nhân vật thì cả tấm
        # là nhân vật. Vị từ ấy sai theo CẢ HAI CHIỀU kể từ khi thẻ Nhân vật ra
        # sprite sheet: một tấm dáng mà người dùng CHƯA tải ảnh nhân vật lên (tả
        # bằng chữ, đúng ca `subject = "the same original mascot character"` bên
        # webapp) sẽ rơi vào nhánh UI — nhận khối cấu tạo ba lớp "core / rim /
        # decoration" và bị vẽ như một món đồ giao diện.
        # Tín hiệu THẬT nằm ngay trong ô: `skel.shape == "pose"` là thứ `slice.py`
        # đã đọc từ lâu để cắt ô dáng (`slice.py:839`), nên nó có sẵn trong contract
        # và không phải bịa thêm field. `poseRef` (tấm manơcanh ghép) cũng đủ để
        # kết luận, và `ref` vẫn giữ cho contract đời cũ chỉ có một ô dáng.
        pose_cells = any(c["skel"].get("shape") == "pose" for c in real)
        mascot_sheet = bool(sh.get("ref")) or bool(sh.get("poseRef")) or pose_cells

        b = s.get("brand") or {}
        use_brand_refs = bool(b.get("refs"))
        # ⚠️ ẢNH PHONG CÁCH ĐÃ TẢI LÊN THÌ PHẢI ĐƯỢC DÙNG.
        # Bản cũ: `use_inspo = styleMode == "inspo" and inspo`. Nhưng không còn màn
        # nào đặt `styleMode = "inspo"` ⇒ `use_inspo` LUÔN sai ⇒ ảnh phong cách không
        # bao giờ được đính, và mô tả vật liệu mặc định của từng ô là thứ DUY NHẤT
        # dẫn dắt style. Nay: có ảnh phong cách = dùng ảnh phong cách.
        use_inspo = bool(s.get("inspo"))

        # ═══════════════════════════════════════════════════════════════════
        #  PROMPT = MỘT LOẠT SECTION MARKDOWN, MỖI LUẬT NÓI ĐÚNG MỘT LẦN
        # ═══════════════════════════════════════════════════════════════════
        # ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 07/09/2026) ══════════════════════════════╗
        # ║ Dán nguyên văn prompt một tấm Bộ UI ba element — 95 dòng — rồi nói:    ║
        # ║ *"tôi đổi style khác nó lại nhồi cái đoạn style lên đầu à… đáng nhẽ    ║
        # ║ nên chia thành section ## Art style… bạn audit lại toàn bộ khung       ║
        # ║ prompt đi, khá dài dòng và không chuẩn"*.                              ║
        # ╚═══════════════════════════════════════════════════════════════════════╝
        # Đo lại chính tấm ấy thì lời phàn nàn có căn cứ đo được, không phải cảm
        # tính: luật VÙNG AN TOÀN được nói bốn lần (khối "production crop box",
        # khối "Build each element from the inside out", câu "The continuous content
        # surface is the CORE", và dòng kết lặp lại lần nữa); luật TRONG SUỐT nói
        # bốn lần; BẢNG MÀU nói ba lần (chữ trong `variant.style`, dòng "Brand
        # palette:", khối "COLOUR AUTHORITY"). Nói một luật bốn lần không làm model
        # tuân bốn lần — nó làm mọi luật khác loãng đi, và làm người mở tab Prompt
        # ra không đọc nổi thứ mình sắp trả tiền để gửi đi.
        #
        # Nay: MỘT luật, MỘT section, và section có tiêu đề `##` để người đọc (lẫn
        # model) nhìn ra bố cục ngay. Ba loại tấm — giao diện, nhân vật, màn hình —
        # dùng CHUNG bộ section này, chỉ khác ở phần nào có mặt.
        #
        # ⚠️ HAI DÒNG ĐẦU LÀ HỢP ĐỒNG VỚI TẦNG BASH: `run_one` đọc ngược khổ giấy
        # bằng `head -n2 … | grep`. Section «Canvas» vì thế phải luôn đứng đầu, và
        # dòng ngay dưới tiêu đề của nó phải mang chữ PORTRAIT/SQUARE/LANDSCAPE.
        sections = []

        def section(title, body):
            rows = [row for row in body if row]
            if not rows:
                return
            sections.append("## " + title)
            sections.extend(rows)
            sections.append("")

        # ── Canvas ────────────────────────────────────────────────────────────
        # Nền nói ở ĐÂY và chỉ ở đây. Tấm full-bleed đảo ngược câu ấy chứ không im
        # lặng bỏ qua: một tấm mà tranh phủ kín từ mép đến mép mà prompt vẫn xin
        # nền trong suốt là mời model chừa một khung rỗng quanh bốn cạnh.
        section("Canvas", [
            f"{canvas_header} px, origin top-left: x grows right, y grows down."
            + (" The artwork covers the whole frame; there is no transparent area anywhere."
               if full_bleed else
               " Background fully transparent: save a PNG with a real alpha channel, alpha 0 on"
               " every pixel that is not part of a drawn element."),
        ])

        # ── Art style ─────────────────────────────────────────────────────────
        # `style_text` là NGUYÊN VĂN `variant.style` do webapp dựng (lối vẽ + theme
        # của bộ kit + mấy trục lệch giữa + mệnh đề `avoid:`). Engine KHÔNG bóc nó
        # ra, không thêm tính từ nào: nó là chữ của người dùng.
        style_text = str(s.get("style") or "").strip()
        style_body = []
        if use_inspo:
            style_body += [
                "The attached reference image(s) ARE the style: match their rendering technique,",
                "materials, palette and level of detail. Some of them may instead show SUBJECT",
                "MATTER — a season, a festival, a setting, a recurring motif; borrow that from",
                "those. Never copy the layout or composition of any reference.",
            ]
            if style_text:
                style_body.append(
                    "Written direction, secondary to those images and never contradicting them: "
                    + style_text + ".")
        elif style_text:
            style_body.append(style_text + ".")
        else:
            # KHÔNG bịa một phong cách thay người dùng. Nói thẳng là chưa có, và chốt
            # điều kiện duy nhất còn lại: cả tấm phải nhất quán với chính nó.
            style_body.append(
                "None was given for this project: choose one coherent look and apply it to"
                " every element here without exception.")
        section("Art style", style_body)

        # ── Palette ───────────────────────────────────────────────────────────
        # MỘT TRỌNG TÀI MÀU DUY NHẤT, và nay nó có đúng một chỗ ở. Trước đây màu
        # được nhắc ba lần ở ba giọng khác nhau (chữ trong style, dòng hex, khối
        # COLOUR AUTHORITY) nên nguồn ĐỨNG GẦN Ô NHẤT thắng — đúng triệu chứng
        # "màu nhận diện thương hiệu không được respect".
        palette = []
        if b.get("primary"):
            row = f"Primary {b['primary']} (dominant: primary actions and key surfaces)"
            if b.get("secondary"):
                row += f", secondary {b['secondary']} (secondary actions)"
            if b.get("gradient"):
                row += f", gradient {b['gradient']}"
            palette.append(row + "; neutrals derive from them. No other hues unless the art"
                                 " style names them.")
            if use_brand_refs or use_inspo:
                palette.append("The attached reference images decide the RENDERING, not the hue:"
                               " re-tint whatever they show into this palette.")
        elif use_brand_refs or use_inspo:
            palette.append("Taken from the attached reference image(s), which decide both the"
                           " rendering and the palette.")
        section("Palette", palette)

        # ── Layout ────────────────────────────────────────────────────────────
        if screen_sheet:
            # ⚠️ MỘT CẢNH NỀN KHÔNG PHẢI MỘT SPRITE SHEET CÓ ĐÚNG MỘT Ô.
            # Chủ sản phẩm 07/09/2026: «Cảnh nền → prompt dài quá, giờ tách ra ko cho
            # nó gen sprite sheet nữa nhé, kiểu gen full khung mobile luôn.» Tấm này
            # không có lưới để xếp, không có hộp nào để cắt ra, và không được phép có
            # một pixel trong suốt nào — nên nó bỏ qua ba section dưới.
            section("Layout", [
                "A single full-screen mobile game background, filling the whole frame edge to"
                " edge: one finished screen, not a sheet of separate parts. No border, no frame,"
                " no margin, no rounded corners, no vignette band — the art reaches all four"
                " edges, and a scene sitting inset inside an empty frame is unusable and will be"
                " regenerated.",
            ])
        else:
            empties = [str(i + 1) for i, comp in enumerate(comps)
                       if comp["skel"].get("shape") == "empty"]
            # `cell_hint` là câu contract tự viết ra để tả HÌNH DẠNG một ô ("square 1:1
            # cell", "portrait 3:4 cell"). Nó đi thẳng vào prompt, nguyên văn: bộ dịch
            # bên webapp tính tỉ lệ ô từ lưới THẬT và người dùng đọc lại đúng câu ấy
            # trên màn thiết kế (`effectiveCellHint`). Bỏ nó đi là bỏ một trường
            # contract mà không ai quyết định — và ô hình chữ nhật lại được vẽ vuông.
            cell_hint = str(sh.get('cell_hint', 'cell') or 'cell').strip()
            grid_row = f"{cols}x{rows} grid, {n_real} " + ("elements" if n_real != 1 else "element")
            grid_row += f" in reading order. Each cell is a {cell_hint}."
            grid_row += " Keep exactly this many cells in exactly this order."
            layout = [grid_row]
            if empties:
                layout.append("Cell " + ", ".join(empties)
                              + (" are" if len(empties) > 1 else " is")
                              + " intentionally empty: draw nothing there.")
            if full_bleed:
                layout.append("Each scene fills its own cell edge to edge and bleeds off all four"
                              " sides of that cell; the only gap allowed is a thin 24px line"
                              " exactly on the cell boundaries.")
            else:
                layout.append("The coordinates in the element list below are exact pixel crop"
                              " boxes: after generation, software cuts each asset at exactly"
                              " those four numbers.")
            section("Layout", layout)

        # ── Safe zone ─────────────────────────────────────────────────────────
        # BỐN KHỐI CŨ GỘP LẠI CÒN NĂM GẠCH ĐẦU DÒNG. Điểm mấu chốt của bản gốc
        # được giữ nguyên: nói RA HẬU
        # QUẢ ("phần mềm sẽ cắt đúng bốn toạ độ này") chứ không chỉ ra lệnh, và cấm
        # thẳng hành vi hỏng phổ biến nhất §8.1 đã đo — model co mặt nội dung lại
        # để nhét viền vào trong.
        if not screen_sheet and not full_bleed:
            safe = [
                "- The element's continuous functional CORE fills its safe zone exactly: same"
                " left, top, right and bottom, same center. Never shrink it to make room for a"
                " border, and never enlarge, stretch, move or recenter it.",
                # TRUNG LẬP VỚI Ô KÍNH / Ô ÁNH SÁNG. Luật trên nói "lấp kín hộp", và
                # model đọc nó thành "phủ SƠN ĐẶC kín hộp": với một quầng sáng hay một
                # tấm kính thì nó lấp phần trong suốt bằng thứ nó nghĩ là "trong suốt",
                # tức cái đế caro. Bản trước chữa bằng một câu HUỶ LỆNH in riêng cho
                # từng ô phát sáng — hai luật cãi nhau trong cùng một prompt. Nói
                # một lần, ở đây, rằng "lấp kín" là chuyện TẦM VỚI chứ không phải độ đục.
                "- Filling the box is about REACH, not about opaque paint: a see-through or"
                " glowing element may fade to full transparency inside its own box, and nothing"
                " is ever added behind it to fill the space.",
            ]
            if mascot_sheet:
                # Khối cấu tạo ba lớp được viết cho NÚT BẤM. Với nhân vật thì không có
                # "mặt phẳng" nào cả, và model vẫn tuân lệnh: nó vẽ con vật như một cái
                # huy hiệu có viền, dáng cứng đơ, tóc/tai/đuôi bị ép vào trong.
                safe.append("- Draw the character as ONE natural figure, not a rim around a flat"
                            " plate: no forced border, no badge frame, no plaque.")
            else:
                safe.append("- Any rim, border or edge treatment sits immediately OUTSIDE the safe"
                            " zone; decoration, if the art style calls for any, farther outside"
                            " still.")
            safe += [
                "- Whatever overflows may cross its own safe zone but must stay well clear of"
                " every other element's; elements never touch each other and never touch the"
                " image edges.",
                "- Only the core is scored: core missing inside the box is a failure, anything"
                " reaching outside the box is harmless.",
            ]
            section("Safe zone", safe)

        # ── Transparency ──────────────────────────────────────────────────────
        # 08/09/2026 — CHỦ SẢN PHẨM: "prompt tự nhiên mention mấy cái caro checker
        # board → AI gen không hiểu là negative prompt, lại bị nhiễm". Bản trước
        # gọi tên "CHECKERBOARD" ba lần in hoa để cấm; model ảnh đọc phủ định không
        # tin cậy, và cái tên được nhắc đi nhắc lại chính là thứ nó vẽ ra. Nên:
        # KHÔNG gọi tên thứ mình không muốn. Chỉ tả điều MUỐN, bằng câu tự nhiên:
        # chỗ trống thì để trống (alpha 0), chỗ xuyên thấu thì alpha thấp màu riêng,
        # còn lại theo vật liệu. Không in hoa, không "NEVER", không "no X, no Y".
        # Guard: test_gen_prompt `test_prompt_KHONG_nhac_ten_caro` khoá việc chữ
        # "checker" không được xuất hiện ở bất kỳ đâu trong prompt gửi model.
        #
        # ── GẠCH ĐẦU DÒNG ③ LÀ NHÀ DUY NHẤT CỦA NẤC «TỰ ĐỘNG THEO VẬT LIỆU» ──
        # 08/09/2026. Chủ sản phẩm chốt: mặc định của một ô KHÔNG còn là "đục", mà là
        # *"model tự quyết độ trong theo vật liệu của element"* — kính/băng/ánh sáng
        # xuyên thấu bằng alpha thật, kim loại/gỗ/đá đục hoàn toàn. Đó là nấc `auto`
        # của pill «Đục nền» (webapp `kit-core/lib/glaze.ts`), và nó là mặc định của
        # mọi ô mới.
        #
        # ⚠️ VÌ SAO CÂU ẤY NẰM Ở ĐÂY CHỨ KHÔNG NỐI VÀO TỪNG DÒNG ELEMENT: nó đúng với
        # MỌI ô của MỌI tấm. Một luật đúng với mọi ô mà in lại N lần thì vừa dài vừa
        # dạy model rằng mỗi ô có một hợp đồng alpha riêng — đúng cái bệnh mà
        # `skel.matte` vừa bị bỏ vì mắc phải. Nên `auto` KHÔNG có cụm chữ nào trong
        # `spec` (`GLAZE_PRESETS[0].en` rỗng có chủ ý) và cũng KHÔNG cần cờ nào trong
        # contract: không có cờ thì không có gì để hai tầng nói lệch nhau.
        #
        # ⚠️ VÀ VÌ THẾ MỞ ĐẦU BẰNG "unless an element's own line below says otherwise":
        # nấc CỤ THỂ (kính trong · kính gradient · băng · phát sáng · đục hoàn toàn)
        # vẫn nối câu của nó vào `spec` của riêng ô, và câu ấy phải THẮNG luật chung —
        # nếu không thì nấc «Đục hoàn toàn» của một ô trông-như-kính sẽ cãi nhau với
        # dòng này và model tự hoà giải bằng cách vẽ nửa vời.
        if not screen_sheet:
            section("Transparency", [
                "- The space around and between the elements is simply empty: alpha 0 in the"
                " PNG, with nothing painted there. Whatever is placed behind this layer later"
                " will show through those pixels.",
                "- Where something should be see-through — a glass body, the outer halo of a"
                " light — draw it in its own colour at a lower alpha, so the layer behind shows"
                " through it naturally. If a region cannot be made translucent, leave it"
                " unpainted.",
                "- Unless an element's own line below says otherwise, its transparency follows"
                " its material: glass, ice, water and light effects are see-through, drawn with"
                " real alpha; every other material — metal, wood, stone, plastic, fabric — is"
                " fully opaque (alpha 255), solid all the way through.",
            ])

        # ── Text ──────────────────────────────────────────────────────────────
        section("Text", [
            "No letters, no digits, no words of any language anywhere in the image. Faces,"
            " plates, banners, buttons and screens stay BLANK — text is composited later in the"
            " game engine.",
        ])

        # ── Ảnh tham chiếu, gọi theo VAI TRÒ ──────────────────────────────────
        # KHÔNG CÒN "The FIRST/SECOND attached image": `referenced_image_paths` là một
        # danh sách phẳng và thứ tự trong đó không phải hợp đồng với model. Gọi theo
        # vai trò thì không có thứ tự nào để mà lệch.
        if sh.get("ref") and screen_sheet:
            # ẢNH CỦA TẤM NỀN TẢ CẢNH, KHÔNG TẢ NHÂN VẬT. Một câu duy nhất cho mọi
            # tấm là sai từ khi thẻ Background cho đính ảnh: người dùng đưa lên ảnh
            # một khu chợ Tết, engine bảo model «trong ảnh này là NHÂN VẬT», thế là
            # giữa màn hình mọc ra một con mascot không ai xin.
            section("Scene reference", [
                "The attached SCENE REFERENCE image says WHAT this background shows: take its"
                " subject, setting, season and mood from it. Re-draw it in the art style above"
                " and recompose it to fill this canvas — never copy it pixel for pixel, and never"
                " keep its original framing, borders or empty margins.",
            ])
        elif sh.get("ref"):
            section("Character reference", [
                "The attached CHARACTER REFERENCE PHOTO is the character: every character cell"
                " shows EXACTLY this character — same species, face, colours, costume, materials"
                " and proportions — re-drawn in the art style above. This outranks everything"
                " else: if any other reference shows a DIFFERENT character, ignore that one.",
            ])
        if sh.get("poseRef"):
            section("Pose reference", [
                "The attached POSE REFERENCE SHEET is a grey mannequin in the SAME grid as this"
                " sheet: cell k there gives the body pose and camera angle for cell k here. Copy"
                " pose and camera angle only. NEVER draw the mannequin itself — it is grey and"
                " faceless on purpose, and none of its plastic look may appear in the result.",
            ])
        if sh.get("layoutRef"):
            # ẢNH BỐ CỤC KHÔNG BAO GIỜ ĐI VÀO `sheet.ref`. Hai tấm trả lời hai câu
            # khác nhau — «cảnh này là gì» và «cái gì nằm ở đâu» — và trộn chúng vào
            # một field là để model vẽ lại nguyên nét chì của bản phác.
            section("Layout sketch", [
                "The attached LAYOUT SKETCH is a rough composition guide: copy WHERE things sit"
                " and how much of the frame each area takes; take nothing else from it — not its"
                " style, colours, line quality or level of finish.",
            ])

        # ── Direction ─────────────────────────────────────────────────────────
        # `note` là mô tả tấm do khuôn/thư viện sinh ra; `directive` là câu NGƯỜI
        # THIẾT KẾ gõ thêm cho đúng tấm này ở đúng lượt này. Nói RA NGUỒN có chủ ý:
        # model phân biệt được đây là yêu cầu của người, không phải một câu preset.
        directive = str(sh.get("directive") or "").strip()
        direction = []
        if sh.get("note"):
            direction.append(str(sh["note"]).strip())
        if directive:
            direction.append("From the designer: " + directive)
        section("Direction", direction)

        # ── Elements / Scene ──────────────────────────────────────────────────
        # MỘT DANH SÁCH, KHÔNG PHẢI HAI: danh từ và toạ độ nằm CÙNG MỘT DÒNG (chủ
        # sản phẩm 27/08/2026 — hai bảng song song bắt cả người lẫn model tự ghép
        # "ô số 3" của bảng này với "3)" của bảng kia). Hộp ô (`geo[i]["cell"]`)
        # KHÔNG được in: nó là chuyện của dao cắt, còn với model nó chỉ mời vẽ cho
        # đầy ô.
        if screen_sheet:
            section("Scene", [comps[0]["spec"]])
        else:
            listing = [
                "The list names WHAT each cell is; the art style above decides how it looks; the"
                " coordinates decide where and how big.",
            ]
            # ── AI QUYẾT LƯỢNG TRANG TRÍ: DÒNG CỦA Ô, KHÔNG PHẢI THEME ─────────
            # ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/2026) ═══════════════════════════════╗
            # ║ Bộ kit theme Tết: *"lần nào nó cũng ra viền decor"* — hoa mai và đèn ║
            # ║ lồng bám quanh mọi ô, kể cả ô người dùng đã chọn «Không trang trí».  ║
            # ╚═════════════════════════════════════════════════════════════════════╝
            # Nguồn của nó không phải một câu sai trong prompt mà là một khoảng
            # TRỐNG: `## Art style` mô tả cả một bộ nhận diện lễ hội, `## Elements`
            # thì nói lượng trang trí cho từng ô — và không dòng nào nói ai thắng ai.
            # Model tự chọn nguồn NÓI TO HƠN, tức là theme. Một dòng, ở đây, phân vai
            # dứt khoát: theme cấp MÔ-TÍP (hoa gì, đèn kiểu gì), dòng của ô cấp SỐ
            # LƯỢNG và CHỖ ĐẶT.
            #
            # ⚠️ Ở ĐÂY chứ không nối vào từng dòng element, cùng một lý do với luật
            # alpha ở `## Transparency`: nó đúng với MỌI ô của MỌI tấm, và in lại N
            # lần thì vừa dài vừa dạy model rằng mỗi ô có một hợp đồng riêng.
            # Tấm full-bleed KHÔNG nhận dòng này: ở đó mỗi ô là một bức tranh phủ kín,
            # không có "vật thể" nào để mà đếm hoa văn bám quanh.
            if not full_bleed:
                listing.append(
                    "Ornament amount and placement are set PER ELEMENT on its line below; the"
                    " theme supplies the motif, not the quantity.")
            # ⚠️ VÌ SAO CỠ ĐẦU RA PHẢI CÓ MẶT TRONG PROMPT dù dao cắt không dùng nó.
            # Ô được lấp bằng hộp LỚN NHẤT vừa lề (geometry.max_fit_box) để ăn trọn
            # độ phân giải ảnh sinh — nhưng nếu chỉ đưa cái hộp to ấy thì model không
            # có cách nào biết element này ngoài đời là 120x52 hay 600x260, nên nó
            # chọn độ dày nét / bán kính bo / mật độ chi tiết theo hộp: cái nút nhỏ
            # ra thành tấm banner viền mảnh, co về cỡ thật là nát. Nói ra CỠ THẬT +
            # HỆ SỐ PHÓNG thì mọi nét được thiết kế ở cỡ thật rồi mới phóng lên.
            if any(c.get("out") for c in comps):
                listing.append(
                    "Each element is drawn ENLARGED from its final on-screen size; its line gives"
                    " the final size and the multiplier. Design every stroke weight, corner"
                    " radius, bevel and detail for the FINAL size, then draw the whole thing"
                    " scaled up by the multiplier — a small button drawn at 2.5x must still read"
                    " as a small button.")
            for i, comp in enumerate(comps):
                g = geo[i]
                # Ô TRỐNG KHÔNG CÓ DÒNG RIÊNG NỮA. Section «Layout» đã gọi tên chúng
                # ("Cell 4 is intentionally empty"), nên một dòng "4) — leave this area
                # empty" ở đây là lần nói thứ hai của cùng một luật — và nó còn tệ hơn
                # thế: `spec` của ô trống là chuỗi rỗng, nên dòng ấy mở đầu bằng một
                # số thứ tự không có danh từ nào theo sau.
                if g["kind"] == "empty":
                    continue
                spec = comp["spec"]
                out = comp.get("out") or None
                if out and g["safe"]:
                    # `drawScale` do webapp tính sẵn; thiếu thì dựng lại tại chỗ bằng
                    # ĐÚNG hàm mà webapp mirror, để hai bên không thể lệch.
                    ow, oh = int(out["w"]), int(out["h"])
                    dw, dh = g["safe"][2] - g["safe"][0], g["safe"][3] - g["safe"][1]
                    # HỆ SỐ PHẢI KHỚP CHÍNH HỘP IN Ở CUỐI DÒNG. `drawScale` của
                    # contract là con số đẹp (bội 0,25) và bình thường nó đúng khít;
                    # nhưng contract đời cũ / sửa tay có thể mang `skel` không dựng
                    # từ `out` — lúc ấy in "drawn at 2x" cạnh một hộp 2,09 lần là nói
                    # dối model đúng cái điều dòng này sinh ra để nói thật.
                    k = comp.get("drawScale")
                    if not k or abs(ow * float(k) - dw) > 1:
                        k = round(dw / ow, 2) if ow else 1
                    spec += (f" — final size {ow}x{oh} px, drawn at {k:g}x"
                             f" = {dw}x{dh} px")
                if g["safe"]:
                    x0, y0, x1, y1 = g["safe"]
                    # HỘP NÀY LÀ HỘP CẮT, KHÔNG PHẢI GỢI Ý. `slice.py` cắt MỌI ô không
                    # full-bleed theo đúng toạ độ in ra đây (`geometry.safe_offset_in_cell`).
                    # Bản trước còn nối thêm ", placement guide" cho ô `free` vì tin rằng
                    # dao cắt bám lõi đo được — trong `slice.py` KHÔNG có nhánh nào như thế.
                    spec += f" — safe zone x={x0}..{x1}, y={y0}..{y1} ({x1 - x0}x{y1 - y0} px)"
                elif g["kind"] == "full":
                    spec += " — full-bleed scene, fills its whole cell edge to edge"
                # 08/09/2026 — HAI NHÁNH `skel.matte` (glow/glass) ĐÃ BỎ Ở ĐÂY.
                # Chúng nối thêm một khối câu chữ về độ trong cho riêng ô, trong khi
                # webapp CŨNG nối một câu đục nền vào `spec` của chính ô ấy: cùng một
                # luật, hai kho, không gì bắt chúng khớp nhau. Nay độ trong chỉ còn là
                # chữ trong `spec` (webapp `kit-core/lib/glaze.ts`), và luật «Safe zone»
                # ở trên đã viết lại cho trung lập với ô kính / ô ánh sáng, nên không
                # còn gì để huỷ lệnh nữa. Contract đời cũ vẫn mang `skel.matte`: nó chỉ
                # đơn giản không được đọc.
                listing.append(f"{i + 1}) {spec}")
            section("Scenes" if full_bleed else "Elements", listing)

        # ── Output ────────────────────────────────────────────────────────────
        if screen_sheet:
            section("Output", [
                f"Game-ready mobile game background art, {canvas_ratio}.",
            ])
        else:
            section("Output", [
                (f"One coherent set: all {n_real} elements share the same style. "
                 if n_real > 1 else "")
                + f"Game-ready {canvas_ratio} PNG with a real alpha channel.",
            ])

        # Bỏ dòng trắng cuối cùng: nó là dấu phân cách GIỮA các section, không phải
        # một phần của section cuối.
        lines = sections[:-1] if sections and sections[-1] == "" else sections
        # ── NGƯỜI DÙNG TỰ SOẠN TRỌN PROMPT CỦA TẤM ────────────────────────────
        # Toàn bộ khối trên là lời của engine. `promptOverride` là chỗ người dùng nói
        # "để tôi tự viết" — và khi đã nói thế thì phải được viết THẬT: không nối
        # thêm, không nhắc khéo một câu nào. Nửa vời còn tệ hơn không cho, vì họ sẽ
        # sửa câu chữ của mình mãi mà không hiểu vì sao ảnh vẫn ra kiểu cũ.
        #
        # HAI NGOẠI LỆ, và cả hai đều KHÔNG phải cãi lời người dùng.
        #
        # ① SECTION «Canvas» — ngoại lệ KỸ THUẬT. `run_one` đọc ngược khổ giấy bằng
        #    `head -n2 … | grep -qiE 'PORTRAIT|SQUARE'` (xem hàm ngay dưới khối python
        #    này). Mất hai dòng ấy là mọi sheet dọc/vuông bị gửi đi với 1536x1024 ⇒
        #    ảnh về sai tỉ lệ, cắt lưới méo hết — đúng sự cố mà
        #    test/gen-canvas-size.test.sh sinh ra để chặn. Nó cũng là thông tin người
        #    viết prompt cần biết chứ không phải rác.
        # ② SECTION «Direction» — ghi chú và câu chỉ đạo là CHỮ CỦA CHÍNH NGƯỜI DÙNG,
        #    gõ ở một ô khác trên cùng cái thẻ. Vứt nó đi vì họ lỡ bật chế độ tự do là
        #    lặng lẽ nuốt một thứ họ vẫn đang nhìn thấy trên màn hình. Đây không phải
        #    engine nối thêm lời của engine.
        override = str(sh.get("promptOverride") or "").strip()
        if override:
            lines = sections[:2] + ["", override]
            if direction:
                lines += ["", "## Direction", *direction]
        # DẤU FULL-BLEED CHO TẦNG BASH. `full_bleed` tính được ở đây (skel.shape của
        # mọi ô là "full") nhưng `alpha_verdict` lại chạy ở bash, sau khi codex trả
        # ảnh — hai tầng không nói chuyện được với nhau ngoài đĩa. Một file rỗng cạnh
        # prompt là mối nối rẻ nhất và cùng vòng đời với prompt.
        # XOÁ dấu cũ khi tấm KHÔNG còn full-bleed: prompts/ sống qua nhiều lượt, một
        # dấu mồ côi sẽ tắt phép kiểm alpha của đúng tấm cần nó nhất.
        fb_marker = f"prompts/{s['id']}-{sh['id']}.fullbleed"
        if full_bleed:
            open(fb_marker, "w", encoding="utf-8", newline="\n").write("1\n")
        elif os.path.exists(fb_marker):
            os.remove(fb_marker)
        # newline="\n" BẮT BUỘC: trên Windows chế độ text ghi \r\n, và `read -r` của bash
        # giữ nguyên \r cuối dòng — tên file trong .att thành "xxx.png\r", test `-f` fail
        # LẶNG LẼ ⇒ mọi ảnh đính kèm bị rơi hết (lỗi hiện trường: mascot sai nhân vật,
        # codex trả lời "Please reattach the two reference images"). encoding cũng phải
        # đóng đinh utf-8: prompt có tiếng Việt, locale mặc định Windows là cp1252.
        open(f"prompts/{s['id']}-{sh['id']}.txt", "w", encoding="utf-8", newline="\n").write("\n".join(lines))
        # File đính kèm cho job: ref nhân vật trước, rồi TẤM ẢNH DÁNG, rồi brand/inspo.
        # Tấm ảnh dáng đứng NGAY SAU ảnh nhân vật vì hai ảnh ấy nói về cùng một thứ
        # (nhân vật này, ở những dáng này) và cả hai đều được prompt gọi theo VAI TRÒ
        # — thứ tự ở đây chỉ để người đọc log thấy chúng đi cùng nhau, không phải để
        # prompt đếm. Ảnh dáng do công cụ dựng chứ không phải người dùng tải lên; đó
        # là ngoại lệ DUY NHẤT của câu "toàn bộ là ảnh của người dùng" bên dưới.
        # (Vị trí đầu tiên từng là `skeleton/<sheet>.png`. Xem khối "KHÔNG CÒN KHUNG
        #  XƯƠNG" ở đầu file: tấm đó vừa lái nhầm phong cách vừa là nguồn hình học
        #  thứ hai lệch 1px với dao cắt.)
        # Một ảnh có thể xuất hiện ở nhiều vai (vd sheet.ref cũng là brand ref).
        # Codex tính token theo từng `-i`; khử trùng lặp ngay lúc dựng argv.
        att = []
        for p in (([sh["ref"]] if sh.get("ref") else [])
                  + ([sh["poseRef"]] if sh.get("poseRef") else [])
                  # BẢN PHÁC BỐ CỤC đứng ngay sau ảnh của tấm vì hai tấm ấy nói về
                  # cùng một cảnh: một tấm bảo VẼ GÌ, một tấm bảo NẰM ĐÂU. Prompt gọi
                  # cả hai theo VAI TRÒ nên thứ tự này chỉ để người đọc log thấy chúng
                  # đi cùng nhau, không phải để model đếm.
                  + ([sh["layoutRef"]] if sh.get("layoutRef") else [])
                  + (s["brand"]["refs"] if use_brand_refs else [])
                  + (s["inspo"] if use_inspo else [])):
            if p and p not in att:
                att.append(p)
        open(f"prompts/{s['id']}-{sh['id']}.att", "w", encoding="utf-8", newline="\n").write("\n".join(att) + "\n")
        print("prompt →", f"prompts/{s['id']}-{sh['id']}.txt", f"(+{len(att)} ảnh kèm)")
PY
py_rc=$?

# ── DỪNG Ở ĐÂY KHI CHỈ XIN XEM PROMPT ─────────────────────────────────────────
# Mọi thứ đắt tiền nằm PHÍA SAU dòng này: vòng lặp gọi `codex exec`, hạn mức ảnh,
# ghi đè raw/. Phía trước chỉ có số học và văn bản — chạy lại bao nhiêu lần
# cũng ra đúng một kết quả và không tốn gì.
# Thoát PHẢI mang mã của khối python: contract sai lưới thì `assert` của nó chết,
# và "xem trước" mà báo thành công với một thư mục prompts/ cũ mới là lời nói dối
# nguy hiểm nhất ở chế độ này.
if [[ -n "$PROMPTS_ONLY" ]]; then
  echo "KITGEN_PROMPTS_ONLY: đã dựng xong prompt trong prompts/ — KHÔNG gọi codex, KHÔNG đụng raw/."
  exit "$py_rc"
fi

run_one() {
  local job="$1"
  local task

  # KHỔ ẢNH LÀ CON SỐ, KHÔNG PHẢI LỜI ĐỀ NGHỊ.
  #   Bản cũ bảo model "theo CANVAS ORIENTATION ghi ở dòng đầu prompt (…, if supported)".
  #   Hai chỗ sai cùng lúc: (a) bắt model tự đi tìm một dòng trong khối chữ dài, (b) "if
  #   supported" là một đường lui hợp lệ — model dùng đúng đường lui đó rồi trả về ảnh
  #   dọc cho một sheet ngang. Cắt lưới trên khổ sai thì MỌI ô đều méo, và trước bản vá
  #   `orientation_error` của slice.py thì nó méo LẶNG LẼ: ảnh vẫn ra, chỉ là sai tỉ lệ,
  #   người dùng phát hiện lúc đã dán vào Figma.
  #   Nay khổ được ĐỌC RA TỪ CHÍNH PROMPT rồi nhắc lại thành số ngay câu đầu của task.
  #
  # ĐỌC NGƯỢC, KHÔNG TÍNH LẠI — và đó là chủ ý. Bảng khổ duy nhất nằm trong khối
  # python (`CANVAS`, xem đầu file). Tầng bash này không được có bảng thứ hai: chỉ
  # nhìn dòng đầu prompt xem nó khai khổ nào rồi nhắc lại. Nhờ vậy `promptOverride`
  # (người dùng tự soạn cả prompt) vẫn ra đúng khổ, miễn dòng đầu còn nguyên.
  #
  # `case` chứ không phải chuỗi `if grep`: ba khổ là ba nhánh loại trừ nhau, và
  # `grep -qi PORTRAIT` chạy trước sẽ không bao giờ thấy SQUARE. Đọc MỘT LẦN vào
  # biến để khỏi gọi `head` ba lượt trên cùng một file.
  # HAI DÒNG, không phải một: prompt nay mở đầu bằng tiêu đề section `## Canvas`
  # và khổ giấy nằm ở dòng ngay dưới. Đọc hai dòng thì cả prompt đời cũ (khổ ở
  # dòng 1) lẫn prompt đời nay đều khớp — `case` với glob `*PORTRAIT*` không quan
  # tâm chuỗi có mấy dòng.
  local want_size="1536x1024" want_orient="landscape" head1
  head1="$(head -n2 "prompts/${job}.txt" 2>/dev/null)"
  case "$head1" in
    *PORTRAIT*|*portrait*) want_size="1024x1536"; want_orient="portrait" ;;
    # 1254x1254, không phải 1024x1024: tool image_gen không có tham số `size` và
    # luôn trả về ~1,57 triệu pixel — ảnh vuông nó sinh ra đo được là 1254x1254
    # (132/132 lượt). Xem khối chú thích của bảng CANVAS ở đầu file.
    *SQUARE*|*square*)     want_size="1254x1254"; want_orient="square" ;;
  esac

  # Đọc .att TRƯỚC khi dựng task: đường dẫn ảnh phải được NÓI RA trong task (khối
  # REFERENCE IMAGES bên dưới) chứ không chỉ đính `-i` — xem chú thích ở khối att_note.
  local att=() att_paths=""
  local p
  while IFS= read -r p || [[ -n "$p" ]]; do
    # Gọt \r phòng thủ: file .att sinh bởi bản engine cũ (Windows, text mode) còn CRLF;
    # thiếu dòng này thì `-f` fail lặng lẽ và mọi ảnh đính kèm rơi hết.
    p="${p%$'\r'}"
    if [[ -n "$p" && -f "${ROOT}/${p}" ]]; then
      att+=(-i "${ROOT}/${p}")
      att_paths+="${ROOT}/${p}"$'\n'
    fi
  done < "prompts/${job}.att"

  # ╔══ VÌ SAO PHẢI LIỆT KÊ ĐƯỜNG DẪN TRONG TASK ═══════════════════════════════╗
  # ║ `-i` chỉ đính ảnh vào CUỘC HỘI THOẠI — tool image_gen KHÔNG tự thấy chúng. ║
  # ║ Muốn ảnh tham chiếu tới tay tool, model phải gọi image_gen với tham số     ║
  # ║ `referenced_image_paths` trỏ vào file trên đĩa. Bản cũ không nói gì về     ║
  # ║ điều đó ⇒ model gọi tool tay không, tool trả câu kịch bản "Please reattach ║
  # ║ the two reference images … they weren't available to the image-generation  ║
  # ║ tool" (đúng nguyên văn log hiện trường r-0001), job fail hoặc — tệ hơn —   ║
  # ║ model vẽ mascot theo TRÍ NHỚ mô tả chữ, ra sai nhân vật.                   ║
  # ╚════════════════════════════════════════════════════════════════════════════╝
  local att_note=""
  if [[ ${#att[@]} -gt 0 ]]; then
    att_note="The reference images are attached to this conversation AND exist on disk at the exact paths listed below. The prompt names each image by its ROLE (character reference photo, pose reference sheet, brand or inspiration images) — match them by what the image shows, never by their position in this list. When you call image_gen you MUST pass ALL of these paths, in this exact order, in its referenced_image_paths parameter. Never call it without them, and never claim the images are unavailable — they are right here:

--- REFERENCE IMAGES START ---
${att_paths}--- REFERENCE IMAGES END ---

"
  fi

  # ╔══ VÌ SAO CÂU ĐẦU PHẢI GỌI ĐÍCH DANH SKILL ════════════════════════════════╗
  # ║ Codex CLI KHÔNG nạp nội dung skill vào system prompt. Đọc thẳng từ         ║
  # ║ `codex debug prompt-input`: nó chỉ chèn một DANH SÁCH gồm tên + mô tả BỊ   ║
  # ║ CẮT GIỮA CHỪNG + đường dẫn file. Luật quan trọng nhất của skill imagegen — ║
  # ║   "For transparent images, ask built-in image_gen for a transparent        ║
  # ║    background and preserve the generated alpha."                          ║
  # ║ — nằm trong SKILL.md và model PHẢI TỰ MỞ RA ĐỌC mới biết.                  ║
  # ║                                                                            ║
  # ║ Đo được cả hai chiều trên cùng một máy, cùng model gpt-5.6-luna:            ║
  # ║   · prompt ngắn tự nhiên ("tạo ảnh cốc thuỷ tinh transparent alpha")       ║
  # ║     ⇒ model tự đọc SKILL.md ⇒ alpha THẬT, dải mờ 35,9%.                    ║
  # ║   · task cũ ("Generate ONE image with your image generation tool") chôn    ║
  # ║     dưới ~900 dòng đặc tả layout ⇒ KHÔNG bao giờ mở SKILL.md ⇒ ảnh ra đục  ║
  # ║     ⇒ model tự viết công cụ cắt nền (vụ .tmp_remove_checker.swift với      ║
  # ║     setBlendMode(.clear), 9/10 sheet dải mờ 0,00% + viền trắng răng cưa).  ║
  # ║                                                                            ║
  # ║ Nên câu đầu GỌI ĐÍCH DANH `imagegen` + `image_gen`, và CẤM THẲNG việc tự   ║
  # ║ chế công cụ tách nền. Cấm phải đặt ở ĐẦU: chữ ở gần thắng chữ ở xa, và     ║
  # ║ ngay trong thư mục skill có sẵn scripts/remove_chroma_key.py nằm chờ như   ║
  # ║ thể được cấp phép (SKILL.md không hề nhắc nó trong reference map).         ║
  # ║ alpha_verdict ở đầu file chỉ BẮT được triệu chứng sau khi đã tốn một lượt  ║
  # ║ gen; chặn từ gốc là ở đây.                                                 ║
  # ╚════════════════════════════════════════════════════════════════════════════╝
  task="Use the imagegen skill and its built-in image_gen tool for this. If you have not read that skill yet, read its SKILL.md first and follow its transparent-image rule: ask image_gen for a genuinely transparent background and preserve the alpha channel it gives back.

One rule matters more than everything else: the transparency has to come from image_gen itself. You must not write, compile or run any program, script or tool of your own that removes, keys out, erases or otherwise edits the background or the alpha channel of the image — that includes Python, Swift, ffmpeg, ImageMagick, chroma keying, remove_chroma_key.py and the CLI fallback scripts/image_gen.py. Copying or moving the resulting file is fine. If image_gen hands you an opaque image, just say so plainly and stop: a background cut out by hand is detected and rejected, and it wastes the whole run.

${att_note}Generate ONE image with the built-in image_gen tool. The output image MUST be exactly ${want_size} pixels (${want_orient}) — this is a hard requirement, not a preference; do not return any other aspect ratio. Use EXACTLY the prompt between the IMAGE PROMPT markers below. Then save/copy the generated PNG to exactly this path: ${ROOT_OUT}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${job}.txt")
--- IMAGE PROMPT END ---"

  # bash 3.2 + set -u: mảng RỖNG nổ "unbound variable" nếu expand thẳng — và bash của
  # macOS LÀ 3.2.57. Dòng dưới từng viết "${codex_env[@]}" trần: với hồ sơ Codex mặc
  # định thì IMG_HOME rỗng ⇒ mảng rỗng ⇒ gen.sh chết ngay tại đây, rc=127, codex chưa
  # kịp chạy một lần nào. UI chỉ nói được "chạy xong nhưng ảnh không được ghi" nên nhìn
  # y hệt ca thiếu codex trên PATH. Máy nào chọn hồ sơ riêng (~/.codex-img) thì mảng
  # không rỗng nên không ai thấy — 100% người dùng hồ sơ mặc định dính, 0% người còn lại.
  # Dùng ĐÚNG lối viết của dòng `att` ngay dưới: ${arr[@]+"${arr[@]}"}.
  local t0=$(date +%s)
  # Băm ảnh cũ TRƯỚC khi gọi codex — xem khối phán xử ở cuối hàm để biết vì sao.
  local h0; h0="$(file_hash "raw/${job}.png")"
  local codex_env=()
  [[ -n "$IMG_HOME" ]] && codex_env=(env CODEX_HOME="$IMG_HOME")
  ${codex_env[@]+"${codex_env[@]}"} codex exec \
    ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} \
    -s workspace-write \
    -C "${ROOT}" \
    --skip-git-repo-check \
    ${att[@]+"${att[@]}"} \
    -o "logs/${job}.last.txt" \
    "${task}" >"logs/${job}.log" 2>&1
  local rc=$?

  # TỰ CHỮA KHI PROVIDER TỪ CHỐI MODEL.
  # Catalog ở đầu file chỉ nói codex BIẾT tên model, không nói provider chịu phục vụ.
  # Ai dùng provider tuỳ biến (key riêng) có thể bị từ chối — mà từ chối thì hỏng CẢ
  # LƯỢT, đúng loại sự cố "10/10 job chết" vừa phải trả giá. Nên hạ xuống model của hồ
  # sơ và chạy lại ĐÚNG MỘT LẦN.
  # Chỉ thử lại khi CHƯA CÓ ẢNH MỚI: nếu ảnh đã ghi rồi thì lượt đó thành công, chạy lại
  # là tốn thêm một lần sinh ảnh mà chẳng để làm gì.
  if [[ ${#MODEL_ARGS[@]} -gt 0 && $rc -ne 0 && $(mtime_epoch "raw/${job}.png") -lt "$t0" ]] \
     && grep -qiE "unknown model|model not (found|supported)|unsupported model|invalid model|does not (exist|support)|model_not_found" "logs/${job}.log" 2>/dev/null; then
    echo "model '$GEN_MODEL' bị provider từ chối — chạy lại bằng model mặc định của hồ sơ" >>"logs/${job}.log"
    # BỎ `-m`, GIỮ `-c model_reasoning_effort`. Thứ bị từ chối là TÊN MODEL, không phải
    # mức nghĩ — mà mức nghĩ thì độc lập với model và luôn hợp lệ. Bản cũ bỏ cả cụm
    # MODEL_ARGS nên lượt chạy lại rơi về effort của hồ sơ; codex có mức "fast"
    # ("Fast responses with lighter reasoning") và có thể đang là mặc định của hồ sơ
    # (cờ `[notice] fast_default_opt_out` trong config.toml chính là chỗ opt-out).
    # Việc ở đây là gọi tool vẽ ảnh — nghĩ ít hơn không làm ảnh xấu hơn, nhưng nghĩ
    # NHIỀU hơn thì đốt token, còn "fast" thì bỏ bước đọc SKILL.md — đúng thứ vừa
    # phải trả giá. Nên ghim mức nghĩ ở CẢ hai lượt, không thả nổi.
    local retry_effort=()
    [[ -n "$GEN_EFFORT" ]] && retry_effort=(-c "model_reasoning_effort=\"$GEN_EFFORT\"")
    ${codex_env[@]+"${codex_env[@]}"} codex exec \
      ${retry_effort[@]+"${retry_effort[@]}"} \
      -s workspace-write \
      -C "${ROOT}" \
      --skip-git-repo-check \
      ${att[@]+"${att[@]}"} \
      -o "logs/${job}.last.txt" \
      "${task}" >>"logs/${job}.log" 2>&1
    rc=$?
  fi
  # VỚT ẢNH (codex ≥0.147): có khi model sinh ảnh xong nhưng KHÔNG tự copy về đích —
  # tool báo cho model một đường dẫn generated_images không tồn tại trên máy (vd
  # /root/.codex/... khi provider tuỳ biến chạy tool trong container của họ), hoặc model
  # chỉ trả lời đường dẫn rồi thôi. Nếu log nhắc tới một file trong generated_images và
  # file đó TỒN TẠI trong home đang dùng thì vớt về đích. Đường dẫn không tồn tại thật
  # (container remote) thì không vớt được — để phán FAIL như cũ, không đoán mò ảnh khác.
  if [[ $(mtime_epoch "raw/${job}.png") -lt "$t0" ]]; then
    local ghome="${IMG_HOME:-$HOME/.codex}/generated_images"
    local rel
    rel=$(grep -oE "generated_images/[^\"' ]*[.]png" "logs/${job}.log" 2>/dev/null | tail -1)
    if [[ -n "$rel" && -f "${ghome}/${rel#generated_images/}" ]]; then
      cp -f "${ghome}/${rel#generated_images/}" "raw/${job}.png" \
        && echo "vớt ${rel} → raw/${job}.png (model không tự copy về đích)" >>"logs/${job}.log"
    fi
  fi
  # Phán theo SẢN PHẨM, không tin mã thoát: codex hay sập vì lỗi API transient
  # SAU khi đã lưu ảnh xong (đã dính: badge ❌ oan, auto-slice bị bỏ qua).
  #
  # NHƯNG "SẢN PHẨM" PHẢI LÀ ẢNH MỚI, KHÔNG PHẢI FILE MỚI ĐƯỢC SỜ VÀO.
  # Đo bằng mtime thôi là bị lừa: khi tool tạo ảnh bị chặn, model đã có lần TỰ CHÉP
  # ảnh cũ của lượt trước vào đúng đích rồi báo thành công — mtime mới tinh, engine
  # gật đầu, người dùng nhận lại y nguyên ảnh cũ. Lần đo ngày 21/08/2026 mất 413.302
  # token cho hai lượt "OK" kiểu đó mà không sinh ra một ảnh mới nào.
  # Nên so BĂM NỘI DUNG: byte không đổi = không có ảnh mới, dù mtime có mới đến đâu.
  # (Chưa có ảnh cũ ⇒ $h0 rỗng ⇒ mọi file đều là mới, đúng đường chạy lần đầu.)
  # KHÔNG dùng mtime để phán nữa. `date +%s` chỉ tới GIÂY, nên hai lượt sát nhau có
  # cùng dấu thời gian và engine đổ oan cho model là "chép file cũ" — chính ca test
  # gen-fake-ok bắt được. Băm nội dung vừa chặt hơn vừa không có mốc thời gian để sai:
  # byte đổi = có ảnh mới, byte không đổi = không có, bất kể file bị ghi lại mấy lần.
  # (mtime vẫn dùng ở khối VỚT ẢNH và ở nhánh hạ cấp model — ở đó nó chỉ là phép ước
  # lượng rẻ tiền để quyết định có nên thử thêm, không phải phép phán cuối.)
  local h1; h1="$(file_hash "raw/${job}.png")"
  if [[ -z "$h1" ]]; then
    echo "FAIL ${job} (rc=${rc}, không có raw/${job}.png — xem logs/${job}.log)"
  elif [[ "$h1" == "$h0" ]]; then
    echo "FAIL ${job} (rc=${rc}, ảnh KHÔNG ĐỔI so với trước lượt chạy — model không sinh ảnh mới; có khi nó chép lại file cũ rồi báo thành công; xem logs/${job}.log)"
  else
    # Có ảnh MỚI — nhưng "mới" chưa phải "đúng hợp đồng". Kiểm alpha trước khi
    # đóng dấu OK: đây là chỗ rẻ nhất để bắt, mọi chỗ sau đều đã tiêu quota.
    # Dấu do khối python để lại (xem `fb_marker`): tấm này là nền full-bleed, tức
    # hợp đồng của nó là PHỦ KÍN — phép kiểm alpha phải lật ngược, không thì tấm nào
    # làm đúng cũng bị đóng dấu FAIL.
    local fb=0; [[ -f "prompts/${job}.fullbleed" ]] && fb=1
    local av; av="$(alpha_verdict "raw/${job}.png" "$fb")"
    local tail=""; [[ $rc -ne 0 ]] && tail="  (codex rc=${rc} sau khi đã lưu ảnh — bỏ qua)"
    case "$av" in
      bad*) echo "FAIL ${job} (nền KHÔNG trong suốt thật: ${av#bad } — xem logs/${job}.log)" ;;
      skip*) echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)${tail}  [${av#skip }]" ;;
      *)    echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)  ${av#ok }${tail}" ;;
    esac
  fi
}

# Filter: mỗi arg là một substring, job khớp BẤT KỲ arg nào thì chạy (không arg = chạy hết)
FILTERS=("$@")
match() {
  [[ ${#FILTERS[@]} -eq 0 ]] && return 0
  local f; for f in "${FILTERS[@]}"; do [[ "$1" == *"$f"* ]] && return 0; done
  return 1
}
echo "Bắt đầu $(date +%H:%M:%S) — chạy song song${FILTERS[*]:+ (lọc: ${FILTERS[*]})}"
while read -r job; do
  match "$job" || continue
  # Throttle: image-gen ăn quota ChatGPT gấp 3-5x lượt thường; bung cả 28 job dễ dính rate limit.
  # bash 3.2 (macOS) không có `wait -n` → vòng đợi bằng sleep.
  # 0.5 chứ không phải 2: đây là ĐỘ TRỄ TRUNG BÌNH giữa lúc một tấm vẽ xong và lúc tấm
  # kế được phát đi — với MAXJOBS nhỏ, cả lượt cộng lại là hàng chục giây chờ suông, và
  # người ngồi xem đọc nó ra là "gen xong một lúc lâu mới thấy tấm sau". Vòng lặp chỉ
  # đếm `jobs -pr`, rẻ hơn nhiều lần so với thứ nó đang chờ (một lượt codex vài phút).
  while (( $(jobs -pr | wc -l) >= MAXJOBS )); do sleep 0.5; done
  # </dev/null BẮT BUỘC: job nền thừa kế stdin = pipe liệt kê job; codex exec có thể
  # đọc/nuốt stdin ⇒ các dòng job còn lại biến mất ⇒ run "xong" khi mới chạy một nửa.
  run_one "$job" </dev/null &
done < <(python3 -c "
import json
cfg = json.load(open('styles.json', encoding='utf-8'))
for s in cfg['styles']:
    for sh in cfg['sheets']:
        if sh.get('styles') and s['id'] not in sh['styles']:
            continue
        print(f\"{s['id']}-{sh['id']}\")" | tr -d '\r')
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null
