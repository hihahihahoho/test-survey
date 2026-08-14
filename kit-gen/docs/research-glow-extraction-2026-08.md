# Research — tách element phát sáng, neo lưới, và chế độ nền per-element

> Ngày: 2026-08-13
> Loại tài liệu: **research / spike** — không sửa code sản phẩm, không commit code.
> Phạm vi: trả lời ba câu hỏi của chủ sản phẩm về (1) glow trên nền đen,
> (2) grid neo khung, (3) setting chế độ nền per-element.
> Đọc kèm: `docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md` (đặc biệt §8.1),
> `docs/PRODUCT-SITEMAP.md` §12.

---

## 0. Tóm tắt cho người bận

**Câu hỏi 1 — glow.** Giả thuyết của chủ sản phẩm **đúng, và đã chứng minh được
bằng đại số + số liệu**: "vẫn bị đen đen" không phải lỗi thuật toán tách, mà là
giới hạn của phép hợp thành `source-over`. Sai số là **đúng bằng `bg × alpha`**,
không phụ thuộc cách chọn alpha. Nhưng kết luận cuối **khác một chút** so với dự
kiến ban đầu:

> Cái phải ship kèm là **metadata blend mode**, chứ **không phải** file PNG nền đen.
> Đo được: RGBA (alpha = max(R,G,B), un-premultiply) hợp thành bằng
> `plus-lighter` cho kết quả **giống hệt từng bit** (sai số 0.0/255) so với PNG
> nền đen hợp thành additive. RGBA thắng tuyệt đối ở đường lùi: khi đích chỉ có
> `source-over`, RGBA sai **15.9 lv**, PNG nền đen đục sai **102.7 lv**.
> → **Ship RGBA + `blendMode: "screen" | "plus-lighter"` trong manifest.**

**Câu hỏi 2 — grid neo khung.** **Không nên** làm biến thể "bắt AI vẽ lại lưới".
§8.1 đã đo và kết luận đúng. Nhưng có một phát hiện mới quan trọng: **validator
hình học đang hỏng hoàn toàn** (10/10 file `.geometry.json` trong runtime vô
giá trị vì hardcode key xanh trong khi sheet dùng magenta). Sửa validator có giá
trị cao hơn nhiều so với mọi thí nghiệm grid, vì hiện không có vòng đo tự động
nào để đánh giá bất kỳ biến thể nào.

**Câu hỏi 3 — nền per-element.** Cơ chế **đã tồn tại một nửa**: `skel.matte ==
"glow"` đã bắt gen.sh in lệnh nền đen cho đúng ô đó, và slice.py đã có nhánh tách
riêng. Cái thiếu là: đặt đúng tên khái niệm, hiển thị ở trang Skeleton UI, và
đường dẫn field xuyên qua lớp override của webapp (hiện bị rơi). Kèm phát hiện:
màu key **không** được chọn tự động xa palette — chỉ có câu chữ khuyên người dùng.

---

## 1. Phương pháp

Vì repo không có ảnh glow thật đã tách sẵn để đo, tôi dựng **ground truth tổng
hợp** bằng PIL/numpy: một vụ nổ 384×384 gồm lõi trắng-vàng, quầng cam rộng
bán-trong-suốt, 12 tia, một vòng xung kích xanh bão hoà (để bẫy `alpha =
max(RGB)`), 28 sparkle, cộng nhiễu Gaussian σ≈2 mô phỏng nhiễu gpt-image.

Ánh sáng phát xạ `E` được định nghĩa trước ở dạng float, rồi mới lượng tử hoá
thành "ảnh AI trên nền đen" 8-bit. Nhờ vậy **biết chính xác đáp án đúng** khi dán
lên nền bất kỳ:

```
truth = clip(bg + E)          # ánh sáng là phép CỘNG
```

Script và ảnh minh chứng nằm ở scratchpad của phiên (không đưa vào repo):

| File | Nội dung |
|---|---|
| `glow_exp.py` | dựng emitter, 8 phương án tách/hợp thành, 6 loại nền, bảng metric, ảnh montage |
| `glow_verify.py` | kiểm chứng đại số, bảng quầng tối theo dải alpha, đo khuyết tật riêng của slice.py |
| `00-glow-on-black.png` | "ảnh AI" đầu vào |
| `00-glow-rgba-max.png` | asset RGBA sau khi tách bằng `alpha = max(RGB)` |
| `01-sosanh-tong.png` | montage 6 phương án × 4 loại nền — **bằng chứng thị giác chính** |
| `02-err-*.png` | bản đồ sai số khuếch đại ×2 trên nền xám 128 |
| `glow_metrics.json` | toàn bộ số liệu thô |

---

## 2. Câu hỏi 1 — element phát sáng trên nền đen

### 2.1 Vì sao "vẫn bị đen đen": chứng minh đại số

Trên nền đen, ảnh AI chính là ánh sáng đã premultiply sẵn: `C = α·F`.
Tách un-premultiply cho `F = C/α`, nên `α·F = C` (đo được: sai số tối đa
**0.0000 lv**).

Dán bằng `source-over` — phép hợp thành mặc định của PNG, của layer Figma
NORMAL, của mọi `<img>` — cho:

```
source_over = α·F + bg·(1−α)
            = C + bg − bg·α
            = (bg + C) − bg·α
            = truth − bg·α
```

**Sai số = −bg·α, luôn luôn, ở mọi pixel.** Kiểm chứng bằng số trên 5 loại nền:

```
bg= 32   max|source_over − (bg+C−bg·α)| = 0.000000 lv
bg= 72   max|...|                        = 0.000000 lv
bg=128   max|...|                        = 0.000000 lv
bg=200   max|...|                        = 0.000000 lv
bg=255   max|...|                        = 0.000000 lv
```

→ **Định danh đúng tuyệt đối.** Đây không phải sai số xấp xỉ, mà là hằng đẳng
thức. **Không có cách chọn alpha nào — luma, max(RGB), gamma, ViTMatte, hay bất
kỳ SOTA matting nào — có thể khử được số hạng `bg·α`**, vì `α` xuất hiện ở cả hai
vế. Đây là giới hạn của **mô hình hợp thành**, không phải của thuật toán tách.
Đúng như chủ sản phẩm nghi ngờ.

