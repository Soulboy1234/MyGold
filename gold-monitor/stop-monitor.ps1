$ErrorActionPreference = "SilentlyContinue"
$monitorDir = $PSScriptRoot
$stateFile = Join-Path $monitorDir "state\daemon.json"
$daemonFile = Join-Path $monitorDir "src\daemon.mjs"

$matched = @(
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$daemonFile*" }
)

$previousState = $null
if (Test-Path $stateFile) {
  try {
    $previousState = Get-Content $stateFile -Raw | ConvertFrom-Json
  } catch {
  }
}

foreach ($process in $matched) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500

$remaining = @(
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$daemonFile*" }
)

if ($remaining.Count -eq 0) {
  $nextState = [ordered]@{
    pid = $null
    stoppedAt = (Get-Date).ToString("o")
    intervalMs = if ($previousState) { $previousState.intervalMs } else { $null }
    runCount = if ($previousState) { $previousState.runCount } else { 0 }
    consecutiveFailures = if ($previousState) { $previousState.consecutiveFailures } else { 0 }
    lastSuccessAt = if ($previousState) { $previousState.lastSuccessAt } else { $null }
    lastFailureAt = if ($previousState) { $previousState.lastFailureAt } else { $null }
    lastError = if ($previousState) { $previousState.lastError } else { "" }
    status = "stopped"
  }
  $nextState | ConvertTo-Json -Depth 4 | Set-Content -Path $stateFile -Encoding utf8
  Write-Host "monitor-stopped"
  exit 0
}

Write-Host "monitor-still-running"
exit 1
