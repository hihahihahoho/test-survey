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
xanh 100% trên macOS — số ca mới nhất ở §8).

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
| Agent không đổi hành vi trên darwin | `node agent/test-agent.mjs` | ✅ **150/150 PASS · 0 FAIL** (đo lại 14/08 sau các bản vá §9.1; tổng số ca đang tăng vì bộ ca còn được bổ sung song song) |
| Cú pháp mọi file `.mjs` đã sửa | `node --check` trên 57 file của `agent/` | ✅ sạch |
| `install.sh` không hỏng | `bash -n install.sh` | ✅ sạch (**không sửa một dòng nào** của file này) |
| `build-runtime.sh` | `bash -n scripts/build-runtime.sh` + chạy thật ra `.tar.gz` + `.sha256` | ✅ sạch (chưa sửa) |
| `install.ps1` | — | ❌ **KHÔNG KIỂM ĐƯỢC TẠI CHỖ**: máy phát triển là macOS và **không có `pwsh`**. Nay việc này do CI làm — xem §8.1, và **lượt CI đầu tiên đã bắt được một lỗi chết người: §8.2**. |

### 8.1 Máy ảo Windows trắng trong CI — `.github/workflows/kitgen-windows.yml`

Thay cho việc chờ mượn một máy Windows thật, mỗi lượt push đụng `install.ps1`,
`agent/**`, `runtime/**` (hoặc bấm tay `workflow_dispatch`) chạy 4 job trên
`windows-latest` — runner này có sẵn **đúng** bộ tiền đề của §7 (Git for Windows kèm
`usr\bin`, Python 3, `tar.exe`, Node). Workflow **tách hẳn** khỏi `kitgen-release.yml`
để bản Mac không bao giờ bị chặn vì bản Windows thử nghiệm.

| Job | Kiểm cái gì | Trả lời câu hỏi nào của tài liệu này |
|---|---|---|
| 1 · Cú pháp và phân tích tĩnh | `Parser::ParseFile` + `[scriptblock]::Create` bằng **PowerShell 5.1 thật**; PSScriptAnalyzer nếu image có sẵn (chỉ `Error` mới đỏ, `Warning` thì in); `node --check` toàn bộ `agent/`; `bash -n` các script shell | §8 dòng cuối — cú pháp `install.ps1` |
| 2 · Đóng gói runtime (Linux) | `scripts/build-runtime.sh` trên ubuntu (đường đã chạy hằng ngày ở `kitgen-release.yml`) → artifact | nguồn tarball cho job 3 |
| 3 · Cài đặt trên Windows | Cài **hai lần**: (a) máy trống Codex + npm bị chặn ⇒ phải **in checklist** và **không** khởi động, thoát 0; (b) có `codex.cmd` giả trên PATH ⇒ cài đủ, `-NoStart` được tôn trọng. Rồi soi cây `%LOCALAPPDATA%\KitGen`, `config.cmd`, `config.json`, `kitgen.cmd status`, shim `python3` (không BOM, không CRLF, chạy được trong Git-Bash). Bước cuối: chạy `build-runtime.sh` **trong Git-Bash** | §7 bước 1–7, bước 12, bước 19; §9.3 |
| 4 · Agent trên Windows | `node agent/test-agent.mjs` chạy **trên Windows** (phép thử thật đầu tiên của `platform.mjs`: spawn `bash.exe`, PATH coreutils, `toBashPath`, `taskkill /T`, `pathToFileURL`); rồi khởi động `agent/server.mjs` thật, gọi `/health`, `taskkill /T /F` và xác nhận cổng đã tắt | §3.1 toàn bộ; §7 bước 20 |

**Không tốn quota, không đăng nhập:** Codex thật không bao giờ được cài (job 3 dùng
`codex.cmd` giả 4 dòng, job 4 dùng engine giả của bộ ca). Không job nào gọi tới API sinh ảnh.

### 8.2 🔴 BÀI HỌC VÒNG 1 — file `.ps1` không BOM thì PowerShell 5.1 đọc bằng Windows-1252

Lượt CI đầu tiên (**run 31783005598**) đỏ ngay job 1: `Parser::ParseFile` trả **12 lỗi cú
pháp** trong `install.ps1` — trong đó có những câu vô nghĩa như *"The '<' operator is
reserved for future use"*, *"The splatting operator '@' cannot be used… '@resvg'"*,
*"Unexpected token 'node.exe' -and `$_.CommandLine…"* (tức **ruột here-string sinh
`kitgen.cmd` đang bị đọc như mã PowerShell**), *"Missing closing '}'"* ×5, *"The Try
statement is missing its Catch or Finally block"*.

