@echo off
setlocal
cd /d "%~dp0"

:: Launch dbu6 server completely hidden via Windows native wscript.exe
start "" wscript.exe "%~dp0start_hidden.vbs"

:: Exit immediately so NO command prompt window stays open
exit
