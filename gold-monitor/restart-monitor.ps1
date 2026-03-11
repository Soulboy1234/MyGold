$ErrorActionPreference = "Stop"

$monitorDir = $PSScriptRoot
$daemonFile = Join-Path $monitorDir "src\daemon.mjs"
$launcher = Join-Path $monitorDir "launch-hidden.vbs"
$stateFile = Join-Path $monitorDir "state\daemon.json"

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

if (-not (Test-Path $daemonFile)) {
  Write-Host "Monitor daemon not found: $daemonFile"
  exit 1
}

if (Test-Path $stateFile) {
  try {
    $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    if ($state.pid) {
      Stop-Process -Id $state.pid -Force -ErrorAction SilentlyContinue
    }
  } catch {
  }
}

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*$daemonFile*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Milliseconds 800
& wscript.exe $launcher
