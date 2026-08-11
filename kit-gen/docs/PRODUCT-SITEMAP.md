# Sitemap sản phẩm KitGen

> Trạng thái: kiến trúc thông tin đã chốt; dùng làm nguồn đối chiếu khi hoàn thiện giao diện.

## 1. Mục tiêu của tài liệu

Người đọc là người thiết kế hoặc triển khai KitGen. Sau khi đọc, họ phải dựng đúng luồng màn hình mà không trộn lẫn **dự án**, **wizard**, **bộ khung**, **ảnh đã tạo** và **Canvas**.

KitGen là ứng dụng đơn giản để:

1. Tạo một dự án bằng wizard từng bước.
2. Chọn và quản lý các bộ khung UI, bộ khung mascot.
3. Tạo ảnh từ các bộ khung đã chọn.
4. Quay lại dự án để sửa tham chiếu, chọn lại thành phần hoặc tạo lại ảnh.

“Bộ kit” không phải đối tượng cấp cao nhất. Đối tượng cấp cao nhất luôn là **Dự án**.

## 2. Nguyên tắc sản phẩm

- Dự án mới mở wizard. Dự án đã tạo mở màn quản lý dự án.
- Bộ khung là cấu trúc đầu vào để tạo ảnh, không phải một dự án khác.
- UI và mascot là hai thư viện bộ khung độc lập.
- Background, popup và UI nhỏ không trộn chung một sheet.
- Ảnh tham chiếu, lựa chọn thành phần và giới hạn số phần tử trên sheet đều sửa được.
- Tạo lại ảnh luôn là thao tác chủ động; sửa dữ liệu không tự tiêu quota.
- Canvas hiện chưa phát hành. Nút được vô hiệu hoá và ghi rõ **Đang phát triển**.
- Không hiển thị các thuật ngữ kỹ thuật như `kg-*`, contract, job hoặc route nội bộ.
- Copy ngắn, dùng “Dự án”, “Bộ khung”, “Sheet”, “Ảnh đã tạo”. Không dùng dashboard số liệu dài dòng.

## 3. Sitemap tổng

```text
KitGen
├── Dự án
│   ├── Danh sách dự án
│   ├── Tạo dự án mới
│   │   └── Wizard
│   └── Quản lý một dự án
│       ├── Yêu cầu
│       ├── Phong cách & tham chiếu
│       ├── Bộ khung UI
│       │   ├── Background
│       │   ├── Popup / modal
│       │   └── UI nhỏ & đạo cụ game
│       ├── Mascot
│       ├── Ảnh đã tạo
│       ├── Canvas — Đang phát triển
│       └── Cài đặt dự án
├── Thư viện bộ khung UI
│   ├── Background
│   ├── Popup / modal
│   └── UI nhỏ & đạo cụ game
├── Thư viện bộ khung mascot
│   ├── Mascot
│   └── Pose
├── Thùng rác
└── Cài đặt
```

## 4. Khung điều hướng chung

### Sidebar trái

Sidebar là điều hướng chung duy nhất ở màn ngoài dự án:

1. Logo KitGen.
2. Search dự án.
3. Dự án.
4. Bộ khung UI.
5. Bộ khung mascot.
6. Ảnh tham chiếu.
7. Thùng rác.
8. Cài đặt ở cuối sidebar.

Search chỉ tìm theo tên dự án. Nó không phải command palette và không tìm cài đặt, thao tác hay bộ khung.

Thùng rác là một màn riêng trong khung Home, không phải một tab của Cài đặt.

### Khi đang ở trong dự án

- Header trên cùng chỉ giữ nút quay lại **Dự án** và trạng thái hệ thống.
- Sidebar dự án quản lý các phần của dự án.
- Không lặp logo, search dự án hoặc header Home ở phía trên nội dung.

## 5. Màn Dự án

### Nội dung

- Tiêu đề nhỏ: **Dự án**.
- Không có đoạn giới thiệu phụ.
- Ô đầu tiên là **Tạo dự án**.
- Các ô còn lại là dự án đã có.

### Grid

