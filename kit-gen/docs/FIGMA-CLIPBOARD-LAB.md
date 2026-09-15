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
| `clipboardDetail` | từng kiểu của bộ nhớ tạm chở bao nhiêu, kèm tệp đính kèm — xem mục 5 |
| `htmlDiag` | **chỉ có khi thiếu mốc**: bản mô tả chính chuỗi HTML ấy — xem mục 5 |
| `errors` | mọi chỗ chưa mở được, viết ra hết |

## 5. Nếu không thấy mốc

Lượt dán thật đầu tiên (15/09/2026) về đúng như thế này:

```
clipboardTypes: ["text/html"]   htmlChars: 46203   không (figmeta), không (figma)
```

Câu «không thấy mốc» **không chẩn được gì**: nó đúng với cả bốn nguyên nhân dưới
đây, mà bốn nguyên nhân ấy đòi bốn cách chữa khác hẳn nhau. Nên khi thiếu mốc,
bàn mổ chuyển sang **đo chính chuỗi HTML đó**, và đây là cách đọc kết quả.

### 5.1. Bốn nguyên nhân có thể

| Nguyên nhân | Dấu hiệu trong bản phân tích |
| --- | --- |
| **Copy từ panel Layers** (bấm vào tên lớp ở cột trái) chứ không phải từ canvas | `tagCounts` toàn `div`/`span`, `commentCount: 0`, `hasFigmaWord` null |
| **Copy as PNG / Copy as SVG** (Cmd+Shift+C, hoặc menu chuột phải → Copy/Paste as) | bảng kê có dòng `kind: "file"` MIME `image/png`, hoặc `tagCounts` có `svg` |
| **Trình duyệt lọc mất khối chú thích** — mốc của Figma nằm trong `<!--…-->`, và một số đường dán bóc chú thích đi | `commentCount: 0` nhưng `hasFigmaWord` lại CÓ, hoặc `markerForms` chỉ có dạng `*-escaped` |
| **Dán vào chỗ khác đường** — bản Figma trên trình duyệt ghi bộ nhớ tạm bằng đường async, đường sự kiện dán thấy ít hơn | bảng `navigator.clipboard.read()` có nhiều MIME hơn `clipboardTypes` của lượt dán |

### 5.2. Ba cửa mới của bàn mổ

* **Bản mô tả HTML thô** (`htmlDiag`, chỉ có mặt khi thiếu mốc):
  `htmlHead` 2 000 ký tự đầu (đã escape) · `tagCounts` đếm thẻ theo tên ·
  `dataAttrs` tên mọi thuộc tính `data-*` · `hasFigmaWord` vị trí đầu tiên của
  chữ «figma» kèm 200 ký tự quanh đó · `imgSrcKinds` ảnh nằm ở dạng
  `data:image/…` hay `blob:` hay `http` · `commentCount` số lần mở `<!--`.
* **Bảng kê bộ nhớ tạm** (`clipboardDetail`): TỪNG kiểu chở bao nhiêu ký tự, và
  tệp đính kèm (không đi qua `getData`) được đếm riêng qua `items` kèm MIME và
  số byte. Danh sách `types` trần chỉ nói có kiểu gì, không nói kiểu nào rỗng.
* **Nút «Đọc clipboard trực tiếp»** — gọi `navigator.clipboard.read()`. Nó cần
  cử chỉ người dùng và cần quyền nên phải treo sau một cái nút. Kết quả in ra
  từng MIME kèm số byte, **để so với đường sự kiện dán**: hai đường này lọc khác
  nhau, và chênh lệch giữa chúng chính là câu trả lời. Bị từ chối quyền thì câu
  từ chối được in nguyên văn.

### 5.3. Mốc được tìm theo năm dạng, không chỉ dạng chuẩn

`markerForms` liệt kê dạng nào tìm thấy và ở vị trí nào:

| `form` | Nó là gì |
| --- | --- |
| `figmeta-chuan` / `figma-chuan` | đúng chữ `<!--(figmeta)` / `<!--(figma)` |
| `figmeta-noi-long` / `figma-noi-long` | cho phép khoảng trắng chen vào — **cố ý khớp cả dạng chuẩn**: nó là câu hỏi «có khoảng trắng không», và `sample` chở ra đúng mẩu chữ để tự thấy |
| `figmeta-escaped` / `figma-escaped` | mốc bị escape thành `&lt;!--(figmeta)` — tức HTML đã đi qua một chỗ biến `<` thành `&lt;`, mốc còn chữ nhưng không còn là chú thích |
| `figma-clipboard` | tên không ngoặc mà một số đường xuất dùng |
| `figmeta-tran` | chữ `figmeta` trần, ở bất cứ đâu |