### 2.2 Quầng tối lớn cỡ nào

Độ sụt sáng trung bình (level 0–255, số âm = tối hơn đúng):

| dải alpha | %diện tích | nền 72 | nền 128 | nền 200 |
|---|---:|---:|---:|---:|
| 0.02–0.10 | 18.9% | −3.1 | −5.5 | −8.6 |
| 0.10–0.30 | 21.2% | −14.2 | −25.2 | −38.1 |
| 0.30–0.60 | 13.2% | −30.4 | −53.1 | −57.8 |
| 0.60–0.90 | 8.0% | −48.3 | −65.7 | −60.9 |
| 0.90–1.00 | 1.4% | −40.7 | −56.5 | −64.4 |

Dải `α ∈ [0.10, 0.60]` — **34% diện tích asset** — chính là quầng glow bán trong
suốt, và chính là chỗ sụt 14–58 level. Đó là "đen đen".

Tỷ lệ diện tích bị tối rõ:

| nền | tối ≥8 lv (ngưỡng nhìn thấy) | tối ≥25 lv (rõ) | đỉnh |
|---|---:|---:|---:|
| 32 | 28.4% | 4.5% | 32 lv |
| 72 | 44.7% | 20.9% | 72 lv |
| 128 | 48.7% | 34.3% | 128 lv |
| 200 | 53.3% | 43.7% | 198 lv |

Nền càng sáng càng hỏng — và nền càng sáng thì glow càng đáng lẽ phải "tan biến"
chứ không phải hoá thành miếng dán tối màu.

### 2.3 Bảng so sánh đầy đủ — MAE so với additive truth (level 0–255)

| nền | A1 max+over | A2 luma+over | A4 slice.py+over | B1 đen+SCREEN | B2 đen+PLUS-LIGHTER | C1 RGBA+PLUS-LIGHTER | C2 RGBA+SCREEN |
|---|---:|---:|---:|---:|---:|---:|---:|
| 32 | 5.87 | 8.64 | 10.12 | 4.05 | **0.00** | **0.00** | 4.05 |
| 72 | 12.77 | 13.60 | 15.75 | 8.68 | **0.00** | **0.00** | 8.68 |
| 128 | 20.54 | 18.64 | 21.73 | 13.26 | **0.00** | **0.00** | 13.26 |
| 200 | 24.55 | 19.14 | 23.43 | 13.17 | **0.00** | **0.00** | 13.17 |
| 255 | 14.51 | 6.43 | 11.64 | 0.00 | **0.00** | **0.00** | 0.00 |
| gradient game | 15.71 | 15.53 | 17.98 | 10.18 | **0.00** | **0.00** | 10.18 |

Đọc bảng:

- Mọi phương án `source-over` (A1–A4) sai **12–25 lv MAE**, đỉnh tới **198 lv**.
- `SCREEN` sai 4–13 lv — không hoàn hảo (screen là additive có soft-clip:
  `B = Cb + Cs − Cb·Cs`, thiếu đúng `Cb·Cs`) nhưng **không bao giờ cháy trắng**
  và luôn tốt hơn source-over ở mọi nền.
- `PLUS-LIGHTER` (= Figma `LINEAR_DODGE`) sai **0.00 tuyệt đối**.

### 2.4 Phát hiện then chốt: PNG đen và RGBA là **tương đương bit-exact**

Kiểm chứng round-trip 8-bit thật (không phải float):

```
RGBA(alpha=max) 8-bit -> premultiplied lại:
  max sai số = 0.0 level ; MAE = 0.0 ; %pixel sai >1 lv = 0.0000%
plus-lighter: PNG đen đục vs RGBA(max) 8-bit -> max diff = 0.0 level
```

Lý do: dưới `plus-lighter`, compositor dùng `α·F`, mà `α·F == C` chính xác.
Un-premultiply với `α = max(R,G,B)` là **khả nghịch không mất mát** ở 8-bit vì
kênh lớn nhất luôn được chuẩn hoá về đúng 255.

**Hệ quả cho quyết định ship:**

| tiêu chí | (a) PNG nền đen + metadata | (b) RGBA + metadata |
|---|---|---|
| dưới plus-lighter / LINEAR_DODGE | đúng | **đúng, giống hệt từng bit** |
| dưới screen | đúng | **giống hệt** |
| đường lùi source-over (đích không hỗ trợ blend) | MAE **102.7 lv** — miếng đen vuông đè lên game | MAE **15.9 lv** — vẫn nhận ra là glow |
| xem preview trong webapp / Figma trước khi gán blend | thấy ô vuông đen | thấy đúng hình glow |
| crop / trim / atlas theo bbox alpha | **không làm được** (mọi pixel đục) | làm được |
| chồng lên nhau, mask, clip | vỡ | bình thường |
| dung lượng | tương đương | tương đương |

→ **Ship (b).** PNG nền đen chỉ nên tồn tại như **raw trung gian**, không phải
asset giao hàng. Đây là điểm chỉnh so với giả thuyết ban đầu: cái load-bearing là
**metadata blend mode**, chứ không phải nền đen của file.

### 2.5 Thuật toán nền-đen hiện tại — nó ở đâu, và hỏng ở đâu

**Đính chính vị trí:** thuật toán này **không nằm trong `studio.html`**. Toàn repo
không có một dòng JS nào xử lý `ImageData` để matte. Nó nằm ở
`slice.py:740–798`, chạy như một nhánh riêng sau khi matte chroma đã quét cả
sheet, và chỉ áp cho ô có `skel.matte == "glow"`. Prompt tương ứng ở
`gen.sh:252–260`. Ô duy nhất đang bật là `16-fx-burst` (`styles.json`,
`element-lib.json:49`).

Lõi thuật toán (`slice.py:764–768`):