- Desktop rộng: 5 cột.
- Desktop vừa: 4 cột.
- Tablet: 2–3 cột.
- Mobile: 1 cột.
- Thẻ gọn, ưu tiên ảnh xem trước và tên dự án.
- Không nhồi số sheet, số component, dung lượng hoặc nhiều trạng thái lên thẻ.

### Hành vi

- Bấm **Tạo dự án** → mở wizard.
- Bấm dự án đã có → mở màn quản lý dự án.
- Menu phụ trên thẻ: đổi tên, nhân bản, xoá.
- Xoá đưa dự án vào Thùng rác; không xoá vĩnh viễn ngay.

## 6. Wizard tạo dự án

Wizard chỉ dành cho lần tạo ban đầu. Khi hoàn tất, người dùng được đưa vào màn quản lý dự án.

### Bước 1 — Yêu cầu

- Tên dự án.
- Mục tiêu hoặc brief.
- Nội dung chính cần tạo.

### Bước 2 — Phong cách & tham chiếu

- Mô tả phong cách.
- Màu chính.
- Ảnh tham chiếu phong cách.
- Ảnh thương hiệu nếu có.

### Bước 3 — Bộ khung UI

Chọn những nhóm cần dùng:

- Background.
- Popup / modal.
- UI nhỏ & đạo cụ game.

Người dùng chọn từng thành phần cụ thể, không phải nhận toàn bộ thư viện.

### Bước 4 — Mascot

- Bật hoặc tắt mascot.
- Tên và mô tả mascot.
- Ảnh tham chiếu.
- Chọn các pose cần tạo.

### Bước 5 — Kiểm tra

- Tóm tắt yêu cầu, phong cách, nhóm UI, mascot và số sheet dự kiến.
- Hiện rõ số lượt ảnh sẽ tạo trước khi chạy.
- Nút chính: **Tạo ảnh**.

### Bước 6 — Kết quả

- Theo dõi tiến trình ngắn gọn.
- Xem các ảnh vừa tạo.
- Nút chính: **Vào dự án**.

## 7. Màn quản lý dự án

Màn này thay cho dashboard “Việc tiếp theo / tiến độ / thống kê nhanh” hiện tại. Nó là nơi quản trị nội dung của dự án, không phải trang báo cáo.

### Sidebar dự án

1. **Yêu cầu** — brief của dự án.
2. **Phong cách** — prompt và ảnh tham chiếu.
3. **Bộ khung UI** — background, popup và UI nhỏ.
4. **Mascot** — mascot và pose.
5. **Ảnh đã tạo** — kết quả theo lần tạo.
6. **Canvas · Đang phát triển** — vô hiệu hoá.
7. **Cài đặt dự án**.

### Bộ khung UI trong dự án

Mỗi nhóm hiển thị dạng card hoặc lưới đơn giản. Người dùng có thể:

- Thêm một bộ khung từ thư viện chung.
- Bỏ một bộ khung khỏi dự án.
- Đổi tên.
- Sửa mô tả.
- Đổi ảnh tham chiếu.
- Chọn lại thành phần.
- Sắp xếp lại thứ tự.
- Tạo lại riêng một sheet hoặc một nhóm.

Sửa bộ khung trong dự án chỉ sửa bản của dự án đó. Nó không tự ghi đè thư viện chung.

### Mascot trong dự án

Người dùng có thể:

- Đổi ảnh tham chiếu mascot.
- Thêm hoặc xoá pose.
- Sửa mô tả từng pose.
- Sắp xếp pose vào sheet.
- Tạo lại riêng một pose hoặc cả sheet mascot.

### Ảnh đã tạo

- Nhóm theo lần tạo.
- Cho biết ảnh nào thuộc background, popup, UI nhỏ hoặc mascot.
- Có thao tác tạo lại, tải xuống và xem lỗi.
- Không dùng màn thống kê lớn nếu không giúp hoàn thành một thao tác.

## 8. Mô hình bộ khung UI

### 8.1 Background

Một sheet Background chứa các nền toàn màn hình.

Mặc định một sheet có tối đa **2** phần tử:

1. Background Home.
2. Background Thành công.

Nếu dự án có nhiều nền hơn giới hạn, hệ thống tạo thêm sheet Background. Background không nằm chung sheet với popup hoặc UI nhỏ.

