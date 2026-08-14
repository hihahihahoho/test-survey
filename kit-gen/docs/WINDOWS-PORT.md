# KitGen trên Windows — thiết kế port, giới hạn, và checklist kiểm thử

> **TRẠNG THÁI: EXPERIMENTAL — CHƯA TỪNG CHẠY TRÊN MỘT MÁY WINDOWS NÀO.**
>
> Toàn bộ mã trong đợt này (`scripts/install.ps1`, `agent/lib/platform.mjs`, các
> nhánh `process.platform === "win32"`) được viết trên macOS, dựa hoàn toàn vào tài
> liệu chính thức. Không có một dòng nào được chạy thử trên Windows. Vì vậy tài liệu
> này có **§7 — checklist kiểm thử** để chủ sản phẩm cầm sang máy Win chạy và báo lỗi
> thật. Đừng phát cho người dùng cuối trước khi §7 xanh hết.
>
> Ngày viết: 2026-08-14 · Nhánh: `feat/kitgen-local-runtime`

---

## 1. Hiện trạng đang port (nguồn sự thật đã đọc từ mã, không suy đoán)

| Thành phần | Bản macOS/Linux hiện tại |
|---|---|
| Installer | `install.sh` (bash) — tải runtime `.tar.gz` theo `release.json`, đối chiếu sha256, giải nén vào `~/.kitgen/releases/<version>`, symlink `~/.kitgen/current` |
| Runtime riêng | Node 20.19.5 tải từ `nodejs.org/dist` vào `~/.kitgen/tools/node`, `@resvg/resvg-wasm` + Codex CLI qua `npm --prefix ~/.kitgen/tools` |
| Workspace | `~/KitGen` — `projects/`, `.kitgen/engine`, `.kitgen/config.json`, `.venv` (pillow numpy scipy pymatting) |
| Engine | `gen.sh` + `cover.sh` (bash, gọi `codex exec`), `slice.py` / `validate_output_geometry.py` (python3) + `render-skeleton.mjs` / `skeleton-svg.js` (node) |
| Agent | Node stdlib thuần, `agent/server.mjs`, bind 127.0.0.1 + [::1] cổng 8765 |
| Dịch vụ nền | launchd (`com.kitgen.agent.plist`) trên macOS, systemd user unit trên Linux |
| Lệnh | `~/.kitgen/bin/kitgen {start\|stop\|status\|doctor\|logs\|open\|update}` (bash) |

Điểm mấu chốt: **engine là bash + python3**, và agent là nơi duy nhất `spawn` tiến
trình. Cho nên bài toán port Windows = "làm sao có bash và python3, và làm sao agent
gọi đúng chúng" — chứ không phải viết lại engine.

---

## 2. Chiến lược chạy bash trên Windows

### 2.1 Khuyến nghị chính: **Git Bash (Git for Windows)** — ĐÃ CHỌN

**Vì sao:**

1. **Nó chạy nguyên bản `gen.sh` / `cover.sh`.** Không phải dịch sang PowerShell, không
   phải nuôi hai bản engine. Hai file đó là nơi chứa hợp đồng crop-safe v15, luật
   "phán theo sản phẩm", mẹo vớt ảnh `generated_images` — viết lại là chắc chắn lệch.
2. **Nó là phần mềm dev gần như chắc chắn đã có sẵn.** Người dùng KitGen là designer/dev
   trong đội; Git for Windows là thứ được cài đầu tiên trên máy dev Windows.
3. **Không cần quyền admin để dùng** (cài thì cần một lần, và có bản portable).
4. **Nó mang theo cả coreutils** (`grep`, `sed`, `date`, `du`, `cp`, `wc`, `tail`,
   `dirname`) trong `<Git>\usr\bin` — đúng những lệnh mà `gen.sh` dùng.
5. **Tiến trình con vẫn là tiến trình Windows thật**: `codex.exe` chạy dưới Git-Bash vẫn
   thấy `C:\Users\...`, vẫn dùng đúng `%USERPROFILE%\.codex`, vẫn ghi ảnh ra ổ đĩa thật.
   Đây là điểm WSL **không** làm được rẻ (xem 2.2).

**Ba cái bẫy của Git-Bash đã được xử lý trong mã (`agent/lib/platform.mjs`):**

| Bẫy | Hậu quả nếu bỏ qua | Cách đã xử lý |
|---|---|---|
| `bash.exe` nằm ở `<Git>\bin` nhưng coreutils ở `<Git>\usr\bin`, và **không** đường nào trong `PATH` của Windows | `gen.sh` chết ngay dòng `date +%s`, `grep`, `du` | `bashEnvPath()` dựng PATH riêng cho tiến trình bash: `<KITGEN_HOME>\bin`, `<KITGEN_HOME>\tools\node`, `<KITGEN_HOME>\tools\node_modules\.bin`, rồi `<Git>\usr\bin`, `<Git>\mingw64\bin`, `<Git>\bin` |
| `gen.sh` dòng 5 là `cd "$(dirname "$0")"`. Truyền `$0 = C:\...\gen.sh` thì `dirname` trả `.` (chuỗi không có dấu `/`) | engine neo sai thư mục ⇒ đọc nhầm `styles.json`, ghi nhầm `raw/` | `toBashPath()` đổi `C:\a\b` → `/c/a/b` trước khi truyền cho `bash.exe` |
| Windows **không có lệnh tên `python3`** (python.org cài `python.exe` + `py.exe`) | `gen.sh` dòng 19 `python3 skeleton.py` và cả khối `python3 - <<'PY'` chết ⇒ không có prompt nào được dựng | installer sinh **shim `%LOCALAPPDATA%\KitGen\bin\python3`** — một shell script **không đuôi file** mà bash chạy được, `exec` thẳng `python.exe` của venv. Agent thì dùng `KITGEN_PYTHON` (đường dẫn tuyệt đối), không dùng shim |

