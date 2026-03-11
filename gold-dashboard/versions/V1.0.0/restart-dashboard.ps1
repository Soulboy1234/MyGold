param(
  [switch]$NoBrowser
)

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script = Join-Path $projectDir "restart-dashboard.ps1"

if (-not (Test-Path $script)) {
  throw "Dashboard restart script not found: $script"
}

& $script @PSBoundParameters
