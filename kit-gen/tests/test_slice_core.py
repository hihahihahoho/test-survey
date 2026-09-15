"""ĐOÁN HỘP THÂN — `slice.py:guess_core_box`.

Mọi ảnh trong file này DỰNG TẠI CHỖ bằng PIL, không có ảnh mẫu nào trên đĩa: ca
kiểm phải đọc được như một câu tả hình («viên thuốc 470×160, hai cụm holly hai
đầu, tuyết mỏng trên»), và một file .png trong repo thì không tả được gì cả.

Con số kỳ vọng ở đây là con số HÌNH HỌC ta vừa vẽ ra, nên sai lệch cho phép nhỏ
(±4px): phép đoán không có chỗ nào làm tròn quá một pixel, và một dung sai rộng
sẽ nuốt đúng loại lỗi file này sinh ra để bắt.
"""
from PIL import Image, ImageDraw

from slicelib import load

slice_mod = load()
guess_core_box = slice_mod.guess_core_box
paint_coverage = slice_mod.paint_coverage

CELL = 640


def cell():
    return Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))


def alpha_of(img):
    return img.getchannel("A")


def safe_of(img):
    """Hộp CẢ CỤM như `measure_cell` đo nó: bbox α ≥ 128 → [x, y, w, h]."""
    box = slice_mod.alpha_bbox(img, slice_mod.CORE_ALPHA)
    assert box is not None
    return [box[0], box[1], box[2] - box[0], box[3] - box[1]]


def near(got, want, tol=4):
    assert got is not None, "không đoán được thân, mà ca này phải đoán được"
    for i, (g, w) in enumerate(zip(got, want)):
        assert abs(g - w) <= tol, f"số thứ {i}: {got} ≠ {want} (±{tol})"


# ── ① VIÊN THUỐC + HOLLY HAI ĐẦU + TUYẾT MỎNG ────────────────────────────────

def pill_sheet():
    img = cell()
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((85, 240, 554, 399), radius=80, fill=(200, 60, 60, 255))
    for x0 in (25, 555):                       # holly 60×90 ở hai đầu
        d.rectangle((x0, 275, x0 + 59, 364), fill=(40, 140, 60, 255))
    d.rectangle((240, 232, 379, 239), fill=(240, 250, 255, 255))   # tuyết mỏng trên
    return img


def test_vien_thuoc_co_holly_hai_dau_van_ra_dung_than():
    img = pill_sheet()
    # Cụm đo được ôm cả holly lẫn tuyết: 590×168 cho một viên thuốc 470×160.
    near(safe_of(img), [25, 232, 590, 168], tol=1)
    got = guess_core_box(alpha_of(img), 470 / 160, safe_of(img))
    near(got, [85, 240, 470, 160])
    assert paint_coverage(alpha_of(img), got) > 0.9


def test_duong_phu_quet_do_phu_cung_nam_trong_vien_thuoc():
    """Đường phụ (quét độ phủ cột/hàng) phải ĐỒNG Ý VỀ HƯỚNG với mép trung vị.

    Nó chỉ chạy khi dải giữa câm, nên không ca thật nào ở đây gọi tới nó; kiểm thẳng
    để nó không mục đi trong im lặng. Hai điều nó phải làm được: bỏ holly (phủ 90/168
    ≈ 0,54 chiều cao dải, dưới ngưỡng 0,85) và bỏ tuyết.

    VÀ ĐÂY LÀ LÝ DO NÓ CHỈ LÀ ĐƯỜNG PHỤ: viên thuốc bo tròn hẳn hai đầu, nên vài chục
    cột sát đầu có độ phủ tụt dưới ngưỡng dù chúng vẫn là thân — phép quét dừng sớm
    và trả về ~84% bề ngang thật. Mép trung vị không có chỗ nào để hụt như vậy.
    """
    img = pill_sheet()
    mask = slice_mod.paint_mask(alpha_of(img))
    cluster = safe_of(img)
    center = (cluster[0] + cluster[2] / 2, cluster[1] + cluster[3] / 2)
    got = slice_mod._coverage_core_box(mask, cluster, center)
    assert got is not None
    x, y, w, h = got
    assert 85 <= x and x + w <= 555, f"quét lấn sang holly: {got}"
    assert 240 <= y and y + h <= 400, f"quét lấn lên tuyết: {got}"
    assert w >= 0.8 * 470 and h >= 0.9 * 160, f"quét hụt quá nhiều: {got}"


