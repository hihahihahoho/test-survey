# Bàn mổ lượt dán từ Figma (`fig-kiwi`)

> Dụng cụ ĐO, chỉ có ở bản dev. Nó không đổi một byte nào của đường copy thật.

## 1. Vì sao có nó

Đường dán hiện tại đi qua `vendor/figma-h2d`: app mô tả bằng CSS, Figma tự dịch
sang node. Chín cách viết CSS đã được dựng và đo (`kit-core/lib/figma-lab.ts`) —
**cả chín đều ra Constraints = Left/Top**, không khoá tỉ lệ, không cắt cúp. Kênh
CSS không có chỗ để nói ba câu đó.

Hướng còn lại: dùng **chính định dạng bộ nhớ tạm gốc của Figma**

```
<!--(figmeta)…base64…(/figmeta)--><!--(figma)…base64…(/figma)-->
```

trong đó khối `figma` là nhị phân `fig-kiwi`. Kế hoạch: lấy **chính cái mà chủ
sản phẩm copy từ Figma làm KHUÔN** (họ tự bấm đúng một lần cho đúng), rồi app chỉ
thay ảnh + số đo + tên trước khi ghi lại vào bộ nhớ tạm.

Bước này **chưa mã hoá lại gì cả**. Nó chỉ trả lời ba câu bằng số đo thật:

1. Khối `figma` mở ra được bằng thứ có sẵn trong trình duyệt không?
2. Tên **thật** của trường ràng buộc / khoá tỉ lệ / cách trải ảnh là gì?
3. **Ảnh** có nằm trong payload không, hay chỉ là một mã băm trỏ về máy chủ Figma?

## 2. Mở ở đâu

Nút **«Dán từ Figma vào đây»** nằm ở góc **dưới bên trái** mọi màn, và chỉ hiện khi:

* chạy `npm run dev` (bản dev), **hoặc**
* mở bản đã build kèm query `?lab=figma` — ví dụ
  `http://127.0.0.1:8765/app/?lab=figma`.

Cùng đúng một cổng với nút thí nghiệm chín kiểu: `labFlagOn()` trong
`src/features/kit-core/lib/figma-lab.ts`. Người dùng cuối không bao giờ thấy nó.

## 3. Việc của chủ sản phẩm — làm đúng bảy bước này

Trong Figma, dựng **một** cái khuôn (chỉ phải làm một lần, giữ lại mà dùng mãi):

1. Tạo khung ngoài tên **`tpl`**, cỡ **245 × 85**.
   Bật **khoá tỉ lệ** (biểu tượng ổ khoá giữa hai ô W/H trong panel Design).
2. Bên trong nó, tạo khung con tên **`image`**, cỡ **246,71 × 85,66**,
   đặt tại **X = −0,86 · Y = −0,33** (tức nó tràn ra ngoài khung cha một chút —
   đúng như một ô thật của tấm).
3. Chọn khung `image` → panel Design → **Constraints**: đặt **Scale** cho cả
   chiều ngang lẫn chiều dọc.
4. Vẫn ở khung `image`: bật **khoá tỉ lệ** cho nó luôn.
5. Đặt **Fill** của khung `image` là một **ảnh bất kỳ** (kéo thả ảnh nào cũng
   được, nội dung không quan trọng), rồi đổi chế độ ảnh thành **Crop**.
6. Chọn khung ngoài **`tpl`** → **Cmd/Ctrl + C**.
7. Mở app (xem mục 2) → bấm nút **«Dán từ Figma vào đây»** → **Cmd/Ctrl + V**
   → bấm **«Copy JSON phân tích»** → dán vào tin nhắn gửi về.

> Bấm C ở **khung ngoài**, không phải ở khung `image`. Thứ cần đo là **cả cụm hai
> khung lồng nhau**, vì đó đúng là hình dạng mà app sẽ phải dựng lại.

## 4. Bản JSON nói gì

| Khoá | Nó trả lời câu nào |
| --- | --- |
| `container.version` | số hiệu bản của định dạng `fig-kiwi` — để biết đang nói chuyện với đời nào |
| `chunks[].method` | `deflate-raw` hay `deflate` — **chưa ai ở đây đo được**, nên nó được ghi ra chứ không đoán |
| `schema.allNames` | tên đầy đủ của mọi định nghĩa trong lược đồ |
| `schema.wanted` | các định nghĩa đi tìm: `NodeChange`, `Paint`, `Image`, `ConstraintType`, `ImageScaleMode`, `Blob`, … kèm **mọi trường** của chúng |
| `message.nodes[].keys` | **tên thật** của mọi trường trên từng node — chỗ duy nhất trả lời câu ② |
| `message.nodes[].fields` | phần đã lọc: ràng buộc, khoá tỉ lệ, cỡ, ma trận, `fillPaints` |
| `message.blobs[]` | số lượng + 8 byte đầu dạng hex + nhận mặt PNG/JPEG — trả lời câu ③ |
| `message.bytesLeft` | **phải bằng 0**. Khác 0 nghĩa là bộ đọc lệch ở đâu đó phía trên |
| `errors` | mọi chỗ chưa mở được, viết ra hết |

## 5. Giới hạn đã biết — đọc trước khi kết luận

* **Trần 200 KB.** Bản đầy đủ có thể to hơn cái ô dán. Khi vượt trần, JSON bị cắt
  theo bậc (bỏ bớt trường của lược đồ → bớt node → …) và **luôn cắm cờ `daCat:
  true`**. Đừng đọc một bản bị cắt thành "payload không có trường đó".
* **Chưa đọc khối thứ ba trở đi.** Vỏ `fig-kiwi` cho phép nhiều khối; bàn mổ mới
  giải khối 0 (lược đồ) và khối 1 (dữ liệu). Khối thừa được ghi vào `errors` kèm
  8 byte đầu, không bị bỏ lơ.
* **Không có payload thật trong test.** Bộ test dựng một lượt dán tổng hợp đúng
  định dạng (`__tests__/fig-fixture.ts`). Nó canh được bộ đọc, **không** canh được
  chuyện Figma thật đặt tên trường ra sao — đó chính là việc của mục 3.
* **Chưa mã hoá lại.** Bước này một chiều: đọc, không ghi.
* **Không thêm thư viện nào.** Giải nén dùng `DecompressionStream` có sẵn; đọc
  kiwi dùng bộ đọc viết tay (`kit-core/lib/kiwi-decode.ts`). Gói `kiwi-schema`
  bị loại vì `compileSchema` của nó chạy bằng `new Function(...)` — tức `eval`,
  chết dưới CSP và bị cấm ở nhiệm vụ này.

## 6. File liên quan

| Đường dẫn | Việc |
| --- | --- |
| `webapp/src/features/kit-core/lib/kiwi-decode.ts` | đọc lược đồ + bộ thông dịch kiwi (thuần) |
| `webapp/src/features/kit-core/lib/fig-kiwi.ts` | tách base64, bóc vỏ, giải nén, dựng bản phân tích |
| `webapp/src/features/kit-core/components/FigmaPasteLab.tsx` | bảng dev + bắt sự kiện dán |
| `webapp/src/features/kit-core/lib/__tests__/fig-fixture.ts` | dựng lượt dán tổng hợp cho test |
| `webapp/src/features/kit-core/lib/__tests__/kiwi-write.ts` | bộ ghi kiwi tối thiểu, chỉ cho test |
