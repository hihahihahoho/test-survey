#!/usr/bin/env bash
# Sinh sprite sheet UI kit bằng codex CLI image-gen: mỗi (style × sheet) một con codex,
# tất cả chạy song song. Contract nằm trọn trong styles.json.
set -uo pipefail
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

# ── MÀU CHROMA-KEY ────────────────────────────────────────────────────────────
# Tập key mà slice.py tách được (slice.py: KEY_COLORS). Interface với webapp CHỈ
# là chuỗi `bg` của style/variant trong styles.json — webapp chọn key xa palette
# rồi ghi vào đó, gen.sh không cần biết gì thêm. Thiếu `bg` hoặc không nhận ra
# tên/hex nào ⇒ magenta, đúng hành vi cũ.
CHROMA_KEYS = {
    "magenta": ((255, 0, 255), "pure vivid magenta #FF00FF"),
    "green":   ((0, 255, 0),   "pure vivid green #00FF00"),
    "cyan":    ((0, 255, 255), "pure vivid cyan #00FFFF"),
    "blue":    ((0, 0, 255),   "pure vivid blue #0000FF"),
}
DEFAULT_KEY = "magenta"


def _axis(rgb):
    """(kênh CAO, kênh THẤP) — soi gương slice.py.key_axis(), để nhận ra hex lạ
    thuộc về key nào."""
    mid = (max(rgb) + min(rgb)) / 2.0
    hi = tuple(i for i in range(3) if rgb[i] >= mid)
    lo = tuple(i for i in range(3) if rgb[i] < mid)
    return (hi, lo) if hi and lo else None


def key_of(style):
    """(tên key, mô tả đưa vào prompt) từ `bg` của style."""
    bg = str(style.get("bg") or "").strip()
    low = bg.lower()
    for name in CHROMA_KEYS:
        if re.search(r"\b%s\b" % name, low):
            return name, bg
    m = re.search(r"#([0-9a-f]{6})\b", low)
    if m:
        v = m.group(1)
        rgb = tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
        ax = _axis(rgb)
        for name, (ref, _d) in CHROMA_KEYS.items():
            if ax and _axis(ref) == ax:
                return name, bg
    if bg:
        print(f"⚠ style {style.get('id')}: bg {bg!r} không thuộc tập key "
              f"{sorted(CHROMA_KEYS)} — dùng {DEFAULT_KEY}. slice.py chỉ tách được "
              f"các key đó.", file=sys.stderr)
    return DEFAULT_KEY, CHROMA_KEYS[DEFAULT_KEY][1]


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

