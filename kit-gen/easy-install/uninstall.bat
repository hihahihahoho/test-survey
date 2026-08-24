@echo off
setlocal
set "KITGEN_HOME=%LOCALAPPDATA%\KitGen"
set "KITGEN_WORKSPACE=%USERPROFILE%\KitGen"
set "KITGEN_REMOVE_WORKSPACE=0"

if exist "%KITGEN_HOME%\config.cmd" call "%KITGEN_HOME%\config.cmd" >nul 2>&1
if exist "%KITGEN_HOME%\bin\kitgen.cmd" call "%KITGEN_HOME%\bin\kitgen.cmd" stop >nul 2>&1

echo This removes the KitGen runtime and its login startup entry.
echo User data is kept by default.
set /p "KITGEN_ANSWER=Delete the KitGen user data too? [y/N]: "
if /I "%KITGEN_ANSWER%"=="Y" set "KITGEN_REMOVE_WORKSPACE=1"

rem NOTE: never assign to reserved PowerShell automatic variables ($home, $host,
rem $pid, $error, ...) inside the -Command payload below - they are read-only and
rem the assignment throws, aborting the whole uninstall. Field bug of 2026-08-24.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$startup=[Environment]::GetFolderPath('Startup');$vbs=Join-Path $startup 'KitGen.vbs';if(Test-Path -LiteralPath $vbs){Remove-Item -LiteralPath $vbs -Force};$kgHome=$env:KITGEN_HOME;if($kgHome -and (Test-Path -LiteralPath $kgHome)){Get-Process node,codex,python -ErrorAction SilentlyContinue|Where-Object{$_.Path -and $_.Path.StartsWith($kgHome,[StringComparison]::OrdinalIgnoreCase)}|Stop-Process -Force -ErrorAction SilentlyContinue;Start-Sleep -Seconds 1;$junction=Get-Item -LiteralPath (Join-Path $kgHome 'current') -Force -ErrorAction SilentlyContinue;if($junction -and ($junction.Attributes -band [IO.FileAttributes]::ReparsePoint)){$junction.Delete()};Remove-Item -LiteralPath $kgHome -Recurse -Force}else{Write-Host ('KitGen runtime not found at '+$kgHome)};if($env:KITGEN_REMOVE_WORKSPACE -eq '1'){$ws=$env:KITGEN_WORKSPACE;$wsRoot=[IO.Path]::GetPathRoot($ws);if($ws -and $ws.TrimEnd('\') -ne $wsRoot -and (Test-Path -LiteralPath $ws)){Remove-Item -LiteralPath $ws -Recurse -Force}}"
if errorlevel 1 goto :failed

if "%KITGEN_REMOVE_WORKSPACE%"=="1" (
  echo KitGen runtime and user data removed.
) else (
  echo KitGen runtime removed. User data was kept.
)
set "KITGEN_RC=0"
goto :finish

:failed
echo Could not remove all KitGen files. Close any running KitGen windows and try again.
set "KITGEN_RC=1"

:finish
echo.
pause
exit /b %KITGEN_RC%
