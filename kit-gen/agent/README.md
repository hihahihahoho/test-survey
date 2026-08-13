# kitgen-agent — công cụ local của kit-gen v2

Agent là **nơi duy nhất được chạm ổ đĩa và spawn tiến trình** (architecture §1.1-B).
Web tĩnh không có quyền nào cả: nó chỉ gọi HTTP tới agent.

- Node stdlib **thuần** — không `npm install`, không dependency ngoài.
- Bind **`127.0.0.1` và `[::1]`**, **không bao giờ `0.0.0.0`**.
- **Không token, không cookie.** Phòng thủ xếp tầng (xem §Bảo mật).
- Không đọc, không lưu, không trả về API key / token / nội dung `auth.json`.

---

## 1. Chạy

```bash
node agent/server.mjs --workspace ~/KitGen
```

In ra:

```
  kitgen-agent 1.2.0 · gray-otter
  http://127.0.0.1:8765          (API cho web tĩnh)
  http://127.0.0.1:8765/app/     (bản chạy tại máy — same-origin)
  http://[::1]:8765              (IPv6 loopback)
  thư mục làm việc: ~/KitGen
  origin cho phép : https://kitgen.pages.dev
```

**Hai đường vào, cùng một bundle, cùng một API:**

| Đường vào | URL | Khi nào dùng |
|---|---|---|
| **(1) Web tĩnh** trên Cloudflare Pages | `https://kitgen.pages.dev` → fetch `http://127.0.0.1:8765` | Mặc định. Cập nhật UI = deploy Pages, user không cài lại gì |
| **(2) Bản chạy tại máy** (agent tự phục vụ bundle) | `http://127.0.0.1:8765/app/` | Khi trình duyệt chặn https→http (Safari, PNA/Local-Network-Access, enterprise policy). Same-origin ⇒ **miễn nhiễm mixed-content** |

Đường (2) không phải chế độ què: cùng code, cùng endpoint, đủ tính năng.

### Kiểm nhanh

```bash
curl -sS -H 'X-KitGen-Client: 1' -H 'Origin: https://kitgen.pages.dev' \
     http://127.0.0.1:8765/health | python3 -m json.tool
```

Gọi từ terminal **không có** header `Origin` sẽ bị **403** — cố ý (§Bảo mật lớp 2).
Muốn dùng `curl` không Origin thì chạy agent với `--allow-cli`.

---

## 2. Cấu hình

| Cờ | Biến môi trường | Mặc định | Việc |
|---|---|---|---|
| `--workspace <path>` (lặp được) | `KITGEN_WORKSPACE` | `~/KitGen` | Thư mục làm việc. Khai nhiều lần ⇒ web chọn được giữa chúng qua `POST /api/workspace/activate` (chỉ gửi `workspaceId` đục, **không bao giờ gửi path**) |
| `--port <n>` | `KITGEN_PORT` | `8765` | Cổng bắt đầu; **bận thì dò lên** `8766`, `8767`, … (8 lần) |
| `--origin <url>` (lặp được) | `KITGEN_ORIGINS` (phẩy) | `https://kitgen.pages.dev` | Thêm origin vào allowlist CORS |
| `--no-pages-origin` | — | tắt | Bỏ origin Pages mặc định (chỉ chạy đường vào (2)) |
| `--allow-cli` | `KITGEN_ALLOW_CLI=1` | tắt | Cho phép request **không có** header `Origin` (curl của chính bạn) |
| `--app-root <path>` | — | tự dò | Bundle giao diện phục vụ tại `/app/`. Tự dò theo thứ tự: `--app-root` → `<workspace>/.kitgen/app` → `<repo>/web` |

Allowlist origin **luôn** gồm sẵn `http://127.0.0.1:<port>`, `http://localhost:<port>`, `http://[::1]:<port>`
cho các cổng dò (8765–8767) — để đường vào (2) tự chạy. **Không bao giờ dùng `*`.**

### Thư mục trên đĩa