**Không có lỗi cú pháp nào là thật.** Nguyên nhân duy nhất, đứng trước tất cả:

> `install.ps1` được lưu **UTF-8 không BOM**. Windows PowerShell 5.1 đọc file `.ps1`
> không BOM bằng **Windows-1252**, không phải UTF-8. Ký tự `—` (U+2014, UTF-8 = `E2 80
> 94`) khi đó vỡ thành ba ký tự CP1252 mà ký tự cuối là **`"` (U+201D)** — và
> **PowerShell coi U+201C/U+201D/U+201E là dấu nháy kép thật**. Chuỗi đầu tiên dính phải
> là dòng `Write-Warn "… (coreutils) — engine se loi …"`: nó đứt làm đôi ngay giữa câu,
> phần còn lại (`engine se loi o cac lenh date/grep/du" }`) bị parse như mã, parser lệch
> nhịp một dấu nháy và **cả phần còn lại của file hỏng theo**.

Chuỗi lỗi khớp chính xác: ba chuỗi vỡ ở dòng 144 / 314 / 548 (đều là chuỗi nháy kép có
`—`) ⇒ hai khối `{` mở ở dòng 118 (`try`) và 141 không bao giờ đóng ⇒ `@resvg/resvg-wasm`
và `<tools>` trong `Write-Block` (đang nằm trong chuỗi nháy đơn) bị đọc như toán tử.

**Vì sao trước đó không ai thấy:** PS 7 (`pwsh`) mặc định UTF-8 nên **không tái hiện được**.
Kiểm bằng `pwsh` là kiểm sai môi trường. Máy phát triển là macOS, không có PowerShell nào.

**Đã sửa (hai lớp, xem khối cảnh báo ở đầu `install.ps1`):**

1. **Thêm BOM UTF-8** (`EF BB BF`) cho `install.ps1` — đây là lớp thật, đúng khuyến nghị
   của Microsoft cho script chạy trên Windows PowerShell 5.1. CI có bước **"BOM của mọi
   file `.ps1`"** chạy **trước** bước parse: file `.ps1` nào có ký tự ngoài ASCII mà thiếu
   BOM là đỏ ngay với một câu nói thẳng nguyên nhân, thay vì 12 câu đánh đố.
   (PSScriptAnalyzer cũng có luật `PSUseBOMForUnicodeEncodedFile` cho đúng việc này.)
2. **ASCII hoá 13 dòng**: mọi chuỗi được **in ra console** và mọi **nội dung file sinh ra**
   (`config.cmd`, `kitgen.cmd`, `kitgen-hidden.vbs`, shim `python3`) không còn `—` / `→`.
   Vừa là phòng thủ nếu BOM bị một editor nào đó gỡ mất, vừa đúng bản chất: `cmd.exe` và
   console Windows đọc bằng OEM codepage chứ không phải UTF-8. **Văn tiếng Việt trong
   comment giữ nguyên** — BOM lo phần đó. Dấu `·` dùng làm bullet là an toàn (UTF-8 `C2 B7`,
   không byte nào rơi vào vùng `0x91–0x94`) nên giữ, và §7 bước 2 đang trích đúng chữ đó.

**Luật rút ra cho mọi file `.ps1` về sau:** có ký tự ngoài ASCII ⇒ **phải có BOM**; và
đừng bao giờ đặt `— – → ⇒ “ ” ‘ ’` (hay bất kỳ ký tự nào có byte `0x91–0x94`) vào bên
trong chuỗi — chỉ để trong comment.

#### Vòng 2 (run 31784079285) — cùng căn bệnh, lần này ở **script inline trong workflow**

Bản vá vòng 1 đúng, nhưng `install.ps1` **chưa kịp được parse**: lần này chết ở chính khối
`run:` của step *"Cú pháp install.ps1 (PowerShell 5.1)"*. Lý do y hệt và đáng nhớ hơn:

> Runner ghi **mỗi khối `run:`** ra một file tạm `D:\a\_temp\<guid>.ps1` **KHÔNG BOM**.
> Ta không kiểm soát được file đó. Vậy nên `shell: powershell` đọc nó bằng Windows-1252
> đúng như đọc `install.ps1`. Một dấu `—` trong **chuỗi** của script inline — cụ thể là câu
> `"(3 byte dau cua file: {0} — BOM UTF-8 phai la EF BB BF)"` mà vòng 1 thêm vào để *giúp
> chẩn đoán* — đủ để giết cả step trước khi nó kịp chấm `install.ps1`.

Vì file tạm không thể có BOM, **luật duy nhất còn lại là ASCII**:

> **Mã và chuỗi trong MỌI khối `run:` của workflow phải là ASCII.** Tiếng Việt chỉ được
> nằm ở dòng comment (`#` chạy tới hết dòng nên dấu nháy giả bên trong vô hại — đã kiểm)
> và ở `name:` (chỉ hiển thị, không chạy qua PowerShell).

Đã ASCII hoá **10 dòng** trong 14 khối PowerShell inline (1 khối `powershell`, 13 khối
`pwsh` — `pwsh` mặc định UTF-8 nên hôm nay chưa chết, nhưng sẽ chết ngay ngày ai đó đổi
`pwsh` → `powershell`, nên áp cùng một luật), và thêm step **"Chỉ ASCII trong mã của
workflow này"** chạy **trước mọi bước PowerShell**; step này viết bằng `bash` nên miễn nhiễm.

**Vì sao vẫn để script inline chứ không tách ra file `.ps1` riêng có BOM:** tách file chỉ
cứu được **một** khối (`shell: powershell`), lại đẻ thêm một file phải tự tuân luật BOM và
phải truyền tham số qua `-File`. Luật ASCII cứu **cả 14** khối, kể cả các khối `pwsh`, và
sai phạm bị chỉ mặt đúng số dòng ngay ở bước đầu. Đổi lại: trong workflow, tiếng Việt chỉ
còn ở comment và `name:`.

**Bẫy phụ, ghi lại kẻo dẫm lại:** bản đầu của step gác dùng
`grep '[^[:print:][:space:]]'` — trên macOS lớp ký tự POSIX này khớp **0 dòng** kể cả với
file đầy ký tự UTF-8, tức một cái gác **không bao giờ đỏ**. Đã đổi sang `perl -ne '… /[^\x00-\x7F]/ …'`
(chắc chắn có trong Git-Bash — chính `shasum` là perl) và kiểm bằng cách chạy nó trên
**bản cũ**: phải bắt đúng 10 dòng, trong đó có dòng 91 đã giết CI vòng 2.

