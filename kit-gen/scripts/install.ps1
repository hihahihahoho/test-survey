<#
================================================================================
 install.ps1 — BẢN CÀI WINDOWS CỦA KITGEN  ***EXPERIMENTAL***

 ⚠️  CHƯA TỪNG ĐƯỢC CHẠY THỬ TRÊN MÁY WINDOWS.
     Script này được viết trên macOS, hoàn toàn dựa trên tài liệu chính thức
     (nodejs.org/dist, docs.microsoft.com về tar.exe/Expand-Archive/junction,
     npm bin trên Windows). Trước khi phát cho người dùng thật,
     PHẢI chạy đủ checklist trong docs/WINDOWS-PORT.md §7 trên một máy Win sạch.

 Bản Windows là bản DỊCH của install.sh, giữ nguyên mọi quyết định của nó:
   · không cần quyền admin, không cài gì ra ngoài thư mục của user;
   · credential ở lại trong home của Codex, installer không đọc;
   · tải runtime từ CÙNG release.json mà install.sh dùng (tar.gz — Windows 10
     1803+ có sẵn tar.exe của bsdtar);
   · chỉ khởi động dịch vụ khi mọi tiền đề đã đủ, thiếu thì IN CHECKLIST.

 Khác biệt bắt buộc so với macOS (chi tiết ở docs/WINDOWS-PORT.md):
   · engine là bash + python3 ⇒ máy phải có Git for Windows (Python thì KitGen tự
     mang theo, xem bước [5/8] — không còn là tiền đề của máy nữa);
   · runtime vào %LOCALAPPDATA%\KitGen (không phải ~/.kitgen);
   · không có launchd/systemd ⇒ chạy nền bằng shortcut Startup + wscript ẩn cửa sổ.

 Dùng:
   powershell -ExecutionPolicy Bypass -File install.ps1
   powershell -ExecutionPolicy Bypass -File install.ps1 -Archive .\kitgen-runtime-2.1.19.tar.gz
   powershell -ExecutionPolicy Bypass -File install.ps1 -NoStart -CodexImg

 ┌────────────────────────────────────────────────────────────────────────────┐
 │ FILE NÀY PHẢI ĐƯỢC LƯU LÀ **UTF-8 CÓ BOM** (EF BB BF). ĐỪNG BỎ BOM ĐI.      │
 │                                                                            │
 │ Windows PowerShell 5.1 đọc file .ps1 KHÔNG có BOM bằng bảng mã Windows-1252,│
 │ không phải UTF-8. Mọi ký tự tiếng Việt và mọi dấu — → ⇒ trong file này khi  │
 │ đó vỡ thành 2–3 ký tự CP1252, và một số byte rơi đúng vào 0x91–0x94 =       │
 │ ' ' " " — mà PowerShell coi ĐÓ LÀ DẤU NHÁY THẬT. Chuỗi đầu tiên dính phải   │
 │ (dòng `Write-Warn "… (coreutils) — engine …"`) đứt làm đôi, từ đó parser     │
 │ lệch nhịp và cả file hỏng theo: 12 lỗi cú pháp, ruột here-string sinh        │
 │ kitgen.cmd bị đọc như mã PowerShell, `@resvg/resvg-wasm` thành toán tử.     │
 │ Đây KHÔNG phải giả thuyết: đó đúng là kết quả lượt CI đầu tiên (run         │
 │ 31783005598, job "Cú pháp install.ps1 (PowerShell 5.1)").                   │
 │                                                                            │
 │ PS 7 (pwsh) mặc định UTF-8 nên KHÔNG tái hiện được lỗi này — kiểm bằng      │
 │ pwsh là kiểm sai môi trường. Hai lớp phòng thủ đang có:                     │
 │   ① BOM (lớp thật) — CI khẳng định 3 byte đầu là EF BB BF;                  │
 │   ② TRONG CHUỖI và trong NỘI DUNG FILE SINH RA (config.cmd, kitgen.cmd,     │
 │      kitgen-hidden.vbs, shim python3) tuyệt đối không dùng — – → ⇒ … “ ” ‘ ’│
 │      tức mọi ký tự mà UTF-8 của nó chứa byte 0x91–0x94; bốn here-string     │
 │      hiện là ASCII 100% (cmd.exe cũng đọc bằng OEM codepage, không UTF-8).  │
 │      Dấu chấm giữa `·` đang dùng làm bullet là AN TOÀN (C2 B7, không byte   │
 │      nào rơi vào vùng dấu nháy) và checklist §7 đang trích đúng chữ đó.     │
 │   Văn giải thích tiếng Việt trong comment thì GIỮ NGUYÊN, BOM lo phần đó.   │
 └────────────────────────────────────────────────────────────────────────────┘
================================================================================
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
  [string] $Archive,
  [string] $ReleaseUrl,
  [string] $Sha256,
  [string] $Workspace,
  [string] $KitgenHome,
  [int]    $Port = 8765,
  [string] $Origin,
  [switch] $NoStart,
  [switch] $CodexDefault,
  [switch] $CodexImg,
  [switch] $Update,
  [string] $ReleaseManifest = 'https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json'
)

$ErrorActionPreference = 'Stop'
# CO Y KHONG bat Set-StrictMode: script nay chua duoc chay thu tren Windows, strict mode
# bien mot thuoc tinh vang mat thanh loi chet nguoi giua chung ca lan cai.

# PowerShell 5.1 mặc định bắt tay TLS 1.0/1.1 → github.com và nodejs.org đã tắt cả hai
# từ lâu, không đặt dòng này là mọi Invoke-WebRequest đều "could not create SSL/TLS
# secure channel". Ghi thêm Tls12 chứ không GHI ĐÈ để không phá cấu hình sẵn có.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
# Thanh tiến trình của Invoke-WebRequest làm tải file chậm đi hàng chục lần trên PS 5.1.
$ProgressPreference = 'SilentlyContinue'

# ── PSModulePath: vá lại đường tìm module của CHÍNH PS 5.1 ────────────────────────
# Ai chạy installer TỪ BÊN TRONG PowerShell 7 (`powershell -File install.ps1` gõ trong
# pwsh, hoặc terminal mặc định của VS Code, hoặc một CI dùng shell pwsh) thì tiến trình
# PS 5.1 con THỪA KẾ biến PSModulePath mà PS 7 đã ghi đè — nó trỏ vào kho module của PS 7
# và KHÔNG còn "$PSHOME\Modules" của 5.1. Cmdlet biên dịch sẵn (Write-Host, Copy-Item…)
# vẫn chạy vì chúng nằm trong phiên mặc định, nhưng thứ phải AUTO-LOAD theo đường module
# thì biến mất, và installer dùng đúng hai thứ như thế:
#     · Get-FileHash    (Microsoft.PowerShell.Utility) — bước [2/8] đối chiếu checksum
#     · Expand-Archive  (Microsoft.PowerShell.Archive) — bước [3/8] giải nén Node
# Triệu chứng: "The term 'Get-FileHash' is not recognized as the name of a cmdlet",
# installer thoát 1 giữa chừng. ĐÃ GẶP THẬT trên runner CI (run 31784778492).
# $PSHOME luôn đúng với chính tiến trình đang chạy, nên đây là phép vá không thể sai.
$psHomeModules = Join-Path $PSHOME 'Modules'
if (($env:PSModulePath -split ';') -notcontains $psHomeModules) {
  $env:PSModulePath = $psHomeModules + ';' + $env:PSModulePath
}

$NODE_VERSION = '20.19.5'

