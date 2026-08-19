@echo off
setlocal
set "KITGEN_RAW_INSTALL=https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/scripts/install.ps1"
set "KITGEN_BOOTSTRAP=%TEMP%\kitgen-install-%RANDOM%.ps1"
set "KITGEN_RC=1"

echo Downloading KitGen installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%KITGEN_RAW_INSTALL%' -OutFile $env:KITGEN_BOOTSTRAP"
if errorlevel 1 goto :download_failed

powershell -NoProfile -ExecutionPolicy Bypass -File "%KITGEN_BOOTSTRAP%" -CodexDefault
set "KITGEN_RC=%ERRORLEVEL%"
del /q "%KITGEN_BOOTSTRAP%" >nul 2>&1
rem Exit code 2 means: runtime installed, but user-side prerequisites are missing and
rem the installer already printed a checklist. Do NOT fall through to the health check:
rem the agent was never started, so it would report "agent did not answer" and point at
rem an agent.log that does not exist yet - hiding the real cause.
if "%KITGEN_RC%"=="2" goto :missing_prereqs
if not "%KITGEN_RC%"=="0" goto :install_failed

set "KITGEN_HOME=%LOCALAPPDATA%\KitGen"
if exist "%KITGEN_HOME%\config.cmd" call "%KITGEN_HOME%\config.cmd" >nul 2>&1
if not defined KITGEN_PORT set "KITGEN_PORT=8765"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; foreach($i in 1..30){try{$r=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $env:KITGEN_PORT + '/health') -Headers @{'X-KitGen-Client'='1';'Origin'=('http://127.0.0.1:' + $env:KITGEN_PORT)} -TimeoutSec 3;if($r.StatusCode -eq 200){$ok=$true;break}}catch{};if(-not $ok){Start-Sleep -Seconds 1}};if(-not $ok){[Console]::Error.WriteLine('KitGen agent did not answer health check');exit 1}"
if errorlevel 1 goto :health_failed
start "" "http://127.0.0.1:%KITGEN_PORT%/app/"
echo KitGen installed. The app is opening in your browser.
set "KITGEN_RC=0"
goto :finish

:download_failed
del /q "%KITGEN_BOOTSTRAP%" >nul 2>&1
echo Could not download the KitGen installer.
goto :finish

:install_failed
echo KitGen installation failed.
goto :finish

:missing_prereqs
echo KitGen was installed, but the prerequisites listed above are still missing.
echo Install them, then run this file again. Nothing needs to be uninstalled.
goto :finish

:health_failed
echo KitGen installed, but the agent did not pass the health check.
echo Check LocalAppData\KitGen\agent.log and run start-server.bat again.
goto :finish

:finish
echo.
pause
exit /b %KITGEN_RC%
