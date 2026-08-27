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


def safe_spec_of(skel):
    """Nguồn tỉ lệ safe zone của một ô.

    `contentSafe` dạng object (đời thử nghiệm) khai riêng w/h; dạng boolean (đời
    nay) nghĩa là "chính skel w/h LÀ safe zone". Đọc được cả hai để manifest cũ
    không vỡ — đây là cùng một nhánh `slice.py` đang chạy.
    """
    content_safe = skel.get("contentSafe")
    if content_safe:
        return content_safe if isinstance(content_safe, dict) else skel, True
    return skel, False


def safe_offset_in_cell(cell_w, cell_h, skel):
    """Vị trí safe zone TRONG ô → ``(dx, dy, sw, sh)``.

    Hai nhánh, đúng như `slice.py`:
      · có `contentSafe` ⇒ luôn căn giữa (vùng chữ/hitbox không neo đáy);
      · không ⇒ căn giữa ngang, còn dọc thì `anchor:"bottom"` đẩy xuống đáy ô.
    `//2` (chia lấy nguyên) chứ không `round(…/2)`: lệch nửa pixel này đi thẳng vào
    hộp cắt, nên nó phải là ĐÚNG phép mà dao cắt dùng.
    """
    spec, has_content_safe = safe_spec_of(skel)
    sw = round(cell_w * spec["w"])
    sh = round(cell_h * spec["h"])
    if not has_content_safe and skel.get("anchor") == "bottom":
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


def cell_kind(skel):
    """Ô này thuộc loại nào — quyết định câu prompt và nhánh cắt.

    · "empty" — ô đệm, không vẽ gì;
    · "full"  — full-bleed, artwork phủ kín ô, KHÔNG có safe zone;
    · "free"  — khung động: safe zone chỉ là gợi ý đặt chỗ, dao cắt bám lõi đo được;
    · "safe"  — mặc định: safe zone LÀ hộp cắt.
    """
    shape = skel.get("shape")
    if shape == "empty":
        return "empty"
    if shape == "full":
        return "full"
    if skel.get("free"):
        return "free"
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
