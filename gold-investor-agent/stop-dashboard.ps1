$projectDir = $PSScriptRoot
$serverFile = Join-Path $projectDir "src\server.mjs"

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*$serverFile*" }

if (-not $existing) {
  Write-Output "Gold investor dashboard is not running."
  exit 0
}

foreach ($proc in $existing) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  } catch {
  }
}

Write-Output "Gold investor dashboard stopped."
