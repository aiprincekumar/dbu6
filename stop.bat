@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: 1. Read PID from data\dbu6.lock if it exists and kill process tree immediately
if exist "data\dbu6.lock" (
    set /p LOCK_PID=<"data\dbu6.lock"
    if defined LOCK_PID (
        taskkill /F /T /PID !LOCK_PID! >nul 2>&1
    )
    del /f /q "data\dbu6.lock" >nul 2>&1
)

:: 2. Find any process listening on port 2345 and kill immediately
for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr /r /c:":2345 .*LISTENING"') do (
    taskkill /F /T /PID %%p >nul 2>&1
)

:: 3. Clean up lockfile if remaining
if exist "data\dbu6.lock" (
    del /f /q "data\dbu6.lock" >nul 2>&1
)

:: 4. Exit immediately with 0 seconds wait
exit /b 0
