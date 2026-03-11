$projectDir = $PSScriptRoot
$serverFile = Join-Path $projectDir "src\server.mjs"
$launcher = Join-Path $projectDir "launch-dashboard-hidden.vbs"

$existing = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like "*$serverFile*" }

foreach ($proc in $existing) {
  try {
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
  } catch {
  }
}

Start-Sleep -Seconds 1

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$launcher`"" -WorkingDirectory $projectDir | Out-Null
Write-Output "Gold investor dashboard started."
