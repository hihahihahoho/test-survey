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
- Background, popup, UI nhỏ và đạo cụ không trộn chung một sheet.
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
│       │   ├── UI nhỏ
│       │   └── Đạo cụ game
│       ├── Mascot
│       ├── Ảnh đã tạo
│       ├── Canvas — Đang phát triển
│       └── Cài đặt dự án
├── Thư viện bộ khung UI
│   ├── Background
│   ├── Popup / modal
│   ├── UI nhỏ
│   └── Đạo cụ game
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
- UI nhỏ.
- Đạo cụ game.

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

### 8.3 UI nhỏ

Nhóm này chứa các thành phần giao diện nhỏ, độc lập và có thể tách thành file riêng:

- Nút, tab, progress, badge, icon.
- Ô nhập liệu, checkbox, toggle và trạng thái tương tác.

UI nhỏ được phép có nhiều sheet. Khi đầy, hệ thống tạo sheet kế tiếp thay vì ép nhỏ hoặc trộn sang nhóm khác.

### 8.4 Đạo cụ game

Đạo cụ là các object hoặc phần thưởng dùng độc lập trong game:

- Mảnh ghép, voucher, token hoặc vật phẩm.
- Hộp quà và các trạng thái/thành phần của hộp quà.
- Hiệu ứng nhỏ dùng trong gameplay.

Hộp quà thuộc **Đạo cụ**, không thuộc Popup hoặc UI nhỏ. Nếu hộp quà có nhiều phần cần điều khiển riêng, mỗi phần là một slot độc lập, ví dụ thân hộp, nắp, trạng thái đóng, trạng thái mở và hiệu ứng sáng.

Đạo cụ có giới hạn sheet riêng và không trộn vào sheet UI nhỏ.

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
| UI nhỏ | 16 | Lưới ô nhỏ; tự thêm sheet khi đầy |
| Đạo cụ game | 16 | Object độc lập; tự thêm sheet khi đầy |
| Mascot pose | 4 | Các pose độc lập; tự thêm sheet khi đầy |

Giá trị mặc định có thể chỉnh ở thư viện chung. Dự án được phép ghi đè giá trị cho riêng mình.

Khi thay đổi giới hạn:

- Chỉ sắp xếp lại bộ khung.
- Không tự chạy tạo ảnh.
- Hiện số sheet mới dự kiến.
- Nếu ảnh cũ không còn khớp, đánh dấu **Cần tạo lại**.

## 11. Thư viện chung

### Bộ khung UI

Quản lý bốn nhóm Background, Popup / modal, UI nhỏ và Đạo cụ. Thao tác chính:

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

> Handoff kỹ thuật mới nhất của spike safe-zone: [Spritesheet, safe zone và Figma](./SPRITESHEET-SAFE-ZONE-HANDOFF.md). Dùng tài liệu này cho trạng thái v15, lệnh chạy và các giới hạn đang mở.

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

Các thử nghiệm đối chiếu hiện nằm tại `kit-gen/experiments/sprite-sheet-fairy-gray-safe-v6/`. Bản gần nhất là `prompt-preserve-gray-underlay-v7.txt` và `sheet-preserve-gray-underlay-v7.png`; v6 được giữ làm mốc đối chiếu. Kết quả xác nhận rằng yêu cầu model giữ nguyên grid và vùng xám như một underlay được bảo vệ giúp geometry bám skeleton tốt hơn. Bản production sẽ giữ **grid xám trên nền chroma xanh**, rồi yêu cầu model fill từng vùng xám bằng bề mặt đúng với content/type của ô mà không đổi biên; decoration chỉ được mở rộng ra phía ngoài. Đây là cách nắn theo hành vi edit/tool-use của model, không phải cam kết pixel-perfect, nên validator deterministic vẫn là bước bắt buộc.

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

## 17. Trạng thái triển khai P0

- Mỗi dự án có một bản nháp wizard riêng, tự lưu khi nhập và được khôi phục khi mở lại dự án.
- Trong dự án, sidebar **Quản lý** chỉ dẫn tới Tổng quan, Thiết kế ảnh, Lượt tạo và Thành phẩm; chỉnh Yêu cầu/Phong cách/Mascot/Bộ khung UI nằm trong dialog Cài đặt trên topbar.