**Bốn here-string trong file đều KHÔNG có lỗi** (giả thuyết ban đầu là terminator bị thụt
đầu dòng — đã kiểm và bác bỏ): cả bốn mở bằng `@"` đứng cuối dòng và đóng bằng `"@` ở
**cột 0** (dòng 357→361 shim `python3`, 437→451 `config.cmd`, 458→511 `kitgen.cmd`,
517→522 `.vbs` — số dòng của bản trước khi thêm khối cảnh báo). Cả bốn **phải giữ dạng
nháy kép** `@"…"@` vì đều cần nội suy biến (`$venvScripts`, `$logFile`, `$binDir`,
`$pyPosix`); các dấu `` ` `` trong đó là cố ý, để sinh ra `$_` và `%…%` nguyên văn cho
`cmd.exe`.

**Cái CI này KHÔNG thay được:** khởi động lại máy (§7 bước 21), Defender/SmartScreen
(§6.7), cửa sổ console đen (§7 bước 22), Codex thật trên Windows (§6.4 — rủi ro số 1),
và gen ảnh thật (§7 bước 13–17). Những mục đó vẫn phải làm trên máy người dùng thật.

### 8.3 Vòng 3 (run 31784778492) — job 3 và 4 LẦN ĐẦU chạy thật, và bắt được hai lỗi port thật

Job 1 và 2 xanh (`install.ps1` parse sạch, step gác ASCII hoạt động). Job 3 và 4 lần đầu
tiên được chạy — cả hai đỏ, và **cả hai đều là lỗi thật của bản Windows**, không phải lỗi CI.

#### 8.3.1 🔴 `Get-FileHash` "not recognized" — PSModulePath bẩn khi chạy installer từ PowerShell 7

`install.ps1` chết ở `[2/8] Lay goi runtime`:
`The term 'Get-FileHash' is not recognized as the name of a cmdlet`, thoát mã 1.

Cơ chế: step CI chạy `shell: pwsh`, và **PS 7 ghi đè `PSModulePath`** bằng kho module của
chính nó. `powershell.exe` (5.1) sinh ra từ đó **thừa kế** biến này nên mất đường tới
`$PSHOME\Modules` của 5.1. Cmdlet biên dịch sẵn (`Write-Host`, `Copy-Item`, `Get-Content`)
vẫn chạy vì nằm trong phiên mặc định — **đó là lý do lỗi trông vô lý**: mọi thứ chạy ngon
tới đúng cái cmdlet phải auto-load theo đường module thì gãy. Installer dùng **hai** thứ
như thế: `Get-FileHash` (Utility, bước [2/8]) và `Expand-Archive` (Archive, bước [3/8]) —
tức sửa xong [2/8] mà không hiểu cơ chế thì [3/8] gãy tiếp.

**Đây KHÔNG chỉ là chuyện của CI.** Người dùng thật dính y hệt khi gõ
`powershell -ExecutionPolicy Bypass -File install.ps1` **từ trong PowerShell 7** hoặc từ
terminal mặc định của VS Code — một tình huống ngày càng phổ biến. (Bấm file từ Explorer,
gõ trong `cmd.exe`, hay `kitgen.cmd update` thì không dính, vì env sạch.)

Đã sửa, hai lớp:
1. **Vá `PSModulePath` ngay đầu `install.ps1`**: nếu `$PSHOME\Modules` không có trong biến
   thì chèn vào đầu. `$PSHOME` luôn đúng với chính tiến trình đang chạy nên phép vá này
   không thể sai. Đây là lớp thật — nó cứu cả `Expand-Archive`.
2. **`Get-Sha256` bỏ hẳn `Get-FileHash`**, tính SHA-256 bằng `[Security.Cryptography.SHA256]`
   thuần .NET — luôn có mặt kể cả khi đường module hỏng hoàn toàn. Bằng chứng cho phép làm
   thế: `[Net.ServicePointManager]` (dòng 78) và `[Guid]::NewGuid()` (dòng 135) đã chạy
   trót lọt trước khi lỗi xảy ra ⇒ máy **không** ở Constrained Language Mode.

Và CI nay kiểm **cả hai môi trường** trong cùng một lượt, không tốn thêm phút nào:
lần cài **1** đặt lại `PSModulePath` về mặc định của máy (đúng máy người dùng thật),
lần cài **2** *cố ý* giữ `PSModulePath` bẩn thừa kế từ pwsh — nó chỉ xanh nếu phép vá ở
trên thật sự chạy.

#### 8.3.2 🔴 `ENOTEMPTY` khi dọn thư mục — fd rò trong `scheduleUpdate`

`node agent/test-agent.mjs` chạy hết ~105s rồi **chết uncaught**:
`ENOTEMPTY: directory not empty, rmdir '…\kitgen-test-xxxx\kitgen-home-spawn'`.

Không phải antivirus, không phải tiến trình con: **`scheduleUpdate` mở `update.log` bằng
`openSync` và KHÔNG BAO GIỜ đóng**. `spawn` đã nhân bản handle cho tiến trình con, nhưng
bản của tiến trình cha thì mở suốt đời agent. POSIX cho unlink file đang mở nên macOS
không bao giờ thấy; **Windows thì cấm**, nên thư mục chứa nó không xoá được.

Hệ quả **trên máy người dùng Windows**, không chỉ trong test: `update.log` bị chính agent
khoá ⇒ installer không ghi đè được nó, và mọi thao tác xoá cây thư mục chứa nó thất bại.

Đã sửa ba chỗ:
1. `lib/update.mjs` — đóng fd ngay sau `spawn` (④). Câu báo lỗi của listener `error` đổi
   sang ghi bằng **đường dẫn** (`appendFileSync`) nên vẫn giữ nguyên cả ba lời hứa ①②③.
2. `lib/fsx.mjs` — `removeTree`/`moveTree` thêm `maxRetries: 10, retryDelay: 100` **gate
   win32**. Windows nhả handle chậm một nhịp (tiến trình con vừa `taskkill`, Defender vừa
   quét file mới ghi). Đây là **chỗ duy nhất** trong agent xoá cây thư mục — thùng rác,
   xoá hẳn project, dọn bản cài cũ đều đi qua đây.
3. `agent/test-agent.mjs` — dọn thư mục tạm có `maxRetries` và bọc `try/catch`: kết quả
   của 150 ca quan trọng hơn việc xoá được `/tmp`, và một lần dọn hụt **không được phép**
   giết tiến trình trước khi in báo cáo. Không nuốt im — in cảnh báo rồi vẫn trả đúng mã thoát.

**Ca kiểm mới khoá lại lỗi này NGAY TRÊN macOS** (không phải chờ CI Windows): sau
`scheduleUpdate`, `fstatSync` lên chính fd đã truyền vào `stdio` phải ném `EBADF`. Đã
chứng minh ca này thật sự bắt được lỗi bằng cách tạm bỏ dòng `closeSync` → ca đỏ
(`149/150`), khôi phục → `150/150`.

### 8.4 Vòng 5 (run 31786773182) — job 1+2 xanh, và hai kiểu hỏng MỚI

Mọi bản vá vòng 4 đều ăn: `install.ps1` đi trọn `[1/8] → [4/8]` (PSModulePath, `Get-Sha256`,
`Expand-Archive` đều ổn). Lộ ra hai thứ khác hẳn nhau.

#### 8.4.1 🔴 `2>$null` KHÔNG phải `2>/dev/null` — nó biến stderr thành lỗi CHẤM DỨT

Job 3 chết ở `[5/8] Moi truong Python`, ngay sau `tao virtualenv ...`. Dòng gây chết:

```powershell
& $venvPy -c 'import PIL,numpy,scipy,pymatting' 2>$null | Out-Null   # ← chết TẠI ĐÂY
if ($LASTEXITCODE -ne 0) { … pip install … }                          # ← không bao giờ tới
```

Đây là **phép thử**, không phải phép kiểm: máy chưa cài thư viện là chuyện đương nhiên, và
`Traceback` chính là câu trả lời "chưa có". Bản Mac viết đúng ý đó bằng `cmd || { … }` —
bash chỉ nhìn **exit code**, kệ lệnh nói gì ra stderr.

PowerShell thì không. Trong PS 5.1, hễ dòng lệnh có **chuyển hướng stderr** (`2>$null`,
`2>&1`), mỗi dòng stderr của lệnh ngoài được gói thành một `ErrorRecord`
(`NativeCommandError`) và đi qua **luồng lỗi** — mà `$ErrorActionPreference = 'Stop'`
(đặt ở đầu installer) coi record đầu tiên là lỗi chấm dứt. Nghĩa là `2>$null` **không hề
"cho qua"**: nó biến stderr từ vô hại thành chí mạng. Không viết `2>$null` thì stderr chỉ
chảy thẳng ra console và chẳng ai chết cả — đúng ngược với trực giác của người viết bash.

Bằng chứng trong log: `Traceback` **vẫn hiện ra** trong `install-1.err.log` mặc dù đã
`2>$null`. Nếu chuyển hướng thật sự nuốt stderr thì đã không có dòng nào.

Sửa: thêm `Invoke-ExeSoft` — hạ `$ErrorActionPreference` trong đúng lời gọi, nuốt (`-Quiet`)
hoặc in stderr, và **trả về exit code** để người gọi tự phán như bash. Ba chỗ của `[5/8]`
(tạo venv, phép thử import, `pip install`) đi qua nó; `Get-PyVersion` cũng vậy.

> **Luật cho cả file**: mọi lệnh ngoài "được phép hỏng" phải gọi qua `Invoke-ExeSoft`.
> Gọi thẳng kèm `2>$null`/`2>&1` = đặt mìn.

#### 8.4.2 🟡 `py -3` là bản MỚI NHẤT — tức bản dễ thiếu wheel nhất

Runner báo `Python 3.14 (py launcher)`. KitGen cần `pillow numpy scipy pymatting`; scipy/numpy
chỉ có wheel cho một phiên bản Python sau khi bản đó ra được vài tháng, trước đó `pip` phải
**biên dịch từ nguồn** — trên Windows nghĩa là cần MSVC + Fortran, tức là hỏng.

`install.sh` không kẹp phiên bản, nhưng `python3` trên Mac là bản Homebrew/hệ thống **đã chín**.
Trên Windows `py -3` lại luôn trỏ vào bản **mới nhất đang cài**. Port đúng *tinh thần* của
install.sh (chọn một bản Python đã chín) chứ không phải copy nguyên chữ:

* thử `py -3.13` → `py -3.12` → `py -3.11`, lấy bản đầu tiên chạy được;
* không có bản nào thì lui về `py -3` **kèm cảnh báo** nêu đúng cách xử (cài thêm 3.13 rồi
  chạy lại), chứ **không chặn cài** — phần không cần Python vẫn dùng được và `doctor` sẽ nói tiếp;
* `pip install` hỏng cũng chỉ là `WARN` (có in nguyên văn dòng lỗi của pip), khác Mac (`set -eu`
  ⇒ chết). Lý do khác: tới `[5/8]` thì runtime đã nằm trong `%LOCALAPPDATA%\KitGen` rồi, bỏ dở
  giữa chừng chỉ để lại một cây cài dở **không có** thông điệp nào, còn đi tiếp thì người dùng
  nhận đủ checklist ở cuối.

**CI vẫn dùng đường của máy trắng** (`py` launcher), *không* dùng `actions/setup-python`: mục
đích của job 3 là mô phỏng máy user, mà máy user thì không có ai cài sẵn Python 3.13 cho họ.
Nếu runner chỉ có 3.14 thì đường "lui về `py -3` + cảnh báo" chính là đường mà user sẽ đi —
CI kiểm đúng cái đó. Đánh đổi: `pip install` có thể hỏng thật trên CI; đó là **cảnh báo**, và
log của bước đó là bằng chứng để quyết định có cần kẹp phiên bản chặt hơn không.

#### 8.4.3 🔴 Job 4 treo 74 phút — và cái tệ hơn: **không một dòng log**

`node agent/test-agent.mjs` bắt đầu 09:08:33 rồi **im lặng hoàn toàn** tới lúc huỷ tay ở phút
thứ 74 (bộ ca chỉ in một lần lúc kết thúc). GitHub mặc định để job chạy tới **6 tiếng**.
Log không nói được nó treo ở đâu, cũng không phân biệt nổi "kẹt cứng một chỗ" với "bò từng ca
qua trần 25s" — 158 ca × 25s ≈ 66 phút, tức **cả hai giả thuyết đều khớp với 74 phút**.

Việc đầu tiên vì thế không phải là đoán, mà là **làm cho lần sau tự khai**:

| Lớp | Ở đâu | Làm gì |
|---|---|---|
| tường thuật trực tiếp | `test/harness.mjs` | có biến `CI` ⇒ mỗi ca in nhãn **trước** khi chạy, in `PASS/FAIL <ms>` ngay sau. Ca treo = dòng cụt cuối log. Máy dev (không có `CI`) giữ nguyên hành vi cũ từng chữ |
| đồng hồ chết | `agent/test-agent.mjs` | `KITGEN_TEST_BUDGET_MS` (CI: 15 phút) — quá giờ thì in **ca hiện tại** + `process.getActiveResourcesInfo()` (câu trả lời thật cho "vì sao không thoát") + báo cáo tới thời điểm đó, rồi `exit 1` |
| trần của job | workflow | `timeout-minutes` cho cả bốn job (job 4 = 25 phút) — lớp chặn cuối, đứng **sau** đồng hồ chết để cái đỏ luôn có tên |

Đã thử ngay trên macOS: `KITGEN_TEST_BUDGET_MS=3000` ⇒ đồng hồ chết in đúng tên ca đang chạy
và `PipeWrap ×4, ProcessWrap, Timeout` — tức handle của một tiến trình engine còn sống.

**Nghi can đã vá sẵn (đọc mã, chưa có bằng chứng từ runner):** `child.on("close")` là đường
**duy nhất** đóng sổ một pha chạy, mà `'close'` đợi **mọi ống stdio đóng**, không phải đợi
tiến trình chết. Trên Windows handle được **thừa kế**: `bash.exe` gọi codex/python, hai đứa
cháu giữ nguyên đầu ghi của ống, nên bash chết rồi mà `'close'` vẫn không tới ⇒ `phaseDone`
không bao giờ settle ⇒ lượt chạy đứng ở "đang chạy" **vĩnh viễn** (một pha không có trần thời
gian nào). POSIX gần như không dính vì engine không để lại tiến trình cháu sống sót.
Vá **gate `win32`** ở cả ba chỗ spawn engine — `runPhase` và `sliceSheet` (`run-handle.mjs`),
`drawOnce` (`cover.mjs`): `'exit'` đã tới mà 5s sau vẫn chưa `'close'` thì tự `destroy()` ống
rồi đóng sổ, kèm một dòng log nói rõ vì sao. Trên darwin/linux khối này **không tồn tại**.

**Nghi can thứ hai — Defender.** Bộ ca ghi vài nghìn file tạm và spawn hàng chục tiến trình;
Defender quét thời gian thực cả hai. Job 4 nay loại trừ `RUNNER_TEMP`/`TEMP` khỏi Defender
(`continue-on-error`, không có quyền thì bỏ qua) — chỉ để **đo được** thời gian thật.
Đây là ghi chú về **hiệu năng**, không phải về tính đúng đắn: máy user thật vẫn có Defender,
và nếu số mili-giây của lượt CI kế tiếp cho thấy bộ ca vốn dĩ bò chứ không kẹt, thì việc phải
làm là **giảm số lần spawn trong bộ ca**, không phải nới trần thời gian.

Ngoài ra: `push` thêm bộ lọc `branches: '**'` (mọi nhánh, **trừ tag**). Trước đó mỗi lượt
`git push --tags` của release Mac lại đẻ thêm một lượt Windows trùng hệt lượt nhánh
(tag `kitgen-v2.1.24` → run 31789513981 trùng run 31788056826), mà `concurrency` không gộp
được vì khác `github.ref`.

---

## 9. Việc còn lại (backlog)

1. 🔴 **Áp §4.1 + §4.2 vào `gen.sh`/`cover.sh`** — không có thì bản Windows không ra ảnh.
2. 🔴 Chạy đủ §7 trên máy Win sạch, sửa theo lỗi thật.
   *Phần tự động hoá được đã chuyển vào CI (§8.1); còn lại là các bước cần máy thật:
   khởi động lại máy, Defender, cửa sổ console, Codex thật, gen ảnh thật.*
3. 🟡 `scripts/build-runtime.ps1` (hoặc xác nhận `build-runtime.sh` chạy được trong Git-Bash)
   để đóng gói được release từ Windows. *Đã có phép kiểm tự động: job 3 của §8.1 chạy
   `build-runtime.sh` trong Git-Bash với `webapp/dist` lấy sẵn từ gói của job 2.*
4. 🟡 Rollback tự động cho `install.ps1` (nhánh `PREVIOUS` như `install.sh`).
5. ✅ **ĐÃ SỬA (14/08)** — `shortenPath()` lọt đường dẫn tuyệt đối trên Windows.
   `lib/redact.mjs` chỉ có ba phép thay cho path POSIX; trên Windows path là `C:\Users\…`
   nên **không phép nào bắt được gì**, và cả `startsWith(homedir())` cũng trượt vì `%TEMP%`
   dùng tên 8.3 (`C:\Users\RUNNER~1\AppData\Local\Temp`). Hậu quả: nhãn workspace trong
   `/health` và mọi dòng log của engine đi ra client kèm nguyên đường dẫn tuyệt đối.
   Bản vá thêm một khối **gate `win32`** (darwin/linux không chạm một ký tự nào) dịch
   đúng thứ tự ba phép POSIX sang Windows, cộng một phép cho path dạng MSYS mà Git-Bash
   in ra: `%TEMP%\…` → `…\2 đoạn cuối`; `C:\Users\<ai đó>\…` → `~\…`; `/c/Users/<ai đó>/…`
   → `~/…`; path tuyệt đối còn sót (ổ khác, UNC) → `…\2 đoạn cuối`.
   Ca kiểm khoá lại: `/health` của job 4 (§8.1) khẳng định response **không chứa** đường
   dẫn workspace, và ca "GET /health … không lộ đường dẫn tuyệt đối" của `suite-system`
   chạy trên chính runner Windows.
6. 🟡 Siết ACL cho `config.cmd` (§5.5).
7. 🟢 Chặn tên project trùng thiết bị DOS (`con`, `nul`, `com1`…) trong `RE_PROJECT_ID` (§3.2).
8. 🟢 Audit `paths.mjs` với hệ thống file không phân biệt hoa-thường (§3.2).
9. 🟢 Rà `slice.py` cho `encoding="utf-8"` (§4.4).

### 9.1 Đã sửa sẵn cho Windows (a–b: đọc mã trước lượt CI đầu; c–e: theo log runner thật)

| # | Chỗ | Vì sao chắc chắn đỏ trên Windows | Đã làm gì |
|---|---|---|---|
| a | `lib/redact.mjs` | §9.5 ở trên | thêm khối gate `win32` |
| b | `test/suite-system.mjs` (3 ca) | Ba ca ghim cứng `~/.kitgen/bin/kitgen update`, `… restart`, `~/.kitgen/update.log`, trong khi `lib/update.mjs` đã có nhánh `IS_WIN` trả `%LOCALAPPDATA%\KitGen\…`. Mã sản xuất **đúng**, ca kiểm mới là chỗ sai | ghim đúng chữ cho **cả hai** nền bằng hằng `CMD_UPDATE` / `CMD_RESTART` / `LOG_UPDATE`; **không** import hằng từ mã sản xuất (import vào thì ca kiểm chỉ còn tự nói với chính nó). Nhánh non-win giữ nguyên từng ký tự |
| c | `scripts/install.ps1` | Lỗi THẬT do vòng 1 của CI bắt được, không phải suy đoán — xem §8.2 | thêm BOM UTF-8 + ASCII hoá 13 dòng chuỗi/nội dung sinh ra + bước CI khẳng định BOM |
| d | `scripts/install.ps1` (PSModulePath + `Get-Sha256`) | Vòng 3: `Get-FileHash` "not recognized" khi installer chạy từ trong PowerShell 7 — xem §8.3.1 | vá `PSModulePath` bằng `$PSHOME\Modules` + tính SHA-256 bằng .NET thuần; CI kiểm cả môi trường sạch lẫn bẩn |
| e | `lib/update.mjs`, `lib/fsx.mjs`, `test-agent.mjs` | Vòng 3: `ENOTEMPTY` khi xoá thư mục vì fd của `update.log` không bao giờ được đóng — xem §8.3.2 | đóng fd sau `spawn`; `removeTree`/`moveTree` thêm retry gate win32; dọn thư mục tạm không được giết bộ ca |
| f | `scripts/install.ps1` (`Invoke-ExeSoft`, `Get-PyVersion`, `[5/8]`) | Vòng 5: `2>$null` + `EAP='Stop'` biến `Traceback` của phép thử import thành lỗi chấm dứt, installer chết trước khi kịp `pip install` — xem §8.4.1 | mọi lệnh "được phép hỏng" đi qua `Invoke-ExeSoft`; chọn Python 3.13→3.12→3.11 rồi mới lui về `py -3` kèm cảnh báo (§8.4.2) |
| g | `lib/run-handle.mjs`, `lib/cover.mjs` | Vòng 5: `'close'` đợi ống stdio đóng, mà trên Windows tiến trình **cháu** thừa kế ống ⇒ pha chạy/job bìa có thể không bao giờ đóng sổ — xem §8.4.3 | gate `win32`: có `'exit'` mà 5s sau chưa `'close'` thì `destroy()` ống rồi đóng sổ, có log nêu lý do |
| h | `test/harness.mjs`, `test-agent.mjs`, workflow | Vòng 5: job 4 treo 74 phút **không một dòng log**; GitHub để job chạy tới 6 tiếng | tường thuật trực tiếp khi có `CI`; đồng hồ chết `KITGEN_TEST_BUDGET_MS` in ca đang kẹt + handle còn sống; `timeout-minutes` cho cả 4 job |

Mọi bản vá phía agent (a, b, e, g, h) đã được đo lại trên macOS: `node agent/test-agent.mjs` → **158/158 PASS · 0 FAIL**.

### 9.2 Điểm phải soi ở lượt CI kế tiếp (chưa có bằng chứng, đừng đoán)

> Lượt 1 (run 31783005598) chết ngay ở job 1 (§8.2) nên job 3 và job 4 **chưa từng chạy** —
> cả bốn điểm dưới đây vẫn chưa có câu trả lời nào.

1. **Quyền tạo symlink của runner.** Hai ca của `suite-paths` gọi `fs.symlink`; Windows đòi
   `SeCreateSymbolicLinkPrivilege`. Job 3 và job 4 đều in một dòng thăm dò
   (`symlink: tao duoc` / `KHONG tao duoc`) **trước** khi chạy bộ ca — nếu hai ca đó đỏ,
   đọc dòng này trước để biết đó là **giới hạn môi trường** hay lỗi port thật.
2. **`shasum` trong Git-Bash** (`build-runtime.sh` dòng 42). Git for Windows có `usr\bin\shasum`
   (bản Perl) nhưng đây là điều **chưa ai kiểm**; bước "Đóng gói bằng Git-Bash" của job 3 sẽ
   trả lời dứt điểm.
3. **`python3` trong Git-Bash.** Engine giả của bộ ca gọi `python3` qua heredoc — đúng cơ chế
   mà máy thật dựa vào shim của installer. Job 4 dựng lại shim y hệt; nếu đỏ ở đây thì
   §7 bước 12 trên máy thật cũng sẽ đỏ.
4. **Đường `codex.cmd`.** CI chỉ chứng minh `winShellOpts()` được gọi đúng chỗ, **không**
   chứng minh Codex thật chạy được trên Windows (§6.4 vẫn là rủi ro số 1).

*(Cập nhật sau vòng 5: điểm 1 và 3 **đã có câu trả lời** — runner tạo được symlink và
Git-Bash thấy `python3` qua shim, job 4 chạy tới được bộ ca. Điểm 2 vẫn treo vì job 3 chưa
đi hết. Bốn câu hỏi MỚI của vòng 6, đọc theo đúng thứ tự này:)*

5. **Bộ ca kẹt hay bò?** Đọc số mili-giây của từng ca trong log job 4 (nay in trực tiếp).
   *Kẹt* = một ca đứng hình rồi đồng hồ chết gọi tên nó ⇒ đọc dòng `handle sống` kèm theo.
   *Bò* = mọi ca đều xong nhưng chậm gấp hàng chục lần macOS ⇒ vấn đề là **số lần spawn**,
   không phải trần thời gian, và phải sửa ở bộ ca chứ không phải ở workflow.
6. **`WIN_PIPE_GRACE_MS` có phải nổ không.** Dòng `tien trinh da thoat nhung ong dan … chua
   dong` xuất hiện = đã bắt được đúng bệnh ống-dẫn-thừa-kế của §8.4.3. **Không** xuất hiện mà
   bộ ca vẫn xanh = giả thuyết đó sai, đừng ghi công nhầm cho bản vá.
7. **`pip install` trên Python của runner.** Bước `[5/8]` nay in nguyên văn lỗi pip. Hỏng vì
   thiếu wheel ⇒ cân nhắc kẹp phiên bản chặt hơn (hoặc ghi vào §6 như một giới hạn đã biết).
8. **Defender.** So thời gian job 4 lượt này với 74 phút của lượt trước để biết phần nào của
   độ chậm là do quét thời gian thực — con số đó cũng chính là thứ **user Windows thật** phải chịu.
