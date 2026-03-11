$agentDir = $PSScriptRoot
$daemonFile = Join-Path $agentDir "src\daemon.mjs"
$launcher = Join-Path $agentDir "launch-agent-hidden.vbs"

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*$daemonFile*" }

foreach ($proc in $existing) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  } catch {
  }
}

Start-Sleep -Seconds 1

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$launcher`"" -WorkingDirectory $agentDir | Out-Null
Write-Output "Gold investor agent daemon started."
