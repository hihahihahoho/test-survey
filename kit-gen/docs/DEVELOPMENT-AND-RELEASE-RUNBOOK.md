# KitGen — Bản đồ mã nguồn, chạy local và phát hành

> Cập nhật: 2026-08-13  
> Release hiện tại khi viết: `2.1.13` / `kitgen-v2.1.13`  
> Nhánh phát hành hiện tại: `feat/kitgen-local-runtime`

## 1. Người đọc và mục tiêu

Tài liệu này dành cho agent hoặc developer tiếp quản KitGen mà chưa biết file nào
là prototype, file nào là ứng dụng thật và bản release được tạo như thế nào.

Sau khi đọc, người tiếp quản phải có thể:

1. Mở đúng prototype kỹ thuật mà không nhầm với app production.
2. Chạy đúng React app và local agent từ source.
3. Biết source, runtime cài đặt và dữ liệu người dùng nằm ở ba nơi khác nhau.
4. Build, kiểm tra, tag và phát hành một version mới an toàn.
5. Cài/update, kiểm tra health và quay về release cũ nếu cần.

## 2. Bốn thứ không được nhầm với nhau

```text
Git checkout
├── Prototype HTML cũ           dùng để hiểu pipeline/interaction
├── React webapp source         giao diện chính đang phát triển
├── Node agent + Python engine  backend local và pipeline ảnh
└── Release scripts             đóng gói runtime source-free

Máy đã cài KitGen
├── ~/.kitgen/                  runtime, launcher và tools
└── ~/KitGen/                   project, ảnh và dữ liệu người dùng
```

### 2.1 Prototype kỹ thuật

| File/khu vực | Vai trò | Có phải app production không? |
|---|---|---|
| `kit-gen/studio.html` | Prototype một trang đúng nhất cho contract → gen → cắt → showcase | Không |
| `kit-gen/screens.html` | Các màn hình cũ lắp từ element | Không |
| `kit-gen/demo.html` | Demo game Phaser từ các asset đã cắt | Không |
| `kit-gen/figma.html` | DOM mode cũ để thử xuất Figma | Không |
| `kit-gen/preview.html` | Ma trận xem asset/style đã tạo | Không |
| `kit-gen/web/` | App vanilla JS đời trước | Legacy, không được đóng vào runtime hiện tại |
| `kit-gen/experiments/` | Spike safe-zone, prompt và ảnh thử local | Không; thư mục đang bị Git ignore |

Prototype quan trọng nhất cho pipeline ảnh là `studio.html`. Nó giải thích cách
tổ chức sheet, skeleton, safe zone và asset. Giao diện sản phẩm mới được phép đơn
giản hơn prototype, nhưng không được vô tình đổi contract/pipeline chỉ vì UI khác.

Chạy prototype qua HTTP từ repo root:

```bash
python3 -m http.server 8000
```

Sau đó mở một trong các URL:

```text
http://127.0.0.1:8000/kit-gen/studio.html
http://127.0.0.1:8000/kit-gen/screens.html
http://127.0.0.1:8000/kit-gen/demo.html
http://127.0.0.1:8000/kit-gen/figma.html
http://127.0.0.1:8000/kit-gen/preview.html
```

Không mở trực tiếp bằng `file://`; một số asset/module không tải đúng theo cách đó.

### 2.2 App chính hiện tại

App chính là React/Vite tại `kit-gen/webapp/`:

```text
kit-gen/webapp/
├── src/main.tsx        entry trình duyệt
├── src/App.tsx         providers, router, toaster và theme
├── src/routeTree.ts    cây route khai báo tay
├── src/features/       màn hình và workflow sản phẩm
├── src/components/     layout và UI primitives
├── tests/e2e/          Playwright
├── package.json        version và lệnh build/test
└── dist/               output build; không phải source
```

Backend local là `kit-gen/agent/`. Nó phục vụ:

- API `/api/*`;
- health `/health`;
- React bundle tại `/app/` trong runtime cài đặt;
- thao tác file/project và chạy engine.

Pipeline ảnh được đóng từ các file engine ở gốc `kit-gen/`, gồm `gen.sh`,
`slice.py`, `skeleton.py`, renderer skeleton, element library và geometry validator.

### 2.3 Runtime đã cài

Runtime release là **source-free package**, không phải Git checkout. Sau khi cài:

```text
~/.kitgen/
├── releases/<version>/
│   ├── app/             React bundle đã build, không có src/
│   ├── agent/           local Node agent
│   ├── engine/          pipeline ảnh cần lúc chạy
│   ├── runtime/         launcher + service templates
│   ├── install.sh
│   ├── VERSION
│   └── manifest.sha256
├── current -> releases/<version>
├── bin/kitgen
├── install.sh
├── config.env
├── install.log
└── tools/               private Node, @resvg/resvg-wasm, Codex fallback
```

Vì vậy, nếu Finder chỉ thấy `install.sh` và một file installer khác ở thư mục vừa
tải, đó **không phải source** và cũng không phải toàn bộ app. Hai file đó chỉ là
script bootstrap. Installer tải runtime vào `~/.kitgen/releases/<version>`.

Kiểm tra bản đang chạy:

```bash
readlink "$HOME/.kitgen/current"
cat "$HOME/.kitgen/current/VERSION"
find "$HOME/.kitgen/current" -maxdepth 1 -mindepth 1 -print
```

### 2.4 Dữ liệu người dùng

Mặc định dữ liệu nằm ngoài runtime, tại `~/KitGen`:

```text
~/KitGen/
├── .venv/                    Python environment
├── .kitgen/
│   ├── config.json
│   └── engine/               bản engine copy cho workspace
└── projects/<projectId>/
    ├── project.json
    ├── contract.json
    ├── styles.json
    ├── refs/
    ├── skeleton/
    ├── prompts/
    ├── raw/
    ├── kits/
    ├── logs/
    └── runs/
```

Update runtime không được xoá `~/KitGen`. Release, credentials và project là ba
vùng độc lập:

- runtime: `~/.kitgen`;
- project/ảnh: `~/KitGen` hoặc workspace user đã chọn;
- đăng nhập Codex: `~/.codex`, hoặc `~/.codex-img` nếu user chủ động chọn profile riêng.

## 3. Nguồn sự thật khi tài liệu mâu thuẫn

Ưu tiên theo thứ tự:

1. `.github/workflows/kitgen-release.yml` — CI thật sự chạy gì và khi nào publish.
2. `kit-gen/install.sh` và `kit-gen/runtime/bin/kitgen` — cài/update/rollback thật.
3. `kit-gen/scripts/build-runtime.sh` — file nào được đóng vào release.
4. `kit-gen/webapp/package.json` — version và scripts của app chính.
5. `kit-gen/release.json` — archive mà standalone installer/update sẽ tải.
6. `kit-gen/DEPLOY.md` và các README — giải thích, có thể chậm hơn code.

`README-USER.md` còn một số mô tả đời trước về clone source/setup và Cloudflare.
Không dùng các đoạn đó để phán runtime release hiện tại nếu chúng mâu thuẫn với
workflow, installer hoặc build script.

## 4. Chạy app chính từ source

### 4.1 Chuẩn bị dependency

```bash
cd kit-gen/webapp
npm ci
```

### 4.2 Chạy local agent

Terminal 1, từ repo root:

```bash
node kit-gen/agent/server.mjs \
  --workspace "$HOME/KitGen" \
  --port 8765
```

Agent chỉ bind loopback. Workspace có thể đổi bằng `--workspace`.

### 4.3 Chạy React dev server

Terminal 2:

```bash
cd kit-gen/webapp
npm run dev
```

Mở URL Vite in ra, thường là:

```text
http://localhost:5173/
```

Vite proxy `/api`, `/health` và `/bridge.html` tới agent ở cổng `8765`. Nếu agent
ở cổng khác:

```bash
cd kit-gen/webapp
KITGEN_AGENT_PORT=8770 npm run dev
```

### 4.4 Chạy đúng bundle release local

Muốn test đường `/app/` giống máy user:

```bash
cd kit-gen/webapp
npm run build:only
cd ../..
node kit-gen/agent/server.mjs \
  --workspace "$HOME/KitGen" \
  --port 8765 \
  --app-root kit-gen/webapp/dist
```

Mở:

```text
http://127.0.0.1:8765/app/
```

## 5. Build runtime local trước khi release

Không dựa vào `webapp/dist` cũ. Build app trước, rồi mới đóng gói:

```bash
cd kit-gen/webapp
npm ci
npm run verify:release
npm run test:integration
node ../agent/test-agent.mjs
# `npx playwright install chromium` chỉ cần cho e2e của webapp (devDependency).
# Đường SHIP không còn Playwright — engine render khung xương bằng @resvg/resvg-wasm.
npx playwright install chromium
npm run test:e2e
cd ../..

bash kit-gen/test/kitgen-run-env.test.sh
bash kit-gen/test/kitgen-launchd-start.test.sh
bash kit-gen/test/install-launchd.test.sh

KITGEN_PACKAGE_VERSION=2.1.14
KITGEN_RELEASE_OUT="$(mktemp -d)"
bash kit-gen/scripts/build-runtime.sh \
  "$KITGEN_PACKAGE_VERSION" \
  "$KITGEN_RELEASE_OUT"
ls -lh "$KITGEN_RELEASE_OUT"
```