# ── PYTHON RIENG CUA KITGEN: PIN CUNG, KHONG DE MAY NGUOI DUNG QUYET DINH ─────
# Doi xung voi khoi Node ngay tren: tai -> doi chieu SHA-256 -> giai nen vao
# $KitgenHome\tools -> dung ban do. Vi sao phai mang theo Python: pillow/numpy/scipy/
# pymatting chi co wheel dung san cho MOT DAI phien ban Python. Roi ra ngoai dai do thi
# pip BIEN DICH scipy tu nguon; tren Windows nghia la can MSVC + Fortran (hong ngay),
# con tren may co du trinh bien dich thi ninja bung mot tien trinh moi nhan CPU, moi
# tien trinh hon 1 GB RAM => DO TOAN MAY. Da xay ra voi nguoi dung that.
# Runner CI (may trang dung nghia) co san 3.14 va do chinh la ban `py -3` chon.
#
# NGUON TAI = mot GitHub release SONG LAU cua CHINH kho KitGen (tag runtime-python-*),
# KHONG phai kho astral-sh: khong phu thuoc kho ben thu ba, nguoi dung chi mo MOT ten
# mien (may cong ty/ngan hang loc theo domain), checksum do CI cua minh sinh.
# Xem .github/workflows/kitgen-runtime-python.yml.
$PYTHON_VERSION  = '3.13.15'      # DONG BO TAY voi install.sh (PYTHON_VERSION)
$PYTHON_BUILD    = '20260814'     # DONG BO TAY voi install.sh (PYTHON_BUILD)
$RELEASE_REPO    = 'hihahihahoho/test-survey'
$PythonRuntimeTag  = if ($env:KITGEN_PYTHON_RUNTIME_TAG) { $env:KITGEN_PYTHON_RUNTIME_TAG } else { "runtime-python-$PYTHON_VERSION" }
$PythonRuntimeBase = if ($env:KITGEN_PYTHON_RUNTIME_BASE) { $env:KITGEN_PYTHON_RUNTIME_BASE } else { "https://github.com/$RELEASE_REPO/releases/download/$PythonRuntimeTag" }
# Dai phien ban CHAC CHAN co wheel dung san cho ca 4 goi. Python he thong nam trong dai
# nay thi dung luon cho do tai ~45 MB; ngoai dai thi tai ban rieng — KHONG thu pip roi
# cau may, vi cai gia cua lan thu do la treo may.
$PYTHON_WHEEL_OK = @('3.11', '3.12', '3.13')

# ── tiện ích in ────────────────────────────────────────────────────────────────
$script:Warnings = New-Object System.Collections.ArrayList
$script:Blockers = New-Object System.Collections.ArrayList

function Write-Step([string] $n, [string] $text) { Write-Host ''; Write-Host "[$n] $text" }
function Write-Ok  ([string] $text) { Write-Host "  OK   $text" }
function Write-Warn([string] $text) { Write-Host "  WARN $text" -ForegroundColor Yellow; [void]$script:Warnings.Add($text) }
function Write-Block([string] $text, [string] $how) {
  Write-Host "  THIEU $text" -ForegroundColor Red
  [void]$script:Blockers.Add(@{ What = $text; How = $how })
}
function Die([string] $text) { Write-Host ''; Write-Host "LOI: $text" -ForegroundColor Red; exit 1 }

function New-Dir([string] $p) { if (-not (Test-Path -LiteralPath $p)) { [void](New-Item -ItemType Directory -Path $p -Force) } }

# Copy directory contents without a wildcard. PowerShell wildcards omit hidden
# entries such as `.gitignore` and `.foo`, leaving a runtime incomplete.
function Copy-TreeContents([string] $from, [string] $to) {
  New-Dir $to
  foreach ($child in (Get-ChildItem -LiteralPath $from -Force)) {
    Copy-Item -LiteralPath $child.FullName -Destination (Join-Path $to $child.Name) -Recurse -Force
  }
}

# Remove a junction itself, never its target. `Remove-Item -Recurse` on Windows
# PowerShell 5.1 can walk through the reparse point and delete the release.
function Remove-ReparsePointSafe([string] $path) {
  try {
    [System.IO.Directory]::Delete($path, $false)
    return
  } catch {
    $comspec = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
    # Qua ham boc: goi lenh ngoai truc tiep bi luat CI chan, va `2>$null` tren lenh
    # ngoai trong PS 5.1 bien stderr thanh loi cham dut (xem chu thich o Invoke-ExeSoft).
    $code = Invoke-ExeSoft $comspec @('/d', '/c', "rmdir `"$path`"") -Quiet
    if ($code -eq 0 -and -not (Test-Path -LiteralPath $path)) { return }
    throw
  }
}

# Ghi text KHÔNG BOM, xuống dòng LF cho file mà bash sẽ đọc (shim python3): BOM ở đầu
# shebang là bash báo "bad interpreter", CRLF trong shebang cũng vậy.
function Write-TextLf([string] $path, [string] $text) {
  New-Dir (Split-Path -Parent $path)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($path, ($text -replace "`r`n", "`n"), $enc)
}
function Write-TextCrLf([string] $path, [string] $text) {
  New-Dir (Split-Path -Parent $path)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($path, (($text -replace "`r`n", "`n") -replace "`n", "`r`n"), $enc)
}

# SHA-256 bang .NET thuan, KHONG qua Get-FileHash: Get-FileHash phai auto-load module
# (xem khoi PSModulePath o tren), con kieu .NET thi luon co mat ke ca khi duong module
# hong hoan toan. Cung mot con so, cung dinh dang hex thuong. Lop phong thu thu hai —
# lop thu nhat la phep va PSModulePath, va no cung can cho Expand-Archive o buoc [3/8].
function Get-Sha256([string] $path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $fs = [IO.File]::OpenRead($path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($fs))).Replace('-', '').ToLowerInvariant() }
    finally { $fs.Dispose() }
  } finally { $sha.Dispose() }
}

function Invoke-Download([string] $url, [string] $dest) {
  try { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 300 }
  catch { Die "khong tai duoc $url`n     $($_.Exception.Message)" }
}

# Tai file LON co bao tien do. KHONG bat lai $ProgressPreference='Continue': thanh tien
# do cua Invoke-WebRequest lam PS 5.1 tai cham hang chuc lan (xem dau file). Thay vi the
# doc stream thu cong roi tu in phan tram. Dung cho tarball Python 44,9 MB — de man hinh
# dung im hai phut la nguoi dung tuong may treo va tat cua so giua chung.
function Invoke-DownloadProgress([string] $url, [string] $dest, [string] $label) {
  try {
    $req = [Net.HttpWebRequest]::Create($url)
    $req.UserAgent       = 'kitgen-installer'
    $req.Timeout         = 300000
    $req.ReadWriteTimeout = 300000
    $res = $req.GetResponse()
    $total = $res.ContentLength
    $in    = $res.GetResponseStream()
    $out   = [IO.File]::Create($dest)
    try {
      $buf     = New-Object byte[] 262144
      $done    = 0L
      $lastPct = -1
      while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
        $out.Write($buf, 0, $n)
        $done += $n
        if ($total -gt 0) {
          $pct = [int](100 * $done / $total)
          if ($pct -ge $lastPct + 10) {
            $lastPct = $pct
            Write-Host ("  {0} {1,3}%  ({2:N1}/{3:N1} MB)" -f $label, $pct, ($done / 1MB), ($total / 1MB))
          }
        }
      }
    } finally {
      $out.Dispose(); $in.Dispose(); $res.Dispose()
    }
  } catch { Die "khong tai duoc $url`n     $($_.Exception.Message)" }
}

# Chạy một lệnh ngoài và ném lỗi nếu exit code khác 0. `cmd @args` của PowerShell không
# tự dừng khi lệnh ngoài lỗi (ErrorActionPreference không áp cho native command).
function Invoke-Exe([string] $exe, [string[]] $exeArgs, [string] $what) {
  & $exe @exeArgs   # NATIVE-OK
  if ($LASTEXITCODE -ne 0) { Die "$what that bai (exit $LASTEXITCODE): $exe $($exeArgs -join ' ')" }
}

