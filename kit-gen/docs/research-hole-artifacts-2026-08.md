# Nghiên cứu: ảnh tách nền bị "rỗ rỗ" — lỗ thủng li ti trong lòng element

**Ngày:** 2026-08-13 · **Phạm vi:** chỉ nghiên cứu, không sửa code sản phẩm, không commit.
**Dữ liệu:** `~/KitGen/projects/blindtest-b2-retry-fee3` (sci-fi neon hologram) và
`~/KitGen/projects/blindtest-a-trung-thu-candy-83fe` (trung thu candy hồng).

---

## 1. Kết luận ngắn

**Nghi phạm số 1 (chroma-key toàn cục ăn vào màu art) KHÔNG phải nguyên nhân chính.**
Đo trên chính sheet raw của hai dự án: mọi lỗ do bước matte tạo ra đều nằm ở pixel có
`spill/sref ≥ 0.97`, tức **đúng là màu nền key thật** (khe giữa hai chân, khe tai mũ,
ruột rỗng của nút outline). Bước tách nền làm đúng.

**Nguyên nhân gốc thật sự là một lỗi dùng API PIL ở khâu HẬU KỲ, sau khi đã tách nền xong:**

```python
out.paste(canvas, (dx, dy), canvas)     # slice.py:517  align_content_safe
out.paste(scaled, (dx, dy), scaled)     # slice.py:559  snap_to_safe
canvas.paste(region, (...), region)     # slice.py:897  dán vùng crop của ô
```

Cả ba lệnh đều **dán một ảnh RGBA lên canvas TRONG SUỐT và lấy chính nó làm mask**.
Với `Image.paste(im, box, mask)` PIL tính `out = out*(1-m) + im*m`. Vì `out` trong suốt
(`a=0`) và `m = a/255`, kết quả là:

> **alpha_ra = alpha_vào² / 255** — alpha bị **bình phương**.

Mỗi asset đi qua **2 lần** (một lần ở `:897`, một lần ở `:517` hoặc `:559`), nên
`alpha_cuối = alpha⁴ / 255³`. Pixel bán trong suốt trong lòng element bị bóp về 0 →
**lỗ thủng li ti**; pixel gần đục bị bóp xuống 60–70% → **mảng loang, ám màu nền** —
đúng hai biểu hiện chủ sở hữu mô tả là "rỗ rỗ". RGB cũng bị premultiply vào buffer
straight-alpha nên element còn bị **tối/xỉn màu** đi kèm.

Bỏ mask trong 3 lệnh đó (fix ~3 dòng) làm **lỗ thủng biến mất gần hết**, xác nhận bằng
A/B chạy lại nguyên bộ slice trên cả hai dự án — xem §5.

---

## 2. Thuật toán tách nền hiện tại (trả lời hướng điều tra 1)

Đọc `kit-gen/slice.py`:

| Câu hỏi | Thực tế trong code |
|---|---|
| Key theo khoảng cách màu toàn cục hay flood-fill từ mép? | **Toàn cục, per-pixel** — và đây là **chủ ý**. Docstring `matte_vlahos` (:246) ghi rõ: *"Pixel key thuần → alpha 0 (kể cả ruột rỗng nằm kín — không cần thông ra rìa)"*. |
| Có flood-fill không? | Có `fill_holes()` (:362) flood-fill từ biên, nhưng **chỉ dùng cho đường lùi nền nhạt/caro** (`key_binary`). Docstring :364 nói rõ nền key chát *"KHÔNG cần — và không được dùng, vì nó sẽ lấp cả ruột rỗng có chủ đích (nút outline)"*. |
| Đại lượng quyết định | `spill = min(r,b) − g` (key magenta), `sref = max(40, min(kr,kb) − kg)` đo từ viền sheet, `sn = clip(spill/sref, 0, 1)`. |
| Ngưỡng | Trimap: `sn_s ≥ 0.9` → **nền chắc chắn** (alpha 0); `spill ≤ 0` co 5px → **element chắc chắn**; còn lại solver quyết. `sn_s` là `sn` đã GaussianBlur(2). |
| Bộ giải | ViTMatte nếu có, không thì closed-form PyMatting (`estimate_alpha_cf`). **Kit của hai dự án này được cắt bằng closed-form** — `kits/manifest.json` ghi `"matte closed-form PyMatting + despill"`. |
| Despill | Có, 2 tầng: un-premultiply/`estimate_foreground_ml` + despill bảo toàn luminance + defringe kiểu Photoshop (:206–232). |
| Feather / morphology | Có: soften 0.7px toàn cục, feather 3px vùng alpha thấp, và vá lỗ nhỏ (`semi_m`, :178–184) — nhưng **chỉ vá cụm alpha trong dải 90–242 và < 400px**. Lỗ có alpha < 90 **không bao giờ được vá**. |