### 2.2 Đường dự phòng: **WSL2** — KHÔNG chọn làm mặc định, giữ làm phương án B

Ưu: engine chạy trong Linux thật, `stat -c`, `python3`, mọi thứ POSIX đều đúng.

Nhược — đủ nặng để không làm mặc định:

1. **Codex CLI phải cài lại bên trong WSL và phải đăng nhập lại.** `~/.codex/auth.json`
   của Windows không dùng chung được. Người dùng mất phiên đăng nhập, phải làm hai lần.
2. **Hiệu năng I/O qua ranh giới `/mnt/c` rất tệ** (9P protocol). Workspace 200–500 MB
   ảnh PNG đi qua `/mnt/c` mỗi lượt gen là chậm thấy rõ. Để workspace **trong** WSL thì
   người dùng Windows không mở nó bằng Explorer/Figma một cách tự nhiên nữa.
3. **`reveal` (mở thư mục dự án) gãy** — không có Explorer trong WSL.
4. **Cài WSL cần quyền admin và một lần khởi động lại máy.** Git for Windows thì không.
5. **Agent nên chạy ở đâu?** Nếu agent chạy trong WSL thì `localhost:8765` vẫn thấy được
   từ Windows (WSL2 có localhost forwarding), nhưng đường dẫn workspace mà UI hiển thị
   sẽ là đường Linux — lệch hẳn với thứ người dùng thấy trong Explorer.

**Khi nào lùi về WSL:** nếu §7 cho thấy Git-Bash sập ở khâu `codex exec` (ví dụ Codex CLI
bản Windows không có `image_gen`/`imagegen`), thì WSL là đường duy nhất còn lại. Lúc đó
kịch bản là: cài KitGen **hoàn toàn bên trong WSL** bằng `install.sh` hiện có (không sửa
một dòng), workspace đặt tại `~/KitGen` trong WSL, và người dùng mở
`http://127.0.0.1:8765/app/` bằng trình duyệt Windows. Tức là **không cần code mới cho
đường WSL** — đó chính là lý do giữ nó làm dự phòng.

### 2.3 Đã loại: MSYS2 / Cygwin độc lập, busybox-w32, dịch engine sang PowerShell

- MSYS2/Cygwin: đúng về kỹ thuật nhưng là một lần cài đặt nữa mà dev Windows không có sẵn.
- busybox-w32: thiếu quá nhiều (`bash` mảng, `wait`, process substitution `< <(...)`).
- Viết lại `gen.sh`/`cover.sh` bằng PowerShell: đẻ ra hai bản engine phải giữ đồng bộ với
  nhau. Mọi bài học đau đớn trong `gen.sh` (an toàn crop, vớt ảnh, phán theo sản phẩm) sẽ
  phải chép tay lần hai. **Đây là con đường chắc chắn hỏng**, đã loại từ đầu.

---

## 3. Chỗ nào trong agent giả định Unix — bảng file → thay đổi → rủi ro

Nguyên tắc bất di bất dịch của đợt này: **mọi nhánh mới đều gate `process.platform === "win32"`.**
Trên darwin/linux mã chạy đúng từng ký tự như trước (chứng minh: `node agent/test-agent.mjs`
127/127 PASS, xem §8).

### 3.1 Đã sửa

