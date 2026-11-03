# dbu6 1-Click Hidden Background Launcher for Windows PowerShell
Set-Location -Path $PSScriptRoot

# Check if port 2345 is already listening
$conn = Get-NetTCPConnection -LocalPort 2345 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[INFO] dbu6 server is already running and listening on port 2345." -ForegroundColor Green
    Write-Host "[INFO] Opening browser at http://localhost:2345..." -ForegroundColor Cyan
    Start-Process "http://localhost:2345"
    Exit 0
}

# Launch via start_hidden.vbs
Start-Process "wscript.exe" -ArgumentList "`"$PSScriptRoot\start_hidden.vbs`""
Write-Host "[INFO] dbu6 server launched in hidden background mode." -ForegroundColor Green
Write-Host "[INFO] Browser is opening at http://localhost:2345..." -ForegroundColor Cyan
