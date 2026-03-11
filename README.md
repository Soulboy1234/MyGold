# MyGold

MyGold is a packaged gold investing workspace built around three coordinated projects:

- `gold-monitor`: fetches gold, FX, and macro market data
- `gold-dashboard`: visualizes monitored market data
- `gold-investor-agent`: runs virtual gold trading agents and exposes an agent dashboard
- `gold-task-suite-win`: unified Windows installer, environment controller, launcher, and version manifest

This repository is prepared for GitHub sharing. Runtime outputs, local state, databases, backups, and historical source snapshots are excluded from version control.

## Repository Structure

```text
.
|- gold-monitor
|- gold-dashboard
|- gold-investor-agent
|- gold-task-suite-win
|- gold-task-suite-macos
|- gold-task-suite-linux
`- gold-task-suite-dsm
```

Key files:

- `gold-task-suite-win/manifest.json`: unified Windows environment and version manifest
- `gold-task-suite-win/install.cmd`: install environment only
- `gold-task-suite-win/install-and-run.cmd`: one-click install and start
- `gold-task-suite-win/start-all.cmd`: start all services
- `gold-task-suite-win/stop-all.cmd`: stop all services
- `gold-task-suite-win/open-all-panels.cmd`: open all dashboards
- `gold-task-suite-macos/install.sh`: install environment for macOS
- `gold-task-suite-macos/install-and-run.sh`: install and start on macOS
- `gold-task-suite-macos/start-all.sh`: start all services on macOS
- `gold-task-suite-macos/stop-all.sh`: stop all services on macOS
- `gold-task-suite-linux/install.sh`: install environment for Linux/NAS
- `gold-task-suite-linux/install-and-run.sh`: install and start on Linux/NAS
- `gold-task-suite-linux/start-all.sh`: start all services on Linux/NAS
- `gold-task-suite-linux/stop-all.sh`: stop all services on Linux/NAS
- `gold-task-suite-dsm/dsm-start.sh`: one-click DSM Task Scheduler entrypoint

## Managed Projects

Current Windows package set declared by `gold-task-suite-win`:

- `gold-monitor`: `package 1.1.0`, `snapshot V1.1.0`
- `gold-dashboard`: `package 1.0.0`, `snapshot V1.0.0`
- `gold-investor-agent`: `package 4.2.0`, `snapshot V4.2.0`

## Runtime Environment

- OS: Windows 10/11 x64
- PowerShell: 5.1 or above
- Node.js: 22.0.0 or above
- Recommended Node.js: 24.14.0
- Network access: required for market data acquisition

Default local ports:

- `gold-dashboard`: `http://127.0.0.1:3099`
- `gold-investor-agent`: `http://127.0.0.1:3080`

## Quick Start

If you copy the whole workspace to another Windows computer:

```powershell
cd .\gold-task-suite-win
.\install-and-run.cmd
```

If you only want to install the environment first:

```powershell
cd .\gold-task-suite-win
.\install.cmd
```

Open all panels:

```powershell
cd .\gold-task-suite-win
.\open-all-panels.cmd
```

## macOS Usage

The Windows task suite remains the primary packaged launcher. For macOS, use the separate shell-based shortcut folder:

```bash
cd ./gold-task-suite-macos
chmod +x ./*.sh ./lib/common.sh
./install-and-run.sh
```

If you only want to install dependencies first:

```bash
cd ./gold-task-suite-macos
./install.sh
```

If you only want to start services:

```bash
cd ./gold-task-suite-macos
./start-all.sh
```

If you want to stop all services started by the macOS suite:

```bash
cd ./gold-task-suite-macos
./stop-all.sh
```

Notes:

- macOS requires Node.js `22+`
- the macOS suite uses `nohup` and pid files instead of PowerShell
- Windows-only auto-start features are not ported to macOS
- runtime logs are written to `gold-task-suite-macos/logs/`

## Linux / Synology Usage

For Linux hosts and Synology NAS, use the separate shell-based shortcut folder:

```bash
cd ./gold-task-suite-linux
chmod +x ./*.sh ./lib/common.sh
./install-and-run.sh
```

If you only want to install dependencies first:

```bash
cd ./gold-task-suite-linux
./install.sh
```

If you only want to start services:

```bash
cd ./gold-task-suite-linux
./start-all.sh
```

If you want to stop all services started by the Linux suite:

```bash
cd ./gold-task-suite-linux
./stop-all.sh
```

Notes:

- Linux/Synology requires Node.js `22+`
- the Linux suite uses `nohup` and pid files instead of PowerShell
- on NAS devices, `open-all-panels.sh` prints access URLs instead of opening a browser
- runtime logs are written to `gold-task-suite-linux/logs/`

## Version Control Policy

This repository keeps:

- current runnable source code
- necessary `README`, `CHANGELOG`, and `version.json`
- packaged installer and environment control scripts

This repository does not keep:

- `out/` runtime outputs
- `state/` local state
- local databases
- install machine state
- backup folders
- full source copies under `versions/.../snapshot/`

## Update Workflow

For future version updates, use the fixed workflow documented here:

- [VERSION_UPDATE_WORKFLOW.md](docs/VERSION_UPDATE_WORKFLOW.md)

In short:

1. Update child project code and version files.
2. Sync versions in `gold-task-suite-win`.
3. Verify only safe files are staged.
4. Commit locally.
5. Push to GitHub.

## License

This repository currently uses the GNU GPL v3.0 License. See [LICENSE](LICENSE).

