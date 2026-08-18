@echo off
setlocal
set "KITGEN_HOME=%LOCALAPPDATA%\KitGen"
set "KITGEN_BIN=%KITGEN_HOME%\bin\kitgen.cmd"
set "KITGEN_RC=1"

if not exist "%KITGEN_BIN%" goto :not_installed
if exist "%KITGEN_HOME%\config.cmd" call "%KITGEN_HOME%\config.cmd" >nul 2>&1
if not defined KITGEN_PORT set "KITGEN_PORT=8765"

call "%KITGEN_BIN%" stop
if errorlevel 1 goto :stop_failed
powershell -NoProfile -ExecutionPolicy Bypass -Command "$responding=$false;foreach($i in 1..15){try{$r=Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:' + $env:KITGEN_PORT + '/health') -Headers @{'X-KitGen-Client'='1';'Origin'=('http://127.0.0.1:' + $env:KITGEN_PORT)} -TimeoutSec 3;if($r.StatusCode -eq 200){$responding=$true}}catch{$responding=$false};if(-not $responding){exit 0};Start-Sleep -Seconds 1};Write-Error 'KitGen agent is still responding';exit 1"
if errorlevel 1 goto :health_failed
echo KitGen is stopped.
set "KITGEN_RC=0"
goto :finish

:not_installed
echo KitGen is not installed. Double-click install.bat first.
goto :finish

:stop_failed
echo KitGen could not stop.
goto :finish

:health_failed
echo KitGen stop returned, but the agent is still responding.
goto :finish

:finish
echo.
pause
exit /b %KITGEN_RC%