```python
mx = reg.max(axis=2)
BP = 18.0                     # black-point: nhiễu tối của gpt-image → 0
a = np.clip((mx - BP) / (255.0 - BP), 0, 1)
a[snc > 0.5] = 0.0            # mép key quanh tấm đen → trong suốt
F = np.clip(reg * 255.0 / np.maximum(mx, 1.0)[..., None], 0, 255)
```

Comment trong code khẳng định "Chính xác tuyệt đối". Đo được: **gần đúng, còn ba
khuyết tật, hai trong số đó đáng sửa.**

**Khuyết tật 1 (chính, đã phân tích ở §2.1): không có metadata blend mode.**
Asset ra đúng dạng straight-alpha nhưng manifest không nói cho đích biết phải
hợp thành additive. Mọi đích mặc định `source-over` → quầng tối. `demo.html:320,
339` có `setBlendMode(Phaser.BlendModes.ADD)` cho `16-fx-burst`, nhưng đó là
**hardcode trong demo**, không đọc từ manifest.

**Khuyết tật 2: `α` và `F` dùng hai mẫu số khác nhau.** `α` trừ black-point rồi
rescale, còn `F` chia cho `mx` thô. Hệ quả: `α·F ≠ C`, năng lượng sáng bị mất ở
vùng glow yếu.

Tỷ lệ `α·F / C` (=1 là bảo toàn):

| max(RGB) | tỷ lệ | mất |
|---|---:|---:|
| 0.08–0.15 | 0.427 | **57.3%** |
| 0.15–0.25 | 0.676 | 32.4% |
| 0.25–0.40 | 0.831 | 16.9% |
| 0.40–0.70 | 0.933 | 6.7% |
| 0.70–1.00 | 0.982 | 1.8% |

Quầng ngoài mềm — thứ làm glow trông "mượt" — bị cắt mất hơn một nửa. Đây rất có
thể là phần còn lại của cảm giác "chưa mượt", độc lập với vấn đề blend mode.

**So sánh 4 biến thể black-point** (MAE khi dán additive lên nền 128 / nhiễu nền
còn lại / % mất sáng dải halo yếu 0.08–0.25):

| phương án | MAE add | nhiễu nền | mất sáng halo |
|---|---:|---:|---:|
| `a=(mx−BP)/(1−BP)`, `F=C/mx` — **hiện tại** | 4.96 | 0.000 | 37.2% |
| `a=(mx−BP)/(1−BP)`, `F=C/a` — nhất quán | 3.58 | 0.000 | 25.7% |
| `a = mx · smoothstep(6, 28)`, `F=C/mx` — **soft-gate** | **1.35** | 0.054 | **0.6%** |
| `a = mx`, `F=C/mx` — không gate | 0.00 | 2.143 | 0.0% |

→ **soft-gate là lời giải đúng**: khử gần hết nhiễu (0.054 vs 2.143 lv) mà chỉ
mất 0.6% độ sáng quầng yếu, MAE tốt hơn hiện tại 3.7×. Sửa 1 dòng.

**Khuyết tật 3 (nhỏ, không cần sửa): `F` luôn bão hoà.** Vì chia cho `max(R,G,B)`,
kênh lớn nhất của mọi pixel bị ép về 255. Ánh sáng trắng và ánh sáng vàng nhạt
đều thành "màu bão hoà + alpha". Dưới additive/screen điều này **vô hại** (vì
`α·F` mới là cái được cộng, và nó đúng), nhưng nếu ai đó tô màu (`tint`) asset
hoặc chỉnh opacity trong Figma thì màu sẽ lệch. Ghi nhận, không đề xuất đổi.

### 2.6 Chuyện gì xảy ra nếu đích **chỉ** có source-over

Đã sweep để trả lời dứt điểm "hạ alpha có cứu được không":

```
alpha = max (chuẩn)                   MAE tb 4 nền =  15.93 lv
alpha = max^1.2                       MAE tb 4 nền =  15.67 lv   <- tốt nhất
alpha = max^1.4                       MAE tb 4 nền =  16.15 lv
alpha = max^2.0                       MAE tb 4 nền =  18.64 lv
alpha = max^0.7 (tăng alpha)          MAE tb 4 nền =  23.52 lv
alpha = 1 (PNG đen đục, source-over)  MAE tb 4 nền = 102.72 lv
```

Tối ưu toàn cục là `γ = 1.2`, cải thiện **1.6%** — vô nghĩa về mặt thị giác.
Kết luận: **không có tinh chỉnh alpha nào cứu được source-over.** Đường lùi
tốt nhất là giữ `α = max(RGB)` và chấp nhận khuyết tật đã biết.

### 2.7 Từng đích xuất tận dụng được đến đâu

Công thức chuẩn W3C ([CSS Compositing and Blending Level 1][c1]) — hợp thành có
blend function:

> `Cr = (1 - αb) x Cs + αb x B(Cb, Cs)`

screen:

> `B(Cb, Cs) = 1 - [(1 - Cb) x (1 - Cs)] = Cb + Cs -(Cb x Cs)`

toán tử `lighter` (plus):

> `Fa = 1; Fb = 1` ; `co = αs x Cs + αb x Cb` ; `αo = αs + αb`

Với backdrop đục (`αb = 1`) — trường hợp của UI game — cả `SCREEN` và
`LINEAR_DODGE` đều thành `Cb + αs·(...)`, tức là **dùng đúng `α·F`**, chính là lý
do RGBA và PNG-đen tương đương (§2.4).