- Mục **Ảnh đã tạo** đọc ảnh raw snapshot bất biến theo từng run, không dùng ảnh mới nhất để giả lịch sử.
- Có thể tạo lại một sheet, một nhóm hoặc toàn bộ lần tạo; request chỉ gửi đúng danh sách job đã chọn.
- Sau khi tạo ảnh, validator deterministic `validate_output_geometry.py` đo vị trí và kích thước lõi theo safe zone. Kết quả lưu cùng artifact của run và UI đánh dấu ô lệch là **Cần tạo lại**.
- Validator không scale hoặc sửa artwork; nó chỉ báo đạt/chưa đạt.

## 18. Tiêu chí nghiệm thu

- Home chỉ có một sidebar, tiêu đề nhỏ “Dự án” và grid 5 cột ở desktop rộng.
- Tạo dự án luôn mở wizard.
- Mở dự án đã có luôn mở màn quản lý có sidebar dự án.
- UI, mascot và ảnh đã tạo là ba vùng rõ ràng.
- Background mặc định 2 phần tử/sheet; popup mặc định 4 phần tử/sheet.
- UI nhỏ và đạo cụ sinh sheet riêng; hộp quà nằm trong nhóm Đạo cụ.
- Mascot pose có giới hạn phần tử/sheet riêng.
- Người dùng sửa ref, chọn lại thành phần và tạo lại được.
- Bộ khung quyết định geometry; reference phong cách và mascot chỉ quyết định phần đúng vai trò của chúng.
- Asset sai safe zone bị yêu cầu tạo lại; không có bước scale méo để ép đạt.
- Copy Figma tạo image node thật; frame safe zone chỉ là wrapper/hitbox và tắt clip.
- Canvas disabled và ghi “Đang phát triển”.
- Search chỉ tìm dự án.
- Thùng rác không mở Cài đặt.
- Không có chữ “bộ kit”, `kg-*`, contract hoặc job trong UI chính.

## Cập nhật UX nhận dạng thương hiệu (2026-08-12)

- `/brands` là khu vực **Quản lý nhận dạng thương hiệu** bên ngoài dự án. Mỗi hồ sơ lưu tên, ghi chú, bảng màu và danh sách logo/ảnh phong cách/mascot từ thư viện dùng chung; dữ liệu nằm trong `.kitgen/library/library.json`, không chỉ trong trình duyệt.
- Wizard và dialog cài đặt dự án dùng cùng workflow state. Ở bước **Phong cách**, người dùng chọn `Tự tải lên` hoặc một thương hiệu có sẵn; lựa chọn thương hiệu điền màu và sao chép các ảnh đã chọn vào `projects/<id>/refs/`. Người dùng vẫn có thể tải thêm ảnh riêng sau đó.
- **Ảnh thương hiệu** có chú thích rõ: logo, bảng màu hoặc hình ảnh nhận diện. Ảnh đã upload hiển thị preview và có nút xoá; endpoint đọc file ref xác thực project, segment tên file và safe-join trước khi trả nội dung.
- **Mascot pose** chỉ hiện khi checkbox `Có nhân vật đại diện` được bật. Danh sách có `Chọn tất cả`, `Bỏ chọn`, và phần `Sẽ vẽ` nằm phía trên để không cần cuộn xuống mới biết các dáng đã chọn.
- Bộ khung UI trong wizard, thư viện và contract tách `UI nhỏ` với `Đạo cụ`; mỗi nhóm có giới hạn và sheet riêng.
- Canvas không phải màn con trong dự án; route canvas cũ điều hướng về tổng quan. Cài đặt dự án mở bằng dialog từ topbar và deep-link `?section=settings`.
- Xoá vĩnh viễn yêu cầu nhập đúng `xac-nhan`; agent đồng thời đối chiếu chính xác `projectId` trong request với mục đang xoá để tránh xoá nhầm dự án khác.

### Chỉnh cấu trúc thư viện và dialog (2026-08-12)

- **Mascot** là thư viện nhân vật, không phải thư viện pose. Mỗi mascot có tên, ảnh reference riêng, nhãn để tìm/lọc (ví dụ `VCB`, `ngân hàng`) và danh sách pose skeleton lấy trực tiếp từ prototype `silhouettes.js`.
- **Style reference** chỉ quản lý moodboard, key visual, chất liệu và hình ảnh định hướng phong cách; không còn tab Mascot trong khu vực này.
- Search ở sidebar Home chỉ tìm dự án. Các màn Bộ khung UI, Mascot và Style reference có search/filter riêng theo dữ liệu của màn.
- Các nhóm Bộ khung UI dùng shared Tabs component. Preview upload là grid ảnh thuần, không hiện filename hoặc dung lượng; tên file chỉ còn trong accessible label/title phục vụ xoá và debug.
- Dialog Cài đặt có header cố định, navigation trái cố định và chỉ cuộn vùng nội dung bên phải.

