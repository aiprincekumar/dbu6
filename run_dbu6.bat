@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Starting dbu6 Accounting Server on Windows...
echo   Web Address: http://localhost:2345
echo ===================================================

REM Launch browser in background after short delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:2345"

REM Start dbu6 server
npm start

pause
