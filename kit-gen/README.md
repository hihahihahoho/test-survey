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

## Điểm cần biết

- Màu nền mỗi style được khai trong prompt là **một màu phẳng** — điều kiện để chroma-key
  hoạt động. Style neon có glow sẽ giữ lại quầng sáng quanh asset (chấp nhận được ở mức PoC).
- Model có thể vẽ lệch lưới hoặc gộp ô — `slice.py` báo `empty_cells` trong manifest khi
  một ô không có gì sau khi tách nền. Đó là thước đo độ tin cậy của cách này.
- Text tiếng Việt có dấu hay bị vẽ sai nên prompt dùng nhãn không dấu ("CHOI NGAY").
  Bản production nên để component **không chữ** rồi ghép text bằng code/Figma sau.
- Muốn thêm style: thêm một mục vào `styles.json` rồi chạy lại 3 lệnh. Không sửa code.
