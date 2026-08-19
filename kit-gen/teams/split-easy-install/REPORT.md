# Báo cáo: tách easy-install theo hệ điều hành

## Quyết định

- Asset mới:
  - `kitgen-easy-install-macos.zip`
  - `kitgen-easy-install-windows.zip`
- Bỏ asset gộp `kitgen-easy-install.zip`; không giữ song song.
- Thay README gộp trong `easy-install/` bằng hai README nguồn rõ nền tảng:
  - `easy-install/README-macos.md`
  - `easy-install/README-windows.md`
- Khi đóng gói, mỗi nguồn được đặt tên `README.md` bên trong ZIP. Cách này ít rối hơn việc giữ một README gộp vừa làm tài liệu dev vừa dễ bị đóng nhầm vào release.
- Thêm ngoại lệ `.gitignore` cho `teams/split-easy-install/` để report/patch được theo dõi.

README macOS giữ cảnh báo quarantine (**chuột phải → Open**) và mặc định giữ `~/KitGen`. README Windows giữ SmartScreen (**More info → Run anyway**), cảnh báo không bấm đúp `.bat` trong cửa sổ xem ZIP của Explorer (giải nén ra Desktop trước), và mặc định giữ `%USERPROFILE%\KitGen`. Không khẳng định hành vi chạy từ temp tương đương trên macOS: môi trường hiện tại không có ứng dụng Archive Utility/Finder để kiểm chứng trực tiếp.

## Danh sách file

`kitgen-easy-install-macos.zip`:

```text
README.md                 # nguồn: easy-install/README-macos.md
install.command
start-server.command
stop-server.command
uninstall.command
```

`kitgen-easy-install-windows.zip`:

```text
README.md                 # nguồn: easy-install/README-windows.md
install.bat
start-server.bat
stop-server.bat
uninstall.bat
```

Không còn `easy-install/README.md`. Bốn `.command` vẫn `rwxr-xr-x` trong working tree.

## Kiểm định ZIP

Dùng đúng đoạn Python `zipfile` được đưa vào patch workflow, chạy ra thư mục tạm:

```text
/private/tmp/kitgen-split-easy-install-evidence.oG62Yx/kitgen-easy-install-macos.zip
/private/tmp/kitgen-split-easy-install-evidence.oG62Yx/kitgen-easy-install-windows.zip
```

`unzip -Z -1`:

```text
macOS:
README.md
install.command
start-server.command
stop-server.command
uninstall.command

Windows:
README.md
install.bat
start-server.bat
stop-server.bat
uninstall.bat
```

`unzip -Z -v` trên ZIP macOS:

```text
install.command (000755
start-server.command (000755
stop-server.command (000755
uninstall.command (000755
```

Test ZIP cũng xác nhận macOS không có `.bat`, Windows không có `.command`, và README từng gói chỉ nói về hệ điều hành tương ứng.

## File thay đổi

- `easy-install/README-macos.md` — thêm.
- `easy-install/README-windows.md` — thêm.
- `easy-install/README.md` — xoá README gộp.
- `test/easy-install.test.sh` — kiểm hai ZIP, danh sách, tách wrapper, README OS-only, mode Unix; giữ các fixture cũ.
- `teams/split-easy-install/workflow-patch.md` — patch đầy đủ cho workflow ngoài cwd.
- `.gitignore` — cho phép theo dõi thư mục report/patch mới.

## Kết quả test

```text
$ bash kit-gen/test/easy-install.test.sh
built .../kitgen-easy-install-macos.zip
built .../kitgen-easy-install-windows.zip
verified .../kitgen-easy-install-macos.zip
verified .../kitgen-easy-install-windows.zip
easy-install: 8 wrappers, two platform ZIPs, file separation/README/mode checks, syntax/encoding checks, start/stop health/browser, uninstall fixture keep/delete passed
```

```text
$ node kit-gen/agent/test-agent.mjs
183/183 ca PASS · 0 FAIL
```

Patch workflow trích từ `workflow-patch.md` đã qua `git apply --check`.

## Việc cần điều phối viên

1. Áp `teams/split-easy-install/workflow-patch.md` vào `.github/workflows/kitgen-release.yml`; file này ngoài cwd nên không thể sửa trực tiếp.
2. Sau khi áp patch, kiểm tra release payload có đúng hai asset mới và không có asset gộp.
3. Quét phiên khác nếu cần: `DEPLOY.md`, `kit-gen/README.md`, `kit-gen/docs/` không có nhắc asset cũ nên không sửa. Workflow ngoài cwd còn nhắc tên cũ cho tới khi áp patch. Hai artifact lịch sử của `kit-gen/teams/easy-install/` cũng còn chuỗi tên cũ; không sửa chéo phiên này.