# ── CÁI BẪY: lệnh ngoài ghi stderr + $ErrorActionPreference='Stop' = CHẾT SCRIPT ──
# Trong PowerShell 5.1, khi dòng lệnh có CHUYỂN HƯỚNG stderr (`2>$null`, `2>&1`), mỗi
# dòng stderr của lệnh ngoài được gói thành một ErrorRecord (NativeCommandError) rồi
# ĐI QUA luồng lỗi — mà EAP='Stop' thì record đầu tiên là lỗi CHẤM DỨT. Nghĩa là
# `2>$null` KHÔNG hề "cho qua" như trong bash: nó biến stderr từ vô hại thành chí mạng.
# ĐÃ GẶP THẬT trên runner CI: bước [5/8] chạy phép thử `python -c 'import PIL,...'`
# cốt để BIẾT thư viện đã có hay chưa (thiếu là chuyện bình thường, thiếu thì đi cài),
# nhưng Traceback của Python làm cả installer chết ngay tại đó, không bao giờ tới được
# dòng `pip install` ở ngay bên dưới. Bản Mac không dính vì `cmd || { ... }` của bash
# chỉ nhìn EXIT CODE, không quan tâm lệnh có nói gì ra stderr.
# Hàm này là cách gọi ĐÚNG cho mọi lệnh "được phép hỏng": hạ EAP trong đúng lời gọi,
# nuốt/hoặc in stderr tuỳ ý, và trả về EXIT CODE để người gọi tự phán như bash.
function Invoke-ExeSoft([string] $exe, [string[]] $exeArgs, [switch] $Quiet) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($Quiet) { & $exe @exeArgs 2>&1 | Out-Null }   # NATIVE-OK
    else { & $exe @exeArgs 2>&1 | ForEach-Object { Write-Host "       $_" } }   # NATIVE-OK
    return $LASTEXITCODE
  } catch {
    # Lệnh không tồn tại/không chạy được: cũng chỉ là "hỏng", không phải sập installer.
    return 9009
  } finally { $ErrorActionPreference = $old }
}

# Như Invoke-ExeSoft nhưng LẤY VỀ stdout. Trả @{ Code = <exit code>; Out = <stdout đã trim> }.
function Invoke-ExeCapture([string] $exe, [string[]] $exeArgs) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $exe @exeArgs 2>$null   # NATIVE-OK
    return @{ Code = $LASTEXITCODE; Out = (($out | Out-String).Trim()) }
  } catch { return @{ Code = 9009; Out = '' } } finally { $ErrorActionPreference = $old }
}

# Hỏi phiên bản một trình Python. Trả '' nếu trình đó không chạy được (alias rỗng của
# Microsoft Store, launcher không có bản được yêu cầu, PATH trỏ vào file đã xoá…).
function Get-PyVersion([string] $exe, [string[]] $pre) {
  $probe = @()
  if ($pre.Count -gt 0) { $probe += $pre }
  # DẤU NHÁY: chuỗi Python này KHÔNG được chứa dấu nháy kép — xem chú thích ở [3/8].
  $probe += @('-c', "import sys;print('%d.%d' % sys.version_info[:2])")
  $r = Invoke-ExeCapture $exe $probe
  if ($r.Code -ne 0 -or -not $r.Out) { return '' }
  return ([string]($r.Out -split "`n" | Select-Object -First 1)).Trim()
}

# ── 0. đường dẫn & tham số ─────────────────────────────────────────────────────
if (-not $KitgenHome) { $KitgenHome = Join-Path $env:LOCALAPPDATA 'KitGen' }
if (-not $Workspace)  { $Workspace  = Join-Path $env:USERPROFILE 'KitGen' }
if (-not $Origin)     { $Origin     = "http://127.0.0.1:$Port" }
if ($CodexDefault -and $CodexImg) { Die 'chi duoc chon mot trong -CodexDefault / -CodexImg' }
$codexExplicit = ($CodexDefault -or $CodexImg)
$codexProfile  = if ($CodexImg) { 'separate' } else { 'default' }

$SelfDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tmp     = Join-Path ([IO.Path]::GetTempPath()) ("kitgen-install-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Dir $Tmp

Write-Host ''
Write-Host '  KitGen · ban cai Windows (EXPERIMENTAL)' -ForegroundColor Cyan
Write-Host "  runtime   : $KitgenHome"
Write-Host "  workspace : $Workspace"

try {

# ── 1. tiền đề của hệ thống ────────────────────────────────────────────────────
Write-Step '1/8' 'Kiem tra tien de he thong'

# tar.exe: Windows 10 build 17063+ có sẵn (bsdtar). Không có ⇒ không giải nén được
# runtime .tar.gz và cũng không có đường vòng nào rẻ hơn là bảo user nâng cấp Windows.
$tarExe = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tarExe) { Write-Ok "tar.exe · $($tarExe.Source)" }
else { Write-Block 'tar.exe (Windows 10 1803 tro len)' 'Nang cap Windows, hoac giai nen thu cong roi chay lai voi -Archive tro toi thu muc da giai nen.' }

# Git for Windows — engine gen.sh/cover.sh là bash script, KHÔNG có đường thay thế.
$bashCandidates = @()
if ($env:KITGEN_BASH) { $bashCandidates += $env:KITGEN_BASH }
$programBases = @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})
if ($env:LOCALAPPDATA) { $programBases += (Join-Path $env:LOCALAPPDATA 'Programs') }
foreach ($base in $programBases) {
  if ($base) { $bashCandidates += (Join-Path $base 'Git\bin\bash.exe') }
}
$gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
if ($gitCmd) { $bashCandidates += (Join-Path (Split-Path -Parent (Split-Path -Parent $gitCmd.Source)) 'bin\bash.exe') }
$bashExe = $null
foreach ($c in $bashCandidates) { if ($c -and (Test-Path -LiteralPath $c)) { $bashExe = $c; break } }
if ($bashExe) {
  $gitRoot = Split-Path -Parent (Split-Path -Parent $bashExe)
  if (Test-Path -LiteralPath (Join-Path $gitRoot 'usr\bin\grep.exe')) { Write-Ok "Git-Bash · $bashExe" }
  else { Write-Warn "tim thay $bashExe nhung thieu <Git>\usr\bin (coreutils) - engine se loi o cac lenh date/grep/du" }
} else {
  Write-Block 'Git for Windows (bash.exe)' 'Cai tu https://git-scm.com/download/win (ban 64-bit, tuy chon mac dinh), roi chay lai install.ps1.'
}

# Python 3 — slice.py / skeleton.py / thumbnail / crop anh bia.
#
# KHONG CON DO PYTHON O DAY, VA DAY KHONG PHAI TIEN DE NUA.
# Ban truoc di do `py -3.13` -> `-3.12` -> `-3.11` -> `py -3`, khong thay thi Write-Block
# 'Python 3.10+' va bao nguoi dung tu di cai roi chay lai. Hai cho sai:
#   1) `py -3` = ban MOI NHAT dang cai, ma ban moi nhat chinh la ban de THIEU WHEEL nhat
#      (runner CI co san 3.14) => pip di bien dich scipy => het RAM.
#   2) "May user thi khong co ai cai san Python 3.13 cho ho" (docs/WINDOWS-PORT.md).
# Nay KitGen TU MANG THEO Python nhu da tu mang theo Node — xem buoc [5/8]. May co san
# Python trong dai $PYTHON_WHEEL_OK thi dung luon cho do tai; khong thi tai ban pin cung.

# ── 2. lấy gói runtime ─────────────────────────────────────────────────────────
Write-Step '2/8' 'Lay goi runtime'

