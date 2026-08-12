@echo off
setlocal
cd /d "%~dp0"

call powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-old-servers.ps1"
if errorlevel 1 goto :port_failed

if not exist node_modules\msedge-tts call npm.cmd install
call npm.cmd run build
if errorlevel 1 goto :failed

set "MOBILE_PORT=4174"
set "MOBILE_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /i "IPv4"') do if not defined MOBILE_IP set "MOBILE_IP=%%A"
set "MOBILE_IP=%MOBILE_IP: =%"

echo.
echo ==================================================
echo Mobile access server is starting.
echo Keep this window open while using the phone.
echo Phone URL: http://%MOBILE_IP%:%MOBILE_PORT%
echo If Windows Firewall asks, allow Private networks.
echo ==================================================
echo.

if /i "%~1"=="--open-desktop" start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
call npm.cmd run serve:mobile
goto :failed

:port_failed
echo.
echo Could not safely release port 4173 or 4174.
echo Please close the program shown above, then run this file again.
pause
exit /b 1

:failed
echo.
echo Server stopped or failed to start.
pause
