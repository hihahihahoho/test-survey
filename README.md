# Survey Builder

Công cụ soạn & duyệt bộ câu hỏi khảo sát. Giao diện xem trước giống Google Forms,
dữ liệu ở đúng **schema Google Forms API v1** nên có thể đẩy thẳng sang Google Form thật.

Trả lời câu hỏi ban đầu: **Google Forms không cho nhập câu hỏi theo bulk/JSON qua UI.**
Chỉ làm được qua code — Apps Script (`FormApp`) hoặc REST API v1 (`forms.batchUpdate`).
Repo này giữ dữ liệu ở đúng định dạng mà hai đường đó nhận.

## Chạy

```bash
npm run dev              # build + http://localhost:8000
# hoặc
./run.sh
```

Cần local server vì trình duyệt chặn `fetch()` khi mở bằng `file://`.
Nếu vẫn muốn double-click `index.html`, sang tab **JSON → Mở file…** và chọn file trong `surveys/`.

## Cấu trúc

```
authoring/
  helpers.mjs               cú pháp gọn (TXT/RADIO/CHECK/GRID/PAGE…) + lint + mô phỏng skip-logic
  creative-audit-2026.mjs   bộ câu hỏi — SỬA Ở ĐÂY
build.mjs                   authoring/*.mjs → surveys/*.json + manifest.json
surveys/
  manifest.json             danh sách survey cho picker trên toolbar
  creative-audit-2026.json  dữ liệu app (Forms API v1 + field mở rộng _exclusive)
  google/                   bản đã strip, đưa thẳng sang Google Forms (node build.mjs --google)
index.html                  engine + trình xem + bộ sinh Apps Script (không chứa nội dung câu hỏi)
test/engine.test.mjs        test engine trên JSON đã build
test/appsscript.test.mjs    chạy script .gs sinh ra với FormApp giả
```

Test (không cần browser, không gọi Google):

```bash
node build.mjs --google && node test/engine.test.mjs && node test/appsscript.test.mjs
```

## Deploy (Cloudflare Pages)

Kết nối repo này vào Cloudflare Pages với:

| Cài đặt | Giá trị |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 18 hoặc mới hơn (biến `NODE_VERSION`) |

Mỗi commit sẽ chạy lại `node build.mjs --dist`, nên **sửa `authoring/*.mjs` rồi push là trang
demo tự cập nhật** — không cần commit file JSON đã build (dù `surveys/*.json` vẫn được commit
để chạy local không cần build trước).

`dist/` chỉ chứa `index.html` + `surveys/` — không mang theo `authoring/`, `test/`, `build.mjs`.
Nếu lint có lỗi cứng thì build dừng và **không** ghi `dist/`, tránh deploy bản sai.

Trang này là **demo tĩnh để duyệt câu hỏi** — không thu câu trả lời. Nút Gửi chỉ hiện payload
để kiểm tra logic; dữ liệu không rời khỏi trình duyệt. Muốn thu thật thì dùng tab Apps Script
tạo Google Form.

## Thêm survey mới

1. Tạo `authoring/<id>.mjs`, export `meta` (có `id`, `name`, `note`) và `build()`.
2. `node build.mjs` — tự cập nhật `surveys/` và `manifest.json`.
3. Reload trang, chọn survey mới ở dropdown trên toolbar.

## Ba tab

| Tab | Dùng để |
|---|---|
| **Xem trước** | trả lời thử như người thật; skip-logic, validate, giới hạn "chọn tối đa N" đều hoạt động; bấm Gửi để xem payload câu trả lời |
| **Duyệt câu hỏi** | soát nhanh cả bộ: số câu, câu bắt buộc, kích thước từng grid, sơ đồ nhánh |
| **JSON** | xem/dán/nạp JSON, tải file để đưa sang Google Forms |
| **Apps Script** | sinh file `.gs` dán vào script.google.com là ra Google Form thật — kèm cảnh báo những gì Google không làm được |

## Cú pháp authoring