Vậy nghi ngờ ban đầu là hợp lý về mặt thiết kế — nhưng số đo dưới đây cho thấy nó
không phải thủ phạm trong hai dự án này.

---

## 3. Bằng chứng thật — quét ảnh đã cắt

Script: `scratchpad/scan_holes.py` (chỉ đọc). "Lỗ kín" = vùng `alpha < 32` **không nối
với biên ảnh**, tức nằm lọt trong lòng element.

### BlindTest-B2 (neon magenta) — `kits/chinh/tight/`

| Asset | Kích thước | Lỗ kín | px thủng | Rỗ bán trong suốt |
|---|---|---|---|---|
| `01-pose-idle` | 319×536 | **54** | **5 047** | 72 cụm / 557px |
| `02-pose-wave` | 405×537 | **39** | **6 712** | 69 cụm / 512px |
| `01-btn-pill-red` | 632×240 | **36** | **1 620** | 43 cụm / 940px |
| `03-btn-pill-outline` | 656×238 | 4 | 91 433 | 28 cụm / 495px |
| `08-progress-fill` | 553×79 | 0 | 0 | 10 cụm / 837px |
| `25-bg-home`, `26-bg-play` | — | 0 | 0 | 0 |

> Lưu ý `03-btn-pill-outline`: 91 350px trong đó là **ruột rỗng CỐ Ý** của nút outline,
> không phải lỗi. Đã tách riêng khi đánh giá.

### BlindTest-A (candy hồng)

Hầu như **không có lỗ thủng cứng** (chỉ 1 lỗ 3px ở `15-reward-giftbox`), nhưng có
nhiều **mảng bán trong suốt trong ruột**: `09-popup-panel-short` 53 cụm/2 938px,
`52-envelope-body` 68 cụm/2 195px, `15-reward-giftbox` 99 cụm/1 032px. Đây là biến thể
"rỗ" thứ hai: không thủng hẳn mà **nhìn xuyên thấy nền** (xem ảnh §5).

### Ảnh minh hoạ (đã xuất ra scratchpad)

- `scratchpad/b2idle-green-marked.png` — pose-idle trên nền xanh, khoanh đỏ 41 lỗ.
- `scratchpad/b2btn-green-marked.png`, `scratchpad/b2wave-green-marked.png`
- `scratchpad/cmp-01-pose-idle.png`, `scratchpad/cmp-01-btn-pill-red.png` — trước/sau fix.
- `scratchpad/cmpA-15-reward-giftbox.png`, `scratchpad/cmpA-52-envelope-body.png`

Trên `b2idle-green-marked.png` thấy rõ: **chấm giữa hình lục giác trên ngực robot bị
thủng** (lộ nền xanh), cùng hàng chục đốm rỗ trên vai, khuỷu, cổ tay.

---

## 4. Truy vết theo từng chặng — chặng nào sinh ra lỗ

Chép nguyên dự án ra scratchpad, chèn probe đếm lỗ vào `slice.py` (bản chép), chạy lại.
Bản chạy lại **tái lập chính xác** log đã giao (`dọn 660/4604/1593/415px đốm tối mồ côi`)
→ sandbox khớp production.

| Asset | S0 sheet raw sau matte | S1 sau mask+dán ô | S2 sau snap/align | S3 sau dọn đốm |
|---|---|---|---|---|
| `01-pose-idle` | 5 lỗ / 808px | 4 lỗ / 2 380px | **53 lỗ / 4 706px** | 41 lỗ / 5 021px |
| `02-pose-wave` | 6 lỗ / 1 228px | 8 lỗ / 3 744px | **32 lỗ / 6 461px** | 26 lỗ / 6 686px |
| `01-btn-pill-red` | — | 2 lỗ / 165px | **26 lỗ / 1 927px** | 25 lỗ / 1 598px |

**Đọc bảng:**

