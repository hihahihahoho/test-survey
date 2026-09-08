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
| Runtime riêng | Node 20.19.5 tải từ `nodejs.org/dist` vào `~/.kitgen/tools/node`, Python riêng vào `~/.kitgen/tools/python`, Codex CLI qua `npm --prefix ~/.kitgen/tools` |
| Workspace | `~/KitGen` — `projects/`, `.kitgen/engine`, `.kitgen/config.json`, `.venv` (chỉ `pillow`) |
| Engine | `gen.sh` + `cover.sh` (bash, gọi `codex exec`), `slice.py` / `geometry.py` / `validate_output_geometry.py` (python3). KHÔNG có file node nào (khung xương bỏ 27/08/2026) và không có tầng tách nền (`slice.py` chỉ cắt, 07/09/2026) |
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
| Windows **không có lệnh tên `python3`** (python.org cài `python.exe` + `py.exe`) | khối `python3 - <<'PY'` của `gen.sh` chết ⇒ không có prompt nào được dựng | installer sinh **shim `%LOCALAPPDATA%\KitGen\bin\python3`** — một shell script **không đuôi file** mà bash chạy được, `exec` thẳng `python.exe` của venv. Agent thì dùng `KITGEN_PYTHON` (đường dẫn tuyệt đối), không dùng shim |

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
| ~~`agent/lib/doctor.mjs` — dò `@resvg/resvg-wasm`~~ | KHÔNG CÒN (07/09/2026): `rendererInfo`/`resvgAnchorDirs` đã xoá, `doctor` không còn trả khoá `renderer` |
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

### 4.4 🔴 ĐÃ XẢY RA THẬT (không còn là "cần kiểm") — `open()` của Python và bảng mã locale

> **Vòng 7 đã trả lời câu hỏi này bằng máu**: `UnicodeDecodeError: 'charmap' codec can't decode
> byte 0x8f` ngay dòng đầu của engine, kéo theo **10 ca đỏ** trong job 4 (§8.5.2).
> Agent nay tiêm `PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8` cho **mọi** tiến trình Python trên
> Windows (`platform.mjs :: pythonEnv`), nên `slice.py` chạy **qua agent** đã an toàn.
> Phần dưới vẫn còn nguyên giá trị cho người chạy `python slice.py` **bằng tay**.

Chưa rà từng dòng (file đang có agent khác sửa). Cần kiểm ở §7 bước 7:

- có mở file bằng `open(path)` **không** `encoding="utf-8"` không? Windows mặc định
  `cp1252`/`cp1258` ⇒ tên tiếng Việt trong `styles.json` sẽ vỡ. `json.load(open(...))`
  trong `gen.sh` dòng 24 chính là ca này. **← ĐÃ NỔ, xem §8.5.2.**
  Chiều ngược lại cũng vậy: `print("→ …")` ra stdout CP1252 = `UnicodeEncodeError`.
- có hard-code `/` trong đường dẫn ghi ra không (Python xử lý được `/` trên Windows nên
  thường vô hại).
- có gọi `os.rename` đè lên file đang tồn tại không (`os.rename` trên Windows **ném lỗi**
  nếu đích tồn tại; phải là `os.replace`). Bản hiện tại của `cover.sh` và `thumbs.mjs`
  đều đã dùng `os.replace` — tốt.

### 4.5 🔴 CHẶN CỨNG — `print()` của Python trên Windows đẻ ra `\r` trong TÊN JOB

**Đây không phải suy đoán: đã đo trên runner** (run 31987956355, bước "Bàn mổ engine giả").
`gen.sh` lấy danh sách job từ Python:

```bash
# gen.sh dòng 512 — nguyên văn hôm nay
done < <(python3 -c "
import json
cfg = json.load(open('styles.json', encoding='utf-8'))
...
        print(f\"{s['id']}-{sh['id']}\")")
```

`print()` dịch `"\n"` thành `"\r\n"` trên Windows **kể cả khi stdout là pipe** (đó là mặc
định `newline=None` của `TextIOWrapper`, không liên quan gì tới `PYTHONUTF8`). Bash đọc từng
dòng, `\r` **ở lại cuối tên job**. Engine in ra:

```
prompt → prompts/tet-main<CR>.txt (+1 ảnh kèm)
OK  tet-main<CR>  8.0K
```

Hậu quả **trên máy người dùng Windows**:

* mọi so khớp tên job trong `gen.sh` (`match "$job"`, `case`…) **âm thầm trượt** — đúng kiểu
  lỗi tệ nhất: không báo gì, chỉ làm sai;
* `prompts/<job><CR>.txt`, `logs/<job><CR>.log`, `raw/<job><CR>.png` — tên file mang ký tự
  điều khiển, mà Win32 **cấm** ký tự 0–31 trong tên file;
* phía agent, mẫu `prompts/(\S+)\.txt` không khớp ⇒ job **không bao giờ** chuyển sang
  "running" ⇒ giao diện đứng im ở "đang chờ" suốt cả lượt gen.

**Bản vá cho engine — một từ:**

```bash
# gen.sh dòng 512: thêm  | tr -d '\r'  vào cuối lệnh python
done < <(python3 -c "
...
        print(f\"{s['id']}-{sh['id']}\")" | tr -d '\r')
```

Áp cùng cách cho mọi chỗ khác đọc output của Python bằng bash (kiểm cả `cover.sh`).
**Đã áp sẵn cho hai fixture** `agent/test-fixtures/engine-fake|engine-stepped/gen.sh` — fixture
phải giữ đúng hình dạng của bản thật, kể cả bản vá.

> Phía agent **không** ngồi đợi engine: `parseGenLine` nay chịu được `\r` (mẫu chấp nhận
> `\r?` trước `.txt`, và mọi tên job bắt được đều đi qua `cleanJobName`). Có ca kiểm chạy
> trên **cả hai nền** khoá lại điều đó — xem §8.7.2. Nhưng agent chỉ chữa được phần agent
> đọc; những chỗ `gen.sh` tự so khớp tên job thì chỉ engine mới chữa được.

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
5. **Python** — venv `.venv\Scripts\python.exe`, `pip install pillow` (chỉ pillow từ
   07/09/2026), và sinh **shim `bin\python3`** (LF, không BOM) cho Git-Bash.