function Test-ReleaseDir([string] $d) {
  return (Test-Path -LiteralPath (Join-Path $d 'agent\server.mjs')) -and
         (Test-Path -LiteralPath (Join-Path $d 'engine\gen.sh'))   -and
         (Test-Path -LiteralPath (Join-Path $d 'app\index.html'))
}

$candidate = $null
$repoRoot  = Split-Path -Parent $SelfDir      # scripts\ -> kit-gen\

if (Test-ReleaseDir $SelfDir)      { $candidate = $SelfDir }
elseif (Test-ReleaseDir $repoRoot) { $candidate = $repoRoot }
elseif ($Archive -and (Test-Path -LiteralPath $Archive) -and (Get-Item -LiteralPath $Archive).PSIsContainer -and (Test-ReleaseDir $Archive)) {
  $candidate = (Resolve-Path -LiteralPath $Archive).Path
}

if (-not $candidate) {
  $pkg = Join-Path $Tmp 'runtime.tar.gz'
  if ($Archive) {
    Copy-Item -LiteralPath $Archive -Destination $pkg -Force
    if (-not $Sha256 -and (Test-Path -LiteralPath "$Archive.sha256")) {
      $Sha256 = ((Get-Content -LiteralPath "$Archive.sha256" -Raw).Trim() -split '\s+')[0]
    }
  } else {
    if (-not $ReleaseUrl) {
      $meta = $null
      try { $meta = (Invoke-WebRequest -Uri $ReleaseManifest -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json }
      catch { Die "khong doc duoc release manifest: $ReleaseManifest" }
      $ReleaseUrl = $meta.archive
      if (-not $ReleaseUrl) { Die 'release manifest khong co truong archive' }
      Write-Ok "manifest: $($meta.version)"
    }
    Invoke-Download $ReleaseUrl $pkg
    if (-not $Sha256) {
      $shaFile = Join-Path $Tmp 'runtime.sha256'
      Invoke-Download "$ReleaseUrl.sha256" $shaFile
      $Sha256 = ((Get-Content -LiteralPath $shaFile -Raw).Trim() -split '\s+')[0]
    }
  }
  if (-not $Sha256) { Die 'thieu checksum (-Sha256 hoac file .sha256 di kem)' }
  $actual = Get-Sha256 $pkg
  if ($actual -ne $Sha256.ToLowerInvariant()) { Die "checksum runtime khong khop`n     cho doi: $Sha256`n     nhan duoc: $actual" }

  if (-not $tarExe) { Die 'khong co tar.exe de giai nen runtime' }
  $ex = Join-Path $Tmp 'x'; New-Dir $ex
  # bsdtar cua Windows khong hieu duong dan co ky tu \ trong mot so ban cu → dung -C.
  Invoke-Exe $tarExe.Source @('-xzf', $pkg, '-C', $ex) 'giai nen runtime'
  $roots = @(Get-ChildItem -LiteralPath $ex -Force)
  if ($roots.Count -ne 1 -or -not $roots[0].PSIsContainer) { Die 'goi runtime phai co dung mot thu muc goc' }
  if ($roots[0].Name -notlike 'kitgen-runtime-*') { Die "thu muc goc la $($roots[0].Name), khong phai kitgen-runtime-*" }
  $candidate = $roots[0].FullName
}

if (-not (Test-ReleaseDir $candidate)) { Die "khong phai goi runtime KitGen hop le: $candidate" }

# manifest.sha256 do build-runtime.sh sinh: "<hash>  ./duong/dan"
$manifest = Join-Path $candidate 'manifest.sha256'
if (Test-Path -LiteralPath $manifest) {
  $bad = 0; $checked = 0
  foreach ($line in (Get-Content -LiteralPath $manifest)) {
    if (-not $line.Trim()) { continue }
    $m = [regex]::Match($line, '^([0-9a-fA-F]{64})\s+\*?\.?[\\/]?(.+)$')
    if (-not $m.Success) { continue }
    $rel = $m.Groups[2].Value.Trim() -replace '/', '\'
    $abs = Join-Path $candidate $rel
    $checked++
    if (-not (Test-Path -LiteralPath $abs)) { $bad++; continue }
    if ((Get-Sha256 $abs) -ne $m.Groups[1].Value.ToLowerInvariant()) { $bad++ }
  }
  if ($bad -gt 0) { Die "$bad/$checked file trong goi runtime sai checksum" }
  Write-Ok "manifest.sha256 hop le ($checked file)"
} else {
  Write-Warn 'goi runtime khong co manifest.sha256 (ban dev?) - bo qua doi chieu tung file'
}

$version = (Get-Content -LiteralPath (Join-Path $candidate 'VERSION') -Raw).Trim()
if ($version -notmatch '^[0-9A-Za-z._-]+$') { Die "version khong hop le: $version" }
Write-Ok "runtime $version"

# ── 3. Node runtime riêng ──────────────────────────────────────────────────────
Write-Step '3/8' 'Node.js rieng cua KitGen'
$nodeDir  = Join-Path $KitgenHome 'tools\node'
$nodeExe  = Join-Path $nodeDir 'node.exe'
$npmCmd   = Join-Path $nodeDir 'npm.cmd'
$needNode = $true
if (Test-Path -LiteralPath $nodeExe) {
  # ── HAI CÁI BẪY CÙNG NẰM TRÊN MỘT DÒNG (vòng 7 chết ở đây, install.ps1:376) ──
  # ① DẤU NHÁY KÉP TRONG THAM SỐ. Bản cũ truyền cho node:
  #        -p 'Number(process.versions.node.split(".")[0])'
  #    PowerShell 5.1 dựng dòng lệnh cho tiến trình ngoài mà KHÔNG escape dấu " nằm
  #    trong tham số ⇒ node nhận được `…split(.)[0]…`, tức là SyntaxError của chính
  #    node, in ra `[eval]:1`. Cách chắc chắn nhất không phải là escape cho khéo mà là
  #    ĐỪNG BAO GIỜ có dấu " trong tham số lệnh ngoài: hỏi node chuỗi phiên bản trần
  #    rồi tự tách ở phía PowerShell.
  # ② `2>$null` biến SyntaxError kia thành lỗi CHẤM DỨT (xem chú thích Invoke-ExeSoft),
  #    nên installer chết luôn thay vì đi tiếp xuống nhánh tải Node mới.
  # Vì sao vòng trước không thấy: khối này CHỈ chạy khi node.exe ĐÃ có sẵn, tức lần cài
  # THỨ HAI trở đi. Lần cài đầu trên máy trắng không bao giờ đi vào đây.
  $r = Invoke-ExeCapture $nodeExe @('-p', 'process.versions.node')
  $nodeVer = $r.Out
  if ($r.Code -eq 0 -and $nodeVer -match '^(\d+)\.') {
    if ([int]$Matches[1] -ge 20) { $needNode = $false; Write-Ok "Node da co: v$nodeVer" }
    else { Write-Host "  node.exe hien co la v$nodeVer (< 20) - tai lai" }
  }
}
if ($needNode) {
  # Bo phan phoi Windows cua nodejs.org la ZIP co node.exe + npm.cmd NGAY THU MUC GOC
  # (khac ban Unix: bin/node). Moi thu duoi day bam vao su that do.
  $archTag = if ([Environment]::Is64BitOperatingSystem) {
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
  } else { 'win-x86' }
  $nodePkg  = "node-v$NODE_VERSION-$archTag.zip"
  $nodeBase = "https://nodejs.org/dist/v$NODE_VERSION"
  Write-Host "  tai $nodePkg ..."
  $zip = Join-Path $Tmp $nodePkg
  Invoke-Download "$nodeBase/$nodePkg" $zip
  $sums = Join-Path $Tmp 'node-shasums.txt'
  Invoke-Download "$nodeBase/SHASUMS256.txt" $sums
  $want = $null
  foreach ($line in (Get-Content -LiteralPath $sums)) {
    $parts = $line.Trim() -split '\s+'
    if ($parts.Count -ge 2 -and $parts[1] -eq $nodePkg) { $want = $parts[0].ToLowerInvariant() }
  }
  if (-not $want) { Die "SHASUMS256.txt khong co $nodePkg" }
  if ((Get-Sha256 $zip) -ne $want) { Die 'checksum Node khong khop' }
  if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
  $unz = Join-Path $Tmp 'node-unzip'; New-Dir $unz
  Expand-Archive -LiteralPath $zip -DestinationPath $unz -Force
  $inner = @(Get-ChildItem -LiteralPath $unz -Directory)[0]
  New-Dir (Split-Path -Parent $nodeDir)
  Move-Item -LiteralPath $inner.FullName -Destination $nodeDir
  Write-Ok "Node v$((Invoke-ExeCapture $nodeExe @('-p', 'process.versions.node')).Out) · $nodeExe"
}
Invoke-Exe $nodeExe @('--check', (Join-Path $candidate 'agent\server.mjs')) 'kiem cu phap agent'

# ── 4. cài runtime + engine vào workspace ──────────────────────────────────────
Write-Step '4/8' 'Cai runtime va engine'
$dest = Join-Path $KitgenHome "releases\$version"
$new  = "$dest.new"
if (Test-Path -LiteralPath $new)  { Remove-Item -LiteralPath $new -Recurse -Force }
New-Dir $new
Copy-TreeContents $candidate $new
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
Move-Item -LiteralPath $new -Destination $dest

# `current` la junction (NTFS, KHONG can quyen admin — khac symlink). Chỉ đổi ở cuối installer,
# sau cac buoc bat buoc (Python, Codex, config), để lỗi giữa chừng không để máy nửa vời.
$current = Join-Path $KitgenHome 'current'
$source  = $dest

New-Dir (Join-Path $Workspace '.kitgen\engine')
New-Dir (Join-Path $Workspace 'projects')
Copy-TreeContents (Join-Path $dest 'engine') (Join-Path $Workspace '.kitgen\engine')
Write-Ok "engine -> $Workspace\.kitgen\engine"

# ── 5. Python rieng + venv + shim `python3` ───────────────────────────────────
Write-Step '5/8' 'Moi truong Python'

# ① Ban rieng da tai tu luot truoc.  ② Python he thong trong dai co wheel (do tai 45 MB).
# ③ Tai ban pin cung, KIEM SHA-256 TRUOC KHI GIAI NEN.
# KHONG co nhanh thu tu kieu "cai xong nhung chua gen duoc anh": toi day ma hong la hong
# that, Die ngay kem cach chua — khong im lang ha chat luong, khong day viec sang user.
$pyHome = Join-Path $KitgenHome 'tools\python'
$pyExe  = $null
$pyPre  = @()

$privatePy = Join-Path $pyHome 'python.exe'
if (Test-Path -LiteralPath $privatePy) {
  $v = Get-PyVersion $privatePy @()
  if ($PYTHON_WHEEL_OK -contains $v) { $pyExe = $privatePy; Write-Ok "Python rieng cua KitGen $v · $privatePy" }
}

if (-not $pyExe) {
  # `py -<ver>` truoc, roi python.exe tran. Chi chap nhan phien ban trong $PYTHON_WHEEL_OK:
  # ngoai dai do thi tai ban rieng chu KHONG thu pip roi cau may.
  $pyCmd = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($pyCmd) {
    foreach ($want in $PYTHON_WHEEL_OK) {
      $v = Get-PyVersion $pyCmd.Source @("-$want")
      if ($v -eq $want) { $pyExe = $pyCmd.Source; $pyPre = @("-$want"); Write-Ok "Python $v (py -$want)"; break }
    }
  }
  if (-not $pyExe) {
    $pExe = Get-Command python.exe -ErrorAction SilentlyContinue
    # Windows 10/11 co "app execution alias" python.exe gia — no chi mo Microsoft Store
    # chu khong chay Python. Dau hieu: duong dan nam trong WindowsApps.
    if ($pExe -and $pExe.Source -notmatch 'WindowsApps') {
      $v = Get-PyVersion $pExe.Source @()
      if ($PYTHON_WHEEL_OK -contains $v) { $pyExe = $pExe.Source; $pyPre = @(); Write-Ok "Python $v · $($pExe.Source)" }
      elseif ($v) { Write-Host "  python.exe he thong la $v - ngoai dai co wheel ($($PYTHON_WHEEL_OK -join ', ')), se tai ban rieng" }
    }
  }
  # May da tu du => tra lai dia cho ban rieng hong/lac con sot tu luot truoc.
  if ($pyExe -and (Test-Path -LiteralPath $pyHome)) { Remove-Item -LiteralPath $pyHome -Recurse -Force }
}

if (-not $pyExe) {
  if (-not [Environment]::Is64BitOperatingSystem) {
    Die 'KitGen chi co ban Python dung san cho Windows 64-bit.'
  }
  # python-build-standalone chi phat hanh x86_64-pc-windows-msvc trong bo asset ma CI
  # cua minh mirror. Windows ARM64 chay file nay qua lop gia lap x64 — cham hon nhung
  # chay duoc, va van hon la de pip di bien dich scipy.
  $pyPkg = "cpython-$PYTHON_VERSION+$PYTHON_BUILD-x86_64-pc-windows-msvc-install_only.tar.gz"
  Write-Host "  tai Python $PYTHON_VERSION rieng cua KitGen (~45 MB) ..."
  $pyTar = Join-Path $Tmp $pyPkg
  Invoke-DownloadProgress "$PythonRuntimeBase/$pyPkg" $pyTar 'python'
  # BANG CHECKSUM LA BAT BUOC: khong tai duoc bang = khong kiem duoc goi = KHONG GIAI NEN.
  $pySums = Join-Path $Tmp 'python-shasums.txt'
  Invoke-Download "$PythonRuntimeBase/SHA256SUMS" $pySums
  $wantSha = $null
  foreach ($line in (Get-Content -LiteralPath $pySums)) {
    $parts = $line.Trim() -split '\s+'
    # `sha256sum` doc nhi phan in "<hash> *<file>"; `shasum` in hai dau cach. Nhan ca hai.
    if ($parts.Count -ge 2 -and ($parts[1] -eq $pyPkg -or $parts[1] -eq ('*' + $pyPkg))) { $wantSha = $parts[0].ToLowerInvariant() }
  }
  if (-not $wantSha) { Die "SHA256SUMS khong co $pyPkg" }
  if ((Get-Sha256 $pyTar) -ne $wantSha) { Die 'checksum Python khong khop' }
  # Don ban Python cu y het cach don Node: MOT thu muc duy nhat, xoa sach truoc khi giai
  # nen, nen $KitgenHome khong phinh them sau moi lan update.
  if (Test-Path -LiteralPath $pyHome) { Remove-Item -LiteralPath $pyHome -Recurse -Force }
  New-Dir $pyHome
  # tar.exe (bsdtar) da la tien de bat buoc o buoc [1/8]. install_only co thu muc goc
  # `python/` nen phai --strip-components=1.
  Invoke-Exe 'tar.exe' @('-xzf', $pyTar, '-C', $pyHome, '--strip-components=1') 'giai nen Python'
  $pyExe = $privatePy
  $pyPre = @()
  $v = Get-PyVersion $pyExe @()
  if (-not ($PYTHON_WHEEL_OK -contains $v)) { Die "ban Python vua giai nen khong chay duoc: $pyExe" }
  Write-Ok "Python rieng cua KitGen $PYTHON_VERSION · $pyExe"
}

$venv    = Join-Path $Workspace '.venv'
$venvPy  = Join-Path $venv 'Scripts\python.exe'   # Windows: Scripts\, KHONG phai bin/

# venv PHAI duoc dung tu dung $pyExe. venv doi truoc tro vao Python khac (ban he thong
# vua nang cap, ban rieng vua bi don) la cai bay kinh dien: pip lai di tim sdist.
$engineBase = (Invoke-ExeCapture $pyExe ($pyPre + @('-c', 'import sys;print(sys.base_prefix)'))).Out
$venvBase   = ''
if (Test-Path -LiteralPath $venvPy) { $venvBase = (Invoke-ExeCapture $venvPy @('-c', 'import sys;print(sys.base_prefix)')).Out }
if ((-not (Test-Path -LiteralPath $venvPy)) -or ($venvBase -ne $engineBase)) {
  Write-Host '  tao virtualenv ...'
  if (Test-Path -LiteralPath $venv) { Remove-Item -LiteralPath $venv -Recurse -Force }
  if ((Invoke-ExeSoft $pyExe ($pyPre + @('-m', 'venv', $venv))) -ne 0) { Die "khong tao duoc venv tu $pyExe" }
}
if (-not (Test-Path -LiteralPath $venvPy)) { Die "venv thieu $venvPy" }
$pythonForAgent = $venvPy

# Phep THU, khong phai phep kiem: may chua cai thu vien la chuyen duong nhien, va
# Traceback in ra o day la cau tra loi "chua co" chu khong phai loi. Bat buoc goi qua
# Invoke-ExeSoft -Quiet (xem chu thich cua ham): goi thang kem `2>$null` thi EAP='Stop'
# bien Traceback thanh loi cham dut va installer chet TAI DAY, khong bao gio chay toi
# dong `pip install` ngay duoi. Dung loi da gap tren runner CI.
$probe = Invoke-ExeSoft $venvPy @('-c', 'import PIL,numpy,scipy,pymatting') -Quiet
if ($probe -ne 0) {
  Write-Host '  cai thu vien xu ly anh (pillow numpy scipy pymatting) ...'
  $env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
  # ═════════════════════════════════════════════════════════════════════════════
  # `--only-binary=:all:` KHONG phai tuy chon cho dep — DUNG BAO GIO BO NO.
  # Thieu co nay, may nao khong co wheel se de pip BIEN DICH scipy tu nguon: ninja bung
  # mot tien trinh moi nhan CPU, moi tien trinh hon 1 GB RAM. Nguoi dung that da bao may
  # DO hoan toan — chuot con di duoc, bam gi cung khong an, phai giu nut nguon.
  # Khong co wheel thi phai hong NGAY va RE, kem cach chua. install.sh cung vay.
  # ═════════════════════════════════════════════════════════════════════════════
  # KHONG -Quiet: pip hong thi phai doc duoc vi sao (thieu wheel? khong co mang?).
  if ((Invoke-ExeSoft $venvPy @('-m', 'pip', 'install', '--upgrade', '--only-binary=:all:', 'pillow', 'numpy', 'scipy', 'pymatting')) -ne 0) {
    $pv = Get-PyVersion $venvPy @()
    Die ("cai pillow/numpy/scipy/pymatting that bai (Python $pv · $pyExe) - CHUA GEN DUOC ANH. " +
      "Cach xu: 1) doc dong loi pip ngay tren day; 2) mat mang / proxy chan pypi.org thi cai lai khi co mang; " +
      "3) xoa thu muc .venv trong workspace roi chay lai installer. " +
      'Installer CO Y KHONG bien dich scipy tu nguon (--only-binary=:all:): viec do ngon hang GB RAM va da treo may nguoi dung.')
  }
}
Write-Ok "venv $venv"

# SHIM `python3`: gen.sh goi `python3`, ma Windows KHONG CO lenh ten do (python.org
# cai python.exe + py.exe). Day la mot shell script KHONG DUOI FILE — bash cua
# Git-Bash chay duoc, va no nam trong PATH ma agent dung khi spawn bash.
# Luon tro thang vao python.exe cua venv: khong con duong lui ve `py.exe` nao ca.
$pyPosix = ($pythonForAgent -replace '\\', '/')
Write-TextLf (Join-Path $KitgenHome 'bin\python3') @"
#!/usr/bin/env bash
# Sinh boi install.ps1 - Windows khong co lenh `python3`.
exec "$pyPosix" "`$@"
"@
Write-Ok 'shim python3 (cho Git-Bash)'


# ── 6. Codex CLI + trình render khung xương ───────────────────────────────────
Write-Step '6/8' 'Codex CLI va trinh dung anh'
$toolsPrefix = Join-Path $KitgenHome 'tools'
New-Dir $toolsPrefix
$codexBin = $null
$sysCodex = Get-Command codex -ErrorAction SilentlyContinue
if ($sysCodex) {
  # `codex --version` cua mot ban cai hong in ra stderr — voi `2>$null` + EAP='Stop'
  # thi day la mot qua min nua y het [3/8]. Day la PHEP THU, hong la binh thuong.
  if ((Invoke-ExeSoft $sysCodex.Source @('--version') -Quiet) -eq 0) { $codexBin = $sysCodex.Source; Write-Ok "dung Codex da co: $codexBin" }
  else { Write-Warn "co lenh codex tai $($sysCodex.Source) nhung --version that bai" }
}
if (-not $codexBin) {
  $localCodex = Join-Path $toolsPrefix 'node_modules\.bin\codex.cmd'
  if (-not (Test-Path -LiteralPath $localCodex)) {
    Write-Host '  npm install @openai/codex ...'
    # npm in warning/tien do ra stderr nhu com bua ⇒ bat buoc di qua Invoke-ExeSoft.
    # KHONG -Quiet: npm hong thi phai doc duoc vi sao.
    if ((Invoke-ExeSoft $npmCmd @('install', '--silent', '--prefix', $toolsPrefix, '@openai/codex')) -ne 0) {
      Write-Warn 'cai Codex CLI that bai'
    }
  }
  if (Test-Path -LiteralPath $localCodex) { $codexBin = $localCodex; Write-Ok "Codex rieng cua KitGen: $localCodex" }
}
if (-not $codexBin) { Write-Block 'Codex CLI' 'Chay: npm i -g @openai/codex  (roi `codex login`). Khong co Codex thi KHONG gen duoc anh.' }

# Trinh render khung xuong: @resvg/resvg-wasm (2,4 MB, thuan JS + .wasm) thay cho
# Playwright + Chromium (790,9 MB) — xem BACKLOG #15. BAT BUOC, khong con duong lui:
# gen.sh dung han neu thieu (ban PIL cu lech 17,6% muc, da xoa). Goi nay khong co file
# .node nao, nen ban Windows het hang binary bien dich san cho AV can nham.
$resvgProbe = Join-Path $toolsPrefix 'node_modules\@resvg\resvg-wasm\index_bg.wasm'
if (-not (Test-Path -LiteralPath $resvgProbe)) {
  Write-Host '  npm install @resvg/resvg-wasm ...'
  [void](Invoke-ExeSoft $npmCmd @('install', '--silent', '--prefix', $toolsPrefix, '@resvg/resvg-wasm'))
}
if (Test-Path -LiteralPath $resvgProbe) { Write-Ok 'Trinh render khung xuong (@resvg/resvg-wasm)' }
else { Write-Block 'Trinh render khung xuong' 'Chay: npm install --prefix <tools> @resvg/resvg-wasm. Thieu goi nay thi KHONG gen duoc anh.' }

# Don rac doi Playwright (790,9 MB) o luot update. May sach khong co gi de xoa.
foreach ($p in @('playwright-browsers', 'node_modules\playwright', 'node_modules\playwright-core')) {
  Remove-Item -LiteralPath (Join-Path $toolsPrefix $p) -Recurse -Force -ErrorAction SilentlyContinue
}

# ── 7. config + lệnh kitgen ────────────────────────────────────────────────────
Write-Step '7/8' 'Cau hinh va lenh kitgen'

# .kitgen\config.json — GIU NGUYEN lua chon ho so anh cua nguoi dung khi update
# (dung ly le nhu install.sh: user doi ho so qua UI, update khong duoc reset).
$cfgPath = Join-Path $Workspace '.kitgen\config.json'
$cfg = $null
if (Test-Path -LiteralPath $cfgPath) {
  try { $cfg = (Get-Content -LiteralPath $cfgPath -Raw) | ConvertFrom-Json } catch { $cfg = $null }
}
if (-not $cfg) { $cfg = New-Object PSObject }
function Set-Prop($obj, $name, $value) {
  if ($obj.PSObject.Properties.Name -contains $name) { $obj.$name = $value }
  else { Add-Member -InputObject $obj -MemberType NoteProperty -Name $name -Value $value }
}
if ($cfg.PSObject.Properties.Name -notcontains 'workspaceVersion') { Set-Prop $cfg 'workspaceVersion' 1 }
if ($cfg.PSObject.Properties.Name -notcontains 'maxJobs')          { Set-Prop $cfg 'maxJobs' 4 }
$hasImg = ($cfg.PSObject.Properties.Name -contains 'imageGen') -and $cfg.imageGen -and $cfg.imageGen.mode
if ($codexExplicit -or -not $hasImg) {
  if ($codexProfile -eq 'separate') { Set-Prop $cfg 'imageGen' ([PSCustomObject]@{ mode = 'img-home'; codexHome = '~/.codex-img' }) }
  else                              { Set-Prop $cfg 'imageGen' ([PSCustomObject]@{ mode = 'default-home' }) }
}
Write-TextCrLf $cfgPath (($cfg | ConvertTo-Json -Depth 8))
Write-Ok "config.json ($(if ($codexProfile -eq 'separate') { 'ho so anh rieng ~/.codex-img' } else { 'Codex mac dinh' }))"

$binDir = Join-Path $KitgenHome 'bin'
New-Dir $binDir
$logFile = Join-Path $KitgenHome 'agent.log'

# agent.log is stdout redirected by the Startup wrapper. Without a cap, every login
# appends forever; a noisy child or crash loop can fill the disk and turn Windows into
# swap/handle exhaustion. Keep the newest 1 MB before each launch, with a 5 MB hard
# trigger. The helper is ASCII-only so Windows PowerShell 5.1 can parse it without BOM.
$rotateLog = @'
param([string]$Path, [int64]$MaxBytes = 5242880, [int64]$KeepBytes = 1048576)
$ErrorActionPreference = 'SilentlyContinue'
if (-not [IO.File]::Exists($Path)) { exit 0 }
$text = [IO.File]::ReadAllText($Path)
if ([Text.Encoding]::UTF8.GetByteCount($text) -le $MaxBytes) { exit 0 }
$keepChars = [Math]::Min($text.Length, $KeepBytes)
$tail = $text.Substring($text.Length - $keepChars)
$nl = $tail.IndexOf("`n")
if ($nl -ge 0) { $tail = $tail.Substring($nl + 1) }
$marker = "[agent.log rotated; keeping newest output]`r`n"
[IO.File]::WriteAllText($Path, $marker + $tail, (New-Object Text.UTF8Encoding($false)))
'@
Write-TextCrLf (Join-Path $KitgenHome 'rotate-log.ps1') $rotateLog

# config.cmd — ban Windows cua config.env. kitgen.cmd nap no bang `call`.
$nodeModules = Join-Path $toolsPrefix 'node_modules'
$configCmd = @"
@rem Sinh boi install.ps1 - KHONG sua tay, chay lai installer neu can doi.
set "KITGEN_HOME=$KitgenHome"
set "KITGEN_SOURCE=$source"
set "KITGEN_WORKSPACE=$Workspace"
set "KITGEN_PORT=$Port"
set "KITGEN_ORIGIN=$Origin"
set "KITGEN_NODE=$nodeExe"
set "KITGEN_CODEX_BIN=$codexBin"
set "KITGEN_PYTHON=$pythonForAgent"
set "KITGEN_BASH=$bashExe"
set "NODE_PATH=$nodeModules"
set "KITGEN_CODEX_PROFILE=$codexProfile"
set "KITGEN_RELEASE_MANIFEST=$ReleaseManifest"
"@
Write-TextCrLf (Join-Path $KitgenHome 'config.cmd') $configCmd

# kitgen.cmd — ban Windows cua runtime/bin/kitgen.
$venvScripts = Join-Path $venv 'Scripts'
$gitUsrBin = ''
if ($bashExe) { $gitUsrBin = (Join-Path (Split-Path -Parent (Split-Path -Parent $bashExe)) 'usr\bin') + ';' + (Split-Path -Parent $bashExe) + ';' }
$kitgenCmd = @"
@echo off
setlocal enabledelayedexpansion
call "%~dp0..\config.cmd"
set "PATH=%KITGEN_HOME%\bin;$venvScripts;%KITGEN_HOME%\tools\node;%KITGEN_HOME%\tools\node_modules\.bin;$gitUsrBin%PATH%"
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=help"

if /I "%ACTION%"=="run" (
  "%KITGEN_NODE%" "%KITGEN_SOURCE%\agent\server.mjs" --workspace "%KITGEN_WORKSPACE%" --port "%KITGEN_PORT%" --origin "%KITGEN_ORIGIN%" --app-root "%KITGEN_SOURCE%\app"
  exit /b !errorlevel!
)
if /I "%ACTION%"=="start" (
  wscript.exe "%KITGEN_HOME%\bin\kitgen-hidden.vbs"
  exit /b 0
)
if /I "%ACTION%"=="run-logged" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%KITGEN_HOME%\rotate-log.ps1" -Path "$logFile"
  "%KITGEN_NODE%" "%KITGEN_SOURCE%\agent\log-run.mjs" --log "$logFile" -- "%KITGEN_NODE%" "%KITGEN_SOURCE%\agent\server.mjs" --workspace "%KITGEN_WORKSPACE%" --port "%KITGEN_PORT%" --origin "%KITGEN_ORIGIN%" --app-root "%KITGEN_SOURCE%\app"
  exit /b !errorlevel!
)
if /I "%ACTION%"=="stop" (
  rem Khong co PID file: tim dung tien trinh node dang chay agent/server.mjs.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { `$_.Name -eq 'node.exe' -and `$_.CommandLine -like '*agent*server.mjs*' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }; for (`$i = 0; `$i -lt 8; `$i++) { `$left = @(Get-CimInstance Win32_Process | Where-Object { `$_.Name -eq 'node.exe' -and `$_.CommandLine -like '*agent*server.mjs*' }); if (`$left.Count -eq 0) { break }; Start-Sleep -Milliseconds ([Math]::Min(100 * [Math]::Pow(2, `$i), 2000)) }"
  exit /b 0
)
rem `restart` di qua NHAN, khong dung khoi ngoac. Ban cu long ba tang va tinh backoff
rem bang toan tu dich bit: dau moc chi thoat duoc MOT dau nho hon, dau con lai van la
rem toan tu chuyen huong, nen cmd.exe dem sai bien khoi va `kitgen status` roi thang
rem vao cau bao that bai cua restart. CI run 32242960532, job "Kiem lenh kitgen.cmd".
if /I "%ACTION%"=="restart" goto :do_restart
if /I "%ACTION%"=="status" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Invoke-WebRequest -Uri ('http://127.0.0.1:' + `$env:KITGEN_PORT + '/health') -Headers @{'X-KitGen-Client'='1'; 'Origin'=`$env:KITGEN_ORIGIN} -UseBasicParsing -TimeoutSec 5).Content } catch { Write-Host ('KitGen agent khong phan hoi tren cong ' + `$env:KITGEN_PORT); exit 1 }"
  exit /b !errorlevel!
)
if /I "%ACTION%"=="doctor" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Invoke-WebRequest -Uri ('http://127.0.0.1:' + `$env:KITGEN_PORT + '/api/doctor?refresh=1') -Headers @{'X-KitGen-Client'='1'; 'Origin'=`$env:KITGEN_ORIGIN} -UseBasicParsing -TimeoutSec 30).Content } catch { Write-Host 'khong goi duoc /api/doctor'; exit 1 }"
  exit /b !errorlevel!
)
if /I "%ACTION%"=="logs" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -LiteralPath '$logFile' -Tail 100"
  exit /b 0
)
if /I "%ACTION%"=="open" (
  start "" "http://127.0.0.1:%KITGEN_PORT%/app/"
  exit /b 0
)
if /I "%ACTION%"=="update" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%KITGEN_HOME%\install.ps1" -Update
  exit /b !errorlevel!
)
echo Usage: kitgen {run^|start^|stop^|restart^|status^|doctor^|logs^|open^|update}
exit /b 0

:do_restart
rem Ba lan thu, cho 0s / 2s / 4s. Con so viet thang: toan tu dich bit trong khoi ngoac
rem chinh la cai bay da lam hong ca bang dieu phoi o tren.
rem `if not errorlevel 1` la phep so DONG (khong phai bien), nen dung trong khoi `for`
rem ma khong can delayed expansion — mot cai bay khac cua ban cu.
for %%A in (0 2 4) do (
  call "%~f0" stop
  if not "%%A"=="0" timeout /t %%A /nobreak >nul
  call "%~f0" start
  call "%~f0" status >nul 2>&1
  if not errorlevel 1 exit /b 0
)
echo KitGen restart that bai sau 3 lan thu; dung tai day, xem log: $logFile
exit /b 1
"@
Write-TextCrLf (Join-Path $binDir 'kitgen.cmd') $kitgenCmd

# Chay nen KHONG hien cua so console: khong co launchd/systemd tren Windows, va
# `start /b` van de lai mot cua so den. WScript.Shell Run voi tham so 0 la cach
# duy nhat khong can cai them gi.
$vbs = @"
' Sinh boi install.ps1 - chay agent KitGen an, khong cua so console.
' Startup khong tu restart vo han; agent tu bao ve single-instance va tu thoat khi loi.
Set sh = CreateObject("WScript.Shell")
sh.Run """$binDir\kitgen.cmd"" run-logged", 0, False
"@
Write-TextCrLf (Join-Path $binDir 'kitgen-hidden.vbs') $vbs

Copy-Item -LiteralPath $MyInvocation.MyCommand.Path -Destination (Join-Path $KitgenHome 'install.ps1') -Force
Write-Ok "lenh: $binDir\kitgen.cmd"

# Kích hoạt bản mới ở phút chót. Không dùng Remove-Item -Recurse trên junction:
# Windows PowerShell 5.1 có thể đi xuyên reparse point và xoá release đích.
if ($script:Blockers.Count -eq 0) {
  try {
    $currentItem = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
    if ($currentItem) {
      $isReparse = $currentItem.LinkType -or (($currentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
      if ($isReparse) { Remove-ReparsePointSafe $current }
      else { Remove-Item -LiteralPath $current -Recurse -Force }
    }
    [void](New-Item -ItemType Junction -Path $current -Target $dest -ErrorAction Stop)
    Write-Ok "current -> releases\$version"
  } catch {
    Write-Warn "khong tao duoc junction `"current`" - dung thang releases\$version"
  }
}

