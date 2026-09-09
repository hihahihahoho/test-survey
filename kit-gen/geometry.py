"""geometry.py — TOẠ ĐỘ Ô VÀ SAFE ZONE. Một nguồn duy nhất, hai người dùng.

╔══ VÌ SAO FILE NÀY TỒN TẠI ═══════════════════════════════════════════════════╗
║ Trước 27/08/2026 hình học của một tấm được suy ra ở BA chỗ, mỗi chỗ một công  ║
║ thức viết tay:                                                               ║
║   ① `skeleton-svg.js` vẽ ảnh khung xương đính kèm cho model (cell 1px border  ║
║      ⇒ mọi toạ độ con lệch +1px so với góc ô);                               ║
║   ② khối python của `gen.sh` chỉ nói "xem ảnh đính kèm" — không có số nào;    ║
║   ③ `slice.py` cắt asset bằng công thức riêng (`round(col*cell_w)`, không có  ║
║      cái +1px kia).                                                          ║
║ Nghĩa là ảnh ta ĐƯA cho model và khung ta CẮT theo lệch nhau một pixel, và    ║
║ không ai đọc được điều đó ở đâu cả — nó nằm trong hai file khác ngôn ngữ.     ║
║                                                                              ║
║ Từ khi BỎ SKELETON (không còn ảnh khung xương nào được render/đính kèm),      ║
║ prompt phải TỰ NÓI RA TOẠ ĐỘ. Mà con số trong prompt chỉ có giá trị nếu nó    ║
║ đúng bằng con số dao cắt dùng — hứa một khung rồi cắt một khung khác thì mọi  ║
║ element đều lệch, và lệch LẶNG LẼ. Nên công thức chỉ được có MỘT bản, và bản  ║
║ đó là bản của `slice.py` (bản THẬT SỰ chạm vào pixel).                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

Hai người dùng, cùng import file này:
  · `gen.sh` (khối python)  → dựng khối GEOMETRY trong prompt gửi model;
  · `slice.py`              → tính hộp cắt + hộp safe ghi vào ledger.

File này THUẦN SỐ HỌC: không đọc file, không in chữ tiếng Anh nào. Câu chữ của
prompt là giọng của engine và nó ở lại `gen.sh` (webapp mirror theo `gen.sh`,
không mirror theo đây).
"""

# ── BẢNG KHỔ CANVAS — NGUỒN SỰ THẬT DUY NHẤT ─────────────────────────────────
# Trước đây bảng này được chép ở bốn nơi (gen.sh, run_one, skeleton-svg.js,
# slice.py). Nay: bảng nằm ở ĐÂY; `gen.sh` và `slice.py` import; `run_one` (bash)
# đọc ngược từ chính dòng đầu prompt nên không thể lệch.
#
# ⚠️ VÌ SAO Ô VUÔNG LÀ 1254x1254 CHỨ KHÔNG PHẢI 1024x1024 HAY 2048x2048.
# Đã soi binary codex 0.149.0 (26/08/2026). Tool `image_gen.imagegen` có ĐÚNG BA
# tham số — `prompt`, `referenced_image_paths`, `num_last_images_to_include` — và
# KHÔNG có `size`. Khổ ảnh do backend chọn, model chỉ lái được TỈ LỆ bằng lời văn.
# Đo 685 ảnh thật do tool sinh ra trên máy này: MỌI ảnh đều xấp xỉ 1.572.864 pixel
# (= 1536×1024) ±1500. Trong đó có 132 ảnh vuông, và tất cả đều là **1254×1254**.
# Ghi 1254 để con số ta hứa với model trùng con số nó thật sự trả về.
CANVAS = {
    "landscape": (1536, 1024, "LANDSCAPE 1536x1024", "landscape 3:2"),
    "portrait":  (1024, 1536, "PORTRAIT 1024x1536",  "portrait 2:3"),
    "square":    (1254, 1254, "SQUARE 1254x1254",    "square 1:1"),
}

#: Ô neo đáy được đẩy xuống một khoảng bằng 4% chiều cao ô. Con số này từng nằm
#: rời ở `skeleton-svg.js` (0.04) và `slice.py` (`round(CH * 0.04)`); gom về đây
#: để không còn hai bản.
BOTTOM_ANCHOR_RATIO = 0.04


