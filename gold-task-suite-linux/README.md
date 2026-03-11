# Gold Task Suite for Linux

This folder provides a Linux-friendly shortcut layer for the existing workspace. It is suitable for general Linux hosts and Synology NAS systems with `Node.js 22+` already installed.

## Requirements

- Linux or Synology DSM with shell access
- Node.js 22 or above
- npm
- network access for market data

## Files

- `install.sh`: installs npm dependencies for the three projects and writes local install state
- `install-and-run.sh`: runs install, then starts all services
- `start-all.sh`: starts monitor, dashboard, agent daemon, and agent panel
- `stop-all.sh`: stops all services started by this Linux suite
- `open-all-panels.sh`: prints local and LAN access URLs
- `logs/`: runtime logs written by the shell launchers
- `run/`: pid files used for stop/restart behavior
- `state/install-state.json`: local install record

## Quick Start

```bash
cd gold-task-suite-linux
chmod +x ./*.sh ./lib/common.sh
./install-and-run.sh
```

If you only want to install dependencies first:

```bash
cd gold-task-suite-linux
./install.sh
```

If services are already installed and you just want to launch them:

```bash
cd gold-task-suite-linux
./start-all.sh
```

To stop everything launched by this folder:

```bash
cd gold-task-suite-linux
./stop-all.sh
```

## Default URLs

- Dashboard: `http://127.0.0.1:3099`
- Investor panel: `http://127.0.0.1:3080`

When running on a NAS, `open-all-panels.sh` prints LAN URLs so you can open the panels from another device on the same network.

## Synology Suggestion

For DSM Task Scheduler, prefer the dedicated wrapper folder `../gold-task-suite-dsm`.

## Notes

- This suite uses `nohup` and pid files instead of PowerShell.
- It assumes the workspace keeps the same sibling folder layout.
- If a service fails to start, check the corresponding file in `logs/`.
