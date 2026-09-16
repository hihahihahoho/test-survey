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

Bản cũ (2.1.44 trở về trước) để lại trên máy khoảng **1 GB** thứ nay không còn dùng: một
môi trường Python nặng (numpy/scipy/pymatting, ~314 MB) và một bộ Chromium đóng gói riêng
(~790 MB). Cập nhật thẳng thì đống đó vẫn nằm lại, nên nếu bạn đang ở bản cũ hãy gỡ rồi cài lại:

**Bản mới KHÔNG cài Python.** Từ 16/09/2026 engine là JS chạy trên Node có sẵn của KitGen,
nên bản mới không tải CPython, không dựng venv, không cài Pillow — và lượt cài/cập nhật
còn tự dọn phần Python đời cũ còn sót (`tools/python`, `%USERPROFILE%\KitGen\.venv`,
`%USERPROFILE%\KitGen\.kitgen\engine`), có in ra một dòng nói đã dọn bao nhiêu MB.

1. Bấm đúp `uninstall.bat`. Khi được hỏi có xoá dữ liệu không, trả lời `n` (hoặc cứ bấm Enter) — **giữ dữ liệu**.
2. Bấm đúp `install.bat`, chờ cài xong và app tự mở.
3. Nếu app hỏi đăng nhập Codex, đăng nhập lại một lần.

Project trong `%USERPROFILE%\KitGen\projects` và cấu hình `%USERPROFILE%\KitGen\.kitgen\config.json`
**không mất**. Bước 1 chỉ dọn thêm phần chạy mà installer dựng lại được:
`%USERPROFILE%\KitGen\.venv` và `%USERPROFILE%\KitGen\.kitgen\engine`.
Muốn xoá sạch cả dữ liệu thì ở bước 1 trả lời `Y`.

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
