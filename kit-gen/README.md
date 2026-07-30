# Game UI Kit PoC — 1 prompt contract → 5 style → asset đã cắt

Proof-of-concept cho hướng tool #2 trong [analysis/ket-qua-dot-1.md](../analysis/ket-qua-dot-1.md):
**bộ component cố định của mini-game campaign chỉ đổi style, không đổi nội dung**.

## Ý tưởng

Contract **26 element / 3 sheet** rút từ Figma game thật (VietinBank iPay "Mở túi - Khui quà",
phân tích bằng sub-agent đọc trang Components + 34 màn hình flow):

- **main** (4×4, ô ngang 3:2): 3 nút pill + nút tròn + tab idle/active + progress **máng và
  thanh chạy tách rời** + ô số đếm ngược + ruy băng + panel popup ngang + mảnh ghép
  sáng/khoá + voucher + hộp quà + hiệu ứng nổ sáng
- **tall** (4×2, ô dọc 3:4): mascot 3 pose (đứng/ngó/ăn mừng) + túi quà **đóng và mở** +
  khay + popup dọc + nút nổi vào game
- **bg** (2×1): nền chính + nền mờ (game thật dùng nền mờ nhiều gấp 25 lần nền sáng)

Quy tắc tách phần: **cái gì code cần điều khiển độc lập thì là file riêng, nằm ở ô riêng**
— progress đổi %, tab swap state, túi swap đóng→mở, mascot đổi pose theo màn.
Chỉ khâu GEN ẢNH cần AI; crop + tách nền + lấp lỗ là code thuần, chạy lại là ra đúng
từng đó file, đúng từng đó tên.

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

Full flow «Mở túi - Khui quà» lắp từ asset đã cắt: **loading** (progress track + fill lồng
nhau, đổi % bằng clip-path) → **home** (đếm ngược 4 ô số chạy thật, khay 6 túi hue-rotate,
mascot đứng) → **chọn túi** (mascot ngó) → **mở túi** (swap ảnh đóng→mở + nổ sáng) →
**popup kết quả** (panel dọc + ruy băng cưỡi mép trên + quà + 2 nút thò dưới mép) →
màn Nhiệm vụ/Giỏ quà/Lịch sử (tab active/idle, card CSS, mảnh ghép sưu tập).
**Đổi style = đổi 1 đường dẫn thư mục** — tên file trùng nhau nên switcher chỉ đổi prefix.
Toàn bộ chữ là HTML đè lên asset trống — text đổi theo campaign mà không đụng vào ảnh.

## Điểm cần biết

- **Nền = màu chroma-key chát** (magenta cho style xanh, green cho style ấm — chọn ngoài
  palette, prompt cấm dùng màu key trong element). Slicer matte theo công thức **Vlahos +
  despill**: alpha đo bằng mức "nhiễm key" của từng pixel nên glow phai mượt không răng
  cưa, ruột rỗng có chủ đích được rỗng thật, và viền không ám màu nền. Bài học: nền caro
  "fake transparent" nhìn hay nhưng phá matte (mép gặm hình bàn cờ, ruột bị lấp caro) —
  các chế độ cũ (binary + lấp lỗ) vẫn còn trong code làm đường lùi cho sheet nền nhạt.
- **Canvas chuẩn hoá**: mỗi element xuất đúng kích thước ô của sheet (main 384×256,
  tall 384×512, bg 768×1024), căn giữa — cùng element ở mọi style ra file cùng size,
  layout demo không xô lệch. Ảnh gốc chưa cắt ở `raw/`, prompt từng sheet ở `prompts/`.
- Model có thể vẽ lệch lưới hoặc gộp ô — slicer gán khối pixel về ô theo trọng tâm
  (connected-component), chịu được component tràn vạch lưới; `empty_cells` trong manifest
  là thước đo độ tin cậy.
- Component **không chữ có chủ đích** — text ghép sau bằng code/Figma (xem demo.html).
- Muốn thêm style: thêm một mục vào `styles.json` rồi chạy lại 3 lệnh. Không sửa code.