# ── 8. khởi động ───────────────────────────────────────────────────────────────
Write-Step '8/8' 'Khoi dong dich vu'
if ($script:Blockers.Count -gt 0) {
  Write-Warn 'BO QUA khoi dong: con tien de chua du (xem checklist ben duoi)'
} elseif ($NoStart) {
  Write-Ok 'bo qua theo -NoStart'
} else {
  $startup = [Environment]::GetFolderPath('Startup')
  Copy-Item -LiteralPath (Join-Path $binDir 'kitgen-hidden.vbs') -Destination (Join-Path $startup 'KitGen.vbs') -Force
  Write-Ok 'dang ky chay khi dang nhap (Startup)'
  # Update/install có thể chạy khi agent cũ còn nghe 8765. Dừng đúng cây agent trước
  # khi bật bản mới; nếu không, listenLoopback đời cũ tự nhảy sang 8766 và tạo bản thứ hai.
  & (Join-Path $binDir 'kitgen.cmd') stop | Out-Null
  Start-Sleep -Milliseconds 500
  & (Join-Path $binDir 'kitgen.cmd') start | Out-Null
  $healthy = $false
  $healthSeen = $null
  $healthDelayMs = 250
  foreach ($i in 1..6) {
    Start-Sleep -Milliseconds $healthDelayMs
    $healthDelayMs = [Math]::Min($healthDelayMs * 2, 4000)
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -Headers @{ 'X-KitGen-Client' = '1'; 'Origin' = $Origin } -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) {
        try { $healthSeen = ($r.Content | ConvertFrom-Json).runtimeVersion } catch { $healthSeen = $null }
        if ([string]$healthSeen -eq [string]$version) { $healthy = $true; break }
      }
    } catch { }
  }
  if ($healthy) { Write-Ok "agent phan hoi tai http://127.0.0.1:$Port/health" }
  else {
    $seen = if ($healthSeen) { "ban $healthSeen" } else { 'khong co phan hoi' }
    Write-Warn "agent chua phan hoi dung ban $version sau 15s ($seen) - xem log: $logFile"
  }
}