### 8.2 Popup / modal

Đây là các khung lớn như popup kết quả, popup thông báo hoặc modal nhiệm vụ.

- Mặc định tối đa **4** popup trên một sheet.
- Mỗi popup là một slot lớn.
- Không xếp nút nhỏ, icon hoặc đạo cụ game vào sheet popup.

### 8.3 UI nhỏ & đạo cụ game

Nhóm này chứa các thành phần nhỏ, độc lập và có thể tách thành file riêng:

- Nút, tab, progress, badge, icon.
- Mảnh ghép, voucher, token hoặc vật phẩm.
- Hộp quà và các trạng thái/thành phần của hộp quà.
- Hiệu ứng nhỏ dùng trong gameplay.

Hộp quà thuộc **UI nhỏ & đạo cụ game**, không thuộc Popup. Nếu hộp quà có nhiều phần cần điều khiển riêng, mỗi phần là một slot độc lập, ví dụ thân hộp, nắp, trạng thái đóng, trạng thái mở và hiệu ứng sáng.

Nhóm UI nhỏ được phép có nhiều sheet. Khi đầy, hệ thống tạo sheet kế tiếp thay vì ép nhỏ hoặc trộn sang nhóm khác.

## 9. Mô hình mascot

Mascot được quản lý riêng với UI.

- Một mascot có một ảnh tham chiếu chính.
- Mỗi pose là một phần tử độc lập để có thể dùng riêng trong game.
- Ví dụ pose: đứng yên, vui, buồn, giới thiệu, ăn mừng.
- Các pose được xếp vào một hoặc nhiều sheet mascot.
- Khi số pose vượt giới hạn của sheet, hệ thống tạo sheet tiếp theo.

Cách tổ chức pose tương tự UI nhỏ, nhưng dữ liệu và màn quản lý không trộn với UI nhỏ.

## 10. Cài đặt số phần tử trên sheet

Mỗi loại có cài đặt **Tối đa trên một sheet**:

| Loại | Mặc định đề xuất | Cách xếp |
|---|---:|---|
| Background | 2 | Slot lớn, thường là Home + Thành công |
| Popup / modal | 4 | Bốn khung lớn |
| UI nhỏ & đạo cụ game | 16 | Lưới ô nhỏ; tự thêm sheet khi đầy |
| Mascot pose | 4 | Các pose độc lập; tự thêm sheet khi đầy |

Giá trị mặc định có thể chỉnh ở thư viện chung. Dự án được phép ghi đè giá trị cho riêng mình.

Khi thay đổi giới hạn:

- Chỉ sắp xếp lại bộ khung.
- Không tự chạy tạo ảnh.
- Hiện số sheet mới dự kiến.
- Nếu ảnh cũ không còn khớp, đánh dấu **Cần tạo lại**.

## 11. Thư viện chung

### Bộ khung UI

Quản lý ba nhóm Background, Popup / modal và UI nhỏ & đạo cụ game. Thao tác chính:

- Thêm.
- Sửa.
- Nhân bản.
- Xoá.
- Sắp xếp.
- Đặt số phần tử tối đa trên sheet.

### Bộ khung mascot

Quản lý mẫu mascot và danh sách pose. Thao tác chính giống thư viện UI nhưng có thêm ảnh tham chiếu mascot.

Thư viện chung là nguồn để chọn khi tạo dự án. Một dự án nhận bản sao cấu hình; chỉnh dự án không âm thầm thay đổi thư viện.

### Ảnh tham chiếu

Quản lý thành hai thư viện riêng:

- **Phong cách** — ảnh mẫu về màu, chất liệu và cách render.
- **Mascot** — ảnh mẫu nhận diện nhân vật.

Người dùng có thể tải ảnh lên, đổi tên và xoá. Trong wizard hoặc khi thêm mascot, trường chọn reference là dropdown có thumbnail bên trái. Reference phong cách không được dùng để quyết định bố cục; reference mascot không được dùng thay cho reference phong cách.

## 12. Pipeline spritesheet và safe zone

