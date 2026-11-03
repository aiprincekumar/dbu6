@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   dbu6 Accounting Server Launcher for Windows
echo   Web Address: http://localhost:2345
echo ===================================================

REM Check if port 2345 is already in use
netstat -ano | findstr /R ":2345 .*LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] dbu6 is already running and listening on port 2345.
    echo [INFO] Opening web browser at http://localhost:2345...
    start http://localhost:2345
    goto done
)

REM If lockfile exists but port is not listening, warn user
if exist "data\dbu6.lock" (
    echo [WARN] Stale lockfile detected at data\dbu6.lock.
    echo If the previous run crashed, you may need to remove data\dbu6.lock.
)

REM Launch browser in background after 3 seconds delay
start "" cmd /c "ping 127.0.0.1 -n 4 >nul & start http://localhost:2345"

REM Start dbu6 server
npm start

:done
pause
