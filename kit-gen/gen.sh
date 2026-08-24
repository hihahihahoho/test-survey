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
PY_CHECK="${KITGEN_PYTHON:-python3}"
alpha_verdict(){
  "$PY_CHECK" - "$1" <<'PYA' 2>/dev/null || echo "skip không chạy được phép kiểm alpha"
import sys
try:
    from PIL import Image
except Exception:
    print("skip thiếu Pillow — bỏ qua phép kiểm alpha"); raise SystemExit
im = Image.open(sys.argv[1])
if "A" not in im.getbands():
    print("bad KHÔNG có kênh alpha (mode=%s). image_gen phải trả PNG RGBA — "
          "đường tách nền đã bỏ nên không có gì cứu được ảnh này." % im.mode); raise SystemExit
h = Image.open(sys.argv[1]).convert("RGBA").getchannel("A").histogram()
n = float(sum(h)) or 1.0
trong, mo = h[0] / n, sum(h[1:255]) / n
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
GEN_MODEL="${KITGEN_GEN_MODEL-gpt-5.6-luna}"
GEN_EFFORT="${KITGEN_GEN_EFFORT-medium}"
MODEL_ARGS=()
if [[ -n "$GEN_MODEL" ]]; then
  # Catalog TĨNH, nằm sẵn trên máy (đo: 0,03 giây, không gọi mạng). Nó chỉ chứng minh
  # bản codex này BIẾT tên model — KHÔNG chứng minh provider của người dùng chịu phục vụ
  # model đó. Ai trỏ codex sang provider tuỳ biến thì tên có trong catalog mà gọi vẫn bị
  # từ chối. Nên đây chỉ là cửa RẺ; cửa thật là nhánh tự chữa trong run_one.
  if codex debug models 2>/dev/null | grep -q "\"$GEN_MODEL\""; then
    MODEL_ARGS=(-m "$GEN_MODEL")
    [[ -n "$GEN_EFFORT" ]] && MODEL_ARGS+=(-c "model_reasoning_effort=\"$GEN_EFFORT\"")
  else
    echo "codex không biết model '$GEN_MODEL' — dùng model mặc định của hồ sơ."
  fi
fi
if [[ -n "$IMG_HOME" && ! -f "$IMG_HOME/auth.json" ]]; then
  echo "FATAL: profile Codex riêng chưa đăng nhập. Chạy: CODEX_HOME=$IMG_HOME codex login"; exit 1
fi

# Khung xương layout (ảnh ref đính kèm codex) — deterministic từ styles.json.
# MỘT renderer duy nhất: skeleton-svg.js dựng SVG, @resvg/resvg-wasm raster ra PNG.
#
# KHÔNG có đường lùi, và đó là chủ ý. Bản PIL cũ (skeleton.py) lệch 17,6% khối
# lượng mực và vẽ sai hẳn dáng pose — nó đẻ ra ảnh ref SAI mà không ai biết, rồi
# mọi ảnh gen sau đó lệch bố cục. Render hỏng thì DỪNG TO ở đây, đừng đốt quota
# codex cho một lượt gen đã sai từ đầu vào.
# v16: ảnh attachment có gray registration grid + nested safe guides; bias mặc định 0.
# NỀN ẢNH ATTACHMENT TRONG SUỐT, và đó là ràng buộc chứ không phải thẩm mỹ: model
# bắt chước nền của ảnh tham chiếu chứ không nghe prompt (đo 4/4 lượt, BACKLOG #24 ⑥
# — nền ref đặc ⇒ ảnh ra 0,0% pixel trong suốt, kể cả khi prompt hô transparent thật
# to). Xem khối "NỀN SHEET" trong skeleton-svg.js. slice.py không đọc ảnh skeleton.
export KITGEN_GRID_GUIDE=v16
if ! node render-skeleton.mjs; then
  echo "FATAL: không render được khung xương (render-skeleton.mjs)." >&2
  echo "       Thường là thiếu @resvg/resvg-wasm. Cài lại:" >&2
  echo "         npm install --prefix \"\$HOME/.kitgen/tools\" @resvg/resvg-wasm" >&2
  exit 1
fi

# Build prompt cho từng (style, sheet) → prompts/<style>-<sheet>.txt
python3 - <<'PY'
import json, re, sys
cfg = json.load(open("styles.json", encoding="utf-8"))

# Từ vựng VẬT LIỆU / MÀU trong spec của thư viện element (element-lib.json).
# CHỈ chứa từ nói về chất liệu, bề mặt và màu — TUYỆT ĐỐI không chứa từ nói về
# hình dáng hay trạng thái (capsule, pill, outline, hollow, open, rounded, wide,
# bar, plate, badge…): những từ đó là HỢP ĐỒNG hình học, không được hạ cấp.
MATERIAL_WORDS = {
    # bề mặt / chất liệu
    "glossy", "gloss", "matte", "candy", "jelly", "gummy", "plastic", "3d", "metal",
    "metallic", "chrome", "foil", "velvet", "satin", "silk", "wood", "wooden",
    "paper", "papery", "glass", "glassy", "ceramic", "porcelain", "marble", "stone",
    "enamel", "lacquer", "rubber", "gel", "frosted", "brushed", "polished",
    "iridescent", "holographic", "pearlescent", "neon", "pastel", "shiny", "waxy",
    "specular", "bevel", "beveled", "bevelled", "gradient", "sheen", "desaturated",
    "muted", "vivid", "translucent", "creamy", "velvety",
    # màu
    "red", "orange", "coral", "gold", "golden", "silver", "bronze", "copper",
    "blue", "green", "yellow", "purple", "violet", "pink", "white", "black",
    "grey", "gray", "cream", "ivory", "teal", "cyan", "magenta", "brown", "beige",
    "amber", "crimson", "scarlet", "turquoise", "lime", "navy", "maroon", "peach",
    "mint", "lavender", "burgundy", "olive", "tan", "charcoal",
    # NHIỆT ĐỘ MÀU / SẮC ĐỘ / ĐỘ BÃO HOÀ — bổ sung 2026-08-14.
    # Vì sao phải có: `08-progress-fill` vẫn ra CAM KẸO dù khối ưu tiên + hạ cấp
    # đã chạy. Đo bằng chính prompt dựng ra: 8 chữ được gọi đích danh (jelly,
    # glossy, vivid, orange-to-coral, gradient, specular, metal, gold) nhưng
    # "warm" và "bright" SỐNG SÓT ⇒ dòng ô vẫn còn nguyên câu "vivid warm …
    # gradient, bright … streak", tức vẫn còn một mệnh lệnh màu ấm đứng sát ô.
    # "warm" thậm chí được nêu làm ví dụ ngay trong khối ưu tiên phía dưới
    # ('warm orange-to-coral gradient') mà lại thiếu trong chính từ điển này.
    "warm", "cool", "dark", "deep", "pale", "bright", "saturated",
    "colorful", "colourful",
}
# CỐ Ý KHÔNG THÊM — đã cân nhắc và loại, đừng "bổ sung cho đủ" ở đợt sau:
#   · glow / glowing / luminous / bloom — với ô `-glow` thì phát sáng LÀ hợp đồng
#     của ô (skel.matte == "glow", nền ô đen, slicer tách alpha theo kênh sáng).
#     Bảo model "đừng vẽ glow" là xoá luôn thành phần đó.
#   · smooth — spec ô glow-burst dùng nó làm YÊU CẦU CHẤT LƯỢNG
#     ("the glow must be perfectly SMOOTH and CLEAN — no film grain"), không phải preset.
#   · light — vừa là "thin light outer rim" (sắc độ) vừa là "the light effect is
#     drawn ADDITIVELY" trong đoạn phụ của ô glow. Hạ cấp là đá nhầm vế thứ hai.
#   · soft / flat / highlight / darker — dính hình dáng hoặc TRẠNG THÁI
#     ("flat background color of the sheet must show through" là hợp đồng chroma-key;
#     "but darker, pushed-in look" là trạng thái nhấn của nút).


# CAP của danh sách từ được nêu đích danh. Bản cũ cắt cứng `hits[:10]` KHÔNG BÁO
# GÌ — và `08-progress-fill` đang đứng đúng 10/10 (jelly, glossy, vivid, warm,
# orange-to-coral, gradient, bright, specular, metal, gold), tức thêm một từ vật
# liệu nữa vào spec là từ thứ 11 rơi âm thầm và ô lại ra màu preset. Đo trên
# styles.json hiện tại: 122 component, đúng 1 ô chạm cap, dài nhất 86 ký tự.
# Nới lên 24 từ / 320 ký tự (gấp ~4 lần chỗ đang dùng, vẫn chặn prompt phình) và
# LUÔN kêu ra stderr khi phải cắt.
PRESET_WORD_CAP = 24
PRESET_CHAR_CAP = 320

# ── VÌ SAO Ở ĐÂY KHÔNG CÒN BẢNG MÀU CHROMA-KEY ────────────────────────────────
# Từng có `CHROMA_KEYS` / `key_of()` ở đúng chỗ này để chọn màu nền giả-trong-suốt
# (magenta / green / cyan / blue) rồi nhét tên màu vào prompt. Bỏ vì image_gen của
# codex 0.149 trả về RGBA thật: prompt nay xin thẳng nền trong suốt, không xin màu.
#
# `slice.py` cũng KHÔNG còn `KEY_COLORS` lẫn đường tách chroma. Đoạn trên từng ghi
# là "vẫn giữ để cắt lại sheet cũ" — không còn đúng: chủ sản phẩm đã chốt bỏ HẲN,
# và hệ quả đã biết là sheet raw ĐỜI CŨ (nền magenta/green) không cắt lại được nữa,
# phải sinh lại. Nay chỉ còn ĐÚNG MỘT đường trong cả engine: alpha thật.
#
# Và vì chỉ còn một đường nên nó phải được KIỂM, không chỉ được XIN: xem
# `alpha_verdict` ở đầu file — RGBA, có chỗ alpha = 0, và có dải mờ liên tục (dải mờ
# 0% là dấu vân tay của một phép tách bằng script, không phải alpha do model vẽ).


def preset_words(spec, tag=""):
    """Các từ VẬT LIỆU/MÀU có mặt trong spec — để nêu đích danh mà HẠ CẤP chúng.
    Trả về theo thứ tự xuất hiện, giữ nguyên dạng gốc, không trùng lặp."""
    hits, seen = [], set()
    for tok in re.findall(r"[A-Za-z0-9][A-Za-z0-9-]*", spec):   # bắt cả "3D"
        low = tok.lower()
        if low in seen:
            continue
        if any(p in MATERIAL_WORDS for p in [low] + low.split("-")):
            seen.add(low)
            hits.append(tok)
    kept, used = [], 0
    for w in hits:
        if len(kept) >= PRESET_WORD_CAP or used + len(w) + 2 > PRESET_CHAR_CAP:
            break
        kept.append(w)
        used += len(w) + 2
    if len(kept) < len(hits):
        print(f"⚠ {tag or 'spec'}: cắt {len(hits) - len(kept)}/{len(hits)} từ vật liệu "
              f"khỏi câu hạ cấp (cap {PRESET_WORD_CAP} từ / {PRESET_CHAR_CAP} ký tự) — "
              f"BỊ BỎ: {', '.join(hits[len(kept):])}. Những từ này KHÔNG được hạ cấp "
              f"nên ô có thể ra màu/vật liệu preset thay vì art style.", file=sys.stderr)
    return kept


# ── TỪ TẢ KẾT CẤU BỀ MẶT / KHỐI: PHẢI XOÁ HẲN, KHÔNG "NÊU RỒI CẤM" ────────────
# Đo trên dự án thật hello-368a (art style = ảnh ref UI kiếm hiệp MỰC HOẠ PHẲNG):
#   · sheet `nen` và 3 sheet `pose-*` — spec KHÔNG có chữ vật liệu nào, 0 câu hạ
#     cấp ⇒ ảnh ra ĐÚNG mực hoạ phẳng của ref.
#   · sheet `ui` (11 câu hạ cấp) và `dao-cu` (8 câu) ⇒ ảnh ra NHỰA BÓNG 3D:
#     nút viên nang đỏ kẹo có vành bevel, nút tròn mái vòm, mảnh ghép đùn khối,
#     huy chương kim loại — tức đúng preset của thư viện element, không phải ref.
# Cùng một prompt, cùng một ảnh ref đính kèm, khác nhau đúng ở chỗ dòng ô có hay
# không có chữ 'glossy 3D … bevel'. Kết luận: câu "the words glossy, 3D … do NOT
# paint them" KHÔNG gỡ được mồi — nhắc tên một kết cấu rồi phủ định vẫn là nhắc,
# và nó đứng sát ô nên thắng cả khối ưu tiên lẫn khối Art style ở cuối.
#
# Nên: với từ chỉ nói BỀ MẶT / ĐỘ BÓNG / ĐỘ NỔI KHỐI — thứ không mang chút hợp
# đồng hình học hay trạng thái nào — thì XOÁ khỏi câu spec trước khi ghép prompt.
# Model không đọc thấy thì không có gì để bắt chước; hình dáng, bộ phận và trạng
# thái vẫn còn nguyên trong câu.
#
# CỐ Ý KHÔNG XOÁ (vẫn hạ cấp bằng cách nêu tên như cũ):
#   · MỌI TỪ MÀU (red, blue, gold, silver, bronze, grey…) — màu là VAI TRÒ và là
#     thứ phân biệt ô với ô: 45/46/47-rank-badge chỉ khác nhau ở GOLD/SILVER/
#     BRONZE, 44-btn-pill-disabled dựa vào 'desaturated grey' để ra trạng thái mờ.
#     Xoá là mất nghĩa, đúng cái bẫy mà bản trước đã tránh.
#   · matte / desaturated / muted / vivid / bright / dark… — sắc độ mang TRẠNG
#     THÁI (locked, disabled, active).
#   · glass / glassy / frosted / translucent / gel — 09-popup-panel là ô kính
#     THẬT: slice.py có nhánh matte kính, xoá chữ là hỏng luôn khâu cắt.
#   · metal / wood / stone / paper… — chất liệu định danh món đồ, và còn xuất
#     hiện trong mệnh lệnh PHỦ ĐỊNH ("NO metal or gold rim" của 08-progress-fill).
FINISH_WORDS = {
    "3d", "glossy", "gloss", "candy", "jelly", "gummy", "plastic", "metallic",
    "chrome", "foil", "enamel", "lacquer", "specular", "bevel", "beveled",
    "bevelled", "gradient", "sheen", "shiny", "polished", "iridescent",
    "holographic", "pearlescent", "waxy", "creamy", "velvety", "satin", "silk",
    "velvet", "brushed", "porcelain", "ceramic", "marble",
}
assert FINISH_WORDS <= MATERIAL_WORDS, "FINISH_WORDS phải là tập con của MATERIAL_WORDS"

# ── TỪ MÀU: CŨNG XOÁ HẲN — SPEC CỦA Ô CHỈ CÒN NÓI *NÓ LÀ CÁI GÌ* ─────────────
# Bản trước CỐ Ý GIỮ mọi từ màu, lý lẽ là "màu là VAI TRÒ và là thứ phân biệt ô
# với ô". Lý lẽ đó đúng một nửa, và nửa sai đã đo được: từ màu literal đứng SÁT Ô
# — đúng vị trí mà chính khối trên vừa chứng minh là thắng cả khối ưu tiên lẫn
# khối Art style — nên `01-btn-pill-red` ra ĐỎ bất kể bảng màu thương hiệu là gì.
# Chủ sản phẩm báo đúng triệu chứng đó: "màu nhận diện thương hiệu không được
# respect". Không thể vừa để một mệnh lệnh màu cạnh ô vừa mong bảng màu thắng.
#
# Nên: spec của element chỉ còn tả NÓ LÀ CÁI GÌ và Ở TRẠNG THÁI NÀO (nút, popup,
# checkbox bật/tắt, thẻ hạng). Màu do bảng màu thương hiệu + ảnh ref quyết định.
#
# NỬA ĐÚNG CỦA LÝ LẼ CŨ VẪN PHẢI GIỮ, và đây là phần dễ làm hỏng: 45/46/47-rank-
# badge chỉ khác nhau ở GOLD/SILVER/BRONZE, `44-btn-pill-disabled` dựa vào
# 'desaturated grey' để ra trạng thái mờ. Xoá trần là ba cái huy chương thành y
# hệt nhau. Nên từ màu nào MANG THỨ HẠNG/TRẠNG THÁI thì không biến mất — nó được
# DỊCH sang vai trò (`COLOUR_ROLE`) rồi phát lại thành một tag riêng, tức giữ
# nguyên sự phân biệt mà không ra lệnh một màu cụ thể nào.
COLOUR_ROLE = {
    "gold": "highest tier / rank 1", "golden": "highest tier / rank 1",
    "silver": "second tier / rank 2",
    "bronze": "third tier / rank 3", "copper": "third tier / rank 3",
    "desaturated": "inactive / disabled", "muted": "inactive / disabled",
    "grey": "neutral", "gray": "neutral", "charcoal": "neutral",
}
COLOUR_WORDS = {
    "red", "orange", "coral", "gold", "golden", "silver", "bronze", "copper",
    "blue", "green", "yellow", "purple", "violet", "pink", "white", "black",
    "grey", "gray", "cream", "ivory", "teal", "cyan", "magenta", "brown", "beige",
    "amber", "crimson", "scarlet", "turquoise", "lime", "navy", "maroon", "peach",
    "mint", "lavender", "burgundy", "olive", "tan", "charcoal",
    "desaturated", "muted", "vivid", "warm", "cool", "bright", "dark", "pale",
    "neon", "pastel",
}
assert COLOUR_WORDS <= MATERIAL_WORDS, "COLOUR_WORDS phải là tập con của MATERIAL_WORDS"
# CỐ Ý KHÔNG NẰM TRONG ĐÂY: glass/glassy/frosted/translucent/gel (slice.py có
# nhánh matte kính, xoá chữ là hỏng khâu CẮT chứ không chỉ khâu vẽ) và
# metal/wood/stone/paper (chất liệu định danh món đồ, không phải phong cách).
STRIP_WORDS = FINISH_WORDS | COLOUR_WORDS

# Từ phủ định đứng ngay trước: "no gloss", "NO metal or gold rim" — xoá danh từ
# sau nó là lật ngược nghĩa câu (từ "đừng bóng" thành "bóng"). Giữ nguyên.
_NEGATORS = {"no", "not", "never", "without", "non"}

# Giới từ chỉ dẫn vào MỘT TỪ MÀU ("badge in GOLD", "rim of silver"). Bỏ từ màu mà
# để giới từ ở lại là đẻ ra câu cụt. KHÔNG có "with"/"and": chúng nối mệnh đề thật.
_COLOUR_PREPS = {"in", "of"}

# Danh từ chỉ MẶT PHẲNG TRỪU TƯỢNG của element: một mình chúng không tả gì cả,
# chúng chỉ tồn tại để đỡ cho tính từ vật liệu đứng trước ("gradient face",
# "beveled edge", "glossy foil surface"). Bỏ tính từ đi thì cả mệnh đề thành rác
# ("…plate for one countdown digit, face, edge, top highlight, EMPTY center…"),
# nên mệnh đề nào MẤT CHỮ mà chỉ còn lại toàn nhóm này thì bỏ hẳn mệnh đề.
# KHÔNG có "rim"/"border"/"outline"/"frame": chúng là hợp đồng hình học ("darker
# red rim" vẫn phải còn cái vành), và mệnh đề chứa chúng thường còn từ khác.
_FILLER_NOUNS = {"surface", "face", "finish", "texture", "edge", "highlight",
                 "top", "shading", "look", "tone", "the", "a", "an", "its",
                 "with", "and"}


def _strip_clause(clause):
    """Xoá STRIP_WORDS (bề mặt + màu) trong MỘT mệnh đề. Trả (mệnh đề mới, đã bỏ).

    Token có gạch nối chỉ bỏ ĐÚNG phần thuộc STRIP_WORDS: 'candy-red' rụng cả hai
    nửa (candy = bề mặt, red = màu), còn 'pill-shaped' không đụng tới.

    MỆNH ĐỀ PHỦ ĐỊNH THÌ MIỄN TRỪ TRỌN VẸN, không chỉ token ngay sau từ phủ định.
    Bản trước chỉ nhìn ĐÚNG MỘT token phía trước, nên "NO metal or gold rim" vẫn
    mất chữ `gold` (token trước nó là "or", không phải "no") — tức lệnh cấm bị gặm
    mất một nửa vế. Nay hễ mệnh đề có từ phủ định thì phần còn lại giữ nguyên: một
    mệnh đề cấm là HỢP ĐỒNG, không phải preset để hạ cấp.
    """
    out, dropped, prev, neg = [], [], "", False
    for tok in re.findall(r"\s+|[^\s]+", clause):
        if tok.isspace():
            out.append(tok)
            continue
        m = re.match(r"^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9-]*)([^A-Za-z0-9]*)$", tok)
        if not m or prev in _NEGATORS or neg:
            out.append(tok)
            prev = re.sub(r"[^a-z]", "", tok.lower())
            if prev in _NEGATORS:
                neg = True
            continue
        pre, word, post = m.groups()
        if word.lower() in _NEGATORS:
            neg = True
            out.append(tok)
            prev = word.lower()
            continue
        parts = word.split("-")
        keep = [p for p in parts if p.lower() not in STRIP_WORDS]
        if len(keep) != len(parts):
            dropped += [p for p in parts if p.lower() in STRIP_WORDS]
            if keep:
                out.append(pre + "-".join(keep) + post)
            elif post.strip():
                out.append(post.lstrip())       # giữ dấu câu, bỏ chữ
            else:
                if out and out[-1].isspace():
                    out.pop()                   # nuốt luôn khoảng trắng đứng trước
                # GIỚI TỪ MỒ CÔI: "medal badge in GOLD for this place" mà chỉ bỏ
                # chữ GOLD thì còn "…badge in for this place" — câu hỏng, và câu
                # hỏng là thứ model tự bịa nghĩa để lấp. Giới từ đó tồn tại CHỈ để
                # dẫn vào từ màu vừa bỏ, nên bỏ theo.
                if out and re.sub(r"[^a-z]", "", (out[-1] if out else "").lower()) in _COLOUR_PREPS:
                    out.pop()
                    if out and out[-1].isspace():
                        out.pop()
        else:
            out.append(tok)
        prev = word.lower()
    return re.sub(r"\s{2,}", " ", "".join(out)).strip(), dropped


def colour_roles(dropped):
    """Vai trò rút ra từ những TỪ MÀU vừa bị xoá — thứ duy nhất của màu được giữ.

    Ba huy chương chỉ khác nhau ở gold/silver/bronze; xoá trần là chúng thành y
    hệt nhau. `COLOUR_ROLE` dịch đúng những từ MANG THỨ HẠNG/TRẠNG THÁI sang lời
    nói về vai trò, nên sự phân biệt còn nguyên mà không ô nào bị ra lệnh một màu
    cụ thể. Từ màu thuần tuý (red, blue…) không có trong bảng ⇒ mất hẳn, đúng ý.
    """
    seen = []
    for w in dropped:
        role = COLOUR_ROLE.get(w.lower())
        if role and role not in seen:
            seen.append(role)
    return seen


def strip_finish(spec):
    """Bỏ hẳn từ tả bề mặt/độ nổi khối VÀ từ màu khỏi spec. Trả (spec mới, đã bỏ).

    Cắt theo DẤU PHẨY để mệnh đề nào rỗng nghĩa sau khi xoá thì bỏ trọn — spec
    của thư viện element viết theo lối liệt kê mệnh đề, nên đây là ranh giới an
    toàn nhất. Chỉ tách ở dấu phẩy NGOÀI ngoặc để không xé câu "(the decorated
    track is a SEPARATE element)".
    """
    clauses, buf, depth = [], "", 0
    for ch in spec:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            clauses.append(buf)
            buf = ""
        else:
            buf += ch
    clauses.append(buf)

    kept, dropped = [], []
    for cl in clauses:
        new, cut = _strip_clause(cl)
        dropped += cut
        if cut and new:
            words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z-]*", new)]
            if words and all(w in _FILLER_NOUNS for w in words):
                continue                       # mệnh đề mất hết nghĩa ⇒ bỏ trọn
        if new:
            kept.append(new)
    txt = ", ".join(kept)
    # dấu câu mồ côi do xoá chữ: ", —" thành " —", ", :" thành ":"
    txt = re.sub(r",\s*([—:;])", r" \1", txt)
    txt = re.sub(r"\s{2,}", " ", txt).strip(" ,;")
    return txt, dropped


