# KitGen Easy Install — macOS

Bộ này chỉ dành cho macOS. Hãy giải nén ZIP trước, rồi mở thư mục đã giải nén.

This package is for macOS only. Extract the ZIP first, then open the extracted folder.

## Cách dùng

Các file `.command` mở bằng Terminal. Bấm đúp đúng file:

- `install.command` cài bản release chuẩn, chờ KitGen phản hồi rồi mở app.
- `start-server.command` khởi động agent rồi mở app.
- `stop-server.command` dừng agent.
- `uninstall.command` gỡ runtime.

macOS có thể hiện cảnh báo quarantine cho file `.command`. Lần đầu, **chuột phải vào file → Open**, rồi xác nhận mở.

`uninstall.command` mặc định **GIỮ NGUYÊN** dữ liệu trong `~/KitGen`. Chỉ trả lời `y` khi muốn xoá dữ liệu đó.

## English

`.command` files open in Terminal. Double-click the appropriate file:

- `install.command` runs the standard release installer, waits for KitGen to answer, then opens the app.
- `start-server.command` starts the agent and opens the app.
- `stop-server.command` stops the agent.
- `uninstall.command` removes the runtime.

macOS may show a quarantine warning for a `.command` file. The first time, **right-click the file → Open**, then confirm.

`uninstall.command` **KEEPS** data in `~/KitGen` by default. Answer `y` only if you want to delete that data.
