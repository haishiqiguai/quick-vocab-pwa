@echo off
setlocal
cd /d "%~dp0"
call powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-old-servers.ps1"
if errorlevel 1 goto :port_failed
if not exist node_modules\msedge-tts call npm.cmd install
call npm.cmd run build
if errorlevel 1 goto :failed
echo.
echo ==================================================
echo Quick Vocab desktop server is starting.
echo Desktop URL: http://127.0.0.1:4173
echo Keep this window open while using Quick Vocab.
echo ==================================================
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
call npm.cmd run preview
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
