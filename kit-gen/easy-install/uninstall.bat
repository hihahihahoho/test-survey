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

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$startup=[Environment]::GetFolderPath('Startup');$vbs=Join-Path $startup 'KitGen.vbs';if(Test-Path -LiteralPath $vbs){Remove-Item -LiteralPath $vbs -Force};$home=$env:KITGEN_HOME;if($home -and (Test-Path -LiteralPath $home)){Remove-Item -LiteralPath $home -Recurse -Force};if($env:KITGEN_REMOVE_WORKSPACE -eq '1'){$workspace=$env:KITGEN_WORKSPACE;$root=[IO.Path]::GetPathRoot($workspace);if($workspace -and $workspace.TrimEnd('\') -ne $root -and (Test-Path -LiteralPath $workspace)){Remove-Item -LiteralPath $workspace -Recurse -Force}}"
if errorlevel 1 goto :failed

if "%KITGEN_REMOVE_WORKSPACE%"=="1" (
  echo KitGen runtime and user data removed.
) else (
  echo KitGen runtime removed. User data was kept.
)
set "KITGEN_RC=0"
goto :finish

:failed
echo Could not remove all KitGen files. Check permissions and try again.
set "KITGEN_RC=1"

:finish
echo.
pause
exit /b %KITGEN_RC%
