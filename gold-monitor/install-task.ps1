param(
  [string]$TaskName = "CodexGoldMonitor"
)

$ErrorActionPreference = "Stop"

$projectDir = $PSScriptRoot
$runner = Join-Path $projectDir "run-monitor-task.cmd"

if (-not (Test-Path $runner)) {
  throw "Scheduled task runner not found: $runner"
}

$startTime = (Get-Date).AddMinutes(1).ToString("HH:mm")
$taskCommand = "cmd.exe /c `"$runner`""

schtasks /Create /TN $TaskName /SC MINUTE /MO 10 /ST $startTime /TR $taskCommand /F | Out-Null

Write-Host "Scheduled task `"$TaskName`" installed."
