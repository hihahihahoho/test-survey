# Kết quả khảo sát đợt 1 — Creative Workflow & Tooling Audit 2026

**3 phản hồi** (30/07/2026): Dũng (Illustrator/Character, 1–3 năm), Phương (Game Artist, 3–5 năm),
Linh (Game Artist, <1 năm). Cả 3 output vào **Game**, cả 3 làm **campaign mini-game thường xuyên**.

> Cỡ mẫu 3 người — các con số dưới đây là kiểm kê + tín hiệu, không phải thống kê.
> Giá trị nằm ở chỗ **cả 3 phiếu kể cùng một câu chuyện**, và câu chuyện đó rất rõ.

---

## 1. Phát hiện lớn nhất: pipeline thực tế là "ChatGPT + sửa tay 40–60%"

Đây là điểm cả 3 phiếu trùng nhau tuyệt đối:

| | Dũng | Phương | Linh |
|---|---|---|---|
| AI trong việc thật | Ra asset cuối, **sửa nhiều** | Ra asset cuối, **sửa nhiều** | Ra asset cuối, **sửa nhiều** |
| Thời gian sửa sau AI | **40–60%** | **40–60%** | **40–60%** |
| Tool AI chính | ChatGPT (cả tách nền, cả 3D!) | ChatGPT | ChatGPT |

Cả 3 đều phải sửa (6/6 mục trùng): **tay/mặt/chi tiết cơ thể · logo & brand · color grading ·
perspective/crop · ghép nhiều ảnh · grain/shadow/ánh sáng**. 2/3 thêm: tách nền, text/typography.

Quy trình thật của Dũng (nguyên văn, rất đáng đọc):
> sketch + mô tả → ChatGPT tăng nét/smooth → sửa tay → **tách lớp, tách asset** → ChatGPT lần nữa
> → tách nền → hoàn thiện

Nghĩa là: team không cần "AI tạo ảnh" — họ đã dùng rồi. Cái đang đốt thời gian là
**mọi thứ SAU khi AI nhả kết quả**. Với asset điển hình 3–8 giờ, 40–60% là ~1,5–4 giờ
sửa cơ học mỗi asset.

Rào cản AI (gộp): chất lượng chưa đủ chuẩn bàn giao (3/3), không nhất quán character (Phương),
prompt tốn thời gian + kết quả ngẫu nhiên (Linh).

## 2. Khối lượng & việc ngốn thời gian

Loại việc làm nhiều (Rất nhiều/Nhiều):

| Việc | Số người | Ghi chú |
|---|---|---|
| Illustration / key visual | **3/3** | cả 3 chấm "Rất nhiều" |
| Character / mascot | 2/3 | |
| Asset game | 2/3 | |
| Icon app/UI, Màn hình UI | 1/3 mỗi loại | |
| Social, banner ads, print, ảnh sản phẩm | **0/3** | phần thừa của survey, cắt ở v2 |

Top việc ngốn thời gian (câu chọn tối đa 5): **Asset game 3/3** · Illustration 2/3 ·
Màn hình UI 2/3 · Character 2/3.

Công đoạn ngốn thời gian (Nhiều+): **Ideation/sketch/layout 3/3** · Research/reference 2/3
(riêng Dũng >1 giờ mỗi lần tìm ref) · Tạo nội dung chính 2/3. Resize/export/đặt tên chấm "Ít"
— nhưng xem mục 4, grid điểm yếu và câu tự luận nói ngược lại.

Biến thể từ cái có sẵn: 20–40%, 20–40%, 40–60% khối lượng tuần.

## 3. Nền tảng đang thiếu (điểm nghẽn tổ chức, không phải tool)

| | Dũng | Phương | Linh |
|---|---|---|---|
| Template/master dùng lại | Có nhưng **rối, tìm mất thời gian** | Tự làm riêng, **không chia sẻ** | **Không có** |
| Brand guideline | Không rõ | Đang xây | Đang xây |
| Cơ chế tự động trong tool | Không dùng | Chỉ Figma components | Không dùng |
| Tự viết script | Không, không nhu cầu | Không, không nhu cầu | Không, **muốn học** |
| Checklist bàn giao | Không có | Trong đầu | Riêng của mình |

→ **Không tồn tại thư viện template chung**, trong khi (theo lời anh Tùng) phần UI game
cố định lặp lại mỗi campaign: bảng xếp hạng, popup modal, form nhỏ, giỏ quà, lịch sử, cộng lượt.
Đây là khoảng trống rõ nhất và rẻ nhất để lấp.

Mascot: 2/3 nói có 1–2 nhân vật cố định; Phương nói mỗi campaign **vẽ lại theo style khác** —
và "không giữ được nhất quán character" là rào cản AI số 1 của bạn ấy.

## 4. Nhu cầu automation (chấm trực tiếp + câu tự luận)

Grid "có muốn tự động hoá không":

| Công đoạn | Tín hiệu |
|---|---|
| **Tách nền / mask** | Rất cần ×2 + Cần ×1 → **mạnh nhất** |
| Upscale & sharpen | Rất cần + Cần (2/3) |
| Resize & crop đa tỷ lệ | Cần ×2 |
| Xuất đủ format & density | Cần ×2 |
| Đặt tên + đóng gói | Rất cần ×1 (Phương), còn lại chưa rõ |
| Kiểm tra tự động trước bàn giao | chia đôi: Rất cần (P) vs Không cần (D) |
| **Xuất PDF/slide bàn giao** | Không áp dụng ×3 → **bỏ, không làm** |
| Áp preset màu brand | yếu |
| (Phương — mảng motion) | Đổi template motion: Cần · Tối ưu Lottie: Cần · Sinh pose từ character: Cần |