```
<workspace>/
├─ .kitgen/
│  ├─ config.json                     # {maxJobs, imageGen:{mode,codexHome}} — KHÔNG có secret
│  ├─ engine/                          # bản pipeline: gen.sh, slice.py, skeleton.py, element-lib.json…
│  ├─ app/                             # (tuỳ chọn) bundle giao diện phục vụ tại /app/
│  ├─ cache/thumbs/                    # thumbnail cho ?w=256
│  ├─ uploads/                         # staging của POST /api/uploads (TTL 1 giờ)
│  └─ trash/<yyyymmdd-hhmmss>-<id>/    # project đã xoá, giữ 30 ngày
└─ projects/<projectId>/
   ├─ project.json  contract.json  styles.json (agent sinh cho engine)
   ├─ .history/contract/*.json        # 50 bản gần nhất
   ├─ .history/raw/<job>@<runId>.png  # 3 đời ảnh raw
   ├─ refs/  skeleton/  prompts/  raw/  kits/  logs/
   └─ runs/<runId>/run.json + events.ndjson + logs/<job>.log · runs/latest.json
```

**Thư mục là database** (architecture §1.3-1): copy một thư mục project vào `projects/` là nó hiện trong UI.
`project.json` hỏng → agent trả `{broken:true, error:{file,line}}` để UI hiện thẻ đỏ, **không biến mất im lặng**.

### Adapter sang engine v1 (không sửa một dòng nào của `gen.sh`/`slice.py`)

`gen.sh` dòng 5 `cd "$(dirname "$0")"` và `slice.py` dòng 60 `HERE = dirname(abspath(__file__))`
⇒ engine neo mọi đường dẫn theo **thư mục chứa script**, không theo `cwd`.
Vì vậy agent **copy engine vào chính thư mục project** rồi chạy bản copy đó ⇒ `HERE = <project>`, mọi
`raw/ kits/ prompts/ skeleton/ logs/` nằm trong project (project tự chứa, không còn `kits/manifest.json` dùng chung như v1).

Ngoài ra filter của `gen.sh` là **substring** (`"tet-main"` sẽ chạy luôn `tet-main2`), nên agent
**không dùng argv filter** cho pha gen: nó ghi `styles.json` **thu hẹp đúng tập lượt đã chọn**.
Pha slice thì dùng argv vì `slice.py` so khớp tập chính xác. (Đóng E7 của audit.)

---

## 3. Bảng endpoint (đủ 42 endpoint của UX-SPEC §6.2)

Mọi request cần 2 header: `X-KitGen-Client: 1` và `Origin` trong allowlist.
Mọi response có `X-KitGen-Protocol: 1`. Lỗi luôn theo envelope §6.1:
`{"error":{"code","message","hint","docs","details"}}`.

### A. Hệ thống & môi trường

| # | Method | Path | Việc |
|---|---|---|---|
| 1 | GET | `/health` | Rẻ, là endpoint **duy nhất** nên poll định kỳ. Trả `protocol`, `version`, `instanceLabel`, `workspaceId/Label/Fingerprint`, `projects`, `activeRuns`, `updateCommand` |
| 2 | GET | `/api/doctor` | `?refresh=1` bỏ cache 60s. **Chỉ enum + boolean + version** — xem §Doctor |
| 3 | GET | `/api/workspaces` | Danh sách workspace agent BIẾT, mỗi cái một `id` đục (`ws_xxxxxxxx`), **không có path** |
| 4 | POST | `/api/workspace/activate` | `{workspaceId}` → đổi workspace đang dùng. `404 WORKSPACE_UNKNOWN` / `423 WORKSPACE_UNWRITABLE` |
| 5 | GET | `/bridge.html` | Cầu dò popup: điều hướng **top-level** nên không bị mixed-content chặn. `postMessage` **chỉ** tới origin trong allowlist |
| 6 | GET | `/app/*` | Bundle giao diện, same-origin. SPA fallback về `index.html`; asset có hash → `immutable` |

### B. Project

