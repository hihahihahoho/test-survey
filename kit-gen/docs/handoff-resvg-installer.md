# Handoff — bỏ Playwright khỏi đường SHIP, thay bằng `@resvg/resvg-wasm`

**Ngày:** 2026-08-14 · **Nguồn:** BACKLOG #15 (spike 14/08) · **Người nhận:** chủ SP, áp lúc gom.

Ba file dưới đây do agent khác đang giữ nên **KHÔNG được sửa trong lượt này**:

- `install.sh`
- `scripts/install.ps1`
- `agent/lib/doctor.mjs`

Tài liệu này ghi ĐÚNG những gì cần đổi ở ba file đó, kèm số dòng đã đọc tại thời điểm viết.
Phần còn lại của việc đã xong và đã kiểm chứng — xem mục 0.

---

## 0. Đã xong trong repo (KHÔNG làm lại)

| File | Thay đổi |
| --- | --- |
| `skeleton-svg.js` | **MỚI.** Bộ dựng SVG — nguồn sự thật duy nhất về hình học khung xương. |
| `render-skeleton.mjs` | Viết lại: Node + `@resvg/resvg-wasm`, không trình duyệt. **Giữ nguyên tên và vẫn ghi `skeleton/<id>.png`.** |
| `skeleton.html` | Thành khung XEM: nhúng thẳng chuỗi SVG của bộ dựng, hết luật CSS layout. |
| `skeleton.py` | **ĐÃ XOÁ** (lệch 17,6% khối lượng mực, vẽ sai hẳn dáng pose). |
| `gen.sh:28` | Bỏ `|| python3 skeleton.py`; render hỏng thì `exit 1` kèm hướng dẫn cài. |
| `agent/lib/engine.mjs` | `ENGINE_FILES` bỏ `skeleton.py`, thêm `skeleton-svg.js`; **`buildCommand("skeleton")` chuyển từ `python3 skeleton.py` sang `render-skeleton.mjs`** (trước đây nút "vẽ lại khung xương" của app dùng bản PIL SAI, khác hẳn khung xương gen.sh thật sự dùng). |
| `setup.sh` | Bỏ kiểm playwright; cài `@resvg/resvg-wasm` vào `$KITGEN_HOME/tools`; nhắc xoá `playwright-browsers` cũ. |
| `scripts/build-runtime.sh` | Danh sách engine bỏ `skeleton.py`, thêm `skeleton-svg.js`; thiếu file thì **fail build** thay vì bỏ qua âm thầm. |
| `tests/test_skeleton_svg.py` | **MỚI.** 20 ca: hình học bộ dựng (+1px), chống trôi viewer, render thật + đo mực/bbox. |
| `web/js/screens/__tests__/validate.test.mjs` | Ca đọc `skeleton.py` đổi sang đọc `skeleton-svg.js`. |

Playwright **vẫn ở lại `webapp/devDependencies`** cho e2e — chỉ đường SHIP đổi.

---

## 1. `install.sh` — BẮT BUỘC, chặn phát hành

> ⚠️ **Cho tới khi mục này được áp, một bản build mới cài lên máy sạch sẽ KHÔNG gen được ảnh:**
> `render-skeleton.mjs` không tìm thấy `@resvg/resvg-wasm` ⇒ `gen.sh` dừng ở bước khung xương
> (cố ý dừng to, không âm thầm dùng ảnh sai). Đây là mục có thứ tự ưu tiên cao nhất trong file này.

### 1.1 Thay khối cài Playwright (dòng **354–372**)

Xoá nguyên khối từ `# Playwright renders the HTML/SVG skeleton…` tới `check_ok "Playwright và Chromium đã sẵn sàng"`, thay bằng:

```sh
# Trình render khung xương: @resvg/resvg-wasm (2,4 MB, thuần JS + .wasm).
# Thay Playwright + Chromium (790,9 MB) — xem BACKLOG #15. BẮT BUỘC, không có
# đường lùi: gen.sh dừng hẳn nếu thiếu (bản PIL cũ lệch 17,6% mực, đã xoá).
if ! NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('@resvg/resvg-wasm')" >/dev/null 2>&1; then
  echo "Installing skeleton renderer (@resvg/resvg-wasm)..."
  "$KITGEN_HOME/tools/node/bin/npm" install --silent --prefix "$KITGEN_HOME/tools" @resvg/resvg-wasm 2>/dev/null || \
    "$(dirname "$NODE")/npm" install --silent --prefix "$KITGEN_HOME/tools" @resvg/resvg-wasm
fi
progress "4/7" "Health check trình dựng ảnh"
NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('@resvg/resvg-wasm')" >/dev/null 2>&1 \
  || { echo "Skeleton renderer health check failed (@resvg/resvg-wasm)." >&2; exit 1; }
check_ok "Trình render khung xương đã sẵn sàng (@resvg/resvg-wasm)"

# Dọn rác đời Playwright ở LƯỢT UPDATE: 790,9 MB không còn ai dùng.
rm -rf "$KITGEN_HOME/tools/playwright-browsers" \
       "$KITGEN_HOME/tools/node_modules/playwright" \
       "$KITGEN_HOME/tools/node_modules/playwright-core" 2>/dev/null || true
```

Ghi chú giữ nguyên hai thứ đang đúng: `progress "4/7"` phải còn (bước 4/7 vẫn tồn tại) và
health check phải `exit 1` chứ không `warn` — thiếu renderer là **không gen được**, không phải suy giảm.

Fallback npm ưu tiên `$KITGEN_HOME/tools/node/bin/npm` rồi mới tới npm cạnh `$NODE`: đúng khuôn mà
khối cài Codex ở dòng 343–344 đang dùng.

### 1.2 `config.env` (dòng **412**)

Xoá dòng:

```sh
PLAYWRIGHT_BROWSERS_PATH='$KITGEN_HOME/tools/playwright-browsers'
```

`NODE_PATH` ở dòng 411 **phải giữ** — `render-skeleton.mjs` dò `@resvg/resvg-wasm` theo thứ tự
`KITGEN_RESVG_DIR` → `$KITGEN_HOME/tools` → `~/.kitgen/tools` → node_modules quanh chính nó (kèm `NODE_PATH`).

### 1.3 File đi kèm

Nếu ở đâu đó trong `install.sh` có liệt kê tên file engine (danh sách whitelist, checksum thủ công…),
bỏ `skeleton.py` và thêm `skeleton-svg.js`. *Đã kiểm tại thời điểm viết: `install.sh` chỉ làm
`cp -R "$DEST/engine/." …` nên KHÔNG có danh sách nào cần sửa — chỉ xác nhận lại lúc gom.*

### 1.4 Kéo theo — `runtime/bin/kitgen`

Dòng 45 vẫn xuất `PLAYWRIGHT_BROWSERS_PATH` cho tiến trình agent. Vô hại (biến trỏ vào thư mục đã xoá,
không ai đọc) nên **có thể để nguyên**; muốn sạch thì xoá đúng dòng đó. Không đụng gì khác trong file này.

---

## 2. `scripts/install.ps1`

### 2.1 Thay khối Playwright (dòng **390–410**)

Xoá từ `$pwCli = Join-Path $toolsPrefix 'node_modules\.bin\playwright.cmd'` tới hết khối
`if (Test-Path -LiteralPath $pwCli) { … }`, thay bằng:

```powershell
$resvgProbe = Join-Path $toolsPrefix 'node_modules\@resvg\resvg-wasm\index_bg.wasm'
if (-not (Test-Path -LiteralPath $resvgProbe)) {
  Write-Host '  npm install @resvg/resvg-wasm ...'
  & $npmCmd install --silent --prefix $toolsPrefix '@resvg/resvg-wasm'
}
if (Test-Path -LiteralPath $resvgProbe) { Write-Ok 'Trinh render khung xuong (@resvg/resvg-wasm)' }
else { Write-Block 'Trinh render khung xuong' 'Chay: npm install --prefix <tools> @resvg/resvg-wasm. Thieu goi nay thi KHONG gen duoc anh.' }

# Don rac doi Playwright (790,9 MB) o luot update.
foreach ($p in @('playwright-browsers', 'node_modules\playwright', 'node_modules\playwright-core')) {
  Remove-Item -LiteralPath (Join-Path $toolsPrefix $p) -Recurse -Force -ErrorAction SilentlyContinue
}
```

`Write-Block` chứ không `Write-Warn`: cùng lý lẽ với §1.1 — hết đường lùi thì thiếu gói là chặn, không phải cảnh báo.

### 2.2 `config.cmd` (dòng **442** và chỗ ghi biến bên dưới)

Bỏ `$browsers = Join-Path $toolsPrefix 'playwright-browsers'` và dòng `set "PLAYWRIGHT_BROWSERS_PATH=…"`
trong here-string `$configCmd`. Giữ `KITGEN_NODE`, `NODE_PATH`.

### 2.3 `agent/lib/platform.mjs` — KHÔNG cần đổi

Đã kiểm: `bashEnvPath()` (dòng ~84) thêm `<KITGEN_HOME>\tools\node` vào PATH kèm chú thích
"gen.sh gọi `node render-skeleton.mjs`" — vẫn đúng nguyên văn sau thay đổi này. Không đụng.

---

## 3. `agent/lib/doctor.mjs`

### 3.1 Nhánh LITE (dòng **129**)

```js
playwright: { ok: false, fallback: "skeleton.py (PIL)" },
```
→
```js
renderer: { ok: false, engine: "@resvg/resvg-wasm" },
```

### 3.2 Probe thật (dòng **146–149**)

```js
(async () => {
  const r = await run("node", ["-e", "try{require.resolve('playwright');console.log('1')}catch{console.log('0')}"])
  return { ok: r.stdout.trim() === "1", fallback: "skeleton.py (PIL)" }
})(),
```
→
```js
(async () => {
  const r = await run("node", ["-e", "try{require.resolve('@resvg/resvg-wasm');console.log('1')}catch{console.log('0')}"])
  // KHÔNG còn khoá `fallback`: cố ý. Thiếu gói này là KHÔNG gen được, không phải
  // "chạy bản dự phòng" — báo sai chỗ này chính là lỗi mà BACKLOG #15 gỡ ra.
  return { ok: r.stdout.trim() === "1", engine: "@resvg/resvg-wasm" }
})(),
```

Kèm đổi tên biến `pw` → `renderer` ở dòng **142** (destructure) và **158** (`playwright: pw` → `renderer`).

> Lưu ý probe chạy `node -e` **không kèm `NODE_PATH`**, nên nó chỉ đúng khi tiến trình agent đã có
> `NODE_PATH` trong env (bin/kitgen đặt sẵn). Đó là hành vi y hệt probe playwright cũ — không phải hồi quy mới,
> nhưng nếu muốn chắc thì truyền `{ env: { ...process.env, NODE_PATH: join(KITGEN_HOME,"tools","node_modules") } }`.

### 3.3 Nơi tiêu thụ khoá `doctor.playwright` — phải sửa CÙNG LƯỢT, nếu không UI báo sai vĩnh viễn

