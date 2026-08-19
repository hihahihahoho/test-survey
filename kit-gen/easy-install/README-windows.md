# KitGen Easy Install — Windows

Bộ này chỉ dành cho Windows. Hãy giải nén ZIP ra Desktop (hoặc một thư mục khác) rồi mới bấm đúp file `.bat`.

This package is for Windows only. Extract the ZIP to the Desktop (or another folder) before double-clicking a `.bat` file.

## CẢNH BÁO QUAN TRỌNG / IMPORTANT WARNING

- **Không bấm đúp `.bat` ngay trong cửa sổ xem ZIP của Explorer.** Khi đó file chạy từ thư mục tạm (temp), có thể làm sai thư mục làm việc. Hãy giải nén ra Desktop trước.
- **Do not double-click a `.bat` file in Explorer's ZIP preview window.** It runs from a temporary folder and may use the wrong working directory. Extract it to the Desktop first.

Nếu Windows SmartScreen chặn file: chọn **More info → Run anyway**.

If Windows SmartScreen blocks the file, choose **More info → Run anyway**.

## Cách dùng / How to use

Bấm đúp đúng file / Double-click the appropriate file:

- `install.bat` cài bản release chuẩn, chờ KitGen phản hồi rồi mở app / runs the standard release installer, waits for KitGen to answer, then opens the app.
- `start-server.bat` khởi động agent rồi mở app / starts the agent and opens the app.
- `stop-server.bat` dừng agent / stops the agent.
- `uninstall.bat` gỡ runtime / removes the runtime.

Các file dùng PowerShell với `-NoProfile -ExecutionPolicy Bypass`; không cần đổi execution policy.

The files use PowerShell with `-NoProfile -ExecutionPolicy Bypass`; no execution-policy change is required.

`uninstall.bat` mặc định **GIỮ NGUYÊN** dữ liệu trong `%USERPROFILE%\KitGen`. Chỉ trả lời `Y` khi muốn xoá dữ liệu đó.

`uninstall.bat` **KEEPS** data in `%USERPROFILE%\KitGen` by default. Answer `Y` only if you want to delete that data.
