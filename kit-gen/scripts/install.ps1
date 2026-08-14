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
   · engine là bash + python3 ⇒ máy phải có Git for Windows và Python 3;
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

# Chạy một lệnh ngoài và ném lỗi nếu exit code khác 0. `cmd @args` của PowerShell không
# tự dừng khi lệnh ngoài lỗi (ErrorActionPreference không áp cho native command).
function Invoke-Exe([string] $exe, [string[]] $exeArgs, [string] $what) {
  & $exe @exeArgs
  if ($LASTEXITCODE -ne 0) { Die "$what that bai (exit $LASTEXITCODE): $exe $($exeArgs -join ' ')" }
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
# Uu tien launcher `py -3` (chuan cua python.org tren Windows), roi den `python`.
$pyLauncher = $null
$pyCmd = Get-Command py.exe -ErrorAction SilentlyContinue
if ($pyCmd) {
  $v = & $pyCmd.Source -3 -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
  if ($LASTEXITCODE -eq 0 -and $v) { $pyExe = $pyCmd.Source; $pyPre = @('-3'); $pyLauncher = $true; Write-Ok "Python $v (py launcher)" }
}
if (-not $pyLauncher) {
  $pExe = Get-Command python.exe -ErrorAction SilentlyContinue
  # Windows 10/11 co "app execution alias" python.exe gia — no chi mo Microsoft Store
  # chu khong chay Python. Dau hieu: duong dan nam trong WindowsApps.
  if ($pExe -and $pExe.Source -notmatch 'WindowsApps') {
    $v = & $pExe.Source -c "import sys;print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($LASTEXITCODE -eq 0 -and $v) { $pyExe = $pExe.Source; $pyPre = @(); $pyLauncher = $true; Write-Ok "Python $v · $($pExe.Source)" }
  }
}
if (-not $pyLauncher) {
  Write-Block 'Python 3.10+' 'Cai tu https://www.python.org/downloads/windows/ va TICK "Add python.exe to PATH". (Ban Microsoft Store cung duoc nhung phai mo Store cai that, alias rong khong tinh.)'
}

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
  $major = & $nodeExe -p 'Number(process.versions.node.split(".")[0])' 2>$null
  if ($LASTEXITCODE -eq 0 -and [int]$major -ge 20) { $needNode = $false; Write-Ok "Node da co: $(& $nodeExe --version)" }
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
  Write-Ok "Node $(& $nodeExe --version) · $nodeExe"
}
Invoke-Exe $nodeExe @('--check', (Join-Path $candidate 'agent\server.mjs')) 'kiem cu phap agent'

# ── 4. cài runtime + engine vào workspace ──────────────────────────────────────
Write-Step '4/8' 'Cai runtime va engine'
$dest = Join-Path $KitgenHome "releases\$version"
$new  = "$dest.new"
if (Test-Path -LiteralPath $new)  { Remove-Item -LiteralPath $new -Recurse -Force }
New-Dir $new
Copy-Item -Path (Join-Path $candidate '*') -Destination $new -Recurse -Force
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
Move-Item -LiteralPath $new -Destination $dest

# `current` la junction (NTFS, KHONG can quyen admin — khac symlink). Loi thi lui ve
# ghi thang duong dan co version vao config, agent khong phu thuoc vao junction.
$current = Join-Path $KitgenHome 'current'
$source  = $dest
try {
  if (Test-Path -LiteralPath $current) {
    $item = Get-Item -LiteralPath $current -Force
    if ($item.LinkType) { Remove-Item -LiteralPath $current -Force } else { Remove-Item -LiteralPath $current -Recurse -Force }
  }
  [void](New-Item -ItemType Junction -Path $current -Target $dest -ErrorAction Stop)
  $source = $current
  Write-Ok "current -> releases\$version"
} catch {
  Write-Warn "khong tao duoc junction `"current`" - dung thang releases\$version"
}

New-Dir (Join-Path $Workspace '.kitgen\engine')
New-Dir (Join-Path $Workspace 'projects')
Copy-Item -Path (Join-Path $dest 'engine\*') -Destination (Join-Path $Workspace '.kitgen\engine') -Recurse -Force
Write-Ok "engine -> $Workspace\.kitgen\engine"

# ── 5. Python venv + shim `python3` ────────────────────────────────────────────
Write-Step '5/8' 'Moi truong Python'
$venv    = Join-Path $Workspace '.venv'
$venvPy  = Join-Path $venv 'Scripts\python.exe'   # Windows: Scripts\, KHONG phai bin/
$pythonForAgent = $null
if ($pyLauncher) {
  if (-not (Test-Path -LiteralPath $venvPy)) {
    Write-Host '  tao virtualenv ...'
    $venvArgs = @()
    if ($pyPre.Count -gt 0) { $venvArgs += $pyPre }
    $venvArgs += @('-m', 'venv', $venv)
    & $pyExe @venvArgs
    if ($LASTEXITCODE -ne 0) { Write-Warn 'khong tao duoc venv - se dung Python he thong' }
  }
  if (Test-Path -LiteralPath $venvPy) { $pythonForAgent = $venvPy }
  else { $pythonForAgent = $pyExe }

  if ($pythonForAgent -eq $venvPy) {
    & $venvPy -c 'import PIL,numpy,scipy,pymatting' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '  cai thu vien xu ly anh (pillow numpy scipy pymatting) ...'
      $env:PIP_DISABLE_PIP_VERSION_CHECK = '1'
      & $venvPy -m pip install --quiet --upgrade pillow numpy scipy pymatting
      if ($LASTEXITCODE -ne 0) { Write-Warn 'pip install that bai - slice.py se khong chay duoc' }
    }
    Write-Ok "venv $venv"
  }

  # SHIM `python3`: gen.sh goi `python3`, ma Windows KHONG CO lenh ten do (python.org
  # cai python.exe + py.exe). Day la mot shell script KHONG DUOI FILE — bash cua
  # Git-Bash chay duoc, va no nam trong PATH ma agent dung khi spawn bash.
  $pyPosix = ($pythonForAgent -replace '\\', '/')
  # Neu phai lui ve `py.exe` (venv hong) thi shim van can co `-3`.
  $pyShimArgs = ''
  if ($pythonForAgent -eq $pyExe -and $pyPre.Count -gt 0) { $pyShimArgs = ' ' + ($pyPre -join ' ') }
  Write-TextLf (Join-Path $KitgenHome 'bin\python3') @"
#!/usr/bin/env bash
# Sinh boi install.ps1 - Windows khong co lenh `python3`.
exec "$pyPosix"$pyShimArgs "`$@"
"@
  Write-Ok 'shim python3 (cho Git-Bash)'
} else {
  Write-Warn 'bo qua venv va shim python3 vi chua co Python 3'
}