| # | Method | Path | Việc |
|---|---|---|---|
| 7 | GET | `/api/projects` | `?q&tag&include`; có `ETag` + `304` với `If-None-Match` |
| 8 | POST | `/api/projects` | `{name, slug?, template:"blank"|"basic"|"import", firstVariant, tags?, import?}` → `201`. Slug tự bỏ dấu (`"Xuân 26"`→`xuan-26`), agent thêm 4 hex ⇒ trùng thư mục không thể xảy ra |
| 9 | GET | `/api/projects/:id` | Kèm `stats` + `state.stale/staleReason/jobs` (nguồn của ma trận S2 & modal M1) |
| 10 | PATCH | `/api/projects/:id` | `{name?,slug?,description?,tags?,cover?}`. **id và thư mục không đổi** |
| 11 | DELETE | `/api/projects/:id` | **Soft**: chuyển vào `.kitgen/trash/`, trả `{trashId, restoreBefore (+30 ngày), cancelledRuns, bytes}` |
| 12 | GET | `/api/trash` | Danh sách đã xoá + `restoreBefore` + `expired` |
| 13 | POST | `/api/trash/:trashId/restore` | Phục hồi. `409 PROJECT_ID_TAKEN` nếu đã có project cùng id |
| 14 | DELETE | `/api/trash/:trashId?purge=1` | **Xoá vĩnh viễn**, cần header `X-KitGen-Confirm: <4 số>` |
| 15 | POST | `/api/trash/:trashId/code` | Agent **in mã 4 số ra terminal**; response chỉ có `{expiresInMs:60000}` |
| 16 | POST | `/api/projects/:id/duplicate` | `{name, include:["contract","refs","raw","kits","runs"], variants:"all"|[…]|"none", newVariant?}` |
| 17 | POST | `/api/projects/:id/clean` | `{targets:["skeleton","prompts","kits","rawHistory","oldLogs"]}`. **Không bao giờ** chạm `contract.json` và `raw/` đang dùng |
| 18 | GET | `/api/projects/:id/export.zip` | `?include=contract,refs,raw,kits,runs` → `kitgen-<slug>-<yyyymmdd>.zip` |
| 19 | POST | `/api/uploads` | multipart hoặc raw body, ≤200 MB → `{uploadId, kind:"zip"|"json"|"image"}`. `413`/`415` |
| 20 | POST | `/api/import/preview` | Báo cáo đối chiếu **trước khi** tạo gì: `sheets/components/variants/unknownComponents/duplicateSheetIds/warnings` |
| 21 | POST | `/api/projects/:id/reveal` | Mở Finder/Explorer. `501 NOT_SUPPORTED` nếu OS không hỗ trợ |

### C. Bản thiết kế (contract)

| # | Method | Path | Việc |
|---|---|---|---|
| 22 | GET | `/api/projects/:id/contract` | `{version, contract}` + `ETag: "<version>"` |
| 23 | PUT | `/api/projects/:id/contract` | **Bắt buộc `If-Match: <version>`**. Thiếu → `412 IF_MATCH_REQUIRED`; lệch → `409 CONTRACT_CONFLICT` kèm `serverVersion` + `diffSummary`; sai luật → `422 CONTRACT_INVALID` kèm từng lỗi. Snapshot bản cũ **trước khi** ghi |
| 24 | GET | `…/contract/history?limit=50` | 50 bản gần nhất |
| 25 | GET | `…/contract/history/:snapshot` | Một bản cụ thể |
| 26 | POST | `…/contract/restore` | `{snapshot}` → tạo bản **MỚI**, không ghi đè lịch sử |
| 27 | POST | `…/contract/validate` | Dry-run, **không ghi gì** |
| 28 | GET | `/api/element-lib` | Catalogue **chỉ đọc** 42 element. Không có đường ghi |

### D. Ảnh tham khảo

| # | Method | Path | Việc |
|---|---|---|---|
| 29 | GET | `/api/projects/:id/refs` | Kèm `usedBy[]` (đang dùng ở sheet/nhân vật/inspo/brand nào) |
| 30 | POST | `/api/projects/:id/refs` | **multipart** `file` + `kind:"character"|"inspo"|"brand"` + `hintName?`. **Agent tự đặt tên** `char-<slug>.png` / `inspo-<n>.png` / `brand-<n>.png`. Client **không được** gửi path |
| 31 | DELETE | `/api/projects/:id/refs/:name` | `409 REF_IN_USE` kèm `usedBy` nếu contract còn tham chiếu; `?force=1` mới xoá |

