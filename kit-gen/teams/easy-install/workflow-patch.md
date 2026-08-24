# Proposed release workflow patch

The real workflow is outside the writable cwd:

/Users/tungnt2/Documents/work/survey/.github/workflows/kitgen-release.yml

It was not edited because filesystem permission blocks writes outside kit-gen.
Apply the following diff from the survey repository root.

~~~diff
diff --git a/.github/workflows/kitgen-release.yml b/.github/workflows/kitgen-release.yml
--- a/.github/workflows/kitgen-release.yml
+++ b/.github/workflows/kitgen-release.yml
@@
       - name: Build source-free runtime
         working-directory: .
         run: bash kit-gen/scripts/build-runtime.sh '${{ steps.version.outputs.version }}' "$RUNNER_TEMP/release"
+      - name: Verify and build easy-install bundle
+        working-directory: .
+        shell: bash
+        run: |
+          set -eu
+          bash kit-gen/test/easy-install.test.sh
+          chmod +x kit-gen/easy-install/*.command
+          python3 - "$RUNNER_TEMP/release/kitgen-easy-install.zip" <<'PY'
+          import stat
+          import sys
+          import zipfile
+          from pathlib import Path
+
+          root = Path("kit-gen/easy-install")
+          names = [
+              "README.md",
+              "install.bat",
+              "install.command",
+              "start-server.bat",
+              "start-server.command",
+              "stop-server.bat",
+              "stop-server.command",
+              "uninstall.bat",
+              "uninstall.command",
+          ]
+          missing = [name for name in names if not (root / name).is_file()]
+          if missing:
+              raise SystemExit("missing easy-install files: " + ", ".join(missing))
+          destination = Path(sys.argv[1])
+          with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
+              for name in names:
+                  path = root / name
+                  info = zipfile.ZipInfo(name)
+                  info.create_system = 3
+                  info.date_time = (1980, 1, 1, 0, 0, 0)
+                  info.external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16
+                  info.compress_type = zipfile.ZIP_DEFLATED
+                  archive.writestr(info, path.read_bytes())
+          print("built", destination)
+          PY
       - uses: actions/upload-artifact@v4
         with:
           name: kitgen-runtime-${{ steps.version.outputs.version }}
           path: |
             ${{ runner.temp }}/release/*.tar.gz
             ${{ runner.temp }}/release/*.sha256
+            ${{ runner.temp }}/release/kitgen-easy-install.zip
@@
       - name: Check release payload
         run: |
           set -eu
           cd release-output
+          test -f kitgen-easy-install.zip
           count=0
@@
           files: |
             release-output/*.tar.gz
             release-output/*.sha256
+            release-output/kitgen-easy-install.zip
~~~

The Python ZIP writer sets create_system=3 and Unix mode bits, preserving execute
permissions on all four .command files. It writes the nine user-facing files only:
eight wrappers plus README.md.
