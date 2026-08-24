# Kế hoạch test — VNPAY Design App · Phase 1

**Phase 1: Test luồng review tài liệu bằng AI** · 20/08 – 09/09/2026 (3 tuần)

## File

| File | Dùng để |
|---|---|
| `VNPAY-Design-App_Ke-hoach-test-Phase1.xlsx` | Mở thẳng bằng Excel — đã có dropdown + tô màu sẵn |
| `tsv/01_Phase-1.tsv`, `02_Ke-hoach-va-Hop-tuan.tsv`, `03_Danh-muc.tsv` | Copy-paste vào Google Sheets (3 tab: `Phase 1` · `Kế hoạch & Họp tuần` · `Danh mục`) |
| `apps-script/setup-google-sheet.gs` | Chạy sau khi paste TSV để có dropdown + màu trên Google Sheets |

## Tab `Phase 1` — bảng chính

Chia theo 3 khối tuần (hàng cam). Mỗi tuần 4 dòng, **mỗi team 1 dòng** → cả Phase 1 chỉ 12 dòng.

`STT | TEAM | TEAMLEAD / NGƯỜI TEST | TÀI KHOẢN | TÍNH NĂNG / DỰ ÁN TEST | LOẠI | TRẠNG THÁI | ĐIỂM HỮU DỤNG | ĐIỂM CHÍNH XÁC | FEEDBACK / VẤN ĐỀ PHÁT SINH`

4 cột đầu đã điền sẵn. Mỗi tuần mỗi team chỉ điền: **tính năng đã test · loại · trạng thái · 2 điểm · feedback**.

**TRẠNG THÁI** (1 dropdown gom hết): `Chưa cài đặt` (đỏ) → `Đã cài đặt` (xám) → `Đang test` (vàng) → `Đã test xong` (xanh dương) → `Đã feedback` (xanh lá) · `Không test tuần này`

Điểm 1–2 đỏ · 3 vàng · 4–5 xanh.

## Tab `Kế hoạch & Họp tuần`

4 dòng: Tuần 1, Tuần 2, Tuần 3, Phase 2. Cột: `TUẦN | THỜI GIAN | MỤC TIÊU TUẦN | HỌP REVIEW | FEEDBACK TỔNG HỢP TRONG TUẦN | TRẠNG THÁI`.
Họp review: 26/08 · 01/09 (dời sớm do nghỉ lễ 02/09) · 09/09.

## Cần chốt trước 26/08

- Team 4 (ngocln / linhnl) **chưa có tài khoản** — hiện chỉ có 3: `designvnpay2@gmail.com`, `qlptsp.ptk.1@gmail.com`, `qlptsp.ptk.2@gmail.com`.
- Mỗi team chốt 3 tính năng/dự án sẽ test (mong muốn 1 cũ + 2 mới; không có dự án mới thì lấy 3 cũ).

## Phase 2 (ghi chú tạm)

Từ 10/09, ~3 tuần: dùng feedback Phase 1 để build tính năng mới. Chốt scope tại buổi họp 09/09.
