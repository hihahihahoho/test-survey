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

## Gỡ bản cũ, cài bản mới tinh

Bản cũ (2.1.44 trở về trước) để lại trên máy khoảng **1 GB** thứ nay không còn dùng: một
môi trường Python nặng (numpy/scipy/pymatting, ~314 MB) và một bộ Chromium đóng gói riêng
(~790 MB). Cập nhật thẳng thì đống đó vẫn nằm lại, nên nếu bạn đang ở bản cũ hãy gỡ rồi cài lại:

1. Bấm đúp `uninstall.command`. Khi được hỏi có xoá dữ liệu không, trả lời `n` (hoặc cứ bấm Enter) — **giữ dữ liệu**.
2. Bấm đúp `install.command`, chờ cài xong và app tự mở.
3. Nếu app hỏi đăng nhập Codex, đăng nhập lại một lần.

Project trong `~/KitGen/projects` và cấu hình `~/KitGen/.kitgen/config.json` **không mất**.
Bước 1 chỉ dọn thêm phần chạy mà installer dựng lại được: `~/KitGen/.venv` và `~/KitGen/.kitgen/engine`.
Muốn xoá sạch cả dữ liệu thì ở bước 1 trả lời `y`.

## English

`.command` files open in Terminal. Double-click the appropriate file:

- `install.command` runs the standard release installer, waits for KitGen to answer, then opens the app.
- `start-server.command` starts the agent and opens the app.
- `stop-server.command` stops the agent.
- `uninstall.command` removes the runtime.

macOS may show a quarantine warning for a `.command` file. The first time, **right-click the file → Open**, then confirm.

`uninstall.command` **KEEPS** data in `~/KitGen` by default. Answer `y` only if you want to delete that data.

## Clean reinstall (removing an older version)

An older version (2.1.44 or earlier) leaves about **1 GB** of files that are no longer used:
a heavy Python environment (numpy/scipy/pymatting, ~314 MB) and a bundled Chromium build
(~790 MB). Updating in place keeps all of that, so if you are on an older version, uninstall
first and then install again:

1. Double-click `uninstall.command`. When asked whether to delete your data, answer `n` (or just press Enter) — this **KEEPS** your data.
2. Double-click `install.command` and wait for it to finish.
3. If the app asks you to sign in to Codex, sign in once.

Your projects in `~/KitGen/projects` and `~/KitGen/.kitgen/config.json` are kept. Step 1 also
removes the runtime the installer can rebuild: `~/KitGen/.venv` and `~/KitGen/.kitgen/engine`.
Answer `y` in step 1 if you want the data deleted too.