| File | Giả định Unix | Thay đổi | Rủi ro còn lại |
|---|---|---|---|
| **`agent/lib/platform.mjs`** *(mới)* | — | Gom toàn bộ lớp đệm Windows: `toBashPath`, `findBash`, `bashCommand`, `pythonCommand`, `killTree`, `winShellOpts`, `winSpawnOpts`, `defaultKitgenHome`. Trên non-win mọi hàm trả về đúng giá trị hard-code cũ | Nếu người dùng cài Git ở đường dẫn lạ, `findBash()` trả `null` → spawn `bash` → `ENOENT` → agent báo `spawn failed` trong log run (không sập). Đặt `KITGEN_BASH` là xong |
| **`agent/server.mjs`** | `import.meta.url === \`file://${process.argv[1]}\`` | **LỖI CHẾT NGƯỜI trên Windows**: ở đó `import.meta.url` là `file:///C:/…` còn `argv[1]` là `C:\…` ⇒ **không bao giờ khớp** ⇒ `main()` không chạy ⇒ agent im lặng không lắng nghe cổng nào, không một dòng lỗi. Thêm nhánh `win32` dùng `pathToFileURL(argv[1]).href` | Không (nhánh cũ giữ nguyên cho POSIX) |
| **`agent/server.mjs`** | `revealInFinder`: chỉ `open`/`xdg-open`, `win32` → `null` ⇒ luôn 400 `NOT_SUPPORTED` | Thêm nhánh `explorer.exe`. **explorer.exe trả exit code 1 kể cả khi mở thành công** — nên phán theo sự kiện `spawn`/`error`, không theo mã thoát | Thư mục có ký tự lạ có thể mở nhầm; Explorer không báo lại được |
| **`agent/lib/engine.mjs`** | `cmd: "bash"`, `cmd: "python3"`, `chmod 0o755` | `bashCommand()` / `pythonCommand()`; bỏ `chmod` trên win32 (NTFS không có bit thực thi, `fs.chmod` ở đó chỉ lật cờ read-only) | `gen.sh` copy vào project sẽ không có bit `x` — không sao vì luôn chạy qua `bash <script>`, không chạy trực tiếp |
| **`agent/lib/run-handle.mjs`** | `spawn(..., { detached: true })` + `process.kill(-pid, SIG)` (process group POSIX) | `killTree()`: win32 → `taskkill /PID <pid> /T` (`/F` cho SIGKILL). **Bắt buộc `/T`**: `codex` là tiến trình **cháu** của `bash`, giết mỗi bash thì codex vẫn đốt quota sau khi user đã bấm Dừng | `taskkill` không có sẵn → rơi về `child.kill()` (chỉ giết bash). Nút Dừng "có vẻ" xong nhưng codex còn chạy. **Cần kiểm ở §7 bước 9** |
| **`agent/lib/run-handle.mjs`** | `env: { …, PATH: process.env.PATH }` ghi đè PATH sau cùng | `PATH: env.PATH ?? process.env.PATH` — chỉ win32 mới có `env.PATH` (do `bashCommand` bơm vào) | Không (darwin không bao giờ có `env.PATH`) |
| **`agent/lib/run-handle.mjs`** | `spawn("python3", …)` cho `validate_output_geometry.py` | `pythonCommand()` | Không |
| **`agent/lib/cover.mjs`** | `spawn("bash", [script, pdir])` | `bashCommand([script, pdir])` — cả script lẫn `pdir` đều đổi sang `/c/…` vì `cover.sh` làm `cd "$1"` | Không |
| **`agent/lib/thumbs.mjs`** | `execFile("python3", …)` | `pythonCommand()` | Không |
| **`agent/lib/doctor.mjs`** | `run("python3", …)`; `execFile(CODEX, …)` với `CODEX` có thể là `codex.cmd` | `runPy()`; `winShellOpts()` bật `shell: true` **chỉ khi** lệnh kết thúc `.cmd`/`.bat` — Node ≥18.20 **từ chối** spawn `.cmd` không shell (vá CVE-2024-27980) | `shell: true` + đối số có dấu ngoặc kép sẽ bị cmd.exe diễn giải lại. Ở đây đối số là hằng của agent (`--version`, `debug prompt-input`), không có gì từ client — chấp nhận được |
| **`agent/lib/update.mjs`** | `spawn("sh", ["-c", "sleep 1; …"])`; `~/.kitgen` mặc định; nhãn `UPDATE_COMMAND` | win32 → `cmd.exe /c timeout /t 1 & "<kitgen.cmd>" update`; `defaultKitgenHome()`; nhãn `%LOCALAPPDATA%\KitGen\bin\kitgen.cmd update` | Không (test `suite-system` vẫn kiểm nhãn cũ trên darwin và vẫn xanh) |

### 3.2 Cố ý KHÔNG sửa (đã cân nhắc)

| Chỗ | Vì sao để yên |
|---|---|
| `agent/lib/paths.mjs` — `isInside()` so prefix **phân biệt hoa thường** | NTFS không phân biệt hoa thường. Về lý thuyết một symlink/junction có khác biệt hoa-thường có thể qua mặt. Nhưng: (a) `safeJoin` đã chặn `..` theo từng đoạn và chặn path tuyệt đối trước đó; (b) `realpathSync` của Node trên Windows trả về đúng vỏ hoa-thường thật của file. Sửa hàm này là chạm vào lớp bảo mật cốt lõi mà **không kiểm thử được trên Windows** ⇒ rủi ro sửa > rủi ro để. **Ghi vào backlog, cần audit riêng khi có máy Win.** |
| Tên project trùng **tên thiết bị DOS** (`con`, `prn`, `aux`, `nul`, `com1`…) | `RE_PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,47}$/` cho phép `con`. Trên Windows `mkdir projects\con` sẽ lỗi. Xác suất rất thấp (id do slug tên dự án tiếng Việt sinh ra), và chặn thêm là đổi luật validate dùng chung với webapp. **Ghi backlog.** |
| `agent/lib/workspace.mjs` — `workspaceLabel()` cắt theo `startsWith("/")` | Trên Windows nhãn sẽ là `C:\Users\…` rút gọn bởi `shortenPath()` — mà `shortenPath` chỉ biết `/Users`, `/home`, `/tmp`. Nghĩa là **nhãn workspace trên Windows có thể lộ đường dẫn tuyệt đối ra UI**. Không phải secret (UI chạy local, same-origin), nhưng lệch hợp đồng §4.3-5. **Ghi backlog — cần một nhánh `%USERPROFILE%` trong `shortenPath()`.** |
| `agent/lib/doctor.mjs` — dò `@resvg/resvg-wasm` bằng `run("node", …)` | `node` phải có trong PATH. `kitgen.cmd` đã bơm `%KITGEN_HOME%\tools\node` vào PATH nên đúng trong đường chạy chuẩn; chỉ sai nếu ai đó chạy `server.mjs` tay. Đổi sang `process.execPath` là hợp lý nhưng động vào đường chạy darwin ⇒ để lại |
| `webapp/` | Không đụng một dòng. Kiểm lại: webapp không bao giờ nhận/ghép đường dẫn hệ thống (UX-SPEC X1 — web chỉ gửi `workspaceId` đục). Đường dẫn tương đối trong API (`raw/x.png`, `runs/…`) luôn dùng `/`, và `safeJoin` chấp nhận cả hai loại gạch |