# ── 6. Codex CLI + trình render khung xương ───────────────────────────────────
Write-Step '6/8' 'Codex CLI va trinh dung anh'
$toolsPrefix = Join-Path $KitgenHome 'tools'
New-Dir $toolsPrefix
$codexBin = $null
$sysCodex = Get-Command codex -ErrorAction SilentlyContinue
if ($sysCodex) {
  & $sysCodex.Source --version 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $codexBin = $sysCodex.Source; Write-Ok "dung Codex da co: $codexBin" }
  else { Write-Warn "co lenh codex tai $($sysCodex.Source) nhung --version that bai" }
}
if (-not $codexBin) {
  $localCodex = Join-Path $toolsPrefix 'node_modules\.bin\codex.cmd'
  if (-not (Test-Path -LiteralPath $localCodex)) {
    Write-Host '  npm install @openai/codex ...'
    & $npmCmd install --silent --prefix $toolsPrefix '@openai/codex'
    if ($LASTEXITCODE -ne 0) { Write-Warn 'cai Codex CLI that bai' }
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
  & $npmCmd install --silent --prefix $toolsPrefix '@resvg/resvg-wasm'
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
  call "%~f0" run >> "$logFile" 2>&1
  exit /b !errorlevel!
)
if /I "%ACTION%"=="stop" (
  rem Khong co PID file: tim dung tien trinh node dang chay agent/server.mjs.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { `$_.Name -eq 'node.exe' -and `$_.CommandLine -like '*agent*server.mjs*' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }"
  exit /b 0
)
if /I "%ACTION%"=="restart" (
  call "%~f0" stop
  timeout /t 1 /nobreak >nul
  call "%~f0" start
  exit /b 0
)
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
"@
Write-TextCrLf (Join-Path $binDir 'kitgen.cmd') $kitgenCmd

# Chay nen KHONG hien cua so console: khong co launchd/systemd tren Windows, va
# `start /b` van de lai mot cua so den. WScript.Shell Run voi tham so 0 la cach
# duy nhat khong can cai them gi.
$vbs = @"
' Sinh boi install.ps1 - chay agent KitGen an, khong cua so console.
' Tham so thu hai = 0 (vbHide), thu ba = False (khong doi ket thuc).
Set sh = CreateObject("WScript.Shell")
sh.Run """$binDir\kitgen.cmd"" run-logged", 0, False
"@
Write-TextCrLf (Join-Path $binDir 'kitgen-hidden.vbs') $vbs

Copy-Item -LiteralPath $MyInvocation.MyCommand.Path -Destination (Join-Path $KitgenHome 'install.ps1') -Force
Write-Ok "lenh: $binDir\kitgen.cmd"

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
  & (Join-Path $binDir 'kitgen.cmd') start | Out-Null
  $healthy = $false
  foreach ($i in 1..15) {
    Start-Sleep -Seconds 1
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -Headers @{ 'X-KitGen-Client' = '1'; 'Origin' = $Origin } -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
  }
  if ($healthy) { Write-Ok "agent phan hoi tai http://127.0.0.1:$Port/health" }
  else { Write-Warn "agent chua phan hoi sau 15s - xem log: $logFile" }
}

# ── tổng kết ───────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "KitGen $version da cai vao: $dest"
Write-Host "Lenh   : $binDir\kitgen.cmd"
Write-Host "Mo app : http://127.0.0.1:$Port/app/"
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

} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