Prototype kỹ thuật một trang tại `kit-gen/studio.html` là nguồn tham chiếu đúng cho cơ chế gen. Webapp mới có thể thay giao diện quản trị, nhưng không được thay pipeline này bằng một màn dashboard hoặc một luồng gen từng ảnh rời.

### Ba đầu vào có vai trò tách biệt

1. **Bộ khung spritesheet** khoá số ô, vị trí, kích thước và safe zone của từng thành phần.
2. **Ảnh tham chiếu phong cách** chỉ khoá màu sắc, chất liệu và cách render; không quyết định hình học.
3. **Ảnh tham chiếu mascot** chỉ khoá nhận diện và hình dáng mascot; không thay thế bộ khung hoặc phong cách.

AI nhận bộ khung trước, sau đó mới nhận các ảnh tham chiếu. Kết quả là một spritesheet hoàn chỉnh, rồi pipeline mới cắt từng ô thành image asset.

### Contract safe zone

Ví dụ button `120×52`:

- Contract lưu một safe zone đúng tỷ lệ `120:52` trong ô spritesheet.
- Thân chính của button phải bám vùng này.
- Cánh, hoa, ribbon, glow và decoration được tràn ra ngoài safe zone nhưng không được sang ô khác.
- Tọa độ safe zone lấy trực tiếp từ contract; không suy ngược từ ảnh AI để làm nguồn sự thật.
- Hậu xử lý chỉ được scale đồng đều. Cấm scale riêng trục X/Y vì sẽ làm bẹp hình.
- Nếu phần lõi lệch tỷ lệ hoặc lệch vị trí quá ngưỡng, validator đánh dấu ô/sheet **Cần tạo lại**. Không được bóp ảnh để ép đạt.

Prompt và reference giúp AI bám hình học nhưng không đảm bảo pixel tuyệt đối. Contract + validator mới là lớp đảm bảo. Luồng production ưu tiên gen nguyên spritesheet theo prototype cũ; gen một element rời chỉ dùng để thử style, không phải đầu ra chính.

### Cách neo hình học khi đưa sheet cho AI

- Ảnh bộ khung gửi cho AI giữ **nền chroma xanh**, lưới ô và các vùng safe zone màu xám. Đây là ảnh edit target, không phải ảnh gợi ý bố cục.
- Không yêu cầu AI xoá hoặc thay nền/lưới ngay trong lượt tạo. Lưới xám trên nền xanh phải còn nguyên để làm mốc đăng ký vị trí giữa toàn bộ sheet.
- Prompt làm theo hai pha: trước tiên khoá canvas, grid và biên vùng xám; sau đó mới fill phần lõi theo đúng loại thành phần và thêm decoration bên ngoài safe zone.
- Khi thử độ bám hình học, có thể yêu cầu giữ nguyên hoàn toàn phần xám và chỉ vẽ decoration bên ngoài. Khi đã ổn định, prompt production mới cho phép fill lại phần xám bằng bề mặt nội dung phù hợp nhưng không được đổi biên.
- Background, lưới và chroma chỉ được loại bỏ bằng hậu xử lý deterministic sau khi AI trả kết quả. Không để AI vừa tái dựng sheet vừa tự xoá mốc hình học trong cùng một lượt.
- Cách prompt theo từng pha giúp model bám edit target tốt hơn, nhưng kết quả vẫn phải qua validator; không xem việc model có bước “thinking” nội bộ là bảo đảm tọa độ.

Các thử nghiệm đối chiếu hiện nằm tại `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/`. Bản `prompt-preserve-gray-underlay-v6.txt` và `sheet-preserve-gray-underlay-v6.png` xác nhận rằng yêu cầu model giữ nguyên grid và vùng xám như một underlay được bảo vệ giúp geometry bám skeleton tốt hơn. Bản production sẽ giữ **grid xám trên nền chroma xanh**, rồi yêu cầu model fill từng vùng xám bằng bề mặt đúng với content/type của ô mà không đổi biên; decoration chỉ được mở rộng ra phía ngoài. Đây là cách nắn theo hành vi edit/tool-use của model, không phải cam kết pixel-perfect, nên validator deterministic vẫn là bước bắt buộc.

### Cấu trúc khi copy sang Figma

