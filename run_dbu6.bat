@echo off
setlocal
title dbu6 Accounting Server (http://localhost:2345)

:: Change to directory where this script is located
cd /d "%~dp0"

echo ===================================================
echo   dbu6 Accounting Server Launcher for Windows
echo   Web Address: http://localhost:2345
echo ===================================================
echo.

:: 1. Check if Node.js / npm is installed
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm was not found in your system PATH.
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Check if dbu6 is already running on port 2345 (reliable TCP check)
powershell -NoProfile -Command "try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', 2345); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] dbu6 is already running and listening on port 2345.
    echo [INFO] Opening web browser at http://localhost:2345...
    start http://localhost:2345
    timeout /t 3 >nul 2>&1
    exit /b 0
)

:: 3. Clean up stale lockfile if previous process crashed
if exist "data\dbu6.lock" (
    powershell -NoProfile -Command "if (Test-Path 'data\dbu6.lock') { $p = (Get-Content 'data\dbu6.lock' -Raw).Trim(); if ($p -match '^\d+$' -and -not (Get-Process -Id $p -ErrorAction SilentlyContinue)) { Remove-Item 'data\dbu6.lock' -Force; Write-Host '[INFO] Removed stale lockfile from previous crash.' } }"
)

:: 4. Launch browser in background after a 2-second startup delay
echo [INFO] Starting dbu6 server on port 2345...
echo [INFO] Web browser will open automatically at http://localhost:2345
echo.
start "" cmd /c "ping 127.0.0.1 -n 3 >nul & start http://localhost:2345"

:: 5. Start dbu6 server via call npm start
call npm start

:: 6. Handle server termination and keep window open if there was an error
if %ERRORLEVEL% neq 0 (
    echo.
    echo ===================================================
    echo [ERROR] dbu6 server stopped with error code %ERRORLEVEL%.
    if exist "data\dbu6.lock" (
        echo [TIP] If the previous process crashed, delete data\dbu6.lock and try again.
    )
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo [INFO] dbu6 server stopped normally.
    echo ===================================================
)

echo.
pause