---

## 4. ENGINE — thay đổi CẦN THIẾT nhưng **CHƯA ÁP DỤNG**

`gen.sh`, `cover.sh`, `slice.py` đang có agent khác sửa. Theo yêu cầu, các thay đổi dưới
đây **được ghi lại ở đây thay vì sửa file**. Cả hai mục 4.1 và 4.2 là **chặn cứng**:
không có chúng thì lượt gen trên Windows sẽ chạy nhưng **không ra ảnh**.

### 4.1 🔴 CHẶN CỨNG — `gen.sh` dùng `stat -f %m` (cú pháp BSD/macOS)

`gen.sh` dòng **450** và **462** *(số dòng tại 2026-08-14; file đang được sửa song song —
tìm theo chuỗi `stat -f %m` chứ đừng tin số dòng)*:

```bash
if [[ $(stat -f %m "raw/${job}.png" 2>/dev/null || echo 0) -lt "$t0" ]]; then
local mt=$(stat -f %m "raw/${job}.png" 2>/dev/null || echo 0)
```

`stat` trong Git-Bash là **GNU coreutils**, ở đó `-f` nghĩa là `--file-system` chứ không
phải "format". Lệnh sẽ lỗi → `echo 0` → `mt = 0` → **mọi job đều bị in ra `FAIL`** dù ảnh
đã lưu thành công, và nhánh "vớt ảnh" chạy oan mỗi lượt.

`cover.sh` dòng 77 và 86 **đã có** fallback đúng — hãy chép y nguyên sang `gen.sh`:

```bash
# THAY cả hai chỗ `stat -f %m` trong gen.sh bằng:
stat -f %m "raw/${job}.png" 2>/dev/null || stat -c %Y "raw/${job}.png" 2>/dev/null || echo 0
```

**Mức độ nghiêm trọng thực tế:** agent phán trạng thái cuối theo **mtime của file PNG**
(`settleGenJobs()`), không theo dòng `FAIL` — nên kết quả cuối cùng vẫn đúng. Nhưng
người dùng sẽ thấy toàn bộ job nhảy đỏ giữa chừng rồi mới xanh lại, và log đầy `FAIL`.
Không chấp nhận được cho bản phát hành.

### 4.2 🔴 CHẶN CỨNG — đường dẫn POSIX bị nhét vào **nội dung prompt** gửi cho Codex

`gen.sh` dòng **421** (và `cover.sh` dòng **51**) nhét `${ROOT}` vào chuỗi `task`
*(tìm theo chuỗi `save/copy the generated PNG to exactly this path`)*:

```bash
task="… save/copy the generated PNG to exactly this path: ${ROOT}/raw/${job}.png …"
```

Dưới Git-Bash, `ROOT="$(pwd)"` là **`/c/Users/…/KitGen/projects/<id>`** (dạng MSYS).

- Các **đối số** (`-C "${ROOT}"`, `-i "${ROOT}/${p}"`) thì **được MSYS tự đổi** sang
  `C:\…` khi gọi một binary Windows thật — nên hai chỗ đó ổn.
- Nhưng `${ROOT}` nằm **bên trong một chuỗi văn bản**, MSYS không đụng tới. Model nhận
  lệnh ghi ra `/c/Users/…` — trên Windows đường dẫn bắt đầu bằng `/` được hiểu là gốc
  của ổ đĩa hiện tại, tức `C:\c\Users\…`. **Ảnh rơi sai chỗ ⇒ job FAIL.**

**Thay đổi cần làm** (một dòng thêm vào, không đổi hành vi macOS/Linux):

```bash
# gen.sh, ngay sau  ROOT="$(pwd)"  (dòng 6):
ROOT_OUT="$ROOT"
command -v cygpath >/dev/null 2>&1 && ROOT_OUT="$(cygpath -m "$ROOT")"   # C:/Users/… (gạch xuôi)

# rồi dùng ${ROOT_OUT} THAY CHO ${ROOT} DUY NHẤT trong chuỗi `task` (dòng ~421):
#   … to exactly this path: ${ROOT_OUT}/raw/${job}.png …
```

Tương tự cho `cover.sh`: `RAW` (dòng 48) dùng cho **hai việc khác nhau** — vừa là đường
dẫn trong prompt, vừa là đường dẫn bash tự `stat`/`cp`. Phải tách:

```bash
RAW="${ROOT}/cover/cover.raw.png"          # bash dùng — giữ dạng POSIX
RAW_OUT="$RAW"
command -v cygpath >/dev/null 2>&1 && RAW_OUT="$(cygpath -m "$RAW")"
# dòng 51 (chuỗi task) dùng ${RAW_OUT}; mọi chỗ còn lại giữ ${RAW}
```

`cygpath` chỉ tồn tại trong MSYS/Cygwin nên trên macOS/Linux `ROOT_OUT == ROOT` — **không
đổi một hành vi nào**. Dùng `-m` (gạch xuôi `C:/…`) chứ không `-w` (`C:\…`): gạch ngược
trong prompt dễ bị model/JSON hiểu thành ký tự escape.

