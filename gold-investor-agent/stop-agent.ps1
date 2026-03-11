$agentDir = $PSScriptRoot
$daemonFile = Join-Path $agentDir "src\daemon.mjs"

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*$daemonFile*" }

if (-not $existing) {
  Write-Output "Gold investor agent daemon is not running."
  exit 0
}

foreach ($proc in $existing) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  } catch {
  }
}

Write-Output "Gold investor agent daemon stopped."
