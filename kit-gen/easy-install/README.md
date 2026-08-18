# KitGen Easy Install

Bấm đúp đúng file theo hệ điều hành. `install` cài bản release chuẩn, chờ health rồi mở app; `start-server` và `stop-server` quản lý agent; `uninstall` xoá runtime.

Double-click the file for your operating system. `install` runs the standard release installer, waits for health, then opens the app; `start-server` and `stop-server` manage the agent; `uninstall` removes the runtime.

## macOS

- `.command` mở bằng Terminal. Nếu macOS hiện cảnh báo quarantine: lần đầu **chuột phải → Open**.
- `uninstall.command` giữ nguyên `~/KitGen` mặc định; chỉ xoá dữ liệu khi bạn trả lời `y`.

## Windows

- `.bat` dùng PowerShell với `-NoProfile -ExecutionPolicy Bypass`; không cần đổi execution policy.
- Nếu SmartScreen chặn: **More info → Run anyway**.
- Dữ liệu `%USERPROFILE%\KitGen` được giữ mặc định khi gỡ cài đặt.

The GitHub Release asset is `kitgen-easy-install.zip`.