### E. Lượt chạy

| # | Method | Path | Việc |
|---|---|---|---|
| 32 | POST | `/api/projects/:id/runs` | `{kind:"gen"|"slice"|"skeleton", jobs:[…], maxJobs, autoSliceAfterGen}` → `202 {runId, jobs, estimate{seconds,quotaUnits}}`. `409 RUN_CONFLICT` / `422 UNKNOWN_JOB` / `422 CONTRACT_INVALID` / `409 IMAGEGEN_UNAVAILABLE` |
| 33 | GET | `/api/projects/:id/runs?limit=20` | Lịch sử run |
| 34 | GET | `/api/runs/:runId` | Trạng thái đầy đủ (nguồn của fallback poll 2s) |
| 35 | GET | `/api/runs/:runId/stream?from=<seq>` | **NDJSON** chunked, heartbeat 15s. Mất kết nối thì `?from=lastSeq+1` |
| 36 | POST | `/api/runs/:runId/cancel` | Kill **process group**; `{cancelled, killed[], kept}`. Ảnh của lượt đã xong **được giữ** |
| 37 | GET | `/api/runs/:runId/jobs/:job/log?tail=2000` | `text/plain`, **đã redact** |
| 38 | GET | `/api/runs/:runId/jobs/:job/prompt` | Prompt đã dùng + danh sách ảnh kèm |
| 39 | GET | `/api/projects/:id/raw/:job/history` | 3 đời ảnh raw |
| 40 | POST | `/api/projects/:id/raw/:job/restore` | `{historyId}` — khôi phục ảnh đã tốn quota |

### F. Đọc file sản phẩm

| # | Method | Path | Việc |
|---|---|---|---|
| 41 | GET | `/api/projects/:id/files/*` | `?w=128\|256\|512` → thumbnail (cache trong `.kitgen/cache/thumbs`). `ETag: "<mtimeMs>-<size>"`, `Cache-Control: no-cache`. **Chỉ** đọc được `raw/ kits/ refs/ skeleton/ prompts/ export/` + `project.json contract.json styles.json` — **thu hẹp** so với v1 (v1 phục vụ cả repo, lộ `.git/config`) |
| 42 | GET | `/api/projects/:id/kit?variant=<id>` | Danh mục file đã cắt từ `kits/manifest.json` |

> Thumbnail cần Pillow (đã là phụ thuộc của `slice.py`). Không có Pillow → trả **ảnh gốc** kèm
> header `X-KitGen-Thumb: unavailable`, không vỡ UI và **không giả vờ đã resize**.

### Sự kiện NDJSON (#35)

```jsonc
{"seq":401,"t":"…","type":"run.started","total":8,"maxJobs":4}
{"seq":402,"t":"…","type":"job.started","job":"tet-main"}
{"seq":403,"t":"…","type":"job.log","job":null,"level":"info","line":"prompt → prompts/tet-main.txt"}
{"seq":404,"t":"…","type":"job.done","job":"tet-main","status":"ok","durationMs":108000}
{"seq":405,"t":"…","type":"progress","done":3,"total":8,"failed":1,"etaSeconds":132}
{"seq":406,"t":"…","type":"phase.changed","phase":{"index":2,"total":2,"name":"slice"}}
{"seq":409,"t":"…","type":"run.finished","status":"done-with-errors","ok":7,"failed":1}
{"seq":410,"t":"…","type":"heartbeat"}
```

`seq` tăng đơn điệu; event cũng được ghi xuống `runs/<runId>/events.ndjson` nên
**replay được sau khi agent restart**. `status` của job phán theo **`artifact.writtenAt`**
(mtime của `raw/<job>.png` ≥ t0), **không theo exit code** — giữ đúng triết lý `gen.sh:167-176`.
Run có job lỗi → `done-with-errors`, **không bao giờ** là `done` trơn.

---

## 4. Bảo mật (không có token)

