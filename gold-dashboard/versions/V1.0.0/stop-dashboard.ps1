$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script = Join-Path $projectDir "stop-dashboard.ps1"

if (-not (Test-Path $script)) {
  throw "Dashboard stop script not found: $script"
}

& $script
