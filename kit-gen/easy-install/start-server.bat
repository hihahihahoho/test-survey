@echo off
setlocal
set "KITGEN_HOME=%LOCALAPPDATA%\KitGen"
set "KITGEN_BIN=%KITGEN_HOME%\bin\kitgen.cmd"
set "KITGEN_RC=1"

if not exist "%KITGEN_BIN%" goto :not_installed
if exist "%KITGEN_HOME%\config.cmd" call "%KITGEN_HOME%\config.cmd" >nul 2>&1
if not defined KITGEN_PORT set "KITGEN_PORT=8765"

call "%KITGEN_BIN%" start
if errorlevel 1 goto :start_failed
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false;foreach($i in 1..30){try{$r=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $env:KITGEN_PORT + '/health') -Headers @{'X-KitGen-Client'='1';'Origin'=('http://127.0.0.1:' + $env:KITGEN_PORT)} -TimeoutSec 3;if($r.StatusCode -eq 200){$ok=$true;break}}catch{};if(-not $ok){Start-Sleep -Seconds 1}};if(-not $ok){[Console]::Error.WriteLine('KitGen agent did not answer health check');exit 1}"
if errorlevel 1 goto :health_failed
start "" "http://127.0.0.1:%KITGEN_PORT%/app/"
echo KitGen is running. The app is opening in your browser.
set "KITGEN_RC=0"
goto :finish

:not_installed
echo KitGen is not installed. Double-click install.bat first.
goto :finish

:start_failed
echo KitGen could not start.
goto :finish

:health_failed
echo KitGen start returned, but the agent did not pass the health check.
echo Check LocalAppData\KitGen\agent.log.
goto :finish

:finish
echo.
pause
exit /b %KITGEN_RC%