1. **S0 → sạch.** Toàn bộ 15 lỗ trên sheet pose raw đều có `sn` từ 0.97–1.00, màu RAW đo
   được là `(241,9,215)`, `(237,7,240)`… ≈ đúng màu key `(243,9,219)`. **0 lỗ có `sn < 0.85`.**
   Chroma-key vô can.
2. **Bùng nổ ở S1→S2** — chính là `snap_to_safe` / `align_content_safe`.
3. **Bước "dọn đốm mồ côi" chỉ là thứ yếu**: A/B tắt hẳn bước này cho ra
   `01-pose-idle` 82 lỗ / 4 764px (so với 54 lỗ / 5 047px) — nó gộp lỗ lại chứ không
   tạo ra lỗ. Đóng góp ~6% px thủng.

**Chốt hạ mang tính quyết định:** với `shape == "pose"`, `snap_to_safe` **không hề
resize** (`s = 1.0` vì `"pose"` không nằm trong `("pill","bar","rrect","circle","puzzle")`,
:552). Chặng S1→S2 của pose-idle **chỉ có đúng một lệnh `out.paste(canvas,(dx,dy),canvas)`** —
một phép tịnh tiến số nguyên. Tịnh tiến không thể sinh lỗ. Nhưng lỗ tăng từ 4 lên 53.
Thủ phạm chỉ có thể là bản thân lệnh `paste`.

---

## 5. Tái lập có kiểm soát

### 5.1 Chứng minh cơ chế bình phương alpha

```python
src = ảnh RGBA, alpha chạy 0..255, RGB = (255,255,255)
dst = Image.new("RGBA", size, (0,0,0,0))
dst.paste(src, (0,0), src)          # ĐÚNG như slice.py:517/559/897
```

| alpha vào | 255 | 250 | 242 | 220 | 200 | 160 | 128 | 100 | 90 | 60 | 32 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| alpha ra | 255 | 245 | 230 | 190 | 157 | 100 | 64 | 39 | **32** | **14** | **4** |

Khớp công thức `a²/255` với sai số ≤1 trên toàn dải 0–255. `Image.alpha_composite`
giữ alpha đúng nguyên vẹn (đã kiểm chứng). RGB ra bằng đúng RGB vào **nhân alpha** →
premultiply nhầm vào buffer straight-alpha → element tối/xỉn.

Vì mỗi asset qua **2 lần** paste:

| alpha gốc | 250 | 242 | 230 | 220 | 200 | 180 | 160 | 128 | 100 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| sau 2 lần | 235 | 207 | 168 | 142 | **97** | **63** | **39** | **16** | **6** | **4** |
| mất | 6% | 14% | 27% | 35% | **52%** | **65%** | **76%** | **88%** | **94%** | **96%** |

Pixel alpha 128 (nửa trong suốt — mép mềm, gờ bóng, đường ráp giáp) tụt còn **16**:
mắt thường thấy là **thủng**. Pixel alpha 200 (gần đục) còn **97**: thấy là **rỗ, lộ nền**.

### 5.2 A/B chạy lại nguyên bộ slice với fix 3 dòng

Sửa trong bản chép: `:517`/`:559` bỏ tham số mask, `:897` đổi sang `alpha_composite`.

**BlindTest-B2:**

| Asset | Hiện tại | Sau fix | Ghi chú |
|---|---|---|---|
| `01-btn-pill-red` | 36 lỗ / 1 620px | **0 lỗ / 0px** | sạch tuyệt đối |
| `01-pose-idle` | 54 lỗ / 5 047px | **6 lỗ / 893px** | 6 lỗ còn lại = khe tai mũ, đúng S0 |
| `02-pose-wave` | 39 lỗ / 6 712px | **7 lỗ / 1 233px** | khớp S0 (6 lỗ / 1 228px) |
| `03-btn-pill-outline` | 4 lỗ | 2 lỗ | phần 84k px là ruột rỗng cố ý |
| `08-progress-fill`, `25/26-bg` | 0 | 0 | không đổi |

Số lỗ còn lại **trùng khớp số lỗ hợp lệ đo được ở S0** → sau fix chỉ còn đúng những
vùng nền key thật sự bị element bao kín. Diện tích đục thu hồi được: pose-idle
111 429 → 116 964 px (**+5.0%**).

