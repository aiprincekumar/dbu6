# dbu6 1-Click Launcher for Windows PowerShell
Set-Location -Path $PSScriptRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Starting dbu6 Accounting Server on Windows..." -ForegroundColor Green
Write-Host "  Web Address: http://localhost:2345" -ForegroundColor Yellow
Write-Host "===================================================" -ForegroundColor Cyan

# Launch browser after 3 seconds in background job
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:2345"
} | Out-Null

npm start
