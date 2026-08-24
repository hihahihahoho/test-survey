# Easy-install report

## Thiết kế

- easy-install/ chứa 8 wrapper mỏng: 4 macOS .command, 4 Windows .bat.
- macOS dùng #!/usr/bin/env bash, set -euo pipefail, tự đổi cwd về thư mục wrapper, chờ health trước khi mở http://127.0.0.1:8765/app/, và luôn giữ cửa sổ bằng prompt Enter.
- install.command tải đúng raw installer hiện tại rồi chạy --codex-default.
- uninstall.command unload gui/<uid>/com.kitgen.agent, xoá plist và ~/.kitgen; ~/KitGen chỉ xoá sau xác nhận y, mặc định giữ.
- stop-server.command gọi kitgen stop; nếu launchd KeepAlive bật lại agent thì unload đúng label rồi kiểm tra lại.
- Windows gọi PowerShell với -NoProfile -ExecutionPolicy Bypass. install.bat tải scripts/install.ps1; các wrapper còn lại gọi %LOCALAPPDATA%\KitGen\bin\kitgen.cmd. Startup entry KitGen.vbs bị xoá khi uninstall.
- .bat ASCII-only, không BOM.

## Tệp

- install.command, uninstall.command, start-server.command, stop-server.command
- install.bat, uninstall.bat, start-server.bat, stop-server.bat
- README.md song ngữ, hướng dẫn quarantine macOS và SmartScreen Windows
- test/easy-install.test.sh fixture test
- teams/easy-install/workflow-patch.md patch workflow

## Kiểm thử

Đã chạy:

- bash -n cả 4 .command
- kiểm execute bit, shebang, strict mode, BOM/non-ASCII của wrappers
- fixture start/stop với HOME tạm: gọi đúng lệnh, chờ health, mở app và xác nhận dừng
- fixture uninstall với HOME tạm: mặc định giữ KitGen, xác nhận y xoá KitGen, luôn xoá .kitgen và LaunchAgent plist
- node agent/test-agent.mjs: 172/172 PASS
- pytest: 115 passed, 13 skipped
- test/kitgen-run-env.test.sh, test/kitgen-launchd-start.test.sh, test/install-launchd.test.sh, test/install-restart.test.sh: PASS
- ZIP fixture: 9 file, .command giữ execute bit, unzip -t PASS

Không chạy được test/install-download.test.sh trong sandbox hiện tại: quyền mạng chặn
bind HTTP 127.0.0.1 (curl nhận mã 7); đây là giới hạn môi trường, không phải lỗi wrapper.
shellcheck không có trên máy này.

Chưa chạy trên máy thật:

- Gatekeeper quarantine/Open lần đầu
- Windows SmartScreen
- PowerShell 5.1, start browser, launchd thật
- cài đặt release thật; không được phép chạy cài đặt thật trong nhiệm vụ này

## Release

Workflow release thật nằm ngoài cwd và bị chặn quyền ghi:

/Users/tungnt2/Documents/work/survey/.github/workflows/kitgen-release.yml

Patch đề xuất nằm tại teams/easy-install/workflow-patch.md. Patch tạo kitgen-easy-install.zip bằng Python zipfile, giữ Unix execute bit, upload artifact và đính ZIP vào GitHub Release cạnh tarball/checksum.