## Tái cấu trúc màn quản lý dự án (2026-08-13)

Phần này **thay thế** mô tả “Bước 6 — Kết quả” của §6 và danh sách sidebar dự án của §7.

> ⚠️ Bốn điểm của mục này đã bị mục **2026-08-14** (ngay bên dưới) đè lên: hàng chip nhóm của trang “Ảnh đã tạo”, hình dạng trang Skeleton UI / Mascot, chỗ đặt ô `Rộng %`/`Cao %`, và tên mục sidebar thứ tư. Phần còn lại (tên gọi, wizard 5 bước, luật buffer, nguồn của prompt) vẫn nguyên giá trị.

### Tên gọi đã chốt

- Khái niệm “cấu trúc ô/sheet của một dự án” gọi là **Skeleton UI** ở mọi nơi thuộc phạm vi dự án: mục sidebar dự án, bước ③ của wizard, và tiêu đề trang.
- **Bộ khung UI** vẫn là tên của **thư viện dùng chung** (`/library/ui`) — đó là một đối tượng khác (kho dùng lại giữa các dự án), nên hai tên không đá nhau.
- Tên kỹ thuật `skeleton` trong code và tên tấm `skeleton/<sheet>.png` không đổi.

### Wizard còn 5 bước

`Yêu cầu → Phong cách → Skeleton UI → Mascot → Kiểm tra`

Bấm **Tạo ảnh** ở bước Kiểm tra: lưu contract → đóng dấu bản nháp `completed` → điều hướng thẳng vào `/p/<id>?section=images`. Không còn bước “Kết quả” và không còn nút “Xong — về dự án”.

### Sidebar dự án — bốn đích

1. **Ảnh đã tạo** (`?section=images`) — ảnh thật + skeleton của lần tạo. Sáu nhóm cũ (Tất cả · Mascot · Nền · Popup · UI nhỏ · Đạo cụ) nay là hàng chip trong trang, đi qua `?group=`.
2. **Skeleton UI** (`?section=skeleton`) — bản chỉnh sửa đầy đủ: chọn thành phần, chỉnh `Rộng %`/`Cao %` từng ô, mở panel chi tiết.
3. **Mascot** (`?section=mascot`) — nhân vật, bộ dáng, panel chi tiết từng dáng.
4. **Cài đặt** — mở dialog, không phải một trang.

Hai cửa ra `Tải .zip` và `Copy sang Figma` chuyển từ bước ⑥ cũ sang header của trang “Ảnh đã tạo”.

### Dialog Cài đặt còn 3 tab

`Yêu cầu · Phong cách · Dự án`. Hai tab cũ (Mascot, Bộ khung UI) đã thành hai trang sidebar.

Dialog mở bằng tham số **riêng** `?settings=<tab>`; `?section=`/`?group=` không bị đụng tới, nên bấm nút Cài đặt trên topbar không còn kéo màn nền về “tất cả thành phẩm”. Link cũ `?section=settings`, `?section=requirements`, `?section=style` vẫn mở đúng tab.

Hàng nút của dialog là `DialogFooter` thật (anh em của vùng cuộn), không còn thanh `sticky` nằm trong vùng cuộn đè lên nội dung.

### Sửa là buffer — lưu mới là lưu

- Màn dự án chạy `useContractSync(..., { autosave: false })`. Không có đường nào ghi contract xuống đĩa ngoài nút Lưu.
- Dialog Cài đặt: **[Huỷ] [Lưu cài đặt] [Lưu và tạo lại ảnh]**. Trang Skeleton UI / Mascot: **[Huỷ] [Lưu] [Lưu + Gen lại]** (hàng nút hiện cả trên và dưới nội dung).
- Việc đánh dấu “ô lệch bộ khung · Cần tạo lại” chỉ có thể xảy ra **sau** một cú bấm Lưu.
- Rời mục sidebar khi còn thay đổi chưa lưu ⇒ hỏi lại, có cả *Bỏ thay đổi* lẫn *Lưu rồi đi*. Đóng tab/F5 ⇒ cảnh báo của trình duyệt.
- Ngoại lệ có chủ ý: **tên dự án** vẫn lưu ngay bằng nút riêng (nó là dữ liệu của agent, không nằm trong contract).

### Kích thước ô và prompt của từng item

