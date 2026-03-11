$ErrorActionPreference = "SilentlyContinue"
$dashboardDir = $PSScriptRoot
$serverFile = Join-Path $dashboardDir "server.mjs"

$matched = @(
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$serverFile*" }
)

foreach ($process in $matched) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500

$remaining = @(
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$serverFile*" }
)

if ($remaining.Count -eq 0) {
  Write-Host "dashboard-stopped"
  exit 0
}

Write-Host "dashboard-still-running"
exit 1