- Artwork là **image node** raster/image-fill thật, không phải một frame giả làm ảnh.
- Khi element cần hitbox/layout `120×52`, tạo một frame riêng đúng `120×52` và đặt image node theo offset của safe zone.
- Frame đặt `Clip content = off` để decoration vẫn hiện bên ngoài.
- Không kéo méo image node. Cùng một hệ số scale áp dụng cho cả chiều rộng và chiều cao.

## 13. Canvas

Canvas/prototype cũ được giữ lại làm tài liệu tham chiếu kỹ thuật, nhưng chưa xuất hiện như một chức năng đang dùng.

Trong sidebar dự án:

- Nhãn: **Canvas**.
- Trạng thái: **Đang phát triển**.
- Nút disabled, không điều hướng.
- Không cho chọn “Canvas” khi tạo dự án.

Khi Canvas sẵn sàng, nó sẽ mở bộ khung đang chọn để chỉnh trực quan. Việc đó nằm ngoài phạm vi phiên bản hiện tại.

## 14. Search, Settings và Thùng rác

### Search

- Giữ ở sidebar trái.
- Chỉ tìm dự án.
- Kết quả lọc ngay grid Dự án.
- Ở trong dự án không có ô search toàn cục trên header.

### Settings

- Giữ mục Cài đặt ở cuối sidebar.
- Chỉ chứa cấu hình ứng dụng: công cụ local, môi trường tạo ảnh, giao diện và dữ liệu.
- Không chứa Thùng rác.

### Thùng rác

- Là một màn riêng.
- Hiện dự án đã xoá.
- Có Phục hồi và Xoá vĩnh viễn.
- Bấm Thùng rác không được mở Cài đặt.

## 15. Wording chuẩn

| Không dùng | Dùng |
|---|---|
| Bộ kit của bạn | Dự án |
| Tạo bộ kit mới | Tạo dự án |
| Việc tiếp theo | Bỏ; đưa hành động vào đúng mục quản lý |
| Tiến độ theo phong cách × sheet | Bỏ khỏi màn chính |
| Bản thiết kế | Bộ khung hoặc Thiết kế, tuỳ ngữ cảnh |
| Element | Thành phần |
| Character pose | Pose mascot |
| Server Live / Codex check | Sẵn sàng / Cần kiểm tra |

Tên kỹ thuật `skeleton` có thể giữ trong code. Trên UI dùng **Bộ khung**.

## 16. Luồng chuẩn

### Dự án mới

```text
Dự án → Tạo dự án → Wizard → Tạo ảnh → Kết quả → Vào dự án
```

### Dự án đã có

```text
Dự án → Chọn dự án → Quản lý dự án → Chọn mục cần sửa
```

### Tạo lại sau khi sửa

```text
Quản lý dự án → Sửa ref/chọn lại thành phần/đổi giới hạn sheet
→ Xem số sheet bị ảnh hưởng → Tạo lại → Ảnh đã tạo
```

## 17. Tiêu chí nghiệm thu

- Home chỉ có một sidebar, tiêu đề nhỏ “Dự án” và grid 5 cột ở desktop rộng.
- Tạo dự án luôn mở wizard.
- Mở dự án đã có luôn mở màn quản lý có sidebar dự án.
- UI, mascot và ảnh đã tạo là ba vùng rõ ràng.
- Background mặc định 2 phần tử/sheet; popup mặc định 4 phần tử/sheet.
- UI nhỏ có thể sinh nhiều sheet; hộp quà nằm trong nhóm này.
- Mascot pose có giới hạn phần tử/sheet riêng.
- Người dùng sửa ref, chọn lại thành phần và tạo lại được.
- Bộ khung quyết định geometry; reference phong cách và mascot chỉ quyết định phần đúng vai trò của chúng.
- Asset sai safe zone bị yêu cầu tạo lại; không có bước scale méo để ép đạt.
- Copy Figma tạo image node thật; frame safe zone chỉ là wrapper/hitbox và tắt clip.
- Canvas disabled và ghi “Đang phát triển”.
- Search chỉ tìm dự án.
- Thùng rác không mở Cài đặt.
- Không có chữ “bộ kit”, `kg-*`, contract hoặc job trong UI chính.