| File | Dòng | Việc |
| --- | --- | --- |
| `webapp/src/lib/types/api.ts` | 105 | Thêm `renderer: z.looseObject({ok, engine}).optional()`. Bỏ `playwright` được (`looseObject` nên không vỡ khi agent cũ vẫn gửi). |
| `webapp/src/features/setup/lib/doctor-view.ts` | 148–158 | Đổi hàng: `key:"renderer"`, `label:"Trình render khung xương"`, `consequence:"Thiếu — KHÔNG gen được ảnh (không còn bản dự phòng)."`, `cmd: INSTALL_CMD.resvg`. **Bỏ hẳn chữ "skeleton.py"** ở dòng 155. |
| `webapp/src/features/setup/lib/commands.ts` | 41 | `playwright: "npm i -g playwright…"` → `resvg: "npm install --prefix \"$HOME/.kitgen/tools\" @resvg/resvg-wasm"`. |
| `agent/test/harness.mjs` | 117 | `fakeDoctor` đổi khoá theo §3.1. |
| `agent/README.md` | 245 | Mẫu payload `/api/doctor` đổi theo. |
| `web/js/screens/setup/step-imagegen.js` | 131 | Bản `web/` cũ — đổi hoặc bỏ hàng Playwright. |
| `web/js/screens/__tests__/mount.test.mjs` | 37 | doctor giả. |
| `web/js/screens/__tests__/mock-agent.mjs` | 93 | doctor giả. |

`webapp/` nằm ngoài phạm vi lượt này nên **chưa đụng** — nhưng ba mục webapp ở trên là bắt buộc,
không thì màn Cài đặt vẫn khoe "Playwright: chưa cài — dùng bản dự phòng skeleton.py", tức nói về
một file không còn tồn tại và một đường lùi không còn tồn tại.

---

## 4. Tài liệu cần sửa kèm

- `docs/DEVELOPMENT-AND-RELEASE-RUNBOOK.md:247` — `npx playwright install chromium` không còn thuộc quy trình engine.
- `docs/WINDOWS-PORT.md:261, 346, 354` — bỏ bước `playwright install`, đổi ô checklist "OK Playwright + chromium headless shell" thành "OK @resvg/resvg-wasm", và mục Doctor `playwright: ok:true` → `renderer: ok:true`.
- `agent/README.md:71, 386` — danh sách file engine còn ghi `skeleton.py`.

---

## 5. Số để dán vào ghi chú phát hành

Đo trên máy đang chạy (`~/.kitgen/tools`), 14/08:

| | Trước | Sau |
| --- | ---: | ---: |
| `playwright-browsers` | 772,7 MiB | 0 |
| `node_modules/playwright` + `playwright-core` | 18,1 MiB | 0 |
| `node_modules/fsevents` | 0,16 MiB | 0 |
| `node_modules/@resvg/resvg-wasm` | 0 | **2,4 MiB** |
| **Tổng phần đổi** | **790,9 MiB** | **2,4 MiB** — bớt **788,5 MiB (99,7%)** |
| File `.node` trong `tools` | **1** (`fsevents/fsevents.node`) | **0** |

`fsevents.node` là **file `.node` DUY NHẤT** trong `~/.kitgen/tools`, và nó vào máy như một
optional dependency của Playwright. Bỏ Playwright là hết sạch binary biên dịch sẵn trong bộ cài —
đúng mục tiêu "hết binary cho McAfee cắn". Còn lại chỉ là JS + một file `.wasm`, chung một
artefact cho mọi nền tảng (bớt hẳn một dependency riêng cho bản Windows).

Chính xác về hình ảnh (32 sheet / 229 ô / 50,3 triệu pixel, đo lại bằng chính đường SHIP mới,
so với ảnh Playwright):

- tỉ lệ khối lượng mực **1,000091** (+0,009%) — trong ngưỡng ±0,05%
- dịch nguyên pixel tốt nhất **(0,0) trên 32/32 sheet**
- khác bit 1,3016%, nới ≤1px + ngưỡng 16/255 còn **0,2384%** — toàn bộ là khử răng cưa (Skia vs tiny-skia)
- 32/32 ảnh **giống hệt từng byte** với bản `@resvg/resvg-js` native đã thẩm định ở spike
- 32 sheet trong **1,28 s** (Playwright 1,26–1,29 s cho 13 sheet)
