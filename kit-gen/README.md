# Game UI Kit PoC — 1 prompt contract → 5 style → asset đã cắt

Proof-of-concept cho hướng tool #2 trong [analysis/ket-qua-dot-1.md](../analysis/ket-qua-dot-1.md):
**bộ component cố định của mini-game campaign chỉ đổi style, không đổi nội dung**.

## Ý tưởng

1 sprite sheet = lưới 4×3 chứa đúng **12 component cố định** (bảng xếp hạng, popup, form,
giỏ quà, lịch sử, cộng lượt, CTA, đếm ngược, đếm xu, thẻ quà, toast, thanh tiến độ) —
thứ tự và nội dung khoá cứng trong prompt, chỉ khối *style* thay đổi.

Vì layout cố định nên bước cắt là **thuần cơ học**: chia lưới → tách nền (chroma-key màu
nền phẳng) → trim → đặt tên theo contract. Không cần người ngồi crop.

## Chạy

```bash
./gen.sh              # 5 con codex exec song song, mỗi con 1 style → raw/<style>.png
python3 slice.py      # cắt 4×3, tách nền, trim → kits/<style>/01-….png … 12-….png
python3 preview.py    # sinh preview.html — ma trận 12 component × 5 style
open preview.html
```

## Cấu trúc

```
styles.json     contract: lưới, 12 component (id + spec), 5 style (id + mô tả + màu nền)
gen.sh          build prompt từ contract, chạy codex exec -s workspace-write song song
raw/            sprite sheet gốc từng style
kits/<style>/   asset đã cắt — TÊN FILE GIỐNG NHAU giữa các style
kits/manifest.json  kích thước từng asset, màu nền phát hiện được, ô trống nếu có
logs/           log từng con codex
preview.html    bảng so sánh trực quan
```

## Demo màn home

```bash
open demo.html
```

Màn home mini-game lắp từ chính asset đã cắt: coin counter, đếm ngược chạy thật, giỏ quà,
CTA, popup nhận quà (thẻ quà + form), bảng xếp hạng, lịch sử, toast, +1 lượt.
**Đổi style = đổi 1 đường dẫn thư mục** — tên file trùng nhau nên switcher chỉ đổi prefix.
Toàn bộ chữ là HTML đè lên asset trống (component không chữ), đúng workflow production:
text đổi theo campaign mà không đụng vào ảnh.

## Điểm cần biết

- Prompt yêu cầu **nền trong suốt + không chữ + ruột đặc**. Tool image-gen của codex trả
  RGB không alpha, nhưng model vẽ nền caro "fake transparent" — slicer chroma-key theo
  1–2 màu nền lấy từ viền sheet nên caro hay màu phẳng đều cắt được.
- **Lấp lỗ oan**: fill trắng trong component (ô input…) trùng màu caro sẽ bị key nhầm →
  vùng trong suốt nào nằm KÍN trong lòng component (không thông ra rìa sheet) được lấp lại
  bằng pixel gốc. Đánh đổi: lỗ xuyên thật trong thiết kế (khe quai giỏ…) cũng bị lấp —
  manifest ghi số pixel đã lấp để soát.
- Model có thể vẽ lệch lưới hoặc gộp ô — slicer gán khối pixel về ô theo trọng tâm
  (connected-component), chịu được component tràn vạch lưới; `empty_cells` trong manifest
  là thước đo độ tin cậy.
- Component **không chữ có chủ đích** — text ghép sau bằng code/Figma (xem demo.html).
- Muốn thêm style: thêm một mục vào `styles.json` rồi chạy lại 3 lệnh. Không sửa code.
