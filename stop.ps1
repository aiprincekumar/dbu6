# dbu6 Instant Stopper for Windows PowerShell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location -Path $PSScriptRoot

# 1. Kill from lockfile PID immediately
if (Test-Path "data\dbu6.lock") {
    $raw = Get-Content "data\dbu6.lock" -Raw -ErrorAction SilentlyContinue
    if ($raw) {
        $lockPid = $raw.Trim()
        if ($lockPid -match '^\d+$') {
            taskkill /PID $lockPid /T /F 2>$null | Out-Null
        }
    }
    Remove-Item "data\dbu6.lock" -Force -ErrorAction SilentlyContinue
}

# 2. Kill from port 2345 listener immediately
$conn = Get-NetTCPConnection -LocalPort 2345 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    taskkill /PID $conn.OwningProcess /T /F 2>$null | Out-Null
}

# 3. Clean up lockfile if remaining
if (Test-Path "data\dbu6.lock") {
    Remove-Item "data\dbu6.lock" -Force -ErrorAction SilentlyContinue
}

exit 0