6. **Codex CLI** — ưu tiên `codex` đã có trên PATH; nếu không thì
   `npm --prefix <tools> install @openai/codex`. (Bước cài `@resvg/resvg-wasm` đã bỏ.)
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
| 6 | Quan sát khối **[6/8]** | `OK Codex …` | `THIEU` ⇒ npm bị proxy chặn. (Dòng `Trinh render khung xuong` đã bỏ cùng `@resvg/resvg-wasm`.) |
| 7 | Quan sát khối **[8/8]** | `OK dang ky chay khi dang nhap (Startup)` và `OK agent phan hoi tai http://127.0.0.1:8765/health` | `agent chua phan hoi sau 15s` ⇒ mở `%LOCALAPPDATA%\KitGen\agent.log`. **Nếu log RỖNG hoàn toàn ⇒ nghi ngay lỗi §3.1 dòng `import.meta.url`** |

### Kiểm chức năng

| # | Việc | Điểm quan sát | Lỗi có thể gặp |
|---|---|---|---|
| 8 | Mở trình duyệt: `http://127.0.0.1:8765/app/` | Giao diện KitGen hiện ra, **không** trắng trang | Trắng trang ⇒ bundle `app/` không được phục vụ, xem log |
| 9 | Vào **Cài đặt → Giới thiệu / Doctor**, xem bảng môi trường | `python` phải `ok: true` + version (`deps.pillow: true`); `codex` có version; `imageGen.mode` phải là `default-home` | ⚠️ **`imageGen.mode = "unavailable"` là rủi ro số 1** (§6.4). Chép lại đúng `reason` (`NO_CODEX` / `NOT_LOGGED_IN` / `FEATURE_OFF` / `UNKNOWN`) |
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

> **VÒNG 7 ĐÃ TRẢ LỜI (đọc trước khi tin đoạn dưới).** Bộ ca chạy trọn 142/158 và **không
> có một dòng `tien trinh da thoat nhung ong dan … chua dong` nào** trong log job 4 ⇒ lưới
> an toàn ống-dẫn **CHƯA TỪNG NỔ**, và cái treo 74 phút của vòng 5 **không phải** do nó.
> Nguyên nhân thật của lượt treo hoá ra là engine chết vì mã hoá (§8.5.2) làm mọi ca có
> spawn phải chờ hết trần rồi mới bỏ, cộng độ chậm của Defender. Giữ lại bản vá vì lập luận
> vẫn đúng (ống thừa kế là chuyện có thật trên Windows) và giá của nó bằng không, nhưng
> **không được ghi công cho nó** — nó là bảo hiểm chưa dùng tới, không phải bản sửa lỗi.

**Nghi can (đọc mã, đến vòng 8 vẫn CHƯA có bằng chứng từ runner):** `child.on("close")` là đường
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

### 8.5 Vòng 7 (run 31793695016) — job 3 gần xong, và bộ ca **lần đầu chạy trọn**

Job 1+2 xanh. Job 3 **"Cài lần 1" XANH TRỌN VẸN**: checklist máy-thiếu-Codex đúng, `py -3.13`
được chọn đúng, `[5/8]` qua sạch. Job 4 hết treo — đồng hồ chết và tường thuật trực tiếp chạy
đúng thiết kế: **142/158 PASS · 16 FAIL, mỗi ca có tên và có số mili-giây**. Từ chỗ "một tờ
giấy trắng 74 phút" tới chỗ "16 câu hỏi cụ thể" chỉ mất một lượt.

#### 8.5.1 🔴 Dấu nháy kép trong tham số lệnh ngoài — `[eval]:1`

`install.ps1:376`, chỉ nổ ở **lần cài thứ hai** (khối này chỉ chạy khi `node.exe` đã có sẵn,
nên máy trắng không bao giờ đi vào):

```powershell
$major = & $nodeExe -p 'Number(process.versions.node.split(".")[0])' 2>$null
```

Hai quả mìn chồng lên nhau:

1. **PS 5.1 không escape dấu `"` khi dựng dòng lệnh cho tiến trình con.** Node nhận được
   `…split(.)[0]…` ⇒ SyntaxError của chính node, in ra `[eval]:1`. Cách chắc chắn không phải
   là escape cho khéo mà là **đừng bao giờ để dấu `"` trong tham số lệnh ngoài**: hỏi node
   chuỗi phiên bản trần (`-p process.versions.node`) rồi tách ở phía PowerShell.
2. `2>$null` biến SyntaxError kia thành **lỗi chấm dứt** — đúng căn bệnh §8.4.1, lần này
   không phải do người viết bất cẩn mà do **cả file chưa có luật**.

Nên vòng 8 đặt luật, và giao cho máy canh:

* mọi lệnh ngoài đi qua `Invoke-Exe` (bắt buộc xanh) / `Invoke-ExeSoft` (được phép hỏng) /
  `Invoke-ExeCapture` (cần stdout). Ngoại lệ duy nhất là ruột ba hàm đó, đánh dấu `# NATIVE-OK`;
* bước CI **"Luật gọi lệnh ngoài trong install.ps1"** bắt cả hai luật (gọi thẳng, và dấu `"`
  trong tham số). Đã thử ngược: dựng lại đúng hai dòng đã gây đỏ ở vòng 5 và vòng 7 thì bước
  này đỏ đúng cả hai dòng, đúng số hiệu dòng.

Cùng lượt quét ấy còn tìm ra **ba quả mìn chưa nổ**: `codex --version 2>$null` (bước `[6/8]`,
sẽ chết đúng kiểu này với một bản Codex hỏng) và hai lời gọi `npm install` (npm in warning ra
stderr như cơm bữa). Cả ba nay đi qua hàm bọc.

#### 8.5.2 🔴 10/16 ca đỏ chỉ vì MỘT dòng: `open()` của Python không mặc định UTF-8

Chứng cứ nằm trong `errorTail` của ca [110]:

```
UnicodeDecodeError: 'charmap' codec can't decode byte 0x8f in position 627
    return codecs.charmap_decode(input, self.errors, decoding_table)[0]
```

`charmap` = bảng mã **CP1252 của locale Windows**. `open(path)` của Python **không** mặc định
UTF-8, nó dùng bảng mã locale; mà `styles.json`, `contract.json`, `manifest.json` đều là UTF-8
và đều có tiếng Việt ⇒ `json.load(open('styles.json'))` — dòng ĐẦU TIÊN của engine — nổ ngay.
Chiều ngược lại cũng hỏng: `print("→ kits/manifest.json")` ra stdout CP1252 = `UnicodeEncodeError`.