def canvas_of(sheet):
    """Khổ của tấm → ``(w, h, header, ratio)``.

    `canvas` ∈ {"landscape","portrait","square"} là field CHÍNH; `orient` (đời cũ,
    chỉ có landscape/portrait) vẫn được đọc để contract cũ chạy nguyên vẹn.

    Giá trị lạ RƠI VỀ landscape chứ không ném: một chữ gõ sai trong contract không
    đáng để giết cả lượt gen, và landscape là khổ mọi tấm đời cũ đang dùng.
    """
    key = str(sheet.get("canvas") or sheet.get("orient") or "landscape").lower()
    return CANVAS.get(key, CANVAS["landscape"])


def cell_size(width, height, cols, rows):
    """Khổ chuẩn của MỘT ô — ``(CW, CH)``, đã làm tròn về pixel nguyên.

    Chia thật (float) rồi mới làm tròn, đúng như `slice.py` làm: 1254/3 = 418 chẵn,
    nhưng 1536/5 = 307,2 thì ô nào cũng phải là 307 chứ không được mỗi ô một khác.
    """
    return round(width / cols), round(height / rows)


def cell_origin(width, height, cols, rows, index):
    """Góc trên-trái của ô thứ `index` (đếm từ 0, quét theo hàng) trên sheet.

    Làm tròn TỪ TOẠ ĐỘ THẬT (`col * cell_w`) chứ không cộng dồn `col * CW`: cộng
    dồn sẽ tích luỹ sai số khi khổ không chia hết, và ô cuối hàng trượt khỏi mép.
    """
    cell_w, cell_h = width / cols, height / rows
    row, col = divmod(index, cols)
    return round(col * cell_w), round(row * cell_h)


def cell_box(width, height, cols, rows, index):
    """Hộp ô trên sheet: ``(x0, y0, x1, y1)``, nửa mở bên phải/dưới."""
    cx0, cy0 = cell_origin(width, height, cols, rows, index)
    cw, ch = cell_size(width, height, cols, rows)
    return cx0, cy0, cx0 + cw, cy0 + ch


def safe_offset_in_cell(cell_w, cell_h, skel):
    """Vị trí safe zone TRONG ô → ``(dx, dy, sw, sh)``.

    Căn giữa ngang; dọc thì `anchor:"bottom"` dán đáy ô, còn lại căn giữa.
    `//2` (chia lấy nguyên) chứ không `round(…/2)`: lệch nửa pixel này đi thẳng vào
    hộp cắt, nên nó phải là ĐÚNG phép mà dao cắt dùng.

    (`contentSafe` — vùng chữ/hitbox khai riêng w/h của đời thử nghiệm — đã bỏ:
    không nơi nào trong app, thư viện element hay bộ dựng contract phát ra nó nữa.)
    """
    sw = round(cell_w * skel["w"])
    sh = round(cell_h * skel["h"])
    if skel.get("anchor") == "bottom":
        dy = cell_h - sh - round(cell_h * BOTTOM_ANCHOR_RATIO)
    else:
        dy = (cell_h - sh) // 2
    return (cell_w - sw) // 2, dy, sw, sh


def safe_box(width, height, cols, rows, index, skel):
    """Hộp safe zone trên SHEET: ``(x0, y0, x1, y1)``.

    Đây là hộp mà prompt hứa với model VÀ là hộp `slice.py` ghi vào ledger — cùng
    một hàm, nên không thể lệch.
    """
    cx0, cy0 = cell_origin(width, height, cols, rows, index)
    cw, ch = cell_size(width, height, cols, rows)
    dx, dy, sw, sh = safe_offset_in_cell(cw, ch, skel)
    return cx0 + dx, cy0 + dy, cx0 + dx + sw, cy0 + dy + sh


#: Lề chừa quanh ô cho phần TRÀN (viền, bevel, bóng, quầng sáng) — 10% mỗi cạnh,
#: nên hộp vẽ lớn nhất bằng 0,8 ô. Vì sao chính con số này: luật safe zone trong
#: prompt cho phép viền/trang trí nằm NGOÀI hộp nhưng cấm chạm element bên cạnh,
#: nên giữa hai hộp cạnh nhau phải còn 20% bề ngang ô. Trước đây "lề" là thứ tàng
#: hình: nó nằm rải trong các phân số `skel.w/h` mà người ta gõ tay (0,78 · 0,86 ·
#: 0,92 …) nên mỗi element chừa một kiểu và không ai đọc ra được luật.
CELL_MARGIN_RATIO = 0.10

