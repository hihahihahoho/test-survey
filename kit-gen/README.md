# Game UI Kit PoC — 1 prompt contract → 5 style → asset đã cắt

> Bản đồ app và quy trình phát hành: [Development & Release Runbook](docs/DEVELOPMENT-AND-RELEASE-RUNBOOK.md).

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
Chỉ khâu GEN ẢNH cần AI; cắt là code thuần, chạy lại là ra đúng từng đó file, đúng
từng đó tên.

## Chạy

Engine là **JS thuần**, chạy bằng chính Node mà app dùng — không bash, không Python,
không venv, không thư viện ngoài (16/09/2026; trước đó là `gen.sh` + `slice.py` + Pillow).

```bash
node agent/engine/cli.mjs gen   <project>   # codex exec song song → raw/<style>.png
node agent/engine/cli.mjs slice <project>   # cắt theo toạ độ → kits/<style>/01-….png …
```

Bình thường không ai gõ hai lệnh này: agent spawn chúng khi người dùng bấm Gen trong app.

## Cấu trúc

```
styles.json            contract: lưới, element (id + spec + skel), style (id + mô tả)
agent/engine/cli.mjs   cửa vào DUY NHẤT của engine: gen · slice · cover · thumb · validate
agent/engine/gen.mjs   dựng prompt từ contract, chạy codex exec -s workspace-write song song
agent/engine/geometry.mjs  nguồn hình học DÙNG CHUNG — gen.mjs và slice.mjs cùng gọi
agent/engine/slice.mjs cắt sheet theo đúng toạ độ gen.mjs đã hứa
agent/engine/png.mjs   codec PNG + resample, chỗ Pillow từng đứng
raw/            sprite sheet gốc từng style
kits/<style>/   asset đã cắt — TÊN FILE GIỐNG NHAU giữa các style; `tight/` là bản khít viền
kits/manifest.json  canvas/lõi/safe zone từng asset, ô trống nếu có
prompts/        prompt nguyên văn đã gửi cho từng tấm
logs/           log từng con codex
```

## Điểm cần biết

- **PROMPT LÀ SẢN PHẨM, VÀ NÓ NÓI HÌNH HỌC BẰNG TỈ LỆ.** `gen.mjs` in prompt theo section;
  mỗi ô mang **tỉ lệ W:H của lõi** kèm lời tả ("core aspect 2.9:1, about three times wider
  than tall") và bề ngang trên màn bằng lời — **không toạ độ pixel nào**. Cho tới
  14/09/2026 nó in hộp cắt bằng bốn con số tuyệt đối; số đo lượt r-0021 kết thúc chuyện
  đó: model vẽ đúng tâm, đúng ô, mà lõi 587px nằm trong hộp hứa 368px — mọi ô lệch
  1,5–1,7 lần, qua codex lẫn khi dán tay vào web ChatGPT. Cỡ tuyệt đối nay là việc của hạ
  nguồn: `slice.mjs` cắt theo ô rồi đo lõi bằng bbox α≥128, webapp co bản đo được về
  `outSize`. `geometry.mjs` vẫn là nguồn số học DUY NHẤT của dao cắt.
- **KHÔNG CÓ TẦNG TÁCH NỀN.** Sheet do model sinh mang **alpha thật**, nên `slice.mjs`
  CHỈ CẮT: không chroma-key, không matting, không lấp lỗ, không nắn lõi về khung. Mọi cỗ
  máy đó đã bỏ (07/09/2026) vì chúng gặm ruột element có alpha thật — đo được: ruột thanh
  máu α≈90 ra α≈5. Ô cần nhìn xuyên thì nói bằng prompt (pill «Đục nền» của app nối
  một câu tả alpha vào `spec` của ô), không phải bằng thuật toán hậu kỳ.
- **Canvas chuẩn hoá**: mỗi element xuất đúng kích thước ô của sheet, căn giữa — cùng
  element ở mọi style ra file cùng size. Ảnh gốc chưa cắt ở `raw/`, prompt ở `prompts/`.
- Component **không chữ có chủ đích** — text ghép sau bằng code/Figma.
- Muốn thêm style: thêm một mục vào `styles.json` rồi chạy lại hai lệnh. Không sửa code.