Engine chết ở dòng đầu ⇒ không job nào được liệt kê ⇒ **mọi ca có spawn engine đều đỏ**, mỗi ca
theo một kiểu khác nhau ("có job.started", "expected [tet-main.png], got []", "hết 20000ms khi
chờ: 2 tấm xong", "bìa bắt đầu vẽ"…). Đây cũng chính là lời giải thích cho **74 phút của vòng 5**:
không phải kẹt, mà là mười mấy ca lần lượt chờ hết trần rồi mới chịu bỏ.

Vá: `pythonEnv()` trong `platform.mjs` — `PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8`, gate `win32`,
gắn vào **mọi** chỗ spawn Python (gen.sh và cover.sh qua `buildCommand`/`drawOnce`, `slice.py`,
công cụ đọc `contract.json`, `thumbs.mjs`, `doctor.mjs`). UTF-8 Mode đổi mặc định cho cả tiến
trình nên vá được luôn `slice.py` thật mà không phải sửa từng lời gọi `open()`.

**ĐÃ CHỨNG MINH TRÊN macOS bằng phép A/B**, không phải suy đoán — vì locale mới là thứ quyết
định, không phải hệ điều hành:

| | lệnh | kết quả |
|---|---|---|
| A | `LC_ALL=C PYTHONUTF8=0 node agent/test-agent.mjs` (vá vẫn gate win32) | **148/158 · 10 FAIL** — đúng 10 ca engine, đúng thông điệp (`ascii_decode` thay cho `charmap_decode`), đúng các dòng "hết 20000ms khi chờ" như runner |
| B | y hệt A nhưng bỏ gate của `pythonEnv()` | **158/158 · 0 FAIL** |

> `slice.py` thật vẫn nên ghi rõ `encoding="utf-8"` ở từng `open()` (§4.4) — cho người chạy tay
> ngoài agent. Biến môi trường là lớp chắn, không phải lời bào chữa.
> Fixture trong `agent/test-fixtures/` **cố ý giữ nguyên** `open()` trần: nó đang phản chiếu
> đúng `slice.py` thật, sửa fixture cho đẹp là **giấu mất** lỗi của bản thật.

#### 8.5.3 🔴 `taskkill` thiếu `/F` = nút Dừng chỉ là lời hứa

Ba ca còn lại (`state.jobs khi đang chạy`, `dừng run đang chạy`, `[C-01] xoá project khi đang
chạy`) hết giờ vì lượt chạy **không bao giờ chuyển sang `cancelled`**. Nguyên nhân nằm ở
`killTree`: `taskkill /PID <pid> /T` **không kèm `/F`** chỉ POST `WM_CLOSE` tới **cửa sổ** của
tiến trình. `bash.exe`, `python.exe`, `codex`, `sleep` là tiến trình **console không có cửa sổ**
⇒ taskkill in "SUCCESS: Sent termination signal" rồi không có gì xảy ra cả.

Hậu quả **trên máy người dùng**, không chỉ trong test: bấm Dừng, UI báo đã dừng, engine chạy
tiếp và **vẫn đốt quota** — đúng cái mà `/T` sinh ra để tránh. Đường `DELETE project` còn tệ
hơn nửa: nó `cancel({ waitMs: 5000 })` nên phải đợi hết 5s rồi mới leo thang `/F`.

Thêm `/F` **không hề mạnh tay hơn mã cũ**: `child.kill("SIGTERM")` của Node trên Windows vốn
đã gọi thẳng `TerminateProcess` — Windows không có tín hiệu để mà lịch sự. Bản thiếu `/F` mới
là bản **yếu hơn** mã cũ, và đó chính là lỗi. Nay `taskkillArgs()` luôn trả `/T /F`.

Khoá lại bằng ca chạy **trên cả hai nền** (`suite-system`, nhóm "dừng lượt chạy"): đây là một
**quyết định**, không phải hành vi phụ thuộc máy. Đã chứng minh ca này bắt được lỗi: bỏ `/F` đi
thì **158/159**, trả lại thì **159/159**.

#### 8.5.4 🟡 Hai ca dọn dẹp và một nhãn đường dẫn

* **`ENOTEMPTY` khi dọn thư mục tạm CỦA CHÍNH BỘ CA** (`kitgen-bundle-*/js`,
  `kitgen-vite-*/assets`). Retry của `fsx.mjs` (§8.3.2) chỉ chữa **mã sản xuất**; các suite tự
  gọi `rm()` trần thì không ai đỡ. Mọi khẳng định trong hai ca đó đều đã xanh — thứ giết ca là
  **cái chổi**. Nay có `rmTemp()` dùng chung trong `harness.mjs`: retry 10×100ms và **không bao
  giờ ném** (dọn dẹp không phải một khẳng định; hụt thì in cảnh báo).
* **`~/.codex` vs `~\.codex`.** `shortenPath` rút `C:\Users\<ai đó>\.codex` thành `~\.codex` —
  **đúng** cho người dùng Windows; chỗ sai là ca kiểm ghim cứng dấu `/`. Ghim đúng chữ cho cả
  hai nền như §9.1-b. (`~/.codex-img` ở ca ngay trên **không** đổi: nó là chuỗi người dùng tự
  nhập, lưu nguyên văn trong config, không đi qua phép rút gọn nào — khác biệt này chính là
  thứ khẳng định chẩn đoán đúng.)

### 8.6 Vòng 9 (run 31986200079) — installer chạy TRỌN 8 bước lần đầu tiên

`PYTHONUTF8` quét sạch đúng 10 ca mã hoá mà phép A/B ở §8.5.2 đã dự đoán, `taskkill /F`
gỡ nốt ba ca dừng-run. **Job 3 "Cài lần 1" VÀ "Cài lần 2" đều xanh** — `install.ps1` lần đầu
đi hết `[1/8] → [8/8]` trên một máy Windows thật, kể cả `npm install @resvg/resvg-wasm` thật.
Job 4: **154/161 · 7 FAIL**, và bộ ca chạy hết trong **108 giây** (so với 74 phút của vòng 5).
Con số đó chôn luôn giả thuyết "Windows chậm gấp hàng chục lần": Windows **không** chậm; cái
chậm của vòng 5 là hàng loạt ca ngồi chờ hết trần vì engine chết từ dòng đầu.

#### 8.6.1 🔴 `shasum` KHÔNG có trong Git for Windows — câu hỏi §9.2-2 đã có đáp án

Job 3 nay chỉ còn chết ở đúng bước cuối:

```
xargs: shasum: No such file or directory
##[error]Process completed with exit code 127.
```

`shasum` là script Perl có trên macOS và hầu hết bản Linux; Git for Windows **không đóng gói
nó**, chỉ có `sha256sum.exe`. `build-runtime.sh` gọi thẳng `shasum -a 256` ở hai chỗ (manifest
từng file, và checksum của tarball) ⇒ **không đóng gói được bản phát hành từ máy Windows**.

Vá: chọn công cụ theo máy — thử `shasum` TRƯỚC (macOS/Linux chạy đúng công cụ cũ, gói phát
hành không đổi một byte), rồi `sha256sum`, không có cả hai thì báo lỗi rõ ràng. Hai công cụ in
**cùng một định dạng** `<64 hex>␠␠<đường dẫn>` mà `install.sh`/`install.ps1` đang parse —
**đừng bao giờ thêm cờ `-b`**, nó đổi dấu phân cách thành `␠*` và installer sẽ báo "manifest
hỏng" trên máy người dùng chứ không phải ở CI. Bước CI nay khẳng định luôn cả hai điều đó: mọi
dòng khớp `^[0-9a-f]{64}  \./`, và băm lại toàn bộ gói vừa dựng để đối chiếu.

Đã đo trên macOS: gói dựng lại đúng **193 file**, mọi dòng đúng định dạng, `shasum -c` khớp 193/193.

#### 8.6.2 🔴 5 ca đỏ cùng một câu: "engine chạy xong mà agent bảo không có ảnh"

`[111]` thiếu pha 2, `[112]` không thấy artifact giữa lượt, `[113]` `failSummary` ra
**`3/3 job không ghi được ảnh`**, `[118]` `0 tấm ok`, `[119]` `done-with-errors`.

Hai điều mà log **đã** chứng minh, không phải đoán:

* ca `[111]` **qua được** hai khẳng định đứng trước chỗ đỏ — `job.done ok` và `job.done failed`
  đều có ⇒ agent **đọc và tách đúng** dòng `OK  tet-main  8.0K` của engine ⇒ **không có CR**
  của CRLF trong tên job;
* ca `[114]` (`styles.json thu hẹp`) **xanh**, mà nó khẳng định `raw/` chứa **đúng**
  `["tet-main.png"]` ⇒ engine **có ghi file**, **đúng tên**.

Còn lại đúng một mắt xích: `attachArtifact()`, nơi luật "phán theo SẢN PHẨM" so
`mtime(raw/<job>.png)` với `Date.now()` lúc mở lượt. **Hai con số đó đến từ hai nguồn khác
nhau** và chỉ trùng nhau trên máy hiền:

| nền | mtime lấy từ đâu | rủi ro |
|---|---|---|
| macOS/Linux + APFS/ext4 | cùng đồng hồ với `Date.now()` | ~0 |
| Windows + NTFS | đồng hồ hệ thống **được cache** (tick ~15,6ms), còn `Date.now()` của Node dùng `GetSystemTimePreciseAsFileTime` | lệch không có trần bảo đảm, nhất là trên máy ảo |
| FAT32/exFAT (ổ USB — workspace của user hoàn toàn có thể nằm đó) | độ phân giải **2 GIÂY**, làm tròn xuống | luôn lệch tới 2s |

Vá: lấy mốc bằng **chính hệ thống file** — chạm một file `.kitgen-t0` trong `runs/<id>/` rồi đọc
`mtime` của nó, nên hai vế cùng nguồn, cùng độ phân giải; cộng 2s nhân nhượng cho FAT. Gate
`win32`: darwin/linux vẫn so nguyên văn như cũ (`t0ms` ở đó không ai đọc, và cũng không sinh
file mốc nào).

> **⛔ GIẢ THUYẾT NÀY ĐÃ CHẾT — VÒNG 10 ĐO ĐƯỢC SỐ THẬT, VÀ NÓ NÓI KHÔNG.**
> Bước "Bàn mổ engine giả" chạy trên runner (run 31987956355) in ra:
>
> ```
> t0 dong ho JS   : 1786933608039
> t0 he thong file: 1786933608039.9346  lech(ms) = -0.9345703125
>     "tet-main.png"  | LUAT CU floor(mt/1000)>=floor(t0/1000) -> true | mt-t0wall=331ms
> ```
>
> Lệch **0,93 mili giây**, và **luật cũ đã `true`** cho cả ba file. Không có lệch đồng hồ nào
> hết. Bản vá `stampT0`/`WIN_MTIME_GRACE_MS` **đã bị gỡ bỏ hoàn toàn** ở vòng 10 — không giữ
> lại "cho chắc": mã chết là mã nói dối người đọc sau, và một khoản nhân nhượng 2 giây còn
> có thể che mất một lỗi ôi thiu thật. Nguyên nhân thật ở §8.7.
> *(Rủi ro FAT32/exFAT 2 giây trong bảng trên vẫn đúng về lý thuyết nhưng CHƯA ai gặp —
> nếu có người dùng để workspace trên USB và báo lỗi, hãy quay lại đọc đúng đoạn này.)*

#### 8.6.3 🟡 Hai ca bundle: từ "đỏ vì ENOTEMPTY" thành "hết 25000ms" — cái chổi ăn hết ngân sách

`rmTemp()` của vòng 8 dùng `maxRetries: 10, retryDelay: 100`. Nghe thì nhỏ, nhưng công thức
giãn của Node là **`delay = lần_thử × retryDelay`** (đọc thẳng `internal/fs/rimraf`):
`100+200+…+1000 = 5,5s` **cho mỗi thư mục còn kẹt handle**, và mỗi lần thử lại còn **đi lại
toàn bộ cây**. Hai ca bundle vì thế đổi kiểu chết chứ không hết đỏ.

Dọn dẹp không đáng một xu nào trong ngân sách của ca: nay `maxRetries: 3, retryDelay: 50`
(≈300ms) **và** một trần cứng 3s bằng `Promise.race`. Hụt thì bỏ — thư mục tạm nằm ở `%TEMP%`,
runner tự xoá. Thêm một dòng `⏱ dọn … mất Xms` khi vượt 500ms: đó là cách **duy nhất** để đọc
log runner mà phân biệt được "ca chậm vì thân ca" với "ca chậm vì cái chổi" — nếu vòng sau hai
ca này vẫn đỏ ở 25s mà không có dòng `⏱`, thì thủ phạm nằm trong thân ca và ta biết ngay.

### 8.7 Vòng 10 (run 31987956355) — bàn mổ trả lời, và câu trả lời không phải cái tôi đoán

Hai ca bundle **xanh** (trần 3s của cái chổi ăn — §8.6.3 đúng). Còn 5 ca engine. Và bước
"Bàn mổ engine giả" đã làm đúng việc nó sinh ra để làm: **giết một giả thuyết sai của chính
tôi trong một lượt**, thay vì để nó sống thêm ba vòng nữa.

#### 8.7.1 🔴 SIGPIPE: `tar | head` giết cả bước, vì runner chạy bash với `-e -o pipefail`

Job 3 đổi kiểu chết: `exit 127` (thiếu `shasum`, đã vá) → **`exit 141`**. 141 = 128+13 = SIGPIPE.
Thủ phạm là một dòng **của chính tôi**, viết từ vòng 0 và **chưa bao giờ chạy tới** vì các
vòng trước đã chết sớm hơn:

```bash
tar -tzf "$tmp/winbuild/....tar.gz" | head -20
```

`head` đóng ống sau 20 dòng → `tar` ăn SIGPIPE → thoát 141. Runner chạy `shell: bash` bằng
`bash --noprofile --norc -e -o pipefail {0}`, mà `pipefail` lấy mã thoát **khác 0 cuối cùng
trong ống**, nên cả BƯỚC đỏ vì một lệnh chỉ để *ngó*. Tái dựng được ngay trên macOS:

```
$ bash -c 'set -e -o pipefail; seq 1 5000000 | head -20 >/dev/null; echo khong chet'
exit=141
```

*(Vì sao 193 dòng không nổ mà runner nổ: nếu output vừa trong bộ đệm ống 64KB thì `tar` viết
xong trước khi `head` đóng — cái bẫy này **chỉ nổ khi output đủ dài**, tức là đúng loại bẫy
nằm im tới ngày gói lớn lên.)*

Vá: ghi danh sách ra file rồi `head` file — không còn ống dẫn nào để mà vỡ. Đã quét cả
workflow: đây là chỗ **duy nhất** có `| head` / `| grep -q` trong các bước `shell: bash`.

#### 8.7.2 🔴 Nguyên nhân thật của 5 ca: `\r` trong tên job (§4.5)

Bàn mổ in ra nguyên văn:

```
stdout (JSON, thay CR neu co):
    "prompt → prompts/tet-main\r.txt (+1 ảnh kèm)"
    "OK  tet-main\r  8.0K"
    "prompt → prompts/tet-bg-home\r.txt (+1 ảnh kèm)"
    "OK  tet-bg-home\r  8.0K"
    "prompt → prompts/tet-props.txt (+1 ảnh kèm)"     ← job CUỐI không dính \r
```

`print()` của Python dịch `\n` → `\r\n` trên Windows kể cả khi stdout là pipe. Chi tiết đầy
đủ và bản vá cho engine: **§4.5** (đó là nơi engine owner đọc). Ba hệ quả đo được:

1. mẫu `prompts/(\S+)\.txt` của `parseGenLine` **không khớp** dòng có `\r` ⇒ chỉ job cuối
   cùng phát `job.started` ⇒ giao diện đứng im ở "đang chờ";
2. trong fixture, `case "$j" in *bg-home)` **không khớp** `tet-bg-home\r` ⇒ job cố ý-lỗi lại
   thành công ⇒ `failSummary` đếm sai — đúng triệu chứng `3/3` thay vì `1/3` của ca [113];
3. tên file mang ký tự điều khiển, mà Win32 **cấm** ký tự 0–31 trong tên file.

Vá ở **hai lớp, mỗi lớp một lý do**:

* **engine** (`| tr -d '\r'`, đã áp cho hai fixture, còn `gen.sh` thật là món nợ §4.5) — vì chỉ
  engine mới chữa được những chỗ chính nó so khớp tên job;
* **agent** (`parseGenLine` chịu được `\r`, mọi tên job đi qua `cleanJobName`) — vì agent
  **không được phép** tin rằng engine in ra dòng sạch. Khoá bằng ca kiểm chạy trên **cả hai
  nền**; đã chứng minh nó bắt được lỗi: trả mẫu về bản cũ thì **161/162**, vá lại thì **162/162**.

> **Tôi cố ý KHÔNG sửa fixture cho vừa lòng bộ ca.** Fixture là bản sao hình dạng của engine
> thật; nếu chỉ sửa fixture thì bộ ca xanh còn sản phẩm vẫn hỏng — đúng cái bẫy đã ghi ở
> §8.5.2. Vì thế bản vá fixture đi **kèm** §4.5 cho bản thật, và kèm lớp phòng thủ phía agent
> có ca kiểm riêng.

#### 8.7.3 Vẫn còn một khoảng tối — và lần này tôi đặt đèn thay vì đặt giả thuyết

Với `\r`, ba dữ kiện dưới đây **không thể cùng đúng**, và tôi chưa có cách giải thích chúng
bằng suy luận nữa:

* bàn mổ: `raw/` có **3 file, tên SẠCH** (`"tet-main.png"`…), mtime tươi, luật cũ `true`;
* bộ ca: `failSummary` = **`3/3 job không ghi được ảnh`**, tức `attachArtifact` không thấy file nào;
* ca `[114]` (một job duy nhất, job cuối ⇒ không dính `\r`) thì **xanh**.

Nên vòng này thêm bước **"Khám nghiệm workspace tạm"**: `KITGEN_TEST_KEEP_TMP=1` giữ workspace
lại, rồi in ra **từ đĩa** — cây thư mục từng project với tên file dạng JSON (lộ ngay `\r` hay
ký tự PUA nếu có), và từng `run.json` (job / status / diagnosis / artifact / errorTail) kèm câu
trả lời `raw/<job>.png` **có tồn tại hay không**. Chạy `if: always()`, không bao giờ làm đỏ job.
Nếu bản vá `\r` là đủ thì vòng sau 5 ca xanh và bước này chỉ để đọc cho vui; nếu chưa đủ, nó
chỉ thẳng vào chỗ lệch mà không cần thêm một vòng đoán nào.

### 8.8 Vòng 11 (run trên b0487e6) — hai lỗi cuối, và cả hai đều là "im lặng"

Bản vá `\r` ăn đúng ba ca ([118] dừng, [119][120] chạy tiếp **xanh trên Windows**), và bước
**"Khám nghiệm workspace tạm"** — cái đèn đặt vòng trước — trả lời luôn khoảng tối §8.7.3
ngay dòng đầu tiên nó in ra:

```
=== project chay-thu-engine-0e83 ===
  raw/: "tet-main.png" "tet-tall.png"
  kits/: "manifest.json" "tet"
  run r-0001 status=done-with-errors failSummary="1/3 job không ghi được ảnh"
    job "tet-main"    status=ok     artifact=co   | raw/<job>.png TON TAI
    job "tet-tall"    status=ok     artifact=co   | raw/<job>.png TON TAI
    job "tet-bg-home" status=failed artifact=khong| raw/<job>.png KHONG TON TAI
      errorTail: ["codex: command not found (…)","rc=127 — ảnh không được ghi mới"]
```

`1/3` chứ không còn `3/3`; job cố-ý-lỗi lại lỗi đúng như thiết kế. **§8.7.2 đúng, và mâu
thuẫn ba-dữ-kiện của §8.7.3 tan** — nó chỉ là hệ quả muộn của cùng một `\r`. Hai ca còn đỏ
hoá ra là **lỗi khác hẳn**, trước giờ bị `\r` che mất.

#### 8.8.1 🔴 `walkFiles` trả dấu `\`, cả thế giới phía sau nói `/`

```
[112] gen → auto-slice … FAIL — mỗi file biết sheet nguồn
[113] cắt lũy tiến    … FAIL — expected ["main","tall"], got ["main",null,"tall"]
```

Cái `null` chen giữa hai tên sheet là toàn bộ manh mối. `routes/files.mjs` (#42, danh mục
kit) lấy đoạn tương đối bằng `abs.slice(vdir.length + 1)` — mà `walkFiles` trả đường dẫn
**của hệ điều hành**. Trên Windows, `kits/tet/tight/01-btn.png` ra thành `tight\01-btn.png`,
rồi ba dòng ngay sau đó đều nói tiếng POSIX:

| dòng | làm gì | trên Windows |
|---|---|---|
| `bare.lastIndexOf("/")` | cắt lấy tên cơ sở để đối chiếu `manifest.json` | trả `-1` ⇒ khoá là `tight\01-btn`, **không khớp** `01-btn` ⇒ `sheet: null` |
| `` path: `kits/${variant}/${name}` `` | chuỗi trả cho web để nạp ảnh | `kits/tet/tight\01-btn.png` — nửa POSIX nửa Windows |
| `f.file.startsWith("tight/")` (ca kiểm) | nhận ra bản ôm sát | sai |

Chỉ file **trong thư mục con** dính; file nằm ngay trong `kits/<variant>/` không có dấu phân
cách nào nên vẫn khớp — nên `sheets` ra `["main", null, "tall"]`: hai tên thật của lớp trên,
một `null` gộp từ toàn bộ `tight/`. Với người dùng thật: **mọi ô bản ôm sát rơi hết vào nhóm
"Khác"** trên lưới web, và đường copy sang Figma mất hình học của chúng. Không có lỗi nào nổ
ra — đây đúng loại hỏng mà chỉ có bộ ca mới nhìn thấy.

Vá bằng một hàm có tên gọi, `relPosix(base, abs, s = sep)` trong `lib/paths.mjs`, chứ không
phải `.split("\\").join("/")` rải rác: `s` mặc định là `sep` của máy đang chạy, nên trên
darwin/linux nó là `split("/").join("/")` — **đồng nhất từng ký tự, kể cả với tên file có
chứa dấu `\`** (thứ mà idiom `split("\\")` sẽ âm thầm sửa hộ). Tham số `s` tồn tại để ca
kiểm ép được ngữ nghĩa Windows ngay trên máy Mac; đã chứng minh nó bắt được lỗi: trả về
`slice` trần thì **164/165**.

> `lib/fsx.mjs:100` (`dirStatsByGroup`) đã dùng đúng `split(sep)` từ đầu — nên đây không phải
> luật mới, chỉ là một chỗ sót. Đã quét cả bảy nơi gọi `walkFiles`: đó là chỗ **duy nhất** còn
> lại đưa đoạn tương đối chưa chuẩn hoá ra khỏi agent.

#### 8.8.2 🔴 `sha256sum` của Git-Bash đọc BINARY, nên nó in `*` chứ không phải hai dấu cách

Job 3 lần đầu **dựng xong tarball trong Git-Bash** (206 mục, 963 KB) rồi chết ở phép thử
định dạng — tức là chết ở chỗ tôi đặt bẫy sẵn, đúng như mong muốn:

```
##[error] manifest.sha256 sai dinh dang o 193 dong
1fedc34dc7434ab810ea93890da0967f2da8ca1a36e921345733f4953c56de7c *./VERSION
```

Ký tự thứ 66 là dấu hiệu **chế độ đọc**: `*` = binary, `␠` = text. `shasum` trên macOS/Linux
mặc định text nên in hai dấu cách; `sha256sum` của Git for Windows mặc định binary nên in
`␠*`. Ghi chú tôi viết ở vòng 9 — *"cả hai in cùng một định dạng"* — **sai**, và may là bước
CI này nghiêm khắc hơn ghi chú đó.

Cả hai trình cài hiện tại **vẫn chạy được** với dạng `*` (`install.sh` dùng `shasum -c`, còn
regex của `install.ps1` đã có sẵn `\*?`). Nhưng để yên thì gói dựng từ Windows và gói dựng từ
Mac có manifest **khác byte cho cùng một cây file** — và ngày nào đó sẽ có kẻ parse bằng
`cut -d' ' -f3`. Nên: chuẩn hoá về **một** dạng.

Vá là `sha256_text()` — một `sed` neo vào `^<64 hex>␠\*`. Điều quan trọng là **cái gì KHÔNG
bị đụng tới**: băm vẫn tính trên byte thô, vì cờ `-t` mới là thứ nguy hiểm (trên Cygwin nó có
thể dịch CRLF và làm **sai băm của file nhị phân**). Ở đây chỉ đổi đúng một ký tự đánh dấu
trong văn bản đầu ra. Trên POSIX — nơi `*` không bao giờ xuất hiện — `sed` là no-op; đã dựng
lại gói thật trên macOS để chắc: 193 file, 0 dòng sai định dạng, `shasum -c` khớp 193/193.

Còn một câu hỏi tôi **không trả lời được từ máy này**: `sha256sum -c` trên Git-Bash đọc dấu
hai-dấu-cách là "text mode" — nếu MSYS thật sự dịch CRLF ở chế độ đó thì việc chuẩn hoá sẽ
làm hỏng phép đối chiếu file nhị phân. Cygwin gắn ổ ở chế độ binary nên gần như chắc chắn hai
chế độ trùng nhau, nhưng "gần như chắc chắn" không phải là đo. Nên bước CI nay in thẳng
**16 ký tự đầu của băm ở chế độ binary và ở chế độ text** cho cùng một file `.tar.gz`. Bằng
nhau ⇒ xong chuyện. Khác nhau ⇒ phải quay lại nới luật định dạng thay vì chuẩn hoá — và số
đo sẽ nằm sẵn trong log, không cần thêm một vòng nào.

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
| i | `scripts/install.ps1` + bước CI mới | Vòng 7: dấu `"` trong tham số lệnh ngoài ⇒ node báo `[eval]:1`; `2>$null` biến nó thành lỗi chết — xem §8.5.1 | ba hàm bọc `Invoke-Exe*` là đường **bắt buộc**; bỏ hết dấu `"` khỏi tham số; bước CI canh cả hai luật, đã thử ngược bằng chính hai dòng lịch sử |
| j | `lib/platform.mjs` (`pythonEnv`, `pythonSpawnOpts`), `engine.mjs`, `cover.mjs`, `thumbs.mjs`, `doctor.mjs`, `run-handle.mjs` | Vòng 7: `open()` của Python dùng bảng mã locale ⇒ `UnicodeDecodeError: 'charmap'` ngay dòng đầu của engine, kéo theo 10/16 ca đỏ — xem §8.5.2 | `PYTHONUTF8=1` + `PYTHONIOENCODING=utf-8` gate `win32` ở **mọi** chỗ spawn Python; chứng minh bằng A/B trên macOS với locale thù địch |
| k | `lib/platform.mjs` (`taskkillArgs`) | Vòng 7: `taskkill` thiếu `/F` không giết nổi tiến trình console ⇒ nút Dừng không dừng, quota vẫn cháy — xem §8.5.3 | luôn `/T /F`; ca kiểm chạy trên cả hai nền, đã chứng minh nó bắt được lỗi (158/159 khi bỏ `/F`) |
| l | `test/harness.mjs` (`rmTemp`), `suite-import`, `suite-projects`, `integration/connections` | Vòng 7: `ENOTEMPTY` khi các suite tự dọn thư mục tạm — retry của `fsx.mjs` chỉ phủ mã sản xuất | một cái chổi dùng chung: retry 10×100ms và **không bao giờ ném** |
| m | `scripts/build-runtime.sh` + bước CI | Vòng 9: `xargs: shasum: No such file or directory` (exit 127) — Git for Windows không có `shasum` ⇒ **không đóng gói được bản phát hành từ Windows** — xem §8.6.1 | chọn công cụ theo máy (`shasum` trước, rồi `sha256sum`); CI khẳng định định dạng manifest **và** băm lại toàn gói |
| ~~n~~ | ~~`lib/run-handle.mjs` (`stampT0`)~~ | ⛔ **ĐÃ RÚT** — vòng 10 đo được `lệch = −0,93ms` và luật cũ đã `true`; giả thuyết lệch đồng hồ **sai**, xem §8.6.2 | mã đã **gỡ sạch** (37 dòng), `attachArtifact` trở lại đúng bản gốc. Cái duy nhất còn lại từ vòng đó là **bước CI "Bàn mổ engine giả"** — và chính nó là thứ giết giả thuyết |
| o | `test/harness.mjs` (`rmTemp`) | Vòng 9: hai ca bundle đổi từ `ENOTEMPTY` sang `hết 25000ms` — `fs.rm` giãn chờ theo `lần_thử × retryDelay` = 5,5s mỗi thư mục — xem §8.6.3 | `maxRetries: 3, retryDelay: 50` + trần cứng 3s; in `⏱` khi dọn quá 500ms |
| p | `.github/workflows/kitgen-windows.yml` (bước "Đóng gói bằng Git-Bash") | Vòng 10: `exit 141` = SIGPIPE — `tar -tzf … \| head -20` dưới `bash -e -o pipefail` của runner làm đỏ cả bước chỉ vì một lệnh để *ngó* — xem §8.7.1 | ghi danh sách ra file rồi `head` file; đã quét: không còn `\| head` / `\| grep -q` nào trong các bước `shell: bash` |
| q | `lib/run-handle.mjs` (`cleanJobName`, `parseGenLine`), `test-fixtures/engine-fake/gen.sh`, `engine-stepped/gen.sh` | Vòng 10: `print()` của Python trên Windows dịch `\n` → `\r\n` **kể cả ra pipe** ⇒ tên job mang `\r` ⇒ `prompt →` không khớp, `case *bg-home)` không khớp, tên file chứa ký tự Win32 cấm — xem §8.7.2 và **§4.5** | hai lớp: engine `\| tr -d '\r'` (hai fixture; `gen.sh` thật là nợ §4.5), agent chịu được `\r` và lọc mọi tên job. Ca kiểm chạy **cả hai nền**, đã chứng minh bắt được lỗi (161/162 khi trả mẫu về bản cũ) |
| r | `test-agent.mjs`, workflow (bước "Khám nghiệm workspace tạm") | Vòng 10: bàn mổ nói `raw/` có 3 file tên sạch, bộ ca nói `3/3 không ghi được ảnh` — **hai dữ kiện không thể cùng đúng**, và tôi hết cách suy luận — xem §8.7.3 | `KITGEN_TEST_KEEP_TMP=1` giữ workspace; bước `if: always()` in **từ đĩa** cây thư mục (tên dạng JSON) + mọi `run.json` kèm câu trả lời `raw/<job>.png` có tồn tại không |
| s | `lib/paths.mjs` (`relPosix`), `routes/files.mjs` (#42 danh mục kit) | Vòng 11: `walkFiles` trả đường dẫn của HĐH ⇒ trên Windows đoạn tương đối là `tight\01-btn.png` ⇒ khoá đối chiếu manifest không khớp ⇒ **mọi ô bản ôm sát trả `sheet: null`** và rơi vào nhóm "Khác" trên web — xem §8.8.1 | một hàm có tên gọi `relPosix(base, abs, s = sep)`; trên POSIX là `split("/").join("/")` ⇒ đồng nhất từng ký tự, kể cả tên file chứa `\`. Ca kiểm ép ngữ nghĩa Windows ngay trên Mac, đã chứng minh bắt được lỗi (164/165) |
| t | `scripts/build-runtime.sh` (`sha256_text`) + bước CI | Vòng 11: `sha256sum` của Git-Bash mặc định đọc binary nên in `<hash>␠*<path>` — gói dựng từ Windows và từ Mac có manifest **khác byte cho cùng một cây file** — xem §8.8.2 | `sed` neo `^<64 hex>␠\*` đổi đúng một ký tự đánh dấu; **không** đụng chế độ đọc (`-t` có thể dịch CRLF ⇒ sai băm file nhị phân). CI in thêm băm binary-vs-text để đóng nốt câu hỏi còn lại |

Mọi bản vá phía agent (a, b, e, g, h, j, k, l, o, q, r, s) đã được đo lại trên macOS:
`node agent/test-agent.mjs` → **165/165 PASS · 0 FAIL** (số ca tăng dần vì các luồng việc khác
cũng thêm ca; điều bất biến là **0 FAIL**). Bản vá `m` đo bằng cách dựng lại gói thật trên
macOS: 193 file, mọi dòng manifest đúng định dạng, `shasum -c` khớp 193/193 (đo lại sau `t`: y nguyên).

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

*(Cập nhật sau vòng 7 — bốn điểm trên đã trả lời xong: **5** = BÒ, không kẹt: engine chết ngay
dòng đầu vì mã hoá (§8.5.2) nên các ca chờ hết trần rồi mới bỏ; **6** = **KHÔNG nổ**, giả thuyết
ống-dẫn chưa được xác nhận, đã gỡ ghi công ở §8.4.3; **7** = `py -3.13` được chọn, `[5/8]` xanh
trọn, chưa cần kẹp chặt hơn; **8** = chưa đo được vì lượt trước còn đỏ vì lý do khác. Ba câu hỏi
của vòng 8:)*

9. **16 ca đỏ có xanh hết không?** Bốn nhóm nguyên nhân của §8.5 đều đã vá; nhóm mã hoá đã
   chứng minh bằng A/B trên macOS, nhóm `taskkill` thì **chỉ runner mới phán được** (ca kiểm
   trên Mac chỉ khoá được *quyết định* `/T /F`, không chứng minh được taskkill giết thật).
   Còn đỏ ⇒ đọc `errorTail` chứ đừng đọc tên ca: một dòng Traceback nói nhiều hơn mười cái tên.
10. **`[6/8]` và `[7/8]` của "Cài lần 2"** lần đầu được chạy tới: `npm install @resvg/resvg-wasm`
    thật, `codex.cmd` giả, `kitgen.cmd`/`kitgen-hidden.vbs` sinh ra. Ba lời gọi lệnh ngoài ở đó
    vừa được bọc lại vòng này nhưng **chưa từng chạy lần nào**.
11. **Thời gian job 4.** Nay có số mili-giây từng ca. Ca nào chậm hơn macOS hàng chục lần thì
    đó là chỗ spawn tiến trình — dữ liệu để quyết định có phải giảm số lần spawn trong bộ ca không.

*(Cập nhật sau vòng 9 — **điểm 2 đã có đáp án dứt điểm**: Git for Windows **không có** `shasum`,
xem §8.6.1. Điểm 11 cũng xong: bộ ca chạy hết trong **108 giây** trên Windows, tức Windows
**không** chậm bất thường — không cần giảm số lần spawn. Ba câu hỏi của vòng 10:)*

12. **Đọc "Bàn mổ engine giả" TRƯỚC khi đọc bất cứ ca đỏ nào.** Bốn dòng nó in ra trả lời dứt
    điểm: file có được ghi không, tên có sạch không, `mtime` lệch bao nhiêu, và **luật nào**
    (cũ/mới) phán đúng. Nếu luật cũ đã `true` thì giả thuyết lệch đồng hồ ở §8.6.2 **sai** —
    gỡ ghi công ngay như đã làm với lưới ống-dẫn ở §8.4.3, và đi tìm chỗ khác.
13. **Hai ca bundle.** Còn đỏ mà **không** có dòng `⏱ dọn …` ⇒ thủ phạm nằm trong thân ca, không
    phải cái chổi. Có dòng `⏱` mà vẫn 25s ⇒ trần 3s của `rmTemp` không ăn, đọc lại `Promise.race`.
14. **`build-runtime.sh` trong Git-Bash** lần đầu chạy tới cuối: xem `sha256sum` có in đúng
    `<hash>␠␠<path>` không (bước CI tự khẳng định), và tarball dựng từ Windows có giải nén +
    cài lại được không — đó mới là điều kiện đủ để nói "phát hành được từ Windows".

*(Cập nhật sau vòng 10 — **điểm 12 đã trả lời, và câu trả lời là KHÔNG**: luật cũ `true`, lệch
đồng hồ −0,93ms ⇒ giả thuyết chết, đã gỡ ghi công và gỡ luôn mã (§8.6.2, hàng `n`). **Điểm 13
xong**: hai ca bundle xanh, trần 3s ăn. **Điểm 14 vẫn treo** vì bước đó chết vì SIGPIPE trước
khi tới phần băm (§8.7.1). Ba câu hỏi của vòng 11:)*

15. **Năm ca engine có xanh không sau bản vá `\r`?** Nếu xanh ⇒ §4.5 là **chặn cứng có thật cho
    máy user**, và `gen.sh` dòng 512 phải được vá trước khi phát hành, không phải sau. Nếu vẫn
    đỏ ⇒ đọc **"Khám nghiệm workspace tạm"** trước, đừng đoán thêm lần nữa: nó in `run.json` và
    sự tồn tại của `raw/<job>.png` **từ đĩa**, tức là chỗ duy nhất còn có thể nói dối đã bị soi.
16. **Tên file trong khám nghiệm có ký tự lạ không?** In dạng JSON nên `\r` hay ký tự PUA lộ ngay.
    Có ⇒ ai đó vẫn tạo tên file từ chuỗi chưa lọc, tìm chỗ đó. Sạch mà `artifact` vẫn rỗng ⇒
    lỗi nằm ở **so khớp tên**, không phải ở việc ghi file.
17. **Bước "Đóng gói bằng Git-Bash"** lần này mới thật sự chạy tới đoạn băm — xem §9.2 điểm 14,
    câu hỏi vẫn nguyên vẹn, chỉ là lần đầu có cơ hội được trả lời.

*(Cập nhật sau vòng 11 — **cả ba đã trả lời**: **15** = bản vá `\r` ăn ba ca, hai ca còn đỏ
là lỗi KHÁC HẲN (§8.8.1) mà `\r` che mất; **16** = tên file trên đĩa **sạch**, `failSummary`
đã đúng `1/3` ⇒ mâu thuẫn §8.7.3 tan, và cái sai nằm ở **so khớp tên**, đúng như đèn chỉ;
**17** = tarball dựng được trong Git-Bash, chết ở phép thử định dạng vì dấu `*` (§8.8.2), tức
điểm 14 cũng đã có đáp án. Hai câu hỏi của vòng 12 — và nếu cả hai xanh thì **cả 4 job xanh**,
khép được vòng đầu của pipeline Windows:)*

18. **Hai ca [112][113].** Xanh ⇒ biên giới "đĩa → web" đã sạch. Còn đỏ mà thông điệp đổi sang
    `tight/` hoặc `path` ⇒ còn một chỗ nữa cùng họ, tìm bằng chính `relPosix` (grep nơi nào
    ghép chuỗi đường dẫn cho web mà không đi qua nó).
19. **Hai dòng `che do doc BINARY/TEXT`** ở bước đóng gói. **Bằng nhau** ⇒ việc chuẩn hoá dấu
    `*` an toàn tuyệt đối, đóng sổ §8.8.2. **Khác nhau** ⇒ lập tức đảo hướng: nới luật định dạng
    của bước CI để chấp nhận cả `␠␠` lẫn `␠*`, và **gỡ** `sha256_text` — vì lúc đó chuẩn hoá sẽ
    làm `sha256sum -c` bám nhầm chế độ và bám sai băm của file nhị phân.