Thay `2.1.14` bằng version thật. Kết quả gồm đúng một archive và checksum:

```text
kitgen-runtime-<version>.tar.gz
kitgen-runtime-<version>.tar.gz.sha256
```

Kiểm tra nhanh payload:

```bash
tar -tzf "$KITGEN_RELEASE_OUT/kitgen-runtime-$KITGEN_PACKAGE_VERSION.tar.gz" | head -80
(
  cd "$KITGEN_RELEASE_OUT"
  shasum -a 256 -c "kitgen-runtime-$KITGEN_PACKAGE_VERSION.tar.gz.sha256"
)
```

Artifact phải có `app/`, `agent/`, `engine/`, `runtime/`, `install.sh`, `VERSION`
và `manifest.sha256`. Nó cố ý không có React source, tests hoặc toàn bộ Git repo.

### 5.1 Cài thử archive local

Nên test với home/workspace tạm để không đổi bản KitGen đang dùng:

```bash
KITGEN_TEST_HOME="$(mktemp -d)"
KITGEN_TEST_WORKSPACE="$(mktemp -d)"

KITGEN_HOME="$KITGEN_TEST_HOME" \
KITGEN_WORKSPACE="$KITGEN_TEST_WORKSPACE" \
bash kit-gen/install.sh \
  --archive "$KITGEN_RELEASE_OUT/kitgen-runtime-$KITGEN_PACKAGE_VERSION.tar.gz" \
  --no-start \
  --codex-default

cat "$KITGEN_TEST_HOME/current/VERSION"
```

`--no-start` kiểm package/install mà không đăng ký service. Shell tests ở trên mới
là bằng chứng cho health-check và rollback service. Lần cài thử đầu vẫn có thể tải
private Node, Codex, Python package và Chromium, nên cần mạng và có thể mất vài phút.

## 6. Bump version

Ví dụ dưới đây phát hành `2.1.14`. Không copy nguyên version này cho lần sau.

### 6.1 Cập nhật package và lockfile

```bash
KITGEN_NEXT_VERSION=2.1.14
cd kit-gen/webapp
npm version "$KITGEN_NEXT_VERSION" --no-git-tag-version
cd ../..
```

Lệnh này cập nhật:

- `kit-gen/webapp/package.json`;
- version package gốc trong `kit-gen/webapp/package-lock.json`.

### 6.2 Cập nhật release manifest

`kit-gen/release.json` phải khớp cùng version:

```json
{
  "version": "2.1.14",
  "tag": "kitgen-v2.1.14",
  "archive": "https://github.com/hihahihahoho/test-survey/releases/download/kitgen-v2.1.14/kitgen-runtime-2.1.14.tar.gz"
}
```

Kiểm tra bằng Python, không cần `jq`:

```bash
KITGEN_NEXT_VERSION=2.1.14
python3 - "$KITGEN_NEXT_VERSION" <<'PY'
import json, pathlib, sys
version = sys.argv[1]
package = json.loads(pathlib.Path("kit-gen/webapp/package.json").read_text())
lock = json.loads(pathlib.Path("kit-gen/webapp/package-lock.json").read_text())
release = json.loads(pathlib.Path("kit-gen/release.json").read_text())
assert package["version"] == version
assert lock["version"] == version
assert lock["packages"][""]["version"] == version
assert release["version"] == version
assert release["tag"] == f"kitgen-v{version}"
assert release["archive"].endswith(
    f"/kitgen-v{version}/kitgen-runtime-{version}.tar.gz"
)
print(f"version metadata OK: {version}")
PY
```

## 7. Git và release GitHub

### 7.1 Push branch không đồng nghĩa release

Workflow chạy với:

- push `main` hoặc `feat/**`: verify + build artifact CI, giữ 14 ngày;
- push tag `kitgen-v*`: verify + build + tạo GitHub Release;
- workflow dispatch: package artifact, nhưng job publish vẫn không chạy nếu ref không phải tag.

Muốn người dùng cài được version mới, **phải push tag**.

### 7.2 Kiểm tra worktree trước khi commit

Repo có thể đang chứa thay đổi unrelated của người dùng. Không dùng `git add .` một
cách mù quáng.

```bash
git status --short
git diff --check
git diff
```

Stage có chủ đích:

```bash
git add -p kit-gen .github/workflows/kitgen-release.yml
git diff --cached --name-only
git diff --cached
```

Đảm bảo ít nhất metadata version sau đã được stage:

```text
kit-gen/webapp/package.json
kit-gen/webapp/package-lock.json
kit-gen/release.json
```

`kit-gen/experiments/` đang bị ignore. Prompt/ảnh spike sẽ **không** đi theo release
trừ khi có quyết định force-add hoặc chuyển artifact cần giữ sang vùng tracked.

### 7.3 Commit và tạo annotated tag

```bash
KITGEN_NEXT_VERSION=2.1.14
git commit -m "release(kitgen): $KITGEN_NEXT_VERSION"

if git rev-parse --verify \
  "refs/tags/kitgen-v$KITGEN_NEXT_VERSION" >/dev/null 2>&1; then
  echo "Tag đã tồn tại" >&2
  exit 1
fi

git tag -a "kitgen-v$KITGEN_NEXT_VERSION" \
  -m "KitGen $KITGEN_NEXT_VERSION"
```

Không di chuyển hoặc tái sử dụng một tag release đã publish. Nếu cần sửa sau khi
release đã tồn tại, tăng patch version mới.

### 7.4 Thứ tự push an toàn cho `release.json`

Installer đọc `release.json` trực tiếp từ nhánh `feat/kitgen-local-runtime`. Nếu
push branch trước, manifest có thể trỏ tới archive chưa được GitHub Actions tạo.
Trong cửa sổ đó, user update sẽ lỗi tải archive.

Thứ tự khuyên dùng:

1. Push **tag trước** để workflow build/publish release.
2. Chờ GitHub Release và checksum tải được.
3. Sau đó mới push branch chứa `release.json` mới.

```bash
KITGEN_NEXT_VERSION=2.1.14
git push origin "kitgen-v$KITGEN_NEXT_VERSION"
```

Theo dõi GitHub Actions `KitGen release`. Nếu có GitHub CLI:

```bash
gh run list --workflow "KitGen release" --limit 5
gh run watch
```

Hoặc mở tab Actions của repository. Khi workflow xanh, kiểm tra asset thật:

```bash
KITGEN_NEXT_VERSION=2.1.14
KITGEN_RELEASE_BASE="https://github.com/hihahihahoho/test-survey/releases/download/kitgen-v$KITGEN_NEXT_VERSION/kitgen-runtime-$KITGEN_NEXT_VERSION.tar.gz"

curl -fsSL -o /dev/null "$KITGEN_RELEASE_BASE"
curl -fsSL -o /dev/null "$KITGEN_RELEASE_BASE.sha256"
```

Chỉ khi hai lệnh trên thành công mới push branch:

```bash
git push origin feat/kitgen-local-runtime
```

Sau đó kiểm tra raw manifest đã cập nhật:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json \
  | python3 -m json.tool
```

### 7.5 Nếu workflow tag thất bại

- Không push branch có `release.json` trỏ tới archive chưa tồn tại.
- Đọc log của step thất bại và sửa tại source.
- Nếu tag chưa tạo GitHub Release, có thể dọn tag thất bại theo policy của repo;
  cách ít mơ hồ hơn là tăng patch version mới và tạo tag mới.
- Nếu GitHub Release đã public, không rewrite tag; phát hành patch mới.

## 8. Cài và cập nhật bản release

### 8.1 Lệnh cài chuẩn

Lệnh `curl -o install.sh` chỉ tải installer. Phải chạy file sau khi tải:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/install.sh \
  -o /tmp/kitgen-install.sh

bash /tmp/kitgen-install.sh --codex-default
```

Installer sẽ:

1. đọc `release.json` trên nhánh release;
2. tải archive và `.sha256` từ GitHub Release;
3. kiểm checksum ngoài và manifest trong archive;
4. cài private Node/Codex + `@resvg/resvg-wasm` nếu cần;
5. tạo Python venv cho workspace;
6. chuyển symlink `~/.kitgen/current`;
7. khởi động service và kiểm health;
8. rollback runtime cũ nếu health của bản mới thất bại.

File `/tmp/kitgen-install.sh` có thể xoá sau khi cài; runtime không chạy từ file đó.

### 8.2 Update bản đang cài

Nếu `kitgen` đã có trong `PATH`:

```bash
kitgen update
```

Lệnh chắc chắn dùng được dù `PATH` chưa cấu hình:

```bash
"$HOME/.kitgen/bin/kitgen" update
```

Mở app:

```bash
"$HOME/.kitgen/bin/kitgen" open
```

