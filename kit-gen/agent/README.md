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
│  ├─ engine/                          # bản pipeline: gen.sh, slice.py, geometry.py, element-lib.json…
│  ├─ app/                             # (tuỳ chọn) bundle giao diện phục vụ tại /app/
│  ├─ cache/thumbs/                    # thumbnail cho ?w=256
│  ├─ uploads/                         # staging của POST /api/uploads (TTL 1 giờ)
│  └─ trash/<yyyymmdd-hhmmss>-<id>/    # project đã xoá, giữ 30 ngày
└─ projects/<projectId>/
   ├─ project.json  contract.json  styles.json (agent sinh cho engine)
   ├─ .history/contract/*.json        # 50 bản gần nhất
   ├─ .history/raw/<job>@<runId>.png  # 3 đời ảnh raw
   ├─ refs/  prompts/  raw/  kits/  logs/
   └─ runs/<runId>/run.json + events.ndjson + logs/<job>.log · runs/latest.json
```

**Thư mục là database** (architecture §1.3-1): copy một thư mục project vào `projects/` là nó hiện trong UI.
`project.json` hỏng → agent trả `{broken:true, error:{file,line}}` để UI hiện thẻ đỏ, **không biến mất im lặng**.

### Adapter sang engine v1 (không sửa một dòng nào của `gen.sh`/`slice.py`)

`gen.sh` dòng 5 `cd "$(dirname "$0")"` và `slice.py` dòng 60 `HERE = dirname(abspath(__file__))`
⇒ engine neo mọi đường dẫn theo **thư mục chứa script**, không theo `cwd`.
Vì vậy agent **copy engine vào chính thư mục project** rồi chạy bản copy đó ⇒ `HERE = <project>`, mọi
`raw/ kits/ prompts/ logs/` nằm trong project (project tự chứa, không còn `kits/manifest.json` dùng chung như v1).

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
| 2b | GET | `/api/usage` | Quota Codex **còn lại**. `?refresh=1` bỏ cache 5 phút. Chỉ số + enum — xem §Usage |
| 3 | GET | `/api/workspaces` | Danh sách workspace agent BIẾT, mỗi cái một `id` đục (`ws_xxxxxxxx`), **không có path** |
| 4 | POST | `/api/workspace/activate` | `{workspaceId}` → đổi workspace đang dùng. `404 WORKSPACE_UNKNOWN` / `423 WORKSPACE_UNWRITABLE` |
| 2c | POST · GET · DELETE | `/api/codex/login` | Đăng nhập Codex bằng **mã thiết bị**. Trả **đúng hai thứ**: link công khai của OpenAI + mã dùng một lần (chỉ khi `status:"waiting"`), kèm enum trạng thái và nhãn `~/…`. stdout của `codex` **không được giữ lại ở bất kỳ đâu** — xem §Đăng nhập |
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
| 17 | POST | `/api/projects/:id/clean` | `{targets:["skeleton","prompts","kits","rawHistory","oldLogs"]}` (`skeleton` chỉ để dọn thư mục còn sót của dự án tạo trước 27/08/2026). **Không bao giờ** chạm `contract.json` và `raw/` đang dùng |
| 18 | GET | `/api/projects/:id/export.zip` | `?include=contract,refs,raw,kits,runs` → `kitgen-<slug>-<yyyymmdd>.zip` |
| ~~19~~ | ~~POST~~ | ~~`/api/uploads`~~ | **ĐÃ BỎ** (07/09/2026) cùng trình nhập zip |
| ~~20~~ | ~~POST~~ | ~~`/api/import/preview`~~ | **ĐÃ BỎ** (07/09/2026). `loadImportSource` vẫn phục vụ `POST /api/projects` với `import.path` |
| 21 | POST | `/api/projects/:id/reveal` | Mở Finder/Explorer. `501 NOT_SUPPORTED` nếu OS không hỗ trợ |

### C. Bản thiết kế (contract)

| # | Method | Path | Việc |
|---|---|---|---|
| 22 | GET | `/api/projects/:id/contract` | `{version, contract}` + `ETag: "<version>"` |
| 23 | PUT | `/api/projects/:id/contract` | **Bắt buộc `If-Match: <version>`**. Thiếu → `412 IF_MATCH_REQUIRED`; lệch → `409 CONTRACT_CONFLICT` kèm `serverVersion` + `diffSummary`; sai luật → `422 CONTRACT_INVALID` kèm từng lỗi. Snapshot bản cũ **trước khi** ghi |
| ~~24-26~~ | | ~~`…/contract/history` · `…/history/:snapshot` · `…/contract/restore`~~ | **ĐÃ BỎ** (07/09/2026) cùng màn Design đời cũ. `writeContract` **vẫn** ghi snapshot xuống đĩa — chỉ không còn route đọc |
| ~~27~~ | ~~POST~~ | ~~`…/contract/validate`~~ | **ĐÃ BỎ**. Luật vẫn chạy trong `PUT` (422) và trong `lib/validate.mjs` |
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
| 32 | POST | `/api/projects/:id/runs` | `{kind:"gen"|"slice", jobs:[…], maxJobs, autoSliceAfterGen}` → `202 {runId, jobs, estimate{seconds,quotaUnits}}`. `409 RUN_CONFLICT` / `422 UNKNOWN_JOB` / `422 CONTRACT_INVALID` / `409 IMAGEGEN_UNAVAILABLE` |
| 33 | GET | `/api/projects/:id/runs?limit=20` | Lịch sử run |
| 34 | GET | `/api/runs/:runId` | Trạng thái đầy đủ (nguồn của fallback poll 2s) |
| 35 | GET | `/api/runs/:runId/stream?from=<seq>` | **NDJSON** chunked, heartbeat 15s. Mất kết nối thì `?from=lastSeq+1` |
| 36 | POST | `/api/runs/:runId/cancel` | Kill **process group**; `{cancelled, killed[], kept, missing[]}`. Ảnh của lượt đã xong **được giữ và cắt nốt** — xem "Dừng & chạy tiếp" |
| ~~37-38~~ | | ~~`…/jobs/:job/log` · `…/jobs/:job/prompt`~~ | **ĐÃ BỎ** (07/09/2026). Hai file vẫn nằm trên đĩa: `<project>/logs/<job>.log` và `<project>/prompts/<job>.txt` |
| 39 | GET | `/api/projects/:id/raw/:job/history` | 3 đời ảnh raw |
| 40 | POST | `/api/projects/:id/raw/:job/restore` | `{historyId}` — khôi phục ảnh đã tốn quota |

### F. Đọc file sản phẩm

| # | Method | Path | Việc |
|---|---|---|---|
| 41 | GET | `/api/projects/:id/files/*` | `?w=128\|256\|512` → thumbnail (cache trong `.kitgen/cache/thumbs`). `ETag: "<mtimeMs>-<size>"`, `Cache-Control: no-cache`. **Chỉ** đọc được `raw/ kits/ refs/ skeleton/ prompts/ export/` (`skeleton/` chỉ-đọc, cho dự án đời cũ) + `project.json contract.json styles.json` — **thu hẹp** so với v1 (v1 phục vụ cả repo, lộ `.git/config`) |
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
{"seq":405,"t":"…","type":"sheet.ready","job":"tet-main","variant":"tet","sheet":"main",
 "artifact":{"path":"runs/r-0007/artifacts/tet-main.png","bytes":3112044},
 "sliced":{"ok":true,"code":0,"durationMs":8100},"thumbs":[256]}
{"seq":406,"t":"…","type":"phase.changed","phase":{"index":2,"total":2,"name":"slice"}}
{"seq":409,"t":"…","type":"run.finished","status":"done-with-errors","ok":7,"failed":1}
{"seq":410,"t":"…","type":"heartbeat"}
```

`seq` tăng đơn điệu; event cũng được ghi xuống `runs/<runId>/events.ndjson` nên
**replay được sau khi agent restart**. `status` của job phán theo **`artifact.writtenAt`**
(mtime của `raw/<job>.png` ≥ t0), **không theo exit code** — giữ đúng triết lý `gen.sh:167-176`.
Run có job lỗi → `done-with-errors`, **không bao giờ** là `done` trơn.

#### `sheet.ready` — CHU TRÌNH TỪNG TẤM (15/08)

`job.done` chỉ nói "tấm này gen xong". `sheet.ready` nói **tấm này đã DÙNG ĐƯỢC**: ảnh đã
có snapshot bất biến trong `runs/<id>/artifacts/`, đã **cắt xong** (`slice.py <variant>
--sheet=<sheet>`), đã có **thumbnail `?w=256`** nằm sẵn trong cache. Nó tới **giữa lượt**,
ngay sau tấm đó — không phải sau khi cả lượt kết thúc.

* Trước bản này, `job.artifact` chỉ được điền ở `settleGenJobs()` (sau khi **cả pha gen**
  đóng) ⇒ ô "Đã xong" của tab *Ảnh gốc* là **ô đen** suốt lượt: web đọc `job.artifact.path`
  và ô đó còn `null`.
* Các lượt cắt hẹp **xếp hàng một làn** trong agent, và `slice.py` còn giữ **ổ khoá hệ điều
  hành** quanh đọc–sửa–ghi `kits/manifest.json` (ghi qua `tmp + os.replace`) ⇒ hai lượt cắt
  không ăn mất phần của nhau.
* Pha **cắt tổng cuối lượt vẫn chạy** như lưới an toàn — nó idempotent, và khối merge của
  `slice.py` giữ nguyên tấm không chạy lượt đó.
* Field mới đều **tuỳ chọn**; client cũ bỏ qua type lạ (§6.5-6) nên không cần đổi gì.
* **Ảnh bìa** cũng được kích ngay khi tấm đầu xong (job phụ, chạy ngoài hàng đợi tạo ảnh,
  vẫn đúng một lượt codex cho cả run). `maxJobs = 1` = người dùng đã nói "đừng chạy nhiều
  cùng lúc" ⇒ giữ đường cũ, bìa vẽ sau khi lượt đóng sổ.

#### Dừng & chạy tiếp — NGỮ NGHĨA CHỐT (16/08)

Câu hỏi của chủ sản phẩm giữa một lượt gen thật: *"pause resume có được không"*. Trả lời
thẳng: **kit-gen không có pause đúng nghĩa và sẽ không có.** Một lượt `codex exec` đang bay
không có nút tạm dừng; treo tiến trình kiểu `SIGSTOP` chỉ làm phía kia rớt phiên rồi vẫn
mất lượt đó — tức là trả tiền cho một tấm không bao giờ về. Thứ có thật là một cặp:

| | Làm gì | KHÔNG làm gì |
|---|---|---|
| **Dừng** (#36) | Ngừng phát tấm mới · `SIGTERM` cả process group của `gen.sh` (+ mọi lượt cắt hẹp đang chạy) · giữ nguyên ảnh đã có · **cắt nốt** tấm đã tốn quota mà chưa kịp cắt · `run.status = cancelled` | Không treo tiến trình · không xoá `raw/` · không gọi thêm một lượt codex nào (kể cả ảnh bìa) |
| **Chạy tiếp** (#32) | Một run **MỚI** với `jobs: […]` = đúng tập tấm còn thiếu · agent thu hẹp `styles.json` về đúng tập ấy | Không phải "resume" cùng một run: run cũ đã đóng sổ, `runId` mới, `seq` mới |

Ba luật hệ quả, đều có ca test khoá trong `agent/test/suite-pause.mjs`:

* **Đã tốn quota thì phải sạch.** Tấm gen xong — kể cả tấm xong ĐÚNG LÚC bấm Dừng — vẫn đi
  hết chu trình: snapshot `runs/<id>/artifacts/`, cắt ra `kits/`, thumbnail, `sheet.ready`
  (`RunHandle.settleCancelledSheets`). Việc dọn này là `slice.py` thuần PIL, **không tốn
  quota**. Ngoại lệ DUY NHẤT: `DELETE /api/projects/:id` gọi `cancel({settle:false})` — thư
  mục sắp sang thùng rác, ghi thêm vào đó là dựng lại "thư mục ma" của C-01.
* **Người dùng dừng thì không có ai "hỏng".** Tấm đang bay lúc bấm Dừng về `queued` trong
  một run `cancelled` (web đọc ra "Đã dừng"), **không** phải `failed`/`NO_ARTIFACT` — nếu
  không thì màn hình hiện thẻ đỏ "Chưa tạo được ảnh" cho đúng việc người dùng vừa yêu cầu.
  Vì thế run bị dừng tay cũng **không** có `failSummary`.
* **Phần thiếu là `status !== "ok"`.** #36 trả luôn `missing[]` để web mời *"Chạy tiếp N tấm
  còn thiếu"* thay vì bắt người dùng tự tick — tick thừa một ô là vẽ lại ảnh đã trả tiền.

**Agent chết giữa lượt** (kill -9, máy ngủ, cài bản mới): `RunHandle` chỉ sống trong RAM của
một tiến trình, nên `run.json` kẹt lại `"running"` — web thấy `isRunLive` = true và quay vòng
vĩnh viễn. Boot chạy `sweepOrphanRuns()` (cạnh `sweepOrphanCovers`): nhặt lại tấm nào đã có
`raw/<job>.png` mới hơn `startedAt` (đánh dấu `recovered: true`, chép sang `artifacts/`), đưa
phần còn lại về `queued`, đóng run thành `cancelled` + `interrupted: true`. **Không bao giờ
động vào `raw/`.** Sau đó đường đi giống hệt ca bấm Dừng: web mời chạy tiếp phần thiếu.

> Mép còn hở, cố ý không vá: tấm được `sweepOrphanRuns` nhặt lại có thể chưa kịp **cắt** (agent
> chết đúng giữa gen xong và cắt xong). Lượt chạy tiếp chỉ cắt phần của chính nó, nên tấm ấy
> nằm thô cho tới khi người dùng bấm **Cắt lại** (`kind:"slice"`, PIL thuần, không tốn quota).
> Vá tự động nghĩa là mỗi lượt phải cắt lại TOÀN BỘ tấm cũ — đắt hơn nhiều lần cái nó cứu.

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

### Đăng nhập Codex (`/api/codex/login`) — vì sao nó KHÔNG phá bốn gạch đầu dòng trên

Bản đầu cố ý không có endpoint nào chạm `codex login`: web chỉ in lệnh cho user tự gõ trong
Terminal. Thứ luật đó bảo vệ chưa bao giờ là cái Terminal, mà là **agent không được đứng giữa
user và thông tin đăng nhập của họ**. `--device-auth` giữ nguyên ranh giới ấy:

- **Không có mật khẩu nào đi qua agent**, không có callback localhost. User đăng nhập trên trang
  của OpenAI, trong trình duyệt của chính họ.
- **Token do chính `codex` ghi vào `auth.json`.** Agent không nhận, không đọc, không chuyển tiếp —
  gạch đầu dòng "không đọc nội dung `auth.json`" ở trên vẫn đúng từng chữ.
- **stdout/stderr của tiến trình con KHÔNG được giữ lại ở bất kỳ đâu.** Không `lines.push`, không
  `agent.log`, không `errorTail`. Mỗi dòng chạy qua đúng hai biểu thức (URL thuộc host cho phép ·
  mã dạng `XXXX-XXXX`) và **chỉ hai thứ khớp được đó mới sống sót**. Đây là lọc theo **danh sách
  trắng**, không phải che theo danh sách đen — che thì phải đoán đúng mọi hình dạng của secret,
  sai một dạng là lộ.
- **Mã dùng một lần chỉ sống trong RAM**, chỉ khi `status:"waiting"`, và bị xoá ngay khi phiên rời
  trạng thái đó. Không xuống đĩa, không vào log, không vào chẩn đoán.

Hồi quy nằm ở `agent/test/suite-codex-login.mjs`; ca đắt nhất đổ nguyên một token vào stdout của
`codex` giả rồi khẳng định không một byte nào của nó có mặt trong bất kỳ response nào.

---

## 5. Doctor môi trường

`GET /api/doctor` (cache 60s, `?refresh=1` để bỏ cache). **Chỉ enum + boolean + version.**

```jsonc
{ "os":"darwin-arm64",
  "node":   {"ok":true,"version":"24.13.0"},
  "python": {"ok":true,"version":"3.9.6","venv":false,
             "deps":{"pillow":true}},   // CHỈ pillow — slice.py không còn tầng tách nền
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

### 5b. Usage — quota Codex còn lại

`GET /api/usage` (cache 5 phút, `?refresh=1` để bỏ cache). **Chỉ số + enum + ISO time.**

```jsonc
{ "ok": true,
  "profile": "img-home",             // hồ sơ đang chọn (giống doctor.imageGen.profile)
  "codexHomeLabel": "~/.codex-img",  // NHÃN rút gọn, không phải path tuyệt đối
  "plan": "plus",                    // enum gói cước do server Codex trả
  "primary":   {"usedPercent":2,"remainingPercent":98,
                "windowMinutes":10080,"resetsAt":"2026-08-20T06:30:28.000Z"},
  "secondary": null,                 // cửa sổ thứ hai (thường 5 giờ), null nếu không có
  "credits": {"hasCredits":false,"unlimited":false,"balance":0},  // ví trả thêm; agent ≤2.1.44 KHÔNG có field này
  "observedAt": "2026-09-03T05:43:05.955Z",   // lượt chạy Codex nào cho ra con số này
  "source": "codex-rollout", "checkedAt": "…" }
```

**Cache mở lúc nào.** Không chỉ login/logout/`?refresh=1` nữa: `run-handle` gọi
`invalidateUsageCache()` mỗi khi **một job đóng sổ** và khi **cả lượt chạy kết thúc** —
mỗi lượt codex vừa ghi một dòng `rate_limits` mới vào rollout, giữ cache lúc đó nghĩa là
thanh hạn mức trên web đứng im tới 5 phút giữa lúc người dùng đang nhìn nó tụt
(bug 07/09/2026). `CACHE_MS` vì thế là **trần tuổi**, không phải nhịp làm mới.

**Bản ghi cuối có thể không có window.** Dòng `rate_limits` cuối của một phiên thường là
`limit_id:"premium"` với `primary`/`secondary` = `null`, chỉ mang `credits`. Agent giữ
window của bản ghi gần nhất **có số**, nhưng lấy `credits` · `plan` · `observedAt` của bản
ghi **mới nhất** — nếu không, mốc "số đọc lúc …" hiện ra là mốc cũ hơn thực tế.
`credits.balance` server trả dạng **chuỗi** (`"12.5"`); agent đổi sang **số** ngay tại chỗ
vì hợp đồng bảo mật chỉ cho số + enum đi ra ngoài.

**Nguồn.** Codex CLI 0.147 **không có** lệnh `usage`/`quota`/`status`; `codex doctor --json`
chỉ nói sức khoẻ cài đặt. Con số mà TUI Codex vẽ ("Weekly usage limit · 98% remaining ·
Resets …") đến từ sự kiện `token_count` server trả mỗi lượt, và Codex **ghi lại** sự kiện
đó vào file rollout của phiên:

```
$CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl
{"type":"event_msg","payload":{"type":"token_count","rate_limits":{
   "limit_id":"codex","plan_type":"plus",
   "primary":{"used_percent":2.0,"window_minutes":10080,"resets_at":1787207428},
   "secondary":null}}}
```

Agent đọc **ngược** vài file rollout mới nhất của `$CODEX_HOME` tương ứng hồ sơ đang chọn,
lấy bản ghi cuối cùng có số. **Không spawn `codex`, không gọi mạng, không tốn quota.** Đổi
lại, số liệu **cũ bằng lượt chạy Codex gần nhất** — `observedAt` nói đúng mốc đó và UI bắt
buộc hiện ra chứ không giả vờ là thời gian thực.

**Hợp đồng bảo mật** (giống doctor, arch §4.4-4): không đọc `auth.json`/`config.toml`;
rollout có chứa nội dung hội thoại nên chỉ những dòng có chuỗi `"rate_limits"` mới được
parse, và chỉ **số + enum** được giữ lại. Không log, không trả nguyên dòng, không path tuyệt đối.

`ok:false` + `reason` (`NO_CODEX_HOME` | `NO_SESSIONS` | `NO_DATA`) = **chưa biết**, khác hẳn
"còn 0%" ⇒ web ẩn hẳn thanh usage, không vẽ 0. `NO_DATA` cũng là ca của người dùng khai
`model_provider` riêng (proxy tương thích OpenAI): server đó không trả `rate_limits`.

---

## 6. Test

```bash
node agent/test-agent.mjs
```

Workspace tạm trong `/tmp` (`mkdtemp`), **không dùng dữ liệu thật**, dọn sạch khi xong.
Phủ: health/doctor/workspaces · CRUD trọn vòng · thùng rác + phục hồi + mã 4 số · `../` và `%2e%2e`
và symlink ra ngoài · CORS origin lạ 403 · Host sai 421 · contract 409 khi version lệch · body quá lớn 413
· rate limit 429 · multipart + magic bytes · run gen→auto-slice **spawn engine thật** · stream NDJSON
+ reconnect · dừng run · **dừng giữa chừng rồi chạy tiếp phần thiếu** (`suite-pause`) · nhập
styles.json cũ không mất dữ liệu · `/app/` same-origin · redact.

Ca gen dùng **engine giả** ở `agent/test-fixtures/engine-fake/` — cùng giao diện với `gen.sh` thật
(neo theo thư mục script, in `OK`/`FAIL`, ghi `raw/<job>.png`) nhưng **không gọi codex ⇒ không tốn quota**.
Ba bản: `engine-fake` (xong tức thì, có 1 job đỏ cố ý), `engine-slow` (xong 1 job rồi treo),
`engine-stepped` (mọi job đều xanh, cách nhau `KITGEN_FAKE_STEP` giây — để bấm Dừng ở GIỮA lượt).

**Giới hạn trung thực của test:** môi trường phát triển này **chặn bind TCP**
(`listen EPERM` cho cả `127.0.0.1` và unix socket — đã kiểm bằng lệnh thật). Test vì thế lái đúng
`http.Server` **thật** của agent qua một cặp duplex trong bộ nhớ: request đi qua nguyên HTTP parser của Node
và **toàn bộ** pipeline (Host → Origin → header ép preflight → rate limit → router → fs → spawn tiến trình).
Chỉ **tầng vận chuyển TCP** là chưa kiểm được; phần bind được kiểm bằng ca đọc mã
("mọi `listen()` khai host loopback tường minh, không `0.0.0.0`"). Trên máy có quyền mở cổng,
hãy chạy thêm `node agent/server.mjs` và `curl /health` như §1.

---

## 7. Cấu trúc mã (mỗi file < ~400 dòng — bài học `studio.html` 743 dòng, nay đã xoá)

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
│  ├─ contract.mjs          version + If-Match + snapshot 50 bản (snapshot: chỉ ghi, không còn route đọc)
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
├─ routes/                  system · projects · contract · refs · runs · files · library · cover · app
├─ templates/basic.json     template "Kit cơ bản": 3 sheet / 25 ô, danh sách file cố định
├─ test/                    harness + suite-*.mjs
└─ test-fixtures/           engine giả cho test (không tốn quota)
```

**Không sửa gì ngoài `agent/`.** `gen.sh`, `slice.py`, `styles.json`, `element-lib.json`,
`geometry.py` giữ nguyên. (Bộ khung xương xoá 27/08/2026; `studio.html` / `studio-server.mjs`
/ `demo.html` / `figma.html` / `preview.html` / `web/` xoá 07/09/2026.)
