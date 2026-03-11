param(
  [string]$AutoStartTaskName = "CodexGoldSuiteAutoStart",
  [switch]$InstallLegacyMonitorTask,
  [string]$LegacyMonitorTaskName = "CodexGoldMonitor"
)

$ErrorActionPreference = "Stop"

$suiteDir = $PSScriptRoot
$workspaceRoot = Split-Path $suiteDir -Parent
$monitorDir = Join-Path $workspaceRoot "gold-monitor"
$dashboardDir = Join-Path $workspaceRoot "gold-dashboard"
$agentDir = Join-Path $workspaceRoot "gold-investor-agent"
$manifestFile = Join-Path $suiteDir "manifest.json"
$installStateFile = Join-Path $suiteDir "install-state.json"
$autoStartInstaller = Join-Path $suiteDir "install-autostart.ps1"
$layoutVerifier = Join-Path $suiteDir "verify-layout.ps1"
$minimumNodeMajor = 22

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

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host "Node.js not found. Installing Node.js LTS via winget..."
    & $winget.Source install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    foreach ($candidate in @(
      (Join-Path $env:ProgramFiles "nodejs\node.exe"),
      (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
    )) {
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }

  throw "Node.js 22+ is required. Please install Node.js LTS and rerun install.cmd."
}

function Get-NodeVersionInfo {
  param(
    [string]$NodeExe
  )

  $versionText = (& $NodeExe -v).Trim()
  if (-not $versionText.StartsWith("v")) {
    throw "Unable to parse Node.js version: $versionText"
  }

  $version = $versionText.Substring(1)
  $major = [int]($version.Split(".")[0])
  [pscustomobject]@{
    Text = $version
    Major = $major
  }
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $layoutVerifier

foreach ($dir in @($monitorDir, $dashboardDir, $agentDir)) {
  if (-not (Test-Path $dir)) {
    throw "Required project directory not found: $dir"
  }
}

$nodeExe = Resolve-NodeExe
$nodeVersion = Get-NodeVersionInfo -NodeExe $nodeExe

if ($nodeVersion.Major -lt $minimumNodeMajor) {
  throw "Node.js $($nodeVersion.Text) is too old. Node.js 22+ is required."
}

$env:GOLD_NODE_EXE = $nodeExe

foreach ($dir in @(
  (Join-Path $monitorDir "out"),
  (Join-Path $monitorDir "state"),
  (Join-Path $dashboardDir "data"),
  (Join-Path $agentDir "out")
)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $autoStartInstaller -TaskName $AutoStartTaskName

if ($InstallLegacyMonitorTask) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $monitorDir "install-task.ps1") -TaskName $LegacyMonitorTaskName
}

$installState = [ordered]@{
    suiteName = "gold-task-suite-win"
  installedAt = (Get-Date).ToString("o")
  workspaceRoot = $workspaceRoot
  nodeExe = $nodeExe
  nodeVersion = $nodeVersion.Text
  manifestFile = $manifestFile
  autoStartTask = $AutoStartTaskName
  legacyMonitorTask = if ($InstallLegacyMonitorTask) { $LegacyMonitorTaskName } else { $null }
}

$installState | ConvertTo-Json -Depth 4 | Set-Content -Path $installStateFile -Encoding utf8

Write-Host ""
Write-Host "Installation complete."
Write-Host "Node.js: $($nodeVersion.Text)"
Write-Host "Auto-start task: $AutoStartTaskName"
if ($InstallLegacyMonitorTask) {
  Write-Host "Legacy monitor task: $LegacyMonitorTaskName"
}
Write-Host "Start all: $suiteDir\start-all.cmd"
Write-Host "Stop all:  $suiteDir\stop-all.cmd"