for s in cfg["styles"]:
    key_name, key_desc = key_of(s)
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
        if full_bleed:
            place = [
                f"Each cell is a {sh.get('cell_hint', 'full-bleed scene')}.",
                "Each scene FILLS ITS OWN CELL COMPLETELY, edge to edge, and bleeds off all four",
                "sides of that cell: no border, no frame, no margin, no vignette band — and above",
                "all NOT ONE PIXEL of the flat chroma-key background may show around a scene.",
                ("The ONLY chroma-key allowed on this sheet is a thin 24px gap exactly on the cell"
                 " boundaries between neighbouring scenes."
                 if n_real > 1 else
                 "No flat chroma-key background is used anywhere on this sheet."),
                "A scene inset inside a key-coloured frame is unusable and will be regenerated.",
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
               " draw absolutely nothing there — pure flat background over the whole cell."),
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
            "silhouette, centered inside it, is the exact required functional content.",
            "",
            "The inner crop box is a production SAFE ZONE: after generation, software crops",
            "each asset using those exact four coordinates. Therefore:",
            "- the finished functional surface must keep the EXACT center of the crop box;",
            "- it must fill the gray silhouette exactly — same left, top, right and bottom",
            "  extents, same footprint;",
            "- NEVER shrink the functional surface to make room for a border or rim;",
            "- never enlarge, stretch, move, offset or recenter it;",
            "- a shifted or smaller functional surface is unusable and will be regenerated.",
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
            "",
            "Cells with NO dark frame: the gray silhouette itself is the placement guide —",
            "draw the element centered on it at the same size, in natural proportions,",
            "keeping generous empty padding inside the cell.",
            "Keep the existing cell boundaries and guide positions; do not invent extra cells",
            "or guides. Guide lines and gray fills are alignment references only, never",
            "decoration: do NOT paint their gray color, frames, grid lines or plain shapes",
            "into the artwork.",
            "",
            f"BACKGROUND of the sheet: one flat solid chroma-key color: {key_desc}.",
            "This background rule OVERRIDES the art style and every reference image:",
            "never use a style-colored, scene or gradient background for the sheet.",
            "No gradient, no texture, NO checkerboard or transparency pattern, no grid lines.",
            # Nêu ĐÍCH DANH tên màu key đang dùng: câu "this exact background color"
            # trỏ ngược lên trên, còn tên màu thì model giữ được trong đầu suốt prompt.
            f"The chroma-key of this sheet is {key_name.upper()}: this exact {key_name} — and any"
            f" hue CLOSE to {key_name} — must NEVER appear inside any element; pick element colors"
            " far from it on the color wheel.",
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
            "Every element is FULLY OPAQUE with solid fills — never leave an element interior hollow,",
            "semi-transparent, or showing the background through it (except where a spec explicitly says hollow).",
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
        bmode = s.get("brand", {}).get("mode", "colors")
        if s.get("brand") and bmode == "colors" and s["brand"].get("primary"):
            b = s["brand"]
            bl = f"Brand palette: primary {b.get('primary')}, secondary {b.get('secondary')}"
            if b.get("gradient"):
                bl += f", gradient {b['gradient']}"
            lines += [bl + " — use these as the dominant UI colors.", ""]
        use_brand_refs = bmode == "image" and s.get("brand", {}).get("refs")
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
                "the sheet background MUST still be the exact flat chroma-key color above —",
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
                "   MATERIAL, TEXTURE, FINISH, LIGHTING, PALETTE and every actual COLOR.",
                "3. The numbered specs — they define ONLY what each element IS and DOES:",
                "   its SHAPE, its LAYOUT and parts, and its STATE (filled / outline / hollow /",
                "   open / closed / active / disabled).",
                "Every material, finish and colour word inside a numbered spec ('glossy', '3D',",
                "'candy-red', 'jelly', 'plastic', 'metal', 'gold rim', 'warm orange-to-coral",
                "gradient', 'soft white highlight'…) is only the element library's DEFAULT preset.",
                "It is OUTRANKED by the art style: do NOT paint it. Keep the spec's shape and its",
                "COLOR ROLE (primary / secondary / neutral / accent / warning) and re-render that",
                "role in the art style's own materials and palette.",
                "Shape and state words (capsule, pill, wide, rounded caps, outline, hollow,",
                "see-through, inner filling, no frame, blank face…) are REQUIREMENTS — always obey.",
                "Result: all elements must look like they came from the SAME art style as the",
                "backgrounds and characters of this project, never from a generic default UI kit.",
                "",
            ]
        for r in range(rows):
            lines.append(f"Row {r + 1}, left to right:"
                         if not style_override else
                         f"Row {r + 1}, left to right (shape / function / state — materials and colors come from the ART STYLE):")
            for c in range(cols):
                i = r * cols + c
                spec = comps[i]["spec"]
                # ⚠️ QUÉT TỪ VẬT LIỆU TRÊN SPEC GỐC, TRƯỚC khi nối câu hợp đồng
                # của engine. Bản cũ quét SAU nên ô glow bị chính engine tự bắn
                # vào chân: câu "SPECIAL CELL BACKGROUND … PURE BLACK #000000"
                # làm 'BLACK' lọt vào danh sách hạ cấp ⇒ prompt vừa bắt vẽ nền
                # đen vừa bảo "do NOT paint black" (đã kiểm: prompt ipay-main ô 4
                # liệt kê 'golden, BLACK'). Nêu tên màu key trong câu đó còn kéo
                # thêm 'magenta' vào. Spec của thư viện mới là thứ được hạ cấp.
                preset = (preset_words(spec, f"{s['id']}-{sh['id']} ô {i + 1} "
                                             f"({comps[i]['file']})")
                          if style_override else [])
                if comps[i]["skel"].get("matte") == "glow":
                    # nền ô ĐEN cho hiệu ứng phát sáng: slicer tách alpha theo
                    # kênh sáng (C = α·F trên nền đen) — chính xác tuyệt đối,
                    # hết phụ thuộc model matting đoán vùng glow trộn key
                    spec += (" — SPECIAL CELL BACKGROUND: this ONE cell's background is PURE"
                             " BLACK #000000 filling the whole cell with a hard edge at the"
                             f" cell borders (the {key_name} chroma-key does NOT apply inside"
                             " this cell); the light effect is drawn ADDITIVELY on black — where"
                             " there is no light the cell stays pure black")
                # Hạ cấp NGAY TRÊN DÒNG CỦA Ô. Khối ưu tiên phía trên là luật chung;
                # nhưng model bám mô tả cụ thể nhất ở cạnh nó, nên phải gọi ĐÍCH DANH
                # những chữ vật liệu/màu có trong chính spec này (đo thật: chỉ có khối
                # ưu tiên thôi thì 01-btn-pill-red vẫn ra đỏ kẹo bóng, chỉ thêm được
                # viền neon). Từ hình dáng/trạng thái không nằm trong từ điển nên
                # không bao giờ bị hạ cấp. (`preset` đã tính ở trên, trên spec GỐC.)
                if preset:
                    spec += (f" — [SHAPE, PARTS AND STATE ONLY. The words "
                             f"{', '.join(preset)} are the element library's DEFAULT preset:"
                             f" do NOT paint them. Render this element in the ART STYLE's own"
                             f" materials, textures and palette, keeping only its colour ROLE.]")
                lines.append(f"{i + 1}) {spec}")
            lines.append("")
        if use_inspo:
            art = ["Art style: faithfully match the attached inspiration reference image(s) — "
                   "same rendering technique, materials, palette and level of detail. "
                   "IMPORTANT: this reference OVERRIDES every material/finish word inside the "
                   "per-cell descriptions above ('glossy', '3D', 'plastic', 'candy', specific "
                   "color shades…) — those only describe the DEFAULT look. Re-imagine every "
                   "element in the reference's actual materials, textures and palette, keeping "
                   "only each cell's SHAPE, layout and color ROLE (primary vs secondary vs "
                   "neutral element)."]
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
                   "This art style OVERRIDES every material, finish and colour word inside the "
                   "per-cell descriptions above ('glossy', '3D', 'plastic', 'candy', 'gold', "
                   "specific colour shades…) — those are only the element library's DEFAULT "
                   "preset. Re-render every element in THIS style's materials, textures and "
                   "palette, keeping only each cell's SHAPE, layout, state and colour ROLE "
                   "(primary vs secondary vs neutral element)."]
        lines += art + [
            f"All {n_real} elements share the exact same consistent style and belong to one coherent game. "
            "Game-ready UI asset quality, " + ("portrait 2:3." if portrait else "landscape 3:2.")
        ]
        open(f"prompts/{s['id']}-{sh['id']}.txt", "w").write("\n".join(lines))
        # file đính kèm cho job: skeleton trước, ref nhân vật rồi inspo của style
        att = [f"skeleton/{sh['id']}.png"]
        if sh.get("ref"):
            att.append(sh["ref"])
        if use_brand_refs:
            att += s["brand"]["refs"]
        if use_inspo:
            att += s["inspo"]
        open(f"prompts/{s['id']}-{sh['id']}.att", "w").write("\n".join(att) + "\n")
        print("prompt →", f"prompts/{s['id']}-{sh['id']}.txt", f"(+{len(att)} ảnh kèm)")