Agent là cửa cho phép chạy `codex exec -s workspace-write` trên máy user ⇒ coi như bề mặt tấn công thật.

| # | Lớp | Thực thi ở |
|---|---|---|
| 1 | **Chỉ bind loopback** `127.0.0.1` + `[::1]`, không `0.0.0.0` | `server.mjs` `listenLoopback`/`listenIpv6` |
| 2 | **Allowlist Origin**, sai → **403** kể cả GET. Không Origin → 403 (trừ `--allow-cli`) | `lib/security.mjs` `checkOrigin` |
| 3 | **Ép preflight** bằng header tuỳ biến `X-KitGen-Client: 1` ⇒ web độc hại không bắn được "simple request" | `checkClientHeader` |
| 4 | **Chống DNS-rebinding**: `Host` phải là tên loopback đúng cổng, sai → **421** | `checkHost` |
| 5 | **Không cookie, không `Allow-Credentials`** ⇒ không có phiên để cướp | `corsHeaders` |
| 6 | **Sandbox đường dẫn**: `resolve` + so prefix **theo từng đoạn** + `realpath` cả đích và tổ tiên ⇒ chặn `../`, `%2e%2e`, path tuyệt đối, và **symlink trỏ ra ngoài**. **Không dùng regex** (v1 dùng `/^refs\//` — thua symlink) | `lib/paths.mjs` `safeJoin` |
| 7 | **Chỉ nhận danh từ, không nhận lệnh**: client gửi `jobs:["tet-main"]`, agent đối chiếu contract rồi tự dựng argv. Không endpoint nào nhận chuỗi shell/flag | `lib/runs.mjs` + `lib/engine.mjs` |
| 8 | **Xác nhận ngoài băng**: xoá vĩnh viễn cần mã 4 số **in ra terminal**, dùng 1 lần, hết hạn 60s, sai 3 lần khoá 60s. Mã không lưu ở đâu, không trả qua HTTP | `lib/confirm.mjs` |
| 9 | **Rate limit** 20 req/s → **429** (+`Retry-After: 2`); body ≤ 25 MB, upload ≤ 200 MB, ảnh ref ≤ 20 MB → **413** | `makeRateLimiter`, `readBody` |
| 10 | **Xoá là chuyển vào `.trash/`**, không `rm -rf`. Không cho xoá ngoài workspace | `lib/projects.mjs` `trashProject` |
| 11 | **Redact bắt buộc** ở lớp cuối: mọi JSON qua `redactDeep`, mọi dòng log qua `redactLine`; đường dẫn tuyệt đối rút thành `~/…` (PII) | `lib/redact.mjs` + `lib/http.mjs` |
| 12 | **Kiểm magic bytes** khi upload, không tin `Content-Type` của client | `lib/multipart.mjs` `sniff` |
| 13 | **Zip-slip**: entry có `..` hoặc path tuyệt đối bị loại ngay khi đọc zip | `lib/zip.mjs` `readZip` |

**Giới hạn thừa nhận thẳng:** lớp 2–3 chặn được *website bất kỳ*, **không** chặn được (a) tiến trình local
khác trên cùng máy nếu bạn bật `--allow-cli`, (b) XSS trên chính domain Pages. Đổi lại, agent **không có
secret nào để lộ**. Đây là đánh đổi có ý thức theo yêu cầu 7.

### Những gì agent TUYỆT ĐỐI KHÔNG làm

- Không đọc nội dung `auth.json`, `config.toml`, `models.json`, `.env` — kể cả "chỉ để hiển thị".
  Việc kiểm đăng nhập làm bằng `existsSync(auth.json)` (đúng như `gen.sh` dòng 13).
- Không ghi/log/trả về API key, bearer token, JWT, `refresh_token`, `access_token`, `id_token`.
- Không trả đường dẫn tuyệt đối; chỉ trả **nhãn rút gọn** (`~/KitGen`) và **id đục** (`ws_8f2c`).
- Không nhận `path` do client gửi cho việc ghi file (upload) — agent tự đặt tên.

---

## 5. Doctor môi trường

