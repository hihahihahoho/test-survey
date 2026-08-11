# agent/test/integration — KIỂM MỐI NỐI (chạy thật, không đọc mã)

Bốn script này do lượt INTEGRATION dựng, kiểm **mối nối giữa web tĩnh và agent local**
ở cả hai đường vào. Chúng nằm ngoài `agent/test-agent.mjs` vì có script kiểm cả `web/`
và cả bản `dist/` của Cloudflare Pages — không thuộc phạm vi test của riêng agent.

```bash
node agent/test/integration/asset-graph.mjs     # mọi tài nguyên index.html trỏ tới có tồn tại thật?
node agent/test/integration/connections.mjs    # agent thật + workspace tạm /tmp: /app/, CRUD, contract, trash
bash scripts/pages-build.sh dist               # (cần trước khi chạy script dưới)
node agent/test/integration/pages-entry.mjs dist   # đường vào Pages: deep link + SPA fallback
node agent/test/integration/agent-down.mjs     # agent CHƯA CHẠY: mọi request phải bỏ cuộc có thời hạn
```

## Giới hạn trung thực

`connections.mjs` **không** mở cổng TCP: môi trường phát triển này chặn `listen()`
cho **mọi** tiến trình (đã kiểm bằng lệnh thật với `node`, `python3` và `nc` — tất cả
trả `EPERM`, kể cả unix socket). Vì vậy nó lái **đúng `http.Server` thật** của agent qua
một cặp duplex trong bộ nhớ: request đi qua nguyên HTTP parser của Node và **toàn bộ**
pipeline (Host → Origin → header ép preflight → rate limit → router → fs). Chỉ **tầng
vận chuyển TCP** là chưa kiểm được.

Trên máy có quyền mở cổng, hãy kiểm lại bằng `curl` thật:

```bash
node agent/server.mjs --workspace /tmp/kitgen-thu --allow-cli &
curl -sS -H 'X-KitGen-Client: 1' -H 'Origin: https://kitgen.pages.dev' \
     http://127.0.0.1:8765/health | python3 -m json.tool
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:8765/app/
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:8765/app/js/boot.js
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:8765/app/p/x/design
```

Hai dòng cuối là **chỗ đã từng vỡ**: nếu `boot.js` trả `text/html` thì bundle nhận
HTML thay vì JS ⇒ **trang trắng**. Xem `teams/design/INTEGRATION.md`.