| Đích | Có blend cộng sáng? | Cách gán | Độ tin cậy |
|---|---|---|---|
| **CSS / web preview** | Có: `mix-blend-mode: screen` (Level 1, hỗ trợ rộng); `plus-lighter` (Level 2) | thuộc tính CSS trên `<img>` | Cao — [MDN `<blend-mode>`][mdn]. `plus-lighter` mới hơn, [thêm vào spec qua fxtf#444][fxtf444] |
| **Canvas 2D** | Có: `ctx.globalCompositeOperation = "lighter"` (= additive) hoặc `"screen"` | 1 dòng | Cao |
| **Figma (layer)** | Có: `SCREEN` và `LINEAR_DODGE` ("Plus lighter") | Blend mode trên layer, hoặc plugin API `node.blendMode = "LINEAR_DODGE"` | Cao — [Figma BlendMode API][figblend], [Figma Learn: Apply blend modes][figlearn], [Plus Lighter/Plus Darker đã launch][figforum] |
| **Figma qua clipboard hiện tại của ta** | **Không** | — | **Đã kiểm tra: không làm được.** Xem dưới |
| **Phaser** | Có: `BlendModes.ADD` | `sprite.setBlendMode(...)` | Cao — repo đã dùng ở `demo.html:320,339` |
| **Godot 2D** | Có: `CanvasItemMaterial.blend_mode = BLEND_MODE_ADD` (và `BLEND_MODE_PREMULT_ALPHA`) | material trên node | Cao — [CanvasItemMaterial][godot] |
| **Unity** | Có: shader/material additive (`Blend One One`), hoặc `Blend One OneMinusSrcAlpha` cho premultiplied | material | Cao (kiến thức phổ thông; chưa fetch được doc chính thức trong phiên này — cần xác nhận nếu ship cho Unity) |

**Kết quả kiểm tra Figma clipboard — quan trọng:**

`figma-export/figma-h2d.global.js` (49 KB) **không có khái niệm blend mode**.
Grep case-sensitive `blendMode` → **0 kết quả**. Hai lần xuất hiện
`mixBlendMode: "normal"` (dòng 421) và `backgroundBlendMode: "normal"` (dòng 320)
đều nằm trong **bảng giá trị CSS mặc định để lược bỏ**, không phải đường xử lý.
`copy-sprite-images.mjs` dựng HTML với `<div class="safe-frame"><img …></div>`
rồi để h2d chuyển thành payload `<!--(figmeta)…(/figmeta)-->` — nếu có thêm
`style="mix-blend-mode:screen"` vào `<img>` thì h2d cũng sẽ bỏ qua.

→ Asset dán vào Figma **không thể tự mang blend Screen** bằng exporter hiện tại.
Hai đường khả dĩ, chưa cái nào được thử:
1. Mở rộng `figma-h2d.global.js` để map `mix-blend-mode` → thuộc tính blend của
   node trong payload figmeta. **Rủi ro: chưa biết format figmeta của ta có chỗ
   cho blendMode hay không** — cần spike đọc format trước khi hứa.
2. Viết **Figma plugin** nhỏ, chạy sau khi paste: quét node theo tên
   (`16-fx-burst`, hoặc theo cờ trong tên) và set `node.blendMode =
   "LINEAR_DODGE"`. API này có tài liệu chính thức, rủi ro thấp. **Khuyến nghị
   đường này** cho lần thử đầu.
3. Đường lùi zero-code: manifest ghi `blendMode`, UI/README hướng dẫn người dùng
   set tay trong Figma (2 click cho mỗi asset FX — hiện chỉ có 1 asset).

---

## 3. Câu hỏi 2 — grid neo khung

### 3.1 Trạng thái đã chốt

`docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md` §8.1 đã đo và kết luận:
"Yêu cầu AI 'preserve/redraw grid exactly' khiến nó tái dựng hoặc nhân đôi grid."
Bảng §8 ghi v9 ("Grid/gray trên nền xanh") và v10 ("nested grid") đều thất bại vì
model coi grid là artwork. **Tài liệu này không đề xuất gì phá kết luận đó.**

Lưu ý một mâu thuẫn tài liệu cần dọn: `PRODUCT-SITEMAP.md` L337–341 vẫn viết
"giữ nguyên lưới và gray làm mốc registration", trong khi handoff §8.1 (mới hơn)
nói ngược lại. Handoff L17–19 đã báo trước xung đột này nhưng sitemap chưa được sửa.

### 3.2 Dữ liệu lệch khung tìm được trong runs (đọc-only)

Tìm được **bốn** nguồn đo độc lập, tất cả đồng thuận:

| Nguồn | Kết quả |
|---|---|
| Handoff §6 (v15, 9 ô) | mean max-edge **23.2 px**, worst **52 px**; v14: mean 23.3, worst 36 |
| `kit-gen/kits/manifest.json` (246 asset, 4 style) | mean max-abs edge **32.9 px**, median **26.0 px**; worst `rnd/26-bg-play` 192 px, `*/53-envelope-flap` 136–187 px |
| `~/KitGen/projects/*/kits/manifest.json` (2 dự án thật) | pose nhân vật 51–139 px; nút/chip 10–30 px; bg full-bleed 0–58 px |
| `~/KitGen/projects/*/runs/*/events.ndjson` | cảnh báo lệch tâm thực tế: `(-6,-36)`, `(-22,-32)`, `(+4,-43)`, `(-30,-38)`, `(+49,+14)`, `(+52,-14)` px |

Hai kiểu hỏng **ngược nhau** cùng tồn tại:
- **Co vào trong** — dấu `+L/+T, −R/−B` trong bảng v15 (handoff L230 đã nêu).
- **Tràn ra ngoài rồi bị cụt** — `~/KitGen/projects/blindtest-b2-retry-fee3/runs/r-0002/events.ndjson`:
  `⚠ chinh/01-pose-idle: content chạm mép canvas — raw tràn quá vành bleed, bị cụt`.

Sai số nằm ở dải **5–8% cạnh ô**. Loại tệ nhất luôn là **pose nhân vật** (hình
tự do, không có silhouette rõ ràng để bám); nút/chip nhỏ tốt nhất.

### 3.3 Phát hiện chặn đường: validator hình học đang vô giá trị

10/10 file `~/KitGen/projects/*/runs/*/artifacts/*.geometry.json` báo
`actual` = **nguyên ô** cho mọi cell:

```json
{"file": "01-pose-idle", "status": "regenerate", "reasons": ["size"],
 "expected": [268.8, 38.4, 230.4, 435.2], "actual": [0, 0, 768, 512]}
```

Nguyên nhân: `validate_output_geometry.py:8–9` mặc định key `#00FF00`, trong khi
sheet thật dùng magenta (`(245,12,248)`, `(250,6,247)`, `(243,9,219)` theo
manifest). Mọi pixel đọc thành foreground → `bbox_foreground()` trả nguyên ô.

Đối chiếu: `slice.py` **không** đọc `bg` từ contract mà tự dò key từ viền ảnh
(`border_colors()` + `is_key_color()`, dòng 77–102) — nên slice chạy đúng còn
validator chạy sai. Hai đường code có hai nguồn sự thật khác nhau.

Ngoài ra `measure-nine-element-alignment.py` chỉ `print()` ra stdout, không ghi
file — nên bảng §6 của handoff tồn tại **chỉ nhờ chép tay**. Không tái lập được
tự động.

### 3.4 Đánh giá từng biến thể grid mà chủ sản phẩm nêu

| Biến thể | Đánh giá | Lý do |
|---|---|---|
| **Bắt AI vẽ lại / giữ nguyên grid** | ❌ Không làm | §8.1 đã đo. Không có dữ liệu mới nào biện minh cho việc thử lại. |
| **Grid mảnh màu tách biệt rồi xoá deterministic** | ⚠️ Về nguyên tắc hợp lý, nhưng **không giải quyết vấn đề** | Xoá grid không khó — `slice.py` đã xoá nền deterministic tốt. Vấn đề là **model không đặt element đúng chỗ**, chứ không phải ta không xoá được grid. Thêm grid màu = thêm một màu nữa cạnh tranh với key magenta và với palette (xem §4.4). Chi phí thật, lợi ích giả định. |
| **Grid chỉ ở bleed / ngoài safe zone** | ⚠️ Biến thể ít hại nhất, nhưng vẫn chưa đáng thử **bây giờ** | Mốc nằm ngoài vùng nội dung → không bị nhầm là artwork, và xoá dễ. Nhưng model đã **thấy** ranh giới ô rồi (contract skeleton có outer grid) mà vẫn lệch 23 px — thêm mốc ở rìa khó tạo tín hiệu mới. Không có dữ liệu nào cho thấy model "không biết ô ở đâu"; dữ liệu cho thấy model **biết ô ở đâu nhưng tự diễn giải lại biên nội dung**. |
| **Neo bằng miêu tả toạ độ như v15** | ✅ Giữ nguyên | v15 đã cải thiện rõ ở hình cơ bản (pill 28→7 px, tròn 23→10 px, vuông 10→7 px). Hỏng còn lại tập trung ở free-shape/pose — là chỗ **không có biên rõ để miêu tả**, nên thêm grid cũng không giúp. |

### 3.5 Kết luận câu hỏi 2

**Không nên** đầu tư vào biến thể grid nào lúc này. Lý do quyết định không phải
"grid chắc chắn vô dụng", mà là: **hiện không có vòng đo tự động nào đủ tin cậy
để kết luận biến thể nào tốt hơn.** Mọi thí nghiệm grid chạy bây giờ sẽ được đánh
giá bằng cảm giác hoặc bằng chép tay — đúng thứ mà handoff §13 cấm.

Thứ tự đúng:

1. **Sửa validator** để nó dò key từ ảnh (dùng lại `border_colors()`/
   `is_key_color()` của `slice.py`) thay vì hardcode `#00FF00`.
2. **Ghi kết quả đo ra file** (`measure-*.py` thêm `--output`), để mean/worst
   thành số theo dõi được qua từng version.
3. Chạy **thí nghiệm rẻ nhất, đã được handoff §10 chỉ định**: cùng prompt v15,
   sheet **đồng nhất family hình học** (một sheet chỉ pill/bar, một sheet chỉ
   panel/square). Đây là biến số một chiều, đo được ngay bằng validator vừa sửa.
4. Chỉ khi (3) cũng không đủ, mới quay lại grid — và khi đó biến thể đáng thử
   duy nhất là **grid chỉ ở vùng bleed**, đo bằng đúng validator đó.

---

## 4. Câu hỏi 3 — thiết kế setting chế độ nền per-element

### 4.1 Cái đã có (đừng thiết kế lại từ đầu)

| Lớp | Trạng thái |
|---|---|
| Contract field | ✅ `skel.matte: "glow" \| "glass"` — `styles.json`, `element-lib.json:49` |
| Prompt | ✅ `gen.sh:252–260` chèn câu "SPECIAL CELL BACKGROUND … PURE BLACK #000000 … drawn ADDITIVELY on black" cho đúng ô đó |
| Slicer nhánh riêng | ✅ `slice.py:740–798` (+ vành đai chống tràn 777–797) |
| Zod schema | ✅ `webapp/src/lib/types/contract.ts:91`, và `skelSchema` là `z.looseObject` nên field lạ không bị rơi ở tầng này |
| UI chọn | ✅ nhưng **ở màn cũ**: `webapp/src/features/design/components/ElementProps.tsx:239–266` — select "Kiểu tách nền" (none / glow / glass) |
| Badge trên lưới ô | ✅ `webapp/src/features/design/components/CellGrid.tsx:189–191` (`✳`) |

### 4.2 Cái thiếu — bốn lỗ hổng cụ thể

**Lỗ 1 — trang Skeleton UI không có control này.**
Trang Skeleton UI là `webapp/src/features/workflow-v4/steps/KitsetStep.tsx`
(title literal dòng 126; mount ở `ProjectScreen.tsx:372` với `section=skeleton`,
và là bước ③ của wizard `WorkflowScreen.tsx:123`). Per-element nó **chỉ** cho sửa
`Rộng %` / `Cao %` (`SkelSizeFields`, `components/ItemDetail.tsx:98–143`).
Control nền phải vào `ItemDetailDialog`, `KitsetStep.tsx:224–241`, ngay cạnh
"Kích thước ô" — copy y hệt pattern của `ElementProps.tsx:239–266`.

**Lỗ 2 — lớp override của project làm rơi field.**
`webapp/src/features/workflow-v4/lib/model.ts:76` định nghĩa
`KitElementSkel = { w?, h? }`, và `kitset-to-contract.ts:180–185` **chỉ merge
`w`/`h`**. Nếu thêm `bgMode` mà không sửa hai chỗ này thì giá trị người dùng chọn
sẽ **im lặng biến mất** trước khi tới contract. Đây là cái bẫy chính.

**Lỗ 3 — preview prompt sẽ nói dối.**
`webapp/src/features/workflow-v4/lib/item-prompt.ts` (dòng 61–69) dựng lại đoạn
prompt hiển thị trong dialog nhưng **không tái tạo câu nền đen** của
`gen.sh:252–260`. Người dùng bật chế độ FX sẽ không thấy gì đổi trong preview.

**Lỗ 4 — skeleton PNG không vẽ ô đen.**
`skeleton.py` / `render-skeleton.mjs` / `silhouettes.js` **bỏ qua `matte` hoàn
toàn**. Ô nền đen chỉ tồn tại trong câu chữ prompt, không có trong ảnh
edit-target gửi cho model. Đây có thể là lý do `slice.py:762` phải có gate
"ô chưa có tấm đen — raw đời cũ": model đôi khi không vẽ tấm đen vì ảnh nó đang
sửa không có tấm đen nào để bám.

### 4.3 Đề xuất thiết kế (không code)

**Đặt tên.** Không tạo field mới `bgMode` song song với `matte`. `matte` đã mang
đúng nghĩa "ô này tách nền kiểu gì", và đã đi hết đường ống. Thay vào đó:

- Giữ khoá `skel.matte`, mở rộng miền giá trị nếu cần, và **đổi cách gọi ở UI**
  từ "Kiểu tách nền" (thuật ngữ kỹ thuật) thành **"Nền của ô"** với hai lựa chọn
  người dùng hiểu được:
  - **Chroma (mặc định)** — `matte` không đặt
  - **Đen — cho hiệu ứng phát sáng** — `matte: "glow"`
  - (giữ `glass` như lựa chọn nâng cao, hoặc ẩn khỏi trang Skeleton UI)
- Nếu về sau cần tách rời "nền lúc gen" khỏi "thuật toán matte", lúc đó mới
  thêm `skel.bg: "chroma" | "black"` và để `matte` chỉ còn nghĩa thuật toán.
  **Chưa cần bây giờ** — hai khái niệm đang 1:1.

**Contract bổ sung (đầu ra, không phải đầu vào).** Đây là phần mới thật sự:
manifest asset phải mang **chỉ dẫn hợp thành**, vì đó là thứ §2 chứng minh là
load-bearing:

```
kits/<style>/manifest.json → assets[]:
  "blend": "screen"          # hoặc "plus-lighter" / "normal"
  "blendReason": "additive-light"
```

Ghi từ `slice.py` cho mọi asset đi qua nhánh glow. Đây là hợp đồng để Figma
plugin, Phaser, Godot, và preview của webapp đều biết phải làm gì — thay cho
hardcode kiểu `demo.html:320`.

**gen.sh đổi gì.** Về cơ bản **không đổi** — câu ở dòng 256–260 đã đúng và đủ cụ
thể. Hai chỉnh nhỏ đáng cân nhắc:
- Thêm một câu yêu cầu **không** vẽ viền sáng sát mép ô (vì vành đai chống tràn
  ở `slice.py:781–797` đang phải dọn hậu quả).
- Mirror đúng câu này vào `item-prompt.ts` để preview không nói dối (Lỗ 3).

**slice.py rẽ nhánh nào.** Nhánh đã có, chỉ cần:
- đổi black-point cứng thành soft-gate (§2.5, khuyết tật 2 — 1 dòng, lợi 3.7×);
- ghi `blend` vào manifest;
- (tuỳ chọn) xuất thêm bản `*-onblack.png` để debug, nhưng **không** coi nó là
  asset giao hàng.

**Webapp hiện ở đâu.** Trang Skeleton UI, trong `ItemDetailDialog`
(`KitsetStep.tsx:224–241`). Kèm badge trên card ô (đã có pattern ở
`CellGrid.tsx:189–191`). Và preview kit phải composite bằng
`mix-blend-mode: screen` khi asset có `blend` — hiện `webapp/src/features/kit/
lib/backdrop.ts:15–19` mới chỉ có checker/dark/light, chưa có khái niệm blend.

### 4.4 Liên đới: chọn màu key tự động, xa palette

**Trạng thái thật:** màu key **hoàn toàn thủ công**, chọn từ đúng hai preset.

- Nguồn duy nhất vào prompt: `gen.sh:152` — `f"BACKGROUND of the sheet: one flat
  solid chroma-key color: {s['bg']}."`, với `s['bg']` là chuỗi tự do trên
  style/variant.
- Hai preset: `webapp/src/lib/types/contract.ts:54` — `CHROMA_PRESETS =
  { magenta: "pure vivid magenta #FF00FF", green: "pure vivid green #00FF00" }`.
  Mặc định magenta (`ops-style.ts:47`).
- **Không có dòng code nào chọn key theo palette.** Chỉ có câu khuyên người dùng
  ở `AdvancedTab.tsx:81–82`: "Chọn màu xa nhất với bảng màu của bộ kit: đồ ấm
  (đỏ/vàng) dùng magenta, đồ tím/hồng dùng green."
- `slice.py` không đọc `bg` từ contract — nó tự dò key từ viền ảnh. Nên nếu
  người dùng chọn sai key, slice vẫn chạy nhưng element trùng màu key sẽ bị
  **xỉn/mờ** — đúng đánh đổi mà `matte_vlahos` docstring (dòng 252–254) đã ghi rõ.

**Đây chính là gốc của việc "key magenta đá nhau với style neon magenta".**

**Đề xuất (thiết kế, không code):** thêm bước **gợi ý key tự động** ở màn Phong
cách, chạy khi người dùng đã chọn ảnh reference / mô tả style:

1. Trích palette từ ảnh inspo/brand refs (k-means ~8 màu, hoặc histogram hue có
   trọng số bão hoà).
2. Với mỗi ứng viên key, tính **khoảng cách hue tối thiểu** tới mọi màu palette
   có `saturation` đáng kể.
3. Chọn ứng viên có khoảng cách lớn nhất; cảnh báo đỏ nếu khoảng cách dưới ngưỡng
   (vd 40° hue) cho **cả hai** preset.
4. Mở rộng bộ ứng viên từ 2 lên **3–4** để luôn còn đường thoát:
   magenta `#FF00FF`, green `#00FF00`, cyan `#00FFFF`, và có thể vàng-chanh.
   Ràng buộc kỹ thuật: `is_key_color()` (`slice.py:97–102`) yêu cầu
   `max(rgb) − min(rgb) > 80`; `matte_pymatting`/`matte_vlahos` hiện chỉ phân
   biệt **green vs magenta** qua `is_green = kg > max(kr, kb)` — nên **thêm cyan
   đòi sửa slice.py**, không phải chỉ thêm một preset vào dropdown. Cần ghi rõ
   chi phí này trước khi hứa.
5. Cùng lúc, sửa `validate_output_geometry.py` để dò key từ ảnh (§3.3) — nếu
   không thì thêm preset thứ ba sẽ làm validator hỏng thêm.

Lưu ý phối hợp: nếu ô FX chuyển sang nền đen thì **màu key của sheet không còn
ảnh hưởng tới ô đó**, nên hai việc này bổ trợ nhau chứ không xung đột.

---

## 5. Khuyến nghị áp dụng / Không áp dụng

### ✅ Áp dụng — có số liệu hậu thuẫn

| # | Việc | Bằng chứng | Chi phí ước lượng |
|---|---|---|---|
| A1 | **Ghi `blend: "screen"` vào manifest** cho mọi asset qua nhánh glow, và coi đó là một phần hợp đồng đầu ra | §2.3: 0.00 vs 15.9–24.6 lv MAE. Đây là thay đổi có tác động lớn nhất trong cả tài liệu | nhỏ (slice.py + schema) |
| A2 | **Giữ RGBA làm asset giao hàng, KHÔNG ship PNG nền đen** | §2.4: bit-exact như nhau dưới blend; RGBA thắng 102.7 → 15.9 lv ở đường lùi source-over; giữ được crop/atlas/mask | không (giữ nguyên hiện tại) |
| A3 | **Đổi black-point cứng thành soft-gate** `a = mx · smoothstep(6, 28)` | §2.5: MAE 4.96 → 1.35 lv; mất sáng quầng yếu 37.2% → 0.6%; nhiễu nền vẫn 0.054 lv | 1 dòng |
| A4 | **Preview trong webapp composite bằng `mix-blend-mode: screen`** khi asset có `blend` | §2.7, [MDN][mdn]. Không sửa được cảm giác "đen đen" nếu preview vẫn source-over | nhỏ |
| A5 | **Sửa `validate_output_geometry.py` dò key từ ảnh** thay vì hardcode `#00FF00` | §3.3: 10/10 file output hiện vô giá trị | nhỏ, dùng lại `border_colors()` |
| A6 | **`measure-*.py` ghi kết quả ra file** | §3.3: bảng §6 handoff chỉ tồn tại nhờ chép tay | nhỏ |
| A7 | **Thêm control "Nền của ô" vào trang Skeleton UI**, và sửa `KitElementSkel` + `kitset-to-contract.ts:180–185` cùng lúc | §4.2 Lỗ 1+2: không sửa lớp merge thì field rơi im lặng | vừa |
| A8 | **Mirror câu prompt nền đen vào `item-prompt.ts`** | §4.2 Lỗ 3: preview đang nói dối | nhỏ |
| A9 | **Dọn mâu thuẫn tài liệu**: `PRODUCT-SITEMAP.md` L337–341 vs handoff §8.1 | §3.1 | nhỏ |

### ⚠️ Nên thử, nhưng phải spike trước khi hứa

| # | Việc | Điều kiện |
|---|---|---|
| B1 | **Figma plugin set `node.blendMode = "LINEAR_DODGE"` sau khi paste** | API có tài liệu chính thức ([BlendMode][figblend]); đây là đường ít rủi ro nhất để asset FX hiển thị đúng trong Figma |
| B2 | **Mở rộng `figma-h2d.global.js` map `mix-blend-mode` → node blend** | **Phải spike đọc format figmeta trước.** Grep xác nhận h2d hiện không có khái niệm blend (0 hit `blendMode`); chưa biết payload có chỗ chứa không |
| B3 | **Vẽ tấm đen vào skeleton PNG** cho ô `matte:"glow"` | §4.2 Lỗ 4. Giả thuyết: model bám ảnh tốt hơn bám chữ. **Đo được** bằng tỷ lệ ô kích hoạt gate `slice.py:762` trước/sau |
| B4 | **Gợi ý key tự động xa palette** | §4.4. Nếu chỉ chọn giữa magenta/green thì rẻ; thêm cyan **đòi sửa `is_green` trong slice.py** — phải tính vào chi phí |
| B5 | **Sheet đồng nhất family hình học** (handoff §10) | Chỉ chạy **sau** A5+A6, nếu không thì không đo được |

### ❌ Không áp dụng

| # | Việc | Lý do |
|---|---|---|
| C1 | **Bắt AI vẽ lại / giữ nguyên grid** | Handoff §8.1 đã đo. Không có dữ liệu mới. |
| C2 | **Grid màu tách biệt trong vùng nội dung rồi xoá deterministic** | §3.4: giải sai bài. Xoá grid vốn không phải vấn đề; đặt element đúng chỗ mới là. Còn thêm một màu cạnh tranh với key và palette. |
| C3 | **Grid ở bleed — làm ngay bây giờ** | §3.5: không phải vô lý, nhưng chưa có vòng đo để kết luận. Xếp sau A5/A6/B5. |
| C4 | **Tinh chỉnh alpha (gamma/knee/matting SOTA) để cứu source-over** | §2.6: tối ưu toàn cục `γ=1.2` chỉ cải thiện **1.6%**. Sai số `bg·α` là hằng đẳng thức, không khử được bằng chọn alpha. |
| C5 | **Ship PNG nền đen làm asset giao hàng** | §2.4: không hơn RGBA một bit nào dưới blend, và tệ hơn 6.5× ở đường lùi; mất crop/atlas/mask/preview. |
| C6 | **Chuyển ô FX sang matting model mạnh hơn (ViTMatte…)** | §2.1: bài toán trên nền đen là **đại số đóng**, `α = max(RGB)` là đáp án chính xác. Dùng model đoán là thụt lùi. |
| C7 | **Tạo field `bgMode` song song với `matte`** | §4.3: `matte` đã đi hết đường ống và đang 1:1 với khái niệm nền. Hai field song song = hai nguồn sự thật. |

---

## 6. Backlog items đề xuất

- **[FX/glow] Thêm `blend: "screen"` vào manifest asset** cho mọi ô `matte:"glow"`; định nghĩa field trong Zod schema. *(tác động lớn nhất; §2.3)*
- **[FX/glow] Đổi black-point `BP=18` cứng thành soft-gate `a = mx·smoothstep(6,28)`** ở `slice.py:766`. *(MAE 4.96→1.35 lv; mất sáng quầng yếu 37%→0.6%)*
- **[FX/glow] Preview kit trong webapp composite `mix-blend-mode: screen`** khi asset có `blend`; thêm vào `features/kit/lib/backdrop.ts`.
- **[FX/glow] Bỏ hardcode `Phaser.BlendModes.ADD` ở `demo.html:320,339`**, đọc từ manifest.
- **[Figma] Spike: Figma plugin set `node.blendMode = "LINEAR_DODGE"` cho asset có `blend`** sau khi paste. *(đường ít rủi ro nhất)*
- **[Figma] Spike: format figmeta của `figma-h2d.global.js` có chỗ cho blendMode không** — quyết định B1 vs B2. *(hiện 0 hit `blendMode` trong 49 KB)*
- **[Validator] Sửa `validate_output_geometry.py` dò key từ ảnh** (dùng `border_colors()`/`is_key_color()` của slice.py) thay vì hardcode `#00FF00`. *(10/10 output hiện vô giá trị)*
- **[Validator] `measure-nine-element-alignment.py` thêm `--output`**, ghi mean/worst ra file để theo dõi qua version.
- **[Skeleton UI] Thêm control "Nền của ô" (Chroma / Đen cho FX) vào `ItemDetailDialog`** — `KitsetStep.tsx:224–241`, copy pattern `ElementProps.tsx:239–266`.
- **[Skeleton UI] Mở rộng `KitElementSkel` và merge ở `kitset-to-contract.ts:180–185`** — nếu không, field vừa thêm sẽ rơi im lặng. *(làm cùng item trên, không tách)*
- **[Skeleton UI] Mirror câu prompt nền đen vào `item-prompt.ts`** để preview prompt không nói dối.
- **[Skeleton] Spike: vẽ tấm đen vào skeleton PNG cho ô `matte:"glow"`**; đo bằng tỷ lệ ô kích hoạt gate `slice.py:762`.
- **[Chroma] Gợi ý màu key tự động xa palette** ở màn Phong cách; cảnh báo khi cả hai preset đều gần palette. *(gốc của "magenta đá magenta")*
- **[Chroma] Nếu mở rộng sang cyan: sửa `is_green = kg > max(kr,kb)` trong `matte_pymatting`/`matte_vlahos`** — hiện chỉ nhận 2 loại key.
- **[Docs] Sửa `PRODUCT-SITEMAP.md` L337–341** cho khớp handoff §8.1 (grid/gray không còn là mốc registration).
- **[Geometry] Chạy thí nghiệm sheet đồng nhất family hình học** (handoff §10) — **sau** khi validator + logging xong.
- **[Geometry] Thêm `trim_flat_cell()` vào log** — hiện trả `(l,t,r,b)` rồi vứt ở `slice.py:835–836`, mất dữ liệu chẩn đoán.

---

## 7. Nguồn

- [CSS Compositing and Blending Level 1 — CSSWG drafts][c1] — công thức
  `Cr = (1-αb)·Cs + αb·B(Cb,Cs)`, định nghĩa `screen`, toán tử `lighter`.
- [MDN — `<blend-mode>` CSS type][mdn]
- [w3c/fxtf-drafts PR #444 — thêm `plus-lighter` vào `mix-blend-mode`][fxtf444]
- [Figma Plugin API — `BlendMode`][figblend] — enum đầy đủ gồm `SCREEN`, `LINEAR_DODGE`
- [Figma Learn — Apply blend modes to layers, fills, and effects][figlearn]
- [Figma Forum — LAUNCHED: Plus Lighter and Plus Darker Blending Modes][figforum]
- [Godot — `CanvasItemMaterial` (`BLEND_MODE_ADD`, `BLEND_MODE_PREMULT_ALPHA`)][godot]

Nguồn nội bộ (đọc-only): `slice.py:77–102, 105–232, 235–327, 740–798`;
`gen.sh:152–156, 252–274`; `figma-export/figma-h2d.global.js`;
`figma-export/copy-sprite-images.mjs`; `webapp/src/lib/types/contract.ts:54–96`;
`webapp/src/features/workflow-v4/steps/KitsetStep.tsx`;
`webapp/src/features/workflow-v4/lib/{model.ts,kitset-to-contract.ts,item-prompt.ts}`;
`webapp/src/features/design/components/ElementProps.tsx:239–266`;
`kits/manifest.json`; `~/KitGen/projects/*/kits/manifest.json`;
`~/KitGen/projects/*/runs/*/{events.ndjson,artifacts/*.geometry.json}`.

[c1]: https://drafts.csswg.org/compositing-1/
[mdn]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/blend-mode
[fxtf444]: https://github.com/w3c/fxtf-drafts/pull/444
[figblend]: https://developers.figma.com/docs/plugins/api/BlendMode/
[figlearn]: https://help.figma.com/hc/en-us/articles/360040667874-Apply-blend-modes-to-layers-fills-and-effects
[figforum]: https://forum.figma.com/t/launched-plus-lighter-and-plus-darker-blending-modes/685
[godot]: https://docs.godotengine.org/en/stable/classes/class_canvasitemmaterial.html