**BlindTest-A (candy):** giftbox 352 770 → **412 128** px đục (**+16.8%**),
envelope-body 118 863 → **140 078** px (**+17.8%**). Ảnh
`cmpA-15-reward-giftbox.png` cho thấy **nơ và dải ruy-băng hồng đang bị xám xanh,
nhìn xuyên thấy nền, sau fix trở lại hồng đặc**. Đây chính là "rỗ" ở dự án candy.

---

## 6. Nguyên nhân phụ (thật, nhưng chưa nổ ở hai dự án này)

Nghi phạm chroma-key **không sai về nguyên lý** — nó chỉ chưa gây hại ở đây. Quét có
kiểm soát qua đúng `matte_pymatting`:

**Trục 1 — nền key chuẩn `#FF00FF` (`sref=255`), art càng lúc càng magenta:**

| art RGB | (255,60,245) | (255,40,245) | (255,20,245) | (255,10,245) | (255,4,245) |
|---|---|---|---|---|---|
| `spill/sref` | 0.73 | 0.80 | 0.88 | 0.92 | 0.95 |
| kết quả | ok | ok | ok | **THỦNG** | **THỦNG** |

→ Ranh giới đúng bằng **`sn = 0.90`**, tức ngưỡng trimap. Với key magenta thuần, art
phải giống key tới ~90% mới thủng — biên an toàn còn khá rộng.

**Trục 2 — art neon magenta cố định `(255,60,220)` (spill=160), nền key bị model vẽ NHẠT dần:**

| nền key | (255,0,255) | (250,30,245) | (250,60,240) | (250,90,235) | (250,120,230) |
|---|---|---|---|---|---|
| `sref` | 255 | 215 | 180 | 145 | 110 |
| `spill/sref` | 0.63 | 0.74 | 0.89 | **1.00** | **1.00** |
| kết quả | ok | ok | ok | **THỦNG** | **THỦNG** |

→ **Rủi ro thật:** `sref` không phải hằng số, nó đo từ viền sheet mà model vẽ ra. Model
vẽ nền magenta nhạt/ám là `sref` tụt, và **art neon magenta hợp lệ bắt đầu thủng**.
Guard `is_key_color()` (chỉ kiểm `max−min > 80`) **không chặn được**: `(250,90,235)` có
`max−min = 160`, lọt qua thoải mái.

**Số đo trên sheet thật:** key đo được lệch khỏi `#FF00FF` khá nhiều —
`(238,15,211)` `sref=196` (sheet `ui` của B2), `(243,9,219)` `sref=210`,
`(245,12,248)` `sref=233`. Với `sref=196`, mọi màu art có `spill ≥ 176`
(ví dụ hồng neon `(255,40,220)`, spill=180) **sẽ bị đục thủng**. Chưa nổ lần này
nhưng đây là mìn hẹn giờ đúng như chủ sản phẩm linh cảm.

Ghi chú thêm: nếu nền nhạt tới mức `max−min ≤ 80` (ví dụ sheet `nen` của dự án A đo
được `(253,177,203)`), `is_key_color` trả False và rơi về `key_binary` + `fill_holes` —
đường này có flood-fill nên an toàn hơn. Nếu ép chạy `matte_pymatting` với nền như vậy,
`estimate_alpha_cf` **ném ValueError** (trimap không còn pixel nền) — hiện đang được
guard che, nhưng là đường biên giòn.

*(Đã tìm mục "Còn mở" trong git log của `gen.sh`/`slice.py` theo gợi ý — không tồn tại
mục nào tên như vậy; commit gần nhất liên quan là `14bd6fa`, nói về viền magenta quanh
sheet full-bleed và `trim_flat_cell`, không phải về chọn màu key.)*

---

## 7. Đề xuất sửa, xếp theo độ an toàn

### (0) SỬA NGAY — bỏ mask ở 3 lệnh paste · độ khó: **rất thấp** · rủi ro: **rất thấp**

```python
# slice.py:517  align_content_safe
- out.paste(canvas, (dx, dy), canvas)
+ out.paste(canvas, (dx, dy))

# slice.py:559  snap_to_safe
- out.paste(scaled, (dx, dy), scaled)
+ out.paste(scaled, (dx, dy))

# slice.py:897
- canvas.paste(region, (L - (cx0 - BX), T - (cy0 - BY)), region)
+ canvas.alpha_composite(region, (L - (cx0 - BX), T - (cy0 - BY)))
```

