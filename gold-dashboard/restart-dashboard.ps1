param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$dashboardDir = $PSScriptRoot
$serverFile = Join-Path $dashboardDir "server.mjs"
$launcher = Join-Path $dashboardDir "launch-hidden.vbs"
$url = "http://127.0.0.1:3099"
$openBrowser = -not $NoBrowser

function Resolve-NodeExe {
  $command = Get-Command node -ErrorAction SilentlyContinue
  $candidates = @(
    $env:GOLD_NODE_EXE
    $(if ($command) { $command.Source })
    (Join-Path $env:ProgramFiles "nodejs\node.exe")
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Node.js not found. Install Node.js 22+ first."
}

try {
  $nodeExe = Resolve-NodeExe
} catch {
  Write-Host $_.Exception.Message
  exit 1
}

if (-not (Test-Path $nodeExe)) {
  Write-Host "Node.js not found: $nodeExe"
  exit 1
}

if (-not (Test-Path $serverFile)) {
  Write-Host "Dashboard server not found: $serverFile"
  exit 1
}

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*$serverFile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 800
& wscript.exe $launcher
Start-Sleep -Seconds 2
if ($openBrowser) {
  Start-Process $url
}