# ── ② THÂN KÍNH α = 64, VIỀN ĐỤC ─────────────────────────────────────────────

def test_than_kinh_alpha_64_van_la_than():
    """Ngưỡng «có sơn» phải là 32, không phải 128.

    Thân ở đây là mặt kính α = 64 với một viền đục mỏng; holly đục nằm hai đầu. Đo
    bằng ngưỡng 128 thì RUỘT thân rỗng hoàn toàn — cột giữa vẫn có mép (viền), nhưng
    độ phủ tụt còn vài phần trăm và mọi phép đọc «đặc hay rỗng» đều sai. `coreCoverage`
    ở cuối ca này chính là chốt ấy: ≈ 1 với ngưỡng 32, ≈ 0,1 với ngưỡng 128.
    """
    img = cell()
    d = ImageDraw.Draw(img)
    d.rectangle((110, 250, 529, 389), fill=(120, 200, 255, 64))      # mặt kính
    d.rectangle((110, 250, 529, 389), outline=(255, 255, 255, 255), width=4)
    for x0 in (60, 530):
        d.rectangle((x0, 275, x0 + 49, 364), fill=(40, 140, 60, 255))
    got = guess_core_box(alpha_of(img), 420 / 140, safe_of(img))
    near(got, [110, 250, 420, 140])
    assert paint_coverage(alpha_of(img), got) > 0.9


# ── ③ VÒNG RỖNG RUỘT + HOLLY BỐN GÓC ─────────────────────────────────────────

def test_vong_rong_ruot_khong_bi_coi_la_doan_hong():
    """Thân RỖNG vẫn là thân: mép ngoài có ở mọi cột, chỉ ruột là trống.

    Đây là ca mà một điều kiện «độ phủ diện tích < 0,6 ⇒ bỏ» sẽ giết oan: cái vòng
    phủ ~0,28 hộp của chính nó. Và nó cũng là ca mà mép trung vị TRẦN TRỤI cắt cụt
    (đỉnh vòng cao hơn trung vị của dải giữa ~10px vì vòng cong) — bước nới theo MAD
    mới là thứ kéo mép về đúng đỉnh.
    """
    img = cell()
    d = ImageDraw.Draw(img)
    d.ellipse((120, 120, 519, 519), outline=(90, 60, 200, 255), width=40)
    for x0, y0 in ((95, 95), (455, 95), (95, 455), (455, 455)):
        d.rectangle((x0, y0, x0 + 69, y0 + 69), fill=(40, 140, 60, 255))
    got = guess_core_box(alpha_of(img), 1.0, safe_of(img))
    near(got, [120, 120, 400, 400])
    assert paint_coverage(alpha_of(img), got) < 0.5


# ── ④ KHUNG POPUP RỖNG + RUY BĂNG NHÔ TRÊN ĐỈNH ─────────────────────────────

def test_ruy_bang_nho_dinh_khong_keo_canh_tren():
    """Cạnh trên phải là mép khung, không phải mép ruy băng.

    RANH GIỚI CỦA PHÉP NÀY, ghi ra để không ai phải đo lại: mép trung vị lấy trên
    dải giữa 60% bề rộng, nên một thứ nhô ra phủ ≥ 30% bề rộng cụm (= ≥ 50% dải
    giữa) sẽ THẮNG phiếu và được tính vào thân. Ruy băng ở đây phủ 25%.
    """
    img = cell()
    d = ImageDraw.Draw(img)
    d.rectangle((260, 140, 359, 199), fill=(220, 180, 60, 255))       # ruy băng 100px
    d.rectangle((120, 180, 519, 479), outline=(80, 80, 120, 255), width=12)
    got = guess_core_box(alpha_of(img), 400 / 300, safe_of(img))
    near(got, [120, 180, 400, 300])