```js
import { PAGE, RADIO, CHECK, GRID, PARA, resetIds } from "./helpers.mjs";

export const meta = { id: "vi-du", name: "Ví dụ", note: "mô tả ngắn" };

export function build() {
  resetIds();
  return {
    info: { title: "…", documentTitle: "…", description: "…" },
    items: [
      PAGE("sec_a", "Phần 1", "mô tả phần"),
      RADIO("Câu hỏi?", ["A", "B", "__OTHER__"], { req: true, desc: "ghi chú" }),
      CHECK("Chọn tối đa 3", [...], { req: true }),        // giới hạn đọc từ chữ "tối đa 3"
      GRID("Tiêu đề", ["dòng 1", "dòng 2"], ["cột 1", "cột 2"], { req: true }),
      GRID("Chọn nhiều mỗi dòng", rows, cols, { multi: true }),
      PARA("Câu tự luận", { req: true }),
    ]
  };
}
```

Quy ước option:

| Viết | Nghĩa |
|---|---|
| `"Chuỗi"` | lựa chọn thường |
| `"__OTHER__"` | ô **Khác:** cho người trả lời tự ghi |
| `{ value, goTo: "NEXT" }` | hết trang thì sang phần kế tiếp |
| `{ value, goTo: "SUBMIT" }` | gửi form luôn |
| `{ value, goTo: "sec_x" }` | nhảy tới `PAGE("sec_x", …)` |
| `{ value, exclusive: true }` | checkbox: tick ô này thì bỏ hết ô khác |

`exclusive` phải đánh dấu **tường minh** — engine không đoán theo nhãn, vì rất nhiều
phương án hợp lệ cũng bắt đầu bằng "Không" (`"Không được tự cài software"`,
`"Không giữ được nhất quán brand"`); đoán theo chữ sẽ xoá oan các lựa chọn khác.
Field này chỉ bị strip ở bản dành cho Google Forms (nút **Tải JSON**, hoặc `--google`).
Lint sẽ nhắc nếu một phương án trông như ô thoát mà chưa gắn `exclusive`.

Skip-logic chỉ chạy trên `RADIO` / `DROP_DOWN`, và như Google Forms, **câu phân nhánh cuối
cùng trên trang là câu quyết định**. Nên để câu lọc đứng một mình trong `PAGE` riêng.

## Lint

`build.mjs` chặn build khi có lỗi cứng và cảnh báo khi vi phạm chuẩn survey:

- `questionId` trùng
- skip-logic trỏ tới section không tồn tại, hoặc gắn vào loại câu không hỗ trợ
- skip-logic lặp vô hạn (mô phỏng bằng `walk()`)
- grid quá lớn (> 8 dòng hoặc > 6 cột) → gây straightlining
- checkbox dài mà không có ô thoát
- quá 2 câu tự luận bắt buộc
- ước lượng thời gian vượt 20 phút

## Đưa sang Google Forms thật

Dùng tab **Apps Script** — không cần Cloud project hay OAuth. Tab này sinh sẵn file `.gs`
gồm bộ dựng `FormApp` + spec nhúng kèm; dán vào [script.google.com](https://script.google.com)
rồi Run `createForm`. Script tự lo hai chỗ dễ sai:

- **Nối nhánh 2 lượt.** Câu lọc được tạo trước section đích của nó, nên script tạo hết item
  ở lượt 1, giữ map `itemId → PageBreakItem`, rồi mới `setChoices(...createChoice(value, page))`
  ở lượt 2. Google chỉ áp dụng điều hướng khi câu đó là câu **cuối** của phần — vì vậy mỗi
  câu lọc được đặt riêng một `PAGE`.
- **Trang tiêu đề không bị trống.** `pageBreakItem` đầu tiên được dựng thành section header
  thay vì page break, nếu không người trả lời phải bấm "Tiếp" một lần vô nghĩa.

Google Forms **không** có "ô loại trừ" — tab Apps Script liệt kê rõ những ô bị ảnh hưởng
để làm sạch ở bước phân tích. Ngược lại "chọn tối đa N" thì dựng được thật, bằng
`requireSelectAtMost`.

Muốn dùng REST API v1 thay vì Apps Script: `surveys/google/*.json` khớp schema
`forms.batchUpdate`, POST từng `createItem` theo thứ tự `items[]` — nhớ tạo section đích
trước khi câu phân nhánh tham chiếu tới nó.