#: Lề của ô CÓ VIỀN / TRANG TRÍ — gấp đôi, tức hộp vẽ chỉ còn 0,6 ô.
#:
#: ĐO ĐƯỢC, 09/2026, dự án thật (sheet `ui`, lưới 2x2 trên 1254px ⇒ ô 627px):
#: safe zone chiếm ~78% bề ngang ô, chừa vỏn vẹn ~68px mỗi bên; mà một cái viền
#: cộng đèn lồng cộng hoa mai của nấc «Nhiều» cần quãng 130px. Sổ đo
#: `kits/manifest.json` nói thẳng: `overflowPx` của `01-button` bên phải = 69 và
#: của `03-popover` = 77 — tức phần trang trí CHẠM ĐÚNG mép ô, và `slice.py` (cắt
#: theo `cell_box`) đã chém cụt nó. Lề 0,10 đủ cho một cái viền mảnh, không đủ cho
#: một cái viền có đồ trang trí bám quanh.
#:
#: Vì sao KHÔNG hạ lề cho mọi ô: ô «Không trang trí» vẽ to hết cỡ là đúng — thu nó
#: lại 60% là vứt đi một phần tư độ phân giải của ảnh sinh, cho một khoảng trống
#: không ai dùng tới.
CELL_MARGIN_RATIO_DECOR = 0.20


def cell_margin_ratio(skel):
    """Lề của CHÍNH ô này → tỉ lệ mỗi cạnh.

    `skel.decor` (bool) do webapp ghi ra khi ô được chọn một nấc trang trí khác
    «Không». Contract ĐỜI CŨ không có khoá ấy ⇒ rơi về `CELL_MARGIN_RATIO`, tức là
    đúng hành vi trước đợt này — một dự án cũ mở lên không đổi một pixel nào.

    ⚠️ Đây là NGUỒN DUY NHẤT của con số ấy. `gen.sh` (số in vào prompt), `slice.py`
    (hộp cắt qua `safe_offset_in_cell`) và webapp (`kit-core/lib/geometry.ts`, có ca
    test đọc thẳng file này) đều phải đi qua đây — hai bản lề là hai khung khác nhau
    cho cùng một ô, và chúng lệch LẶNG LẼ.
    """
    return CELL_MARGIN_RATIO_DECOR if (skel or {}).get("decor") else CELL_MARGIN_RATIO


#: Hệ số phóng làm tròn XUỐNG về bước 0,25. Vì sao làm tròn: con số đi thẳng vào
#: câu tiếng Anh của prompt ("drawn at 2.5x"), và "phóng 2,5 lần" là mệnh lệnh mà
#: model làm theo được, còn "phóng 2,0773 lần" thì không. Vì sao XUỐNG chứ không
#: gần nhất: làm tròn lên là cho phép hộp vẽ vượt lề — tức là element tràn sang ô
#: bên cạnh, đúng thứ lề sinh ra để chặn.
DRAW_SCALE_STEP = 0.25

#: Sàn của hệ số khi cỡ đầu ra LỚN HƠN ô (ví dụ ô 313px mà người dùng chọn 304px
#: cho một thanh dài): lúc đó không phóng được nữa, phải THU. Bước 0,05 chứ không
#: 0,25 vì ở dải dưới 1 thì bước 0,25 phí tới một phần tư diện tích ô.
DRAW_SHRINK_STEP = 0.05


def cell_inner(cell_w, cell_h, margin=CELL_MARGIN_RATIO):
    """Phần ô còn lại sau khi trừ lề mỗi cạnh → ``(w, h)`` pixel nguyên."""
    return round(cell_w * (1 - 2 * margin)), round(cell_h * (1 - 2 * margin))


def max_fit_box(cell_w, cell_h, aspect, margin=CELL_MARGIN_RATIO):
    """Hộp LỚN NHẤT có tỉ lệ `aspect` (= w/h) nằm gọn trong ô sau khi trừ lề.

    Đây là hộp mà máy vẽ được yêu cầu lấp: vẽ to hết cỡ ô cho phép để ăn trọn độ
    phân giải của ảnh sinh, rồi code mới co về cỡ thật lúc xuất. Cỡ người dùng
    chọn KHÔNG còn là cỡ vẽ — nó chỉ cho ra TỈ LỆ ở đây (và cỡ đầu ra ở manifest).
    """
    aw, ah = cell_inner(cell_w, cell_h, margin)
    if not aspect or aspect <= 0:
        return aw, ah
    w = min(aw, ah * aspect)
    return round(w), round(w / aspect)


