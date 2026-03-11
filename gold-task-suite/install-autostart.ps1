param(
  [string]$TaskName = "CodexGoldSuiteAutoStart"
)

$ErrorActionPreference = "Stop"

$suiteDir = $PSScriptRoot
$starter = Join-Path $suiteDir "start-all-silent.cmd"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupLauncher = Join-Path $startupDir "$TaskName.cmd"

if (-not (Test-Path $starter)) {
  throw "Auto-start runner not found: $starter"
}

$taskCommand = "cmd.exe /c `"$starter`""
$createOnStart = "schtasks /Create /TN `"$TaskName`" /SC ONSTART /RU SYSTEM /RL HIGHEST /TR `"$taskCommand`" /F"
$createOnLogon = "schtasks /Create /TN `"$TaskName`" /SC ONLOGON /TR `"$taskCommand`" /F"

function Invoke-HiddenCmd {
  param(
    [string]$CommandLine
  )

  $process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $CommandLine -WindowStyle Hidden -Wait -PassThru
  return $process.ExitCode
}

if ((Invoke-HiddenCmd -CommandLine $createOnStart) -eq 0) {
  Write-Host "Auto-start task `"$TaskName`" installed with trigger ONSTART."
  exit 0
}

if ((Invoke-HiddenCmd -CommandLine $createOnLogon) -eq 0) {
  Write-Host "Auto-start task `"$TaskName`" installed with trigger ONLOGON."
  exit 0
}

if (-not (Test-Path $startupDir)) {
  New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
}

$launcherContent = @(
  '@echo off'
  "call `"$starter`""
) -join "`r`n"

Set-Content -Path $startupLauncher -Value $launcherContent -Encoding ASCII
Write-Host "Auto-start fallback installed in Startup folder: $startupLauncher"
