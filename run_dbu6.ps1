# dbu6 1-Click Launcher for Windows PowerShell
Set-Location -Path $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  dbu6 Accounting Server Launcher for Windows" -ForegroundColor Green
Write-Host "  Web Address: http://localhost:2345" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

# Check if port 2345 is already listening
$conn = Get-NetTCPConnection -LocalPort 2345 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[INFO] dbu6 server is already running and listening on port 2345." -ForegroundColor Green
    Write-Host "[INFO] Opening browser at http://localhost:2345..." -ForegroundColor Cyan
    Start-Process "http://localhost:2345"
    Exit 0
}

# Launch browser after 3 seconds in background job
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:2345"
} | Out-Null

npm start
