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
# ║   ③ RÀNG BUỘC KỸ THUẬT — nền alpha thật, cấm caro, cấm chữ, cấm tràn ô.    ║
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
# ── VÌ SAO Ở ĐÂY KHÔNG CÒN BẢNG MÀU CHROMA-KEY ────────────────────────────────
# Từng có `CHROMA_KEYS` / `key_of()` để chọn màu nền giả-trong-suốt rồi nhét tên
# màu vào prompt. Bỏ vì image_gen của codex 0.149 trả về RGBA thật: prompt nay xin
# thẳng nền trong suốt, không xin màu. `slice.py` cũng không còn đường tách chroma.
# Chỉ còn ĐÚNG MỘT đường trong cả engine: alpha thật — và vì chỉ còn một đường nên
# nó phải được KIỂM, không chỉ được XIN (xem `alpha_verdict` ở đầu file).

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
        # Sheet mascot nhận diện bằng `sh["ref"]` — CÓ ẢNH THAM CHIẾU NHÂN VẬT thì
        # cả tấm là nhân vật (đúng vị từ mà khối "SECOND attached image" dùng dưới).
        mascot_sheet = bool(sh.get("ref"))

        b = s.get("brand") or {}
        use_brand_refs = bool(b.get("refs"))
        # ⚠️ ẢNH PHONG CÁCH ĐÃ TẢI LÊN THÌ PHẢI ĐƯỢC DÙNG.
        # Bản cũ: `use_inspo = styleMode == "inspo" and inspo`. Nhưng không còn màn
        # nào đặt `styleMode = "inspo"` ⇒ `use_inspo` LUÔN sai ⇒ ảnh phong cách không
        # bao giờ được đính, và mô tả vật liệu mặc định của từng ô là thứ DUY NHẤT
        # dẫn dắt style. Nay: có ảnh phong cách = dùng ảnh phong cách.
        use_inspo = bool(s.get("inspo"))

        # ═══ ① PHONG CÁCH TỔNG — ĐỨNG ĐẦU PROMPT ═════════════════════════════
        # Chủ sản phẩm: "phải copy cả prompt của phong cách, có prompt tổng".
        # Bản cũ chôn khối này ở TẬN CUỐI, sau ~900 dòng hình học, nên người mở tab
        # Prompt ra đọc thì thấy engine nói về V16 và về hoa lá trước khi thấy một
        # chữ nào của chính mình. Đưa lên đầu vừa đúng thứ tự đọc của con người,
        # vừa an toàn: dòng đánh số ở dưới nay chỉ còn DANH TỪ, không còn mô tả vật
        # liệu nào để cạnh tranh với nó (đó là điều kiện làm cho việc dời lên được).
        style_text = str(s.get("style") or "").strip()
        style_block = []
        if use_inspo:
            style_block += [
                "ART STYLE — this block decides EVERY visual quality of this sheet:",
                "material, texture, finish, lighting, palette, every actual colour, the",
                "rendering technique, and how much depth and volume anything has.",
                "The attached inspiration reference image(s) ARE the style: match their",
                "rendering technique, materials, palette and level of detail exactly. Do not",
                "copy their layout — only their look.",
            ]
            if style_text:
                style_block += [
                    f"Additional direction from the project (SECONDARY to the reference "
                    f"image — never contradict it): {style_text}.",
                ]
        elif style_text:
            style_block += [
                "ART STYLE — this block decides EVERY visual quality of this sheet:",
                "material, texture, finish, lighting, palette, every actual colour, the",
                "rendering technique, and how much depth and volume anything has.",
                f"Art style: {style_text}.",
            ]
        else:
            # KHÔNG bịa một phong cách thay người dùng. Nói thẳng là chưa có, và chốt
            # điều kiện duy nhất còn lại: cả tấm phải nhất quán với chính nó.
            style_block += [
                "ART STYLE: none was given for this project. Choose one coherent look and",
                "apply it to every element on this sheet without exception.",
            ]
        if b.get("primary"):
            bl = f"Brand palette: primary {b.get('primary')}, secondary {b.get('secondary')}"
            if b.get("gradient"):
                bl += f", gradient {b['gradient']}"
            style_block += [bl + " — use these as the dominant UI colors."]
        # ⚠️ BẢNG MÀU VÀ ẢNH BRAND KHÔNG LOẠI TRỪ NHAU. Bản cũ chỉ in dòng palette
        # khi `mode == "colors"`, mà `kitset-to-contract.ts` đặt mode = "image" ngay
        # khi có logo ⇒ **tải logo lên là MẤT TRẮNG dòng màu thương hiệu**. Hai thứ
        # trả lời hai câu hỏi khác nhau (màu nào / vẽ theo lối nào) nên CÓ GÌ DÙNG NẤY.
        if use_brand_refs or use_inspo:
            style_block += [
                "Also attached: brand / inspiration reference images — match their colour",
                "mood, material finish and overall vibe (do NOT copy their layout).",
                "IMPORTANT: even though the reference images have their own backgrounds,",
                "the sheet background MUST still be fully transparent as stated below —",
                "NEVER reuse a reference background colour, especially not for character cells.",
            ]
        # MỘT TRỌNG TÀI MÀU DUY NHẤT. Có tới ba nguồn màu (bảng màu, ảnh ref, và chữ
        # trong spec của ô) mà trước đây không ai phân xử, nên nguồn ĐỨNG GẦN Ô NHẤT
        # luôn thắng và bảng màu thương hiệu bị bỏ qua — đúng triệu chứng chủ sản
        # phẩm báo ("màu nhận diện thương hiệu không được respect").
        if b.get("primary"):
            style_block += [
                "COLOUR AUTHORITY: the brand palette above is the source of every colour on",
                "this sheet. Its primary is the dominant colour of primary actions and key",
                "surfaces; its secondary carries secondary actions; neutrals derive from them.",
            ]
            if use_brand_refs or use_inspo:
                style_block += [
                    "The attached reference image(s) decide the RENDERING — technique, material,",
                    "texture, lighting, amount of depth. They do NOT decide hue: re-tint whatever",
                    "they show into the brand palette above.",
                ]
        elif use_brand_refs or use_inspo:
            style_block += [
                "COLOUR AUTHORITY: the attached reference image(s) decide both the rendering",
                "AND the palette.",
            ]

        # ═══ ② HÌNH HỌC — THUẦN KỸ THUẬT ═════════════════════════════════════
        if full_bleed:
            place = [
                f"Each cell is a {sh.get('cell_hint', 'full-bleed scene')}.",
                "Each scene FILLS ITS OWN CELL COMPLETELY, edge to edge, and bleeds off all four",
                "sides of that cell: no border, no frame, no margin, no vignette band — and above",
                "all NOT ONE PIXEL of empty transparent background may show around a scene.",
                ("The ONLY transparent gap allowed on this sheet is a thin 24px line exactly on"
                 " the cell boundaries between neighbouring scenes."
                 if n_real > 1 else
                 "This sheet has no empty background anywhere: the scene covers every pixel."),
                "A scene inset inside an empty transparent frame is unusable and will be regenerated.",
            ]
        else:
            place = [
                f"Each cell is a {sh.get('cell_hint', 'cell')}. Each element sits fully inside its own invisible cell,",
                "centered, keeping at least 40px of empty background padding on every side of the element;",
                "elements never touch each other and never touch the image edges.",
            ]
        # ⚠️ KHỐI CẤU TẠO NÀY ĐƯỢC VIẾT CHO NÚT BẤM, KHÔNG PHẢI CHO NHÂN VẬT.
        # Nó ra lệnh: một MẶT PHẲNG liền lạc lấp kín safe zone, viền ngay bên ngoài
        # mặt phẳng đó. Với nút, khay, thanh thì đó đúng là cấu tạo. Với sheet mascot
        # thì không có "mặt phẳng" nào cả — và model vẫn tuân lệnh: nó vẽ con vật như
        # một cái huy hiệu có viền, dáng cứng đơ, tóc/tai/đuôi bị ép vào trong.
        #
        # DANH SÁCH TRANG TRÍ CỨNG ĐÃ BỊ XOÁ KHỎI CẢ HAI NHÁNH. Bản cũ liệt kê
        # "flowers, ribbons, tassels, jewels, sparkles and filigree" (nhánh nút) và
        # "Hair, ears, tails, ribbons, props and sparkles" (nhánh mascot). Ràng buộc
        # THẬT ở đây chỉ có một: thứ tràn ra được phép vượt safe zone, KHÔNG vượt ô.
        # Tràn ra là CÁI GÌ thì phong cách của người dùng quyết, không phải engine —
        # nêu tên một món trang trí là mồi cho model vẽ đúng món đó, kể cả khi phong
        # cách là mực hoạ phẳng không có lấy một cái tua rua.
        layer_block = (
            [
                "Draw the character as ONE natural figure, not as a rim around a flat plate:",
                "no forced border, no badge frame, no plaque. Anything that overflows the",
                "figure may cross its safe zone, but must stay well clear of every other",
                "element's safe zone.",
            ]
            if mascot_sheet else
            [
                "Build each element from the inside out:",
                "1) one continuous, clean content surface filling its whole safe zone — this is",
                "   the CORE;",
                "2) any rim, border or edge treatment immediately OUTSIDE the safe zone — it",
                "   must not consume or reduce the safe-zone surface;",
                "3) decoration, if the art style calls for any, farther outside still as overflow;",
                "   it may cross the safe zone but must stay well clear of every other element's",
                "   safe zone.",
                "Keep the safe zone clean: no decoration may cover the functional core.",
            ]
        )
        lines = [
            # DÒNG 1 LÀ HỢP ĐỒNG VỚI TẦNG BASH: `run_one` đọc ngược khổ giấy bằng
            # `head -n1 … | grep -qi 'PORTRAIT|SQUARE'`. Đừng dời, đừng bọc.
            "Canvas orientation: " + canvas_header + ".",
            "",
            *style_block,
            "",
            # KHÔNG CÒN KHUNG NGỮ CẢNH CỨNG. Bản cũ mở đầu bằng "A game UI kit sprite
            # sheet for a mobile mini-game marketing campaign." — một thể loại, một
            # kênh phát hành và một mục đích thương mại, đóng đinh cho MỌI dự án dùng
            # engine này. Ngữ cảnh đến từ khối phong cách ở trên; câu này chỉ còn nói
            # tấm ảnh NÀY là cái gì về mặt kỹ thuật.
            (f"A sheet of {n_real} full-bleed background scenes." if full_bleed and n_real > 1 else
             "A single full-bleed background scene." if full_bleed else
             # Tấm mascot KHÔNG phải "UI elements": ô của nó là các DÁNG của cùng một
             # nhân vật. Bản cũ gọi mọi tấm nhiều ô là "game UI kit sprite sheet", nên
             # tấm dáng bị mời vẽ nhân vật như một món đồ giao diện — cùng họ với lỗi
             # mà khối cấu tạo ba lớp đã gây ra (xem `layer_block`).
             f"A sheet of {n_real} poses of one character, laid out on one transparent canvas."
             if mascot_sheet and len(comps) > 1 else
             "A single character on a transparent canvas." if mascot_sheet else
             "A sprite sheet of separate UI elements on one transparent canvas." if len(comps) > 1 else
             "A single element on a transparent canvas."),
            f"Exactly {n_real} elements arranged in a STRICT grid of {cols} columns and {rows} rows, evenly spaced."
            + ("" if n_real == len(comps) else
               f" The LAST {len(comps) - n_real} cell(s) of the grid are INTENTIONALLY EMPTY:"
               " draw absolutely nothing there — the whole cell stays fully transparent."),
            # NHÃN PHIÊN BẢN NỘI BỘ ĐÃ BỊ XOÁ. Bản cũ có hai biến thể của câu này, một
            # cái mở đầu bằng "This is the v14+ NINE-ELEMENT production layout", cái kia
            # kết bằng "the nine-element v14+ layout applies only when the contract itself
            # declares a complete 3-by-3 nine-cell sheet". Model không biết v14 là gì; nó
            # chỉ cần biết lưới này BẤT BIẾN — và câu đó đúng cho mọi lưới, nên không cần
            # hai nhánh.
            "The grid above is fixed for this sheet: keep exactly this many cells in exactly",
            "this order. Do not repack the elements into a denser or looser grid, and do not",
            "invent extra cells.",
            *place,
            "",
            # ── Khối neo hình học — theo prompt crop-safe của spike safe-zone
            #    (docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md §5.3). Điểm mấu chốt: nói RA
            #    HẬU QUẢ ("phần mềm sẽ crop đúng 4 toạ độ này") thay vì chỉ ra lệnh
            #    "respect the frame", và cấm THẲNG hành vi hỏng phổ biến nhất mà §8.1
            #    đã đo: model co mặt nội dung lại để nhét viền vào trong.
            #
            #    KHÔNG CÒN "The FIRST attached image is the geometry contract…". Ba khối
            #    cũ (ảnh đính kèm là hợp đồng / dark frame là crop box / gray silhouette
            #    là core) đều trỏ vào một tấm PNG nay không còn được render nữa. Thay
            #    bằng ĐÚNG THỨ tấm PNG đó từng mã hoá: bốn con số, in ngay cạnh từng ô.
            f"Canvas {canvas_w}x{canvas_h} px, origin top-left: x grows right, y grows down.",
            "Every coordinate in this prompt is a pixel position in the final image.",
            "No guide image is attached and no alignment marks of any kind exist in this",
            "sheet: the numbers below are the entire layout instruction. Never draw a frame,",
            "a grid line or a placeholder shape to mark them.",
            "",
            "The safe zone printed on each element's line below is a production crop box:",
            "after generation, software cuts that asset out using exactly those four",
            "coordinates. Therefore, for every element:",
            "- its continuous functional CORE must fill its own safe zone — same left, top,",
            "  right and bottom extents, and the same center;",
            "- NEVER shrink the CORE to make room for a border or rim;",
            "- never enlarge, stretch, move, offset or recenter it;",
            "- a shifted or undersized CORE is unusable and will be regenerated.",
            "",
            *layer_block,
            # "enamel" là một chất liệu (men sứ) — nó nằm ở đây từ đời prompt kẹo bóng
            # và không có việc gì trong một câu chỉ nói về ĐO ĐẠC hình học.
            "The continuous content surface is the CORE and the only layer scored for",
            "geometry. Measure intrusion one-sided: core missing inside the safe zone is a",
            "failure; decoration or core extending outside the safe zone is harmless if it",
            "stays in the element's own cell.",
            "",
            # ⚠️ KHÔNG quay lại luật "mỗi element phủ 70-80% bề ngang ô". Đó là một chỉ
            #    thị hình học THỨ HAI đá nhau với khối crop-safe ở trên, và nó đẩy model
            #    đúng về phía lỗi mà handoff §8.1 đo được: co mặt nội dung vào trong.
            #    Kích thước đã nằm trong chính toạ độ; prompt chỉ nói tính nhất quán.
            "SIZING: the safe-zone coordinates decide every size. Do not rescale anything to",
            "look tidy; elements of the same kind simply share one consistent visual weight.",
            "",
            # ═══ ③ RÀNG BUỘC KỸ THUẬT ════════════════════════════════════════
            # ── NỀN: ALPHA THẬT, KHÔNG CÒN CHROMA-KEY ────────────────────────
            # image_gen của codex 0.149 trả về RGBA thật. Chroma-key là cách CŨ để giả
            # trong suốt khi công cụ không có alpha — và nó phải trả giá: viền nhiễm
            # màu key, quầng sáng mất, kính phải giải ngược C = α·F + (1−α)·K.
            # BẪY: khi không tạo được trong suốt, model KHÔNG báo lỗi mà VẼ MỘT TẤM
            # CARO GIẢ ở α=255 (đo được, BACKLOG #24 ⑦). Nên câu dưới cấm đích danh
            # việc vẽ caro, và slice.py còn soi kênh α để chặn lần nữa.
            "BACKGROUND of the sheet: FULLY TRANSPARENT. Save a PNG with a real alpha",
            "channel; every pixel that is not part of a drawn element must have alpha = 0.",
            "This background rule OVERRIDES the art style and every reference image: never",
            "use a style-coloured, scene, gradient or flat-colour background for the sheet.",
            "",
            # ── CẤM VẼ CARO — LỜI CẤM NẶNG NHẤT TRONG CẢ PROMPT ──────────────
            # Đo được, nhiều lượt: model KHÔNG báo lỗi khi nó không tạo được trong
            # suốt. Nó vẽ lại *cái hình ảnh tượng trưng cho trong suốt* — ô caro
            # xám-trắng — rồi trả về ở α=255. Nói "hãy trong suốt" là chưa đủ, vì
            # với model thì tấm caro TRÔNG cũng đúng như thế. Phải:
            #   ① gọi tên đúng thứ bị cấm,
            #   ② nói ra vì sao nó sai (caro là cách trình xem ảnh HIỂN THỊ chỗ
            #      rỗng, không phải một thứ có trong tranh),
            #   ③ và chỉ ra cách làm ĐÚNG thay thế (hạ α, đừng tô màu nhạt).
            # Thiếu ③ là model chỉ biết mình sai mà không biết đi đường nào.
            "NEVER DRAW A CHECKERBOARD. Grey-and-white squares are how an image editor",
            "DISPLAYS empty pixels on screen; they are not part of any artwork, and painting",
            "them is the single worst thing you can do to this sheet — it makes every asset",
            "cut from it unusable. This applies everywhere, at any scale, at any opacity:",
            "no checker tiles, no pale square grid, no 'transparency pattern' texture.",
            #
            # ĐÃ THỬ VÀ ĐÃ BỎ — đừng viết lại: một khối nữa nói "cái phông tưởng
            # tượng không được ghi vào file / mỗi element là một sticker die-cut,
            # ngoài mực là file rỗng". Đo lượt 5: nó KHÔNG bớt caro ở ô glow (13% →
            # 10%) mà làm khâu cắt alpha hoá hung hãn — mép răng cưa lởm chởm, thủng
            # lỗ đỏ vào giữa thân nút và thân xu, quầng sáng bạc trắng hết. Nói mạnh
            # thêm về "rỗng" là đổi một lỗi nhìn thấy được lấy một lỗi tệ hơn.
            "",
            "WHENEVER SOMETHING SHOULD BE SEE-THROUGH — the background, the faint outer halo",
            "of a light, the body of a glass panel — express it with the ALPHA CHANNEL: give",
            "those pixels a LOW alpha value and keep their own colour. Do NOT simulate it with",
            "paint: no white wash, no pale grey fill, no checker tiles at full alpha. Less",
            "alpha, not lighter paint. If you cannot lower the alpha of a region, leave that",
            "region completely unpainted rather than filling it with a stand-in pattern.",
            "",
            "ABSOLUTELY NO TEXT: no letters, no digits, no words, no characters of any language",
            "anywhere in the image. All faces, banners, buttons, plates and screens are BLANK — text will",
            "be composited later in the game engine.",
            # Câu này nói về THÂN ELEMENT, không phải về nền sheet — và từ khi nền
            # sheet là alpha thật thì hai thứ đó dễ bị đọc lẫn. Nêu rõ ngoại lệ:
            # ô `matte:"glass"` cố ý mang alpha một phần, ô `matte:"glow"` cố ý tan
            # dần ra nền. Không trừ ra thì hai dòng đá nhau ngay trong một prompt.
            "Every element is FULLY OPAQUE with solid fills (alpha 255) — never leave an element",
            "interior hollow, semi-transparent, or showing the background through it. This is about",
            "the BODY of an element, not the sheet background, and it does not apply where a spec",
            "explicitly says the element is hollow, see-through or made of light.",
            ""
        ]
        if mascot_sheet:
            # KHÔNG CÒN "The SECOND attached image". Câu cũ đếm theo thứ tự đính kèm,
            # mà vị trí thứ hai là vị trí của ảnh khung xương — bỏ khung xương thì ảnh
            # nhân vật lên hàng đầu và câu này trỏ nhầm sang ảnh brand/inspo. Gọi ảnh
            # theo VAI TRÒ thì không có thứ tự nào để mà lệch.
            lines += [
                "The attached character REFERENCE PHOTO is the character: every character",
                "cell must show EXACTLY this character — same species, face, colors, costume,",
                "materials and proportions — re-drawn cleanly in this sheet's art style.",
                "This rule OVERRIDES everything else: if the art style description or any other",
                "reference image mentions or shows a DIFFERENT mascot/character, IGNORE that one",
                "completely — the reference photo is the ONLY source of the character's identity.", ""]
        if sh.get("note"):
            lines += [sh["note"], ""]
        # CHỈ ĐẠO RIÊNG CỦA TẤM — một câu người thiết kế gõ ở khu soạn prompt.
        # Khác `note` ở CHỖ ĐỨNG TRONG HỢP ĐỒNG, không ở hình thức: `note` là mô tả
        # tấm do template/thư viện sinh ra, còn dòng này là lời người dùng nói thêm
        # cho ĐÚNG tấm này ở ĐÚNG lượt này. Đặt ngay sau `note` vì cả hai cùng nói về
        # tấm, và đặt TRƯỚC danh sách ô để nó còn kịp áp lên từng ô.
        # Nói RA NGUỒN ("from the designer") có chủ ý: model phân biệt được đây là
        # yêu cầu của người, không phải một câu preset của thư viện.
        directive = str(sh.get("directive") or "").strip()
        if directive:
            lines += [f"Extra direction for this sheet (from the designer): {directive}", ""]

        # ═══ ④ DANH SÁCH Ô — MỖI Ô LÀ MỘT DANH TỪ ════════════════════════════
        # BA DÒNG, KHÔNG PHẢI BA MƯƠI. Bản cũ có một khối "HOW TO READ …" 20 dòng +
        # một khối "COLOUR AUTHORITY" 12 dòng đứng ngay đây, cả hai đều nói đi nói
        # lại rằng art style thắng spec — vì hồi đó spec CÓ vật liệu để mà thắng.
        # Nay spec chỉ còn danh từ, nên chỉ cần nói ranh giới một lần, ở đúng chỗ
        # người đọc (và model) cần nó nhất: ngay trên danh sách.
        lines += [
            "THE NUMBERED LIST BELOW NAMES ONLY *WHAT* EACH CELL IS — its identity, its parts",
            "and its state (filled / outline / hollow / open / closed / active / disabled).",
            "HOW everything looks — material, texture, finish, lighting, palette, every actual",
            "colour, and how much depth and volume it has — comes from the ART STYLE block at",
            "the top of this prompt, and from nowhere else. If a line below still happens to",
            "carry a material or colour word, the ART STYLE outranks it.",
            "Geometry always outranks both: the safe-zone coordinates on each line decide",
            "position and size.",
            "Each element's continuous core must lie fully inside its safe zone; rim and",
            "decoration may overflow outside the box but must not touch another element's zone.",
            "",
        ]
        # ── MỘT DANH SÁCH, KHÔNG PHẢI HAI ───────────────────────────────────
        # Bản nháp đầu của bản bỏ-skeleton in một khối "Cell 1 (row 1, col 1): cell
        # box …; SAFE ZONE …" RIÊNG, đứng trên danh sách danh từ. Chủ sản phẩm bác
        # (27/08/2026): hai danh sách song song bắt cả người lẫn model phải tự ghép
        # "ô số 3" của bảng này với "3)" của bảng kia, và một tấm 3×3 thành 18 dòng
        # nói về 9 thứ. Nay danh từ và toạ độ nằm CÙNG MỘT DÒNG.
        #
        # Cũng vì thế không còn dòng tiêu đề "Row r, left to right:": toạ độ tuyệt
        # đối đã nói vị trí chính xác hơn mọi lời mô tả hàng/cột, nên tiêu đề hàng
        # chỉ còn là chữ thừa xen giữa danh sách.
        #
        # HỘP Ô (`geo[i]["cell"]`) KHÔNG ĐƯỢC IN. Nó là chuyện của dao cắt; với model
        # thì nó chỉ mời gọi vẽ cho đầy ô. Ranh giới duy nhất model cần biết đã nằm
        # trong luật chung ngay trên: đừng chạm safe zone của thằng bên cạnh.
        for i, comp in enumerate(comps):
            spec = comp["spec"]
            g = geo[i]
            # TOẠ ĐỘ ĐỨNG NGAY SAU DANH TỪ, TRƯỚC câu kỹ thuật của ô. Thứ tự đó có
            # chủ ý: câu glow/glass nói VỀ safe zone ("the safe zone marks the pane"),
            # nên nó phải đọc được sau khi safe zone đã được nêu ra.
            if g["safe"]:
                x0, y0, x1, y1 = g["safe"]
                zone = f" — safe zone x={x0}..{x1}, y={y0}..{y1} ({x1 - x0}x{y1 - y0} px)"
                # Ô `free` KHÔNG được gọi hộp của nó là hộp cắt: `slice.py` cắt ô này
                # theo LÕI ĐO ĐƯỢC của chính artwork (nhánh `sk.get("free")`), đúng ý
                # "để AI vẽ tự do". Hứa crop box ở đây là hứa một thứ dao cắt không làm.
                if g["kind"] == "free":
                    zone += ", placement guide"
                spec += zone
            elif g["kind"] == "full":
                # Full-bleed: cảnh phủ kín ô nên không có khung nào để hứa, và khối
                # `place` ở trên đã nói đủ. In hộp ô ra đây chỉ mời model vẽ viền.
                spec += " — full-bleed scene, fills its whole cell edge to edge"
            elif g["kind"] == "empty":
                spec += " — leave this area completely empty and fully transparent"
            if comp["skel"].get("matte") == "glow":
                # NỀN ĐEN ĐÃ BỎ. Nó từng là cách duy nhất lấy được quầng sáng:
                # vẽ cộng sáng trên đen ⇒ C = α·F ⇒ slicer đọc alpha ra từ độ
                # sáng. Có alpha thật thì quầng nằm SẴN trong kênh α, đủ cả
                # dải mờ — đo trên ảnh mẫu chủ sản phẩm gửi: 12,96% pixel nằm
                # ở dải α 1..191 (BACKLOG #24 ⑤). Giữ nền đen bây giờ chỉ tổ
                # nướng một mảng đen vào asset.
                # THỦ PHẠM THẬT SỰ của cái đế caro: khối cấu tạo ở trên ra lệnh
                # lấp kín safe zone bằng "one continuous content surface". Với ô
                # ÁNH SÁNG thì lệnh đó sai hẳn — không có mặt phẳng nào để lấp cả.
                # Model vẫn tuân lệnh: nó lấp kín vùng đó bằng thứ nó nghĩ là
                # "trong suốt", tức là caro. Nên câu của ô phải HUỶ lệnh kia một
                # cách nói thẳng, không chỉ cấm caro — cấm mà không gỡ lệnh lấp
                # thì nó lấp bằng thứ khác.
                spec += (" — LIGHT EFFECT: for THIS cell, ignore the rule about filling the safe"
                         " zone with a continuous content surface: there is no surface here. The"
                         " safe zone only marks HOW FAR the light reaches;"
                         " it is not an area to fill. This element is pure light. The halo"
                         " fades out by"
                         " LOWERING ALPHA, not by painting paler pixels: at the outer edge the"
                         " alpha reaches 0 while the colour stays the light's own colour, so"
                         " the fade is gradual and never stops at a hard edge. There is NO"
                         " plate of any kind behind the light — no black, no white, no pale"
                         " grey, and above all no checkerboard squares. Every pixel that is"
                         " not lit is simply unpainted")
            elif comp["skel"].get("matte") == "glass":
                # Trước đây độ trong của kính được ĐO GIÁN TIẾP: nền key lộ qua
                # thân bao nhiêu thì trong bấy nhiêu, slicer giải ngược
                # C = α·F + (1−α)·K. Cách đó phụ thuộc hoàn toàn vào việc model
                # chịu để key lộ ra (docs/design-glass-transparent-panel-2026-08.md
                # §2). Alpha thật thì độ trong nằm THẲNG trong kênh α.
                spec += (" — SEE-THROUGH ELEMENT: the safe zone marks the pane, but"
                         " 'filling it with a continuous content surface' here means a"
                         " SEE-THROUGH surface, not a solid one. The body of this element is a"
                         " thin sheet of tinted glass. Draw it with a LOW ALPHA VALUE — about 64 out of 255"
                         " for a clear pane, up to 128 for a strongly tinted one — keeping the"
                         " glass's own tint colour at that low alpha. Do NOT fake it with"
                         " paint: no opaque fill, no white or pale grey wash, and above all no"
                         " checkerboard squares. Lower alpha, not lighter paint. Frame, rim,"
                         " bevel and specular highlights stay fully opaque")
            lines.append(f"{i + 1}) {spec}")
        lines += [
            "",
            f"All {n_real} elements share the exact same consistent style and belong to one coherent set. "
            "Game-ready UI asset quality, " + canvas_ratio + "."
        ]
        # ── NGƯỜI DÙNG TỰ SOẠN TRỌN PROMPT CỦA TẤM ────────────────────────────
        # Toàn bộ khối trên là lời của engine. `promptOverride` là chỗ người dùng nói
        # "để tôi tự viết" — và khi đã nói thế thì phải được viết THẬT: không nối
        # thêm, không nhắc khéo một câu nào. Nửa vời còn tệ hơn không cho, vì họ sẽ
        # sửa câu chữ của mình mãi mà không hiểu vì sao ảnh vẫn ra kiểu cũ.
        #
        # NGOẠI LỆ DUY NHẤT — và nó là ngoại lệ KỸ THUẬT, không phải cãi lời:
        # `run_one` đọc ngược khổ giấy bằng `head -n1 … | grep -qiE 'PORTRAIT|SQUARE'`
        # (xem hàm ngay dưới khối python này). Mất dòng đầu là mọi sheet dọc/vuông bị
        # gửi đi với 1536x1024 ⇒ ảnh về sai tỉ lệ, cắt lưới méo hết — đúng sự cố mà
        # test/gen-canvas-size.test.sh sinh ra để chặn. Nên dòng khổ giấy ở lại, và
        # nó cũng là thông tin người viết prompt cần biết chứ không phải rác.
        override = str(sh.get("promptOverride") or "").strip()
        if override:
            lines = [lines[0], "", override]
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
        # File đính kèm cho job: ref nhân vật trước, rồi brand/inspo. TOÀN BỘ là ảnh
        # của NGƯỜI DÙNG — engine không còn đính ảnh nào của chính nó.
        # (Vị trí đầu tiên từng là `skeleton/<sheet>.png`. Xem khối "KHÔNG CÒN KHUNG
        #  XƯƠNG" ở đầu file: tấm đó vừa lái nhầm phong cách vừa là nguồn hình học
        #  thứ hai lệch 1px với dao cắt.)
        # Một ảnh có thể xuất hiện ở nhiều vai (vd sheet.ref cũng là brand ref).
        # Codex tính token theo từng `-i`; khử trùng lặp ngay lúc dựng argv.
        att = []
        for p in (([sh["ref"]] if sh.get("ref") else [])
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
  local want_size="1536x1024" want_orient="landscape" head1
  head1="$(head -n1 "prompts/${job}.txt" 2>/dev/null)"
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
    att_note="The reference images are attached to this conversation AND exist on disk at the exact paths listed below (in order: the character reference first if the prompt mentions one, then any brand / inspiration images). When you call image_gen you MUST pass ALL of these paths, in this exact order, in its referenced_image_paths parameter. Never call it without them, and never claim the images are unavailable — they are right here:

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

HARD BAN — this is the single most important rule here: you must NOT write, compile or run any program, script or tool of your own that removes, keys out, erases or otherwise alters the background or the alpha channel of the image. No Python, no Swift, no ffmpeg, no ImageMagick, no chroma key, no remove_chroma_key.py, no CLI fallback via scripts/image_gen.py. The transparency must be produced by image_gen itself. Copying or moving the resulting file is of course fine. If image_gen hands you an opaque image, say so plainly and stop — a background you cut out yourself is a FAILED result, it gets detected and rejected, and it wastes the whole run.

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