- Kích thước ô sửa được ở **hai** chỗ, cùng một nguồn: ô `Rộng %`/`Cao %` ngay trên thẻ trong trang Skeleton UI, và trong panel chi tiết của item.
- Nguồn sự thật là `skel.w/h` của contract. Dự án lưu một **lớp đè** `KitElement.skel`; `resolveKitset()` trộn nó lên `skel` của thư viện chung khi dựng contract, nên thư viện chung không bị sửa.
- Panel chi tiết hiện **prompt sẽ gửi đi** của đúng ô đó — chỉ đọc, có nút sao chép. Nội dung rút từ contract theo đúng những mảnh `gen.sh` chèn nguyên văn (dòng `N) <spec>`, hướng canvas, `cell_hint`, `Art style:`); không dựng lại một bản prompt song song.
- Ô dáng mascot cố định `30% × 85%` để cả tấm là một turnaround đều nhau; panel nói ra điều đó thay vì đưa một ô nhập giả.

## Sửa màn dự án theo góp ý chủ sản phẩm (2026-08-14)

Mục này **đè lên** bốn điểm của mục 2026-08-13 ở trên. Nguyên nhân: bản 13/08 giữ đúng cấu trúc thông tin nhưng đưa quá nhiều control ra mặt tiền, và chủ sản phẩm bác thẳng — *“SETTING SAO NÓ THÔ THẾ NÀY, KIỂU ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA NGOÀI”*. Những gì không nhắc tới ở đây thì giữ nguyên bản 13/08.

### ① Mọi control chỉnh nằm trong popup — thẻ thành phần sạch

**Đổi so với 13/08**: bản cũ đặt hai ô `Rộng %`/`Cao %` cộng nút Chi tiết **ngay dưới từng thẻ** trong lưới thành phần. Với 42 món đó là 84 ô số + 42 nút, và người dùng đọc trang này như một bảng cấu hình chứ không như một bộ chọn.

Nay:

- Thẻ chỉ còn **ba** thứ: tên, hình silhouette, dấu tick chọn. Không một `input`/`select`/`textarea` nào nằm trần trong lưới (khoá bằng phép quét cả lưới trong test, không đếm tay).
- Nút **Chi tiết** là một nút icon **đè lên góc phải của thẻ**; nó mở `ItemDetailDialog` — cửa DUY NHẤT để chỉnh.
- Popup gom hết: tick *Vẽ thành phần này* · `Rộng %`/`Cao %` · mô tả gửi cho máy vẽ · **prompt sẽ gửi đi** (chỉ đọc, có nút sao chép) · hàng nút Lưu của trang.
- Vì thế câu “kích thước ô sửa được ở **hai** chỗ” của 13/08 **không còn đúng**: nay chỉ còn **một** chỗ (popup). Nguồn sự thật vẫn là lớp đè `KitElement.skel` trộn vào `skel` thư viện chung lúc `resolveKitset()` — phần đó không đổi.
- `SkelSizeFields` bỏ hẳn hai prop `compact`/`itemLabel` (chúng chỉ tồn tại để nhét ô số vào lưới), nên không có đường dựng lại bức tường control mà không phải sửa chính component đó.

Lưới dáng mascot theo đúng luật này: thẻ sạch + nút Chi tiết trên thẻ + popup của dáng.

### ② Skeleton UI và Mascot đều có ba tab

`Ảnh thật · Ảnh gốc · Settings` — chủ sản phẩm: *“ITEM Ở SIDEBAR THỨ 2: SKELETON UI, TRONG ĐÓ SHOW ẢNH SKELETON ĐÃ GEN RA, CÓ 3 TAB: ẢNH THẬT, ẢNH GỐC, SETTINGS”*.

| Tab | Trang **Skeleton UI** | Trang **Mascot** |
| --- | --- | --- |
| **Ảnh thật** (mặc định) | Bộ khung đã dựng của từng tấm (`SkeletonSheetGrid`), **trừ** tấm mascot | Bộ khung của **tấm dáng** mascot |
| **Ảnh gốc** | Sheet thô `raw/` của lượt tạo, trừ nhóm mascot | Sheet thô của nhóm mascot |
| **Settings** | Chọn/chỉnh thành phần (`KitsetStep variant="manage"`) | Nhân vật + bộ dáng (`MascotStep variant="manage"`) |

