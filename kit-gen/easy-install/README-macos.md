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

Bản cũ (2.1.45 trở về trước) để lại trên máy khoảng **1 GB** thứ nay không còn dùng: một
môi trường Python nặng (numpy/scipy/pymatting, ~314 MB) và một bộ Chromium đóng gói riêng
(~790 MB).

**Từ bản 3.0 bạn không phải gỡ gì cả.** Bấm đúp `install.command` (hoặc bấm **Cập nhật**
trong app): installer nhận ra máy đang ở đời cũ, rồi đi đúng trình tự — tải bản mới và
kiểm checksum → dừng dịch vụ → **gỡ sạch bản cũ** (`~/.kitgen/releases`, `current`,
`~/.kitgen/tools` gồm cả Python riêng và Chromium, `~/KitGen/.venv`,
`~/KitGen/.kitgen/engine`) → nâng Codex → cài bản mới → kiểm tra chạy được. Màn hình in
một dòng nói đã dọn bao nhiêu MB.

**Dữ liệu của bạn ở nguyên chỗ cũ:** project trong `~/KitGen/projects`, cấu hình
`~/KitGen/.kitgen/config.json` và `~/.kitgen/config.env`, nhật ký `~/.kitgen/logs/` —
installer không đụng tới.

Chỉ khi muốn xoá **cả dữ liệu** thì mới cần `uninstall.command` và trả lời `y`.

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

**The new build installs no Python.** Since 2026-09-16 the engine is plain JS running on
the Node runtime KitGen already ships, so nothing downloads CPython, creates a venv or
installs Pillow — and install/update now deletes the leftovers from the Python era
(`tools/python`, `~/KitGen/.venv`, `~/KitGen/.kitgen/engine`), printing one line saying
how much it cleaned.

1. Double-click `uninstall.command`. When asked whether to delete your data, answer `n` (or just press Enter) — this **KEEPS** your data.
2. Double-click `install.command` and wait for it to finish.
3. If the app asks you to sign in to Codex, sign in once.

Your projects in `~/KitGen/projects` and `~/KitGen/.kitgen/config.json` are kept. Step 1 also
removes the runtime the installer can rebuild: `~/KitGen/.venv` and `~/KitGen/.kitgen/engine`.
Answer `y` in step 1 if you want the data deleted too.