### 4.3 🟡 NÊN CÓ — `du -h` và `ls -la` trong `gen.sh`

`du -h` (dòng 385, 387) và `ls -la raw/` (dòng 418) có trong `<Git>\usr\bin` nên chạy
được. Chỉ là **định dạng số** có thể khác. Không chặn. Không cần sửa.

### 4.4 🟡 CẦN KIỂM — `slice.py` và các script Python

Chưa rà từng dòng (file đang có agent khác sửa). Cần kiểm ở §7 bước 7:

- có mở file bằng `open(path)` **không** `encoding="utf-8"` không? Windows mặc định
  `cp1252`/`cp1258` ⇒ tên tiếng Việt trong `styles.json` sẽ vỡ. `json.load(open(...))`
  trong `gen.sh` dòng 24 chính là ca này.
- có hard-code `/` trong đường dẫn ghi ra không (Python xử lý được `/` trên Windows nên
  thường vô hại).
- có gọi `os.rename` đè lên file đang tồn tại không (`os.rename` trên Windows **ném lỗi**
  nếu đích tồn tại; phải là `os.replace`). Bản hiện tại của `cover.sh` và `thumbs.mjs`
  đều đã dùng `os.replace` — tốt.

---

## 5. Installer Windows — `scripts/install.ps1`

Bản dịch của `install.sh`, PowerShell 5.1+ (bản có sẵn trong mọi Windows 10/11 — **không**
yêu cầu cài PowerShell 7).

**Giữ nguyên mọi quyết định của `install.sh`:** không cần admin, không cài gì ngoài thư mục
user, credential ở lại trong home của Codex, tải từ **cùng `release.json`** (tarball
`.tar.gz` — Windows 10 1803+ có sẵn `tar.exe` của bsdtar), đối chiếu sha256 của gói **và**
từng file trong `manifest.sha256`, chỉ khởi động khi mọi tiền đề đã đủ.

### 5.1 Bản đồ đường dẫn

| macOS/Linux | Windows |
|---|---|
| `~/.kitgen` | `%LOCALAPPDATA%\KitGen` |
| `~/.kitgen/current` (symlink) | `%LOCALAPPDATA%\KitGen\current` (**junction** — NTFS, không cần admin, khác symlink) |
| `~/.kitgen/tools/node/bin/node` | `%LOCALAPPDATA%\KitGen\tools\node\node.exe` (bản Windows là **zip có `node.exe` + `npm.cmd` ngay thư mục gốc**, không có `bin/`) |
| `~/.kitgen/config.env` (chmod 600) | `%LOCALAPPDATA%\KitGen\config.cmd` (⚠️ **không có chmod 600** — xem 5.5) |
| `~/.kitgen/bin/kitgen` | `%LOCALAPPDATA%\KitGen\bin\kitgen.cmd` |
| `~/KitGen` | `%USERPROFILE%\KitGen` |
| `~/KitGen/.venv/bin/python` | `%USERPROFILE%\KitGen\.venv\Scripts\python.exe` |
| LaunchAgent plist / systemd unit | shortcut `KitGen.vbs` trong thư mục **Startup** + `wscript.exe` (ẩn cửa sổ console) |

### 5.2 Tám bước installer

1. **Tiền đề hệ thống** — `tar.exe`, Git-Bash (`bash.exe` + `<Git>\usr\bin\grep.exe`),
   Python 3 (ưu tiên launcher `py -3`, biết loại trừ **alias giả `python.exe` trong
   `WindowsApps`** chỉ mở Microsoft Store). Thiếu → ghi vào danh sách `Blockers`, **không
   dừng ngay** mà chạy tiếp để in đủ checklist một lần.
2. **Gói runtime** — `-Archive` / `-ReleaseUrl` / `release.json`; sha256 gói; `tar -xzf`;
   **bắt buộc đúng một thư mục gốc `kitgen-runtime-*`**; đối chiếu từng file theo
   `manifest.sha256`.
3. **Node riêng** — `node-v20.19.5-win-{x64|arm64|x86}.zip` từ `nodejs.org/dist`, đối chiếu
   `SHASUMS256.txt`, `Expand-Archive`, bỏ thư mục lồng. Rồi `node --check agent/server.mjs`
   như bản Unix.
4. **Cài runtime + engine** — `releases\<version>`, junction `current`, copy engine sang
   `%USERPROFILE%\KitGen\.kitgen\engine`.
5. **Python** — venv `.venv\Scripts\python.exe`, `pip install pillow numpy scipy pymatting`,
   và sinh **shim `bin\python3`** (LF, không BOM) cho Git-Bash.
6. **Codex CLI + trình render khung xương** — ưu tiên `codex` đã có trên PATH; nếu không thì
   `npm --prefix <tools> install @openai/codex`; rồi `npm --prefix <tools> install @resvg/resvg-wasm`
   (2,4 MB, thuần JS + `.wasm` — KHÔNG còn tải browser).
7. **Cấu hình + lệnh** — `config.cmd`, `bin\kitgen.cmd`, `bin\kitgen-hidden.vbs`, và
   `.kitgen\config.json` **giữ nguyên lựa chọn hồ sơ ảnh của người dùng khi update**
   (đúng lý lẽ đã ghi trong khối `python3 - "$WORKSPACE/.kitgen/config.json"` của `install.sh`:
   người dùng đổi hồ sơ qua UI sau khi cài, update không được reset lựa chọn đó).
