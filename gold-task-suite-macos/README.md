# Gold Task Suite for macOS

Current package version: `V1.4.0`

This folder provides a macOS-friendly shortcut layer for the existing workspace. It does not replace the Windows scripts in `gold-task-suite-win`; it mirrors the same responsibilities with `.sh` entry points.

## Requirements

- macOS
- Node.js 22 or above
- npm
- network access for market data

## Files

- `install.sh`: installs npm dependencies for the three projects and writes local install state
- `install-and-run.sh`: runs install, then starts all services
- `start-all.sh`: starts monitor, dashboard, agent daemon, and agent panel
- `stop-all.sh`: stops all services started by this macOS suite
- `open-all-panels.sh`: opens the dashboard and agent panel in the default browser
- `logs/`: runtime logs written by the shell launchers
- `run/`: pid files used for stop/restart behavior
- `state/install-state.json`: local install record

## Quick Start

```bash
cd gold-task-suite-macos
chmod +x ./*.sh ./lib/common.sh
./install-and-run.sh
```

If you only want to install dependencies first:

```bash
cd gold-task-suite-macos
./install.sh
```

If services are already installed and you just want to launch them:

```bash
cd gold-task-suite-macos
./start-all.sh
```

To stop everything launched by this folder:

```bash
cd gold-task-suite-macos
./stop-all.sh
```

## Default URLs

- Dashboard: `http://127.0.0.1:3099`
- Investor panel: `http://127.0.0.1:3080`

## Notes

- The Windows-only features such as Task Scheduler auto-start are not ported here.
- This macOS suite uses `nohup` and pid files instead of PowerShell and `wscript`.
- If a service fails to start, check the corresponding file in `logs/`.