Câu tự luận "tắc ở đâu" chỉ đích danh:

- **Linh**: "Photoshop — chỉnh nhiều layer, cập nhật theo feedback, resize/chuyển nhiều kích
  thước, export từng asset riêng, đặt tên theo quy chuẩn, kiểm tra lại" → đúng cụm export/đóng gói,
  dù grid thời gian chấm "Ít". Tin câu tự luận hơn.
- **Phương**: "After Effects chưa phù hợp rigging & animation game… khó tái sử dụng animation,
  cần công cụ chuyên dụng như **Spine**" → không phải bài toán automation, là bài toán **chọn tool**.
- **Dũng**: "không có công cụ nào làm mất thời gian khi đã có ChatGPT" — nhưng chính phiếu của
  Dũng khai sửa sau AI 40–60% và tìm ref >1 giờ. Người dùng AI nhiều nhất chưa thấy phần sửa
  là chi phí.

Giới hạn đỏ (2/3 nói rõ): **không để AI làm ý tưởng/concept** — AI chỉ ra "đủ dùng, chưa đủ wow".

## 5. Kết luận: automate cái gì, theo thứ tự

### #1 · Game Art Finishing — hậu kỳ sau AI *(bằng chứng mạnh nhất: 3/3, mất 40–60%)*
Một pipeline nhận ảnh AI/sketch đã duyệt → chạy batch: **tách nền/mask → upscale & sharpen →
khớp màu → grain/shadow đồng nhất → tách lớp/tách asset → resize theo bộ tỷ lệ → export đúng
format + đặt tên**. Chính xác các bước Dũng đang làm tay + vòng lặp ChatGPT.
Đích đo được: sửa sau AI từ 40–60% xuống ~20%.

### #2 · Thư viện Game UI Kit dùng chung *(0/3 có template chung; thành phần cố định đã biết)*
Figma library component + variants cho phần cố định: **bảng xếp hạng, popup modal, form nhận quà,
giỏ quà, lịch sử, cộng lượt/đếm lượt** + button đủ state, countdown, toast. Mỗi campaign chỉ đổi
theme (màu, hoạ tiết, mascot). Đây là việc tổ chức + dựng 1 lần, chưa cần code; làm nền cho
pipeline "ý tưởng → UI kit" sau này. Survey 2 (game-uikit) sinh ra để chốt spec bộ này — nên gửi
ngay cho đúng nhóm 3 người này + dev + PM.

### #3 · Character/mascot nhất quán *(2/3 có mascot cố định; rào cản số 1 của Phương)*
Lock 1–2 mascot bằng reference/LoRA + pose control để AI giữ đúng nhân vật qua các campaign;
xuất PNG nền trong + file tách lớp. Ghép chung backend với #1.

### #4 · Export & đóng gói batch *(câu tự luận của Linh + "phải làm tay từng file" 2/3)*
Script/plugin: export đa kích thước, đặt tên theo convention, nén (đã có người dùng TinyPNG +
texture packer lẻ tẻ — gom thành một nút). Có thể là phase 2 của #1.

### #5 · Đánh giá Spine cho animation game *(1 người, nhưng đúng chuyên môn)*
Không phải build tool — mua/thử license Spine (hoặc DragonBones) cho Phương thay vì ép AE làm
rigging game. Chi phí thấp, giải quyết đúng cái người duy nhất làm animation kêu.

### Việc phụ đáng làm ngay (không cần code)
- Dọn thư viện template hiện có (Dũng: "rối, tìm lại mất thời gian") + quy ước chia sẻ chung.
- Thư viện reference nội bộ theo loại màn game (Dũng mất >1 giờ/lần tìm ref).
- Một checklist bàn giao chung (hiện 3 người 3 kiểu).

### KHÔNG làm (dữ liệu đã bác)
- ~~Xuất PDF/slide bàn giao~~ — Không áp dụng ×3.
- ~~QA bot~~ — export lại vì sai spec: 0 và 1–2 lần/tuần, bàn giao "không vấn đề đáng kể".
- ~~Module social/banner/print~~ — không ai làm.
- ~~Preset màu brand~~ — tín hiệu yếu, brand guideline còn đang xây.

## 6. Ghi chú cho survey v2

- Cắt: social, ads, print, **ảnh sản phẩm/composite** (Linh feedback: câu ví dụ nghiêng team
  Graphic, team thực tế là Digital Art/game; "ảnh thật/assets không hiểu tính thế nào").
- Câu "sinh pose từ character" đang nằm ở grid "Chuyển động & nhân vật" nên 2 illustrator chấm
  "Không áp dụng" oan — chuyển sang phần ảnh tĩnh.
- Gửi survey `game-uikit-pipeline-2026` cho nhóm này + dev + PM để chốt spec bộ UI kit (#2).
- Học tool mới: sẵn sàng nửa ngày → 1 ngày; pilot: "tuỳ, nếu không ảnh hưởng deadline" ×2.