for s in cfg["styles"]:
    for sh in cfg["sheets"]:
        if sh.get("styles") and s["id"] not in sh["styles"]:
            continue                      # sheet riêng của style khác (vd pose-<char>)
        cols, rows = sh["grid"]["cols"], sh["grid"]["rows"]
        comps = sh["components"]
        assert len(comps) == cols * rows, f'{sh["id"]}: {len(comps)} component ≠ lưới {cols}x{rows}'
        real = [c for c in comps if c["skel"].get("shape") != "empty"]
        n_real = len(real)
        portrait = sh.get("orient") == "portrait"
        # ⚠️ SHEET FULL-BLEED NHẬN DIỆN THEO skel.shape, KHÔNG theo id sheet.
        # Bản cũ: `if sh["id"] != "bg"`. Nhưng id sheet do NGƯỜI DÙNG/agent đặt —
        # dự án thật đặt "nen", "background", "bg-scene"… nên nhánh full-bleed gần
        # như KHÔNG BAO GIỜ chạy, và sheet nền lãnh đúng câu dành cho ô UI:
        # "keeping at least 40px of empty background padding on every side of the
        # element; … never touch the image edges". Model làm theo ⇒ cảnh nền bị
        # vẽ THỤT VÀO, chừa nguyên khung chroma-key quanh 4 cạnh; slice.py cắt ô
        # full-bleed KHÔNG key gì cả nên viền key đó đi thẳng vào asset (đã dính:
        # viền magenta 40-55px quanh 25-bg-home ở lần gen thứ hai của BlindTest-B2).
        # Ngay cả nhánh "bg" cũ cũng hỏng: toán tử ba ngôi chỉ buộc vào DÒNG CUỐI
        # nên hai dòng "40px padding" vẫn được in ra trước câu "edge to edge".
        full_bleed = n_real > 0 and all(c["skel"].get("shape") == "full" for c in real)
        nine_element = (
            cols == 3 and rows == 3 and len(comps) == 9
            and all(c["skel"].get("shape") != "empty" for c in comps)
        )
        layout_note = (
            [
                "This is the v14+ NINE-ELEMENT production layout: exactly nine outer cells",
                "in a locked 3-by-3 landscape sheet. Keep this density and cell order;",
                "never repack the nine elements into another grid.",
            ]
            if nine_element else
            [
                "The contract grid is immutable for this sheet. Do not convert it to a",
                "different density or repack elements; the nine-element v14+ layout applies",
                "only when the contract itself declares a complete 3-by-3 nine-cell sheet.",
            ]
        )
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
        lines = [
            "Canvas orientation: " + ("PORTRAIT 1024x1536." if portrait else "LANDSCAPE 1536x1024."),
            (f"A sheet of {n_real} full-bleed background scenes for a mobile mini-game."
             if full_bleed and n_real > 1 else
             "A single full-bleed background scene for a mobile mini-game." if full_bleed else
             "A game UI kit sprite sheet for a mobile mini-game marketing campaign."
             if len(comps) > 1 else
             "A single full-bleed background scene for a mobile mini-game."),
            f"Exactly {n_real} elements arranged in a STRICT grid of {cols} columns and {rows} rows, evenly spaced."
            + ("" if n_real == len(comps) else
               f" The LAST {len(comps) - n_real} cell(s) of the grid are INTENTIONALLY EMPTY:"
               " draw absolutely nothing there — the whole cell stays fully transparent."),
            *layout_note,
            *place,
            "",
            # ── Khối neo hình học — theo prompt crop-safe v15 của spike safe-zone
            #    (docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md §5.3). Điểm khác bản trước:
            #    nói RA HẬU QUẢ ("phần mềm sẽ crop đúng 4 toạ độ này") thay vì chỉ ra
            #    lệnh "respect the frame", và cấm THẲNG hành vi hỏng phổ biến nhất mà
            #    §8.1 đã đo: model co mặt nội dung lại để nhét viền vào trong.
            "The FIRST attached image is the geometry contract and the edit target for this",
            "exact sheet: it decides canvas, cell positions, sizes, proportions and centers.",
            "In each cell the dark rectangular frame is the INNER CROP BOX and the gray",
            "silhouette, centered inside it, is the exact required functional CORE.",
            "",
            "The inner crop box is a production SAFE ZONE: after generation, software crops",
            "each asset using those exact four coordinates. Therefore:",
            "- the finished functional CORE must keep the EXACT center of the crop box;",
            "- its continuous CORE must match the gray silhouette exactly — same left, top,",
            "  right and bottom extents, same footprint;",
            "- NEVER shrink the CORE to make room for a border or rim;",
            "- never enlarge, stretch, move, offset or recenter it;",
            "- a shifted or undersized CORE is unusable and will be regenerated.",
            "",
            "V16 GUIDE CONTRACT: the attached gray silhouette and local guide box mark the",
            "OUTERMOST boundary of the functional CORE for this style. The guide is not an",
            "invitation to enlarge the artwork: fit the continuous core INSIDE it, never beyond",
            "its left, top, right or bottom edge. If a rim or decoration needs more room, put it",
            "outside the core and let it overflow; do not spend core pixels on the rim.",
            "",
            "Build each element in three layers, from the inside out:",
            "1) one continuous, clean content surface replacing the gray silhouette, on the",
            "   same footprint;",
            "2) the rim/border immediately OUTSIDE that footprint — it must not consume or",
            "   reduce the safe-zone surface;",
            "3) flowers, ribbons, tassels, jewels, sparkles and filigree farther outside as",
            "   overflow decoration; they may cross the frame but must stay inside their own",
            "   cell and never cross into another cell.",
            "Keep the crop-safe area clean: no decoration may cover the functional surface.",
            "The continuous enamel/content surface is the CORE and the only layer scored for",
            "geometry. Measure intrusion one-sided: core missing inside the safe zone is a",
            "failure; decoration or core extending outside the safe zone is harmless if it",
            "stays in the element's own cell.",
            "",
            "Cells with NO dark frame: the gray silhouette itself is the placement guide —",
            "draw the element centered on it at the same size, in natural proportions,",
            "keeping generous empty padding inside the cell.",
            "Keep the existing cell boundaries and guide positions; do not invent extra cells",
            "or guides. Guide lines and gray fills are alignment references only, never",
            "decoration: do NOT paint their gray color, frames, grid lines or plain shapes",
            "into the artwork.",
            "The grid lines and local guides exist ONLY in the first attached skeleton",
            "reference. They are alignment marks, not artwork: never reproduce, redraw, or",
            "leave any guide or grid line in the generated output.",
            "",
            # ── NỀN: ALPHA THẬT, KHÔNG CÒN CHROMA-KEY ────────────────────────
            # Vì sao đổi: image_gen của codex 0.149 trả về RGBA thật. Chroma-key
            # là cách CŨ để giả trong suốt khi công cụ không có alpha — và nó phải
            # trả giá: viền nhiễm màu key, quầng sáng mất, kính phải giải ngược
            # C = α·F + (1−α)·K. Có alpha thật thì mọi thứ đó biến mất.
            # BẪY: khi không tạo được trong suốt, model KHÔNG báo lỗi mà VẼ MỘT
            # TẤM CARO GIẢ ở α=255 (đo được, BACKLOG #24 ⑦). Nên câu dưới cấm
            # đích danh việc vẽ caro, và slice.py còn soi kênh α để chặn lần nữa.
            "BACKGROUND of the sheet: FULLY TRANSPARENT. Save a PNG with a real alpha",
            "channel; every pixel that is not part of a drawn element must have alpha = 0.",
            "This background rule OVERRIDES the art style and every reference image: never",
            "use a style-colored, scene, gradient or flat-colour background for the sheet.",
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
            # ⚠️ KHÔNG quay lại luật "mỗi element phủ 70-80% bề ngang ô". Đó là một chỉ
            #    thị hình học THỨ HAI đá nhau với khối crop-safe ở trên, và nó đẩy model
            #    đúng về phía lỗi mà handoff §8.1 đo được: co mặt nội dung vào trong.
            #    Kích thước đã nằm trong skeleton (skel.w/h); prompt chỉ nói tính nhất quán.
            "SIZING: the skeleton decides every size. Do not rescale anything to look tidy;",
            "elements of the same kind simply share one consistent visual weight and finish.",
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
        if sh.get("ref"):
            lines += [
                "The SECOND attached image is a character REFERENCE PHOTO: every character",
                "cell must show EXACTLY this character — same species, face, colors, costume,",
                "materials and proportions — re-drawn cleanly in this sheet's art style.",
                "This rule OVERRIDES everything else: if the art style description or any other",
                "reference image mentions or shows a DIFFERENT mascot/character, IGNORE that one",
                "completely — the reference photo is the ONLY source of the character's identity.", ""]
        # Branding: mode "colors" → dòng palette; mode "image" → ảnh brand đính kèm
        # ⚠️ BẢNG MÀU VÀ ẢNH BRAND KHÔNG CÒN LOẠI TRỪ NHAU.
        # Bản cũ: dòng palette chỉ in khi `bmode == "colors"`, còn ảnh brand chỉ
        # đính khi `bmode == "image"`. Mà `kitset-to-contract.ts` đặt
        # `mode = brandRefs.length > 0 ? "image" : "colors"` ⇒ **tải logo lên là
        # MẤT TRẮNG dòng màu thương hiệu**: ảnh được đính, nhưng câu "dùng
        # #xxxxxx làm màu chủ đạo" biến mất khỏi prompt. Đúng triệu chứng chủ sản
        # phẩm báo: "màu nhận diện thương hiệu và logo không được respect".
        # Hai thứ đó không mâu thuẫn — chúng trả lời hai câu hỏi khác nhau (màu
        # nào / vẽ theo lối nào), nên nay CÓ GÌ DÙNG NẤY, và thứ hạng nói rõ ở
        # khối "COLOUR AUTHORITY" bên dưới.
        b = s.get("brand") or {}
        if b.get("primary"):
            bl = f"Brand palette: primary {b.get('primary')}, secondary {b.get('secondary')}"
            if b.get("gradient"):
                bl += f", gradient {b['gradient']}"
            lines += [bl + " — use these as the dominant UI colors.", ""]
        use_brand_refs = bool(b.get("refs"))
        # ⚠️ ẢNH PHONG CÁCH ĐÃ TẢI LÊN THÌ PHẢI ĐƯỢC DÙNG.
        # Bản cũ: `use_inspo = styleMode == "inspo" and inspo`. Nhưng wizard hiện tại
        # KHÔNG còn chỗ nào đặt `styleMode = "inspo"` — `StyleStep.tsx:76` chỉ đặt
        # "prompt" khi gõ mô tả, và `model.ts:395` mặc định cũng là "prompt" (nút
        # segmented "Dùng ảnh tham khảo" đã bị bỏ ở đợt làm lại wizard). Hệ quả:
        # `use_inspo` LUÔN sai ⇒ dòng 170 không đính ảnh phong cách vào `codex exec`
        # ⇒ ảnh ra không bám ref, và mô tả vật liệu mặc định của từng ô ('glossy',
        # 'candy', '3D'…) là thứ DUY NHẤT dẫn dắt style. Đúng triệu chứng người dùng báo.
        # Nay: có ảnh phong cách = dùng ảnh phong cách. `styleMode` chỉ còn quyết định
        # có GIỮ thêm câu mô tả của người dùng hay không (xem khối "Art style" bên dưới).
        has_inspo = bool(s.get("inspo"))
        use_inspo = has_inspo
        if use_brand_refs or use_inspo:
            lines += [
                "Also attached: brand / inspiration reference images — match their color",
                "mood, material finish and overall vibe (do NOT copy their layout).",
                "IMPORTANT: even though the reference images have their own backgrounds,",
                "the sheet background MUST still be fully transparent as stated above —",
                "NEVER reuse a reference background color, especially not for character cells.", ""]
        if sh.get("note"):
            lines += [sh["note"], ""]
        # ⚠️ THỨ TỰ ƯU TIÊN PHẢI ĐƯỢC NÊU NGAY CẠNH DANH SÁCH Ô, KHÔNG PHẢI Ở CUỐI.
        # Dòng `N) <spec>` là spec VẬT LIỆU CỨNG lấy nguyên văn từ thư viện element
        # ("glossy 3D candy-red capsule button…", "vivid warm orange-to-coral
        # gradient…"). Câu override đứng tận cuối prompt (khối "Art style") thua
        # ngay: model đọc mô tả CỤ THỂ, SÁT NGỮ CẢNH của từng ô rồi vẽ preset đó
        # (đã đo trên BlindTest-B2: sheet nền + mascot bám style sci-fi neon, còn
        # 01-btn-pill-red và 08-progress-fill ra thẳng preset kẹo đỏ / cam-coral).
        # Cách sửa: KHÔNG cắt xén spec (mất nghĩa hình dáng/trạng thái), mà đặt
        # ngay TRƯỚC danh sách một khối phân vai — spec = hình dáng + chức năng +
        # trạng thái, style = vật liệu + màu — và nói rõ ai thắng ai.
        # Không đụng khối neo hình học phía trên: KHÔNG bắt model vẽ lại grid (§8.1).
        style_override = use_inspo or bool(s.get("style"))
        if style_override:
            src = ("the attached inspiration reference image(s) and the ART STYLE block"
                   if use_inspo else "the ART STYLE block")
            lines += [
                "HOW TO READ THE NUMBERED ELEMENT LIST BELOW — priority order, highest first:",
                "1. GEOMETRY — the attached skeleton: canvas, cell, position, size, safe zone.",
                f"2. ART STYLE — {src} at the end of this prompt. It alone decides",
                "   MATERIAL, TEXTURE, FINISH, LIGHTING, PALETTE, every actual COLOR — and the",
                "   RENDERING TECHNIQUE, including how much DEPTH and VOLUME an element has.",
                "   Buttons, chips, plates, panels and props are drawn with EXACTLY the same",
                "   technique and the same amount of relief as the art style — never more, never",
                "   less: add no depth, no volume and no surface effect the art style itself",
                "   does not show, and flatten nothing that it does show.",
                "3. The numbered specs — they define ONLY what each element IS and DOES:",
                "   its SHAPE, its LAYOUT and parts, and its STATE (filled / outline / hollow /",
                "   open / closed / active / disabled).",
                # KHÔNG nêu ví dụ bằng chữ vật liệu THẬT ('glossy', '3D', 'plastic'…).
                # Chính câu ví dụ đó bơm kết cấu vào MỌI prompt, kể cả sheet nền vốn
                # sạch. Nói bằng TÊN LOẠI là đủ nghĩa mà không mồi một diện mạo nào.
                "Any remaining material, finish, surface or colour word inside a numbered spec is",
                "only the element library's DEFAULT preset, never a request.",
                "It is OUTRANKED by the art style: do NOT paint it. Keep the spec's shape and its",
                "COLOR ROLE (primary / secondary / neutral / accent / warning) and re-render that",
                "role in the art style's own materials and palette.",
                "Shape and state words (capsule, pill, wide, rounded caps, outline, hollow,",
                "see-through, inner filling, no frame, blank face…) are REQUIREMENTS — always obey.",
                "Result: all elements must look like they came from the SAME art style as the",
                "backgrounds and characters of this project, never from a generic default UI kit.",
                "",
            ]
            # ── AI QUYẾT MÀU: một trọng tài, nói ngay cạnh danh sách ô ──────────
            # Trước bản này có tới BA nguồn màu mà không ai phân xử: dòng bảng màu
            # thương hiệu (ở xa), ảnh ref (ở xa), và TỪ MÀU LITERAL nằm ngay trong
            # spec của ô (sát nhất ⇒ luôn thắng). Nay từ màu đã bị xoá khỏi spec
            # (COLOUR_WORDS) nên chỗ này chỉ còn phải nói ai bảo ai, và nói ở đúng
            # vị trí mà mọi phép đo đều cho thấy là vị trí có trọng lượng nhất.
            authority = ["COLOUR AUTHORITY — read this before choosing any colour:"]
            if b.get("primary"):
                authority += [
                    "1. The BRAND PALETTE above is the source of every colour in this sheet.",
                    "   Its primary is the dominant colour of primary actions and key surfaces;",
                    "   its secondary carries secondary actions; neutrals are derived from them.",
                ]
                if use_brand_refs or use_inspo:
                    authority += [
                        "2. The attached reference image(s) decide the RENDERING — technique,",
                        "   material, texture, lighting, amount of depth. They do NOT decide hue:",
                        "   re-tint whatever they show into the brand palette above.",
                    ]
            elif use_brand_refs or use_inspo:
                authority += [
                    "1. The attached reference image(s) decide both the rendering AND the palette.",
                ]
            authority += [
                "The numbered specs below name NO colour at all — that is deliberate, not an",
                "omission. Where two cells must differ (rank 1 / 2 / 3, on / off, active /",
                "locked / disabled), a [COLOUR ROLE ONLY: …] tag says which role each one holds;",
                "express that difference with shades of the palette above, keeping the order",
                "readable, and never by inventing a colour the palette does not contain.",
                "",
            ]
            lines += authority
        for r in range(rows):
            lines.append(f"Row {r + 1}, left to right:"
                         if not style_override else
                         f"Row {r + 1}, left to right (shape / function / state — materials and colors come from the ART STYLE):")
            for c in range(cols):
                i = r * cols + c
                spec = comps[i]["spec"]
                # ① XOÁ TỪ TẢ BỀ MẶT/ĐỘ NỔI KHỐI TRƯỚC ĐÃ (xem FINISH_WORDS).
                # Chỉ khi có art style — không có style thì preset thư viện CHÍNH
                # LÀ diện mạo mong muốn, xoá đi là làm nghèo spec.
                roles = []
                if style_override:
                    spec, _cut = strip_finish(spec)
                    roles = colour_roles(_cut)
                # ⚠️ QUÉT TỪ VẬT LIỆU TRÊN SPEC CỦA THƯ VIỆN (đã xoá ở bước ①),
                # TRƯỚC khi nối câu hợp đồng của engine. Bản cũ quét SAU nên ô
                # glow bị chính engine tự bắn vào chân: câu "SPECIAL CELL
                # BACKGROUND … PURE BLACK #000000" làm 'BLACK' lọt vào danh sách
                # hạ cấp ⇒ prompt vừa bắt vẽ nền đen vừa bảo "do NOT paint black"
                # (đã kiểm: prompt ipay-main ô 4 liệt kê 'golden, BLACK'). Nêu tên
                # màu key trong câu đó còn kéo thêm 'magenta' vào.
                # Quét SAU bước ① cũng là bắt buộc: câu hạ cấp NHẮC LẠI từng chữ
                # nó liệt kê, nên liệt kê chữ vừa xoá là mời nó quay lại prompt.
                preset = (preset_words(spec, f"{s['id']}-{sh['id']} ô {i + 1} "
                                             f"({comps[i]['file']})")
                          if style_override else [])
                if comps[i]["skel"].get("matte") == "glow":
                    # NỀN ĐEN ĐÃ BỎ. Nó từng là cách duy nhất lấy được quầng sáng:
                    # vẽ cộng sáng trên đen ⇒ C = α·F ⇒ slicer đọc alpha ra từ độ
                    # sáng. Có alpha thật thì quầng nằm SẴN trong kênh α, đủ cả
                    # dải mờ — đo trên ảnh mẫu chủ sản phẩm gửi: 12,96% pixel nằm
                    # ở dải α 1..191 (BACKLOG #24 ⑤). Giữ nền đen bây giờ chỉ tổ
                    # nướng một mảng đen vào asset.
                    # THỦ PHẠM THẬT SỰ của cái đế caro: khối "Build each element in
                    # three layers" ở trên ra lệnh "one continuous, clean content
                    # surface replacing the gray silhouette, on the same footprint".
                    # Với ô ÁNH SÁNG thì lệnh đó sai hẳn — không có mặt phẳng nào để
                    # thay cả. Model vẫn tuân lệnh: nó lấp kín bóng silhouette (đúng
                    # hình sao 8 cánh) bằng thứ nó nghĩ là "trong suốt", tức là caro.
                    # Nên câu của ô phải HUỶ lệnh kia một cách nói thẳng, không chỉ
                    # cấm caro — cấm mà không gỡ lệnh lấp thì nó lấp bằng thứ khác.
                    spec += (" — LIGHT EFFECT: for THIS cell, ignore the rule about replacing the"
                             " gray silhouette with a continuous content surface: there is no"
                             " surface here. The gray shape only marks HOW FAR the light reaches;"
                             " it is not an area to fill. This element is pure light. The halo"
                             " fades out by"
                             " LOWERING ALPHA, not by painting paler pixels: at the outer edge the"
                             " alpha reaches 0 while the colour stays the light's own colour, so"
                             " the fade is gradual and never stops at a hard edge. There is NO"
                             " plate of any kind behind the light — no black, no white, no pale"
                             " grey, and above all no checkerboard squares. Every pixel that is"
                             " not lit is simply unpainted")
                elif comps[i]["skel"].get("matte") == "glass":
                    # Trước đây độ trong của kính được ĐO GIÁN TIẾP: nền key lộ qua
                    # thân bao nhiêu thì trong bấy nhiêu, slicer giải ngược
                    # C = α·F + (1−α)·K. Cách đó có một điểm yếu đã ghi ở
                    # docs/design-glass-transparent-panel-2026-08.md §2 — nó phụ
                    # thuộc hoàn toàn vào việc model chịu để key lộ ra. Alpha thật
                    # thì độ trong nằm THẲNG trong kênh α, không phải suy ngược.
                    spec += (" — SEE-THROUGH ELEMENT: the gray silhouette marks the pane, but"
                             " 'replacing it with a continuous content surface' here means a"
                             " SEE-THROUGH surface, not a solid one. The body of this element is a"
                             " thin sheet of tinted glass. Draw it with a LOW ALPHA VALUE — about 64 out of 255"
                             " for a clear pane, up to 128 for a strongly tinted one — keeping the"
                             " glass's own tint colour at that low alpha. Do NOT fake it with"
                             " paint: no opaque fill, no white or pale grey wash, and above all no"
                             " checkerboard squares. Lower alpha, not lighter paint. Frame, rim,"
                             " bevel and specular highlights stay fully opaque")
                # Hạ cấp NGAY TRÊN DÒNG CỦA Ô. Khối ưu tiên phía trên là luật chung;
                # nhưng model bám mô tả cụ thể nhất ở cạnh nó, nên phải gọi ĐÍCH DANH
                # những chữ vật liệu/màu có trong chính spec này (đo thật: chỉ có khối
                # ưu tiên thôi thì 01-btn-pill-red vẫn ra đỏ kẹo bóng, chỉ thêm được
                # viền neon). Từ hình dáng/trạng thái không nằm trong từ điển nên
                # không bao giờ bị hạ cấp. (`preset` đã tính ở trên, trên spec ĐÃ
                # xoá từ bề mặt — nên câu này chỉ còn nhắc từ MÀU/SẮC ĐỘ, thứ buộc
                # phải ở lại vì mang vai trò và trạng thái.)
                # Sau bước ① thì spec CHỈ CÒN nói ô này là cái gì và ở trạng thái
                # nào — không còn chữ màu/bề mặt nào để mà hạ cấp. `preset` vì thế
                # thường rỗng; nó ở lại cho những chữ lọt lưới từ điển (và để câu
                # cảnh báo cap vẫn có tác dụng).
                if preset:
                    spec += (f" — [SHAPE, PARTS AND STATE ONLY. The words "
                             f"{', '.join(preset)} are the element library's DEFAULT preset:"
                             f" do NOT paint them. Render this element in the ART STYLE's own"
                             f" materials, textures and palette, keeping only its colour ROLE.]")
                # VAI TRÒ MÀU thay cho MỆNH LỆNH MÀU. Chỉ phát khi ô đó thật sự
                # mất một từ màu mang thứ hạng/trạng thái — ô thường không có tag
                # này, và đó là chủ ý: im lặng ⇒ màu hoàn toàn do bảng màu quyết.
                if roles:
                    spec += (f" — [COLOUR ROLE ONLY: {'; '.join(roles)}. Take the actual colour"
                             f" from the brand palette / reference; this cell names no colour.]")
                lines.append(f"{i + 1}) {spec}")
            lines.append("")
        if use_inspo:
            art = ["Art style: faithfully match the attached inspiration reference image(s) — "
                   "same rendering technique, same amount of depth and volume, same materials, "
                   "palette and level of detail. Every UI element, prop and panel is drawn with "
                   "the SAME technique as the reference: if the reference is flat, they are flat. "
                   "IMPORTANT: this reference OVERRIDES every material, finish and colour word "
                   "left in the per-cell descriptions above — those only describe the element "
                   "library's DEFAULT look. Re-imagine every element in the reference's actual "
                   "materials, textures and palette, keeping only each cell's SHAPE, layout and "
                   "color ROLE (primary vs secondary vs neutral element)."]
            # Mô tả người dùng gõ KHÔNG bị vứt đi nữa (bản cũ nhánh inspo bỏ hẳn `s['style']`,
            # nên chọn ảnh ref = mất trắng câu mô tả). Nó ở đây với thứ hạng rõ ràng: SAU ảnh.
            if s.get("style"):
                art.append(f"Additional direction from the project (SECONDARY to the reference "
                           f"image — never contradict it): {s['style']}.")
        else:
            # Người dùng chỉ GÕ mô tả, không có ảnh ref: bản cũ in trần một câu
            # "Art style: …" — không một chữ nào nói nó thắng spec vật liệu của ô,
            # nên nút/thanh vẫn ra preset thư viện. Nay cùng thứ hạng với nhánh ảnh.
            art = [f"Art style: {s['style']}.",
                   "This art style OVERRIDES every material, finish and colour word left in the "
                   "per-cell descriptions above — those are only the element library's DEFAULT "
                   "preset. It also decides the rendering technique and how much depth and volume "
                   "every element has: UI elements, props and panels carry exactly as much (or as "
                   "little) dimensionality as this style, never more. Re-render every element in "
                   "THIS style's materials, textures and palette, keeping only each cell's SHAPE, "
                   "layout, state and colour ROLE (primary vs secondary vs neutral element)."]
        lines += art + [
            f"All {n_real} elements share the exact same consistent style and belong to one coherent game. "
            "Game-ready UI asset quality, " + ("portrait 2:3." if portrait else "landscape 3:2.")
        ]
        open(f"prompts/{s['id']}-{sh['id']}.txt", "w").write("\n".join(lines))
        # file đính kèm cho job: skeleton trước, ref nhân vật rồi brand/inspo.
        # Một ảnh có thể xuất hiện ở nhiều vai (vd sheet.ref cũng là brand ref).
        # Codex tính token theo từng `-i`; khử trùng lặp ngay lúc dựng argv.
        att = []
        for p in ([f"skeleton/{sh['id']}.png"]
                  + ([sh["ref"]] if sh.get("ref") else [])
                  + (s["brand"]["refs"] if use_brand_refs else [])
                  + (s["inspo"] if use_inspo else [])):
            if p and p not in att:
                att.append(p)
        open(f"prompts/{s['id']}-{sh['id']}.att", "w").write("\n".join(att) + "\n")
        print("prompt →", f"prompts/{s['id']}-{sh['id']}.txt", f"(+{len(att)} ảnh kèm)")
PY

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
  local want_size="1536x1024" want_orient="landscape"
  if head -n1 "prompts/${job}.txt" 2>/dev/null | grep -qi 'PORTRAIT'; then
    want_size="1024x1536"; want_orient="portrait"
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

Generate ONE image with the built-in image_gen tool. The output image MUST be exactly ${want_size} pixels (${want_orient}) — this is a hard requirement, not a preference; do not return any other aspect ratio. Use EXACTLY the prompt between the IMAGE PROMPT markers below. The attached images are, in order: the layout skeleton, then any character reference photo / inspiration images the prompt mentions. Then save/copy the generated PNG to exactly this path: ${ROOT_OUT}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${job}.txt")
--- IMAGE PROMPT END ---"

  local att=()
  while IFS= read -r p || [[ -n "$p" ]]; do
    [[ -n "$p" && -f "${ROOT}/${p}" ]] && att+=(-i "${ROOT}/${p}")
  done < "prompts/${job}.att"

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
    local av; av="$(alpha_verdict "raw/${job}.png")"
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
  while (( $(jobs -pr | wc -l) >= MAXJOBS )); do sleep 2; done
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