8. **Khởi động** — chỉ khi `Blockers` rỗng và không có `-NoStart`; copy `.vbs` vào Startup;
   `kitgen.cmd start`; chờ `/health` tối đa 15 s.

### 5.3 Chạy nền không có cửa sổ đen

Không có launchd/systemd. Ba lựa chọn đã cân nhắc:

| Cách | Vì sao chọn / loại |
|---|---|
| **Startup folder + `wscript.exe` chạy `.vbs`** ✅ | `WScript.Shell.Run(cmd, 0, False)` với tham số `0 = vbHide` là cách **duy nhất không cần cài thêm gì** mà thật sự không hiện cửa sổ console. Log đổ vào `agent.log` qua nhánh `run-logged` |
| Scheduled Task (`schtasks /SC ONLOGON`) | Chỉ chạy ẩn hoàn toàn khi chọn "Run whether user is logged on or not" — mà cái đó **hỏi mật khẩu Windows**. Với ONLOGON thường thì vẫn hiện cửa sổ. Loại |
| Windows Service (nssm/sc.exe) | Cần quyền **admin**. Vi phạm nguyên tắc "không sudo" của `install.sh`. Loại |

`kitgen.cmd stop` không có PID file: nó tìm tiến trình bằng
`Get-CimInstance Win32_Process` lọc `node.exe` + command line chứa `agent…server.mjs`.
**Giới hạn đã biết:** nếu người dùng chạy hai workspace trên hai cổng thì `stop` giết cả hai.

### 5.4 Điều `install.ps1` **không** làm

- Không tự cài Git for Windows / Python (cần admin, cần người dùng đồng ý điều khoản) —
  chỉ **in đường link chính thức và dừng khởi động**.
- Không đăng ký `kitgen` vào PATH hệ thống (sẽ ghi `HKCU\Environment`, cần đăng xuất mới
  có hiệu lực). Người dùng gọi bằng đường dẫn đầy đủ hoặc dùng shortcut.
- Không có bước rollback tự động về bản trước như `install.sh` (nhánh `PREVIOUS`/`ln -sfn`).
  **Ghi backlog** — cần khi bản Windows ra khỏi trạng thái EXPERIMENTAL.

### 5.5 ⚠️ Khác biệt bảo mật cần biết

`install.sh` làm `chmod 600 config.env`. `config.cmd` trên Windows **kế thừa ACL của
`%LOCALAPPDATA%`** — mặc định chỉ chủ máy + SYSTEM + Administrators đọc được, tương đương
trên máy một người dùng, nhưng **không tương đương trên máy nhiều tài khoản có admin
khác**. `config.cmd` **không chứa credential** (chỉ chứa đường dẫn và cổng) nên mức phơi
lộ là đường dẫn máy, không phải khoá. Vẫn nên siết ACL ở bản chính thức. **Ghi backlog.**

---

## 6. Giới hạn đã biết của bản Windows (nói thẳng với người dùng)

1. **Chưa ai chạy thử.** Đây là mã đọc-tài-liệu-mà-viết. Xác suất có lỗi ở lần chạy đầu là cao.
2. **Bắt buộc phải cài Git for Windows và Python 3 trước.** Installer không tự làm hộ.
3. **`gen.sh` cần hai bản vá ở §4.1 và §4.2 thì mới ra ảnh.** Chúng chưa được áp dụng.
4. **Codex CLI trên Windows chưa được kiểm.** Cụ thể chưa biết `codex debug prompt-input`
   có liệt kê `imagegen` trên Windows hay không — nếu không thì `doctor` sẽ báo
   `imageGen.mode = "unavailable"` và **UI chặn nút Gen** (`routes/runs.mjs` dòng 33).
   Đây là điểm rủi ro số 1 của cả bản port.
5. **Không có bản Windows của `build-runtime.sh`.** Muốn đóng gói release vẫn phải làm trên
   macOS/Linux (hoặc chạy `bash scripts/build-runtime.sh` trong chính Git-Bash — chưa kiểm).
6. **`kitgen update` trên Windows gọi `install.ps1 -Update`**, mà `install.ps1` không có
   nhánh rollback. Update hỏng = phải cài lại tay.
7. **Windows Defender / SmartScreen** có thể chặn `.vbs` trong Startup hoặc cảnh báo khi
   tải `node.zip`. Chưa kiểm.
8. **Đường dẫn dài > 260 ký tự.** Workspace mặc định `%USERPROFILE%\KitGen\projects\<id>\runs\<runId>\artifacts\<job>.png`
   là an toàn, nhưng tên project dài + `LongPathsEnabled` chưa bật có thể chạm trần. Chưa kiểm.

---

## 7. ✅ CHECKLIST KIỂM THỬ trên máy Windows sạch

> In ra hoặc mở song song. Mỗi bước có **điểm quan sát** cụ thể — đừng chỉ ghi "chạy được",
> hãy chép lại đúng dòng chữ nhìn thấy. Khi lỗi: chụp màn hình + gửi kèm
> `%LOCALAPPDATA%\KitGen\agent.log`.

### Chuẩn bị (làm trước, ngoài phạm vi installer)