### 8.3 Cài pinned release để test hoặc quay về bản cũ

Ví dụ pin `2.1.13`:

```bash
KITGEN_PINNED_VERSION=2.1.13
KITGEN_PINNED_URL="https://github.com/hihahihahoho/test-survey/releases/download/kitgen-v$KITGEN_PINNED_VERSION/kitgen-runtime-$KITGEN_PINNED_VERSION.tar.gz"

bash /tmp/kitgen-install.sh \
  --release-url "$KITGEN_PINNED_URL" \
  --codex-default
```

Installer tự tải checksum cạnh archive. Không đổi symlink thủ công nếu installer
còn chạy được.

## 9. Health check, log và rollback

### 9.1 Kiểm tra bình thường

```bash
"$HOME/.kitgen/bin/kitgen" status
"$HOME/.kitgen/bin/kitgen" doctor
"$HOME/.kitgen/bin/kitgen" logs 200
readlink "$HOME/.kitgen/current"
cat "$HOME/.kitgen/current/VERSION"
```

Health trực tiếp:

```bash
curl -fsS \
  -H 'X-KitGen-Client: 1' \
  -H 'Origin: http://127.0.0.1:8765' \
  http://127.0.0.1:8765/health \
  | python3 -m json.tool
```

### 9.2 Khi thấy `Update failed health check`

Installer hiện tại chỉ in “previous runtime restored and restarted” sau khi:

1. symlink `current` đã quay về runtime cũ;
2. launcher đã restart service cũ;
3. health của runtime cũ đạt.

Kiểm tra bằng:

```bash
readlink "$HOME/.kitgen/current"
cat "$HOME/.kitgen/current/VERSION"
"$HOME/.kitgen/bin/kitgen" status
tail -n 200 "$HOME/.kitgen/install.log"
tail -n 200 "$HOME/.kitgen/agent.log"
```

Thử restart runtime hiện tại:

```bash
"$HOME/.kitgen/bin/kitgen" restart
"$HOME/.kitgen/bin/kitgen" status
```

Nếu runtime cũ cũng không khỏe, cài pinned release theo §8.3. Không xoá
`~/.kitgen/releases/` hoặc `~/KitGen` trong lúc chẩn đoán.

Trên macOS, lỗi đăng ký LaunchAgent được append vào:

```text
~/.kitgen/install.log
```

Agent runtime ghi log vào:

```text
~/.kitgen/agent.log
```

### 9.3 Test rollback trong source

Ba test bắt buộc của workflow:

```bash
bash kit-gen/test/kitgen-run-env.test.sh
bash kit-gen/test/kitgen-launchd-start.test.sh
bash kit-gen/test/install-launchd.test.sh
```

`install-launchd.test.sh` kiểm đúng case health bản mới thất bại: symlink cũ được
khôi phục, LaunchAgent cũ được bootstrap nếu thiếu, restart và health lại thành công.

## 10. Checklist phát hành ngắn

```text
[ ] Xác định đúng app React, không sửa legacy web vì tưởng là production
[ ] Giữ dữ liệu thử nghiệm ngoài release nếu chưa quyết định force-add
[ ] Bump package.json + package-lock.json + release.json cùng version
[ ] Chạy shell installer tests
[ ] Chạy verify:release + integration + agent + e2e Playwright của webapp
[ ] Build archive local và kiểm SHA-256
[ ] Inspect file staged; không git add . mù quáng
[ ] Commit một release candidate rõ ràng
[ ] Tạo annotated tag kitgen-v<version>
[ ] Push tag trước
[ ] Chờ GitHub Release + archive + checksum tồn tại
[ ] Push nhánh để cập nhật release.json sau
[ ] Cài/update trên một máy thật
[ ] Kiểm VERSION, current symlink, /health và /app/
```

## 11. Những điều không làm

- Không coi hai file installer tải về là source code.
- Không chỉnh `kit-gen/web/` hoặc `kit-gen/dist/` rồi kỳ vọng runtime React đổi.
- Không đóng gói từ `webapp/dist` cũ mà chưa build lại.
- Không push branch `release.json` mới rồi để archive chưa tồn tại quá lâu.
- Không nghĩ push `feat/**` đã tạo GitHub Release; chỉ tag `kitgen-v*` mới publish.
- Không reuse/move tag release đã public.
- Không chạy `git add .` khi worktree có dữ liệu unrelated.
- Không commit workspace, credential hoặc dữ liệu project.
- Không xoá `~/KitGen` khi chỉ muốn reinstall runtime.
- Không sửa symlink rollback bằng tay trước khi đọc install/agent log và thử pinned installer.