Danh sách rỗng ⇒ trong 46 KB ấy **không có một dấu vết nào** của định dạng Figma,
kể cả dấu vết đã biến dạng. Lúc đó lỗi nằm ở bước copy, không phải ở bộ đọc.

### 5.4. Thử lại cho đúng

1. Trong Figma, **bấm vào khung TRÊN CANVAS** (vùng vẽ ở giữa), không bấm vào
   tên lớp ở panel Layers bên trái.
2. **Cmd/Ctrl + C thường** — không Cmd+Shift+C, không chuột phải → *Copy as*.
3. Chuyển sang app và dán **ngay**, đừng dán qua một ô soạn thảo nào ở giữa:
   mỗi chặng trung gian là một chỗ khối chú thích có thể bị bóc mất.
4. Nếu vẫn không có mốc: **thử bản Figma chạy trên trình duyệt Chrome**
   (`figma.com` trong tab, không phải Figma Desktop). Hai bản ghi bộ nhớ tạm
   bằng hai đường khác nhau, và đó là phép đo tách được nguyên nhân thứ tư.
5. Ở lượt nào cũng bấm thêm **«Đọc clipboard trực tiếp»** rồi gửi cả hai bảng
   về — một mình bảng nào cũng không nói được đường kia đã lọc mất cái gì.

## 6. Giới hạn đã biết — đọc trước khi kết luận

* **Trần 200 KB.** Bản đầy đủ có thể to hơn cái ô dán. Khi vượt trần, JSON bị cắt
  theo bậc (bỏ bớt trường của lược đồ → bớt node → …) và **luôn cắm cờ `daCat:
  true`**. Đừng đọc một bản bị cắt thành "payload không có trường đó".
* **Chưa đọc khối thứ ba trở đi.** Vỏ `fig-kiwi` cho phép nhiều khối; bàn mổ mới
  giải khối 0 (lược đồ) và khối 1 (dữ liệu). Khối thừa được ghi vào `errors` kèm
  8 byte đầu, không bị bỏ lơ.
* **Không có payload thật trong test.** Bộ test dựng một lượt dán tổng hợp đúng
  định dạng (`__tests__/fig-fixture.ts`). Nó canh được bộ đọc, **không** canh được
  chuyện Figma thật đặt tên trường ra sao — đó chính là việc của mục 3.
* **Phần chẩn đoán chỉ ĐO, không đoán nguyên nhân.** Bảng ở mục 5.1 là các dấu
  hiệu, không phải kết luận máy tự rút ra. Bộ test canh các phép đếm (`countTags`,
  `findMarkerForms`, …) bằng chuỗi dựng tay; nó **không** canh được chuyện Figma
  thật ghi bộ nhớ tạm ra sao.
* **Chưa mã hoá lại.** Bước này một chiều: đọc, không ghi.
* **Không thêm thư viện nào.** Giải nén dùng `DecompressionStream` có sẵn; đọc
  kiwi dùng bộ đọc viết tay (`kit-core/lib/kiwi-decode.ts`). Gói `kiwi-schema`
  bị loại vì `compileSchema` của nó chạy bằng `new Function(...)` — tức `eval`,
  chết dưới CSP và bị cấm ở nhiệm vụ này.

## 7. File liên quan

| Đường dẫn | Việc |
| --- | --- |
| `webapp/src/features/kit-core/lib/kiwi-decode.ts` | đọc lược đồ + bộ thông dịch kiwi (thuần) |
| `webapp/src/features/kit-core/lib/fig-kiwi.ts` | tách base64, bóc vỏ, giải nén, dựng bản phân tích |
| `webapp/src/features/kit-core/components/FigmaPasteLab.tsx` | bảng dev + bắt sự kiện dán |
| `webapp/src/features/kit-core/lib/__tests__/fig-fixture.ts` | dựng lượt dán tổng hợp cho test |
| `webapp/src/features/kit-core/lib/__tests__/kiwi-write.ts` | bộ ghi kiwi tối thiểu, chỉ cho test |