def draw_scale(cell_w, cell_h, out_w, out_h, margin=CELL_MARGIN_RATIO):
    """Hệ số phóng từ cỡ ĐẦU RA lên cỡ VẼ → float đã làm tròn xuống theo bước.

    Vì sao prompt cần con số này chứ không chỉ cần hộp: một cái nút 120x52 vẽ ở
    300x130 phải trông như cái nút nhỏ ấy phóng 2,5 lần — viền dày lên 2,5 lần,
    bo góc to lên 2,5 lần. Không nói hệ số thì model coi hộp 300x130 là cỡ thật
    và vẽ một tấm banner viền mảnh, chi tiết dày đặc: sai độ dày nét, và co về
    120x52 thì nát.
    """
    aw, ah = cell_inner(cell_w, cell_h, margin)
    if out_w <= 0 or out_h <= 0:
        return 1.0
    raw = min(aw / out_w, ah / out_h)
    step = DRAW_SCALE_STEP if raw >= 1 else DRAW_SHRINK_STEP
    return max(step, round(int(raw / step) * step, 2))


def draw_box(cell_w, cell_h, out_w, out_h, margin=CELL_MARGIN_RATIO):
    """Hộp vẽ của một ô → ``(w, h, k)``: cỡ đầu ra nhân hệ số phóng, kẹp trong lề.

    ⚠ CA CỠ ĐẦU RA LỚN HƠN Ô. Bản chốt đầu tiên nói "k >= 1 luôn, hộp = min(out,
    box)" — nhưng `min` theo từng trục làm HỎNG TỈ LỆ: thanh máu 304x78 trong ô
    313 (khung trong 250) sẽ thành 250x78, tức 3,2:1 thay vì 3,9:1, và tỉ lệ mới
    là thứ duy nhất ta thật sự yêu cầu ở máy vẽ. Nên ở ca này k tụt xuống dưới 1
    (bước 0,05) và tỉ lệ được giữ nguyên; prompt nói thật là "drawn at 0.8x".
    """
    k = draw_scale(cell_w, cell_h, out_w, out_h, margin)
    aw, ah = cell_inner(cell_w, cell_h, margin)
    # `min` cuối chỉ đỡ sai số làm tròn nửa pixel — k đã bảo đảm out*k <= khung trong
    return min(round(out_w * k), aw), min(round(out_h * k), ah), k


def cell_kind(skel):
    """Ô này thuộc loại nào — quyết định câu prompt và nhánh cắt.

    · "empty" — ô đệm, không vẽ gì;
    · "full"  — full-bleed, artwork phủ kín ô, KHÔNG có safe zone;
    · "safe"  — mặc định: safe zone LÀ hộp cắt.

    KHÔNG CÒN "free". Nó từng hứa "dao cắt bám lõi đo được", nhưng `slice.py` chưa
    bao giờ có nhánh ấy: mọi ô không full-bleed đều bị cắt theo `safe_offset_in_cell`.
    Cờ `skel.free` của `element-lib.json` nay chỉ còn là nhãn trưng bày bên app.
    """
    shape = skel.get("shape")
    if shape == "empty":
        return "empty"
    if shape == "full":
        return "full"
    return "safe"


def sheet_geometry(sheet):
    """Toàn bộ hình học của một tấm → list dict, một phần tử cho mỗi ô.

    Mỗi phần tử: ``{index, row, col, kind, cell, safe}`` với `row`/`col` đếm từ 1
    (con số NGƯỜI ĐỌC — cả prompt lẫn log đều nói "row 1, col 1"), còn `index` đếm
    từ 0 (con số MÁY dùng để tra `components[index]`). `safe` là ``None`` với ô
    full-bleed và ô trống — hai loại đó không có khung nào để hứa.
    """
    width, height, _header, _ratio = canvas_of(sheet)
    cols, rows = sheet["grid"]["cols"], sheet["grid"]["rows"]
    out = []
    for index, comp in enumerate(sheet["components"]):
        skel = comp.get("skel") or {}
        kind = cell_kind(skel)
        row, col = divmod(index, cols)
        out.append({
            "index": index,
            "row": row + 1,
            "col": col + 1,
            "kind": kind,
            "cell": cell_box(width, height, cols, rows, index),
            "safe": None if kind in ("empty", "full")
                    else safe_box(width, height, cols, rows, index, skel),
        })
    return out
