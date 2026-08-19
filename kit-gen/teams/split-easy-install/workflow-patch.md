# Patch đề xuất: tách asset easy-install theo hệ điều hành

Workflow thật nằm ngoài cwd có quyền ghi:

`/Users/tungnt2/Documents/work/survey/.github/workflows/kitgen-release.yml`

Không sửa trực tiếp. Áp patch dưới đây từ gốc repository (`/Users/tungnt2/Documents/work/survey`). Patch thay nguyên bước build ZIP cũ, rồi đổi đủ ba nơi nhận asset: `upload-artifact`, `Check release payload`, `Publish GitHub Release`.

```diff
diff --git a/.github/workflows/kitgen-release.yml b/.github/workflows/kitgen-release.yml
--- a/.github/workflows/kitgen-release.yml
+++ b/.github/workflows/kitgen-release.yml
@@ -131,38 +131,50 @@
           set -eu
           bash kit-gen/test/easy-install.test.sh
           chmod +x kit-gen/easy-install/*.command
-          python3 - "$RUNNER_TEMP/release/kitgen-easy-install.zip" <<'PY'
+          python3 - "$RUNNER_TEMP/release" <<'PY'
           import stat
           import sys
           import zipfile
           from pathlib import Path
 
           root = Path("kit-gen/easy-install")
-          names = [
-              "README.md",
-              "install.bat",
-              "install.command",
-              "start-server.bat",
-              "start-server.command",
-              "stop-server.bat",
-              "stop-server.command",
-              "uninstall.bat",
-              "uninstall.command",
-          ]
-          missing = [name for name in names if not (root / name).is_file()]
-          if missing:
-              raise SystemExit("missing easy-install files: " + ", ".join(missing))
-          destination = Path(sys.argv[1])
-          with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
-              for name in names:
-                  path = root / name
-                  info = zipfile.ZipInfo(name)
-                  info.create_system = 3
-                  info.date_time = (1980, 1, 1, 0, 0, 0)
-                  info.external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16
-                  info.compress_type = zipfile.ZIP_DEFLATED
-                  archive.writestr(info, path.read_bytes())
-          print("built", destination)
+          release = Path(sys.argv[1])
+          packages = {
+              "kitgen-easy-install-macos.zip": (
+                  "README-macos.md",
+                  [
+                      "install.command",
+                      "start-server.command",
+                      "stop-server.command",
+                      "uninstall.command",
+                  ],
+              ),
+              "kitgen-easy-install-windows.zip": (
+                  "README-windows.md",
+                  [
+                      "install.bat",
+                      "start-server.bat",
+                      "stop-server.bat",
+                      "uninstall.bat",
+                  ],
+              ),
+          }
+          for archive_name, (readme, wrappers) in packages.items():
+              names = [("README.md", readme), *((name, name) for name in wrappers)]
+              missing = [source for _, source in names if not (root / source).is_file()]
+              if missing:
+                  raise SystemExit("missing easy-install files: " + ", ".join(missing))
+              destination = release / archive_name
+              with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
+                  for archive_name_in_zip, source_name in names:
+                      path = root / source_name
+                      info = zipfile.ZipInfo(archive_name_in_zip)
+                      info.create_system = 3
+                      info.date_time = (1980, 1, 1, 0, 0, 0)
+                      info.external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16
+                      info.compress_type = zipfile.ZIP_DEFLATED
+                      archive.writestr(info, path.read_bytes())
+              print("built", destination)
           PY
       - uses: actions/upload-artifact@v4
         with:
@@ -170,7 +182,8 @@
           path: |
             ${{ runner.temp }}/release/*.tar.gz
             ${{ runner.temp }}/release/*.sha256
-            ${{ runner.temp }}/release/kitgen-easy-install.zip
+            ${{ runner.temp }}/release/kitgen-easy-install-macos.zip
+            ${{ runner.temp }}/release/kitgen-easy-install-windows.zip
           if-no-files-found: error
           retention-days: 14
 
@@ -189,7 +202,9 @@
         run: |
           set -eu
           cd release-output
-          test -f kitgen-easy-install.zip
+          test -f kitgen-easy-install-macos.zip
+          test -f kitgen-easy-install-windows.zip
+          test ! -e kitgen-easy-install.zip
           count=0
           for archive in ./*.tar.gz; do
             [ -f "$archive" ] || continue
@@ -209,6 +224,7 @@
           files: |
             release-output/*.tar.gz
             release-output/*.sha256
-            release-output/kitgen-easy-install.zip
+            release-output/kitgen-easy-install-macos.zip
+            release-output/kitgen-easy-install-windows.zip
         env:
           GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The ZIP writer intentionally keeps `create_system = 3` and
`external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16`; all four macOS `.command` entries therefore retain mode `rwxr-xr-x`.
