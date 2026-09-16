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
   · runtime vào %LOCALAPPDATA%\KitGen (không phải ~/.kitgen);
   · không có launchd/systemd ⇒ chạy nền bằng shortcut Startup + wscript ẩn cửa sổ.

 Dùng:
   powershell -ExecutionPolicy Bypass -File install.ps1
   powershell -ExecutionPolicy Bypass -File install.ps1 -Archive .\kitgen-runtime-2.1.19.tar.gz
   powershell -ExecutionPolicy Bypass -File install.ps1 -NoStart

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
 │      kitgen-hidden.vbs, rotate-log.ps1) tuyệt đối không dùng — – → ⇒ … “ ” ‘ ’│
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
  # Ho so anh rieng (~/.codex-img) da bo 24/08/2026 — hai switch nay chi con la no-op
  # de install.bat doi cu (van truyen -CodexDefault) khong chet vi tham so la.
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

# ── PATH GỐC CỦA NGƯỜI DÙNG: CHỤP LẠI TRƯỚC KHI AI ĐÓ KỊP ĐỘNG VÀO ───────────────
# Hôm nay install.ps1 KHÔNG chèn gì vào $env:Path (khác install.sh, nơi Node riêng bị
# đặt lên đầu PATH) — nhưng bước `codex update` bên dưới PHẢI chạy với PATH của người
# dùng, và điều đó không được phép phụ thuộc vào việc "hiện giờ chưa ai chèn".
# ĐO ĐƯỢC 16/09/2026 TRÊN macOS: codex bản cài-qua-npm chạy `npm install -g
# @openai/codex@latest`, npm ĐẦU TIÊN trên PATH quyết định gói rơi vào đâu; npm của
# KitGen đứng đầu ⇒ 277 MB @openai/codex (binary MỌI nền tảng) rơi vào tools\node của
# KitGen, còn codex THẬT của người dùng không hề được nâng.
$KitgenOrigPath = $env:Path

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

# ── KITGEN KHONG CON CAN PYTHON (16/09/2026) ──────────────────────────────────
# Cho nay tung la khoi pin cung mot ban CPython rieng (~45 MB) + venv + pip pillow,
# chi vi engine doi cu la `gen.sh` + `slice.py`. Engine nay la JS va chay bang dung
# ban Node rieng ma installer van tai, nen Windows KHONG con phai co Python, KHONG
# con venv, va cung KHONG con phai co Git for Windows (xem buoc [1/7]).
# Di san doi cu (tools\python, <workspace>\.venv) bi DON o buoc [4/7].
$RELEASE_REPO = 'hihahihahoho/test-survey'

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

# (Write-TextLf da bo 16/09/2026. No ghi text KHONG BOM + LF cho file ma BASH se doc,
# va file duy nhat nhu the la shim `python3` cho Git-Bash — da chet cung engine bash.
# Moi file installer con sinh ra deu do cmd.exe/wscript doc, tuc Write-TextCrLf.)
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

# (Invoke-DownloadProgress da bo 16/09/2026: no ton tai chi de bao tien do khi tai
# tarball Python 44,9 MB. Node tai bang Invoke-Download nhu cu.)

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
# ĐÃ GẶP THẬT trên runner CI (thời còn bước Python): phép thử `python -c 'import PIL'`
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

# ── 0. đường dẫn & tham số ─────────────────────────────────────────────────────
if (-not $KitgenHome) { $KitgenHome = Join-Path $env:LOCALAPPDATA 'KitGen' }
if (-not $Workspace)  { $Workspace  = Join-Path $env:USERPROFILE 'KitGen' }
if (-not $Origin)     { $Origin     = "http://127.0.0.1:$Port" }
if ($CodexImg) { Write-Warn 'tham so -CodexImg da bo — KitGen luon dung Codex mac dinh (~/.codex)' }

$SelfDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tmp     = Join-Path ([IO.Path]::GetTempPath()) ("kitgen-install-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Dir $Tmp

Write-Host ''
Write-Host '  KitGen · ban cai Windows (EXPERIMENTAL)' -ForegroundColor Cyan
Write-Host "  runtime   : $KitgenHome"
Write-Host "  workspace : $Workspace"

try {

# ── 1. tiền đề của hệ thống ────────────────────────────────────────────────────
Write-Step '1/7' 'Kiem tra tien de he thong'

# tar.exe: Windows 10 build 17063+ có sẵn (bsdtar). Không có ⇒ không giải nén được
# runtime .tar.gz và cũng không có đường vòng nào rẻ hơn là bảo user nâng cấp Windows.
$tarExe = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tarExe) { Write-Ok "tar.exe · $($tarExe.Source)" }
else { Write-Block 'tar.exe (Windows 10 1803 tro len)' 'Nang cap Windows, hoac giai nen thu cong roi chay lai voi -Archive tro toi thu muc da giai nen.' }

# GIT FOR WINDOWS: KHONG CON LA TIEN DE, VA DAY LA THAY DOI LON NHAT CUA BAN NAY.
#
# Truoc 16/09/2026 khoi nay di do bash.exe cua Git for Windows va Write-Block neu khong
# thay — tuc la nguoi dung Windows PHAI cai mot bo cong cu lap trinh 300 MB truoc khi
# KitGen chay duoc mot dong nao. Ly do duy nhat: engine la `gen.sh`/`cover.sh` (bash)
# goi `slice.py` (python3). Ca hai nay la JS, spawn bang `node agent/engine/cli.mjs`.
#
# Con `lib/update.mjs` thi sao? Tren Windows no chay `install.ps1` qua powershell.exe
# (`stageInstaller` uu tien ten 'install.ps1', va build-runtime.sh BAT BUOC file ay co
# trong goi), nen duong bash o do la duong lui khong bao gio duoc di. `findBash` van con
# trong platform.mjs cho dung ca ay, va no TU di tim — khong can KITGEN_BASH tu config.
#
# PYTHON: cung khong con. Xem khoi hang so o dau file.

# ── 2. lấy gói runtime ─────────────────────────────────────────────────────────
Write-Step '2/7' 'Lay goi runtime'

# DAU NHAN DIEN GOI la `agent\engine\cli.mjs`, KHONG con la `engine\gen.sh`. Quen doi
# cho nay cung luc voi viec xoa engine bash = moi goi moi bi chinh installer cua no goi
# la "khong phai goi runtime KitGen hop le". Doi xung voi install.sh::is_release.
function Test-ReleaseDir([string] $d) {
  return (Test-Path -LiteralPath (Join-Path $d 'agent\server.mjs'))      -and
         (Test-Path -LiteralPath (Join-Path $d 'agent\engine\cli.mjs')) -and
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
Write-Step '3/7' 'Node.js rieng cua KitGen'
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

# ── 4. cài runtime, dọn di sản đời cũ ──────────────────────────────────────────
Write-Step '4/7' 'Cai runtime'
$dest = Join-Path $KitgenHome "releases\$version"
$new  = "$dest.new"
if (Test-Path -LiteralPath $new)  { Remove-Item -LiteralPath $new -Recurse -Force }
New-Dir $new
Copy-TreeContents $candidate $new
# Cai de khi agent cu dang chay: node.exe giu khoa file trong releases\<ver>,
# Remove-Item se chet giua chung va ban cai cu da bi pha truoc khi ban moi vao.
# Phai dung server TRUOC khi xoa (buoc 8 se tu start lai).
if (Test-Path -LiteralPath $dest) {
  $oldCmd = Join-Path $KitgenHome 'bin\kitgen.cmd'
  if (Test-Path -LiteralPath $oldCmd) {
    # Dung Invoke-ExeSoft (khong -Quiet cung duoc nhung stop hong la binh thuong):
    # goi truc tiep `&` bi cong tinh CI cam — stderr cua lenh ngoai + EAP='Stop'
    # trong PS 5.1 se bien canh bao thanh loi chet giua chung.
    $comspec = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }
    [void](Invoke-ExeSoft $comspec @('/d', '/c', "call `"$oldCmd`" stop") -Quiet)
    Start-Sleep -Milliseconds 500
  }
  Get-Process node, codex -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($KitgenHome, [StringComparison]::OrdinalIgnoreCase) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Remove-Item -LiteralPath $dest -Recurse -Force
}
Move-Item -LiteralPath $new -Destination $dest

# `current` la junction (NTFS, KHONG can quyen admin — khac symlink). Chỉ đổi ở cuối installer,
# sau cac buoc bat buoc (Codex, config), để lỗi giữa chừng không để máy nửa vời.
$current = Join-Path $KitgenHome 'current'
$source  = $dest

New-Dir (Join-Path $Workspace '.kitgen')
New-Dir (Join-Path $Workspace 'projects')

# ── DON DI SAN DOI PYTHON / DOI ENGINE-CHEP-VAO-WORKSPACE ─────────────────────
# Ba thu muc nay do ban <=2.1.45 tao ra va nay KHONG CON AI GOI:
#   · tools\python           — CPython rieng (~45 MB tren Windows);
#   · <workspace>\.venv      — venv + Pillow;
#   · <workspace>\.kitgen\engine — ban chep cua engine. `lib/engine.mjs::prepareEngine`
#     nay KHONG chep file nao; de lai la de mot engine DOI CU nam DAU danh sach tim
#     kiem cua agent moi (`resolveEngine` thu `ws.engineDir` truoc).
# "Thoi khong cai nua" la chua du: may update tu ban cu se giu nguyen dong do vinh vien.
$legacyPaths = @(
  (Join-Path $KitgenHome 'tools\python'),
  (Join-Path $Workspace '.venv'),
  (Join-Path $Workspace '.kitgen\engine'),
  (Join-Path $KitgenHome 'bin\python3')      # shim `python3` cho Git-Bash, da bo
)
$legacyMb = 0.0
$legacyWhat = @()
foreach ($lp in $legacyPaths) {
  if (-not (Test-Path -LiteralPath $lp)) { continue }
  try {
    $bytes = (Get-ChildItem -LiteralPath $lp -Recurse -Force -File -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($bytes) { $legacyMb += ($bytes / 1MB) }
  } catch { }
  $legacyWhat += (Split-Path -Leaf $lp)
  Remove-Item -LiteralPath $lp -Recurse -Force -ErrorAction SilentlyContinue
}
if ($legacyWhat.Count -gt 0) {
  Write-Ok ("da don {0:N0} MB di san doi Python/engine-bash: {1} (KitGen nay chi can Node)" -f $legacyMb, ($legacyWhat -join ', '))
}

# ── (DA BO) Python rieng + venv + shim python3 ───────────────────────────────
# Khoi ~150 dong o day tung lam bon viec: do/tai CPython pin cung, dung venv, pip
# pillow, va sinh mot shim `python3` khong duoi file cho Git-Bash (vi Windows khong co
# lenh ten do, ma `gen.sh` thi goi no tran). Ca bon deu chet cung engine bash/python
# ngay 16/09/2026. Cac buoc sau day tu dong lui mot so: [5/7], [6/7], [7/7].

# ── 5. Codex CLI ──────────────────────────────────────────────────────────────
Write-Step '5/7' 'Codex CLI'
$toolsPrefix = Join-Path $KitgenHome 'tools'
New-Dir $toolsPrefix
$codexBin = $null
# Doi xung voi install.sh: codex cua MAY phai duoc do tren PATH cua NGUOI DUNG. O day
# dieu do dung san vi install.ps1 KHONG chen gi vao $env:Path ($KitgenOrigPath o dau
# file chinh la $env:Path nay) — dung them $nodeDir vao PATH truoc dong nay, neu khong
# mot ban @openai/codex lac trong Node rieng se tu nhan lam codex cua may.
$sysCodex = Get-Command codex -ErrorAction SilentlyContinue
if ($sysCodex) {
  # `codex --version` cua mot ban cai hong in ra stderr — voi `2>$null` + EAP='Stop'
  # thi day la mot qua min nua y het [3/8]. Day la PHEP THU, hong la binh thuong.
  if ((Invoke-ExeSoft $sysCodex.Source @('--version') -Quiet) -eq 0) { $codexBin = $sysCodex.Source; Write-Ok "dung Codex da co: $codexBin" }
  else { Write-Warn "co lenh codex tai $($sysCodex.Source) nhung --version that bai" }
}
if (-not $codexBin) {
  # Cai bang installer CHINH THUC cua OpenAI (binary native). BANG CHUNG HIEN TRUONG
  # 24/08/2026: ban codex cai qua npm KHONG gen duoc anh tren may khach; cai lai bang
  # installer chinh thuc thi gen duoc ngay. npm chi con la duong lui khi tai that bai.
  $codexInstallDir = Join-Path $env:USERPROFILE '.local\bin'
  $officialCodex = Join-Path $codexInstallDir 'codex.exe'
  # Ban chinh thuc da cai tu luot truoc (thu muc nay co the chua vao PATH) ⇒ dung lai,
  # khong tai lai installer moi lan update.
  if ((Test-Path -LiteralPath $officialCodex) -and ((Invoke-ExeSoft $officialCodex @('--version') -Quiet) -eq 0)) {
    $codexBin = $officialCodex; Write-Ok "dung Codex chinh thuc da co: $officialCodex"
  }
}
if ((-not $codexBin) -and $env:KITGEN_SKIP_CODEX_INSTALL) {
  # Duong tat cho CI/test: mo phong "may khong tai duoc codex" ma khong cham mang that
  # (doi xung voi KITGEN_SKIP_CODEX_UPDATE o khoi nang cap ben duoi).
  Write-Warn 'bo qua tai Codex chinh thuc theo KITGEN_SKIP_CODEX_INSTALL'
} elseif (-not $codexBin) {
  Write-Host '  Codex CLI (installer chinh thuc cua OpenAI) ...'
  try {
    $env:CODEX_INSTALL_DIR = $codexInstallDir
    $env:CODEX_NON_INTERACTIVE = '1'
    $codexInstallScript = (Invoke-WebRequest -UseBasicParsing -Uri 'https://chatgpt.com/codex/install.ps1').Content
    # Chay trong scope con de bien/ham cua script installer khong tran vao script nay.
    & ([scriptblock]::Create($codexInstallScript)) | Out-Null
  } catch { }
  finally {
    Remove-Item Env:CODEX_INSTALL_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:CODEX_NON_INTERACTIVE -ErrorAction SilentlyContinue
  }
  if ((Test-Path -LiteralPath $officialCodex) -and ((Invoke-ExeSoft $officialCodex @('--version') -Quiet) -eq 0)) {
    $codexBin = $officialCodex; Write-Ok "cai Codex chinh thuc: $officialCodex"
  }
}
# KHONG lui ve npm: ban npm la dung ban da gen hong ngoai hien truong — cai no vao la
# den xanh ma khong ra anh. Mot duong cai duy nhat = mot duong update duy nhat.
if (-not $codexBin) { Write-Block 'Codex CLI' 'Chay trong PowerShell:  irm https://chatgpt.com/codex/install.ps1 | iex  (roi `codex login`). Khong co Codex thi KHONG gen duoc anh.' }
# Don ban codex npm cu trong tools\ (duong cai da bo 24/08/2026): de nguyen thi may
# update tu ban cu van con HAI ban codex va ban npm khong bao gio duoc nang nua.
$oldNpmCodex = Join-Path $toolsPrefix 'node_modules\@openai\codex'
if ((Test-Path -LiteralPath $oldNpmCodex) -and ($codexBin -ne (Join-Path $toolsPrefix 'node_modules\.bin\codex.cmd'))) {
  Remove-Item -LiteralPath $oldNpmCodex -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $toolsPrefix 'node_modules\.bin\codex.cmd') -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $toolsPrefix 'node_modules\.bin\codex') -Force -ErrorAction SilentlyContinue
  Write-Ok 'da don ban Codex npm cu trong tools\ (chi con mot duong cai chinh thuc)'
}
# Don goi codex ma chinh installer doi truoc da VO TINH tu cai vao Node rieng. Tren
# Windows, npm global prefix cua ban Node giai nen tu ZIP CHINH LA thu muc node, nen
# `npm install -g @openai/codex` do nguyen goi (binary cho MOI nen tang, ~277 MB) vao
# <nodeDir>\node_modules\@openai\codex kem shim codex.cmd/codex.ps1/codex nam ngay
# canh node.exe. Khong ai goi toi no — codex that nam cho khac — nen no chi la dia mat
# trang, va luot update nao cung phinh them mot ban moi.
$strayNpmCodex = Join-Path $nodeDir 'node_modules\@openai\codex'
$strayShims    = @('codex.cmd', 'codex.ps1', 'codex')
$strayIsLive   = $false
if ($codexBin) {
  if ($codexBin.StartsWith($strayNpmCodex, [System.StringComparison]::OrdinalIgnoreCase)) { $strayIsLive = $true }
  foreach ($shim in $strayShims) {
    if ($codexBin -eq (Join-Path $nodeDir $shim)) { $strayIsLive = $true }
  }
}
if ((Test-Path -LiteralPath $strayNpmCodex) -and (-not $strayIsLive)) {
  $strayBytes = 0
  try {
    $strayBytes = [int64]((Get-ChildItem -LiteralPath $strayNpmCodex -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | Measure-Object -Property Length -Sum).Sum)
  } catch { $strayBytes = 0 }
  $strayMb = [math]::Round($strayBytes / 1MB, 1)
  Remove-Item -LiteralPath $strayNpmCodex -Recurse -Force -ErrorAction SilentlyContinue
  $openaiDir = Join-Path $nodeDir 'node_modules\@openai'
  if ((Test-Path -LiteralPath $openaiDir) -and (-not (Get-ChildItem -LiteralPath $openaiDir -Force -ErrorAction SilentlyContinue))) {
    Remove-Item -LiteralPath $openaiDir -Force -ErrorAction SilentlyContinue
  }
  foreach ($shim in $strayShims) {
    Remove-Item -LiteralPath (Join-Path $nodeDir $shim) -Force -ErrorAction SilentlyContinue
  }
  Write-Ok "da don $strayMb MB goi @openai/codex lac vao Node rieng cua KitGen - do lenh codex update doi truoc chay nham npm cua KitGen; codex that dang o $codexBin"
}

# ── NANG CODEX LEN BAN MOI (doi xung voi khoi cung ten trong install.sh) ──────
# Cong cu tao anh KHONG nam trong ban phat hanh KitGen — no la tool/skill di kem goi
# @openai/codex. Truoc ban nay installer chi CAI codex khi may chua co, khong bao gio
# nang: may da co codex thi bam Cap nhat KitGen bao nhieu lan cung ket o ban cu, va moi
# tinh nang anh OpenAI phat hanh sau do KHONG BAO GIO toi tay nguoi dung.
#
# Dung `codex update` (lenh con chinh thuc) chu KHONG `npm i -g`: codex tu biet no duoc
# cai bang duong nao va tu nang dung duong ay.
#
# BA RAO, vi codex la cong cu DUNG CHUNG cua ca may:
#  (1) Hong thi BO QUA — Invoke-ExeSoft khong nem, chi tra ma thoat. Codex cu van chay.
#  (2) Co han gio: Start-Process + WaitForExit(ms) roi Kill. `codex update` treo la treo
#      ca luot cai, ma nguoi dung chi thay man hinh dung im khong biet vi sao.
#  (3) Co duong tat: KITGEN_SKIP_CODEX_UPDATE=1.
if ($codexBin) {
  $verBefore = (& { $ErrorActionPreference = 'Continue'; (& $codexBin '--version' 2>&1 | Select-Object -First 1) })   # NATIVE-OK
  if ($env:KITGEN_SKIP_CODEX_UPDATE) {
    Write-Ok "bo qua nang Codex theo KITGEN_SKIP_CODEX_UPDATE - giu $verBefore"
  } else {
    $updated = $false
    try {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $codexBin
      $psi.Arguments = 'update'
      $psi.UseShellExecute = $false
      $psi.RedirectStandardOutput = $true
      $psi.RedirectStandardError = $true
      # PATH GOC, khong phai PATH cua installer: `codex update` cua ban cai-qua-npm goi
      # thang `npm install -g @openai/codex@latest`, va npm DAU TIEN tren PATH la ke
      # quyet dinh goi roi vao dau. Node rieng cua KitGen dung dau thi goi 277 MB roi
      # vao tools\node con codex cua nguoi dung KHONG duoc nang — installer van in
      # "Codex da la ban moi nhat". Tra lai PATH goc la tra viec nang codex ve dung chu.
      $psi.EnvironmentVariables['PATH'] = $KitgenOrigPath
      $proc = [System.Diagnostics.Process]::Start($psi)
      if ($proc.WaitForExit(180000)) { $updated = ($proc.ExitCode -eq 0) }
      else { try { $proc.Kill() } catch { } }
    } catch { $updated = $false }
    if ($updated) {
      $verAfter = (& { $ErrorActionPreference = 'Continue'; (& $codexBin '--version' 2>&1 | Select-Object -First 1) })   # NATIVE-OK
      if ("$verAfter" -ne "$verBefore") { Write-Ok "da nang Codex: $verBefore -> $verAfter" }
      else { Write-Ok "Codex da la ban moi nhat: $verBefore" }
    } else {
      Write-Warn "khong nang duoc Codex (mat mang, het gio, hoac thieu quyen) - van dung $verBefore"
    }
  }

  # `codex update` doi NHI PHAN ngay nhung KHONG viet lai $CODEX_HOME\skills\.system\imagegen\
  # — thu muc skill chi dong bo khi codex CHAY lan ke tiep (BACKLOG #24 (13)). Khong chay ho
  # thi luot gen DAU TIEN sau update van dung SKILL.md doi cu — dung ca anh duc da can nguoi
  # dung that. `debug prompt-input` re: khong mang, khong quota, chi liet ke skill.
  foreach ($skillHome in @((Join-Path $env:USERPROFILE '.codex'))) {
    if (-not (Test-Path -LiteralPath $skillHome)) { continue }
    try {
      $psi2 = New-Object System.Diagnostics.ProcessStartInfo
      $psi2.FileName = $codexBin
      $psi2.Arguments = 'debug prompt-input'
      $psi2.UseShellExecute = $false
      $psi2.RedirectStandardOutput = $true
      $psi2.RedirectStandardError = $true
      $psi2.EnvironmentVariables['CODEX_HOME'] = $skillHome
      $proc2 = [System.Diagnostics.Process]::Start($psi2)
      if (-not $proc2.WaitForExit(60000)) { try { $proc2.Kill() } catch { } }
    } catch { }
  }
}

# Don rac doi Playwright (790,9 MB) o luot update. May sach khong co gi de xoa.
# Cung ly do, `@resvg/resvg-wasm` (2,4 MB) bi go khoi duong cai tu 07/09/2026: khong con
# anh SVG nao de render, nhung may update tu ban cu van giu nguyen goi trong tools\.
foreach ($p in @('playwright-browsers', 'node_modules\playwright', 'node_modules\playwright-core', 'node_modules\@resvg')) {
  Remove-Item -LiteralPath (Join-Path $toolsPrefix $p) -Recurse -Force -ErrorAction SilentlyContinue
}

# ── 6. config + lệnh kitgen ────────────────────────────────────────────────────
Write-Step '6/7' 'Cau hinh va lenh kitgen'

# .kitgen\config.json — chi con workspaceVersion/maxJobs; khoi `imageGen` cu bi xoa
# (ho so anh rieng da bo 24/08/2026, doi xung voi khoi cung ten trong install.sh).
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
# Ho so anh rieng da bo 24/08/2026: moi may dung thang ~/.codex. Xoa khoi `imageGen`
# sot lai tu ban cu de khong ai doc nham no nua.
if ($cfg.PSObject.Properties.Name -contains 'imageGen') { $cfg.PSObject.Properties.Remove('imageGen') }
Write-TextCrLf $cfgPath (($cfg | ConvertTo-Json -Depth 8))
Write-Ok 'config.json (Codex mac dinh ~/.codex)'

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
set "NODE_PATH=$nodeModules"
set "KITGEN_RELEASE_MANIFEST=$ReleaseManifest"
"@
Write-TextCrLf (Join-Path $KitgenHome 'config.cmd') $configCmd

# kitgen.cmd — ban Windows cua runtime/bin/kitgen.
# PATH cua agent KHONG con `<workspace>\.venv\Scripts` lan `<Git>\usr\bin`: engine la JS,
# chay bang `%KITGEN_NODE%`. Doi xung voi runtime/bin/kitgen tren macOS/Linux.
$kitgenCmd = @"
@echo off
setlocal enabledelayedexpansion
call "%~dp0..\config.cmd"
set "PATH=%KITGEN_HOME%\bin;%KITGEN_HOME%\tools\node;%KITGEN_HOME%\tools\node_modules\.bin;%PATH%"
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

# Installer cho LUOT SAU lay tu GOI MOI, khong phai tu chinh file dang chay:
# tu-copy-chinh-minh la co che lam installer doi dau dong cung vinh vien tren may
# user — moi ban va Windows (ke ca buoc `codex update`) khong bao gio toi noi.
# Goi cu chua co install.ps1 (truoc 24/08) thi moi roi ve self-copy.
$pkgInstaller = Join-Path $candidate 'install.ps1'
if (Test-Path -LiteralPath $pkgInstaller) {
  Copy-Item -LiteralPath $pkgInstaller -Destination (Join-Path $KitgenHome 'install.ps1') -Force
} else {
  Copy-Item -LiteralPath $MyInvocation.MyCommand.Path -Destination (Join-Path $KitgenHome 'install.ps1') -Force
}
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

# ── 7. khởi động ───────────────────────────────────────────────────────────────
Write-Step '7/7' 'Khoi dong dich vu'
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
Write-Host 'Buoc cuoi: dang nhap Codex neu chua -> go `codex login` hoac bam nut Dang nhap trong app'
Write-Host ''
Write-Host 'BAN CAI WINDOWS DANG O TRANG THAI EXPERIMENTAL.' -ForegroundColor Yellow
Write-Host 'Gap loi, chup man hinh + gui file log:' -ForegroundColor Yellow
Write-Host "  $logFile"

if ($script:Blockers.Count -gt 0) { exit 2 }

} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
