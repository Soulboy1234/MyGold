$ErrorActionPreference = "Stop"

$suiteDir = $PSScriptRoot
$workspaceRoot = Split-Path $suiteDir -Parent

$requiredPaths = @(
  (Join-Path $workspaceRoot "gold-monitor"),
  (Join-Path $workspaceRoot "gold-dashboard"),
  (Join-Path $workspaceRoot "gold-investor-agent"),
  (Join-Path $workspaceRoot "gold-monitor\src\daemon.mjs"),
  (Join-Path $workspaceRoot "gold-dashboard\server.mjs"),
  (Join-Path $workspaceRoot "gold-investor-agent\src\daemon.mjs"),
  (Join-Path $workspaceRoot "gold-investor-agent\src\server.mjs"),
  (Join-Path $workspaceRoot "gold-dashboard\versions\V1.0.0"),
  (Join-Path $workspaceRoot "gold-monitor\versions\V1.1.0"),
  (Join-Path $workspaceRoot "gold-investor-agent\versions\V4.3.4"),
  (Join-Path $suiteDir "manifest.json"),
  (Join-Path $suiteDir "install.cmd"),
  (Join-Path $suiteDir "install-autostart.ps1"),
  (Join-Path $suiteDir "start-all.cmd"),
  (Join-Path $suiteDir "start-all-silent.cmd"),
  (Join-Path $suiteDir "stop-all.cmd")
)

$missing = @($requiredPaths | Where-Object { -not (Test-Path $_) })
if ($missing.Count -gt 0) {
  throw ("Package layout is incomplete:`n" + ($missing -join "`n"))
}

Write-Host "Package layout verified."