Hai chỗ đầu: đích là canvas **vừa `Image.new` trong suốt hoàn toàn**, nên `paste` không
mask (copy thẳng cả 4 kênh) cho kết quả đúng và rẻ nhất. Chỗ thứ ba dùng
`alpha_composite` cho đúng ngữ nghĩa chồng lớp. Offset ở `:897` luôn `≥ 0`
(vì `L ≥ max(0, cx0−BX)`) nên an toàn.

Đây là **fix trúng đích**: giải quyết ~85–100% px thủng, đồng thời trả lại độ đục và
màu thật. `tools/safe_zone_asset.py:280` **đã dùng đúng `alpha_composite`** — tức đây là
idiom chuẩn của nhà, `slice.py` là chỗ lạc.

### (a) Flood-fill từ biên như lưới an toàn · độ khó: **thấp** · rủi ro: **CAO nếu làm mù**

Lấp mọi vùng trong suốt không nối biên sẽ **phá ruột rỗng cố ý**: nút outline
`03-btn-pill-outline` có 84 289px ruột rỗng hợp lệ, mũ robot có khe tai. Chỉ nên làm
**có điều kiện màu**, dùng đúng tiêu chí đã đo được ở §4:

> Lấp lỗ kín **chỉ khi** `sn` trung bình của vùng đó `< 0.85` (màu RAW không phải nền key).

Số liệu hậu thuẫn: 100% lỗ hợp lệ đo được có `sn ≥ 0.97`; ngưỡng 0.85 tách sạch hai lớp.
Nên làm **sau** khi (0) đã vào, và chỉ như lưới an toàn cho tương lai.

### (b) Morphological closing / hole-filling sau key · độ khó: thấp · rủi ro: **cao**

Không khuyến nghị. Closing bán kính đủ để bịt lỗ 20–30px sẽ **ăn mất tia, tua rua,
sparkle** — đúng loại chi tiết mà lịch sử commit (`0b62c64`, `eb55fee`) đã tốn nhiều công
giữ. (0)+(a) đã đủ, không cần dao mổ trâu.

### (c) Chọn màu key tự động xa palette của style · độ khó: **trung bình** · rủi ro: thấp

Đáng làm, nhưng là phòng ngừa chứ không phải chữa bệnh hiện tại:

1. **Kiểm nền sau khi gen:** so màu viền đo được với màu key đã yêu cầu; `sref < 150` thì
   cảnh báo/gen lại. Số thật: `sref` đang dao động 196–241, chưa nguy hiểm nhưng không kiểm soát.
2. **Chọn key theo palette style:** style neon magenta → dùng key **green**; style xanh lá →
   dùng magenta. `matte_*` đã hỗ trợ sẵn cả hai (`is_green`), chỉ cần đổi ở `gen.sh:152`
   (`s['bg']`) và ghi vào styles.json.
3. **Siết `is_key_color`:** thêm điều kiện `sref ≥ 150` thay vì chỉ `max−min > 80`.

### (d) Despill viền · độ khó: thấp · rủi ro: thấp · **không liên quan**

Đã có sẵn và hoạt động tốt (3 tầng: un-premultiply, despill bảo toàn luminance, defringe).
Không phải nguyên nhân "rỗ". Không đề xuất đụng vào.

---

## 8. Rủi ro hồi quy với bộ test hiện có

Chạy `python3 -m unittest discover -s tests` trên repo hiện tại: **6/6 PASS**.

**Phát hiện quan trọng:** cả `tests/test_safe_zone_asset.py` và
`tests/test_output_geometry.py` **không hề import hay chạy `slice.py`** — chúng test
`tools/safe_zone_asset.py` và `tools/validate_output_geometry.py`. Nghĩa là:

- Fix (0) có **rủi ro hồi quy bằng 0 đối với bộ test hiện tại**…
- …nhưng cũng có nghĩa **`snap_to_safe`, `align_content_safe`, và toàn bộ đường matte
  đang không có test nào bảo vệ**. Đó chính là lý do lỗi này sống sót lâu.
- Kiểm chứng hình học sau fix: canvas/cell/bleed không đổi; bbox nội dung nhích nhẹ
  (pose-idle 319×536 → 331×541) vì phần alpha trước đây bị bóp về 0 nay được giữ —
  **đây là hành vi đúng**, nhưng cần chạy `validate_output_geometry.py` để xác nhận
  không có asset nào vượt khung safe.