| # | Việc | Điểm quan sát | Lỗi có thể gặp |
|---|---|---|---|
| 0.1 | Máy Windows 10 (1803+) hoặc 11, tài khoản thường (không cần admin) | `winver` ≥ 1803 | < 1803 thì không có `tar.exe` — dừng ở đây |
| 0.2 | Cài **Git for Windows** từ https://git-scm.com/download/win, để nguyên mọi tuỳ chọn mặc định | Mở "Git Bash" từ Start Menu, gõ `grep --version` và `date +%s` → phải ra kết quả | Nếu cài bản "portable" hoặc bỏ tuỳ chọn Unix tools thì `<Git>\usr\bin` có thể thiếu |
| 0.3 | Cài **Python 3** từ python.org, **tick "Add python.exe to PATH"** | Mở PowerShell mới, gõ `py -3 --version` → `Python 3.x.y` | Nếu gõ `python` mà mở Microsoft Store ⇒ đang dính alias giả, phải tắt trong Settings → Apps → App execution aliases |
| 0.4 | Đăng nhập Codex: `codex login` (hoặc cài `npm i -g @openai/codex` trước) | `codex --version` ra số | Nếu chưa có Node hệ thống thì bỏ qua, installer sẽ tự cài Codex riêng |

### Cài đặt

| # | Việc | Điểm quan sát | Lỗi có thể gặp |
|---|---|---|---|
| 1 | Mở **PowerShell** (không cần admin), chạy:<br>`powershell -ExecutionPolicy Bypass -File .\install.ps1` | In ra 8 khối `[1/8] … [8/8]`, mỗi khối có dòng `OK` | `... cannot be loaded because running scripts is disabled` ⇒ phải có `-ExecutionPolicy Bypass` |
| 2 | Quan sát khối **[1/8]** | `OK tar.exe`, `OK Git-Bash · C:\Program Files\Git\bin\bash.exe`, `OK Python 3.x` | Có dòng `THIEU …` màu đỏ ⇒ đọc gợi ý ngay dưới, cài rồi chạy lại |
| 3 | Quan sát khối **[2/8]** và **[3/8]** | `OK manifest.sha256 hop le (N file)`, `OK runtime <version>`, `OK Node v20.19.5` | `could not create SSL/TLS secure channel` ⇒ máy chặn TLS1.2, báo lại.<br>`checksum runtime khong khop` ⇒ tải hỏng, chạy lại |
| 4 | Quan sát khối **[4/8]** | `OK current → releases\<version>` | `khong tao duoc junction` ⇒ chỉ là cảnh báo, vẫn chạy tiếp |
| 5 | Quan sát khối **[5/8]** | `OK venv …`, `OK shim python3 (cho Git-Bash)` | `pip install that bai` ⇒ mạng công ty chặn PyPI. Ghi lại thông báo |
| 6 | Quan sát khối **[6/8]** | `OK Codex …`, `OK Trinh render khung xuong (@resvg/resvg-wasm)` | gói chỉ 2,4 MB; `THIEU` ⇒ npm bị proxy chặn, và **thiếu là KHÔNG gen được ảnh** (không còn bản dự phòng) |
| 7 | Quan sát khối **[8/8]** | `OK dang ky chay khi dang nhap (Startup)` và `OK agent phan hoi tai http://127.0.0.1:8765/health` | `agent chua phan hoi sau 15s` ⇒ mở `%LOCALAPPDATA%\KitGen\agent.log`. **Nếu log RỖNG hoàn toàn ⇒ nghi ngay lỗi §3.1 dòng `import.meta.url`** |

### Kiểm chức năng