# ── tổng kết ───────────────────────────────────────────────────────────────────
Write-Host ''
if ($script:Blockers.Count -gt 0) {
  Write-Host "KitGen $version moi chi tai runtime vao: $dest"
  Write-Host 'Trang thai: CHUA KICH HOAT; chua the gen anh.' -ForegroundColor Red
} else {
  Write-Host "KitGen $version da cai vao: $dest"
}
Write-Host "Lenh   : $binDir\kitgen.cmd"
if ($script:Blockers.Count -gt 0) { Write-Host 'Mo app : chua san sang' }
else { Write-Host "Mo app : http://127.0.0.1:$Port/app/" }
if ($script:Blockers.Count -gt 0) {
  Write-Host ''
  Write-Host 'CHUA CHAY DUOC - con thieu:' -ForegroundColor Red
  foreach ($b in $script:Blockers) {
    Write-Host "  · $($b.What)"
    Write-Host "    -> $($b.How)"
  }
  Write-Host ''
  Write-Host '  Cai xong thi chay lai chinh lenh nay, khong can go bo gi.'
}
if ($script:Warnings.Count -gt 0) {
  Write-Host ''
  Write-Host 'Canh bao:' -ForegroundColor Yellow
  foreach ($w in $script:Warnings) { Write-Host "  · $w" }
}
Write-Host ''
Write-Host 'Buoc cuoi: dang nhap Codex neu chua ->  codex login'
Write-Host '(ho so anh rieng:  set CODEX_HOME=%USERPROFILE%\.codex-img  &&  codex login)'
Write-Host ''
Write-Host 'BAN CAI WINDOWS DANG O TRANG THAI EXPERIMENTAL.' -ForegroundColor Yellow
Write-Host 'Gap loi, chup man hinh + gui file log:' -ForegroundColor Yellow
Write-Host "  $logFile"

if ($script:Blockers.Count -gt 0) { exit 2 }

} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