---

## 9. Cách tái lập lại nghiên cứu này

Script chỉ-đọc, đặt ở scratchpad phiên làm việc:

| File | Việc |
|---|---|
| `scan_holes.py` | dò lỗ kín + rỗ bán trong suốt trên `tight/*.png` |
| `spill_map.py` | đo `spill/sref` và đốm "nền chắc chắn" kín trên sheet raw |
| `repro_pipeline.py` | chạy đúng `matte_pymatting` trên sheet raw, đối chiếu lỗ với màu RAW |
| `repro_synth.py`, `sweep.py` | tái lập có kiểm soát, quét 2 trục màu art / `sref` |
| `slicelib.py` | 683 dòng đầu của `slice.py` (chỉ phần định nghĩa hàm) để import an toàn — `slice.py` **không có `if __name__ == "__main__"`**, import thẳng sẽ chạy cắt và ghi đè `kits/` |

A/B: chép dự án ra scratchpad, ép `HAS_VITMATTE = False` (khớp kit đã giao), chạy
`python3 slice.py` ở bản gốc và bản đã sửa 3 lệnh paste, rồi so bằng `scan_holes.py`.

---

## Backlog items đề xuất

1. **[P0 · rất nhỏ] Sửa 3 lệnh `paste` làm bình phương alpha** — `slice.py:517`, `:559`,
   `:897`. Bỏ tham số mask ở hai chỗ đầu, đổi chỗ thứ ba sang `alpha_composite`.
   *Tác động đo được:* `01-btn-pill-red` 36 lỗ → 0; `01-pose-idle` 54 → 6;
   `02-pose-wave` 39 → 7; giftbox candy +16.8% diện tích đục, ruy-băng hết lộ nền.
   Không chạm thuật toán tách nền. **Ưu tiên cao nhất, chi phí thấp nhất.**

2. **[P0 · nhỏ] Thêm test hồi quy cho alpha hậu kỳ** — dựng ảnh RGBA có dải alpha đã biết,
   chạy qua `snap_to_safe` + `align_content_safe`, assert alpha **giữ nguyên** (sai số ≤1)
   và RGB không bị premultiply. Đây là bài test đã có thì lỗi này không bao giờ lọt.

3. **[P1 · nhỏ] Quét lại toàn bộ kit đã giao cho khách** bằng `scan_holes.py` để lập danh
   sách asset cần cắt lại sau khi fix. Không cần gen lại ảnh, chỉ chạy lại `slice.py`.

4. **[P1 · trung bình] Lấp lỗ kín có điều kiện màu** — lấp vùng trong suốt không nối biên
   **chỉ khi** `sn < 0.85`. Ngưỡng đã hiệu chỉnh bằng dữ liệu thật (lỗ hợp lệ đều
   `sn ≥ 0.97`). Bảo toàn ruột rỗng cố ý của nút outline và khe tai mascot.

5. **[P1 · nhỏ] Siết guard chất lượng nền key** — thêm `sref ≥ 150` vào `is_key_color()`,
   và cảnh báo trong log khi `sref` đo được tụt thấp. Hiện `sref` dao động 196–241 mà
   không ai giám sát; `sref` tụt là art neon magenta bắt đầu bị đục thủng.

6. **[P2 · trung bình] Chọn màu key theo palette của style** — style có tông magenta/hồng
   neon thì dùng key **green** và ngược lại. `matte_chroma` đã hỗ trợ sẵn cả hai chiều;
   chỉ cần logic chọn ở `gen.sh` và ghi vào `styles.json`.

7. **[P2 · nhỏ] Rà soát bước "dọn đốm mồ côi"** (`slice.py:940–970`) — sau khi fix (1)
   nó gần như không còn việc để làm. Cân nhắc siết ngưỡng hoặc bỏ, vì nó đang xoá
   `dilate(4) + dilate(8)` quanh mỗi đốm, tức làm to lỗ sẵn có.

8. **[P3] Bổ sung test cho đường matte** — hiện `slice.py` **không có test nào**. Tối thiểu:
   một sheet tổng hợp (element trên nền key, có ruột rỗng cố ý + mảng màu gần key) với
   assert về số lỗ và diện tích đục.
