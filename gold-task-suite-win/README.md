# gold-task-suite-win

Current package version: `V1.5.1`

This folder is the Windows packaging and environment-control layer for:

- `gold-monitor`
- `gold-dashboard`
- `gold-investor-agent`

It corresponds to the platform-specific packaging set:

- `gold-task-suite-win`
- `gold-task-suite-linux`
- `gold-task-suite-macos`

## Workspace Layout

- `..\gold-monitor`
- `..\gold-dashboard`
- `..\gold-investor-agent`
- `.\manifest.json`
- `.\install.cmd`
- `.\install-and-run.cmd`
- `.\install-autostart.ps1`
- `.\verify-layout.ps1`
- `.\open-all-panels.cmd`
- `.\start-all.cmd`
- `.\start-all-silent.cmd`
- `.\stop-all.cmd`

## Runtime Environment

- Windows 10/11 x64
- PowerShell 5.1 or higher
- Node.js 22 or higher
- Recommended: Node.js 24 LTS
- Network access required for market data

## Managed Versions

- `gold-monitor`: `package 1.2.0`, `snapshot V1.2.0`
- `gold-dashboard`: `package 1.2.1`, `snapshot V1.2.1`
- `gold-investor-agent`: `package 5.0.2`, `snapshot V5.0.2`

See `manifest.json` for details.

## Install

After copying the whole workspace to another Windows machine:

```powershell
cd .\gold-task-suite-win
.\install-and-run.cmd
```

If you only want to install the environment first:

```powershell
cd .\gold-task-suite-win
.\install.cmd
```

## Run

Start all:

```powershell
.\start-all.cmd
```

Stop all:

```powershell
.\stop-all.cmd
```

Open all panels:

```powershell
.\open-all-panels.cmd
```

Default panel addresses:

- `http://127.0.0.1:3099`
- `http://127.0.0.1:3080`