`GET /api/doctor` (cache 60s, `?refresh=1` để bỏ cache). **Chỉ enum + boolean + version.**

```jsonc
{ "os":"darwin-arm64",
  "node":   {"ok":true,"version":"24.13.0"},
  "python": {"ok":true,"version":"3.9.6","venv":false,
             "deps":{"pillow":true,"numpy":true,"torch":false,"transformers":false}},
  "playwright": {"ok":false,"fallback":"skeleton.py (PIL)"},
  "codex":  {"ok":true,"version":"0.146.0"},
  "imageGen": {
    "mode":"default-home",        // default-home | img-home | profile-overlay | unavailable | unknown
    "available":true,             // = (đếm image_gen trong `codex debug prompt-input`) > 0
    "codexHomeLabel":"~/.codex",  // NHÃN rút gọn, không phải path tuyệt đối
    "authPresent":true,           // existsSync(auth.json) — KHÔNG mở file
    "reason":null,                // NO_CODEX|NOT_LOGGED_IN|FREE_PLAN|PROVIDER_NOT_OPENAI|
                                  //   MODEL_NO_IMAGE_INPUT|FEATURE_OFF|UNKNOWN
    "needsFallbackHome":false     // cờ: cần dựng CODEX_HOME riêng cho ảnh
  },
  "workspace": {"label":"~/KitGen","writable":true,"freeBytes":128849018880} }
```

Cách kiểm `image_gen` theo `teams/t3-auth/PLAN.md` §6.1 — **fallback, không phải mặc định**:

1. Đếm ở **home mặc định** trước: `codex debug prompt-input | grep -cE "image_?gen"`.
   (Codex ≥0.147 đổi tên tool `image_gen` thành skill `imagegen` — regex khớp cả hai dạng.)
   Lệnh này **không sinh ảnh, không tốn quota**; agent chỉ lấy **số đếm**, không giữ/log nội dung output.
2. `> 0` ⇒ `mode: "default-home"`, xong. (Đa số máy đã đủ — bắt tạo home thứ hai là thừa.)
3. `= 0` ⇒ xét `~/.codex-img` (hoặc `config.imageGen.codexHome`):
   - không có `auth.json` ⇒ `reason: "NOT_LOGGED_IN"`, **`needsFallbackHome: true`**
     (web hiện hướng dẫn `CODEX_HOME=~/.codex-img codex login`);
   - có nhưng đếm vẫn `= 0` ⇒ `reason: "FEATURE_OFF"`, `needsFallbackHome: true`.
4. Khi chạy gen, nếu `mode === "img-home"` thì agent truyền `IMG_HOME=<path>` cho `gen.sh` — **chỉ là đường dẫn**,
   agent không bao giờ mở file bên trong.

`POST /api/projects/:id/runs` với `kind:"gen"` **chặn trước** bằng `409 IMAGEGEN_UNAVAILABLE` nếu
`available:false` ⇒ không bao giờ chạy 8 lượt rồi mới báo lỗi môi trường (đóng E1 tại gốc).
`kind:"slice"` **không** bị chặn.

> **Chưa kiểm chứng được trên máy này:** `image_gen` có thật sự vào `tools[]` hay không —
> `codex debug prompt-input` trong sandbox chết vì `Operation not permitted` (đúng như
> `teams/t3-auth/PLAN.md §0` đã ghi). Phải chạy lại từ terminal thật của user.
> Test tự động vì thế dùng **doctor giả tiêm vào** để không phụ thuộc máy.

---

## 6. Test

```bash
node agent/test-agent.mjs
```

Workspace tạm trong `/tmp` (`mkdtemp`), **không dùng dữ liệu thật**, dọn sạch khi xong.
Phủ: health/doctor/workspaces · CRUD trọn vòng · thùng rác + phục hồi + mã 4 số · `../` và `%2e%2e`
và symlink ra ngoài · CORS origin lạ 403 · Host sai 421 · contract 409 khi version lệch · body quá lớn 413
· rate limit 429 · multipart + magic bytes · run gen→auto-slice **spawn engine thật** · stream NDJSON
+ reconnect · dừng run · nhập styles.json cũ không mất dữ liệu · `/app/` same-origin · redact.