# ── ⑤ THANH 6,7:1 CÓ MŨ TUYẾT PHỦ CẢ CẠNH ───────────────────────────────────

def test_thanh_dai_co_mu_tuyet_giu_dung_be_ngang():
    """Mũ tuyết trải HẾT cạnh trên ⇒ nó là ĐA SỐ ⇒ bị tính vào thân. Đã biết, đã nhận.

    Cái còn cứu được là bề ngang (tuyết không làm thanh rộng thêm) và tỉ lệ: chiều
    cao được tính lại từ bề ngang theo đúng tỉ lệ người dùng đặt, nên hộp trả về vẫn
    là một thanh 6,7:1 chứ không phải một thanh béo ra vì tuyết.
    """
    img = cell()
    d = ImageDraw.Draw(img)
    d.rectangle((52, 265, 587, 279), fill=(240, 250, 255, 255))       # mũ tuyết
    d.rounded_rectangle((52, 280, 587, 359), radius=36, fill=(60, 160, 90, 255))
    got = guess_core_box(alpha_of(img), 6.7, safe_of(img))
    assert got is not None
    assert abs(got[2] - 536) <= 4, f"bề ngang phải là bề ngang thanh: {got}"
    assert abs(got[3] - round(536 / 6.7)) <= 2, f"chiều cao phải theo tỉ lệ: {got}"


# ── ⑥ BỐN LỐI RƠI VỀ None ────────────────────────────────────────────────────

def test_nut_khong_trang_tri_tra_none():
    """Thân ≈ cụm ⇒ None: hạ nguồn dùng thẳng cụm, khỏi hai số lệch nhau vài pixel."""
    img = cell()
    ImageDraw.Draw(img).rounded_rectangle((120, 250, 519, 389), radius=40,
                                          fill=(200, 60, 60, 255))
    assert guess_core_box(alpha_of(img), 400 / 140, safe_of(img)) is None


def test_khong_co_ti_le_tra_none():
    img = pill_sheet()
    assert guess_core_box(alpha_of(img), None, safe_of(img)) is None
    assert guess_core_box(alpha_of(img), 0, safe_of(img)) is None


def test_ti_le_lech_qua_xa_cum_tra_none():
    """Xin một hình vuông trên một cụm 10:1 ⇒ hộp còn 10% bề ngang cụm ⇒ đoán hỏng."""
    img = cell()
    ImageDraw.Draw(img).rectangle((20, 290, 619, 349), fill=(60, 160, 90, 255))
    assert guess_core_box(alpha_of(img), 1.0, safe_of(img)) is None


def test_o_trong_tra_none():
    img = cell()
    assert guess_core_box(alpha_of(img), 2.0, [0, 0, CELL, CELL]) is None


def test_hop_cum_rac_tra_none():
    img = pill_sheet()
    for bad in (None, [], [1, 2], [0, 0, 0, 10], [0, 0, 10, -1], ["a", 0, 1, 1]):
        assert guess_core_box(alpha_of(img), 2.0, bad) is None


# ── ⑦ ĐỘ PHỦ ────────────────────────────────────────────────────────────────

def test_paint_coverage_dem_dung_va_khong_no_voi_hop_rac():
    img = cell()
    ImageDraw.Draw(img).rectangle((100, 100, 199, 199), fill=(0, 0, 0, 255))
    assert paint_coverage(alpha_of(img), [100, 100, 100, 100]) == 1.0
    assert paint_coverage(alpha_of(img), [100, 100, 200, 100]) == 0.5
    assert paint_coverage(alpha_of(img), [0, 0, 0, 10]) is None
    assert paint_coverage(alpha_of(img), None) is None
