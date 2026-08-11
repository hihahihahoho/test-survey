# Phát hành KitGen local

KitGen là ứng dụng local-first. GitHub Actions build React một lần, đóng bundle tĩnh cùng agent và
engine vào GitHub Release. Máy người dùng không build React và sản phẩm không gọi từ Cloudflare vào
localhost.

```text
GitHub Actions
  ├── npm ci && npm run verify
  ├── Vite build -> webapp/dist
  └── GitHub Release: kitgen-runtime-<version>.tar.gz + SHA-256

Máy người dùng
  └── http://127.0.0.1:8765/app/
      ├── React tĩnh do agent Node phục vụ
      ├── API cùng origin tại /api/*
      └── agent gọi gen.sh, Codex CLI và Python khi cần
```

## Build local cho developer

```bash
cd kit-gen/webapp
npm ci
npm run verify
cd ../..
bash kit-gen/scripts/build-runtime.sh 2.0.1 /tmp/kitgen-release
```

Artifact không chứa source React. Nó gồm `app/`, `agent/`, `engine/`, launcher và manifest checksum.
Node chỉ chạy agent HTTP/API; không có SSR hoặc Next.js runtime. Python chỉ chạy engine cắt ảnh.

## GitHub Actions và quyền

`.github/workflows/kitgen-release.yml` mặc định chỉ có `contents: read`. Job `publish` mới có
`contents: write`, chỉ chạy với tag `kitgen-v*`, và đi qua environment `kitgen-release`. Nên bật
Required reviewers cho environment này.

Workflow không chứa Cloudflare token. Push nhánh chỉ tạo artifact CI giữ 14 ngày. Tag tạo release:

```bash
git tag kitgen-v2.0.1
git push origin kitgen-v2.0.1
```

## Cài và cập nhật

```bash
bash install.sh
kitgen update
kitgen open
```

Installer hỏi profile tạo ảnh với hai lựa chọn: Codex hiện tại là mặc định; `~/.codex-img` chỉ được
dùng khi user chọn option 2 hoặc truyền `--codex-img`. Chế độ không tương tác dùng `--codex-default`.

Installer lấy GitHub Release mới nhất, xác minh checksum ngoài archive và manifest bên trong, kiểm cú
pháp agent rồi đổi symlink `~/.kitgen/current`. Nếu health check thất bại, symlink trở về phiên bản cũ.
Project ở `~/KitGen` và đăng nhập tạo ảnh ở `~/.codex-img`, nằm ngoài thư mục phiên bản.

Có thể dùng fork hoặc mirror:

```bash
bash install.sh --repo cong-ty/kitgen
kitgen update --repo cong-ty/kitgen
```

## Bảo mật runtime

- Agent chỉ bind `127.0.0.1` và `::1`, không bind `0.0.0.0`.
- UI và API cùng origin; không có CORS từ một website công khai trong đường chạy sản phẩm.
- Không có endpoint shell tổng quát; frontend chỉ gọi các thao tác API đã định nghĩa.
- Đường dẫn được khóa trong workspace, request ghi vẫn cần header client và Origin local hợp lệ.
- `auth.json` không được đọc hoặc trả về frontend; Codex chạy với `CODEX_HOME=~/.codex-img`.

`--origin` vẫn tồn tại cho Vite dev server hoặc tích hợp nội bộ có chủ đích, nhưng bản phát hành mặc định
không tin bất kỳ domain Internet nào.