- Trang mở ở tab **Ảnh thật**: câu hỏi đầu tiên khi vào mục này là “bộ khung hiện ra sao”, không phải “sửa gì”.
- Hàng nút **[Huỷ] [Lưu] [Lưu + Gen lại]** chỉ có ở tab *Settings* (vẫn ở cả trên và dưới nội dung). Hai tab xem không có hàng nút — ở đó không có gì để lưu.
- Tab *Ảnh gốc* dùng chung component `RawSheetsPanel`, tách ra từ `GeneratedResults`; ba trang (Ảnh đã tạo · Skeleton UI · Mascot) gọi cùng một khối nên trạng thái sheet không lệch nhau.
- Trang Mascot: danh sách **nhân vật** và lưới **dáng** đều có hộp cuộn riêng (`max-h` + `overflow-y-auto`, không `h-` cố định) — *“MASCOT, CHO NÓ SHOW SCROLL ĐƯỢC”*. Ít món thì khối co lại; nhiều món thì mới sinh thanh cuộn, và hàng tab + hàng nút Lưu luôn còn trong tầm mắt.

### ③ “Ảnh đã tạo” bỏ hàng pill, thành một dải cuộn dọc

*“BỎ CÁI ĐOẠN BUTTON PILL Ở TẤT CẢ THÀNH PHẨM”*. Hàng chip `Tất cả thành phẩm / Mascot / Nền / Popup / UI nhỏ / Đạo cụ` đã xoá.

- Trang là **một dải cuộn dọc**, mỗi nhóm một khối có tiêu đề nhỏ, thứ tự `Mascot · Nền · Popup · UI nhỏ · Đạo cụ · Khác` (`RESULT_GROUP_ORDER`). Nhóm không có ảnh **không** để lại khối rỗng.
- Thanh `Ảnh thật | Ảnh gốc` giữ nguyên và vẫn là **thanh segmented duy nhất** của trang; các khối theo nhóm nằm **bên trong** từng tab.
- Nhóm chỉ có một tấm thì tiêu đề tấm bị lược (tên nhóm đã nói xong) — `sheetLabel("pose-nhan-vat")` và `groupLabel("mascot")` đều là “Mascot pose”.
- `?group=` **đổi nghĩa từ “lọc” sang “cuộn tới”** nhưng vẫn resolve: link cũ `?group=props` và cả `?section=props` đời trước đều cuộn tới đúng khối. Anchor là `groupAnchorId()` = `nhom-<nhóm>` — một hằng số, hai bên (nơi vẽ khối và nơi cuộn) đọc chung.
- Tiêu đề trang cố định là **“Tất cả thành phẩm”** vì trang không còn lọc gì nữa.

### ④ Sidebar dự án — thêm Preview tổng quan, đổi tên mục thứ tư

Danh sách bốn đích của 13/08 giữ nguyên thứ tự, sửa mục thứ tư và thêm một khối chỉ-đọc:

1. **Ảnh đã tạo** (`?section=images`) — một dải cuộn dọc chia khối theo nhóm (xem ③).
2. **Skeleton UI** (`?section=skeleton`) — ba tab (xem ②).
3. **Mascot** (`?section=mascot`) — ba tab (xem ②).
4. **Cài đặt style** — mở dialog `?settings=<tab>`, icon **Palette** (bảng màu). Chủ sản phẩm: *“CÁI CÀI ĐẶT Ở SIDEBAR ĐỔI THÀNH CÀI ĐẶT STYLE — CÁI NÀY Ở TRÊN CÓ RỒI MÀ, ĐỔI ICON ĐI”*. Bánh răng ở topbar là cài đặt của **cả app**; mục này là yêu cầu + phong cách của **một dự án**, nên hai chỗ không dùng chung tên lẫn icon. Nội dung dialog không đổi (`Yêu cầu · Phong cách · Dự án`).

Dưới `<nav>` là khối **Preview tổng quan** — *“TRONG DỰ ÁN, SIDEBAR TRÁI SẼ CÓ PHẦN PREVIEW TỔNG QUAN”*:

- ảnh đại diện (ảnh bìa dự án → nếu chưa có thì ô đã cắt đầu tiên → nếu chưa có gì thì khung trống **có chữ**), số ô đã cắt **theo từng nhóm** và một dòng Tổng;
- chỉ đọc: không nút tạo lại, không bộ lọc, không mở dialog. Bấm vào bất kỳ đâu trong khối ⇒ sang **Ảnh đã tạo**;
- nằm **ngoài** `<nav aria-label="Quản lý dự án">` — nó là bản tóm tắt có lối tắt, không phải đích điều hướng thứ năm (sidebar vẫn đúng bốn nút).

### Những gì KHÔNG đổi

Luật buffer (`autosave: false`, chỉ nút Lưu mới ghi, hỏi lại khi rời mục còn thay đổi), ba tab của dialog Cài đặt, hai cửa ra `Tải .zip` / `Copy sang Figma` ở header trang “Ảnh đã tạo”, nguồn của prompt trong popup, và ô dáng mascot cố định `30% × 85%`.
