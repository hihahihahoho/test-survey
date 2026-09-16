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

## Gỡ bản cũ, cài bản mới tinh / Clean reinstall

Bản cũ (2.1.45 trở về trước) để lại trên máy khoảng **1 GB** thứ nay không còn dùng: một
môi trường Python nặng (numpy/scipy/pymatting, ~314 MB) và một bộ Chromium đóng gói riêng
(~790 MB).

**Từ bản 3.0 bạn không phải gỡ gì cả.** Bấm đúp `install.bat` (hoặc bấm **Cập nhật** trong
app): installer nhận ra máy đang ở đời cũ, rồi đi đúng trình tự — tải bản mới và kiểm
checksum → dừng dịch vụ → **gỡ sạch bản cũ** (`%LOCALAPPDATA%\KitGen\releases`, `current`,
`%LOCALAPPDATA%\KitGen\tools` gồm cả Python riêng và Chromium,
`%USERPROFILE%\KitGen\.venv`, `%USERPROFILE%\KitGen\.kitgen\engine`) → nâng Codex →
cài bản mới → kiểm tra chạy được. Màn hình in một dòng nói đã dọn bao nhiêu MB.

**Dữ liệu của bạn ở nguyên chỗ cũ:** project trong `%USERPROFILE%\KitGen\projects`, cấu
hình `%USERPROFILE%\KitGen\.kitgen\config.json` và `%LOCALAPPDATA%\KitGen\config.cmd`,
nhật ký — installer không đụng tới.

Chỉ khi muốn xoá **cả dữ liệu** thì mới cần `uninstall.bat` và trả lời `Y`.

An older version (2.1.44 or earlier) leaves about **1 GB** of files that are no longer used:
a heavy Python environment (numpy/scipy/pymatting, ~314 MB) and a bundled Chromium build
(~790 MB). Updating in place keeps all of that, so if you are on an older version, uninstall
first and then install again:

**The new build installs no Python.** Since 2026-09-16 the engine is plain JS running on
the Node runtime KitGen already ships, so nothing downloads CPython, creates a venv or
installs Pillow — and install/update now deletes the leftovers from the Python era
(`tools/python`, `%USERPROFILE%\KitGen\.venv`, `%USERPROFILE%\KitGen\.kitgen\engine`), printing one line saying
how much it cleaned.

1. Double-click `uninstall.bat`. When asked whether to delete your data, answer `n` (or just press Enter) — this **KEEPS** your data.
2. Double-click `install.bat` and wait for it to finish.
3. If the app asks you to sign in to Codex, sign in once.

Your projects in `%USERPROFILE%\KitGen\projects` and `%USERPROFILE%\KitGen\.kitgen\config.json`
are kept. Step 1 also removes the runtime the installer can rebuild:
`%USERPROFILE%\KitGen\.venv` and `%USERPROFILE%\KitGen\.kitgen\engine`.
Answer `Y` in step 1 if you want the data deleted too.