PY

run_one() {
  local job="$1"
  local task
  task="Generate ONE image with your image generation tool, at the CANVAS ORIENTATION stated on the first line of the prompt (1536x1024 landscape or 1024x1536 portrait, if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. The attached images are, in order: the layout skeleton, then any character reference photo / inspiration images the prompt mentions. Then save/copy the generated PNG to exactly this path: ${ROOT_OUT}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${job}.txt")
--- IMAGE PROMPT END ---"

  local att=()
  while IFS= read -r p || [[ -n "$p" ]]; do
    [[ -n "$p" && -f "${ROOT}/${p}" ]] && att+=(-i "${ROOT}/${p}")
  done < "prompts/${job}.att"

  # bash 3.2 + set -u: mảng rỗng nổ "unbound variable" nếu expand thẳng
  local t0=$(date +%s)
  local codex_env=()
  [[ -n "$IMG_HOME" ]] && codex_env=(env CODEX_HOME="$IMG_HOME")
  "${codex_env[@]}" codex exec \
    -s workspace-write \
    -C "${ROOT}" \
    --skip-git-repo-check \
    ${att[@]+"${att[@]}"} \
    -o "logs/${job}.last.txt" \
    "${task}" >"logs/${job}.log" 2>&1
  local rc=$?
  # VỚT ẢNH (codex ≥0.147): có khi model sinh ảnh xong nhưng KHÔNG tự copy về đích —
  # tool báo cho model một đường dẫn generated_images không tồn tại trên máy (vd
  # /root/.codex/... khi provider tuỳ biến chạy tool trong container của họ), hoặc model
  # chỉ trả lời đường dẫn rồi thôi. Nếu log nhắc tới một file trong generated_images và
  # file đó TỒN TẠI trong home đang dùng thì vớt về đích. Đường dẫn không tồn tại thật
  # (container remote) thì không vớt được — để phán FAIL như cũ, không đoán mò ảnh khác.
  # `stat -f %m` là cú pháp BSD/macOS. `stat` của Git-Bash là GNU coreutils, ở đó
  # `-f` = --file-system ⇒ lệnh lỗi ⇒ mt=0 ⇒ MỌI job in FAIL dù ảnh đã lưu xong.
  # Fallback GNU `-c %Y` (chép y nguyên khuôn của cover.sh:77,86).
  if [[ $(stat -f %m "raw/${job}.png" 2>/dev/null || stat -c %Y "raw/${job}.png" 2>/dev/null || echo 0) -lt "$t0" ]]; then
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
  # Ảnh được ghi mới trong lượt chạy này = job thành công.
  local mt=$(stat -f %m "raw/${job}.png" 2>/dev/null || stat -c %Y "raw/${job}.png" 2>/dev/null || echo 0)
  if [[ "$mt" -ge "$t0" ]]; then
    if [[ $rc -eq 0 ]]; then
      echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)"
    else
      echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)  (codex rc=${rc} sau khi đã lưu ảnh — bỏ qua)"
    fi
  else
    echo "FAIL ${job} (rc=${rc}, ảnh không được ghi mới — xem logs/${job}.log)"
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
  run_one "$job" &
done < <(python3 -c "
import json
cfg = json.load(open('styles.json', encoding="utf-8"))
for s in cfg['styles']:
    for sh in cfg['sheets']:
        if sh.get('styles') and s['id'] not in sh['styles']:
            continue
        print(f\"{s['id']}-{sh['id']}\")")
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null