Ca gen dùng **engine giả** ở `agent/test-fixtures/engine-fake/` — cùng giao diện với `gen.sh` thật
(neo theo thư mục script, in `OK`/`FAIL`, ghi `raw/<job>.png`) nhưng **không gọi codex ⇒ không tốn quota**.

**Giới hạn trung thực của test:** môi trường phát triển này **chặn bind TCP**
(`listen EPERM` cho cả `127.0.0.1` và unix socket — đã kiểm bằng lệnh thật). Test vì thế lái đúng
`http.Server` **thật** của agent qua một cặp duplex trong bộ nhớ: request đi qua nguyên HTTP parser của Node
và **toàn bộ** pipeline (Host → Origin → header ép preflight → rate limit → router → fs → spawn tiến trình).
Chỉ **tầng vận chuyển TCP** là chưa kiểm được; phần bind được kiểm bằng ca đọc mã
("mọi `listen()` khai host loopback tường minh, không `0.0.0.0`"). Trên máy có quyền mở cổng,
hãy chạy thêm `node agent/server.mjs` và `curl /health` như §1.

---

## 7. Cấu trúc mã (mỗi file < ~400 dòng — bài học `studio.html` 743 dòng)

```
agent/
├─ server.mjs               pipeline HTTP + bind loopback + dò cổng + NDJSON writer
├─ lib/
│  ├─ errors.mjs            envelope §6.1 + bảng code → HTTP status (nguồn duy nhất)
│  ├─ security.mjs          Host/Origin/preflight/rate-limit/body-limit/CORS
│  ├─ paths.mjs             safeJoin (resolve + realpath, KHÔNG regex) + regex validate id
│  ├─ redact.mjs            che secret + rút gọn đường dẫn (lớp chặn cuối)
│  ├─ http.mjs              sendJson/sendFile/sendError (mọi JSON qua redactDeep)
│  ├─ router.mjs            router pattern nhỏ (:param và *)
│  ├─ fsx.mjs               fs helper, ghi ATOMIC (tmp + rename)
│  ├─ workspace.mjs         Workspace + registry (id đục, không lộ path)
│  ├─ projects-dir.mjs      tách riêng để không import vòng
│  ├─ projects.mjs          quét/CRUD/state.jobs/trash/clean
│  ├─ contract.mjs          version + If-Match + snapshot 50 bản
│  ├─ validate.mjs          V-01..V-08 (agent validate LẠI, client không đáng tin)
│  ├─ templates.mjs         template blank/basic (danh sách file cụ thể)
│  ├─ engine.mjs            adapter sang gen.sh/slice.py + thu hẹp styles.json
│  ├─ runs.mjs              run-store: 1 run/project, tìm run trên đĩa
│  ├─ run-handle.mjs        spawn engine, event NDJSON, phán theo sản phẩm, cancel
│  ├─ doctor.mjs            môi trường + image_gen (chỉ enum/boolean)
│  ├─ thumbs.mjs            thumbnail qua Pillow, có fallback thật thà
│  ├─ multipart.mjs         parser multipart + magic bytes + đọc kích thước ảnh
│  ├─ zip.mjs               zip đọc/ghi bằng zlib (chống zip-slip)
│  ├─ importer.mjs          nhập một chiều + báo cáo đối chiếu
│  ├─ uploads.mjs           staging upload, TTL 1 giờ
│  └─ confirm.mjs           mã 4 số in ra terminal
├─ routes/                  system · projects · contract · refs · runs · files · app
├─ templates/basic.json     template "Kit cơ bản": 3 sheet / 25 ô, danh sách file cố định
├─ test/                    harness + 8 suite
└─ test-fixtures/           engine giả cho test (không tốn quota)
```

**Không sửa gì ngoài `agent/`.** `studio.html`, `studio-server.mjs`, `gen.sh`, `slice.py`, `styles.json`,
`element-lib.json`, `silhouettes.js`, `skeleton.*` giữ nguyên để bản cũ còn chạy được mà đối chiếu.