| # | Việc | Điểm quan sát | Lỗi có thể gặp |
|---|---|---|---|
| 8 | Mở trình duyệt: `http://127.0.0.1:8765/app/` | Giao diện KitGen hiện ra, **không** trắng trang | Trắng trang ⇒ bundle `app/` không được phục vụ, xem log |
| 9 | Vào **Cài đặt → Giới thiệu / Doctor**, xem bảng môi trường | `python` phải `ok: true` + version; `renderer` `ok: true` (`engine: "@resvg/resvg-wasm"`); `codex` có version; `imageGen.mode` phải là `default-home` | ⚠️ **`imageGen.mode = "unavailable"` là rủi ro số 1** (§6.4). Chép lại đúng `reason` (`NO_CODEX` / `NOT_LOGGED_IN` / `FEATURE_OFF` / `UNKNOWN`) |
| 10 | Tạo một project mới từ template | Project hiện trong danh sách, thư mục `%USERPROFILE%\KitGen\projects\<id>` xuất hiện | |
| 11 | Bấm **mở thư mục** (reveal) trên thẻ project | File Explorer mở đúng thư mục | Báo lỗi `NOT_SUPPORTED` ⇒ nhánh `explorer.exe` sai |
| 12 | Mở Git Bash, `cd` vào thư mục project, chạy tay `bash gen.sh` | Phải in `prompt → prompts/…txt` cho từng job — chứng tỏ khối `python3 - <<'PY'` chạy được | `python3: command not found` ⇒ shim §2.1 không hoạt động (kiểm `%LOCALAPPDATA%\KitGen\bin\python3` có LF, không BOM, và PATH có chứa thư mục đó) |
| 13 | **Chạy Gen thật từ UI**, 1 sheet, 1 variant | Log chạy có dòng `prompt → …` rồi `OK <job>` | `FAIL <job>` **với ảnh vẫn có trong `raw/`** ⇒ đúng lỗi **§4.1 `stat -f %m`**.<br>Log codex nói đã lưu ảnh nhưng `raw/` **rỗng** ⇒ đúng lỗi **§4.2 đường dẫn POSIX trong prompt** — kiểm xem có thư mục lạ `C:\c\Users\…` không |
| 14 | Xem ảnh trong `raw/` và lưới thumbnail trên UI | Thumbnail hiện (không phải ảnh gốc 3 MB) | Header `X-KitGen-Thumb: unavailable` ⇒ Pillow không chạy được từ agent, kiểm `KITGEN_PYTHON` trong `config.cmd` |
| 15 | Bấm **Dừng** giữa một lượt gen đang chạy | Run chuyển `cancelled`; **mở Task Manager, kiểm KHÔNG còn tiến trình `codex` nào** | Còn `codex.exe` sống ⇒ `taskkill /T` không ăn (§3.1). Đây là lỗi **đốt quota**, ưu tiên cao |
| 16 | Đợi lượt gen xong, xem **ảnh bìa** tự sinh | `cover/cover.png` xuất hiện, thẻ project có ảnh | Thiếu ⇒ `cover.sh` không chạy được, xem `logs/cover.log` |
| 17 | Chạy pha **slice** (tự động sau gen) | `kits/` có ảnh cắt; tên file tiếng Việt không bị vỡ | `UnicodeDecodeError` / tên vỡ ⇒ đúng nghi vấn **§4.4 encoding** |
| 18 | Xuất project ra ZIP rồi nhập lại | Nhập thành công, không có entry nào tên `a\b\c.png` | Tên entry có `\` ⇒ `zip.mjs` `split(sep)` sai (không nên xảy ra, `zip.mjs` đã xử lý) |
| 19 | `%LOCALAPPDATA%\KitGen\bin\kitgen.cmd stop` rồi `status` | `stop` im lặng; `status` in `KitGen agent khong phan hoi tren cong 8765` | |
| 20 | `kitgen.cmd start` rồi `status` | `status` in JSON `/health` | |
| 21 | **Khởi động lại máy**, đăng nhập, đợi 30 s, mở `http://127.0.0.1:8765/app/` | App lên được mà không phải làm gì | Không lên ⇒ Startup shortcut bị Defender chặn, kiểm `shell:startup` có `KitGen.vbs` |
| 22 | Kiểm **không có cửa sổ console đen** nào nhấp nháy trong suốt các bước trên | Không thấy | Có ⇒ thiếu `windowsHide` ở đâu đó, chép lại xem nó nháy lúc nào |

### Báo cáo

Với mỗi bước fail, gửi lại: **số bước**, **dòng chữ đúng như trên màn hình**,
`%LOCALAPPDATA%\KitGen\agent.log`, và `%USERPROFILE%\KitGen\projects\<id>\logs\<job>.log`
nếu là lỗi gen.

---

## 8. Kết quả kiểm định (chạy trên macOS, 2026-08-14)

| Kiểm | Lệnh | Kết quả |
|---|---|---|
| Agent không đổi hành vi trên darwin | `node agent/test-agent.mjs` | ✅ **127/127 PASS · 0 FAIL** (sau khi đã có đủ các nhánh `win32`) |
| Cú pháp mọi file `.mjs` đã sửa | `node --check` trên 8 file | ✅ sạch |
| `install.sh` không hỏng | `bash -n install.sh` | ✅ sạch (**không sửa một dòng nào** của file này) |
| `build-runtime.sh` | `bash -n scripts/build-runtime.sh` | ✅ sạch (chưa sửa) |
| `install.ps1` | — | ❌ **CHƯA KIỂM ĐƯỢC CÚ PHÁP**: máy phát triển là macOS và **không có `pwsh`**. Chỉ kiểm được thủ công: here-string cân bằng, ngoặc nhọn/tròn cân bằng. **Bước đầu tiên trên máy Win phải là:** `powershell -NoProfile -Command "[void][scriptblock]::Create((Get-Content -Raw .\scripts\install.ps1))"` — không in gì = cú pháp hợp lệ |

---

## 9. Việc còn lại (backlog)

1. 🔴 **Áp §4.1 + §4.2 vào `gen.sh`/`cover.sh`** — không có thì bản Windows không ra ảnh.
2. 🔴 Chạy đủ §7 trên máy Win sạch, sửa theo lỗi thật.
3. 🟡 `scripts/build-runtime.ps1` (hoặc xác nhận `build-runtime.sh` chạy được trong Git-Bash)
   để đóng gói được release từ Windows.
4. 🟡 Rollback tự động cho `install.ps1` (nhánh `PREVIOUS` như `install.sh`).
5. 🟡 `shortenPath()` cần biết `%USERPROFILE%` để nhãn workspace trên Windows không lộ
   đường dẫn tuyệt đối (§3.2).
6. 🟡 Siết ACL cho `config.cmd` (§5.5).
7. 🟢 Chặn tên project trùng thiết bị DOS (`con`, `nul`, `com1`…) trong `RE_PROJECT_ID` (§3.2).
8. 🟢 Audit `paths.mjs` với hệ thống file không phân biệt hoa-thường (§3.2).
9. 🟢 Rà `slice.py` cho `encoding="utf-8"` (§4.4).
